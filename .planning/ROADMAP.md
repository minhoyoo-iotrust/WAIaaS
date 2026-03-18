# Roadmap: WAIaaS

## Milestones

- ✅ **v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글** — Phases 432-434 (shipped 2026-03-16)
- ✅ **v32.6 성능 + 구조 개선** — Phases 435-438 (shipped 2026-03-17)
- ✅ **v32.7 SEO/AEO 최적화** — Phases 439-443 (shipped 2026-03-17)
- ✅ **v32.8 테스트 커버리지 강화** — Phases 444-448.1 (shipped 2026-03-18)
- ✅ **v32.9 Push Relay 직접 연동 (ntfy.sh 제거)** — Phases 449-451 (shipped 2026-03-18)
- [ ] **v32.10 에이전트 스킬 정리 + OpenClaw 플러그인** — Phases 452-455 (in progress)

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

<details>
<summary>✅ v32.7 SEO/AEO 최적화 (Phases 439-443) — SHIPPED 2026-03-17</summary>

- [x] Phase 439: Build Infrastructure (1/1 plan) — completed 2026-03-17
- [x] Phase 440: Content Publishing + Navigation (1/1 plan) — completed 2026-03-17
- [x] Phase 441: Technical SEO & AEO (2/2 plans) — completed 2026-03-17
- [x] Phase 442: CI Integration (1/1 plan) — completed 2026-03-17
- [x] Phase 443: SEO Landing Pages + External Distribution (2/2 plans) — completed 2026-03-17

</details>

See `.planning/milestones/v32.7-ROADMAP.md` for full details.

<details>
<summary>✅ v32.8 테스트 커버리지 강화 (Phases 444-448.1) — SHIPPED 2026-03-18</summary>

- [x] Phase 444: daemon DeFi Provider + Pipeline 테스트 강화 (3/3 plans) — completed 2026-03-17
- [x] Phase 445: daemon Infra + Admin API + Notification 테스트 (3/3 plans) — completed 2026-03-17
- [x] Phase 446: evm Branches + wallet-sdk Branches 강화 (2/2 plans) — completed 2026-03-17
- [x] Phase 447: admin Functions + cli Lines/Branches 강화 (3/3 plans) — completed 2026-03-17
- [x] Phase 448: sdk + shared + 나머지 패키지 + 임계값 최종 인상 (3/3 plans) — completed 2026-03-17
- [x] Phase 448.1: 커버리지 갭 클로저 (3/3 plans) — completed 2026-03-18

</details>

See `.planning/milestones/v32.8-ROADMAP.md` for full details.

<details>
<summary>✅ v32.9 Push Relay 직접 연동 (ntfy.sh 제거) (Phases 449-451) — SHIPPED 2026-03-18</summary>

- [x] Phase 449: Foundation -- Core 타입 + DB 마이그레이션 + Push Relay 서버 (3/3 plans) — completed 2026-03-18
- [x] Phase 450: Daemon 서명 채널 재작성 (2/2 plans) — completed 2026-03-18
- [x] Phase 451: 클라이언트 업데이트 -- SDK deprecated + Admin UI (2/2 plans) — completed 2026-03-18

</details>

See `.planning/milestones/v32.9-ROADMAP.md` for full details.

## Phases

- [x] **Phase 452: Document Structure Rename** - docs/guides/ 를 docs/agent-guides/ 로 이름 변경하고 모든 참조를 업데이트한다
- [x] **Phase 453: Skills Cleanup + Admin Manual** - masterAuth 콘텐츠를 docs/admin-manual/ 로 추출하고 스킬 파일을 sessionAuth 전용으로 정리한다 (completed 2026-03-18)
- [ ] **Phase 454: OpenClaw Plugin Package** - @waiaas/openclaw-plugin 패키지를 구현하고 ~22개 sessionAuth 도구를 등록한다
- [ ] **Phase 455: CI/CD, Documentation, SEO** - release-please 통합, 문서 업데이트, SEO 랜딩 페이지, npm 퍼블리시 준비를 완료한다

