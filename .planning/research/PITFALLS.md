# Pitfalls Research

**Domain:** SEO/AEO optimization for static GitHub Pages site (waiaas.ai)
**Researched:** 2026-03-17
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Canonical URL / Sitemap Mismatch

**What goes wrong:**
sitemap.xml에 나열된 URL과 각 페이지의 `<link rel="canonical">` URL이 불일치한다. GitHub Pages는 `.html` 확장자 유무, trailing slash(`/docs/` vs `/docs`), custom domain(`waiaas.ai`) vs GitHub 도메인(`username.github.io`) 간 불일치가 빈번하다. Google은 sitemap의 비canonical URL을 발견하면 sitemap 전체를 무시할 수 있다.

**Why it happens:**
수동으로 sitemap.xml을 작성하면서 canonical URL 규칙과 동기화하지 않음. 특히 마크다운 -> HTML 변환 스크립트가 파일명 기반(`getting-started.html`)으로 생성하는데, sitemap에는 다른 패턴(`/docs/getting-started/`)을 사용하는 경우.

**How to avoid:**
- 빌드 스크립트에서 sitemap.xml을 **자동 생성**한다. HTML 파일 목록을 순회하며 canonical URL과 동일한 규칙으로 URL을 생성.
- URL 규칙을 하나 정하고 전체 사이트에 일관 적용: `https://waiaas.ai/docs/getting-started` (확장자 없음, trailing slash 없음) 또는 `https://waiaas.ai/docs/getting-started.html` 중 하나.
- GitHub Pages의 `CNAME` 파일이 `waiaas.ai`를 가리키는지 확인 -- sitemap/canonical 모두 custom domain 사용.

**Warning signs:**
- Google Search Console에서 "제출된 URL에 canonical이 아닌 페이지가 있음" 경고
- 빌드 후 `grep -r "canonical" dist/` 결과와 sitemap.xml URL 비교 시 패턴 불일치

**Phase to address:**
Phase 1 (페이지 템플릿 + 네비게이션 인프라) -- URL 규칙과 canonical 생성 로직을 템플릿 레벨에서 확정.

---

### Pitfall 2: JSON-LD 구조화 데이터의 필수 속성 누락

**What goes wrong:**
JSON-LD schema를 추가하되 Google이 요구하는 필수 속성을 빠뜨린다. 예를 들어 `Article` 타입에 `headline`, `datePublished`, `author`가 없거나, `FAQPage`에 빈 `mainEntity` 배열을 넣는 경우. 불완전한 schema는 schema가 없는 것보다 나쁘다 -- Google이 "구조화 데이터 오류"로 표시하며 rich snippet 자격을 박탈한다.

**Why it happens:**
개발자가 "일단 JSON-LD를 넣으면 효과가 있겠지"라고 생각하고, Rich Results Test나 Schema Validator로 검증하지 않음. 특히 마크다운 front matter에서 메타데이터를 추출하여 JSON-LD를 동적 생성할 때, front matter에 필드가 없으면 빈값/undefined가 들어감.

**How to avoid:**
- schema 타입별 필수 속성 체크리스트를 코드에 내장: `SoftwareApplication`(name, applicationCategory, operatingSystem), `Article`(headline, datePublished, author, image), `FAQPage`(mainEntity 1+ 필수).
- 빌드 스크립트에서 생성된 JSON-LD를 **schema.org 검증기 또는 Google Rich Results Test API**로 자동 검증.
- front matter에 필수 필드가 없으면 빌드 실패 처리(fail-fast).

**Warning signs:**
- Google Search Console > 개선사항 > 구조화 데이터에 "오류" 표시
- `@type`은 있으나 해당 타입의 required property가 없는 JSON-LD 블록

**Phase to address:**
Phase 4 (기술 SEO + AEO 강화) -- JSON-LD 템플릿과 검증 스크립트를 구현.

---

### Pitfall 3: AEO 최적화 없이 SEO만 수행

**What goes wrong:**
전통적 SEO(메타태그, sitemap, 키워드)만 구현하고 AI 답변 엔진(ChatGPT, Perplexity, Google AI Overviews)용 최적화를 무시한다. 2026년 기준 검색 트래픽의 상당 부분이 AI 답변에 흡수되고 있어, SEO만으로는 "AI wallet" 카테고리 가시성 확보가 불충분하다.

**Why it happens:**
AEO가 상대적으로 새로운 개념이고, 전통 SEO 체크리스트에 포함되지 않음. "structured data 넣으면 AI도 읽겠지"라는 가정 -- 실제로는 AI 모델이 선호하는 콘텐츠 구조(정의-설명-예시 패턴, concise answers, entity clarity)가 따로 있음.

