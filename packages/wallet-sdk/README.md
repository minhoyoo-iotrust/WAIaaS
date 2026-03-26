# @waiaas/wallet-sdk

SDK for external wallet apps to integrate with the WAIaaS Signing Protocol. Enables wallet applications (D'CENT, Phantom, MetaMask, etc.) to receive, display, and respond to transaction approval requests from WAIaaS daemon.

## Installation

```bash
npm install @waiaas/wallet-sdk
```

## Quick Start

```typescript
import {
  parseSignRequest,
  buildSignResponse,
  formatDisplayMessage,
  sendViaRelay,
} from '@waiaas/wallet-sdk';

// Parse a sign request from a universal link
const request = parseSignRequest('dcent://sign?data=eyJ...');

// Display to user
console.log(formatDisplayMessage(request));

// Sign the transaction (your wallet's signing logic)
const signature = await myWallet.sign(request.message);

// Build and send response via Push Relay
const response = buildSignResponse(
  request.requestId,
  'approve',
  signature,
  myWallet.address,
);

if (request.responseChannel.type === 'push_relay') {
  await sendViaRelay(response, request.responseChannel.pushRelayUrl);
}
```

## API Reference

### Core Functions

#### `parseSignRequest(url: string): SignRequest`

Extract a SignRequest from a universal link URL containing a `?data=` parameter with base64url-encoded SignRequest.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | Universal link URL with `?data=` query parameter |

```typescript
const request = parseSignRequest('https://wallet.app/sign?data=eyJ...');
```

**Throws:** `InvalidSignRequestUrlError`, `SignRequestExpiredError`, `SignRequestValidationError`

---

#### `buildSignResponse(requestId, action, signature, signerAddress): SignResponse`

Create a validated SignResponse.

| Parameter | Type | Description |
|-----------|------|-------------|
| `requestId` | `string` | UUID from the original SignRequest |
| `action` | `'approve' \| 'reject'` | User's decision |
| `signature` | `string \| undefined` | Hex-encoded signature (required for `'approve'`) |
| `signerAddress` | `string` | Wallet address of the signer |

```typescript
// Approve
const response = buildSignResponse(requestId, 'approve', '0xabcd...', address);

// Reject
const response = buildSignResponse(requestId, 'reject', undefined, address);
```

---

#### `formatDisplayMessage(request: SignRequest): string`

Create a human-readable transaction summary for display to the user.

```typescript
const text = formatDisplayMessage(request);
// Transaction Approval Request
//
// Type: TOKEN_TRANSFER
// From: 0xAbcDef...
// To: 0x123456...
// Amount: 100 USDC
// Network: ethereum
// Policy: APPROVAL
// Expires: 2026-02-20T10:30:00.000Z
```

### Channel Functions

#### `sendViaRelay(response, pushRelayUrl): Promise<void>`

Send a SignResponse via Push Relay server.

| Parameter | Type | Description |
|-----------|------|-------------|
| `response` | `SignResponse` | Validated response |
| `pushRelayUrl` | `string` | Push Relay server URL |

---

#### `sendViaTelegram(response, botUsername): string`

Generate a Telegram deeplink URL for sending a SignResponse.

| Parameter | Type | Description |
|-----------|------|-------------|
| `response` | `SignResponse` | Validated response |
| `botUsername` | `string` | Telegram bot username (without `@`) |

Returns a `https://t.me/{botUsername}?text=...` URL.

---

#### `registerDevice(pushRelayUrl, apiKey, opts): Promise<{ subscriptionToken: string }>`

Register a device with the Push Relay server for native push delivery.

| Parameter | Type | Description |
|-----------|------|-------------|
| `pushRelayUrl` | `string` | Push Relay server URL |
| `apiKey` | `string` | Push Relay API key |
| `opts.walletName` | `string` | Wallet name (must match relay config) |
| `opts.pushToken` | `string` | FCM/Pushwoosh device token |
| `opts.platform` | `'ios' \| 'android'` | Device platform |

---

#### `unregisterDevice(pushRelayUrl, apiKey, pushToken): Promise<void>`

Unregister a device from the Push Relay server.

| Parameter | Type | Description |
|-----------|------|-------------|
| `pushRelayUrl` | `string` | Push Relay server URL |
| `apiKey` | `string` | Push Relay API key |
| `pushToken` | `string` | Device push token to unregister |

---

#### `getSubscriptionToken(pushRelayUrl, apiKey, pushToken): Promise<string | null>`

Retrieve the subscription token for a registered device. Returns `null` if not found.

| Parameter | Type | Description |
|-----------|------|-------------|
| `pushRelayUrl` | `string` | Push Relay server URL |
| `apiKey` | `string` | Push Relay API key |
| `pushToken` | `string` | Device push token to look up |

### Error Classes

| Error | When Thrown |
|-------|------------|
| `InvalidSignRequestUrlError` | URL missing required parameters |
| `SignRequestExpiredError` | Request has expired (`expiresAt < now`) |
| `SignRequestValidationError` | Decoded data fails schema validation |

### Types

All types are re-exported from `@waiaas/core`:

```typescript
import type { SignRequest, SignResponse, WalletLinkConfig } from '@waiaas/wallet-sdk';
```

## Channels

WAIaaS supports two response channels:

### Push Relay (Native Push)

Uses `@waiaas/push-relay` as a bridge. Wallet apps register via `registerDevice()`, receive sign requests as native push notifications, and send responses back via `sendViaRelay()`.

```
WAIaaS Daemon → Push Relay → FCM/Pushwoosh → Wallet App → Push Relay → WAIaaS Daemon
```

### Telegram (Messenger Relay)

Uses a Telegram bot as relay. Wallet app receives requests via Telegram and sends responses as deeplinks.

```
WAIaaS Daemon → Telegram Bot → User → Wallet App → Telegram Bot → WAIaaS Daemon
```

## Universal Link Format

Wallet apps must handle URLs in this format:

```
https://{wallet-host}/sign?data={base64url-encoded-SignRequest}
```

## Integration Guide

For a complete integration walkthrough including architecture diagrams, security considerations, and testing guide, see the [Wallet SDK Integration Guide](https://github.com/minhoyooDEV/WAIaaS/blob/main/docs/wallet-sdk-integration.md).

## License

[MIT](../../LICENSE)
