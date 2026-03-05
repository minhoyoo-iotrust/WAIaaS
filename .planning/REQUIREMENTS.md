# Requirements: WAIaaS v30.10 — ERC-8128 Signed HTTP Requests

**Defined:** 2026-03-05
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Signing Engine

- [ ] **ENG-01**: User can request ERC-8128 HTTP message signature with RFC 9421 compliant Signature Base construction
- [ ] **ENG-02**: User can auto-generate Content-Digest (SHA-256) for request body per RFC 9530
- [ ] **ENG-03**: User can select Covered Components preset (minimal/standard/strict) or specify custom components
- [ ] **ENG-04**: User can configure Nonce (UUID v4 auto-generation, optional disable) and TTL (10-3600s, default 300s)
- [ ] **ENG-05**: User can verify keyid format (`erc8128:<chainId>:<address>`) is correctly generated from wallet

### API & Interfaces

- [ ] **API-01**: User can generate ERC-8128 signature headers via POST /v1/erc8128/sign (sessionAuth)
- [ ] **API-02**: User can verify ERC-8128 signatures via POST /v1/erc8128/verify (sessionAuth, debug/test)
- [ ] **API-03**: User can sign HTTP requests via MCP `erc8128_sign_request` tool
- [ ] **API-04**: User can verify signatures via MCP `erc8128_verify_signature` tool
- [ ] **API-05**: User can sign HTTP requests via SDK `signHttpRequest()` method
- [ ] **API-06**: User can verify signatures via SDK `verifyHttpSignature()` method
- [ ] **API-07**: User can sign + fetch in one call via SDK `fetchWithErc8128()` helper

### Policy

- [ ] **POL-01**: User can set ERC8128_ALLOWED_DOMAINS policy with allowed domain list
- [ ] **POL-02**: User can use wildcard domain matching (*.example.com)
- [ ] **POL-03**: User can configure default-deny behavior (unsigned domains blocked when policy not set)
- [ ] **POL-04**: User can set rate limit per minute per domain (in-memory counter)

### Verification

- [ ] **VER-01**: User can verify ERC-8128 signature via ecrecover and confirm recovered address matches keyid
- [ ] **VER-02**: User can validate Content-Digest integrity as part of signature verification

### Admin & Settings

- [ ] **ADM-01**: User can enable/disable ERC-8128 via Admin Settings (erc8128.enabled feature gate)
- [ ] **ADM-02**: User can configure default preset, TTL, nonce, algorithm via Admin Settings (4 keys)
- [ ] **ADM-03**: User can manage ERC8128_ALLOWED_DOMAINS policy via Admin UI Policies form
- [ ] **ADM-04**: User can view ERC-8128 settings in Admin UI System page

### Integration

- [ ] **INT-01**: User can discover ERC-8128 support via connect-info capabilities.erc8128Support
- [ ] **INT-02**: User receives ERC8128_SIGNATURE_CREATED notification on successful signing
- [ ] **INT-03**: User receives ERC8128_DOMAIN_BLOCKED notification when domain is blocked by policy
- [ ] **INT-04**: User can reference ERC-8128 usage in skill files (wallet/policies/admin updated)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Smart Contract Account Support

- **SCA-01**: User can sign ERC-8128 requests with ERC-1271 (Smart Contract Account) signatures
- **SCA-02**: User can use P-256 algorithm for ERC-8128 signatures (if spec evolves)

### Advanced Features

- **ADV-01**: User can use ERC-8128 as a proxy mode (daemon calls external API directly)
- **ADV-02**: User can apply ERC-8128 to WAIaaS own API authentication (replace masterAuth/sessionAuth)
- **ADV-03**: User can sign HTTP requests for Solana chain wallets (non-EVM extension)

## Out of Scope

| Feature | Reason |
|---------|--------|
| ERC-1271 SCA signatures | ERC-8128 spec undecided on SCA; EOA covers primary use case |
| Proxy mode (daemon calls external API) | Security attack surface increase; sign-only pattern (x402 precedent) |
| WAIaaS self-API auth replacement | Separate concern; existing masterAuth/sessionAuth sufficient |
| Solana chain support | ERC-8128 is Ethereum-specific standard |
| DB schema changes | ERC-8128 is stateless signing; Admin Settings suffice |
| P-256 algorithm | Not in current ERC-8128 Draft; monitor spec evolution |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENG-01 | Phase 327 | Pending |
| ENG-02 | Phase 327 | Pending |
| ENG-03 | Phase 327 | Pending |
| ENG-04 | Phase 327 | Pending |
| ENG-05 | Phase 327 | Pending |
| API-01 | Phase 328 | Pending |
| API-02 | Phase 328 | Pending |
| API-03 | Phase 329 | Pending |
| API-04 | Phase 329 | Pending |
| API-05 | Phase 329 | Pending |
| API-06 | Phase 329 | Pending |
| API-07 | Phase 329 | Pending |
| POL-01 | Phase 328 | Pending |
| POL-02 | Phase 328 | Pending |
| POL-03 | Phase 328 | Pending |
| POL-04 | Phase 328 | Pending |
| VER-01 | Phase 327 | Pending |
| VER-02 | Phase 327 | Pending |
| ADM-01 | Phase 328 | Pending |
| ADM-02 | Phase 328 | Pending |
| ADM-03 | Phase 329 | Pending |
| ADM-04 | Phase 329 | Pending |
| INT-01 | Phase 329 | Pending |
| INT-02 | Phase 328 | Pending |
| INT-03 | Phase 328 | Pending |
| INT-04 | Phase 329 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-03-05 after roadmap creation*
