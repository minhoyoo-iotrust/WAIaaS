# #262 Admin UI Actions 페이지에 D'CENT Swap 프로바이더 미표시

- **유형:** MISSING
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-03-07

## 증상

Admin UI의 DeFi 액션 프로바이더 관리 페이지(`#/actions`)에 D'CENT Swap 프로바이더가 표시되지 않는다.
v31.3에서 DCent Swap ActionProvider가 구현되었고, 데몬에 `actions.dcent_swap_enabled` 등 7개 Admin Settings 키가 등록되어 있지만, Admin UI의 `BUILTIN_PROVIDERS` 정적 배열에 등록이 누락되었다.

## 원인

`packages/admin/src/pages/actions.tsx`의 `BUILTIN_PROVIDERS` 배열(line 24~33)에 DCent Swap 항목이 없다.

기존 9개 프로바이더만 등록:
- Jupiter Swap, 0x Swap, LI.FI, Lido Staking, Jito Staking, Aave V3, Kamino, Pendle Yield, Drift Perp

## 수정 방안

`BUILTIN_PROVIDERS` 배열에 DCent Swap 항목 추가:

```typescript
{ key: 'dcent_swap', name: "D'CENT Swap", description: 'DEX swap & cross-chain exchange aggregator (6 EVM chains)', chain: 'evm', requiresApiKey: false, docsUrl: 'https://dcentwallet.com' },
```

DCent Swap에는 전용 Admin Settings 키가 있으므로(slippage, poll interval 등), Aave/Kamino/Drift처럼 프로바이더별 설정 UI 섹션도 추가 검토:
- `actions.dcent_swap_api_url`
- `actions.dcent_swap_default_slippage_bps`
- `actions.dcent_swap_max_slippage_bps`
- `actions.dcent_swap_exchange_poll_interval_ms`
- `actions.dcent_swap_exchange_poll_max_ms`

## 영향 범위

- `packages/admin/src/pages/actions.tsx` — BUILTIN_PROVIDERS 배열 + 설정 UI 섹션
- `packages/admin/src/__tests__/actions.test.tsx` — 프로바이더 카운트 테스트 갱신

## 테스트 항목

1. Admin UI Actions 페이지에 D'CENT Swap 카드가 표시되는지 확인
2. D'CENT Swap 활성/비활성 토글이 `actions.dcent_swap_enabled` 설정과 연동되는지 확인
3. 프로바이더별 설정(slippage, poll interval 등)이 편집 가능한지 확인
4. BUILTIN_PROVIDERS 배열 카운트 테스트 갱신
