# 476 — Desktop RC 릴리스가 prerelease로 마킹되지 않음

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** —
- **상태:** FIXED

## 증상

다운로드 페이지(waiaas.ai/download)에서 RC 버전(v2.13.0-rc.5)이 스테이블처럼 표시되고 다운로드 링크가 걸려 있음. 사용자에게는 스테이블 버전만 제공해야 함.

## 원인

`.github/workflows/desktop-release.yml`에서 릴리스 생성 시 `prerelease: false`가 하드코딩되어 있어, RC 태그(`desktop-v2.13.0-rc.5`)로 빌드해도 GitHub Release가 stable로 생성됨.

다운로드 페이지(`site/download/index.html`)의 `!r.prerelease` 필터는 정상이지만, GitHub Release 자체가 prerelease로 마킹되지 않아 필터를 통과함.

## 수정 사항

1. **`desktop-release.yml`**: 버전에 `-rc`, `-alpha`, `-beta`가 포함되면 `prerelease: true`로 설정
2. **기존 RC 릴리스**: `desktop-v2.13.0-rc.5`를 수동으로 prerelease로 변경

## 테스트 항목

- [ ] RC 태그(`desktop-v*-rc.*`)로 워크플로우 실행 시 GitHub Release가 `prerelease: true`로 생성되는지 확인
- [ ] stable 태그(`desktop-v*` without rc)로 워크플로우 실행 시 `prerelease: false`로 생성되는지 확인
- [ ] 다운로드 페이지에서 RC 릴리스가 필터링되고 최신 stable 릴리스가 표시되는지 확인
