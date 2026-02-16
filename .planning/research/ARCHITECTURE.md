# Architecture Patterns: WalletConnect Owner 승인

**Domain:** WalletConnect v2 SignClient 통합 -- 외부 지갑을 통한 APPROVAL 트랜잭션 서명
**Researched:** 2026-02-16
**Confidence:** MEDIUM (WC SDK 공식 문서 + 코드베이스 정밀 분석 기반, Node.js 서버 장기 실행 이슈 LOW)

---

## Recommended Architecture

WAIaaS 데몬이 WalletConnect v2 **SignClient를 dApp 역할**로 호스팅한다. Owner의 외부 지갑(MetaMask, Phantom 등)이 wallet 역할이 된다. APPROVAL 상태 트랜잭션이 발생하면, 데몬이 SignClient를 통해 Owner 지갑에 서명 요청을 보내고, Owner가 외부 지갑에서 승인/거절한다.

### 핵심 설계 원칙

1. **데몬 = dApp**: SignClient.connect()로 URI 생성, SignClient.request()로 서명 요청 전송
2. **Owner 지갑 = Wallet**: QR 스캔으로 페어링, 서명 요청 수신 후 승인/거절
3. **Telegram = Fallback**: WC 세션 없거나 서명 실패 시 기존 /approve /reject 명령어로 대체
4. **Admin UI = QR 표시**: 페어링 URI를 QR 코드로 렌더링, 세션 상태 표시
5. **WC = 보너스 채널**: WC 없이도 기존 ownerAuth REST API + Telegram이 100% 동작. WC 실패는 로깅만.

---

## Component Boundaries

```
                                  WalletConnect Relay (wss://relay.walletconnect.com)
                                        |
                                        v
  +------------------------------------+     +-------------------+
  |         WAIaaS Daemon              |     |  Owner's Wallet   |
  |                                    |     |  (MetaMask etc.)  |
  |  +-----------------------------+   |     |                   |
  |  | WalletConnectService        |<--+---->|  session_request  |
  |  | - signClient: SignClient    |   |     |  approve/reject   |
  |  | - sessions: Map<walletId>   |   |     +-------------------+
  |  | - connect() -> URI          |   |
  |  | - requestApproval(txId)     |   |     +-------------------+
  |  +------------|----------------+   |     |  Admin UI         |
  |               |                    |     |  /admin/wc        |
  |               v                    |     |  - QR 렌더링      |
  |  +-----------------------------+   |     |  - 세션 상태 표시  |
  |  | ApprovalWorkflow            |   |     +-------------------+
  |  | - requestApproval(txId)     |   |
  |  | - approve(txId, sig)        |   |     +-------------------+
  |  | - reject(txId)              |   |     |  Telegram Bot     |
  |  +-----------------------------+   |     |  /approve /reject |
  |               |                    |     |  (fallback)       |
  |               v                    |     +-------------------+
  |  +-----------------------------+   |
  |  | NotificationService        |   |
  |  | - APPROVAL_REQUESTED 이벤트 |   |
  |  +-----------------------------+   |
  +------------------------------------+
```

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| WalletConnectService | WC SignClient 생명주기, 세션 관리, 서명 요청 전송 | WC Relay, ApprovalWorkflow, SettingsService, SQLite |
| WC Admin API routes | QR 페어링 URI 생성, 세션 조회/해제 API | WalletConnectService, masterAuth |
| Admin UI WC page | QR 코드 렌더링, 세션 상태 표시, 연결/해제 UI | WC Admin API (fetch) |
| SqliteKeyValueStorage | WC SDK 내부 스토리지를 SQLite에 영속화 | wc_store 테이블, better-sqlite3 |
| CAIP-2 매핑 유틸리티 | WAIaaS chain+network -> WC namespace 변환 | 정적 매핑 테이블 |

---

## New Components (5개)

### 1. WalletConnectService (신규)

**위치:** `packages/daemon/src/services/walletconnect-service.ts`
**책임:** WC SignClient 생명주기, 세션 관리, 서명 요청 전송
**의존:** SettingsService (project_id), ApprovalWorkflow, NotificationService, SQLite (세션 영속화)

