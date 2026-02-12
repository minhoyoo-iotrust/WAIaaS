# Roadmap: WAIaaS v1.4.2 용어 변경 (agent -> wallet)

## Overview

코드베이스 전체에서 "agent"를 "wallet"으로 일괄 변경하여 WAIaaS가 관리하는 엔티티의 실체를 정확히 반영한다. DB 스키마 마이그레이션을 기반으로, 코어 타입 -> 데몬 API -> 소비자(MCP/SDK) -> Admin UI -> 설계 문서 순서로 의존 방향에 따라 변경을 전파하고, 최종 전수 검증으로 누락 0건을 확인한다.

## Phases

**Phase Numbering:** v1.4.1 Phase 88에 이어 89부터 시작.

- [x] **Phase 89: DB 마이그레이션** - schema_version 3: agents -> wallets 테이블 + FK 5개 + 인덱스 10개 + enum 데이터 5건
- [x] **Phase 90: 코어 타입 + 에러 코드** - @waiaas/core Zod 스키마/Enum/에러 코드/i18n 일괄 rename
- [ ] **Phase 91: 데몬 API + JWT + Config** - REST API 경로/응답/JWT claim/OpenAPI 스키마/config 키 변경
- [ ] **Phase 92: MCP + CLI + SDK** - MCP WalletContext + CLI --wallet + 환경변수 + TS/Python SDK 필드 변경
- [ ] **Phase 93: Admin Web UI** - Wallets 페이지 + Dashboard/Sessions/Policies/Notifications agentId 제거
- [ ] **Phase 94: 설계 문서 + 검증** - 설계 문서 15개 용어 갱신 + README + grep 전수 검사 + 전체 테스트 통과

## Phase Details

### Phase 89: DB 마이그레이션
**Goal**: 기존 데이터를 100% 보존하면서 DB 스키마의 모든 agent 용어를 wallet으로 전환한다
**Depends on**: Nothing (first phase)
**Requirements**: DB-01, DB-02, DB-03, DB-04, DB-05
**Success Criteria** (what must be TRUE):
  1. `wallets` 테이블이 존재하고 `agents` 테이블이 존재하지 않는다
  2. `sessions`, `transactions`, `policies`, `audit_log`, `notification_logs` 5개 테이블의 FK 컬럼이 `wallet_id`이다
  3. 모든 인덱스 이름이 `idx_wallets_*` 또는 `idx_*_wallet_*` 패턴이다
  4. `audit_log.action`에 `AGENT_*` 값이 0건이고 `WALLET_*` 값이 존재한다
  5. `schema_version`이 3이다
**Plans:** 1 plan

Plans:
- [x] 89-01-PLAN.md — schema_version 3 마이그레이션 (agents -> wallets) + Drizzle 스키마 갱신 + TDD 테스트 7건

### Phase 90: 코어 타입 + 에러 코드
**Goal**: @waiaas/core 패키지의 모든 agent 용어를 wallet으로 변경하여, 다운스트림 패키지가 참조하는 SSoT가 갱신된다
**Depends on**: Phase 89
**Requirements**: SCHEMA-01, SCHEMA-02, ERR-01, ERR-02, ERR-03, ERR-04, I18N-01, I18N-02, I18N-03
**Success Criteria** (what must be TRUE):
  1. `WalletSchema`, `CreateWalletRequestSchema`, `WalletStatusEnum` Zod 스키마가 존재하고 Agent 접두사 스키마가 0건이다
  2. 에러 코드 `WALLET_NOT_FOUND`, `WALLET_SUSPENDED`, `WALLET_TERMINATED`가 존재하고 `AGENT_*` 에러 코드가 0건이다
  3. AuditAction/NotificationEvent enum에 `WALLET_*` 값만 존재한다
  4. i18n en/ko 템플릿에서 `{walletId}`, `{walletCount}` 변수가 사용되고 `{agentId}` 변수가 0건이다
  5. `tsc --noEmit` 컴파일이 성공한다
**Plans:** 2 plans

Plans:
- [x] 90-01-PLAN.md — Zod 스키마 + Enum + 에러 코드 rename (파일명 포함, 13 파일)
- [x] 90-02-PLAN.md — i18n 템플릿 변수/키/텍스트 변경 + core 테스트 갱신 (7 파일)

