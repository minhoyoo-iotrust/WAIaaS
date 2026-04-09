# 492 — Desktop Setup Wizard: 지갑 생성 auth 누락 + 체인 목록 불완전

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **발견일:** 2026-04-09
- **발견 경위:** v2.14.1-rc.1 DMG 설치 후 Setup Wizard Step 2(Create Wallet) 진행 시 **"X-Master-Password header is required"** 에러 발생. Step 1(Select Chain) 에서는 XRPL 누락, 단일 선택만 가능.

## 증상 2가지

### A. "X-Master-Password header is required" (Step 2: Create Wallet)

`packages/admin/src/desktop/wizard/steps/wallet-step.tsx:95-100`:

```tsx
const res = await fetch('/v1/wallets', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Master-Password': wizardData.value.password,  // ← 항상 빈 문자열
  },
  body: JSON.stringify({ name, chain: wizardData.value.chain }),
});
```

이슈 491 에서 password step 을 제거하면서 `wizardData.value.password` 는 초기값 `''`에서 절대 채워지지 않습니다. 데몬 API 는 빈 문자열 헤더를 거부 → `401 X-Master-Password header is required`.

**수정**: `wizardData.value.password` 대신 auth store 의 `masterPassword.value` 사용 (auto-login으로 이미 설정됨).

### B. 체인 목록 불완전 + 단일 선택 (Step 1: Select Chain)

`packages/admin/src/desktop/wizard/steps/chain-step.tsx:8-23`:

```tsx
type SupportedChain = 'solana' | 'ethereum' | 'base' | 'polygon' | 'arbitrum';
const chains = [
  { id: 'ethereum', ... },
  { id: 'solana', ... },
  { id: 'base', ... },
  { id: 'polygon', ... },
  { id: 'arbitrum', ... },
];
```

문제:
1. **XRPL(`ripple`) 누락** — SSoT `CHAIN_TYPES = ['solana', 'ethereum', 'ripple']` (`packages/shared/src/networks.ts:8`) 에 ripple이 있지만 wizard에 없음
2. **개별 EVM 네트워크를 별도 체인으로 표시** — Base/Polygon/Arbitrum은 `ethereum` 체인의 네트워크지 별도 체인이 아님 (같은 키페어, 같은 `chain: 'ethereum'`). Wizard가 5개 선택지를 보여주면 사용자가 혼동
3. **단일 선택만 가능** — 초기 설정에서 여러 체인의 지갑을 동시 생성할 수 없음

## 수정 방향

### A. wallet-step.tsx auth 헤더

```tsx
import { masterPassword } from '../../../auth/store';
// ...
headers: {
  'Content-Type': 'application/json',
  'X-Master-Password': masterPassword.value ?? '',
},
```

auto-login이 `masterPassword` signal 을 recovery.key 값으로 설정하므로 이후 모든 API 호출에서 유효.

### B. chain-step.tsx 체인 목록 재설계

SSoT `CHAIN_TYPES`와 일치하는 3개 체인 타입으로 교체, 멀티 선택 지원:

```tsx
const chains = [
  { id: 'ethereum', name: 'EVM', icon: 'Ξ', description: 'Ethereum, Base, Polygon, Arbitrum 등' },
  { id: 'solana', name: 'Solana', icon: '◎', description: 'High throughput' },
  { id: 'ripple', name: 'XRP Ledger', icon: '✕', description: 'Cross-border payments' },
];
```

UI: 체크박스 스타일 카드, 복수 선택 가능. 기본값: 3개 모두 선택.

### C. wallet-step.tsx 복수 지갑 생성

`wizardData.chains` (배열) 에 선택된 체인 목록 저장. wallet-step 에서 각 체인마다 `POST /v1/wallets` 순차 호출, 결과를 `wizardData.walletIds` 배열에 저장.

### D. wizard-store.ts WizardData 타입 변경

```diff
- chain: 'solana' | 'ethereum' | 'base' | 'polygon' | 'arbitrum';
+ chains: ('solana' | 'ethereum' | 'ripple')[];
- walletId: string | null;
+ walletIds: string[];
```

## 테스트 항목

- [ ] Step 1 에 EVM / Solana / XRPL 3개 카드 표시, 멀티 선택 가능
- [ ] Step 2 에서 선택된 모든 체인에 대해 지갑 생성 성공 (각 `POST /v1/wallets` 호출 시 `X-Master-Password` 헤더 포함)
- [ ] 지갑 생성 후 대시보드에서 생성된 지갑 목록 확인
- [ ] 단일 체인 선택 시에도 정상 동작
- [ ] Browser 빌드에서 wizard 미사용 (회귀 없음)
- [ ] Desktop 테스트(`pnpm vitest run src/__tests__/desktop`) 통과

## 관련 이슈

- **491** (auto-login) — `masterPassword` signal 을 설정하는 선행 수정. 이 이슈의 auth 헤더 수정은 491 기반.
- **485-490** — Desktop 앱 첫 실행 기반 수정. 이들이 모두 해결된 뒤에야 Setup Wizard 에 도달 가능.
