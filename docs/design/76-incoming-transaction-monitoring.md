# 설계 문서 76: 수신 트랜잭션 모니터링

**버전:** 1.0
**작성일:** 2026-02-21
**마일스톤:** v27.0 (설계)
**구현 마일스톤:** m27-01 (예정)

---

## 1. IChainSubscriber 인터페이스

### 1.1 설계 원칙: IChainAdapter와 분리

IChainSubscriber는 IChainAdapter(22메서드, stateless)와 **별도 인터페이스**로 설계한다.

**분리 근거:**
1. **상태 모델 불일치**: IChainAdapter는 stateless 요청-응답 패턴. IChainSubscriber는 WebSocket 연결, 구독 레지스트리, 재연결 상태 등 stateful 장기 실행 패턴
2. **AdapterPool 캐싱 호환성**: AdapterPool은 `Map<key, IChainAdapter>` 구조로 어댑터를 캐싱하며, WebSocket 상태를 혼입하면 eviction 시 구독 유실 발생
3. **계약 테스트 독립성**: IChainAdapter 계약 테스트 26개 메서드(22 + 유틸리티)에 구독 생명주기 테스트를 혼합하면 테스트 복잡도 폭발
4. **단일 책임 원칙**: 아웃고잉 TX 빌드/서명/제출 ↔ 인커밍 TX 감지/파싱은 완전히 다른 관심사

**배치 위치:** `packages/core/src/interfaces/IChainSubscriber.ts`

### 1.2 IncomingTransaction 타입

```typescript
// packages/core/src/interfaces/chain-subscriber.types.ts

export type IncomingTxStatus = 'DETECTED' | 'CONFIRMED';

export interface IncomingTransaction {
  /** UUID v7 (ms 정밀도 정렬) */
  id: string;
  /** 블록체인 트랜잭션 해시 */
  txHash: string;
  /** 수신 지갑 ID (wallets.id FK) */
  walletId: string;
  /** 송신자 주소 */
  fromAddress: string;
  /** 수신 금액 (최소 단위, 문자열) — lamports/wei */
  amount: string;
  /** 토큰 주소 (null = 네이티브 토큰: SOL/ETH) */
  tokenAddress: string | null;
  /** 체인 타입 */
  chain: ChainType;
  /** 네트워크 식별자 */
  network: string;
  /** 2단계 상태 */
  status: IncomingTxStatus;
  /** 블록 번호 (EVM) 또는 슬롯 번호 (Solana) */
  blockNumber: number | null;
  /** 최초 감지 시각 (Unix epoch seconds) */
  detectedAt: number;
  /** 확정 시각 (Unix epoch seconds, CONFIRMED 전환 시) */
  confirmedAt: number | null;
}
```

### 1.3 2단계 상태 모델

```
DETECTED ──→ CONFIRMED
   │
   └──→ (삭제: 롤백 시 retention 정책으로 자연 만료)
```

| 상태 | 의미 | Solana commitment | EVM 기준 |
|------|------|-------------------|----------|
| DETECTED | TX가 블록에 포함됨을 최초 감지 | `confirmed` | 1+ confirmations |
| CONFIRMED | TX가 최종 확정됨 — 롤백 불가 | `finalized` | 12+ confirmations (EVM 체인별 상이) |

**정책:**
- 알림(INCOMING_TX_DETECTED)은 `DETECTED` 시점에 발송 — 사용자 경험 우선
- AI 에이전트 로직 트리거는 `CONFIRMED` 상태에서만 허용 — 자금 안전 우선 (C-03 대응)
- `DETECTED` → `CONFIRMED` 전환은 BackgroundWorkers 확인 루프에서 수행

### 1.4 IChainSubscriber 인터페이스

