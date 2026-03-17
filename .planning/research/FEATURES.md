# Feature Landscape

**Domain:** SEO/AEO 최적화 (정적 GitHub Pages 사이트 확장)
**Researched:** 2026-03-17

## 현재 상태 (이미 구축됨)

| 기존 기능 | 상태 | 비고 |
|-----------|------|------|
| 단일 페이지 랜딩 (CRT 터미널 테마) | 완료 | index.html 1,109줄 |
| 기본 meta tags (OG, Twitter Card) | 완료 | title/description/image |
| JSON-LD SoftwareApplication | 완료 | schema.org 타입 |
| JSON-LD FAQPage (5개 Q&A) | 완료 | 기본 FAQ |
| JSON-LD HowTo (3-step quickstart) | 완료 | 설치 가이드 |
| sitemap.xml (1 URL) | 완료 | 루트만 |
| robots.txt | 완료 | Allow: / |
| llms.txt | 완료 | 2,615자 AI 크롤러용 |
| .well-known/ai-plugin.json | 완료 | AI 플러그인 디스커버리 |
| CNAME (waiaas.ai) | 완료 | 커스텀 도메인 |
| /docs/ 마크다운 콘텐츠 | 완료 | 17개 .md 파일 (GitHub 렌더링만) |

## Table Stakes

사용자(검색엔진 + AI 엔진)가 기대하는 기능. 누락 시 검색 노출 자체가 불가능.

| Feature | 기대 이유 | Complexity | 기존 의존성 | 비고 |
|---------|-----------|------------|------------|------|
| 마크다운 -> HTML 빌드 스크립트 | /docs/ 콘텐츠가 GitHub raw 렌더링만 됨, 검색엔진은 HTML 페이지를 인덱싱 | Med | 17개 .md 파일 | Node.js 스크립트, SSG 프레임워크 불필요 |
| HTML 페이지 템플릿 | 일관된 레이아웃, head meta, nav, footer 공유 | Med | index.html CRT 테마 | 템플릿 리터럴 or 간단한 HTML 템플릿 |
| 전역 네비게이션 | 멀티 페이지 사이트에서 페이지 간 이동 필수 | Low | 단일 페이지라 없음 | header nav bar, 모바일 반응형 |
| 확장된 sitemap.xml | 모든 HTML 페이지 자동 등록, 검색엔진 크롤링 필수 | Low | 기존 1 URL sitemap | 빌드 스크립트에서 자동 생성 |
| 페이지별 meta tags | 각 페이지 고유 title/description/canonical, 검색 결과 표시 품질 | Low | 기존 루트 페이지만 | 마크다운 frontmatter에서 추출 |
| 페이지별 OG/Twitter Card | SNS 공유 시 미리보기, 외부 분배 필수 | Low | 기존 루트만 | og:title, og:description, og:url |
| Blog 섹션 | why-waiaas 4편 + guides 5편 = 기존 콘텐츠 웹 발행 | Low | docs/ 마크다운 | URL: /blog/{slug}/ |
| Docs 섹션 | architecture, security-model, api-reference 등 기술 문서 웹 발행 | Low | docs/ 마크다운 | URL: /docs/{slug}/ |

## Differentiators

경쟁 프로젝트 대비 차별점. 기대되진 않지만, 있으면 SEO/AEO 순위를 결정적으로 끌어올림.

