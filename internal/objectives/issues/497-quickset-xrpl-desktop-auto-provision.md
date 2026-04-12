# 497 — quickset에 XRPL 누락 + Desktop 첫 부팅 시 mainnet 지갑 자동 생성

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-04-12
- **발견 경위:** v2.14.1-rc.6 설치 후 대시보드에 지갑 없음. 수동으로 만들어야 하는 상태.

## 문제 2가지

### A. quickset에 XRPL 누락

`packages/cli/src/commands/quickstart.ts:82-85`:
```ts
const chains = [
  { chain: 'solana', name: `solana-${mode}` },
  { chain: 'ethereum', name: `evm-${mode}` },
] as const;
```

SSoT `CHAIN_TYPES = ['solana', 'ethereum', 'ripple']` 에 ripple이 있지만 quickset이 생성하지 않음.

### B. Desktop 첫 부팅 시 지갑 자동 생성 없음

이슈 496에서 wizard를 제거하면서 지갑 자동 생성 경로도 사라짐. Desktop 사용자가 첫 부팅 후 빈 대시보드를 보고 수동으로 지갑을 만들어야 함. 일반 사용자에게는 "설치 → 바로 사용 가능" 경험이 필요.

## 수정 방향

### A. quickset에 XRPL 추가

```ts
const chains = [
  { chain: 'solana', name: `solana-${mode}` },
  { chain: 'ethereum', name: `evm-${mode}` },
  { chain: 'ripple', name: `xrpl-${mode}` },
] as const;
```

출력 label 도 추가: `ripple` → `XRPL`.

### B. Desktop 첫 부팅 자동 지갑 생성

`app.tsx`의 auto-login 성공 후, `walletCount === 0`이면 3개 mainnet 지갑 자동 생성:

```ts
// Auto-provision mainnet wallets on first Desktop boot (issue 497)
if (isDesktop() && data.walletCount === 0) {
  const chains = ['ethereum', 'solana', 'ripple'];
  for (const chain of chains) {
    await fetch(API.WALLETS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Master-Password': key },
      body: JSON.stringify({ name: `${label} Wallet`, chain, environment: 'mainnet' }),
    });
  }
}
```

## 테스트 항목

- [ ] CLI `waiaas quickset` 실행 시 EVM + Solana + XRPL 3개 mainnet 지갑 생성
- [ ] Desktop 첫 부팅 → auto-login → 3개 mainnet 지갑 자동 생성 → 대시보드에 표시
- [ ] Desktop 2회차 부팅 → 이미 지갑 있으므로 추가 생성 없음
- [ ] 로컬 Tauri .app 빌드 → 실행 → 대시보드에 3개 mainnet 지갑 확인

## 관련 이슈

- **496** (wizard 제거) — wizard 제거로 자동 생성 경로 사라짐. 이 이슈가 대체 경로 제공.