```typescript
// packages/core/src/interfaces/IChainSubscriber.ts

import type { ChainType, NetworkType } from '../types/index.js';
import type { IncomingTransaction } from './chain-subscriber.types.js';

/**
 * 수신 트랜잭션 감지를 위한 체인별 구독 인터페이스.
 *
 * IChainAdapter와 별도로 설계: stateful 장기 실행 패턴.
 * 구현체: SolanaIncomingSubscriber, EvmIncomingSubscriber
 */
export interface IChainSubscriber {
  /** 체인 타입 */
  readonly chain: ChainType;

  /**
   * 지갑 주소에 대한 수신 TX 구독 시작.
   * 이미 구독 중인 주소는 무시 (idempotent).
   *
   * @param walletId - wallets.id (DB FK)
   * @param address - 블록체인 공개 주소
   * @param network - 네트워크 식별자 (e.g., 'mainnet', 'ethereum-sepolia')
   * @param onTransaction - 수신 TX 감지 시 호출되는 콜백
   */
  subscribe(
    walletId: string,
    address: string,
    network: string,
    onTransaction: (tx: IncomingTransaction) => void,
  ): Promise<void>;

  /**
   * 지갑 주소에 대한 구독 해제.
   * 미구독 주소는 무시 (idempotent).
   */
  unsubscribe(walletId: string): Promise<void>;

  /**
   * 현재 구독 중인 지갑 ID 목록 반환.
   */
  subscribedWallets(): string[];

  /**
   * 모든 구독 해제 + WebSocket/폴링 연결 정리.
   * DaemonLifecycle shutdown 시 호출.
   */
  destroy(): Promise<void>;
}
```

### 1.5 콜백 패턴

`onTransaction` 콜백은 **IncomingTxMonitorService가 주입**한다:

```typescript
// IncomingTxMonitorService 내부
const onTransaction = (tx: IncomingTransaction) => {
  this.memoryQueue.push(tx);  // 메모리 큐에 적재 (C-02 대응: 직접 DB 쓰기 금지)
};

await subscriber.subscribe(walletId, address, network, onTransaction);
```

콜백은 **동기적으로 메모리 큐에 push만** 수행. DB 쓰기는 BackgroundWorkers flush 루프에서 배치 처리.

---

## 2. DB 스키마 + 데이터 레이어

### 2.1 incoming_transactions 테이블

```sql
CREATE TABLE incoming_transactions (
  id TEXT PRIMARY KEY,                                    -- UUID v7
  tx_hash TEXT NOT NULL,                                  -- 블록체인 TX 해시
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  from_address TEXT NOT NULL,                             -- 송신자 주소
  amount TEXT NOT NULL,                                   -- 최소 단위 (lamports/wei)
  token_address TEXT,                                     -- NULL = 네이티브 토큰
  chain TEXT NOT NULL CHECK (chain IN ('solana', 'ethereum')),
  network TEXT NOT NULL,                                  -- e.g., 'mainnet', 'ethereum-sepolia'
  status TEXT NOT NULL DEFAULT 'DETECTED'
    CHECK (status IN ('DETECTED', 'CONFIRMED')),
  block_number INTEGER,                                   -- 슬롯(Solana) / 블록(EVM)
  detected_at INTEGER NOT NULL,                           -- Unix epoch seconds
  confirmed_at INTEGER,                                   -- CONFIRMED 전환 시각
  UNIQUE(tx_hash, wallet_id)                              -- 동일 TX + 동일 지갑 중복 방지
);
```

**인덱스:**
```sql
-- 지갑별 수신 이력 조회 (REST API 커서 페이지네이션)
CREATE INDEX idx_incoming_tx_wallet_detected
  ON incoming_transactions(wallet_id, detected_at DESC);

-- 보존 정책 삭제 대상 조회
CREATE INDEX idx_incoming_tx_detected_at
  ON incoming_transactions(detected_at);

-- 체인+네트워크별 조회
CREATE INDEX idx_incoming_tx_chain_network
  ON incoming_transactions(chain, network);

-- 상태별 조회 (DETECTED → CONFIRMED 확인 루프)
CREATE INDEX idx_incoming_tx_status
  ON incoming_transactions(status)
  WHERE status = 'DETECTED';
```

