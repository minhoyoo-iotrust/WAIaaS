# 마일스톤 m15-02: 용어 변경 (agent → wallet)

## 목표

코드베이스와 설계 문서 전체에서 "agent"를 "wallet"으로 일괄 변경하여, WAIaaS가 관리하는 엔티티의 실체(AI 에이전트가 사용하는 **지갑**)를 정확히 반영한다. AI 에이전트는 외부 소비자이고, WAIaaS가 생성·관리하는 것은 지갑이다.

---

## 배경

### 문제

현재 코드베이스에서 "agent"라고 부르는 엔티티의 실제 역할:

| 현재 용어 | 실체 |
|-----------|------|
| `agents` 테이블 | AI 에이전트가 사용하는 **지갑** |
| `POST /v1/agents` | 지갑 생성 |
| `agent_id` FK | 지갑 참조 |
| `AgentSchema` | 지갑 데이터 모델 |
| `--agent` CLI 플래그 | 지갑 지정 |

"Agent"라는 용어는 외부의 AI 에이전트(Claude, GPT 등)와 혼동을 일으키며, Wallet-as-a-Service라는 서비스 이름과도 불일치한다.

### 변경 원칙

- **wallet**: 엔티티 이름 (`agents` → `wallets`)
- **walletId**: 참조 필드 (`agentId` → `walletId`, `agent_id` → `wallet_id`)
- 기존 `/v1/wallet/*` 세션 기반 경로는 유지 (이미 "wallet" 용어 사용 중). 내부 변수만 `agentId` → `walletId` 변경
- 모든 변경은 단일 마일스톤에서 atomic하게 수행

---

## 변경 범위

### 1. 데이터베이스 스키마 (DB 마이그레이션)

| 현재 | 변경 후 | 비고 |
|------|---------|------|
| `agents` 테이블 | `wallets` | 테이블 재생성 (SQLite ALTER TABLE RENAME 지원) |
| `sessions.agent_id` | `sessions.wallet_id` | FK + 인덱스 |
| `transactions.agent_id` | `transactions.wallet_id` | FK + 인덱스 |
| `policies.agent_id` | `policies.wallet_id` | FK + 인덱스 |
| `audit_log.agent_id` | `audit_log.wallet_id` | nullable 컬럼 (FK 없음, denormalized) + 인덱스 |
| `notification_logs.agent_id` | `notification_logs.wallet_id` | nullable 컬럼 (FK 없음, denormalized) + 인덱스 |
| `idx_agents_*` (4개) | `idx_wallets_*` | agents 테이블 인덱스 |
| `idx_sessions_agent_id` | `idx_sessions_wallet_id` | FK 인덱스 |
| `idx_transactions_agent_status` | `idx_transactions_wallet_status` | composite 인덱스 |
| `idx_policies_agent_enabled` | `idx_policies_wallet_enabled` | composite 인덱스 |
| `idx_audit_log_agent_id` | `idx_audit_log_wallet_id` | FK 인덱스 |
| `idx_audit_log_agent_timestamp` | `idx_audit_log_wallet_timestamp` | composite 인덱스 |
| `idx_notification_logs_agent_id` | `idx_notification_logs_wallet_id` | FK 인덱스 |

**데이터 마이그레이션 (enum 값 변경):** `audit_log.action`과 `notification_logs.event_type` 컬럼에 저장된 기존 enum 문자열도 UPDATE 필요:

| 테이블.컬럼 | 현재 값 | 변경 후 |
|------------|---------|---------|
| `audit_log.action` | `AGENT_CREATED` | `WALLET_CREATED` |
| `audit_log.action` | `AGENT_ACTIVATED` | `WALLET_ACTIVATED` |
| `audit_log.action` | `AGENT_SUSPENDED` | `WALLET_SUSPENDED` |
| `audit_log.action` | `AGENT_TERMINATED` | `WALLET_TERMINATED` |
| `notification_logs.event_type` | `AGENT_SUSPENDED` | `WALLET_SUSPENDED` |

**마이그레이션 전략:** schema_version 3 증분 마이그레이션 (현재 v2). SQLite `ALTER TABLE RENAME` + 컬럼별 테이블 재생성 + 기존 데이터 enum 값 UPDATE. 기존 데이터 100% 보존. `audit_log`과 `notification_logs`는 FK 제약 없으므로 단순 컬럼 rename으로 처리 가능.

