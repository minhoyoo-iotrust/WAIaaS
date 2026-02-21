# Wallet SDK Integration Guide

This guide walks through integrating an external wallet application with the WAIaaS Signing Protocol using `@waiaas/wallet-sdk`.

## Architecture Overview

```
                          Scenario 1: ntfy Direct
+------------------+  ─────────────────────────>  +------------------+
|  WAIaaS Daemon   |  <─────────────────────────  |   Wallet App     |
|  (manages keys)  |                              |  (signs txs)     |
|                  |      Scenario 2: Telegram    |                  |
|  Policy Engine   |  ────────> Telegram Bot ──>  |  @waiaas/        |
|  Kill Switch     |  <─────── Telegram Bot <──   |  wallet-sdk      |
|                  |                              |                  |
|                  |      Scenario 3: Push Relay  |                  |
|                  |  ──> Push Relay ──> FCM ──>  |  (native push)   |
|                  |  <─────────────────────────  |                  |
+------------------+                              +------------------+
```

When a transaction requires owner approval (APPROVAL or DELAY policy tier), the WAIaaS daemon:

1. Creates a **SignRequest** containing the transaction details and raw message to sign
2. Sends it to the owner's wallet via **ntfy** push, **Telegram** bot, or **Push Relay** (Pushwoosh/FCM native push)
3. Waits for a **SignResponse** (approve with signature, or reject)
4. If approved, broadcasts the signed transaction to the blockchain

The wallet app uses `@waiaas/wallet-sdk` to parse requests, display them to the user, collect approval/rejection, and send back the response.

### Choosing an Integration Option

| Option | Server Required | Pros | Best For |
|--------|----------------|------|----------|
| **Scenario 1:** ntfy Direct | No | Simplest setup, no infrastructure | Server-side bots, hardware wallet bridges |
| **Scenario 2:** Telegram Relay | No | Familiar UX, universal links | Mobile apps using Telegram as notification channel |
| **Scenario 3:** Push Relay | Push Relay server | Reuse existing push infra (Pushwoosh/FCM) | D'CENT and other wallet apps with native push |

## Prerequisites

- WAIaaS daemon running with owner address registered
- ntfy topic or Telegram bot configured for the signing channel
- Node.js >= 18.0.0

### WAIaaS Daemon Setup

```bash
npm install -g @waiaas/cli
waiaas init && waiaas start
```

Then in the Admin UI (`http://127.0.0.1:3100/admin`):

1. **Register Owner Address** -- Wallets > select wallet > Owner tab > set the wallet address that will sign approval transactions
2. **Configure Notification Channel** -- Notifications > Settings tab > enable ntfy or Telegram
3. **Set Approval Policy** -- Policies > create a policy with APPROVAL tier for high-value transactions

## Integration Scenarios

### Scenario 1: ntfy Direct Push (No Messenger)

Best for server-side wallet apps, bots, or hardware wallet bridges.

```typescript
import {
  subscribeToRequests,
  buildSignResponse,
  sendViaNtfy,
  formatDisplayMessage,
} from '@waiaas/wallet-sdk';

// 1. Subscribe to incoming sign requests
const sub = subscribeToRequests('waiaas-sign-requests', async (request) => {
  // 2. Display transaction details to the user
  console.log(formatDisplayMessage(request));

  // 3. Get user approval (your UI logic)
  const approved = await promptUser(request);

  if (approved) {
    // 4. Sign the raw message with owner's private key
    const signature = await ownerWallet.sign(request.message);

    // 5. Build and send approval response
    const response = buildSignResponse(
      request.requestId,
      'approve',
      signature,
      ownerWallet.address,
    );
    await sendViaNtfy(response, request.responseChannel.responseTopic);
  } else {
    // 5. Build and send rejection response
    const response = buildSignResponse(
      request.requestId,
      'reject',
      undefined,
      ownerWallet.address,
    );
    await sendViaNtfy(response, request.responseChannel.responseTopic);
  }
});

// Stop listening when done
sub.unsubscribe();
```

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

### Scenario 3: Push Relay Server (Native Push)

Best for wallet apps with existing push notification infrastructure (Pushwoosh, FCM). The `@waiaas/push-relay` server subscribes to ntfy topics on behalf of wallet apps and forwards sign requests as native push notifications.

#### Push Relay Setup

```bash
# Install and run push relay
npm install -g @waiaas/push-relay
# Or use Docker
docker run -d -p 3200:3200 -v /data:/data waiaas/push-relay
```

Push Relay `config.toml`:

```toml
[relay]
ntfy_server = "https://ntfy.sh"
sign_topic_prefix = "waiaas-sign"
notify_topic_prefix = "waiaas-notify"
wallet_names = ["my-wallet"]

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

#### Device Registration

Wallet apps register their push token with the Push Relay server:

```typescript
// On app startup, register device for push notifications
await fetch('https://your-push-relay:3200/devices', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-secret-api-key',
  },
  body: JSON.stringify({
    token: devicePushToken,      // FCM/Pushwoosh device token
    walletName: 'my-wallet',     // Must match relay config wallet_names
    platform: 'android',         // "android" | "ios"
  }),
});
```

#### Receiving Sign Requests via Native Push

```typescript
import {
  parseSignRequest,
  buildSignResponse,
  sendViaNtfy,
  formatDisplayMessage,
} from '@waiaas/wallet-sdk';