### Phase 91: 데몬 API + JWT + Config
**Goal**: REST API 경로/응답/JWT가 wallet 용어를 사용하여, 외부 소비자(SDK/MCP/Admin)가 walletId 기반으로 통신한다
**Depends on**: Phase 90
**Requirements**: API-01, API-02, API-03, API-04, API-05, SCHEMA-03, SCHEMA-04, CONF-01
**Success Criteria** (what must be TRUE):
  1. `POST /v1/wallets` 등 6개 엔드포인트가 동작하고 `/v1/agents` 경로가 404를 반환한다
  2. 모든 응답 body에 `walletId` 필드가 존재하고 `agentId` 필드가 0건이다
  3. JWT payload claim이 `wlt`이고 `agt` claim 토큰이 401로 거부된다
  4. `GET /doc` OpenAPI 스펙에서 `agentId` 0건, `walletId` 존재한다
  5. `max_sessions_per_wallet` config 키가 파싱되고 `max_sessions_per_agent`는 거부된다
**Plans**: TBD

Plans:
- [ ] 91-01: OpenAPI 스키마 rename + agents.ts -> wallets.ts 라우트 파일 변경
- [ ] 91-02: JWT claim + session-auth + Hono context + config 키 변경 + 데몬 테스트 갱신

### Phase 92: MCP + CLI + SDK
**Goal**: MCP/CLI/SDK 소비자 패키지가 wallet 용어를 사용하여, AI 에이전트가 walletId 기반으로 지갑에 접근한다
**Depends on**: Phase 91
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, SDK-01, SDK-02
**Success Criteria** (what must be TRUE):
  1. `WalletContext` 인터페이스가 존재하고 `AgentContext`가 0건이다
  2. CLI `--wallet` 플래그가 동작하고 `--agent`가 미인식된다
  3. `WAIAAS_WALLET_ID`/`WAIAAS_WALLET_NAME` 환경변수가 동작한다
  4. TS SDK 응답에 `walletId` 필드가 존재하고 Python SDK에 `wallet_id` 필드가 존재한다
  5. `mcp-tokens/<walletId>` 경로로 토큰이 저장된다
**Plans**: TBD

Plans:
- [ ] 92-01: MCP WalletContext + withWalletPrefix + 환경변수 + 토큰 경로 변경
- [ ] 92-02: CLI --wallet 플래그 + TS SDK + Python SDK 필드 변경 + 테스트 갱신

### Phase 93: Admin Web UI
**Goal**: Admin UI가 wallet 용어를 사용하여, 관리자가 "Wallets" 페이지에서 지갑을 관리한다
**Depends on**: Phase 91
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04
**Success Criteria** (what must be TRUE):
  1. `/admin` Wallets 탭이 렌더링되고 "Agents" 텍스트가 0건이다
  2. Dashboard의 StatCard가 "Wallets"를 표시하고 `walletCount` 필드를 사용한다
  3. Sessions/Policies/Notifications 페이지에서 `agentId` 참조가 0건이다
  4. Admin 테스트 4개 파일이 `walletId`/`walletCount` fixture로 통과한다
**Plans**: TBD

Plans:
- [ ] 93-01: Wallets 페이지 + Dashboard + Sessions/Policies/Notifications 용어 변경 + 테스트 갱신

### Phase 94: 설계 문서 + 검증
**Goal**: 설계 문서와 README가 코드와 일치하고, 전체 코드베이스에서 의도하지 않은 agent 잔존이 0건이다
**Depends on**: Phase 89, 90, 91, 92, 93 (all)
**Requirements**: DOCS-01, DOCS-02, VERIFY-01, VERIFY-02, VERIFY-03
**Success Criteria** (what must be TRUE):
  1. 설계 문서 15개에서 코드 식별자/테이블명/스키마명이 wallet 용어로 갱신되었다
  2. README.md에서 API 예시/필드명이 코드와 일치한다
  3. `grep -r 'agent' packages/` 결과에서 의도적 잔존(AI agent 설명 등) 외 0건이다
  4. `pnpm test` 전체 테스트(1,313+)가 통과한다
  5. `GET /doc` OpenAPI 스펙에서 `agentId` 0건, `walletId` 존재한다
**Plans**: TBD

Plans:
- [ ] 94-01: 설계 문서 15개 용어 갱신 + README 갱신
- [ ] 94-02: grep 전수 검사 + pnpm test + OpenAPI 스펙 검증

## Progress

**Execution Order:** 89 -> 90 -> 91 -> 92 (+ 93 병렬 가능) -> 94

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 89. DB 마이그레이션 | 1/1 | ✓ Complete | 2026-02-13 |
| 90. 코어 타입 + 에러 코드 | 2/2 | ✓ Complete | 2026-02-13 |
| 91. 데몬 API + JWT + Config | 0/2 | Not started | - |
| 92. MCP + CLI + SDK | 0/2 | Not started | - |
| 93. Admin Web UI | 0/1 | Not started | - |
| 94. 설계 문서 + 검증 | 0/2 | Not started | - |

---
*Roadmap created: 2026-02-13*
*Milestone: v1.4.2 용어 변경 (agent -> wallet)*
