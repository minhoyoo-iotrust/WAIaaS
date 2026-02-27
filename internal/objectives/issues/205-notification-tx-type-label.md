# #205 — 알림 메시지에서 트랜잭션 타입 구분 불가

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v29.2
- **상태:** FIXED

## 현상

텔레그램 등 알림 채널에서 `TX_REQUESTED` 이벤트 메시지가 트랜잭션 타입(TRANSFER, CONTRACT_CALL, TOKEN_TRANSFER, APPROVE 등)을 구분하지 않고 모두 동일하게 "전송을 요청했습니다"로 표시된다.

예: LI.FI 컨트랙트 호출(CONTRACT_CALL)이 일반 전송(TRANSFER)과 동일하게 보임.

```
거래 요청

evm-mainnet이(가) 0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE로 0 전송을 요청했습니다
```

## 원인 분석

1. `stages.ts:339-344`에서 `TX_REQUESTED` 알림 발송 시 `type: txType`을 변수로 전달하고 있음
2. 하지만 i18n 템플릿에서 `{type}` 플레이스홀더를 사용하지 않음:
   - **ko.ts:127**: `'{walletName}이(가) {to}로 {amount} 전송을 요청했습니다 {display_amount}'`
   - **en.ts:181**: `'{walletName} requested {amount} transfer to {to} {display_amount}'`
3. 모든 트랜잭션 타입이 "전송" / "transfer"로 고정 출력됨

## 수정 방안

### 1. `message-templates.ts`에 타입 라벨 매핑 추가

`TX_TYPE_LABELS` 매핑을 locale별로 정의하여, 알림 변수 `{type}`이 사람 친화적 라벨로 치환되도록 한다.

| Raw Type | 한국어 | English |
|----------|--------|---------|
| TRANSFER | 전송 | transfer |
| TOKEN_TRANSFER | 토큰 전송 | token transfer |
| CONTRACT_CALL | 컨트랙트 호출 | contract call |
| APPROVE | 토큰 승인 | approval |
| BATCH | 배치 전송 | batch |
| SIGN | 서명 | signing |
| X402_PAYMENT | x402 결제 | x402 payment |

### 2. i18n 템플릿 수정

`TX_REQUESTED` 템플릿에 `{type}` 플레이스홀더를 포함:

- **ko**: `'{walletName}이(가) {to}로 {amount} {type}을(를) 요청했습니다 {display_amount}'`
- **en**: `'{walletName} requested {type}: {amount} to {to} {display_amount}'`

### 3. `getNotificationMessage()`에서 type 변수 자동 변환

`vars.type`이 존재할 때 locale에 맞는 라벨로 치환 후 템플릿에 적용.

## 영향 범위

- `packages/daemon/src/notifications/templates/message-templates.ts` — 타입 라벨 매핑 + 변환 로직
- `packages/core/src/i18n/ko.ts` — TX_REQUESTED 템플릿 수정
- `packages/core/src/i18n/en.ts` — TX_REQUESTED 템플릿 수정
- 기존 테스트 텍스트 매칭 업데이트 필요

## 테스트 항목

1. `getNotificationMessage('TX_REQUESTED', 'ko', { type: 'CONTRACT_CALL', ... })`이 "컨트랙트 호출"을 포함하는지 확인
2. `getNotificationMessage('TX_REQUESTED', 'en', { type: 'TOKEN_TRANSFER', ... })`이 "token transfer"를 포함하는지 확인
3. 알 수 없는 타입(e.g., 'UNKNOWN')이 전달되면 원본 문자열 그대로 출력되는지 확인
4. `type` 변수가 없는 기존 알림 이벤트(TX_CONFIRMED 등)에 부작용이 없는지 확인
5. sign-only 파이프라인(`type: 'SIGN'`)에서 "서명"으로 표시되는지 확인
