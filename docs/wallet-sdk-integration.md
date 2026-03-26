---
title: "Wallet SDK Integration Guide"
description: "Integrate external wallet apps with WAIaaS Signing Protocol using @waiaas/wallet-sdk. Architecture and code examples."
date: "2026-02-17"
section: "docs"
slug: "wallet-sdk-integration"
category: "Technical"
---
# Wallet SDK Integration Guide

This guide walks through integrating an external wallet application with the WAIaaS Signing Protocol using `@waiaas/wallet-sdk`.

## Architecture Overview

```
                          Scenario 1: Push Relay (Recommended)
+------------------+  ──> Push Relay ──> FCM/Pushwoosh ──>  +------------------+
|  WAIaaS Daemon   |  <─────────────────────────────────  |   Wallet App     |
|  (manages keys)  |                                      |  (signs txs)     |
|                  |      Scenario 2: Telegram             |                  |
|  Policy Engine   |  ────────> Telegram Bot ──>           |  @waiaas/        |
|  Kill Switch     |  <─────── Telegram Bot <──            |  wallet-sdk      |
+------------------+                                      +------------------+
```

When a transaction requires owner approval (APPROVAL or DELAY policy tier), the WAIaaS daemon:

1. Creates a **SignRequest** containing the transaction details and raw message to sign
2. Sends it to the owner's wallet via **Push Relay** (Pushwoosh/FCM native push) or **Telegram** bot
3. Waits for a **SignResponse** (approve with signature, or reject)
4. If approved, broadcasts the signed transaction to the blockchain

The wallet app uses `@waiaas/wallet-sdk` to parse requests, display them to the user, collect approval/rejection, and send back the response.

### Choosing an Integration Option

**We recommend Scenario 1 (Push Relay)** for production wallet apps. It provides the best end-user experience — users only need to select their wallet app in the Admin UI, with no additional setup. The Push Relay bridges WAIaaS signing requests to your existing push notification infrastructure.

