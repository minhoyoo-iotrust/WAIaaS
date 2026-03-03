# 245 — Stage4에서 WcSigningBridge가 비WC 지갑에도 무조건 실행되어 거짓 채널 전환 알림 발송

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **발견일:** 2026-03-03

## 증상

D'CENT(approval_method=`sdk_ntfy`) 등 WalletConnect가 아닌 승인 채널을 사용하는 지갑에서 APPROVAL 트랜잭션 발생 시:
1. 거짓 `APPROVAL_CHANNEL_SWITCHED` 알림 발송 ("walletconnect에서 telegram으로 전환")
2. DB `pending_approvals.approval_channel`이 실제 채널과 관계없이 `telegram`으로 오염

## 원인

`stages.ts:782-804`에서 `wcSigningBridge.requestSignature()`와 `approvalChannelRouter.route()`가 **모두 무조건 fire-and-forget으로 동시 실행**됨.

```typescript
// stages.ts — 현재 (버그)
// v1.6.1: fire-and-forget WC signing request (non-blocking)
if (ctx.wcSigningBridge) {
  void ctx.wcSigningBridge.requestSignature(  // ← 모든 APPROVAL에 무조건 실행
    ctx.walletId, ctx.txId, ctx.wallet.chain,
  );
}

// v2.6.1: fire-and-forget SDK signing channel routing (non-blocking)
if (ctx.approvalChannelRouter) {
  void ctx.approvalChannelRouter.route(ctx.walletId, { ... });
}
```

D'CENT(`sdk_ntfy`) 지갑의 경우:
- `approvalChannelRouter.route()` → 올바르게 `sdk_ntfy` 채널로 라우팅
- `wcSigningBridge.requestSignature()` → WC 세션 없음 → `fallbackToTelegram()` 발동:
  - DB `approval_channel`을 `telegram`으로 덮어씀
  - 거짓 `approval:channel-switched` EventBus 이벤트 발행
  - 거짓 `APPROVAL_CHANNEL_SWITCHED` 알림 발송

## 수정 방법

`approvalChannelRouter`가 사용 가능할 때는 라우터 결과에 따라 `walletconnect`가 선택된 경우에만 `wcSigningBridge`를 호출하도록 조정:

```typescript
// stages.ts — 수정
if (ctx.approvalChannelRouter) {
  void (async () => {
    try {
      const result = await ctx.approvalChannelRouter!.route(ctx.walletId, { ... });
      // 라우터가 walletconnect를 선택한 경우에만 WC bridge 사용
      if (result.method === 'walletconnect' && ctx.wcSigningBridge) {
        void ctx.wcSigningBridge.requestSignature(
          ctx.walletId, ctx.txId, ctx.wallet.chain,
        );
      }
    } catch {
      // 채널 라우팅 에러는 non-fatal
    }
  })();
} else if (ctx.wcSigningBridge) {
  // 레거시: 라우터 미사용 시 직접 WC bridge 호출
  void ctx.wcSigningBridge.requestSignature(
    ctx.walletId, ctx.txId, ctx.wallet.chain,
  );
}
```

## 관련 파일

- `packages/daemon/src/pipeline/stages.ts:782-804` — stage4Wait APPROVAL 분기
- `packages/daemon/src/services/wc-signing-bridge.ts:429-460` — fallbackToTelegram
- `packages/daemon/src/services/signing-sdk/approval-channel-router.ts:76-140` — route()

## 참고

- v1.6.1에서 WcSigningBridge 도입 (유일한 승인 채널), v2.6.1에서 ApprovalChannelRouter 추가 시 기존 WcSigningBridge 호출 코드를 조건부로 변경하지 않아 발생
- #244 (`{txId}` 미치환)와 동일 지점에서 발견

## 테스트 항목

- [ ] D'CENT(`sdk_ntfy`) 지갑 APPROVAL 트랜잭션 시 `APPROVAL_CHANNEL_SWITCHED` 알림 미발송 확인
- [ ] D'CENT 지갑 APPROVAL 시 DB `approval_channel`이 `telegram`으로 오염되지 않음 확인
- [ ] `walletconnect` 승인 방식 지갑은 기존과 동일하게 WC 요청 → 실패 시 Telegram 폴백 동작 확인
- [ ] `approvalChannelRouter` 미사용(레거시) 환경에서 기존 WcSigningBridge 단독 동작 유지 확인
