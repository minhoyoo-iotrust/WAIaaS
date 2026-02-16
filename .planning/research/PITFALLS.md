# Domain Pitfalls: WalletConnect v2 Owner 승인 통합

**Domain:** Self-hosted AI agent wallet daemon -- WalletConnect v2 QR 페어링, 원격 서명 요청, Telegram fallback
**Project:** WAIaaS (추후 마일스톤)
**Researched:** 2026-02-16
**Overall Confidence:** MEDIUM (WalletConnect 공식 스펙 + GitHub Issues + 기존 코드베이스 직접 분석. 일부 Node.js 서버 사이드 패턴은 커뮤니티 보고 기반)

---

## Overview

이 문서는 **기존 ApprovalWorkflow(동기적 ownerAuth 서명 검증)에 WalletConnect v2 기반 원격 Owner 승인 채널을 추가할 때** 발생하는 함정을 다룬다.

핵심 패러다임 전환: 현재 ApprovalWorkflow는 **Owner가 직접 WAIaaS REST API에 서명을 제출**(SIWE/SIWS 헤더)하는 Pull 모델이다. WalletConnect 통합은 **WAIaaS가 Owner 지갑에 서명 요청을 Push**하는 모델로 전환한다. 이 Push 모델은 외부 relay 서버 의존, 비동기 응답 대기, 세션 상태 관리 등 근본적으로 다른 실패 모드를 도입한다.

추가적으로 **Telegram Bot이 이미 /approve, /reject 명령을 지원**하므로, WalletConnect 채널이 Telegram fallback과 어떻게 공존하는지의 전환 조건이 핵심 설계 결정이다.

각 함정은 **Critical(보안 구멍 또는 자금 손실)**, **High(기능 파괴 또는 주요 재작업)**, **Moderate(기술 부채 또는 UX 혼란)** 3단계로 분류한다.

---

## Critical Pitfalls

보안 구멍, 정책 우회, 또는 승인 흐름 무결성을 위협하는 실수.

---

### C-01: WC 세션 미복구 시 데몬 재시작 = Owner 승인 경로 완전 단절

