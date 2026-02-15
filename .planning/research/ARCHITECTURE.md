# Architecture Patterns: v1.5 Price Oracle + Action Provider Framework

**Domain:** Price Oracle, Action Provider 프레임워크, USD 정책 평가를 기존 6-stage 파이프라인에 통합
**Researched:** 2026-02-15
**Confidence:** HIGH (기존 코드베이스 직접 분석 + Pyth/MCP 공식 문서 기반)

---

## 1. Recommended Architecture

### 1.1 Integration Overview

v1.5에서 3개의 새로운 서브시스템을 기존 아키텍처에 통합한다. 핵심 원칙은 **기존 6-stage 파이프라인과 DaemonContext 패턴을 변경하지 않고, 새로운 컴포넌트를 주입점에 추가**하는 것이다.

```
기존 아키텍처 (변경 없음)                  v1.5 추가 (주입)
=====================                    ================

DaemonContext                            + priceOracle: OracleChain
  +-- db                                + actionRegistry: ActionProviderRegistry
  +-- config                            + apiKeyStore: ActionProviderApiKeyStore
  +-- adapterPool
  +-- notificationService
  +-- settingsService
  +-- ...

Pipeline (6-stage)                       Stage 3 전에 USD 변환 삽입
  Stage 1: Validate + INSERT             (변경 없음)
  Stage 2: Auth                          (변경 없음)
  Stage 3: Policy evaluation             resolveEffectiveAmountUsd() 호출 추가
  Stage 4: Wait                          (변경 없음)
  Stage 5: Execute                       (변경 없음)
  Stage 6: Confirm                       (변경 없음)

MCP Server                              Action Provider 도구 동적 등록
  14 static tools                        (유지)
  + N action tools                       (동적 추가/제거)

Admin UI                                 + Oracle Status 페이지/섹션
  6 pages                                + API Keys 관리 섹션
```

### 1.2 System Architecture Diagram

```
+---------------------------------------------------------------------------+
|  Admin UI (Preact + Vite)                                                 |
|  +----------+ +----------+ +----------+ +------------+ +------------+     |
|  | Settings | | Policies | |   ...    | |Oracle Stat | | API Keys   |     |
|  |(existing)| |(existing)| |          | |  (NEW)     | |  (NEW)     |     |
|  +----+-----+ +----+-----+ +----------+ +-----+------+ +-----+------+     |
+-------+------------+----------------------+------------+------+-----------+
        |            |                       |              |
   +----v------------v-----------------------v--------------v--------------+
   |  REST API (OpenAPIHono)                                               |
   |  +----------------------+  +--------------------------------------+   |
   |  | Existing Routes      |  | New Routes                           |   |
   |  | /v1/transactions/*   |  | POST /v1/actions/:prov/:action       |   |
   |  | /v1/wallets/*        |  | GET  /v1/admin/oracle-status         |   |
   |  | /v1/admin/*          |  | CRUD /v1/admin/api-keys/*            |   |
   |  +-----------+-----------+  +-------------+------------------------+   |
   +--------------+----------------------------+---------------------------+
                  |                            |
   +--------------v----------------------------v---------------------------+
   |  DaemonContext (주입 컨테이너)                                         |
   |                                                                       |
   |  기존:  db, config, adapterPool, settingsService, ...                 |
   |  추가:  priceOracle: OracleChain                                      |
   |         actionRegistry: ActionProviderRegistry                        |
   |         apiKeyStore: ActionProviderApiKeyStore                        |
   +------+------------------+-----------------------+---------------------+
          |                  |                       |
   +------v--------+  +-----v--------------+  +-----v--------------------+
   |  Pipeline      |  |  OracleChain       |  |  ActionProviderRegistry  |
   |  (6-stage)     |  |                    |  |                          |
   |  +----------+  |  |  PythOracle        |  |  ~/.waiaas/actions/      |
   |  | Stage 3  |<-+--+  (Primary)         |  |  ESM dynamic import     |
   |  | resolveUsd  |  |       |            |  |                          |
   |  | + Policy |  |  |  CoinGeckoOracle   |  |  resolve() -> CCR        |
   |  +----------+  |  |  (Fallback)        |  |       |                  |
   |                |  |       |            |  |       v                  |
   |  Stage 1-2,   |  |  InMemoryCache     |  |  Pipeline Stage 1        |
   |  4-6 unchanged|  |  (LRU 128)         |  |  (ContractCallRequest)   |
   +----------------+  +--------------------+  +--------------------------+
```

---

## 2. Component Boundaries

### 2.1 New Components