```typescript
// 핵심 인터페이스
interface WalletConnectService {
  // 초기화 (데몬 시작 시)
  initialize(projectId: string): Promise<void>;

  // 페어링: QR URI 생성 (walletId 단위)
  connect(walletId: string, chain: ChainType, network: string): Promise<{ uri: string; topic: string }>;

  // 서명 요청 전송 (APPROVAL 트랜잭션)
  requestSignature(txId: string, walletId: string, params: SignRequestParams): Promise<SignResult>;

  // 세션 상태 조회
  getSession(walletId: string): WCSessionInfo | null;

  // 활성 세션 존재 여부
  hasActiveSession(walletId: string): boolean;

  // 세션 해제
  disconnect(walletId: string): Promise<void>;

  // 셧다운 (데몬 종료 시)
  shutdown(): Promise<void>;
}

interface SignRequestParams {
  chain: ChainType;          // 'solana' | 'ethereum'
  network: string;           // 'ethereum-mainnet' | 'devnet' 등
  ownerAddress: string;      // Owner 지갑 주소
  // EVM: personal_sign 메시지 (트랜잭션 요약)
  // Solana: 직렬화된 트랜잭션 바이트
  messageOrTx: string;
}

type SignResult =
  | { status: 'approved'; signature: string }
  | { status: 'rejected'; reason?: string }
  | { status: 'timeout' }
  | { status: 'no_session'; fallback: 'telegram' };

interface WCSessionInfo {
  walletId: string;
  topic: string;
  peerMeta: { name: string; url?: string; icons?: string[] } | null;
  chainId: string;          // CAIP-2 형식: 'eip155:1' 또는 'solana:5eykt...'
  ownerAddress: string;
  expiry: number;           // Unix epoch seconds
  connected: boolean;
}
```

**생명주기:**
- 데몬 Step 4c-6에서 초기화 (fail-soft)
- walletconnect.project_id 설정 시만 활성화
- 셧다운 시 SignClient.disconnect() + 리소스 해제
- 기존 wc_sessions에서 세션 복원 (데몬 재시작 시 자동 복구)

**SignClient 초기화 상세:**

```typescript
async initialize(projectId: string): Promise<void> {
  // SQLite 기반 커스텀 스토리지 (데몬 재시작 시 세션 복원)
  const storage = new SqliteKeyValueStorage(this.sqlite, 'wc_store');

  const core = new Core({
    projectId,
    storage,
    relayUrl: 'wss://relay.walletconnect.com',
  });

  this.signClient = await SignClient.init({
    core,
    metadata: {
      name: 'WAIaaS Daemon',
      description: 'AI Agent Wallet-as-a-Service',
      url: 'http://localhost',
      icons: [],
    },
  });

  // 기존 세션 복원: wc_sessions 테이블에서 walletId -> topic 매핑 로드
  this.restoreSessions();

  // 세션 삭제 이벤트 리스너
  this.signClient.on('session_delete', ({ topic }) => {
    this.handleSessionDelete(topic);
  });
}
```

### 2. SqliteKeyValueStorage (신규)

**위치:** `packages/daemon/src/services/walletconnect-storage.ts`
**책임:** WC SDK의 IKeyValueStorage 인터페이스를 SQLite로 구현

```typescript
// WC SDK의 IKeyValueStorage 인터페이스 구현
class SqliteKeyValueStorage implements IKeyValueStorage {
  constructor(private sqlite: Database, private tableName: string = 'wc_store') {}

  async getKeys(): Promise<string[]> {
    return this.sqlite
      .prepare(`SELECT key FROM ${this.tableName}`)
      .all()
      .map((row: any) => row.key);
  }

  async getEntries<T>(): Promise<[string, T][]> {
    return this.sqlite
      .prepare(`SELECT key, value FROM ${this.tableName}`)
      .all()
      .map((row: any) => [row.key, JSON.parse(row.value)]);
  }

  async getItem<T>(key: string): Promise<T | undefined> {
    const row = this.sqlite
      .prepare(`SELECT value FROM ${this.tableName} WHERE key = ?`)
      .get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : undefined;
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    this.sqlite
      .prepare(
        `INSERT OR REPLACE INTO ${this.tableName} (key, value) VALUES (?, ?)`
      )
      .run(key, JSON.stringify(value));
  }

  async removeItem(key: string): Promise<void> {
    this.sqlite
      .prepare(`DELETE FROM ${this.tableName} WHERE key = ?`)
      .run(key);
  }
}
```

### 3. CAIP-2 매핑 유틸리티 (신규)

**위치:** `packages/daemon/src/services/walletconnect-caip.ts`
**책임:** WAIaaS chain+network -> WC CAIP-2 namespace 변환

