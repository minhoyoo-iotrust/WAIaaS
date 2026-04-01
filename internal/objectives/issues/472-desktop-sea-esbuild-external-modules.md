# 472: Desktop SEA 빌드 esbuild 외부 모듈 resolve 실패

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** —
- **상태:** FIXED

## 증상

릴리스 파이프라인의 `trigger-desktop / build-tauri` job이 4 플랫폼 전부 실패. SEA 바이너리 esbuild 번들링 시 `@solana/web3.js`, `buffer-layout` 등 네이티브/플랫폼 모듈 561개 resolve 에러.

```
X [ERROR] Could not resolve "@solana/web3.js"
esbuild bundle failed: Build failed with 561 errors
```

## 원인

#471 수정으로 `pnpm turbo run build`가 추가되어 모든 workspace 패키지의 `dist/`가 생성됨. 이로 인해 esbuild가 Solana adapter 등의 코드를 resolve하게 되었으나, `@solana/web3.js` 등 네이티브 모듈은 CJS 번들에 포함 불가.

SEA 빌드 스크립트(`apps/desktop/scripts/build-sea-ci.sh`)의 esbuild 설정에서 네이티브/플랫폼 의존 모듈이 `--external`로 지정되지 않음.

## 해결 방안

1. SEA 빌드 스크립트에서 네이티브 모듈을 `--external`로 지정
2. 또는 빌드 범위를 CLI에 필요한 패키지만으로 제한 (`pnpm turbo run build --filter=@waiaas/cli...`)

## 테스트 항목

- [ ] `gh workflow run desktop-release.yml --ref <branch>` 로 4 플랫폼 빌드 성공 확인
- [ ] SEA 바이너리가 daemon 시작 가능한지 확인
