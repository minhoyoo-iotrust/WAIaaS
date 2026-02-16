# Roadmap: WAIaaS

## Milestones

- ✅ **v1.4.6 멀티체인 월렛 구현** -- Phases 109-114 (shipped 2026-02-14)
- ✅ **v1.4.7 임의 트랜잭션 서명 API** -- Phases 115-119 (shipped 2026-02-15)
- ✅ **v1.4.8 Admin DX + 알림 개선** -- Phases 120-124 (shipped 2026-02-15)
- ✅ **v1.5 DeFi Price Oracle + Action Provider Framework** -- Phases 125-129 (shipped 2026-02-15)
- ✅ **v1.5.1 x402 클라이언트 지원** -- Phases 130-133 (shipped 2026-02-15)
- ✅ **v1.5.2 Admin UI 정책 폼 UX 개선** -- Phases 134-135 (shipped 2026-02-16)
- ✅ **v1.5.3 USD 정책 확장 (누적 지출 한도 + 표시 통화)** -- Phases 136-139 (shipped 2026-02-16)
- 🚧 **v1.6 운영 인프라 + 잔액 모니터링** -- Phases 140-145 (in progress)

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

<details>
<summary>v1.5.3 USD 정책 확장 (Phases 136-139) -- SHIPPED 2026-02-16</summary>

- [x] Phase 136: 누적 지출 한도 엔진 (2/2 plans) -- completed 2026-02-16
- [x] Phase 137: 누적 한도 Admin UI + SDK/MCP (2/2 plans) -- completed 2026-02-16
- [x] Phase 138: ForexRateService + 표시 통화 설정 (2/2 plans) -- completed 2026-02-16
- [x] Phase 139: 표시 통화 통합 (2/2 plans) -- completed 2026-02-16

</details>

### v1.6 운영 인프라 + 잔액 모니터링 (In Progress)

**Milestone Goal:** Kill Switch/AutoStop으로 긴급 제어, Telegram Bot으로 원격 관리, Docker로 원클릭 배포, 잔액 모니터링으로 가스비 부족 사전 알림이 동작하는 상태

- [x] **Phase 140: Event Bus + Kill Switch** (3 plans) - 이벤트 인프라와 3-state 긴급 정지 시스템
- [x] **Phase 141: AutoStop Engine** (2 plans) - 이벤트 기반 자동 정지 규칙 엔진
- [x] **Phase 142: Balance Monitoring** (2 plans) - 주기적 잔액 체크 + LOW_BALANCE 알림
- [x] **Phase 143: Telegram Bot** (3 plans) - Long Polling 기반 원격 관리 봇
- [x] **Phase 144: Admin UI Integration** (2 plans) - Kill Switch/Telegram/AutoStop/Balance Monitor 관리 패널
- [ ] **Phase 145: Docker** (2 plans) - Multi-stage 빌드 + docker-compose 원클릭 배포

## Phase Details

### Phase 140: Event Bus + Kill Switch
**Goal**: 긴급 상황 시 사용자가 모든 월렛 활동을 즉시 정지하고 안전하게 복구할 수 있다
**Depends on**: Nothing (first phase of v1.6)
**Requirements**: EVNT-01, EVNT-02, EVNT-03, KILL-01, KILL-02, KILL-03, KILL-04, KILL-05, KILL-06, KILL-07, KILL-08, KILL-09, KILL-10
**Plans:** 3 plans

Plans:
- [ ] 140-01-PLAN.md -- Event Bus 인프라 + 파이프라인 이벤트 발행
- [ ] 140-02-PLAN.md -- KillSwitchService 3-state 상태 머신 + CAS ACID + DB 마이그레이션
- [ ] 140-03-PLAN.md -- Kill Switch 6-step Cascade + REST API + 미들웨어