```typescript
// EVM chainId 매핑 (viem에서 chainId 참조 가능하지만 명시적 매핑이 안전)
const EVM_CHAIN_IDS: Record<string, number> = {
  'ethereum-mainnet': 1,
  'ethereum-sepolia': 11155111,
  'polygon-mainnet': 137,
  'polygon-amoy': 80002,
  'arbitrum-mainnet': 42161,
  'arbitrum-sepolia': 421614,
  'optimism-mainnet': 10,
  'optimism-sepolia': 11155420,
  'base-mainnet': 8453,
  'base-sepolia': 84532,
};

// Solana genesis hash prefix 매핑 (CAIP-2 spec)
const SOLANA_GENESIS_HASHES: Record<string, string> = {
  'mainnet': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'devnet': 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  'testnet': '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
};

export function toCAIP2(chain: ChainType, network: string): string {
  if (chain === 'ethereum') {
    const chainId = EVM_CHAIN_IDS[network];
    if (!chainId) throw new Error(`Unknown EVM network: ${network}`);
    return `eip155:${chainId}`;
  }
  if (chain === 'solana') {
    const hash = SOLANA_GENESIS_HASHES[network];
    if (!hash) throw new Error(`Unknown Solana network: ${network}`);
    return `solana:${hash}`;
  }
  throw new Error(`Unsupported chain: ${chain}`);
}

export function getWCNamespace(chain: ChainType): string {
  return chain === 'ethereum' ? 'eip155' : 'solana';
}

export function getWCMethods(chain: ChainType): string[] {
  if (chain === 'ethereum') {
    return ['personal_sign', 'eth_signTypedData_v4'];
  }
  if (chain === 'solana') {
    return ['solana_signTransaction', 'solana_signMessage'];
  }
  return [];
}
```

### 4. WC Admin API 라우트 (신규)

**위치:** `packages/daemon/src/api/routes/walletconnect.ts`
**책임:** QR 페어링 URI 생성, 세션 관리 API
**인증:** masterAuth (Admin 전용)

```
POST /v1/admin/wc/connect/:walletId  -> { uri, topic, expiresAt }
GET  /v1/admin/wc/session/:walletId  -> { connected, peerMeta, chainId, ownerAddress, expiry }
GET  /v1/admin/wc/sessions           -> [{ walletId, connected, peerMeta, ... }]
POST /v1/admin/wc/disconnect/:walletId -> { disconnected: true }
```

### 5. Admin UI WC 페이지 (신규)

**위치:** `packages/admin/src/pages/walletconnect.tsx`
**책임:** QR 코드 렌더링, 세션 상태 표시, 연결/해제 UI

QR 렌더링 방식: `qrcode` npm 패키지로 data URL 생성 (canvas 불필요, img src로 직접 사용).
세션 상태 폴링: 2초 간격 GET /wc/session/:walletId (SSE 대비 단순하고 Admin 전용이므로 충분).

---

## Modified Components (8개)

### 1. Pipeline Stage 3/4 -- WC 서명 요청 트리거

**변경 위치:** `packages/daemon/src/pipeline/stages.ts` (stage3Policy 또는 stage4Wait)
**변경 내용:** APPROVAL 티어 진입 시 WC 서명 요청을 fire-and-forget으로 트리거

현재 흐름:
1. Stage 3에서 `TX_APPROVAL_REQUIRED` 알림 발송
2. Stage 4에서 `approvalWorkflow.requestApproval(txId)` + PIPELINE_HALTED throw

수정 흐름:
1. Stage 3에서 `TX_APPROVAL_REQUIRED` 알림 발송 (기존 유지)
2. Stage 4에서 `approvalWorkflow.requestApproval(txId)` (기존 유지)
3. **Stage 4에서 WC 서명 요청 fire-and-forget 추가:**

```typescript
// stage4Wait() 내 APPROVAL 분기 (stages.ts L539-551 부근)
if (tier === 'APPROVAL') {
  if (!ctx.approvalWorkflow) return;
  ctx.approvalWorkflow.requestApproval(ctx.txId);

  // [NEW] WC 서명 요청 (fire-and-forget)
  if (ctx.wcService?.hasActiveSession(ctx.walletId)) {
    void ctx.wcService.requestSignature(ctx.txId, ctx.walletId, {
      chain: ctx.wallet.chain as ChainType,
      network: ctx.resolvedNetwork,
      ownerAddress: /* wallets 테이블에서 조회 */,
      messageOrTx: buildApprovalMessage(ctx),
    }).then((result) => {
      if (result.status === 'approved') {
        ctx.approvalWorkflow!.approve(ctx.txId, result.signature);
        // executeFromStage5 트리거 (DaemonLifecycle에서)
      }
      // rejected/timeout: Telegram fallback이 이미 활성화되어 있음
      // no_session: 기존 경로 유지
    }).catch(() => {
      // WC 실패 시 로깅만 -- 기존 경로 영향 없음
    });
  }

  throw new WAIaaSError('PIPELINE_HALTED', { ... });
}
```

