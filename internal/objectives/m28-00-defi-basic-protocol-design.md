# 마일스톤 m28: 기본 DeFi 프로토콜 설계 (Swap/Bridge/Staking)

- **Status:** PLANNED
- **Milestone:** v28.0

## 목표

v1.5에서 구축된 Action Provider 프레임워크 위에 4개 기본 DeFi 프로토콜(DEX Swap, EVM Swap, 크로스체인 브릿지, Liquid Staking)을 구현하기 위한 공통 설계를 확정한다. packages/actions/ 패키지 구조, REST API → calldata 변환 공통 패턴, 정책 연동 설계, 비동기 상태 추적 패턴, 테스트 전략을 정의하여 m28-01~m28-04 구현 마일스톤의 입력을 생산한다.

---

## 배경

v1.5에서 IActionProvider 인터페이스, ActionProviderRegistry, MCP Tool 자동 변환, POST /v1/actions/:provider/:action 엔드포인트가 구현되었다. 그러나 이 프레임워크의 **실 구현체**는 아직 없다. m28은 4개 프로토콜의 공통 설계를 확정하고, m28-01~m28-04에서 각각 구현한다.

### 4개 프로토콜 개요

| 마일스톤 | 프로토콜 | 체인 | 패턴 |
|---------|----------|------|------|
| m28-01 | Jupiter Swap | Solana | REST → instruction → ContractCallRequest |
| m28-02 | 0x Swap API | EVM (19+ 체인) | REST → calldata → ContractCallRequest |
| m28-03 | LI.FI Bridge | Solana↔EVM | REST → calldata + 비동기 상태 추적 |
| m28-04 | Lido + Jito Staking | EVM + Solana | ABI/프로그램 직접 호출 + 포지션 조회 |

---

## 설계 대상

### 1. DEFI-01: packages/actions/ 패키지 구조 (확정 설계)

내장 ActionProvider 구현체를 코어/데몬과 분리하여 선택적 설치가 가능한 독립 패키지로 설계한다.

> **상태:** 확정 설계 (2026-02-23)
> **요구사항:** PKGS-01, PKGS-02, PKGS-03, PKGS-04

#### 1.1 PKGS-01: 디렉토리 구조 확정

```
packages/actions/
  package.json                    # @waiaas/actions, workspace dependencies only
  tsconfig.json                   # extends root, ES2022, NodeNext
  src/
    index.ts                      # 내장 프로바이더 export + registerBuiltInProviders()
    common/
      action-api-client.ts        # ActionApiClient base (fetch + AbortController + Zod)
      slippage.ts                 # SlippageHelper (clamp, bps/pct 변환, branded types)
      errors.ts                   # DeFi 에러 코드 정의 (ACTION_API_ERROR 등)
    providers/
      jupiter-swap/               # m28-01
        index.ts                  # JupiterSwapActionProvider : IActionProvider
        jupiter-api-client.ts     # Jupiter REST API (extends ActionApiClient)
        schemas.ts                # QuoteResponse, SwapInstructionsResponse Zod
        config.ts                 # JupiterSwapConfig type + defaults
      0x-swap/                    # m28-02
        index.ts                  # ZeroExSwapActionProvider : IActionProvider
        0x-api-client.ts          # 0x REST API (extends ActionApiClient)
        schemas.ts                # PriceResponse, QuoteResponse Zod
        config.ts                 # ZeroExSwapConfig type + defaults
        allowance-holder.ts       # AllowanceHolder approve helper (NOT Permit2)
      lifi/                       # m28-03
        index.ts                  # LiFiActionProvider : IActionProvider
        lifi-api-client.ts        # LI.FI REST API (extends ActionApiClient)
        schemas.ts                # QuoteResponse, StatusResponse Zod
        config.ts                 # LiFiConfig type + defaults
      lido/                       # m28-04
        index.ts                  # LidoStakingActionProvider : IActionProvider
        lido-contract.ts          # ABI encodings (submit, requestWithdrawals)
        schemas.ts                # Input Zod schemas
        config.ts                 # LidoConfig type + defaults
      jito/                       # m28-04
        index.ts                  # JitoStakingActionProvider : IActionProvider
        jito-stake-pool.ts        # SPL Stake Pool instruction builder
        schemas.ts                # Input Zod schemas
        config.ts                 # JitoConfig type + defaults
```

**package.json 확정 내용:**

```json
{
  "name": "@waiaas/actions",
  "version": "2.6.0-rc.3",
  "description": "WAIaaS built-in DeFi Action Provider implementations",
  "license": "MIT",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "dependencies": {
    "@waiaas/core": "workspace:*",
    "@solana-program/system": "^0.11.0",
    "@solana-program/token": "^0.10.0",
    "@solana/kit": "^6.0.1",
    "viem": "^2.21.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^25.2.3"
  }
}
```

- **신규 npm 의존성: 0개** -- 모든 의존성은 기존 모노레포 패키지
- daemon package.json에 추가: `"@waiaas/actions": "workspace:*"`

#### 1.2 PKGS-02: 내장 프로바이더 등록/해제 라이프사이클 설계

`registerBuiltInProviders()` 함수의 확정 설계:

```typescript
// packages/actions/src/index.ts
export function registerBuiltInProviders(
  registry: ActionProviderRegistry,
  config: DaemonConfig,
): { loaded: string[]; skipped: string[] } {
  const loaded: string[] = [];
  const skipped: string[] = [];

  const providers: Array<{ key: string; factory: () => IActionProvider }> = [
    { key: 'jupiter_swap', factory: () => new JupiterSwapActionProvider(config.actions?.jupiter_swap) },
    { key: '0x_swap', factory: () => new ZeroExSwapActionProvider(config.actions?.['0x_swap']) },
    { key: 'lifi', factory: () => new LiFiActionProvider(config.actions?.lifi) },
    { key: 'lido', factory: () => new LidoStakingActionProvider(config.actions?.lido) },
    { key: 'jito', factory: () => new JitoStakingActionProvider(config.actions?.jito) },
  ];

  for (const { key, factory } of providers) {
    if (config.actions?.[key]?.enabled) {
      try {
        registry.register(factory());
        loaded.push(key);
      } catch (err) {
        console.warn(`Built-in provider '${key}' registration failed:`, err);
        skipped.push(key);
      }
    } else {
      skipped.push(key);
    }
  }
  return { loaded, skipped };
}
```

**라이프사이클 6단계:**

1. 데몬 시작 시 Step 4 (DaemonLifecycle)에서 `registerBuiltInProviders()` 호출
2. `config.actions.{provider_name}.enabled` 플래그 확인
3. `enabled=true`인 프로바이더만 `factory()` 호출 후 `registry.register()`
4. 등록 실패 시 `warn` 로그 + skip (데몬 전체 실패 방지)
5. 반환: `{ loaded: string[], skipped: string[] }` -- 데몬 시작 로그에 출력
6. 데몬 종료 시: 별도 해제 불필요 (프로바이더는 stateless, GC 처리)