| Component | Package | Directory | Responsibility | Communicates With |
|-----------|---------|-----------|---------------|-------------------|
| `IPriceOracle` | `@waiaas/core` | `interfaces/` | 가격 조회 인터페이스 (4 메서드) | OracleChain에서 구현 |
| `PythOracle` | `@waiaas/daemon` | `oracle/` | Pyth Hermes REST API 구현체 (Primary, Zero-config) | Hermes API (HTTPS) |
| `CoinGeckoOracle` | `@waiaas/daemon` | `oracle/` | CoinGecko Demo API 구현체 (Opt-in Fallback) | CoinGecko API (HTTPS) |
| `OracleChain` | `@waiaas/daemon` | `oracle/` | Pyth->CoinGecko fallback + 교차 검증 | PythOracle, CoinGeckoOracle, InMemoryPriceCache |
| `InMemoryPriceCache` | `@waiaas/daemon` | `oracle/` | LRU 128항목, 5분 TTL | OracleChain에서 사용 |
| `resolveEffectiveAmountUsd` | `@waiaas/daemon` | `pipeline/` | 트랜잭션 금액 USD 변환 | IPriceOracle, Stage 3 |
| `IActionProvider` | `@waiaas/core` | `interfaces/` | Action Provider 인터페이스 | ActionProviderRegistry에서 사용 |
| `ActionProviderRegistry` | `@waiaas/daemon` | `action/` | 플러그인 발견/로드/검증 | IActionProvider, MCP Tool Converter |
| `McpToolConverter` | `@waiaas/daemon` | `action/` | ActionDefinition -> MCP Tool 변환 | McpServer, ActionProviderRegistry |
| `ActionProviderApiKeyStore` | `@waiaas/daemon` | `action/` | API 키 DB 암호화 저장/CRUD | DB, masterPassword |

### 2.2 Modified Components

| Component | Modification | Impact |
|-----------|-------------|--------|
| `DaemonLifecycle` (lifecycle/daemon.ts) | priceOracle, actionRegistry, apiKeyStore 필드 추가 | 시작/종료 시 초기화/정리 추가 |
| `PipelineContext` (pipeline/stages.ts) | priceOracle 옵셔널 필드 추가 | Stage 3에서 USD 변환 호출 |
| `stage3Policy()` (pipeline/stages.ts) | resolveEffectiveAmountUsd() 호출 삽입 | evaluateAndReserve() 전에 USD 금액 계산 |
| `DatabasePolicyEngine` (pipeline/database-policy-engine.ts) | SpendingLimitRules에 USD 필드 인식 추가 | USD 임계값 존재 시 USD 기준 평가 |
| `SpendingLimitRules` (database-policy-engine.ts) | `instant_max_usd?`, `notify_max_usd?`, `delay_max_usd?` 필드 추가 | 기존 네이티브 필드와 공존 (후방 호환) |
| `SETTING_DEFINITIONS` (setting-keys.ts) | oracle 카테고리 추가 | SettingsService 통합 |
| `SETTING_CATEGORIES` (setting-keys.ts) | `'oracle'` 카테고리 추가 | Admin UI Oracle 섹션 표시 |
| `HotReloadOrchestrator` (hot-reload.ts) | oracle 키 변경 시 OracleChain 재구성 | CoinGecko 키 변경 시 fallback 활성화/비활성화 |
| Admin Layout (layout.tsx) | Oracle Status 페이지 라우팅 추가 고려 | 사이드바에 새 메뉴 항목 |
| Admin Settings (settings.tsx) | Oracle 섹션 + API Keys 섹션 추가 | CoinGecko 키/교차검증 임계값 설정 UI |
| DB Schema (schema.ts) | `api_keys` 테이블 추가 (v11 마이그레이션) | ActionProviderApiKeyStore 저장소 |
| API Endpoints (endpoints.ts) | oracle-status, api-keys, actions 엔드포인트 추가 | Admin UI + REST API |

### 2.3 Unchanged Components

| Component | Why Unchanged |
|-----------|--------------|
| `TransactionPipeline` (pipeline.ts) | executeSend() 진입점 변경 없음 -- Stage 3 내부만 수정 |
| `IChainAdapter` (core) | 가격 정보와 무관 (저수준 실행 엔진 유지 원칙) |
| `AdapterPool` | Oracle과 독립 |
| `LocalKeyStore` | 변경 없음 -- API 키 암호화는 별도 secretbox 사용 |
| MCP 기존 14 tools | 항상 유지, Action 도구만 동적 추가 |
| 알림 시스템 (channels) | 채널 변경 없음 -- 이벤트 타입만 추가 (UNLISTED_TOKEN_TRANSFER) |

---

## 3. Data Flow

### 3.1 USD Policy Evaluation Flow (Stage 3 확장)

현재 `stage3Policy()` (stages.ts L253)에서 `evaluateAndReserve()` 호출 **직전**에 USD 변환 로직을 삽입한다.

```
현재 흐름:
  buildTransactionParam() --> txParam 생성
  evaluateAndReserve(walletId, txParam, txId) --> 정책 평가

수정 흐름:
  buildTransactionParam() --> txParam 생성
  [NEW] resolveEffectiveAmountUsd() --> usdAmount 계산
  [NEW] txParam.usdAmount = usdAmount (있으면)
  evaluateAndReserve(walletId, txParam, txId) --> 정책 평가 (USD 인식)
```

Stage 3 상세:

```
Client Request
    |
    v
Stage 1: Validate + INSERT PENDING
    |
    v
Stage 2: Auth (sessionId passthrough)
    |
    v
Stage 3: Policy Evaluation (확장 부분)
    |
    +-- [NEW] resolveEffectiveAmountUsd(request, priceOracle)
    |       |
    |       +-- TransactionType 판별
    |       |   +-- TRANSFER:      getNativePrice(chain) * amount
    |       |   +-- TOKEN_TRANSFER: getPrice(tokenRef) * amount
    |       |   +-- CONTRACT_CALL:  getNativePrice(chain) * value
    |       |   +-- APPROVE:        getPrice(tokenRef) * amount
    |       |   +-- BATCH:          개별 합산
    |       |
    |       +-- PriceResult 분기
    |       |   +-- success(usdAmount)  -> USD 금액 반환
    |       |   +-- oracleDown()       -> null (네이티브 fallback)
    |       |   +-- notListed()        -> null + minTier=NOTIFY 플래그
    |       |
    |       +-- 가격 나이 판정
    |           +-- FRESH (<5분)  -> 정상 사용
    |           +-- AGING (5~30분) -> 경고 로그 + 정상 사용
    |           +-- STALE (>30분)  -> USD 스킵 -> 네이티브 fallback
    |
    +-- [EXISTING] buildTransactionParam(request, txType, chain)
    |       +-- [NEW] txParam.usdAmount = resolveResult.usdAmount (있으면)
    |
    +-- [EXISTING] evaluateAndReserve(walletId, txParam, txId)
    |       +-- evaluateSpendingLimit() 내부:
    |           +-- USD 필드 존재 + usdAmount 존재 -> USD 기준 비교
    |           +-- 그 외 -> 기존 네이티브 기준 비교 (후방 호환)
    |
    +-- [NEW] notListed 플래그 시: max(결정된 tier, NOTIFY)
    |
    v
Stage 4-6: (기존과 동일)
```

**핵심 설계 결정:**
- `resolveEffectiveAmountUsd()`는 `evaluateAndReserve()` **이전에** 호출된다
- USD 변환 결과는 TransactionParam에 옵셔널 필드(`usdAmount?: string`)로 전달된다
- SpendingLimitRules에 `instant_max_usd` 필드가 없으면 기존 네이티브 비교 (100% 후방 호환)
- USD 변환 실패 시 트랜잭션을 거부하지 않는다 (graceful fallback)

### 3.2 Action Provider Resolve-then-Execute Flow

```
AI Agent / REST Client
    |
    +-- (A) REST: POST /v1/actions/:provider/:action
    |   또는
    +-- (B) MCP: waiaas_{provider}_{action} tool call
    |
    v
Action Route Handler / MCP Tool Handler
    |
    +-- ActionProviderRegistry.getProvider(providerName)
    |       +-- 미등록 -> 404 PROVIDER_NOT_FOUND
    |
    +-- requiresApiKey 확인
    |       +-- 키 미설정 -> 403 API_KEY_REQUIRED + Admin 안내 메시지
    |
    +-- ActionDefinition.inputSchema.parse(params)
    |       +-- 검증 실패 -> 400 ACTION_VALIDATION_FAILED
    |
    +-- provider.resolve(actionName, validatedParams, actionContext)
    |       +-- ContractCallRequest 반환 (Zod 검증)
    |       +-- 실패 -> 500 ACTION_RESOLVE_FAILED
    |
    v
ContractCallRequest --> 기존 Pipeline Stage 1 주입
    |
    +-- Stage 1: Validate (type='CONTRACT_CALL')
    +-- Stage 2: Auth
    +-- Stage 3: Policy (CONTRACT_WHITELIST + SPENDING_LIMIT + USD)
    +-- Stage 4: Wait
    +-- Stage 5: Execute (buildContractCall -> simulate -> sign -> submit)
    +-- Stage 6: Confirm
```

**핵심:** Action Provider의 `resolve()`는 `ContractCallRequest`만 반환할 수 있다. 이 요청은 기존 파이프라인의 **Stage 1부터** 진입하므로 **모든 정책 평가를 거친다**. CONTRACT_WHITELIST 정책에 해당 컨트랙트가 등록되어 있어야 실행된다.

### 3.3 OracleChain Fallback Flow

```
OracleChain.getPrice(tokenRef)
    |
    +-- 1. InMemoryPriceCache 조회
    |   +-- cache hit + FRESH -> 즉시 반환
    |   +-- cache hit + AGING -> 반환 + PRICE_STALE 경고 로그
    |   +-- cache miss / STALE -> 외부 조회
    |
    +-- 2. PythOracle.getPrice(tokenRef)
    |   +-- 성공 -> primary 가격 확보
    |   +-- 실패 (네트워크/피드 미지원) -> fallback
    |
    +-- 3. [CoinGecko 키 설정 시] CoinGeckoOracle.getPrice(tokenRef)
    |   +-- 성공 -> fallback 가격 확보
    |   +-- 실패 -> ORACLE_UNAVAILABLE
    |
    +-- 4. 교차 검증 (CoinGecko 키 설정 + 양쪽 성공 시에만)
    |   +-- |Pyth - CoinGecko| / avg <= 5% -> Pyth 가격 채택
    |   +-- |Pyth - CoinGecko| / avg > 5%  -> STALE 격하 + PRICE_DEVIATION_WARNING
    |
    +-- 5. 캐시 저장 (TTL 5분)
    |
    +-- 6. PriceInfo 반환
```

### 3.4 MCP Dynamic Tool Registration Flow

