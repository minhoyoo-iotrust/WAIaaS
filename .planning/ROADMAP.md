# Roadmap: WAIaaS

## Milestones

- ✅ **v1.4.6 멀티체인 월렛 구현** — Phases 109-114 (shipped 2026-02-14)
- ✅ **v1.4.7 임의 트랜잭션 서명 API** — Phases 115-119 (shipped 2026-02-15)
- **v1.4.8 Admin DX + 알림 개선** — Phases 120-124 (in progress)

## Phases

<details>
<summary>v1.4.6 멀티체인 월렛 구현 (Phases 109-114) — SHIPPED 2026-02-14</summary>

- [x] Phase 109: DB 마이그레이션 + 환경 모델 SSoT (2/2 plans) — completed 2026-02-14
- [x] Phase 110: 스키마 전환 + 정책 엔진 (2/2 plans) — completed 2026-02-14
- [x] Phase 111: 파이프라인 네트워크 해결 (2/2 plans) — completed 2026-02-14
- [x] Phase 112: REST API 네트워크 확장 (2/2 plans) — completed 2026-02-14
- [x] Phase 113: MCP + SDK + Admin UI (3/3 plans) — completed 2026-02-14
- [x] Phase 114: CLI Quickstart + DX 통합 (2/2 plans) — completed 2026-02-14

</details>

<details>
<summary>v1.4.7 임의 트랜잭션 서명 API (Phases 115-119) — SHIPPED 2026-02-15</summary>

- [x] Phase 115: Core Types + DB Migration + Parsers (3/3 plans) — completed 2026-02-15
- [x] Phase 116: Default Deny Toggles (2/2 plans) — completed 2026-02-15
- [x] Phase 117: Sign-Only Pipeline + REST API (2/2 plans) — completed 2026-02-15
- [x] Phase 118: EVM Calldata Encoding (2/2 plans) — completed 2026-02-15
- [x] Phase 119: SDK + MCP + Notifications + Skill Resources (3/3 plans) — completed 2026-02-15

</details>

### v1.4.8 Admin DX + 알림 개선 (In Progress)

**Milestone Goal:** OPEN 이슈 12건(020~031) 일괄 해소 — DB 마이그레이션 안정성, MCP 안정성, 멀티체인 DX 도구 확장, Admin UI UX 개선, 알림 시스템 개선

- [x] **Phase 120: DB 마이그레이션 안정성** — pushSchema 순서 수정 + 마이그레이션 체인 테스트 (1/1 plans) — completed 2026-02-15
- [x] **Phase 121: MCP 안정성** — graceful shutdown + stdin 종료 감지 (1/1 plans) — completed 2026-02-15
- [x] **Phase 122: MCP 도구 + 멀티체인 DX** — set_default_network, wallet info, network=all 잔액 (2/2 plans) — completed 2026-02-15
- [x] **Phase 123: Admin UI 개선** — 대시보드 확장, 월렛 상세, 세션 전체 조회 (2/2 plans) — completed 2026-02-15
- [ ] **Phase 124: 알림 시스템 개선** — 버그 수정, 메시지 저장, Slack 채널, 채널별 테스트

## Phase Details

### Phase 120: DB 마이그레이션 안정성
**Goal**: 기존 DB(v1~v9)에서 데몬이 정상 시작되고, 마이그레이션 경로가 자동 검증된다
**Depends on**: Nothing (independent, HIGH priority — 기존 DB 시작 차단 버그)
**Requirements**: MIGR-01, MIGR-02, MIGR-03
**Success Criteria** (what must be TRUE):
  1. v5 스키마 DB에서 데몬을 시작하면 마이그레이션이 성공하고 정상 동작한다
  2. v1 스키마 DB에서 v9까지 전체 마이그레이션 체인이 테스트로 검증된다
  3. environment 매핑, network 백필, 이름 변환 데이터 변환이 테스트로 검증된다
  4. pushSchema가 테이블 생성 후 마이그레이션을 실행하고, 인덱스는 마이그레이션 완료 후 생성한다
**Plans**: 1 plan

Plans:
- [x] 120-01-PLAN.md — pushSchema 순서 수정 + 마이그레이션 체인 테스트 (TDD)

### Phase 121: MCP 안정성
**Goal**: MCP 서버 프로세스가 클라이언트 종료 시 고아로 잔류하지 않고 안전하게 종료된다
**Depends on**: Nothing (independent)
**Requirements**: MCPS-01, MCPS-02, MCPS-03
**Success Criteria** (what must be TRUE):
  1. Claude Desktop 종료 시 MCP 서버가 stdin 종료를 감지하여 5초 내 자동 종료된다
  2. SIGTERM 수신 시 3초 타임아웃으로 graceful shutdown 후 강제 종료된다
  3. shutdown 함수를 여러 번 호출해도 에러 없이 안전하게 처리된다
**Plans**: 1 plan

Plans:
- [x] 121-01-PLAN.md — MCP graceful shutdown + stdin 감지 (TDD)

