---
phase: 147-qr-pairing
plan: 02
subsystem: admin-cli
tags: [walletconnect, qrcode, admin-ui, cli, modal, polling, session-management]

# Dependency graph
requires:
  - phase: 147-qr-pairing
    plan: 01
    provides: "REST API 4개 엔드포인트 (pair, session, pair/status, disconnect)"
provides:
  - "Admin UI WalletConnect 섹션 -- QR 모달 + 세션 정보 표시 + Disconnect 버튼"
  - "Admin UI QR 모달 3초 폴링 자동 갱신 -- 세션 성립 시 자동 닫힘"
  - "CLI owner connect -- 터미널 QR 코드 출력 + --poll 세션 대기"
  - "CLI owner disconnect -- WC 세션 해제"
  - "CLI owner status -- WC 세션 정보 표시"
  - "endpoints.ts WC 엔드포인트 상수 (WALLET_WC_PAIR, WALLET_WC_SESSION, WALLET_WC_PAIR_STATUS)"
affects:
  - "packages/admin/src/pages/wallets.tsx"
  - "packages/admin/src/api/endpoints.ts"
  - "packages/cli/src/index.ts"

# Tech stack
added:
  - "qrcode ^1.5.4 (CLI 터미널 QR 출력)"
  - "@types/qrcode ^1.5.6 (타입 정의)"
patterns:
  - "Admin UI: useSignal + setInterval 폴링 패턴"
  - "CLI: wallet.ts와 동일한 daemonRequest + selectWallet 독립 구현"

# Key files
created:
  - packages/cli/src/commands/owner.ts
modified:
  - packages/admin/src/pages/wallets.tsx
  - packages/admin/src/api/endpoints.ts
  - packages/cli/src/index.ts
  - packages/cli/package.json
  - pnpm-lock.yaml

# Decisions
key-decisions:
  - "owner.ts에 daemonRequest/selectWallet 자체 구현 (wallet.ts에서 export하지 않으므로 독립성 유지)"
  - "QR 모달에 onConfirm 미전달 -- Modal 컴포넌트가 Confirm 버튼 자동 숨김"
  - "pollRef를 useSignal로 관리 (cleanup useEffect에서 clearInterval)"

# Metrics
duration: 5min
completed: 2026-02-16
tasks: 2/2
files-changed: 6
lines-added: 448
tests-passed: 1569/1569
---

# Phase 147 Plan 02: Admin UI QR 모달 + CLI Owner 명령어 Summary

Admin UI 월렛 상세 페이지에 WC QR 모달/세션 관리 섹션 추가 + CLI owner connect/disconnect/status 명령어 (qrcode 터미널 출력, 3초 폴링)

## What was built

### Admin UI (Task 1)

**endpoints.ts**: `WALLET_WC_PAIR`, `WALLET_WC_SESSION`, `WALLET_WC_PAIR_STATUS` 엔드포인트 상수 추가.

**wallets.tsx WalletDetailView** WalletConnect 섹션:
- 세션 없을 때: "Connect Wallet" 버튼 + 설명 텍스트
- 세션 있을 때: Status(Connected badge), Peer, Owner Address(copy), Chain ID, Expiry + Disconnect 버튼
- QR 모달: base64 data URL 이미지 (280x280), 3초 폴링으로 페어링 상태 자동 갱신
  - `connected` -> 모달 닫힘 + 세션 정보 갱신 + success toast
  - `expired`/`none` -> 모달 닫힘 + error toast
- 컴포넌트 unmount 시 polling cleanup

### CLI (Task 2)

**owner.ts** 신규 파일 (227줄):
- `ownerConnectCommand`: POST pair -> QRCode.toString(uri, terminal) -> 터미널 출력
  - `--poll` 옵션: 3초 간격 최대 100회(5분) pair/status 폴링, connected/expired 감지
- `ownerDisconnectCommand`: DELETE session -> 해제 메시지
- `ownerStatusCommand`: GET session -> peer/owner/chainId/expiry 출력 (404 -> "No active session")

**index.ts**: `owner` 서브커맨드 그룹 등록 (connect/disconnect/status)

**package.json**: `qrcode ^1.5.4` + `@types/qrcode ^1.5.6` 의존성 추가

## Commits

| # | Hash | Description |
|---|------|-------------|
| 1 | 7667967 | feat(147-02): Admin UI WalletConnect QR 모달 + 세션 관리 섹션 |
| 2 | bc5f9e0 | feat(147-02): CLI owner connect/disconnect/status 명령어 + qrcode 터미널 출력 |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `pnpm build --filter=@waiaas/admin` -- PASS
- `pnpm build --filter=@waiaas/cli` -- PASS
- `pnpm build` full monorepo -- PASS
- `node packages/cli/dist/index.js owner --help` -- connect/disconnect/status 표시 확인
- `node packages/cli/dist/index.js owner connect --help` -- --poll 옵션 확인
- `pnpm test --filter=@waiaas/daemon` -- 95 files, 1569 tests PASS

## Self-Check: PASSED

All 5 files exist, all 2 commits verified, all 4 key content patterns found.