```
DaemonLifecycle.start()
    |
    +-- ActionProviderRegistry 초기화
    |   +-- ~/.waiaas/actions/ 스캔
    |       +-- ESM import() -> validate-then-trust
    |
    +-- McpServer 생성 (기존 14 tools 등록)
    |
    +-- ActionProviderRegistry.listProviders()
    |   +-- mcpExpose=true인 프로바이더 필터
    |       +-- 각 ActionDefinition에 대해:
    |           +-- McpToolConverter.registerTool(server, definition)
    |               +-- zodToJsonSchema(inputSchema)
    |               +-- server.tool(`waiaas_${provider}_${action}`, ...)
    |               +-- handler: resolve() -> POST /v1/actions/:p/:a
    |
    +-- server.connect(transport)
```

**MCP SDK 동적 도구 등록 제약사항:**
- MCP TypeScript SDK는 `server.tool()`로 런타임에 도구를 추가할 수 있다
- 도구 제거 공식 API 부재: 내부 도구 맵 관리 또는 disable/enable 패턴 필요
- `notifications/tools/list_changed`를 클라이언트에 보내면 클라이언트가 도구 목록 갱신
- **제약:** 동일 메시지 사이클 내에서 등록된 도구는 즉시 사용 불가 (다음 사이클부터 유효) -- GitHub Issue #682
- **대응:** Action Provider 등록은 대부분 시작 시점(startup)이므로 실질적 영향 없음

---

## 4. DaemonContext Integration

### 4.1 DaemonLifecycle 초기화 순서

기존 DaemonLifecycle.start() 단계에 Oracle과 ActionProvider 초기화를 삽입한다.

```
DaemonLifecycle.start(dataDir, masterPassword)
    |
    +-- Step 1: loadConfig()                          (기존)
    +-- Step 2: createDatabase() + pushSchema()        (기존)
    +-- Step 3: LocalKeyStore 초기화                   (기존)
    +-- Step 4: SettingsService 초기화                 (기존)
    |
    +-- Step 4a: [NEW] OracleChain 초기화
    |   +-- InMemoryPriceCache 생성 (maxSize=128, ttl=5min)
    |   +-- PythOracle 생성 (Zero-config, no API key)
    |   +-- CoinGecko 키 확인 (SettingsService.get('oracle.coingecko_api_key'))
    |   |   +-- 키 존재 -> CoinGeckoOracle 생성 + fallback 활성화
    |   |   +-- 키 없음 -> CoinGecko 비활성 (Pyth 단독 운영)
    |   +-- OracleChain 생성 (oracles=[pyth, coingecko?], cache, settingsService)
    |
    +-- Step 4b: [NEW] ActionProviderApiKeyStore 초기화
    |   +-- DB api_keys 테이블, masterPassword로 암호화 키 파생
    |
    +-- Step 4c: [NEW] ActionProviderRegistry 초기화
    |   +-- ~/.waiaas/actions/ 디렉토리 스캔
    |   +-- ESM dynamic import + validate-then-trust
    |   +-- apiKeyStore 연결 (requiresApiKey 확인용)
    |
    +-- Step 5: AdapterPool 초기화                    (기존)
    +-- Step 6: NotificationService 초기화            (기존)
    |
    +-- Step 6a: [NEW] HotReloadOrchestrator에 oracle 키 핸들러 추가
    |
    +-- Step 7: Pipeline 초기화                       (기존, priceOracle 주입 추가)
    +-- Step 8: REST API 서버 시작                    (기존, 새 라우트 추가)
    +-- Step 9: BackgroundWorkers 시작                (기존)
```

### 4.2 PipelineDeps 확장

```typescript
// 기존 PipelineDeps에 옵셔널 필드 추가 (후방 호환)
export interface PipelineDeps {
  db: BetterSQLite3Database<typeof schema>;
  adapter: IChainAdapter;
  keyStore: LocalKeyStore;
  policyEngine: IPolicyEngine;
  masterPassword: string;
  sqlite?: SQLiteDatabase;
  notificationService?: NotificationService;
  priceOracle?: IPriceOracle;  // NEW: USD 정책 평가용
}
```

### 4.3 PipelineContext 확장

```typescript
export interface PipelineContext {
  // ... 기존 필드 모두 유지 ...
  priceOracle?: IPriceOracle;  // NEW
  usdAmount?: string;          // NEW: resolveEffectiveAmountUsd() 결과
  priceAgeWarning?: boolean;   // NEW: AGING 경고 플래그
  notListedMinTier?: boolean;  // NEW: 가격 불명 토큰 NOTIFY 격상 플래그
}
```

---

## 5. Patterns to Follow

### Pattern 1: Graceful Fallback (USD 변환 실패 시 네이티브 fallback)

**What:** Oracle 장애 또는 토큰 미등록 시 트랜잭션을 거부하지 않고, 네이티브 금액 기준으로 정책 평가를 수행한다.

**When:** resolveEffectiveAmountUsd()가 null을 반환하거나 에러를 throw할 때.

**Why:** "USD 변환 실패 시 트랜잭션 거부 금지" 원칙 (설계 문서 61, 원칙 3). Oracle 장애로 인해 정상 트랜잭션이 차단되면 안 된다.

