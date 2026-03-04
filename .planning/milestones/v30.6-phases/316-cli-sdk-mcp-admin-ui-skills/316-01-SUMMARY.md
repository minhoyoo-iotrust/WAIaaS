# Plan 316-01 Summary: CLI + SDK Smart Account Support

## What was done
- Added `--account-type` CLI option for `wallet create` command (eoa/smart)
- Added `accountType` display in `wallet info` command (Account Type, Signer Key, Deployed)
- Added `CreateWalletParams`/`CreateWalletResponse` types to SDK
- Added `createWallet()` method to SDK client with masterAuth support
- Added `masterPassword` to `WAIaaSClientOptions`
- Added `accountType`, `signerKey`, `deployed` to SDK `WalletInfoResponse` and `ConnectInfoWallet`

## Tests added
- CLI: 5 new tests (smart account fields display, eoa display, accountType in POST body, no accountType when omitted, invalid accountType error)
- SDK: 3 new tests (createWallet with smart type, minimal params, missing masterPassword error)
- All 216 CLI + 158 SDK tests passing

## Files modified
- `packages/cli/src/commands/wallet.ts`
- `packages/cli/src/index.ts`
- `packages/cli/src/__tests__/wallet-coverage.test.ts`
- `packages/sdk/src/types.ts`
- `packages/sdk/src/client.ts`
- `packages/sdk/src/__tests__/client.test.ts`
