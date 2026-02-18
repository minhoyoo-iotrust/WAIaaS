# Roadmap: WAIaaS

## Milestones

- ✅ **v0.1-v2.0** — Phases 1-173 (shipped 2026-02-05 ~ 2026-02-18) — See milestones/ archive
- ✅ **v2.2 테스트 커버리지 강화** — Phases 178-181 (shipped 2026-02-18)
- 🚧 **v2.3 Admin UI 기능별 메뉴 재구성** — Phases 182-186 (in progress)

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

### 🚧 v2.3 Admin UI 기능별 메뉴 재구성 (In Progress)

**Milestone Goal:** 모놀리식 Settings 페이지를 해체하여 7개 기능별 메뉴로 재배치하고, TabNav/FieldGroup/breadcrumb 등 공용 컴포넌트와 설정 검색/미저장 경고 등 UX 기능을 추가한다.

- [x] **Phase 182: UI 공용 컴포넌트** - TabNav, FieldGroup, FormField description, PageHeader subtitle, breadcrumb 컴포넌트 구축 (completed 2026-02-18)
- [x] **Phase 183: 메뉴 재구성 + 신규 페이지** - 7-메뉴 사이드바, 라우트 리다이렉트, Security/System 페이지 생성, 기존 페이지 탭 구조 적용 (completed 2026-02-18)
- [x] **Phase 184: Settings 분산 배치** - 기존 Settings 항목을 Wallets/Sessions/Policies/Notifications 탭으로 이동 + FieldGroup 적용 + 신규 설정 노출 (completed 2026-02-18)
- [x] **Phase 185: UX 강화** - 설정 검색(Ctrl+K), 미저장 경고 다이얼로그 (completed 2026-02-18)
- [x] **Phase 186: 마무리** - 페이지/필드 설명 텍스트 채우기, README 갱신 (completed 2026-02-18)

## Phase Details

### Phase 182: UI 공용 컴포넌트
**Goal**: 이후 모든 페이지에서 사용할 공용 UI 컴포넌트가 준비되어 재사용 가능하다
**Depends on**: Nothing (first phase)
**Requirements**: TAB-01, FGRP-01, DESC-01, DESC-02, BCMB-01, BCMB-02, BCMB-03
**Success Criteria** (what must be TRUE):
  1. TabNav 컴포넌트가 탭 목록과 활성 탭을 받아 탭 전환을 수행하고, 독립적으로 동작한다
  2. FieldGroup 컴포넌트가 fieldset+legend 시맨틱 래퍼로 자식 필드를 그룹화하여 렌더링한다
  3. FormField에 description prop을 전달하면 필드 아래에 help text가 렌더링된다
  4. PageHeader에 subtitle 영역이 추가되어 설명 텍스트를 표시한다
  5. Breadcrumb 컴포넌트가 탭 페이지에서 "페이지명 > 탭명"을 표시하고, Dashboard/System에서는 미표시되며, 페이지명 클릭 시 첫 번째 탭으로 이동한다
**Plans:** 2/2 plans complete

Plans:
- [x] 182-01-PLAN.md — TabNav + FieldGroup + FormField description 컴포넌트 구현
- [x] 182-02-PLAN.md — PageHeader subtitle + Breadcrumb 컴포넌트 구현

