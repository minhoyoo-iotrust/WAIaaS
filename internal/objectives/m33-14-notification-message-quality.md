# 마일스톤 m33-14: 알림 메시지 품질 개선

- **Status:** PLANNED
- **Milestone:** v33.4

## 목표

사용자(Owner)가 텔레그램 및 D'CENT 앱으로 수신하는 알림의 품질을 전면 개선한다. 한 번의 트랜잭션에 4~6개씩 쏟아지는 알림을 1~2개로 통합하고, 테크니컬한 메시지를 사람 친화적 표현으로 전환한다. Push Relay payload 필드 구조는 변경하지 않으며, 기존 필드의 **값(content)**만 개선하므로 D'CENT 등 라이브 지갑 앱의 하위호환성에 영향 없다.

---

## 배경

### 문제 1: 알림 폭탄

단일 트랜잭션 실행 시 파이프라인 각 스테이지에서 독립적으로 알림을 발생시킨다:

| 티어 | 현재 알림 수 | 이벤트 순서 |
|------|------------|------------|
| ALLOW (즉시) | 4개 | TX_REQUESTED → TX_SUBMITTED → TX_CONFIRMED + (선택) CUMULATIVE_LIMIT_WARNING |
| DELAY (지연) | 4~5개 | TX_REQUESTED → TX_QUEUED → TX_SUBMITTED → TX_CONFIRMED |
| APPROVAL (승인) | 5~6개 | TX_REQUESTED → TX_APPROVAL_REQUIRED → TX_QUEUED → TX_SUBMITTED → TX_CONFIRMED |
| Gas Condition | +2개 추가 | TX_GAS_WAITING → TX_GAS_CONDITION_MET |
| Bridge | +1~3개 추가 | BRIDGE_MONITORING_STARTED → BRIDGE_COMPLETED/FAILED/TIMEOUT |

디중복/배칭/통합 로직이 전혀 없어 사용자에게 동일 거래의 상태 변화가 개별 푸시로 전달된다.

### 문제 2: 테크니컬 메시지

| 현재 메시지 | 문제 |
|------------|------|
| `Transaction tx-abc123def456ghi789... confirmed` | 36자 UUID — 사용자 무의미 |
| `Amount: 0.5 ETH, To: 0xdef456... 0.5 ETH` | 금액 2회 반복 |
| `Chain: eip155:1 (ethereum-mainnet)` | CAIP-2 ID + 내부 네트워크 ID 노출 |
| `TRANSFER 1.5 ETH from 0x123456... to 0xabcdef...` | 내부 enum 이름, from(본인 지갑) 불필요 |
| `{display_amount}` 치환 실패 시 빈 문자열 잔해 | 메시지 끝에 불필요한 공백 |

---

## 산출물

### 1. 알림 통합 — Quiet Event 시스템 (A, K)

NotificationService에 **Quiet Event** 개념을 도입한다. Quiet 이벤트는 `notification_logs`에 기록되지만 사용자에게 푸시를 전송하지 않는다.

#### Quiet 이벤트 목록

| 이벤트 | 사유 |
|--------|------|
| TX_REQUESTED | 중간 상태 — 사용자가 이미 요청을 인지하고 있음 |
| TX_SUBMITTED | 중간 상태 — CONFIRMED/FAILED가 최종 결과 |
| TX_GAS_WAITING | 사용자가 할 수 있는 것 없음 — 최종 결과만 알림 |
| TX_GAS_CONDITION_MET | 중간 상태 — 이후 실행 결과가 더 중요 |
| BRIDGE_MONITORING_STARTED | 시스템 내부 상태 전환 — 사용자 액션 불필요 |
| EXTERNAL_ACTION_PARTIALLY_FILLED | 중간 상태 — FILLED/SETTLED/FAILED만 의미 있음 |

#### 결과: 티어별 알림 수

| 티어 | 개선 전 | 개선 후 | 사용자 수신 이벤트 |
|------|--------|--------|-------------------|
| ALLOW | 4개 | 1개 | TX_CONFIRMED 또는 TX_FAILED |
| DELAY | 4~5개 | 2개 | TX_QUEUED + TX_CONFIRMED/FAILED |
| APPROVAL | 5~6개 | 2개 | TX_APPROVAL_REQUIRED + TX_CONFIRMED/FAILED |
| Gas Condition | +2개 | +0개 | 최종 실행 결과에 통합 |
| Bridge | +1~3개 | +1개 | BRIDGE_COMPLETED/FAILED/TIMEOUT/REFUNDED만 |

