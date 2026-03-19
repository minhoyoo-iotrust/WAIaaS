# #417 — DCent Swap Solana 체인 미지원 (EVM 전용 가드)

- **유형**: MISSING
- **심각도**: MEDIUM
- **영향 시나리오**: defi-16
- **컴포넌트**: `packages/actions/src/providers/dcent-swap/index.ts`
- **관련**: #410 (txdata 스키마 회귀 — 체인 가드 추가로 선행 차단됨), #384 (FIXED)
- **상태**: OPEN
- **발견일**: 2026-03-19

## 현상

`POST /v1/actions/dcent_swap/dex_swap?dryRun=true` 에서 Solana 지갑으로 호출 시:
```json
{
  "code": "ACTION_RESOLVE_FAILED",
  "message": "Action resolve failed: D'CENT Swap only supports EVM (ethereum) chains. Got: solana"
}
```

## 실행 경로

```
POST /v1/actions/dcent_swap/dex_swap?dryRun=true
  → DCentSwapProvider.resolve('dex_swap', params, context)
    [packages/actions/src/providers/dcent-swap/index.ts:145-210]
  → Chain guard check (lines 150-155)
    → context.chain === 'solana' → throw ChainError  ← ERROR HERE
```

## 원인 분석

### 체인 가드

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

### 코드에 Solana 부분 구현이 존재함

체인 가드로 차단되지만, 하위 모듈에는 Solana 관련 코드가 이미 있음:

1. **Currency Mapper** (`currency-mapper.ts:47, 85-90`):
   ```typescript
   DCENT_NATIVE_TO_CAIP2: {
     SOLANA: { caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', slip44: 501 },
   }
   // CAIP-19 → DCent 변환: 'solana:.../slip44:501' → 'SOLANA'
   // CAIP-19 → DCent 변환: 'solana:.../token:...' → 'SPL-TOKEN/{mint}'
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

### 체인 가드가 추가된 이유

이전 이슈 #394, #410에서 Solana 트랜잭션 처리 시 EVM 전용 스키마(`txdata.from`, `txdata.to`)가 적용되어 실패. 근본 수정(Solana 트랜잭션 빌더 구현) 대신 체인 가드를 추가하여 선행 차단.

### DCent API의 Solana 지원 여부 — 미확인

DCent API (`POST /api/swap/v3/get_dex_swap_transaction_data`)가 Solana 스왑을 지원하는지 확인 필요:

| 확인 항목 | 방법 |
|----------|------|
| Solana 견적 요청 | `POST /api/swap/v3/get_quotes` with `fromId=SOLANA`, `toId=SPL-TOKEN/EPjF...` |
| Solana 트랜잭션 데이터 | `POST /api/swap/v3/get_dex_swap_transaction_data` with Solana 파라미터 |
| 응답 구조 | EVM `txdata{from,to,data,value}` vs Solana `instructions[]` or `transaction` base64 |

### defi-15 (크로스체인) 관련

defi-15(EVM→Solana 크로스체인)는 EVM 체인에서 출발하므로 체인 가드를 통과하지만, DCent API가 `empty txdata`를 반환. 이는 DCent API가 EVM→Solana 크로스체인을 지원하지 않거나, `toWalletAddress` 파라미터 매핑이 잘못된 것일 수 있음.

## 수정 방향

### 선결: DCent API Solana 지원 확인

```bash
# 1. Solana 견적 요청 테스트
curl -s -X POST 'https://api.dcent.tech/api/swap/v3/get_quotes' \
  -H 'Content-Type: application/json' \
  -d '{
    "fromId": "SOLANA",
    "toId": "SPL-TOKEN/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amount": "0.01",
    "walletAddress": "<SOLANA_ADDRESS>"
  }'

# 2. 응답 구조 확인
# - 200 + providers → Solana 지원
# - 400/404/empty → Solana 미지원
```

### 시나리오 A: DCent API가 Solana 미지원

1. defi-16 시나리오 **폐기** (삭제 또는 `status: deprecated`)
2. defi-15 크로스체인 시나리오도 EVM→Solana는 미지원으로 표기
3. currency-mapper/auto-router의 Solana 코드는 향후 대비로 유지 가능

### 시나리오 B: DCent API가 Solana 지원

1. **체인 가드 수정** — Solana 허용
   ```typescript
   if (context.chain !== 'ethereum' && context.chain !== 'solana') {
     throw new ChainError(...)
   }
   ```
2. **Solana 트랜잭션 빌더 구현** — DCent API 응답의 Solana 포맷을 `ContractCallRequest`로 변환
3. **스키마 분기** — EVM txdata vs Solana instructions 분리
4. **테스트** — Solana SOL→USDC dryRun + 실제 스왑

## 테스트 항목

- [ ] DCent API Solana 스왑 지원 여부 확인 (API 호출로 검증)
- [ ] (지원 시) 체인 가드에서 Solana 허용
- [ ] (지원 시) Solana SOL→USDC dryRun 성공
- [ ] (지원 시) 실제 스왑 트랜잭션 온체인 확정
- [ ] (미지원 시) defi-16 시나리오 폐기 또는 deprecated 처리
- [ ] (미지원 시) defi-15 크로스체인 EVM→Solana 제약 사항 문서화
