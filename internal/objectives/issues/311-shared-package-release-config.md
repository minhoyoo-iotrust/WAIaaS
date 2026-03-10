# #311 — @waiaas/shared 패키지 릴리스 설정 누락

- **유형:** MISSING
- **심각도:** HIGH
- **발견일:** 2026-03-10
- **마일스톤:** —
- **상태:** FIXED

## 증상

v2.10.0-rc.25 릴리스 파이프라인에서 2개 job 실패:
1. `publish-check` — smoke test에서 `npm install` 시 `@waiaas/shared@2.10.0-rc.24` 404
2. `platform` — Docker 컨테이너가 health check 미응답 (모듈 미해석으로 크래시 추정)

## 원인

`@waiaas/shared` 패키지가 릴리스 인프라에 미등록:
1. `release-please-config.json` extra-files에 `packages/shared/package.json` 누락
2. `scripts/smoke-test-published.sh` PACKAGES 배열에 `packages/shared` 누락
3. `.github/workflows/release.yml` 5곳의 PACKAGES 배열에 `packages/shared` 누락

## 수정 범위

| 파일 | 변경 |
|------|------|
| `release-please-config.json` | extra-files에 `packages/shared/package.json` 추가 |
| `scripts/smoke-test-published.sh` | PACKAGES 배열에 `packages/shared` 추가 + install 명령에 tarball 추가 |
| `.github/workflows/release.yml` | 5곳 PACKAGES 배열에 `packages/shared` 추가 |

## 선행 조치

- [x] `packages/shared/package.json`에서 `"private": true` 제거 (수동 완료)
- [x] `npm publish --access public`으로 초기 버전 발행 완료 (`2.10.0-rc.24`)

## 테스트 항목

- smoke test 스크립트가 @waiaas/shared를 pack + install하는지 확인
- release-please가 @waiaas/shared 버전을 자동 bump하는지 확인
- RC 릴리스 파이프라인 전체 통과 확인