**UNIQUE 제약 설계:**
- `UNIQUE(tx_hash, wallet_id)`: 동일 TX가 동일 지갑에 중복 삽입되는 것을 방지
- tx_hash 단독 UNIQUE가 아닌 이유: 이론적으로 하나의 TX가 여러 지갑에 수신 가능 (배치 전송)
- `INSERT ... ON CONFLICT(tx_hash, wallet_id) DO NOTHING`: WebSocket + 폴링 동시 수신 시 idempotent

### 2.2 wallets 테이블 확장

```sql
-- v21 마이그레이션으로 추가
ALTER TABLE wallets ADD COLUMN monitor_incoming INTEGER NOT NULL DEFAULT 0;
```

- `monitor_incoming = 0`: 수신 모니터링 비활성 (기본값 — opt-in)
- `monitor_incoming = 1`: 수신 모니터링 활성
- API에서 `PATCH /v1/wallet/:id` 요청으로 변경 가능

### 2.3 커서 저장 테이블

WebSocket 재연결 시 블라인드 구간 복구를 위한 마지막 처리 위치 저장:

```sql
CREATE TABLE incoming_tx_cursors (
  wallet_id TEXT PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  network TEXT NOT NULL,
  -- Solana: 마지막 처리한 트랜잭션 서명
  last_signature TEXT,
  -- EVM: 마지막 처리한 블록 번호
  last_block_number INTEGER,
  -- 공통: 마지막 업데이트 시각
  updated_at INTEGER NOT NULL
);
```

커서 업데이트 시점: BackgroundWorkers flush 배치에서 마지막 TX 처리 후

### 2.4 중복 방지 전략

```
WebSocket 이벤트 ──→ onTransaction() ──→ memoryQueue.push()
                                              │
폴링 이벤트 ────→ onTransaction() ──→ memoryQueue.push()
                                              │
                                              ▼
                    BackgroundWorkers flush (5초 간격)
                              │
                              ▼
              INSERT ... ON CONFLICT(tx_hash, wallet_id) DO NOTHING
              (중복 무시 — idempotent)
```

- WebSocket과 폴링이 동시에 같은 TX를 감지해도 `ON CONFLICT DO NOTHING`으로 안전
- 메모리 큐 내부 중복 제거: flush 전 `Set<txHash+walletId>` 로 deduplicate (선택적 최적화)

### 2.5 보존 정책

```typescript
// BackgroundWorkers 등록
workers.register('incoming-tx-retention', {
  interval: 3600_000, // 1시간마다
  handler: () => {
    const retentionDays = settingsService.get('incoming.retention_days') ?? 90;
    const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 86400;
    sqlite.prepare('DELETE FROM incoming_transactions WHERE detected_at < ?').run(cutoff);
    // 커서도 정리 (지갑 삭제 시 CASCADE로 자동 정리)
  },
});
```

- 기본 보존 기간: 90일 (`incoming_retention_days`)
- SettingsService에서 런타임 변경 가능 (재시작 불필요)
- 삭제 대상은 `idx_incoming_tx_detected_at` 인덱스로 효율적 조회

### 2.6 메모리 큐 + 배치 flush 패턴

SQLite better-sqlite3 단일 라이터 보호를 위한 패턴 (C-02 대응):

