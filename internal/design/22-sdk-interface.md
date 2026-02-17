# SDK 인터페이스 설계 (API-05)

**문서 ID:** API-05
**작성일:** 2026-02-05
**상태:** 완료
**참조:** API-02 (인증 모델), API-03 (권한/정책 모델), API-04 (에러 코드), ARCH-03 (트랜잭션 플로우), REL-01~REL-05 (소유자-에이전트 관계)

---

## 1. 개요: SDK 설계 원칙

### 1.1 설계 기반

WAIaaS SDK는 Azure SDK Guidelines와 Stripe SDK 패턴을 기반으로 설계한다. REST API(21-openapi-spec.md) 위에 편의 계층(convenience layer)을 제공하여 HTTP 세부사항을 완전히 추상화한다.

### 1.2 핵심 원칙

| 원칙 | 설명 | 근거 |
|------|------|------|
| **HTTP 완전 추상화** | URL 구성, 헤더 설정, 상태 코드 해석을 SDK 내부에서 처리 | SDK 사용자가 fetch/axios를 직접 다루지 않음 |
| **일관된 동사 접두사** | create/get/list/update/delete로 CRUD 통일 | Stripe, Azure 공통 패턴. 예측 가능한 API |
| **Options Bag 패턴** | 모든 메서드에 단일 옵션 객체 사용 | positional args 순서 혼동 방지, 선택 필드 자연스럽게 표현 |
| **자동 페이지네이션** | PagedAsyncIterableIterator로 커서 관리 은닉 | 사용자가 cursor token을 직접 관리하지 않음 |
| **타입 안전** | TypeScript 전체 타입, Python typing 모듈 활용 | IDE 자동완성, 컴파일 타임 오류 감지 |
| **에러 타입 계층** | WaiassError 기반 도메인별 에러 클래스 | instanceof/except로 세밀한 에러 처리 |

### 1.3 안티패턴

SDK 사용자에게 다음을 노출하지 않는다:

- URL 조합 (`/api/v1/agents/${agentId}/balance` 등)
- HTTP 헤더 설정 (`x-api-key`, `Authorization` 등)
- 페이지네이션 토큰 관리 (`cursor`, `nextPageToken` 등)
- Content-Type 지정 (`application/json` 등)
- HTTP 상태 코드 직접 해석

### 1.4 SDK와 OpenAPI 스펙의 관계

SDK 인터페이스는 OpenAPI 스펙(21-openapi-spec.md)의 수동 설계 래퍼이다. 구현 시 OpenAPI 스펙에서 타입을 자동 추론(openapi-typescript 등)할 수 있으나, 메서드 시그니처와 편의 패턴은 수동 설계한다.

---

## 2. TypeScript SDK 인터페이스

### 2.1 WaiassClient (진입점)

```typescript
import { WaiassClient } from '@waiass/sdk';

// 생성
const client = new WaiassClient('wai_live_xxx', {
  network: 'mainnet',      // 'mainnet' | 'devnet' | 'testnet'
  timeoutInMs: 30_000,     // 기본 30초
});

// Sub-client 접근
client.agents        // AgentsClient
client.transactions  // TransactionsClient
client.owner         // OwnerClient
client.webhooks      // WebhooksClient
client.auth          // AuthClient
```

```typescript
class WaiassClient {
  constructor(apiKey: string, options?: WaiassClientOptions);

  readonly agents: AgentsClient;
  readonly transactions: TransactionsClient;
  readonly owner: OwnerClient;
  readonly webhooks: WebhooksClient;
  readonly auth: AuthClient;
}

interface WaiassClientOptions {
  /** API 서버 URL. 기본: https://api.waiass.io/api/v1 */
  baseUrl?: string;

  /** Solana 네트워크. 기본: 'mainnet' */
  network?: 'mainnet' | 'devnet' | 'testnet';

  /** 요청 타임아웃 (ms). 기본: 30000 */
  timeoutInMs?: number;

  /** 재시도 옵션 */
  retryOptions?: RetryOptions;

  /** 로거 인스턴스 (선택) */
  logger?: Logger;
}

interface RetryOptions {
  /** 최대 재시도 횟수. 기본: 3 */
  maxRetries?: number;

  /** 초기 대기 시간 (ms). 기본: 1000 */
  initialDelayMs?: number;

  /** 대기 시간 배수. 기본: 2 */
  backoffMultiplier?: number;

  /** retryable 에러만 재시도 여부. 기본: true */
  retryOnlyRetryable?: boolean;
}

interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}
```

### 2.2 AgentsClient (에이전트 관리)

```typescript
interface AgentsClient {
  // === CRUD ===
  createAgent(options: CreateAgentOptions): Promise<Agent>;
  getAgent(agentId: string): Promise<Agent>;
  listAgents(options?: ListAgentsOptions): PagedAsyncIterableIterator<Agent>;
  updateAgent(agentId: string, options: UpdateAgentOptions): Promise<Agent>;
  deleteAgent(agentId: string): Promise<void>;

  // === 상태 관리 ===
  suspendAgent(agentId: string, options?: SuspendOptions): Promise<Agent>;
  resumeAgent(agentId: string): Promise<Agent>;

  // === 키 관리 ===
  rotateKey(agentId: string): Promise<KeyRotationResult>;

  // === 자금 관리 ===
  getBalance(agentId: string): Promise<Balance>;
  fund(agentId: string, options: FundOptions): Promise<FundingResult>;
  withdraw(agentId: string, options?: WithdrawOptions): Promise<WithdrawalResult>;

  // === 정책 관리 ===
  getPolicy(agentId: string): Promise<AgentPolicy>;
  updatePolicy(agentId: string, policy: UpdatePolicyOptions): Promise<AgentPolicy>;
  getPolicyUsage(agentId: string): Promise<PolicyUsage>;
}
```

**Options 및 반환 타입:**