**How to avoid:**
- 각 페이지의 첫 160자 이내에 핵심 메시지(what is WAIaaS, what does it do)를 명확히 배치 -- AI 모델이 발췌에 사용.
- FAQ 섹션을 `FAQPage` schema와 함께 실제 콘텐츠로 작성 (schema만 있고 콘텐츠 없는 FAQ는 AI 신뢰도를 낮춤).
- `Organization` schema로 브랜드 엔티티(WAIaaS)를 명확히 정의: name, url, description, sameAs(GitHub, npm).
- robots.txt에서 AI 크롤러(GPTBot, PerplexityBot, Google-Extended)를 차단하지 않을 것.

**Warning signs:**
- "WAIaaS" 또는 "AI wallet service" 쿼리에 AI 답변에서 인용되지 않음
- robots.txt에 `Disallow: /` 또는 AI 크롤러 차단 규칙이 있음

**Phase to address:**
Phase 3 (SEO 랜딩 페이지 신규 작성) + Phase 4 (기술 SEO + AEO 강화) -- 랜딩 페이지 작성 시 AEO 패턴 적용, Phase 4에서 schema + robots.txt 검증.

---

### Pitfall 4: CRT 다크 테마와 SEO 콘텐츠 간 접근성 충돌

**What goes wrong:**
기존 터미널 CRT 다크 테마를 유지하면서 긴 문서 콘텐츠를 추가하면, 가독성과 접근성 문제가 발생한다. 밝은 텍스트 + 어두운 배경의 긴 문서는 눈의 피로도가 높고, 밝기 대비(contrast ratio)가 WCAG AA 기준(4.5:1)을 충족하지 못할 수 있다. Google은 Core Web Vitals + 접근성을 간접 랭킹 팩터로 사용한다.

**Why it happens:**
랜딩 페이지용 시각적 테마와 문서 콘텐츠용 읽기 편한 테마의 요구사항이 다름. CRT 효과(글로우, 스캔라인)가 짧은 히어로 섹션에는 인상적이지만, 2000단어 문서에는 가독성을 해침.

**How to avoid:**
- 랜딩 페이지(히어로, feature 하이라이트)와 문서/블로그 페이지의 스타일을 분리. 문서 영역은 CRT 효과를 줄이되 색상 팔레트는 유지.
- 모든 텍스트-배경 조합의 contrast ratio를 WCAG AA (4.5:1) 이상으로 검증.
- 코드 블록은 CRT 스타일 유지(개발자 친숙), 본문 텍스트는 가독성 우선.

**Warning signs:**
- Lighthouse 접근성 점수가 90 미만
- 문서 페이지에서 bounce rate가 랜딩보다 현저히 높음

**Phase to address:**
Phase 1 (페이지 템플릿) -- 문서용 CSS 변형을 템플릿 레벨에서 설계.

---

### Pitfall 5: 마크다운 -> HTML 변환 시 SEO 메타데이터 손실

**What goes wrong:**
기존 `/docs/` 마크다운 콘텐츠를 HTML로 변환할 때, SEO에 필요한 메타데이터(title, description, og:image, canonical URL)가 누락된다. 변환 스크립트가 마크다운 본문만 HTML로 바꾸고, `<head>` 태그의 메타 요소를 생성하지 않으면 모든 페이지가 동일한 제목/설명으로 인덱싱된다.

**Why it happens:**
마크다운에는 YAML front matter로 메타데이터를 포함할 수 있지만, 커스텀 빌드 스크립트(프레임워크 없이)를 만들 때 front matter 파싱을 구현하지 않거나, 파싱은 하되 HTML `<head>`에 주입하는 로직을 빼먹음.

**How to avoid:**
- 빌드 스크립트의 필수 요구사항으로 front matter 파싱을 정의: `title`, `description`, `date`, `slug` 최소 4개 필드.
- HTML 템플릿에 front matter 값이 주입되는 플레이스홀더를 명시적으로 배치: `<title>{{title}} | WAIaaS</title>`, `<meta name="description" content="{{description}}">`, `<link rel="canonical" href="https://waiaas.ai/{{slug}}">`.
- front matter 누락 시 빌드 경고 또는 실패 처리.

**Warning signs:**
- 여러 페이지가 동일한 `<title>` 또는 `<meta description>`을 가짐
- Google Search Console에서 "중복 메타 설명" 경고

