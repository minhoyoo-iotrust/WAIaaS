# #427 — DCent Solana 스왑 처리 3중 오류: base58 인코딩, blockhash 미갱신, 파이프라인 경로

- **유형**: BUG
- **심각도**: CRITICAL
- **영향 시나리오**: defi-16 (DCent SOL→USDC)
- **컴포넌트**: `packages/actions/src/providers/dcent-swap/dex-swap.ts`, `packages/adapters/solana/src/adapter.ts`

## 현상

DCent Solana 스왑(SOL→USDC) dryRun 시뮬레이션이 `Codec [fixCodecSize] expected 64 bytes, got 44` 에러로 실패. DCent 프론트엔드 코드 분석 결과, WAIaaS의 처리 방식이 3가지 면에서 잘못되어 있음.

## 원인 분석 (DCent 프론트 vs WAIaaS 비교)

### 1. 인코딩 불일치 — base58 vs base64 (시뮬레이션 에러 직접 원인)

DCent API `get_dex_swap_transaction_data`는 `txdata.data`를 **base58**로 반환한다. WAIaaS는 이것을 **base64**로 디코딩하고 있다.

```typescript
// DCent 프론트 (정상) — solana/transaction.ts ~line 600
bs58.decode(transaction.data)  // ✅ base58

// WAIaaS (잘못됨) — adapter.ts:680
Buffer.from(request.instructionData, 'base64')  // ❌ base64
```

base58 데이터를 base64로 디코딩하면 전혀 다른 바이트가 생성되어, @solana/kit 트랜잭션 디코더에서 서명 슬롯 크기 불일치 에러 발생.

### 2. blockhash 미갱신 — 트랜잭션 만료 위험

DCent 프론트는 API에서 받은 트랜잭션의 `recentBlockhash`를 **최신값으로 교체**한 후 재직렬화한다. WAIaaS는 이 단계가 없다.

```typescript
// DCent 프론트 (정상) — solana/transaction.ts ~line 620
// 1. VersionedTransaction.deserialize(bytes)
// 2. recentBlockhash = await getLatestBlockhash()  ← 최신 블록해시로 교체
// 3. serialize() → 재직렬화

// WAIaaS (누락) — blockhash 갱신 없이 API 반환값 그대로 사용
```

API 호출 시점 → 서명/제출 시점 사이에 blockhash가 만료되면(~60초) 트랜잭션 실패.

### 3. 파이프라인 경로 부적합 — CONTRACT_CALL이 아닌 SIGN 경로 필요

DCent Solana 스왑 데이터는 **완전한 VersionedTransaction v0** (Address Lookup Table 포함). 이것을 `CONTRACT_CALL` → `buildContractCall` → `instructionData`로 처리하는 것은 설계상 맞지 않음.

```
현재 (잘못됨):
  dex-swap.ts → ContractCallRequest { type: 'CONTRACT_CALL', instructionData: base58_data }
    → SolanaAdapter.buildContractCall() → base64 디코딩 시도 → 에러

올바른 경로:
  dex-swap.ts → base58 디코딩 → VersionedTransaction 역직렬화 → blockhash 갱신
    → 재직렬화 → SIGN 타입으로 signExternalTransaction 경로
```

## 수정 방향

### dex-swap.ts Solana 분기 재작성

```typescript
if (chainNamespace === 'solana') {
  const solTxData = txdata as Record<string, unknown>;
  const rawData = (solTxData.data ?? solTxData.serializedTransaction ?? '') as string;

  // 1. base58 디코딩
  const txBytes = bs58.decode(rawData);

  // 2. VersionedTransaction 역직렬화 (blockhash 갱신은 adapter에서 처리)
  // base64로 재인코딩하여 signExternalTransaction 경로로 전달
  const base64Tx = Buffer.from(txBytes).toString('base64');

  // 3. SIGN 타입으로 반환 — signExternalTransaction 경로
  return [{
    type: 'SIGN' as const,
    rawTx: base64Tx,
  }];
}
```

### SolanaAdapter 수정

`signExternalTransaction` 또는 새로운 처리 경로에서:
1. base64 → bytes → `VersionedTransaction.deserialize()`
2. `recentBlockhash` 최신값으로 교체
3. 재직렬화 → 서명 → 제출

### 고려사항

- VersionedTransaction v0 + ALT(Address Lookup Table) 지원 필요
- `@solana/kit` 6.x에서 VersionedTransaction 처리 방식 확인 (@solana/web3.js 1.x와 API 차이)
- DCent 프론트는 `extra.swapData`에 원본 보관 — WAIaaS도 재서명 시나리오 고려
- Rent fee 계산(토큰 계정 생성 시 추가 수수료) — 현재 미구현, 향후 고려

## 테스트 항목

- [ ] DCent API 반환 `txdata.data`를 base58로 디코딩 → 유효한 VersionedTransaction bytes 확인
- [ ] VersionedTransaction 역직렬화 + blockhash 갱신 + 재직렬화 정상 동작
- [ ] dryRun 시뮬레이션 PASS (codec 에러 해소)
- [ ] 실제 서명 + 제출 정상 동작
- [ ] defi-16 UAT 시나리오 PASS