```typescript
// === 에이전트 생성 ===
interface CreateAgentOptions {
  /** 에이전트 별칭 */
  nickname: string;

  /** 예산 설정 */
  budgetConfig: {
    /** 건당 한도 (lamports) */
    perTransactionLimit: string;
    /** 일일 한도 (lamports) */
    dailyLimit: string;
    /** 주간 한도 (lamports) */
    weeklyLimit?: string;
    /** 월간 한도 (lamports) */
    monthlyLimit?: string;
  };

  /** 화이트리스트 설정 (선택) */
  whitelist?: {
    allowedDestinations?: string[];
    allowedPrograms?: string[];
    allowedTokenMints?: string[];
  };

  /** 시간 제어 (선택) */
  timeControl?: {
    operatingHoursUtc?: { start: number; end: number };
    blackoutDates?: string[];
  };

  /** 에스컬레이션 설정 (선택) */
  escalation?: {
    thresholds?: {
      low?: string;
      medium?: string;
      high?: string;
      critical?: string;
    };
  };

  /** 자동 보충 설정 (선택) */
  replenishment?: {
    mode: 'manual' | 'threshold' | 'periodic';
    thresholdAmount?: string;
    scheduleInterval?: string;
    maxDailyReplenishments?: number;
  };

  /** 추가 메타데이터 (선택) */
  metadata?: Record<string, string>;
}

// === 에이전트 ===
interface Agent {
  id: string;                // agt_xxx
  nickname: string;
  status: AgentStatus;
  walletAddress: string;     // Vault PDA 주소
  multisigAddress: string;   // Squads 멀티시그 주소
  createdAt: string;         // ISO 8601
  updatedAt: string;
  metadata: Record<string, string>;
}

type AgentStatus = 'CREATING' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATING' | 'TERMINATED';

// === 목록 조회 ===
interface ListAgentsOptions {
  /** 상태 필터 */
  status?: AgentStatus;
  /** 페이지 크기. 기본: 20, 최대: 100 */
  maxPageSize?: number;
}

// === 정보 수정 ===
interface UpdateAgentOptions {
  nickname?: string;
  metadata?: Record<string, string>;
}

// === 정지 ===
interface SuspendOptions {
  reason?: string;
}

// === 키 로테이션 ===
interface KeyRotationResult {
  agentId: string;
  status: 'completed';
  rotatedAt: string;
}

// === 잔액 ===
interface Balance {
  agentId: string;
  sol: string;             // lamports
  tokens: TokenBalance[];
}

interface TokenBalance {
  mint: string;            // 토큰 민트 주소
  symbol: string;          // USDC, USDT 등
  amount: string;          // 최소 단위
  decimals: number;
}

// === 자금 충전 ===
interface FundOptions {
  /** 충전 금액 (lamports) */
  amount: string;
  /** 충전할 토큰 민트 (SOL이면 생략) */
  mint?: string;
}

interface FundingResult {
  agentId: string;
  amount: string;
  txSignature: string;
  status: 'confirmed' | 'pending';
}

// === 자금 회수 ===
interface WithdrawOptions {
  /** 회수 금액 (lamports). 생략 시 전액 회수 */
  amount?: string;
  /** 회수 목적지. 기본: 소유자 지갑 */
  destination?: string;
}

interface WithdrawalResult {
  agentId: string;
  amount: string;
  destination: string;
  txSignature: string;
  status: 'confirmed' | 'pending';
}

// === 정책 ===
interface AgentPolicy {
  agentId: string;
  limits: {
    perTransaction: string;
    daily: string;
    weekly: string;
    monthly: string;
  };
  whitelist: {
    allowedDestinations: string[];
    allowedPrograms: string[];
    allowedTokenMints: string[];
  };
  timeControl: {
    operatingHoursUtc: { start: number; end: number } | null;
    blackoutDates: string[];
  };
  escalation: {
    thresholds: {
      low: string;
      medium: string;
      high: string;
      critical: string;
    };
  };
  updatedAt: string;
}

interface UpdatePolicyOptions {
  limits?: Partial<AgentPolicy['limits']>;
  whitelist?: Partial<AgentPolicy['whitelist']>;
  timeControl?: Partial<AgentPolicy['timeControl']>;
  escalation?: Partial<AgentPolicy['escalation']>;
}

// === 정책 사용량 ===
interface PolicyUsage {
  agentId: string;
  daily: { used: string; limit: string; remaining: string; resetsAt: string };
  weekly: { used: string; limit: string; remaining: string; resetsAt: string };
  monthly: { used: string; limit: string; remaining: string; resetsAt: string };
  lastTransactionAt: string | null;
}
```

### 2.3 TransactionsClient (트랜잭션)

```typescript
interface TransactionsClient {
  executeTransaction(options: ExecuteTransactionOptions): Promise<TransactionResult>;
  getTransaction(txId: string): Promise<Transaction>;
  listTransactions(
    agentId: string,
    options?: ListTransactionsOptions
  ): PagedAsyncIterableIterator<Transaction>;
}
```

**Options 및 반환 타입:**

```typescript
// === 트랜잭션 실행 ===
interface ExecuteTransactionOptions {
  /** 실행 에이전트 ID */
  agentId: string;
  /** 목적지 주소 */
  to: string;
  /** 금액 (lamports) */
  amount: string;
  /** 토큰 민트 주소 (SOL이면 생략) */
  mint?: string;
  /** 멱등성 키 (중복 제출 방지) */
  idempotencyKey?: string;
  /** 메모 (선택) */
  memo?: string;
}

interface TransactionResult {
  id: string;              // tx_xxx
  agentId: string;
  status: TransactionStatus;
  txSignature: string | null;   // 온체인 서명 (pending이면 null)
  amount: string;
  to: string;
  mint: string | null;
  createdAt: string;
}

type TransactionStatus =
  | 'pending'        // 서버 접수
  | 'signing'        // Enclave 서명 중
  | 'submitted'      // 온체인 제출됨
  | 'confirmed'      // 온체인 확정
  | 'failed'         // 실패
  | 'expired';       // blockhash 만료

// === 트랜잭션 상세 ===
interface Transaction {
  id: string;
  agentId: string;
  status: TransactionStatus;
  txSignature: string | null;
  amount: string;
  to: string;
  mint: string | null;
  memo: string | null;
  idempotencyKey: string | null;
  policyCheckResult: {
    passed: boolean;
    checkedLimits: string[];
    escalationLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  };
  createdAt: string;
  confirmedAt: string | null;
  failureReason: string | null;
}

// === 거래 내역 조회 ===
interface ListTransactionsOptions {
  /** 상태 필터 */
  status?: TransactionStatus;
  /** 시작 시점 (ISO 8601) */
  startDate?: string;
  /** 종료 시점 (ISO 8601) */
  endDate?: string;
  /** 페이지 크기. 기본: 20, 최대: 100 */
  maxPageSize?: number;
}
```