#### 1.3 PKGS-03: config.toml [actions.*] 공통 스키마 패턴 확정

**모든 프로바이더 공통 필드:**

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `enabled` | boolean | 필수 | `false` | 프로바이더 활성화 여부 |
| `api_base_url` | string | REST API 프로바이더만 | 프로바이더별 | REST API 기본 URL |
| `api_key` | string | 0x 필수, Jupiter/LI.FI 선택 | `""` | API 인증 키 |

**프로바이더별 슬리피지 필드:**

| 프로바이더 | config 키 | 타입 | 단위 | 기본값 | 상한 |
|-----------|-----------|------|------|--------|------|
| Jupiter | `default_slippage_bps` / `max_slippage_bps` | integer | bps (API 네이티브) | 50 (0.5%) | 500 (5%) |
| 0x | `default_slippage_pct` / `max_slippage_pct` | decimal | pct (API 네이티브) | 0.01 (1%) | 0.05 (5%) |
| LI.FI | `default_slippage_pct` / `max_slippage_pct` | decimal | pct (API 네이티브) | 0.03 (3%) | 0.05 (5%) |

**Zod 검증 스키마:** `ActionsConfigSchema`를 core에 추가. 환경변수 오버라이드: `WAIAAS_ACTIONS_{PROVIDER}_{KEY}` 패턴 (기존 패턴 일관).

**config.toml 검증 바운드:**
- Jupiter bps: 1~10000 (integer). 범위 초과 시 config 로딩에서 즉시 에러
- 0x/LI.FI pct: 0.001~1.0 (decimal). 범위 초과 시 config 로딩에서 즉시 에러

**프로바이더별 config.toml 전체 섹션 예시:**

```toml
# === DeFi Action Provider Configuration ===

[actions.jupiter_swap]
enabled = true
api_base_url = "https://api.jup.ag/swap/v1"
# api_key = ""                                 # Jupiter API key (optional, improves rate limits)
default_slippage_bps = 50                      # 0.5%
max_slippage_bps = 500                         # 5%
max_price_impact_pct = 1.0                     # 1% price impact limit
jito_tip_lamports = 1000                       # Jito MEV protection tip (default 1000 lamports)
# jito_block_engine_url = ""                   # Jito block engine URL (optional)

[actions.0x_swap]
enabled = true
api_key = ""                                   # 0x API key (REQUIRED -- get from dashboard.0x.org)
api_base_url = "https://api.0x.org"            # Unified endpoint (v2, all chains via chainId param)
default_slippage_pct = 0.01                    # 1%
max_slippage_pct = 0.05                        # 5%

[actions.lifi]
enabled = true
# api_key = ""                                 # LI.FI API key (optional, improves rate limits)
api_base_url = "https://li.quest/v1"
default_slippage_pct = 0.03                    # 3% (cross-chain needs higher default)
max_slippage_pct = 0.05                        # 5%
status_poll_interval_sec = 30                  # Bridge status polling interval
status_poll_max_attempts = 240                 # Max attempts (2 hours at 30s)

[actions.lido]
enabled = true
steth_address = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84"
withdrawal_queue_address = "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1"

[actions.jito]
enabled = true
stake_pool = "Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb"
jitosol_mint = "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn"
```

#### 1.4 PKGS-04: Admin Settings 런타임 변경 가능 설정 항목 확정

**config.toml (정적, 재시작 필요):**

| 설정 | 이유 |
|------|------|
| `enabled` | 프로바이더 로딩은 데몬 시작 시에만 발생 |
| `api_base_url` | API 엔드포인트 변경은 인프라 변경 |
| 컨트랙트 주소 (`steth_address`, `withdrawal_queue_address`, `stake_pool`, `jitosol_mint`) | 온체인 주소는 변경 빈도 극저 |

**Admin Settings (런타임, hot-reload 가능):**

| 설정 | 카테고리 | 이유 |
|------|---------|------|
| `api_key` (Jupiter, 0x, LI.FI) | 보안 자격 증명 | 키 교체/갱신을 재시작 없이 수행 |
| `default_slippage_bps` / `default_slippage_pct` | 운영 파라미터 | 시장 상황에 따라 실시간 조정 |
| `max_slippage_bps` / `max_slippage_pct` | 운영 파라미터 | 위험 한도 실시간 조정 |
| `max_price_impact_pct` (Jupiter) | 운영 파라미터 | 가격 영향 한도 실시간 조정 |
| `jito_tip_lamports` (Jupiter) | 운영 파라미터 | MEV 보호 비용 실시간 조정 |
| `status_poll_interval_sec` (LI.FI) | 운영 파라미터 | 폴링 빈도 실시간 조정 |
| `status_poll_max_attempts` (LI.FI) | 운영 파라미터 | 최대 대기 시간 실시간 조정 |

**경계 원칙:** "보안 자격 증명과 인프라 설정 = config.toml only, 운영 파라미터 = Admin Settings"

> **Note:** `api_key`는 보안 자격 증명이지만 Admin Settings에서도 관리 가능 -- 키 교체 시 재시작 없이 적용이 운영상 중요하기 때문. Admin Settings에서는 password-type 입력 + master password 암호화 저장.

**Settings snapshot 패턴:** `resolve()` 진입 시 설정 스냅샷 획득, 파이프라인 완료까지 스냅샷 사용 (Pitfall P19 방지). 이를 통해 resolve() 실행 중 Admin Settings 변경이 진행 중인 트랜잭션에 영향을 주지 않음.

---

### 2. DEFI-02: REST API -> calldata 변환 공통 패턴 (확정 설계)

4개 프로토콜 모두 **외부 REST API 호출 -> calldata/instruction 획득 -> ContractCallRequest 변환**이라는 동일 패턴을 따른다.

> **상태:** 확정 설계 (2026-02-23)
> **요구사항:** APIC-01, APIC-02, APIC-03, APIC-04, APIC-05

#### 2.1 공통 플로우

```
resolve(actionName, params)
  1. 입력 파라미터 Zod 검증
  2. 외부 API 호출 (Quote/견적 조회)
  3. 견적 검증 (슬리피지, priceImpact 등)
  4. 외부 API 호출 (calldata/instruction 획득)
  5. ContractCallRequest 변환 (체인별 매핑)
  6. 반환 -> 기존 파이프라인 Stage 1~6 실행
```

#### 2.2 APIC-01: ActionApiClient 베이스 패턴 확정

