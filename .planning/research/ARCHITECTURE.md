# Architecture Patterns: Incoming Transaction Monitoring

**Domain:** 인바운드 트랜잭션 모니터링 — 기존 WAIaaS 아키텍처 통합
**Researched:** 2026-02-21
**Sources:** 코드베이스 직접 분석 (packages/core, packages/daemon, packages/adapters)

---

## 권고 아키텍처

### 핵심 설계 결정 요약

| 질문 | 권고 결정 | 근거 |
|------|-----------|------|
| IChainSubscriber 위치 | IChainAdapter와 **별도 인터페이스** | 기존 22메서드 어댑터에 상태(WebSocket 연결)를 주입하면 단순 RPC 호출과 구독 생명주기가 섞임 |
| WebSocket 관리 | 모니터링 대상 지갑이 있을 때만 **lazy start** | 구독 비용이 제로인 상태를 기본값으로 유지 |
| 트랜잭션 파싱 위치 | **체인 전용 Normalizer** (어댑터 내부) | raw chain 이벤트 → IncomingTx 정규화는 체인 지식 필요 |
| incoming_transactions 테이블 | **별도 테이블**, walletId FK만 공유 | 상태 머신, 방향, 소스 개념이 outgoing과 다름 |
| EventBus 통합 | 기존 EventBus에 **새 이벤트 타입 추가** | 전용 채널은 과잉 설계. 기존 typed WaiaasEventMap 확장이 일관성 있음 |
| 폴링 폴백 | **BackgroundWorkers.register()** 활용 | 이미 WAL checkpoint, session-cleanup 등과 동일 패턴 |
| monitor_incoming 상태 전파 | **IncomingTxMonitorService**가 wallets 테이블을 직접 조회 | 구독 시작/중지 시 DB SELECT WHERE monitor_incoming=1 실행 |

---

## 컴포넌트 경계

### 기존 컴포넌트 (수정 대상)

| 컴포넌트 | 현재 상태 | 필요한 변경 |
|----------|-----------|-------------|
| `IChainAdapter` (core) | 22 메서드, 상태 없음 | 변경 없음 |
| `WaiaasEventMap` (core) | 5 이벤트 타입 | `transaction:incoming` 이벤트 추가 |
| `NOTIFICATION_EVENT_TYPES` (core) | 28개 | `TX_INCOMING` 추가 |
| `wallets` 테이블 | 기존 컬럼 | `monitor_incoming INTEGER NOT NULL DEFAULT 0` 추가 |
| `DaemonLifecycle` | Step 4c-4 위치에 BalanceMonitor | Step 4c-9 위치에 IncomingTxMonitorService 추가 |
| `migrate.ts` | v20까지 | v21 마이그레이션: wallets.monitor_incoming 컬럼 추가 |

### 신규 컴포넌트

| 컴포넌트 | 위치 | 역할 |
|----------|------|------|
| `IChainSubscriber` | `packages/core/src/interfaces/` | 인바운드 구독 인터페이스 |
| `incoming_transactions` 테이블 | DB schema | 수신 TX 레코드 저장 |
| `IncomingTxMonitorService` | `packages/daemon/src/services/monitoring/` | 구독 오케스트레이터, 생명주기 관리 |
| `SolanaIncomingSubscriber` | `packages/adapters/solana/src/` | Solana logsNotifications 구현 |
| `EvmIncomingSubscriber` | `packages/adapters/evm/src/` | viem getLogs 폴링 구현 |

---

## Q1: IChainSubscriber — 별도 인터페이스로 분리

### 권고: IChainAdapter와 **별도 인터페이스** 작성

IChainAdapter는 stateless request-response 패턴이다. 구독은 stateful 연결(WebSocket)을 보유하며 생명주기가 다르다. 둘을 합치면:

- AdapterPool의 캐싱 키(`chain:network`)가 구독 스코프와 다름 (구독은 지갑 주소별)
- 기존 22메서드 계약 테스트(`chain-adapter-contract.ts`)가 구독 상태에 오염됨
- 어댑터를 구현하는 외부 플러그인이 구독 지원 없이도 동작해야 함