### 2.4 OwnerClient (소유자)

```typescript
interface OwnerClient {
  // === 대시보드 ===
  getDashboard(): Promise<OwnerDashboard>;
  listAgentSummaries(
    options?: ListOptions
  ): PagedAsyncIterableIterator<AgentSummary>;

  // === 전역 예산 ===
  getGlobalBudget(): Promise<GlobalBudgetLimit>;
  updateGlobalBudget(
    options: UpdateGlobalBudgetOptions
  ): Promise<GlobalBudgetLimit>;

  // === 에이전트 간 자금 이동 ===
  transferFunds(options: TransferFundsOptions): Promise<TransferResult>;

  // === 비상 조치 ===
  emergencySuspendAll(): Promise<BatchOperationResult>;
  emergencySuspend(
    agentId: string,
    options?: EmergencyOptions
  ): Promise<Agent>;
  emergencyRecover(
    agentId: string,
    options?: RecoveryOptions
  ): Promise<RecoveryResult>;
}
```

**Options 및 반환 타입:**

```typescript
// === 대시보드 ===
interface OwnerDashboard {
  totalAgents: number;
  agentsByStatus: Record<AgentStatus, number>;
  totalBalance: { sol: string; usd: string | null };
  dailySpending: { used: string; limit: string };
  recentTransactions: Transaction[];
  alerts: Alert[];
}

interface Alert {
  id: string;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  agentId: string | null;
  createdAt: string;
}

// === 에이전트 요약 ===
interface AgentSummary {
  id: string;
  nickname: string;
  status: AgentStatus;
  balance: { sol: string };
  dailyUsage: { used: string; limit: string };
  lastTransactionAt: string | null;
}

interface ListOptions {
  maxPageSize?: number;
}

// === 전역 예산 ===
interface GlobalBudgetLimit {
  dailyLimit: string;
  weeklyLimit: string;
  monthlyLimit: string;
  currentUsage: {
    daily: string;
    weekly: string;
    monthly: string;
  };
}

interface UpdateGlobalBudgetOptions {
  dailyLimit?: string;
  weeklyLimit?: string;
  monthlyLimit?: string;
}

// === 자금 이동 ===
interface TransferFundsOptions {
  fromAgentId: string;
  toAgentId: string;
  amount: string;
  mint?: string;
}

interface TransferResult {
  fromAgentId: string;
  toAgentId: string;
  amount: string;
  txSignature: string;
  status: 'confirmed' | 'pending';
}

// === 비상 ===
interface EmergencyOptions {
  reason?: string;
}

interface RecoveryOptions {
  /** 회수 목적지. 기본: recoveryDestination 사전 등록 주소 */
  destination?: string;
  /** 전액 회수 여부. 기본: true */
  fullRecovery?: boolean;
}

interface RecoveryResult {
  agentId: string;
  recoveredAmount: string;
  destination: string;
  txSignature: string;
  status: 'confirmed' | 'pending';
}

interface BatchOperationResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{
    agentId: string;
    status: 'suspended' | 'failed';
    error?: string;
  }>;
}
```

### 2.5 WebhooksClient (웹훅)

```typescript
interface WebhooksClient {
  createWebhook(options: CreateWebhookOptions): Promise<Webhook>;
  listWebhooks(): Promise<Webhook[]>;
  deleteWebhook(webhookId: string): Promise<void>;
  testWebhook(webhookId: string): Promise<WebhookTestResult>;
}
```

**Options 및 반환 타입:**

```typescript
interface CreateWebhookOptions {
  /** 수신 URL (HTTPS 필수) */
  url: string;
  /** 구독할 이벤트 타입 */
  events: WebhookEventType[];
  /** 웹훅 별칭 (선택) */
  name?: string;
}

type WebhookEventType =
  | 'transaction.pending'
  | 'transaction.confirmed'
  | 'transaction.failed'
  | 'agent.created'
  | 'agent.suspended'
  | 'agent.terminated'
  | 'policy.violated'
  | 'emergency.triggered'
  | 'funding.completed'
  | 'funding.failed';

interface Webhook {
  id: string;              // whk_xxx
  url: string;
  events: WebhookEventType[];
  name: string | null;
  signingSecret: string;   // HMAC-SHA256 검증용 (생성 시에만 반환)
  isActive: boolean;
  createdAt: string;
}

interface WebhookTestResult {
  webhookId: string;
  responseStatus: number;
  success: boolean;
  deliveredAt: string;
}
```

### 2.6 AuthClient (인증 관리)

```typescript
interface AuthClient {
  createKey(options: CreateKeyOptions): Promise<ApiKeyResponse>;
  listKeys(): Promise<ApiKeyListItem[]>;
  revokeKey(keyId: string): Promise<void>;
}
```

**Options 및 반환 타입:**

```typescript
interface CreateKeyOptions {
  /** 키 별칭 */
  name: string;
  /** 허용 스코프 */
  scopes: ApiScope[];
  /** IP 화이트리스트 (CIDR) */
  ipWhitelist?: string[];
  /** 만료 시점 (ISO 8601, 생략 시 무기한) */
  expiresAt?: string;
}

type ApiScope =
  | 'agents:read'
  | 'agents:write'
  | 'agents:delete'
  | 'transactions:read'
  | 'transactions:execute'
  | 'wallets:read'
  | 'wallets:fund'
  | 'policies:read'
  | 'policies:write'
  | 'dashboard:read'
  | 'admin:all';

interface ApiKeyResponse {
  id: string;              // key_xxx
  key: string;             // wai_live_xxx (이 시점에만 노출!)
  prefix: string;          // wai_live_ | wai_test_
  name: string;
  scopes: ApiScope[];
  expiresAt: string | null;
  createdAt: string;
}

interface ApiKeyListItem {
  id: string;
  prefix: string;
  name: string;
  scopes: ApiScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}
```

---

## 3. Python SDK 인터페이스

### 3.1 동기(Sync) + 비동기(Async) 이중 제공

```python
# 동기 클라이언트
from waiass import WaiassClient
client = WaiassClient(api_key="wai_live_xxx")

# 비동기 클라이언트
from waiass import AsyncWaiassClient
client = AsyncWaiassClient(api_key="wai_live_xxx")
```

