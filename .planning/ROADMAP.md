# Roadmap: WAIaaS

## Milestones

- ✅ **v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글** — Phases 432-434 (shipped 2026-03-16)
- ✅ **v32.6 성능 + 구조 개선** — Phases 435-438 (shipped 2026-03-17)
- [ ] **v32.7 SEO/AEO 최적화** — Phases 439-443

<details>
<summary>✅ v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글 (Phases 432-434) — SHIPPED 2026-03-16</summary>

- [x] Phase 432: Interface Extension (2/2 plans) — completed 2026-03-16
- [x] Phase 433: Multichain Positions (4/4 plans) — completed 2026-03-16
- [x] Phase 434: Testnet Toggle (2/2 plans) — completed 2026-03-16

</details>

See `.planning/milestones/v32.5-ROADMAP.md` for full details.

<details>
<summary>✅ v32.6 성능 + 구조 개선 (Phases 435-438) — SHIPPED 2026-03-17</summary>

- [x] Phase 435: N+1 쿼리 해소 (2/2 plans) — completed 2026-03-17
- [x] Phase 436: 페이지네이션 추가 (2/2 plans) — completed 2026-03-17
- [x] Phase 437: 대형 파일 분할 (3/3 plans) — completed 2026-03-17
- [x] Phase 438: 파이프라인 분할 + 추가 정리 (2/2 plans) — completed 2026-03-17

</details>

See `.planning/milestones/v32.6-ROADMAP.md` for full details.

## Phases