```typescript
// packages/core/src/interfaces/IChainSubscriber.ts

export interface IncomingTransaction {
  txHash: string;
  walletAddress: string;       // 수신 지갑의 온체인 주소
  fromAddress: string | null;  // 발신자 (Solana logs에서 추출 불가 시 null)
  amount: string;              // 최소 단위 (lamports, wei)
  tokenMint?: string;          // SPL/ERC-20 토큰 주소 (네이티브이면 undefined)
  chain: ChainType;
  network: NetworkType;
  blockNumber?: bigint;        // EVM에서 사용
  slot?: bigint;               // Solana에서 사용
  timestamp: number;           // Unix epoch seconds
}

export interface IChainSubscriber {
  /**
   * 지정 주소에 대한 인바운드 TX 구독을 시작한다.
   * 이미 구독 중인 주소는 무시된다 (idempotent).
   */
  subscribe(address: string, onTransaction: (tx: IncomingTransaction) => void): Promise<void>;

  /**
   * 지정 주소의 구독을 취소한다.
   */
  unsubscribe(address: string): Promise<void>;

  /**
   * 현재 구독 중인 주소 목록을 반환한다.
   */
  subscribedAddresses(): string[];

  /**
   * 모든 구독과 WebSocket 연결을 정리한다.
   * DaemonLifecycle.shutdown()에서 호출.
   */
  destroy(): Promise<void>;
}
```

**어댑터와의 관계:** IChainSubscriber는 IChainAdapter의 RPC URL을 공유하지만 별도로 인스턴스화된다. SolanaIncomingSubscriber는 `createSolanaRpcSubscriptions()` WebSocket 클라이언트를 내부적으로 보유하고, EvmIncomingSubscriber는 viem `publicClient`를 재사용한다.

---

## Q2: WebSocket 연결 관리 — lazy initialization

### 권고: **첫 번째 subscribe() 호출 시 lazy 연결**

```
모니터링 대상 지갑 0개 → WebSocket 연결 없음
첫 번째 monitor_incoming=1 지갑 추가 → subscribe() → WebSocket 연결
모든 지갑 monitor_incoming=0으로 변경 → destroy() → 연결 해제
```

**이유:**
- `BalanceMonitorService`가 동일 패턴 사용 (setInterval이 enabled=false면 start() 호출 안 함)
- RPC 제공자 WebSocket 연결은 비용이 있음 (API 할당량, keep-alive)
- 테스트 환경에서 연결 없이 단위 테스트 가능

**연결 재시도:** WebSocket 끊김은 지수 백오프(1s, 2s, 4s, max 30s)로 재연결. 재연결 후 구독 목록을 복원한다.

**데몬 시작 시 처리:**
```
Step 4c-9 (fail-soft):
  1. wallets WHERE monitor_incoming=1 조회
  2. 목록이 비어있으면 IncomingTxMonitorService는 대기 상태 유지
  3. 목록이 있으면 subscriber.subscribe(address) 일괄 등록
```

---

## Q3: 트랜잭션 파싱 — 체인 전용 Normalizer

### 권고: **어댑터 내부 Normalizer**, 서비스 레이어에서는 IncomingTransaction만 처리

체인별 raw 이벤트 형태가 다르다:

| 체인 | raw 이벤트 | 파싱 난이도 |
|------|-----------|------------|
| Solana | `logsNotifications` → signature만 포함, 금액 없음 | HIGH: signature로 getTransaction 추가 호출 필요 |
| EVM | `getLogs` → Transfer(address,address,uint256) event | MEDIUM: address 필터로 수신 여부 판단 가능 |

```
SolanaIncomingSubscriber:
  logsNotifications(mentions: [address]) →
    getTransaction(signature) →        ← 추가 RPC 호출
    parseAccountChanges(tx, address) →
    emit IncomingTransaction

EvmIncomingSubscriber:
  getLogs(address, fromBlock, toBlock) →
    filterToAddress(address) →         ← 이미 logs에 포함
    emit IncomingTransaction
```

**Normalizer 위치:** 각 subscriber 파일 내부의 private 함수. 공통 normalize 레이어 불필요 — 체인 간 raw 형태가 너무 달라서 추상화 비용이 실익보다 크다.

**fromAddress 처리:** Solana에서는 logsNotifications의 signature로 getTransaction을 호출해야 발신자를 알 수 있다. 비용이 크므로 **fromAddress는 Solana에서 NULL 허용**한다.

---

## Q4: incoming_transactions 테이블 — 별도 테이블

### 권고: **완전히 별도인 incoming_transactions 테이블**, transactions와 FK 없음

**분리 이유:**
- `transactions`는 9-state 아웃고잉 파이프라인 상태 머신을 위한 구조
- `incoming_transactions`는 단방향 수신 이력 (DETECTED → CONFIRMED 2-state)
- sessionId, tier, reservedAmount, approvalChannel 등 아웃고잉 전용 컬럼이 인바운드에 없음
- TRANSACTION_TYPES SSoT에 새 타입 추가하면 기존 discriminatedUnion 계약에 영향