### 3.2 WaiassClient (진입점)

```python
from typing import Optional
from waiass.types import ClientOptions, RetryOptions

class WaiassClient:
    """WAIaaS 동기 클라이언트. Python 3.10+ 지원."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = "https://api.waiass.io/api/v1",
        network: str = "mainnet",    # "mainnet" | "devnet" | "testnet"
        timeout: float = 30.0,       # 초 단위
        retry_options: Optional[RetryOptions] = None,
    ) -> None: ...

    @property
    def agents(self) -> AgentsClient: ...

    @property
    def transactions(self) -> TransactionsClient: ...

    @property
    def owner(self) -> OwnerClient: ...

    @property
    def webhooks(self) -> WebhooksClient: ...

    @property
    def auth(self) -> AuthClient: ...


class AsyncWaiassClient:
    """WAIaaS 비동기 클라이언트. asyncio 기반."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = "https://api.waiass.io/api/v1",
        network: str = "mainnet",
        timeout: float = 30.0,
        retry_options: Optional[RetryOptions] = None,
    ) -> None: ...

    @property
    def agents(self) -> AsyncAgentsClient: ...

    @property
    def transactions(self) -> AsyncTransactionsClient: ...

    @property
    def owner(self) -> AsyncOwnerClient: ...

    @property
    def webhooks(self) -> AsyncWebhooksClient: ...

    @property
    def auth(self) -> AsyncAuthClient: ...
```

### 3.3 AgentsClient

```python
from typing import Optional
from waiass.types import (
    Agent, Balance, AgentPolicy, PolicyUsage,
    FundingResult, WithdrawalResult, KeyRotationResult,
    CreateAgentParams, UpdateAgentParams, UpdatePolicyParams,
    FundParams, WithdrawParams, SuspendParams,
)
from waiass.pagination import SyncPaginator, AsyncPaginator


class AgentsClient:
    """에이전트 관리 (동기)."""

    def create(
        self,
        *,
        nickname: str,
        budget_config: dict,
        whitelist: Optional[dict] = None,
        time_control: Optional[dict] = None,
        escalation: Optional[dict] = None,
        replenishment: Optional[dict] = None,
        metadata: Optional[dict[str, str]] = None,
    ) -> Agent: ...

    def get(self, agent_id: str) -> Agent: ...

    def list(
        self,
        *,
        status: Optional[str] = None,
        max_page_size: int = 20,
    ) -> SyncPaginator[Agent]: ...

    def update(
        self,
        agent_id: str,
        *,
        nickname: Optional[str] = None,
        metadata: Optional[dict[str, str]] = None,
    ) -> Agent: ...

    def delete(self, agent_id: str) -> None: ...

    def suspend(
        self,
        agent_id: str,
        *,
        reason: Optional[str] = None,
    ) -> Agent: ...

    def resume(self, agent_id: str) -> Agent: ...

    def rotate_key(self, agent_id: str) -> KeyRotationResult: ...

    def get_balance(self, agent_id: str) -> Balance: ...

    def fund(
        self,
        agent_id: str,
        *,
        amount: str,
        mint: Optional[str] = None,
    ) -> FundingResult: ...

    def withdraw(
        self,
        agent_id: str,
        *,
        amount: Optional[str] = None,
        destination: Optional[str] = None,
    ) -> WithdrawalResult: ...

    def get_policy(self, agent_id: str) -> AgentPolicy: ...

    def update_policy(
        self,
        agent_id: str,
        *,
        limits: Optional[dict] = None,
        whitelist: Optional[dict] = None,
        time_control: Optional[dict] = None,
        escalation: Optional[dict] = None,
    ) -> AgentPolicy: ...

    def get_policy_usage(self, agent_id: str) -> PolicyUsage: ...


class AsyncAgentsClient:
    """에이전트 관리 (비동기)."""

    async def create(
        self,
        *,
        nickname: str,
        budget_config: dict,
        whitelist: Optional[dict] = None,
        time_control: Optional[dict] = None,
        escalation: Optional[dict] = None,
        replenishment: Optional[dict] = None,
        metadata: Optional[dict[str, str]] = None,
    ) -> Agent: ...

    async def get(self, agent_id: str) -> Agent: ...

    def list(
        self,
        *,
        status: Optional[str] = None,
        max_page_size: int = 20,
    ) -> AsyncPaginator[Agent]: ...

    async def update(
        self,
        agent_id: str,
        *,
        nickname: Optional[str] = None,
        metadata: Optional[dict[str, str]] = None,
    ) -> Agent: ...

    async def delete(self, agent_id: str) -> None: ...

    async def suspend(
        self,
        agent_id: str,
        *,
        reason: Optional[str] = None,
    ) -> Agent: ...

    async def resume(self, agent_id: str) -> Agent: ...

    async def rotate_key(self, agent_id: str) -> KeyRotationResult: ...

    async def get_balance(self, agent_id: str) -> Balance: ...

    async def fund(
        self,
        agent_id: str,
        *,
        amount: str,
        mint: Optional[str] = None,
    ) -> FundingResult: ...

    async def withdraw(
        self,
        agent_id: str,
        *,
        amount: Optional[str] = None,
        destination: Optional[str] = None,
    ) -> WithdrawalResult: ...

    async def get_policy(self, agent_id: str) -> AgentPolicy: ...

    async def update_policy(
        self,
        agent_id: str,
        *,
        limits: Optional[dict] = None,
        whitelist: Optional[dict] = None,
        time_control: Optional[dict] = None,
        escalation: Optional[dict] = None,
    ) -> AgentPolicy: ...

    async def get_policy_usage(self, agent_id: str) -> PolicyUsage: ...
```

### 3.4 TransactionsClient

```python
from typing import Optional
from waiass.types import Transaction, TransactionResult
from waiass.pagination import SyncPaginator, AsyncPaginator


class TransactionsClient:
    """트랜잭션 관리 (동기)."""

    def execute(
        self,
        *,
        agent_id: str,
        to: str,
        amount: str,
        mint: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        memo: Optional[str] = None,
    ) -> TransactionResult: ...

    def get(self, tx_id: str) -> Transaction: ...

    def list(
        self,
        agent_id: str,
        *,
        status: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        max_page_size: int = 20,
    ) -> SyncPaginator[Transaction]: ...


class AsyncTransactionsClient:
    """트랜잭션 관리 (비동기)."""

    async def execute(
        self,
        *,
        agent_id: str,
        to: str,
        amount: str,
        mint: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        memo: Optional[str] = None,
    ) -> TransactionResult: ...

    async def get(self, tx_id: str) -> Transaction: ...

    def list(
        self,
        agent_id: str,
        *,
        status: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        max_page_size: int = 20,
    ) -> AsyncPaginator[Transaction]: ...
```