**Phase to address:**
Phase 1 (페이지 템플릿 + 마크다운 -> HTML 변환 스크립트) -- 변환 파이프라인에서 메타데이터 주입을 필수 기능으로 구현.

---

### Pitfall 6: GitHub Pages 서버 사이드 제약 무시

**What goes wrong:**
서버 사이드 리다이렉트, .htaccess, URL rewrite 등을 기대하는 SEO 전략을 수립하다가 GitHub Pages에서 불가능하다는 것을 뒤늦게 발견한다. 301 리다이렉트, 동적 sitemap, 서버 사이드 렌더링, `X-Robots-Tag` 헤더 등을 사용할 수 없다.

**Why it happens:**
SEO 가이드 대부분이 서버 설정을 전제. GitHub Pages는 정적 파일만 서빙하며 커스텀 헤더/리다이렉트를 지원하지 않음.

**How to avoid:**
- 리다이렉트는 HTML `<meta http-equiv="refresh">` + `<link rel="canonical">` 조합으로 처리.
- URL 변경이 필요한 경우 이전 경로에 리다이렉트용 HTML 파일을 배치.
- `robots.txt`와 `<meta name="robots">` 태그로 크롤링 제어 (서버 헤더 대신).
- 404.html을 커스텀하여 사용자 이탈 방지 + 주요 페이지 링크 제공.

**Warning signs:**
- 계획서에 "서버 설정" 또는 "리다이렉트 규칙"이 포함되어 있음
- nginx/Apache 문법이 등장

**Phase to address:**
Phase 1 (인프라) -- GitHub Pages 제약을 아키텍처 결정 문서에 명시하고, 대안 패턴을 확립.

---

### Pitfall 7: Open Graph / Twitter Card 메타태그 누락

**What goes wrong:**
SEO 기술 요소(sitemap, canonical, JSON-LD)에 집중하면서 소셜 미디어 공유용 메타태그(og:title, og:description, og:image, twitter:card)를 누락한다. AI directory 등록, 커뮤니티 포스팅 시 링크 미리보기가 깨져 클릭률이 급감한다.

**Why it happens:**
OG/Twitter 태그는 검색 랭킹에 직접 영향을 주지 않아 우선순위에서 밀림. 하지만 외부 분배(Phase 5 목표)에서 링크 공유가 핵심이므로 사실상 필수.

**How to avoid:**
- HTML 템플릿에 OG + Twitter Card 태그를 기본 포함. front matter의 title/description/image를 자동 매핑.
- 기본 og:image를 사이트 레벨에서 설정(CRT 스타일 WAIaaS 로고 + 텍스트 오버레이).
- 빌드 후 og:image URL이 실제 존재하는 파일을 가리키는지 검증.

**Warning signs:**
- 링크를 Slack/Twitter/Discord에 붙여넣었을 때 미리보기가 없거나 기본 아이콘만 표시
- Facebook Sharing Debugger에서 경고