**신규 테이블 DDL (v21 마이그레이션):**

```sql
CREATE TABLE IF NOT EXISTS incoming_transactions (
  id TEXT PRIMARY KEY,                        -- UUID v7
  wallet_id TEXT NOT NULL
    REFERENCES wallets(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  network TEXT,
  tx_hash TEXT NOT NULL,
  from_address TEXT,                          -- Solana에서는 NULL 가능
  amount TEXT NOT NULL,                       -- 최소 단위 문자열
  token_mint TEXT,                            -- SPL/ERC-20, NULL이면 네이티브
  status TEXT NOT NULL DEFAULT 'DETECTED'
    CHECK (status IN ('DETECTED', 'CONFIRMED')),
  block_number TEXT,                          -- EVM bigint (TEXT로 저장)
  slot TEXT,                                  -- Solana slot (TEXT로 저장)
  detected_at INTEGER NOT NULL,               -- Unix epoch seconds
  confirmed_at INTEGER,
  raw_metadata TEXT                           -- chain-specific JSON (선택적)
)
```

**인덱스:**
```sql
CREATE UNIQUE INDEX idx_incoming_tx_hash ON incoming_transactions(tx_hash);
CREATE INDEX idx_incoming_wallet_status ON incoming_transactions(wallet_id, status);
CREATE INDEX idx_incoming_detected_at ON incoming_transactions(detected_at);
CREATE INDEX idx_incoming_token_mint ON incoming_transactions(token_mint);
```

**중복 방지:** `tx_hash`에 UNIQUE 제약 — 동일 TX가 재구독 시 중복 삽입되지 않음.

**wallets 테이블 변경 (v21 마이그레이션):**
```sql
ALTER TABLE wallets ADD COLUMN monitor_incoming INTEGER NOT NULL DEFAULT 0;
```
- 0 = 비활성 (기본값, 기존 지갑 영향 없음)
- 1 = 활성

---

## Q5: EventBus 통합 — 기존 버스에 새 이벤트 추가

### 권고: `WaiaasEventMap`에 **`transaction:incoming` 이벤트 타입 추가**

전용 이벤트 채널을 만드는 것은 과잉 설계다. 기존 EventBus가 이미:
- listener 에러 격리 (try/catch per listener)
- typed event map
- removeAllListeners 지원 (shutdown 시 정리 완료)

**코어 변경:**

```typescript
// packages/core/src/events/event-types.ts에 추가

export interface TransactionIncomingEvent {
  walletId: string;
  txHash: string;
  fromAddress: string | null;
  amount: string;
  tokenMint?: string;
  chain: ChainType;
  network: NetworkType;
  timestamp: number;
}

// WaiaasEventMap에 추가:
'transaction:incoming': TransactionIncomingEvent;
```

**NOTIFICATION_EVENT_TYPES에 추가 (28개 → 29개):**
```typescript
'TX_INCOMING'
```

**데이터 흐름:**
```
IChainSubscriber.onTransaction()
  → IncomingTxMonitorService._handleIncoming()
    → INSERT INTO incoming_transactions
    → eventBus.emit('transaction:incoming', {...})
      → NotificationService.notify('TX_INCOMING', walletId, {...})
```

---

## Q6: 폴링 폴백 — BackgroundWorkers 재사용

### 권고: **`BackgroundWorkers.register()`로 EVM 폴링 등록**

EVM은 WebSocket 구독 대신 블록 폴링 방식이 더 안정적이다 (viem `getLogs`는 HTTP도 지원). Solana는 `logsNotifications` WebSocket을 우선 사용하되, WebSocket 불가 시 `getSignaturesForAddress` 폴링으로 폴백.

**EVM 폴링 패턴:**
```typescript
// EvmIncomingSubscriber 내부
// Step 4c-9에서 BackgroundWorkers에 등록
workers.register('incoming-tx-evm', {
  interval: 12_000,  // 12초 (EVM 블록 시간)
  handler: async () => {
    // getLogs(fromBlock: lastProcessedBlock, toBlock: 'latest')
    // per-address 필터
  }
});
```

**Solana WebSocket + 폴링 혼용:**
```typescript
// SolanaIncomingSubscriber 내부
// Primary: logsNotifications (WebSocket)
// Fallback (연결 끊김 >30s): getSignaturesForAddress 폴링
// BackgroundWorkers에 'incoming-tx-solana-poll' 등록 (60초 간격)
```

