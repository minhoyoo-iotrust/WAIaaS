---
plan: 286-03
title: "인터페이스 레이어: CLI, Admin UI, skills, 레거시 입력 자동 변환"
status: complete
started: "2026-02-28"
completed: "2026-02-28"
---

# Summary: 286-03 Interface Layer Update

## What Was Built

Added legacy network name normalizer (`normalizeNetworkInput`) and `NetworkTypeEnumWithLegacy` Zod preprocess schema for backward-compatible API inputs. Updated Admin UI network displays and all skill file examples.

## Tasks Completed

1. **T1: Legacy input normalizer + deprecation warning** - `normalizeNetworkInput()` auto-converts bare 'mainnet' to 'solana-mainnet' with session-scoped warning. `NetworkTypeEnumWithLegacy` Zod preprocess applied to 5 request schemas. `network-resolver.ts` applies normalizer.
2. **T2: Admin UI + skills** - Updated network display names, dropdown options, native symbol mappings in 4 Admin UI files. Updated Solana network examples in 4 skills files.

## Commits

1. `feat(286-03): add legacy network name normalizer and NetworkTypeEnumWithLegacy`
2. `feat(286-03): update Admin UI network displays and skills file examples`

## Key Files

### key-files.modified
- `packages/core/src/enums/chain.ts`
- `packages/core/src/index.ts`
- `packages/core/src/schemas/transaction.schema.ts`
- `packages/daemon/src/pipeline/network-resolver.ts`
- `packages/admin/src/pages/wallets.tsx`
- `packages/admin/src/pages/transactions.tsx`
- `packages/admin/src/components/policy-forms/allowed-networks-form.tsx`
- `packages/admin/src/components/policy-forms/spending-limit-form.tsx`
- `skills/wallet.skill.md`
- `skills/quickstart.skill.md`
- `skills/actions.skill.md`
- `skills/transactions.skill.md`

## Self-Check: PASSED

- [x] normalizeNetworkInput() exported from @waiaas/core
- [x] NetworkTypeEnumWithLegacy exported from @waiaas/core
- [x] 5 request schemas use NetworkTypeEnumWithLegacy
- [x] Admin UI networks use solana-mainnet format
- [x] Skills files use solana-mainnet format
