# #148 알림 메시지에 블록 익스플로러 링크 추가 + {txId} 미치환 버그 수정

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** TBD
- **상태:** FIXED

## 현재 상태

### 1. 블록 익스플로러 링크 미제공

- TX_SUBMITTED, TX_CONFIRMED 등 트랜잭션 관련 알림에 txHash가 포함되지만, 블록 익스플로러 링크가 없음
- 사용자가 트랜잭션 상태를 확인하려면 txHash를 복사해서 직접 익스플로러에 검색해야 함
- 코드베이스에 네트워크 → 익스플로러 URL 매핑이 존재하지 않음

### 2. `{txId}` 플레이스홀더 미치환 버그

- TX_SUBMITTED 템플릿: `'Transaction {txId} submitted to blockchain'`
- TX_CONFIRMED 템플릿: `'Transaction {txId} confirmed. Amount: {amount}'`
- `txId`는 `details` 인자로 전달되지만, 템플릿 치환에 사용되는 `vars`에는 포함되지 않음
- 결과: Telegram 메시지에 `{txId}`가 리터럴 텍스트로 표시됨 (스크린샷 확인)

### 3. Telegram 채널이 `details` 무시

- `formatMarkdownV2()`가 `payload.details`를 전혀 사용하지 않음
- Discord 채널은 `details`를 embed field로 추가하는데, Telegram은 누락

## 수정 방향

### A. 네트워크 → 익스플로러 URL 매핑 추가

`packages/core/src/` 에 익스플로러 URL 헬퍼 추가:

```typescript
// 예시: getExplorerTxUrl('ethereum-sepolia', '0xabc...')
// → 'https://sepolia.etherscan.io/tx/0xabc...'
```

지원 대상 (13개 네트워크):

| 네트워크 | 익스플로러 |
|----------|-----------|
| mainnet (Solana) | solscan.io |
| devnet (Solana) | solscan.io/devnet |
| testnet (Solana) | solscan.io/testnet |
| ethereum-mainnet | etherscan.io |
| ethereum-sepolia | sepolia.etherscan.io |
| polygon-mainnet | polygonscan.com |
| polygon-amoy | amoy.polygonscan.com |
| arbitrum-mainnet | arbiscan.io |
| arbitrum-sepolia | sepolia.arbiscan.io |
| optimism-mainnet | optimistic.etherscan.io |
| optimism-sepolia | sepolia-optimism.etherscan.io |
| base-mainnet | basescan.org |
| base-sepolia | sepolia.basescan.org |

### B. 알림 템플릿 수정

- `txId`를 `vars`에 포함하여 `{txId}` 플레이스홀더가 정상 치환되도록 수정
- `txHash`가 있을 때 익스플로러 링크를 body에 추가

### C. Telegram formatMarkdownV2 개선

- txHash가 있고 익스플로러 URL을 생성할 수 있으면 클릭 가능한 링크 추가
- Telegram MarkdownV2: `[View on Explorer](https://...)`

### 수정 대상 파일

- `packages/core/src/` — 익스플로러 URL 매핑 헬퍼 신규
- `packages/core/src/i18n/en.ts`, `ko.ts` — TX_SUBMITTED, TX_CONFIRMED 템플릿 수정
- `packages/daemon/src/pipeline/stages.ts` — TX_SUBMITTED, TX_CONFIRMED에서 `txId`를 `vars`에 포함
- `packages/daemon/src/notifications/channels/telegram.ts` — `formatMarkdownV2()`에 익스플로러 링크 추가
- `packages/daemon/src/notifications/channels/discord.ts` — Discord embed에도 익스플로러 링크 추가
- 관련 테스트 파일

## 테스트 항목

- [ ] 13개 네트워크 각각에 대해 올바른 익스플로러 URL이 생성되는지 확인
- [ ] TX_SUBMITTED 메시지에서 `{txId}`가 실제 ID로 치환되는지 확인
- [ ] TX_CONFIRMED 메시지에서 `{txId}`가 실제 ID로 치환되는지 확인
- [ ] txHash가 있을 때 Telegram 메시지에 클릭 가능한 익스플로러 링크가 포함되는지 확인
- [ ] txHash가 없을 때(PENDING 등) 링크가 표시되지 않는지 확인
- [ ] Telegram MarkdownV2 특수문자 이스케이핑이 URL에서도 정상 동작하는지 확인
- [ ] Discord embed에 익스플로러 링크가 포함되는지 확인