```typescript
class IncomingTxQueue {
  private queue: IncomingTransaction[] = [];
  private readonly MAX_BATCH = 100;

  push(tx: IncomingTransaction): void {
    this.queue.push(tx);
  }

  flush(sqlite: Database): number {
    if (this.queue.length === 0) return 0;

    const batch = this.queue.splice(0, this.MAX_BATCH);
    const stmt = sqlite.prepare(`
      INSERT INTO incoming_transactions
        (id, tx_hash, wallet_id, from_address, amount, token_address,
         chain, network, status, block_number, detected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tx_hash, wallet_id) DO NOTHING
    `);

    const insertMany = sqlite.transaction((txs: IncomingTransaction[]) => {
      let inserted = 0;
      for (const tx of txs) {
        const result = stmt.run(
          tx.id, tx.txHash, tx.walletId, tx.fromAddress, tx.amount,
          tx.tokenAddress, tx.chain, tx.network, tx.status,
          tx.blockNumber, tx.detectedAt,
        );
        if (result.changes > 0) inserted++;
      }
      return inserted;
    });

    return insertMany(batch);
  }
}
```

**BackgroundWorkers 등록:**
```typescript
workers.register('incoming-tx-flush', {
  interval: 5_000, // 5초마다
  handler: () => {
    const inserted = incomingTxQueue.flush(sqlite);
    if (inserted > 0) {
      // 이벤트 발행은 flush 완료 후
      eventBus.emit('transaction:incoming', { count: inserted });
    }
  },
});
```

### 2.7 v21 마이그레이션 전략

```typescript
// packages/daemon/src/infrastructure/database/migrate.ts

MIGRATIONS.push({
  version: 21,
  description: 'Add incoming transaction monitoring tables and wallet opt-in column',
  up: (sqlite) => {
    // 1. wallets 테이블에 monitor_incoming 컬럼 추가
    sqlite.exec('ALTER TABLE wallets ADD COLUMN monitor_incoming INTEGER NOT NULL DEFAULT 0');

    // 2. incoming_transactions 테이블 생성
    sqlite.exec(`
      CREATE TABLE incoming_transactions (
        id TEXT PRIMARY KEY,
        tx_hash TEXT NOT NULL,
        wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
        from_address TEXT NOT NULL,
        amount TEXT NOT NULL,
        token_address TEXT,
        chain TEXT NOT NULL CHECK (chain IN ('solana', 'ethereum')),
        network TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DETECTED' CHECK (status IN ('DETECTED', 'CONFIRMED')),
        block_number INTEGER,
        detected_at INTEGER NOT NULL,
        confirmed_at INTEGER,
        UNIQUE(tx_hash, wallet_id)
      )
    `);

    // 3. incoming_tx_cursors 테이블 생성
    sqlite.exec(`
      CREATE TABLE incoming_tx_cursors (
        wallet_id TEXT PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
        chain TEXT NOT NULL,
        network TEXT NOT NULL,
        last_signature TEXT,
        last_block_number INTEGER,
        updated_at INTEGER NOT NULL
      )
    `);

    // 4. 인덱스 생성
    sqlite.exec('CREATE INDEX idx_incoming_tx_wallet_detected ON incoming_transactions(wallet_id, detected_at DESC)');
    sqlite.exec('CREATE INDEX idx_incoming_tx_detected_at ON incoming_transactions(detected_at)');
    sqlite.exec('CREATE INDEX idx_incoming_tx_chain_network ON incoming_transactions(chain, network)');
    sqlite.exec('CREATE INDEX idx_incoming_tx_status ON incoming_transactions(status) WHERE status = \'DETECTED\'');
  },
});

// LATEST_SCHEMA_VERSION = 21 (20 → 21)
```

**마이그레이션 특성:**
- `managesOwnTransaction: false` (기본값) — ALTER TABLE + CREATE TABLE은 단순 DDL이므로 자동 트랜잭션 래핑으로 충분
- 기존 데이터 변환 없음 — 신규 테이블 생성 + 컬럼 추가만
- 롤백: 설계 문서에서는 롤백 전략을 별도 정의하지 않음 (SQLite ALTER TABLE DROP COLUMN은 3.35.0+에서 가능하나 운영 환경에서의 롤백은 DB 백업 복원 권장)

---

## 3. Solana 수신 감지 전략

### 3.1 구독 방식: logsSubscribe({ mentions })