### 2. REST API 엔드포인트

| 현재 | 변경 후 |
|------|---------|
| `POST /v1/agents` | `POST /v1/wallets` |
| `GET /v1/agents` | `GET /v1/wallets` |
| `GET /v1/agents/{id}` | `GET /v1/wallets/{id}` |
| `PUT /v1/agents/{id}` | `PUT /v1/wallets/{id}` |
| `DELETE /v1/agents/{id}` | `DELETE /v1/wallets/{id}` |
| `PUT /v1/agents/{id}/owner` | `PUT /v1/wallets/{id}/owner` |

**세션 기반 `/v1/wallet/*` 경로 (3개):** 경로 유지. 이미 "wallet" 용어를 사용하고 있으며, 세션 기반 접근 패턴이 MCP/SDK에서 핵심이므로 경로 변경은 불필요한 breaking change. 내부 변수(`agentId` → `walletId`)와 응답 필드만 변경.

| 경로 (유지) | 내부 변경 |
|-------------|----------|
| `GET /v1/wallet/address` | JWT claim + 응답 `agentId` → `walletId` |
| `GET /v1/wallet/balance` | JWT claim + 응답 `agentId` → `walletId` |
| `GET /v1/wallet/assets` | JWT claim + 응답 `agentId` → `walletId` |

**내부 변수 변경이 필요한 추가 라우트:** 경로는 변경 없으나 핸들러 내부에서 `c.get('agentId')` 사용 중이므로 `c.get('walletId')`로 변경 필요:

| 라우트 파일 | 영향 범위 |
|------------|----------|
| `transactions.ts` (7개 엔드포인트) | `agentId` 변수 3곳 (`send`, `list`, `pending` 핸들러) |
| `sessions.ts` (4개 엔드포인트) | JWT payload `agt` → `wlt` claim 매핑, `agentId` 파라미터 전달 |

### 2-1. REST API 응답 필드

모든 응답 body에서 `agentId` 필드를 `walletId`로 변경:

| 응답 스키마 | 변경 필드 |
|------------|----------|
| `WalletAddressResponseSchema` | `agentId` → `walletId` |
| `WalletBalanceResponseSchema` | `agentId` → `walletId` |
| `WalletAssetsResponseSchema` | `agentId` → `walletId` |
| `TransactionResponseSchema` | `agentId` → `walletId` |
| `PolicyResponseSchema` | `agentId` → `walletId` |
| `SessionResponseSchema` | `agentId` → `walletId` |
| `AuditLogResponseSchema` | `agentId` → `walletId` |
| `NotificationLogResponseSchema` | `agentId` → `walletId` |

### 2-2. JWT payload claim

| 현재 | 변경 후 | 비고 |
|------|---------|------|
| JWT payload claim `agt` | `wlt` | jwt-secret-manager.ts `JWTPayload.agt` 축약 claim |
| Hono context `c.set('agentId', ...)` | `c.set('walletId', ...)` | session-auth.ts에서 `payload.agt` → context 변수 전달 |

**참고:** JWT payload는 크기 효율을 위해 축약 claim 이름(`agt`)을 사용한다. 변경 후 `wlt`로 통일.

**기존 JWT 토큰 호환:** 변경 후 기존 발급된 JWT 토큰은 `agt` claim을 가지고 있어 무효화됨. 세션 재생성 필요.

### 3. Zod 스키마 + TypeScript 타입 (14개)

**core `schemas/agent.schema.ts` (2 스키마 + 2 타입):**

| 현재 | 변경 후 |
|------|---------|
| `AgentSchema` | `WalletSchema` |
| `CreateAgentRequestSchema` | `CreateWalletRequestSchema` |
| `Agent` 타입 | `Wallet` 타입 |
| `CreateAgentRequest` 타입 | `CreateWalletRequest` 타입 |

**core `enums/agent.ts` (1 상수 + 1 타입 + 1 enum):**

| 현재 | 변경 후 |
|------|---------|
| `AGENT_STATUSES` 상수 | `WALLET_STATUSES` 상수 |
| `AgentStatus` 타입 | `WalletStatus` 타입 |
| `AgentStatusEnum` | `WalletStatusEnum` |