**Phase to address:**
Phase 1 (페이지 템플릿) -- 템플릿에 OG/Twitter 메타를 포함, Phase 5 (외부 분배) 전에 전 페이지 검증.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| 수동 sitemap.xml 작성 | 빠른 초기 배포 | 페이지 추가 시마다 수동 업데이트 필요, 누락 발생 | Never -- 자동 생성이 복잡하지 않음 |
| JSON-LD를 하드코딩 (front matter 연동 없이) | 즉시 구조화 데이터 추가 | 콘텐츠와 메타데이터 불일치, 유지보수 비용 | MVP 단일 랜딩페이지에 한해 |
| 모든 페이지에 동일 meta description | 빠른 구현 | Google이 중복으로 간주, 개별 페이지 랭킹 저하 | Never |
| front matter 없이 마크다운 변환 | 변환 스크립트 단순화 | 페이지별 메타데이터 제어 불가, 나중에 전체 마크다운에 front matter 추가 필요 | Never -- 처음부터 front matter 포맷 확립 |
| og:image 없이 배포 | 개발 속도 향상 | 외부 공유 시 빈 미리보기, 클릭률 저하 | Phase 2까지만 (콘텐츠 작성 중) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GitHub Pages CNAME | CNAME 파일을 빌드 산출물에 포함하지 않아 배포 시 삭제됨 | 빌드 스크립트가 CNAME 파일을 output 디렉토리에 복사하도록 보장 |
| GitHub Actions 배포 | 빌드 산출물을 main 브랜치에 커밋하여 소스와 산출물 혼재 | `gh-pages` 브랜치 또는 GitHub Actions `peaceiris/actions-gh-pages` 사용, 소스와 빌드 분리 |
| Google Search Console | 소유권 확인 HTML 파일을 빌드 시 누락 | 소유권 확인 파일을 static assets에 포함, 또는 DNS TXT 레코드로 인증 |
| AI Directory 등록 | 구조화 데이터 없이 등록하여 카테고리 자동 분류 실패 | `SoftwareApplication` + `Organization` schema를 메인 페이지에 배치 후 등록 |
| robots.txt | GPTBot/PerplexityBot 등 AI 크롤러를 실수로 차단 | robots.txt에 명시적으로 AI 크롤러 허용, 또는 차단 규칙 없이 전체 허용 |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| CRT 효과 CSS 애니메이션이 CLS 유발 | Lighthouse CLS > 0.1, 레이아웃 이동 | 애니메이션 요소에 고정 크기 지정, `will-change` 속성 사용 | 모바일 저사양 기기 |
| 이미지 최적화 없이 OG/hero 이미지 배치 | LCP > 2.5초, 모바일에서 느린 로드 | WebP 포맷, 적절한 크기, `<link rel="preload">` | 이미지 1MB+ 시 |
| 인라인 JSON-LD가 페이지마다 중복 Organization schema | 크롤러 혼란, "중복 엔티티" 경고 | Organization schema는 홈페이지에만 배치, 나머지는 WebPage/Article | 10+ 페이지 |
| Google Fonts 외부 로드 | FOUT/FOIT, FCP 지연 | 폰트를 로컬 호스팅(self-host), `font-display: swap` | 모든 규모 (3rd party blocking) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| API 키/시크릿이 마크다운 예시 코드에 노출 | 크리덴셜 유출 | 예시 코드에 `YOUR_API_KEY` 플레이스홀더 사용, 빌드 시 실제 키 패턴 grep 검증 |
| 마크다운 내 외부 링크에 `target="_blank"` 사용 시 `rel="noopener"` 누락 | tabnabbing 공격 | 빌드 스크립트에서 외부 링크에 `rel="noopener noreferrer"` 자동 추가 |
| 사용자 제출 콘텐츠가 아닌 경우에도 HTML sanitization 미적용 | 마크다운 내 raw HTML이 XSS 벡터 | 마크다운 파서에서 raw HTML을 제한적으로 허용, `<script>` 태그 차단 |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| 문서 페이지에 네비게이션/TOC 없이 긴 콘텐츠 배치 | 원하는 섹션을 찾지 못하고 이탈 | 사이드바 TOC(Table of Contents) + anchor 링크 자동 생성 |
| 모바일에서 CRT 테마 가로 스크롤 | 터미널 스타일 고정 너비가 좁은 화면에서 오버플로우 | 코드 블록에 `overflow-x: auto`, 본문은 반응형 |
| 블로그/문서 날짜 미표시 | 콘텐츠 신선도 판단 불가, 신뢰도 저하 | front matter `date`를 페이지에 표시, JSON-LD `datePublished`와 동기화 |
| 검색 기능 없이 다수 문서 페이지 배포 | 원하는 정보를 찾지 못함 | 클라이언트 사이드 검색(pagefind) 또는 Ctrl+K 커맨드 팔레트 |

## "Looks Done But Isn't" Checklist