#### 구현 위치

- `notification-service.ts`에 `QUIET_EVENTS: Set<NotificationEventType>` 상수 추가
- `notify()` 메서드에서 quiet 이벤트는 `notification_logs`에 `status='quiet'`로 기록 후 return
- BROADCAST_EVENTS는 quiet 대상에서 제외 (항상 전송)
- Admin Settings에 `notifications.quiet_events` 설정 추가 — 사용자가 quiet 목록 커스터마이즈 가능

### 2. 메시지 템플릿 전면 개편 (B, L)

`/packages/core/src/i18n/en.ts`와 `ko.ts`의 notification 템플릿을 전면 개편한다.

#### 템플릿 개편 원칙

| 원칙 | 설명 |
|------|------|
| txId 제거 | UUID는 사용자에게 무의미. Admin UI에서 확인 가능 |
| 금액 1회만 | body에 금액+USD를 한 줄로. display_amount 중복 제거 |
| 동사 중심 | "Transaction Confirmed" → "Transfer Complete" |
| 네트워크 표시명 | `ethereum-mainnet` → `Ethereum` |
| 주소 축약 | 4+4 형식 유지 (`0xabcd…ef01`) |
| 컨트랙트 이름 | Contract Name Resolution 결과 우선 사용 |

#### 주요 템플릿 Before/After (영어)

| 이벤트 | Before | After |
|--------|--------|-------|
| TX_CONFIRMED | `Transaction {txId} confirmed. Amount: {amount}, To: {to} {display_amount}` | `{amount} sent to {to} on {network} {amountUsd}` |
| TX_FAILED | `Transaction {txId} failed: {error} {display_amount}` | `Failed: {amount} to {to} — {error}` |
| TX_QUEUED | `Send: {amount} {amountUsd}\nTo: {to}\nDelay: {delaySeconds}s before auto-execution` | `{amount} to {to} — executing in {delaySeconds}s {amountUsd}` |
| TX_APPROVAL_REQUIRED | `Transaction {txId} requires owner approval. Amount: {amount} to {to} {display_amount}` | `Approval needed: {amount} to {to} {amountUsd}` |
| TX_CANCELLED | `Transaction {txId} cancelled` | `Transaction cancelled: {amount} to {to}` |
| TX_INCOMING | `{walletName} received {amount} from {fromAddress} on {chain} {display_amount}` | `Received {amount} from {fromAddress} on {network} {amountUsd}` |
| BRIDGE_COMPLETED | `Cross-chain transfer completed. {tool} bridge from chain {fromChainId} to chain {toChainId}. Destination tx: {destTxHash}` | `Bridge complete: {fromNetwork} → {toNetwork} via {tool}` |
| LOW_BALANCE | `{walletName} balance low: {balance} {currency}. Threshold: {threshold} {currency}. Please top up.` | `Low balance: {balance} {currency} (threshold {threshold}) — top up recommended` |

#### 주요 템플릿 Before/After (한국어)

| 이벤트 | Before | After |
|--------|--------|-------|
| TX_CONFIRMED | `거래 {txId}가 확인되었습니다. 금액: {amount}, 수신: {to} {display_amount}` | `{to}로 {amount} 전송 완료 · {network} {amountUsd}` |
| TX_FAILED | `거래 {txId} 실패: {error} {display_amount}` | `전송 실패: {to}로 {amount} — {error}` |
| TX_QUEUED | `전송: {amount} {amountUsd}\n수신: {to}\n대기: {delaySeconds}초 후 자동 실행` | `{to}로 {amount} — {delaySeconds}초 후 실행 {amountUsd}` |
| TX_APPROVAL_REQUIRED | `거래 {txId}에 Owner 승인이 필요합니다. 금액: {amount}, 수신: {to} {display_amount}` | `승인 필요: {to}로 {amount} {amountUsd}` |
| TX_INCOMING | `{walletName}이(가) {chain}에서 {fromAddress}로부터 {amount}을(를) 수신했습니다 {display_amount}` | `{fromAddress}로부터 {amount} 수신 · {network} {amountUsd}` |
| BRIDGE_COMPLETED | `크로스체인 전송이 완료되었습니다. {tool} 브릿지 (체인 {fromChainId} -> 체인 {toChainId}). 도착 트랜잭션: {destTxHash}` | `브릿지 완료: {fromNetwork} → {toNetwork} · {tool}` |