### 3.5 OwnerClient

```python
from typing import Optional
from waiass.types import (
    OwnerDashboard, AgentSummary, GlobalBudgetLimit,
    TransferResult, RecoveryResult, BatchOperationResult, Agent,
)
from waiass.pagination import SyncPaginator, AsyncPaginator


class OwnerClient:
    """소유자 관리 (동기)."""

    def get_dashboard(self) -> OwnerDashboard: ...

    def list_agent_summaries(
        self,
        *,
        max_page_size: int = 20,
    ) -> SyncPaginator[AgentSummary]: ...

    def get_global_budget(self) -> GlobalBudgetLimit: ...

    def update_global_budget(
        self,
        *,
        daily_limit: Optional[str] = None,
        weekly_limit: Optional[str] = None,
        monthly_limit: Optional[str] = None,
    ) -> GlobalBudgetLimit: ...

    def transfer_funds(
        self,
        *,
        from_agent_id: str,
        to_agent_id: str,
        amount: str,
        mint: Optional[str] = None,
    ) -> TransferResult: ...

    def emergency_suspend_all(self) -> BatchOperationResult: ...

    def emergency_suspend(
        self,
        agent_id: str,
        *,
        reason: Optional[str] = None,
    ) -> Agent: ...

    def emergency_recover(
        self,
        agent_id: str,
        *,
        destination: Optional[str] = None,
        full_recovery: bool = True,
    ) -> RecoveryResult: ...


class AsyncOwnerClient:
    """소유자 관리 (비동기)."""

    async def get_dashboard(self) -> OwnerDashboard: ...

    def list_agent_summaries(
        self,
        *,
        max_page_size: int = 20,
    ) -> AsyncPaginator[AgentSummary]: ...

    async def get_global_budget(self) -> GlobalBudgetLimit: ...

    async def update_global_budget(
        self,
        *,
        daily_limit: Optional[str] = None,
        weekly_limit: Optional[str] = None,
        monthly_limit: Optional[str] = None,
    ) -> GlobalBudgetLimit: ...

    async def transfer_funds(
        self,
        *,
        from_agent_id: str,
        to_agent_id: str,
        amount: str,
        mint: Optional[str] = None,
    ) -> TransferResult: ...

    async def emergency_suspend_all(self) -> BatchOperationResult: ...

    async def emergency_suspend(
        self,
        agent_id: str,
        *,
        reason: Optional[str] = None,
    ) -> Agent: ...

    async def emergency_recover(
        self,
        agent_id: str,
        *,
        destination: Optional[str] = None,
        full_recovery: bool = True,
    ) -> RecoveryResult: ...
```

### 3.6 Pagination 패턴

```python
from typing import TypeVar, Generic, Iterator, AsyncIterator, List

T = TypeVar("T")


class SyncPaginator(Generic[T]):
    """동기 자동 페이지네이션. for 루프로 개별 항목 순회."""

    def __iter__(self) -> Iterator[T]: ...
    def __next__(self) -> T: ...

    def pages(self) -> Iterator[List[T]]:
        """페이지 단위 순회."""
        ...


class AsyncPaginator(Generic[T]):
    """비동기 자동 페이지네이션. async for 루프로 개별 항목 순회."""

    def __aiter__(self) -> AsyncIterator[T]: ...
    async def __anext__(self) -> T: ...

    async def pages(self) -> AsyncIterator[List[T]]:
        """페이지 단위 순회."""
        ...
```

---

## 4. SDK 공통 패턴 상세

### 4.1 Options Bag 패턴

모든 메서드는 positional argument를 최소화하고, 옵션을 단일 객체(TypeScript) 또는 keyword-only arguments(Python)로 전달한다.

**TypeScript:**

```typescript
// Good: Options Bag
const agent = await client.agents.createAgent({
  nickname: 'trading-bot',
  budgetConfig: {
    perTransactionLimit: '1000000000',
    dailyLimit: '5000000000',
  },
});

// Bad: positional args (이 패턴을 사용하지 않음)
// const agent = await client.agents.createAgent('trading-bot', 1000000000, 5000000000);
```

**Python:**

```python
# Good: keyword-only arguments (*, 구문으로 강제)
agent = client.agents.create(
    nickname="trading-bot",
    budget_config={
        "per_transaction_limit": "1000000000",
        "daily_limit": "5000000000",
    },
)

# Bad: positional args (Python SDK에서 허용하지 않음)
# agent = client.agents.create("trading-bot", {...})
```

### 4.2 PagedAsyncIterableIterator (자동 페이지네이션)

**TypeScript - 개별 항목 순회:**

```typescript
// 모든 에이전트를 자동으로 페이지네이션하며 순회
for await (const agent of client.agents.listAgents()) {
  console.log(agent.id, agent.nickname, agent.status);
}
```

**TypeScript - 페이지 단위 순회:**

```typescript
// 페이지 단위로 순회 (배치 처리에 유용)
for await (const page of client.agents.listAgents().byPage({ maxPageSize: 50 })) {
  console.log(`Page with ${page.length} agents`);
  for (const agent of page) {
    console.log(agent.id);
  }
}
```

**Python - 개별 항목 순회:**

```python
# 동기
for agent in client.agents.list():
    print(agent.id, agent.nickname, agent.status)

# 비동기
async for agent in async_client.agents.list():
    print(agent.id, agent.nickname, agent.status)
```

**Python - 페이지 단위 순회:**

```python
# 동기
for page in client.agents.list().pages():
    print(f"Page with {len(page)} agents")

# 비동기
async for page in async_client.agents.list().pages():
    print(f"Page with {len(page)} agents")
```

**내부 구현:** 커서 기반 자동 페치. 다음 페이지가 있으면 내부적으로 `cursor` 파라미터를 포함한 추가 요청을 자동 발행한다.

