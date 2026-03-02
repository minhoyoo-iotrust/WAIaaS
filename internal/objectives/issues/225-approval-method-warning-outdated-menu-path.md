# #225 Approval Method 경고 메시지가 이전 메뉴 경로 참조

- **유형:** BUG
- **심각도:** LOW
- **마일스톤:** —
- **상태:** OPEN

## 증상

Owner 지갑 Approval Method 경고 메시지가 v29.7에서 이동된 이전 메뉴 경로를 안내:

| 현재 메시지 | 실제 위치 |
|------------|----------|
| "Go to **System > Signing SDK** settings." | Wallets > Human Wallet Apps (v29.7에서 이동) |
| "Check **System > Signing SDK** and **Notifications > Telegram** settings." | Wallets > Human Wallet Apps + Notifications > Settings > Telegram |

## 수정 방안

`wallets.tsx` APPROVAL_OPTIONS의 warning 메시지 업데이트:

```typescript
// sdk_ntfy
warning: 'Signing SDK is not enabled. Go to Wallets > Human Wallet Apps settings.',

// sdk_telegram
warning: 'Signing SDK or Telegram bot is not configured. Check Wallets > Human Wallet Apps and Notifications > Settings > Telegram.',
```

## 수정 대상

- `packages/admin/src/pages/wallets.tsx` (lines 229, 236)

## 테스트 항목

- [ ] sdk_ntfy 경고 메시지에 올바른 메뉴 경로 표시 확인
- [ ] sdk_telegram 경고 메시지에 올바른 메뉴 경로 표시 확인