※ 64개 전체 템플릿은 구현 단계에서 플랜에 상세화한다.

### 3. 서명 요청 displayMessage 개선 (C)

SignRequestBuilder의 `buildDisplayMessage()` 개편:

| Before | After (EN) | After (KO) |
|--------|-----------|-----------|
| `TRANSFER 1.5 ETH from 0x123456... to 0xabcdef...` | `Send 1.5 ETH to 0xabcd…ef01` | `0xabcd…ef01로 1.5 ETH 전송` |
| `TOKEN_TRANSFER 100 USDC from 0x123456... to 0xabcdef...` | `Send 100 USDC to 0xabcd…ef01` | `0xabcd…ef01로 100 USDC 전송` |
| `CONTRACT_CALL from 0x123456... to 0xabcdef...` | `Call Uniswap V3 Router` (또는 `Call 0xabcd…ef01`) | `Uniswap V3 Router 호출` |
| `APPROVE from 0x123456... to 0xabcdef...` | `Approve USDC for Uniswap V3 Router` | `Uniswap V3 Router에 USDC 승인` |

변경점:
- 내부 enum 이름(`TRANSFER`) → 사람 동사(`Send`/`전송`)
- `from` 주소 제거 (본인 지갑은 자명)
- Contract Name Resolution 활용 (v32.0의 `ContractNameService` 조회)
- 로케일 대응 (`signing_sdk.locale` 또는 `notifications.locale` 참조)

### 4. 텔레그램 서명 요청 구조 개선 (D)

TelegramSigningChannel의 메시지 포맷 개편:

**Before:**
```
*WAIaaS Sign Request*

TRANSFER 1.5 ETH from 0x123456... to 0xabcdef...
TX: `01935a3b...`
Chain: eip155:1 (ethereum-mainnet)

[Open in Wallet]
```

**After:**
```
*서명 요청*

0xabcd…ef01로 1.5 ETH 전송
네트워크: Ethereum

[지갑에서 서명하기]
```

변경점:
- TX ID 줄 제거 (UUID는 사용자 무의미)
- CAIP-2 체인 ID 제거
- 네트워크 표시명 사용
- 로케일 대응 (헤더, 버튼 텍스트)

### 5. 네트워크 이름 사람 친화적 매핑 (H)

`format-utils.ts`에 `humanNetworkName(networkId: string): string` 함수 추가:

```typescript
const NETWORK_DISPLAY_NAMES: Record<string, string> = {
  'ethereum-mainnet': 'Ethereum',
  'ethereum-sepolia': 'Ethereum Sepolia',
  'optimism-mainnet': 'Optimism',
  'arbitrum-mainnet': 'Arbitrum',
  'base-mainnet': 'Base',
  'polygon-mainnet': 'Polygon',
  'solana-mainnet': 'Solana',
  'solana-devnet': 'Solana Devnet',
  'xrpl-mainnet': 'XRPL',
  // ... 기타 지원 네트워크
};
```

- 매핑 미존재 시 원본 networkId를 Title Case로 변환 (fallback)
- 모든 알림 템플릿과 서명 요청에서 이 함수를 경유

### 6. Contract Name Resolution 알림 활용 (I)

v32.0에서 구현된 `ContractNameService`를 알림 파이프라인에 연결:

- `message-templates.ts`의 변수 해석 단계에서 `to` 주소를 `ContractNameService.resolve()` 시도
- 성공 시: `→ Uniswap V3 Router`
- 실패 시: 기존 축약 주소 `→ 0xabcd…ef01`
- 비동기 조회 비용: 캐시된 결과 사용 (ContractNameService는 24h TTL 캐시 보유)

### 7. 수신 트랜잭션 알림 개선 (J)

TX_INCOMING과 TX_INCOMING_SUSPICIOUS의 톤과 정보량 분리:

**일반 수신:**
```
EN: "Received 0.5 ETH ($1,234) from 0xdef4…56ab · Ethereum"
KO: "0xdef4…56ab로부터 0.5 ETH ($1,234) 수신 · Ethereum"
```

**의심 수신:**
```
EN: "⚠ Suspicious: 0.001 ETH from 0xdef4…56ab — Dust attack detected"
KO: "⚠ 의심 거래: 0xdef4…56ab로부터 0.001 ETH — 더스트 공격 감지"
```

변경점:
- USD 환산 금액 추가 (`amountUsd` 변수 활용)
- 의심 거래는 `reasons`을 사람 친화적 사유로 변환 (DUST → "더스트 공격 감지", UNKNOWN_TOKEN → "미확인 토큰", LARGE_AMOUNT → "비정상 대량 입금")
- 네트워크 표시명 사용

### 8. 한/영 일관성 정리 (L)

발견된 불일치 수정:

| 이벤트 | 수정 내용 |
|--------|----------|
| KILL_SWITCH_RECOVERED | KO "해제" → "복구" (EN "Recovered"와 일치) |
| TX_DOWNGRADED_DELAY | KO "이동" → "대기열로 격하" (EN "downgraded"와 일치) |
| MATURITY_WARNING | KO에 "손실 방지를 위해" 문구 추가 (EN "to avoid losses"와 일치) |
| REPUTATION_THRESHOLD | KO 어순 재구성 — 자연스러운 한국어로 |
| 열거형 주석 | notification.ts 주석 "30 total" → 실제 수로 업데이트 |

---

## 파일/모듈 구조