**Example:**
```typescript
// pipeline/stages.ts Stage 3 내부
const priceResult = ctx.priceOracle
  ? await resolveEffectiveAmountUsd(ctx.request, ctx.priceOracle, ctx.wallet.chain)
  : null;

if (priceResult?.type === 'success') {
  txParam.usdAmount = priceResult.usdAmount;
} else if (priceResult?.type === 'notListed') {
  ctx.notListedMinTier = true; // 최종 tier에서 max(tier, NOTIFY) 적용
  // 감사 로그: UNLISTED_TOKEN_TRANSFER
} else {
  // oracleDown 또는 priceOracle 미설정 -> 네이티브 금액만으로 평가
  // 감사 로그: PRICE_UNAVAILABLE (oracleDown인 경우만)
}
```

### Pattern 2: SettingsService 통합 (Oracle 설정)

**What:** CoinGecko API 키, 교차 검증 임계값 등을 SettingsService를 통해 관리한다. Admin UI에서 런타임 변경 가능.

**When:** 재시작 없이 변경해야 하는 Oracle 설정.

**Why:** CLAUDE.md 규칙: "런타임 변경이 유용한 설정은 Admin Settings에 노출한다."

**Example:**
```typescript
// setting-keys.ts에 oracle 카테고리 추가
{ key: 'oracle.coingecko_api_key', category: 'oracle',
  configPath: 'oracle.coingecko_api_key', defaultValue: '', isCredential: true },
{ key: 'oracle.cross_validation_threshold', category: 'oracle',
  configPath: 'oracle.cross_validation_threshold', defaultValue: '0.05', isCredential: false },
{ key: 'oracle.price_cache_ttl_seconds', category: 'oracle',
  configPath: 'oracle.price_cache_ttl_seconds', defaultValue: '300', isCredential: false },
```

### Pattern 3: Validate-then-Trust (Action Provider 보안 경계)

**What:** ESM dynamic import로 로드한 플러그인의 인터페이스 준수를 검증한 후, resolve() 반환값을 Zod로 재검증한다.

**When:** ~/.waiaas/actions/에서 플러그인을 로드할 때, 그리고 매 resolve() 호출 시.

**Example:**
```typescript
// action/action-provider-registry.ts
async loadPlugin(modulePath: string): Promise<void> {
  const module = await import(modulePath);
  const provider = module.default as unknown;

  // 1. 인터페이스 준수 검증 (duck typing)
  if (!provider || typeof provider !== 'object') throw new Error('Invalid plugin');
  if (typeof (provider as any).metadata !== 'object') throw new Error('Missing metadata');
  if (!Array.isArray((provider as any).actions)) throw new Error('Missing actions');
  if (typeof (provider as any).resolve !== 'function') throw new Error('Missing resolve');

  // 2. Zod 스키마로 metadata/actions 검증
  ActionProviderMetadataSchema.parse((provider as IActionProvider).metadata);
  (provider as IActionProvider).actions.forEach(a => ActionDefinitionSchema.parse(a));

  // 3. 등록 (이름 중복 거부)
  this.register(provider as IActionProvider);
}

// resolve() 호출 시 반환값 재검증
async callResolve(
  provider: IActionProvider, actionName: string, params: unknown, ctx: ActionContext,
): Promise<ContractCallRequest> {
  const result = await provider.resolve(actionName, params, ctx);
  return ContractCallRequestSchema.parse(result);
}
```

### Pattern 4: DaemonContext 주입 패턴 (기존 패턴 준수)

**What:** 새로운 서비스를 DaemonContext에 추가하고, 라우트 핸들러에서 `c.get('context')`로 접근한다.

**When:** Oracle, ActionRegistry, ApiKeyStore를 API 라우트에서 사용할 때.

**Example:**
```typescript
// api/routes/actions.ts
actionRoutes.post('/actions/:provider/:action', sessionAuth, async (c) => {
  const { actionRegistry, apiKeyStore } = c.get('context');
  const provider = actionRegistry.getProvider(c.req.param('provider'));
  if (!provider) throw new WAIaaSError('PROVIDER_NOT_FOUND', { ... });
  // ...resolve -> pipeline inject...
});
```

### Pattern 5: DB 마이그레이션 증분 패턴 (CLAUDE.md 규칙)

**What:** api_keys 테이블을 ALTER TABLE 증분 마이그레이션으로 추가한다. DB 삭제 후 재생성 금지.

**When:** v10 -> v11 스키마 업그레이드.

**Example:**
```sql
-- v11 마이그레이션
CREATE TABLE IF NOT EXISTS api_keys (
  provider_name TEXT PRIMARY KEY,
  encrypted_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
UPDATE schema_version SET version = 11;
```

---

## 6. Anti-Patterns to Avoid

### Anti-Pattern 1: Oracle을 IChainAdapter에 결합

**What:** getPrice()를 IChainAdapter에 추가하는 것.
**Why bad:** IChainAdapter는 저수준 실행 엔진이다 (22 메서드). 가격 정보는 서비스 레이어의 관심사이며, 체인별 어댑터에 넣으면 SolanaAdapter와 EvmAdapter 모두에 중복 구현해야 한다. Oracle은 체인에 무관한 데이터(Pyth는 Solana/EVM 모두 동일 피드 제공)이므로 어댑터 경계에 맞지 않는다.
**Instead:** IPriceOracle을 독립 서비스로 구현하고 DaemonContext에 주입한다. PipelineContext에 옵셔널로 전달.

### Anti-Pattern 2: Action Provider resolve()에서 서명/제출