**daemon `openapi-schemas.ts` (7 스키마):**

| 현재 | 변경 후 |
|------|---------|
| `AgentResponseSchema` | `WalletResponseSchema` |
| `AgentOwnerResponseSchema` | `WalletOwnerResponseSchema` |
| `AgentListResponseSchema` | `WalletListResponseSchema` |
| `AgentDetailResponseSchema` | `WalletDetailResponseSchema` |
| `AgentDeleteResponseSchema` | `WalletDeleteResponseSchema` |
| `UpdateAgentRequestSchema` | `UpdateWalletRequestSchema` |
| `CreateAgentRequestOpenAPI` | `CreateWalletRequestOpenAPI` |

**공통:** 모든 `agentId` 필드 → `walletId`

**daemon 라우트 파일 + 인터페이스:**

| 현재 | 변경 후 | 비고 |
|------|---------|------|
| `agents.ts` (파일명) | `wallets.ts` | 라우트 파일 rename |
| `AgentRouteDeps` 인터페이스 | `WalletRouteDeps` | agents.ts:43 의존성 인터페이스 |
| `agentRoutes()` 함수 | `walletRoutes()` | agents.ts:180 라우트 팩토리 |

**core 파일 rename:**

| 현재 | 변경 후 |
|------|---------|
| `schemas/agent.schema.ts` | `schemas/wallet.schema.ts` |
| `enums/agent.ts` | `enums/wallet.ts` |

### 4. 에러 코드 + Enum 값

**에러 코드 (`error-codes.ts`):**

| 현재 | 변경 후 |
|------|---------|
| `AGENT_NOT_FOUND` | `WALLET_NOT_FOUND` |
| `AGENT_SUSPENDED` | `WALLET_SUSPENDED` |
| `AGENT_TERMINATED` | `WALLET_TERMINATED` |
| ErrorDomain `'AGENT'` | `'WALLET'` |

**Audit Action enum (`enums/audit.ts`):**

| 현재 | 변경 후 |
|------|---------|
| `AGENT_CREATED` | `WALLET_CREATED` |
| `AGENT_ACTIVATED` | `WALLET_ACTIVATED` |
| `AGENT_SUSPENDED` | `WALLET_SUSPENDED` |
| `AGENT_TERMINATED` | `WALLET_TERMINATED` |

**Notification Event enum (`enums/notification.ts`):**

| 현재 | 변경 후 |
|------|---------|
| `AGENT_SUSPENDED` | `WALLET_SUSPENDED` |

**참고:** 이 enum 값들은 DB `audit_log.action` 및 `notification_logs.event_type` 컬럼에 문자열로 저장되므로, 섹션 1의 데이터 마이그레이션과 연동.

### 5. MCP / CLI / 환경변수

| 현재 | 변경 후 |
|------|---------|
| `AgentContext` 인터페이스 | `WalletContext` |
| `agentName` 필드 | `walletName` |
| `withAgentPrefix()` 함수 | `withWalletPrefix()` |
| CLI `--agent <id>` 플래그 | `--wallet <id>` |
| `WAIAAS_AGENT_ID` 환경변수 | `WAIAAS_WALLET_ID` |
| `WAIAAS_AGENT_NAME` 환경변수 | `WAIAAS_WALLET_NAME` |
| `mcp-tokens/<agentId>` 경로 | `mcp-tokens/<walletId>` |

### 5-1. i18n 알림 템플릿

`core/src/i18n/en.ts`와 `ko.ts`에서 알림 메시지 템플릿의 용어 변경:

**템플릿 변수 (20건):**

| 현재 | 변경 후 | 발생 |
|------|---------|------|
| `{agentId}` | `{walletId}` | en 9건 + ko 9건 |
| `{agentCount}` | `{walletCount}` | en 1건 + ko 1건 |

**i18n 키 변경 (2건):**

| 현재 | 변경 후 | 비고 |
|------|---------|------|
| `AGENT_SUSPENDED` (i18n 키) | `WALLET_SUSPENDED` | en 1건 + ko 1건, 섹션 4 enum 변경과 연동 |

**텍스트 용어 변경 (~13건):**

| 현재 텍스트 | 변경 후 | 발생 |
|------------|---------|------|
| `"Agent {agentId}"` 등 | `"Wallet {walletId}"` | en ~4건 |
| `"에이전트 {agentId}"` 등 | `"지갑 {walletId}"` | ko ~9건 |

