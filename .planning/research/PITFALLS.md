# Pitfalls Research

**Domain:** 수신 트랜잭션 모니터링 — Self-hosted AI agent wallet (WAIaaS)에 수신 TX 감지 기능 추가
**Researched:** 2026-02-21
**Confidence:** MEDIUM-HIGH (공식 Solana/viem 문서, GitHub 이슈 트래커, 코드베이스 직접 분석 기반. 일부 rate limit 수치는 제공자마다 달라 LOW 표기)

---

## Overview

이 문서는 **기존 WAIaaS (아웃고잉 TX 전용)에 인커밍 TX 모니터링을 추가할 때** 발생하는 함정을 다룬다.

기존 아키텍처:
- 아웃고잉만 추적하는 `transactions` 테이블 (파이프라인 6-stage 기반)
- better-sqlite3 단일 라이터 SQLite (DB v20, LATEST_SCHEMA_VERSION=20)
- `BackgroundWorkers` 폴링 패턴 (`setInterval` + runImmediately 옵션)
- `BalanceMonitorService` 패턴 (5분 주기, per-wallet 오류 격리)
- `NotificationService` (26 이벤트, 우선순위 기반 채널 fallback)

함정은 **Critical(운영 중단 또는 TX 유실)**, **High(기능 결함 또는 주요 재작업)**, **Moderate(기술 부채 또는 운영 복잡성)** 3단계로 분류한다.

---

## Critical Pitfalls

운영 중단, TX 유실, 또는 데이터 무결성 파괴를 야기하는 실수.

---

### C-01: WebSocket 재연결 중 수신 TX 유실 -- "블라인드 구간"

