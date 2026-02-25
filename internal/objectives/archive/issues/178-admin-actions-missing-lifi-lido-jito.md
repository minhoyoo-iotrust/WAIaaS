# #178 Admin UI Actions 페이지에 LI.FI, Lido, Jito 프로바이더 미표시

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v28.5
- **상태:** FIXED

---

## 증상

Admin UI Actions 페이지에 Jupiter Swap과 0x Swap만 표시되고, LI.FI, Lido Staking, Jito Staking 3개 프로바이더가 보이지 않음. 활성화/비활성화 토글 및 API 키 설정 불가.

---

## 근본 원인

`actions.tsx`의 `BUILTIN_PROVIDERS` 배열이 하드코딩되어 있고 3개 프로바이더가 누락:

```typescript
// packages/admin/src/pages/actions.tsx:22-25
const BUILTIN_PROVIDERS: BuiltinProvider[] = [
  { key: 'jupiter_swap', name: 'Jupiter Swap', ... },
  { key: 'zerox_swap', name: '0x Swap', ... },
  // lifi, lido_staking, jito_staking 누락
];
```

v28.2에서 Actions 페이지 구현 시 (#158) Jupiter/0x만 등록하고, 이후 추가된 LI.FI/Lido/Jito를 반영하지 않음.

---

## 수정 방안

`BUILTIN_PROVIDERS` 배열에 누락된 3개 프로바이더 추가:

```typescript
const BUILTIN_PROVIDERS: BuiltinProvider[] = [
  { key: 'jupiter_swap', name: 'Jupiter Swap', description: 'Solana DEX aggregator', chain: 'solana', requiresApiKey: false },
  { key: 'zerox_swap', name: '0x Swap', description: 'EVM DEX aggregator (AllowanceHolder)', chain: 'evm', requiresApiKey: true },
  { key: 'lifi', name: 'LI.FI', description: 'Multi-chain DEX/bridge aggregator', chain: 'evm', requiresApiKey: false },
  { key: 'lido_staking', name: 'Lido Staking', description: 'ETH liquid staking (stETH/wstETH)', chain: 'evm', requiresApiKey: false },
  { key: 'jito_staking', name: 'Jito Staking', description: 'SOL liquid staking (JitoSOL)', chain: 'solana', requiresApiKey: false },
];
```

참고: `chain` 필드 타입이 `'solana' | 'evm'`인데, LI.FI는 `['ethereum', 'solana']` 멀티체인. 타입을 배열로 변경하거나 `'multi'` 추가 검토 필요.

장기적으로는 하드코딩 대신 `GET /v1/actions/providers`에서 전체 빌트인 목록을 반환하는 방식으로 개선 권장 (#176 핫 리로드 수정과 함께).

---

## 관련 파일

- `packages/admin/src/pages/actions.tsx` (lines 22-25) — BUILTIN_PROVIDERS 배열

## 관련 이슈

- #158: 빌트인 액션 프로바이더 Admin UI 페이지 (v28.2 FIXED — Jupiter/0x만 구현)
- #176: 액션 프로바이더 기본 비활성 + 핫 리로드 누락

---

## 테스트 항목

- [ ] Admin UI Actions 페이지에 5개 빌트인 프로바이더 모두 표시 확인
- [ ] LI.FI, Lido, Jito 활성화 토글이 정상 동작하는지 확인
- [ ] LI.FI의 멀티체인 특성이 UI에 올바르게 표시되는지 확인
