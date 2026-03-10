# #197 — Admin UI RPC 빌트인 URL 목록이 하드코딩 중복으로 동기화 깨짐

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** FIXED
- **마일스톤:** -
- **발견일:** 2026-02-26

## 현상

Admin UI Wallets 페이지에서 Polygon Amoy 테스트넷 RPC URL이 1개만 표시되지만, 데몬의 `BUILT_IN_RPC_DEFAULTS`에는 3개가 등록되어 있다. 기존에 1개였던 polygon-amoy에 2개의 URL을 추가했으나 Admin UI에는 반영되지 않았다.

## 원인

`BUILT_IN_RPC_DEFAULTS`(SSoT, `packages/core/src/rpc/built-in-defaults.ts`)와 Admin SPA의 `BUILT_IN_RPC_URLS`(`packages/admin/src/pages/wallets.tsx:1401-1415`)가 **별도 하드코딩으로 이중 관리**되고 있다. Admin SPA가 브라우저에서 실행되어 `@waiaas/core`를 직접 import할 수 없다는 이유로 URL 목록을 복사해 놓았으나, 데몬 측 변경 시 Admin 측 동기화가 누락되었다.

## 영향 범위

- Admin UI Wallets 페이지의 RPC Pool 섹션에서 빌트인 URL 표시 누락
- 향후 RPC URL이 추가/변경될 때마다 동기화 누락 위험 상존

## 해결 방안

**근본 수정: 데몬 API에서 빌트인 URL 정보를 제공하여 Admin SPA 하드코딩 제거**

1. 기존 `/v1/admin/rpc-status` API 응답에 `isBuiltin` 플래그 추가, 또는 별도 엔드포인트(`/v1/admin/rpc-defaults`)로 빌트인 URL 목록 제공
2. Admin SPA의 `BUILT_IN_RPC_URLS` 상수 제거, API 응답 기반으로 빌트인 여부 판별
3. `wallets.tsx`의 `buildUrlEntries()` 함수가 API에서 받은 빌트인 정보를 사용하도록 변경

## 관련 파일

| 파일 | 역할 |
|------|------|
| `packages/core/src/rpc/built-in-defaults.ts` | SSoT — 빌트인 RPC URL 정의 |
| `packages/admin/src/pages/wallets.tsx:1401-1415` | 제거 대상 — 하드코딩 사본 |
| `packages/daemon/src/api/routes/admin.ts` | API 수정 대상 — rpc-status 엔드포인트 |

## 테스트 항목

1. **단위 테스트**: `/v1/admin/rpc-status` 응답에 `isBuiltin` 플래그가 포함되는지 검증
2. **단위 테스트**: 빌트인 URL이 `BUILT_IN_RPC_DEFAULTS`의 모든 항목과 일치하는지 검증
3. **단위 테스트**: 사용자가 추가한 커스텀 URL은 `isBuiltin: false`로 반환되는지 검증
4. **Admin UI 테스트**: `BUILT_IN_RPC_URLS` 상수가 제거되고 API 기반으로 동작하는지 검증
5. **회귀 테스트**: polygon-amoy 포함 모든 네트워크의 빌트인 URL 개수가 정확히 표시되는지 검증
