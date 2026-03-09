# #261 — Solana simulateTransaction 에러 객체 BigInt JSON 직렬화 실패

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **발견일:** 2026-03-06
- **마일스톤:** —
- **영향 범위:** `packages/adapters/solana/src/adapter.ts` — `simulateTransaction()`

## 증상

Jito SOL 스테이킹(또는 Solana CONTRACT_CALL 계열) 트랜잭션이 온체인 시뮬레이션에서 실패할 때, 실패 사유 대신 아래 에러로 트랜잭션이 FAILED 처리됨:

```
Failed to simulate transaction: Do not know how to serialize a BigInt
```

실제 온체인 시뮬레이션 에러(예: InstructionError)가 마스킹되어 디버깅 불가.

## 재현 조건

1. Solana devnet에서 Jito Stake Pool DepositSol 실행 (devnet에 Jito 미지원)
2. DELAY 티어 배정 → 쿨다운 만료 → stage5Execute 진입
3. `adapter.simulateTransaction()` → RPC `simulateTransaction` 호출 → 온체인 에러 반환
4. 에러 객체 직렬화 시 `JSON.stringify` 실패

**핵심:** 시뮬레이션이 **성공**하는 경우(`simValue.err === null`)에는 발생하지 않음. 시뮬레이션이 **실패**하여 에러 객체를 반환할 때만 발생.

## 근본 원인

### 원인 체인

1. `@solana/kit` 6.x의 HTTP 트랜스포트(`@solana/rpc-transport-http`)가 RPC 응답을 `parseJsonWithBigInts()`로 파싱
2. `parseJsonWithBigInts`는 소수점/지수 표기가 없는 **모든 정수**를 `BigInt`로 변환 (0, 1, 6001 등 포함)
3. 시뮬레이션 실패 시 RPC 응답의 `err` 객체:
   ```json
   { "InstructionError": [0, {"Custom": 6001}] }
   ```
   파싱 후:
   ```js
   { InstructionError: [0n, { Custom: 6001n }] }
   ```
4. `adapter.ts:350`에서 `JSON.stringify(simValue.err)` 호출 → BigInt 직렬화 불가 → TypeError

### 코드 위치

```typescript
// packages/adapters/solana/src/adapter.ts:350
error: simValue.err ? JSON.stringify(simValue.err) : undefined,
```

`@solana/kit`는 자체 `stringifyJsonWithBigInts()`를 제공하지만, 어댑터 코드에서 결과를 재직렬화할 때 일반 `JSON.stringify`를 사용하여 호환성이 깨짐.

## 해결 방안

`JSON.stringify` 호출에 BigInt replacer를 추가:

```typescript
// Before (adapter.ts:350)
error: simValue.err ? JSON.stringify(simValue.err) : undefined,

// After
error: simValue.err
  ? JSON.stringify(simValue.err, (_, v) => typeof v === 'bigint' ? v.toString() : v)
  : undefined,
```

## 부수 이슈

Jito Stake Pool(`Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb`)은 **mainnet-beta 전용**. devnet에서 시뮬레이션하면 반드시 InstructionError가 발생하므로, devnet 환경에서 Jito 스테이킹 테스트 시 이 점을 문서화하거나 네트워크 가드를 추가할 수 있음.

## 테스트 항목

1. **단위 테스트:** `SolanaAdapter.simulateTransaction()`에서 `simValue.err`에 BigInt가 포함된 경우 에러 문자열이 정상 반환되는지 검증
2. **단위 테스트:** `simValue.err`가 `null`인 경우(시뮬레이션 성공) 기존 동작 유지 확인
3. **단위 테스트:** `simValue.err`에 중첩 BigInt 값(`[0n, { Custom: 6001n }]`)이 포함된 경우 직렬화 결과가 올바른 숫자 문자열인지 검증
4. **통합 테스트:** Jito 스테이킹 devnet 시뮬레이션 실패 시 실제 InstructionError 사유가 트랜잭션 error 필드에 기록되는지 확인
