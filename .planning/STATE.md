# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-12)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v1.4.1 Phase 83 - Keystore 멀티커브

## Current Position

Phase: 83 (2 of 7 in v1.4.1) — Keystore 멀티커브
Plan: 1 of 2 complete
Status: In progress
Last activity: 2026-02-12 — Completed 83-01-PLAN.md (secp256k1 keystore multicurve)

Progress: [██░░░░░░░░] 14% (1/7 phases in v1.4.1, 4/~14 plans)

## Performance Metrics

**Cumulative:** 20 milestones, 82 phases, 186 plans, 529 reqs, 1,220 tests, 51,750+ LOC

**v1.4.1 Scope:** 7 phases, 29 requirements mapped, 4 plans completed (Phase 82 done + 83-01 done)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full log in PROJECT.md.
Recent decisions affecting current work:

- [v1.4.1]: chain='ethereum'은 EVM 호환 체인 전체를 포괄 (ChainType enum 확장 없음)
- [v1.4.1]: AdapterPool lazy init + 캐싱 (데몬 시작 시 전체 초기화 아님)
- [v1.4.1]: 라우트 스키마 분리 방안 C (OpenAPI doc과 실제 Zod 검증 분리)
- [v1.4.1]: SIWE nonce 미검증 (Solana owner-auth 일관성, expirationTime 의존)
- [v1.4.1]: MCP는 TRANSFER + TOKEN_TRANSFER만 노출 (CONTRACT_CALL/APPROVE/BATCH 보안 차단)
- [82-01]: Polygon nativeSymbol = 'POL' (post MATIC-to-POL rebrand)
- [82-01]: validateChainNetwork throws plain Error (not WAIaaSError) to keep @waiaas/core free of circular deps
- [82-01]: EVM_CHAIN_MAP typed as Record<EvmNetworkType, EvmChainEntry> for compile-time completeness
- [82-02]: EVM RPC defaults use drpc.org public endpoints (non-empty defaults replacing old empty strings)
- [82-02]: evm_default_network validated by EvmNetworkTypeEnum from @waiaas/core
- [82-02]: EvmAdapter nativeName = 'Ether' (token name) not 'Ethereum' (blockchain name)
- [82-03]: CreateAgentRequestSchema.network optional, service-layer resolves chain-based default
- [82-03]: ACTION_VALIDATION_FAILED used for chain-network validation errors (not VALIDATION_ERROR)
- [83-01]: viem privateKeyToAccount used for EIP-55 address derivation (not Node.js crypto)
- [83-01]: crypto.randomBytes(32) for secp256k1 private key entropy (CSPRNG)
- [83-01]: curve field backward compat: missing = 'ed25519' (pre-v1.4.1 files)
- [83-01]: network parameter replaces hardcoded 'devnet' in keystore files
- [83-01]: sodium.sodium_memzero used for secp256k1 plaintext zeroing (same pattern as ed25519)

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing e2e-errors.test.ts failure -- OpenAPIHono side effect

## Session Continuity

Last session: 2026-02-12
Stopped at: Completed 83-01-PLAN.md, ready for 83-02
Resume file: None