## Phase Details

### Phase 452: Document Structure Rename
**Goal**: docs/guides/ 경로가 docs/agent-guides/ 로 변경되어 에이전트 가이드와 관리자 매뉴얼의 디렉토리 분리 기반이 마련된다
**Depends on**: Nothing (first phase)
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04
**Success Criteria** (what must be TRUE):
  1. docs/agent-guides/ 디렉토리에 기존 5개 가이드 파일이 모두 존재한다
  2. README.md 내 docs/guides/ 참조가 0건이고 docs/agent-guides/ 로 업데이트되어 있다
  3. site/index.html 내 docs/guides GitHub 링크가 docs/agent-guides/ 를 가리킨다
  4. 코드베이스 전체에서 docs/guides/ 참조가 0건이다 (아카이브 파일 제외)
**Plans**: 1 plan

Plans:
- [ ] 452-01-PLAN.md — docs/guides/ -> docs/agent-guides/ 이름 변경 + 전체 참조 업데이트

### Phase 453: Skills Cleanup + Admin Manual
**Goal**: 에이전트 스킬 파일이 sessionAuth 전용이 되고, masterAuth 콘텐츠가 docs/admin-manual/ 8개 파일로 이전된다
**Depends on**: Phase 452
**Requirements**: DOC-05, DOC-06, DOC-07, DOC-08, DOC-09, DOC-10, DOC-11, DOC-12, DOC-13, DOC-14, DOC-15, SKL-01, SKL-02, SKL-03, SKL-04, SKL-05, SKL-06, SKL-07, SKL-08, SKL-09, SKL-10, SKL-11, SKL-12
**Success Criteria** (what must be TRUE):
  1. docs/admin-manual/ 에 README.md 인덱스 + 8개 매뉴얼 파일이 존재하고 각 파일에 frontmatter(title, description, keywords)가 있다
  2. skills/ 디렉토리에 admin.skill.md 와 setup.skill.md 가 존재하지 않는다
  3. skills/ 디렉토리 내 모든 파일에서 masterAuth 엔드포인트 참조가 0건이다 (보안 안내 문구 제외)
  4. site/build.mjs EXCLUDE_DIRS 에서 admin-manual 이 제거되어 빌드 대상에 포함된다
  5. sync-skills.mjs 가 admin/setup 스킬을 복사하지 않고, openclaw.ts 인스톨러에서 WAIAAS_MASTER_PASSWORD 출력이 없다
**Plans**: 2 plans

Plans:
- [ ] 453-01-PLAN.md — docs/admin-manual/ 9개 파일 생성 + site/build.mjs EXCLUDE_DIRS 제거
- [ ] 453-02-PLAN.md — skills/ masterAuth 콘텐츠 제거 + 레지스트리/인스톨러 업데이트

### Phase 454: OpenClaw Plugin Package
**Goal**: @waiaas/openclaw-plugin 패키지가 ~22개 sessionAuth 도구를 OpenClaw Gateway에 등록할 수 있다
**Depends on**: Phase 453
**Requirements**: OCP-01, OCP-02, OCP-03, OCP-04, OCP-05, OCP-06, OCP-07, OCP-08, OCP-09, OCP-10, OCP-11, OCP-12, OCP-13
**Success Criteria** (what must be TRUE):
  1. openclaw.plugin.json 매니페스트가 유효하고 configSchema 에 sessionToken, daemonUrl 이 정의되어 있다
  2. register() 함수가 동기적으로 ~22개 sessionAuth 도구를 api.registerTool() 로 등록하고 masterAuth 도구는 등록하지 않는다
  3. 각 도구 그룹(Wallet, Transfer, DeFi, NFT, Utility)이 올바른 inputSchema 와 함께 등록된다
  4. 도구 핸들러가 @waiaas/sdk 를 통해 WAIaaS daemon API 를 정상 호출한다
  5. 패키지가 빌드되어 dist/ 출력물이 생성된다