```typescript
// PagedAsyncIterableIterator 인터페이스
interface PagedAsyncIterableIterator<T> extends AsyncIterableIterator<T> {
  /** 페이지 단위 순회 */
  byPage(settings?: PageSettings): AsyncIterableIterator<T[]>;
}

interface PageSettings {
  /** 이전 페이지의 연속 토큰 (내부 관리, 사용자 제공 시 해당 지점부터 시작) */
  continuationToken?: string;
  /** 페이지 크기. 기본: 20, 최대: 100 */
  maxPageSize?: number;
}
```

### 4.3 자동 재시도 (RetryOptions)

SDK는 `retryable: true`인 에러에 대해 자동 재시도를 수행한다 (20-error-codes.md 참조).

**재시도 대상 에러:**

| 에러 코드 | HTTP | 재시도 이유 |
|-----------|------|-----------|
| AUTH_TOKEN_EXPIRED | 401 | refresh token으로 갱신 후 재시도 |
| AGENT_CREATING | 409 | 초기화 완료 후 재시도 |
| AGENT_KEY_ROTATION_IN_PROGRESS | 409 | 로테이션 완료 후 재시도 |
| TRANSACTION_SIGNING_FAILED | 502 | Enclave 일시적 장애 |
| TRANSACTION_SUBMISSION_FAILED | 502 | RPC 일시적 장애 |
| TRANSACTION_EXPIRED | 409 | 새 blockhash로 재구성 |
| FUNDING_REPLENISHMENT_LIMIT_REACHED | 429 | 다음 자정 후 재시도 |
| FUNDING_WITHDRAWAL_IN_PROGRESS | 409 | 회수 완료 후 재시도 |
| EMERGENCY_CIRCUIT_BREAKER_ACTIVE | 503 | 10분 후 HALF_OPEN |
| SYSTEM_INTERNAL_ERROR | 500 | 일시적 서버 오류 |
| SYSTEM_KMS_UNAVAILABLE | 502 | KMS 일시적 장애 |
| SYSTEM_ENCLAVE_UNAVAILABLE | 502 | Enclave 일시적 장애 |
| SYSTEM_RPC_UNAVAILABLE | 502 | RPC 일시적 장애 |
| SYSTEM_DATABASE_ERROR | 500 | DB 일시적 장애 |
| SYSTEM_RATE_LIMITED | 429 | Rate Limit 해제 후 재시도 |
| SYSTEM_MAINTENANCE | 503 | 점검 완료 후 재시도 |
| WEBHOOK_DELIVERY_FAILED | 500 | 수신 측 일시적 장애 |

**재시도 전략:**

```typescript
// SDK 내부 재시도 로직 (사용자가 직접 호출하지 않음)
const defaultRetryOptions: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  retryOnlyRetryable: true,
};

// 대기 시간 패턴: 1초, 2초, 4초
// Retry-After 헤더가 있으면 해당 값 우선 사용
// jitter: 무작위 0~500ms 추가 (thundering herd 방지)
```

### 4.4 에러 타입 계층

SDK는 WalletApiError의 error type(20-error-codes.md)을 도메인별 에러 클래스로 매핑한다.

**TypeScript 에러 계층:**

```typescript
// 기본 에러 클래스
class WaiassError extends Error {
  /** 에러 코드 (SCREAMING_SNAKE_CASE) */
  readonly code: string;

  /** HTTP 상태 코드 */
  readonly status: number;

  /** 상세 설명 */
  readonly detail: string;

  /** 요청 추적 ID */
  readonly requestId: string;

  /** 재시도 가능 여부 */
  readonly retryable: boolean;

  /** 에스컬레이션 수준 */
  readonly escalation: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;

  /** 문서 URL */
  readonly docUrl: string;

  /** 에러 발생 파라미터 */
  readonly param: string | null;
}

// 도메인별 에러 클래스
class AuthenticationError extends WaiassError {}    // auth_error
class ValidationError extends WaiassError {}        // validation_error
class PolicyError extends WaiassError {}            // policy_error
class AgentError extends WaiassError {}             // agent_error
class TransactionError extends WaiassError {}       // transaction_error
class FundingError extends WaiassError {}           // funding_error
class EmergencyError extends WaiassError {}         // emergency_error
class SystemError extends WaiassError {}            // system_error
class WebhookError extends WaiassError {}           // webhook_error
```

**에러 타입 매핑 테이블:**

| WalletApiError type | SDK 에러 클래스 | 대표 코드 |
|---------------------|---------------|----------|
| `auth_error` | `AuthenticationError` | AUTH_KEY_EXPIRED, AUTH_SCOPE_INSUFFICIENT |
| `validation_error` | `ValidationError` | VALIDATION_REQUIRED_FIELD, VALIDATION_INVALID_FORMAT |
| `policy_error` | `PolicyError` | POLICY_DAILY_LIMIT_EXCEEDED, POLICY_DESTINATION_NOT_ALLOWED |
| `agent_error` | `AgentError` | AGENT_SUSPENDED, AGENT_NOT_FOUND |
| `transaction_error` | `TransactionError` | TRANSACTION_SIGNING_FAILED, TRANSACTION_SIMULATION_FAILED |
| `funding_error` | `FundingError` | FUNDING_INSUFFICIENT_OWNER_BALANCE |
| `emergency_error` | `EmergencyError` | EMERGENCY_CIRCUIT_BREAKER_ACTIVE |
| `system_error` | `SystemError` | SYSTEM_RATE_LIMITED, SYSTEM_INTERNAL_ERROR |
| `webhook_error` | `WebhookError` | WEBHOOK_DELIVERY_FAILED |

**TypeScript instanceof 분기:**

```typescript
try {
  await client.transactions.executeTransaction({ /* ... */ });
} catch (error) {
  if (error instanceof PolicyError) {
    // 정책 에러 처리
    console.log(`Policy: ${error.code} - ${error.detail}`);
  } else if (error instanceof TransactionError) {
    // 트랜잭션 에러 처리
    if (error.retryable) { /* 재시도 */ }
  } else if (error instanceof AuthenticationError) {
    // 인증 에러 처리
    console.log('Re-authenticate required');
  } else if (error instanceof WaiassError) {
    // 기타 WAIaaS 에러
    console.log(`Error: ${error.code}`);
  }
}
```

**Python except 분기:**

