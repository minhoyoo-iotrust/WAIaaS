# Requirements: WAIaaS v27.2 CAIP-19 자산 식별 표준

**Defined:** 2026-02-22
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v27.2 Requirements

### CAIP Parser

- [x] **CAIP-01**: User can parse a CAIP-2 chain ID string into namespace and reference components
- [x] **CAIP-02**: User can format namespace and reference into a valid CAIP-2 chain ID string
- [x] **CAIP-03**: User can parse a CAIP-19 asset type URI into chainId, assetNamespace, and assetReference components
- [x] **CAIP-04**: User can format components into a valid CAIP-19 asset type URI with roundtrip fidelity
- [x] **CAIP-05**: User can validate CAIP-2 and CAIP-19 strings via Zod schemas with spec-compliant regex
- [x] **CAIP-06**: User can convert any WAIaaS NetworkType to its CAIP-2 chain ID and vice versa (13 networks bidirectional)
- [x] **CAIP-07**: User can generate a CAIP-19 native asset ID for any supported network using slip44 coin types (ETH=60, SOL=501, POL=966)
- [x] **CAIP-08**: User can generate a CAIP-19 token asset ID from network and token address (erc20 for EVM, token for Solana SPL/Token-2022)
- [x] **CAIP-09**: User can determine if a CAIP-19 URI represents a native asset via isNativeAsset() helper
- [x] **CAIP-10**: x402.types.ts CAIP2_TO_NETWORK mapping is consolidated into the new caip/ module with backward-compatible re-export

### Token Infrastructure

- [x] **TOKN-01**: TokenRef schema includes optional assetId (CAIP-19) and network (NetworkType) fields alongside existing address+chain
- [x] **TOKN-02**: token_registry DB table has asset_id TEXT column added via incremental migration (v22)
- [x] **TOKN-03**: Existing token_registry records are auto-populated with correct CAIP-19 asset_id from (network, address) during migration
- [x] **TOKN-04**: Token API responses include assetId field for all token registry entries

### Price Oracle

- [x] **ORCL-01**: Price oracle cache key uses CAIP-19 format instead of legacy ${chain}:${address}
- [x] **ORCL-02**: CoinGecko platform ID map is expanded to cover L2 networks (polygon-pos, arbitrum-one, optimistic-ethereum, base)
- [x] **ORCL-03**: L2 token prices can be resolved via CoinGecko using CAIP-2 based platform mapping
- [x] **ORCL-04**: PYTH_FEED_IDS key format is updated atomically with cache key migration

### Transaction Schema

- [x] **TXSC-01**: Transaction request schemas (TokenInfoSchema) accept optional assetId field
- [x] **TXSC-02**: When assetId is provided, address is extracted and cross-validated against assetId
- [x] **TXSC-03**: Existing transactions without assetId continue to work identically (backward compatible)

### Policy

- [ ] **PLCY-01**: ALLOWED_TOKENS policy rules accept optional assetId field for token matching
- [ ] **PLCY-02**: Policy evaluation with assetId compares chain+network+address (all three dimensions)
- [ ] **PLCY-03**: 4-scenario policy matching works correctly (assetId<->assetId, assetId<->legacy, legacy<->assetId, legacy<->legacy)
- [ ] **PLCY-04**: EVM addresses are normalized to lowercase for CAIP-19 comparison

### MCP/SDK

- [ ] **MCPS-01**: Token-related MCP tools (send_token, approve_token, etc.) accept optional assetId parameter
- [ ] **MCPS-02**: MCP tool descriptions document CAIP-19 assetId format and usage
- [ ] **MCPS-03**: TypeScript SDK types include assetId fields in token-related interfaces
- [ ] **MCPS-04**: Python SDK types include assetId fields in token-related models

### Skills/Docs

- [ ] **SKIL-01**: Skills files (transactions.skill.md, policies.skill.md) document CAIP-19 assetId usage
- [ ] **SKIL-02**: quickstart.skill.md introduces CAIP-19 asset identification concept

## Future Requirements

### ActionProvider Deep Integration

- **ACTN-01**: ActionProvider resolve() input uses CAIP-19 for fromAsset/toAsset identification
- **ACTN-02**: Each ActionProvider maps CAIP-19 to protocol-specific token IDs internally

### Full Migration

- **MIGR-01**: Deprecation of address-only token identification in favor of assetId-required
- **MIGR-02**: Admin UI token forms use CAIP-19 asset picker

## Out of Scope

| Feature | Reason |
|---------|--------|
| CAIP-19 for NFTs (erc721/erc1155) | WAIaaS는 fungible token만 지원. NFT 지원은 별도 마일스톤 |
| CAIP-10 account ID | 지갑 주소 식별은 현재 체계 유지. 자산 식별만 CAIP-19 |
| address-only 지원 제거 | 하위 호환성 유지 필요. 점진적 전환 후 별도 마일스톤에서 deprecated |
| CoinGecko testnet 토큰 가격 | 테스트넷 토큰은 가격이 없음. 메인넷만 L2 확장 |
| STO-03 Confirmation Worker 수정 | v27.1 known gap이지만 CAIP-19와 무관. 별도 이슈로 추적 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAIP-01 | Phase 231 | Complete |
| CAIP-02 | Phase 231 | Complete |
| CAIP-03 | Phase 231 | Complete |
| CAIP-04 | Phase 231 | Complete |
| CAIP-05 | Phase 231 | Complete |
| CAIP-06 | Phase 231 | Complete |
| CAIP-07 | Phase 231 | Complete |
| CAIP-08 | Phase 231 | Complete |
| CAIP-09 | Phase 231 | Complete |
| CAIP-10 | Phase 231 | Complete |
| TOKN-01 | Phase 231 | Complete |
| TOKN-02 | Phase 233 | Complete |
| TOKN-03 | Phase 233 | Complete |
| TOKN-04 | Phase 233 | Complete |
| ORCL-01 | Phase 232 | Complete |
| ORCL-02 | Phase 232 | Complete |
| ORCL-03 | Phase 232 | Complete |
| ORCL-04 | Phase 232 | Complete |
| TXSC-01 | Phase 233 | Complete |
| TXSC-02 | Phase 233 | Complete |
| TXSC-03 | Phase 233 | Complete |
| PLCY-01 | Phase 233 | Pending |
| PLCY-02 | Phase 233 | Pending |
| PLCY-03 | Phase 233 | Pending |
| PLCY-04 | Phase 233 | Pending |
| MCPS-01 | Phase 234 | Pending |
| MCPS-02 | Phase 234 | Pending |
| MCPS-03 | Phase 234 | Pending |
| MCPS-04 | Phase 234 | Pending |
| SKIL-01 | Phase 234 | Pending |
| SKIL-02 | Phase 234 | Pending |

**Coverage:**
- v27.2 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-22 after roadmap creation*