**Plans**: TBD

Plans:
- [ ] 454-01: TBD
- [ ] 454-02: TBD

### Phase 455: CI/CD, Documentation, SEO
**Goal**: @waiaas/openclaw-plugin 이 npm 퍼블리시 파이프라인에 통합되고, 문서와 SEO 자산이 완성된다
**Depends on**: Phase 454
**Requirements**: CID-01, CID-02, CID-03, CID-04, CID-05, CID-06, CID-07, CID-08, CID-09
**Success Criteria** (what must be TRUE):
  1. release-please-config.json 과 .release-please-manifest.json 에 openclaw-plugin 이 등록되어 있다
  2. turbo.json 에 openclaw-plugin 빌드/테스트/린트 태스크가 포함되고 npm trusted publishing 파이프라인에서 퍼블리시 가능하다
  3. openclaw-integration.md 가 플러그인 방식(권장) + 스킬 방식(레거시) 구조로 업데이트되고 admin/setup 스킬 참조가 없다
  4. sitemap.xml 에 admin-manual 8페이지 + openclaw-plugin 페이지가 포함되고 llms-full.txt 에 admin-manual 내용이 포함된다
**Plans**: TBD

Plans:
- [ ] 455-01: TBD
- [ ] 455-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 452 -> 453 -> 454 -> 455

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 432. Interface Extension | v32.5 | 2/2 | Complete | 2026-03-16 |
| 433. Multichain Positions | v32.5 | 4/4 | Complete | 2026-03-16 |
| 434. Testnet Toggle | v32.5 | 2/2 | Complete | 2026-03-16 |
| 435. N+1 쿼리 해소 | v32.6 | 2/2 | Complete | 2026-03-17 |
| 436. 페이지네이션 추가 | v32.6 | 2/2 | Complete | 2026-03-17 |
| 437. 대형 파일 분할 | v32.6 | 3/3 | Complete | 2026-03-17 |
| 438. 파이프라인 분할 + 추가 정리 | v32.6 | 2/2 | Complete | 2026-03-17 |
| 439. Build Infrastructure | v32.7 | 1/1 | Complete | 2026-03-17 |
| 440. Content Publishing | v32.7 | 1/1 | Complete | 2026-03-17 |
| 441. Technical SEO & AEO | v32.7 | 2/2 | Complete | 2026-03-17 |
| 442. CI Integration | v32.7 | 1/1 | Complete | 2026-03-17 |
| 443. SEO Landing Pages | v32.7 | 2/2 | Complete | 2026-03-17 |
| 444. DeFi Provider Tests | v32.8 | 3/3 | Complete | 2026-03-17 |
| 445. Infra Tests | v32.8 | 3/3 | Complete | 2026-03-17 |
| 446. EVM/SDK Branches | v32.8 | 2/2 | Complete | 2026-03-17 |
| 447. Admin/CLI Tests | v32.8 | 3/3 | Complete | 2026-03-17 |
| 448. SDK/Shared Tests | v32.8 | 3/3 | Complete | 2026-03-17 |
| 448.1. 커버리지 갭 클로저 | v32.8 | 3/3 | Complete | 2026-03-18 |
| 449. Foundation | v32.9 | 3/3 | Complete | 2026-03-18 |
| 450. Daemon 서명 채널 재작성 | v32.9 | 2/2 | Complete | 2026-03-18 |
| 451. 클라이언트 업데이트 | v32.9 | 2/2 | Complete | 2026-03-18 |
| 452. Document Structure Rename | v32.10 | Complete    | 2026-03-18 | 2026-03-18 |
| 453. Skills Cleanup + Admin Manual | v32.10 | Complete    | 2026-03-18 | 2026-03-18 |
| 454. OpenClaw Plugin Package | v32.10 | 0/? | Not started | - |
| 455. CI/CD, Documentation, SEO | v32.10 | 0/? | Not started | - |
