# Roadmap: WAIaaS

## Milestones

- ✅ **v1.4.6 멀티체인 월렛 구현** -- Phases 109-114 (shipped 2026-02-14)
- ✅ **v1.4.7 임의 트랜잭션 서명 API** -- Phases 115-119 (shipped 2026-02-15)
- ✅ **v1.4.8 Admin DX + 알림 개선** -- Phases 120-124 (shipped 2026-02-15)
- ✅ **v1.5 DeFi Price Oracle + Action Provider Framework** -- Phases 125-129 (shipped 2026-02-15)
- ✅ **v1.5.1 x402 클라이언트 지원** -- Phases 130-133 (shipped 2026-02-15)
- ✅ **v1.5.2 Admin UI 정책 폼 UX 개선** -- Phases 134-135 (shipped 2026-02-16)
- 🚧 **v1.5.3 USD 정책 확장 (누적 지출 한도 + 표시 통화)** -- Phases 136-139 (in progress)

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

<details>
<summary>v1.5.2 Admin UI 정책 폼 UX 개선 (Phases 134-135) -- SHIPPED 2026-02-16</summary>

- [x] Phase 134: 폼 인프라 + 5-type 전용 폼 (2/2 plans) -- completed 2026-02-15
- [x] Phase 135: 7-type 전용 폼 + 목록 시각화 + 수정 통합 (2/2 plans) -- completed 2026-02-16

</details>

### 🚧 v1.5.3 USD 정책 확장 (누적 지출 한도 + 표시 통화) (In Progress)

**Milestone Goal:** 월렛 단위 기간별 누적 USD 지출 한도로 분할 전송 우회를 방지하고, USD 외 사용자 선호 법정 통화로 금액을 환산 표시하여 다국어 DX를 개선한다.

- [ ] **Phase 136: 누적 지출 한도 엔진** - DB v13 마이그레이션 + 정책 스키마 확장 + 누적 집계 + 알림
- [ ] **Phase 137: 누적 한도 Admin UI + SDK/MCP** - 누적 한도 폼/시각화 + SDK/MCP 필드 확장
- [ ] **Phase 138: ForexRateService + 표시 통화 설정** - 환율 서비스 + Settings + 통화 포매팅
- [ ] **Phase 139: 표시 통화 통합** - Admin UI/알림/REST API/MCP 환산 표시

## Phase Details

### Phase 136: 누적 지출 한도 엔진
**Goal**: 월렛별 기간 내 누적 USD 지출이 추적되고, 한도 초과 시 APPROVAL로 격상되며, Owner에게 경고 알림이 발송되는 상태
**Depends on**: v1.5.2 (Phase 135) 완료
**Requirements**: CUMUL-01, CUMUL-02, CUMUL-03, CUMUL-04, CUMUL-05, CUMUL-06, CUMUL-07
**Success Criteria** (what must be TRUE):
  1. transactions 테이블에 amount_usd/reserved_amount_usd 컬럼이 존재하고, 기존 데이터가 보존된 채 DB v13 마이그레이션이 적용된다
  2. 트랜잭션 실행 시 Stage 3에서 산출한 USD 환산 금액이 해당 트랜잭션의 amount_usd/reserved_amount_usd에 기록된다
  3. daily_limit_usd/monthly_limit_usd가 설정된 상태에서 24시간/30일 롤링 윈도우 누적이 한도를 초과하면 APPROVAL로 격상된다
  4. PENDING/QUEUED/SIGNED 상태 트랜잭션의 reserved_amount_usd가 누적 합산에 포함되어, 동시 요청에 의한 이중 지출이 방지된다
  5. 누적 지출이 한도의 80%에 도달하면 CUMULATIVE_LIMIT_WARNING 알림이 발송되고, 한도 초과 APPROVAL 시 TX_APPROVAL_REQUIRED에 reason 필드(per_tx/cumulative_daily/cumulative_monthly)가 포함된다
**Plans:** 2 plans

Plans:
- [ ] 136-01-PLAN.md -- DB v13 마이그레이션 + Drizzle/Zod 스키마 확장 + evaluateAndReserve USD 기록
- [ ] 136-02-PLAN.md -- 누적 USD 집계 + APPROVAL 격상 + CUMULATIVE_LIMIT_WARNING 알림 + reason 필드