**What:** resolve()가 서명된 트랜잭션이나 txHash를 반환하는 것.
**Why bad:** 파이프라인의 정책 평가(Stage 3), 시뮬레이션(Stage 5b), 서명(Stage 5c)을 모두 우회한다. CONTRACT_WHITELIST, SPENDING_LIMIT 등 모든 보안 정책이 무력화된다.
**Instead:** resolve()는 반드시 ContractCallRequest만 반환한다. Zod 검증으로 반환 타입을 강제한다. 서명과 제출은 기존 파이프라인 Stage 5에서만 수행.

### Anti-Pattern 3: USD 변환 실패 시 트랜잭션 거부

**What:** Oracle이 가격을 반환하지 못할 때 POLICY_DENIED로 거부하는 것.
**Why bad:** Pyth/CoinGecko 장애 시 모든 트랜잭션이 차단되어 서비스 중단. Oracle 가용성에 대한 단일 실패점 생성.
**Instead:** PriceResult discriminated union으로 oracleDown/notListed를 구분하고, 네이티브 금액 기준 fallback으로 정상 처리. notListed는 최소 NOTIFY 격상.

### Anti-Pattern 4: config.toml에 API 키 평문 저장

**What:** CoinGecko API 키나 Action Provider API 키를 config.toml에 평문으로 저장.
**Why bad:** config.toml은 파일시스템에 평문으로 존재. Git에 실수로 커밋될 위험. Admin UI에서 런타임 변경 불가.
**Instead:** SettingsService의 isCredential=true (AES-256-GCM 암호화) 또는 ActionProviderApiKeyStore (sodium-native secretbox)로 DB에 암호화 저장.

### Anti-Pattern 5: MCP 도구 맵 직접 조작

**What:** McpServer 내부의 `_registeredTools`를 직접 수정하여 도구를 제거하는 것.
**Why bad:** SDK 내부 구현에 의존하면 SDK 업데이트 시 깨진다. `notifications/tools/list_changed`를 누락하면 클라이언트가 갱신되지 않는다.
**Instead:** 자체 도구 레지스트리(McpToolConverter 내부 Map)를 유지하고, `server.tool()`로 등록. 해제 시에는 핸들러를 no-op으로 교체 + list_changed 알림 전송.

---

## 7. Key Integration Points Detail

### 7.1 Stage 3 Policy Evaluation 수정

현재 `stage3Policy()` 함수(stages.ts L253)에서 `evaluateAndReserve()` 호출 **직전**에 USD 변환 로직을 삽입한다.

**TransactionParam 확장:**
```typescript
interface TransactionParam {
  type: string;
  amount: string;
  toAddress: string;
  chain: string;
  network?: string;
  tokenAddress?: string;
  contractAddress?: string;
  selector?: string;
  spenderAddress?: string;
  approveAmount?: string;
  usdAmount?: string;  // NEW: USD 환산 금액
}
```

**evaluateSpendingLimit() 수정:**
```typescript
private evaluateSpendingLimit(
  resolved: PolicyRow[], amount: string, usdAmount?: string,
): PolicyEvaluation | null {
  const spending = resolved.find(p => p.type === 'SPENDING_LIMIT');
  if (!spending) return null;

  const rules: SpendingLimitRules = JSON.parse(spending.rules);

  // USD 필드가 정책에 존재하고 usdAmount가 제공된 경우 -> USD 기준 비교
  if (rules.instant_max_usd && usdAmount) {
    return this.evaluateSpendingLimitUsd(rules, usdAmount);
  }

  // 그 외 -> 기존 네이티브 기준 비교 (100% 후방 호환)
  return this.evaluateSpendingLimitNative(rules, amount);
}
```

### 7.2 OracleChain의 SettingsService 연동

```typescript
// HotReloadOrchestrator 확장
const ORACLE_KEYS = new Set([
  'oracle.coingecko_api_key',
  'oracle.cross_validation_threshold',
  'oracle.price_cache_ttl_seconds',
]);

// handleChangedKeys() 내부:
if (hasOracleChanges) {
  await this.reloadOracle().catch(err => {
    console.warn('Hot-reload oracle failed:', err);
  });
}

private async reloadOracle(): Promise<void> {
  const oracleChain = this.deps.oracleChain;
  if (!oracleChain) return;
  const apiKey = this.deps.settingsService.get('oracle.coingecko_api_key');
  oracleChain.setCoinGeckoEnabled(!!apiKey);
}
```

### 7.3 ActionProviderApiKeyStore vs SettingsService

두 가지 API 키 저장 패턴이 존재하는 것은 의도적이다:

| 구분 | SettingsService | ActionProviderApiKeyStore |
|------|----------------|--------------------------|
| 대상 | CoinGecko API 키 (oracle 카테고리) | Action Provider별 API 키 |
| 저장소 | settings 테이블 | api_keys 테이블 (NEW) |
| 암호화 | HKDF + AES-256-GCM | sodium-native secretbox |
| Admin UI | Settings > Oracle 섹션 | Settings > API Keys 섹션 |
| 이유 | 단일 키, 기존 HotReload 패턴 재사용 | 프로바이더별 동적 CRUD |

### 7.4 Admin UI 확장

**권장: Settings 페이지 내 섹션 추가 + Oracle Status 위젯**

