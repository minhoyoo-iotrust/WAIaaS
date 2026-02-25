# #169 IncomingTxMonitor EVM 폴링이 무료 RPC 엔드포인트 rate limit 초과

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v28.3
- **상태:** OPEN

---

## 증상

데몬 시작 후 IncomingTxMonitor가 EVM 네트워크 폴링 중 3가지 유형의 에러를 반복 발생시킨다:

1. **429 Too Many Requests** — `optimism.drpc.org` (rate limit 초과)
2. **500 Internal Server Error** — `optimism-sepolia.drpc.org` (서버 과부하)
3. **ResourceNotFoundRpcError** — `polygon-amoy.drpc.org`, `arbitrum.drpc.org` (과부하로 인한 비정상 JSON-RPC 응답)

```
EVM poll failed for wallet ...: HttpRequestError: HTTP request failed.
Status: 429  URL: https://optimism.drpc.org/
Details: {"message":"Too many request, try again later","code":15}

EVM poll failed for wallet ...: ResourceNotFoundRpcError: Requested resource not found.
URL: https://polygon-amoy.drpc.org
Details: incorrect response body: wrong json-rpc response
```

---

## 근본 원인

### 1. 과도한 RPC 호출량

`#164` 수정으로 IncomingTxMonitor가 월렛의 **모든** 구독 네트워크를 폴링하게 되었으나, RPC 호출량 증가에 대한 대비가 없다.

| 항목 | 수치 |
|------|------|
| 월렛 수 | 4개 |
| EVM 네트워크 | 10개 (5체인 × mainnet/testnet) |
| 구독 수 | 13개 (EVM 10 + Solana 3) |
| **폴 사이클당 RPC 호출** | |
| - getBlockNumber() | 10회 (네트워크당 1회) |
| - getLogs() (ERC-20) | 10회 (네트워크당 1회) |
| - getBlock() (네이티브 ETH) | 최대 100회 (네트워크당 최대 10블록) |
| **합계** | **~120회 / 30초** |
| 초당 호출률 | **~4 calls/sec** |

무료 dRPC 엔드포인트는 초당 요청 제한이 있으며 (free tier), 버스트 요청에 429로 응답한다.

### 2. 에러 시 백오프 부재

`EvmIncomingSubscriber.pollAll()` (evm-incoming-subscriber.ts:146-148):
```typescript
} catch (err) {
  console.warn(`EVM poll failed for wallet ${walletId}:`, err);
}
```

- 429 에러 후에도 다음 폴링을 30초 후 동일 빈도로 재시도
- 지수 백오프(exponential backoff) 없음
- 서킷 브레이커 없음
- `Retry-After` 헤더 무시

### 3. 폴링 스태거링 부재

`IncomingTxMonitorService` (incoming-tx-monitor-service.ts:537-550):
```typescript
for (const { subscriber } of entries) {
  await subscriber.pollAll();  // 10개 네트워크를 순차로 back-to-back 호출
}
```

- 네트워크 간 지연 없이 순차 실행
- 같은 RPC 프로바이더(dRPC)의 여러 엔드포인트를 동시에 부하

---

## 해결 방안

### A. 지수 백오프 + 에러 카운터 (필수)

`EvmIncomingSubscriber`에 per-network 에러 카운터와 지수 백오프 추가:

```typescript
// 에러 연속 발생 시 폴링 스킵
private errorCount = 0;
private backoffUntil = 0;

async pollAll(): Promise<void> {
  if (Date.now() < this.backoffUntil) return; // 백오프 중 스킵
  try {
    // ... 기존 폴링 로직
    this.errorCount = 0; // 성공 시 리셋
  } catch (err) {
    this.errorCount++;
    const backoffSec = Math.min(30 * 2 ** this.errorCount, 300); // 30s, 60s, 120s, 최대 300s
    this.backoffUntil = Date.now() + backoffSec * 1000;
    console.warn(`EVM poll failed (backoff ${backoffSec}s):`, err);
  }
}
```

### B. 네트워크 간 폴링 스태거링 (필수)

`IncomingTxMonitorService`의 EVM 폴링 워커에서 네트워크 간 간격 삽입:

```typescript
for (const { subscriber } of entries) {
  await subscriber.pollAll();
  await sleep(2000); // 네트워크 간 2초 간격
}
```

### C. getBlock() 호출 최적화 (권장)

현재 네이티브 ETH 감지를 위해 블록당 1회 `getBlock(includeTransactions:true)` 호출 (최대 10블록 = 10회). 이를 최적화:

- 블록 범위당 1회 `eth_getBlockReceipts` 또는 배치 RPC 사용 검토
- 또는 네이티브 ETH 감지를 `eth_getLogs`의 내부 트랜잭션 이벤트 기반으로 전환 (장기)

### D. 에러 로그 레벨 조정 (권장)

일시적 RPC 에러(429, 500)는 `warn` 대신 `debug` 레벨로 변경하여 로그 노이즈 감소. 연속 N회 실패 시에만 `warn` 출력.

---

## 재발 방지 방안

### 1. RPC 호출량 산정 기준 수립

네트워크 구독 수 변경 시 (예: 새 체인 추가, #164 같은 구독 확대) RPC 호출량 영향을 사전 평가하는 체크리스트:

- 폴 사이클당 RPC 호출 수 = (네트워크 수) × (월렛당 호출 수)
- 무료 RPC 제공자의 rate limit 대비 초당 호출률 계산
- 30초 폴링 기준, 전체 호출이 폴링 간격 내에 완료되는지 확인

### 2. RPC 호출 계측 추가

폴링 워커에 호출 수/에러율/소요 시간 메트릭 수집:
- 폴 사이클당 총 RPC 호출 수
- 429/500 에러 빈도
- 폴 사이클 소요 시간 (30초 초과 시 경고)

### 3. 유료 RPC 권장 안내

Admin UI Settings > RPC 페이지에서 무료 dRPC 사용 시 "무료 RPC는 rate limit이 낮습니다. 프로덕션 환경에서는 유료 RPC(Alchemy, Infura 등)를 권장합니다" 안내 표시 검토.

---

## 테스트 항목

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 429 에러 시 지수 백오프 적용 | mock RPC 429 반환 → 첫 에러 후 backoffUntil 설정 → 백오프 기간 내 pollAll() 호출 시 RPC 미호출 assert | [L0] |
| 2 | 연속 에러 시 백오프 증가 | mock RPC 3회 연속 실패 → 백오프 30s → 60s → 120s 순차 증가 assert | [L0] |
| 3 | 성공 시 백오프 리셋 | 2회 실패 후 1회 성공 → errorCount=0, backoffUntil=0 assert | [L0] |
| 4 | 백오프 상한 300초 | 10회 연속 실패 → backoff가 300초를 초과하지 않음 assert | [L0] |
| 5 | 네트워크 간 스태거링 | 3개 EVM subscriber → pollAll() 호출 사이 최소 2초 간격 assert | [L0] |
| 6 | 일시적 에러 로그 레벨 | 첫 429 에러는 debug, 연속 3회 이상은 warn 로그 assert | [L0] |

---

*발견일: 2026-02-24*
*발견 환경: npm 최신 RC 버전, 무료 dRPC 엔드포인트, 4 wallets × 13 network subscriptions*
*관련: #164 (전체 네트워크 구독 확대), EvmIncomingSubscriber, IncomingTxMonitorService*
