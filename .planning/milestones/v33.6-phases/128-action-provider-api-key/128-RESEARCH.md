# Phase 128: Action Provider + API Key - Research

**Researched:** 2026-02-15
**Domain:** IActionProvider 프레임워크 구현 + API Key DB 암호화 저장 + Admin UI API Keys
**Confidence:** HIGH

## Summary

Phase 128은 v1.5의 Action Provider 프레임워크 구현 단계로, 세 가지 주요 트랙으로 구성된다. (1) IActionProvider 인터페이스의 실제 코드 구현 및 ActionProviderRegistry ESM 플러그인 로더 구축, (2) API 키의 DB 암호화 저장(api_keys 테이블, DB v11 마이그레이션), (3) POST /v1/actions/:provider/:action REST 엔드포인트 및 Admin UI API Keys 섹션 구현.

Phase 125에서 IPriceOracle 인터페이스와 설계 문서 수정이 완료되었으며, Phase 126에서 Oracle 구현체(PythOracle, CoinGeckoOracle, OracleChain), Phase 127에서 USD 정책 통합이 구현되었다. Phase 128은 이들과 독립적인 Action Provider 도메인이지만, 기존 파이프라인(Stage 1-6)에 resolve() 결과를 ContractCallRequest로 주입하는 패턴이므로, 파이프라인 연동 부분에서 Phase 126-127의 priceOracle 통합을 참조한다.

설계 문서 62가 IActionProvider 인터페이스, ActionProviderRegistry, 플러그인 로드 메커니즘, MCP Tool 변환까지 상세한 의사코드를 제공하므로 구현 방향이 명확하다. `requiresApiKey` 필드와 `api_keys` 테이블은 v1.5 목표 문서에서 새로 정의된 요구사항으로, 기존 SettingsService의 AES-256-GCM 암호화 패턴을 재사용하되 별도 테이블로 분리하여 프로바이더별 키 관리를 깔끔하게 구현한다.

**Primary recommendation:** 설계 문서 62의 의사코드를 기반으로 `packages/daemon/src/infrastructure/action/` 디렉토리에 ActionProviderRegistry와 ApiKeyStore를 구현하고, `packages/core/src/interfaces/action-provider.types.ts`에 IActionProvider 인터페이스를 Zod SSoT로 정의한다. API 키 암호화는 기존 `settings-crypto.ts`의 HKDF + AES-256-GCM 패턴을 동일하게 사용한다.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.x (기존) | IActionProvider 타입의 SSoT 스키마 정의 | CLAUDE.md Zod SSoT 원칙. ActionProviderMetadata, ActionDefinition, ActionContext 모두 Zod 스키마 기반 |
| @hono/zod-openapi | 0.x (기존) | POST /v1/actions/:provider/:action, GET/PUT/DELETE /v1/admin/api-keys 라우트 | 기존 REST API 라우트와 동일 패턴 |
| drizzle-orm | 0.x (기존) | api_keys 테이블 스키마 + CRUD | 기존 10개 테이블과 동일 Drizzle 패턴 |
| Node.js crypto | 22.x 내장 | API 키 AES-256-GCM 암호화 | 기존 settings-crypto.ts 패턴 재사용 |
| vitest | 3.x (기존) | 단위/통합 테스트 | 기존 테스트 인프라 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js fs/promises | 22.x 내장 | ~/.waiaas/actions/ 디렉토리 스캔 | ESM 플러그인 발견 |
| Node.js url (pathToFileURL) | 22.x 내장 | ESM dynamic import용 file:// URL 변환 | 플러그인 로드 |
| preact | 10.x (기존) | Admin UI API Keys 섹션 | 기존 Admin UI 패턴 동일 |
| @preact/signals | (기존) | Admin UI 상태 관리 | 기존 signal 패턴 동일 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 별도 api_keys 테이블 | 기존 settings 테이블에 `apikeys.{provider}` 키 저장 | settings 테이블은 카테고리 기반 평면 구조로 프로바이더별 동적 키 관리에 부적합. 별도 테이블이 UNIQUE 제약과 CRUD에 적합 |
| HKDF 키 파생 | Argon2id 키 파생 (keystore/crypto.ts) | Argon2id는 300ms+ 소요되어 빈번한 API 키 복호화에 부적합. HKDF는 즉각적이며 settings-crypto.ts에서 검증된 패턴 |
| MCP 동적 도구 등록 | 데몬 시작 시 1회 등록 | 설계 문서 62 섹션 5.5가 "데몬 시작 시 1회"를 명시. 플러그인 핫 리로드는 Out of Scope |

