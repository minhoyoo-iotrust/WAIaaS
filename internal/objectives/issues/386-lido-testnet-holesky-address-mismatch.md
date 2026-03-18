# Issue #386: Lido 테스트넷 포지션 미표시 — Holesky 컨트랙트 주소가 Sepolia 네트워크에 매핑됨

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **수정일:** 2026-03-18
- **발견 경로:** Admin 대시보드 DeFi 포지션 섹션에서 테스트넷 Lido 스테이킹 포지션 미표시 확인

## 배경

Admin 대시보드의 DeFi 포지션 섹션에서 "Include testnets" 토글을 활성화해도 Lido 스테이킹 포지션이 표시되지 않는다.

## 원인 분석

`packages/actions/src/providers/lido-staking/lido-contract.ts`의 `LIDO_TESTNET_NETWORK_CONFIG`에 **Holesky 테스트넷** 컨트랙트 주소가 `ethereum-sepolia` 네트워크에 매핑되어 있다.

### 현재 코드 (잘못된 주소)
```typescript
export const LIDO_TESTNET_NETWORK_CONFIG: Record<string, LidoNetworkContracts> = {
  'ethereum-sepolia': {
    stethAddress: '0x3F1c547b21f65e10480dE3ad8E19fAAC46C95034',  // Holesky 주소
    wstethAddress: '0x8d09a4502Cc8Cf1547aD300E066060D043f6982D', // Holesky 주소
    caip2: 'eip155:11155111',
  },
};
```

- 위 주소는 Holesky (chain ID 17000) 테스트넷에 배포된 컨트랙트
- WAIaaS 시스템은 `ethereum-sepolia` (chain ID 11155111) RPC를 사용
- Sepolia RPC에서 Holesky 주소로 `balanceOf`를 호출하면 컨트랙트가 존재하지 않아 항상 0 또는 revert 반환
- PositionTracker가 빈 결과를 받아 `defi_positions` 테이블에 행이 삽입되지 않음

### 올바른 Sepolia 주소 (Lido 공식 문서 참조)
- stETH: `0x3e3FE7dBc6B4C189E7128855dD526361c49b40Af`
- wstETH: `0xB82381A3fBD3FaFA77B3a7bE693342618240067b`

출처: https://docs.lido.fi/deployed-contracts/sepolia/

### 참고: Lido Sepolia 배포 deprecated
- Lido가 Sepolia 배포를 공식 deprecated하고 Hoodi 테스트넷으로 이전
- 그러나 컨트랙트 자체는 Sepolia에 여전히 존재하여 `balanceOf` 읽기는 가능
- WAIaaS 시스템이 Hoodi 네트워크를 지원할 때까지 Sepolia 주소 사용이 최선

## 수정 사항

### 1. Lido 테스트넷 컨트랙트 주소 수정
- `packages/actions/src/providers/lido-staking/lido-contract.ts`
  - `LIDO_TESTNET_NETWORK_CONFIG`의 stethAddress → `0x3e3FE7dBc6B4C189E7128855dD526361c49b40Af`
  - `LIDO_TESTNET_NETWORK_CONFIG`의 wstethAddress → `0xB82381A3fBD3FaFA77B3a7bE693342618240067b`
  - caip2 `eip155:11155111` 유지 (Sepolia chain ID — 올바름)
  - 주석 "Holesky only, mapped to ethereum-sepolia network" → "Sepolia testnet (deprecated by Lido, but contracts still readable)" 수정

### 2. WSTETH_HOLESKY 상수 수정
- `packages/actions/src/providers/lido-staking/lido-contract.ts`
  - `WSTETH_HOLESKY` → `WSTETH_SEPOLIA` 이름 변경, 주소 `0xB82381A3fBD3FaFA77B3a7bE693342618240067b`로 변경
  - 이 상수를 참조하는 코드도 함께 수정

### 3. Lido config 테스트넷 기본값 수정
- `packages/actions/src/providers/lido-staking/config.ts` — 테스트넷 관련 기본값이 Holesky 주소를 참조하는지 확인 후 수정

## 영향 범위

- PositionTracker STAKING 카테고리 동기화
- Admin 대시보드 DeFi 포지션 섹션 (테스트넷)
- Lido 스테이킹 액션 (테스트넷 환경에서 submit/withdraw 시 올바른 컨트랙트 호출)

## 테스트 항목

- [ ] Lido 테스트넷 config에 올바른 Sepolia 주소 반영 확인
- [ ] 테스트넷 환경 지갑에서 PositionTracker STAKING 동기화 후 `defi_positions` 테이블에 행 삽입 확인
- [ ] Admin 대시보드 "Include testnets" 토글 활성화 시 Lido 포지션 표시 확인
- [ ] 기존 Lido 유닛 테스트 (`lido-staking-integration.test.ts`) 통과 확인
- [ ] WSTETH_SEPOLIA 상수명 변경에 따른 참조 코드 컴파일 확인
