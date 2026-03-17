# 385 — DCent Swap UAT 시나리오 누락 — 2-hop 라우팅 / 크로스체인 / Solana 미검증

- **유형:** MISSING
- **심각도:** MEDIUM
- **상태:** FIXED
- **마일스톤:** v32.8
- **수정일:** 2026-03-18
- **마일스톤:** —

## 현상

DCent Swap UAT(`agent-uat/defi/dcent-swap.md`)가 EVM 단일 체인 직접 스왑(ETH→USDC) 시나리오만 포함하고 있어, 구현된 주요 기능이 검증되지 않고 있다.

## 누락 시나리오

### 1. 2-hop auto-routing
- 직접 경로가 없을 때 중간 토큰(ETH/USDC/USDT) 경유 2-hop 폴백 동작 검증
- `findTwoHopRoutes()` → `executeTwoHopSwap()` 전체 플로우
- Hop 2 실패 시 `PARTIAL_SWAP_FAILURE` 에러 메시지에 중간 토큰 잔액 정보 포함 확인

### 2. 크로스체인 스왑
- SPL 토큰 → ERC20 토큰 스왑 (예: SOL→USDC on Ethereum)
- ERC20 토큰 → SPL 토큰 스왑
- 크로스체인 프로바이더(LiFi, ButterSwap) 경유 동작 확인

### 3. Solana 네트워크 스왑
- SOL → SPL 토큰 스왑 (예: SOL→USDC-SPL)
- SPL → SPL 토큰 스왑
- Solana 트랜잭션 서명 및 컨펌 확인

### 4. 견적 비교
- `queryQuotes()` MCP/SDK 직접 접근 시 복수 프로바이더 견적 반환 확인
- `queryTwoHopRoutes()` 2-hop 경로 목록 및 최적 경로 선정 확인

## 현재 UAT 범위

`agent-uat/defi/dcent-swap.md` (defi-12):
- EVM 단일 체인만 (`ethereum-mainnet`)
- 직접 스왑만 (ETH→USDC)
- 2-hop / 크로스체인 / Solana 전무

## 수정 방안

기존 `dcent-swap.md`에 시나리오를 추가하거나, 별도 UAT 파일로 분리:
1. **defi-12a**: DCent Swap 2-hop auto-routing (EVM 체인 내 마이너 토큰 → 메이저 토큰, 중간 경유)
2. **defi-12b**: DCent Swap 크로스체인 (SPL ↔ ERC20)
3. **defi-12c**: DCent Swap Solana (SOL ↔ SPL 토큰)

## 테스트 항목

- [ ] 2-hop 시나리오: 직접 경로 없는 토큰 쌍으로 스왑 시 중간 토큰 경유 성공 확인
- [ ] 2-hop 부분 실패: Hop 1 성공 + Hop 2 실패 시 에러 메시지에 중간 토큰 정보 포함 확인
- [ ] 크로스체인: SOL → ERC20 USDC 스왑 simulate 및 실행 확인
- [ ] Solana: SOL → SPL USDC 스왑 simulate 및 실행 확인
- [ ] 견적 비교: 복수 프로바이더 견적 반환 및 bestOrder 정렬 확인
