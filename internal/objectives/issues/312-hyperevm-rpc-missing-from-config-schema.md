# #312 — HyperEVM RPC 기본값이 Config Zod 스키마에 누락

- **유형:** MISSING
- **심각도:** MEDIUM
- **상태:** OPEN
- **발견일:** 2026-03-10

## 현상

Admin UI 지갑 상세 페이지에서 HyperEVM 네트워크(hyperevm-mainnet, hyperevm-testnet)만 "RPC endpoint not configured" 표시.
다른 EVM 네트워크(polygon-amoy, arbitrum-sepolia 등)는 정상적으로 잔액 표시됨.

## 원인

`packages/daemon/src/infrastructure/config/loader.ts`의 Zod ConfigSchema `rpc` 섹션에 HyperEVM 네트워크 기본값이 누락됨.

### 현재 상태 (loader.ts:56-76)

Zod 스키마에 다음 네트워크만 `.default()` 정의:
- solana: mainnet, devnet, testnet + ws
- evm: ethereum, polygon, arbitrum, optimism, base (각 mainnet/testnet)

**누락:** `evm_hyperevm_mainnet`, `evm_hyperevm_testnet`

### 영향 경로

1. config.toml에 `[rpc]` 섹션이 없으면 Zod `.default({})` 가 빈 객체 생성 후 각 필드의 `.default()` 로 채움
2. HyperEVM 키가 스키마에 없으므로 `config.rpc.evm_hyperevm_testnet`이 `undefined`
3. Admin 잔액 조회(`admin.ts:1948`)에서 `resolveRpcUrl(deps.daemonConfig.rpc, ...)` → 빈 문자열 반환
4. "RPC endpoint not configured" 에러 표시

### 다른 네트워크가 정상인 이유

polygon-amoy, arbitrum-sepolia 등은 Zod 스키마에 `.default()` URL이 정의되어 있어서 config.toml에 없어도 자동 채워짐.

## 수정 방안

`packages/daemon/src/infrastructure/config/loader.ts` rpc Zod 스키마에 HyperEVM 기본값 추가:

```typescript
evm_hyperevm_mainnet: z.string().default('https://rpc.hyperliquid.xyz/evm'),
evm_hyperevm_testnet: z.string().default('https://rpc.hyperliquid-testnet.xyz/evm'),
```

> 참고: `setting-keys.ts`와 `built-in-defaults.ts`에는 이미 HyperEVM 기본값이 정의되어 있음. Zod 스키마만 누락.

## 테스트 항목

1. **단위 테스트**: Config 로딩 시 `[rpc]` 섹션 없이도 `config.rpc.evm_hyperevm_testnet` 기본값 존재 확인
2. **단위 테스트**: Admin 잔액 조회에서 HyperEVM 네트워크가 "RPC endpoint not configured" 에러를 반환하지 않는지 확인
3. **통합 테스트**: 데몬 기동 후 Admin UI 지갑 상세 페이지에서 HyperEVM 네트워크 잔액 정상 표시 확인
