# #371 — Kamino Lending SDK 미설치로 전체 기능 사용 불가

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** —
- **상태:** OPEN

## 설명

Kamino Lending 액션 실행 시 `@kamino-finance/klend-sdk`와 `@solana/web3.js` 의존성이 설치되지 않아 `ACTION_RESOLVE_FAILED` 에러가 발생한다. Kamino supply/borrow/repay/withdraw 전체 기능이 사용 불가.

## 에러 메시지

```
ACTION_RESOLVE_FAILED: Kamino K-Lend SDK not available. Install @kamino-finance/klend-sdk and @solana/web3.js as dependencies.
```

## 영향 범위

- defi-08 (Kamino Lending UAT) 실행 불가
- MCP `action_kamino_*` 도구 전체 차단

## 테스트 항목

- [ ] Kamino supply dryRun 성공 확인
- [ ] Kamino supply 실제 실행 및 CONFIRMED 확인