**Installation:**
```bash
# 신규 의존성 없음 (v1.5 결정: 외부 npm 의존성 0개)
```

## Architecture Patterns

### Recommended Project Structure
```
packages/core/src/interfaces/
  action-provider.types.ts       # IActionProvider, ActionProviderMetadata, ActionDefinition, ActionContext (Zod SSoT)

packages/daemon/src/infrastructure/action/
  index.ts                       # barrel export
  action-provider-registry.ts    # ActionProviderRegistry (등록/조회/실행/플러그인 로드)
  api-key-store.ts               # ApiKeyStore (DB 암호화 저장/조회/삭제)

packages/daemon/src/api/routes/
  actions.ts                     # POST /v1/actions/:provider/:action (신규 파일)
  admin.ts                       # GET/PUT/DELETE /v1/admin/api-keys 추가 (기존 파일 확장)

packages/daemon/src/infrastructure/database/
  schema.ts                      # api_keys 테이블 추가 (Table 11)
  migrate.ts                     # v11 마이그레이션 추가

packages/admin/src/
  pages/settings.tsx             # API Keys 섹션 추가 (기존 파일 확장)
  api/endpoints.ts               # API Keys 엔드포인트 추가

packages/mcp/src/
  tools/action-tools.ts          # ActionDefinition -> MCP Tool 변환 (신규 파일)
```

**근거:**
- `packages/core/src/interfaces/`에 Zod 스키마 + 인터페이스: 기존 IChainAdapter, IPolicyEngine, IPriceOracle과 동일 패턴
- `packages/daemon/src/infrastructure/action/`에 구현체: 기존 `infrastructure/oracle/`, `infrastructure/settings/`, `infrastructure/token-registry/`와 동일 패턴. 설계 문서 62가 `services/`를 제안하지만, 코드베이스에 `services/` 디렉토리가 없으므로 기존 `infrastructure/` 컨벤션을 따른다
- `actions.ts` 라우트 파일을 신규 생성: 기존 `transactions.ts`, `tokens.ts`와 동일 수준의 독립 라우트

### Pattern 1: resolve-then-execute
**What:** Action Provider의 resolve()가 ContractCallRequest를 반환하고, 이를 기존 파이프라인 Stage 1-6에 주입하는 패턴
**When to use:** POST /v1/actions/:provider/:action 요청 처리 시
**Example:**
```typescript
// packages/daemon/src/api/routes/actions.ts

// 1. ActionProviderRegistry에서 프로바이더/액션 조회
const entry = registry.getAction(actionName);

// 2. API 키 필요 여부 확인
if (entry.provider.metadata.requiresApiKey) {
  const apiKey = apiKeyStore.get(entry.provider.metadata.name);
  if (!apiKey) {
    throw new WAIaaSError('API_KEY_REQUIRED', {
      message: `Admin > Settings에서 ${entry.provider.metadata.name} API 키를 설정하세요`,
    });
  }
}

// 3. resolve() 호출 -> ContractCallRequest 반환
const contractCall = await registry.executeResolve(actionName, params, context);

// 4. 기존 파이프라인에 ContractCallRequest 주입 (type: 'CONTRACT_CALL')
// stage1Validate -> stage2Auth -> stage3Policy -> stage4Wait -> stage5Execute -> stage6Confirm
```
**Source:** 설계 문서 62 섹션 3.1, 4.1

