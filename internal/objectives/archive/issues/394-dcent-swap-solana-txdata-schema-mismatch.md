# 394 — DCent Swap Solana 트랜잭션 스키마 불일치로 Solana 체인 스왑 전면 실패

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **마일스톤:** (미정)
- **발견일:** 2026-03-19

## 현상

`POST /v1/actions/dcent_swap/dex_swap` (또는 `?dryRun=true`)으로 Solana 네이티브 스왑(SOL→USDC) 실행 시 Zod 스키마 검증 실패:

```
DCent API error: [
  { "path": ["txdata", "from"], "message": "Required" },
  { "path": ["txdata", "to"], "message": "Required" }
]
```

DCent API가 Solana 트랜잭션 데이터를 반환했으나, WAIaaS의 `DcentTxDataResponseSchema`가 EVM 전용 필드(`from`, `to`, `data`)를 필수로 요구하여 파싱 실패.

## 원인

### 1. EVM 전용 응답 스키마

`packages/actions/src/providers/dcent-swap/schemas.ts` (line 71-83):

```typescript
export const DcentTxDataResponseSchema = z.object({
  status: z.string(),
  txdata: z.object({
    from: z.string(),     // ← EVM 전용: Solana 응답에 없음
    to: z.string(),       // ← EVM 전용: Solana 응답에 없음
    data: z.string(),     // ← EVM calldata: Solana는 serialized tx bytes
    value: z.string().optional(),
  }).optional(),
  ...
});
```

Solana 트랜잭션 형식은 serialized transaction bytes (base64/base58)로, EVM의 `{from, to, data, value}` 구조와 완전히 다름.

### 2. EVM 전용 실행 로직

`packages/actions/src/providers/dcent-swap/dex-swap.ts` (line 259-265):

```typescript
const swapRequest: ContractCallRequest = {
  type: 'CONTRACT_CALL',   // ← EVM 전용 타입
  to: txdata.to,            // ← Solana에서는 undefined
  calldata: txdata.data,    // ← Solana에서는 undefined
  value: txdata.value ? BigInt(txdata.value).toString() : '0',
};
```

- 체인 감지 로직 없음: EVM인지 Solana인지 판별하지 않음
- Solana 트랜잭션을 `CONTRACT_CALL`로 래핑할 수 없음 (SIGN 타입 필요)

### 3. 메타데이터는 Solana 지원 선언

`packages/actions/src/providers/dcent-swap/index.ts` (line 86):

```typescript
chains: ['ethereum', 'solana'],  // ← Solana 지원 선언
```

`currency-mapper.ts`도 Solana CAIP-19 변환을 지원하고, `auto-router.ts`도 Solana 중간 토큰(SOL, USDC)을 포함. 그러나 실제 실행 경로(`dex-swap.ts`)는 EVM만 처리.

## 영향

- **Solana 체인의 모든 DCent 스왑이 실패**: SOL→SPL, SPL→SPL, SPL→SOL
- 크로스체인 EVM→Solana 스왑도 Solana 측 트랜잭션 처리에서 동일 문제 발생 가능
- 메타데이터가 Solana 지원을 선언하므로 MCP/SDK에서 Solana 스왑을 시도할 수 있으나, 항상 실패

## 수정 방안

### A. Solana txdata 스키마 확장 + 체인별 분기 (권장)

1. DCent API의 Solana 응답 형식 파악 (serialized transaction bytes 예상)
2. `DcentTxDataResponseSchema`를 discriminatedUnion 또는 union으로 확장:

```typescript
const EvmTxData = z.object({
  from: z.string(),
  to: z.string(),
  data: z.string(),
  value: z.string().optional(),
});

const SolanaTxData = z.object({
  serializedTx: z.string(),  // base64 or base58
  // Solana 고유 필드 추가
});

txdata: z.union([EvmTxData, SolanaTxData]).optional(),
```

3. `dex-swap.ts`에 체인 감지 + Solana 분기 추가:
   - Solana: `{ type: 'SIGN', data: serializedTx }` 형태로 반환
   - EVM: 기존 `CONTRACT_CALL` 로직 유지

### B. Solana 지원 임시 제거

`chains: ['ethereum']`으로 변경하고, Solana 스왑은 Jupiter Swap 프로바이더로 라우팅. DCent Solana 지원이 확인될 때까지 보류.

### C. DCent API Solana 응답 규격 확인

DCent 측에 Solana 트랜잭션 응답 형식 문의. 실제 `txdata` 구조를 확인한 후 스키마 및 핸들러 구현.

## 수정 대상 파일

- `packages/actions/src/providers/dcent-swap/schemas.ts` — Solana txdata 스키마 추가
- `packages/actions/src/providers/dcent-swap/dex-swap.ts` — 체인 감지 및 Solana 분기 로직
- `packages/actions/src/providers/dcent-swap/index.ts` — (B안 시) chains 배열 수정
- `packages/actions/src/__tests__/dcent-dex-swap.test.ts` — Solana 스왑 테스트 추가

## 테스트 항목

1. **유닛 테스트**: Solana CAIP-19 입력(solana:5eykt.../slip44:501) 시 체인이 'solana'로 감지되는지 검증
2. **유닛 테스트**: Solana txdata 응답이 Solana 스키마로 파싱되는지 검증
3. **유닛 테스트**: Solana 스왑 결과가 SIGN 타입 요청으로 반환되는지 검증
4. **유닛 테스트**: EVM 스왑의 기존 동작(CONTRACT_CALL)이 변경되지 않는지 회귀 검증
5. **통합 테스트**: Solana 네이티브 스왑(SOL→USDC) dryRun 성공 확인
