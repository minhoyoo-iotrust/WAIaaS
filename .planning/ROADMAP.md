# Roadmap: WAIaaS

## Milestones

- ✅ **v0.1 Research & Design** — Phases 1-5 (shipped 2026-02-05)
- ✅ **v0.2 Self-Hosted Secure Wallet Design** — Phases 6-9 (shipped 2026-02-05)
- ✅ **v0.3 설계 논리 일관성 확보** — Phases 10-13 (shipped 2026-02-06)
- ✅ **v0.4 테스트 전략 및 계획 수립** — Phases 14-18 (shipped 2026-02-07)
- ✅ **v0.5 인증 모델 재설계 + DX 개선** — Phases 19-21 (shipped 2026-02-07)
- ✅ **v0.6 블록체인 기능 확장 설계** — Phases 22-25 (shipped 2026-02-08)
- ✅ **v0.7 구현 장애 요소 해소** — Phases 26-30 (shipped 2026-02-08)
- ✅ **v0.8 Owner 선택적 등록 + 점진적 보안** — Phases 31-35 (shipped 2026-02-09)
- ✅ **v0.9 MCP 세션 관리 자동화 설계** — Phases 36-40 (shipped 2026-02-09)
- ✅ **v0.10 구현 전 설계 완결성 확보** — Phases 41-44 (shipped 2026-02-09)
- ✅ **v1.0 구현 계획 수립** — Phases 45-47 (shipped 2026-02-09)
- ✅ **v1.1 코어 인프라 + 기본 전송** — Phases 48-51 (shipped 2026-02-10, 281 tests, 10,925 LOC)
- ✅ **v1.2 인증 + 정책 엔진** — Phases 52-57 (shipped 2026-02-10, 457 tests, 25,526 LOC)
- 🚧 **v1.3 SDK + MCP + 알림** — Phases 58-63 (in progress)

## Phases

<details>
<summary>v0.1 Research & Design (Phases 1-5) -- SHIPPED 2026-02-05</summary>

- [x] Phase 1: AI 에이전트 지갑 요구사항 분석 (3 plans)
- [x] Phase 2: 커스터디 모델 비교 연구 (3 plans)
- [x] Phase 3: Solana 기술 스택 조사 (3 plans)
- [x] Phase 4: 주인-에이전트 관계 모델 설계 (3 plans)
- [x] Phase 5: 오픈소스/기존 솔루션 조사 + 에이전트 프레임워크 통합 (3 plans)

</details>

<details>
<summary>v0.2 Self-Hosted Secure Wallet Design (Phases 6-9) -- SHIPPED 2026-02-05</summary>

- [x] Phase 6: 코어 지갑 서비스 설계 (4 plans)
- [x] Phase 7: 세션 + 체인 추상화 설계 (4 plans)
- [x] Phase 8: 보안 계층 설계 (4 plans)
- [x] Phase 9: 통합 + 배포 설계 (4 plans)

</details>

<details>
<summary>v0.3 설계 논리 일관성 확보 (Phases 10-13) -- SHIPPED 2026-02-06</summary>

- [x] Phase 10: v0.1 잔재 정리 + 변경 매핑 (2 plans)
- [x] Phase 11: CRITICAL 의사결정 확정 (2 plans)
- [x] Phase 12: Enum/상태값 통합 대응표 (2 plans)
- [x] Phase 13: REST API<>Framework 스펙 통일 (2 plans)

</details>

<details>
<summary>v0.4 테스트 전략 및 계획 수립 (Phases 14-18) -- SHIPPED 2026-02-07</summary>

- [x] Phase 14: 테스트 레벨/매트릭스/커버리지 정의 (2 plans)
- [x] Phase 15: 보안 공격 시나리오 71건 (2 plans)
- [x] Phase 16: 블록체인 3단계 테스트 환경 (2 plans)
- [x] Phase 17: CI/CD 4단계 파이프라인 (1 plan)
- [x] Phase 18: 배포 타겟별 테스트 시나리오 (2 plans)

</details>

<details>
<summary>v0.5 인증 모델 재설계 + DX 개선 (Phases 19-21) -- SHIPPED 2026-02-07</summary>

- [x] Phase 19: 3-Tier 인증 모델 재설계 (3 plans)
- [x] Phase 20: 세션 낙관적 갱신 + CLI DX (3 plans)
- [x] Phase 21: 기존 설계 문서 11개 v0.5 통합 (3 plans)

