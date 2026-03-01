---
phase: 293-human-wallet-apps-registry
plan: 03
status: complete
started: 2026-03-01
completed: 2026-03-01
---

## Summary

Created dedicated Human Wallet Apps admin page with app registry UI, ntfy server settings, and sidebar navigation.

## What was built

### Task 1: Admin UI endpoints
- Added ADMIN_WALLET_APPS and ADMIN_WALLET_APP(id) to endpoints.ts

### Task 2: Human Wallet Apps page
- Created human-wallet-apps.tsx with ntfy server URL setting, app cards with Signing/Alerts toggles, Register App modal, Remove button with confirm dialog
- App cards show display name, code name, toggle badges (ON/OFF), and "Used by" wallet links

### Task 3: Layout integration
- Added HumanWalletAppsPage import to layout.tsx
- Added '/wallet-apps' to NAV_ITEMS, PAGE_TITLES, PAGE_SUBTITLES
- Added route: `if (path === '/wallet-apps') return <HumanWalletAppsPage />`

### Task 4: System page cleanup
- Removed 'signing_sdk.' from SYSTEM_PREFIXES
- Removed SigningSDKSection component (~100 lines)
- ntfy server URL is now managed on the Human Wallet Apps page

## Key files

### Created
- `packages/admin/src/pages/human-wallet-apps.tsx` -- Page component

### Modified
- `packages/admin/src/api/endpoints.ts` -- API endpoint constants
- `packages/admin/src/components/layout.tsx` -- Sidebar + routing
- `packages/admin/src/pages/system.tsx` -- Removed Signing SDK section

## Verification
- TypeScript compiles with no new errors (pre-existing wallets.tsx errors confirmed unrelated)

## Self-Check: PASSED
