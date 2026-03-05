# #251 Smart Account 파이프라인에서 RPC URL 미해석 — base-sepolia 등 트랜잭션 실패

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **발견일:** 2026-03-05

## 증상

Smart Account(AA) 지갑으로 base-sepolia에서 TOKEN_TRANSFER 전송 시 트랜잭션이 FAILED 처리됨.

에러 메시지:
```
No URL was provided to the Transport. Please provide a valid RPC URL to the Transport.
```

config.toml에 base-sepolia RPC URL이 정상 설정되어 있음에도 불구하고 발생.

## 원인 분석

`stage5ExecuteSmartAccount` (`packages/daemon/src/pipeline/stages.ts:1233-1236`)에서 Smart Account용 `publicClient`를 생성할 때, adapter의 내부 필드를 직접 참조하고 있음:

```typescript
const publicClient = createPublicClient({
  chain: (ctx.adapter as any).viemChain ?? undefined,      // 존재하지 않는 프로퍼티
  transport: http((ctx.adapter as any).rpcUrl ?? undefined), // 존재하지 않는 프로퍼티
});
```

문제점:
1. **`rpcUrl` 미존재**: `EvmAdapter`는 `connect(rpcUrl)` 호출 시 내부적으로 `createPublicClient`를 만들기만 하고, RPC URL 자체를 프로퍼티로 저장하지 않음. `(ctx.adapter as any).rpcUrl`은 항상 `undefined`.
2. **`viemChain` 미존재**: `EvmAdapter`의 chain 객체는 `private _chain`으로 저장됨. `viemChain`이라는 프로퍼티는 존재하지 않음.
3. **`http(undefined)`**: viem의 `http()` 트랜스포트에 `undefined`가 전달되어 "No URL was provided" 에러 발생.

EOA 지갑은 `stage5Execute`에서 `ctx.adapter.submitTransaction()`을 호출하므로 adapter가 이미 connect된 상태의 내부 client를 사용하여 문제 없음. Smart Account 경로만 별도 publicClient를 생성하면서 버그 발생.

## 해결 방안

adapter의 private 필드를 해킹하는 대신, **PipelineContext에 RPC URL을 명시적으로 전달**:

1. **`PipelineContext`에 `resolvedRpcUrl` 필드 추가**:
   ```typescript
   export interface PipelineContext {
     ...
     resolvedRpcUrl?: string;
   }
   ```

2. **`transactions.ts` send 핸들러에서 context에 포함**: `resolveRpcUrl()`로 이미 구한 RPC URL을 ctx에 전달.
   ```typescript
   const rpcUrl = resolveRpcUrl(deps.config.rpc, wallet.chain, resolvedNetwork);
   const ctx: PipelineContext = { ..., resolvedRpcUrl: rpcUrl };
   ```

3. **`stage5ExecuteSmartAccount`에서 `ctx.resolvedRpcUrl` 사용**:
   ```typescript
   const publicClient = createPublicClient({
     chain: networkToViemChain(ctx.resolvedNetwork),
     transport: http(ctx.resolvedRpcUrl),
   });
   ```

4. **`viemChain` 해결**: network ID로부터 viem Chain 객체를 직접 resolve하는 유틸 함수 사용 (기존 `resolveViemChain` 등 활용 또는 신규 매핑).

5. **daemon.ts 재진입 경로 동기화**: DELAY/GAS_WAITING 재진입 시에도 `resolvedRpcUrl`이 context에 포함되도록 동기화.

## 영향 범위

- Smart Account(accountType=smart) 지갑의 모든 트랜잭션 전송
- EOA 지갑은 영향 없음 (다른 실행 경로 사용)
- 모든 EVM 네트워크에서 발생 (base-sepolia에 국한되지 않음)

## 테스트 항목

1. **단위 테스트**: `stage5ExecuteSmartAccount`가 `ctx.resolvedRpcUrl`을 사용하여 publicClient를 생성하는지 검증
2. **단위 테스트**: `PipelineContext.resolvedRpcUrl`이 undefined일 때 적절한 에러 발생 확인
3. **단위 테스트**: network ID → viem Chain 매핑 유틸 함수 정확성 검증 (base-sepolia, ethereum-sepolia 등)
4. **통합 테스트**: Smart Account 파이프라인이 config.toml의 RPC URL을 정상적으로 사용하는지 확인
5. **통합 테스트**: DELAY/GAS_WAITING 재진입 경로에서도 resolvedRpcUrl이 유지되는지 확인
6. **회귀 테스트**: EOA 지갑 트랜잭션 전송이 변경 후에도 정상 동작 확인