**참고:** 알림 서비스(`notification-service.ts`)에서 템플릿 변수를 치환할 때 `agentId` 키로 전달하는 코드도 `walletId`로 변경 필요.

### 6. SDK (TypeScript + Python)

| 현재 | 변경 후 |
|------|---------|
| TS: `BalanceResponse.agentId` 등 | `BalanceResponse.walletId` |
| Python: `WalletAddress.agent_id` 등 | `WalletAddress.wallet_id` |

**Python SDK 파일 (6개):** 소스 3개 (`models.py`, `client.py`, `__init__.py`) + 테스트 3개 (`test_models.py`, `test_client.py`, `conftest.py`)

### 7. Config

| 현재 | 변경 후 |
|------|---------|
| `max_sessions_per_agent` | `max_sessions_per_wallet` |

**환경변수 오버라이드:** `WAIAAS_{SECTION}_{KEY}` 자동 매핑 패턴(config loader `applyEnvOverrides`)에 의해 config 키 변경 시 `WAIAAS_SECURITY_MAX_SESSIONS_PER_WALLET`로 자동 반영. 별도 코드 변경 불필요.

### 8. Admin Web UI

**Agents 페이지 (`agents.tsx`):**

| 현재 | 변경 후 |
|------|---------|
| Agents 페이지 (`/admin` → agents 탭) | Wallets 페이지 |
| `Agent` / `AgentDetail` 인터페이스 | `Wallet` / `WalletDetail` |
| `agentColumns` | `walletColumns` |
| UI 텍스트: "Agents", "Agent Detail" 등 | "Wallets", "Wallet Detail" |

**Dashboard 페이지 (`dashboard.tsx`):**

| 현재 | 변경 후 |
|------|---------|
| `AdminStatus.agentCount` 필드 | `AdminStatus.walletCount` |
| StatCard label `"Agents"` | `"Wallets"` |

**연관 daemon 스키마 (`openapi-schemas.ts`):**

| 현재 | 변경 후 |
|------|---------|
| `AdminStatusResponseSchema.agentCount` | `walletCount` |
| `admin.ts` 핸들러 변수 `agentCount` | `walletCount` |

**추가 영향 페이지 (agentId 필드 사용):**

| 페이지 | `agentId` 사용 건수 | 변경 내용 |
|--------|-------------------|----------|
| `sessions.tsx` | 4건 | 인터페이스 필드 + API 쿼리 파라미터 |
| `policies.tsx` | 13건 | 인터페이스 필드 + 필터 + `getAgentName()` → `getWalletName()` |
| `notifications.tsx` | 3건 | 인터페이스 필드 + 렌더링 |

**Admin 테스트 파일 (4개):**

| 테스트 | `agentId`/`agentCount` 사용 |
|--------|---------------------------|
| `dashboard.test.tsx` | `agentCount` fixture 1건 |
| `sessions.test.tsx` | `agentId` fixture 4건 |
| `policies.test.tsx` | `agentId` fixture 3건 |
| `notifications.test.tsx` | `agentId` fixture 5건 |

### 9. 설계 문서 (15개)

agent 용어를 사용하는 설계 문서 15개의 용어를 일괄 갱신. 발생 횟수는 `grep -ci 'agent'` 기준이며, "AI 에이전트" 등 의도적 잔존을 제외한 치환 대상은 문맥별로 판별:

| 문서 | 발생 횟수 |
|------|----------|
| 67-admin-web-ui-spec.md | 91 |
| 42-mock-boundaries-interfaces-contracts.md | 48 |
| 47-boundary-value-chain-scenarios.md | 32 |
| 46-keystore-external-security-scenarios.md | 31 |
| 45-layer3-killswitch-recovery-attacks.md | 22 |
| 43-layer1-session-auth-attacks.md | 17 |
| 56-token-transfer-extension-spec.md | 15 |
| 49-enum-config-consistency-verification.md | 15 |
| 60-batch-transaction-spec.md | 10 |
| 57-asset-query-fee-estimation-spec.md | 8 |
| 58-contract-call-spec.md | 8 |
| 62-action-provider-architecture.md | 7 |
| 44-layer2-policy-bypass-attacks.md | 7 |
| 59-approve-management-spec.md | 5 |
| 61-price-oracle-spec.md | 1 |

