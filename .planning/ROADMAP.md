# Roadmap: WAIaaS

## Milestones

- ✅ **v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글** — Phases 432-434 (shipped 2026-03-16)
- ✅ **v32.6 성능 + 구조 개선** — Phases 435-438 (shipped 2026-03-17)
- ✅ **v32.7 SEO/AEO 최적화** — Phases 439-443 (shipped 2026-03-17)
- ✅ **v32.8 테스트 커버리지 강화** — Phases 444-448.1 (shipped 2026-03-18)
- ✅ **v32.9 Push Relay 직접 연동 (ntfy.sh 제거)** — Phases 449-451 (shipped 2026-03-18)
- ✅ **v32.10 에이전트 스킬 정리 + OpenClaw 플러그인** — Phases 452-455 (shipped 2026-03-18)
- ✅ **v33.0 Desktop App 아키텍처 재설계** — Phases 456-458 (shipped 2026-03-31)
- ✅ **v33.2 Tauri Desktop App** — Phases 459-463 (shipped 2026-04-01)
- ✅ **v33.3 Desktop App 배포 채널 확장** — Phases 464-466 (shipped 2026-04-01)
- 🚧 **v33.4 서명 앱 명시적 선택** — Phases 467-469 (in progress)

<details>
<summary>✅ v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글 (Phases 432-434) — SHIPPED 2026-03-16</summary>

- [x] Phase 432: Interface Extension (2/2 plans) — completed 2026-03-16
- [x] Phase 433: Multichain Positions (4/4 plans) — completed 2026-03-16
- [x] Phase 434: Testnet Toggle (2/2 plans) — completed 2026-03-16

</details>

See `.planning/milestones/v32.5-ROADMAP.md` for full details.

<details>
<summary>✅ v32.6 성능 + 구조 개선 (Phases 435-438) — SHIPPED 2026-03-17</summary>

- [x] Phase 435-438: 4 phases completed — 2026-03-17

</details>

See `.planning/milestones/v32.6-ROADMAP.md` for full details.

<details>
<summary>✅ v32.7 SEO/AEO 최적화 (Phases 439-443) — SHIPPED 2026-03-17</summary>

- [x] Phase 439-443: 5 phases completed — 2026-03-17

</details>

See `.planning/milestones/v32.7-ROADMAP.md` for full details.

<details>
<summary>✅ v32.8 테스트 커버리지 강화 (Phases 444-448.1) — SHIPPED 2026-03-18</summary>

- [x] Phase 444-448.1: 6 phases completed — 2026-03-18

</details>

See `.planning/milestones/v32.8-ROADMAP.md` for full details.

<details>
<summary>✅ v32.9 Push Relay 직접 연동 (Phases 449-451) — SHIPPED 2026-03-18</summary>

- [x] Phase 449-451: 3 phases completed — 2026-03-18

</details>

See `.planning/milestones/v32.9-ROADMAP.md` for full details.

<details>
<summary>✅ v32.10 에이전트 스킬 정리 + OpenClaw 플러그인 (Phases 452-455) — SHIPPED 2026-03-18</summary>

- [x] Phase 452-455: 4 phases completed — 2026-03-18

</details>

See `.planning/milestones/v32.10-ROADMAP.md` for full details.

<details>
<summary>✅ v33.0 Desktop App 아키텍처 재설계 (Phases 456-458) — SHIPPED 2026-03-31</summary>

- [x] Phase 456-458: 3 phases completed — 2026-03-31

</details>

See `.planning/milestones/v33.0-ROADMAP.md` for full details.

<details>
<summary>✅ v33.2 Tauri Desktop App (Phases 459-463) — SHIPPED 2026-04-01</summary>

- [x] Phase 459: WalletConnect Spike (1/1 plans) — completed 2026-03-31
- [x] Phase 460: Tauri Shell + Sidecar Manager (3/3 plans) — completed 2026-03-31
- [x] Phase 461: IPC Bridge + System Tray (2/2 plans) — completed 2026-03-31
- [x] Phase 462: Setup Wizard + WalletConnect + Desktop UI (3/3 plans) — completed 2026-03-31
- [x] Phase 463: GitHub Releases CI + Auto-Update (3/3 plans) — completed 2026-03-31

</details>

See `.planning/milestones/v33.2-ROADMAP.md` for full details.