**Severity:** CRITICAL
**Confidence:** MEDIUM (WalletConnect GitHub Issue #687, #2574 + WC 스펙 Storage API 분석. Node.js 서버 사이드 세션 복구는 공식 가이드 부재)

**What goes wrong:**
WalletConnect v2 `@walletconnect/sign-client`는 내부적으로 세션, 페어링, proposal 등의 상태를 key-value 스토어에 저장한다. Node.js 환경에서는 기본적으로 `FileSystemStorage` 모듈을 사용하며 파일 시스템에 상태를 기록한다. 데몬이 재시작되면:

1. SignClient가 재초기화 → 기존 세션을 FileSystemStorage에서 읽으려 시도
2. FileSystemStorage의 기본 경로가 프로세스 CWD 상대 경로 → Docker 볼륨 마운트 미설정 시 데이터 소실
3. 세션이 복구되더라도 WebSocket 연결이 끊어진 상태 → relay 재연결 시 세션이 "stale" 상태
4. Owner의 MetaMask/Phantom은 여전히 페어링된 것으로 표시하지만, 데몬 측에서는 세션을 인식 못함
5. **Owner에게 승인 요청이 도달하지 않음** → APPROVAL 티어 트랜잭션이 모두 타임아웃 만료

**현재 코드와의 충돌:**
```
// WAIaaS의 기존 서비스들은 SQLite(better-sqlite3) 기반 상태 관리
// KillSwitchService, TelegramBotService 등 모두 SQLite에 상태 저장
// WalletConnect sign-client는 독자적 FileSystemStorage 사용
// → 두 개의 상태 소스가 공존하는 split-brain 위험
```

WAIaaS의 기존 데이터베이스는 `data/waiaas.db` 경로에 SQLite로 저장되며, Docker 배포 시 이 경로만 볼륨 마운트한다. WalletConnect의 FileSystemStorage가 다른 경로에 저장되면 컨테이너 재생성 시 세션이 소실된다.

**Why it happens:**
- WalletConnect SDK는 브라우저/모바일 앱 대상으로 설계되어 "앱 종료 후 재시작"이 일반적 시나리오가 아님
- Node.js 백엔드에서의 세션 직렬화/역직렬화 패턴에 대한 공식 가이드 부재 ([GitHub Issue #687](https://github.com/WalletConnect/walletconnect-monorepo/issues/687))
- FileSystemStorage의 기본 경로와 WAIaaS의 데이터 디렉토리가 별도
- 세션 복구 시 relay 재연결이 자동으로 되는지 여부가 SDK 버전에 따라 다름

**Warning signs:**
- 개발 중에는 "데몬 재시작 없이" 테스트하므로 세션 유실 시나리오를 놓침
- Docker compose up/down 시 WC 세션이 매번 끊어지는 증상
- 테스트에서 SignClient.init()을 매번 새로 호출하면서 기존 세션 존재 테스트 누락
- "QR 코드를 다시 스캔해주세요" 에러가 프로덕션에서 반복

**Prevention:**
1. **커스텀 Storage 어댑터로 SQLite 통합:** `@walletconnect/sign-client`의 storage 옵션에 SQLite 기반 커스텀 key-value 스토어를 주입. 기존 `key_value_store` 테이블을 재활용하거나 `wc_sessions` 전용 테이블 생성. WAIaaS DB와 동일 파일에 저장되므로 백업/복구/Docker 볼륨 마운트가 일원화됨.
2. **데몬 시작 시 세션 헬스체크:** `signClient.session.getAll()`로 활성 세션 목록 조회 → 각 세션에 ping 전송 → 응답 없으면 세션 정리 + 운영자 알림 "WalletConnect 세션이 만료되었습니다. 재페어링이 필요합니다."
3. **graceful shutdown 시 명시적 세션 보존:** 데몬 종료 시 `SIGTERM` 핸들러에서 SignClient 상태를 Storage에 flush. 갑작스런 종료(SIGKILL)에 대비하여 write-ahead 패턴 적용.
4. **세션 만료 주기적 체크 (like TelegramBotService.pollLoop):** 5분 간격으로 WC 세션 만료 확인. 만료 7일 전에 세션 extend 시도.

**Phase:** WC 기반 인프라 세팅 (가장 첫 번째 phase에서 해결)

---

### C-02: WalletConnect Relay 서버 의존 -- Self-Hosted 데몬의 외부 단일 실패점(SPOF)

**Severity:** CRITICAL
**Confidence:** HIGH (WalletConnect 공식 스펙: relay self-hosting 미지원 명시, [FAQ](https://docs.walletconnect.com/2.0/advanced/faq))

**What goes wrong:**
WAIaaS는 "self-hosted" 데몬이 핵심 가치이다. 모든 키와 정책이 로컬에서 관리되며 외부 서비스에 의존하지 않는다(Telegram Bot은 알림 전용이므로 데몬 코어 기능에 영향 없음). WalletConnect를 도입하면:

1. **Owner 승인 경로가 `wss://relay.walletconnect.com`에 의존** → relay 장애 시 승인 불가
2. relay는 WalletConnect 재단이 운영하는 중앙화 서비스 → self-hosted 데몬의 철학과 충돌
3. relay self-hosting은 **공식적으로 미지원** (WalletConnect FAQ: "Self-hosting is currently not supported")
4. WalletConnect Cloud에서 projectId를 발급받아야 하며, projectId가 비활성화되면 전체 승인 흐름 중단
5. relay 서비스 가용성은 WAIaaS 운영자가 제어할 수 없음

**Self-hosted 환경에서의 추가 위험:**
- 기업 방화벽이 `wss://relay.walletconnect.com` outbound WebSocket을 차단할 수 있음
- 프록시 환경에서 WebSocket upgrade가 실패하는 경우 다수 보고 ([Issue #1744](https://github.com/WalletConnect/walletconnect-monorepo/issues/1744))
- relay 서버 인증 시 JWT Authorization 헤더가 필요하며, WebSocket에서는 URL query param `?auth=`로 전달해야 하는 경우 프록시가 해당 파라미터를 strip할 수 있음

**현재 코드의 맥락:**
```
// TelegramBotService는 Telegram API 장애 시에도 데몬 코어에 영향 없음
// → 알림이 안 갈 뿐, 트랜잭션 처리는 정상 진행
// WalletConnect는 APPROVAL 승인 경로 자체이므로 장애 = 승인 불가
```

**Why it happens:**
- WalletConnect v2는 P2P 메시징을 위해 relay 서버를 중개자로 사용하는 것이 프로토콜 설계의 핵심
- 향후 탈중앙화 네트워크(WCT 토큰 기반)로 전환 예정이나, 현재는 중앙화 relay에 의존
- relay 없이 직접 P2P 통신하는 것은 프로토콜 수준에서 지원하지 않음

**Warning signs:**
- relay 연결 실패 시 데몬이 에러 로그만 남기고 승인 요청을 무한 대기
- 네트워크 단절 환경(에어갭)에서 WC 승인이 완전히 불가능한데 이에 대한 대책 없음
- KillSwitch 복구(dual-auth)가 WC 경로만 의존하면 relay 장애 시 복구 불가

**Prevention:**
1. **WalletConnect는 "선호 채널"이지 "유일 채널"이 아니어야 함:** 기존 ownerAuth(SIWE/SIWS 서명 + REST API 직접 제출)를 제거하지 않고 유지. WC는 UX 편의 채널로 추가하되, REST API 직접 승인도 항상 가능하게 유지.
2. **relay 헬스체크 + 자동 fallback:** relay 연결 상태를 모니터링하고, 연결 끊김이 N초(예: 30초) 이상 지속되면 자동으로 Telegram 채널로 승인 요청 전환.
3. **projectId를 config.toml에서 관리:** `[walletconnect]` 섹션에 `project_id` 설정. 미설정 시 WC 기능 비활성화(graceful degradation). 런타임에 Admin Settings에서 변경 가능하게.
4. **네트워크 요구사항 문서화:** "WalletConnect 사용 시 `wss://relay.walletconnect.com`으로의 outbound WebSocket 연결이 필요합니다. 방화벽에서 이 도메인을 허용해주세요."
5. **KillSwitch 복구 경로에서 WC 단독 의존 금지:** dual-auth 복구는 반드시 REST API(SIWE/SIWS) 경로도 지원.

**Phase:** 아키텍처 설계 (첫 번째 phase에서 fallback 전략 결정 필수)

---

### C-03: WC 서명 요청과 ApprovalWorkflow의 타이밍 불일치 -- 이중 승인 또는 만료 경쟁

**Severity:** CRITICAL
**Confidence:** HIGH (기존 ApprovalWorkflow.approve() 코드 직접 분석 + WC 세션 요청 기본 5분 타임아웃 확인)

**What goes wrong:**
현재 ApprovalWorkflow의 타임아웃 시스템과 WalletConnect의 요청 타임아웃이 독립적으로 동작한다:

**타임아웃 충돌 시나리오:**
1. APPROVAL 티어 트랜잭션 발생 → `approvalWorkflow.requestApproval(txId)` 호출 → 3-레벨 타임아웃으로 1시간 만료 설정
2. WC를 통해 Owner 지갑에 서명 요청 전송 → WC 기본 타임아웃 5분
3. Owner가 6분 후에 MetaMask에서 서명 승인 → WC 측에서는 이미 요청 만료(error code 8000: sessionRequestExpired)
4. 하지만 WAIaaS의 pending_approvals 테이블에서는 아직 유효 (expires_at = 1시간 후)
5. WC 응답이 타임아웃으로 실패했지만, Owner는 서명을 제출했다고 생각 → 혼란

**이중 승인 시나리오:**
1. WC로 서명 요청 → Owner가 MetaMask에서 서명 (하지만 네트워크 지연으로 응답이 데몬에 도달 안 함)
2. Telegram fallback 전환 → Owner가 Telegram에서 /approve 실행
3. Telegram /approve가 먼저 처리됨 → `approvalWorkflow.approve()` 호출 → tx EXECUTING으로 전이
4. 뒤늦게 WC 서명 응답 도달 → 이미 EXECUTING인 tx에 대해 또 approve 시도
5. `APPROVAL_NOT_FOUND` 에러 (approved_at이 이미 설정됨) → 에러 로그만 남음 → 무해하지만, Owner 서명이 버려지는 것은 보안 감사 관점에서 문제

**ownerSignature 충돌:**
현재 `approve(txId, ownerSignature)`에서 ownerSignature는 SIWE/SIWS 헤더 서명이다. WC를 통해 받는 서명은 `personal_sign` 또는 `eth_signTypedData_v4`의 결과이다. 이 두 서명의 포맷과 의미가 다르다:
- 기존: SIWE message + EIP-191 서명 (owner 인증 목적)
- WC: 트랜잭션 승인 메시지(예: "Approve TX {txId}: 10 SOL to 9bKr...") + EIP-191 서명 (승인 의사 확인 목적)

**Why it happens:**
- ApprovalWorkflow는 "Owner가 직접 API를 호출하는" 동기적 모델로 설계됨 → 타임아웃이 관대 (기본 1시간)
- WC 서명 요청은 "원격 지갑에 Push" 비동기 모델 → 기본 5분 타임아웃
- 두 타임아웃 시스템이 독립적이어서 불일치 필연
- Telegram /approve와 WC 승인이 병렬 경로로 존재하는데 atomic하지 않음

**Warning signs:**
- WC 요청 타임아웃과 ApprovalWorkflow 타임아웃을 독립적으로 설정
- Telegram /approve 핸들러가 WC 세션 상태를 확인하지 않음
- "이중 승인" 시나리오에 대한 테스트 케이스 부재
- `approve()` 호출 시 `owner_signature` 포맷 검증 없음

**Prevention:**
1. **단일 승인 소스 원칙:** 트랜잭션별로 "현재 승인 채널"을 기록. `pending_approvals` 테이블에 `channel` 컬럼 추가 (`'REST' | 'WALLETCONNECT' | 'TELEGRAM'`). 다른 채널에서의 승인 시도는 "이미 다른 채널에서 대기 중" 경고 반환.
2. **WC 타임아웃을 ApprovalWorkflow에 동기화:** WC 요청 전송 시 `expiry` 파라미터를 `pending_approvals.expires_at`과 일치시킴. WC의 기본 5분 대신, 정책 타임아웃(또는 config 값)을 사용. WC Extended Sessions를 활용하면 최대 7일까지 설정 가능.
3. **CAS(Compare-And-Swap) 기반 승인:** `approve()` 호출 시 `BEGIN IMMEDIATE` 트랜잭션 안에서 `approved_at IS NULL AND rejected_at IS NULL` 조건으로 update. 이미 처리되었으면 no-op (현재 코드에서 이미 이 패턴 사용 중이므로 이중 승인 자체는 방지됨, 하지만 "뒤늦은 WC 응답 처리" 로직이 필요).
4. **WC 응답 도착 후 상태 확인:** WC 서명 응답 수신 시 먼저 `pending_approvals`에서 해당 txId의 상태를 확인. 이미 처리(approved/rejected/expired)되었으면 응답을 무시하고 감사 로그에 기록.
5. **서명 포맷 통일:** WC를 통한 승인에도 SIWE/SIWS 포맷의 메시지 서명을 요청. `personal_sign`에 SIWE 메시지를 전달하면 Owner 지갑은 읽을 수 있는 메시지를 확인하고 서명. 서명 검증은 기존 `verifySIWE`/`sodium.crypto_sign_verify_detached` 로직 재활용.

**Phase:** ApprovalWorkflow + WC 통합 설계 시 (아키텍처 핵심 결정)

---

## High Pitfalls

기능 파괴, 주요 재작업, 또는 운영 장애를 야기하는 실수.

---

### H-01: QR 페어링 상태 전이의 불완전 관리 -- 좀비 페어링, 세션 누수

**Severity:** HIGH
**Confidence:** HIGH (WalletConnect 공식 스펙: [Pairing API](https://specs.walletconnect.com/2.0/specs/clients/core/pairing) 분석)

**What goes wrong:**
WalletConnect v2에서 페어링(pairing)과 세션(session)은 독립적 lifecycle을 가진다:

- **Inactive 페어링:** 생성 후 5분 내에 상대방이 페어링하지 않으면 만료
- **Active 페어링:** 성공적 페어링 후 30일 유효 (활동 시 갱신)
- **세션:** 페어링 위에서 생성, 기본 7일 TTL

**좀비 페어링 시나리오:**
1. Admin UI에서 "WalletConnect 연결" 버튼 → QR 코드 생성 (inactive 페어링 생성)
2. Owner가 5분 내에 스캔하지 않음 → inactive 페어링 만료
3. 하지만 데몬 내부의 pairing 객체가 정리되지 않음
4. Admin UI에서 다시 "연결" 클릭 → 새 페어링 생성, 이전 페어링은 좀비로 잔존
5. 반복하면 수십 개의 좀비 페어링이 Storage에 쌓임 → 메모리/디스크 누수

**세션 누수 시나리오:**
1. Owner가 MetaMask에서 WAIaaS 세션 연결 해제 (session_delete 이벤트)
2. 데몬이 `session_delete` 이벤트를 수신하지 못함 (WebSocket 재연결 중이었거나 데몬 다운 상태)
3. 데몬 내부에서는 세션이 여전히 활성으로 표시
4. 다음 승인 요청 시 해당 세션으로 요청 전송 → 응답 없음 → 타임아웃
5. Owner는 이미 연결 해제한 상태이므로 승인이 영원히 불가능

**다중 세션 시나리오:**
1. Owner가 모바일 MetaMask로 한번, 데스크톱 MetaMask로 한번 페어링
2. 2개의 활성 세션이 존재
3. 승인 요청을 어느 세션으로 보낼지 결정 로직 필요
4. 두 세션 모두에 보내면 → 이중 서명 응답 가능성
5. 하나만 보내면 → 그 디바이스를 사용하지 않는 시점에 승인 불가

**Why it happens:**
- WalletConnect v2는 pairing과 session을 decouple했지만, 이 decouple된 lifecycle 각각을 별도로 관리해야 함
- `session_delete`, `pairing_expire` 이벤트가 데몬 다운 시 유실될 수 있음
- SDK가 내부적으로 일부 정리를 하지만, `getActiveSessions()`가 실제로는 disconnected된 세션도 반환하는 버그 보고 ([Issue #4484](https://github.com/WalletConnect/walletconnect-monorepo/issues/4484))

**Warning signs:**
- `session_delete` 이벤트 핸들러가 구현되지 않음
- `pairing_expire` 이벤트 핸들러가 구현되지 않음
- Admin UI에 현재 WC 세션 상태를 보여주는 패널이 없음
- 세션 수를 제한하는 로직 없음

**Prevention:**
1. **WC 이벤트 전체 등록:** `session_delete`, `session_expire`, `session_update`, `pairing_expire`, `pairing_delete` 이벤트 모두 핸들링. 각 이벤트 시 DB에 상태 반영 + 감사 로그.
2. **주기적 세션 정리 (Janitor):** AutoStopService/BalanceMonitor 패턴처럼 5분 주기로 `signClient.session.getAll()` 순회 → 만료된 세션 정리, 활성 세션에 ping 전송하여 liveness 확인.
3. **단일 활성 세션 정책:** wallet당 WC 세션은 1개만 허용. 새 세션 생성 시 기존 세션 자동 disconnect. 다중 디바이스 지원은 추후 확장.
4. **Admin UI 세션 패널:** 현재 WC 세션 목록, 상태(active/expired/disconnected), 마지막 활동 시각, 수동 disconnect 버튼 제공.
5. **세션 활성화 시 DB 기록:** `wc_sessions` 테이블에 `{sessionTopic, walletId, peerMetadata, createdAt, expiresAt, lastActiveAt, status}` 저장. 데몬 재시작 시 이 테이블과 SignClient 내부 상태를 동기화.

**Phase:** WC 세션 관리 구현 시

---

### H-02: EventEmitter 메모리 누수 -- SignClient 초기화 + 이벤트 리스너 누적

**Severity:** HIGH
**Confidence:** MEDIUM (WalletConnect [Issue #1177](https://github.com/WalletConnect/walletconnect-monorepo/issues/1177) 직접 확인 -- MaxListenersExceededWarning 보고)

**What goes wrong:**
WalletConnect `@walletconnect/sign-client`는 내부적으로 Node.js EventEmitter를 사용한다. 초기화 시 다수의 이벤트 리스너를 등록하는데:

1. `SignClient.init()` 호출 시 내부적으로 10개 이상의 이벤트 리스너 등록
2. Node.js의 기본 MaxListeners 임계값(10)을 초과 → `MaxListenersExceededWarning` 경고
3. 경고 자체는 무해하지만, 실제 문제는 **SignClient를 여러 번 초기화하거나 이벤트 핸들러를 중복 등록할 때**
4. WAIaaS에서 `signClient.on('session_request', handler)`를 여러 곳에서 등록하면 리스너 누적
5. 장기 운영 시 메모리 사용량 증가 → 데몬 성능 저하 또는 OOM

**WAIaaS 특유의 리스크:**
```
// 기존 TelegramBotService는 단순 HTTP Long Polling → 이벤트 리스너 미사용
// WalletConnect는 WebSocket + EventEmitter 패턴 → 리스너 lifecycle 관리 필수
// 데몬이 24/7 장기 운영되므로 리스너 누수가 누적됨
```

Admin Settings hot-reload 시 WC 설정 변경 → SignClient 재초기화 → 이전 리스너가 정리되지 않으면 누적.

**Why it happens:**
- WalletConnect SDK가 `init()` 시 MaxListeners를 증가시키지 않음
- Node.js 기본 제한(10)이 WC의 내부 리스너 수보다 낮음
- SignClient 재초기화 시 이전 인스턴스의 리스너를 명시적으로 `removeAllListeners()`하지 않으면 GC 안 됨
- `.on()` vs `.once()` 사용의 혼동

**Warning signs:**
- 데몬 로그에 `MaxListenersExceededWarning` 경고 출현
- 데몬 장시간 운영 시 RSS 메모리가 단조 증가
- Admin Settings에서 WC 관련 설정 변경 후 리스너 수가 2배로 증가

**Prevention:**
1. **SignClient는 싱글턴:** 데몬 lifecycle 전체에서 SignClient 인스턴스를 1개만 유지. hot-reload 시에도 인스턴스를 재생성하지 않고 설정만 업데이트.
2. **MaxListeners 명시적 설정:** `signClient.core.events.setMaxListeners(20)` 또는 적절한 값으로 설정. 하지만 이것은 경고 억제일 뿐, 근본 해결은 리스너 관리.
3. **리스너 등록 중앙화:** WalletConnect 이벤트 핸들러를 `WalletConnectService` 클래스에서만 등록. 외부에서 직접 `.on()` 호출 금지. `WalletConnectService.stop()` 시 `removeAllListeners()` 호출.
4. **리스너 수 모니터링:** 주기적으로 `events.listenerCount('session_request')` 등을 체크하여 비정상 증가 감지 → 감사 로그에 경고.

**Phase:** WC 서비스 구현 시

---

### H-03: Telegram Fallback 전환 조건의 모호성 -- "언제 WC를 포기하고 Telegram으로 가나?"

**Severity:** HIGH
**Confidence:** HIGH (기존 TelegramBotService + NotificationService 코드 직접 분석)

**What goes wrong:**
WalletConnect와 Telegram Bot 모두 Owner 승인을 지원하면, 전환 로직이 핵심이 된다:

**시나리오 1: 너무 빠른 fallback**
1. WC로 승인 요청 전송 → Owner가 MetaMask를 여는 중 (10초 소요)
2. 5초 후 "WC 응답 없음" → Telegram으로 fallback → Telegram에서 승인 알림
3. Owner가 MetaMask에서 승인 → WC 응답 도달
4. 동시에 Telegram에서도 /approve 가능 → 이중 알림 + 혼란

**시나리오 2: 너무 느린 fallback**
1. WC로 승인 요청 전송 → Owner의 MetaMask가 오프라인 (폰 꺼짐)
2. WC 기본 타임아웃 5분 대기
3. 5분 후 Telegram으로 fallback → Telegram에서 승인
4. 5분간 APPROVAL 티어 트랜잭션이 블로킹됨 → 에이전트가 5분간 정지

**시나리오 3: 채널 선택 없음**
1. Owner가 WC 연결도 하고 Telegram 등록도 함
2. 승인 요청 시 어떤 채널을 먼저 시도하나?
3. 기본 설정이 없으면 구현자가 임의로 결정 → 일관성 없는 UX

**현재 코드의 맥락:**
```
// TelegramBotService.handleApprove()는 직접 DB에서 pending_approvals를 update
// ownerAuth 미들웨어의 서명 검증을 거치지 않음 (Telegram 2-Tier auth만 확인)
// WC 승인은 암호학적 서명을 포함하므로 보안 수준이 다름
// → 두 채널의 보안 수준 차이를 어떻게 처리?
```

**Why it happens:**
- "WC가 실패하면 Telegram으로"라는 개념은 단순하지만, "실패"의 정의가 모호
- WC 요청은 비동기이므로 "타임아웃 전"과 "실패" 사이의 경계가 불분명
- Telegram /approve는 ownerAuth 서명 없이 승인하므로 보안 모델이 다름
- NotificationService의 priority fallback 패턴(channels 순서대로 시도)은 알림 전송용이지, 승인 워크플로우용이 아님

**Warning signs:**
- fallback 타임아웃이 하드코딩되어 있음 (운영자 설정 불가)
- WC 채널과 Telegram 채널 모두에서 동시에 승인 대기 중인 상태
- fallback 전환 시 WC 요청을 명시적으로 취소하지 않음
- Telegram /approve 후에도 WC 세션에서 승인 프롬프트가 남아 있음

**Prevention:**
1. **채널 우선순위 설정:** Admin Settings에 `approval_channel_priority: ['walletconnect', 'telegram', 'rest']` 설정. 첫 번째 채널 실패 시 다음 채널로 순차 fallback.
2. **단계적 fallback 타임아웃:** WC 요청 후 `wc_fallback_timeout` (기본 60초) 동안 응답 대기. 타임아웃 시 다음 채널로 전환. 운영자가 Admin Settings에서 조정 가능.
3. **fallback 전환 시 이전 채널 취소:** Telegram으로 fallback 시, WC 세션에 cancel 시그널 전송 (혹은 WC 응답이 늦게 도달해도 무시하도록 상태 전이).
4. **채널별 보안 수준 차별화:** WC 승인 = 암호학적 서명 포함 (ownerAuth 수준). Telegram /approve = 2-Tier auth (admin 레벨). 보안 수준이 다르므로, 고액 트랜잭션은 WC/REST만 허용하고 Telegram은 소액만 허용하는 옵션 제공.
5. **상태 전이 다이어그램 명시:** `PENDING_WC → (timeout) → PENDING_TELEGRAM → (timeout) → EXPIRED` 또는 `PENDING_WC → (wc_approved) → APPROVED`. 모든 전이를 감사 로그에 기록.

**Phase:** Approval 채널 전략 설계 시

---

### H-04: WC 서명 요청의 메시지 포맷 -- Owner가 "무엇을 승인하는지" 알 수 없는 문제

**Severity:** HIGH
**Confidence:** MEDIUM (WC `personal_sign` 스펙 + MetaMask 서명 UI 분석)

**What goes wrong:**
WalletConnect를 통해 Owner에게 서명을 요청할 때, Owner의 지갑(MetaMask/Phantom 등)에 표시되는 메시지가 핵심이다:

**Case 1: 불투명한 메시지**
1. WAIaaS가 `personal_sign`으로 트랜잭션 해시만 전송: `"0xa1b2c3..."`
2. Owner의 MetaMask에 의미 불명의 hex 문자열이 표시됨
3. Owner가 "이게 뭔데?" → 맹목적으로 승인하거나 거부
4. **Owner가 실제로 10 SOL 전송을 승인하는 것인지, 100 SOL을 승인하는 것인지 알 수 없음**
5. 보안 관점에서 blind signing과 동일 → 중간자가 금액을 조작해도 Owner가 감지 불가

**Case 2: 너무 상세한 메시지**
1. WAIaaS가 전체 트랜잭션 상세를 plain text로 전송
2. MetaMask가 긴 메시지를 스크롤 가능하게 표시하지만, 모바일에서 읽기 어려움
3. Owner가 상세 내용을 읽지 않고 습관적으로 승인

**Case 3: EIP-712 typed data**
1. `eth_signTypedData_v4`를 사용하면 구조화된 데이터를 보여줄 수 있음
2. 하지만 Solana 체인에서는 `signMessage`만 가능 (typed data 미지원)
3. 체인별로 다른 서명 방식 필요 → 코드 복잡성 증가

**Why it happens:**
- WC `personal_sign`/`solana_signMessage`의 UX가 지갑 앱마다 다름
- SIWE(EIP-4361) 포맷은 인증 목적이지, 트랜잭션 승인 목적이 아님
- 트랜잭션 상세 정보를 가독성 있게 표현하는 표준이 없음

**Warning signs:**
- 서명 요청 메시지에 트랜잭션 금액, 수신자, 체인 정보가 없음
- Owner가 "항상 승인"을 요청하거나 "뭘 승인하는지 모르겠다"고 피드백
- 테스트에서 메시지 내용 검증 없이 서명 성공/실패만 확인

**Prevention:**
1. **구조화된 승인 메시지 포맷 정의:**
```
WAIaaS Transaction Approval

Action: Transfer 10 SOL
To: 9bKrTD...4xF2
Wallet: my-trading-bot
Chain: solana-devnet
TX ID: 01JKQP...

Approve by signing this message.
Timestamp: 2026-02-16T10:30:00Z
```
사람이 읽을 수 있는 plain text를 `personal_sign`/`solana_signMessage`로 전송.
2. **EVM에서 EIP-712 활용:** 가능한 경우 `eth_signTypedData_v4`로 구조화된 데이터 전송. 타입 정의에 `{action, amount, to, chain, txId}` 포함. MetaMask가 필드를 보기 좋게 표시.
3. **메시지에 보안 필수 필드 포함:** 금액, 수신자, 체인, 타임스탬프는 필수. 이 필드들을 서명 검증 시 다시 추출하여 실제 트랜잭션과 대조. 불일치 시 deny.
4. **Nonce/타임스탬프로 재사용 방지:** 각 승인 메시지에 고유 nonce(예: approvalId)를 포함. 동일 메시지를 다른 트랜잭션에 재사용하는 replay 공격 방지.

**Phase:** WC 서명 요청 프로토콜 설계 시

---

## Moderate Pitfalls

기술 부채, UX 혼란, 또는 운영 복잡성을 야기하는 실수.

---

### M-01: Admin UI에서 QR 코드 표시 시 CSP(Content Security Policy) 충돌

**Severity:** MEDIUM
**Confidence:** MEDIUM (현재 Admin UI CSP 설정 분석: `default-src 'none'`)

**What goes wrong:**
현재 Admin UI는 엄격한 CSP를 적용한다:
```
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; ...
```

QR 코드를 Admin UI에 표시하려면:
1. **Canvas API 사용:** `qrcode` 라이브러리가 Canvas에 그리는 방식 → CSP 위반 없음 (Canvas는 same-origin)
2. **SVG inline:** QR 코드를 SVG로 생성하여 인라인 삽입 → `img-src` 정책과 무관, 하지만 inline SVG에 script가 포함되면 XSS 벡터
3. **Data URL img:** `<img src="data:image/png;base64,...">` → `img-src data:` 허용 필요 → CSP 완화
4. **외부 QR 생성 서비스:** CSP에서 외부 도메인 허용 필요 → self-hosted 원칙 위반

**추가 문제:** QR 코드에 WalletConnect URI가 포함되며, 이 URI에는 relay URL과 key 정보가 들어있다. QR 코드가 스크린샷이나 로그에 노출되면 제3자가 같은 페어링에 연결할 수 있다.

**Why it happens:**
- Admin UI의 CSP가 엄격하게 설정되어 있어 새로운 렌더링 방식 추가 시 충돌
- QR 코드 라이브러리마다 렌더링 방식이 다름

**Prevention:**
1. **SVG 기반 QR 라이브러리 사용:** `qrcode` 패키지의 `toDataURL()` 대신 `toString({ type: 'svg' })` 사용하여 SVG 문자열을 Preact 컴포넌트에 `dangerouslySetInnerHTML`로 삽입. SVG에 script 태그가 포함되지 않도록 sanitize.
2. **QR 코드 자동 만료 + 갱신:** 5분 타이머를 표시하고, 만료 시 QR 코드를 비활성화 + "새로고침" 버튼 제공. 만료된 QR 코드가 스크린샷으로 유출되어도 무해.
3. **CSP 최소 완화:** 필요하다면 `img-src 'self' data:` 추가. `default-src 'none'` 유지하되 `img-src`만 완화.

**Phase:** Admin UI WC 연동 페이지 구현 시

---

### M-02: WalletConnect 네임스페이스 / 체인 설정과 WAIaaS 멀티체인 모델의 불일치

**Severity:** MEDIUM
**Confidence:** MEDIUM (WC namespaces 스펙 분석 + WAIaaS ChainType/EnvironmentType 모델 분석)

**What goes wrong:**
WalletConnect v2는 세션에서 지원할 체인을 namespace로 정의한다:
```json
{
  "requiredNamespaces": {
    "eip155": { "chains": ["eip155:1", "eip155:11155111"], "methods": ["personal_sign"] },
    "solana": { "chains": ["solana:EtWTRABZ..."], "methods": ["solana_signMessage"] }
  }
}
```

WAIaaS의 체인 모델:
- `ChainType`: `'solana' | 'ethereum'`
- `EnvironmentType`: `'testnet' | 'mainnet'`
- `NetworkType`: `'solana-mainnet' | 'solana-devnet' | 'ethereum-mainnet' | 'ethereum-sepolia' | ...`

**불일치 시나리오:**
1. WAIaaS가 `eip155:11155111` (Sepolia)에 대한 서명을 요청하려 하지만, Owner의 MetaMask가 Sepolia를 세션 승인 시 포함하지 않았음
2. WC 세션은 "사전 승인된 체인 목록"에 없는 체인에 대한 요청을 거부함
3. Owner가 세션을 다시 연결해야 하는데, 어떤 체인을 포함해야 하는지 WAIaaS가 안내하지 않음

**Solana 체인 ID 문제:**
- WC의 Solana 체인 ID 포맷: `solana:{genesisHash}` (예: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`)
- WAIaaS의 NetworkType과 직접 매핑되지 않음
- genesis hash를 RPC에서 조회하거나 하드코딩해야 함

**Why it happens:**
- WC의 체인 식별 체계(CAIP-2)와 WAIaaS의 체인 모델이 다른 컨벤션을 사용
- WC가 "사전 승인"을 요구하는데, WAIaaS wallet은 동적으로 체인/네트워크가 변경될 수 있음

**Prevention:**
1. **CAIP-2 <-> WAIaaS NetworkType 매핑 함수:** `caip2ToNetwork('eip155:1') → 'ethereum-mainnet'`, `networkToCaip2('solana-devnet') → 'solana:EtWTR...'` 매핑 유틸리티.
2. **세션 생성 시 wallet의 현재 체인 기반으로 requiredNamespaces 구성:** wallet.chain + wallet.environment에서 CAIP-2 체인 ID를 도출하여 세션 proposal에 포함.
3. **세션이 지원하지 않는 체인 요청 시 재연결 안내:** "현재 WalletConnect 세션이 {chain}을 지원하지 않습니다. 재연결이 필요합니다." 에러 메시지와 함께 Admin UI에서 재페어링 유도.

**Phase:** WC 세션 proposal 구성 시

---

### M-03: WalletConnect WebSocket 재연결과 TelegramBotService Long Polling의 충돌

**Severity:** MEDIUM
**Confidence:** LOW (아키텍처적 추론 -- 두 서비스의 동시 운영 패턴 분석)

**What goes wrong:**
현재 TelegramBotService는 Long Polling으로 Telegram API를 주기적으로 호출한다. WalletConnect SignClient는 WebSocket으로 relay와 영구 연결을 유지한다. 두 서비스가 동시에 네트워크 I/O를 수행하면:

1. **네트워크 단절 시 재연결 경쟁:** 양 서비스 모두 exponential backoff로 재시도. 동시에 재시도하면 네트워크 리소스 경합.
2. **graceful shutdown 순서:** 데몬 종료 시 TelegramBotService.stop()과 WalletConnectService.stop()의 순서. WC 세션 상태를 먼저 저장해야 하는데, Telegram Bot이 먼저 종료되면 "승인 채널 없음" 상태가 잠깐 발생.
3. **이벤트 루프 블로킹:** SQLite 동기 쿼리(better-sqlite3)와 WC WebSocket 비동기 이벤트가 혼재. 긴 SQLite 쿼리가 WC 이벤트 수신을 지연시킬 수 있음.

**Why it happens:**
- 기존 서비스들(Telegram, BalanceMonitor, AutoStop)은 모두 주기적 폴링 패턴이어서 이벤트 루프 점유가 짧음
- WC는 WebSocket 기반 실시간 이벤트 → 이벤트 루프 점유 패턴이 다름
- better-sqlite3의 동기 쿼리가 이벤트 루프를 블로킹하는 기존 특성이 WC와 충돌 가능

**Prevention:**
1. **서비스 시작/종료 순서 명시:** start: WC → Telegram → 기타. stop: 기타 → Telegram → WC (WC 세션 저장이 마지막).
2. **WC 이벤트 핸들러에서 긴 동기 작업 금지:** `session_request` 핸들러에서 DB 쓰기는 `setImmediate()` 또는 microtask로 분리.
3. **독립적 재연결 타이머:** TelegramBotService와 WalletConnectService의 backoff 타이머를 jitter(랜덤 지연)로 분산.

**Phase:** 서비스 lifecycle 관리 구현 시

---

### M-04: WalletConnect projectId 노출 및 회전(rotation) 부재

**Severity:** MEDIUM
**Confidence:** MEDIUM (WalletConnect Cloud 문서 분석)

**What goes wrong:**
WalletConnect Cloud에서 발급받는 projectId는 relay 서버 인증에 사용된다:

1. projectId가 config.toml에 평문으로 저장됨 → Git에 실수로 커밋 가능
2. projectId가 QR URI에 포함됨 (`wc:...?projectId=xxx`) → QR 코드 스크린샷으로 유출 가능
3. 유출된 projectId로 제3자가 같은 프로젝트의 relay 자원을 소비 → rate limit 도달 → 데몬의 WC 기능 중단
4. projectId를 변경하려면 WalletConnect Cloud에서 새로 발급 + config.toml 수정 + 데몬 재시작 → 모든 기존 세션 무효화

**현재 보안 모델과의 비교:**
```
// 기존 보안 자격증명:
// - master_password_hash: Argon2id 해시로 저장 (평문 불가)
// - JWT 시크릿: 최초 실행 시 랜덤 생성 + DB 저장
// - Telegram bot_token: config.toml에 평문 (비슷한 리스크)
// projectId는 Telegram bot_token과 유사한 리스크 수준
```

**Why it happens:**
- WalletConnect projectId가 API 키이지만, OAuth client secret과 달리 relay 연결 시에만 사용되므로 보안 인식이 낮음
- projectId 없이는 WC 기능을 사용할 수 없으므로 필수 설정인데, 관리 전략이 없으면 평문 노출

**Prevention:**
1. **환경변수 우선 로딩:** `WAIAAS_WALLETCONNECT_PROJECT_ID` 환경변수를 config.toml보다 우선. Docker Secrets/env file로 주입 가능.
2. **config.toml에 주석 경고:** "# WARNING: projectId를 Git에 커밋하지 마세요. 환경변수 사용을 권장합니다."
3. **.gitignore 점검:** config.toml이 .gitignore에 포함되어 있는지 확인 (기존 WAIaaS는 config.example.toml만 커밋하는 패턴).
4. **Admin Settings에서 마스킹 표시:** projectId를 Admin UI에서 `abc***xyz` 형태로 마스킹 표시. 변경은 config.toml/환경변수로만 가능 (hot-reload 대상 아님 -- 변경 시 WC 재초기화 필요).

**Phase:** config 스키마 확장 시

---

### M-05: WC 서명 요청과 KillSwitch의 상호작용 미정의

**Severity:** MEDIUM
**Confidence:** HIGH (기존 KillSwitchService 코드 + kill-switch-guard.ts 직접 분석)

**What goes wrong:**
현재 KillSwitch가 SUSPENDED/LOCKED 상태이면 `killSwitchGuard` 미들웨어가 모든 REST API 요청을 차단한다. 그러나 WC를 통한 승인 흐름은 REST API를 거치지 않으므로:

1. KillSwitch SUSPENDED → REST API 모두 차단
2. 하지만 WC session_request 이벤트는 WebSocket으로 수신됨 → killSwitchGuard 미적용
3. WC 이벤트 핸들러가 KillSwitch 상태를 확인하지 않으면 → SUSPENDED 상태에서도 Owner가 승인 시도 가능?
4. 반대로, SUSPENDED 상태에서 Owner가 WC로 KillSwitch 복구를 시도해야 하는 경우 → WC 자체가 차단되면 복구 불가

**KillSwitch 복구(dual-auth) 시나리오:**
- 현재: masterAuth + ownerAuth(REST API) 필요
- WC 추가 후: masterAuth + WC 서명으로 복구 가능해야 하나?
- WC 세션이 KillSwitch 이전에 이미 연결되어 있어야 함 → KillSwitch 후 새 WC 세션은 맺을 수 없음

**Why it happens:**
- killSwitchGuard는 Hono 미들웨어로 REST API 라우트에만 적용
- WC 이벤트는 REST API 바깥의 별도 이벤트 루프에서 처리
- KillSwitch 상태 확인이 미들웨어에 묶여 있어 서비스 레이어에서 접근하려면 별도 호출 필요

**Prevention:**
1. **WC 이벤트 핸들러에서 KillSwitch 상태 확인:** `session_request` 수신 시 `killSwitchService.getState()` 호출. SUSPENDED/LOCKED이면 WC 응답에 에러 반환 (error code 4100: "System suspended").
2. **KillSwitch 활성화 시 WC 세션 일시 정지:** SUSPENDED 전이 시 WC를 통한 신규 요청 수신을 차단하되 세션 자체는 유지 (복구 후 재사용 가능).
3. **KillSwitch 복구에 WC 경로 추가 여부는 설계 결정:** 보안상 KillSwitch 복구는 REST API(직접 접근)로만 허용하고, WC는 일반 트랜잭션 승인에만 사용하는 것이 더 안전. WC relay 장애 시 복구 불가 위험 배제.

**Phase:** KillSwitch + WC 통합 시

---

### M-06: WC `session_request`에서 받은 서명을 기존 ownerAuth 검증 로직에 피딩하는 어댑팅 복잡도

**Severity:** MEDIUM
**Confidence:** MEDIUM (기존 owner-auth.ts, verifySIWE 코드 분석)

**What goes wrong:**
현재 ownerAuth 미들웨어는 HTTP 헤더에서 서명을 받는다:
```
X-Owner-Signature: {signature}
X-Owner-Message: {message}
X-Owner-Address: {ownerAddress}
```

WalletConnect를 통한 서명은 다른 경로로 도달한다:
```
signClient.on('session_request') → handler에서 서명 수신
→ 서명을 ApprovalWorkflow.approve()에 전달
→ 하지만 approve()는 ownerSignature string만 받음
→ 서명 검증 로직(SIWE verify / Ed25519 verify)을 별도로 호출해야 함
```

**문제점:**
1. `approve(txId, ownerSignature)` 함수가 서명 검증을 하지 않음 → 검증은 ownerAuth 미들웨어에서 수행
2. WC 경로에서는 ownerAuth 미들웨어를 거치지 않으므로 → 서명 검증이 누락될 수 있음
3. WC `personal_sign` 결과와 SIWE 서명의 포맷이 다름 → 기존 `verifySIWE()` 함수 직접 재사용 불가
4. Solana `solana_signMessage` 결과와 Ed25519 detached signature의 포맷이 다름 → 디코딩 레이어 필요

**Why it happens:**
- 현재 아키텍처에서 "서명 검증"이 미들웨어(HTTP 레이어)에 묶여 있음
- 서비스 레이어에서 독립적으로 호출 가능한 서명 검증 함수가 없음 (verifySIWE는 있지만 메시지 파싱 + 서명 검증이 결합됨)

**Prevention:**
1. **서명 검증 로직을 서비스 레이어로 추출:**
```typescript
// owner-verification.ts (새 파일)
export function verifyOwnerSignature(params: {
  chain: ChainType;
  message: string;
  signature: string;
  expectedAddress: string;
}): { valid: boolean; error?: string }
```
ownerAuth 미들웨어와 WC 이벤트 핸들러 모두 이 함수를 호출.
2. **WC 서명 결과를 표준 포맷으로 변환:** WC `personal_sign` 응답 → `{ message, signature, address }` 표준 구조로 변환하는 어댑터.
3. **ApprovalWorkflow.approve()에 검증 옵션 추가:** `approve(txId, { signature, message, address, channel: 'walletconnect' })` 형태로 확장하여, 내부에서 서명 검증까지 수행.

**Phase:** WC 서명 검증 어댑터 구현 시

---

## Phase-Specific Warning Summary

| Phase Topic | Likely Pitfall | Severity | Mitigation Key |
|-------------|---------------|----------|---------------|
| **아키텍처 설계 (첫 phase)** | C-02: relay SPOF + self-hosted 철학 충돌 | CRITICAL | WC는 선호 채널, REST API 유지, 자동 fallback |
| **아키텍처 설계 (첫 phase)** | H-03: Telegram fallback 전환 조건 모호 | HIGH | 채널 우선순위 + 단계적 타임아웃 |
| **WC 인프라 세팅** | C-01: 데몬 재시작 시 세션 유실 | CRITICAL | SQLite 커스텀 Storage + 시작 시 헬스체크 |
| **ApprovalWorkflow 통합** | C-03: 타이밍 불일치 + 이중 승인 경쟁 | CRITICAL | 단일 승인 소스 + WC 타임아웃 동기화 |
| **WC 세션 관리** | H-01: 좀비 페어링, 세션 누수 | HIGH | 이벤트 전체 등록 + 주기적 정리 + 단일 세션 |
| **WC 서비스 구현** | H-02: EventEmitter 메모리 누수 | HIGH | SignClient 싱글턴 + 리스너 중앙화 |
| **서명 요청 프로토콜** | H-04: Owner가 승인 내용 확인 불가 | HIGH | 구조화된 승인 메시지 + 보안 필수 필드 |
| **Admin UI** | M-01: CSP 충돌 (QR 코드 렌더링) | MEDIUM | SVG 기반 QR + 자동 만료 |
| **세션 proposal** | M-02: 네임스페이스/체인 모델 불일치 | MEDIUM | CAIP-2 매핑 유틸리티 |
| **서비스 lifecycle** | M-03: WebSocket + Long Polling 충돌 | MEDIUM | 시작/종료 순서 + jitter backoff |
| **config 확장** | M-04: projectId 노출 | MEDIUM | 환경변수 우선 + 마스킹 |
| **KillSwitch 통합** | M-05: KillSwitch-WC 상호작용 미정의 | MEDIUM | 이벤트 핸들러에서 상태 확인 |
| **서명 검증 어댑팅** | M-06: ownerAuth 로직 서비스 추출 | MEDIUM | verifyOwnerSignature 공통 함수 |

---

## Integration Risk Matrix

기존 코드 컴포넌트별 WalletConnect 추가 시 영향도:

| 컴포넌트 | 변경 필요 | 위험도 | 주의사항 |
|----------|:--------:|:------:|---------|
| `approval-workflow.ts` | `approve()`에 channel/메타데이터 확장, 동시 승인 방어 | HIGH | BEGIN IMMEDIATE 패턴 유지, CAS 검증 |
| `owner-auth.ts` | 서명 검증 로직을 서비스 레이어로 추출 | HIGH | 기존 REST API 경로에 영향 없어야 함 |
| `owner-state.ts` | WC 세션 존재 여부가 Owner 상태에 영향? (GRACE→LOCKED 자동 전이?) | MEDIUM | resolveOwnerState 순수성 유지 |
| `telegram-bot-service.ts` | fallback 채널로서의 역할 변경 + /approve 동시성 처리 | MEDIUM | 기존 기능 파괴 금지 |
| `notification-service.ts` | WC_SESSION_EXPIRED, WC_APPROVAL_TIMEOUT 등 새 이벤트 | LOW | 기존 이벤트에 영향 없음 |
| `kill-switch-service.ts` | WC 이벤트 핸들러에서 상태 체크 호출 추가 | MEDIUM | cascade에 WC 세션 정지 추가 검토 |
| `schema.ts` | `wc_sessions` 테이블 추가, `pending_approvals`에 channel 컬럼 | MEDIUM | DB 마이그레이션 필수 |
| `config.toml` | `[walletconnect]` 섹션 추가 | LOW | 기존 설정에 영향 없음 |
| `admin UI` | WC 연결 페이지, 세션 관리, QR 코드 | LOW | CSP 조정 필요 |
| `pipeline/stages.ts` | stage4Wait에서 WC 채널 라우팅 | MEDIUM | 기존 APPROVAL 흐름 파괴 금지 |

---

## Sources

### HIGH Confidence
- WAIaaS 코드베이스 직접 분석: `approval-workflow.ts`, `owner-auth.ts`, `owner-state.ts`, `telegram-bot-service.ts`, `notification-service.ts`, `kill-switch-guard.ts` (v1.6)
- [WalletConnect Pairing API Spec](https://specs.walletconnect.com/2.0/specs/clients/core/pairing) -- pairing TTL (5분 inactive, 30일 active), lifecycle 이벤트
- [WalletConnect Sign API Error Codes](https://specs.walletconnect.com/2.0/specs/clients/sign) -- error code 8000 (sessionRequestExpired), 4100, 5000
- [WalletConnect FAQ: Self-hosting not supported](https://docs.walletconnect.com/2.0/advanced/faq) -- relay self-hosting 미지원 명시
- [WC Issue #1177: MaxListenersExceededWarning](https://github.com/WalletConnect/walletconnect-monorepo/issues/1177) -- EventEmitter 메모리 누수 보고
- [WC Issue #4484: getActiveSessions returns disconnected sessions](https://github.com/WalletConnect/walletconnect-monorepo/issues/4484) -- 세션 정리 버그
- [WC Extended Sessions](https://docs.walletconnect.network/custodians/extended-sessions) -- 최대 7일 요청 타임아웃 확장

### MEDIUM Confidence
- [WC Issue #687: Session serialize/restore in backend](https://github.com/WalletConnect/walletconnect-monorepo/issues/687) -- Node.js 세션 복구 요청
- [WC Issue #2574: Restoring sessions for Web3Wallet](https://github.com/orgs/WalletConnect/discussions/2574) -- 세션 복구 논의
- [WC Issue #3607: Missing await in session_request respond](https://github.com/WalletConnect/walletconnect-monorepo/issues/3607) -- 비동기 응답 처리 버그
- [WC Issue #1744: WebSocket fails when not on localhost](https://github.com/WalletConnect/walletconnect-monorepo/issues/1744) -- 도메인 기반 연결 실패
- [WC Issue #1739: Add timeout option for signClient.request](https://github.com/WalletConnect/walletconnect-monorepo/issues/1739) -- 요청 타임아웃 커스터마이징
- [WC Issue #1268: Incorrect order of transaction requests](https://github.com/WalletConnect/WalletConnectKotlinV2/issues/1268) -- 다중 세션 요청 순서 문제
- [WalletConnect Storage API Spec](https://specs.walletconnect.com/2.0/specs/clients/core/storage) -- key-value storage 요구사항
- [WC Relay Client Auth Spec](https://specs.walletconnect.com/2.0/specs/clients/core/relay/relay-client-auth) -- JWT 인증, WebSocket Authorization 헤더

### LOW Confidence (아키텍처적 추론 기반)
- WC SignClient의 FileSystemStorage 기본 경로가 CWD 상대 경로인지 여부 -- npm 패키지 소스 미확인, 커뮤니티 보고 기반
- WC WebSocket 재연결과 TelegramBotService Long Polling의 이벤트 루프 경합 -- 아키텍처적 추론
- SQLite 동기 쿼리(better-sqlite3)와 WC 비동기 이벤트의 상호작용 -- 이론적 분석, 실제 부하 테스트 미수행
