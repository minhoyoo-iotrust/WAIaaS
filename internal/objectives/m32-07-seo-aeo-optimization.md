# 마일스톤 m32-07: SEO/AEO 최적화 (GitHub Pages 확장)

- **Status:** SHIPPED
- **Milestone:** v32.7
- **Completed:** 2026-03-17

## 목표

현재 단일 페이지(`site/index.html`)인 waiaas.ai를 GitHub Pages 순수 HTML 방식으로 확장하여 SEO/AEO를 강화한다. 기존 `/docs/` 마크다운 콘텐츠를 웹에 발행하고, "AI wallet" 카테고리 키워드를 선점하는 SEO 랜딩 페이지를 추가하며, structured data와 AEO 구조를 확장한다. 메인페이지 본문은 변경하지 않고, 헤더/푸터 네비게이션만 수정한다.

---

## 배경

### 현재 문제

1. **단일 페이지 한계**: `site/index.html` 하나뿐. sitemap.xml에 URL 1개만 등록되어 검색엔진이 인식할 콘텐츠가 부족하다.
2. **기존 콘텐츠 미발행**: `/docs/`에 양질의 콘텐츠 9편 이상(Why WAIaaS 4편, Security Model, Architecture, Deployment Guide 등)이 있으나 GitHub 저장소에만 존재하고 waiaas.ai에서 접근 불가.
3. **키워드 확장 부족**: meta keywords가 기술 용어 중심(`wallet, AI agent, API, EVM, Solana, DeFi`)이고, 사용자 검색 의도 키워드("AI wallet", "wallet for AI agents", "AI agent payments")가 부족.
4. **Backlink 부족**: GitHub, npm, Docker, MCP directory 정도만 외부 링크. AI tool directory 미등록.
5. **AEO 구조 제한**: JSON-LD FAQPage 스키마가 5개 Q&A로 제한. AI 검색 인용에 최적화된 콘텐츠 페이지 없음.

### 기회

- "AI wallet" 키워드는 블루오션 — MPC wallet, AA wallet 대비 경쟁이 거의 없음
- 카테고리 리더 부재 — 지금 선점하면 "AI wallet infrastructure" 카테고리 정의 가능
- 기존 콘텐츠 재활용으로 신규 작성 부담 최소화

---

## 구현 대상

### Phase 1: 페이지 템플릿 + 네비게이션 인프라

| 대상 | 내용 |
|------|------|
| 공통 HTML 템플릿 | 현재 터미널 테마(JetBrains Mono, 다크 CRT 스타일) 재사용. header/footer를 공유하는 블로그/문서 페이지 레이아웃 작성 |
| 네비게이션 바 수정 | `index.html` 상단 nav에 Blog / Docs 링크 추가 (메인페이지 본문 변경 없음) |
| 푸터 수정 | 사이트맵 링크 추가 (메인페이지 본문 변경 없음) |
| 마크다운 → HTML 변환 | 빌드 의존성 없는 단순 Node 스크립트 (`site/scripts/build-pages.mjs`). marked/markdown-it로 md → HTML 변환 후 템플릿에 삽입 |
| 디렉토리 구조 | `site/blog/`, `site/docs/` 하위에 서브페이지 생성 |
| 테스트 | 변환 스크립트 동작 확인, 생성된 HTML 유효성 검증 |

### Phase 2: 기존 콘텐츠 발행

| 대상 | 내용 |
|------|------|
| Why WAIaaS 4편 → Blog | `docs/why-waiaas/001~004.md` → `site/blog/` HTML 페이지로 변환 발행 |
| 기술 문서 → Docs | Architecture, Security Model, Deployment Guide, Wallet SDK Integration 등 → `site/docs/` HTML 페이지로 변환 발행 |
| 블로그 목록 페이지 | `site/blog/index.html` — 글 목록 + 요약 |
| 문서 목록 페이지 | `site/docs/index.html` — 문서 카테고리별 목록 |
| 각 페이지 meta tags | title, description, OG, canonical URL 설정 |
| 테스트 | 모든 내부 링크 유효성, OG metadata 존재 확인 |

