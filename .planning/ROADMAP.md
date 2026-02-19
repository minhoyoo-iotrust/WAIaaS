# Roadmap: WAIaaS

## Milestones

- ✅ **v0.1-v2.0** — Phases 1-173 (shipped 2026-02-05 ~ 2026-02-18) — See milestones/ archive
- ✅ **v2.2 테스트 커버리지 강화** — Phases 178-181 (shipped 2026-02-18)
- ✅ **v2.3 Admin UI 기능별 메뉴 재구성** — Phases 182-187 (shipped 2026-02-18)
- 🚧 **v2.4 npm Trusted Publishing 전환** — Phases 188-190 (in progress)

## Phases

<details>
<summary>✅ v0.1-v2.0 (Phases 1-173) — SHIPPED 2026-02-18</summary>

See `.planning/milestones/` for archived phase details (v0.1-ROADMAP.md through v2.0-ROADMAP.md).

</details>

<details>
<summary>✅ v2.2 테스트 커버리지 강화 (Phases 178-181) — SHIPPED 2026-02-18</summary>

- [x] Phase 178: adapter-solana 브랜치 커버리지 (2/2 plans) — completed 2026-02-18
- [x] Phase 179: admin 함수 커버리지 (2/2 plans) — completed 2026-02-18
- [x] Phase 180: CLI 라인/구문 커버리지 (1/1 plan) — completed 2026-02-18
- [x] Phase 181: 임계값 검증 및 복원 (1/1 plan) — completed 2026-02-18

See `.planning/milestones/v2.2-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.3 Admin UI 기능별 메뉴 재구성 (Phases 182-187) — SHIPPED 2026-02-18</summary>

- [x] Phase 182: UI 공용 컴포넌트 (2/2 plans) — completed 2026-02-18
- [x] Phase 183: 메뉴 재구성 + 신규 페이지 (3/3 plans) — completed 2026-02-18
- [x] Phase 184: Settings 분산 배치 (2/2 plans) — completed 2026-02-18
- [x] Phase 185: UX 강화 (2/2 plans) — completed 2026-02-18
- [x] Phase 186: 마무리 (1/1 plan) — completed 2026-02-18
- [x] Phase 187: 감사 갭 수정 (1/1 plan) — completed 2026-02-18

See `.planning/milestones/v2.3-ROADMAP.md` for full details.

</details>

### 🚧 v2.4 npm Trusted Publishing 전환 (In Progress)

**Milestone Goal:** npm 패키지 발행 방식을 Classic Automation Token(NPM_TOKEN)에서 OIDC Trusted Publishing으로 전환하여, 장기 시크릿 없이 GitHub Actions가 직접 npm에 인증하고 provenance 배지를 확보하는 supply chain 보안 강화 상태.

- [x] **Phase 188: 사전 준비** - repository.url 수정 + npm CLI 버전 확보
- [x] **Phase 189: OIDC 전환** - npmjs.com Trusted Publisher 등록 + release.yml 수정 (completed 2026-02-19)
- [ ] **Phase 190: 검증 및 정리** - E2E 릴리스 검증 + NPM_TOKEN 제거

## Phase Details

### Phase 188: 사전 준비
**Goal**: Trusted Publishing 전환의 선행 조건인 패키지 메타데이터 정합성과 npm CLI 버전 요구사항이 확보된 상태
**Depends on**: Nothing (first phase of v2.4)
**Requirements**: PREP-01, PREP-02, PREP-03
**Success Criteria** (what must be TRUE):
  1. 9개 package.json의 repository.url이 실제 GitHub 원격(`minhoyoo-iotrust/WAIaaS`)과 일치한다
  2. 8개 패키지의 repository.directory 필드가 실제 패키지 경로와 일치한다
  3. release.yml deploy 잡에서 npm CLI >= 11.5.1이 사용 가능하다 (업그레이드 스텝 추가 또는 번들 버전 확인)
**Plans**: 1 plan

Plans:
- [x] 188-01-PLAN.md -- package.json repository 필드 수정 + release.yml npm CLI 버전 보장

### Phase 189: OIDC 전환
**Goal**: npmjs.com에 Trusted Publisher가 등록되고, release.yml deploy 잡이 OIDC 인증 + provenance 서명으로 패키지를 발행하는 상태
**Depends on**: Phase 188
**Requirements**: OIDC-01, OIDC-02, OIDC-03, OIDC-04, OIDC-05
**Success Criteria** (what must be TRUE):
  1. npmjs.com에서 8개 패키지 모두 Trusted Publisher로 등록되어 있다 (repo: minhoyoo-iotrust/WAIaaS, workflow: release.yml, environment: production)
  2. release.yml deploy 잡이 `id-token: write` + `contents: read` 퍼미션을 갖는다
  3. deploy 잡에서 npm publish --provenance --access public 으로 발행한다 (pnpm publish + NODE_AUTH_TOKEN 제거됨)
  4. publish-check 잡은 기존 pnpm publish --dry-run을 그대로 유지한다 (--provenance 없음)
**Plans**: 2 plans

Plans:
- [ ] 189-01-PLAN.md -- npmjs.com Trusted Publisher 수동 등록 (8개 패키지, checkpoint:human-action)
- [ ] 189-02-PLAN.md -- release.yml deploy 잡 OIDC 전환 (permissions + npmrc 제거 + npm publish --provenance)

### Phase 190: 검증 및 정리
**Goal**: OIDC 전환이 실제 릴리스로 E2E 검증되고, 장기 시크릿(NPM_TOKEN)이 완전 제거된 supply chain 보안 강화 완료 상태
**Depends on**: Phase 189
**Requirements**: VERIFY-01, VERIFY-02, VERIFY-03, VERIFY-04
**Success Criteria** (what must be TRUE):
  1. 실제 릴리스(rc 또는 stable)로 8개 패키지가 OIDC 인증으로 발행에 성공한다
  2. npmjs.com 패키지 페이지에 "Built and signed on GitHub Actions" provenance 배지가 표시된다
  3. GitHub Secrets에서 NPM_TOKEN 시크릿이 제거되어 있다
  4. Deploy summary에 provenance 정보(소스 저장소, 커밋, 워크플로 링크)가 포함된다
**Plans**: 1 plan

Plans:
- [ ] 190-01-PLAN.md -- Deploy summary provenance 강화 + E2E 릴리스 검증 + NPM_TOKEN 제거

## Progress

**Execution Order:**
Phases execute in numeric order: 188 → 189 → 190

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-173 | v0.1-v2.0 | — | Complete | 2026-02-18 |
| 178-181 | v2.2 | 6/6 | Complete | 2026-02-18 |
| 182-187 | v2.3 | 11/11 | Complete | 2026-02-18 |
| 188. 사전 준비 | v2.4 | Complete    | 2026-02-18 | 2026-02-19 |
| 189. OIDC 전환 | v2.4 | Complete    | 2026-02-19 | - |
| 190. 검증 및 정리 | v2.4 | 0/1 | Not started | - |
