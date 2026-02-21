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
   * WebSocket 연결 시작. 폴링 전용 구현체는 즉시 resolve (no-op).
   * reconnectLoop(§5.2)에서 호출.
   */
  connect(): Promise<void>;

  /**
   * WebSocket 연결 끊김 대기. 연결 중단 시 resolve.
   * 폴링 전용 구현체는 never-resolving Promise 반환.
   * reconnectLoop(§5.2)에서 호출.
   */
  waitForDisconnect(): Promise<void>;

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

  async connect(): Promise<void> {
    // WebSocket 연결 시작: wsUrl에 연결 후 구독 중인 모든 지갑에 대해
    // logsSubscribe({ mentions }) 재등록
    // 실패 시 throw → reconnectLoop가 catch하여 재시도
  }

  async waitForDisconnect(): Promise<void> {
    // WebSocket 연결 종료 시 resolve하는 Promise 반환
    // AbortController.signal 또는 WebSocket 'close' 이벤트로 감지
    return new Promise((resolve) => {
      this.ws?.addEventListener('close', () => resolve(), { once: true });
    });
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

---

## 4. EVM 수신 감지 전략

### 4.1 감지 방식 결정: 폴링 우선

EVM 수신 감지는 **폴링(getLogs) 우선** 전략을 채택한다.

**근거:**
1. `getLogs`는 HTTP RPC로 동작 — WebSocket 연결 관리 복잡도 제거
2. viem의 `watchEvent`는 내부적으로 `eth_subscribe` 또는 폴링을 자동 선택 — transport에 따라 동작이 달라져 예측 어려움
3. Self-hosted 환경에서 WebSocket RPC 가용성이 보장되지 않음
4. EVM 블록 간격(~12초)이 폴링 간격과 자연스럽게 일치

**WebSocket 전환 조건:** config.toml `incoming_mode = 'websocket'` 설정 시 `watchEvent(poll: false)` + `watchBlocks` 방식으로 전환 (Phase 218에서 상세화)

### 4.2 ERC-20 Transfer 이벤트 감지

```typescript
// viem getLogs 폴링 패턴
import { parseAbiItem, type Address, type Log } from 'viem';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

async function pollERC20Transfers(
  client: PublicClient,
  walletAddress: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Log[]> {
  return client.getLogs({
    event: TRANSFER_EVENT,
    args: {
      to: walletAddress, // indexed 파라미터로 수신자 필터
    },
    fromBlock,
    toBlock,
  });
}
```

**Transfer 이벤트 토픽:**
```
topic[0] = keccak256("Transfer(address,address,uint256)")
         = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
topic[2] = walletAddress (to — indexed)
```

### 4.3 네이티브 ETH 수신 감지

ERC-20 Transfer 이벤트로는 네이티브 ETH 이체를 감지할 수 없다 — 이벤트 로그를 생성하지 않기 때문.

```typescript
async function pollNativeETHTransfers(
  client: PublicClient,
  walletAddress: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<IncomingTransaction[]> {
  const results: IncomingTransaction[] = [];

  for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
    const block = await client.getBlock({
      blockNumber: blockNum,
      includeTransactions: true,
    });

    for (const tx of block.transactions) {
      if (typeof tx === 'string') continue; // hash-only 건너뜀

      // to 주소가 지갑이고 value > 0인 TX = 네이티브 ETH 수신
      if (
        tx.to?.toLowerCase() === walletAddress.toLowerCase() &&
        tx.value > 0n
      ) {
        results.push({
          id: generateUUIDv7(),
          txHash: tx.hash,
          walletId: '',
          fromAddress: tx.from,
          amount: tx.value.toString(),
          tokenAddress: null, // 네이티브 ETH
          chain: 'ethereum',
          network: '',
          status: 'DETECTED',
          blockNumber: Number(blockNum),
          detectedAt: Math.floor(Date.now() / 1000),
          confirmedAt: null,
        });
      }
    }
  }

  return results;
}
```

**주의:** 블록별 `getBlock(includeTransactions: true)` 호출은 RPC 부하가 높음. 최적화 전략:
- 한 번에 최대 10블록씩 조회 (약 2분 분량)
- BackgroundWorkers 간격 12초 (1블록 = ~12초)
- 빈 블록(walletAddress TX 없음)은 빠르게 스킵

### 4.4 token_registry 화이트리스트 필터

Transfer 이벤트 오탐 방지를 위해 `token_registry` 테이블의 등록 토큰만 유효한 수신으로 처리:

```typescript
function filterByTokenRegistry(
  logs: Log[],
  sqlite: Database,
  walletId: string,
): Log[] {
  // 1. 해당 지갑이 속한 체인의 등록된 토큰 목록 조회
  const registeredTokens = sqlite.prepare(
    "SELECT token_address FROM token_registry WHERE chain = 'ethereum'"
  ).all() as { token_address: string }[];

  const registeredSet = new Set(
    registeredTokens.map((t) => t.token_address.toLowerCase()),
  );

  // 2. 등록되지 않은 토큰의 Transfer 이벤트는 SUSPICIOUS로 분류 (§6 참조)
  return logs.filter((log) => {
    const contractAddress = log.address.toLowerCase();
    if (registeredSet.has(contractAddress)) {
      return true; // 등록된 토큰 — 정상 수신
    }
    // 미등록 토큰 — INCOMING_TX_SUSPICIOUS 이벤트로 분류 (Phase 219)
    return false;
  });
}
```

**정책:**
- 등록된 토큰: `INCOMING_TX_DETECTED` 이벤트 발행
- 미등록 토큰: `INCOMING_TX_SUSPICIOUS` 이벤트 발행 (의심 사유: `unknownToken`)
- 미등록 토큰도 `incoming_transactions` 테이블에 저장 (기록은 유지)

### 4.5 폴링 커서 관리

```typescript
interface EvmPollingState {
  lastProcessedBlock: bigint;
}

async function getPollingCursor(
  sqlite: Database,
  walletId: string,
): Promise<bigint> {
  const cursor = sqlite.prepare(
    'SELECT last_block_number FROM incoming_tx_cursors WHERE wallet_id = ?'
  ).get(walletId) as { last_block_number: number } | undefined;

  if (cursor?.last_block_number) {
    return BigInt(cursor.last_block_number);
  }

  // 커서 없음 — 현재 블록부터 시작 (과거 백필 없음)
  return 0n; // IncomingTxMonitorService에서 현재 블록 번호로 초기화
}

async function updatePollingCursor(
  sqlite: Database,
  walletId: string,
  chain: string,
  network: string,
  blockNumber: bigint,
): Promise<void> {
  sqlite.prepare(`
    INSERT INTO incoming_tx_cursors (wallet_id, chain, network, last_block_number, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(wallet_id) DO UPDATE SET
      last_block_number = excluded.last_block_number,
      updated_at = excluded.updated_at
  `).run(walletId, chain, network, Number(blockNumber), Math.floor(Date.now() / 1000));
}
```

### 4.6 Confirmation 정책

| 체인 | 확정 기준 | 블록 수 | 시간 |
|------|----------|---------|------|
| Ethereum Mainnet | 12 confirmations | ~12 blocks | ~2.4분 |
| Ethereum Sepolia | 3 confirmations | ~3 blocks | ~36초 |
| Base/Arbitrum/등 L2 | 1 confirmation | ~1 block | 즉시 |

```typescript
const CONFIRMATION_THRESHOLDS: Record<string, number> = {
  'ethereum-mainnet': 12,
  'ethereum-sepolia': 3,
  'base-mainnet': 1,
  'base-sepolia': 1,
  'arbitrum-mainnet': 1,
  'arbitrum-sepolia': 1,
};

// BackgroundWorkers 확인 루프 (30초 간격)
workers.register('incoming-tx-confirm-evm', {
  interval: 30_000,
  handler: async () => {
    const pending = sqlite.prepare(
      "SELECT * FROM incoming_transactions WHERE chain = 'ethereum' AND status = 'DETECTED'"
    ).all();

    const currentBlock = await client.getBlockNumber();

    for (const tx of pending) {
      const threshold = CONFIRMATION_THRESHOLDS[tx.network] ?? 12;
      if (tx.block_number && currentBlock - BigInt(tx.block_number) >= BigInt(threshold)) {
        sqlite.prepare(
          "UPDATE incoming_transactions SET status = 'CONFIRMED', confirmed_at = ? WHERE id = ?"
        ).run(Math.floor(Date.now() / 1000), tx.id);
      }
    }
  },
});
```

### 4.7 EvmIncomingSubscriber 전체 구조

```typescript
// packages/adapters/evm/src/evm-incoming-subscriber.ts

export class EvmIncomingSubscriber implements IChainSubscriber {
  readonly chain = 'ethereum' as ChainType;

  private subscriptions = new Map<string, {
    address: string;
    network: string;
    onTransaction: (tx: IncomingTransaction) => void;
    lastBlock: bigint;
  }>();

  private rpcUrl: string;
  private client: PublicClient;

  constructor(config: { rpcUrl: string }) {
    this.rpcUrl = config.rpcUrl;
    this.client = createPublicClient({
      transport: http(config.rpcUrl),
    });
  }

  async subscribe(
    walletId: string,
    address: string,
    network: string,
    onTransaction: (tx: IncomingTransaction) => void,
  ): Promise<void> {
    if (this.subscriptions.has(walletId)) return;

    const currentBlock = await this.client.getBlockNumber();
    this.subscriptions.set(walletId, {
      address,
      network,
      onTransaction,
      lastBlock: currentBlock,
    });
  }

  async unsubscribe(walletId: string): Promise<void> {
    this.subscriptions.delete(walletId);
  }

  subscribedWallets(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /** 폴링 전용: no-op (즉시 resolve) */
  async connect(): Promise<void> {
    // EVM은 폴링 우선(D-06) — WebSocket 연결 불필요
  }

  /** 폴링 전용: never-resolving Promise (폴링 모드에서 reconnectLoop 블록 방지) */
  async waitForDisconnect(): Promise<void> {
    // 영원히 resolve하지 않음 — reconnectLoop가 EVM에 대해서는
    // connect() 즉시 성공 → waitForDisconnect()에서 무한 대기
    // → WebSocket 실패/폴링 전환이 필요 없는 구조
    return new Promise(() => {});
  }

  async destroy(): Promise<void> {
    this.subscriptions.clear();
  }

  /**
   * BackgroundWorkers에서 호출 — 모든 구독 지갑에 대해 폴링 수행
   */
  async pollAll(): Promise<void> {
    const currentBlock = await this.client.getBlockNumber();

    for (const [walletId, sub] of this.subscriptions) {
      try {
        if (sub.lastBlock >= currentBlock) continue;

        const toBlock = sub.lastBlock + 10n < currentBlock
          ? sub.lastBlock + 10n
          : currentBlock;

        // ERC-20 Transfer 이벤트 조회
        const erc20Txs = await this.pollERC20(sub.address, sub.lastBlock + 1n, toBlock, walletId, sub.network);
        // 네이티브 ETH 수신 조회
        const ethTxs = await this.pollNativeETH(sub.address, sub.lastBlock + 1n, toBlock, walletId, sub.network);

        for (const tx of [...erc20Txs, ...ethTxs]) {
          sub.onTransaction(tx);
        }

        sub.lastBlock = toBlock;
      } catch (err) {
        // Per-wallet error isolation
        console.warn(`EVM poll failed for wallet ${walletId}:`, err);
      }
    }
  }

  private async pollERC20(...): Promise<IncomingTransaction[]> { /* §4.2 */ }
  private async pollNativeETH(...): Promise<IncomingTransaction[]> { /* §4.3 */ }
}
```

---

## 5. WebSocket 연결 관리 + 폴링 폴백

### 5.1 연결 상태 머신

WebSocket과 폴링 간 자동 전환을 상태 머신으로 관리한다.

```
                    ┌──────────────────────┐
                    │                      │
                    ▼                      │
  ┌──────────┐   WS 연결    ┌──────────┐   │   WS 복구
  │          │──────────→│          │───┘
  │ POLLING  │            │ WEBSOCKET│
  │          │←──────────│          │
  └──────────┘   WS 실패    └──────────┘
       │                       │
       │    ┌──────────┐       │
       └──→│          │←──────┘
            │ DISABLED │ (incoming_enabled=false)
            │          │
            └──────────┘
```

| 상태 | 설명 | 동작 |
|------|------|------|
| WEBSOCKET | WebSocket 구독 활성 | 실시간 이벤트 수신 |
| POLLING | 폴링 모드 (WebSocket 불가) | BackgroundWorkers 주기적 조회 |
| DISABLED | 모니터링 비활성 | 구독/폴링 없음 |

**상태 전환 규칙:**
- `WEBSOCKET → POLLING`: WebSocket 연결 끊김 + 재연결 3회 실패 시 자동 전환
- `POLLING → WEBSOCKET`: 재연결 성공 시 자동 복귀 (백그라운드 재연결 시도 유지)
- `* → DISABLED`: `incoming_enabled = false` 설정 또는 KillSwitch SUSPENDED 시
- `DISABLED → POLLING/WEBSOCKET`: `incoming_enabled = true` 복원 시

### 5.2 재연결 지수 백오프

```typescript
interface ReconnectConfig {
  initialDelayMs: number;   // 1000 (1초)
  maxDelayMs: number;       // 60000 (60초)
  maxAttempts: number;      // Infinity (무한 재시도)
  jitterFactor: number;     // 0.3 (±30% 랜덤 지터)
}

const DEFAULT_RECONNECT: ReconnectConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  maxAttempts: Infinity,
  jitterFactor: 0.3,
};

function calculateDelay(attempt: number, config: ReconnectConfig): number {
  // 지수 백오프: 1s → 2s → 4s → 8s → 16s → 32s → 60s (cap)
  const baseDelay = Math.min(
    config.initialDelayMs * Math.pow(2, attempt),
    config.maxDelayMs,
  );

  // 지터 추가: ±30%
  const jitter = baseDelay * config.jitterFactor * (2 * Math.random() - 1);
  return Math.max(100, Math.floor(baseDelay + jitter));
}
```

**재연결 루프:**
```typescript
async function reconnectLoop(
  subscriber: IChainSubscriber,
  config: ReconnectConfig,
  onStateChange: (state: 'WEBSOCKET' | 'POLLING') => void,
): Promise<void> {
  let attempt = 0;

  while (true) {
    try {
      await subscriber.connect(); // WebSocket 연결 시도
      attempt = 0; // 성공 시 카운터 리셋
      onStateChange('WEBSOCKET');
      await subscriber.waitForDisconnect(); // 연결 끊길 때까지 대기
    } catch {
      attempt++;
      if (attempt >= 3) {
        onStateChange('POLLING'); // 3회 실패 시 폴링 전환
      }
      const delay = calculateDelay(attempt, config);
      await sleep(delay);
    }
  }
}
```

### 5.3 Heartbeat

| 체인 | 이슈 | Heartbeat 전략 |
|------|------|----------------|
| Solana | 10분 inactivity timeout (Helius/QuickNode) | 60초 ping 간격 |
| EVM | viem WebSocket transport 내장 keepAlive | `keepAlive: { interval: 30_000 }` |

**Solana heartbeat 구현:**
```typescript
class SolanaHeartbeat {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly INTERVAL_MS = 60_000; // 60초

  start(ws: WebSocket): void {
    this.stop();
    this.timer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping(); // WebSocket ping frame
      }
    }, this.INTERVAL_MS);
    this.timer.unref(); // 프로세스 종료 차단 방지
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
```

**EVM heartbeat:**
```typescript
// viem WebSocket transport — 내장 keepAlive 사용
const wsTransport = webSocket(wsUrl, {
  keepAlive: { interval: 30_000 }, // 30초 ping
  reconnect: { attempts: 10 },     // 자동 재연결 10회
});
```

### 5.4 WebSocket 멀티플렉서

같은 체인+네트워크의 여러 지갑이 **하나의 WebSocket 연결을 공유**한다.

```typescript
class SubscriptionMultiplexer {
  // 체인+네트워크별 단일 WebSocket 연결
  private connections = new Map<string, {
    ws: WebSocket; // 또는 viem PublicClient
    heartbeat: SolanaHeartbeat;
    subscriptions: Map<string, WalletSubscription>; // walletId → subscription
  }>();

  /**
   * 연결 키: "solana:mainnet" 또는 "ethereum:ethereum-mainnet"
   */
  private connectionKey(chain: string, network: string): string {
    return `${chain}:${network}`;
  }

  async addWallet(
    walletId: string,
    address: string,
    chain: string,
    network: string,
    rpcWsUrl: string,
    onTransaction: (tx: IncomingTransaction) => void,
  ): Promise<void> {
    const key = this.connectionKey(chain, network);
    let conn = this.connections.get(key);

    if (!conn) {
      // 새 연결 생성
      const ws = await this.createConnection(chain, rpcWsUrl);
      conn = {
        ws,
        heartbeat: new SolanaHeartbeat(),
        subscriptions: new Map(),
      };
      this.connections.set(key, conn);
      if (chain === 'solana') conn.heartbeat.start(ws);
    }

    // 지갑별 구독 추가
    conn.subscriptions.set(walletId, {
      address,
      network,
      onTransaction,
      unsubscribeFn: null, // 체인별 구독 해제 함수
    });

    // 체인별 구독 시작
    await this.startSubscription(conn, walletId, address, chain, network);
  }

  async removeWallet(walletId: string): Promise<void> {
    for (const [key, conn] of this.connections) {
      const sub = conn.subscriptions.get(walletId);
      if (sub) {
        if (sub.unsubscribeFn) await sub.unsubscribeFn();
        conn.subscriptions.delete(walletId);

        // 구독 없으면 연결 종료
        if (conn.subscriptions.size === 0) {
          conn.heartbeat.stop();
          conn.ws.close();
          this.connections.delete(key);
        }
        break;
      }
    }
  }

  async destroyAll(): Promise<void> {
    for (const [, conn] of this.connections) {
      conn.heartbeat.stop();
      for (const [, sub] of conn.subscriptions) {
        if (sub.unsubscribeFn) await sub.unsubscribeFn();
      }
      conn.ws.close();
    }
    this.connections.clear();
  }
}

interface WalletSubscription {
  address: string;
  network: string;
  onTransaction: (tx: IncomingTransaction) => void;
  unsubscribeFn: (() => Promise<void>) | null;
}
```

**Solana 제약:**
- `logsSubscribe({ mentions })` 는 **지갑당 별도 구독** 필요 (단일 주소만 허용)
- 동일 WebSocket 연결에 여러 `logsSubscribe` 구독 가능 — 연결 공유, 구독은 개별

**EVM 제약:**
- `getLogs` 폴링은 HTTP 기반이므로 WebSocket 멀티플렉서 불필요
- WebSocket 모드(`watchEvent`) 사용 시: 단일 연결에 여러 `eth_subscribe` 가능

### 5.5 동적 구독 관리

런타임에 지갑이 추가/삭제/활성화/비활성화될 때 구독을 동적으로 관리한다.

```typescript
class IncomingTxMonitorService {
  /**
   * 주기적으로 호출되어 DB 상태와 구독 상태를 동기화.
   * SettingsService hot-reload 또는 Admin UI 변경 시에도 호출.
   */
  async syncSubscriptions(): Promise<void> {
    // 1. DB에서 모니터링 대상 지갑 조회
    const monitoredWallets = this.sqlite.prepare(
      "SELECT id, chain, environment, default_network, public_key FROM wallets WHERE status = 'ACTIVE' AND monitor_incoming = 1"
    ).all() as WalletRow[];

    const monitoredSet = new Set(monitoredWallets.map((w) => w.id));

    // 2. 현재 구독 중이지만 DB에서 제거/비활성된 지갑 해제
    for (const walletId of this.multiplexer.subscribedWallets()) {
      if (!monitoredSet.has(walletId)) {
        await this.multiplexer.removeWallet(walletId);
      }
    }

    // 3. DB에서 모니터링 대상이지만 미구독인 지갑 구독 추가
    const subscribedSet = new Set(this.multiplexer.subscribedWallets());
    for (const wallet of monitoredWallets) {
      if (!subscribedSet.has(wallet.id)) {
        const network = wallet.default_network ?? getDefaultNetwork(wallet.chain, wallet.environment);
        const rpcWsUrl = this.resolveWsUrl(wallet.chain, network);
        await this.multiplexer.addWallet(
          wallet.id,
          wallet.public_key,
          wallet.chain,
          network,
          rpcWsUrl,
          this.onTransaction.bind(this),
        );
      }
    }
  }
}
```

**트리거 시점:**
- 서비스 시작 시 (`start()`)
- 지갑 생성/삭제/상태 변경 시 (eventBus `wallet:activity` 이벤트)
- Admin Settings에서 `monitor_incoming` 변경 시 (hot-reload)
- BackgroundWorkers 주기적 동기화 (5분 간격 — drift 방지)

### 5.6 블라인드 구간 복구

WebSocket 재연결 구간에서 발생한 TX를 복구하는 전략 (C-01 대응):

```
   ▼ WS 끊김         ▼ 재연결 성공
───●───────────────────●───→
   │ ← 블라인드 구간 → │
   │  여기서 발생한     │
   │  TX가 유실됨       │
```

**복구 전략:**
```typescript
async function recoverBlindGap(
  subscriber: IChainSubscriber,
  cursor: IncomingTxCursor,
  chain: string,
): Promise<void> {
  if (chain === 'solana') {
    // Solana: getSignaturesForAddress(until: lastSignature) 로 갭 보상
    const missedSignatures = await rpc.getSignaturesForAddress(
      cursor.address,
      { until: cursor.lastSignature, limit: 1000, commitment: 'confirmed' },
    ).send();

    for (const sig of missedSignatures.reverse()) {
      if (!sig.err) {
        const tx = await rpc.getTransaction(sig.signature, {
          encoding: 'jsonParsed',
          commitment: 'confirmed',
        }).send();
        if (tx) await processTransaction(tx, cursor.walletId);
      }
    }
  } else if (chain === 'ethereum') {
    // EVM: getLogs(fromBlock: lastBlock+1, toBlock: 'latest') 로 갭 보상
    const missedLogs = await client.getLogs({
      event: TRANSFER_EVENT,
      args: { to: cursor.address },
      fromBlock: BigInt(cursor.lastBlockNumber) + 1n,
      toBlock: 'latest',
    });

    for (const log of missedLogs) {
      await processLog(log, cursor.walletId);
    }

    // 네이티브 ETH도 별도 복구
    await pollNativeETHTransfers(
      client, cursor.address,
      BigInt(cursor.lastBlockNumber) + 1n,
      await client.getBlockNumber(),
    );
  }
}
```

**복구 실행 시점:**
1. WebSocket 재연결 성공 직후 — 구독 재개 **전에** 갭 보상 수행
2. 서비스 시작 시 — 이전 종료 후 미처리 구간 복구
3. 커서가 있는 모든 지갑에 대해 실행

**커서 업데이트:**
- 갭 복구 완료 후 커서를 최신 위치로 업데이트
- idempotent INSERT(ON CONFLICT DO NOTHING)로 중복 안전

---

## 6. 알림 이벤트 + 의심 입금 감지

### 6.1 이벤트 타입 확장

기존 28개 NotificationEventType에 2개 추가 (28 → 30):

```typescript
// packages/core/src/enums/notification.ts — SSoT
export const NOTIFICATION_EVENT_TYPES = [
  // ... 기존 28개 ...
  'INCOMING_TX_DETECTED',    // 수신 TX 감지
  'INCOMING_TX_SUSPICIOUS',  // 의심 수신 TX 감지
] as const;
```

**EventBus 확장:**
```typescript
// packages/core/src/events/event-types.ts
export interface WaiaasEventMap {
  // ... 기존 이벤트 ...
  'transaction:incoming': IncomingTxEvent;
  'transaction:incoming:suspicious': IncomingSuspiciousTxEvent;
}

export interface IncomingTxEvent {
  walletId: string;
  txHash: string;
  fromAddress: string;
  amount: string;
  tokenAddress: string | null;
  chain: string;
  network: string;
  detectedAt: number;
}

export interface IncomingSuspiciousTxEvent extends IncomingTxEvent {
  suspiciousReasons: SuspiciousReason[];
}

export type SuspiciousReason = 'dust' | 'unknownToken' | 'largeAmount';
```

### 6.2 INCOMING_TX_DETECTED 이벤트

| 필드 | 타입 | 설명 |
|------|------|------|
| walletId | string | 수신 지갑 ID |
| txHash | string | 블록체인 TX 해시 |
| fromAddress | string | 송신자 주소 |
| amount | string | 수신 금액 (최소 단위) |
| tokenAddress | string \| null | 토큰 주소 (null = 네이티브) |
| chain | string | 'solana' \| 'ethereum' |
| network | string | 네트워크 식별자 |
| detectedAt | number | Unix epoch seconds |

**발행 시점:** BackgroundWorkers flush 후 새로 INSERT된 TX에 대해 발행
**알림 우선순위:** `normal` (기존 카테고리 체계 — `transaction` 카테고리)

### 6.3 INCOMING_TX_SUSPICIOUS 이벤트

| 필드 | 타입 | 설명 |
|------|------|------|
| (IncomingTxEvent 상속) | | |
| suspiciousReasons | SuspiciousReason[] | 의심 사유 배열 |

**의심 사유:**
- `dust`: 금액이 임계값 미만 (먼지 공격 의심)
- `unknownToken`: token_registry에 미등록 토큰
- `largeAmount`: 평소 수신 대비 비정상적으로 큰 금액

**발행 시점:** IIncomingSafetyRule 검사 결과 1개 이상 규칙 위반 시
**알림 우선순위:** `high` (즉시 알림)

### 6.4 기존 알림 채널 연동

| 채널 | 연동 방식 | 비고 |
|------|----------|------|
| Telegram | NotificationService.notify() | 기존 채널 재사용 |
| Discord | NotificationService.notify() | webhook 메시지 포맷 |
| ntfy | NotificationService.notify() | push 알림 |
| Slack | NotificationService.notify() | webhook 메시지 포맷 |
| WalletNotificationChannel | 사이드 채널 전달 | 지갑 앱 알림용 |

**NotificationService 연동:**
```typescript
// IncomingTxMonitorService 내부
private async notifyIncomingTx(tx: IncomingTransaction): Promise<void> {
  if (!this.notificationService) return;

  // 1. 의심 검사
  const suspiciousReasons = this.checkSuspicious(tx);

  if (suspiciousReasons.length > 0) {
    // 의심 TX 알림
    await this.notificationService.notify(
      'INCOMING_TX_SUSPICIOUS',
      tx.walletId,
      {
        txHash: tx.txHash,
        from: tx.fromAddress,
        amount: tx.amount,
        token: tx.tokenAddress ?? 'native',
        chain: tx.chain,
        reasons: suspiciousReasons.join(', '),
      },
    );
    this.eventBus.emit('transaction:incoming:suspicious', {
      ...tx,
      suspiciousReasons,
    });
  } else {
    // 정상 수신 알림
    await this.notificationService.notify(
      'INCOMING_TX_DETECTED',
      tx.walletId,
      {
        txHash: tx.txHash,
        from: tx.fromAddress,
        amount: tx.amount,
        token: tx.tokenAddress ?? 'native',
        chain: tx.chain,
      },
    );
    this.eventBus.emit('transaction:incoming', tx);
  }
}
```

**알림 카테고리:**
```typescript
// 기존 NOTIFICATION_CATEGORIES 확장
export const NOTIFICATION_CATEGORIES = {
  // ... 기존 카테고리 ...
  incoming: {
    events: ['INCOMING_TX_DETECTED', 'INCOMING_TX_SUSPICIOUS'],
    priority: 'normal', // SUSPICIOUS는 개별 high
  },
} as const;
```

### 6.5 IIncomingSafetyRule 인터페이스

```typescript
// packages/core/src/interfaces/IIncomingSafetyRule.ts

export interface IIncomingSafetyRule {
  /** 규칙 식별자 */
  readonly name: SuspiciousReason;

  /**
   * 수신 TX가 의심스러운지 검사.
   * @returns true면 의심, false면 정상
   */
  check(tx: IncomingTransaction, context: SafetyRuleContext): boolean;
}

export interface SafetyRuleContext {
  /** config.toml [incoming] 설정값 */
  dustThresholdUsd: number;
  amountMultiplier: number;
  /** token_registry 등록 여부 */
  isRegisteredToken: boolean;
  /** PriceOracle USD 가격 (null = 가격 불명) */
  usdPrice: number | null;
  /** 최근 30일 평균 수신 금액 (USD, null = 이력 없음) */
  avgIncomingUsd: number | null;
}
```

### 6.6 감지 규칙 3종

#### 규칙 1: DustAttackRule

```typescript
class DustAttackRule implements IIncomingSafetyRule {
  readonly name = 'dust' as const;

  check(tx: IncomingTransaction, ctx: SafetyRuleContext): boolean {
    if (ctx.usdPrice === null) return false; // 가격 불명 시 판단 불가
    const amountUsd = Number(tx.amount) * ctx.usdPrice / Math.pow(10, getDecimals(tx));
    return amountUsd < ctx.dustThresholdUsd; // 기본 $0.01
  }
}
```

**임계값:** `incoming_suspicious_dust_usd` (기본 0.01 USD)

#### 규칙 2: UnknownTokenRule

```typescript
class UnknownTokenRule implements IIncomingSafetyRule {
  readonly name = 'unknownToken' as const;

  check(tx: IncomingTransaction, ctx: SafetyRuleContext): boolean {
    if (tx.tokenAddress === null) return false; // 네이티브 토큰은 항상 알려진 토큰
    return !ctx.isRegisteredToken;
  }
}
```

#### 규칙 3: LargeAmountRule

```typescript
class LargeAmountRule implements IIncomingSafetyRule {
  readonly name = 'largeAmount' as const;

  check(tx: IncomingTransaction, ctx: SafetyRuleContext): boolean {
    if (ctx.avgIncomingUsd === null || ctx.usdPrice === null) return false;
    const amountUsd = Number(tx.amount) * ctx.usdPrice / Math.pow(10, getDecimals(tx));
    return amountUsd > ctx.avgIncomingUsd * ctx.amountMultiplier; // 기본 10x
  }
}
```

**임계값:** `incoming_suspicious_amount_multiplier` (기본 10 — 평균의 10배 초과 시 의심)

### 6.7 i18n 메시지 템플릿

```typescript
// packages/daemon/src/notifications/templates/message-templates.ts

export const MESSAGE_TEMPLATES = {
  // ... 기존 템플릿 ...

  INCOMING_TX_DETECTED: {
    en: '💰 Incoming transaction detected\nWallet: {walletName}\nFrom: {from}\nAmount: {amount} {token}\nChain: {chain}\nTx: {txHash}',
    ko: '💰 수신 트랜잭션 감지\n지갑: {walletName}\n발신: {from}\n금액: {amount} {token}\n체인: {chain}\nTx: {txHash}',
  },

  INCOMING_TX_SUSPICIOUS: {
    en: '⚠️ Suspicious incoming transaction\nWallet: {walletName}\nFrom: {from}\nAmount: {amount} {token}\nChain: {chain}\nReason: {reasons}\nTx: {txHash}',
    ko: '⚠️ 의심 수신 트랜잭션\n지갑: {walletName}\n발신: {from}\n금액: {amount} {token}\n체인: {chain}\n사유: {reasons}\nTx: {txHash}',
  },
} as const;
```

**reasons 한국어 매핑:**
- `dust` → "먼지 공격 의심 (소액 입금)"
- `unknownToken` → "미등록 토큰"
- `largeAmount` → "비정상 대량 입금"

---

## 7. REST API + SDK/MCP 명세

### 7.1 GET /v1/wallet/incoming

수신 트랜잭션 이력을 조회하는 엔드포인트.

**경로:** `GET /v1/wallet/incoming`
**인증:** sessionAuth (JWT)
**지갑 선택:** resolveWalletId 3단계 우선순위 (헤더 → 세션 기본 → 단일 지갑)

**Query Parameters:**

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| cursor | string | N | 페이지네이션 커서 (이전 응답의 nextCursor) |
| limit | number | N | 페이지 크기 (기본 20, 최대 100) |
| from_address | string | N | 송신자 주소 필터 |
| token | string | N | 토큰 주소 필터 ('native' = 네이티브 토큰) |
| chain | string | N | 체인 필터 ('solana' \| 'ethereum') |
| status | string | N | 상태 필터 ('DETECTED' \| 'CONFIRMED') |
| since | number | N | 시작 시각 (Unix epoch seconds) |
| until | number | N | 종료 시각 (Unix epoch seconds) |

**응답:**
```json
{
  "data": [
    {
      "id": "019...",
      "txHash": "5xYz...",
      "walletId": "wallet-uuid",
      "fromAddress": "8xAB...",
      "amount": "1000000000",
      "tokenAddress": null,
      "chain": "solana",
      "network": "mainnet",
      "status": "CONFIRMED",
      "blockNumber": 12345678,
      "detectedAt": 1708502400,
      "confirmedAt": 1708502430
    }
  ],
  "nextCursor": "eyJ...",
  "hasMore": true
}
```

**커서 페이지네이션:**
- 커서 = Base64(JSON({ detectedAt, id })) — detected_at DESC, id DESC 정렬
- `WHERE (detected_at, id) < (?, ?)` 조건으로 효율적 페이지네이션
- `idx_incoming_tx_wallet_detected` 인덱스 활용

### 7.2 Zod SSoT 스키마

```typescript
// packages/daemon/src/api/routes/openapi-schemas.ts

import { z } from 'zod';

// Query
export const IncomingTransactionQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  from_address: z.string().optional(),
  token: z.string().optional(), // 'native' | token address
  chain: z.enum(['solana', 'ethereum']).optional(),
  status: z.enum(['DETECTED', 'CONFIRMED']).optional(),
  since: z.coerce.number().int().optional(),
  until: z.coerce.number().int().optional(),
});

// Response item
export const IncomingTransactionSchema = z.object({
  id: z.string(),
  txHash: z.string(),
  walletId: z.string(),
  fromAddress: z.string(),
  amount: z.string(),
  tokenAddress: z.string().nullable(),
  chain: z.enum(['solana', 'ethereum']),
  network: z.string(),
  status: z.enum(['DETECTED', 'CONFIRMED']),
  blockNumber: z.number().nullable(),
  detectedAt: z.number(),
  confirmedAt: z.number().nullable(),
});

// Response
export const IncomingTransactionListResponseSchema = z.object({
  data: z.array(IncomingTransactionSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

// Summary response
export const IncomingTransactionSummarySchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly']),
  entries: z.array(z.object({
    date: z.string(), // YYYY-MM-DD
    totalCount: z.number(),
    totalAmountNative: z.string(), // 네이티브 토큰 합계
    totalAmountUsd: z.number().nullable(), // USD 합계 (PriceOracle)
    suspiciousCount: z.number(),
  })),
});
```

### 7.3 PATCH /v1/wallet/:id 확장

기존 지갑 업데이트 엔드포인트에 `monitorIncoming` 필드 추가:

```typescript
// 기존 WalletUpdateSchema 확장
export const WalletUpdateSchema = z.object({
  // ... 기존 필드 ...
  monitorIncoming: z.boolean().optional(), // 수신 모니터링 opt-in/out
});
```

**동작:**
- `monitorIncoming: true` → `monitor_incoming = 1` + syncSubscriptions() 즉시 호출
- `monitorIncoming: false` → `monitor_incoming = 0` + 해당 지갑 구독 해제

### 7.4 SDK 메서드 명세

#### TypeScript SDK

```typescript
// packages/sdk/src/client.ts

export class WAIaaSClient {
  /**
   * 수신 트랜잭션 이력 조회.
   */
  async listIncomingTransactions(
    options?: ListIncomingTransactionsOptions,
  ): Promise<IncomingTransactionListResponse> {
    const params = new URLSearchParams();
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.fromAddress) params.set('from_address', options.fromAddress);
    if (options?.token) params.set('token', options.token);
    if (options?.chain) params.set('chain', options.chain);
    if (options?.status) params.set('status', options.status);
    if (options?.since) params.set('since', String(options.since));
    if (options?.until) params.set('until', String(options.until));

    return this.get(`/v1/wallet/incoming?${params}`);
  }

  /**
   * 수신 트랜잭션 집계 요약 조회.
   */
  async getIncomingTransactionSummary(
    period: 'daily' | 'weekly' | 'monthly' = 'daily',
  ): Promise<IncomingTransactionSummary> {
    return this.get(`/v1/wallet/incoming/summary?period=${period}`);
  }
}

export interface ListIncomingTransactionsOptions {
  cursor?: string;
  limit?: number;
  fromAddress?: string;
  token?: string;
  chain?: 'solana' | 'ethereum';
  status?: 'DETECTED' | 'CONFIRMED';
  since?: number;
  until?: number;
}
```

#### Python SDK

```python
# python-sdk/waiaas/client.py

class WAIaaSClient:
    def list_incoming_transactions(
        self,
        cursor: str | None = None,
        limit: int = 20,
        from_address: str | None = None,
        token: str | None = None,
        chain: str | None = None,
        status: str | None = None,
        since: int | None = None,
        until: int | None = None,
    ) -> IncomingTransactionListResponse:
        """수신 트랜잭션 이력 조회."""
        params = {"limit": limit}
        if cursor: params["cursor"] = cursor
        if from_address: params["from_address"] = from_address
        if token: params["token"] = token
        if chain: params["chain"] = chain
        if status: params["status"] = status
        if since: params["since"] = since
        if until: params["until"] = until
        return self._get("/v1/wallet/incoming", params=params)

    def get_incoming_transaction_summary(
        self,
        period: str = "daily",
    ) -> IncomingTransactionSummary:
        """수신 트랜잭션 집계 요약 조회."""
        return self._get("/v1/wallet/incoming/summary", params={"period": period})
```

### 7.5 MCP 도구 명세

```typescript
// packages/mcp/src/tools/

export const list_incoming_transactions = {
  name: 'list_incoming_transactions',
  description: '수신 트랜잭션 이력을 조회합니다. 지갑으로 들어온 토큰/코인 수신 내역을 확인할 수 있습니다.',
  inputSchema: {
    type: 'object',
    properties: {
      cursor: { type: 'string', description: '페이지네이션 커서' },
      limit: { type: 'number', description: '조회 개수 (기본 20, 최대 100)' },
      from_address: { type: 'string', description: '송신자 주소 필터' },
      token: { type: 'string', description: '토큰 주소 필터 (native = 네이티브 토큰)' },
      chain: { type: 'string', enum: ['solana', 'ethereum'], description: '체인 필터' },
      status: { type: 'string', enum: ['DETECTED', 'CONFIRMED'], description: '상태 필터' },
      since: { type: 'number', description: '시작 시각 (Unix epoch seconds)' },
      until: { type: 'number', description: '종료 시각 (Unix epoch seconds)' },
    },
  },
};

export const get_incoming_summary = {
  name: 'get_incoming_summary',
  description: '수신 트랜잭션 집계 요약을 조회합니다. 일별/주별/월별 수신 합계를 확인할 수 있습니다.',
  inputSchema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        enum: ['daily', 'weekly', 'monthly'],
        description: '집계 기간 (기본: daily)',
      },
    },
  },
};
```

### 7.6 GET /v1/wallet/incoming/summary

수신 트랜잭션 집계 요약 엔드포인트.

**경로:** `GET /v1/wallet/incoming/summary`
**인증:** sessionAuth
**Query Parameters:**

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| period | string | N | 집계 기간: 'daily' (기본) \| 'weekly' \| 'monthly' |

**응답:**
```json
{
  "period": "daily",
  "entries": [
    {
      "date": "2026-02-21",
      "totalCount": 5,
      "totalAmountNative": "15000000000",
      "totalAmountUsd": 150.50,
      "suspiciousCount": 1
    },
    {
      "date": "2026-02-20",
      "totalCount": 3,
      "totalAmountNative": "8000000000",
      "totalAmountUsd": 80.25,
      "suspiciousCount": 0
    }
  ]
}
```

**SQL 쿼리:**
```sql
-- Daily aggregation
SELECT
  date(detected_at, 'unixepoch') AS date,
  COUNT(*) AS total_count,
  SUM(CAST(amount AS INTEGER)) AS total_amount_native,
  COUNT(CASE WHEN id IN (SELECT incoming_tx_id FROM incoming_tx_suspicious) THEN 1 END) AS suspicious_count
FROM incoming_transactions
WHERE wallet_id = ?
GROUP BY date(detected_at, 'unixepoch')
ORDER BY date DESC
LIMIT 30;
```

**참고:** 의심 TX 카운트를 위해 별도 테이블이 필요할 수 있으나, 설계 단순화를 위해 `incoming_transactions`에 `is_suspicious INTEGER DEFAULT 0` 컬럼을 추가하는 것도 고려. 구현 시 결정.

---

## 8. 설정 구조 + 설계 통합 검증

### 8.1 config.toml [incoming] 섹션

기존 WAIaaS config.toml 평탄화 원칙을 준수하여 `[incoming]` 섹션을 정의한다.

```toml
[incoming]
# 수신 모니터링 전역 활성화 (기본: false)
incoming_enabled = false

# 모니터링 모드: "polling" | "websocket" | "auto" (기본: "auto")
# auto: WebSocket 시도 → 실패 시 폴링 자동 전환
incoming_mode = "auto"

# 폴링 간격 (초, 기본: 30)
incoming_poll_interval = 30

# 수신 이력 보존 기간 (일, 기본: 90)
incoming_retention_days = 90

# 먼지 공격 의심 임계값 (USD, 기본: 0.01)
incoming_suspicious_dust_usd = 0.01

# 대량 입금 의심 배수 (평균의 N배 초과, 기본: 10)
incoming_suspicious_amount_multiplier = 10
```

**평탄화 원칙 준수:**
- 섹션명: `[incoming]`
- 키 접두사: `incoming_` (기존 `[balance_monitor]` → `monitoring_` 패턴과 동일)
- 중첩 없음: 모든 키가 1-depth flat

### 8.2 SettingsService 등록

```typescript
// packages/daemon/src/infrastructure/settings/setting-keys.ts

export const SETTING_KEYS = {
  // ... 기존 키 ...

  // Incoming Transaction Monitoring
  'incoming.enabled': { default: 'false', hotReload: true },
  'incoming.mode': { default: 'auto', hotReload: true },
  'incoming.poll_interval': { default: '30', hotReload: true },
  'incoming.retention_days': { default: '90', hotReload: true },
  'incoming.suspicious_dust_usd': { default: '0.01', hotReload: true },
  'incoming.suspicious_amount_multiplier': { default: '10', hotReload: true },
} as const;
```

**hot-reload 대상 (재시작 불필요):**
- `incoming.enabled`: 활성화/비활성화 즉시 반영
- `incoming.mode`: 모드 전환 즉시 반영 (구독 재설정)
- `incoming.poll_interval`: 다음 폴링 주기부터 반영
- `incoming.retention_days`: 다음 정리 주기부터 반영
- `incoming.suspicious_dust_usd`: 다음 검사부터 반영
- `incoming.suspicious_amount_multiplier`: 다음 검사부터 반영

**모든 6개 키가 hot-reload 가능** — 재시작 필요 없음

### 8.3 환경변수 매핑

기존 `WAIAAS_{SECTION}_{KEY}` 패턴:

| config.toml 키 | 환경변수 |
|---------------|---------|
| incoming_enabled | WAIAAS_INCOMING_ENABLED |
| incoming_mode | WAIAAS_INCOMING_MODE |
| incoming_poll_interval | WAIAAS_INCOMING_POLL_INTERVAL |
| incoming_retention_days | WAIAAS_INCOMING_RETENTION_DAYS |
| incoming_suspicious_dust_usd | WAIAAS_INCOMING_SUSPICIOUS_DUST_USD |
| incoming_suspicious_amount_multiplier | WAIAAS_INCOMING_SUSPICIOUS_AMOUNT_MULTIPLIER |

**우선순위:** 환경변수 > config.toml > 기본값 (기존 패턴과 동일)

### 8.4 지갑별 opt-in 설정

```
전역 게이트                    지갑별 게이트
incoming_enabled=true  AND  monitor_incoming=1  →  모니터링 활성
incoming_enabled=true  AND  monitor_incoming=0  →  모니터링 비활성
incoming_enabled=false AND  (any)               →  전체 비활성
```

- `incoming_enabled = false` (기본값): 전역 비활성 — 어떤 지갑도 모니터링 안 됨
- `incoming_enabled = true`: 전역 활성 — `monitor_incoming = 1`인 지갑만 모니터링
- 새 지갑 생성 시 `monitor_incoming = 0` (기본값 — opt-in 필요)

**API 활성화:**
```
PATCH /v1/wallet/:id  { "monitorIncoming": true }
```

**Admin UI 활성화:**
- Wallet 상세 페이지에 "수신 모니터링" 토글 스위치

### 8.5 HotReloadOrchestrator 확장

```typescript
// packages/daemon/src/infrastructure/settings/hot-reload.ts

const INCOMING_KEYS_PREFIX = 'incoming.';

export interface HotReloadDeps {
  // ... 기존 ...
  incomingTxMonitorService?: IncomingTxMonitorService | null;
}

// handleChangedKeys 내부 추가
if (hasIncomingChanges) {
  try {
    this.reloadIncomingMonitor();
  } catch (err) {
    console.warn('Hot-reload incoming monitor failed:', err);
  }
}

private reloadIncomingMonitor(): void {
  const svc = this.deps.incomingTxMonitorService;
  if (!svc) return;

  const ss = this.deps.settingsService;
  svc.updateConfig({
    enabled: ss.get('incoming.enabled') === 'true',
    mode: ss.get('incoming.mode') as 'polling' | 'websocket' | 'auto',
    pollIntervalSec: parseInt(ss.get('incoming.poll_interval'), 10),
    retentionDays: parseInt(ss.get('incoming.retention_days'), 10),
    suspiciousDustUsd: parseFloat(ss.get('incoming.suspicious_dust_usd')),
    suspiciousAmountMultiplier: parseFloat(ss.get('incoming.suspicious_amount_multiplier')),
  });
}
```

### 8.6 기존 설계 문서 영향 분석

| 문서 | 영향 범위 | 변경 내용 |
|------|----------|-----------|
| doc 25 (DB 스키마) | 테이블 추가 | incoming_transactions, incoming_tx_cursors 테이블 + wallets.monitor_incoming 컬럼 |
| doc 27 (이벤트 시스템) | 이벤트 타입 추가 | INCOMING_TX_DETECTED, INCOMING_TX_SUSPICIOUS (28→30) |
| doc 28 (알림 시스템) | 메시지 템플릿 추가 | en/ko 템플릿 2개, 카테고리 'incoming' 추가 |
| doc 29 (보안 모델) | 의심 감지 규칙 추가 | IIncomingSafetyRule 3종 (dust/unknownToken/largeAmount) |
| doc 31 (API 설계) | 엔드포인트 추가 | GET /v1/wallet/incoming, GET /v1/wallet/incoming/summary |
| doc 35 (설정 모델) | 섹션 추가 | [incoming] 6키, SettingsService 등록, HotReload 확장 |
| doc 37 (SDK 인터페이스) | 메서드 추가 | listIncomingTransactions, getIncomingTransactionSummary |
| doc 38 (MCP 도구) | 도구 추가 | list_incoming_transactions, get_incoming_summary |
| doc 75 (알림 채널) | 이벤트 라우팅 확장 | INCOMING_TX_* 이벤트 → 기존 5채널 라우팅 |

**충돌 없음 확인:**
- 모든 변경은 **확장**(추가)이며 기존 인터페이스 수정 없음
- IChainAdapter 22메서드 불변 — IChainSubscriber 별도 인터페이스
- 기존 transactions 테이블 불변 — incoming_transactions 별도 테이블

### 8.7 검증 시나리오

#### 핵심 검증 (T-01 ~ T-17)

| ID | 시나리오 | 검증 대상 |
|----|---------|----------|
| T-01 | Solana SOL 네이티브 수신 감지 | §3.2.1 SOL 파싱 알고리즘 |
| T-02 | Solana SPL 토큰 수신 감지 | §3.2.2 SPL 파싱 알고리즘 |
| T-03 | Solana Token-2022 수신 감지 | §3.3 Token-2022 지원 |
| T-04 | Solana 신규 ATA 최초 수신 | §3.4 ATA 2레벨 (pre=0n) |
| T-05 | EVM 네이티브 ETH 수신 감지 | §4.3 watchBlocks + to 필터 |
| T-06 | EVM ERC-20 수신 감지 | §4.2 Transfer 이벤트 |
| T-07 | WebSocket → 폴링 자동 전환 | §5.1 상태 머신 |
| T-08 | 폴링 → WebSocket 자동 복귀 | §5.1 상태 머신 |
| T-09 | 블라인드 구간 TX 복구 | §5.6 갭 보상 폴링 |
| T-10 | 동일 TX 중복 삽입 방지 | §2.4 ON CONFLICT DO NOTHING |
| T-11 | 보존 정책 자동 삭제 | §2.5 retention_days |
| T-12 | DETECTED → CONFIRMED 전환 | §1.3 2단계 상태 |
| T-13 | 먼지 공격 감지 | §6.6 DustAttackRule |
| T-14 | 미등록 토큰 감지 | §6.6 UnknownTokenRule |
| T-15 | 대량 입금 감지 | §6.6 LargeAmountRule |
| T-16 | 수신 이력 API 커서 페이지네이션 | §7.1 cursor pagination |
| T-17 | hot-reload 설정 변경 반영 | §8.5 HotReloadOrchestrator |

#### 보안 검증 (S-01 ~ S-04)

| ID | 시나리오 | 검증 대상 |
|----|---------|----------|
| S-01 | confirmed TX 롤백 후 에이전트 반응 없음 | §1.3 CONFIRMED만 트리거 |
| S-02 | KillSwitch SUSPENDED 시 모니터링 중단 | §5.1 DISABLED 전환 |
| S-03 | sessionAuth 없이 /incoming 접근 거부 | §7.1 인증 |
| S-04 | 타 지갑 수신 이력 접근 불가 | §7.1 resolveWalletId |

### 8.8 교차 검증 체크리스트

| 항목 | 상태 | 근거 |
|------|------|------|
| Zod SSoT 파이프라인 준수 | ✅ | §7.2 Zod → TS → OpenAPI 순서 |
| config.toml 평탄화 원칙 | ✅ | §8.1 [incoming] 6키 flat, incoming_ 접두사 |
| 환경변수 WAIAAS_* 패턴 | ✅ | §8.3 WAIAAS_INCOMING_* 매핑 |
| NotificationEventType SSoT | ✅ | §6.1 NOTIFICATION_EVENT_TYPES 배열 확장 |
| DB 마이그레이션 v21 | ✅ | §2.7 ALTER TABLE + CREATE TABLE |
| IChainAdapter 불변 | ✅ | §1.1 별도 IChainSubscriber 인터페이스 |
| BackgroundWorkers 패턴 | ✅ | §2.6 flush + §2.5 retention + §3.6/4.6 confirm |
| SettingsService hot-reload | ✅ | §8.2 6키 모두 hotReload: true |
| HotReloadOrchestrator 확장 | ✅ | §8.5 incoming prefix 감지 + updateConfig |
| DaemonLifecycle 통합 | ✅ | Step 4c-9 fail-soft 초기화 |
| discriminatedUnion 5-type 불변 | ✅ | 수신 TX는 별도 테이블, 기존 TX 타입 불변 |
| 에러 코드 체계 충돌 없음 | ✅ | 신규 에러 코드 할당 필요 시 구현 마일스톤에서 정의 |

### 8.9 DaemonLifecycle 통합 위치

```
Step 4c-4: BalanceMonitorService (기존)
Step 4c-9: IncomingTxMonitorService (신규, fail-soft)
  ├── IncomingTxQueue (메모리 큐)
  ├── SubscriptionMultiplexer (WebSocket/폴링 관리)
  ├── SolanaIncomingSubscriber (체인별 구현)
  └── EvmIncomingSubscriber (체인별 구현)

Step 5: HTTP Server
  └── HotReloadOrchestrator deps에 incomingTxMonitorService 추가

Step 6: BackgroundWorkers
  ├── incoming-tx-flush (5초, 메모리 큐 → DB)
  ├── incoming-tx-retention (1시간, 보존 정책)
  ├── incoming-tx-confirm-solana (30초, DETECTED → CONFIRMED)
  └── incoming-tx-confirm-evm (30초, DETECTED → CONFIRMED)

Shutdown:
  └── incomingTxMonitorService.stop() (구독 해제, 큐 최종 flush)
```

### 8.10 설계 결정 요약

| # | 결정 | 근거 |
|---|------|------|
| D-01 | IChainSubscriber를 IChainAdapter와 분리 | stateful vs stateless, AdapterPool 호환성 |
| D-02 | UNIQUE(tx_hash, wallet_id) 복합 제약 | 배치 전송 시 다중 지갑 수신 가능 |
| D-03 | 2단계 상태 (DETECTED/CONFIRMED) | 빠른 알림 vs 안전한 트리거 분리 |
| D-04 | 메모리 큐 + 5초 flush | SQLite 단일 라이터 보호 (C-02) |
| D-05 | Solana: logsSubscribe({ mentions }) | SOL + SPL + ATA 단일 구독 해결 |
| D-06 | EVM: 폴링(getLogs) 우선 | self-hosted WebSocket 가용성 불확실 |
| D-07 | 3-state 연결 상태 머신 | WebSocket ↔ 폴링 자동 전환 |
| D-08 | 체인별 WebSocket 공유 멀티플렉서 | 연결 수 최소화, 확장성 |
| D-09 | 블라인드 구간 커서 기반 복구 | TX 유실 방지 (C-01) |
| D-10 | NotificationEventType 28→30 | INCOMING_TX_DETECTED + SUSPICIOUS |
| D-11 | IIncomingSafetyRule 3규칙 | dust + unknownToken + largeAmount |
| D-12 | config.toml [incoming] 6키 flat | 기존 평탄화 원칙 준수 |
| D-13 | 전역 게이트 + 지갑별 opt-in 2단계 | 기본 비활성, RPC 비용 제어 |
| D-14 | incoming_tx_cursors 별도 테이블 | 커서 관리 분리, FK CASCADE |
| D-15 | v21 마이그레이션 | ALTER TABLE + CREATE TABLE 2개 |
| D-16 | 6키 모두 hot-reload 가능 | 재시작 불필요, 즉시 반영 |
| D-17 | confirmed 감지 → finalized 확정 | Solana C-03 대응 |
