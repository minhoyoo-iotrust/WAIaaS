# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-12)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v1.4.1 Phase 86 - REST API 5-type + MCP/SDK 확장

## Current Position

Phase: 86 (5 of 7 in v1.4.1) — REST API 5-type + MCP/SDK 확장
Plan: Not started
Status: Ready to plan
Last activity: 2026-02-12 — Phase 85 complete (1/1 plans, verified)

Progress: [██████░░░░] 57% (4/7 phases in v1.4.1)

## Performance Metrics

**Cumulative:** 20 milestones, 85 phases, 190 plans, 533 reqs, 1,242 tests, 52,000+ LOC

**v1.4.1 Scope:** 7 phases, 29 requirements mapped, 8 plans completed (Phases 82-85 done)

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
- [83-02]: vi.fn() mock keyStore enables call inspection for 4-param signature verification
- [84-01]: AdapterPool dynamic import for both adapter packages (same pattern as daemon.ts Step 4)
- [84-01]: EVM_CHAIN_MAP lookup in resolve() provides viemChain + nativeSymbol + nativeName automatically
- [84-01]: disconnectAll() concurrent Promise.all with per-adapter catch (fail-soft)
- [84-01]: Pool clears after disconnectAll -- subsequent resolves create fresh adapters
- [84-02]: resolveRpcUrl extracted as shared utility in adapter-pool.ts (avoids duplication across daemon/routes)
- [84-02]: TransactionRouteDeps.config changed from partial to full DaemonConfig (route extracts what it needs)
- [84-02]: PipelineContext.adapter stays IChainAdapter (routes resolve before pipeline entry, stages chain-agnostic)
- [84-02]: mockAdapterPool test pattern: resolve returns mockAdapter(), disconnectAll vi.fn()
- [85-01]: managesOwnTransaction=true: runner sets FK OFF, up() manages own BEGIN/COMMIT
- [85-01]: v2 up() re-enables FK and runs foreign_key_check before returning (defense-in-depth)
- [85-01]: Existing migration tests bumped to version 10+ to avoid conflict with real v2 migration
- [85-01]: v2 test suite uses dedicated v1-only DB (manual schema, no auto-migrations)

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing e2e-errors.test.ts failure -- OpenAPIHono side effect

## Session Continuity

Last session: 2026-02-12
Stopped at: Phase 85 complete, verified, ready for Phase 86 planning
Resume file: None
