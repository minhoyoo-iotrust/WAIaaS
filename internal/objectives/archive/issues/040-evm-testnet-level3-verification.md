# v1.7-040: EVM Testnet Level 3 블록체인 검증 추가

## 유형: ENHANCEMENT

## 심각도: LOW

## 현상

블록체인 검증 3단계 체계에서 EVM은 Level 2 (Anvil 로컬)까지만 존재하고 Level 3 (실제 테스트넷)이 없음. Solana는 Devnet Level 3이 3건 포함되어 있어 비대칭.

| 단계 | Solana | EVM |
|------|--------|-----|
| Level 1 (Mock) | O | O |
| Level 2 (Local) | O (solana-test-validator) | O (Anvil) |
| Level 3 (Testnet) | O (Devnet 3건) | **X** |

## 수정 방안

Sepolia 테스트넷 기준 최대 3건 추가:

| # | 시나리오 | 검증 방법 |
|---|---------|----------|
| 1 | ETH 전송 | Sepolia faucet → ETH 전송 → 잔액 변경 assert |
| 2 | ERC-20 잔액 조회 | Sepolia USDC/DAI 잔액 조회 → 0 이상 assert |
| 3 | Health check | Sepolia RPC 연결 + getHealth → connected assert |

### nightly.yml 변경

```yaml
evm-testnet:
  runs-on: ubuntu-latest
  continue-on-error: true  # 테스트넷 불안정 대응
  steps:
    - run: turbo run test:chain:evm-testnet
```

### 고려 사항

- Sepolia faucet rate limit 존재 (Alchemy/Infura faucet 활용)
- `continue-on-error: true`로 nightly 전체를 차단하지 않음
- 순차 실행 (`--runInBand --testTimeout=60000`)
- 공용 RPC(Infura/Alchemy) 무료 티어 사용 — API 키는 CI 환경 시크릿

### v1.7 문서 반영 범위

- 블록체인 테스트 Level 3에 EVM 추가
- E2E 시나리오 1건 추가 (EVM Testnet)
- nightly.yml에 evm-testnet job 추가

## 발견

- v1.7 문서 리뷰 시 Solana/EVM 비대칭 확인