Solana RPC의 `logsSubscribe` 메서드를 사용하여 지갑 주소가 관여하는 모든 트랜잭션 로그를 구독한다.

```typescript
// @solana/kit API 패턴
const rpcSubscriptions = createSolanaRpcSubscriptions(wsUrl);

// 지갑 주소를 mentions로 구독 — SOL + 모든 SPL 토큰 감지
const logsNotifications = rpcSubscriptions.logsNotifications(
  { mentions: [walletAddress] },
  { commitment: 'confirmed' },
);

// AsyncIterable 소비
for await (const notification of logsNotifications) {
  const { signature, err } = notification.value;
  if (err) continue; // 실패 TX 무시
  // signature로 TX 상세 조회 후 파싱
  await processSignature(signature);
}
```

**핵심 특성:**
- `mentions: [walletAddress]` — 해당 주소가 관여하는 **모든** TX를 캐치 (SOL 전송, SPL 전송, ATA 생성 등)
- 지갑당 **별도 구독** 필요 — `mentions`는 배열이지만 Solana RPC는 단일 주소만 허용 (QuickNode 확인)
- commitment: `confirmed` → 빠른 감지, `finalized` → CONFIRMED 전환 시 별도 확인

### 3.2 TX 파싱 알고리즘

`logsSubscribe`는 signature만 반환하므로, `getTransaction(signature, { encoding: 'jsonParsed' })`로 상세 정보를 조회한다.

#### 3.2.1 SOL 네이티브 전송 감지

```typescript
async function parseSOLTransfer(
  tx: ParsedTransactionWithMeta,
  walletAddress: string,
): IncomingTransaction | null {
  const { meta, transaction } = tx;
  if (!meta || meta.err) return null;

  // 1. 지갑 주소의 계정 인덱스 찾기
  const accountKeys = transaction.message.accountKeys;
  const walletIndex = accountKeys.findIndex(
    (key) => key.pubkey.toString() === walletAddress,
  );
  if (walletIndex === -1) return null;

  // 2. preBalances/postBalances 비교로 SOL 수신 금액 계산
  const preBalance = BigInt(meta.preBalances[walletIndex]);
  const postBalance = BigInt(meta.postBalances[walletIndex]);
  const delta = postBalance - preBalance;

  if (delta <= 0n) return null; // 수신이 아님 (발신 또는 변화 없음)

  // 3. 송신자 추정: SOL 잔액이 감소한 최초 계정
  const fromIndex = meta.preBalances.findIndex((pre, i) => {
    if (i === walletIndex) return false;
    return BigInt(pre) > BigInt(meta.postBalances[i]);
  });
  const fromAddress = fromIndex >= 0
    ? accountKeys[fromIndex].pubkey.toString()
    : 'unknown';

  return {
    id: generateUUIDv7(),
    txHash: tx.transaction.signatures[0],
    walletId: '', // IncomingTxMonitorService에서 채움
    fromAddress,
    amount: delta.toString(),
    tokenAddress: null, // 네이티브 SOL
    chain: 'solana',
    network: '', // 호출 시 주입
    status: 'DETECTED',
    blockNumber: tx.slot,
    detectedAt: Math.floor(Date.now() / 1000),
    confirmedAt: null,
  };
}
```

#### 3.2.2 SPL 토큰 전송 감지