| Feature | 가치 | Complexity | 기존 의존성 | 비고 |
|---------|------|------------|------------|------|
| SEO 랜딩 페이지 (카테고리 정의) | "AI wallet" 키워드 카테고리 자체를 정의하는 long-form 콘텐츠 -- 검색 의도에 직접 응답 | Med | why-waiaas 콘텐츠 소스 | /what-is-ai-wallet/ 등 2-3개 전용 페이지 |
| 확장된 JSON-LD 구조화 데이터 | Article/TechArticle/BreadcrumbList 등 페이지 타입별 스키마 -- AI 엔진 인용 확률 증가 | Med | 기존 SoftwareApplication + FAQ | 페이지별 자동 주입 |
| FAQ 대규모 확장 | 5개 -> 20-30개 Q&A -- AEO 40-word rule 적용, AI 엔진이 직접 인용 가능한 응답 | Med | 기존 5개 FAQ | 카테고리별 분류 (설치/보안/DeFi/체인) |
| llms-full.txt | llms.txt의 확장판 -- 전체 문서 내용을 LLM이 단일 요청으로 소화 가능한 형태 제공 | Low | 기존 llms.txt | llms.txt에서 링크, 빌드 시 생성 |
| AI 디렉토리 등록 자료 패키지 | 등록용 description/screenshot/category 통일 세트 -- 10+ 디렉토리 일괄 등록 | Low | 기존 OG 이미지 | SUBMISSION_KIT.md |
| Comparison 페이지 | "WAIaaS vs Lit Protocol", "WAIaaS vs Turnkey" 등 -- 경쟁 키워드 포착 | Med | why-waiaas/002 비교 콘텐츠 | /compare/{competitor}/ |
| 커뮤니티 포스팅 초안 | Reddit/HN/Discord/Twitter 용 포맷별 초안 -- 외부 백링크 확보 가속 | Low | 없음 | 마크다운 초안 파일 |
| BreadcrumbList JSON-LD | 검색 결과에 경로 표시 (waiaas.ai > Blog > Article) -- 클릭률 증가 | Low | 없음 | 모든 서브 페이지에 자동 적용 |

## Anti-Features

명시적으로 만들지 않을 것.

| Anti-Feature | 회피 이유 | 대안 |
|--------------|----------|------|
| SSG 프레임워크 도입 (Jekyll/Hugo/Astro) | 의존성 과잉, GitHub Pages 순수 HTML 컨셉 파괴, 빌드 복잡도 증가 | Node.js 단일 빌드 스크립트 (marked + 템플릿 리터럴) |
| SPA 라우팅 (React/Preact) | CSR은 SEO 불리, 크롤러가 JS 실행 필요, 기존 CRT 테마와 충돌 | 정적 HTML 멀티 페이지 |
| 서버 사이드 렌더링 | GitHub Pages는 정적 호스팅만 지원 | 빌드 타임 HTML 생성 |
| CMS 통합 | 오버엔지니어링, 마크다운 직접 편집이 충분 | Git 기반 콘텐츠 관리 |
| Google Analytics | 프라이버시 우려, 로딩 성능 영향, 초기 트래픽에서 불필요 | 없음 (또는 추후 privacy-friendly 대안) |
| 자동 번역 (i18n) | 콘텐츠가 영어 타깃, 번역 품질 관리 비용 과다 | 영어 단일 언어 |
| 댓글 시스템 | 정적 사이트에 동적 요소 불필요, 스팸 관리 부담 | GitHub Discussions 링크 |
| A/B 테스팅 | 초기 트래픽 없이 통계적 유의미성 불가 | 수동 콘텐츠 최적화 |

## Feature Dependencies

```
마크다운 -> HTML 빌드 스크립트 ---+---> HTML 페이지 템플릿
                                +---> 전역 네비게이션
                                +---> 확장된 sitemap.xml (자동 생성)
                                +---> 페이지별 meta tags (frontmatter 파싱)
                                +---> 페이지별 OG/Twitter Card

HTML 페이지 템플릿 ---+---> Blog 섹션 (docs/why-waiaas/ + docs/guides/)
                      +---> Docs 섹션 (docs/*.md 기술 문서)
                      +---> SEO 랜딩 페이지 (신규 콘텐츠)
                      +---> Comparison 페이지 (신규 콘텐츠)
                      +---> BreadcrumbList JSON-LD

Blog/Docs 섹션 ------+---> 확장된 JSON-LD (Article/TechArticle)
                      +---> FAQ 대규모 확장

llms.txt (기존) -----------> llms-full.txt (빌드 시 생성)

OG 이미지 (기존) ----+---> AI 디렉토리 등록 자료
                     +---> 커뮤니티 포스팅 초안
```