</details>

<details>
<summary>v0.6 블록체인 기능 확장 설계 (Phases 22-25) -- SHIPPED 2026-02-08</summary>

- [x] Phase 22: 토큰 확장 + 정책 (3 plans)
- [x] Phase 23: 트랜잭션 타입 확장 (3 plans)
- [x] Phase 24: 상위 추상화 레이어 (3 plans)
- [x] Phase 25: 테스트 전략 통합 + 문서 통합 (2 plans)

</details>

<details>
<summary>v0.7 구현 장애 요소 해소 (Phases 26-30) -- SHIPPED 2026-02-08</summary>

- [x] Phase 26: 체인 어댑터 안정화 (2 plans)
- [x] Phase 27: 데몬 보안 기반 확립 (3 plans)
- [x] Phase 28: 의존성 빌드 환경 해소 (2 plans)
- [x] Phase 29: API 통합 프로토콜 완성 (2 plans)
- [x] Phase 30: 스키마 설정 확정 (2 plans)

</details>

<details>
<summary>v0.8 Owner 선택적 등록 + 점진적 보안 (Phases 31-35) -- SHIPPED 2026-02-09</summary>

- [x] Phase 31: Owner 선택적 데이터 모델 (2 plans)
- [x] Phase 32: Owner 생명주기 상태 머신 (3 plans)
- [x] Phase 33: 정책 다운그레이드 메커니즘 (2 plans)
- [x] Phase 34: 자금 회수 프로토콜 (2 plans)
- [x] Phase 35: DX + 설계 문서 통합 (2 plans)

</details>

<details>
<summary>v0.9 MCP 세션 관리 자동화 설계 (Phases 36-40) -- SHIPPED 2026-02-09</summary>

- [x] Phase 36: 토큰 파일 인프라 (2 plans)
- [x] Phase 37: SessionManager 핵심 설계 (2 plans)
- [x] Phase 38: MCP 통합 설계 (2 plans)
- [x] Phase 39: CLI + Telegram 연동 (2 plans)
- [x] Phase 40: 테스트 설계 + 문서 통합 (2 plans)

</details>

<details>
<summary>v0.10 구현 전 설계 완결성 확보 (Phases 41-44) -- SHIPPED 2026-02-09</summary>

- [x] Phase 41: 정책 엔진 완결 (2 plans)
- [x] Phase 42: 에러 처리 체계 완결 (2 plans)
- [x] Phase 43: 동시성 + 실행 로직 완결 (3 plans)
- [x] Phase 44: 운영 로직 완결 (3 plans)

</details>

<details>
<summary>v1.0 구현 계획 수립 (Phases 45-47) -- SHIPPED 2026-02-09</summary>

- [x] Phase 45: 코어 구현 objective 문서 생성 (2 plans)
- [x] Phase 46: 확장 + 릴리스 objective 문서 생성 (2 plans)
- [x] Phase 47: 설계 부채 + 로드맵 최종 검증 (1 plan)

</details>

<details>
<summary>✅ v1.1 코어 인프라 + 기본 전송 (Phases 48-51) — SHIPPED 2026-02-10</summary>

- [x] Phase 48: 모노레포 스캐폴드 + @waiaas/core (3/3 plans) — completed 2026-02-10
- [x] Phase 49: 데몬 인프라 (3/3 plans) — completed 2026-02-10
- [x] Phase 50: API 서버 + SolanaAdapter + 파이프라인 (4/4 plans) — completed 2026-02-10
- [x] Phase 51: CLI + E2E 통합 검증 (2/2 plans) — completed 2026-02-10

</details>

<details>
<summary>✅ v1.2 인증 + 정책 엔진 (Phases 52-57) — SHIPPED 2026-02-10</summary>

- [x] Phase 52: 인증 기반 (2/2 plans) — completed 2026-02-10
- [x] Phase 53: 세션 관리 (2/2 plans) — completed 2026-02-10
- [x] Phase 54: 정책 엔진 (2/2 plans) — completed 2026-02-10
- [x] Phase 55: 워크플로우 + Owner 상태 (3/3 plans) — completed 2026-02-10
- [x] Phase 56: 파이프라인 통합 (2/2 plans) — completed 2026-02-10
- [x] Phase 57: 통합 테스트 (2/2 plans) — completed 2026-02-10