### Phase 141: AutoStop Engine
**Goal**: 이상 상황이 감지되면 시스템이 자동으로 월렛을 정지하거나 Kill Switch를 발동하여 피해를 최소화한다
**Depends on**: Phase 140 (Event Bus + Kill Switch)
**Requirements**: AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05, AUTO-06
**Success Criteria** (what must be TRUE):
  1. 5회 연속 트랜잭션 실패가 발생하면 해당 월렛이 자동으로 SUSPENDED 상태가 된다
  2. 정상 패턴 대비 이상 빈도 거래가 감지되면 월렛이 정지되고 AUTOSTOP_TRIGGERED 알림이 발송된다
  3. 설정된 유휴 시간을 초과하면 해당 세션이 자동 해지되고, 수동 트리거 시 Kill Switch가 자동 발동된다
  4. AutoStop 규칙 임계값이 config.toml flat key와 Admin Settings 런타임 오버라이드로 관리되어 데몬 재시작 없이 조정할 수 있다
**Plans:** 2 plans

Plans:
- [ ] 141-01-PLAN.md -- AutoStopService 4 규칙 구현 + 이벤트 구독
- [ ] 141-02-PLAN.md -- AutoStop 설정 관리 + 알림 통합

### Phase 142: Balance Monitoring
**Goal**: 월렛 가스비가 부족해지기 전에 사용자가 사전 알림을 받아 자금을 충전할 수 있다
**Depends on**: Phase 140 (Event Bus)
**Requirements**: BMON-01, BMON-02, BMON-03, BMON-04, BMON-05, BMON-06
**Success Criteria** (what must be TRUE):
  1. BalanceMonitorService가 주기적(기본 5분)으로 모든 활성 월렛의 네이티브 토큰 잔액을 체크하고, 임계값 이하이면 LOW_BALANCE 알림이 발송된다
  2. 동일 월렛에 대해 24시간 내 중복 LOW_BALANCE 알림이 방지되고, 잔액 회복 후 다시 하락하면 새 알림이 발송된다
  3. 잔액 모니터링 임계값(SOL 0.01, ETH 0.005)이 config.toml flat key + Admin Settings 런타임 오버라이드로 관리된다
**Plans:** 2 plans

Plans:
- [ ] 142-01-PLAN.md -- BalanceMonitorService + LOW_BALANCE 이벤트/알림
- [ ] 142-02-PLAN.md -- 설정 관리 + DaemonLifecycle 통합

### Phase 143: Telegram Bot
**Goal**: 사용자가 Telegram 앱에서 월렛 상태 조회, 거래 승인/거부, Kill Switch 발동 등 핵심 관리 작업을 원격으로 수행할 수 있다
**Depends on**: Phase 140 (Kill Switch)
**Requirements**: TGBOT-01, TGBOT-02, TGBOT-03, TGBOT-04, TGBOT-05, TGBOT-06, TGBOT-07, TGBOT-08, TGBOT-09, TGBOT-10, TGBOT-11, TGBOT-12, TGBOT-13, TGBOT-14
**Success Criteria** (what must be TRUE):
  1. TelegramBotService가 Long Polling으로 명령을 수신하고, /start로 chat_id가 등록되며, /status로 데몬 상태와 월렛 요약을 조회할 수 있다
  2. /pending로 APPROVAL 대기 거래 목록을 인라인 키보드와 함께 조회하고, /approve {txId}와 /reject {txId}로 거래를 승인/거부할 수 있다 (관리자만)
  3. /killswitch로 확인 대화(Yes/No 인라인 키보드) 후 Kill Switch를 발동할 수 있고, /wallets로 월렛 목록, /newsession으로 세션 발급이 가능하다 (관리자만)
  4. 2-Tier 인증이 적용되어 ADMIN은 모든 명령을, READONLY는 조회 명령만 사용할 수 있고, 네트워크 단절 시 지수 백오프로 재연결된다
  5. 모든 Bot 메시지가 config.toml locale 설정에 따라 en/ko로 출력되고, telegram_users DB 테이블이 마이그레이션으로 생성된다
