# #211 — Solana 네트워크 ID에 `solana-` 프리픽스 추가

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** OPEN
- **마일스톤:** m29-05
- **등록일:** 2026-02-28

## 현상

Solana 네트워크 ID가 `mainnet`, `devnet`, `testnet`으로 정의되어 있어 EVM 네트워크(`base-mainnet`, `ethereum-sepolia` 등)와 네이밍 규칙이 불일치함.

Admin UI에서 NETWORK 컬럼에 `mainnet`만 표시되면 어떤 체인의 mainnet인지 한눈에 구분이 안 되고, 필터 드롭다운에서도 `mainnet`과 `ethereum-mainnet`이 같은 레벨로 나열되어 혼란스러움.

## 기대 동작

Solana 네트워크 ID를 `solana-mainnet`, `solana-devnet`, `solana-testnet`으로 변경하여 EVM과 동일한 `{chain}-{network}` 패턴으로 통일.

## 영향 범위

- `packages/core/src/enums/chain.ts` — `SOLANA_NETWORK_TYPES` 상수
- `packages/core/src/rpc/built-in-defaults.ts` — RPC 기본값 키
- `packages/daemon/src/infrastructure/adapter-pool.ts` — `rpcConfigKey()` / `configKeyToNetwork()`
- `packages/daemon/src/infrastructure/config/` — config.toml 파싱/기본값
- `packages/admin/` — 네트워크 드롭다운, 필터, 표시
- `packages/cli/` — 네트워크 관련 CLI 명령어
- `packages/mcp/` — MCP 도구 네트워크 파라미터
- `packages/sdk/` — SDK 네트워크 타입
- `skills/` — 스킬 파일 네트워크 예시
- DB 마이그레이션 — `wallets`, `transactions`, `incoming_transactions` 등 network 컬럼 값 변환

## 테스트 항목

- [ ] `SOLANA_NETWORK_TYPES`가 `['solana-mainnet', 'solana-devnet', 'solana-testnet']`으로 변경 확인
- [ ] `validateChainNetwork('solana', 'solana-mainnet')` 정상 통과
- [ ] `validateChainNetwork('solana', 'mainnet')` 에러 발생
- [ ] DB 마이그레이션으로 기존 `mainnet` → `solana-mainnet` 변환 확인
- [ ] Admin UI 네트워크 필터에 `solana-mainnet` 표시 확인
- [ ] config.toml `rpc` 섹션 키 호환성 확인
- [ ] RPC Pool 빌트인 기본값 키 매핑 정상 동작
- [ ] 기존 테스트 전체 통과