### Phase 3: SEO 랜딩 페이지 신규 작성

| 대상 | 내용 |
|------|------|
| "What is an AI Wallet" | 카테고리 정의 페이지 — 핵심 키워드 "AI wallet", "wallet for AI agents" 타겟. why-waiaas 콘텐츠 재구성 |
| "AI Wallet vs MPC vs Smart Wallet" | 비교 페이지 — docs/why-waiaas/002 내용 기반. AEO citation 최적화 구조 (Question → Answer) |
| "How AI Agents Pay On-Chain" | long-tail 키워드 페이지 — "AI agent payments", "AI agent crypto payments" 타겟 |
| 각 페이지 targeted SEO | meta description, keywords, OG, JSON-LD Article 스키마 |
| 테스트 | structured data 유효성 (Google Rich Results 호환), meta tags 완전성 |

### Phase 4: 기술 SEO + AEO 강화

| 대상 | 내용 |
|------|------|
| sitemap.xml 확장 | 전체 페이지 URL 반영 (blog/*, docs/*, SEO 랜딩 페이지) |
| JSON-LD 확장 | 각 페이지별 Article/FAQPage/BreadcrumbList 스키마 추가 |
| 홈페이지 FAQ 확장 | 기존 5개 → 10~15개 Q&A로 확장 (AI wallet 관련 질문 추가) |
| canonical URL | 각 페이지별 canonical 설정 |
| 내부 링크 구조 | 페이지 간 상호 링크 (pillar-cluster 구조) |
| 테스트 | sitemap URL 유효성, JSON-LD 스키마 검증, 내부 링크 404 확인 |

### Phase 5: 외부 분배 준비

| 대상 | 내용 |
|------|------|
| AI directory 등록 자료 | Futurepedia, Toolify, There's an AI for That 제출용 프로젝트 설명 + 스크린샷 준비 |
| MCP directory 정보 업데이트 | mcp.so, Smithery 등록 정보 최신화 |
| 커뮤니티 포스팅 초안 | HackerNews "Show HN" 포스트, Reddit r/LocalLLaMA + r/ethdev 포스트 초안 |
| 바이럴 콘텐츠 | "Why AI Agents Need Wallets" 아티클 초안 (HN/Reddit 배포용) |
| 등록 체크리스트 | 각 플랫폼별 등록 절차 + 상태 추적 문서 |

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 사이트 프레임워크 | (A) Docusaurus (B) Astro/Starlight (C) **순수 HTML + GitHub Pages** | **C** — 관리포인트 제로 증가. 기존 CI 파이프라인 그대로 사용. 현재 규모(10~15페이지)에 프레임워크는 오버엔지니어링 |
| 2 | 마크다운 변환 방식 | (A) **빌드 스크립트 (marked/markdown-it)** (B) 수동 HTML 작성 (C) Jekyll 활성화 | **A** — 기존 md 콘텐츠 재활용 가능. 빌드 의존성 최소(devDependency 1개). Jekyll은 Ruby 의존성 추가 |
| 3 | 메인페이지 변경 범위 | (A) 전면 리디자인 (B) **헤더/푸터만 수정** | **B** — 현재 디자인 충분히 양호. SEO에 필요한 건 페이지 수와 structured data |
| 4 | 디자인 일관성 | (A) 서브페이지 별도 디자인 (B) **기존 터미널 테마 통일** | **B** — 브랜드 일관성 유지. 기존 CSS 재사용으로 작업량 감소 |
| 5 | URL 구조 | (A) **클린 URL (`/blog/ai-wallet/`)** (B) 파일 직접 참조 (`/blog/ai-wallet.html`) | **A** — SEO 친화적. `index.html` 기반 디렉토리 구조로 구현 |
| 6 | 외부 등록 범위 | (A) 직접 등록 실행 (B) **등록 자료 + 체크리스트 준비** | **B** — 등록 자체는 수동 작업(계정 생성, 폼 작성). 마일스톤에서는 자료 준비까지만 |

---

## E2E 검증 시나리오

**자동화 비율: 80%** (외부 등록 자료는 수동 검토)

### 페이지 생성 + 네비게이션

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 메인페이지 본문 미변경 | 헤더/푸터 외 메인페이지 HTML diff → 본문 변경 없음 확인 | [L0] |
| 2 | 네비게이션 링크 동작 | Blog, Docs 링크 클릭 → 해당 목록 페이지 도달 | [L0] |
| 3 | 모든 서브페이지 접근 가능 | `site/` 하위 모든 HTML 파일 HTTP 200 확인 | [L0] |

### SEO 메타데이터

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 4 | 각 페이지 meta tags 완전성 | title, description, canonical, OG:title/description/image/url 존재 확인 | [L0] |
| 5 | JSON-LD 유효성 | 각 페이지 structured data가 Google Rich Results Test 스키마에 부합 | [L0] |
| 6 | sitemap.xml 완전성 | sitemap에 등록된 URL 수 = 실제 HTML 페이지 수 | [L0] |

### 콘텐츠 품질

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 7 | 내부 링크 유효성 | 모든 내부 `<a href>` → 404 없음 | [L0] |
| 8 | 마크다운 변환 정확성 | 원본 md 대비 HTML 렌더링 → 내용 누락/깨짐 없음 | [L0] |
| 9 | 디자인 일관성 | 서브페이지가 메인페이지와 동일한 터미널 테마 적용 확인 | [L1] |

### AEO 구조

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 10 | FAQ 스키마 확장 | 홈페이지 FAQPage JSON-LD Q&A 수 ≥ 10 | [L0] |
| 11 | SEO 랜딩 페이지 Q&A 구조 | 각 SEO 페이지에 Question → Answer 구조 존재 | [L0] |

### 외부 분배

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 12 | 등록 자료 완전성 | 프로젝트 설명, 스크린샷, 카테고리 태그 준비 확인 | [L1] |
| 13 | 포스팅 초안 품질 | HN/Reddit 초안이 커뮤니티 가이드라인 준수 확인 | [L1] |

---

## 선행 조건

| 의존 대상 | 이유 |
|----------|------|
| 없음 | 독립 실행 가능. `site/` 디렉토리 작업이므로 daemon 코드와 무관 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 마크다운 변환 시 코드 블록/테이블 깨짐 | 발행된 문서 가독성 저하 | marked/markdown-it의 GFM 지원 활용. 변환 후 육안 검수 |
| 2 | 서브페이지 CSS 경로 오류 | 스타일 미적용 | 상대 경로 대신 루트 기준 경로 사용 (`/style.css`) 또는 인라인 CSS |
| 3 | GitHub Pages 빌드 실패 | 배포 중단 | 기존 배포 워크플로우 구조 유지. `site/` push → deploy 파이프라인 변경 없음 |
| 4 | SEO 효과 지연 | 검색엔진 인덱싱에 수주~수개월 소요 | Google Search Console 등록 + sitemap 제출로 인덱싱 가속. 외부 분배로 backlink 확보 |
| 5 | 콘텐츠 유지보수 부담 | 원본 md 변경 시 HTML 재생성 필요 | 변환 스크립트 자동화. CI에서 `docs/` 변경 감지 → 재빌드 고려 (선택사항) |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 5개 |
| 신규 HTML 페이지 | 12~15개 (blog 4~5, docs 5~6, SEO 랜딩 3, 목록 2) |
| 신규 파일 | 18~22개 (HTML 페이지 + 변환 스크립트 + 템플릿 + 등록 자료) |
| 수정 파일 | 3개 (index.html 헤더/푸터, sitemap.xml, robots.txt) |
| 예상 LOC 변경 | +3,000~4,000 (HTML 페이지 + 스크립트 + 콘텐츠) |

---

*생성일: 2026-03-16*
*관련 분석: waiaas.ai SEO/AEO 현황 분석 (2026-03-16)*
*선행: 없음 (독립 실행 가능)*
