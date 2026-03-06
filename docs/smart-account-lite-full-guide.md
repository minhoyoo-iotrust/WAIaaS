# Smart Account (AA) Lite / Full Mode Guide

## Overview

WAIaaS Smart Account (Account Abstraction) wallets operate in two modes: **Lite** and **Full**. The key difference is whether an **AA Provider (Bundler)** is configured.

| | Lite Mode | Full Mode |
|---|----------|----------|
| AA Provider | None (`null`) | Configured (pimlico / alchemy / custom) |
| Purpose | External platform handles gas sponsorship + Bundler submission | WAIaaS handles Bundler submission directly |
| Transaction sending | UserOp Build/Sign API only | `POST /v1/transactions/send` available |

---

## Concepts

### Lite Mode — "Sign only, submit externally"

```
AI Agent → WAIaaS (Build + Sign) → Platform Backend → Bundler/Paymaster
```

- WAIaaS acts as **UserOp constructor + signer only**
- Gas sponsorship (Paymaster) and Bundler submission are handled by the external platform
- No Bundler API key required on WAIaaS side
- Best when the platform wants direct control over gas policies

### Full Mode — "WAIaaS handles everything"

```
AI Agent → WAIaaS → Bundler (Pimlico/Alchemy) → On-chain
```

- WAIaaS manages the entire pipeline: UserOp construction → signing → Bundler submission
- Uses the same `POST /v1/transactions/send` API as EOA wallets
- Requires Bundler/Paymaster configuration, but simplest from the agent's perspective

---

## Feature Comparison

| Feature | Lite | Full |
|---------|:----:|:----:|
| Wallet creation | O | O |
| UserOp Build API | O | O |
| UserOp Sign API | O | O |
| `POST /v1/transactions/send` | X | O |
| Automatic Bundler submission | X | O |
| Auto contract deployment | X | O |
| Policy engine | O (at sign time) | O (at send time) |
| MCP `build_userop` tool | O | O |
| MCP `sign_userop` tool | O | O |
| SDK `buildUserOp()` | O | O |
| SDK `signUserOp()` | O | O |

### Lite Mode Policy Restriction

The UserOp Sign API supports **INSTANT tier only**. If a DELAY or APPROVAL policy is configured, the sign request will fail with `POLICY_DENIED`. This is because WAIaaS cannot enforce delay/approval workflows when the external platform controls submission.

---

## CLI Usage

### 1. Creating a Smart Account Wallet

Use the `--account-type smart` option. Both modes share the same creation command.

```bash
# Create a Smart Account wallet (starts in Lite mode)
waiaas wallet create --chain ethereum --account-type smart

# With a custom name
waiaas wallet create --chain ethereum --account-type smart --name my-smart-wallet

# On testnet
waiaas wallet create --chain ethereum --account-type smart --mode testnet
```

Wallets always start in **Lite mode**. Transition to Full mode by configuring an AA Provider.

### 2. Switching to Full Mode — Setting an AA Provider

There is no dedicated CLI command for AA Provider setup. Use one of these methods:

#### Method A: Admin UI (Recommended)

1. Open Admin UI → Wallets
2. Select the Smart Account wallet
3. Click "Change Provider"
4. Choose a provider (Pimlico / Alchemy / Custom)
5. Enter API Key or Bundler URL

#### Method B: REST API

```bash
# Pimlico
curl -X PUT http://127.0.0.1:3100/v1/wallets/{WALLET_ID}/provider \
  -H "X-Master-Password: YOUR_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "aaProvider": "pimlico",
    "aaProviderApiKey": "YOUR_PIMLICO_API_KEY"
  }'

# Alchemy
curl -X PUT http://127.0.0.1:3100/v1/wallets/{WALLET_ID}/provider \
  -H "X-Master-Password: YOUR_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "aaProvider": "alchemy",
    "aaProviderApiKey": "YOUR_ALCHEMY_API_KEY"
  }'

# Custom Bundler
curl -X PUT http://127.0.0.1:3100/v1/wallets/{WALLET_ID}/provider \
  -H "X-Master-Password: YOUR_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "aaProvider": "custom",
    "aaBundlerUrl": "https://your-bundler.example.com/rpc"
  }'
```

#### Method C: SDK

```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({
  baseUrl: 'http://127.0.0.1:3100',
  masterPassword: 'YOUR_PASSWORD',
});

await client.updateProvider(walletId, {
  aaProvider: 'pimlico',
  aaProviderApiKey: 'YOUR_PIMLICO_API_KEY',
});
```

### 3. Checking Wallet Status

```bash
waiaas wallet show --wallet my-smart-wallet
```

Example output:
```
  Name:               my-smart-wallet
  Chain:              ethereum
  Environment:        mainnet
  Address:            0x1234...abcd
  Available:          Yes
  Status:             ACTIVE
  Account Type:       smart
  Signer Key:         0x5678...ef01
  Deployed:           no
```

In Admin UI, wallets display `[Smart Account - Lite]` or `[Smart Account - Full]` badges.

---

## Lite Mode Workflow (UserOp Build/Sign)

The complete flow for executing a transaction in Lite mode:

### Step 1: UserOp Build — Convert transaction intent to UserOp

```bash
curl -X POST http://127.0.0.1:3100/v1/wallets/{WALLET_ID}/userop/build \
  -H "X-Master-Password: YOUR_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "TRANSFER",
    "to": "0xRecipientAddress",
    "amount": "0.01",
    "network": "ethereum-sepolia"
  }'
```

Response:
```json
{
  "sender": "0xSmartAccountAddress",
  "nonce": "0x01",
  "callData": "0x...",
  "factory": "0xFactoryAddress",
  "factoryData": "0x...",
  "entryPoint": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  "buildId": "019..."
}
```