```
Settings 페이지 (settings.tsx) 확장:
  +-- NotificationSettings    (기존)
  +-- RpcSettings             (기존)
  +-- SecuritySettings        (기존)
  +-- OracleSettings          (NEW - CoinGecko 키, 교차 검증 임계값, TTL)
  +-- ApiKeySettings          (NEW - 프로바이더별 API 키 CRUD)
  +-- WalletConnectSettings   (기존)
  +-- DaemonSettings          (기존)
```

Oracle 모니터링은 별도 경량 페이지 또는 Dashboard 위젯:
```
GET /v1/admin/oracle-status 응답:
{
  cacheStats: { hits, misses, staleHits, size, evictions },
  sources: [
    { name: "pyth", status: "active", lastSuccess: timestamp },
    { name: "coingecko", status: "inactive" | "active", lastSuccess: timestamp }
  ],
  crossValidation: { enabled: boolean, threshold: 0.05 }
}
```

---

## 8. SpendingLimitRules Zod Schema Migration

현재 SpendingLimitRules는 TypeScript interface만 존재하며 (database-policy-engine.ts L49), 정책 생성 시 `rules: z.record(z.unknown())`으로 비검증 상태이다.

```typescript
// packages/core/src/schemas/spending-limit.ts (NEW)
export const SpendingLimitRuleSchema = z.object({
  // 기존 네이티브 금액 필드 (후방 호환, 필수)
  instant_max: z.string().regex(/^\d+$/),
  notify_max: z.string().regex(/^\d+$/),
  delay_max: z.string().regex(/^\d+$/),
  delay_seconds: z.number().int().positive(),

  // NEW: USD 금액 필드 (옵셔널 -- 미설정 시 네이티브만 사용)
  instant_max_usd: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  notify_max_usd: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  delay_max_usd: z.string().regex(/^\d+(\.\d+)?$/).optional(),
});

export type SpendingLimitRules = z.infer<typeof SpendingLimitRuleSchema>;
```

**후방 호환 보장:**
- 기존 네이티브 필드는 required 유지 -> 기존 정책 JSON 100% 호환
- USD 필드는 optional -> 설정하지 않으면 기존 네이티브 비교
- DB의 기존 정책 JSON 수정 불필요 (새 필드가 옵셔널이므로)

---

## 9. Pyth Feed ID Resolution Strategy

Pyth Hermes API는 feed ID(bytes32 hex)로 가격을 조회한다. TokenRef.address에서 Pyth feed ID로의 매핑이 필요하다.

**권장: 주요 토큰 하드코딩 맵 (Primary) + CoinGecko fallback (롱테일)**

```typescript
// oracle/pyth-feed-map.ts
const PYTH_FEED_IDS: Record<string, string> = {
  // Native tokens
  'SOL':  '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  'ETH':  '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  // Major stablecoins
  'USDC': '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
  'USDT': '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b',
  // ... 30-50개 주요 토큰
};

function resolveFeedId(tokenRef: TokenRef): string | null {
  if (tokenRef.symbol && PYTH_FEED_IDS[tokenRef.symbol]) {
    return PYTH_FEED_IDS[tokenRef.symbol];
  }
  return null; // CoinGecko fallback으로 위임
}
```

**대안 비교:**
| 전략 | 장점 | 단점 |
|------|------|------|
| 하드코딩 맵 (권장) | API 호출 없음, 빠르고 안정적 | 수동 유지보수, 롱테일 미지원 |
| /v2/price_feeds API 조회 | 동적, 전체 피드 | 시작 시 대규모 API 호출 |
| 심볼 기반 검색 | 주소 매핑 불필요 | 심볼 충돌 위험 |

하드코딩 맵에 포함할 토큰 (초기 30-50개): Native (SOL, ETH), Stablecoins (USDC, USDT, DAI, FRAX), DeFi (WBTC, WETH, stETH, wstETH), Solana (JTO, BONK, WIF, PYTH, JUP, RAY, ORCA), EVM (UNI, AAVE, LINK, MKR, COMP, CRV, LDO)

---

## 10. Suggested Build Order

의존성 그래프 기반 구현 순서:

```
Phase 1: Core Types + Oracle Foundation
  +-- IPriceOracle 인터페이스 (@waiaas/core)
  +-- TokenRef, PriceInfo, CacheStats Zod 스키마 (@waiaas/core)
  +-- PriceAge enum + classifyPriceAge() 함수
  +-- InMemoryPriceCache (LRU 128, 5분 TTL)
  +-- SpendingLimitRuleSchema Zod 신규 생성 + USD 필드

Phase 2: Oracle Implementations
  +-- PythOracle (Hermes REST API + feed ID 맵)
  +-- CoinGeckoOracle (Demo API + platformId 매핑)
  +-- OracleChain (fallback + 교차 검증 인라인)
  +-- resolveEffectiveAmountUsd() 함수
  +-- PriceResult discriminated union

Phase 3: Pipeline Integration
  +-- PipelineContext 확장 (priceOracle 필드)
  +-- TransactionParam 확장 (usdAmount 필드)
  +-- stage3Policy() 수정 (resolveEffectiveAmountUsd 호출)
  +-- evaluateSpendingLimit() USD 분기 추가
  +-- DaemonLifecycle 초기화 통합

Phase 4: SettingsService + Admin Oracle
  +-- SETTING_DEFINITIONS oracle 카테고리 추가
  +-- HotReloadOrchestrator oracle 핸들러
  +-- GET /v1/admin/oracle-status API
  +-- Admin Settings > Oracle 섹션 UI
  +-- DB v11 마이그레이션 (api_keys 테이블)

Phase 5: Action Provider Framework
  +-- IActionProvider, ActionDefinition 인터페이스 (@waiaas/core)
  +-- ActionProviderRegistry (ESM plugin load + validate-then-trust)
  +-- ActionProviderApiKeyStore (DB 암호화 저장)
  +-- POST /v1/actions/:provider/:action API
  +-- API 키 CRUD 엔드포인트

Phase 6: MCP + Admin Action Integration
  +-- McpToolConverter (ActionDefinition -> MCP Tool 자동 변환)
  +-- 동적 도구 등록/해제 + notifications/tools/list_changed
  +-- Admin Settings > API Keys 섹션 UI
  +-- Skill 파일 동기화

Phase 7: E2E Tests + Polish
  +-- USD 정책 평가 E2E (시나리오 1-5, 5-1~5-6)
  +-- Oracle fallback E2E (시나리오 6-13)
  +-- Action Provider E2E (시나리오 14-17)
  +-- MCP 통합 E2E (시나리오 18-21)
  +-- API 키 E2E (시나리오 22-26)
```

**순서 근거:**
1. Phase 1-2를 먼저 구현해야 Phase 3에서 파이프라인에 통합할 수 있다
2. Phase 3이 완료되어야 USD 기준 정책 평가가 동작한다
3. Phase 4는 Phase 3 이후 (oracle-status는 OracleChain이 먼저 필요)
4. Phase 5는 Phase 4의 DB 마이그레이션에 의존 (api_keys 테이블)
5. Phase 6은 Phase 5의 ActionProviderRegistry가 필요
6. Phase 7은 모든 구현이 완료된 후 수행

---

## 11. Scalability Considerations

| Concern | 100 users | 10K users | 1M users |
|---------|-----------|-----------|----------|
| Oracle 캐시 | InMemory LRU 128 충분 | LRU 128 여전히 충분 (인기 토큰 30개가 99% 조회) | Redis 또는 LRU 확장 검토 |
| Pyth API | Rate limit 없음 (공개 API) | 문제 없음 | 자체 Hermes 인스턴스 호스팅 |
| CoinGecko API | Demo 10-30 rpm 충분 | 캐시 히트율 높으면 OK | Pro 키 또는 자체 인프라 |
| Action Provider 수 | 1-5개 | 10-20개 | 도구 카탈로그 분리 검토 |
| MCP 도구 수 | 14 + 5-10 충분 | 14 + 20-50 관리 가능 | 도구 그룹핑/네임스페이스 |
| DB api_keys 테이블 | 5-10 rows | 50 rows | 충분 (UNIQUE provider_name) |

---

## Sources

### Codebase Analysis (HIGH confidence)
- `packages/daemon/src/pipeline/pipeline.ts` -- TransactionPipeline, PipelineDeps
- `packages/daemon/src/pipeline/stages.ts` -- 6-stage implementation, PipelineContext, stage3Policy()
- `packages/daemon/src/pipeline/database-policy-engine.ts` -- DatabasePolicyEngine, SpendingLimitRules, evaluateAndReserve()
- `packages/daemon/src/infrastructure/settings/settings-service.ts` -- SettingsService, get/set/getAll
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` -- SETTING_DEFINITIONS, SETTING_CATEGORIES
- `packages/daemon/src/infrastructure/settings/hot-reload.ts` -- HotReloadOrchestrator
- `packages/daemon/src/infrastructure/adapter-pool.ts` -- AdapterPool
- `packages/core/src/interfaces/IPolicyEngine.ts` -- IPolicyEngine, PolicyEvaluation
- `packages/mcp/src/server.ts` -- createMcpServer, 14 tool registrations
- `packages/mcp/src/index.ts` -- MCP entrypoint, SessionManager
- `packages/admin/src/components/layout.tsx` -- NAV_ITEMS, PageRouter
- `packages/admin/src/pages/settings.tsx` -- SettingsPage, category sections
- `packages/admin/src/api/endpoints.ts` -- API endpoint constants
- `docs/61-price-oracle-spec.md` -- IPriceOracle 인터페이스, OracleChain 설계
- `docs/62-action-provider-architecture.md` -- IActionProvider 인터페이스, resolve-then-execute
- `objectives/v1.5-defi-price-oracle.md` -- 마일스톤 목표, 산출물, 기술 결정

### Official Documentation (MEDIUM confidence)
- [Pyth Hermes API Reference](https://docs.pyth.network/price-feeds/core/api-reference) -- /v2/updates/price/latest, feed ID 형식
- [Pyth Price Feeds](https://docs.pyth.network/price-feeds/core/price-feeds) -- 380+ 피드 목록
- [MCP TypeScript SDK - Dynamic Tool Registration](https://github.com/modelcontextprotocol/typescript-sdk/issues/682) -- 동적 도구 등록 제약사항
- [MCP Dynamic Tool Discovery](https://www.speakeasy.com/mcp/tool-design/dynamic-tool-discovery) -- disable/enable 패턴
