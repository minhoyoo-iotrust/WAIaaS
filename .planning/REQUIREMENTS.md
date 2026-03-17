# Requirements: WAIaaS v32.7 SEO/AEO 최적화

**Defined:** 2026-03-17
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for milestone v32.7. Each maps to roadmap phases.

### Build Infrastructure

- [x] **BUILD-01**: Build script가 markdown 파일을 front-matter와 함께 파싱하여 HTML로 변환한다
- [x] **BUILD-02**: HTML 템플릿이 CRT 터미널 테마를 공유하며 nav/footer를 포함한다
- [x] **BUILD-03**: Article CSS가 긴 콘텐츠에서 WCAG AA 대비율을 유지하며 가독성을 제공한다
- [x] **BUILD-04**: Front-matter에 필수 필드(title, description, date) 누락 시 빌드가 실패한다
- [x] **BUILD-05**: 코드 블록에 build-time 구문 강조(highlight.js)가 적용된다
- [x] **BUILD-06**: Clean URL 패턴(directory/index.html)으로 페이지를 생성한다

### Content Publishing

- [x] **CONT-01**: Why WAIaaS 4편이 Blog 섹션 HTML 페이지로 발행된다
- [x] **CONT-02**: Guides 문서들이 Blog 섹션 HTML 페이지로 발행된다
- [x] **CONT-03**: 기술 문서(Architecture, Security Model, Deployment Guide 등)가 Docs 섹션으로 발행된다
- [x] **CONT-04**: Blog 목록 페이지(site/blog/index.html)가 글 목록과 요약을 표시한다
- [x] **CONT-05**: Docs 목록 페이지(site/docs/index.html)가 카테고리별 문서 목록을 표시한다
- [x] **CONT-06**: 각 페이지에 title, description, canonical, OG 메타 태그가 설정된다
- [x] **CONT-07**: 마크다운 변환 시 코드 블록/테이블/링크가 정확히 렌더링된다

### Navigation

- [x] **NAV-01**: 메인페이지 nav에 Blog, Docs 링크가 추가된다 (본문 미변경)
- [x] **NAV-02**: 서브페이지에서 현재 섹션이 active 상태로 표시된다
- [x] **NAV-03**: 모든 내부 링크가 유효하다 (404 없음)

### SEO Landing Pages

- [ ] **SEO-01**: "What is an AI Wallet" 카테고리 정의 페이지가 생성된다
- [ ] **SEO-02**: "AI Agent Wallet Security" 페이지가 AEO Question→Answer 구조로 작성된다
- [ ] **SEO-03**: "MCP Wallet" 페이지가 타겟 키워드와 함께 생성된다
- [ ] **SEO-04**: 각 SEO 랜딩 페이지에 targeted meta description과 keywords가 설정된다

### Technical SEO & AEO

- [ ] **TSEO-01**: sitemap.xml이 전체 페이지 URL을 자동 반영한다
- [ ] **TSEO-02**: 각 페이지에 적절한 JSON-LD 스키마가 포함된다 (Article/TechArticle/BreadcrumbList)
- [ ] **TSEO-03**: 홈페이지 FAQ가 5개에서 20개 이상 Q&A로 확장된다
- [ ] **TSEO-04**: 각 페이지에 canonical URL이 설정된다
- [ ] **TSEO-05**: llms-full.txt가 전체 콘텐츠를 포함하여 자동 생성된다
- [ ] **TSEO-06**: 페이지 간 상호 내부 링크(pillar-cluster 구조)가 설정된다

### CI Integration

- [ ] **CI-01**: pages.yml에 Node.js 빌드 스텝이 추가된다
- [ ] **CI-02**: docs/** 변경 시 자동 재빌드가 트리거된다
- [ ] **CI-03**: 생성된 HTML 파일이 .gitignore에 등록된다

### External Distribution

- [ ] **DIST-01**: AI directory 등록용 SUBMISSION_KIT.md가 프로젝트 설명/카테고리/태그를 포함한다
- [ ] **DIST-02**: 등록 대상 플랫폼별 체크리스트가 작성된다
- [ ] **DIST-03**: MCP directory 등록 정보가 최신화된다
- [ ] **DIST-04**: 커뮤니티 포스팅 초안(HN Show HN, Reddit)이 작성된다

## Future Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Comparison Pages

- **COMP-01**: "WAIaaS vs Lit Protocol/Turnkey/Privy" 비교 페이지 — 트래픽 데이터 필요
- **COMP-02**: 경쟁 제품 기능 매트릭스 테이블

### Advanced SEO

- **ASEO-01**: 페이지별 OG 이미지 자동 생성 (Puppeteer)
- **ASEO-02**: Client-side search (Pagefind) — 페이지 20개 미만에서는 불필요
- **ASEO-03**: RSS feed 생성

## Out of Scope

| Feature | Reason |
|---------|--------|
| SSG 프레임워크 (Docusaurus/Astro) | ~20페이지에 오버엔지니어링, 관리포인트 증가 |
| Jekyll 활성화 | Ruby 의존성 추가, 기존 CI 변경 과다 |
| React/Preact 콘텐츠 페이지 | 정적 콘텐츠에 JS 프레임워크 불필요 |
| 직접 등록 실행 | 계정 생성/폼 작성 등 수동 작업, 자료 준비까지만 |
| Analytics 추가 | 프라이버시 우선, 검색엔진 효과는 Search Console로 측정 |
| 다크/라이트 테마 토글 | CRT 테마 일관성 유지, 복잡도 증가 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BUILD-01 | Phase 439 | Complete |
| BUILD-02 | Phase 439 | Complete |
| BUILD-03 | Phase 439 | Complete |
| BUILD-04 | Phase 439 | Complete |
| BUILD-05 | Phase 439 | Complete |
| BUILD-06 | Phase 439 | Complete |
| CONT-01 | Phase 440 | Complete |
| CONT-02 | Phase 440 | Complete |
| CONT-03 | Phase 440 | Complete |
| CONT-04 | Phase 440 | Complete |
| CONT-05 | Phase 440 | Complete |
| CONT-06 | Phase 440 | Complete |
| CONT-07 | Phase 440 | Complete |
| NAV-01 | Phase 440 | Complete |
| NAV-02 | Phase 440 | Complete |
| NAV-03 | Phase 440 | Complete |
| SEO-01 | Phase 443 | Pending |
| SEO-02 | Phase 443 | Pending |
| SEO-03 | Phase 443 | Pending |
| SEO-04 | Phase 443 | Pending |
| TSEO-01 | Phase 441 | Pending |
| TSEO-02 | Phase 441 | Pending |
| TSEO-03 | Phase 441 | Pending |
| TSEO-04 | Phase 441 | Pending |
| TSEO-05 | Phase 441 | Pending |
| TSEO-06 | Phase 441 | Pending |
| CI-01 | Phase 442 | Pending |
| CI-02 | Phase 442 | Pending |
| CI-03 | Phase 442 | Pending |
| DIST-01 | Phase 443 | Pending |
| DIST-02 | Phase 443 | Pending |
| DIST-03 | Phase 443 | Pending |
| DIST-04 | Phase 443 | Pending |

**Coverage:**
- v1 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 after roadmap creation*
