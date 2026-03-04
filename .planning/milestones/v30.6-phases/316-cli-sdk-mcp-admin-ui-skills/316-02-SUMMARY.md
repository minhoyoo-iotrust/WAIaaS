# Plan 316-02 Summary: MCP + Admin UI Smart Account Support

## What was done
- MCP: `get-wallet-info` fetches wallet detail API for `accountType`, `signerKey`, `deployed` with graceful degradation
- Daemon: `connect-info` route includes `accountType` in wallet data
- Admin: Added Account Type selector (EOA/Smart) for ethereum chain in wallet creation form
- Admin: Added Account Type badge, Signer Key, Deployed rows in wallet detail OverviewTab
- Admin System: Added SmartAccountSection with 5 fields (enabled, bundler_url, paymaster_url, paymaster_api_key, entry_point)

## Tests added
- MCP: 2 new tests (smart account fields from wallet detail, defaults when detail API fails)
- Admin wallets: 2 new tests (Account Type selector visibility, smart account wallet creation)
- Admin system: 2 new tests (Smart Account section rendering, save payload)
- All 204 MCP + 650 Admin tests passing

## Files modified
- `packages/mcp/src/tools/get-wallet-info.ts`
- `packages/mcp/src/__tests__/tools.test.ts`
- `packages/daemon/src/api/routes/connect-info.ts`
- `packages/admin/src/pages/wallets.tsx`
- `packages/admin/src/pages/system.tsx`
- `packages/admin/src/__tests__/wallets-coverage.test.tsx`
- `packages/admin/src/__tests__/system.test.tsx`