<details>
<summary>✅ v33.3 Desktop App 배포 채널 확장 (Phases 464-466) — SHIPPED 2026-04-01</summary>

- [x] Phase 464: Desktop Installation Guide (1/1 plans) — completed 2026-04-01
- [x] Phase 465: Download Page (1/1 plans) — completed 2026-04-01
- [x] Phase 466: Site Integration & Distribution (1/1 plans) — completed 2026-04-01

</details>

See `.planning/milestones/v33.3-ROADMAP.md` for full details.

### 🚧 v33.4 서명 앱 명시적 선택 (In Progress)

**Milestone Goal:** 서명 앱 선택을 name 기반 암묵적 매칭에서 wallet_type 기반 명시적 선택으로 전환한다. DB partial unique index로 무결성을 보장하고, 서비스/쿼리 레이어를 정비하며, Admin UI를 라디오 그룹으로 갱신한다.

- [ ] **Phase 467: DB Migration + Backend Service** - DB v61 partial unique index + WalletAppService 트랜잭션 토글 + PresetAutoSetupService 전환
- [ ] **Phase 468: SignRequestBuilder Query Transition** - wallet_type 기반 서명 대상 조회 전환 + preferred_wallet deprecated
- [ ] **Phase 469: Admin UI Radio Group** - wallet_type 그룹 레이아웃 + 서명 라디오 버튼 + "None" 옵션

## Phase Details

### Phase 467: DB Migration + Backend Service
**Goal**: DB 레벨에서 wallet_type당 signing primary를 최대 1개로 보장하고, 서비스 레이어가 자동으로 exclusive 토글을 수행한다
**Depends on**: Nothing (first phase)
**Requirements**: MIG-01, MIG-02, MIG-03, SVC-01, SVC-02, SVC-03, TST-01, TST-02
**Success Criteria** (what must be TRUE):
  1. DB v61 마이그레이션 실행 후 같은 wallet_type에 signing_enabled=1인 앱이 2개 이상 존재할 수 없다 (partial unique index가 거부)
  2. WalletAppService update()로 앱의 signingEnabled를 true로 변경하면 같은 wallet_type의 다른 앱이 자동으로 signing_enabled=0이 된다
  3. WalletAppService register()로 새 앱 등록 시 같은 wallet_type에 이미 signing primary가 있으면 signing_enabled=0으로 등록된다
  4. PresetAutoSetupService가 preferred_wallet 설정 대신 signing_enabled 컬럼 기반으로 동작한다
**Plans**: TBD

### Phase 468: SignRequestBuilder Query Transition
**Goal**: 서명 대상 앱 조회가 name 기반 3-쿼리에서 wallet_type + signing_enabled=1 단일 쿼리로 전환되어 정확한 signing primary를 사용한다
**Depends on**: Phase 467
**Requirements**: SIG-01, SIG-02, TST-03
**Success Criteria** (what must be TRUE):
  1. SignRequestBuilder가 wallet_type + signing_enabled=1 조건으로 서명 대상 앱을 조회한다
  2. signing_sdk.preferred_wallet 설정이 deprecated 처리되어 SignRequestBuilder에서 참조하지 않는다
  3. APPROVAL 티어 TX 생성 시 signing_enabled=1인 앱의 Push Relay URL로 요청이 전송되는 통합 테스트가 통과한다
**Plans**: TBD

### Phase 469: Admin UI Radio Group
**Goal**: 운영자가 wallet_type 그룹 내에서 서명 앱을 라디오 버튼으로 명시적으로 선택할 수 있다
**Depends on**: Phase 468
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04
**Success Criteria** (what must be TRUE):
  1. Human Wallet Apps 페이지에서 같은 wallet_type의 앱이 시각적 그룹으로 묶여 표시된다
  2. 서명 컨트롤이 라디오 버튼이며 그룹 내 하나만 선택 가능하다
  3. "없음" 라디오 옵션 선택으로 해당 wallet_type의 모든 앱을 signing_enabled=0으로 설정할 수 있다
  4. wallet_type에 앱이 1개만 있으면 라디오가 자동 선택 상태로 표시된다
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 467 → 468 → 469

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 467. DB Migration + Backend Service | 0/0 | Not started | - |
| 468. SignRequestBuilder Query Transition | 0/0 | Not started | - |
| 469. Admin UI Radio Group | 0/0 | Not started | - |