- `factory`/`factoryData`: Included only if the contract is not yet deployed (first transaction)
- `buildId`: Valid for 10 minutes, single-use

### Step 2: Fill gas fields on the platform side

Add gas and Paymaster information to the build response (done outside WAIaaS).

```javascript
// Platform backend example
const userOp = {
  sender: buildResponse.sender,
  nonce: buildResponse.nonce,
  callData: buildResponse.callData,
  factory: buildResponse.factory,
  factoryData: buildResponse.factoryData,
  // Gas fields (estimated via Bundler/Paymaster)
  callGasLimit: "0x...",
  verificationGasLimit: "0x...",
  preVerificationGas: "0x...",
  maxFeePerGas: "0x...",
  maxPriorityFeePerGas: "0x...",
  // Paymaster fields (optional)
  paymaster: "0xPaymasterAddress",
  paymasterData: "0x...",
  paymasterVerificationGasLimit: "0x...",
  paymasterPostOpGasLimit: "0x...",
};
```

### Step 3: UserOp Sign — Sign with WAIaaS

```bash
curl -X POST http://127.0.0.1:3100/v1/wallets/{WALLET_ID}/userop/sign \
  -H "X-Master-Password: YOUR_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "buildId": "019...",
    "userOperation": {
      "sender": "0x...",
      "nonce": "0x01",
      "callData": "0x...",
      "callGasLimit": "0x...",
      "verificationGasLimit": "0x...",
      "preVerificationGas": "0x...",
      "maxFeePerGas": "0x...",
      "maxPriorityFeePerGas": "0x..."
    }
  }'
```

Response:
```json
{
  "signedUserOperation": {
    "sender": "0x...",
    "nonce": "0x01",
    "callData": "0x...",
    "signature": "0x...",
    "..."
  },
  "txId": "019..."
}
```

### Step 4: Submit to Bundler on the platform side

```javascript
// Platform backend submits the signed UserOp to a Bundler
const userOpHash = await bundlerClient.sendUserOperation({
  ...signResponse.signedUserOperation,
});
```

---

## MCP Tool Usage (for AI Agents)

### build_userop

```
Tool: build_userop
Parameters:
  wallet_id: "wallet UUID"
  type: "TRANSFER"
  to: "0xRecipientAddress"
  amount: "0.01"
  network: "ethereum-sepolia"
```

### sign_userop

```
Tool: sign_userop
Parameters:
  wallet_id: "wallet UUID"
  build_id: "buildId from build_userop response"
  sender: "0x..."
  nonce: "0x..."
  call_data: "0x..."
  call_gas_limit: "0x..."
  verification_gas_limit: "0x..."
  pre_verification_gas: "0x..."
  max_fee_per_gas: "0x..."
  max_priority_fee_per_gas: "0x..."
```

---

## SDK Usage

```typescript
import { WAIaaSClient } from '@waiaas/sdk';

const client = new WAIaaSClient({
  baseUrl: 'http://127.0.0.1:3100',
  masterPassword: 'YOUR_PASSWORD',
});

// Build
const build = await client.buildUserOp(walletId, {
  request: { type: 'TRANSFER', to: '0x...', amount: '0.01' },
  network: 'ethereum-sepolia',
});

// (Platform fills gas fields externally)

// Sign
const signed = await client.signUserOp(walletId, {
  buildId: build.buildId,
  userOperation: {
    sender: build.sender,
    nonce: build.nonce,
    callData: build.callData,
    callGasLimit: '0x...',
    verificationGasLimit: '0x...',
    preVerificationGas: '0x...',
    maxFeePerGas: '0x...',
    maxPriorityFeePerGas: '0x...',
  },
});

// signed.signedUserOperation → submit to Bundler
```

---

## Security Design

### callData Dual Validation

Two validations are performed at sign time:

1. **DB comparison**: The `callData` in the sign request must match the value stored during build (byte-exact) — prevents callData tampering
2. **Policy re-evaluation**: Policies may have changed between build and sign, so they are re-evaluated at sign time

### Build TTL

- Build results are valid for **10 minutes**
- Sign attempts after expiry return `EXPIRED_BUILD`
- Used buildIds cannot be reused (`BUILD_ALREADY_USED`)

### Auto Contract Detection

- Each build call checks on-chain code existence
- If undeployed: `factory`/`factoryData` included in response
- If already deployed: DB updated to `deployed=true`, factory fields omitted

---

## Error Codes

| Error Code | Scenario | HTTP |
|-----------|----------|------|
| `BUILD_NOT_FOUND` | Non-existent buildId | 404 |
| `EXPIRED_BUILD` | Build TTL (10 min) exceeded | 400 |
| `BUILD_ALREADY_USED` | buildId already signed | 409 |
| `CALLDATA_MISMATCH` | Sign callData differs from build | 400 |
| `SENDER_MISMATCH` | UserOp sender differs from wallet address | 400 |
| `POLICY_DENIED` | Policy rejected or tier is not INSTANT | 403 |
| `ACTION_VALIDATION_FAILED` | Called on EOA or Solana wallet | 400 |

---

## Mode Selection Guide

### Choose Lite Mode when:

- Your platform sponsors gas via its own Paymaster
- You operate your own Bundler infrastructure
- You don't want to expose Bundler API keys to WAIaaS
- You need fine-grained gas policy control at the platform level

### Choose Full Mode when:

- AI agents need to send transactions directly
- You want the same API as EOA wallets for Smart Accounts
- You want a simple start without managing Bundler/Paymaster infrastructure
- You use managed services like Pimlico or Alchemy

### Mode Transition

Lite → Full transition is available at any time. Setting an AA Provider switches to Full mode without recreating the wallet.