## 콘텐츠 매핑: 기존 마크다운 -> 웹 페이지

### Blog 섹션 (/blog/)

| 소스 파일 | 웹 URL | SEO 타깃 키워드 |
|-----------|--------|----------------|
| docs/why-waiaas/001-ai-agent-wallet-security-crisis.md | /blog/ai-agent-wallet-security-crisis/ | "AI agent wallet security" |
| docs/why-waiaas/002-ai-agent-wallet-models-compared.md | /blog/ai-agent-wallet-models-compared/ | "AI agent wallet comparison" |
| docs/why-waiaas/003-autonomous-agents-deserve-secure-wallets.md | /blog/autonomous-agents-secure-wallets/ | "autonomous AI agent wallet" |
| docs/why-waiaas/004-self-custody-means-self-hosting.md | /blog/self-custody-self-hosting/ | "self-hosted crypto wallet" |
| docs/guides/claude-code-integration.md | /blog/claude-code-wallet-integration/ | "Claude Code crypto wallet" |
| docs/guides/openclaw-integration.md | /blog/openclaw-wallet-integration/ | "OpenClaw AI agent wallet" |
| docs/guides/docker-sidecar-install.md | /blog/docker-sidecar-wallet-setup/ | "Docker AI wallet daemon" |
| docs/guides/agent-skills-integration.md | /blog/agent-skills-wallet-integration/ | "AI agent skill files" |
| docs/guides/agent-self-setup.md | /blog/agent-self-setup-wallet/ | "AI agent wallet setup" |

### Docs 섹션 (/docs/)

| 소스 파일 | 웹 URL | SEO 타깃 키워드 |
|-----------|--------|----------------|
| docs/architecture.md | /docs/architecture/ | "wallet as a service architecture" |
| docs/security-model.md | /docs/security-model/ | "AI wallet security model" |
| docs/deployment.md | /docs/deployment/ | "wallet daemon deployment" |
| docs/api-reference.md | /docs/api-reference/ | "wallet API reference" |
| docs/wallet-sdk-integration.md | /docs/wallet-sdk/ | "wallet SDK integration" |
| docs/smart-account-lite-full-guide.md | /docs/smart-account/ | "ERC-4337 smart account" |
| docs/erc-4337-sponsor-proxy-spec.md | /docs/erc4337-sponsor-proxy/ | "ERC-4337 paymaster" |
| docs/admin-manual/telegram-setup.md | /docs/telegram-setup/ | "Telegram wallet bot setup" |

### SEO 랜딩 페이지 (신규 작성)

| 페이지 | 웹 URL | 주요 키워드 | 콘텐츠 성격 |
|--------|--------|------------|------------|
| AI Wallet이란? | /what-is-ai-wallet/ | "AI wallet", "what is AI wallet" | 카테고리 정의 -- "AI wallet"이라는 개념 자체를 설명하고 WAIaaS를 대표 솔루션으로 포지셔닝 |
| AI Agent를 위한 안전한 지갑 | /ai-agent-wallet-security/ | "AI agent wallet security", "secure AI wallet" | 보안 관점 랜딩 -- 3계층 보안, default-deny, kill switch 강조 |
| MCP Wallet 통합 가이드 | /mcp-wallet/ | "MCP wallet", "model context protocol wallet" | MCP 통합 사용 사례 -- AI 에이전트가 지갑을 사용하는 구체적 시나리오 |

## JSON-LD 구조화 데이터 계획

