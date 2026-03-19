# #417 — DCent Swap Solana 체인이 EVM 전용 가드에 의해 차단됨

- **유형**: BUG
- **심각도**: HIGH
- **영향 시나리오**: defi-16
- **컴포넌트**: `packages/actions/src/providers/dcent-swap/index.ts`
- **관련**: #410 (txdata 스키마 회귀 — 체인 가드 추가로 선행 차단됨), #394, #384 (FIXED)
- **상태**: FIXED
- **수정일**: 2026-03-20
- **발견일**: 2026-03-19

## 현상

`POST /v1/actions/dcent_swap/dex_swap?dryRun=true` 에서 Solana 지갑으로 호출 시:
```json
{
  "code": "ACTION_RESOLVE_FAILED",
  "message": "Action resolve failed: D'CENT Swap only supports EVM (ethereum) chains. Got: solana"
}
```

**DCent API는 Solana 스왑을 지원하지만**, 프로바이더의 체인 가드가 이를 차단하고 있음.

## 실행 경로

```
POST /v1/actions/dcent_swap/dex_swap?dryRun=true
  → DCentSwapProvider.resolve('dex_swap', params, context)
    [packages/actions/src/providers/dcent-swap/index.ts:145-210]
  → Chain guard check (lines 150-155)
    → context.chain === 'solana' → throw ChainError  ← ERROR HERE
```

## 원인 분석

### 체인 가드 (잘못된 제한)

**파일**: `packages/actions/src/providers/dcent-swap/index.ts:150-155`

```typescript
async resolve(actionName: string, params: Record<string, unknown>, context: ActionContext) {
  // Chain guard: D'CENT Swap only supports EVM chains
  if (context.chain !== 'ethereum') {
    throw new ChainError('INVALID_INSTRUCTION', context.chain, {
      message: `D'CENT Swap only supports EVM (ethereum) chains. Got: ${context.chain}`,
    });
  }
  // ...
}
```

### 체인 가드가 추가된 배경

이전 이슈 #394, #410에서 Solana 트랜잭션 처리 시 EVM 전용 스키마(`txdata.from`, `txdata.to`)가 적용되어 Zod 검증 실패. 근본 수정(Solana 트랜잭션 빌더 구현) 대신 임시 체인 가드를 추가하여 선행 차단한 것.

### 코드에 Solana 구현이 이미 존재

1. **Currency Mapper** (`currency-mapper.ts:47, 85-90`):
   ```typescript
   DCENT_NATIVE_TO_CAIP2: {
     SOLANA: { caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', slip44: 501 },
   }
   ```

2. **Auto-router Intermediate Tokens** (`auto-router.ts:89-93`):
   ```typescript
   'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': [
     { caip19: 'solana:.../slip44:501', symbol: 'SOL', decimals: 9 },
     { caip19: 'solana:.../token:EPjF...', symbol: 'USDC', decimals: 6 },
     { caip19: 'solana:.../token:Es9v...', symbol: 'USDT', decimals: 6 },
   ]
   ```

3. **이전 이슈 #384** (FIXED): DCent Swap Solana 출발 2-hop 라우팅 — `INTERMEDIATE_TOKENS`에 Solana 추가

### 핵심 문제: Solana 트랜잭션 빌더 미구현

DCent API는 Solana 스왑을 지원하지만, 프로바이더가 DCent API의 Solana 응답을 처리하는 트랜잭션 빌더가 없음:
- EVM: `txdata { from, to, data, value }` → `ContractCallRequest` 변환 구현됨
- Solana: DCent API 응답 형식 확인 후 `ContractCallRequest` (또는 Solana instruction) 변환 필요

## 수정 방향

### 1단계: 체인 가드에서 Solana 허용

```typescript
if (context.chain !== 'ethereum' && context.chain !== 'solana') {
  throw new ChainError('INVALID_INSTRUCTION', context.chain, {
    message: `D'CENT Swap supports EVM and Solana chains. Got: ${context.chain}`,
  });
}
```

### 2단계: DCent API Solana 응답 구조 확인

DCent API가 Solana 스왑 시 반환하는 트랜잭션 데이터 형식 확인:
- EVM처럼 `txdata { from, to, data, value }` 형태인지
- Solana 네이티브 `{ instructions[], recentBlockhash, feePayer }` 형태인지
- base64 직렬화된 트랜잭션인지

### 3단계: Solana 트랜잭션 빌더 구현

DCent API 응답의 Solana 포맷을 `ContractCallRequest`로 변환하는 분기 추가:

```typescript
// dex_swap resolve 내부
if (context.chain === 'solana') {
  return this.buildSolanaSwapRequest(txdata, context);
} else {
  return this.buildEvmSwapRequest(txdata, context);
}
```

### 4단계: 스키마 분기

현재 EVM 전용 `DcentTxDataSchema` (`txdata.from`, `txdata.to` 필수)를 Solana 대응:

```typescript
const DcentTxDataSchema = z.union([
  DcentEvmTxDataSchema,    // { from, to, data, value }
  DcentSolanaTxDataSchema, // Solana 응답 형식에 맞게 정의
]);
```

## 테스트 항목

- [ ] 체인 가드에서 Solana 허용 (context.chain === 'solana' 통과)
- [ ] DCent API Solana 스왑 응답 구조 캡처 및 문서화
- [ ] Solana SOL→USDC dryRun 성공
- [ ] 실제 스왑 트랜잭션 온체인 확정
- [ ] EVM 스왑이 기존대로 정상 동작 (회귀 없음)
- [ ] Solana 트랜잭션 빌더 단위 테스트