**Phase Numbering:**
- Integer phases (439, 440, ...): Planned milestone work
- Decimal phases (439.1, 439.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 439: Build Infrastructure** - 마크다운-to-HTML 빌드 스크립트, HTML 템플릿, article CSS 구축 (completed 2026-03-17)
- [x] **Phase 440: Content Publishing + Navigation** - 기존 문서 Blog/Docs 섹션 발행 및 네비게이션 연결 (completed 2026-03-17)
- [ ] **Phase 441: Technical SEO & AEO** - sitemap, JSON-LD, FAQ 확장, llms-full.txt, 내부 링크
- [ ] **Phase 442: CI Integration** - GitHub Actions 빌드 스텝, 자동 재빌드, .gitignore
- [ ] **Phase 443: SEO Landing Pages + External Distribution** - AI wallet 카테고리 랜딩 페이지 신규 작성 및 배포 자료 준비

## Phase Details

### Phase 439: Build Infrastructure
**Goal**: 마크다운 파일을 front-matter 기반으로 HTML 페이지로 변환하는 빌드 파이프라인이 동작한다
**Depends on**: Nothing (first phase)
**Requirements**: BUILD-01, BUILD-02, BUILD-03, BUILD-04, BUILD-05, BUILD-06
**Success Criteria** (what must be TRUE):
  1. `node site/build.mjs` 실행 시 `docs/` 마크다운 파일이 CRT 테마 HTML 페이지로 변환된다
  2. 필수 front-matter(title, description, date) 누락 시 빌드가 에러와 함께 중단된다
  3. 생성된 HTML이 clean URL 패턴(directory/index.html)을 따른다
  4. 코드 블록에 구문 강조가 적용되고, article 영역이 긴 콘텐츠에서 가독성을 유지한다
**Plans**: 1 plan

Plans:
- [x] 439-01: 빌드 스크립트 + HTML 템플릿 + article CSS

### Phase 440: Content Publishing + Navigation
**Goal**: 기존 문서가 Blog/Docs 섹션 웹 페이지로 발행되고, 네비게이션으로 탐색할 수 있다
**Depends on**: Phase 439
**Requirements**: CONT-01, CONT-02, CONT-03, CONT-04, CONT-05, CONT-06, CONT-07, NAV-01, NAV-02, NAV-03
**Success Criteria** (what must be TRUE):
  1. Why WAIaaS 4편과 Guides가 Blog 섹션(/blog/)에, 기술 문서가 Docs 섹션(/docs/)에 HTML 페이지로 존재한다
  2. Blog 목록 페이지가 글 목록과 요약을 표시하고, Docs 목록 페이지가 카테고리별 문서를 표시한다
  3. 메인페이지 nav에 Blog/Docs 링크가 있고, 서브페이지에서 현재 섹션이 active 표시된다
  4. 각 페이지에 title, description, canonical, OG 메타 태그가 설정되고, 코드 블록/테이블/링크가 정확히 렌더링된다
  5. 모든 내부 링크가 유효하다 (404 없음)
**Plans**: 1 plan

Plans:
- [x] 440-01: Blog/Docs 목록 페이지 생성, 네비게이션 통합, 내부 링크 검증

### Phase 441: Technical SEO & AEO
**Goal**: 검색 엔진과 AI 답변 엔진이 모든 페이지를 정확히 인덱싱하고 인용할 수 있다
**Depends on**: Phase 440
**Requirements**: TSEO-01, TSEO-02, TSEO-03, TSEO-04, TSEO-05, TSEO-06
**Success Criteria** (what must be TRUE):
  1. sitemap.xml이 전체 페이지 URL을 자동 반영하고 canonical URL과 일치한다
  2. 각 페이지에 타입별(Article/TechArticle/BreadcrumbList) JSON-LD 스키마가 포함된다
  3. 홈페이지 FAQ가 20개 이상 Q&A로 확장되고 FAQPage 스키마를 포함한다
  4. llms-full.txt가 전체 콘텐츠를 포함하여 자동 생성되고, 페이지 간 pillar-cluster 내부 링크가 설정된다
**Plans**: TBD

Plans:
- [ ] 441-01: sitemap, JSON-LD, canonical 자동 생성
- [ ] 441-02: FAQ 확장 + llms-full.txt + 내부 링크 구조

### Phase 442: CI Integration
**Goal**: docs/ 변경 시 자동으로 HTML이 빌드되어 GitHub Pages에 배포된다
**Depends on**: Phase 441
**Requirements**: CI-01, CI-02, CI-03
**Success Criteria** (what must be TRUE):
  1. pages.yml에 Node.js 빌드 스텝이 포함되어 push 시 HTML이 자동 생성된다
  2. docs/** 변경 시 자동 재빌드가 트리거된다
  3. 생성된 HTML 파일이 .gitignore에 등록되어 리포지토리에 커밋되지 않는다
**Plans**: TBD

Plans:
- [ ] 442-01: GitHub Actions 빌드 스텝 + .gitignore 설정

### Phase 443: SEO Landing Pages + External Distribution
**Goal**: "AI wallet" 카테고리를 정의하는 SEO 랜딩 페이지가 발행되고, 외부 디렉토리 등록 자료가 준비된다
**Depends on**: Phase 442
**Requirements**: SEO-01, SEO-02, SEO-03, SEO-04, DIST-01, DIST-02, DIST-03, DIST-04
**Success Criteria** (what must be TRUE):
  1. "What is an AI Wallet", "AI Agent Wallet Security", "MCP Wallet" 3개 랜딩 페이지가 생성되어 빌드 파이프라인으로 배포 가능하다
  2. 각 SEO 랜딩 페이지에 targeted meta description, keywords, AEO Question-Answer 구조가 적용된다
  3. SUBMISSION_KIT.md에 프로젝트 설명/카테고리/태그가 포함되고, 플랫폼별 등록 체크리스트가 작성된다
  4. MCP directory 등록 정보가 최신화되고, 커뮤니티 포스팅 초안(HN, Reddit)이 준비된다
**Plans**: TBD

Plans:
- [ ] 443-01: SEO 랜딩 페이지 3종 작성
- [ ] 443-02: 외부 배포 자료 준비 (SUBMISSION_KIT, 포스팅 초안)

## Progress

**Execution Order:**
Phases execute in numeric order: 439 → 440 → 441 → 442 → 443

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 439. Build Infrastructure | 1/1 | Complete    | 2026-03-17 |
| 440. Content Publishing + Navigation | 1/1 | Complete    | 2026-03-17 |
| 441. Technical SEO & AEO | 0/2 | Not started | - |
| 442. CI Integration | 0/1 | Not started | - |
| 443. SEO Landing Pages + External Distribution | 0/2 | Not started | - |
