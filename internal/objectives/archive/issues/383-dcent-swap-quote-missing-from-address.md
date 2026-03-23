# 383 — DCent Swap 견적 요청 시 fromWalletAddress 누락으로 LiFi 프로바이더 견적 실패

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** FIXED
- **마일스톤:** v32.8
- **수정일:** 2026-03-18
- **마일스톤:** —

## 현상

DCent Swap 견적 API(`POST /api/swap/v3/get_quotes`) 호출 시 `fromWalletAddress`를 전달하지 않아 LiFi 프로바이더가 `fail_internal_error` (`"fromWalletAddress is undefined"`)로 실패한다. 이로 인해 사용 가능한 DEX 프로바이더 수가 줄어들고, 더 좋은 환율의 견적을 놓칠 수 있다.

## 재현

Solana SOL → USDC 견적 요청:

```json
{
  "fromId": "SOLANA",
  "toId": "SPL-TOKEN/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amount": "1000000000",
  "fromDecimals": 9,
  "toDecimals": 6
}
```

**결과:** ButterSwap만 `success` (93.26 USDC), LiFi는 `fail_internal_error`

`fromWalletAddress` 포함 시:
- LiFi `success` (94.18 USDC) — **bestOrder 1위**
- ButterSwap `success` (93.14 USDC)

## 원인

- `dcent-api-client.ts` `GetQuotesParams`에 `fromWalletAddress` 필드가 없음
- `dex-swap.ts` `GetQuotesParams`에도 해당 필드가 없음
- 실행 단계(`getDexSwapTransactionData`)에만 `fromWalletAddress`가 포함됨

## 수정 방안

1. `dcent-api-client.ts` `GetQuotesParams`에 `fromWalletAddress?: string` 추가
2. `dex-swap.ts` `GetQuotesParams`에 `fromWalletAddress?: string` 추가
3. `getDcentQuotes()`에서 `client.getQuotes()` 호출 시 전달
4. `executeDexSwap()`에서 내부 `getDcentQuotes()` 호출 시 `walletAddress`를 `fromWalletAddress`로 전달
5. `auto-router.ts` `findTwoHopRoutes()`/`executeTwoHopSwap()`에서 전달
6. `index.ts` `resolve()` `get_quotes` 액션에서 `context.walletAddress` 전달

## 영향 범위

- DCent Swap 모듈 내부에서만 닫힌 변경 (optional 필드 추가)
- 다른 액션 프로바이더(Jupiter, 0x, LiFi Bridge, Aave 등)에 사이드 이펙트 없음
- 기존 성공하던 프로바이더(ButterSwap 등)에 부정적 영향 없음 (API 테스트 확인 완료)

## 테스트 항목

- [ ] `fromWalletAddress` 포함 시 LiFi 프로바이더 견적 성공 확인
- [ ] `fromWalletAddress` 미포함(optional) 시 기존 동작 유지 확인
- [ ] `executeDexSwap` 내부 견적 호출에 `walletAddress` 전달 확인
- [ ] 2-hop auto-router 견적 호출에 `fromWalletAddress` 전달 확인
- [ ] `queryQuotes()` 공개 메서드에서 optional `fromWalletAddress` 동작 확인