### Phase 137: 누적 한도 Admin UI + SDK/MCP
**Goal**: Admin UI에서 누적 한도를 설정/확인하고, SDK/MCP로 누적 한도 포함 정책을 프로그래밍 방식으로 관리할 수 있는 상태
**Depends on**: Phase 136
**Requirements**: CUMUL-08, CUMUL-09, CUMUL-10
**Success Criteria** (what must be TRUE):
  1. Admin SpendingLimitForm에서 daily_limit_usd/monthly_limit_usd 값을 입력하고 저장할 수 있으며, 기존 정책 수정 시 현재값이 프리필된다
  2. PolicyRulesSummary에서 누적 한도 설정값과 현재 기간 내 사용량이 시각적으로 표시된다
  3. TS/Python SDK와 MCP에서 daily_limit_usd/monthly_limit_usd 필드를 포함한 SPENDING_LIMIT 정책을 생성/조회할 수 있다
**Plans**: TBD

Plans:
- [ ] 137-01: SpendingLimitForm 누적 필드 + PolicyRulesSummary 누적 시각화
- [ ] 137-02: SDK/MCP 누적 한도 필드 확장 + 스킬 파일 동기화

### Phase 138: ForexRateService + 표시 통화 설정
**Goal**: USD에서 43개 법정 통화로의 환율 조회가 동작하고, Admin Settings에서 표시 통화를 선택하면 즉시 반영되며, Intl.NumberFormat 기반 통화 포매팅이 적용되는 상태
**Depends on**: Phase 136 (DB 마이그레이션 완료)
**Requirements**: DISP-01, DISP-02, DISP-03, DISP-04, DISP-09
**Success Criteria** (what must be TRUE):
  1. IForexRateService를 통해 USD에서 KRW/JPY/EUR 등 법정 통화로의 환율을 조회할 수 있고, 30분 TTL로 캐시된다
  2. Pyth Hermes forex 피드 또는 CoinGecko vs_currencies를 소스로 환율이 조회되며, 조회 실패 시 USD 그대로 표시된다 (graceful fallback)
  3. Admin Settings에서 검색 가능한 통화 드롭다운으로 표시 통화를 선택할 수 있고, 현재 환율 미리보기가 옆에 표시된다
  4. Intl.NumberFormat 기반으로 통화별 올바른 기호/소수점/포맷이 적용되고, USD 외 통화에는 "≈" 접두사가 붙는다
**Plans**: TBD

Plans:
- [ ] 138-01: IForexRateService + Pyth/CoinGecko forex 구현 + InMemoryPriceCache 통합
- [ ] 138-02: SettingsService display 카테고리 + Admin Settings 통화 드롭다운 + 포매팅 유틸

### Phase 139: 표시 통화 통합
**Goal**: Admin UI 전체, 알림 메시지, REST API, MCP 도구에서 선택한 통화로 환산된 금액이 표시되는 상태
**Depends on**: Phase 138
**Requirements**: DISP-05, DISP-06, DISP-07, DISP-08
**Success Criteria** (what must be TRUE):
  1. Admin 대시보드/정책 폼/트랜잭션 목록에서 금액이 선택한 통화로 환산 표시된다 (예: "3.33 SOL (≈W725,000)")
  2. 알림 메시지(Telegram/Discord/ntfy/Slack)에 선택한 통화로 환산한 금액이 포함된다
  3. REST API 4개 엔드포인트(transactions/balance/assets/POST transactions)에서 ?display_currency 쿼리 파라미터로 환산 필드(display_amount/display_balance/display_value)를 받을 수 있다
  4. MCP 도구 응답에 서버 설정 표시 통화로 환산한 금액이 포함된다
**Plans**: TBD

Plans:
- [ ] 139-01: Admin UI 환산 표시 + 알림 메시지 환산
- [ ] 139-02: REST API display_currency 쿼리 + MCP 환산 응답 + 스킬 파일 동기화

## Progress

**Execution Order:**
Phases execute in numeric order: 136 -> 137 -> 138 -> 139

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 136. 누적 지출 한도 엔진 | v1.5.3 | 0/2 | Not started | - |
| 137. 누적 한도 Admin UI + SDK/MCP | v1.5.3 | 0/2 | Not started | - |
| 138. ForexRateService + 표시 통화 설정 | v1.5.3 | 0/2 | Not started | - |
| 139. 표시 통화 통합 | v1.5.3 | 0/2 | Not started | - |

---
*Roadmap created: 2026-02-15*
*Last updated: 2026-02-16 -- Phase 136 계획 완료 (2 plans, 7 requirements)*