### Phase 183: 메뉴 재구성 + 신규 페이지
**Goal**: 사이드바가 7개 메뉴를 표시하고, Security/System 신규 페이지가 기존 Settings 기능을 그대로 제공한다
**Depends on**: Phase 182
**Requirements**: MENU-01, MENU-02, MENU-03, SEC-01, SEC-02, SEC-03, SEC-04, SYS-01, SYS-02, TAB-02, TAB-03, TAB-04, TAB-05
**Success Criteria** (what must be TRUE):
  1. 사이드바에 Dashboard/Wallets/Sessions/Policies/Notifications/Security/System 7개 메뉴가 표시되고, Settings/WalletConnect 메뉴는 제거되었다
  2. #/settings 접근 시 #/dashboard로, #/walletconnect 접근 시 #/wallets로 자동 리다이렉트된다
  3. Security 페이지(#/security)에 Kill Switch/AutoStop Rules/JWT Rotation 3개 탭이 렌더링되고, 각 탭이 기존 Settings의 해당 기능을 동일하게 제공한다
  4. System 페이지(#/system)에 API Keys/Oracle/Display Currency/Global IP Rate Limit/Log Level/Danger Zone이 렌더링되고 기존과 동일하게 동작한다
  5. Wallets(4탭)/Sessions(2탭)/Policies(2탭)/Notifications(3탭) 페이지에 TabNav가 적용되어 탭 전환이 가능하다
**Plans:** 3/3 plans complete

Plans:
- [x] 183-01-PLAN.md — 사이드바 7-메뉴 구성 + 라우트 리다이렉트 + 설정 유틸리티 추출
- [x] 183-02-PLAN.md — Security 페이지 3-탭 구현 (Kill Switch/AutoStop Rules/JWT Rotation)
- [x] 183-03-PLAN.md — System 페이지 구현 + 기존 페이지 탭 구조 적용

### Phase 184: Settings 분산 배치
**Goal**: 기존 Settings 페이지의 모든 설정 항목이 기능별 탭으로 이동하여 각 맥락에서 변경/저장 가능하다
**Depends on**: Phase 183
**Requirements**: DIST-01, DIST-02, DIST-03, DIST-04, DIST-05, DIST-06, TAB-06, FGRP-02, FGRP-03, FGRP-04, NEW-01, NEW-02, NEW-03
**Success Criteria** (what must be TRUE):
  1. Wallets 페이지의 RPC Endpoints/Balance Monitoring/WalletConnect 탭에서 해당 설정을 변경하고 저장할 수 있다
  2. Sessions > Settings 탭에서 세션 관련 설정을 Lifetime/Rate Limits 2개 FieldGroup으로 그룹화하여 변경/저장할 수 있고, session_absolute_lifetime과 session_max_renewals가 신규 노출된다
  3. Policies > Defaults 탭에서 정책 기본값(Delay/Approval Timeout/Default Deny 3개 토글)을 변경/저장할 수 있다
  4. Notifications > Settings 탭에서 알림 설정을 Telegram/Other Channels 그룹으로 분리하여 변경/저장할 수 있고, 기존 중복 렌더링이 제거된다
  5. 각 Settings 탭이 독립적인 dirty signal과 save bar를 보유하고, Security > AutoStop Rules 탭에 Activity Detection/Idle Detection FieldGroup이 적용된다
**Plans:** 2/2 plans complete

Plans:
- [ ] 184-01-PLAN.md — Wallets 탭 설정 분산 (RPC Endpoints/Balance Monitoring/WalletConnect) + NEW-02/NEW-03
- [ ] 184-02-PLAN.md — Sessions/Policies/Notifications 탭 설정 분산 + FieldGroup 적용 + 신규 설정 노출

### Phase 185: UX 강화
**Goal**: 사용자가 설정을 빠르게 찾고, 미저장 변경을 실수로 잃지 않는다
**Depends on**: Phase 184
**Requirements**: SRCH-01, SRCH-02, SRCH-03, DIRTY-01, DIRTY-02
**Success Criteria** (what must be TRUE):
  1. 헤더에 설정 검색 아이콘이 표시되고 Ctrl+K/Cmd+K로 검색 팝오버가 열린다
  2. 검색 팝오버에서 모든 설정 항목의 label+description을 검색하여 결과가 표시되고, 결과 클릭 시 해당 페이지+탭으로 이동하며 필드가 하이라이트된다
  3. dirty 상태에서 탭 전환 또는 사이드바 메뉴 전환 시 3버튼 확인 다이얼로그(저장 후 이동/저장 없이 이동/취소)가 표시된다
**Plans:** 2/2 plans complete

Plans:
- [ ] 185-01-PLAN.md — 설정 검색 기능 (Ctrl+K 팝오버 + 정적 인덱스 + 결과 클릭 네비게이션 + 필드 하이라이트)
- [ ] 185-02-PLAN.md — 미저장 경고 다이얼로그 (dirty guard 레지스트리 + 3버튼 다이얼로그 + 탭/사이드바 인터셉트)

### Phase 186: 마무리
**Goal**: 모든 페이지에 설명 텍스트가 채워지고 문서가 갱신되어 릴리스 준비가 완료된다
**Depends on**: Phase 185
**Requirements**: DOC-01
**Success Criteria** (what must be TRUE):
  1. 7개 페이지 모두에 PageHeader subtitle 설명 텍스트가 표시된다
  2. Settings 탭의 각 필드에 description help text가 채워져 있다
  3. README.md Admin UI 섹션이 새 7-메뉴 구조를 반영하여 갱신되어 있다
**Plans:** 1/1 plans complete

Plans:
- [ ] 186-01-PLAN.md — Settings 필드 description 추가 + README Admin UI 섹션 7-메뉴 갱신

## Progress

**Execution Order:**
Phases execute in numeric order: 182 → 183 → 184 → 185 → 186

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 178. adapter-solana 브랜치 커버리지 | v2.2 | 2/2 | Complete | 2026-02-18 |
| 179. admin 함수 커버리지 | v2.2 | 2/2 | Complete | 2026-02-18 |
| 180. CLI 라인/구문 커버리지 | v2.2 | 1/1 | Complete | 2026-02-18 |
| 181. 임계값 검증 및 복원 | v2.2 | 1/1 | Complete | 2026-02-18 |
| 182. UI 공용 컴포넌트 | v2.3 | 2/2 | Complete | 2026-02-18 |
| 183. 메뉴 재구성 + 신규 페이지 | v2.3 | 3/3 | Complete | 2026-02-18 |
| 184. Settings 분산 배치 | 2/2 | Complete    | 2026-02-18 | - |
| 185. UX 강화 | 2/2 | Complete    | 2026-02-18 | - |
| 186. 마무리 | 1/1 | Complete   | 2026-02-18 | - |