### Pattern 2: validate-then-trust (플러그인 보안)
**What:** ESM dynamic import로 로드한 플러그인의 IActionProvider 인터페이스 준수를 구조적 타이핑으로 검증
**When to use:** ~/.waiaas/actions/ 디렉토리에서 플러그인 로드 시
**Example:**
```typescript
// packages/daemon/src/infrastructure/action/action-provider-registry.ts

async loadPlugins(actionsDir: string): Promise<void> {
  const entries = await readdir(actionsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await this.loadSinglePlugin(join(actionsDir, entry.name), entry.name);
    } catch (error) {
      // 개별 실패는 전체를 중단하지 않음 (fail-open)
      logger.warn(`Plugin load failed (skipped): ${entry.name}`, { error });
    }
  }
}

private async loadSinglePlugin(pluginDir: string, pluginName: string): Promise<void> {
  // 1. package.json 확인 (type: "module" 필수)
  // 2. ESM dynamic import: const module = await import(pathToFileURL(mainPath).href)
  // 3. default export 추출 (클래스면 new로 인스턴스화)
  // 4. validateProviderInterface() -- metadata/actions/resolve 존재 + Zod 검증
  // 5. register() -- 이름 중복 검사 포함
}
```
**Source:** 설계 문서 62 섹션 6.4

### Pattern 3: API Key DB 암호화 저장
**What:** 프로바이더별 API 키를 settings-crypto.ts와 동일한 HKDF + AES-256-GCM으로 암호화하여 api_keys 테이블에 저장
**When to use:** PUT /v1/admin/api-keys/:provider 요청 시
**Example:**
```typescript
// packages/daemon/src/infrastructure/action/api-key-store.ts

import { encryptSettingValue, decryptSettingValue } from '../settings/settings-crypto.js';

export class ApiKeyStore {
  constructor(
    private readonly db: BetterSQLite3Database<typeof schema>,
    private readonly masterPassword: string,
  ) {}

  set(providerName: string, apiKey: string): void {
    const encrypted = encryptSettingValue(apiKey, this.masterPassword);
    this.db.insert(apiKeys).values({
      providerName,
      encryptedKey: encrypted,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: apiKeys.providerName,
      set: { encryptedKey: encrypted, updatedAt: new Date() },
    }).run();
  }

  get(providerName: string): string | null {
    const row = this.db.select().from(apiKeys)
      .where(eq(apiKeys.providerName, providerName)).get();
    if (!row) return null;
    return decryptSettingValue(row.encryptedKey, this.masterPassword);
  }

  getMasked(providerName: string): string | null {
    const key = this.get(providerName);
    if (!key) return null;
    return key.length > 4 ? key.slice(0, 4) + '...' + key.slice(-2) : '****';
  }

  delete(providerName: string): boolean {
    const result = this.db.delete(apiKeys)
      .where(eq(apiKeys.providerName, providerName)).run();
    return result.changes > 0;
  }
}
```
**Source:** 기존 settings-crypto.ts HKDF 패턴, v1.5 목표 문서 APIKY-01

### Pattern 4: MCP Tool 자동 변환
**What:** ActionDefinition -> server.tool() 자동 매핑. mcpExpose=true인 프로바이더만 MCP 도구로 등록
**When to use:** 데몬 시작 시 MCP Server 초기화 단계
**Example:**
```typescript
// packages/mcp/src/tools/action-tools.ts

export function registerActionTools(
  server: McpServer,
  registry: ActionProviderRegistry,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  const mcpActions = registry.getMcpExposedActions();
  for (const { provider, action } of mcpActions) {
    const toolName = `${provider.metadata.name}_${action.name}`;
    const description = `${action.description}. Risk level: ${action.riskLevel}.`;
    server.tool(toolName, description, action.inputSchema, async (params) => {
      // POST /v1/actions/:provider/:action 호출
      const result = await apiClient.post(`/v1/actions/${provider.metadata.name}/${action.name}`, params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    });
  }
}
```
**Source:** 설계 문서 62 섹션 5.2