**Plans:** 3 plans

Plans:
- [ ] 143-01-PLAN.md -- TelegramBotService Long Polling + DB 마이그레이션 v15 + /start, /help, /status + config/settings + i18n + DaemonLifecycle
- [ ] 143-02-PLAN.md -- 2-Tier 인증 (ADMIN/READONLY/PENDING) + /wallets, /pending, /approve, /reject + Admin REST API (telegram_users CRUD)
- [ ] 143-03-PLAN.md -- /killswitch 확인 대화 + /newsession 월렛 선택 + 인라인 키보드 빌더 + 지수 백오프 재연결

### Phase 144: Admin UI Integration
**Goal**: 사용자가 Admin 웹 UI에서 Kill Switch 3-state 관리, Telegram 사용자 승인, AutoStop/Balance Monitor 임계값 조정을 수행할 수 있다
**Depends on**: Phase 140 (Kill Switch), Phase 141 (AutoStop), Phase 142 (Balance Monitor), Phase 143 (Telegram Bot)
**Requirements**: ADUI-01, ADUI-02, ADUI-03, ADUI-04
**Success Criteria** (what must be TRUE):
  1. Admin UI에서 Kill Switch 상태를 조회하고 발동/복구할 수 있으며, 기존 2-state 토글이 3-state(ACTIVE/SUSPENDED/LOCKED) UI로 리팩토링되어 있다
  2. Admin UI에서 telegram_users 목록을 조회하고 PENDING 사용자의 role을 ADMIN 또는 READONLY로 승인할 수 있다
  3. Admin UI Settings에서 AutoStop 규칙 임계값과 잔액 모니터링 임계값을 조회/수정할 수 있다
**Plans:** 2 plans

Plans:
- [ ] 144-01-PLAN.md -- Kill Switch 3-state UI 리팩토링 + Telegram Users 관리 페이지
- [ ] 144-02-PLAN.md -- AutoStop + Balance Monitor Settings 카테고리

### Phase 145: Docker
**Goal**: docker compose up 한 줄로 WAIaaS 데몬이 실행되고, 데이터가 영속되며, 시크릿이 안전하게 주입된다
**Depends on**: Phase 140-144 (all features)
**Requirements**: DOCK-01, DOCK-02, DOCK-03, DOCK-04, DOCK-05, DOCK-06
**Success Criteria** (what must be TRUE):
  1. Multi-stage Dockerfile로 빌드된 이미지에서 데몬이 non-root(UID 1001, waiaas) 프로세스로 실행된다
  2. docker compose up 후 HEALTHCHECK가 통과하고 SDK로 거래가 가능하다
  3. Docker Secrets + _FILE 패턴으로 MASTER_PASSWORD_FILE 등 시크릿이 안전하게 주입되고, named volume 덕분에 docker compose down 후 up해도 데이터가 유지된다
**Plans:** 2 plans

Plans:
- [ ] 145-01-PLAN.md -- Dockerfile + docker-compose.yml + entrypoint.sh + .dockerignore
- [ ] 145-02-PLAN.md -- Docker Secrets 오버라이드 + HEALTHCHECK/영속성 검증

## Progress

**Execution Order:**
Phases execute in numeric order: 140 -> 141 -> 142 -> 143 -> 144 -> 145

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 140. Event Bus + Kill Switch | 3/3 | Complete | 2026-02-16 |
| 141. AutoStop Engine | 2/2 | Complete | 2026-02-16 |
| 142. Balance Monitoring | 2/2 | Complete | 2026-02-16 |
| 143. Telegram Bot | 3/3 | Complete | 2026-02-18 |
| 144. Admin UI Integration | 2/2 | Complete | 2026-02-18 |
| 145. Docker | 0/2 | Not started | - |

---
*Roadmap created: 2026-02-15*
*Last updated: 2026-02-18 -- Phase 145 계획 완료 (2 plans)*