**핵심:** WC 서명 요청은 PIPELINE_HALTED **이전에** fire-and-forget으로 시작된다. PIPELINE_HALTED가 throw되어도 WC Promise는 백그라운드에서 계속 실행된다.

### 2. PipelineContext (수정)

**변경:** wcService 옵셔널 필드 추가

```typescript
export interface PipelineContext {
  // ... 기존 필드 모두 유지 ...
  // v1.7: WalletConnect service for APPROVAL tier WC signing
  wcService?: WalletConnectService;
}
```

### 3. ApprovalWorkflow (수정)

**변경 내용:** approval_channel 기록

현재 `approve(txId, ownerSignature)` 시그니처는 동일하게 유지.
pending_approvals 테이블의 신규 `approval_channel` 컬럼에 승인 경로를 기록.

```typescript
// approve() 내부 -- ownerSignature 형태로 channel 판별
approve(txId: string, ownerSignature: string, channel?: 'rest_api' | 'telegram' | 'walletconnect'): ApproveResult {
  // ... 기존 로직 동일 ...

  // [NEW] approval_channel 기록
  const resolvedChannel = channel ?? 'rest_api';
  this.sqlite
    .prepare('UPDATE pending_approvals SET approved_at = ?, owner_signature = ?, approval_channel = ? WHERE id = ?')
    .run(now, ownerSignature, resolvedChannel, approval.id);
  // ...
}
```

기존 호출자 (REST API ownerAuth, Telegram Bot)는 channel 파라미터 없이 호출 -> 기본값 'rest_api'. Telegram은 'telegram', WC는 'walletconnect'.

### 4. DaemonLifecycle (수정)

**변경:** Step 4c-6에서 WalletConnectService 초기화 (fail-soft), 셧다운 시 정리

```typescript
// Step 4c-6: WalletConnectService initialization (fail-soft)
try {
  const wcProjectId = this._settingsService?.get('walletconnect.project_id');
  if (wcProjectId) {
    const { WalletConnectService: WCServiceCls } = await import(
      '../services/walletconnect-service.js'
    );
    this.wcService = new WCServiceCls({
      sqlite: this.sqlite!,
      approvalWorkflow: this.approvalWorkflow!,
      notificationService: this.notificationService,
      settingsService: this._settingsService!,
    });
    await this.wcService.initialize(wcProjectId);
    console.log('Step 4c-6: WalletConnect service initialized');
  } else {
    console.log('Step 4c-6: WalletConnect disabled (no project_id)');
  }
} catch (err) {
  console.warn('Step 4c-6 (fail-soft): WalletConnect init warning:', err);
  this.wcService = null;
}
```

셧다운 시 (TelegramBotService.stop() 직후):
```typescript
if (this.wcService) {
  await this.wcService.shutdown();
  this.wcService = null;
}
```

### 5. createApp() / CreateAppDeps (수정)

**변경:** wcService를 deps로 전달, WC Admin 라우트 등록

```typescript
export interface CreateAppDeps {
  // ... 기존 필드 ...
  wcService?: WalletConnectService;
}

// createApp() 내부:
// WC Admin routes (masterAuth)
if (deps.wcService) {
  const wcRoutes = walletconnectRoutes({ wcService: deps.wcService, db: deps.db! });
  app.route('/v1/admin/wc', wcRoutes);
}
```

### 6. HotReloadOrchestrator (수정)

**변경:** walletconnect 키 변경 시 WC 서비스 재초기화

```typescript
const WALLETCONNECT_KEYS = new Set(['walletconnect.project_id']);

// handleChangedKeys() 내부:
if (changedKeys.some(k => WALLETCONNECT_KEYS.has(k))) {
  void this.reloadWalletConnect().catch(err => {
    console.warn('Hot-reload WalletConnect failed:', err);
  });
}
```

### 7. SettingDefinitions (수정)

**변경:** walletconnect 카테고리에 추가 설정 키

```typescript
// 기존
{ key: 'walletconnect.project_id', category: 'walletconnect', ... },

// 추가
{ key: 'walletconnect.relay_url', category: 'walletconnect',
  configPath: 'walletconnect.relay_url',
  defaultValue: 'wss://relay.walletconnect.com', isCredential: false },
{ key: 'walletconnect.request_timeout', category: 'walletconnect',
  configPath: 'walletconnect.request_timeout',
  defaultValue: '300', isCredential: false },  // 서명 요청 타임아웃 (초)
```

### 8. TelegramBotService (수정)

**변경 범위:** 최소 -- /approve /reject 핸들러에 `approval_channel: 'telegram'` 전달

