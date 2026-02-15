# Roadmap: WAIaaS

## Milestones

- ✅ **v1.4.6 멀티체인 월렛 구현** -- Phases 109-114 (shipped 2026-02-14)
- ✅ **v1.4.7 임의 트랜잭션 서명 API** -- Phases 115-119 (shipped 2026-02-15)
- ✅ **v1.4.8 Admin DX + 알림 개선** -- Phases 120-124 (shipped 2026-02-15)
- ✅ **v1.5 DeFi Price Oracle + Action Provider Framework** -- Phases 125-129 (shipped 2026-02-15)
- ✅ **v1.5.1 x402 클라이언트 지원** -- Phases 130-133 (shipped 2026-02-15)
- 🚧 **v1.5.2 Admin UI 정책 폼 UX 개선** -- Phases 134-135 (in progress)

## Phases

<details>
<summary>v1.4.6 멀티체인 월렛 구현 (Phases 109-114) -- SHIPPED 2026-02-14</summary>

- [x] Phase 109: DB 마이그레이션 + 환경 모델 SSoT (2/2 plans) -- completed 2026-02-14
- [x] Phase 110: 스키마 전환 + 정책 엔진 (2/2 plans) -- completed 2026-02-14
- [x] Phase 111: 파이프라인 네트워크 해결 (2/2 plans) -- completed 2026-02-14
- [x] Phase 112: REST API 네트워크 확장 (2/2 plans) -- completed 2026-02-14
- [x] Phase 113: MCP + SDK + Admin UI (3/3 plans) -- completed 2026-02-14
- [x] Phase 114: CLI Quickstart + DX 통합 (2/2 plans) -- completed 2026-02-14

</details>

<details>
<summary>v1.4.7 임의 트랜잭션 서명 API (Phases 115-119) -- SHIPPED 2026-02-15</summary>

- [x] Phase 115: Core Types + DB Migration + Parsers (3/3 plans) -- completed 2026-02-15
- [x] Phase 116: Default Deny Toggles (2/2 plans) -- completed 2026-02-15
- [x] Phase 117: Sign-Only Pipeline + REST API (2/2 plans) -- completed 2026-02-15
- [x] Phase 118: EVM Calldata Encoding (2/2 plans) -- completed 2026-02-15
- [x] Phase 119: SDK + MCP + Notifications + Skill Resources (3/3 plans) -- completed 2026-02-15

</details>

<details>
<summary>v1.4.8 Admin DX + 알림 개선 (Phases 120-124) -- SHIPPED 2026-02-15</summary>

- [x] Phase 120: DB 마이그레이션 안정성 (1/1 plans) -- completed 2026-02-15
- [x] Phase 121: MCP 안정성 (1/1 plans) -- completed 2026-02-15
- [x] Phase 122: MCP 도구 + 멀티체인 DX (2/2 plans) -- completed 2026-02-15
- [x] Phase 123: Admin UI 개선 (2/2 plans) -- completed 2026-02-15
- [x] Phase 124: 알림 시스템 개선 (2/2 plans) -- completed 2026-02-15

</details>

<details>
<summary>v1.5 DeFi Price Oracle + Action Provider Framework (Phases 125-129) -- SHIPPED 2026-02-15</summary>

- [x] Phase 125: Design Docs + Oracle Interfaces (2/2 plans) -- completed 2026-02-15
- [x] Phase 126: Oracle Implementations (3/3 plans) -- completed 2026-02-15
- [x] Phase 127: USD Policy Integration (3/3 plans) -- completed 2026-02-15
- [x] Phase 128: Action Provider + API Key (4/4 plans) -- completed 2026-02-15
- [x] Phase 129: MCP/Admin/Skill Integration (2/2 plans) -- completed 2026-02-15

</details>

<details>
<summary>v1.5.1 x402 클라이언트 지원 (Phases 130-133) -- SHIPPED 2026-02-15</summary>

- [x] Phase 130: Core 타입 + CAIP-2 + DB 마이그레이션 (2/2 plans) -- completed 2026-02-15
- [x] Phase 131: SSRF 가드 + x402 핸들러 + 결제 서명 (3/3 plans) -- completed 2026-02-15
- [x] Phase 132: REST API + 정책 통합 + 감사 로그 (3/3 plans) -- completed 2026-02-15
- [x] Phase 133: SDK + MCP + 스킬 파일 (2/2 plans) -- completed 2026-02-15

</details>

### v1.5.2 Admin UI 정책 폼 UX 개선 (In Progress)

**Milestone Goal:** Admin UI에서 12개 정책 타입별 구조화된 폼으로 정책을 생성/수정하고, 목록에서 타입별 의미 있는 시각화를 확인할 수 있는 상태를 달성하여 운영자 DX를 개선한다.

- [ ] **Phase 134: 폼 인프라 + 5-type 전용 폼** (2 plans) - DynamicRowList, PolicyFormRouter, JSON 토글, Zod 스키마 추가, 5개 타입 전용 폼 + 유효성 검증
- [ ] **Phase 135: 7-type 전용 폼 + 목록 시각화 + 수정 통합** - 나머지 7개 타입 전용 폼, 12개 타입 목록 시각화, 수정 프리필 + 저장 통합

## Phase Details

### Phase 134: 폼 인프라 + 5-type 전용 폼
**Goal**: 운영자가 정책 타입을 선택하면 전용 폼이 렌더링되고, 5개 핵심 타입(SPENDING_LIMIT, WHITELIST, RATE_LIMIT, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE)의 구조화된 폼으로 정책을 생성할 수 있는 상태
**Depends on**: Phase 133 (v1.5.1 완료)
**Requirements**: FORM-01, FORM-02, FORM-03, FORM-04, PFORM-01, PFORM-02, PFORM-04, PFORM-09, PFORM-10, VALID-01, VALID-02, VALID-03
**Plans**: 2 plans

Plans:
- [ ] 134-01-PLAN.md -- DynamicRowList + PolicyFormRouter + JSON 토글 + Zod 스키마 추가
- [ ] 134-02-PLAN.md -- 5-type 전용 폼 + 유효성 검증 + 테스트

### Phase 135: 7-type 전용 폼 + 목록 시각화 + 수정 통합
**Goal**: 나머지 7개 타입(ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, TIME_RESTRICTION, ALLOWED_NETWORKS, X402_ALLOWED_DOMAINS)의 전용 폼이 완성되고, 12개 타입 모두 목록에서 의미 있는 시각화로 표시되며, 기존 정책 수정 시 현재값이 프리필되어 수정/저장이 가능한 상태
**Depends on**: Phase 134
**Requirements**: PFORM-03, PFORM-05, PFORM-06, PFORM-07, PFORM-08, PFORM-11, PFORM-12, VIS-01, VIS-02, VIS-03, EDIT-01, EDIT-02
**Plans**: TBD

Plans:
- [ ] 135-01: 7-type 전용 폼 (ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, TIME_RESTRICTION, ALLOWED_NETWORKS, X402_ALLOWED_DOMAINS)
- [ ] 135-02: PolicyRulesSummary 12-type 목록 시각화 + 수정 프리필/저장 통합 + 테스트

## Progress

**Execution Order:** 134 -> 135

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 134. 폼 인프라 + 5-type 전용 폼 | v1.5.2 | 0/2 | Not started | - |
| 135. 7-type 전용 폼 + 목록 시각화 + 수정 통합 | v1.5.2 | 0/2 | Not started | - |

---
*Roadmap created: 2026-02-15*
*Last updated: 2026-02-15 -- Phase 134 계획 수립 (2 plans)*