</details>

### 🚧 v1.3 SDK + MCP + 알림 (In Progress)

**Milestone Goal:** AI 에이전트가 TS/Python SDK 또는 MCP로 지갑을 사용하고, Owner가 Telegram/Discord/ntfy로 알림을 받는 상태. OpenAPIHono 전환으로 전 엔드포인트 타입 안전 라우팅 + OpenAPI 3.0 자동 생성 완성.

- [x] **Phase 58: OpenAPIHono 전환 + getAssets()** - 기존 18 라우트 OpenAPIHono 리팩터링 + IChainAdapter getAssets() 선행 구현
- [x] **Phase 59: REST API 확장** - 15개 신규 엔드포인트를 OpenAPIHono로 작성하여 누적 33개 달성
- [x] **Phase 60: 알림 시스템** - 3채널(Telegram/Discord/ntfy) NotificationService + 21개 이벤트 템플릿
- [ ] **Phase 61: TypeScript SDK** - @waiaas/sdk 패키지, WAIaaSClient + WAIaaSOwnerClient, 0 외부 의존성
- [x] **Phase 62: Python SDK** - waiaas 패키지, httpx + Pydantic v2, TS SDK 동일 인터페이스
- [ ] **Phase 63: MCP Server** - @waiaas/mcp 패키지, 6 도구 + 3 리소스, SessionManager 자동 갱신, CLI mcp setup

#### Phase 58: OpenAPIHono 전환 + getAssets()
**Goal**: 전 엔드포인트가 타입 안전 라우팅으로 동작하고, GET /doc에서 OpenAPI 3.0 스펙이 자동 생성되며, getAssets()로 자산 목록을 조회할 수 있다
**Depends on**: v1.2 (Phase 57)
**Requirements**: OAPI-01, OAPI-02, OAPI-03, OAPI-04, CHAIN-01, CHAIN-02
**Success Criteria** (what must be TRUE):
  1. 기존 18개 라우트가 OpenAPIHono createRoute() 기반으로 동작하고 요청/응답에 Zod 스키마가 적용된다
  2. GET /doc 엔드포인트가 유효한 OpenAPI 3.0 JSON을 반환하고, 모든 라우트의 경로/메서드/스키마가 포함된다
  3. 68개 에러 코드가 OpenAPI 응답 스키마에 매핑되어 문서화된다
  4. v1.2 기존 466개 테스트가 OpenAPIHono 전환 후 전수 통과한다
  5. SolanaAdapter.getAssets()가 네이티브 + 토큰 자산 목록을 AssetInfo[] 타입으로 반환한다
**Plans**: 2 plans

Plans:
- [x] 58-01-PLAN.md — OpenAPIHono 전환 (기존 18 라우트 리팩터링 + GET /doc + 에러 코드 매핑 + 회귀 검증)
- [x] 58-02-PLAN.md — IChainAdapter getAssets() 구현 (인터페이스 확장 + SolanaAdapter + AssetInfo 스키마)

#### Phase 59: REST API 확장
**Goal**: SDK와 MCP가 소비할 15개 신규 엔드포인트가 OpenAPIHono로 동작하여 누적 33개 API가 완성된다
**Depends on**: Phase 58
**Requirements**: API-01, API-02, API-03, API-04, API-05, API-06, API-07, API-08, API-09, API-10, API-11, API-12, API-13, API-14, API-15
**Success Criteria** (what must be TRUE):
  1. GET /v1/wallet/assets가 에이전트 보유 네이티브+토큰 자산 목록을 반환한다
  2. GET /v1/transactions가 커서 페이지네이션으로 거래 이력을 반환하고, GET /v1/transactions/pending이 대기 중 거래를 반환한다
  3. 에이전트 관리 API(GET/PUT/DELETE /v1/agents, GET /v1/agents/:id)가 masterAuth로 보호되어 동작한다
  4. 관리자 운영 API(admin/status, kill-switch, recover, shutdown, rotate-secret)가 올바른 인증으로 보호되어 동작한다
  5. 에러 응답에 hint 필드가 포함되어 AI 에이전트가 자율 판단에 활용할 수 있다
**Plans**: 2 plans

Plans:
- [x] 59-01-PLAN.md — SDK/MCP 필수 엔드포인트 6개 (assets, transactions, pending, nonce, agents list, agent detail)
- [x] 59-02-PLAN.md — 에이전트 관리 + 관리자 운영 엔드포인트 9개 (agent PUT/DELETE + admin 6 + hint 필드)