// 1. Handle incoming native push notification
onPushReceived((push) => {
  const { signRequest, responseTopic, ntfyServer } = JSON.parse(push.data.payload);

  // 2. Parse and validate the sign request
  const request = parseSignRequest(signRequest);

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

  // 5. Send response directly to ntfy (bypasses Push Relay)
  await sendViaNtfy(response, request.responseChannel.responseTopic);
}
```

> **Note:** Push Relay is one-directional (daemon → wallet). Responses always go back directly via ntfy from the wallet app to the daemon.

For more details, see the [`@waiaas/push-relay` package on npm](https://www.npmjs.com/package/@waiaas/push-relay).

## SignRequest Structure

Each SignRequest contains:

| Field | Type | Description |
|-------|------|-------------|
| `version` | `'1'` | Protocol version |
| `requestId` | `string` | UUID identifying this request |
| `chain` | `'solana' \| 'evm'` | Blockchain family |
| `network` | `string` | Network name (e.g., `'ethereum'`, `'solana'`) |
| `message` | `string` | Raw message/transaction to sign |
| `displayMessage` | `string` | Human-readable summary |
| `metadata.txId` | `string` | Internal transaction UUID |
| `metadata.type` | `string` | Transaction type (`TOKEN_TRANSFER`, `CONTRACT_CALL`, etc.) |
| `metadata.from` | `string` | Sender address |
| `metadata.to` | `string` | Recipient address |
| `metadata.amount` | `string?` | Amount (if applicable) |
| `metadata.symbol` | `string?` | Token symbol (if applicable) |
| `metadata.policyTier` | `string` | Policy tier (`APPROVAL` or `DELAY`) |
| `responseChannel` | `object` | How to send the response back |
| `expiresAt` | `string` | ISO 8601 expiration time |

## Signing Flow

```
1. [Daemon]      Creates SignRequest with raw tx message
2. [Daemon]      Sends via ntfy topic (all scenarios use ntfy as transport)
3a. [ntfy]       Direct SSE push to wallet app (Scenario 1)
3b. [Telegram]   Bot forwards as message with deep link (Scenario 2)
3c. [Push Relay] Subscribes to ntfy, converts to Pushwoosh/FCM native push (Scenario 3)
4. [Wallet SDK]  parseSignRequest() or subscribeToRequests()
5. [Wallet SDK]  formatDisplayMessage() -> show to user
6. [User]        Reviews and approves/rejects
7. [Wallet App]  Signs raw message with owner private key
8. [Wallet SDK]  buildSignResponse() with signature
9. [Wallet SDK]  sendViaNtfy() or sendViaTelegram() -> response always via ntfy
10. [Daemon]     Receives response, broadcasts if approved
```

## Security Considerations

### Request Expiration

Always check that the request hasn't expired before displaying to the user. The SDK automatically validates expiration in `parseSignRequest()` and `subscribeToRequests()`, throwing `SignRequestExpiredError` for expired requests.

### Message Verification

The `message` field contains the raw transaction data that will be signed. Wallet apps should:

- Decode and verify the transaction matches the `displayMessage` summary
- For EVM: verify the transaction calldata matches expected function calls
- For Solana: verify the transaction instructions match expected programs

### Replay Prevention

Each `requestId` is a UUID. The daemon rejects duplicate responses for the same requestId. Wallet apps should track processed requestIds to avoid displaying stale requests.

### Channel Security

- **ntfy:** Messages are transmitted in plaintext over HTTPS. For production, consider running a self-hosted ntfy server
- **Telegram:** Messages pass through Telegram's servers. The base64url-encoded payload doesn't contain private keys but does contain transaction details
- **Push Relay:** The relay server sees all sign requests in transit. Deploy it in a trusted environment. The Push Relay API requires `X-API-Key` authentication for device management endpoints

## Testing Guide

### Using WAIaaS Testnet

1. Start daemon: `waiaas start`
2. Create testnet wallet: `waiaas quickset --mode testnet`
3. Register owner address in Admin UI
4. Configure ntfy channel with a test topic
5. Set an APPROVAL policy with low USD threshold (e.g., $0.01)
6. Trigger a transaction via MCP or REST API
7. Your wallet app should receive the SignRequest

### Mock Testing

```typescript
import { buildSignResponse, formatDisplayMessage } from '@waiaas/wallet-sdk';
import type { SignRequest } from '@waiaas/wallet-sdk';

const mockRequest: SignRequest = {
  version: '1',
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  chain: 'evm',
  network: 'ethereum',
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
    type: 'ntfy',
    responseTopic: 'test-responses',
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

**Q: Can I use this without ntfy or Telegram?**
A: The SDK requires a communication channel. ntfy is the simplest option (free, open-source). You can also use Push Relay to deliver sign requests via your existing push infrastructure (Pushwoosh/FCM).

**Q: What is Push Relay and when should I use it?**
A: `@waiaas/push-relay` is a bridge server that subscribes to WAIaaS ntfy topics and forwards sign requests as native push notifications (Pushwoosh/FCM). Use it when your wallet app already has native push infrastructure and you want to avoid integrating ntfy directly.

**Q: What happens if my wallet app is offline?**
A: Sign requests have an expiration time (configured in WAIaaS daemon). If no response is received before expiry, the transaction is rejected automatically.

**Q: Can multiple wallet apps respond to the same request?**
A: The daemon accepts only the first valid response per requestId. Subsequent responses are rejected.

**Q: How do I handle different chains (EVM vs Solana)?**
A: The `chain` field in SignRequest tells you which signing algorithm to use. For EVM, use `eth_sign` or equivalent. For Solana, use `ed25519` signing.
