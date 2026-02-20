# @waiaas/wallet-sdk

SDK for external wallet apps to integrate with the WAIaaS Signing Protocol. Enables wallet applications (D'CENT, Phantom, MetaMask, etc.) to receive, display, and respond to transaction approval requests from WAIaaS daemon.

## Installation

```bash
npm install @waiaas/wallet-sdk
```

## Quick Start

```typescript
import {
  subscribeToRequests,
  parseSignRequest,
  buildSignResponse,
  formatDisplayMessage,
  sendViaNtfy,
} from '@waiaas/wallet-sdk';

// Subscribe to incoming sign requests via ntfy SSE
const sub = subscribeToRequests('my-topic', async (request) => {
  // Display to user
  console.log(formatDisplayMessage(request));

  // Sign the transaction (your wallet's signing logic)
  const signature = await myWallet.sign(request.message);

  // Build and send response
  const response = buildSignResponse(
    request.requestId,
    'approve',
    signature,
    myWallet.address,
  );

  if (request.responseChannel.type === 'ntfy') {
    await sendViaNtfy(
      response,
      request.responseChannel.responseTopic,
      request.responseChannel.serverUrl,
    );
  }
});

// Stop listening
sub.unsubscribe();
```

## API Reference

### Core Functions

#### `parseSignRequest(url: string): SignRequest | Promise<SignRequest>`

Extract a SignRequest from a universal link URL.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | Universal link URL with query parameters |

**Supported URL modes:**

- **Inline:** `?data={base64url-encoded-SignRequest}` -- synchronous, returns `SignRequest`
- **Remote:** `?requestId={uuid}&topic={topic}&serverUrl={url}` -- asynchronous, fetches from ntfy

```typescript
// Inline mode (sync)
const request = parseSignRequest('https://wallet.app/sign?data=eyJ...');

// Remote mode (async)
const request = await parseSignRequest(
  'https://wallet.app/sign?requestId=550e8400-...&topic=my-topic'
);
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

#### `sendViaNtfy(response, responseTopic, serverUrl?): Promise<void>`

Publish a SignResponse to an ntfy topic.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `response` | `SignResponse` | | Validated response |
| `responseTopic` | `string` | | ntfy topic for responses |
| `serverUrl` | `string` | `'https://ntfy.sh'` | ntfy server URL |

---

#### `subscribeToRequests(topic, callback, serverUrl?): { unsubscribe: () => void }`

Subscribe to incoming sign requests via ntfy SSE stream.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `topic` | `string` | | ntfy topic for requests |
| `callback` | `(request: SignRequest) => void` | | Called for each valid request |
| `serverUrl` | `string` | `'https://ntfy.sh'` | ntfy server URL |

Auto-reconnects up to 3 times with 5-second delays. Expired requests are silently skipped.

---

#### `sendViaTelegram(response, botUsername): string`

Generate a Telegram deeplink URL for sending a SignResponse.

| Parameter | Type | Description |
|-----------|------|-------------|
| `response` | `SignResponse` | Validated response |
| `botUsername` | `string` | Telegram bot username (without `@`) |

Returns a `https://t.me/{botUsername}?text=...` URL.

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

### ntfy (Direct Push)

No messenger required. Wallet app subscribes to an ntfy topic for requests and publishes responses to a separate topic.

```
WAIaaS Daemon → ntfy server → Wallet App → ntfy server → WAIaaS Daemon
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

Or remote fetch format:

```
https://{wallet-host}/sign?requestId={uuid}&topic={topic}&serverUrl={ntfy-server}
```

## Integration Guide

For a complete integration walkthrough including architecture diagrams, security considerations, and testing guide, see the [Wallet SDK Integration Guide](https://github.com/minhoyooDEV/WAIaaS/blob/main/docs/wallet-sdk-integration.md).

## License

[MIT](../../LICENSE)