### Anti-Patterns to Avoid
- **resolve() 내에서 서명/제출 수행:** resolve()는 반드시 ContractCallRequest만 반환. 정책 우회 원천 차단
- **플러그인 로드 실패 시 전체 데몬 시작 중단:** 개별 플러그인 실패는 경고 로그 후 건너뛰기 (fail-open)
- **api_keys를 settings 테이블에 혼합:** 프로바이더별 동적 CRUD가 필요하므로 별도 테이블
- **Argon2id로 API 키 암호화:** 300ms+ 지연은 빈번한 복호화에 부적합. HKDF 사용
- **ContractCallRequestSchema에 `from` 필드 검증 누락:** resolve() 반환값에서 from !== walletAddress면 거부 (타 지갑 호출 방지). 단, 현재 ContractCallRequestSchema에 `from` 필드가 없으므로, 설계 문서 62의 from 검증은 스킵하거나 별도 처리 필요
- **services/ 디렉토리 신설:** 코드베이스에 services/ 패턴이 없으므로 infrastructure/ 하위에 배치

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API 키 암호화 | 새 암호화 로직 | `settings-crypto.ts`의 `encryptSettingValue`/`decryptSettingValue` | 동일한 HKDF + AES-256-GCM 패턴이 이미 검증됨 |
| DB 마이그레이션 프레임워크 | 커스텀 마이그레이션 러너 | 기존 `MIGRATIONS.push()` + `runMigrations()` | v3~v10까지 9번 마이그레이션으로 검증된 패턴 |
| OpenAPI 라우트 정의 | 수동 라우트 | `OpenAPIHono` + `createRoute()` | 기존 라우트 16개가 동일 패턴 사용 |
| 플러그인 인터페이스 검증 | 커스텀 타입 검사 | Zod 스키마 `.parse()` + `typeof` 구조적 타이핑 | ActionProviderMetadataSchema.parse()가 런타임 검증 수행 |
| 키 마스킹 | 커스텀 마스킹 함수 | 간단한 `key.slice(0, 4) + '...'` | 기존 SettingsService.getAllMasked()가 유사 패턴 사용 (boolean 마스킹) |

**Key insight:** Phase 128의 대부분은 기존 코드베이스 패턴의 재사용이다. 새로운 라이브러리나 패턴이 필요 없으며, 설계 문서 62가 상세한 의사코드를 제공한다.

## Common Pitfalls

### Pitfall 1: ContractCallRequestSchema에 `from` 필드 부재
**What goes wrong:** 설계 문서 62 섹션 2.6이 `contractCall.from.toLowerCase() !== context.walletAddress.toLowerCase()` 검증을 정의하지만, 현재 ContractCallRequestSchema에는 `from` 필드가 없다. 스키마는 `to`, `calldata`, `value`, `programId` 등만 정의.
**Why it happens:** 설계 문서 62는 v0.6 시점에 작성되어 v1.4의 실제 스키마와 불일치
**How to avoid:** `from` 검증을 스킵하거나, resolve() 반환값에서 `to` 필드가 유효한 컨트랙트 주소인지만 검증. ContractCallRequestSchema.parse()가 이미 `to` 필드를 검증하므로 구조적 안전성은 보장됨. `from`은 파이프라인 Stage 5에서 지갑의 publicKey로 자동 설정되므로 Action Provider가 조작 불가
**Warning signs:** 설계 문서 62의 의사코드를 그대로 복사하면 `contractCall.from` 접근 시 undefined 에러 발생

### Pitfall 2: ESM dynamic import의 file:// URL 필수
**What goes wrong:** `import('/absolute/path/to/file.js')`가 Node.js 22에서 실패할 수 있음
**Why it happens:** Windows에서 절대 경로를 직접 import()에 전달하면 실패. macOS/Linux에서도 특수 문자가 포함된 경로에서 문제 발생 가능
**How to avoid:** 항상 `pathToFileURL(absolutePath).href`를 사용하여 `file:///...` URL로 변환 후 import
**Warning signs:** `ERR_UNSUPPORTED_ESM_URL_SCHEME` 에러

### Pitfall 3: API 키 마스킹과 존재 여부 혼동
**What goes wrong:** GET /v1/admin/api-keys에서 키가 설정되지 않은 프로바이더와 빈 문자열 키를 구분하지 못함
**Why it happens:** 마스킹 로직이 null과 ""를 동일하게 처리할 수 있음
**How to avoid:** API 응답에 `hasKey: boolean` 필드를 포함하여 키 존재 여부를 명확히 구분. `maskedKey`는 키가 있을 때만 반환
**Warning signs:** Admin UI에서 키가 설정되었는지 여부를 판단할 수 없음

