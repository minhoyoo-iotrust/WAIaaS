# #305 — Admin UI 네트워크 목록에 HyperEVM 누락

- **유형:** MISSING
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-03-10

## 설명

Admin UI의 하드코딩된 EVM 네트워크 목록에 HyperEVM Mainnet(chainId 999)과 HyperEVM Testnet(chainId 998)이 누락되어 있다.
코어 패키지(`packages/core/src/enums/chain.ts`)와 EVM 어댑터(`packages/adapters/evm/src/evm-chain-map.ts`)에는 정상 등록되어 있으나,
Admin UI의 여러 하드코딩 배열에서 빠져 있어 RPC Endpoints 탭, Settings RPC 섹션, 토큰 레지스트리, 정책 폼에서 HyperEVM을 선택/표시할 수 없다.

## 영향

- Admin UI Wallets > RPC Endpoints 탭에 HyperEVM Mainnet/Testnet 미표시
- Admin UI Settings > RPC 섹션에 HyperEVM RPC 설정 필드 미표시
- Admin UI Tokens 페이지에서 HyperEVM 네트워크 토큰 관리 불가
- Admin UI 정책 Spending Limit 폼에서 HyperEVM 네트워크 선택 불가
- Settings 검색에서 HyperEVM RPC 검색 불가
- Agent UAT 실행 시 HyperEVM 관련 시나리오 스킵

## 수정 대상 파일 (6곳)

### 1. `packages/admin/src/pages/wallets.tsx` (3개 배열)

- **`evmNetworkOptions`** (line ~2008): HyperEVM 항목 추가
  ```typescript
  { label: 'HyperEVM Mainnet', value: 'hyperevm-mainnet' },
  { label: 'HyperEVM Testnet', value: 'hyperevm-testnet' },
  ```

- **`NETWORK_DISPLAY_NAMES`** (line ~2021): HyperEVM 표시명 추가
  ```typescript
  'hyperevm-mainnet': 'HyperEVM Mainnet',
  'hyperevm-testnet': 'HyperEVM Testnet',
  ```

- **`EVM_NETWORKS`** (line ~2038): HyperEVM 네트워크 ID 추가
  ```typescript
  'hyperevm-mainnet', 'hyperevm-testnet',
  ```

### 2. `packages/admin/src/pages/settings.tsx` (2개 배열)

- **`evmRpcKeys`** (line ~483): RPC 설정 키 추가
  ```typescript
  'evm_hyperevm_mainnet', 'evm_hyperevm_testnet',
  ```

- **`evmNetworkOptions`** (line ~491): 네트워크 옵션 추가
  ```typescript
  { label: 'HyperEVM Mainnet', value: 'hyperevm-mainnet' },
  { label: 'HyperEVM Testnet', value: 'hyperevm-testnet' },
  ```

### 3. `packages/admin/src/pages/tokens.tsx` (1개 배열)

- **`EVM_NETWORKS`** (line ~31): 네트워크 ID 추가
  ```typescript
  'hyperevm-mainnet',
  'hyperevm-testnet',
  ```

### 4. `packages/admin/src/components/policy-forms/spending-limit-form.tsx` (1개 배열)

- **`EVM_NETWORKS`** (line ~45): 네트워크 ID 추가
  ```typescript
  'hyperevm-mainnet', 'hyperevm-testnet',
  ```

### 5. `packages/admin/src/utils/settings-helpers.ts` (1개 매핑)

- **`keyToLabel` 매핑** (line ~82): 표시 라벨 추가
  ```typescript
  evm_hyperevm_mainnet: 'HyperEVM Mainnet',
  evm_hyperevm_testnet: 'HyperEVM Testnet',
  ```

### 6. `packages/admin/src/utils/settings-search-index.ts` (2개 항목)

- **`SETTINGS_SEARCH_INDEX`** (line ~34 이후): 검색 인덱스 항목 추가
  ```typescript
  { id: 'wallets.rpc.evm_hyperevm_mainnet', label: 'HyperEVM Mainnet', description: 'RPC endpoint URL for HyperEVM mainnet (Hyperliquid)', page: '/wallets', tab: 'rpc', fieldName: 'rpc.evm_hyperevm_mainnet', keywords: ['blockchain', 'rpc', 'evm', 'hyperevm', 'hyperliquid', 'hype', 'url', 'endpoint'] },
  { id: 'wallets.rpc.evm_hyperevm_testnet', label: 'HyperEVM Testnet', description: 'RPC endpoint URL for HyperEVM testnet (Hyperliquid)', page: '/wallets', tab: 'rpc', fieldName: 'rpc.evm_hyperevm_testnet', keywords: ['blockchain', 'rpc', 'evm', 'hyperevm', 'hyperliquid', 'hype', 'url', 'endpoint', 'test'] },
  ```

## 근본 원인

Admin UI의 EVM 네트워크 목록이 코어 패키지의 `EVM_NETWORK_TYPES` SSoT를 참조하지 않고 하드코딩으로 중복 관리되고 있어,
새 네트워크 추가 시 Admin UI 동기화가 누락된다. v31.4에서 HyperEVM을 코어/어댑터에 추가했으나 Admin UI 업데이트가 빠졌다.

## 테스트 항목

1. Admin UI Wallets > RPC Endpoints 탭에 HyperEVM Mainnet/Testnet 표시 확인
2. Admin UI Settings > RPC 섹션에 HyperEVM RPC 필드 표시 확인
3. Admin UI Tokens 페이지 네트워크 셀렉터에 HyperEVM 표시 확인
4. Admin UI 정책 Spending Limit 폼 네트워크 셀렉터에 HyperEVM 표시 확인
5. Admin UI Settings 검색에서 "hyperevm" 검색 시 RPC 설정 결과 표시 확인
6. RPC Test 버튼 클릭 시 HyperEVM RPC 연결 테스트 성공 확인
