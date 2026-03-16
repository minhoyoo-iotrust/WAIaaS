# #339 — GitHub Actions Pages 배포 워크플로우

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** FIXED
- **수정일:** 2026-03-14
- **등록일:** 2026-03-14

## 설명

`site/` 폴더를 GitHub Pages로 배포하는 GitHub Actions 워크플로우를 추가한다.
`workflow_dispatch`로 수동 실행하며, GitHub Pages Source는 GitHub Actions로 설정한다.

## 요구사항

1. `.github/workflows/deploy-pages.yml` 워크플로우 생성
2. `workflow_dispatch` 트리거 (수동 실행)
3. `site/` 폴더 내용을 GitHub Pages artifact로 업로드
4. GitHub Pages에 자동 배포
5. 커스텀 도메인 설정: waiaas.ai (주력) + waiaas.dev (보조)
6. CNAME 파일에 주력 도메인(waiaas.ai) 설정
7. waiaas.dev는 GitHub Pages 설정 또는 DNS 레벨에서 waiaas.ai로 리다이렉트

## 도메인 구성

- **주력:** waiaas.ai — CNAME 파일에 설정, OG/canonical URL 기준
- **보조:** waiaas.dev — waiaas.ai로 리다이렉트

## 테스트 항목

- [ ] workflow_dispatch로 수동 실행 시 Pages 배포 성공
- [ ] https://waiaas.ai 접속 확인
- [ ] https://waiaas.dev → waiaas.ai 리다이렉트 확인
- [ ] HTTPS 인증서 정상 발급 확인 (두 도메인 모두)
