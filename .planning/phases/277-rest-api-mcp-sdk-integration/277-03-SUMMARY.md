---
plan: 277-03
status: done
commit: d6ca0346
---

## Summary

Updated skill files to document new DeFi Lending API endpoints, MCP tools, and SDK methods per CLAUDE.md mandate.

### Changes

**skills/wallet.skill.md:**
- Added Section 16 (DeFi Positions) documenting:
  - `GET /v1/wallet/positions` -- list active DeFi positions with USD valuations
  - `GET /v1/wallet/health-factor` -- query lending health factor with severity classification
  - MCP tools: `waiaas_get_defi_positions`, `waiaas_get_health_factor`
  - SDK methods: `getPositions()` / `get_positions()`, `getHealthFactor()` / `get_health_factor()`
- Updated MCP tool count from 23 to 25

**skills/actions.skill.md:**
- Added Section 8 (Aave V3 Lending -- Built-in Provider) documenting:
  - All 4 actions: `aave_supply`, `aave_borrow`, `aave_repay`, `aave_withdraw`
  - Parameters for each action with supported chains table
  - Safety features: health factor simulation, non-spending classification, ERC-20 auto-approval
  - Multi-step execution (approve + supply/repay pipeline)
  - REST API, MCP, TypeScript SDK, and Python SDK examples
  - Cross-reference to position query endpoints
- Updated MCP auto-registered tool count from 8 to 12
- Renumbered sections 8-12 to 9-13

### Verification

- `grep -c` confirmed 6 matches for position/health-factor docs in wallet.skill.md
- `grep -c` confirmed 14 matches for Aave V3 docs in actions.skill.md
- Security notice present in both files
- All endpoint paths match implementation (/v1/wallet/positions, /v1/wallet/health-factor)
- All MCP tool names match registrations (waiaas_get_defi_positions, waiaas_get_health_factor, action_aave_v3_aave_*)
