# 381: SEO 메타 태그 / OG / Canonical 누락으로 검색엔진·SNS 노출 저하

- **유형:** MISSING
- **심각도:** HIGH
- **상태:** FIXED
- **마일스톤:** v32.7
- **수정일:** 2026-03-18
- **발견일:** 2026-03-17
- **발견 경로:** waiaas.ai 사이트 SEO/AEO 분석

## 현상

https://waiaas.ai/ 전체 페이지에서 다음 SEO 필수 요소가 누락되어 있음:

1. **`<meta name="description">`** — 메인 페이지 포함 전 페이지에 없음. Google 검색결과 스니펫이 자동 추출에 의존
2. **Open Graph 태그** — `og:title`, `og:description`, `og:image`, `og:url`, `og:type` 전무. SNS 공유 시 미리보기 불가
3. **Twitter Card 태그** — `twitter:card`, `twitter:title`, `twitter:description` 없음
4. **`<link rel="canonical">`** — 미설정. 중복 콘텐츠 문제 가능 (trailing slash, www 등)
5. **`<html lang="en">`** — 설정 여부 불확실
6. **Favicon / apple-touch-icon** — `<link rel="icon">` 미발견
7. **Sitemap lastmod** — 문서 페이지 lastmod가 2026-02-09~02-17에서 멈춤. 빌드 시 자동 갱신 필요

## 영향

- Google 검색결과에서 설명문이 비정상 표시
- SNS(Twitter/X, LinkedIn, Slack, Discord) 공유 시 제목·설명·이미지 미표시
- 중복 URL 인덱싱 위험
- 검색엔진 언어 인식 오류 가능

## 현재 잘 되어 있는 부분 (참고)

- JSON-LD: SoftwareApplication + FAQPage(20개) + HowTo 3종 완비
- llms.txt / llms-full.txt: AEO 핵심 자산 (llms-full.txt ~100KB)
- Breadcrumb JSON-LD: /blog/, /docs/ 페이지 적용
- 콘텐츠 볼륨: 블로그 12편 + 기술문서 7편 + 메인 ~3,200단어

## 수정 방향

### P0 (즉시)
- `template.html`에 meta description, OG tags, Twitter Card, canonical 일괄 추가
- `build.mjs`에서 각 페이지 frontmatter의 description을 meta/OG에 자동 주입

### P1 (함께)
- `<html lang="en">` 확인 및 설정
- Favicon 및 apple-touch-icon 추가

### P2 (후속)
- 블로그/문서별 고유 og:image 생성 (선택)
- `build.mjs`에서 sitemap lastmod를 빌드 시점으로 자동 갱신

## 수정 대상 파일

- `site/template.html` — meta tags, OG, Twitter Card, canonical, lang, favicon 추가
- `site/build.mjs` — frontmatter description → meta/OG 자동 주입, sitemap lastmod 갱신
- `site/public/` — favicon 파일 추가 (필요 시)

## 테스트 항목

- [ ] 빌드 후 메인 페이지 HTML에 meta description, OG tags, Twitter Card, canonical 포함 확인
- [ ] 블로그/문서 각 페이지에 고유 description이 meta/OG에 반영되는지 확인
- [ ] `<html lang="en">` 설정 확인
- [ ] sitemap.xml의 lastmod가 빌드 시점 날짜로 갱신되는지 확인
- [ ] [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) 또는 [Twitter Card Validator](https://cards-dev.twitter.com/validator)로 미리보기 정상 표시 확인