### Phase 122: MCP 도구 + 멀티체인 DX
**Goal**: 사용자가 MCP/CLI/SDK 어느 인터페이스에서든 기본 네트워크를 변경하고, 월렛 상세 정보를 조회하고, 전체 네트워크 잔액을 한 번에 확인할 수 있다
**Depends on**: Nothing (independent — v1.4.6 멀티체인 환경 모델 shipped)
**Requirements**: MCDX-01, MCDX-02, MCDX-03, MCDX-04, MCDX-05, MCDX-06, MCDX-07, SKIL-01
**Success Criteria** (what must be TRUE):
  1. MCP set_default_network 도구 + CLI 명령어 + SDK 메서드로 기본 네트워크가 변경된다
  2. CLI `waiaas wallet info`가 체인, 환경, 주소, 기본 네트워크, 사용 가능 네트워크를 표시한다
  3. `GET /v1/wallet/balance?network=all`이 환경 내 모든 네트워크 잔액을 배열로 반환한다
  4. 일부 네트워크 RPC 실패 시 성공한 네트워크 잔액만 반환하고 실패 네트워크는 에러 표시한다
  5. wallet.skill.md에 network=all, set_default_network, wallet info가 반영된다
**Plans**: 2 plans

Plans:
- [x] 122-01-PLAN.md — set_default_network MCP 도구 + CLI wallet 서브커맨드 + TS/Python SDK 메서드
- [x] 122-02-PLAN.md — network=all 잔액/자산 API + MCP/SDK 지원 + wallet.skill.md 업데이트

### Phase 123: Admin UI 개선
**Goal**: Admin 대시보드가 운영 핵심 정보를 한눈에 보여주고, 월렛 상세/세션 페이지가 실용적으로 사용된다
**Depends on**: Nothing (independent — v1.4.6 환경 모델 UI shipped)
**Requirements**: ADUI-01, ADUI-02, ADUI-03, ADUI-04, ADUI-05, ADUI-06, ADUI-07
**Success Criteria** (what must be TRUE):
  1. 대시보드 StatCard를 클릭하면 해당 페이지(Wallets, Sessions 등)로 이동한다
  2. 대시보드에 Policies, Recent Txns (24h), Failed Txns (24h) StatCard와 최근 활동 5건이 표시된다
  3. 월렛 상세 페이지에서 네이티브 + 토큰 잔액과 최근 트랜잭션 내역을 확인할 수 있다
  4. 세션 페이지 진입 시 walletId 선택 없이 전체 세션 목록이 즉시 표시되고 walletName 컬럼이 보인다
**Plans**: 2 plans

Plans:
- [ ] 123-01-PLAN.md — 대시보드 StatCard 링크 + 추가 카드 + 최근 활동
- [ ] 123-02-PLAN.md — 월렛 상세 잔액/트랜잭션 + 세션 전체 조회

### Phase 124: 알림 시스템 개선
**Goal**: 알림 테스트가 정상 동작하고, 발송 메시지가 저장/조회 가능하며, Slack 채널이 지원된다
**Depends on**: Nothing (independent — P120~P123과 병렬 가능)
**Requirements**: NOTF-01, NOTF-02, NOTF-03, NOTF-04, NOTF-05, NOTF-06, SKIL-02
**Success Criteria** (what must be TRUE):
  1. Admin UI에서 알림 Send Test가 SYSTEM_LOCKED 에러 없이 정상 동작한다
  2. 채널별 개별 [Test] 버튼으로 Telegram/Discord/ntfy/Slack 중 특정 채널만 테스트할 수 있다
  3. 알림 Delivery Log에서 행을 클릭하면 실제 발송된 메시지 원문을 확인할 수 있다
  4. config.toml에 slack_webhook_url 설정 시 Channel Status에 Slack이 표시되고 알림이 발송된다
  5. admin.skill.md에 Slack 알림 채널 정보가 반영된다
**Plans**: TBD

Plans:
- [ ] 124-01: 알림 테스트 버그 수정 + 채널별 테스트 UI
- [ ] 124-02: DB 마이그레이션 v10 + 메시지 저장 + Slack 채널 + 스킬 파일

## Progress

**Execution Order:**
Phases 120~124 are all independent. Recommended order: 120 (HIGH bug) -> 121 -> 122 -> 123 -> 124

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 109. DB 마이그레이션 + 환경 모델 SSoT | v1.4.6 | 2/2 | Complete | 2026-02-14 |
| 110. 스키마 전환 + 정책 엔진 | v1.4.6 | 2/2 | Complete | 2026-02-14 |
| 111. 파이프라인 네트워크 해결 | v1.4.6 | 2/2 | Complete | 2026-02-14 |
| 112. REST API 네트워크 확장 | v1.4.6 | 2/2 | Complete | 2026-02-14 |
| 113. MCP + SDK + Admin UI | v1.4.6 | 3/3 | Complete | 2026-02-14 |
| 114. CLI Quickstart + DX 통합 | v1.4.6 | 2/2 | Complete | 2026-02-14 |
| 115. Core Types + DB Migration + Parsers | v1.4.7 | 3/3 | Complete | 2026-02-15 |
| 116. Default Deny Toggles | v1.4.7 | 2/2 | Complete | 2026-02-15 |
| 117. Sign-Only Pipeline + REST API | v1.4.7 | 2/2 | Complete | 2026-02-15 |
| 118. EVM Calldata Encoding | v1.4.7 | 2/2 | Complete | 2026-02-15 |
| 119. SDK + MCP + Notifications + Skill Resources | v1.4.7 | 3/3 | Complete | 2026-02-15 |
| 120. DB 마이그레이션 안정성 | v1.4.8 | 1/1 | Complete | 2026-02-15 |
| 121. MCP 안정성 | v1.4.8 | 1/1 | Complete | 2026-02-15 |
| 122. MCP 도구 + 멀티체인 DX | v1.4.8 | 2/2 | Complete | 2026-02-15 |
| 123. Admin UI 개선 | v1.4.8 | 2/2 | Complete | 2026-02-15 |
| 124. 알림 시스템 개선 | v1.4.8 | 0/2 | Not started | - |