| Option | Server Required | User Setup | Best For |
|--------|----------------|------------|----------|
| **Scenario 1:** Push Relay (Recommended) | Push Relay server | Wallet app selection only | Production wallet apps with native push (D'CENT, etc.) |
| **Scenario 2:** Telegram Relay | No | Telegram bot + chat ID setup | Apps without push infra, using Telegram as notification channel |

## Prerequisites

- WAIaaS daemon running with owner address registered
- Push Relay server or Telegram bot configured
- Node.js >= 18.0.0

### WAIaaS Daemon Setup

```bash
npm install -g @waiaas/cli
waiaas init && waiaas start
```

Then in the Admin UI (`http://127.0.0.1:3100/admin`):

1. **Register Owner Address** -- Wallets > select wallet > Owner tab > set the wallet address that will sign approval transactions
2. **Configure Wallet App** -- Human Wallet Apps > register your wallet app with Push Relay URL and subscription token
3. **Set Approval Policy** -- Policies > create a policy with APPROVAL tier for high-value transactions

## Integration Scenarios

### Scenario 1: Push Relay Server (Native Push) — Recommended

Best for wallet apps with existing push notification infrastructure (Pushwoosh, FCM). The `@waiaas/push-relay` server receives sign requests from the daemon via HTTP POST and forwards them as native push notifications.

#### Push Relay Setup

```bash
# Install and run push relay
npm install -g @waiaas/push-relay
# Or use Docker
docker run -d -p 3200:3200 -v /data:/data waiaas/push-relay
```

Push Relay `config.toml`:

```toml
[relay.push]
provider = "pushwoosh"    # or "fcm"

[relay.push.pushwoosh]
api_token = "YOUR_API_TOKEN"
application_code = "YOUR_APP_CODE"

# Or for FCM:
# [relay.push.fcm]
# project_id = "my-wallet-app"
# service_account_key_path = "/etc/push-relay/service-account.json"

[relay.server]
port = 3200
host = "0.0.0.0"
api_key = "your-secret-api-key"
```

#### Payload Customization

Push Relay supports declarative payload customization via `[relay.push.payload]`. This lets you add custom fields to push notifications sent to wallet apps (e.g., sound, badge, app-specific metadata).

```toml
# Static fields added to every push notification
[relay.push.payload.static_fields]
app_id = "com.example.wallet"
env = "production"

# Category-specific fields (merged on top of static_fields)
[relay.push.payload.category_map.sign_request]
sound = "alert.caf"
badge = "1"

[relay.push.payload.category_map.notification]
sound = "default"
channel = "info"
```

**Merge priority** (highest wins): original event data > `category_map` fields > `static_fields`.

Categories: `sign_request` (owner approval requests) and `notification` (general wallet notifications).

The transformation pipeline:

```
Daemon HTTP POST → Push Relay → ConfigurablePayloadTransformer → Push Provider (FCM/Pushwoosh)
```

#### Device Registration

Wallet apps register their push token with the Push Relay server using the SDK helper:

```typescript
import { registerDevice } from '@waiaas/wallet-sdk';

// On app startup, register device for push notifications
const { subscriptionToken } = await registerDevice(
  'https://your-push-relay:3200',
  'your-secret-api-key',
  { walletName: 'my-wallet', pushToken: devicePushToken, platform: 'android' },
);
```

To look up an existing subscription token or unregister a device:

```typescript
import { getSubscriptionToken, unregisterDevice } from '@waiaas/wallet-sdk';

// Check if already registered
const token = await getSubscriptionToken(
  'https://your-push-relay:3200',
  'your-secret-api-key',
  devicePushToken,
);

// Unregister on logout
await unregisterDevice(
  'https://your-push-relay:3200',
  'your-secret-api-key',
  devicePushToken,
);
```

#### Receiving Sign Requests via Native Push

```typescript
import {
  parseSignRequest,
  buildSignResponse,
  sendViaRelay,
  formatDisplayMessage,
} from '@waiaas/wallet-sdk';

// 1. Handle incoming native push notification
onPushReceived((push) => {
  // Push payload contains flat fields including a universal link URL
  const dataUrl = push.data.universalLinkUrl;

  // 2. Parse and validate the sign request from the universal link
  const request = parseSignRequest(dataUrl);

  // 3. Display transaction details
  const displayText = formatDisplayMessage(request);
  showApprovalDialog(displayText);
});

// 4. On user approval
async function onApprove(request: SignRequest) {
  const signature = await ownerWallet.sign(request.message);
  const response = buildSignResponse(
    request.requestId,
    'approve',
    signature,
    ownerWallet.address,
  );

  // 5. Send response via Push Relay
  await sendViaRelay(response, request.responseChannel.pushRelayUrl);
}
```

> **Tip:** `sendViaRelay()` posts the response to Push Relay's `/v1/sign-response` endpoint. The daemon retrieves it via long-polling on the same endpoint. The wallet app only needs to know the Push Relay URL.

For more details, see the [`@waiaas/push-relay` package on npm](https://www.npmjs.com/package/@waiaas/push-relay).

### Scenario 2: Telegram Messenger Relay

Best for mobile wallet apps where the user receives notifications via Telegram.

```typescript
import {
  parseSignRequest,
  buildSignResponse,
  formatDisplayMessage,
  sendViaTelegram,
} from '@waiaas/wallet-sdk';

// 1. Receive sign request via universal link (e.g., from Telegram message button)
const request = parseSignRequest(universalLinkUrl);

// 2. Display to user
const displayText = formatDisplayMessage(request);
showApprovalDialog(displayText);

// 3. On user approval
const signature = await ownerWallet.sign(request.message);
const response = buildSignResponse(
  request.requestId,
  'approve',
  signature,
  ownerWallet.address,
);

// 4. Generate Telegram deeplink and open it
const telegramUrl = sendViaTelegram(response, request.responseChannel.botUsername);
openUrl(telegramUrl);  // Opens Telegram with the response message
```

## SignRequest Structure

Each SignRequest contains:

| Field | Type | Description |
|-------|------|-------------|
| `version` | `'1'` | Protocol version |
| `requestId` | `string` | UUID identifying this request |
| `caip2ChainId` | `string` | CAIP-2 chain identifier (e.g., `eip155:1`, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`) |
| `networkName` | `string` | Network name (e.g., `ethereum-mainnet`, `solana-devnet`) |
| `signerAddress` | `string` | Owner address that should sign the request |
| `message` | `string` | Raw message/transaction to sign |
| `displayMessage` | `string` | Human-readable summary |
| `metadata.txId` | `string` | Internal transaction UUID |
| `metadata.type` | `string` | Transaction type (`TOKEN_TRANSFER`, `CONTRACT_CALL`, etc.) |
| `metadata.from` | `string` | Sender address |
| `metadata.to` | `string` | Recipient address |
| `metadata.amount` | `string?` | Amount (if applicable) |
| `metadata.symbol` | `string?` | Token symbol (if applicable) |
| `metadata.policyTier` | `string` | Policy tier (`APPROVAL` or `DELAY`) |
| `responseChannel` | `object` | How to send the response back (`push_relay` or `telegram`) |
| `expiresAt` | `string` | ISO 8601 expiration time |

## Signing Flow

```
1. [Daemon]      Creates SignRequest with raw tx message
2a. [Push Relay] Daemon POSTs to Push Relay, converts to FCM/Pushwoosh native push (Scenario 1)
2b. [Telegram]   Bot forwards as message with deep link (Scenario 2)
3. [Wallet SDK]  parseSignRequest() extracts request from universal link
4. [Wallet SDK]  formatDisplayMessage() -> show to user
5. [User]        Reviews and approves/rejects
6. [Wallet App]  Signs raw message with owner private key
7. [Wallet SDK]  buildSignResponse() with signature
8. [Wallet SDK]  sendViaRelay() (Scenario 1) / sendViaTelegram() (Scenario 2)
9. [Daemon]      Receives response via long-polling (Push Relay) or Telegram bot, broadcasts if approved
```

## Security Considerations

### Request Expiration

Always check that the request hasn't expired before displaying to the user. The SDK automatically validates expiration in `parseSignRequest()`, throwing `SignRequestExpiredError` for expired requests.

### Message Verification

The `message` field contains the raw transaction data that will be signed. Wallet apps should:

- Decode and verify the transaction matches the `displayMessage` summary
- For EVM: verify the transaction calldata matches expected function calls
- For Solana: verify the transaction instructions match expected programs

### Replay Prevention

Each `requestId` is a UUID. The daemon rejects duplicate responses for the same requestId. Wallet apps should track processed requestIds to avoid displaying stale requests.

### Channel Security

- **Push Relay:** The relay server sees all sign requests in transit. Deploy it in a trusted environment. The Push Relay API requires `X-API-Key` authentication for device management endpoints
- **Telegram:** Messages pass through Telegram's servers. The base64url-encoded payload doesn't contain private keys but does contain transaction details

## Testing Guide

### Using WAIaaS Testnet

1. Start daemon: `waiaas start`
2. Create testnet wallet: `waiaas quickset --mode testnet`
3. Register owner address in Admin UI
4. Register a wallet app with Push Relay URL in Human Wallet Apps
5. Set an APPROVAL policy with low USD threshold (e.g., $0.01)
6. Use Admin UI "Test Sign" button to send a test sign request
7. Your wallet app should receive the SignRequest via push notification

### Mock Testing

```typescript
import { buildSignResponse, formatDisplayMessage } from '@waiaas/wallet-sdk';
import type { SignRequest } from '@waiaas/wallet-sdk';

const mockRequest: SignRequest = {
  version: '1',
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  caip2ChainId: 'eip155:1',
  networkName: 'ethereum-mainnet',
  signerAddress: '0xOwner...',
  message: '0x...',
  displayMessage: 'Transfer 100 USDC to 0x123...',
  metadata: {
    txId: '660e8400-e29b-41d4-a716-446655440000',
    type: 'TOKEN_TRANSFER',
    from: '0xOwner...',
    to: '0xRecipient...',
    amount: '100',
    symbol: 'USDC',
    policyTier: 'APPROVAL',
  },
  responseChannel: {
    type: 'push_relay',
    pushRelayUrl: 'http://localhost:3200',
    requestId: '550e8400-e29b-41d4-a716-446655440000',
  },
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

console.log(formatDisplayMessage(mockRequest));

const response = buildSignResponse(
  mockRequest.requestId,
  'approve',
  '0xfake-signature',
  '0xOwner...',
);
console.log('Response:', response);
```

## FAQ

**Q: What communication channels does WAIaaS support for signing?**
A: WAIaaS supports two signing channels: **Push Relay** (recommended, native push via Pushwoosh/FCM) and **Telegram** (messenger-based relay). Push Relay is the recommended option for production wallet apps.

**Q: What is Push Relay and when should I use it?**
A: `@waiaas/push-relay` is a bridge server that receives sign requests from the WAIaaS daemon via HTTP POST and forwards them as native push notifications (Pushwoosh/FCM). It also stores signing responses for the daemon to retrieve via long-polling. Use it when your wallet app has native push infrastructure.

**Q: What happens if my wallet app is offline?**
A: Sign requests have an expiration time (configured in WAIaaS daemon). If no response is received before expiry, the transaction is rejected automatically.

**Q: Can multiple wallet apps respond to the same request?**
A: The daemon accepts only the first valid response per requestId. Subsequent responses are rejected.

**Q: How do I handle different chains (EVM vs Solana)?**
A: The `caip2ChainId` field in SignRequest tells you which chain and signing algorithm to use. For EVM (`eip155:*`), use `eth_sign` or equivalent. For Solana (`solana:*`), use `ed25519` signing.

## Related

- [Security Model](/docs/security-model/) - Security architecture that the Wallet SDK implements
- [Agent Self-Setup Guide](/blog/agent-self-setup/) - Using the SDK for automated agent setup
- [Self-Custody for Agents Means Self-Hosting](/blog/self-custody-means-self-hosting/) - Self-custody principles behind the SDK
