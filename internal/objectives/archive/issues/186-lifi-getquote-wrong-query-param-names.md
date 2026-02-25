# #186 — LI.FI getQuote 쿼리 파라미터명 오류로 스왑 요청 실패

- **유형:** BUG
- **심각도:** CRITICAL
- **컴포넌트:** `packages/actions/src/providers/lifi/lifi-api-client.ts`

## 현상

베이스 메인넷에서 ETH → USDC 스왑 시 LI.FI API가 400 에러 반환:

```
ACTION_RESOLVE_FAILED: Action resolve failed: API error 400
```

모든 LI.FI 스왑/브릿지 요청이 실패하며, 메인넷·테스트넷 관계없이 재현됨.

## 근본 원인

`lifi-api-client.ts`의 `getQuote()` 메서드(라인 31~40)에서 LI.FI API로 보내는 쿼리 파라미터명이 잘못됨:

```typescript
// ❌ 현재 (잘못됨)
return this.get('quote', LiFiQuoteResponseSchema, {
  fromChainId: String(params.fromChain),   // LI.FI는 'fromChain' 기대
  toChainId: String(params.toChain),       // LI.FI는 'toChain' 기대
  ...
});
```

```typescript
// ✅ 수정 (올바름)
return this.get('quote', LiFiQuoteResponseSchema, {
  fromChain: String(params.fromChain),
  toChain: String(params.toChain),
  ...
});
```

같은 파일의 `getStatus()` 메서드(라인 43~57)는 `fromChain` / `toChain`을 **올바르게** 사용 중이므로, `getQuote()`만 불일치.

## 테스트도 동일 오류

`packages/actions/src/__tests__/lifi-api-client.test.ts` 라인 164~165:

```typescript
// ❌ 테스트가 잘못된 파라미터명을 검증 → CI에서 버그 미검출
expect(url.searchParams.get('fromChainId')).toBe('1');
expect(url.searchParams.get('toChainId')).toBe('8453');
```

```typescript
// ✅ 올바른 검증
expect(url.searchParams.get('fromChain')).toBe('1');
expect(url.searchParams.get('toChain')).toBe('8453');
```

## 영향

- **LI.FI 전 기능 불가**: 스왑, 크로스체인 브릿지 등 `getQuote()`를 사용하는 모든 액션 실패
- **v28.3 이후 전체**: LI.FI 프로바이더가 도입된 v28.3부터 메인넷에서 실제 동작 불가 상태
- 테스트넷에서도 동일 실패이나, 단위 테스트가 mock 기반이라 잘못된 파라미터명을 그대로 통과

## 수정 범위

| 파일 | 변경 |
|------|------|
| `packages/actions/src/providers/lifi/lifi-api-client.ts` | `fromChainId` → `fromChain`, `toChainId` → `toChain` (2줄) |
| `packages/actions/src/__tests__/lifi-api-client.test.ts` | 테스트 assertion 파라미터명 수정 (2줄) |

총 4줄 변경으로 수정 가능.

## 테스트 항목

1. **단위 테스트**: `getQuote()` 호출 시 쿼리 파라미터가 `fromChain`/`toChain`으로 전송되는지 검증 (기존 테스트 수정)
2. **단위 테스트**: `getStatus()`의 `fromChain`/`toChain` 파라미터가 여전히 올바른지 회귀 검증
3. **통합 테스트**: LiFiActionProvider를 통한 cross_swap 액션이 정상 quote 응답을 받는지 검증 (mock API)