**총 ~317건** 발생. 치환 대상은 문맥 검토 후 확정 (코드 식별자·테이블명·스키마명 등은 전수 치환, "AI 에이전트" 서술은 유지).

### 10. 테스트 파일 (~53개)

코드 변경에 따라 자동으로 동기화. 테스트 명세의 "agent" 문자열도 "wallet"으로 갱신.

### 11. README.md

프로젝트 README의 "agent" 용어 갱신 + v1.4.2 시점의 프로젝트 현황 반영:

- "agent" → "wallet" 용어 치환 (8건)
- API 예시 코드의 엔드포인트/필드명 갱신
- 기능 목록에 v1.4~v1.4.1에서 추가된 내용 반영 (토큰 전송, EVM 지원 등)

---

## 기술 결정 사항

| # | 결정 항목 | 결정 | 근거 |
|---|----------|------|------|
| 1 | 새 엔티티 이름 | `wallet` | 서비스명(WaaS)과 일치, 가장 직관적. "account"는 너무 추상적 |
| 2 | API 버전 | v1 유지 (breaking change) | v1.4.2는 아직 외부 소비자 없음 (self-hosted 내부 사용). API v2 불필요 |
| 3 | DB 마이그레이션 | 증분 마이그레이션 | v1.4 Phase 76에서 구축한 마이그레이션 러너 활용. 테이블 재생성으로 컬럼명 변경 |
| 4 | `/v1/wallet/*` 세션 경로 | 유지 (내부 변수만 변경) | 이미 "wallet" 용어 사용 중. 세션 기반 접근이 MCP/SDK 핵심 패턴. 경로 변경 시 불필요한 breaking change |
| 5 | 설계 문서 갱신 | 코드와 동시 | 코드 변경과 문서 변경을 같은 phase에서 수행하여 불일치 방지 |
| 6 | 하위 호환 shim | 제공하지 않음 | 외부 배포 전이므로 deprecated alias 불필요. 깔끔하게 일괄 변경 |
| 7 | MCP 토큰 마이그레이션 | 기존 토큰 폐기 + 재설정 안내 | JWT claim 변경(`agt` → `wlt`)으로 기존 토큰 무효화. `mcp-tokens/` 디렉토리 삭제 후 `waiaas mcp setup --wallet` 재실행 안내 |

---

## 영향 범위 요약

| 카테고리 | 항목 수 |
|----------|---------|
| DB 테이블 | 1 (`agents` → `wallets`) |
| DB 컬럼 (FK) | 5 (`agent_id` → `wallet_id`) |
| DB 인덱스 | 10 (agents 테이블 4 + FK/composite 6) |
| DB 데이터 UPDATE | 5 (audit_log.action 4개 + notification_logs.event_type 1개 enum 값) |
| REST 엔드포인트 | 6 (CRUD) + 3 세션 경로 내부 변경 |
| REST 응답 필드 | 9 스키마의 `agentId`/`agentCount` → `walletId`/`walletCount` |
| JWT claim | 1 (`agt` → `wlt`) |
| Zod 스키마 + 타입 | 14 (core 7 + daemon 7) |
| Enum 값 | 5 (audit 4 + notification 1) |
| TypeScript 파일 | ~143 (소스 90 + 테스트 53) |
| Python 파일 | 6 (소스 3 + 테스트 3) |
| 에러 코드 | 3 + 도메인 1 |
| i18n 템플릿 | ~35건 (변수 20 + 키 2 + 텍스트 ~13) |
| MCP/CLI | ~11 파일 |
| 환경변수 | 2 (`WAIAAS_AGENT_ID`, `WAIAAS_AGENT_NAME`) |
| Config 키 | 1 (환경변수 오버라이드는 `WAIAAS_{SECTION}_{KEY}` 자동 매핑) |
| Admin UI | 4 페이지 + 4 테스트 (agents, dashboard, sessions, policies, notifications) |
| 설계 문서 | 15 (~317건, 치환 대상은 문맥별 판별) |
| 테스트 파일 | ~53 |
| README.md | 1 (용어 8건 + 현황 갱신) |
| 파일 rename | 3 (agents.ts, agent.schema.ts, agent.ts) |