- [ ] **sitemap.xml:** 모든 공개 페이지가 포함되어 있는지 -- 빌드 후 페이지 수와 sitemap 엔트리 수 비교
- [ ] **canonical URL:** 모든 페이지에 `<link rel="canonical">`이 있고, sitemap URL과 일치하는지 확인
- [ ] **JSON-LD 검증:** Google Rich Results Test로 모든 페이지의 구조화 데이터 오류 0건 확인
- [ ] **모바일 반응형:** Chrome DevTools 모바일 시뮬레이션으로 모든 페이지 확인 (코드 블록 오버플로우 특히 주의)
- [ ] **robots.txt:** AI 크롤러(GPTBot, PerplexityBot, Google-Extended, ClaudeBot)가 차단되지 않았는지 확인
- [ ] **OG 미리보기:** 각 페이지를 Facebook Sharing Debugger / Twitter Card Validator로 확인
- [ ] **404.html:** 존재하지 않는 URL 접근 시 커스텀 404 페이지가 표시되는지 확인
- [ ] **CNAME 파일:** 빌드/배포 후 custom domain이 유지되는지 확인
- [ ] **front matter 완전성:** 모든 마크다운 파일에 title/description/date/slug가 있는지 빌드 시 검증
- [ ] **내부 링크:** 모든 내부 링크가 실제 존재하는 페이지를 가리키는지 -- 빌드 후 dead link 검사

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Canonical/Sitemap 불일치 | LOW | 빌드 스크립트에 자동 생성 로직 추가, Google Search Console에서 sitemap 재제출 |
| JSON-LD 필수 속성 누락 | LOW | front matter 필드 추가 + 빌드 스크립트 수정, Search Console에서 재검증 요청 |
| AEO 미적용 | MEDIUM | 기존 콘텐츠를 AI 친화적 구조로 리라이트(정의-설명-예시 패턴), FAQ 섹션 추가 |
| 접근성 문제 (CRT 테마) | MEDIUM | CSS 변수로 문서 영역 스타일 분리, contrast ratio 수정 |
| 메타데이터 손실 | LOW-MEDIUM | 전체 마크다운에 front matter 일괄 추가(스크립트화 가능), 빌드 파이프라인 수정 |
| GitHub Pages 제약 미인지 | HIGH | 아키텍처 변경 필요(리다이렉트 방식 전환, URL 구조 재설계), 이미 인덱싱된 URL 변경 시 301 대체 필요 |
| OG/Twitter 태그 누락 | LOW | 템플릿에 태그 추가, 재빌드/재배포 |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Canonical/Sitemap 불일치 | Phase 1 (템플릿 인프라) | 빌드 후 sitemap URL == canonical URL 자동 검증 스크립트 |
| JSON-LD 필수 속성 누락 | Phase 4 (기술 SEO + AEO) | schema.org 검증기 통과, Google Rich Results Test 오류 0건 |
| AEO 미적용 | Phase 3 (SEO 랜딩) + Phase 4 | "WAIaaS" 쿼리로 AI 답변 인용 여부 수동 확인 (배포 2주 후) |
| CRT 테마 접근성 | Phase 1 (템플릿) | Lighthouse 접근성 점수 95+ |
| 메타데이터 손실 | Phase 1 (마크다운 변환 스크립트) | 전체 페이지에서 고유 title/description 존재 확인 |
| GitHub Pages 제약 | Phase 1 (인프라) | 아키텍처 결정 문서에 "서버 사이드 불가" 명시 |
| OG/Twitter 누락 | Phase 1 (템플릿) + Phase 5 전 검증 | Facebook/Twitter 미리보기 도구로 전 페이지 확인 |

## Sources

- [SEO Mistakes to Avoid in 2026 -- Content Whale](https://content-whale.com/blog/seo-mistakes-and-common-errors-to-avoid-in-2026/)
- [10 SEO Mistakes in 2026 -- RankTracker](https://www.ranktracker.com/blog/seo-mistakes-2026/)
- [GitHub Pages SPA SEO Issues -- crunchyintheory](https://crunchyintheory.com/blog/seo-github-pages-spa/)
- [Most Common JSON-LD Schema Issues -- Zeo](https://zeo.org/resources/blog/most-common-json-ld-schema-issues-and-solutions)
- [JSON-LD Schema Markup Guide -- SEO Strategy](https://www.seostrategy.co.uk/schema-structured-data/json-ld-guide/)
- [Fixing Structured Data Errors -- Salt Agency](https://salt.agency/blog/fixing-common-json-ld-structured-data-issues-in-google-search-console/)
- [Answer Engine Optimization Guide 2026 -- Frase.io](https://www.frase.io/blog/what-is-answer-engine-optimization-the-complete-guide-to-getting-cited-by-ai)
- [AEO in SEO 2026 -- GenOptima](https://www.gen-optima.com/blog/aeo-in-seo-how-answer-engine-optimization-integrates-with-ai-search-2026/)
- [AEO Complete Guide 2026 -- LLMrefs](https://llmrefs.com/answer-engine-optimization)
- [SEO Blog with Front Matter -- jessie.codes](https://jessie.codes/article/seo-blog-frontmatter/)
- [Front Matter Best Practices -- SSW Rules](https://www.ssw.com.au/rules/best-practices-for-frontmatter-in-markdown)
- [generate-sitemap GitHub Action -- cicirello](https://github.com/cicirello/generate-sitemap)
- [Non-Canonical URL in Sitemap -- Sitechecker](https://sitechecker.pro/site-audit-issues/fix-non-canonical-url-sitemap/)
- [Mastering SEO for GitHub Pages -- JekyllPad](https://www.jekyllpad.com/blog/mastering-github-pages-seo-7)

---
*Pitfalls research for: SEO/AEO optimization on static GitHub Pages site (waiaas.ai)*
*Researched: 2026-03-17*