| 페이지 유형 | Schema.org 타입 | 용도 |
|------------|----------------|------|
| 홈 (기존) | SoftwareApplication + FAQPage + HowTo | 유지 |
| Blog 글 | Article + BreadcrumbList | 검색 결과 리치 스니펫, AI 인용 |
| Docs 기술 문서 | TechArticle + BreadcrumbList | 기술 문서 특화 마크업 |
| SEO 랜딩 | WebPage + FAQPage + BreadcrumbList | 카테고리 정의 + FAQ 리치 결과 |
| Comparison | WebPage + BreadcrumbList | 비교 검색 의도 매칭 |

## AEO 최적화 전략

| 기법 | 적용 방식 | 기대 효과 |
|------|----------|----------|
| 40-word answer rule | 모든 FAQ 응답을 40단어 이내로 시작, 이후 상세 설명 | AI 엔진 직접 인용 확률 증가 |
| Question-first heading | H2/H3를 "How to...", "What is..." 형태로 구성 | AI 프롬프트 패턴 매칭 |
| Speakable 마크업 | 핵심 응답 블록에 speakable 속성 | 음성 어시스턴트 응답 소스 |
| Entity 강화 | WAIaaS를 SoftwareApplication 엔티티로 일관되게 참조 | 지식 그래프 등록 가속 |
| llms-full.txt | 전체 문서 단일 파일 -- LLM RAG 소스 | Claude/GPT가 WAIaaS 정보를 정확하게 응답 |

## MVP Recommendation

### 우선 빌드 (Phase 1-2에 해당)

1. **마크다운 -> HTML 빌드 스크립트** -- 모든 후속 기능의 기반, 이것 없이는 아무것도 배포 불가
2. **HTML 템플릿 + 네비게이션** -- 멀티 페이지 사이트의 기본 구조
3. **Blog + Docs 섹션** -- 기존 17개 .md 파일 즉시 웹 발행, 새 콘텐츠 작성 없이 페이지 수 확보
4. **확장된 sitemap.xml** -- 빌드 스크립트에 자동 생성 포함
5. **페이지별 meta/OG** -- frontmatter 파싱으로 자동 적용

### 차순위 빌드 (Phase 3에 해당)

6. **SEO 랜딩 페이지 2-3개** -- "AI wallet" 카테고리 정의 콘텐츠
7. **확장된 JSON-LD** -- Article/TechArticle/BreadcrumbList 자동 주입
8. **FAQ 확장 (20-30개)** -- 카테고리별 Q&A 대규모 추가

### Defer

- **Comparison 페이지**: 초기 트래픽 확보 후 경쟁 키워드 분석 기반으로 작성 (Phase 4+)
- **AI 디렉토리 등록 자료**: 사이트 안정화 후 일괄 등록 (Phase 5)
- **커뮤니티 포스팅 초안**: 콘텐츠 완성 후 외부 분배 (Phase 5)

## Sources

- [SEO for Static Websites: The 2026 Guide](https://simplystatic.com/tutorials/seo-for-static-websites/) -- MEDIUM confidence
- [Answer Engine Optimization: The Comprehensive Guide for 2026](https://cxl.com/blog/answer-engine-optimization-aeo-the-comprehensive-guide/) -- MEDIUM confidence
- [AEO Guide 2026](https://llmrefs.com/answer-engine-optimization) -- MEDIUM confidence
- [GitHub Pages SEO Setup Guide](https://wrigo.io/blog/github-pages-seo-setup-guide-how-to-rank-your-developer-documentation-site) -- MEDIUM confidence
- [llms.txt Guide](https://www.bluehost.com/blog/what-is-llms-txt/) -- MEDIUM confidence
- [Should Websites Implement llms.txt in 2026?](https://www.linkbuildinghq.com/blog/should-websites-implement-llms-txt-in-2026/) -- MEDIUM confidence
- [Google Structured Data Intro](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) -- HIGH confidence (official)
- [Schema.org](https://schema.org/) -- HIGH confidence (official)
- [AI Tools Directory List](https://github.com/best-of-ai/ai-directories) -- MEDIUM confidence
- Site audit: `/Users/minho.yoo/dev/wallet/WAIaaS/site/` directory direct analysis -- HIGH confidence