### Pitfall 4: ActionDefinition.inputSchema의 Zod 인스턴스 직렬화
**What goes wrong:** ActionDefinition의 `inputSchema`가 `z.instanceof(z.ZodObject)`로 정의되어 있으므로, 플러그인에서 전달되는 Zod 스키마 인스턴스가 데몬의 Zod 버전과 다르면 instanceof 검사 실패
**Why it happens:** 플러그인이 자체 node_modules에 다른 버전의 zod를 가질 수 있음
**How to avoid:** 두 가지 방안: (1) instanceof 검사 대신 `typeof schema.parse === 'function'` && `typeof schema.safeParse === 'function'` 덕 타이핑 검증. (2) 플러그인 문서에서 peer dependency로 데몬의 zod 사용을 권장
**Warning signs:** 유효한 Zod 스키마인데 `ActionDefinitionSchema.parse()` 실패

### Pitfall 5: 데몬 초기화 순서와 ActionProviderRegistry 의존성
**What goes wrong:** ActionProviderRegistry가 ApiKeyStore에 의존하고, ApiKeyStore가 DB에 의존하는데, 초기화 순서가 잘못되면 null reference
**Why it happens:** DaemonLifecycle의 6단계 시작 순서에 새 컴포넌트 삽입이 필요
**How to avoid:** DB 초기화(Step 2) 후, HTTP 서버 시작(Step 5) 전에 ActionProviderRegistry + ApiKeyStore를 초기화. 기존 Step 4(Adapter 초기화)와 Step 5 사이에 새 단계 삽입
**Warning signs:** "Cannot read properties of undefined" 에러가 데몬 시작 시 발생

### Pitfall 6: DB v11 마이그레이션과 LATEST_SCHEMA_VERSION 불일치
**What goes wrong:** api_keys 테이블 DDL을 getCreateTableStatements()에 추가했지만 LATEST_SCHEMA_VERSION을 11로 변경하지 않으면, 기존 DB에서 마이그레이션이 실행되지 않음
**Why it happens:** pushSchema()가 LATEST_SCHEMA_VERSION을 schema_version에 기록하므로, 새 DB는 마이그레이션을 건너뜀. 기존 DB는 version < 11이면 마이그레이션 실행
**How to avoid:** 세 곳을 동시에 수정: (1) LATEST_SCHEMA_VERSION = 11, (2) getCreateTableStatements()에 api_keys DDL 추가, (3) MIGRATIONS.push({ version: 11, ... })에 CREATE TABLE api_keys 추가
**Warning signs:** 새 DB에서는 api_keys 테이블이 있지만 기존 DB에서는 "no such table: api_keys" 에러

## Code Examples

### IActionProvider 인터페이스 (Phase 128 구현 대상)

```typescript
// packages/core/src/interfaces/action-provider.types.ts
import { z } from 'zod';
import { ChainTypeEnum } from '../enums/chain.js';
import type { ContractCallRequest } from '../schemas/transaction.schema.js';

// --- Zod SSoT: ActionProviderMetadata ---
export const ActionProviderMetadataSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/).min(3).max(50),
  description: z.string().min(10).max(500),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  chains: z.array(ChainTypeEnum).min(1),
  mcpExpose: z.boolean().default(false),
  requiresApiKey: z.boolean().default(false),  // v1.5 추가
  requiredApis: z.array(z.string()).optional().default([]),
});
export type ActionProviderMetadata = z.infer<typeof ActionProviderMetadataSchema>;

// --- Zod SSoT: ActionDefinition ---
export const ActionDefinitionSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/).min(3).max(50),
  description: z.string().min(20).max(1000),
  chain: ChainTypeEnum,
  inputSchema: z.any(), // 런타임에서 ZodObject 덕 타이핑 검증
  riskLevel: z.enum(['low', 'medium', 'high']),
  defaultTier: z.enum(['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL']),
});
export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;

// --- ActionContext ---
export const ActionContextSchema = z.object({
  walletAddress: z.string().min(1),
  chain: ChainTypeEnum,
  walletId: z.string(),
  sessionId: z.string().optional(),
});
export type ActionContext = z.infer<typeof ActionContextSchema>;

// --- IActionProvider ---
export interface IActionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];
  resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest>;
}
```
**Source:** 설계 문서 62 섹션 2.1-2.4, v1.5 목표 문서

### api_keys 테이블 (DB v11)

```typescript
// packages/daemon/src/infrastructure/database/schema.ts (추가)

export const apiKeys = sqliteTable(
  'api_keys',
  {
    providerName: text('provider_name').primaryKey(),   // e.g., 'zero_ex'
    encryptedKey: text('encrypted_key').notNull(),       // AES-256-GCM (base64 JSON)
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
);
```