```python
from waiass.errors import (
    WaiassError,
    AuthenticationError,
    PolicyError,
    TransactionError,
    AgentError,
    FundingError,
    EmergencyError,
    SystemError,
    WebhookError,
    ValidationError,
)

class WaiassError(Exception):
    """WAIaaS SDK 기본 에러."""
    code: str
    status: int
    detail: str
    request_id: str
    retryable: bool
    escalation: str | None
    doc_url: str
    param: str | None

class AuthenticationError(WaiassError): ...   # auth_error
class ValidationError(WaiassError): ...       # validation_error
class PolicyError(WaiassError): ...           # policy_error
class AgentError(WaiassError): ...            # agent_error
class TransactionError(WaiassError): ...      # transaction_error
class FundingError(WaiassError): ...          # funding_error
class EmergencyError(WaiassError): ...        # emergency_error
class SystemError(WaiassError): ...           # system_error
class WebhookError(WaiassError): ...          # webhook_error
```

### 4.5 로깅

SDK는 선택적 로거 주입을 지원한다. 요청/응답을 자동 로깅하며, 모든 로그에 `requestId`를 포함한다.

**TypeScript:**

```typescript
import { WaiassClient } from '@waiass/sdk';

const client = new WaiassClient('wai_live_xxx', {
  logger: {
    debug: (msg, data) => console.debug(`[WAIaaS] ${msg}`, data),
    info: (msg, data) => console.info(`[WAIaaS] ${msg}`, data),
    warn: (msg, data) => console.warn(`[WAIaaS] ${msg}`, data),
    error: (msg, data) => console.error(`[WAIaaS] ${msg}`, data),
  },
});

// 로그 출력 예시:
// [WAIaaS] Request: POST /api/v1/transactions { requestId: "req_01HV8PQ..." }
// [WAIaaS] Response: 200 OK (145ms) { requestId: "req_01HV8PQ..." }
// [WAIaaS] Error: 403 POLICY_DAILY_LIMIT_EXCEEDED { requestId: "req_01HV8PQ...", retryable: false }
```

**로깅 수준 정책:**

| 수준 | 내용 |
|------|------|
| `debug` | 요청 URL, 메서드, 바디 (민감 필드 마스킹) |
| `info` | 응답 상태, 소요 시간 |
| `warn` | 에러 응답 (retryable), 재시도 시도 |
| `error` | 에러 응답 (non-retryable), 재시도 실패 |

**민감 필드 마스킹:** API Key, OAuth Token, 서명 데이터는 로그에 마스킹 처리 (`wai_live_***`).

---

## 5. SDK 사용 예제

### 5.1 TypeScript: 에이전트 생성 + 트랜잭션 실행 + 에러 처리

```typescript
import {
  WaiassClient,
  PolicyError,
  TransactionError,
  AgentError,
} from '@waiass/sdk';

const client = new WaiassClient('wai_live_xxx', {
  network: 'devnet',
});

// 1. 에이전트 생성
const agent = await client.agents.createAgent({
  nickname: 'trading-bot-alpha',
  budgetConfig: {
    perTransactionLimit: '1000000000',  // 1 SOL
    dailyLimit: '5000000000',           // 5 SOL
  },
  whitelist: {
    allowedDestinations: ['DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy'],
  },
});
console.log(`Agent created: ${agent.id}`);

// 2. 자금 충전
const funding = await client.agents.fund(agent.id, {
  amount: '2000000000',  // 2 SOL
});
console.log(`Funded: ${funding.txSignature}`);

// 3. 트랜잭션 실행
try {
  const tx = await client.transactions.executeTransaction({
    agentId: agent.id,
    to: 'DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy',
    amount: '500000000',  // 0.5 SOL
  });
  console.log(`Transaction: ${tx.txSignature}`);
} catch (error) {
  if (error instanceof PolicyError) {
    console.log(`Policy violation: ${error.detail}`);
    console.log(`Doc: ${error.docUrl}`);
  } else if (error instanceof TransactionError && error.retryable) {
    console.log(`Retryable error, will retry: ${error.code}`);
  } else if (error instanceof AgentError) {
    console.log(`Agent issue: ${error.code}`);
  }
}

// 4. 잔액 확인
const balance = await client.agents.getBalance(agent.id);
console.log(`Balance: ${balance.sol} lamports`);
```

### 5.2 Python: 동일 흐름

```python
from waiass import AsyncWaiassClient
from waiass.errors import PolicyError, TransactionError, AgentError

client = AsyncWaiassClient(
    api_key="wai_live_xxx",
    network="devnet",
)

# 1. 에이전트 생성
agent = await client.agents.create(
    nickname="trading-bot-alpha",
    budget_config={
        "per_transaction_limit": "1000000000",   # 1 SOL
        "daily_limit": "5000000000",             # 5 SOL
    },
    whitelist={
        "allowed_destinations": ["DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy"],
    },
)
print(f"Agent created: {agent.id}")

# 2. 자금 충전
funding = await client.agents.fund(
    agent.id,
    amount="2000000000",   # 2 SOL
)
print(f"Funded: {funding.tx_signature}")

# 3. 트랜잭션 실행
try:
    tx = await client.transactions.execute(
        agent_id=agent.id,
        to="DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy",
        amount="500000000",   # 0.5 SOL
    )
    print(f"Transaction: {tx.tx_signature}")
except PolicyError as e:
    print(f"Policy violation: {e.detail}")
    print(f"Doc: {e.doc_url}")
except TransactionError as e:
    if e.retryable:
        print(f"Retryable error, will retry: {e.code}")
except AgentError as e:
    print(f"Agent issue: {e.code}")

# 4. 잔액 확인
balance = await client.agents.get_balance(agent.id)
print(f"Balance: {balance.sol} lamports")
```

### 5.3 TypeScript: 페이지네이션 + 대시보드

```typescript
// 모든 에이전트 순회 (자동 페이지네이션)
for await (const agent of client.agents.listAgents({ status: 'ACTIVE' })) {
  const usage = await client.agents.getPolicyUsage(agent.id);
  console.log(`${agent.nickname}: ${usage.daily.used}/${usage.daily.limit}`);
}

// 소유자 대시보드
const dashboard = await client.owner.getDashboard();
console.log(`Total agents: ${dashboard.totalAgents}`);
console.log(`Daily spending: ${dashboard.dailySpending.used}/${dashboard.dailySpending.limit}`);
```

