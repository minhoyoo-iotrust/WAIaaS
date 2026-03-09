# 296 — E2E 온체인 테스트가 구버전 네트워크 ID 사용 — v29.5 통일 형식 미반영

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v31.8
- **발견일:** 2026-03-09
- **발견 경로:** 온체인 E2E 사전 조건 체크 시 balance API 호출 실패
- **상태:** OPEN

## 증상

온체인 E2E 테스트에서 `network: 'sepolia'`로 트랜잭션 전송/잔액 조회 시 데몬이 거부:

```json
{
  "code": "ENVIRONMENT_NETWORK_MISMATCH",
  "message": "Invalid network 'sepolia' for chain 'ethereum' in environment 'testnet'. Valid: ethereum-sepolia, polygon-amoy, ..."
}
```

## 원인

v29.5(내부 일관성 정리, Phases 285-287)에서 네트워크 ID가 `{chain}-{network}` 형식으로 통일됨:
- `sepolia` → `ethereum-sepolia`
- `devnet` → `solana-devnet`
- `holesky` → `ethereum-holesky`

온체인 E2E 테스트 코드가 v29.5 이전의 구버전 네트워크 ID를 사용하고 있어 데몬 API 호출이 실패한다.

## 영향 파일 및 위치

### 테스트 파일 (트랜잭션 전송 시 network 파라미터)

- `onchain-transfer.e2e.test.ts:106` — `network: 'sepolia'` → `ethereum-sepolia`
- `onchain-transfer.e2e.test.ts:114` — `network: 'sepolia'`  (암묵적, SOL은 세션 기반)
- `onchain-transfer.e2e.test.ts:160,177` — `network: 'sepolia'` (ERC-20)
- `onchain-staking.e2e.test.ts` — `holesky` → `ethereum-holesky`
- `onchain-nft.e2e.test.ts` — `sepolia` → `ethereum-sepolia`
- `onchain-incoming.e2e.test.ts` — `sepolia` → `ethereum-sepolia`

### shouldSkipNetwork 호출 (네트워크 skip 판단)

- `onchain-transfer.e2e.test.ts:106` — `shouldSkipNetwork('sepolia')` → `ethereum-sepolia`
- `onchain-transfer.e2e.test.ts:133` — `shouldSkipNetwork('devnet')` → `solana-devnet`
- `onchain-transfer.e2e.test.ts:160` — `shouldSkipNetwork('sepolia')` → `ethereum-sepolia`
- `onchain-transfer.e2e.test.ts:203` — `shouldSkipNetwork('devnet')` → `solana-devnet`
- 다른 onchain 테스트 파일의 skipIf 호출도 동일

### PreconditionChecker (사전 조건 체크)

- `precondition-checker.ts:52-55` — `DEFAULT_REQUIREMENTS`의 network 필드:
  - `network: 'sepolia'` → `ethereum-sepolia`
  - `network: 'holesky'` → `ethereum-holesky`
  - `network: 'devnet'` → `solana-devnet`
- `precondition-checker.ts:58-67` — `PROTOCOL_NETWORK_MAP` 값:
  - `transfer: ['sepolia', 'devnet']` → `['ethereum-sepolia', 'solana-devnet']`
  - `staking: ['holesky']` → `['ethereum-holesky']`
  - 기타 프로토콜도 동일

### 시나리오 등록 파일

- `scenarios/onchain-transfer.ts` — 네트워크 ID가 시나리오 메타데이터에 포함된 경우

## 수정 방안

모든 온체인 E2E 관련 파일에서 구버전 네트워크 ID를 v29.5 통일 형식으로 변경:

| 구버전 | 신버전 |
|--------|--------|
| `sepolia` | `ethereum-sepolia` |
| `holesky` | `ethereum-holesky` |
| `devnet` | `solana-devnet` |

## 테스트 항목

1. 수정 후 PreconditionChecker가 `ethereum-sepolia` 형식으로 잔액 조회 성공하는지 확인
2. `shouldSkipNetwork('ethereum-sepolia')` 등 skip 로직이 정상 동작하는지 확인
3. 온체인 전송 테스트에서 `network: 'ethereum-sepolia'`로 트랜잭션 전송이 데몬에 수락되는지 확인
4. Solana devnet 테스트에서 네트워크 ID 없이 세션 기반 해석이 정상 동작하는지 확인