```typescript
async function parseSPLTransfer(
  tx: ParsedTransactionWithMeta,
  walletAddress: string,
): IncomingTransaction[] {
  const { meta } = tx;
  if (!meta || meta.err) return [];

  const results: IncomingTransaction[] = [];

  // preTokenBalances/postTokenBalances 비교
  const preMap = new Map<string, { amount: bigint; mint: string; owner: string }>();
  for (const tb of meta.preTokenBalances ?? []) {
    if (tb.owner === walletAddress) {
      preMap.set(tb.mint, {
        amount: BigInt(tb.uiTokenAmount.amount),
        mint: tb.mint,
        owner: tb.owner,
      });
    }
  }

  for (const tb of meta.postTokenBalances ?? []) {
    if (tb.owner !== walletAddress) continue;

    const pre = preMap.get(tb.mint);
    const preAmount = pre?.amount ?? 0n; // 최초 수신 시 pre 없음 → 0n
    const postAmount = BigInt(tb.uiTokenAmount.amount);
    const delta = postAmount - preAmount;

    if (delta <= 0n) continue;

    // 송신자: 같은 mint에서 잔액이 감소한 owner
    let fromAddress = 'unknown';
    for (const preTb of meta.preTokenBalances ?? []) {
      if (preTb.mint !== tb.mint || preTb.owner === walletAddress) continue;
      const postTb = meta.postTokenBalances?.find(
        (p) => p.mint === preTb.mint && p.owner === preTb.owner,
      );
      if (postTb && BigInt(preTb.uiTokenAmount.amount) > BigInt(postTb.uiTokenAmount.amount)) {
        fromAddress = preTb.owner;
        break;
      }
    }

    results.push({
      id: generateUUIDv7(),
      txHash: tx.transaction.signatures[0],
      walletId: '',
      fromAddress,
      amount: delta.toString(),
      tokenAddress: tb.mint, // SPL 토큰 mint 주소
      chain: 'solana',
      network: '',
      status: 'DETECTED',
      blockNumber: tx.slot,
      detectedAt: Math.floor(Date.now() / 1000),
      confirmedAt: null,
    });
  }

  return results;
}
```

### 3.3 Token-2022 지원

SPL Token Program과 Token-2022 Program 양쪽 모두 지원:

| 프로그램 | Program ID | 감지 방법 |
|---------|------------|-----------|
| SPL Token | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | preTokenBalances/postTokenBalances |
| Token-2022 | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` | 동일한 preTokenBalances/postTokenBalances 메커니즘 |

- `getTransaction(jsonParsed)` 응답의 `preTokenBalances`/`postTokenBalances`는 **프로그램 구분 없이** 모든 토큰 잔액 변화를 포함
- 별도 필터링 불필요 — `owner === walletAddress` 조건만으로 양쪽 프로그램 토큰 모두 감지

### 3.4 ATA 2레벨 구독

Solana SPL 토큰은 지갑 주소가 아닌 **ATA(Associated Token Account)** 에서 잔액이 변경된다.

#### 레벨 1: 기존 ATA 구독

`logsSubscribe({ mentions: [walletAddress] })`는 지갑이 관여하는 모든 TX를 감지하므로, **기존 ATA에 대한 전송도 자동 감지**된다. 별도 ATA 주소 구독 불필요.

#### 레벨 2: 신규 ATA 생성 감지

최초 토큰 수신 시 ATA가 자동 생성된다. 이 경우:
1. `logsSubscribe({ mentions: [walletAddress] })`가 ATA 생성 TX를 감지 (지갑이 owner이므로 mentions에 포함)
2. `getTransaction(jsonParsed)` 응답의 `postTokenBalances`에 해당 mint의 새 항목이 추가됨
3. `preTokenBalances`에 해당 mint 항목이 없으므로 `preAmount = 0n` 처리 (§3.2.2 로직)

**결론:** `mentions` 구독 방식으로 ATA 2레벨 구독이 **자연스럽게 해결**됨. 별도 메커니즘 불필요.

### 3.5 폴링 폴백: getSignaturesForAddress

WebSocket 연결 불가 시 HTTP RPC 폴링으로 전환:

```typescript
async function pollSolanaTransactions(
  rpc: SolanaRpc,
  walletAddress: string,
  lastSignature: string | null,
): Promise<string[]> {
  const options: GetSignaturesForAddressOptions = {
    limit: 100,
    commitment: 'confirmed',
  };

  if (lastSignature) {
    options.until = lastSignature; // lastSignature 이후의 TX만 조회
  }

  const signatures = await rpc.getSignaturesForAddress(
    walletAddress,
    options,
  ).send();

  // 최신 순으로 반환되므로 역순 처리 (오래된 것부터)
  return signatures
    .filter((s) => !s.err) // 실패 TX 제외
    .reverse()
    .map((s) => s.signature);
}
```

**커서 관리:**
- `lastSignature`를 `incoming_tx_cursors.last_signature`에 저장
- 최초 구독 시 `lastSignature = null` → 최근 100개 TX 조회 (과거 백필은 하지 않음 — Out of Scope)
- 폴링 간격: `incoming_poll_interval` 설정값 (기본 30초)

### 3.6 Commitment 정책

| 단계 | Commitment | 용도 |
|------|-----------|------|
| 감지 | `confirmed` | 빠른 알림 발송 (~400ms 후 확정 가능) |
| 확정 | `finalized` | DB 상태 DETECTED → CONFIRMED 전환 |

**확정 확인 루프:**
```typescript
// BackgroundWorkers 등록 (30초 간격)
workers.register('incoming-tx-confirm-solana', {
  interval: 30_000,
  handler: async () => {
    const pending = sqlite.prepare(
      "SELECT * FROM incoming_transactions WHERE chain = 'solana' AND status = 'DETECTED'"
    ).all();

    for (const tx of pending) {
      const result = await rpc.getTransaction(tx.tx_hash, {
        commitment: 'finalized',
      }).send();

      if (result) {
        sqlite.prepare(
          "UPDATE incoming_transactions SET status = 'CONFIRMED', confirmed_at = ? WHERE id = ?"
        ).run(Math.floor(Date.now() / 1000), tx.id);
      }
      // result가 null이면 아직 finalized 아님 — 다음 루프에서 재시도
    }
  },
});
```

### 3.7 SolanaIncomingSubscriber 전체 구조

```typescript
// packages/adapters/solana/src/solana-incoming-subscriber.ts

