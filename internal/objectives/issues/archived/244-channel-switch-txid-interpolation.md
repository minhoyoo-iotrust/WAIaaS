# 244 — APPROVAL_CHANNEL_SWITCHED 알림 {txId} 미치환

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-03-03

## 증상

`APPROVAL_CHANNEL_SWITCHED` 알림에서 `{txId}` 템플릿 변수가 실제 트랜잭션 ID로 치환되지 않고 리터럴 문자열 그대로 표시됨.

```
거래 {txId}의 승인 채널이 walletconnect에서 telegram(으)로 전환되었습니다. 사유: no_wc_session
```

## 원인

`wc-signing-bridge.ts:452-457`에서 `notify()` 호출 시 `txId`를 `vars`(3번째 인자, 템플릿 치환 대상)가 아닌 `details`(4번째 인자, 메타데이터용)에 전달.

```typescript
// 현재 (버그)
void this.notificationService?.notify(
  'APPROVAL_CHANNEL_SWITCHED',
  walletId,
  { from_channel: 'walletconnect', to_channel: 'telegram', reason },  // vars
  { txId },  // details — 템플릿 치환에 사용되지 않음
);
```

## 수정 방법

`txId`를 `vars` 객체에 포함:

```typescript
// 수정
void this.notificationService?.notify(
  'APPROVAL_CHANNEL_SWITCHED',
  walletId,
  { from_channel: 'walletconnect', to_channel: 'telegram', reason, txId },
);
```

## 관련 파일

- `packages/daemon/src/services/wc-signing-bridge.ts:452-457` — notify 호출
- `packages/core/src/i18n/ko.ts:159` — 템플릿: `거래 {txId}의 승인 채널이...`
- `packages/daemon/src/notifications/templates/message-templates.ts:52-56` — 치환 로직

## 참고

- #148, #163에서 동일 패턴({txId} 미치환)이 수정된 이력 있음. 이 곳은 당시 누락.

## 테스트 항목

- [ ] APPROVAL_CHANNEL_SWITCHED 알림 발송 시 `{txId}`가 실제 트랜잭션 ID로 치환 확인
- [ ] 기존 wc-signing-bridge 테스트에서 notify 호출 인자 검증 추가
