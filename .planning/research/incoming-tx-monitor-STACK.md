# Technology Stack: 인커밍 트랜잭션 모니터링

**Project:** WAIaaS 인커밍 TX 모니터링 설계 마일스톤
**Researched:** 2026-02-21
**Mode:** Subsequent Milestone (기존 스택에 모니터링 레이어 추가 — 설계 전용)
**Overall Confidence:** HIGH (공식 Solana RPC 문서 + viem 소스 코드 + 커뮤니티 검증)

---

## Executive Summary

**결론:** 신규 npm 패키지 추가 없음. 기존 `@solana/kit ^6.0.1`과 `viem ^2.21.0`이 인커밍 트랜잭션 모니터링에 필요한 모든 API를 이미 포함한다. Node.js 22 내장 WebSocket(Undici 기반)도 활용 가능하지만, 재연결 로직은 수동 구현이 필요하다. viem의 WebSocket transport는 재연결(`reconnect: { attempts: 10 }`)과 keepAlive(`keepAlive: { interval: 30_000 }`)를 내장 지원한다. 폴링 폴백은 기존 HTTP 클라이언트로 충분히 구현 가능하다.

**핵심 설계 결정:**

1. **Solana WebSocket:** `createSolanaRpcSubscriptions` (from `@solana/kit`) → `logsSubscribe({ mentions: [walletAddress] })` → 시그니처 획득 후 `getTransaction(sig, { encoding: 'jsonParsed' })` 으로 세부 파싱
2. **EVM ERC-20:** `createPublicClient({ transport: webSocket(...) })` → `watchContractEvent({ eventName: 'Transfer', args: { to: walletAddress } })` → `eth_subscribe("logs")` 사용 (viem 내장)
3. **EVM Native ETH:** `watchBlocks({ includeTransactions: true })` → 블록 내 각 TX의 `to` 주소 및 `value` 필터링 (ETH 이체는 이벤트 로그를 생성하지 않으므로 블록 스캔 필수)
4. **폴링 폴백:** Solana `getSignaturesForAddress({ until: lastKnownSig, limit: 100 })` + EVM `getLogs({ fromBlock: lastBlock, toBlock: 'latest' })` 조합

---

## 1. Solana 인커밍 TX 모니터링 API

### 1-1. WebSocket 구독: `logsSubscribe` 권장 이유

**선택: `logsSubscribe({ mentions: [walletAddress] })`** — accountSubscribe 대신

| 구독 메서드 | 무엇을 감지하는가 | SPL 토큰 인식 | 이유 |
|------------|----------------|-------------|------|
| `accountSubscribe` | 특정 계정의 lamport/data 변화 | 불가 (ATA가 변경됨, 지갑 계정이 아님) | SOL 수신 감지는 가능하나 SPL 토큰 수신 감지 불가 |
| `logsSubscribe({ mentions })` | 해당 주소를 언급하는 모든 TX 로그 | 가능 (ATA 포함 TX 캡처) | SOL + SPL 통합 감지, 단일 구독으로 커버 |
| `signatureSubscribe` | 특정 TX 서명의 확인 상태 변화 | 해당 없음 | 이미 알려진 TX 모니터링용. 발견용 아님 |

**`logsSubscribe` 권장 근거:**

- `{ mentions: [walletAddress] }` 필터로 해당 지갑을 accountKey로 포함하는 모든 TX를 수신
- SOL 이체(SystemProgram), SPL 이체(Token Program ATA 포함), Token-2022 이체 모두 캡처
- 단일 구독으로 SOL + 모든 SPL 토큰 커버 (accountSubscribe는 ATA당 별도 구독 필요)
- 응답에 `signature` 포함 → 즉시 `getTransaction`으로 상세 파싱 가능

