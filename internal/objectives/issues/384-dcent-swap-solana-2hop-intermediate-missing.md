# 384 — DCent Swap Solana 출발 2-hop 라우팅 불가 — INTERMEDIATE_TOKENS에 Solana 체인 누락

- **유형:** MISSING
- **심각도:** MEDIUM
- **상태:** FIXED
- **마일스톤:** v32.8
- **수정일:** 2026-03-18
- **마일스톤:** —

## 현상

SPL 토큰에서 ERC20 토큰으로 크로스체인 스왑 시, 직접 경로가 없으면 2-hop auto-routing으로 폴백해야 하지만 Solana 체인의 중간 토큰이 `INTERMEDIATE_TOKENS`에 정의되어 있지 않아 2-hop 경로 탐색이 항상 빈 배열을 반환한다.

## 원인

`auto-router.ts`의 `INTERMEDIATE_TOKENS`에 EVM 체인(`eip155:*`)만 정의되어 있고, Solana 체인(`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`)이 누락됨.

```typescript
// auto-router.ts:59-89 — 현재 상태
export const INTERMEDIATE_TOKENS: Record<string, IntermediateToken[]> = {
  'eip155:1': [ETH, USDC, USDT],
  'eip155:56': [BNB, USDC, USDT],
  'eip155:137': [MATIC, USDC, USDT],
  'eip155:10': [ETH, USDC, USDT],
  'eip155:8453': [ETH, USDC],
  'eip155:42161': [ETH, USDC, USDT],
  // Solana 없음
};
```

`getIntermediatesForChain()`이 Solana CAIP-19 자산에서 CAIP-2 체인 ID를 추출하면 `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`이 되는데, 이 키가 맵에 없어 빈 배열 반환 → 2-hop 프로빙 스킵.

## 영향

- SPL → ERC20 크로스체인 스왑에서 직접 경로가 없으면 "No 2-hop swap route available" 에러 발생
- 단일 프로바이더(LiFi, ButterSwap)가 직접 경로를 제공하면 정상 동작하므로 많은 케이스에서는 문제 없음
- 직접 경로가 없는 마이너 SPL 토큰 → ERC20 스왑 시 실패

## 수정 방안

`INTERMEDIATE_TOKENS`에 Solana mainnet 중간 토큰 추가:

```typescript
'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': [
  { caip19: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501', symbol: 'SOL', decimals: 9 },
  { caip19: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6 },
  { caip19: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', decimals: 6 },
],
```

## 테스트 항목

- [ ] Solana 체인 중간 토큰이 `getIntermediatesForChain()`에서 정상 반환되는지 확인
- [ ] SPL → ERC20 직접 경로 없을 때 2-hop 경로 탐색(SOL/USDC/USDT 경유) 동작 확인
- [ ] SPL → SPL 같은 체인 내 2-hop도 중간 토큰으로 정상 프로빙되는지 확인
- [ ] 기존 EVM 체인 2-hop 라우팅에 영향 없음 확인