```typescript
// handleApprove() 내부 -- 기존 직접 SQL UPDATE에 approval_channel 추가
this.sqlite
  .prepare(
    'UPDATE pending_approvals SET approved_at = unixepoch(), approval_channel = ? WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL',
  )
  .run('telegram', txId);
```

---

## Data Flow

### Flow 1: QR 페어링 (최초 1회)

```
Admin UI                 Daemon API              WalletConnectService        WC Relay           Owner Wallet
   |                        |                           |                       |                    |
   |-- POST /wc/connect --->|                           |                       |                    |
   |                        |-- connect(walletId) ----->|                       |                    |
   |                        |                           |-- SignClient.connect() -->|                |
   |                        |                           |   requiredNamespaces:  |                    |
   |                        |                           |   eip155: {            |                    |
   |                        |                           |     methods: [         |                    |
   |                        |                           |       personal_sign,   |                    |
   |                        |                           |       eth_signTypedData|                    |
   |                        |                           |     ],                 |                    |
   |                        |                           |     chains: [eip155:1] |                    |
   |                        |                           |   }                    |                    |
   |                        |                           |<-- { uri, approval } --|                    |
   |                        |<-- { uri, topic } --------|                       |                    |
   |<-- 200 { uri } --------|                           |                       |                    |
   |                        |                           |                       |                    |
   | [QR 렌더링 + Owner 스캔]                            |                       |                    |
   |                        |                           |                       |<--- pair(uri) ------|
   |                        |                           |<-- session approved ---|                    |
   |                        |                           | [wc_sessions DB 저장]  |                    |
   |                        |                           | [wallets.ownerAddress  |                    |
   |                        |                           |  자동 등록 (미설정 시)] |                    |
   | [폴링: GET /session]    |                           |                       |                    |
   |<-- 200 { connected } --|                           |                       |                    |
```

**ownerAddress 자동 등록:** WC 세션 승인 시, 페어링된 지갑의 account 주소를 wallets 테이블의 ownerAddress로 자동 등록한다 (ownerAddress가 NULL인 경우에만). 이미 등록된 경우 일치 여부만 검증.

### Flow 2: APPROVAL 서명 요청

```
Pipeline Stage 3-4       ApprovalWorkflow       WalletConnectService        WC Relay           Owner Wallet
   |                        |                           |                       |                    |
   |-- tier = APPROVAL      |                           |                       |                    |
   |-- TX_APPROVAL_REQUIRED |                           |                       |                    |
   |   알림 발송 (기존)      |                           |                       |                    |
   |                        |                           |                       |                    |
   |-- requestApproval() -->|                           |                       |                    |
   |                        |-- [DB: QUEUED] ---------> |                       |                    |
   |                        |                           |                       |                    |
   |-- fire-and-forget:     |                           |                       |                    |
   |   requestSignature() --|-------------------------->|                       |                    |
   |                        |                           |-- SignClient.request() -->|                |
   |                        |                           |   topic: session.topic |                    |
   |                        |                           |   method: personal_sign|                    |
   |                        |                           |   params: [message, addr]                  |
   |                        |                           |                       |-- session_request-->|
   |                        |                           |                       |                    |
   |-- PIPELINE_HALTED ---->|                           |                       |     [Owner 승인]   |
   |                        |                           |                       |<-- response -------|
   |                        |                           |<-- signature ---------|                    |
   |                        |<-- approve(txId, sig,     |                       |                    |
   |                        |    'walletconnect') ------|                       |                    |
   |                        |-- [DB: EXECUTING] ------->|                       |                    |
   |                        |                           |                       |                    |
   | [DaemonLifecycle.      |                           |                       |                    |
   |  executeFromStage5()] <|                           |                       |                    |
```

**핵심 타이밍:** fire-and-forget requestSignature()는 PIPELINE_HALTED throw **이전에** 시작된다. Promise는 백그라운드에서 WC relay 응답을 기다린다. Owner가 승인하면 approve() -> EXECUTING -> executeFromStage5() 체인이 자동 실행된다.

### Flow 3: Telegram Fallback (WC 세션 없을 때)

```
Pipeline Stage 4         WalletConnectService    NotificationService        Telegram Bot
   |                        |                         |                         |
   |-- hasActiveSession() ->|                         |                         |
   |<-- false --------------|                         |                         |
   |                        |                         |                         |
   | [WC 서명 요청 스킵]     |                         |                         |
   |                        |                         |                         |
   | [기존 동작 유지]         |                         |                         |
   |                        |                  TX_APPROVAL_REQUIRED              |
   |                        |                  알림 발송 (기존) ------------------>|
   |                        |                         |                         |
   |                        |                         |     /pending 표시        |
   |                        |                         |     /approve {txId}      |
   |                        |                         |     [DB 직접 approve]    |
```