**Confidence:** HIGH — Solana 공식 RPC 문서 검증 ([logsSubscribe](https://solana.com/docs/rpc/websocket/logssubscribe))

### 1-2. `logsSubscribe` RPC 파라미터

```typescript
// WebSocket 요청 형식
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "logsSubscribe",
  "params": [
    { "mentions": ["<WALLET_ADDRESS_BASE58>"] },  // 이 주소를 언급하는 TX만
    { "commitment": "confirmed" }                  // confirmed 수준에서 알림
  ]
}

// 응답 (구독 ID)
{ "jsonrpc": "2.0", "result": 23784, "id": 1 }

// 알림 형식
{
  "jsonrpc": "2.0",
  "method": "logsNotification",
  "params": {
    "result": {
      "context": { "slot": 123456 },
      "value": {
        "signature": "<BASE58_TX_SIGNATURE>",  // ← 이 값으로 getTransaction 호출
        "err": null,                            // null이면 성공한 TX
        "logs": ["Program 11111111111111111111111111111111 invoke [1]", ...]
      }
    },
    "subscription": 23784
  }
}
```

### 1-3. `@solana/kit` WebSocket 구독 API

`@solana/kit ^6.0.1`이 `createSolanaRpcSubscriptions`를 내보낸다. 이 함수는 Solana RPC WebSocket 구독의 공식 클라이언트를 생성한다.

```typescript
import {
  createSolanaRpcSubscriptions,
  address,
} from '@solana/kit';

// 구독 클라이언트 생성 (WSS URL 사용)
const rpcSubscriptions = createSolanaRpcSubscriptions(WSS_PROVIDER_URL);

// AbortController로 구독 수명 관리
const abortController = new AbortController();

// logsSubscribe — async iterator 패턴 (콜백 아님)
const logNotifications = await rpcSubscriptions
  .logsNotifications(
    { mentions: [address(walletAddress)] },
    { commitment: 'confirmed' }
  )
  .subscribe({ abortSignal: abortController.signal });

// 알림 처리 루프
for await (const notification of logNotifications) {
  const { signature, err, logs } = notification.value;
  if (err !== null) continue; // 실패한 TX 무시

  // 시그니처로 상세 TX 조회 (아래 1-4 참조)
  await processIncomingTransaction(signature);
}

// 정리
abortController.abort();
```

**API 이름 주의:** `@solana/kit`에서 메서드명은 RPC의 `logsSubscribe`에 대응하여 `logsNotifications()`로 노출된다 (Notifications 접미사 패턴). 재연결은 `@solana/kit`의 기본 RPC 구독 인프라가 처리하지 않으므로 어플리케이션 레벨에서 try/catch + 재구독 루프 구현 필요.

**Confidence:** MEDIUM — `@solana/kit` 공식 문서보다 QuickNode 가이드 기반. 메서드명 구체적 검증 필요 (설계 단계에서 플래그).

### 1-4. `getTransaction`으로 세부 파싱

logsSubscribe 알림은 `signature`와 `logs`만 제공하며, 금액/발신자/토큰 정보는 포함하지 않는다. `getTransaction`을 `jsonParsed` 인코딩으로 호출하면 구조화된 데이터를 얻는다.

```typescript
// HTTP RPC로 TX 상세 조회
const rpc = createSolanaRpc(HTTP_RPC_URL);

const tx = await rpc
  .getTransaction(signature as Base58Signature, {
    encoding: 'jsonParsed',
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed',
  })
  .send();
```

**`jsonParsed` 응답에서 인커밍 이체 감지:**

```typescript
// SOL 인커밍 이체 감지
// accountKeys 배열에서 walletAddress의 인덱스 찾기
const accountKeys = tx.transaction.message.accountKeys;
const myIndex = accountKeys.findIndex(k => k.pubkey === walletAddress);

// preBalances vs postBalances 비교
const preBalance = tx.meta.preBalances[myIndex];
const postBalance = tx.meta.postBalances[myIndex];
const lamportsReceived = postBalance - preBalance;
// lamportsReceived > 0이면 SOL 수신

// SPL 토큰 인커밍 이체 감지
// preTokenBalances + postTokenBalances 비교
for (const postTB of tx.meta.postTokenBalances) {
  if (postTB.owner !== walletAddress) continue; // 내 지갑 소유 ATA만

  const preTB = tx.meta.preTokenBalances.find(
    p => p.accountIndex === postTB.accountIndex
  );
  const preAmount = BigInt(preTB?.uiTokenAmount?.amount ?? '0');
  const postAmount = BigInt(postTB.uiTokenAmount.amount);

  if (postAmount > preAmount) {
    // 인커밍 토큰 이체
    const mint = postTB.mint;
    const received = postAmount - preAmount;
  }
}
```

**왜 `jsonParsed`인가:** raw 인코딩은 offset 기반 binary 파싱 필요. `jsonParsed`는 `preBalances`, `postBalances`, `preTokenBalances`, `postTokenBalances` 구조화 필드를 직접 제공. Solana 공식 문서(exchange 가이드)가 이 방식을 권장한다.

**Confidence:** HIGH — Solana 공식 exchange 통합 가이드 검증 ([developers.solana.com/guides/advanced/exchange](https://solana.com/developers/guides/advanced/exchange))

---

## 2. EVM 인커밍 TX 모니터링 API

### 2-1. ERC-20 Transfer 이벤트: `watchEvent` with `eth_subscribe("logs")`

**선택: `watchEvent` (viem) — poll: false + WebSocket transport**

viem ^2.21.0에서 `watchEvent`는 `poll: false` + WebSocket transport 조합 시 `eth_subscribe("logs")` 를 사용한다. `poll: true`(또는 HTTP transport) 시 `eth_newFilter` + `eth_getFilterChanges` 폴링으로 폴백.

```typescript
import { createPublicClient, webSocket, parseAbiItem } from 'viem';

// WebSocket transport로 EVM 클라이언트 생성
const wsClient = createPublicClient({
  chain: mainnet, // 또는 실제 chain 설정
  transport: webSocket(WSS_RPC_URL, {
    reconnect: { attempts: 10 },     // 재연결 최대 10회
    keepAlive: { interval: 30_000 }, // 30초 keepAlive ping
    retryDelay: 1_000,               // 재시도 기본 지연 1초 (지수 백오프)
  }),
});

// ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
// "to" 파라미터로 지갑 주소 인덱스 필터링
const unwatch = wsClient.watchEvent({
  event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
  args: { to: walletAddress as `0x${string}` }, // to == 내 지갑만 필터
  onLogs: (logs) => {
    for (const log of logs) {
      const { address: tokenContract, args } = log;
      const { from, value } = args;
      // ERC-20 인커밍 이체 감지
    }
  },
  onError: (error) => { /* 에러 처리 */ },
  poll: false, // WebSocket eth_subscribe 사용
});
```

**Transfer 이벤트 topic[0] (고정값):**
`0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`

`to` indexed 파라미터로 필터링하면 RPC 레벨에서 필터가 적용되어 네트워크 트래픽 최소화.

**Confidence:** HIGH — viem 소스코드(`watchBlocks.ts`) + 공식 문서 + GitHub Discussion #503 검증

### 2-2. Native ETH 이체: `watchBlocks` + 트랜잭션 스캔

**핵심 제약:** Native ETH 이체(단순 가치 이전)는 이벤트 로그를 생성하지 않는다. EVM 로그는 `EMIT`(솔리디티 `event`) 명령어로만 생성된다. 따라서 `watchEvent`/`eth_subscribe("logs")`로 native ETH 수신을 감지할 수 없다.

**해법: `watchBlocks({ includeTransactions: true })`** → 블록 내 TX 순회

```typescript
// WebSocket transport: eth_subscribe("newHeads") 사용
// includeTransactions: true → 블록에 전체 TX 배열 포함
const unwatch = wsClient.watchBlocks({
  includeTransactions: true,
  onBlock: (block) => {
    for (const tx of block.transactions) {
      // typeof tx === 'object' (includeTransactions: true일 때)
      if (
        typeof tx === 'object' &&
        tx.to?.toLowerCase() === walletAddress.toLowerCase() &&
        tx.value > 0n
      ) {
        // Native ETH 인커밍 이체 감지
        const { hash, from, value } = tx;
      }
    }
  },
  onError: (error) => { /* 에러 처리 */ },
  poll: false, // WebSocket eth_subscribe("newHeads") 사용
});
```

**성능 고려:** `includeTransactions: true`는 블록당 데이터 크기가 크다(고트래픽 체인에서 수백 KB). 단, self-hosted 데몬의 단일 지갑 주소 모니터링 컨텍스트에서는 허용 가능. 블록당 TX 수가 많은 Ethereum mainnet보다 Polygon, BSC 등 저비용 체인에서 더 적합.

**Confidence:** HIGH — viem 소스코드 검증. Native ETH 이벤트 없음은 EVM 스펙 사실.

### 2-3. `decodeEventLog`로 로그 파싱 (폴링 폴백용)

폴링 폴백에서 `getLogs` 결과를 파싱할 때:

```typescript
import { decodeEventLog, parseAbi } from 'viem';

const ERC20_TRANSFER_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)'
]);

// getLogs 결과에서 Transfer 이벤트 디코딩
const decoded = decodeEventLog({
  abi: ERC20_TRANSFER_ABI,
  data: log.data,
  topics: log.topics,
});
// decoded.args.from, decoded.args.to, decoded.args.value
```

또는 배치 처리 시 `parseEventLogs`:

```typescript
import { parseEventLogs } from 'viem';

const transferLogs = parseEventLogs({
  abi: ERC20_TRANSFER_ABI,
  logs: rawLogs, // getLogs 결과
});
```

**Confidence:** HIGH — viem 공식 문서 검증 ([parseEventLogs](https://viem.sh/docs/contract/parseEventLogs), [decodeEventLog](https://viem.sh/docs/contract/decodeEventLog))

---

## 3. WebSocket 재연결 패턴

### 3-1. EVM (viem WebSocket transport)

viem ^2.21.0의 `webSocket()` transport는 자동 재연결을 지원한다. 2024년 7월 Issue #2325가 수정되어 소켓 CLOSED 상태 복구 가능.

```typescript
webSocket(WSS_RPC_URL, {
  reconnect: { attempts: 10 },  // CLOSED 시 최대 10회 재연결
  retryDelay: 1_000,            // 기본 1초, 지수 백오프 적용 (2^n * retryDelay)
  keepAlive: { interval: 30_000 }, // 30초마다 ping
})
```

**중요 제약:** `fallback` transport와 함께 사용 시 auto-reconnect가 작동하지 않는 버그가 존재한다. WAIaaS에서는 WebSocket transport를 단독으로 사용해야 한다.

**Confidence:** HIGH — GitHub Issue #2325 (closed 2024-07-26) + Issue #2563 검증

### 3-2. Solana (`@solana/kit` rpcSubscriptions)

`@solana/kit`의 `createSolanaRpcSubscriptions`는 자동 재연결을 기본 지원하지 않는다. 어플리케이션 레벨 재연결 루프 구현이 필요하다.

```typescript
// 재연결 루프 패턴 (설계 참조)
async function subscribeWithReconnect(
  rpcSubscriptions: ReturnType<typeof createSolanaRpcSubscriptions>,
  walletAddress: string,
  onIncomingTx: (sig: string) => Promise<void>,
): Promise<void> {
  let delay = 1_000; // 초기 1초
  const MAX_DELAY = 30_000; // 최대 30초

  while (!stopped) {
    const abortController = new AbortController();
    try {
      const logNotifications = await rpcSubscriptions
        .logsNotifications(
          { mentions: [address(walletAddress)] },
          { commitment: 'confirmed' }
        )
        .subscribe({ abortSignal: abortController.signal });

      delay = 1_000; // 연결 성공 시 리셋

      for await (const notification of logNotifications) {
        if (notification.value.err !== null) continue;
        await onIncomingTx(notification.value.signature);
      }
    } catch (error) {
      abortController.abort();
      // 지수 백오프
      await sleep(delay);
      delay = Math.min(delay * 2, MAX_DELAY);
    }
  }
}
```

**Confidence:** MEDIUM — `@solana/kit` 재연결 API는 공식 문서에서 명시 확인 못 함. 커뮤니티 패턴 기반 (QuickNode 가이드).

---

## 4. 폴링 폴백

### 4-1. Solana 폴링: `getSignaturesForAddress`

WebSocket 구독이 불가하거나 중단된 경우 HTTP RPC 폴링으로 폴백.

```typescript
// 마지막으로 처리한 시그니처 이후의 새 시그니처만 조회
const signatures = await rpc
  .getSignaturesForAddress(address(walletAddress), {
    until: lastKnownSignature, // 이 시그니처까지 역방향 검색 중지
    limit: 100,                // 최대 100개
    commitment: 'confirmed',
  })
  .send();

// 응답 필드 (시그니처당)
// signature: string (base58)
// slot: bigint
// err: null | object (null이면 성공)
// blockTime: number | null (Unix timestamp)
// confirmationStatus: 'processed' | 'confirmed' | 'finalized'
```

**`until` 파라미터 동작:** 역방향 검색(최신 → 과거)을 `until` 시그니처에서 중지. 새 시그니처만 가져오려면 마지막으로 처리한 시그니처를 `until`로 전달. 결과는 최신순(descending by slot)으로 반환됨.

**폴링 간격 권장:** 400ms (Solana slot time ~400ms). 단, self-hosted 데몬 컨텍스트에서 2-4초 간격도 실용적.

**Confidence:** HIGH — Solana 공식 RPC 문서 ([getSignaturesForAddress](https://solana.com/docs/rpc/http/getsignaturesforaddress)) 검증

### 4-2. EVM 폴링: `getLogs` 블록 범위 쿼리

```typescript
// 마지막 처리 블록 이후의 Transfer 이벤트 조회
const erc20Logs = await httpClient.getLogs({
  address: tokenContractAddresses,         // 모니터링할 ERC-20 계약 주소 목록
  event: parseAbiItem(
    'event Transfer(address indexed from, address indexed to, uint256 value)'
  ),
  args: { to: walletAddress as `0x${string}` },
  fromBlock: lastProcessedBlock + 1n,
  toBlock: 'latest',
});

// Native ETH: getBlockByNumber + TX 필터 (블록 범위 순회)
for (let bn = lastProcessedBlock + 1n; bn <= currentBlock; bn++) {
  const block = await httpClient.getBlock({
    blockNumber: bn,
    includeTransactions: true,
  });
  // block.transactions에서 to == walletAddress 필터
}
```

**블록 범위 제한:** eth_getLogs는 일반적으로 요청당 5,000 블록으로 제한. 누락 없이 폴링하려면 fromBlock/toBlock 범위를 적절히 분할해야 함.

**Confidence:** HIGH — viem 공식 문서 ([getLogs](https://viem.sh/docs/actions/public/getLogs.html)) 검증

---

## 5. 기존 코드와의 통합 포인트

### 5-1. SolanaAdapter 통합

현재 `SolanaAdapter`는 `createSolanaRpc(rpcUrl)`만 사용한다 (HTTP). 인커밍 모니터링은 **별도의 구독 클라이언트**(`createSolanaRpcSubscriptions(wssUrl)`)를 추가로 사용한다. SolanaAdapter 자체를 수정하는 것보다 새로운 `SolanaMonitor` 서비스로 분리하는 것이 적합하다 (단일 책임 원칙).

기존 `parseSolanaTransaction` (`tx-parser.ts`)은 base64 unsigned TX를 파싱하는 용도. 인커밍 TX 파싱은 `getTransaction(jsonParsed)`의 `preBalances`/`postBalances` 비교 방식이 다르므로 별도 파서 필요.

### 5-2. EvmAdapter 통합

현재 `EvmAdapter.connect()`는 `createPublicClient({ transport: http(rpcUrl) })`를 사용한다. WebSocket 구독을 위해서는 **WSS URL이 별도로 필요**하다. 기존 HTTP RPC URL은 폴링 폴백에서 계속 사용하고, WebSocket 클라이언트는 모니터링 전용으로 분리한다.

기존 `ERC20_ABI`와 `decodeEventLog`/`parseEventLogs`는 재사용 가능하다.

### 5-3. Notification 통합

현재 `NOTIFICATION_EVENT_TYPES` 28개 중 인커밍 TX 이벤트가 없다. 신규 이벤트 타입 (`TX_RECEIVED` 또는 `INCOMING_TX_DETECTED`) 추가가 필요하다. 이는 `@waiaas/core`의 `notification.ts` 수정을 포함한다.

기존 `INotificationChannel` 인터페이스는 그대로 활용 가능하며, 이벤트 타입만 확장하면 된다.

---

## 6. 새로운 npm 패키지 필요 여부

**결론: 신규 npm 패키지 추가 없음.**

| 기능 | 사용 라이브러리 | 버전 | 이미 설치됨? |
|------|--------------|------|------------|
| Solana WebSocket 구독 | `@solana/kit` | ^6.0.1 | YES (daemon deps) |
| Solana TX 파싱 (jsonParsed) | `@solana/kit` createSolanaRpc | ^6.0.1 | YES |
| EVM WebSocket 구독 | `viem` webSocket transport | ^2.21.0 | YES (daemon deps) |
| EVM 이벤트 로그 파싱 | `viem` decodeEventLog, parseEventLogs | ^2.21.0 | YES |
| EVM 블록 스캔 (native ETH) | `viem` watchBlocks, getBlock | ^2.21.0 | YES |
| Solana 폴링 폴백 | `@solana/kit` getSignaturesForAddress | ^6.0.1 | YES |
| EVM 폴링 폴백 | `viem` getLogs | ^2.21.0 | YES |
| 재연결 (EVM) | viem webSocket transport 내장 | ^2.21.0 | YES |
| 재연결 (Solana) | 수동 구현 (AbortController + retry loop) | — | 설계 필요 |

---

## 7. 사용하지 않을 것들

| 기술/접근법 | 사용 안 하는 이유 | 대안 |
|------------|----------------|------|
| `accountSubscribe` (Solana) | SPL 토큰 수신 감지 불가. ATA는 별개 계정이며 지갑 계정이 변경되지 않음 | `logsSubscribe({ mentions })` |
| `signatureSubscribe` (Solana) | 특정 서명 확인 대기용. 발견용 아님 | `logsSubscribe` |
| `eth_subscribe("newPendingTransactions")` (EVM) | pending TX는 확인되지 않음. 재구성(reorg)으로 사라질 수 있음. 인커밍 자금 처리에 부적합 | `eth_subscribe("logs")` + `eth_subscribe("newHeads")` |
| `ws` npm 패키지 | viem/solana-kit에 이미 WebSocket 지원 내장. 중복 의존성 | 기존 라이브러리 활용 |
| 외부 인덱서 (Helius, Alchemy webhooks) | self-hosted 철학 위배. 외부 서비스 의존성 | 직접 RPC 구독 |
| `signatureSubscribe`로 outgoing TX 확인 대기 | 이미 `waitForConfirmation`이 폴링으로 처리 | 기존 구현 유지 |
| `programSubscribe` (Solana) | 특정 프로그램 전체 변화 구독. 너무 광범위하고 노이즈 많음 | `logsSubscribe({ mentions })` |
| `eth_newFilter` + `eth_getFilterChanges` 수동 구현 | viem watchEvent가 자동으로 처리함 | viem watchEvent |

---

## 8. 구현 복잡도 및 주의사항

### 8-1. Solana SPL 토큰 첫 수신 (ATA 생성)

SPL 토큰을 처음 받는 경우 ATA(Associated Token Account)가 새로 생성된다. `preTokenBalances`에 해당 `accountIndex`가 없을 수 있으므로 `preTB`를 찾지 못할 때 잔액을 `0n`으로 처리해야 한다. 이는 `postTokenBalances`에 항목이 있고 `preTokenBalances`에 없으면 순수 신규 입금임을 의미한다.

### 8-2. EVM `watchBlocks` 성능

`includeTransactions: true` + 고트래픽 체인(Ethereum mainnet ~300 TX/블록)에서는 블록당 수백 KB 데이터 전송. 다중 지갑 모니터링 시 설계가 복잡해질 수 있다. WAIaaS의 self-hosted 단일 인스턴스 컨텍스트에서는 허용 가능하지만, Ethereum mainnet 배포 시 주의.

### 8-3. viem WebSocket Reconnect와 watchEvent 상태

WebSocket 재연결 후 `watchEvent`/`watchBlocks` unsubscribe 함수 참조가 무효화될 수 있다. 재연결 후 구독 재등록 로직 설계 필요.

### 8-4. Config 통합 (WSS URL)

현재 config.toml에 `rpc_url`만 있다. WebSocket 구독을 위한 `wss_url` 설정 추가 필요. 일부 RPC 제공자는 HTTP와 WebSocket URL이 다르다 (예: `https://api.mainnet-beta.solana.com` vs `wss://api.mainnet-beta.solana.com`). 일부는 포트 변환이 필요하다.

---

## Sources

| 소스 | 신뢰도 | 근거 |
|------|--------|------|
| [Solana logsSubscribe 공식 문서](https://solana.com/docs/rpc/websocket/logssubscribe) | HIGH | 파라미터 + 응답 형식 검증 |
| [Solana accountSubscribe 공식 문서](https://solana.com/docs/rpc/websocket/accountsubscribe) | HIGH | 감지 범위 한계 확인 |
| [Solana exchange 통합 가이드](https://solana.com/developers/guides/advanced/exchange) | HIGH | jsonParsed 파싱 패턴 검증 |
| [Solana getSignaturesForAddress 공식 문서](https://solana.com/docs/rpc/http/getsignaturesforaddress) | HIGH | until/limit 파라미터 검증 |
| [QuickNode @solana/kit 구독 가이드](https://www.quicknode.com/guides/solana-development/tooling/web3-2/subscriptions) | MEDIUM | createSolanaRpcSubscriptions API 패턴 |
| [viem watchEvent 공식 문서](https://viem.sh/docs/actions/public/watchEvent) | HIGH | poll:false + WebSocket = eth_subscribe 확인 |
| [viem watchBlocks 소스코드](https://github.com/wevm/viem/blob/main/src/actions/public/watchBlocks.ts) | HIGH | eth_subscribe("newHeads") + includeTransactions |
| [viem getLogs 공식 문서](https://viem.sh/docs/actions/public/getLogs.html) | HIGH | 폴링 폴백 파라미터 검증 |
| [viem decodeEventLog/parseEventLogs 공식 문서](https://viem.sh/docs/contract/parseEventLogs) | HIGH | ERC-20 로그 디코딩 패턴 |
| [viem WebSocket Transport Issue #2325](https://github.com/wevm/viem/issues/2325) | HIGH | reconnect 버그 수정 확인 (2024-07-26) |
| [viem GitHub Discussion #503](https://github.com/wevm/viem/discussions/503) | HIGH | eth_subscribe vs polling 동작 검증 |

---

## Confidence Assessment

| 영역 | Confidence | 이유 |
|------|-----------|------|
| Solana logsSubscribe RPC 파라미터/응답 | HIGH | 공식 Solana 문서 직접 확인 |
| Solana getTransaction jsonParsed 파싱 | HIGH | 공식 exchange 가이드 + 실제 응답 구조 확인 |
| @solana/kit createSolanaRpcSubscriptions API | MEDIUM | QuickNode 가이드 기반. `logsNotifications()` 메서드명 코드에서 재확인 필요 |
| viem watchEvent eth_subscribe 동작 | HIGH | GitHub 소스코드 + Discussion 다중 검증 |
| viem watchBlocks includeTransactions | HIGH | 소스코드 직접 확인 |
| viem WebSocket reconnect 동작 | HIGH | Issue 추적 + 수정 커밋 확인 |
| EVM native ETH 이벤트 없음 | HIGH | EVM 스펙 사실 (이벤트 = EMIT 명령어 전용) |
| Solana getSignaturesForAddress until 파라미터 | HIGH | 공식 RPC 문서 확인 |

---

*Stack research for: WAIaaS 인커밍 트랜잭션 모니터링 설계 마일스톤*
*Researched: 2026-02-21*
