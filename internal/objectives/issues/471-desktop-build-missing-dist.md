# 471: Desktop 빌드 CI에서 workspace 패키지 dist 누락

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** —
- **상태:** FIXED

## 증상

릴리스 파이프라인의 `trigger-desktop / build-tauri` job이 4개 플랫폼 전부 실패. SEA 바이너리 빌드(esbuild) 시 `@waiaas/daemon`, `@waiaas/core` 모듈의 `dist/index.js`를 찾지 못한다.

```
✘ [ERROR] Could not resolve "@waiaas/daemon"
  The module "./dist/index.js" was not found on the file system
```

## 원인

`desktop-release.yml`의 `build-tauri` job이 `pnpm install --frozen-lockfile`만 실행하고 workspace 패키지 빌드(`pnpm turbo run build`)를 하지 않는다. workspace 패키지들의 `dist/` 폴더가 생성되지 않아 esbuild가 resolve에 실패한다.

## 해결 방안

`desktop-release.yml`의 `build-tauri` job에 `pnpm install` 후 `pnpm turbo run build` 스텝을 추가한다. 또는 SEA 빌드 스크립트(`build-sea-ci.sh`)에서 필요한 패키지만 빌드하도록 변경한다.

## 수정 범위

- `.github/workflows/desktop-release.yml`: `Install dependencies` 스텝 후에 `Build workspace packages` 스텝 추가

## 테스트 항목

- [ ] desktop-release.yml workflow_dispatch로 빌드 트리거하여 4 플랫폼 모두 성공하는지 확인
- [ ] SEA 바이너리가 `@waiaas/daemon`, `@waiaas/core` import를 정상 resolve하는지 확인
- [ ] 빌드된 Tauri 앱이 sidecar 시작 가능한지 확인