---

## E2E 검증 시나리오

**자동화 비율: 100% -- `[HUMAN]` 0건**

### 코드 변경 검증

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | "agent" 잔존 검사 | `grep -r 'agent' packages/` 결과에서 의도적 잔존(AI agent 설명 등) 외 0건 assert | [L0] |
| 2 | 기존 전체 테스트 통과 | `pnpm test` 895+ 테스트 전수 통과 assert | [L0] |
| 3 | Wallet CRUD 동작 | `POST /v1/wallets` → 201, `GET /v1/wallets` → 200 + walletId 필드 존재 assert | [L0] |
| 4 | DB 마이그레이션 정상 | v1.4.1 DB → 마이그레이션 실행 → `wallets` 테이블 존재 + 기존 데이터 보존 assert | [L0] |
| 5 | OpenAPI 스펙 일관성 | `GET /doc` → 모든 스키마에서 `agentId` 0건, `walletId` 존재 assert | [L0] |
| 6 | SDK 필드명 변경 | TS SDK `BalanceResponse.walletId` 존재, Python SDK `wallet_id` 존재 assert | [L0] |
| 7 | MCP 도구 동작 | MCP 서버 `WalletContext` 기반 도구 6개 정상 응답 assert | [L0] |
| 8 | CLI `--wallet` 플래그 | `waiaas mcp setup --wallet <id>` 정상 동작 assert | [L0] |
| 9 | Admin UI Wallets 페이지 | `/admin` → Wallets 탭 렌더링 + API 호출 정상 assert | [L0] |
| 10 | Config 키 변경 | `max_sessions_per_wallet` 파싱 정상 + 기존 `max_sessions_per_agent` 거부 assert | [L0] |

### 설계 문서 검증

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 11 | 설계 문서 용어 일관성 | 15개 문서에서 "agent" → "wallet" 치환 완료 + 문맥 자연스러움 검토 | [L0] |
| 12 | 코드-문서 일치 | 설계 문서의 API 경로/스키마명이 실제 코드와 일치 assert | [L0] |
| 13 | README 용어 + 현황 갱신 | README.md에서 "agent" 0건 (의도적 제외 외) + API 예시 경로/필드명 코드 일치 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| v1.4 (토큰 + 컨트랙트 확장) | 코드 변경 완료 후 용어 변경해야 merge conflict 최소화 |
| v1.4.1 (EVM 지갑 인프라) | EVM 관련 코드에서도 agent 용어 사용. 모든 기능 코드 완성 후 일괄 변경 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 대규모 rename으로 인한 누락 | 일부 파일에서 agent 잔존 시 런타임 에러 | `grep` 전수 검사 + 전체 테스트 통과 필수. 타입 에러로 컴파일 타임에 대부분 검출 |
| 2 | DB 마이그레이션 실패 | 기존 데이터 손실 | 마이그레이션 트랜잭션 내 실행. 실패 시 자동 롤백. 마이그레이션 전 백업 권장 |
| 3 | MCP 토큰 무효화 | JWT claim 변경(`agt` → `wlt`) + 파일 경로 변경(`mcp-tokens/<agentId>` → `<walletId>`)으로 기존 토큰 전면 무효화 | 기존 `mcp-tokens/` 디렉토리 폐기. 마이그레이션 후 `waiaas mcp setup --wallet` 재실행 필요. CLI 마이그레이션 안내 메시지 출력 |
| 4 | 설계 문서 문맥 왜곡 | 단순 치환 시 문장이 부자연스러울 수 있음 | 기계적 치환 후 문맥별 수동 검토 |

---

*최종 업데이트: 2026-02-12 코드베이스 3차 전수 검증 반영. (1) DB 데이터 마이그레이션 추가 — audit_log.action 4개 + notification_logs.event_type 1개 enum 값 UPDATE, (2) 섹션 4 확장 — audit/notification enum 값 변경 5건 + DB 연동 명시, (3) 섹션 5-1 신설 — i18n 템플릿 변수 20건 + 키 2건 + 텍스트 ~13건, (4) Python SDK 6파일로 정정 (4→6), (5) Admin UI 섹션 확장 — dashboard agentCount, sessions/policies/notifications 페이지 agentId 사용 + 테스트 4개 추가*