**기존 workers 목록 (현재 5개 → 7개로 증가):**
- wal-checkpoint (5분)
- session-cleanup (1분)
- delay-expired (5초)
- approval-expired (30초)
- version-check (24시간)
- + `incoming-tx-evm` (12초, 신규)
- + `incoming-tx-solana-poll` (60초, Solana 폴링 폴백, 신규)

---

## Q7: monitor_incoming 상태 전파 — DB 직접 조회

### 권고: **IncomingTxMonitorService가 wallets 테이블을 직접 조회**

BalanceMonitorService가 동일 패턴을 사용하고 있다:
```typescript
// BalanceMonitorService.checkAllWallets()
const wallets = this.sqlite
  .prepare("SELECT id, chain, environment, default_network, public_key FROM wallets WHERE status = 'ACTIVE'")
  .all();
```

동일하게 IncomingTxMonitorService는:
```typescript
private getMonitoredWallets(): WalletMonitorRow[] {
  return this.sqlite
    .prepare(
      "SELECT id, chain, environment, default_network, public_key FROM wallets " +
      "WHERE monitor_incoming = 1 AND status = 'ACTIVE'"
    )
    .all() as WalletMonitorRow[];
}
```

**REST API 연동:** `PUT /v1/wallets/:id` 또는 Admin UI에서 `monitor_incoming` 토글 시:
1. DB 업데이트
2. `IncomingTxMonitorService.syncSubscriptions()` 호출 (신규 추가 → subscribe, 제거 → unsubscribe)

HotReloadOrchestrator 패턴처럼 서비스 참조를 DaemonLifecycle이 보유하고 API 레이어에 주입.

---

## 전체 데이터 흐름

```
[Blockchain] ──logsNotifications/getLogs──▶ [IChainSubscriber impl]
                                                      |
                                              parse & normalize
                                                      |
                                                      v
                                         [IncomingTxMonitorService]
                                          _handleIncoming(tx)
                                              |           |
                                    INSERT INTO    eventBus.emit
                                  incoming_txns  'transaction:incoming'
                                                      |
                                              +-------+-------+
                                              v               v
                                    [NotificationService]  [AutoStopService]
                                    notify('TX_INCOMING')   (감시용)
```

---

## 신규 vs 수정 컴포넌트 명세

### 신규 파일

| 파일 | 역할 |
|------|------|
| `packages/core/src/interfaces/IChainSubscriber.ts` | 구독 인터페이스 |
| `packages/daemon/src/services/monitoring/incoming-tx-monitor-service.ts` | 오케스트레이터 |
| `packages/adapters/solana/src/incoming-subscriber.ts` | Solana logsNotifications 구현 |
| `packages/adapters/evm/src/incoming-subscriber.ts` | EVM getLogs 폴링 구현 |

### 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `packages/core/src/events/event-types.ts` | `transaction:incoming` 이벤트 추가 |
| `packages/core/src/enums/notification.ts` | `TX_INCOMING` 추가 (28→29) |
| `packages/core/src/interfaces/index.ts` | IChainSubscriber export 추가 |
| `packages/core/src/index.ts` | IChainSubscriber 재export |
| `packages/daemon/src/infrastructure/database/schema.ts` | `incoming_transactions` 테이블 Drizzle 스키마, wallets.monitor_incoming |
| `packages/daemon/src/infrastructure/database/migrate.ts` | v21 마이그레이션 |
| `packages/daemon/src/lifecycle/daemon.ts` | Step 4c-9 IncomingTxMonitorService 초기화 |

---

## 빌드 순서 (의존성 순서)

```
1단계: 인터페이스 레이어 (core)
  - IChainSubscriber.ts 신규 작성
  - WaiaasEventMap에 transaction:incoming 추가
  - NOTIFICATION_EVENT_TYPES에 TX_INCOMING 추가

2단계: DB 스키마 (daemon)
  - incoming_transactions Drizzle 스키마 추가
  - wallets.monitor_incoming 컬럼 추가
  - v21 마이그레이션 작성

3단계: 어댑터 구현 (adapters/solana, adapters/evm)
  - SolanaIncomingSubscriber (IChainSubscriber 구현)
  - EvmIncomingSubscriber (IChainSubscriber 구현)
  - 각 어댑터 package index에서 export

4단계: 서비스 레이어 (daemon)
  - IncomingTxMonitorService (구독 오케스트레이터)
  - DaemonLifecycle Step 4c-9에 통합
  - BackgroundWorkers에 폴링 worker 등록

5단계: API 레이어 (daemon)
  - wallet PATCH/PUT 엔드포인트에 monitor_incoming 필드 추가
  - GET /v1/wallets 응답에 monitor_incoming 포함
  - GET /v1/wallets/:id/incoming-transactions 엔드포인트
  - Skill Files 업데이트 (wallet.skill.md, admin.skill.md)
```