export class SolanaIncomingSubscriber implements IChainSubscriber {
  readonly chain = 'solana' as ChainType;

  private subscriptions = new Map<string, {
    address: string;
    network: string;
    abortController: AbortController;
    onTransaction: (tx: IncomingTransaction) => void;
  }>();

  private rpcUrl: string;
  private wsUrl: string;
  private mode: 'websocket' | 'polling';

  constructor(config: { rpcUrl: string; wsUrl: string; mode?: 'websocket' | 'polling' }) {
    this.rpcUrl = config.rpcUrl;
    this.wsUrl = config.wsUrl;
    this.mode = config.mode ?? 'websocket';
  }

  async subscribe(
    walletId: string,
    address: string,
    network: string,
    onTransaction: (tx: IncomingTransaction) => void,
  ): Promise<void> {
    if (this.subscriptions.has(walletId)) return; // idempotent

    const abortController = new AbortController();
    this.subscriptions.set(walletId, { address, network, abortController, onTransaction });

    if (this.mode === 'websocket') {
      this.startWebSocketSubscription(walletId, address, network, onTransaction, abortController);
    } else {
      // 폴링은 BackgroundWorkers에서 주기적 호출
    }
  }

  async unsubscribe(walletId: string): Promise<void> {
    const sub = this.subscriptions.get(walletId);
    if (!sub) return; // idempotent
    sub.abortController.abort();
    this.subscriptions.delete(walletId);
  }

  subscribedWallets(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  async destroy(): Promise<void> {
    for (const [walletId] of this.subscriptions) {
      await this.unsubscribe(walletId);
    }
  }

  private startWebSocketSubscription(
    walletId: string,
    address: string,
    network: string,
    onTransaction: (tx: IncomingTransaction) => void,
    abortController: AbortController,
  ): void {
    // logsNotifications + getTransaction 파싱 루프 시작
    // 상세 구현은 §3.1 + §3.2 참조
    // 재연결은 Phase 218에서 정의
  }
}
```