```
packages/core/src/
  i18n/
    en.ts                    # 영어 메시지 템플릿 전면 개편
    ko.ts                    # 한국어 메시지 템플릿 전면 개편
  enums/
    notification.ts          # 주석 업데이트, QUIET_EVENTS export
  
packages/daemon/src/
  notifications/
    notification-service.ts  # Quiet Event 로직, quiet_events 설정 연동
    templates/
      message-templates.ts   # Contract Name Resolution 연동, 네트워크 매핑 연동
    channels/
      format-utils.ts        # humanNetworkName(), humanSafetyReason() 추가
  services/signing-sdk/
    sign-request-builder.ts  # displayMessage 개편, 로케일 대응
    channels/
      telegram-signing-channel.ts  # 메시지 구조 개편
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | Quiet 이벤트 구현 위치 | NotificationService.notify() 초입 | 모든 채널(Telegram, Push Relay, WalletApp)에 동일 적용. notification_logs에 quiet 상태로 기록하여 감사 추적 유지 |
| 2 | Contract Name 조회 타이밍 | message-templates.ts 변수 해석 단계 | 템플릿 치환 전에 to 주소를 이름으로 교체. 캐시 히트 시 동기적, 미스 시 원본 주소 사용 (알림 지연 방지) |
| 3 | displayMessage 로케일 | notifications.locale 설정 참조 | 서명 요청은 Owner가 읽는 것이므로 Owner 선호 로케일 사용. 미설정 시 EN 기본값 |
| 4 | Push Relay payload 호환성 | 필드 구조 불변, 값만 변경 | `title`, `body`, `displayMessage` 필드의 문자열 값만 변경. D'CENT 앱은 이 값을 표시만 하므로 하위호환 문제 없음 |
| 5 | Quiet 목록 커스터마이즈 | Admin Settings `notifications.quiet_events` | 기본 quiet 목록 제공 + 사용자가 override 가능. 예: 디버깅 시 TX_SUBMITTED를 quiet에서 제거 |
| 6 | humanNetworkName 관리 | format-utils.ts 하드코딩 + fallback | 새 네트워크 추가 시 매핑만 추가하면 됨. 미등록 네트워크는 Title Case 변환으로 graceful fallback |

---

## E2E 검증 시나리오

**자동화 비율: 90%+ — `[HUMAN]` 2건, `[L1]` 12건**

### 알림 통합

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | ALLOW 티어 전송 → 알림 1개 | 전송 실행 → notification_logs에 TX_CONFIRMED만 sent, TX_REQUESTED/TX_SUBMITTED는 quiet assert | [L1] |
| 2 | DELAY 티어 전송 → 알림 2개 | 전송 실행 → TX_QUEUED + TX_CONFIRMED만 sent assert | [L1] |
| 3 | APPROVAL 티어 → 알림 2개 | 전송 실행 → TX_APPROVAL_REQUIRED + TX_CONFIRMED만 sent assert | [L1] |
| 4 | Bridge 완료 → 알림 1개 | 브릿지 완료 → BRIDGE_COMPLETED만 sent, BRIDGE_MONITORING_STARTED는 quiet assert | [L1] |
| 5 | Quiet 커스터마이즈 | Admin Settings에서 TX_SUBMITTED를 quiet에서 제거 → TX_SUBMITTED도 sent assert | [L1] |

### 메시지 품질

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 6 | TX_CONFIRMED 메시지에 txId 없음 | notification_logs.message에 UUID 패턴 미포함 assert | [L1] |
| 7 | 금액 중복 없음 | TX_CONFIRMED body에 amount가 1회만 등장 assert | [L1] |
| 8 | 네트워크 표시명 | `ethereum-mainnet` → `Ethereum`으로 치환 assert | [L1] |
| 9 | Contract Name 활용 | Uniswap Router 주소로 전송 시 body에 "Uniswap" 포함 assert | [L1] |
| 10 | 수신 TX USD 표시 | TX_INCOMING body에 amountUsd 포함 assert | [L1] |
| 11 | 의심 TX 톤 분리 | TX_INCOMING_SUSPICIOUS body에 ⚠ + 사람 친화적 사유 포함 assert | [L1] |

### 서명 요청

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 12 | displayMessage에 from 없음 | Push Relay payload.displayMessage에 from 주소 미포함 assert | [L1] |
| 13 | 텔레그램 메시지 간결성 | Telegram 메시지에 CAIP-2 ID 미포함, 네트워크 표시명 포함 assert | [L1] |

### 사용자 경험

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 14 | 실제 D'CENT 앱 알림 확인 | 전송 실행 → D'CENT 앱에 수신된 알림이 간결하고 이해 가능한지 확인 | [HUMAN] |
| 15 | 텔레그램 서명 요청 UX | APPROVAL 트랜잭션 → 텔레그램 메시지가 한 눈에 파악 가능한지 확인 | [HUMAN] |

---

## 하위호환성

| 항목 | 영향 | 대응 |
|------|------|------|
| Push Relay payload 필드 구조 | **변경 없음** | title, body, displayMessage 등 기존 필드의 문자열 값만 변경 |
| D'CENT 앱 | **영향 없음** | D'CENT는 title/body를 그대로 표시. 값이 더 간결해지므로 UX 개선 |
| notification_logs | **quiet 상태 추가** | status 컬럼에 'quiet' 값 추가. 기존 'sent'/'failed' 쿼리에 영향 없음 |
| Admin UI 알림 로그 | **quiet 필터 추가 필요** | 알림 로그 페이지에 quiet 상태 필터 표시 |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| ContractNameService (v32.0) | 알림 내 컨트랙트 이름 표시 |
| format-utils.ts | 기존 주소 축약 함수 확장 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | Quiet 목록이 너무 공격적 | 사용자가 중요 알림을 놓칠 수 있음 | 기본 quiet 목록을 보수적으로 설정 + Admin Settings 커스터마이즈 가능 |
| 2 | Contract Name 캐시 미스 | 첫 호출 시 비동기 조회 지연 → 알림에 주소만 표시 | 캐시 미스 시 축약 주소 사용 (graceful fallback). 다음 알림부터 이름 표시 |
| 3 | 기존 알림 기반 자동화 스크립트 | notification_logs 쿼리나 외부 웹훅에서 기존 메시지 패턴 의존 | eventType은 변경하지 않으므로 이벤트 기반 자동화는 영향 없음. 메시지 본문 파싱 의존 시 주의 필요 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 4~5개 (설계 1 / Quiet Event + 템플릿 1 / displayMessage + 텔레그램 1 / 네트워크 매핑 + Contract Name 1 / 한영 일관성 1) |
| 수정 파일 | 10~15개 |
| 신규 테스트 | 30~50개 |

---

*생성일: 2026-04-01*
*선행: 없음 (독립 실행 가능)*