```typescript
// packages/daemon/src/infrastructure/database/migrate.ts (추가)

MIGRATIONS.push({
  version: 11,
  description: 'Add api_keys table for Action Provider API key storage',
  up: (sqlite) => {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS api_keys (
  provider_name TEXT PRIMARY KEY,
  encrypted_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
  },
});
```

### POST /v1/actions/:provider/:action 라우트

```typescript
// packages/daemon/src/api/routes/actions.ts

const actionExecuteRoute = createRoute({
  method: 'post',
  path: '/actions/{provider}/{action}',
  tags: ['Actions'],
  summary: 'Execute an Action Provider action',
  request: {
    params: z.object({
      provider: z.string(),
      action: z.string(),
    }),
    body: {
      content: { 'application/json': { schema: z.record(z.unknown()) } },
    },
  },
  responses: {
    201: { description: 'Action resolved and pipeline started' },
    ...buildErrorResponses(400, 403, 404, 502),
  },
});
```

### Admin UI API Keys 섹션 패턴

```typescript
// packages/admin/src/pages/settings.tsx 내 API Keys 섹션 추가
// 기존 SettingsPage 컴포넌트 내에 새 섹션으로 추가

// 1. GET /v1/admin/api-keys -> 프로바이더별 키 상태 조회
// 2. 각 프로바이더에 대해 키 입력/수정/삭제 폼 렌더링
// 3. PUT /v1/admin/api-keys/:provider -> 키 저장
// 4. DELETE /v1/admin/api-keys/:provider -> 키 삭제
// 5. requiresApiKey=true + 키 미설정 -> 경고 배지 표시
```

## State of the Art

| Old Approach (설계 문서 62 현재) | v1.5 Target | When Changed | Impact |
|--------------------------------|-------------|--------------|--------|
| `z.instanceof(z.ZodObject)` inputSchema 검증 | 덕 타이핑 검증 (`typeof schema.parse === 'function'`) | Phase 128 구현 시 | 플러그인의 zod 버전 불일치 문제 방지 |
| `services/` 디렉토리 배치 (doc 62 제안) | `infrastructure/action/` 디렉토리 | Phase 128 구현 시 | 코드베이스 기존 컨벤션 준수 |
| `requiredApis` 필드만 (API 키 관리 없음) | `requiresApiKey` + `api_keys` 테이블 | v1.5 목표 문서 | 프로바이더별 API 키 DB 암호화 저장 + Admin UI 관리 |
| `from` 필드 검증 (doc 62 섹션 2.6) | 스킵 (ContractCallRequestSchema에 from 필드 없음) | Phase 128 구현 시 | 파이프라인 Stage 5가 자동으로 지갑 주소 설정 |
| MCP Tool name: `action.name` 직접 사용 | `waiaas_{providerName}_{actionName}` 네임스페이스 | v1.5 목표 문서 | 기존 14개 도구와 이름 충돌 방지 |

**Deprecated/outdated:**
- **ContractCallRequest.from 검증**: 현재 스키마에 from 필드가 없으므로 설계 문서 62의 from 검증 의사코드는 적용 불가. `to` 필드 + ContractCallRequestSchema.parse()로 충분
- **services/ 디렉토리**: 코드베이스에 없는 패턴. infrastructure/로 대체
- **z.instanceof(z.ZodObject)**: 크로스 버전 Zod 호환성 문제. 덕 타이핑으로 대체 권장

## Codebase-Specific Findings

### 기존 코드베이스 패턴 매핑