---

## 주의해야 할 아키텍처 패턴

### 따라야 할 패턴

**Pattern 1: fail-soft 초기화 (BalanceMonitorService 동일)**
```typescript
// Step 4c-9: IncomingTxMonitorService (fail-soft)
try {
  this.incomingTxMonitor = new IncomingTxMonitorService({...});
  await this.incomingTxMonitor.start();
} catch (err) {
  console.warn('Step 4c-9 (fail-soft): IncomingTxMonitor init warning:', err);
  this.incomingTxMonitor = null;
}
```

**Pattern 2: SSoT enum 추가 (notification.ts + transaction.ts)**
- `NOTIFICATION_EVENT_TYPES`에 `TX_INCOMING` 추가 → 자동으로 Zod, TypeScript, CHECK constraint 전파
- 기존 SSoT 수정 시 CHECK constraint 갱신이 필요한 경우 12-step 마이그레이션 필요
- `notification_logs`는 단순 TEXT column이므로 마이그레이션 불필요

**Pattern 3: tx_hash UNIQUE 중복 방지**
```typescript
// INSERT OR IGNORE를 사용하여 중복 구독 시 중복 레코드 방지
sqlite.prepare(
  'INSERT OR IGNORE INTO incoming_transactions (...) VALUES (?,...)'
).run(...);
```

### 피해야 할 패턴

**Anti-Pattern 1: IChainAdapter에 구독 메서드 추가**
- 22개 메서드 계약 테스트에 영향
- stateless 어댑터에 stateful WebSocket 혼입
- 대신: 별도 IChainSubscriber 사용

**Anti-Pattern 2: incoming_transactions를 transactions에 합침**
- `type='INCOMING'` 추가는 discriminatedUnion 5-type 계약 위반
- 아웃고잉 파이프라인 stage 상태 머신 로직이 인바운드 레코드에 오작동
- 대신: 별도 테이블 사용

**Anti-Pattern 3: 전용 EventBus 인스턴스 생성**
- shutdown 시 `eventBus.removeAllListeners()` 자동 정리가 동작하지 않음
- 대신: 기존 eventBus에 이벤트 타입 추가

---

## 확장성 고려

| 상황 | 접근법 |
|------|--------|
| 지갑 100개 모니터링 | Solana: 100개 logsNotifications 구독 (각 WebSocket message), EVM: 100개 주소를 getLogs address[] 배열로 단일 배치 쿼리 |
| RPC WebSocket 불안정 | 지수 백오프 재연결 + 폴링 폴백으로 연속성 보장 |
| 새 체인 어댑터 추가 | IChainSubscriber 구현만 추가, IncomingTxMonitorService는 변경 없음 |
| 대용량 트래픽 지갑 | incoming_transactions 테이블 파티셔닝 불필요 (SQLite, 로컬 데몬). 초당 수백 TX 이상이면 이미 WAIaaS가 적합하지 않은 규모 |

---

## 소스

- `packages/core/src/interfaces/IChainAdapter.ts` — 기존 22메서드 계약 (수정 대상 아님)
- `packages/core/src/events/event-bus.ts` — EventBus 구현 (재사용)
- `packages/core/src/events/event-types.ts` — WaiaasEventMap (확장 대상)
- `packages/daemon/src/lifecycle/daemon.ts` — 6-step 시작/10-step 종료 시퀀스
- `packages/daemon/src/lifecycle/workers.ts` — BackgroundWorkers 패턴 (재사용)
- `packages/daemon/src/services/monitoring/balance-monitor-service.ts` — 참조 구현 패턴
- `packages/daemon/src/infrastructure/database/migrate.ts` — v20 마이그레이션 패턴
- `packages/daemon/src/infrastructure/database/schema.ts` — Drizzle 스키마 구조
- `@solana/rpc-subscriptions-api@6.0.1` — `logsNotifications(mentions: [address])` 확인
- `viem@2.45.3` — `getLogs`, `watchBlocks` API 확인
