# 448 — DELAY TX_QUEUED 알림에 트랜잭션 상세 정보가 부족함

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **등록일:** 2026-03-24
- **수정일:** 2026-03-24

## 현상

DELAY 티어 TX_QUEUED 텔레그램 알림에 트랜잭션 상세 정보가 부족하여, 사용자가 Cancel 여부를 판단하기 어렵다.

### 현재 메시지

```
거래 대기열 등록

거래 019d1f9f-9e94-7fa1-8b9b-754f0280de6e가 처리 대기열에
등록되었습니다

notify-test-wallet (019cad...d4f7)
0x74...4CcB · ethereum
2026-03-24T11:34:08.000Z

  [ Cancel 019d1f9f ]
```

부족한 정보:
- 트랜잭션 타입 (TRANSFER, TOKEN_TRANSFER 등)
- 금액 및 토큰 심볼 (0.00125 ETH)
- USD 환산 금액 (~$2.50)
- 수신 주소
- 딜레이 시간 (60초 후 자동 실행)

### 개선된 메시지 (안)

```
거래 대기열 등록

전송: 0.00125 ETH (~$2.50)
수신: 0x0000...dEaD
네트워크: ethereum-sepolia
대기: 60초 후 자동 실행

notify-test-wallet (019cad...d4f7)
0x74...4CcB · ethereum
2026-03-24T11:34:08.000Z

  [ 취소 ]
```

## 수정 방안

### 1. stage4-wait.ts에서 추가 정보 전달

현재 `notificationService.notify('TX_QUEUED', ...)` 호출 시 `txId`, `amount`, `to`, `delaySeconds`를 이미 전달하고 있다:

```typescript
void ctx.notificationService?.notify('TX_QUEUED', ctx.walletId, {
  txId: ctx.txId,
  amount: formatNotificationAmount(ctx.request, ctx.wallet.chain),
  to: getRequestTo(ctx.request),
  delaySeconds: String(delaySeconds),
}, ...);
```

이 데이터를 메시지 템플릿에 반영하면 된다.

### 2. i18n 메시지 템플릿 개선

`ko.ts` / `en.ts`의 TX_QUEUED 메시지 템플릿을 확장하여 금액, 수신 주소, 딜레이 시간을 포함한다.

### 3. USD 환산 금액 추가

stage4 시점에서 정책 평가 결과의 USD 환산 금액(`amountUsd`)을 notify 데이터에 포함한다. 정책 엔진이 이미 USD 변환을 수행하므로 추가 API 호출 없이 가능.

## 영향

- DELAY 티어뿐 아니라 APPROVAL 티어의 TX_APPROVAL_REQUIRED 알림에도 동일한 개선 적용 가능
- 사용자가 Cancel/Approve/Reject 판단 시 충분한 정보를 제공

## 테스트 항목

### 수동 확인
- DELAY TX_QUEUED 알림에 금액, USD 환산, 수신 주소, 딜레이 시간이 표시되는지
- 다양한 TX 타입(TRANSFER, TOKEN_TRANSFER)에서 정보가 올바르게 표시되는지
- locale `ko` / `en`에서 메시지가 자연스러운지