| 구현 대상 | 기존 패턴 참조 | 파일 위치 |
|-----------|--------------|----------|
| IActionProvider 인터페이스 정의 | IPriceOracle 인터페이스 | `packages/core/src/interfaces/price-oracle.types.ts` |
| ActionProviderRegistry | Oracle 모듈 구조 | `packages/daemon/src/infrastructure/oracle/` |
| ApiKeyStore 암호화 | SettingsService + settings-crypto | `packages/daemon/src/infrastructure/settings/settings-crypto.ts` |
| api_keys DB 테이블 | settings 테이블 패턴 | `packages/daemon/src/infrastructure/database/schema.ts` |
| v11 마이그레이션 | v10 마이그레이션 (ALTER TABLE ADD COLUMN) | `packages/daemon/src/infrastructure/database/migrate.ts` L970-976 |
| POST /actions 라우트 | POST /transactions/send 패턴 | `packages/daemon/src/api/routes/transactions.ts` |
| Admin API Keys UI | Settings 페이지 패턴 | `packages/admin/src/pages/settings.tsx` |
| OpenAPI 스키마 | openapi-schemas.ts | `packages/daemon/src/api/routes/openapi-schemas.ts` |
| 에러 코드 추가 | ACTION 도메인 7개 코드 | `packages/core/src/errors/error-codes.ts` L513-560 |
| MCP Tool 등록 | 기존 14개 도구 등록 | `packages/mcp/src/server.ts` |
| Admin 엔드포인트 | endpoints.ts | `packages/admin/src/api/endpoints.ts` |

### 기존 에러 코드 현황

ACTION 도메인에 이미 7개 에러 코드가 정의되어 있다 (`error-codes.ts` L513-560):
- `ACTION_NOT_FOUND` (404)
- `ACTION_VALIDATION_FAILED` (400)
- `ACTION_RESOLVE_FAILED` (502)
- `ACTION_RETURN_INVALID` (500)
- `ACTION_PLUGIN_LOAD_FAILED` (500)
- `ACTION_NAME_CONFLICT` (409)
- `ACTION_CHAIN_MISMATCH` (400)

**추가 필요:** `API_KEY_REQUIRED` (403) -- requiresApiKey=true 프로바이더에서 키 미설정 시

### CREDENTIAL_KEYS 확장 필요

`settings-crypto.ts`의 `CREDENTIAL_KEYS` 셋은 API 키와 무관 (settings 테이블용). api_keys 테이블은 별도의 `ApiKeyStore` 클래스에서 암호화를 관리하므로 CREDENTIAL_KEYS 수정 불필요. 다만 `encryptSettingValue`/`decryptSettingValue` 함수는 범용이므로 ApiKeyStore에서 재사용 가능.

### DaemonLifecycle 초기화 순서

현재 6단계:
1. Environment + config + flock
2. Database initialization
3. Keystore unlock
4. Adapter initialization (fail-soft)
5. HTTP server start
6. Background workers + PID

**ActionProviderRegistry 삽입 위치:** Step 4와 Step 5 사이 (Step 4.5). DB가 초기화된 후(Step 2), ApiKeyStore 생성 가능. Adapter 초기화(Step 4) 후, HTTP 서버(Step 5)에 라우트 등록 시 registry를 전달.

### Admin 라우트 deps 패턴

AdminRouteDeps에 `priceOracle`, `oracleConfig` 등이 선택적 프로퍼티로 전달되는 패턴. 동일하게 `actionProviderRegistry`, `apiKeyStore`를 추가:

```typescript
export interface AdminRouteDeps {
  // ... 기존 필드 ...
  actionProviderRegistry?: ActionProviderRegistry;
  apiKeyStore?: ApiKeyStore;
}
```

### ContractCallRequestSchema 현행 필드

```typescript
{
  type: z.literal('CONTRACT_CALL'),
  to: z.string().min(1),        // contract address
  calldata: z.string().optional(),      // EVM hex calldata
  abi: z.array(z.record(z.unknown())).optional(), // EVM ABI
  value: z.string().optional(),         // native token value
  programId: z.string().optional(),     // Solana program ID
  instructionData: z.string().optional(), // Solana base64 instruction data
  accounts: z.array(z.object({          // Solana accounts
    pubkey: z.string(),
    isSigner: z.boolean(),
    isWritable: z.boolean(),
  })).optional(),
  network: NetworkTypeEnum.optional(),
}
```

**중요:** `from` 필드가 없다. resolve() 반환값에서 `from` 검증은 설계 문서 62 의사코드와 불일치. 파이프라인 Stage 5에서 지갑의 publicKey가 자동으로 서명자가 되므로, `from` 검증은 불필요.

## Open Questions