#### Phase 60: 알림 시스템
**Goal**: Owner가 거래/보안/세션 이벤트를 Telegram, Discord, ntfy 중 설정된 채널로 실시간 수신하고, 채널 장애 시 자동 폴백이 동작한다
**Depends on**: Phase 58 (OpenAPIHono 기반 데몬에 통합)
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06, NOTIF-07, NOTIF-08
**Success Criteria** (what must be TRUE):
  1. TelegramChannel이 Bot API로 MarkdownV2 포맷 알림을 전송하고, DiscordChannel이 Webhook Embed로, NtfyChannel이 ntfy.sh plain text로 전송한다
  2. NotificationService가 우선순위 전송 + 폴백 체인으로 채널 장애 시 다른 채널로 자동 전환한다
  3. 21개 NotificationEventType에 대해 en/ko 메시지 템플릿이 제공되고, config.toml locale에 따라 적용된다
  4. Kill Switch 등 broadcast 이벤트가 전 채널에 동시 전송되고, 전 채널 실패 시 audit_log에 CRITICAL 기록된다
  5. config.toml에 알림 채널 설정 6키가 동작하고 채널별 Rate Limit이 적용된다
**Plans**: 2 plans

Plans:
- [x] 60-01-PLAN.md -- NotificationEventType 21개 확장 + en/ko 메시지 템플릿 + 3 채널 어댑터 (TelegramChannel, DiscordChannel, NtfyChannel) + 39 테스트
- [x] 60-02-PLAN.md -- NotificationService 오케스트레이터 (우선순위 폴백 + broadcast + 채널별 Rate Limit + CRITICAL audit_log) + config 확장 + 데몬 통합 + 31 테스트

#### Phase 61: TypeScript SDK
**Goal**: AI 에이전트 개발자가 @waiaas/sdk를 npm install하여 지갑 조회, 토큰 전송, 세션 갱신, Owner 승인/거절을 프로그래밍 방식으로 수행할 수 있다
**Depends on**: Phase 59 (REST API 완성)
**Requirements**: TSDK-01, TSDK-02, TSDK-03, TSDK-04, TSDK-05, TSDK-06, TSDK-07, TSDK-08
**Success Criteria** (what must be TRUE):
  1. WAIaaSClient가 baseUrl/sessionToken으로 초기화되어 getBalance/getAddress/getAssets/sendToken을 호출할 수 있다
  2. WAIaaSClient가 listTransactions/listPendingTransactions/getTransaction으로 거래 이력을 조회하고 renewSession으로 세션을 갱신할 수 있다
  3. WAIaaSOwnerClient가 ownerAuth 서명 기반으로 approve/reject/killSwitch/recover를 호출할 수 있다
  4. Zod 사전 검증이 잘못된 입력을 서버 요청 전에 차단하고, 429/5xx 시 지수 백오프 자동 재시도가 동작한다
  5. WAIaaSError가 code, message, status, retryable, hint 속성을 포함하여 에이전트가 에러를 프로그래밍 방식으로 처리할 수 있다
**Plans**: 2 plans

Plans:
- [ ] 61-01-PLAN.md -- @waiaas/sdk 패키지 스캐폴드 + WAIaaSError + HTTP layer + WAIaaSClient (getBalance/getAddress/getAssets/sendToken/getTransaction/listTransactions/listPendingTransactions/renewSession) + ~36 tests
- [ ] 61-02-PLAN.md -- WAIaaSOwnerClient (approve/reject/killSwitch/recover) + 지수 백오프 재시도 + 인라인 사전 검증 + ~33 tests

#### Phase 62: Python SDK
**Goal**: Python 기반 AI 에이전트 프레임워크에서 waiaas 패키지를 pip install하여 TS SDK와 동일한 인터페이스로 지갑을 사용할 수 있다
**Depends on**: Phase 59 (REST API 완성)
**Requirements**: PYDK-01, PYDK-02, PYDK-03, PYDK-04, PYDK-05, PYDK-06
**Success Criteria** (what must be TRUE):
  1. WAIaaSClient가 async httpx로 get_balance/get_address/get_assets/send_token을 호출할 수 있다
  2. WAIaaSClient가 get_transaction/list_transactions로 거래 이력을 조회하고 renew_session으로 세션을 갱신할 수 있다
  3. Pydantic v2 모델이 요청/응답 데이터를 검증하고 잘못된 입력 시 ValidationError를 발생시킨다
  4. 429/5xx 응답 시 지수 백오프 자동 재시도가 동작한다
