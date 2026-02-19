# Roadmap: WAIaaS

## Milestones

- ✅ **v0.1-v2.0** — Phases 1-173 (shipped 2026-02-05 ~ 2026-02-18) — See milestones/ archive
- ✅ **v2.2 테스트 커버리지 강화** — Phases 178-181 (shipped 2026-02-18)
- ✅ **v2.3 Admin UI 기능별 메뉴 재구성** — Phases 182-187 (shipped 2026-02-18)
- ✅ **v2.4 npm Trusted Publishing 전환** — Phases 188-190 (shipped 2026-02-19)
- 🚧 **v2.4.1 Admin UI 테스트 커버리지 복원** — Phases 191-193 (in progress)

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

<details>
<summary>✅ v2.4 npm Trusted Publishing 전환 (Phases 188-190) — SHIPPED 2026-02-19</summary>

- [x] Phase 188: 사전 준비 (1/1 plan) — completed 2026-02-19
- [x] Phase 189: OIDC 전환 (2/2 plans) — completed 2026-02-19
- [x] Phase 190: 검증 및 정리 (1/1 plan) — completed 2026-02-19

See `.planning/milestones/v2.4-ROADMAP.md` for full details.

</details>

### 🚧 v2.4.1 Admin UI 테스트 커버리지 복원 (In Progress)

**Milestone Goal:** v2.3 Admin UI 메뉴 재구성으로 하락한 테스트 커버리지를 70%로 복원. 신규 페이지(security, system, walletconnect) 테스트 작성, 공용 컴포넌트 테스트 추가, 기존 페이지 테스트 개선을 통해 커버리지 임계값을 원래 수준으로 되돌리고 CI 게이트를 통과시킨다.

- [x] **Phase 191: Security + WalletConnect 페이지 테스트** - security.tsx 4개 탭 + walletconnect.tsx 전체 테스트 작성 (completed 2026-02-19)
- [ ] **Phase 192: System 페이지 테스트** - system.tsx 5개 탭(Daemon/AutoStop/Monitoring/API Keys) 전체 테스트 작성
- [ ] **Phase 193: 공용 컴포넌트 + 기존 페이지 개선 + 임계값 복원** - 공용 컴포넌트 5개 테스트 + 기존 3페이지 개선 + 70% 게이트 복원

## Phase Details

### Phase 191: Security + WalletConnect 페이지 테스트
**Goal**: security.tsx와 walletconnect.tsx 페이지의 모든 사용자 인터랙션이 테스트로 검증된 상태 달성
**Depends on**: Nothing (첫 번째 페이지, 다른 페이지와 독립)
**Requirements**: NEWPG-01, NEWPG-02, NEWPG-03, NEWPG-04, NEWPG-10, NEWPG-11, NEWPG-12
**Success Criteria** (what must be TRUE):
  1. security.tsx 테스트 파일이 존재하고 4개 탭(Kill Switch/JWT Rotation/Danger Zone + 네비게이션) 각각에 대한 테스트가 통과한다
  2. Kill Switch 활성화/비활성화 버튼 클릭 시 API 호출과 UI 상태 변경이 테스트로 검증된다
  3. walletconnect.tsx 테스트 파일이 존재하고 설정 폼, 페어링/세션 목록, 미설정 안내 UI가 각각 테스트로 검증된다
  4. 두 페이지 테스트 모두 `pnpm --filter @waiaas/admin test:unit` 실행 시 통과한다
**Plans**: 2 plans

Plans:
- [ ] 191-01-PLAN.md — security.tsx 테스트 (렌더링 + 탭 네비게이션 + Kill Switch + AutoStop + JWT Rotation)
- [ ] 191-02-PLAN.md — walletconnect.tsx 테스트 (테이블 렌더링 + Connect/Disconnect + QR 모달 + empty state)

### Phase 192: System 페이지 테스트
**Goal**: system.tsx 페이지의 5개 탭(Daemon/AutoStop/Monitoring/API Keys + 네비게이션) 전체가 테스트로 검증된 상태 달성
**Depends on**: Phase 191 (테스트 패턴과 mock 설정 재사용)
**Requirements**: NEWPG-05, NEWPG-06, NEWPG-07, NEWPG-08, NEWPG-09
**Success Criteria** (what must be TRUE):
  1. system.tsx 테스트 파일이 존재하고 탭 네비게이션(4개 탭 전환)이 테스트로 검증된다
  2. Daemon 설정 폼 입력/제출/에러 처리가 테스트로 검증된다
  3. AutoStop 토글과 Monitoring 설정 폼의 저장 흐름이 테스트로 검증된다
  4. API Keys CRUD(생성/목록/삭제) 전체 흐름이 테스트로 검증된다
  5. 모든 system.tsx 테스트가 `pnpm --filter @waiaas/admin test:unit` 실행 시 통과한다
**Plans**: TBD

Plans:
- [ ] 192-01: system.tsx 테스트 작성 (렌더링 + 탭 네비게이션 + Daemon 설정 + AutoStop + Monitoring + API Keys CRUD)

### Phase 193: 공용 컴포넌트 + 기존 페이지 개선 + 임계값 복원
**Goal**: 공용 컴포넌트 테스트 완비, 기존 페이지 커버리지 개선, 70% 임계값 복원으로 CI 게이트 통과 상태 달성
**Depends on**: Phase 192 (신규 페이지 테스트 완료 후 나머지 커버리지 갭 확인)
**Requirements**: COMP-01, COMP-02, COMP-03, COMP-04, COMP-05, EXIST-01, EXIST-02, EXIST-03, INFRA-01, INFRA-02
**Success Criteria** (what must be TRUE):
  1. empty-state, unsaved-dialog, settings-search, policy-rules-summary, dirty-guard 5개 공용 컴포넌트 각각에 테스트 파일이 존재하고 통과한다
  2. notifications.tsx, sessions.tsx, wallets.tsx 기존 테스트의 커버리지가 개선되어 미검증 분기가 감소한다
  3. vitest.config.ts의 lines/statements/functions 임계값이 70%로 설정되어 있다
  4. `pnpm turbo run lint && pnpm turbo run typecheck && pnpm --filter @waiaas/admin test:unit` 전체 통과한다

**Plans**: TBD

Plans:
- [ ] 193-01: 공용 컴포넌트 테스트 작성 (empty-state + unsaved-dialog + settings-search + policy-rules-summary + dirty-guard)
- [ ] 193-02: 기존 페이지 테스트 개선 + 임계값 복원 + CI 검증

## Progress

**Execution Order:** 191 -> 192 -> 193

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-173 | v0.1-v2.0 | — | Complete | 2026-02-18 |
| 178-181 | v2.2 | 6/6 | Complete | 2026-02-18 |
| 182-187 | v2.3 | 11/11 | Complete | 2026-02-18 |
| 188-190 | v2.4 | 4/4 | Complete | 2026-02-19 |
| 191 | 2/2 | Complete   | 2026-02-19 | - |
| 192 | v2.4.1 | 0/1 | Not started | - |
| 193 | v2.4.1 | 0/2 | Not started | - |
