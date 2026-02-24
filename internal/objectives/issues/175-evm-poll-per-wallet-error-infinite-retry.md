# #175 EVM IncomingSubscriber per-wallet 폴링 에러 시 무한 재시도 + 로그 스팸

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v28.4
- **상태:** FIXED

---

## 증상

Polygon Amoy 네트워크에서 `eth_getLogs` 호출이 `ResourceNotFoundRpcError` (code -32001)로 실패하며,
동일한 블록 범위에 대해 매 폴링 주기(12-30초)마다 재시도가 반복된다.

```
EVM poll failed for wallet 019c6fb6-...: ResourceNotFoundRpcError: Requested resource not found.
URL: https://polygon-amoy.drpc.org
Request body: {"method":"eth_getLogs","params":[...,"fromBlock":"0x20cd71c","toBlock":"0x20cd725"]}
Details: incorrect response body: wrong json-rpc response - there is neither result nor error
```

- 같은 wallet, 같은 블록 범위가 매 주기 반복
- 풀 스택 트레이스가 매번 출력되어 콘솔 스팸 발생
- 다른 네트워크/지갑 폴링은 정상 (per-wallet 격리는 동작 중)

---

## 근본 원인

`EvmIncomingSubscriber.pollAll()`의 per-wallet try/catch에서 **3가지 누락**:

### 1. `sub.lastBlock` 미전진

```typescript
// evm-incoming-subscriber.ts:136-176
for (const [walletId, sub] of this.subscriptions) {
  try {
    const erc20Txs = await this.pollERC20(...);  // ← 여기서 throw
    // ...
    sub.lastBlock = toBlock;  // ← 에러 시 도달 불가
  } catch (err) {
    hadError = true;
    console.warn(`EVM poll failed for wallet ${walletId}:`, err);
    // sub.lastBlock 미갱신 → 다음 주기에 같은 범위 재시도
  }
}
```

`pollERC20()` 실패 시 `sub.lastBlock`이 갱신되지 않아 동일 블록 범위 `[lastBlock+1, toBlock]`을 영원히 재시도.

### 2. per-wallet 백오프 부재

글로벌 백오프(`this.errorCount`, `this.backoffUntil`)는 `getBlockNumber()` 실패에만 적용.
per-wallet `eth_getLogs` 실패는 `hadError = true`만 설정하고 백오프 없이 매 주기 재시도.

### 3. 과도한 로그 출력

`console.warn(err)` — 에러 객체 전체(스택 트레이스 + cause chain)가 매 주기 출력.
지속적 RPC 장애 시 콘솔이 동일 에러로 도배됨.

---

## 영향

- **콘솔 가독성 저하**: 정상 로그가 에러 스팸에 묻힘
- **불필요한 RPC 부하**: 실패할 블록 범위를 12-30초마다 재요청
- **커서 정체**: 에러 지갑의 모니터링이 영구 정지 (새 블록 감지 불가)
- **dRPC rate limit 소진**: 실패 요청도 무료 크레딧 차감

---

## 수정 방안

### 1. per-wallet 에러 카운터 + 지수 백오프

`EvmSubscription` 인터페이스에 에러 상태 추가:

```typescript
interface EvmSubscription {
  address: string;
  network: string;
  onTransaction: (tx: IncomingTransaction) => void;
  lastBlock: bigint;
  errorCount: number;       // 추가
  backoffUntil: number;     // 추가
}
```

per-wallet catch 블록에서:
```typescript
catch (err) {
  sub.errorCount++;
  const backoff = Math.min(BACKOFF_BASE_MS * 2 ** (sub.errorCount - 1), BACKOFF_MAX_MS);
  sub.backoffUntil = Date.now() + backoff;
  if (sub.errorCount >= WARN_THRESHOLD) {
    console.warn(`EVM poll failed for wallet ${walletId} (backoff ${backoff/1000}s, consecutive: ${sub.errorCount}):`,
      err instanceof Error ? err.message : err);
  }
}
```

폴링 시작 시 per-wallet 백오프 확인:
```typescript
if (Date.now() < sub.backoffUntil) continue;
```

### 2. 커서 전진 정책

연속 실패 N회 이후 커서를 강제 전진하여 무한 루프 탈출:

```typescript
const MAX_RETRY_SAME_RANGE = 3;

catch (err) {
  sub.errorCount++;
  if (sub.errorCount >= MAX_RETRY_SAME_RANGE) {
    sub.lastBlock = toBlock;  // 강제 전진 — 해당 블록 범위 트랜잭션 누락 감수
  }
  // ...
}
```

성공 시 에러 카운터 리셋:
```typescript
sub.lastBlock = toBlock;
sub.errorCount = 0;
sub.backoffUntil = 0;
```

### 3. 로그 간소화

- 에러 객체 대신 `err.message`만 출력
- WARN_THRESHOLD 미만은 debug 레벨로 억제
- 연속 에러 카운트를 메시지에 포함하여 추적 가능

---

## 관련 파일

- `packages/adapters/evm/src/evm-incoming-subscriber.ts` — pollAll() per-wallet catch 블록
- `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts` — 폴링 워커 등록
- `packages/daemon/src/services/incoming/subscription-multiplexer.ts` — subscriber 생성

## 관련 이슈

- #169: EVM 폴링 rate limit (글로벌 백오프 도입) — per-wallet 백오프는 미해결
- #172: L2 getBlock 타임아웃 (pollNativeETH 스킵) — pollERC20 에러 핸들링은 미해결

---

## 테스트 항목

- [ ] per-wallet pollERC20 실패 시 sub.lastBlock이 N회 후 전진하는지 확인
- [ ] per-wallet 백오프가 지수적으로 증가하는지 확인 (30s → 60s → 120s...)
- [ ] 백오프 중인 지갑이 pollAll()에서 스킵되는지 확인
- [ ] 성공 시 per-wallet errorCount + backoffUntil 리셋 확인
- [ ] WARN_THRESHOLD 미만 에러에서 warn 로그 미출력 확인
- [ ] 다른 지갑 폴링에 영향 없는지 확인 (격리 유지)