**Plans**: 1 plan

Plans:
- [x] 62-01: waiaas Python 패키지 (WAIaaSClient + Pydantic 모델 + 재시도 + 테스트)

#### Phase 63: MCP Server
**Goal**: Claude Desktop 등 MCP 클라이언트에서 WAIaaS 지갑 도구 6개와 리소스 3개를 사용할 수 있고, SessionManager가 세션을 자동 갱신하며, CLI mcp setup으로 원클릭 설정이 가능하다
**Depends on**: Phase 59 (REST API), Phase 61 (SDK 패턴 참조)
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06
**Success Criteria** (what must be TRUE):
  1. stdio transport로 MCP 서버가 연결되고 6개 도구(send_token, get_balance, get_address, list_transactions, get_transaction, get_nonce)와 3개 리소스가 등록되어 조회 가능하다
  2. SessionManager가 서버 시작 시 토큰을 로드하고 TTL 60% 경과 시 자동 갱신하며, 갱신 실패 시 지수 백오프 재시도(1s/2s/4s, max 3회)가 동작한다
  3. 갱신 중 재진입이 isRenewing flag로 방지되고 409 RENEWAL_CONFLICT 시 현재 토큰 유효성을 확인한다
  4. CLI mcp setup 커맨드가 config.json 자동 생성 + 세션 토큰 발급 + mcp-token 파일 기록을 수행한다
**Plans**: 2 plans

Plans:
- [ ] 63-01: @waiaas/mcp 패키지 (6 도구 + 3 리소스 + ApiClient + stdio transport)
- [ ] 63-02: SessionManager (자동 갱신 + 실패 처리 + 동시성 제어) + CLI mcp setup

## Progress

**Execution Order:** 58 -> 59 -> 60 -> 61 -> 62 -> 63
(Phases 61 and 62 can run in parallel after Phase 59 completes. Phase 60 can run in parallel with 59.)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 58. OpenAPIHono 전환 + getAssets() | v1.3 | 2/2 | Complete | 2026-02-10 |
| 59. REST API 확장 | v1.3 | 2/2 | Complete | 2026-02-11 |
| 60. 알림 시스템 | v1.3 | 2/2 | Complete | 2026-02-11 |
| 61. TypeScript SDK | v1.3 | 0/2 | Not started | - |
| 62. Python SDK | v1.3 | 1/1 | Complete | 2026-02-11 |
| 63. MCP Server | v1.3 | 0/2 | Not started | - |

**Cumulative:**

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v0.1 Research & Design | 1-5 | 15 | Complete | 2026-02-05 |
| v0.2 Self-Hosted Design | 6-9 | 16 | Complete | 2026-02-05 |
| v0.3 설계 일관성 | 10-13 | 8 | Complete | 2026-02-06 |
| v0.4 테스트 전략 | 14-18 | 9 | Complete | 2026-02-07 |
| v0.5 인증 재설계 | 19-21 | 9 | Complete | 2026-02-07 |
| v0.6 블록체인 확장 | 22-25 | 11 | Complete | 2026-02-08 |
| v0.7 장애 요소 해소 | 26-30 | 11 | Complete | 2026-02-08 |
| v0.8 Owner 선택적 등록 | 31-35 | 11 | Complete | 2026-02-09 |
| v0.9 MCP 세션 자동화 | 36-40 | 10 | Complete | 2026-02-09 |
| v0.10 설계 완결성 | 41-44 | 10 | Complete | 2026-02-09 |
| v1.0 구현 계획 수립 | 45-47 | 5 | Complete | 2026-02-09 |
| v1.1 코어 인프라 | 48-51 | 12 | Complete | 2026-02-10 |
| v1.2 인증 + 정책 엔진 | 52-57 | 13 | Complete | 2026-02-10 |
| v1.3 SDK + MCP + 알림 | 58-63 | 7/11 | In progress | - |

**Total:** 14 milestones shipped, 61 phases completed, 147 plans completed + v1.3 in progress (6 phases, 11 plans)

---

*Last updated: 2026-02-11 after Phase 62 complete*
