# #206 알림 메시지에 트랜잭션 실제 네트워크 대신 지갑 기본 네트워크 표시

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v29.2
- **상태:** FIXED

## 현상

Base 네트워크에서 실행한 트랜잭션의 텔레그램 알림이 `ethereum-mainnet`으로 표시되고, 블록 익스플로러 링크가 etherscan.io로 생성됨. 실제로는 basescan.org 링크여야 함.

**텔레그램 알림 표시 내용:**
- 네트워크: `0x1E...A37f · ethereum-mainnet` (잘못됨 — `base-mainnet`이어야 함)
- 익스플로러: etherscan.io 링크 (잘못됨 — basescan.org이어야 함)

## 원인 분석

### 근본 원인

`NotificationService.notify()`가 트랜잭션의 실제 네트워크 대신 **지갑의 `defaultNetwork`**를 사용하여 explorer URL과 네트워크 표시를 생성.

### 상세 흐름

1. **파이프라인** (`stages.ts:1021`): `notify('TX_SUBMITTED', ctx.walletId, { txId, txHash, amount, to, display_amount })` 호출 — `network` 미전달
2. **NotificationService** (`notification-service.ts:111`): `lookupWallet(walletId)` 호출하여 지갑의 `defaultNetwork` 조회
3. **lookupWallet** (`notification-service.ts:293`): `row.defaultNetwork ?? row.chain` 반환 — EVM mainnet 지갑의 경우 `ethereum-mainnet`
4. **explorer URL** (`notification-service.ts:139-141`): `getExplorerTxUrl('ethereum-mainnet', txHash)` → etherscan.io 링크 생성
5. **payload.network** (`notification-service.ts:148`): `walletInfo.network` = `ethereum-mainnet`

### 핵심 문제

파이프라인 컨텍스트에 `ctx.resolvedNetwork` (실제 트랜잭션 네트워크, 예: `base-mainnet`)가 존재하지만, `notify()` 호출 시 vars에 전달되지 않음.

## 영향 범위

### 직접 영향

EVM mainnet 환경에서 기본 네트워크(ethereum-mainnet)가 아닌 L2 네트워크(base, arbitrum, optimism, polygon)로 트랜잭션 전송 시 **모든 TX 알림**에서 잘못된 네트워크와 explorer URL 표시.

### 영향받는 알림 이벤트

| 이벤트 | 파일 | 라인 |
|--------|------|------|
| TX_SUBMITTED | `pipeline/stages.ts` | 1021 |
| TX_CONFIRMED | `pipeline/stages.ts` | 1194 |
| TX_FAILED (on-chain revert) | `pipeline/stages.ts` | 1221 |
| TX_SUBMITTED (sign-only) | `pipeline/sign-only.ts` | 336 |

### 영향받지 않는 항목

- `eventBus.emit()` 호출은 이미 `ctx.resolvedNetwork`를 사용 중 (정상)
- DB 트랜잭션 레코드에는 올바른 `network` 저장됨

## 수정 방안

### 1단계: notify() 호출에 network 전달

**`stages.ts`** — TX_SUBMITTED, TX_CONFIRMED, TX_FAILED 알림에 `network: ctx.resolvedNetwork` 추가:

```typescript
// 예시: TX_SUBMITTED (line 1021)
void ctx.notificationService?.notify('TX_SUBMITTED', ctx.walletId, {
  txId: ctx.txId,
  txHash: ctx.submitResult.txHash,
  amount: reqAmount,
  to: reqTo,
  display_amount: displayAmount,
  network: ctx.resolvedNetwork,  // ← 추가
}, { txId: ctx.txId });
```

**`sign-only.ts`** — TX_SUBMITTED 알림에 `network: request.network ?? ''` 추가.

### 2단계: NotificationService에서 vars.network 우선 사용

**`notification-service.ts`** — `vars?.network`이 있으면 `walletInfo.network` 대신 사용:

```typescript
const effectiveNetwork = vars?.network || walletInfo.network;
const explorerUrl = (txHash && effectiveNetwork)
  ? getExplorerTxUrl(effectiveNetwork, txHash) ?? undefined
  : undefined;

const payload: NotificationPayload = {
  ...
  network: effectiveNetwork,
  ...
};
```

## 테스트 항목

1. **단위 테스트**: `notify()` 호출 시 `vars.network`가 전달되면 `walletInfo.network` 대신 사용하는지 검증
2. **단위 테스트**: Base mainnet 트랜잭션 알림에 basescan.org explorer URL 생성 검증
3. **단위 테스트**: `vars.network` 미전달 시 기존 동작(walletInfo.network fallback) 유지 검증
4. **통합 테스트**: EVM L2 네트워크(base-mainnet) 파이프라인 실행 → 알림에 올바른 네트워크/explorer URL 확인