### Flow 4: WC 서명 거절/타임아웃 시

```
WalletConnectService         ApprovalWorkflow        NotificationService
   |                              |                         |
   | [Owner 거절 또는 타임아웃]    |                         |
   |-- result: 'rejected'        |                         |
   |   또는 'timeout'            |                         |
   |                              |                         |
   | [아무것도 하지 않음]          |                         |
   | (Telegram /approve /reject   |                         |
   |  여전히 활성화 상태)          |                         |
   |                              |                         |
   | [approval_timeout 만료 시:]   |                         |
   |                              |-- processExpiredApprovals()                 |
   |                              |-- [DB: EXPIRED]        |                    |
```

**핵심:** WC 거절/타임아웃은 ApprovalWorkflow의 상태를 변경하지 않는다. Owner는 여전히 Telegram이나 REST API로 승인/거절할 수 있다. WC 타임아웃과 approval_timeout은 독립적이다 (WC 타임아웃 < approval_timeout).

---

## Patterns to Follow

### Pattern 1: fail-soft 서비스 초기화

**기존 패턴:** TelegramBotService, BalanceMonitorService, AutoStopService 모두 fail-soft (try/catch + null fallback)
**WC 적용:** WalletConnectService도 동일 패턴. project_id 미설정이면 비활성화, 초기화 실패해도 데몬 계속 동작.

```typescript
// daemon.ts: TelegramBotService와 동일 패턴
try {
  if (wcProjectId) {
    this.wcService = new WalletConnectService({ ... });
    await this.wcService.initialize(wcProjectId);
    console.log('Step 4c-6: WalletConnect service initialized');
  } else {
    console.log('Step 4c-6: WalletConnect disabled (no project_id)');
  }
} catch (err) {
  console.warn('Step 4c-6 (fail-soft): WalletConnect init warning:', err);
  this.wcService = null;
}
```

### Pattern 2: fire-and-forget 서명 요청

**기존 패턴:** NotificationService.notify()는 void 반환, pipeline 차단 없음
**WC 적용:** WC 서명 요청도 fire-and-forget. 성공 시 ApprovalWorkflow.approve() 호출, 실패 시 기존 Telegram/REST 경로 그대로.

```typescript
// GOOD: fire-and-forget, pipeline 차단 없음
if (ctx.wcService?.hasActiveSession(ctx.walletId)) {
  void ctx.wcService.requestSignature(txId, walletId, params).then(result => {
    if (result.status === 'approved') {
      approvalWorkflow.approve(txId, result.signature, 'walletconnect');
    }
    // rejected/timeout: 기존 경로(Telegram, REST)가 여전히 활성화
  }).catch(() => { /* 로깅만 */ });
}
```

### Pattern 3: walletId 단위 세션 관리

**기존 패턴:** Owner 3-State (NONE/GRACE/LOCKED)는 walletId 단위
**WC 적용:** WC 세션도 walletId 단위. 하나의 wallet에 하나의 WC 세션만 유지.

```typescript
// 1 wallet = 1 WC session 보장
async connect(walletId: string, chain: ChainType, network: string): Promise<ConnectResult> {
  // 기존 세션이 있으면 먼저 해제
  if (this.sessions.has(walletId)) {
    await this.disconnect(walletId);
  }
  // 새 세션 생성
  const { uri, approval } = await this.signClient.connect({ ... });
  // approval promise를 백그라운드에서 대기 (세션 확립 시 DB 저장)
  void approval.then(session => this.onSessionApproved(walletId, session));
  return { uri, topic: /* from pairing */ };
}
```

### Pattern 4: SQLite 직접 접근 (better-sqlite3)

**기존 패턴:** KillSwitchService, TelegramBotService는 better-sqlite3 직접 사용 (Drizzle 우회)
**WC 적용:** WC 세션 영속화 + WC SDK 스토리지 모두 better-sqlite3 직접 사용.

### Pattern 5: 감사 로그 기록

**기존 패턴:** Telegram 승인/거절 시 `TX_APPROVED_VIA_TELEGRAM` / `TX_REJECTED_VIA_TELEGRAM` 감사 로그
**WC 적용:** WC 승인 시 `TX_APPROVED_VIA_WALLETCONNECT` 감사 로그, 세션 연결/해제 시 `WC_SESSION_CONNECTED` / `WC_SESSION_DISCONNECTED` 감사 로그

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: WC SDK 기본 스토리지 사용