### 5.4 Python: 비상 조치

```python
# 전체 에이전트 비상 정지
result = await client.owner.emergency_suspend_all()
print(f"Suspended {result.succeeded}/{result.total} agents")

# 특정 에이전트 비상 회수
recovery = await client.owner.emergency_recover(
    agent_id="agt_compromised",
    destination="owner_safe_wallet_address",
    full_recovery=True,
)
print(f"Recovered {recovery.recovered_amount} to {recovery.destination}")
```

---

## 6. SDK 메서드 - REST API 매핑 테이블

| SDK 메서드 (TypeScript) | HTTP | REST API 엔드포인트 | 필요 스코프 |
|------------------------|------|---------------------|------------|
| `agents.createAgent()` | POST | /api/v1/agents | agents:write |
| `agents.getAgent()` | GET | /api/v1/agents/:agentId | agents:read |
| `agents.listAgents()` | GET | /api/v1/agents | agents:read |
| `agents.updateAgent()` | PATCH | /api/v1/agents/:agentId | agents:write |
| `agents.deleteAgent()` | DELETE | /api/v1/agents/:agentId | agents:delete |
| `agents.suspendAgent()` | POST | /api/v1/agents/:agentId/suspend | agents:write |
| `agents.resumeAgent()` | POST | /api/v1/agents/:agentId/resume | agents:write |
| `agents.rotateKey()` | POST | /api/v1/agents/:agentId/rotate-key | agents:write |
| `agents.getBalance()` | GET | /api/v1/agents/:agentId/balance | wallets:read |
| `agents.fund()` | POST | /api/v1/agents/:agentId/fund | wallets:fund |
| `agents.withdraw()` | POST | /api/v1/agents/:agentId/withdraw | wallets:fund |
| `agents.getPolicy()` | GET | /api/v1/agents/:agentId/policy | policies:read |
| `agents.updatePolicy()` | PUT | /api/v1/agents/:agentId/policy | policies:write |
| `agents.getPolicyUsage()` | GET | /api/v1/agents/:agentId/policy/usage | policies:read |
| `transactions.executeTransaction()` | POST | /api/v1/transactions | transactions:execute |
| `transactions.getTransaction()` | GET | /api/v1/transactions/:txId | transactions:read |
| `transactions.listTransactions()` | GET | /api/v1/agents/:agentId/transactions | transactions:read |
| `owner.getDashboard()` | GET | /api/v1/owner/dashboard | dashboard:read |
| `owner.listAgentSummaries()` | GET | /api/v1/owner/agents | dashboard:read |
| `owner.getGlobalBudget()` | GET | /api/v1/owner/global-budget | dashboard:read |
| `owner.updateGlobalBudget()` | PUT | /api/v1/owner/global-budget | policies:write |
| `owner.transferFunds()` | POST | /api/v1/owner/agents/transfer | wallets:fund |
| `owner.emergencySuspendAll()` | POST | /api/v1/owner/emergency/suspend-all | admin:all |
| `owner.emergencySuspend()` | POST | /api/v1/agents/:agentId/emergency/suspend | admin:all |
| `owner.emergencyRecover()` | POST | /api/v1/agents/:agentId/emergency/recover | admin:all |
| `webhooks.createWebhook()` | POST | /api/v1/webhooks | admin:all |
| `webhooks.listWebhooks()` | GET | /api/v1/webhooks | admin:all |
| `webhooks.deleteWebhook()` | DELETE | /api/v1/webhooks/:webhookId | admin:all |
| `webhooks.testWebhook()` | POST | /api/v1/webhooks/:webhookId/test | admin:all |
| `auth.createKey()` | POST | /api/v1/auth/keys | admin:all |
| `auth.listKeys()` | GET | /api/v1/auth/keys | admin:all |
| `auth.revokeKey()` | DELETE | /api/v1/auth/keys/:keyId | admin:all |

---

## 7. SDK 배포 및 버전 관리

### 7.1 TypeScript SDK

| 항목 | 값 |
|------|---|
| **패키지명** | `@waiass/sdk` |
| **레지스트리** | npm |
| **빌드 포맷** | ESM + CJS 이중 빌드 (tsup) |
| **최소 Node.js** | 18.x LTS |
| **최소 TypeScript** | 5.0+ |
| **번들 크기 목표** | < 50KB (gzipped) |

### 7.2 Python SDK

| 항목 | 값 |
|------|---|
| **패키지명** | `waiass-sdk` |
| **레지스트리** | PyPI |
| **최소 Python** | 3.10+ |
| **HTTP 클라이언트** | httpx (동기/비동기 통합) |
| **타입 힌트** | 100% 커버리지, py.typed 마커 포함 |

### 7.3 버전 정책

| 정책 | 설명 |
|------|------|
| **API 버전 동기화** | SDK 1.x.x = /api/v1/, SDK 2.x.x = /api/v2/ |
| **Semver 준수** | Major: 하위호환 불가 변경, Minor: 새 기능, Patch: 버그 수정 |
| **Deprecation** | 최소 1 minor 버전 경고 후 다음 major에서 제거 |
| **Changelog** | CHANGELOG.md 자동 생성 (conventional commits) |

### 7.4 SDK 생성 전략

SDK 인터페이스는 본 문서에서 수동으로 설계한다. 구현 시 다음 전략을 평가한다:

| 접근법 | 장점 | 단점 | 권장 |
|--------|------|------|------|
| **완전 수동** | 최적의 DX, 패턴 자유도 | 유지보수 부담, 스펙 drift 위험 | TypeScript SDK |
| **OpenAPI → SDK 생성** | 스펙 동기화 보장 | DX 제한, 생성 코드 품질 | 평가 후 결정 |
| **하이브리드** | 타입은 생성, 클라이언트는 수동 | 중간 복잡도 | Python SDK 후보 |

**권장:** TypeScript SDK는 수동 작성 (핵심 제품), Python SDK는 하이브리드 접근 (타입 생성 + 수동 클라이언트). 두 SDK 모두 OpenAPI 스펙에서 타입을 검증하는 CI 테스트를 포함한다.

---

*문서 ID: API-05*
*Phase: 05-api-및-통합-설계*
*작성일: 2026-02-05*
