# 430 — IncomingTx 서비스에서 console.* 직접 호출 (ILogger 미사용)

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** OPEN
- **발견일:** 2026-03-23

## 현상

데몬 시작 시 IncomingTxMonitor 관련 서비스들이 `console.warn()`, `console.debug()`, `console.log()`를 직접 호출하여 프로덕션 로그에 디버그 메시지가 노출된다.

```
IncomingTxMonitor: failed to subscribe wallet 019c88f6-... on optimism-mainnet: RpcRequestError: ...
IncomingTxMonitorService started: 8 wallets, 37 network subscriptions
```

ILogger를 통하지 않으므로 로그 레벨 필터링이 불가능하다.

## 원인

IncomingTxMonitorService에 ILogger가 의존성으로 주입되지 않아 모든 로그가 `console.*` 직접 호출이다.

### 직접 호출 위치 (13곳)

**incoming-tx-monitor-service.ts** (7곳):
- L184: `console.warn()` — unknown chain:environment
- L199: `console.warn()` — subscription failure
- L210: `console.debug()` — startup summary
- L234: `console.debug()` — service stopped
- L276: `console.warn()` — syncSubscriptions failure
- L524: `console.warn()` — Solana polling worker error
- L541: `console.warn()` — EVM polling worker error

**incoming-tx-queue.ts** (1곳):
- L58: `console.warn()` — queue overflow

**incoming-tx-workers.ts** (3곳):
- L136: `console.warn()` — confirmation check failure
- L167: `console.log()` — retention worker deletion
- L203: `console.warn()` — gap recovery failure

**evm-incoming-subscriber.ts** (2곳):
- L288: `console.warn()` — EVM poll failed
- L314: `console.warn()` — EVM RPC-level error

## 참고: 외부 라이브러리 로그

`"Server responded with 429 Too Many Requests. Retrying after Xms delay..."` 메시지는 WAIaaS 코드가 아닌 외부 라이브러리(viem HTTP transport 또는 @drift-labs/sdk)에서 출력된다. 이는 WAIaaS에서 제어할 수 없으며, 별도 대응이 필요하다면 viem의 custom transport나 Drift SDK의 logger 옵션을 검토해야 한다.

## 수정 방안

1. IncomingTxMonitorService 생성자에 ILogger 의존성 추가
2. 모든 `console.*` 호출을 `this.logger.warn()` / `this.logger.debug()` / `this.logger.info()`로 교체
3. IncomingTxQueue, IncomingTxWorkers에도 ILogger 전달
4. EVM 어댑터의 EvmIncomingSubscriber에도 ILogger 옵셔널 주입

## 영향 범위

- `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts`
- `packages/daemon/src/services/incoming/incoming-tx-queue.ts`
- `packages/daemon/src/services/incoming/incoming-tx-workers.ts`
- `packages/adapters/evm/src/evm-incoming-subscriber.ts`

## 테스트 항목

- [ ] ILogger 주입 후 로그 레벨 필터링 동작 확인 (debug 레벨 비활성 시 startup summary 미출력)
- [ ] logger 미주입 시 fallback(ConsoleLogger 또는 noop) 동작 확인
- [ ] 기존 로그 메시지 포맷 유지 확인 (prefix `IncomingTxMonitor:` 등)
