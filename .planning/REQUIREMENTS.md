# Requirements: WAIaaS v1.4.2

**Defined:** 2026-02-13
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다

## v1 Requirements

Requirements for v1.4.2 용어 변경 (agent -> wallet). 각 항목은 로드맵 페이즈에 매핑.

### DB 마이그레이션

- [ ] **DB-01**: schema_version 3 증분 마이그레이션으로 `agents` 테이블을 `wallets`로 rename한다
- [ ] **DB-02**: `sessions.agent_id`, `transactions.agent_id`, `policies.agent_id`, `audit_log.agent_id`, `notification_logs.agent_id` FK 컬럼을 `wallet_id`로 변경한다
- [ ] **DB-03**: 관련 인덱스 10개를 `idx_wallets_*`, `idx_*_wallet_*`로 rename한다
- [ ] **DB-04**: `audit_log.action`의 `AGENT_CREATED/ACTIVATED/SUSPENDED/TERMINATED` -> `WALLET_*` 데이터를 UPDATE한다
- [ ] **DB-05**: `notification_logs.event_type`의 `AGENT_SUSPENDED` -> `WALLET_SUSPENDED` 데이터를 UPDATE한다

### REST API

- [ ] **API-01**: `/v1/agents` CRUD 6개 엔드포인트를 `/v1/wallets`로 변경한다
- [ ] **API-02**: `/v1/wallet/*` 세션 기반 3개 경로의 내부 변수 `agentId` -> `walletId`로 변경한다 (경로 유지)
- [ ] **API-03**: 9개 응답 스키마의 `agentId`/`agentCount` 필드를 `walletId`/`walletCount`로 변경한다
- [ ] **API-04**: JWT payload claim `agt` -> `wlt`로 변경하고, Hono context `agentId` -> `walletId`로 변경한다
- [ ] **API-05**: 트랜잭션/세션 라우트 핸들러 내부 `c.get('agentId')` -> `c.get('walletId')`로 변경한다

### Zod 스키마 + 타입

- [ ] **SCHEMA-01**: core `AgentSchema`/`CreateAgentRequestSchema` -> `WalletSchema`/`CreateWalletRequestSchema`로 rename한다 (파일명 포함)
- [ ] **SCHEMA-02**: core `AGENT_STATUSES`/`AgentStatus`/`AgentStatusEnum` -> `WALLET_*`로 rename한다 (파일명 포함)
- [ ] **SCHEMA-03**: daemon `openapi-schemas.ts`의 Agent 관련 7개 스키마를 Wallet로 rename한다
- [ ] **SCHEMA-04**: daemon `agents.ts` 라우트 파일을 `wallets.ts`로 rename하고 내부 인터페이스/함수명을 변경한다

### 에러 코드 + Enum

- [ ] **ERR-01**: `AGENT_NOT_FOUND`/`AGENT_SUSPENDED`/`AGENT_TERMINATED` 에러 코드를 `WALLET_*`로 변경한다
- [ ] **ERR-02**: ErrorDomain `'AGENT'` -> `'WALLET'`로 변경한다
- [ ] **ERR-03**: AuditAction enum의 `AGENT_CREATED/ACTIVATED/SUSPENDED/TERMINATED` -> `WALLET_*`로 변경한다
- [ ] **ERR-04**: NotificationEvent enum의 `AGENT_SUSPENDED` -> `WALLET_SUSPENDED`로 변경한다

### MCP / CLI / 환경변수

- [ ] **MCP-01**: `AgentContext` 인터페이스를 `WalletContext`로 rename하고 `agentName` -> `walletName`으로 변경한다
- [ ] **MCP-02**: `withAgentPrefix()` -> `withWalletPrefix()`로 rename한다
- [ ] **MCP-03**: CLI `--agent` 플래그를 `--wallet`로 변경한다
- [ ] **MCP-04**: `WAIAAS_AGENT_ID`/`WAIAAS_AGENT_NAME` 환경변수를 `WAIAAS_WALLET_ID`/`WAIAAS_WALLET_NAME`으로 변경한다
- [ ] **MCP-05**: `mcp-tokens/<agentId>` 경로를 `mcp-tokens/<walletId>`로 변경한다

### i18n 알림 템플릿

- [ ] **I18N-01**: en/ko 템플릿의 `{agentId}` -> `{walletId}`, `{agentCount}` -> `{walletCount}` 변수를 변경한다 (~20건)
- [ ] **I18N-02**: `AGENT_SUSPENDED` i18n 키를 `WALLET_SUSPENDED`로 변경한다
- [ ] **I18N-03**: 알림 텍스트의 "Agent"/"에이전트" -> "Wallet"/"지갑" 용어를 변경한다 (~13건)