**위험:** @walletconnect/keyvaluestorage는 브라우저 localStorage 또는 파일 시스템 기반. Node.js 서버에서 불안정하며, 데몬 재시작 시 파일 시스템 경로 불일치 위험.
**대신:** custom IKeyValueStorage 구현체로 SQLite 기반 스토리지 주입. WAIaaS DB에 `wc_store` 테이블 추가.

### Anti-Pattern 2: WC 세션에 의존하는 파이프라인

**위험:** WC 세션 불안정 시 (relay 다운, 네트워크 문제) 전체 APPROVAL 플로우 차단.
**대신:** WC는 "보너스 채널". 없어도 기존 ownerAuth REST API + Telegram이 100% 동작. WC 실패는 로깅만.

### Anti-Pattern 3: 다중 WC 세션 per wallet

**위험:** 하나의 walletId에 여러 WC 세션이 공존하면 어떤 세션에 요청을 보낼지 모호.
**대신:** 1 wallet = 1 WC session. 새 세션 연결 시 기존 세션 자동 해제.

### Anti-Pattern 4: WC SignClient 다중 인스턴스

**위험:** walletId마다 SignClient를 생성하면 WebSocket 연결 폭증.
**대신:** 단일 SignClient 인스턴스로 모든 walletId의 세션을 관리. 세션별 topic으로 구분.

### Anti-Pattern 5: WC 타임아웃과 approval_timeout 혼동

**위험:** WC 서명 요청 타임아웃(walletconnect.request_timeout = 300s)이 approval_timeout(3600s)보다 짧다. WC 타임아웃 시 트랜잭션을 EXPIRED로 만들면 Telegram 경로가 차단됨.
**대신:** WC 타임아웃은 WC 서명 요청만 종료. ApprovalWorkflow의 approval_timeout은 별도로 관리. WC 타임아웃 후에도 Telegram/REST로 승인 가능.

---

## DB Schema 변경

### 신규 테이블 1: `wc_sessions`

```sql
CREATE TABLE wc_sessions (
  wallet_id    TEXT PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  topic        TEXT NOT NULL UNIQUE,
  peer_meta    TEXT,               -- JSON: { name, url, icons }
  chain_id     TEXT NOT NULL,      -- CAIP-2: 'eip155:1' or 'solana:5eykt...'
  owner_address TEXT NOT NULL,     -- 페어링된 Owner 지갑 주소
  namespaces   TEXT,               -- JSON: approved namespaces
  expiry       INTEGER NOT NULL,   -- Unix epoch seconds
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_wc_sessions_topic ON wc_sessions(topic);
```

### 신규 테이블 2: `wc_store`