1. **ActionDefinition.inputSchema의 타입 검증 방식**
   - What we know: 설계 문서 62는 `z.instanceof(z.ZodObject)`를 사용하지만, 플러그인이 다른 zod 버전을 사용하면 instanceof 실패
   - What's unclear: 덕 타이핑으로 대체하면 ActionDefinitionSchema의 inputSchema 필드 타입을 `z.any()`로 변경해야 하는데, 이는 Zod SSoT 원칙과 약간 충돌
   - Recommendation: **`z.any()`로 정의하되, register() 시 런타임 덕 타이핑 검증 수행.** `typeof inputSchema.parse === 'function' && typeof inputSchema.safeParse === 'function'`으로 검사. 이는 validate-then-trust 원칙과 일치

2. **MCP Tool 동적 등록/해제 범위**
   - What we know: v1.5 목표 문서 E2E 시나리오 21이 "프로바이더 해제 시 MCP 도구 자동 제거"를 요구. 설계 문서 62 섹션 5.5는 "데몬 시작 시 1회"를 명시
   - What's unclear: MCP SDK의 server.tool()로 등록한 도구를 런타임에 제거하는 API가 있는지
   - Recommendation: **데몬 시작 시 1회 등록 + unregister()는 내부 상태만 변경 (MCP 도구 목록에서는 다음 재시작까지 유지).** E2E 시나리오 21은 ActionProviderRegistry의 unregister()가 내부 맵에서 제거하는 것을 테스트하되, MCP 도구 목록 변경은 재시작 시점에 반영되는 것으로 설계. 핫 리로드는 Out of Scope

3. **actions.ts 라우트 파일의 인증 방식**
   - What we know: POST /v1/actions/:provider/:action은 sessionAuth (Bearer wai_sess_...) 인증. GET/PUT/DELETE /v1/admin/api-keys는 masterAuth
   - What's unclear: actions 라우트를 기존 transactions.ts처럼 sessionAuth 미들웨어 하위에 배치할지, 별도 마운트할지
   - Recommendation: **기존 라우트 마운트 패턴을 따라 sessionAuth 하위에 배치.** `createApp()`에서 `/v1/actions` 경로를 sessionAuth 미들웨어 범위에 포함

## Sources

### Primary (HIGH confidence)
- 설계 문서 62 (`docs/62-action-provider-architecture.md`) -- IActionProvider 인터페이스, ActionProviderRegistry, 플러그인 로드, MCP Tool 변환 전체 설계 (2293줄)
- v1.5 목표 문서 (`objectives/v1.5-defi-price-oracle.md`) -- ACTNP-01~04, APIKY-01~04 요구사항, api_keys 테이블 설계, requiresApiKey 필드
- 코드베이스 직접 조사: `packages/core/src/interfaces/`, `packages/daemon/src/infrastructure/`, `packages/daemon/src/api/routes/`, `packages/daemon/src/pipeline/stages.ts`, `packages/mcp/src/server.ts`, `packages/admin/src/pages/settings.tsx`
- Phase 125 RESEARCH (`125-RESEARCH.md`) -- 코드베이스 패턴 조사 결과, infrastructure/ 컨벤션 확인

### Secondary (MEDIUM confidence)
- 기존 에러 코드 체계 (`packages/core/src/errors/error-codes.ts`) -- ACTION 도메인 7개 코드 확인, API_KEY_REQUIRED 추가 필요 확인
- 기존 DB 마이그레이션 패턴 (`packages/daemon/src/infrastructure/database/migrate.ts`) -- v10까지 10개 마이그레이션으로 검증된 MIGRATIONS.push() 패턴

### Tertiary (LOW confidence)
- MCP SDK server.tool() 동적 해제 API 존재 여부: 확인하지 못함. 데몬 재시작 방식으로 우회 가능

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 외부 의존성 없음, 기존 코드베이스 패턴 100% 재사용
- Architecture: HIGH -- 설계 문서 62가 2293줄의 상세 의사코드 제공, 기존 infrastructure/ 패턴 확인 완료
- Pitfalls: HIGH -- ContractCallRequestSchema의 from 필드 부재를 코드베이스 직접 확인. ESM import 패턴은 Node.js 공식 문서 기반
- DB 마이그레이션: HIGH -- 10개 마이그레이션 실적으로 검증된 패턴
- MCP 동적 도구 관리: MEDIUM -- SDK API 미확인이나, 목표 문서의 Out of Scope(핫 리로드 없음)으로 리스크 제한적

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (안정적 -- 내부 코드베이스 기반, 외부 API 변동 영향 없음)