**Severity:** CRITICAL
**Confidence:** HIGH (Solana 공식 문서, GitHub Issue #35489, Helius 문서)

**What goes wrong:**
WebSocket 구독(Solana `accountSubscribe`, EVM `eth_subscribe`)이 끊어지고 재연결되는 사이에 발생한 트랜잭션은 영구 유실된다.

구체적인 시나리오:
1. WebSocket 연결이 끊어짐 (네트워크 불안정, RPC 서버 재시작, 10분 inactivity timeout)
2. 재연결 중 (exponential backoff 동안) N개의 트랜잭션이 발생
3. WebSocket이 복구되어 구독을 재등록 (`accountSubscribe` 재전송)
4. 재연결 이후 발생하는 트랜잭션은 감지되지만, 블라인드 구간의 TX는 **영구 누락**

Solana에서 추가로 확인된 문제:
- 단일 RPC 노드는 `getSignaturesForAddress` 폴링과 달리 일부 TX를 스킵할 수 있음 (GitHub Issue #35489)
- 공식 Solana WebSocket 엔드포인트는 10분 inactivity timeout 존재 → 활동 없는 지갑(대부분의 AI agent 지갑) 구독이 자동 종료됨

**Why it happens:**
- WebSocket push 모델은 "연결되어 있을 때만" 이벤트를 수신 → pull 모델(폴링)과 달리 과거 이력 조회 불가
- 재연결 후 구독 재등록만 하고 "블라인드 구간" 보상 폴링을 하지 않으면 누락이 영구화됨
- 기존 `BalanceMonitorService`는 잔액 변화만 감지하므로 개별 수신 TX 추적 용도가 아님

**How to avoid:**
1. **폴링 fallback을 필수 컴포넌트로 설계**: WebSocket이 아닌 `getSignaturesForAddress` (Solana) / `eth_getLogs` (EVM) 폴링을 "보조 채널"이 아닌 "보장 채널"로 설계
2. **마지막 처리 서명/블록 커서 저장**: `incoming_tx_cursors` 테이블(walletId, lastSignature, lastBlockNumber)을 유지하여, 재연결 시 블라인드 구간을 폴링으로 채움
3. **재연결 직후 갭 보상**: WebSocket reconnect 핸들러에서 cursor 이후의 신규 TX를 폴링으로 즉시 검색
4. **idempotent 처리**: WebSocket과 폴링이 동일 TX를 중복 리포트해도 안전하도록 `ON CONFLICT IGNORE` 또는 서명/해시 기반 중복 제거

**Warning signs:**
- 재연결 핸들러가 `subscribe()` 재호출만 하고 갭 보상 폴링을 누락
- `lastProcessedSignature` 같은 커서 개념 없이 모니터링 설계
- "WebSocket이 복구되면 자동으로 이벤트를 다시 받겠지"라는 가정
- 단위 테스트에서 연결 끊김-재연결 시나리오 없음

**Phase to address:** 인커밍 TX 모니터링 아키텍처 설계 phase (가장 첫 번째)

---

### C-02: SQLite 단일 라이터와 고빈도 수신 이벤트 충돌 -- SQLITE_BUSY 폭발

**Severity:** CRITICAL
**Confidence:** HIGH (better-sqlite3 공식 문서 + SQLite WAL 동작 원리 + WAIaaS 코드 직접 분석)

**What goes wrong:**
WAIaaS는 `better-sqlite3` (동기 SQLite)를 사용하며 모든 쓰기는 단일 라이터 직렬화가 요구된다. 현재 아키텍처:
- `BackgroundWorkers`의 폴링 핸들러가 주기적으로 DB에 씀 (balance check, session cleanup, WAL checkpoint)
- 파이프라인 TX 처리가 중간에 DB에 씀

수신 TX 모니터링을 추가하면:
1. WebSocket 이벤트가 고빈도로 수신 → 각 이벤트마다 `incoming_transactions` 테이블 INSERT
2. 폴링 fallback이 동시에 돌면서 INSERT 시도
3. 기존 파이프라인 처리, WAL checkpoint, balance monitor가 동시에 쓰기 경쟁
4. `BEGIN IMMEDIATE`로 write lock을 잡으려 할 때 기존 write transaction이 점유 중이면 `SQLITE_BUSY` 에러
5. WAIaaS 전체가 "database is locked" 에러로 불안정해짐

현재 코드의 맥락:
```
// better-sqlite3는 Node.js event loop 위에서 동기적으로 실행
// WebSocket 이벤트 핸들러 → 동기 DB 쓰기 → event loop 점유
// 고빈도 이벤트 + 긴 쓰기 = event loop 블로킹
```

**Why it happens:**
- WebSocket 이벤트는 비동기 이벤트 루프에서 수신되지만, better-sqlite3 쓰기는 동기이므로 event loop를 블로킹
- 많은 지갑을 모니터링할수록 이벤트 빈도가 높아짐 → 직렬화 병목 심화
- 폴링 fallback이 "혹시 놓쳤을까봐" 주기적으로 같은 TX를 재검색하면 불필요한 INSERT 시도 급증

**How to avoid:**
1. **인커밍 TX를 즉시 DB에 쓰지 않음**: 메모리 큐(in-process queue)에 먼저 수집 → `BackgroundWorkers`의 단일 "flush" 태스크가 배치 INSERT
2. **단일 라이터 원칙 강화**: 인커밍 TX INSERT는 기존 파이프라인/balance monitor와 동일한 순서 규칙으로 직렬화. `BEGIN IMMEDIATE`를 명시적으로 사용
3. **배치 처리**: `INSERT OR IGNORE INTO incoming_transactions VALUES (...), (...), (...)` 배치 INSERT로 트랜잭션 오버헤드 최소화
4. **busy_timeout 설정**: `PRAGMA busy_timeout = 5000` (5초). better-sqlite3는 기본 0ms이므로 즉시 SQLITE_BUSY 에러 발생

**Warning signs:**
- WebSocket 이벤트 핸들러에서 직접 DB INSERT (await 없이)
- 폴링 fallback과 WebSocket 핸들러 양쪽에서 독립적으로 DB에 씀
- `PRAGMA busy_timeout` 미설정

**Phase to address:** 데이터 레이어 설계 phase (DB 쓰기 직렬화 전략 확정)

---

### C-03: Solana `confirmed` 레벨 이벤트 수신 후 롤백 -- 돈을 받았다 표시했는데 실제로 없음

**Severity:** CRITICAL
**Confidence:** HIGH (Solana 공식 Commitment Levels 문서 + Helius 블로그)

**What goes wrong:**
Solana의 commitment level은 세 단계: `processed` → `confirmed` → `finalized`

- `confirmed`: stake 2/3이 투표 완료. 이론적으로 롤백 가능하나 실제 사례 없음 (~1-2초 후)
- `finalized`: 32+ 블록이 confirmed 위에 쌓임 (~13초 후). 사실상 불가역

`accountSubscribe`의 기본값은 `finalized`이다. 그러나 지연을 줄이려고 `confirmed`로 설정하면:
1. 수신 이벤트가 `confirmed` 상태로 도달 → "입금 완료"로 처리
2. 이론적으로 해당 블록이 롤백되면 입금이 취소됨
3. 지갑 잔액 표시나 에이전트 로직이 실제로 없는 잔액을 믿고 행동

AI agent 지갑에서의 실제 위험:
- 에이전트가 수신 확인 후 즉시 다른 TX를 발행 → 롤백되면 이미 나간 TX는 되돌릴 수 없음

**Why it happens:**
- 실시간성을 위해 `processed`나 `confirmed`를 선택하는 것은 자연스러운 유혹
- "Solana는 빠르니까 rollback 없겠지"라는 잘못된 확신
- Helius 문서에도 명시: "no confirmed block has reverted in Solana's five-year history" — 하지만 이것은 보장이 아님

**How to avoid:**
1. **수신 이벤트는 `finalized`로만 처리**: AI agent 지갑에서 수신 TX를 "완료"로 처리하려면 `finalized` commitment 필수. ~13초 지연은 보안과의 트레이드오프
2. **2단계 상태 관리**: `INCOMING_PENDING` (confirmed 수신) → `INCOMING_CONFIRMED` (finalized). 에이전트 로직은 `INCOMING_CONFIRMED` 상태만 신뢰
3. `confirmed` 수신 시 알림은 보내되 ("입금 예정"), `finalized` 완료 시 최종 확인 알림 별도 발송

**Warning signs:**
- `accountSubscribe` commitment를 `processed`로 설정
- "빠른 알림을 위해" `confirmed` 수신 후 바로 에이전트 로직 실행
- 수신 TX 상태를 단일 boolean으로만 저장

**Phase to address:** 인커밍 TX 상태 모델 설계 phase

---

## High Pitfalls

기능 결함, 주요 재작업, 또는 운영 장애를 야기하는 실수.

---

### H-01: Solana SPL/Token-2022 토큰 수신 감지 실패 -- ATA 무지

**Severity:** HIGH
**Confidence:** HIGH (Solana 공식 Exchange Guide, Solana Program Library 문서, 다수 개발자 가이드)

**What goes wrong:**
Solana에서 SOL 수신과 토큰 수신의 감지 방식이 근본적으로 다르다:

- **SOL 수신**: wallet의 주소(`publicKey`)에 `accountSubscribe` → 잔액 변화 감지
- **SPL 토큰 수신**: 토큰은 Associated Token Account (ATA)로 전달됨. ATA는 `{walletAddress, mintAddress}`로부터 PDA(Program Derived Address)로 도출되는 **별도 계정**

잘못된 설계:
1. `accountSubscribe`를 wallet의 `publicKey`에만 등록
2. 에이전트가 SPL 토큰을 받아도 감지 불가 — wallet 주소가 아닌 ATA 주소의 잔액이 변하기 때문

**추가 복잡성**:
- 기존 ATA 목록을 모니터링하는 것으로 충분하지 않음: **최초로 특정 토큰을 받을 때 ATA가 새로 생성됨**
- ATA 생성 이벤트는 wallet 주소를 `accountSubscribe`해야 감지 가능 (rent 차감)
- Token-2022 (Token Extensions Program)는 별도 Program ID 사용 → ATA 도출 공식이 다름

**현재 코드와의 충돌**:
```typescript
// SolanaAdapter의 ATA_RENT_LAMPORTS 상수가 이미 존재
// 아웃고잉 TOKEN_TRANSFER 시 ATA 생성은 이미 구현됨
// 하지만 수신 시 ATA 감지는 별도 구현 필요
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
```

**How to avoid:**
1. **2레벨 구독 전략**:
   - Level 1: wallet `publicKey` 구독 → SOL 수신 + 신규 ATA 생성 감지
   - Level 2: 알려진 ATA 주소 각각 구독 → 기존 토큰 수신 감지
2. **ATA 동적 등록**: Level 1에서 ATA 생성 감지 시, 해당 ATA를 Level 2 구독에 자동 추가
3. **Token-2022 지원**: `TOKEN_PROGRAM_ADDRESS`와 `TOKEN_2022_PROGRAM_ID` 양쪽으로 ATA 도출 시도

**Warning signs:**
- `accountSubscribe` 대상이 wallet `publicKey`만 있고 ATA 주소가 없음
- `token_registry`에 등록된 토큰의 ATA를 사전 계산하지 않음
- Token-2022 토큰을 수신해도 감지 안 됨 (테스트 누락 가능성)

**Phase to address:** Solana 수신 TX 감지 설계 phase

---

### H-02: WebSocket 메모리 누수 -- 재연결 시 이전 구독 정리 누락

**Severity:** HIGH
**Confidence:** HIGH (ethers.js GitHub Issue #1121, viem CHANGELOG, WAIaaS WalletConnect 경험)

**What goes wrong:**
WebSocket이 끊기고 재연결될 때, 이전 구독 핸들러를 정리하지 않으면:

1. `reconnect()` 호출 → 새 WebSocket 연결 생성 + `accountSubscribe` 재등록
2. 이전 연결의 이벤트 핸들러 참조가 클로저로 살아있음 → GC 안 됨
3. 재연결이 반복될수록 핸들러가 누적 → 메모리 사용량 단조 증가
4. 동일 이벤트에 N개의 핸들러가 등록 → 같은 TX가 N번 처리됨

WAIaaS 특유의 위험:
- 데몬은 24/7 장기 운영 → 누수가 시간에 따라 누적
- AI agent 지갑은 개수가 많을 수 있음 → 구독 수 증가 → 누수 가속
- `BalanceMonitorService`의 `lastNotified` Map과 유사한 메모리 누수 위험

**How to avoid:**
1. **구독 레지스트리 관리**: `Map<walletId, { unsubscribe: () => void }>` 형태로 각 구독의 해제 함수를 보관
2. **재연결 전 구독 해제**: reconnect 핸들러에서 `registry.forEach(sub => sub.unsubscribe())` 먼저 실행
3. **지갑 비활성화 시 즉시 해제**: 지갑이 SUSPENDED/DELETED 상태로 바뀌면 해당 구독 즉시 정리
4. **viem `watchBlocks` 반환값 보관**: viem의 watch 함수들은 unwatch 함수를 반환함 — 이를 레지스트리에 저장

**Warning signs:**
- Node.js `process.memoryUsage().heapUsed` 가 시간에 따라 단조 증가
- 재연결 카운터가 늘어날수록 동일 TX가 중복 처리됨
- unsubscribe/unwatch 반환값을 버림 (`void watchBlocks(...)`)

**Phase to address:** WebSocket 연결 관리 설계 phase

---

### H-03: 공개 RPC 구독 한도 초과 -- Silent 모니터링 중단

**Severity:** HIGH
**Confidence:** MEDIUM (Solana 공식 RPC 문서, 제공자별 문서. 구체적 수치는 제공자마다 다름)

**What goes wrong:**
공개 RPC 엔드포인트는 WebSocket 구독 수를 제한한다:

- **Solana 공개 mainnet**: IP당 WebSocket 연결 수 제한 존재. 대규모 서비스용 미권장 (공식 문서 명시)
- **Helius/QuickNode 등 유료 서비스**: plan에 따라 동시 WebSocket 연결 또는 구독 수 제한
- **WAIaaS 상황**: AI agent 지갑이 N개일 때, SOL 구독 N개 + 토큰 ATA 구독 N×M개 필요

예: 50개 지갑, 지갑당 평균 5개 토큰 ATA → 구독 수 = 50 + 250 = 300

이 300개 구독이 rate limit을 초과하면:
1. 신규 `accountSubscribe` 요청 실패 (error 또는 silent ignore)
2. **일부 지갑의 모니터링이 중단되지만 에러가 명확하지 않음** → 알아채기 어려움

**Why it happens:**
- "지갑 수가 적으니 괜찮겠지"라는 초기 가정이 운영 단계에서 깨짐
- 구독 실패가 예외를 던지지 않고 조용히 무시될 수 있음
- 플랜 변경 없이 지갑 수가 늘어나면 임계값 초과

**How to avoid:**
1. **구독 성공 여부를 명시적으로 확인**: `accountSubscribe`의 응답에서 subscription ID를 확인. 실패 시 에러 로그 + 알림
2. **구독 수 제한 설정**: config에 `max_monitored_wallets` 설정. 초과 시 "모니터링 불가" 상태로 표시 (모니터링 없이 무음으로 운영하는 것보다 나음)
3. **선택적 모니터링 기본값**: 모든 지갑이 모니터링을 원하지 않을 수 있음 — `incoming_monitor_enabled` per-wallet 설정으로 옵트인 방식 권장
4. **폴링 fallback의 rate limit 계산**: 폴링 모드에서 N개 지갑 × 폴링 주기 = HTTP 요청 수 — 이것도 rate limit 영향

**Warning signs:**
- 지갑 수가 많아지는 테스트 없이 출시
- 구독 실패 이벤트 핸들러 없음
- 모든 ACTIVE 지갑에 자동으로 구독 등록 (옵트인 없음)

**Phase to address:** RPC 제공자 제한 분석 phase + 구독 관리 설계 phase

---

### H-04: 폴링 fallback의 폭발적 RPC 비용 -- "조용히 쌓이는 청구서"

**Severity:** HIGH
**Confidence:** MEDIUM (Solana/EVM RPC 비용 구조 분석, WAIaaS self-hosted 맥락)

**What goes wrong:**
WebSocket 실패 시 폴링 fallback으로 전환되는 설계에서:

1. WebSocket 재연결 실패가 반복되거나, 공개 RPC가 WebSocket을 지원하지 않는 경우 → 폴링 모드로 전락
2. 폴링 주기 30초 × 지갑 100개 × `getSignaturesForAddress` 1회 = **분당 200회 RPC 요청**
3. 유료 RPC 서비스에서 이는 credit 소모 → 예상치 못한 청구
4. 공개 RPC에서는 429 Too Many Requests → 폴링도 실패 → 모니터링 완전 중단

폴링의 추가 cost:
- `getSignaturesForAddress` → `getTransaction`(per signature) 추가 호출 필요 → 지수적 비용 증가
- EVM에서 `eth_getLogs` with block range: 대용량 블록 범위 요청 시 시간 초과 가능

**How to avoid:**
1. **폴링 주기를 보수적으로 설정**: 기본값 5분 (BalanceMonitorService와 동일). 운영자가 줄일 수 있게 하되 최소값 경고
2. **폴링 비용 예측 표시**: Admin UI에 "현재 폴링 모드 — 분당 N회 RPC 요청 예상" 표시
3. **배치 쿼리**: `getSignaturesForAddress`를 지갑별로 독립 호출하지 않고 슬롯/블록 범위 기준 배치 처리
4. **폴링은 "보완"이지 "기본"이 아님**: WebSocket 복구 즉시 폴링 중단, WebSocket을 항상 우선으로 사용

**Warning signs:**
- 폴링 주기가 10초 미만으로 설정
- 지갑 수 × 폴링 빈도를 Admin UI에서 확인 불가
- 폴링 fallback이 WebSocket 복구 후에도 계속 돌아감 (정리 로직 없음)

**Phase to address:** 폴링 fallback 설계 phase

---

### H-05: EVM 전송 이벤트 오탐 -- 프록시 컨트랙트 & Transfer 이벤트 위장

**Severity:** HIGH
**Confidence:** MEDIUM (EVM proxy contract 스펙, ERC-20 표준 분석)

**What goes wrong:**
EVM에서 인커밍 ERC-20 토큰 수신을 `eth_subscribe("logs")` + `Transfer(address,address,uint256)` 토픽으로 감지할 때:

1. **프록시 컨트랙트**: ERC-1967 업그레이드 가능 컨트랙트는 implementation이 바뀔 수 있음. 구독 시 컨트랙트 주소는 같지만 Transfer 이벤트 시그니처가 다를 수 있음
2. **이벤트 위장**: 악의적 컨트랙트가 표준 `Transfer` 이벤트 시그니처(`0xddf252...`)를 emit하지만 실제로 토큰을 이전하지 않음 (또는 반대로 이전하면서 이벤트를 다르게 emit)
3. **토큰이 아닌 컨트랙트에서 Transfer 이벤트**: NFT(ERC-721), 브릿지 계약 등도 동일 토픽을 사용 — ERC-20 Transfer와 구분 불가
4. **Wrapped native token**: WETH의 `Deposit`/`Withdrawal` 이벤트는 ERC-20 Transfer와 다름

**How to avoid:**
1. **컨트랙트 주소 화이트리스트**: `token_registry`에 등록된 컨트랙트 주소만 신뢰. 미등록 컨트랙트의 Transfer 이벤트는 무시 또는 경고 처리
2. **Transfer 수신 후 잔액 재확인**: 이벤트 수신 후 `getBalance` / `balanceOf` 호출로 실제 잔액 변화를 확인. 이벤트만으로 최종 처리 금지
3. **ERC-721 필터링**: Transfer 이벤트의 `value` 파라미터가 0이거나 이상하면 NFT 전송으로 판단 → 무시

**Warning signs:**
- `token_registry` 확인 없이 모든 Transfer 이벤트를 처리
- Transfer 이벤트 수신 후 잔액 재확인 단계 없음

**Phase to address:** EVM 수신 TX 파싱 설계 phase

---

## Moderate Pitfalls

기술 부채, 운영 복잡성, 또는 UX 혼란을 야기하는 실수.

---

### M-01: Solana 10분 inactivity timeout -- 활동 없는 지갑의 구독 자동 종료

**Severity:** MEDIUM
**Confidence:** HIGH (Solana RPC 공식 문서, Helius 문서, QuickNode 가이드)

**What goes wrong:**
Solana WebSocket 엔드포인트는 10분 동안 아무 메시지가 없으면 연결을 종료한다. AI agent 지갑의 특성상 대부분은 수신 TX가 드물다 → 10분마다 구독이 종료 → 재연결 반복.

재연결 폭풍 시나리오:
1. 지갑 100개, 모두 inactivity로 10분마다 연결 끊김
2. 모두 비슷한 타이밍에 재연결 시도 → RPC에 동시 reconnect 부하
3. RPC가 일시적으로 거부 → 재연결 실패 → exponential backoff → 구독 없는 기간 장기화

**How to avoid:**
1. **Heartbeat 구현**: 매 60초마다 WebSocket ping 프레임 전송. 단순 ping/pong으로 연결 유지
2. **`@solana/kit`의 `createSolanaRpcSubscriptions`**: kit의 구독 API가 내부적으로 keepalive를 처리하는지 확인 후, 처리 안 하면 수동 구현
3. **jitter backoff**: 재연결 타이밍을 지갑별로 랜덤 분산하여 동시 reconnect storm 방지

**Warning signs:**
- Heartbeat/ping 로직 없음
- 모든 지갑의 reconnect 타이머가 동일한 base interval
- 로그에 주기적으로 "connection closed" + "reconnecting" 패턴 반복

**Phase to address:** WebSocket 연결 관리 설계 phase

---

### M-02: 먼지 공격(Dust Attack) 오탐 -- 불필요한 알림 폭탄

**Severity:** MEDIUM
**Confidence:** MEDIUM (Trust Wallet 지원 문서, 커뮤니티 공개 자료)

**What goes wrong:**
먼지 공격(Dust Attack)은 공격자가 추적 목적으로 수천 개 주소에 극소량의 토큰을 전송하는 기법이다. AI agent 지갑에 인커밍 TX 알림을 추가하면:

1. 에이전트 지갑 주소가 공개되거나 유추 가능한 경우, 먼지 공격 대상이 됨
2. 수백 개의 소액 수신 → 수백 개의 알림 → 알림 채널 과부하 (Telegram rate limit 초과 등)
3. 운영자가 알림에 무감각해지거나 실제 수신을 놓침 → "알림 피로"

Solana에서 특히 위험한 경우:
- 알 수 없는 토큰(미등록 SPL 토큰)이 수신되어도 알림이 발생하면 혼란 가중

**How to avoid:**
1. **최소 임계값 필터**: config에 `min_notify_amount_sol`, `min_notify_amount_token` 설정. 임계값 미만 수신은 DB 기록만 하고 알림 미전송
2. **미등록 토큰 필터**: `token_registry`에 없는 토큰은 알림하지 않고 경고 로그만 (단, DB에는 기록)
3. **알림 cooldown**: 동일 송신자에서 짧은 시간 내 반복 소액 수신 시, 배치 요약 알림으로 통합
4. **NotificationService의 rateLimitRpm 활용**: 기존 20rpm 제한을 인커밍 TX 알림에도 적용

**Warning signs:**
- 임계값 없이 모든 수신 TX에 알림
- 미등록 토큰 수신 알림이 활성화됨
- 알림 채널 rate limit이 인커밍 알림으로 소진되어 기존 중요 알림(TX_FAILED, KILL_SWITCH_ACTIVATED 등)이 지연

**Phase to address:** 알림 전략 설계 phase

---

### M-03: 새 DB 테이블 추가 시 마이그레이션 미작성 -- 기존 사용자 DB 파괴

**Severity:** MEDIUM
**Confidence:** HIGH (WAIaaS 코드베이스 직접 분석 — CLAUDE.md 및 migrate.ts 패턴 명시)

**What goes wrong:**
인커밍 TX 모니터링을 위해 새 테이블(`incoming_transactions`, `incoming_tx_cursors` 등)이 필요하다. `LATEST_SCHEMA_VERSION`이 현재 20이다.

잘못된 접근:
1. `schema.ts`에 새 테이블 추가만 하고 `CREATE TABLE IF NOT EXISTS` DDL만 업데이트
2. 기존 사용자(DB v20 보유)는 `pushSchema()`의 `IF NOT EXISTS`로 신규 테이블이 생성될 것을 기대

실제 문제:
- `pushSchema()`는 **신규 설치만** 대상 — 기존 DB는 `runMigrations()`가 담당
- `runMigrations()`에 v21 마이그레이션이 없으면 기존 사용자는 새 테이블 없이 실행 → 런타임 에러
- `LATEST_SCHEMA_VERSION`을 올리지 않으면 스키마 버전 체크가 통과되어 무음 실패

**How to avoid:**
1. **반드시 증분 마이그레이션 작성**: `runMigrations()`에 v21 케이스 추가. `CREATE TABLE IF NOT EXISTS incoming_transactions ...`
2. **LATEST_SCHEMA_VERSION 업데이트**: 20 → 21
3. **스키마 스냅샷 픽스처 업데이트**: 마이그레이션 테스트 (`migration-v*.test.ts`)에 신규 스키마 검증 추가
4. **CLAUDE.md 규칙 준수**: "DB migrations required since v1.4: Provide incremental ALTER TABLE migrations"

**Warning signs:**
- `schema.ts`에 테이블 추가했지만 `migrate.ts`에 케이스 없음
- `LATEST_SCHEMA_VERSION` 미변경
- 마이그레이션 테스트 없이 스키마 변경

**Phase to address:** DB 스키마 설계 phase (설계-only 마일스톤이어도 migration 번호와 전략은 설계에 포함)

---

### M-04: 기존 NotificationEventType SSoT 위반 -- 새 이벤트 미등록

**Severity:** MEDIUM
**Confidence:** HIGH (WAIaaS 코드베이스 직접 분석 — CLAUDE.md "Zod SSoT" 원칙)

**What goes wrong:**
인커밍 TX 관련 새 알림 이벤트(예: `INCOMING_TX_RECEIVED`, `INCOMING_TX_CONFIRMED`)를 추가할 때:

1. `notification-service.ts`에 하드코딩된 이벤트 타입 문자열 사용
2. `core/src/enums/notification.ts`의 `NOTIFICATION_EVENT_TYPES` 배열에 미추가
3. `message-templates.ts`에 새 이벤트 템플릿 미작성
4. `notification_logs` 테이블의 CHECK constraint (`check_event_type`)가 새 이벤트를 거부 → INSERT 실패

현재 `NOTIFICATION_EVENT_TYPES`는 28개. 새 이벤트 추가 시 반드시 배열에 포함해야 한다.

**How to avoid:**
1. **SSoT 순서 준수**: `core/src/enums/notification.ts` → Zod enum 자동 파생 → DB CHECK constraint 자동 반영
2. **템플릿 동시 작성**: 새 이벤트 추가 시 `message-templates.ts`에 모든 로케일(en/ko) 템플릿 추가
3. **테스트 업데이트**: `NOTIFICATION_EVENT_TYPES.length` 를 체크하는 기존 테스트 업데이트

**Warning signs:**
- `notification-service.ts`에 `as NotificationEventType` 타입 캐스팅
- `message-templates.ts`에 이벤트 케이스 없이 폴백 메시지만 사용
- DB INSERT 시 "CHECK constraint failed: check_event_type" 에러

**Phase to address:** 알림 이벤트 설계 phase

---

### M-05: 인커밍 TX 모니터링과 KillSwitch 상호작용 미정의

**Severity:** MEDIUM
**Confidence:** HIGH (WAIaaS 코드베이스 KillSwitchService 직접 분석)

**What goes wrong:**
KillSwitch가 SUSPENDED/LOCKED 상태일 때:
- 아웃고잉 TX: `killSwitchGuard` 미들웨어로 REST API 차단 → 자동 방어
- 인커밍 TX 모니터링: **REST API 바깥의 이벤트 루프에서 처리 → killSwitchGuard 미적용**

정의되지 않은 동작:
1. KillSwitch SUSPENDED → 인커밍 TX 모니터링은 계속 돌아감 → 수신 TX가 DB에 기록됨 → 알림 발송됨
2. 알림을 받은 에이전트가 "수신 완료" 라고 판단하고 아웃고잉 TX 발행 시도 → KillSwitch가 차단
3. 하지만 인커밍 TX 이벤트를 어떻게 처리할지 정의 안 된 채 시스템 불일치

**How to avoid:**
1. **인커밍 모니터링 이벤트 핸들러에서 KillSwitch 상태 확인**: SUSPENDED/LOCKED 시 알림 미발송 (DB 기록은 유지)
2. **설계 결정**: 알림을 suppressing하는 것 vs 모니터링 전체를 일시 중단하는 것 중 선택 (설계 문서에 명시)
3. **KillSwitch 복구 후 "누락 알림 재발송"** 옵션 고려: LOCKED 동안 쌓인 인커밍 TX들을 복구 후 배치 요약

**Warning signs:**
- 인커밍 이벤트 핸들러에서 `killSwitchService.getState()` 호출 없음
- KillSwitch 상태와 인커밍 알림 동작에 대한 설계 문서 없음

**Phase to address:** KillSwitch 통합 설계 phase

---

### M-06: BackgroundWorkers와 WebSocket 이벤트의 SQLite 쓰기 순서 -- 데드락 리스크

**Severity:** MEDIUM
**Confidence:** MEDIUM (better-sqlite3 WAL 모드 동작 + WAIaaS 코드 구조 분석)

**What goes wrong:**
현재 `BackgroundWorkers`는 `setInterval` 기반이고 handler는 `async` 함수다. WebSocket 이벤트 핸들러도 비동기다. 두 핸들러가 동시에 SQLite BEGIN IMMEDIATE 트랜잭션을 시도하면:

```
WebSocket handler: BEGIN IMMEDIATE → waiting for lock
BackgroundWorkers WAL checkpoint: BEGIN EXCLUSIVE → waiting for the same lock
```

WAL checkpoint(`PRAGMA wal_checkpoint(TRUNCATE)`)는 5분마다 실행되며, 이것이 write lock을 잡는 동안 모든 다른 write가 블로킹된다.

**How to avoid:**
1. **단일 라이터 채널**: 인커밍 TX 저장을 항상 메모리 큐 → flush 패턴으로 처리. WebSocket 핸들러에서 직접 SQLite 쓰기 금지
2. **WAL checkpoint와 인커밍 flush가 충돌하지 않도록**: flush 태스크를 BackgroundWorkers에 등록하여 직렬화

**Warning signs:**
- WebSocket 이벤트 핸들러에서 직접 `db.prepare().run()` 호출
- flush 태스크와 WAL checkpoint가 독립된 타이머로 실행

**Phase to address:** 데이터 레이어 설계 phase (C-02와 함께)

---

## Technical Debt Patterns

초기에 합리적으로 보이지만 장기적으로 문제를 만드는 지름길.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| 모든 ACTIVE 지갑 자동 구독 | 설정 없이 모니터링 활성화 | rate limit 초과, 자원 낭비 (비활성 지갑) | 절대 금지 — opt-in 방식 필수 |
| `confirmed`로 즉시 알림 | 빠른 알림 (~1초) | rollback 가능성, 에이전트 오동작 위험 | 알림용으로는 OK, 에이전트 로직 트리거로는 금지 |
| 폴링만으로 구현 | WebSocket 복잡성 없음 | 고 RPC 비용, 높은 지연, rate limit 위험 | MVP 테스트 한정, 프로덕션 금지 |
| 인커밍 TX DB 스키마 없이 메모리만 | 마이그레이션 불필요 | 데몬 재시작 시 인커밍 이력 유실 | 절대 금지 |
| 모든 Transfer 이벤트 처리 | 구현 단순 | 프록시 컨트랙트, ERC-721, 위장 이벤트 오탐 | 절대 금지 — 화이트리스트 필수 |

---

## Integration Gotchas

외부 서비스 연동 시 흔한 실수.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Solana `accountSubscribe` | SOL 지갑 주소만 구독 | wallet pubkey + 모든 알려진 ATA 주소 동시 구독 |
| Solana `logsSubscribe` | 단일 주소에 대한 배열 시도 | 주소당 별도 구독 필수 (배열 미지원) |
| EVM `eth_subscribe("logs")` | 필터 없이 전체 logs 구독 | `address`와 `topics` 필터 적용 |
| 공개 RPC | WebSocket 장기 연결 | Heartbeat ping 60초 간격 + 10분 timeout 대응 |
| `getSignaturesForAddress` | 100개씩 페이지네이션 없이 조회 | `before`/`until` 파라미터로 커서 기반 페이지네이션 |
| viem `watchBlocks` | unwatch 함수 버림 | 반환된 unwatch 함수를 레지스트리에 저장하여 정리 |
| NotificationService | 인커밍 알림으로 rateLimitRpm 소진 | 인커밍 알림 전용 cooldown 또는 별도 rate limit |

---

## Performance Traps

소규모에서는 동작하지만 확장 시 실패하는 패턴.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| 지갑당 독립 폴링 루프 | CPU/메모리 증가, RPC 과부하 | 모든 지갑을 단일 루프에서 배치 처리 | 지갑 10개 이상 |
| 모든 수신 TX에 알림 발송 | Telegram rate limit 초과, 알림 큐 적체 | 최소 임계값 + cooldown | 먼지 공격 시 즉시 |
| 이벤트 수신 즉시 DB INSERT | SQLITE_BUSY 에러, event loop 블로킹 | 메모리 큐 + 배치 flush | 초당 10+ 이벤트 |
| WebSocket + 폴링 동시 운영 | 동일 TX 중복 처리, DB 중복 INSERT | 명확한 우선순위 정책 + idempotent INSERT | 항상 (두 채널 오버랩) |

---

## Security Mistakes

수신 TX 모니터링 도메인 특유의 보안 이슈.

| Mistake | Risk | Prevention |
|---------|------|------------|
| `confirmed` 상태 수신 TX를 최종으로 처리 | rollback 시 에이전트가 없는 자금 기준으로 행동 | `finalized`만 최종 상태로 처리 |
| 미검증 컨트랙트 Transfer 이벤트 신뢰 | 위장 Transfer로 잔액 표시 오염 | token_registry 화이트리스트 + 잔액 재확인 |
| 수신 TX 데이터를 알림 메시지에 날것으로 삽입 | 악의적 토큰 이름/메모가 MarkdownV2 injection 유발 | `escapeMarkdownV2()` 적용 (기존 패턴 재사용) |
| 인커밍 TX 이력 공개 API 노출 | 지갑 추적, 프라이버시 침해 | sessionAuth 필수, walletId 소유권 검증 |

---

## "Looks Done But Isn't" Checklist

완성처럼 보이지만 핵심이 빠진 것들.

- [ ] **수신 TX 감지**: SOL 수신만 감지되고 SPL 토큰 수신은 누락 — ATA 구독 구현 확인
- [ ] **연결 관리**: 재연결 시 이전 구독을 정리하는 로직 확인 (구독 레지스트리 존재 여부)
- [ ] **블라인드 구간 보상**: 재연결 후 갭 보상 폴링이 실행되는지 확인 (lastProcessedCursor 활용)
- [ ] **DB 마이그레이션**: `LATEST_SCHEMA_VERSION` 증가 + runMigrations() 케이스 추가 확인
- [ ] **SSoT 이벤트 등록**: `NOTIFICATION_EVENT_TYPES` 배열에 새 이벤트 추가 + CHECK constraint 반영
- [ ] **KillSwitch 통합**: 인커밍 이벤트 핸들러에서 killSwitch 상태 확인 로직 존재 여부
- [ ] **Heartbeat 구현**: 10분 inactivity timeout 대응 ping 로직 존재 여부
- [ ] **알림 임계값**: dust attack 방어용 최소 알림 금액 설정 가능 여부

---

## Recovery Strategies

함정이 발생했을 때 복구 전략.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| C-01: 블라인드 구간 TX 유실 | HIGH | cursor 기반 getSignaturesForAddress 소급 실행, 유실 TX 수동 확인 |
| C-02: SQLITE_BUSY 폭발 | MEDIUM | busy_timeout 증가 + 인커밍 flush 배치화 후 재시작 |
| C-03: confirmed TX 롤백 | HIGH | 에이전트 로직 재검토 + finalized 전환 + 영향받은 TX 수동 감사 |
| H-01: ATA 누락 | MEDIUM | 기존 ATA 목록을 소급 계산하여 구독 추가 + 누락 구간 폴링 |
| H-02: 메모리 누수 | LOW | 데몬 재시작으로 즉시 해소, 구독 레지스트리 로직 추가 후 재배포 |
| M-03: 마이그레이션 누락 | MEDIUM | 긴급 마이그레이션 추가 릴리스, 기존 사용자 업그레이드 가이드 |

---

## Pitfall-to-Phase Mapping

로드맵 phase가 각 함정을 어떻게 처리해야 하는지.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| C-01: 블라인드 구간 TX 유실 | 아키텍처 설계 (첫 번째) | 연결 끊김-재연결 시나리오 테스트 케이스 |
| C-02: SQLite 단일 라이터 충돌 | 데이터 레이어 설계 | SQLITE_BUSY 에러 없이 동시 이벤트 처리 확인 |
| C-03: confirmed 롤백 위험 | 수신 TX 상태 모델 설계 | 2단계 상태(PENDING/CONFIRMED) 명세 존재 |
| H-01: Solana ATA 감지 실패 | Solana 감지 설계 | SPL 토큰 수신 테스트 케이스 |
| H-02: 메모리 누수 | WebSocket 연결 관리 설계 | 구독 레지스트리 + unsubscribe 패턴 명세 |
| H-03: RPC 구독 한도 초과 | RPC 제한 분석 | max_monitored_wallets 설정 + 오류 처리 명세 |
| H-04: 폴링 RPC 비용 폭발 | 폴링 fallback 설계 | Admin UI RPC 사용량 표시 명세 |
| H-05: EVM Transfer 오탐 | EVM 감지 설계 | 화이트리스트 기반 필터 + 잔액 재확인 명세 |
| M-01: inactivity timeout | WebSocket 연결 관리 설계 | Heartbeat 간격 명세 (≤60초) |
| M-02: 먼지 공격 알림 폭탄 | 알림 전략 설계 | 임계값 설정 + cooldown 명세 |
| M-03: 마이그레이션 미작성 | DB 스키마 설계 | LATEST_SCHEMA_VERSION+1 + runMigrations() 케이스 명세 |
| M-04: SSoT 이벤트 미등록 | 알림 이벤트 설계 | NOTIFICATION_EVENT_TYPES 배열 추가 명세 |
| M-05: KillSwitch 미통합 | KillSwitch 통합 설계 | 이벤트 핸들러 killSwitch 상태 확인 명세 |
| M-06: BackgroundWorkers 충돌 | 데이터 레이어 설계 | 단일 라이터 flush 패턴 명세 (C-02와 통합) |

---

## Sources

### HIGH Confidence
- WAIaaS 코드베이스 직접 분석: `schema.ts`(DB v20), `migrate.ts`(LATEST_SCHEMA_VERSION=20), `balance-monitor-service.ts`, `workers.ts`, `notification-service.ts`, `telegram-bot-service.ts`
- [Solana accountSubscribe RPC Method](https://solana.com/docs/rpc/websocket/accountsubscribe) — commitment 레벨, 구독 포맷
- [Helius: What are Solana Commitment Levels?](https://www.helius.dev/blog/solana-commitment-levels) — confirmed vs finalized 차이
- [Solana WebSocket: Real-Time Blockchain Data Streaming (Helius Docs)](https://www.helius.dev/docs/rpc/websocket) — 10분 inactivity timeout, heartbeat 60초 권장
- [QuickNode: Monitor Solana Accounts Using WebSockets and Solana Kit](https://www.quicknode.com/guides/solana-development/tooling/web3-2/subscriptions) — logsSubscribe 1주소 제한
- [Solana Official Exchange Guide](https://solana.com/developers/guides/advanced/exchange) — ATA 모니터링 권장사항
- [ethers.js GitHub Issue #1121: memory leak on WebSocketProvider](https://github.com/ethers-io/ethers.js/issues/1121) — WebSocket 재연결 시 메모리 누수

### MEDIUM Confidence
- [Solana GitHub Issue #35489: node websocket subscription has 15s delay and missing data](https://github.com/solana-labs/solana/issues/35489) — 단일 노드 TX 스킵 가능성
- [viem watchBlocks (rc)](https://rc.viem.sh/docs/actions/public/watchBlocks.html) — unwatch 반환값 패턴
- [viem GitHub Discussion #503: eth_subscribe push vs polling](https://github.com/wevm/viem/discussions/503) — WebSocket 구독 vs 폴링 비교
- [Chainstack: Solana Transaction Commitment Levels](https://chainstack.com/solana-transaction-commitment-levels/) — commitment level 실용 가이드
- [SQLite Forum: High write activity optimization](https://sqlite.org/forum/info/2dcc4a2cc0600845facdeee3b03528aca8e0f41d7c5c0889a43f21b03890978c) — 단일 라이터 패턴 권장
- [Trust Wallet: Dust Attacks Guide](https://support.trustwallet.com/support/solutions/articles/67000734543-what-are-dust-attacks-a-simple-guide-to-protect-your-assets) — 먼지 공격 특성 및 임계값 방어
- [Tracking Token Transfers on Solana (Medium/Nodit)](https://blog.nodit.io/chapter-2-of-solana-accounts-programs-wallets-mints-token-accounts-explained/) — ATA 모니터링 복잡성

### LOW Confidence (아키텍처적 추론 기반)
- EVM Transfer 이벤트 위장 시나리오 — 이론적 분석, 실제 사례 미확인
- WAL checkpoint와 WebSocket 이벤트 핸들러 데드락 — 아키텍처적 추론, 부하 테스트 미수행
- Solana 공개 RPC 구독 수 한도 — 문서화된 수치 없음, 경험적 데이터 기반

---

*Pitfalls research for: WAIaaS 수신 트랜잭션 모니터링 설계*
*Researched: 2026-02-21*
