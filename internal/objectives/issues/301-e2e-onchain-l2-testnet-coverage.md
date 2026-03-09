# Issue #301: E2E 온체인 테스트에 L2 테스트넷 네트워크 추가

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **발견 경로:** E2E 온체인 스모크 테스트 검토

## 현황

E2E 온체인 테스트가 Ethereum Sepolia + Solana Devnet 두 네트워크만 대상으로 함. 지갑에 등록된 L2 테스트넷(Polygon Amoy, Arbitrum Sepolia, Optimism Sepolia, Base Sepolia, HyperEVM Testnet)은 E2E 검증 대상에서 제외됨.

EVM 어댑터 코드 경로는 동일하지만, 네트워크별 RPC 연결, 가스 추정, 트랜잭션 컨펌 동작이 다를 수 있어 실제 온체인 검증이 필요.

## 추가 대상 네트워크

- `polygon-amoy` — Polygon PoS 테스트넷
- `arbitrum-sepolia` — Arbitrum L2 테스트넷
- `optimism-sepolia` — Optimism L2 테스트넷
- `base-sepolia` — Base L2 테스트넷
- `hyperevm-testnet` — HyperEVM 테스트넷

## 수정 사항

### 1. precondition-checker.ts
- `DEFAULT_REQUIREMENTS`에 각 L2 테스트넷 잔액 요구사항 추가
- `PROTOCOL_NETWORK_MAP`에 L2 네트워크 매핑 추가

### 2. onchain-transfer.e2e.test.ts
- L2 네트워크별 ETH self-transfer 테스트 케이스 추가 (기존 `skipIf` 패턴 활용)

### 3. 시나리오 등록
- `scenarios/onchain-transfer.ts`에 L2 네트워크 시나리오 추가

## 참고

- 각 L2 테스트넷에 최소 잔액(네이티브 토큰) 펀딩 필요
- 잔액 미충족 시 `skipIf`로 graceful skip 처리되므로 CI 안정성에 영향 없음

## 테스트 항목

- [ ] 사전 조건 체크에서 L2 네트워크 잔액 확인 항목 출력
- [ ] 잔액 보유 네트워크에서 self-transfer 테스트 통과
- [ ] 잔액 미보유 네트워크에서 graceful skip 동작 확인
