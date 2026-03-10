# 286 — E2E Admin UI 정적 파일 미빌드로 root path 404

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v31.8
- **발견일:** 2026-03-09
- **발견 경로:** 로컬 E2E 오프체인 스모크 테스트
- **상태:** FIXED
- **수정일:** 2026-03-09

## 증상

`interface-admin-mcp-sdk.e2e.test.ts` > `admin-ui-settings` > `serves Admin UI at root path` 테스트 실패.

```
AssertionError: expected 404 to be 200 // Object.is equality
```

`fetch(daemon.baseUrl)` 호출 시 Admin UI HTML이 아닌 404 반환.

## 원인

E2E 테스트 빌드 시 `pnpm turbo run build --filter=@waiaas/e2e-tests`만 실행하면 `@waiaas/admin` 패키지가 빌드되지 않음. `@waiaas/daemon`의 prebuild 스크립트(`cp -r ../admin/dist/* public/admin/`)가 admin dist 없이 실행되어 정적 파일이 비어있음.

E2E 테스트가 데몬을 fork하여 실행하므로 Admin UI 정적 파일이 `packages/daemon/public/admin/`에 존재해야 하지만, admin 빌드 의존성이 e2e-tests turbo 그래프에 포함되지 않음.

## 수정 방안

1. `packages/e2e-tests/package.json`에 `@waiaas/admin`을 devDependencies로 추가하여 turbo 빌드 그래프에 포함
2. 또는 `turbo.json`에서 `@waiaas/e2e-tests#build`가 `@waiaas/admin#build`에 의존하도록 설정
3. 또는 테스트에서 Admin UI 미빌드 시 graceful skip 처리

## 영향 범위

- `packages/e2e-tests/package.json` — 빌드 의존성 추가
- 또는 `turbo.json` — 빌드 그래프 수정

## 테스트 항목

1. `pnpm turbo run build --filter=@waiaas/e2e-tests` 후 `packages/daemon/public/admin/index.html` 존재 확인
2. E2E `serves Admin UI at root path` 테스트 통과 확인