```typescript
// packages/actions/src/common/action-api-client.ts
export class ActionApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number = 10_000,
    private readonly headers: Record<string, string> = {},
  ) {}

  async get<T>(path: string, schema: z.ZodType<T>, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: this.headers,
      });
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 429) {
          throw new ChainError('ACTION_RATE_LIMITED', `Rate limited: ${body}`);
        }
        throw new ChainError('ACTION_API_ERROR', `API error ${res.status}: ${body}`);
      }
      const data = await res.json();
      return schema.parse(data); // Runtime API contract validation
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ChainError('ACTION_API_TIMEOUT', `API timeout after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(new URL(path, this.baseUrl).toString(), {
        method: 'POST',
        signal: controller.signal,
        headers: { ...this.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429) {
          throw new ChainError('ACTION_RATE_LIMITED', `Rate limited: ${text}`);
        }
        throw new ChainError('ACTION_API_ERROR', `API error ${res.status}: ${text}`);
      }
      const data = await res.json();
      return schema.parse(data);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ChainError('ACTION_API_TIMEOUT', `API timeout after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
```

**핵심 설계 결정:**

- native fetch + AbortController (SDK 미사용, 신규 의존성 0개)
- 모든 응답에 `Zod schema.parse()` 적용 -- API drift 런타임 감지
- 실패 시 `ChainError` 반환 (`ACTION_API_ERROR`, `ACTION_API_TIMEOUT`, `ACTION_RATE_LIMITED`)
- ChainError -> WAIaaSError 변환은 Stage 5에서 수행 (기존 패턴)
- 타임아웃 기본 10초, 크로스체인(LI.FI)은 15초
- resolve()는 파이프라인 진입 전에 호출되므로 파이프라인 타임아웃과 독립 (Pitfall P10 방지)
- 응답 로깅: 첫 성공 시 + Zod 실패 시 raw response 로깅

#### 2.3 APIC-02: ContractCallRequest 변환 매핑 확정

**Solana 매핑 (Jupiter, Jito):**

```
외부 API instruction -> ContractCallRequest:
  type: 'CONTRACT_CALL'
  to: programId (Jupiter v6 program / Jito SPL Stake Pool)
  programId: instruction.programId
  instructionData: instruction.data (base64)
  accounts: instruction.accounts (AccountMeta[])
```

**EVM 매핑 (0x, LI.FI, Lido):**

```
외부 API calldata -> ContractCallRequest:
  type: 'CONTRACT_CALL'
  to: quote.to (ExchangeProxy / LI.FI router / stETH contract)
  calldata: quote.data (hex)
  value: quote.value (ETH amount, 0 for token swaps)
```

**Solana vs EVM 매핑 비교:**

| 필드 | Solana | EVM | 비고 |
|------|--------|-----|------|
| `type` | `CONTRACT_CALL` | `CONTRACT_CALL` | 동일 |
| `to` | programId | contract address | Solana: 프로그램 주소, EVM: 컨트랙트 주소 |
| 호출 데이터 | `instructionData` (base64) | `calldata` (hex) | 인코딩 형식 상이 |
| 부가 정보 | `accounts` (AccountMeta[]) | `value` (wei amount) | Solana: 계정 목록, EVM: ETH 전송액 |
| 다중 인스트럭션 | BATCH 타입 사용 | 단일 calldata | Jupiter: setup+swap+cleanup 다중 인스트럭션 |

#### 2.4 APIC-03: DeFi 에러 코드 확정

기존 WAIaaSError 체계에 추가할 DeFi 에러 코드:

| 코드 | HTTP | 설명 | 사용처 |
|------|------|------|--------|
| `ACTION_API_ERROR` | 502 | 외부 DeFi API 호출 실패 (non-200 응답) | 모든 REST API 프로바이더 |
| `ACTION_API_TIMEOUT` | 504 | 외부 DeFi API 타임아웃 | 모든 REST API 프로바이더 |
| `ACTION_RATE_LIMITED` | 429 | 외부 API rate limit 초과 | Jupiter, 0x, LI.FI |
| `PRICE_IMPACT_TOO_HIGH` | 422 | 가격 영향이 설정 상한 초과 | Jupiter, 0x |
| `ACTION_REQUIRES_APPROVAL` | 409 | ERC-20 토큰 승인 필요 (AllowanceHolder) | 0x |
| `BRIDGE_ROUTE_NOT_FOUND` | 404 | 크로스체인 경로 없음 | LI.FI |
| `JITO_UNAVAILABLE` | 503 | Jito 블록 엔진 사용 불가 (fail-closed) | Jupiter |
| `QUOTE_EXPIRED` | 410 | 견적 TTL 만료 | Gas Condition 재실행 시 |

**ChainError -> WAIaaSError 변환 경로:**

```
ActionApiClient (ChainError)
  -> ActionProvider.resolve() (ChainError 전파)
    -> ActionProviderRegistry.executeResolve() (catch ChainError)
      -> Action Route Handler (catch ChainError -> WAIaaSError 변환)
        -> HTTP Response (WAIaaSError.code -> HTTP status + error body)
```

Stage 5에서의 변환이 아닌, Action Route Handler에서의 변환이 적절하다. resolve()는 파이프라인 외부에서 호출되므로 Stage 5에 도달하지 않는다.

#### 2.5 APIC-04: 슬리피지 제어 공통 로직 확정

```typescript
// packages/actions/src/common/slippage.ts

// 브랜디드 타입으로 단위 혼동 방지
type SlippageBps = number & { __brand: 'bps' };
type SlippagePct = number & { __brand: 'pct' };

// 팩토리 함수 (런타임 검증 포함)
function asBps(value: number): SlippageBps {
  if (!Number.isInteger(value) || value < 1 || value > 10000) {
    throw new Error(`Invalid bps value: ${value} (must be integer 1-10000)`);
  }
  return value as SlippageBps;
}

function asPct(value: number): SlippagePct {
  if (value < 0.001 || value > 1.0) {
    throw new Error(`Invalid pct value: ${value} (must be 0.001-1.0)`);
  }
  return value as SlippagePct;
}

// 클램핑 함수
function clampSlippageBps(input: number, default_: SlippageBps, max: SlippageBps): SlippageBps {
  const value = input <= 0 ? default_ : Math.min(input, max);
  return asBps(Math.round(value));
}

function clampSlippagePct(input: number, default_: SlippagePct, max: SlippagePct): SlippagePct {
  const value = input <= 0 ? default_ : Math.min(input, max);
  return asPct(value);
}

// 변환 함수
function bpsToSlippagePct(bps: SlippageBps): SlippagePct {
  return asPct(bps / 10000);  // 50 -> 0.005
}

function pctToSlippageBps(pct: SlippagePct): SlippageBps {
  return asBps(Math.round(pct * 10000));  // 0.005 -> 50
}
```

**프로바이더별 단위 매핑 테이블:**

| 프로바이더 | API 파라미터 | 단위 | config 키 | 기본값 | 상한 |
|-----------|-------------|------|-----------|--------|------|
| Jupiter | `slippageBps` | bps (integer) | `default_slippage_bps` / `max_slippage_bps` | 50 (0.5%) | 500 (5%) |
| 0x | `slippagePercentage` | pct (decimal) | `default_slippage_pct` / `max_slippage_pct` | 0.01 (1%) | 0.05 (5%) |
| LI.FI | `slippage` | pct (decimal) | `default_slippage_pct` / `max_slippage_pct` | 0.03 (3%) | 0.05 (5%) |

**config 검증 바운드:** Jupiter bps 1~10000, 0x/LI.FI pct 0.001~1.0. 범위 초과 시 config 로딩에서 즉시 에러.

#### 2.6 APIC-05: 0x AllowanceHolder 토큰 승인 플로우 확정

Research에서 확인된 바와 같이 **AllowanceHolder를 사용**한다 (Permit2 대신).

**AllowanceHolder 플로우:**

1. `GET /swap/allowance-holder/price` -- 견적 조회 (NOT `/swap/permit2/price`)
2. `GET /swap/allowance-holder/quote` -- 실행용 calldata 획득 (NOT `/swap/permit2/quote`)
3. ERC-20 판매 시: **AllowanceHolder 컨트랙트에 대한 standard ERC-20 approve 필요**
4. approve는 기존 APPROVE 파이프라인 타입으로 실행 (별도 파이프라인)
5. approve 완료 후 swap 파이프라인 실행

**AllowanceHolder vs Permit2 비교:**

| 항목 | AllowanceHolder (채택) | Permit2 (미채택) |
|------|----------------------|-----------------|
| 서명 | 1회 (트랜잭션) | 2회 (EIP-712 + 트랜잭션) |
| 가스 | 낮음 | 높음 |
| 복잡도 | 낮음 (standard approve) | 높음 (EIP-712 서명 + 시그니처 조합) |
| 적합 환경 | 서버사이드 (WAIaaS) | 브라우저 지갑 |
| EIP-712 필요 | 아니오 | 예 |
| 보안 모델 | standard ERC-20 approve | Permit2 universal approval |

**채택 근거:** AllowanceHolder는 0x가 서버사이드 통합에 공식 권장하는 방식이다. Permit2 대비 구현 복잡도가 낮고(EIP-712 서명 불필요), 가스비가 저렴하며, 기존 WAIaaS APPROVE 파이프라인과 자연스럽게 통합된다.

**policy 평가:**
- approve 트랜잭션은 $0 지출로 평가 (승인은 지출이 아님)
- swap 금액만 SPENDING_LIMIT 대상
- AllowanceHolder 주소는 `APPROVED_SPENDERS` 정책에서 관리

**approve -> swap 순차 실행:**

```
사용자: 0x_swap 요청 (USDC -> ETH)
  |
  v
ZeroExSwapActionProvider.resolve()
  1. allowance 확인: AllowanceHolder에 대한 USDC allowance 충분한지?
  2. allowance 부족 시: ACTION_REQUIRES_APPROVAL 에러 반환
     -> Action Route Handler가 2-step 오케스트레이션:
        Step 1: APPROVE 파이프라인 실행 (approve AllowanceHolder for USDC)
        Step 2: approve CONFIRMED 후 resolve() 재호출 -> swap 실행
  3. allowance 충분 시: 바로 ContractCallRequest 반환 -> swap 실행
```

---

### 3. 정책 연동 설계 (DEFI-03 확정)

기존 정책 엔진이 ActionProvider 실행에 어떻게 적용되는지 확정한다.

#### PLCY-01: ActionProvider -> 정책 평가 연동 플로우

```
AI Agent / MCP / SDK
        |
        v
POST /v1/actions/:provider/:action { params, walletId }
        |
        v
ActionProviderRegistry.executeResolve(actionKey, params, context)
  1. inputSchema.parse(params) -- 입력 검증
  2. provider.resolve(actionName, params, context)
     - 외부 API 호출 또는 ABI 인코딩
     - Settings snapshot 획득 (resolve 시작 시점)
     -> 반환: ContractCallRequest
  3. ContractCallRequestSchema.parse(result) -- 반환값 재검증
        |
        v
executeSend(walletId, contractCallRequest) -- 기존 파이프라인 진입
        |
        v
Stage 1: Validate + DB INSERT (PENDING)
  - ContractCallRequest 필드 검증
  - transactions 테이블에 INSERT
        |
        v
Stage 2: Auth (sessionId 검증)
        |
        v
Stage 3: Policy Evaluation  <-- 정책 평가 핵심 지점
  3a. CONTRACT_WHITELIST 검사
      - contractCallRequest.to 주소가 화이트리스트에 등록되었는지 확인
      - 미등록 시: POLICY_VIOLATION (CONTRACT_WHITELIST) 에러 -> 즉시 거부
  3b. SPENDING_LIMIT 평가
      - 금액 추출: value (native) 또는 amount (token)
      - IPriceOracle로 USD 환산
      - 기존 4-tier 평가: ALLOW / DELAY / APPROVAL / DENY
  3c. APPROVED_SPENDERS 검사 (0x AllowanceHolder approve 시)
      - approve 대상이 APPROVED_SPENDERS에 등록되었는지 확인
        |
        v
[Stage 3.5: Gas Condition -- m28-05에서 추가]
        |
        v
Stage 4: Wait (DELAY/APPROVAL tier에 따라 대기/승인)
        |
        v
Stage 5: Execute (build -> simulate -> sign -> submit)
        |
        v
Stage 6: Confirm (waitForConfirmation)
```

**핵심 원칙:**

1. **resolve()는 순수 함수** -- 정책 평가는 파이프라인 Stage 3에서만 수행. resolve()에서 정책 검사를 하지 않는다.
2. **CONTRACT_WHITELIST 필수** -- 정책 평가 시점에서 ContractCallRequest의 `to` 주소가 CONTRACT_WHITELIST에 등록되어야 한다.
3. **SPENDING_LIMIT 금액 기준** -- resolve()가 반환한 금액(value/amount)을 기준으로 평가한다.
4. **approve 트랜잭션은 $0 지출로 평가** -- 승인(approval)은 지출이 아니다. APPROVE 타입 트랜잭션의 SPENDING_LIMIT 평가 금액은 $0이다.
5. **Settings snapshot** -- resolve() 진입 시 Settings snapshot을 획득하고, 파이프라인 완료까지 해당 snapshot을 유지한다. 중간에 Admin Settings가 변경되어도 진행 중인 트랜잭션에는 영향 없다.

#### PLCY-02: 4개 프로토콜의 CONTRACT_WHITELIST 등록 대상

구현 시 아래 목록을 참조하여 프로바이더별 화이트리스트 번들을 자동 생성한다.

| 프로토콜 | 체인 | 주소 | 설명 | 화이트리스트 번들 |
|---------|------|------|------|-----------------|
| Jupiter | Solana | JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 | Jupiter Aggregator v6 | jupiter_swap |
| 0x | All EVM | (quote.to에서 동적 획득) | 0x Settlement / ExchangeProxy | 0x_swap |
| 0x | All EVM | AllowanceHolder 주소 (0x API response에서 획득) | AllowanceHolder approve 대상 | 0x_swap |
| LI.FI | EVM | (quote.transactionRequest.to에서 동적 획득) | LI.FI diamond proxy | lifi |
| LI.FI | Solana | (quote response에서 동적 획득) | Bridge program | lifi |
| Lido | Ethereum | 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84 | stETH / Lido contract | lido |
| Lido | Ethereum | 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0 | wstETH (Wrapped stETH) -- SAFE-02에서 추가 | lido |
| Lido | Ethereum | 0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1 | WithdrawalQueueERC721 | lido |
| Jito | Solana | SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy | SPL Stake Pool program | jito |

**정적 주소 (Lido, Jito, Jupiter):** 프로바이더의 config.ts에 하드코딩한다. 프로바이더 등록 시 화이트리스트 번들로 제공한다.

**동적 주소 (0x, LI.FI):** quote response의 `to` 필드에서 획득한다. 프로바이더가 resolve()에서 반환한 ContractCallRequest.to가 화이트리스트에 등록되어야 한다. 동적 주소의 경우 프로바이더가 resolve() 시 획득한 주소를 반환하고, Stage 3에서 해당 주소의 화이트리스트 등록 여부를 검사한다.

**프로바이더 화이트리스트 번들 설계:**

각 ActionProvider에 `getRequiredContracts(chain): ContractAddress[]` 메서드를 추가한다.
- 정적 주소를 가진 프로바이더(Jupiter, Lido, Jito)는 하드코딩된 주소 배열을 반환한다.
- 동적 주소를 가진 프로바이더(0x, LI.FI)는 빈 배열을 반환하되, 문서에 "동적 주소이므로 첫 사용 시 자동 등록 안내 필요"를 명시한다.

프로바이더 활성화 시 Admin UI에서 안내:
- "이 프로바이더가 필요한 컨트랙트 주소를 화이트리스트에 추가하시겠습니까?"
- 정적 주소는 자동 추가 제안, 동적 주소는 첫 트랜잭션 시 안내.

에러 메시지 개선:
- 기존: `"CONTRACT_WHITELIST violation for 0xae75..."`
- 개선: `"Lido stETH contract가 화이트리스트에 미등록. Admin > Policies에서 Lido 번들을 활성화하세요"`
- 프로바이더 컨텍스트를 포함하여 운영자가 바로 조치할 수 있도록 안내한다.

Pitfall P13 (CONTRACT_WHITELIST 파편화) 방지: 프로바이더별 번들로 묶어 한 번에 등록/해제한다.

#### PLCY-03: 크로스체인 정책 평가 규칙

크로스체인 브릿지(LI.FI)에서의 정책 평가 규칙을 확정한다.

**1. 출발 체인 정책으로 평가** -- 자금이 나가는 쪽의 월렛 정책을 적용한다.
- walletId = 출발 체인의 월렛 ID
- CONTRACT_WHITELIST: 출발 체인의 브릿지 컨트랙트가 등록되어야 한다
- SPENDING_LIMIT: 브릿지 금액(fromAmount)을 USD 환산하여 평가한다

**2. 도착 체인은 수신이므로 정책 미적용** -- 도착 체인에서 자산이 수신되는 것은 incoming TX와 동일하다.
- 도착 체인 월렛의 SPENDING_LIMIT은 소비하지 않는다
- 다만 도착 주소 검증은 별도 수행한다 (PLCY-04)

**3. cross-chain swap의 정책 평가**
- "SOL -> Base USDC" 같은 크로스체인 스왑도 출발 체인(Solana) 정책으로 평가한다
- 도착 체인(Base)에서의 DEX 스왑은 LI.FI가 내부적으로 수행한다 (WAIaaS 정책 범위 밖)

**4. SPENDING_LIMIT 예약 유지 규칙**
- 브릿지 제출 시 SPENDING_LIMIT 예약을 생성한다
- bridge_status가 COMPLETED 또는 REFUNDED가 될 때까지 예약을 유지한다
- TIMEOUT/BRIDGE_MONITORING 상태에서는 예약을 해제하지 않는다 (자금이 limbo에 있을 수 있음)
- Pitfall P4 방지: 예약 조기 해제 방지로 과지출을 차단한다

**크로스체인 브릿지 플로우 (정책 관점):**

```
출발 체인 월렛 (Solana)
  |
  v
resolve('cross_swap', { fromChain: 'solana', toChain: 'base', ... })
  |                     <-- 출발 체인 context (walletId, policies)
  v
ContractCallRequest (출발 체인 트랜잭션)
  |
  v
Stage 3: Policy (출발 체인 월렛의 정책)
  - CONTRACT_WHITELIST: LI.FI Solana bridge program  [check]
  - SPENDING_LIMIT: fromAmount USD 환산 -> 4-tier 평가
  - toAddress 검증 (PLCY-04) <-- 추가 검증
  |
  v
Stage 4-6: 실행 (출발 체인 트랜잭션 전송)
  |
  v
BridgeStatusWorker: /status 폴링
  -> COMPLETED: SPENDING_LIMIT 예약 해제
  -> FAILED: SPENDING_LIMIT 예약 해제 + 알림
  -> TIMEOUT: 예약 유지 + BRIDGE_MONITORING 전환
```

#### PLCY-04: 도착 주소 변조 방지 검증 설계

Pitfall P7 (크로스체인 도착 주소 정책 바이패스) 방지를 위한 3단계 검증을 설계한다.

**위협 모델:**
AI 에이전트가 브릿지 요청 시 도착 주소를 공격자 주소로 지정할 수 있다. 정책 엔진은 출발 체인 트랜잭션만 평가하므로, 도착 주소가 브릿지 calldata 내부에 숨겨져 있어 정책 평가에서 보이지 않는다.

**3단계 도착 주소 검증:**

**1단계 - LI.FI quote에서 toAddress 추출 및 검증:**
```
LiFiActionProvider.resolve() 내부:
  const quote = await lifiClient.getQuote({ ..., fromAddress: ctx.walletAddress });

  // toAddress 추출
  const toAddress = quote.action.toAddress;

  // 검증 1: toAddress가 반드시 존재
  if (!toAddress) throw new WAIaaSError('BRIDGE_MISSING_DESTINATION');

  // 검증 2: toAddress가 동일 Owner의 월렛인지 확인
  const isOwnWallet = await walletService.isOwnedBySameOwner(
    ctx.walletId,  // 출발 월렛
    toAddress,      // 도착 주소
    quote.action.toChainId  // 도착 체인
  );
```

**2단계 - 정책 기반 분기:**
```
if (isOwnWallet) {
  // 자기 월렛으로 브릿지 -> 자동 허용
  // 이것이 기본 동작 (self-bridge)
} else {
  // 외부 주소로 브릿지 -> APPROVAL 필요
  // resolve() 결과에 requiresApproval: true 플래그 설정
  // Stage 4에서 Owner 승인 대기
}
```

**3단계 - calldata 내 도착 주소 일치 검증:**
```
// resolve()가 반환한 ContractCallRequest의 metadata에 toAddress 저장
// Stage 5 (execute) 전에 calldata 내 도착 주소와 metadata.toAddress 일치 확인
// (선택적 심층 검증 -- 구현 복잡도에 따라 Phase 2에서 결정)
```

**기본 정책: self-bridge only**
- 기본적으로 도착 주소 = 동일 Owner의 도착 체인 월렛 주소로 자동 설정한다
- LI.FI /quote 호출 시 fromAddress와 동일 Owner의 도착 체인 월렛을 toAddress로 지정한다
- 에이전트가 명시적으로 다른 주소를 지정할 경우 APPROVAL 티어로 격상한다
- Admin Settings에서 `allow_external_bridge_destination` (기본: false) 설정을 제공한다

**에러 코드:**
- `BRIDGE_MISSING_DESTINATION`: "도착 주소를 확인할 수 없습니다. self-bridge를 사용하세요."
- `BRIDGE_DESTINATION_NOT_OWNED`: "도착 주소가 이 Owner의 월렛이 아닙니다. Owner 승인이 필요합니다."

---

### 4. 비동기 상태 추적 패턴

크로스체인 브릿지(m28-03)와 unstake(m28-04)는 비동기 완료를 추적해야 한다. 공통 폴링 패턴을 설계한다.

#### 4.1 설계 범위

| 항목 | 내용 |
|------|------|
| 추적 대상 | 브릿지 전송 (수 분~수십 분), unstake 대기 (수 시간~수 일) |
| 추적 방식 | 폴링 기반 (외부 API /status 호출) |
| 폴링 간격 | 브릿지 30초, unstake 5분 (config.toml 오버라이드) |
| 최대 폴링 | 브릿지 60회 (30분), unstake 288회 (24시간) |
| 상태 전이 | PENDING → COMPLETED / FAILED / TIMEOUT |
| 알림 | 완료/실패/타임아웃 시 알림 발송 |
| DB 마이그레이션 | bridge_status(m28-03) + GAS_WAITING 상태(m28-05)를 단일 마이그레이션으로 통합 설계. **실행 시점: m28-03** (브릿지가 먼저 필요하므로 m28-03에서 통합 마이그레이션 적용, m28-05는 이미 추가된 GAS_WAITING 상태를 사용) |

#### 4.2 설계 산출물

- AsyncStatusTracker 공통 인터페이스
- 폴링 스케줄러 설계 (setInterval vs setTimeout 체인)
- transactions 테이블 bridge_status 컬럼 추가 + GAS_WAITING 상태 확장 통합 마이그레이션 설계
- 상태 전이 다이어그램

---

### 6. 안전성 설계 (확정)

> **상태:** 확정 설계 (2026-02-23)
> **요구사항:** SAFE-01, SAFE-02, SAFE-03, SAFE-04

#### SAFE-01: Jito MEV 보호 fail-closed 설계

핵심 원칙: **Jito 블록 엔진이 사용 불가능할 때, 절대로 공개 멤풀로 폴백하지 않는다.**

**설계 내용:**

1. JupiterSwapActionProvider는 config.toml의 `jito_block_engine_url` 설정 존재 시 Jito 경로를 사용한다
2. Jito 전송 실패 시 (연결 실패, 타임아웃, 거부):
   - 트랜잭션을 즉시 FAILED 처리
   - JITO_UNAVAILABLE 에러 코드 반환
   - **공개 RPC를 통한 재전송 시도 절대 금지**
3. Jito 가용성 추적:
   - 3회 연속 실패 시 JITO_DEGRADED 알림 발송
   - Jupiter 프로바이더를 자동 비활성화하지는 않음 (운영자 판단에 맡김)
   - 운영자가 Admin Settings에서 수동으로 Jito URL을 제거하면 공개 RPC로 전환 (이것은 명시적 선택)
4. Jupiter swap에 dynamicSlippage 사용:
   - Jupiter API의 dynamicSlippage 파라미터를 기본 활성화
   - 서버사이드에서 슬리피지를 자동 조정하여 샌드위치 공격 수익성을 최소화

**데이터 플로우:**

```
JupiterSwapActionProvider.resolve()
  |
  v
Jupiter API /swap-instructions (with dynamicSlippage)
  |
  v
ContractCallRequest + Jito tip instruction (if jito_block_engine_url configured)
  |
  v
SolanaAdapter.submitTransaction()
  |
  +-- jito_block_engine_url 존재 --> Jito Block Engine으로 전송
  |     |
  |     +-- 성공 --> SUBMITTED
  |     +-- 실패 --> FAILED (JITO_UNAVAILABLE), 공개 RPC 폴백 금지
  |
  +-- jito_block_engine_url 미설정 --> 공개 RPC로 전송 (MEV 보호 없음)
```

**Pitfall 대응 매핑:**
- Pitfall P2 (MEV/Frontrunning Exposure): fail-closed로 공개 멤풀 노출 제거
- dynamicSlippage로 샌드위치 수익성 최소화
- JITO_DEGRADED 알림으로 운영자가 상황을 인지하고 대응

#### SAFE-02: stETH vs wstETH 아키텍처 결정 -- wstETH 채택

Research에서 권장한 바와 같이, WAIaaS의 Lido 통합은 **wstETH(Wrapped stETH)를 기본으로 사용**한다.

**채택 근거:**

1. stETH는 리베이스 토큰 -- 잔고가 매일 자동 변경되어 캐시된 잔고가 즉시 stale해진다
2. stETH transfer()는 정수 나눗셈으로 1-2 wei 먼지(dust)가 남는 문제 (Lido core#442)
3. L2로 브릿지된 stETH는 리베이스가 중단되어 가치 하락
4. wstETH는 non-rebasing -- 잔고 안정, 정책 평가 정확, dust 없음

**wstETH 플로우 설계:**

```
=== Stake (ETH -> wstETH) ===
1. Lido submit(ETH) -> stETH 수령
2. stETH -> wstETH wrap (wstETH.wrap() 컨트랙트 호출)
3. wstETH를 월렛에 저장

=> BATCH 타입으로 2개 인스트럭션을 단일 트랜잭션으로 실행:
   [submit() + wrap()]

=== Unstake (wstETH -> ETH) ===
1. wstETH -> stETH unwrap (wstETH.unwrap() 호출)
2. stETH -> Withdrawal Queue requestWithdrawals()
3. UnstakeStatusWorker가 폴링 -> Claim 가능 시 claimWithdrawals()

=> Step 1+2: BATCH로 단일 트랜잭션
=> Step 3: 비동기 (AsyncStatusTracker)
```

**wstETH 컨트랙트 주소:**
- Ethereum mainnet: 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0

**잔액 추적:**
- wstETH 잔고를 직접 표시 (리베이스 없으므로 안정)
- USD 환산: wstETH -> stETH 환율 * ETH/USD 오라클 가격
- stETH:wstETH 환율은 wstETH.stEthPerToken() view 함수로 조회

**정책 평가:**
- SPENDING_LIMIT: wstETH 금액을 stETH 환산 -> ETH -> USD로 평가
- CONTRACT_WHITELIST: Lido stETH + wstETH + WithdrawalQueue 3개 주소 등록 필요

**PLCY-02 화이트리스트 번들 업데이트:**

기존 DEFI-03에서 정의한 Lido 번들을 업데이트한다:

| 주소 | 설명 |
|------|------|
| 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84 | stETH / Lido contract |
| 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0 | wstETH (Wrapped stETH) |
| 0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1 | WithdrawalQueueERC721 |

**m28-04 objective 업데이트 지시:**

m28-04-liquid-staking.md의 기술 결정 #7을 "wstETH 채택"으로 변경하라는 지시를 명시한다 (실제 수정은 구현 마일스톤에서 수행).

**Pitfall 대응 매핑:**
- Pitfall P5 (stETH Rebase): wstETH 채택으로 리베이스 문제 근본 해결
- Lido core#442 (1-2 wei dust): wstETH는 non-rebasing이므로 dust 미발생
- L2 브릿지 호환: wstETH는 L2에서도 가치 보존

#### SAFE-03: 가스 조건부 실행 시 stale calldata 재조회 패턴

**문제:** DeFi API 견적(calldata)은 30초 TTL을 가진다. GAS_WAITING 상태에서 수 시간 대기 후 가스 조건이 충족되면, 원래의 calldata는 만료되어 온체인 실행 시 실패한다 (Pitfall P6).

**re-resolve 패턴 설계:**

**1. GAS_WAITING 진입 시 저장하는 데이터:**

```typescript
// bridge_metadata에 저장
{
  tracker: 'gas-condition',
  providerName: 'jupiter_swap',  // ActionProvider 이름
  actionName: 'swap',             // 액션 이름
  originalParams: {               // resolve()에 전달된 원본 파라미터
    inputMint: 'So11...',
    outputMint: 'EPjFW...',
    amount: '1000000000',
    slippageBps: 50,
  },
  gasCondition: {
    maxGasPrice: '30000000000',
    timeout: 3600,
  },
  quoteTimestamp: 1709123456000,  // 원래 견적 시각
  pollCount: 0,
  lastPolledAt: null,
  createdAt: 1709123456000,
}
```

**2. GasConditionWorker가 조건 충족 감지 시:**

```
GasConditionWorker.onConditionMet(txId)
  |
  v
1. bridge_metadata에서 providerName + actionName + originalParams 추출
  |
  v
2. ActionProviderRegistry.executeResolve(providerName, actionName, originalParams, context)
   -> 새로운 ContractCallRequest 획득 (신선한 calldata)
  |
  v
3. 기존 transactions 레코드 업데이트:
   - status: GAS_WAITING -> QUEUED (파이프라인 재진입)
   - request 필드를 새 ContractCallRequest로 교체
  |
  v
4. 파이프라인 Stage 4 (Wait)부터 재개
   -> Stage 5 (Execute): 새 calldata로 빌드/서명/전송
```

**3. re-resolve 실패 처리:**
- API 에러: CANCELLED + QUOTE_EXPIRED 에러 코드
- 가격 영향 초과: CANCELLED + PRICE_IMPACT_TOO_HIGH
- re-resolve 후 정책 재평가는 불필요 (이미 Stage 3 통과)
- 금액 변동이 큰 경우 (>5%): 경고 알림 발송 후 실행 계속 (reject하면 사용자 경험 저하)

**4. Per-wallet 가스 대기 제한:**
- 전역: max_pending_count (기본 100)
- Per-wallet: max_per_wallet (기본 5) -- 한 월렛이 가스 대기 슬롯을 독점하는 것을 방지
- 초과 시: GAS_CONDITION_LIMIT_EXCEEDED 에러 반환

**5. EVM nonce 순차 처리:**
- 동일 월렛의 GAS_WAITING 트랜잭션이 동시에 조건 충족 시, 생성 순서대로 순차 처리
- per-wallet lock으로 GAS_WAITING -> QUEUED 전이를 직렬화
- 앞선 트랜잭션의 re-resolve가 실패하면 후속 트랜잭션도 대기 유지 (nonce gap 방지)

**Pitfall 대응 매핑:**
- Pitfall P6 (Gas Condition Nonce Starvation): re-resolve로 stale calldata 문제 해결, per-wallet lock으로 nonce gap 방지
- Per-wallet 제한으로 슬롯 독점 방지

#### SAFE-04: 외부 API 드리프트 대응 전략

모든 외부 DeFi API(Jupiter, 0x, LI.FI)는 스키마 변경 없이 응답 구조가 변경될 수 있다. WAIaaS는 API 변경 시 **안전하게 실패**해야 한다.

**3중 방어 설계:**

**1. Zod strict 검증:**
- 모든 API 응답에 `schema.parse(data)` 적용 (이미 APIC-01 ActionApiClient에서 확정)
- strict mode 사용하지 않음 -- 새 필드 추가는 허용 (breaking이 아님)
- 필수 필드 누락 시 ZodError -> ChainError('ACTION_API_ERROR') -> WAIaaSError 전파
- Zod 에러 메시지에 누락된 필드명을 포함하여 디버깅 용이하게

**2. 버전 고정:**
- config.toml의 `api_base_url`에 버전이 포함된 URL을 사용
- Jupiter: `https://api.jup.ag/swap/v1` (v1 고정)
- 0x: `https://api.0x.org` (v2 unified, chainId 파라미터로 라우팅)
- LI.FI: `https://li.quest/v1` (v1 고정)
- URL 리디렉트 자동 추적 금지: `fetch({ redirect: 'error' })` 또는 `redirect: 'manual'`로 설정하여 API가 새 URL로 리디렉트 시 즉시 에러

**3. 실패 로깅:**
- 첫 성공 호출 시 raw response를 DEBUG 로그에 기록 (스키마 검증 통과 확인)
- Zod 검증 실패 시:
  a. raw response body를 WARNING 로그에 기록
  b. ZodError의 `issues` 배열을 구조화하여 로그에 포함
  c. 해당 프로바이더의 연속 실패 카운터 증가
  d. 3회 연속 Zod 실패 시: API_SCHEMA_DRIFT 알림 발송 (운영자에게 API 변경 알림)
- 주간 CI 건강 체크 권장: [HUMAN] 태그로 실제 API 호출 + Zod 검증 테스트

**ActionApiClient 확장 -- redirect 제어 + 실패 로깅:**

```typescript
// ActionApiClient.get() / post()에 추가할 설계 요소:
// 1. fetch 옵션에 redirect: 'error' 추가
// 2. 첫 성공 시 DEBUG 로그 기록 (per-provider 플래그로 1회만)
// 3. Zod 실패 시 WARNING 로그 + 연속 실패 카운터
// 4. 3회 연속 실패 시 API_SCHEMA_DRIFT 알림

const res = await fetch(url.toString(), {
  signal: controller.signal,
  headers: this.headers,
  redirect: 'error',  // URL 리디렉트 자동 추적 금지
});
```

**RPC 실패 시 가스 조건 대응 (SAFE-04 보조):**

Pitfall P14 대응: RPC 실패 시 가스 조건 타임아웃 시계를 일시 정지한다.

- effectiveWaitTime 추적: `총 경과 시간 - RPC 장애 시간 = 유효 대기 시간`
- bridge_metadata에 `rpcFailureSeconds` 필드 추가하여 RPC 장애 시간을 누적 기록
- 타임아웃 판정: effectiveWaitTime > gasCondition.timeout 일 때만 CANCELLED
- 이 설계로 transient RPC 장애가 트랜잭션 취소로 이어지지 않음

**effectiveWaitTime 계산:**

```
effectiveWaitTime = (Date.now() - createdAt) / 1000 - rpcFailureSeconds

if (effectiveWaitTime > gasCondition.timeout) {
  // 실제로 가스를 체크할 수 있었던 시간이 타임아웃을 초과
  cancel(txId, 'GAS_CONDITION_TIMEOUT');
}
```

**Pitfall 대응 매핑:**
- Pitfall P1 (Jupiter API Version Drift): Zod 검증 + 버전 고정으로 API 변경 감지
- Pitfall P14 (RPC Failure Cascading Timeouts): effectiveWaitTime으로 RPC 장애 시간 제외
- API_SCHEMA_DRIFT 알림으로 운영자가 API 변경을 사전에 인지

---

### 5. 테스트 전략

4개 프로토콜 공통의 테스트 패턴을 설계한다.

#### 5.1 설계 범위

| 항목 | 내용 |
|------|------|
| 단위 테스트 | mock 외부 API 응답 → resolve() → ContractCallRequest 검증 |
| 통합 테스트 | mock API + mock ChainAdapter → 파이프라인 실행 → 상태 전이 |
| 정책 테스트 | CONTRACT_WHITELIST / SPENDING_LIMIT 연동 검증 |
| MCP 테스트 | 프로바이더 등록 → MCP tool 목록 자동 노출 |
| 외부 API 실 호출 | [HUMAN] 태그 — Devnet/Testnet에서 수동 검증 |

#### 5.2 설계 산출물

- mock API 응답 픽스처 공통 구조
- 프로바이더 테스트 헬퍼 (createMockApiResponse, assertContractCallRequest)
- 4개 프로토콜 × 공통 시나리오 매트릭스

---

## 신규 산출물

| ID | 산출물 | 설명 |
|----|--------|------|
| DEFI-01 | packages/actions/ 구조 설계 | 디렉토리, config 패턴, 프로바이더 로딩 |
| DEFI-02 | REST → calldata 공통 패턴 | API Client, 슬리피지, 에러 코드 |
| DEFI-03 | 정책 연동 설계 | CONTRACT_WHITELIST, SPENDING_LIMIT, 크로스체인 |
| DEFI-04 | 비동기 상태 추적 설계 | AsyncStatusTracker, 폴링, 상태 전이, DB 마이그레이션 통합 계획 |
| DEFI-05 | 테스트 전략 | mock 패턴, 테스트 매트릭스 |

### 산출물 → 구현 마일스톤 매핑

| 산출물 | 소비 마일스톤 | 설명 |
|--------|-------------|------|
| DEFI-01 | m28-01 | packages/actions/ 패키지 스캐폴딩, 내장 프로바이더 로딩 구현 |
| DEFI-02 | m28-01, m28-02, m28-03 | ActionApiClient 베이스 패턴을 각 프로바이더에서 구현 |
| DEFI-03 | m28-01, m28-02, m28-03, m28-04 | CONTRACT_WHITELIST/SPENDING_LIMIT 연동을 각 프로바이더에서 구현 |
| DEFI-04 | m28-03, m28-04, m28-05 | AsyncStatusTracker 공통 인터페이스를 브릿지/unstake/가스대기에서 구현. DB 통합 마이그레이션은 m28-03에서 실행 |
| DEFI-05 | m28-01, m28-02, m28-03, m28-04 | mock API 패턴, 테스트 헬퍼를 각 프로바이더 테스트에서 활용 |

---

## 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 62 (action-provider-architecture) | 내장 프로바이더 패키지 구조, config 패턴 추가 |
| 63 (swap-action-spec) | 공통 패턴으로 리팩터링 |
| 37 (rest-api) | ACTION_API_ERROR 등 에러 코드 추가 |
| 33 (policy) | ActionProvider 정책 연동 플로우 |
| 35 (notification) | 비동기 완료/실패 알림 이벤트 |

---

## 성공 기준

1. 4개 프로토콜의 공통 설계 요소가 일관된 패턴으로 정의됨
2. packages/actions/ 구조가 확정되어 m28-01에서 바로 구현 가능
3. 정책 연동 규칙이 명확하여 구현 시 모호함 없음
4. 비동기 상태 추적 패턴이 브릿지/unstake 양쪽에 재사용 가능
5. 테스트 전략이 4개 프로토콜에 일관되게 적용 가능

---

*생성일: 2026-02-15*
*범위: 설계 마일스톤 — 코드 구현은 m28-01~m28-04에서 수행*
*선행: v1.5 (Action Provider 프레임워크 + 가격 오라클)*
*관련: 설계 문서 62 (action-provider-architecture), 63 (swap-action-spec)*
