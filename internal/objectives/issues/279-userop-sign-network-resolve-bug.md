# #279 — UserOp Sign 라우트 network 추론 로직 오류로 RPC URL 해석 실패

- **유형:** BUG
- **심각도:** CRITICAL
- **마일스톤:** —
- **상태:** FIXED

## 증상

`POST /v1/wallets/:id/userop/sign` 호출 시 항상 `CHAIN_ERROR: No RPC URL configured. Configure rpc.evm_* in config.toml.` 에러 반환. Build는 정상 동작하지만 Sign은 100% 실패.

## 근본 원인

Sign 라우트(`userop.ts:438-444`)에서 build 시 사용한 network를 DB에 저장하지 않아서, `rpcConfig` 키를 순회하며 network를 추론하는 해킹적 로직을 사용:

```typescript
for (const key of Object.keys(rpcConfig)) {
  if (key.startsWith('evm_') || key.startsWith('ethereum_')) {
    network = key.replace(/^evm_/, '').replace(/^ethereum_/, '');
    break;
  }
}
```

**이중 replace 버그**: 키 `evm_ethereum_mainnet`에서:
1. `replace(/^evm_/, '')` → `ethereum_mainnet`
2. `replace(/^ethereum_/, '')` → `mainnet` (잘못됨!)

결과: `resolveRpcUrl(rpcConfig, 'ethereum', 'mainnet')` → key `evm_mainnet` → 존재하지 않는 키 → 빈 문자열 → 에러.

Build 라우트는 request body에서 `network`를 직접 받으므로 이 문제가 없음.

## 수정 방안

1. **근본 수정**: `userop_builds` 테이블에 `network` 컬럼 추가 (DB 마이그레이션 v46). Build 시 network 저장, Sign 시 build record에서 읽기.
2. **즉시 수정**: 이중 replace 대신 `configKeyToNetwork()` 함수 사용 (이미 `adapter-pool.ts`에 구현됨, `evm_ethereum_sepolia` → `ethereum-sepolia` 정확 변환).

## 테스트에서 미발견된 원인

Sign 라우트의 기존 테스트(`userop-route-handler.test.ts:416-531`)는 **에러 케이스만 검증**:
- WALLET_NOT_FOUND, EOA 거부, Solana 거부, DEPRECATED_SMART_ACCOUNT
- BUILD_NOT_FOUND, BUILD_ALREADY_USED, CALLDATA_MISMATCH

**Sign happy path(RPC 연결 → SmartAccount 생성 → 서명 → 응답) 테스트가 완전히 누락됨.** SmartAccount 생성에 실제 RPC 호출과 viem `privateKeyToAccount`가 필요해서 모킹이 복잡하다는 이유로 건너뛴 것으로 추정. 결과적으로 RPC URL resolve → 서명까지의 핵심 경로가 검증되지 않아 이 버그가 구현 시점부터 존재했음.

## 테스트 항목

1. **[unit] Sign happy path**: rpcConfig에 실제 EVM 키가 있을 때 network가 정확히 추론되고 RPC URL이 resolve되는지 검증 (SmartAccount/viem mock 필요)
2. **[unit] configKeyToNetwork 호환성**: Sign 라우트의 network 추론 결과가 `resolveRpcUrl`과 호환되는지 검증
3. **[unit] 다중 EVM 키**: rpcConfig에 여러 EVM 네트워크가 있을 때 build record의 network와 일치하는 키를 선택하는지 검증 (근본 수정 시)
4. **[unit] DB network 컬럼**: build record에 network가 저장되고 sign에서 읽히는지 검증 (근본 수정 시)
5. **[integration] Build → Sign 풀 플로우**: Build 응답의 buildId로 Sign 호출 시 성공하는 E2E 검증

## 영향 범위

- `packages/daemon/src/api/routes/userop.ts` — Sign 라우트 network 추론 로직
- `packages/daemon/src/infrastructure/database/schema.ts` — userop_builds 테이블 (근본 수정 시)
- `packages/daemon/src/__tests__/userop-route-handler.test.ts` — Sign happy path 테스트 추가