### SDK

- [ ] **SDK-01**: TypeScript SDK의 `agentId` 응답 필드를 `walletId`로 변경한다
- [ ] **SDK-02**: Python SDK 6개 파일의 `agent_id` -> `wallet_id` 필드를 변경한다

### Config

- [ ] **CONF-01**: `max_sessions_per_agent` config 키를 `max_sessions_per_wallet`로 변경한다

### Admin Web UI

- [ ] **ADMIN-01**: Agents 페이지를 Wallets 페이지로 변경한다 (인터페이스, 컬럼, UI 텍스트)
- [ ] **ADMIN-02**: Dashboard의 `agentCount` -> `walletCount` 필드와 StatCard 레이블을 변경한다
- [ ] **ADMIN-03**: Sessions/Policies/Notifications 페이지의 `agentId` 필드와 관련 함수를 변경한다
- [ ] **ADMIN-04**: Admin 테스트 4개 파일의 fixture를 `walletId`/`walletCount`로 변경한다

### 설계 문서 + README

- [ ] **DOCS-01**: 설계 문서 15개의 agent 용어를 wallet으로 일괄 변경한다 (~317건, 문맥별 판별)
- [ ] **DOCS-02**: README.md의 agent 용어를 wallet으로 변경하고 v1.4.2 현황을 반영한다

### 검증

- [ ] **VERIFY-01**: `grep -r 'agent' packages/` 전수 검사로 의도적 잔존 외 0건을 확인한다
- [ ] **VERIFY-02**: `pnpm test` 전체 테스트 통과를 확인한다 (1,313+ tests)
- [ ] **VERIFY-03**: `GET /doc` OpenAPI 스펙에서 `agentId` 0건, `walletId` 존재를 확인한다

## v2 Requirements

없음 -- 용어 변경은 단일 마일스톤에서 atomic하게 완료.

## Out of Scope

| Feature | Reason |
|---------|--------|
| API v2 버전 분리 | 외부 소비자 없음 (self-hosted 내부). breaking change 허용 |
| 하위 호환 shim/deprecated alias | 외부 배포 전이므로 불필요. 깔끔하게 일괄 변경 |
| `mcp-tokens/` 기존 토큰 자동 마이그레이션 | JWT claim 변경으로 기존 토큰 무효화. 재설정 안내로 대체 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 89 | Pending |
| DB-02 | Phase 89 | Pending |
| DB-03 | Phase 89 | Pending |
| DB-04 | Phase 89 | Pending |
| DB-05 | Phase 89 | Pending |
| SCHEMA-01 | Phase 90 | Pending |
| SCHEMA-02 | Phase 90 | Pending |
| ERR-01 | Phase 90 | Pending |
| ERR-02 | Phase 90 | Pending |
| ERR-03 | Phase 90 | Pending |
| ERR-04 | Phase 90 | Pending |
| I18N-01 | Phase 90 | Pending |
| I18N-02 | Phase 90 | Pending |
| I18N-03 | Phase 90 | Pending |
| API-01 | Phase 91 | Pending |
| API-02 | Phase 91 | Pending |
| API-03 | Phase 91 | Pending |
| API-04 | Phase 91 | Pending |
| API-05 | Phase 91 | Pending |
| SCHEMA-03 | Phase 91 | Pending |
| SCHEMA-04 | Phase 91 | Pending |
| CONF-01 | Phase 91 | Pending |
| MCP-01 | Phase 92 | Pending |
| MCP-02 | Phase 92 | Pending |
| MCP-03 | Phase 92 | Pending |
| MCP-04 | Phase 92 | Pending |
| MCP-05 | Phase 92 | Pending |
| SDK-01 | Phase 92 | Pending |
| SDK-02 | Phase 92 | Pending |
| ADMIN-01 | Phase 93 | Pending |
| ADMIN-02 | Phase 93 | Pending |
| ADMIN-03 | Phase 93 | Pending |
| ADMIN-04 | Phase 93 | Pending |
| DOCS-01 | Phase 94 | Pending |
| DOCS-02 | Phase 94 | Pending |
| VERIFY-01 | Phase 94 | Pending |
| VERIFY-02 | Phase 94 | Pending |
| VERIFY-03 | Phase 94 | Pending |

**Coverage:**
- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0

---
*Requirements defined: 2026-02-13*
*Last updated: 2026-02-13 after roadmap creation*
