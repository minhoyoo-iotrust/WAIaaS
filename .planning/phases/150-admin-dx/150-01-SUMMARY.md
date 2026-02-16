---
phase: 150-admin-dx
plan: 01
subsystem: api/admin-ui
tags: [walletconnect, session-auth, admin-ui, rest-api]
dependency_graph:
  requires: [147-01, 147-02, 146-01]
  provides: [session-scoped-wc-endpoints, admin-wc-page]
  affects: [mcp, sdk, admin-ui]
tech_stack:
  added: []
  patterns: [session-scoped-endpoints, admin-dedicated-page]
key_files:
  created:
    - packages/admin/src/pages/walletconnect.tsx
  modified:
    - packages/daemon/src/api/routes/wc.ts
    - packages/daemon/src/api/server.ts
    - packages/admin/src/components/layout.tsx
decisions:
  - "wcSessionRoutes 별도 factory 함수로 분리 (wcRoutes masterAuth 함수 수정 안 함)"
  - "getWalletId 헬퍼 + lookupWallet 헬퍼로 session-scoped 핸들러 코드 중복 최소화"
  - "endpoints.ts 변경 불필요 -- 기존 WALLET_WC_PAIR/SESSION/PAIR_STATUS 상수 재사용"
  - "WalletConnect 네비게이션은 Telegram과 Settings 사이에 배치"
metrics:
  duration: 5min
  completed: 2026-02-16
---

# Phase 150 Plan 01: Session-scoped WC REST + Admin WalletConnect Page Summary

Session-scoped WC REST 4개 엔드포인트 + Admin UI 전용 WalletConnect 관리 페이지

## What Was Done

### Task 1: Session-scoped WC REST endpoints (/v1/wallet/wc/*)

wc.ts에 `wcSessionRoutes` factory 함수를 추가하여 4개 session-scoped 엔드포인트를 구현했다:

- `POST /v1/wallet/wc/pair` -- WC pairing 생성 + QR 코드
- `GET /v1/wallet/wc/session` -- 현재 WC 세션 정보 조회
- `DELETE /v1/wallet/wc/session` -- WC 세션 해제
- `GET /v1/wallet/wc/pair/status` -- pairing 상태 폴링

walletId는 URL 파라미터가 아닌 JWT payload에서 `c.get('walletId')`로 가져온다. 기존 masterAuth 엔드포인트(`/v1/wallets/:id/wc/*`)와 동일한 WcSessionService 메서드를 호출한다. server.ts에서 기존 `if (deps.db && deps.wcSessionService)` 블록 안에 sessionAuth 라우트를 함께 등록했다.

### Task 2: Admin UI WalletConnect 관리 페이지

`walletconnect.tsx` 전용 페이지를 생성하여 모든 월렛의 WC 세션을 테이블 형태로 한눈에 관리할 수 있게 했다:

- 테이블 컬럼: Wallet Name, Chain, WC Status (배지), Peer, Owner Address, Expiry, Actions
- Connect 버튼: `POST /v1/wallets/:id/wc/pair` 호출 -> QR 모달 표시 -> 3초 폴링
- Disconnect 버튼: `DELETE /v1/wallets/:id/wc/session` 호출 -> 세션 맵 즉시 갱신
- QR 모달: 280x280 base64 데이터 URL, connected/expired 시 자동 닫힘
- layout.tsx에 WalletConnect 네비게이션 항목 + PageRouter 라우트 추가

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `pnpm build` -- 8/8 packages build successfully
- `pnpm test --filter=@waiaas/daemon` -- 97 test files, 1611 tests pass
- Session-scoped endpoints visible in OpenAPI spec (`/doc`)
- Admin UI `/walletconnect` route registered in PageRouter
- Existing masterAuth WC endpoints unchanged

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 3cb2ae1 | session-scoped WC REST endpoints |
| 2 | 9381b42 | Admin UI WalletConnect 전용 관리 페이지 |

## Self-Check: PASSED

All files found, all commits verified.