```sql
CREATE TABLE wc_store (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### 기존 테이블 변경: `pending_approvals`

```sql
ALTER TABLE pending_approvals ADD COLUMN approval_channel TEXT DEFAULT 'rest_api';
-- CHECK 제약은 pushSchema() 시 Drizzle에서 설정
-- 유효 값: 'rest_api', 'telegram', 'walletconnect'
```

**총 스키마 변경:** 2개 신규 테이블 + 1개 ALTER TABLE = DB v16 마이그레이션

---

## Scalability Considerations

| Concern | 1 지갑 | 10 지갑 | 100+ 지갑 |
|---------|--------|---------|-----------|
| WC 세션 수 | 1 SignClient, 1 세션 | 1 SignClient, 10 세션 (동일 클라이언트) | 1 SignClient, N 세션 (WC SDK 다중 세션 지원) |
| Relay WebSocket | 1 연결 | 1 연결 (세션은 topic으로 구분) | 1 연결 (relay는 topic 기반 라우팅) |
| QR 페어링 빈도 | 설정 시 1회 | 10회 (초기만) | 100회 (초기만) |
| 서명 요청 빈도 | APPROVAL 빈도와 동일 | 10x | 100x (relay 부하 주의, rate limit 확인 필요) |
| 메모리 오버헤드 | ~5MB (SignClient) | ~8MB | ~15MB (세션 메타데이터 누적) |
| wc_store 테이블 | ~50 rows | ~200 rows | ~1000 rows (WC SDK 내부 상태) |

---

## Integration Points Summary

| Integration Point | Existing Component | Change Type | Complexity |
|-------------------|-------------------|-------------|------------|
| WalletConnectService | 없음 (신규) | **NEW** | High |
| SqliteKeyValueStorage | 없음 (신규) | **NEW** | Medium |
| CAIP-2 매핑 유틸리티 | 없음 (신규) | **NEW** | Low |
| WC Admin API routes | 없음 (신규) | **NEW** | Medium |
| Admin UI WC page | 없음 (신규) | **NEW** | Medium |
| Pipeline Stage 3/4 | stages.ts L539-551 | **MODIFY** | Medium |
| PipelineContext | stages.ts L59-101 | **MODIFY** | Low |
| ApprovalWorkflow | approval-workflow.ts | **MODIFY** | Low |
| DaemonLifecycle | daemon.ts start/shutdown | **MODIFY** | Low |
| createApp() deps | server.ts CreateAppDeps | **MODIFY** | Low |
| HotReloadOrchestrator | hot-reload.ts | **MODIFY** | Low |
| SettingDefinitions | setting-keys.ts | **MODIFY** | Low |
| TelegramBotService | telegram-bot-service.ts | **MODIFY** | Low |
| DB Schema v16 | 2 테이블 + 1 ALTER | **MIGRATE** | Medium |

---

## Suggested Build Order

의존 관계 기반 최적 빌드 순서:

### Phase A: 인프라 기반 (WC SDK 통합 + DB)

1. **DB v16 마이그레이션** -- wc_sessions, wc_store 테이블 추가, pending_approvals ALTER
2. **SqliteKeyValueStorage** -- WC SDK 커스텀 스토리지 (wc_store 테이블 기반)
3. **CAIP-2 매핑 유틸리티** -- toCAIP2(), getWCNamespace(), getWCMethods()
4. **WalletConnectService 코어** -- SignClient 초기화, connect(), disconnect(), shutdown()

### Phase B: 서명 요청 + 파이프라인 통합

5. **WalletConnectService.requestSignature()** -- 서명 요청 전송 + 결과 처리
6. **Pipeline 통합** -- PipelineContext 확장, Stage 4에서 WC fire-and-forget 트리거
7. **ApprovalWorkflow 확장** -- approval_channel 기록, WC 승인 -> executeFromStage5
8. **TelegramBotService 수정** -- approval_channel = 'telegram' 기록

### Phase C: Admin API + UI

9. **WC Admin API routes** -- POST /connect, GET /session, GET /sessions, POST /disconnect
10. **Admin UI WC 페이지** -- QR 코드 렌더링 (qrcode npm), 세션 상태 폴링, 연결/해제

### Phase D: 운영 통합

11. **DaemonLifecycle 통합** -- Step 4c-6 초기화, 셧다운 추가
12. **HotReload 통합** -- walletconnect.project_id 변경 시 WC 재초기화
13. **Settings 확장** -- walletconnect.relay_url, walletconnect.request_timeout 추가
14. **감사 로그 + 알림** -- WC_SESSION_CONNECTED, TX_APPROVED_VIA_WALLETCONNECT 이벤트

**순서 근거:**
- Phase A가 먼저: DB 마이그레이션과 스토리지가 WC 초기화의 전제 조건
- Phase B가 Phase A 이후: SignClient가 있어야 서명 요청 가능
- Phase C는 Phase B와 독립 가능하지만, 서명 요청 테스트를 위해 B 이후 권장
- Phase D는 마지막: 모든 컴포넌트가 동작한 후 DaemonLifecycle에 통합

---

## Sources

- [WalletConnect Dapp Usage (Reown Docs)](https://docs.reown.com/advanced/api/sign/dapp-usage) -- HIGH confidence
- [WalletConnect Wallet Usage](https://docs.walletconnect.com/api/sign/wallet-usage) -- MEDIUM confidence
- [@walletconnect/sign-client npm](https://www.npmjs.com/package/@walletconnect/sign-client) -- MEDIUM confidence
- [WalletConnect Session Events Spec](https://specs.walletconnect.com/2.0/specs/clients/sign/session-events) -- HIGH confidence
- [WalletConnect Storage API Spec](https://specs.walletconnect.com/2.0/specs/clients/core/storage) -- MEDIUM confidence
- [@walletconnect/keyvaluestorage npm](https://www.npmjs.com/package/@walletconnect/keyvaluestorage) -- MEDIUM confidence
- [Solana CAIP-2 Namespace](https://namespaces.chainagnostic.org/solana/caip2) -- HIGH confidence
- [WalletConnect Sign API Overview Spec](https://specs.walletconnect.com/2.0/specs/clients/sign) -- HIGH confidence
- [WC Node.js 크래시 이슈 #5588](https://github.com/WalletConnect/walletconnect-monorepo/issues/5588) -- LOW confidence (특정 버전 이슈)
- WAIaaS 코드베이스 분석 (approval-workflow.ts, stages.ts, daemon.ts, setting-keys.ts, telegram-bot-service.ts, notification-service.ts, event-types.ts 등) -- HIGH confidence
