# Phase 131: SSRF Guard + x402 Handler + Payment Signing - Research

**Researched:** 2026-02-15
**Domain:** SSRF 방어 (DNS resolve + IP 검증), x402 HTTP 402 핸들링, EIP-3009 / Solana TransferChecked 결제 서명
**Confidence:** HIGH

## Summary

Phase 131은 x402 클라이언트의 핵심 비즈니스 로직 3개를 구현하는 단계이다: (1) SSRF 가드 -- DNS 사전 해석 + 사설 IP 차단 + 리다이렉트 hop별 재검증, (2) x402 핸들러 -- HTTP 402 응답 파싱 + PaymentRequirements에서 지원 가능한 (scheme, network) 선택 + 결제 서명 후 재요청, (3) 결제 서명 생성 -- EVM EIP-3009 transferWithAuthorization (viem signTypedData) + Solana SPL TransferChecked 부분 서명 (@solana/kit signBytes + noopSigner feePayer).

15개 요구사항(X4SEC-01~05, X4HAND-01~06, X4SIGN-01~04)은 3개 플랜으로 나뉜다. 모든 구현은 기존 스택(viem 2.x, @solana/kit 6.x, @x402/core 2.3.1, node:dns, node:net, native fetch)만 사용하며, 신규 npm 의존성 추가가 없다. Phase 130에서 완성된 x402 타입 시스템(Zod 스키마, CAIP-2 매핑, DB v12)과 에러 코드 8개를 기반으로 한다.

핵심 보안 원칙: x402 핸들러는 데몬을 HTTP 프록시로 전환하므로, SSRF가 가장 큰 공격 표면이다. DNS 리바인딩(TOCTOU), IPv4-mapped IPv6, 옥탈/헥스 IP 인코딩, userinfo@ URL 속임, 리다이렉트 탈출 등 다양한 바이패스 벡터를 포괄적으로 방어해야 한다.

**Primary recommendation:** SSRF 가드를 x402 핸들러보다 먼저 구현하고 철저히 테스트한다. 결제 서명은 기존 어댑터 패턴(privateKeyToAccount, signBytes)을 직접 사용하되 IChainAdapter를 경유하지 않는다. x402 핸들러는 기존 6-stage 파이프라인을 확장하지 않는 독립 파이프라인이다.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:dns/promises` | Node.js 22 내장 | DNS 사전 해석 (`lookup({ all: true })`) | SSRF 방어의 핵심. DNS resolve 결과를 직접 검증 |
| `node:net` | Node.js 22 내장 | `isIP()` -- IPv4/IPv6 판별 | IP 주소 형식 검증 |
| `viem` | ^2.21.0 (기존) | `privateKeyToAccount` + `account.signTypedData` -- EIP-3009 서명 | EvmAdapter에서 이미 사용. signTypedData는 LocalAccount 내장 메서드 |
| `@solana/kit` | ^6.0.1 (기존) | `signBytes`, `createNoopSigner`, `compileTransaction`, `createKeyPairFromBytes` | SolanaAdapter에서 이미 사용. 부분 서명 패턴 검증됨 |
| `@x402/core` | ^2.3.1 (Phase 130 추가) | `PaymentRequiredV2Schema`, `PaymentPayloadV2Schema` -- Zod 스키마 | x402 프로토콜 타입 SSoT. schemas/types/http subpath exports |
| `@x402/core/http` | ^2.3.1 | `encodePaymentSignatureHeader`, `decodePaymentRequiredHeader` | base64(JSON) 인코딩/디코딩. 자체 구현 불필요 |
| native `fetch` | Node.js 22 내장 (undici) | 외부 HTTP 요청 | zero-dep 철학. `redirect: 'manual'`로 리다이렉트 수동 처리 |
| `crypto` | Node.js 22 내장 | `crypto.randomBytes(32)` -- EIP-3009 nonce 생성 | CSPRNG 기반 32-byte 랜덤 nonce |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@solana-program/token` | 기존 | `getTransferCheckedInstruction`, `findAssociatedTokenPda` | Solana x402 결제 서명 시 SPL instruction 생성 |
| `vitest` | 기존 | 단위 테스트 | 모든 모듈의 테스트 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:dns` 자체 구현 | `request-filtering-agent` | http.Agent 기반이라 native fetch와 호환 불가 |
| `node:dns` 자체 구현 | `private-ip` | multicast SSRF 바이패스 CVE 존재 |
| `node:dns` 자체 구현 | `agent-fetch` (Rust) | 외부 의존성 추가. native 모듈 빌드 필요. WAIaaS zero-dep 철학 불일치 |
| 자체 base64 인코딩 | `@x402/core/http` 함수 | @x402/core/http가 이미 `encodePaymentSignatureHeader` 제공. 사용 권장 |
| `@x402/evm` 패키지 | viem 직접 사용 | @x402/evm은 외부 wallet용 인터페이스. WAIaaS는 로컬 키로 직접 서명. viem 이미 설치 |
| `@x402/svm` 패키지 | @solana/kit 직접 사용 | @x402/svm은 @solana/kit ^5.1.0 (WAIaaS는 6.x). 버전 충돌 위험 |

**Installation:**

```bash
# 신규 의존성 없음. Phase 130에서 @x402/core 이미 추가
# @x402/core/http subpath는 기존 의존성에서 바로 import 가능
```

## Architecture Patterns

### Recommended Project Structure

```
packages/daemon/src/services/
  x402/
    ssrf-guard.ts          # DNS resolve + 사설 IP 차단 + URL 정규화
    x402-handler.ts        # 402 응답 파싱 + (scheme, network) 선택 + 재요청 오케스트레이션
    payment-signer.ts      # 체인별 결제 서명 (EVM EIP-3009 + Solana TransferChecked)
    __tests__/
      ssrf-guard.test.ts       # SSRF 바이패스 벡터 전면 테스트
      x402-handler.test.ts     # 402 파싱 + scheme 선택 + 재시도 로직
      payment-signer.test.ts   # EIP-3009 서명 구조 + Solana 부분 서명 검증
```

### Pattern 1: SSRF Guard -- DNS Resolve + IP Validation

**What:** 에이전트가 제공한 URL의 호스트를 DNS로 해석하고, 해석된 모든 IP 주소가 공용 IP인지 검증한 후, 검증된 IP로만 연결을 허용한다.

**When to use:** `x402-handler.ts`에서 외부 HTTP 요청을 보내기 전 반드시 호출.

**Defense layers:**
1. URL 정규화: `new URL()` 한 번만 파싱, hostname lowercase, trailing dot 제거, userinfo@ 거부, 포트 검증
2. 프로토콜 검증: HTTPS만 허용 (HTTP 거부)
3. IP 직접 입력 차단: hostname이 IP인 경우 사설 IP 즉시 거부
4. DNS 해석: `dns.lookup(hostname, { all: true })` -- A + AAAA 레코드 전체 검증
5. 사설 IP 차단: RFC 5735/6890 전체 범위 + IPv4-mapped IPv6 + 옥탈/헥스 인코딩
6. 리다이렉트 재검증: `redirect: 'manual'` + 매 hop마다 1-5 반복 (최대 3회)

**Example:**

```typescript
// packages/daemon/src/services/x402/ssrf-guard.ts
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Validate URL safety against SSRF attacks.
 * Performs DNS resolution and validates all resolved IPs are public.
 *
 * @throws WAIaaSError('X402_SSRF_BLOCKED') if URL targets private/reserved IP
 */
export async function validateUrlSafety(urlString: string): Promise<URL> {
  const url = normalizeUrl(urlString);

  // HTTPS 강제
  if (url.protocol !== 'https:') {
    throw new WAIaaSError('X402_SSRF_BLOCKED', {
      message: `Only HTTPS URLs are allowed, got ${url.protocol}`,
    });
  }

  // userinfo@ 거부
  if (url.username || url.password) {
    throw new WAIaaSError('X402_SSRF_BLOCKED', {
      message: 'URLs with userinfo (@) are not allowed',
    });
  }

  // 포트 검증 (443만 허용, 빈 포트 = 기본 443)
  if (url.port && url.port !== '443') {
    throw new WAIaaSError('X402_SSRF_BLOCKED', {
      message: `Non-standard port ${url.port} is not allowed`,
    });
  }

  const hostname = url.hostname;

  // hostname이 직접 IP인 경우
  if (isIP(hostname)) {
    assertPublicIP(hostname);
    return url;
  }

  // DNS 해석 -- A + AAAA 전체
  const addresses = await lookup(hostname, { all: true });
  for (const { address } of addresses) {
    assertPublicIP(address);
  }

  return url;
}

function normalizeUrl(urlString: string): URL {
  const url = new URL(urlString);
  // trailing dot 제거 (FQDN 정규화)
  if (url.hostname.endsWith('.')) {
    url.hostname = url.hostname.slice(0, -1);
  }
  return url;
}

/**
 * Assert that an IP address is public (not private/reserved).
 * Blocks: 10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, 0.x,
 *         ::1, ::, fe80:, fc00:, fd00:, ff00:,
 *         ::ffff:private_ipv4 (IPv4-mapped IPv6)
 */
function assertPublicIP(ip: string): void {
  // IPv4-mapped IPv6 정규화: ::ffff:A.B.C.D -> A.B.C.D
  const normalized = normalizeIPv6Mapped(ip);

  if (isPrivateIP(normalized)) {
    throw new WAIaaSError('X402_SSRF_BLOCKED', {
      message: `Resolved IP ${ip} is private/reserved`,
    });
  }
}
```

### Pattern 2: x402 Handler -- 402 Parsing + Scheme Selection + Retry

**What:** 외부 HTTP 요청 -> 402 파싱 -> 결제 서명 -> 재요청의 전체 흐름을 오케스트레이션한다. 기존 6-stage 파이프라인을 확장하지 않는 독립 파이프라인.

**When to use:** `POST /v1/x402/fetch` 엔드포인트에서 호출.

**Example:**

```typescript
// packages/daemon/src/services/x402/x402-handler.ts
import { PaymentRequiredV2Schema, PaymentPayloadV2Schema } from '@x402/core/schemas';
import { encodePaymentSignatureHeader } from '@x402/core/http';
import type { PaymentRequired, PaymentRequirements } from '@x402/core/types';
import { resolveX402Network, parseCaip2 } from '@waiaas/core';

export async function handleX402Fetch(
  request: X402FetchRequest,
  deps: X402HandlerDeps,
): Promise<X402FetchResponse> {
  // 1. SSRF 가드
  const url = await validateUrlSafety(request.url);

  // 2. 첫 번째 외부 요청 (redirect: 'manual')
  const firstResponse = await safeFetch(url, request.method, request.headers, request.body);

  // 3. 비-402 응답: 패스스루
  if (firstResponse.status !== 402) {
    return buildPassthroughResponse(firstResponse);
  }

  // 4. 402 응답 파싱
  const paymentRequired = await parse402Response(firstResponse);

  // 5. (scheme, network) 선택 -- WAIaaS가 지원하는 조합 필터 + 최저가 선택
  const selected = selectPaymentRequirement(paymentRequired.accepts, deps.supportedNetworks);

  // 6. 결제 서명 생성 (payment-signer.ts에 위임)
  const paymentPayload = await deps.paymentSigner.sign(selected, deps.walletId, deps.masterPassword);

  // 7. 재요청 (PAYMENT-SIGNATURE 헤더 포함, 1회만)
  const encodedHeader = encodePaymentSignatureHeader(paymentPayload);
  const retryHeaders = { ...request.headers, 'PAYMENT-SIGNATURE': encodedHeader };
  const retryResponse = await safeFetch(url, request.method, retryHeaders, request.body);

  // 8. 재요청 결과 처리
  if (retryResponse.status === 402) {
    throw new WAIaaSError('X402_PAYMENT_REJECTED');
  }
  if (!retryResponse.ok) {
    throw new WAIaaSError('X402_SERVER_ERROR');
  }

  return buildPaymentResponse(retryResponse, selected);
}
```

**402 응답 파싱 방법:**

```typescript
async function parse402Response(response: Response): Promise<PaymentRequired> {
  // v2: PAYMENT-REQUIRED 헤더 (base64 인코딩)
  const headerValue = response.headers.get('PAYMENT-REQUIRED');
  if (headerValue) {
    const decoded = decodePaymentRequiredHeader(headerValue);
    return PaymentRequiredV2Schema.parse(decoded);
  }

  // fallback: JSON body 파싱
  const body = await response.json();
  return PaymentRequiredV2Schema.parse(body);
}
```

**accepts 배열에서 (scheme, network) 선택:**

```typescript
function selectPaymentRequirement(
  accepts: PaymentRequirements[],
  supportedNetworks: Set<string>,
): PaymentRequirements {
  // 1. WAIaaS가 지원하는 (scheme, network) 필터
  const supported = accepts.filter((req) => {
    if (req.scheme !== 'exact') return false;
    try {
      const { chain } = resolveX402Network(req.network);
      return supportedNetworks.has(req.network);
    } catch {
      return false;
    }
  });

  if (supported.length === 0) {
    throw new WAIaaSError('X402_UNSUPPORTED_SCHEME');
  }

  // 2. 최저가 선택 (동일 금액이면 첫 번째)
  return supported.reduce((min, req) =>
    BigInt(req.amount) < BigInt(min.amount) ? req : min,
  );
}
```

### Pattern 3: Payment Signer -- Strategy Pattern by Chain

**What:** (scheme, chain) 조합에 따라 적절한 서명 전략을 선택한다. IChainAdapter를 경유하지 않고 viem / @solana/kit을 직접 사용한다.

**When to use:** x402-handler에서 결제 서명이 필요할 때.

**EVM EIP-3009 서명:**

```typescript
import { privateKeyToAccount } from 'viem/accounts';
import { randomBytes } from 'node:crypto';
import type { Hex } from 'viem';

async function signEip3009(
  requirements: PaymentRequirements,
  privateKey: Uint8Array,
  walletAddress: string,
): Promise<Record<string, unknown>> {
  const { reference: chainIdStr } = parseCaip2(requirements.network);
  const chainId = parseInt(chainIdStr, 10);

  // EIP-712 domain separator (USDC v2 기준)
  const domain = getUsdcDomain(requirements.network, requirements.asset);

  // 32-byte 랜덤 nonce
  const nonce = `0x${randomBytes(32).toString('hex')}` as Hex;

  // validBefore = now + 5분 (보안 모델에서 최소화)
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);

  const privateKeyHex = `0x${Buffer.from(privateKey).toString('hex')}` as Hex;
  const account = privateKeyToAccount(privateKeyHex);

  // EIP-712 signTypedData
  const signature = await account.signTypedData({
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: BigInt(chainId),
      verifyingContract: requirements.asset as Hex,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from: walletAddress as Hex,
      to: requirements.payTo as Hex,
      value: BigInt(requirements.amount),
      validAfter: 0n,
      validBefore,
      nonce,
    },
  });

  // PaymentPayload 구성
  return {
    x402Version: 2,
    resource: { url: '' },  // handler가 채움
    accepted: requirements,
    payload: {
      signature,
      authorization: {
        from: walletAddress,
        to: requirements.payTo,
        value: requirements.amount,
        validAfter: '0',
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  };
}
```

**Solana TransferChecked 부분 서명:**

```typescript
import {
  createTransactionMessage,
  setTransactionMessageFeePayer,
  appendTransactionMessageInstruction,
  setTransactionMessageLifetimeUsingBlockhash,
  compileTransaction,
  getTransactionEncoder,
  signBytes,
  createKeyPairFromBytes,
  createKeyPairFromPrivateKeyBytes,
  getAddressFromPublicKey,
  address,
  createNoopSigner,
  pipe,
} from '@solana/kit';
import { getTransferCheckedInstruction, findAssociatedTokenPda } from '@solana-program/token';

async function signSolanaTransferChecked(
  requirements: PaymentRequirements,
  privateKey: Uint8Array,
  walletAddress: string,
  rpc: SolanaRpc,
): Promise<Record<string, unknown>> {
  // feePayer = facilitator (PaymentRequirements.extra.feePayer)
  const feePayerAddress = address(requirements.extra?.feePayer as string);
  const feePayerSigner = createNoopSigner(feePayerAddress);

  // 월렛 키페어
  const keyPair = privateKey.length === 64
    ? await createKeyPairFromBytes(privateKey)
    : await createKeyPairFromPrivateKeyBytes(privateKey.slice(0, 32));
  const walletAddr = await getAddressFromPublicKey(keyPair.publicKey);

  // blockhash
  const { value: blockhashInfo } = await rpc.getLatestBlockhash().send();

  // source ATA + destination ATA
  const mint = address(requirements.asset);
  // ... PDA derivation ...

  // TransferChecked instruction
  const transferIx = getTransferCheckedInstruction({
    source: sourceAta,
    mint,
    destination: destAta,
    authority: walletAddr,
    amount: BigInt(requirements.amount),
    decimals: tokenDecimals,
  });

  // 트랜잭션 빌드
  const txMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (msg) => setTransactionMessageFeePayer(feePayerAddress, msg),
    (msg) => setTransactionMessageLifetimeUsingBlockhash(
      { blockhash: blockhashInfo.blockhash, lastValidBlockHeight: blockhashInfo.lastValidBlockHeight },
      msg,
    ),
    (msg) => appendTransactionMessageInstruction(transferIx, msg),
  );

  // 컴파일 + 부분 서명 (월렛 서명만)
  const compiled = compileTransaction(txMessage);
  const signature = await signBytes(keyPair.privateKey, compiled.messageBytes);

  const partiallySignedTx = {
    ...compiled,
    signatures: { ...compiled.signatures, [walletAddr]: signature },
  };

  // base64 인코딩
  const txEncoder = getTransactionEncoder();
  const serialized = new Uint8Array(txEncoder.encode(partiallySignedTx));
  const base64Tx = Buffer.from(serialized).toString('base64');

  return {
    x402Version: 2,
    resource: { url: '' },
    accepted: requirements,
    payload: { transaction: base64Tx },
  };
}
```

### Pattern 4: Key Management -- Decrypt -> Sign -> Release (finally block)

**What:** 키스토어에서 개인키를 복호화하고, 서명을 수행한 후, finally 블록에서 반드시 sodium_memzero로 해제한다.

**When to use:** 모든 결제 서명 생성 시.

**Example (기존 stages.ts Stage 5c, sign-only.ts Step 9과 동일 패턴):**

```typescript
// payment-signer.ts 내부
let privateKey: Uint8Array | null = null;
try {
  privateKey = await keyStore.decryptPrivateKey(walletId, masterPassword);
  const payload = await signStrategy(requirements, privateKey, walletAddress, rpc);
  return payload;
} finally {
  if (privateKey) {
    keyStore.releaseKey(privateKey);
  }
}
```

### Anti-Patterns to Avoid

- **IChainAdapter를 통한 x402 결제 서명:** EIP-3009는 트랜잭션이 아닌 EIP-712 typed data 서명. Solana 부분 서명은 feePayer가 다른 특수 트랜잭션. 기존 signTransaction 인터페이스에 맞지 않음. payment-signer.ts에서 viem/@solana/kit을 직접 사용한다.
- **기존 6-stage 파이프라인 확장:** x402는 독립 파이프라인. 기존 stages.ts를 수정하지 않는다.
- **DNS resolve 없이 IP 블록리스트만 사용:** DNS 리바인딩 공격 방어 불가. 반드시 DNS resolve + IP 검증을 수행.
- **`redirect: 'follow'` 사용:** 리다이렉트를 자동 추적하면 SSRF 바이패스 가능. 반드시 `redirect: 'manual'`로 수동 처리.
- **결제 서명 후 자동 재시도:** 402 재반환 시 새 nonce로 재서명하면 이중 결제 위험. 1회만 재시도.
- **@x402/core/http의 `encodePaymentSignatureHeader` 대신 자체 base64 구현:** 이미 검증된 함수가 제공됨.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| x402 PaymentRequired 파싱 | 자체 JSON 파서 | `@x402/core/schemas` PaymentRequiredV2Schema.parse() | Zod 런타임 검증 + 타입 추론 |
| PAYMENT-SIGNATURE 헤더 인코딩 | 자체 base64 인코딩 | `@x402/core/http` encodePaymentSignatureHeader() | JSON.stringify + base64 + 호환 보장 |
| PAYMENT-REQUIRED 헤더 디코딩 | 자체 디코딩 | `@x402/core/http` decodePaymentRequiredHeader() | base64 + JSON.parse + 검증 |
| EIP-712 서명 생성 | 자체 hash + sign | viem `account.signTypedData()` | EIP-712 구조 해싱의 복잡성. viem이 모든 edge case 처리 |
| Solana 트랜잭션 인코딩 | 자체 직렬화 | @solana/kit `getTransactionEncoder().encode()` | 트랜잭션 wire format 정확성 보장 |
| 32-byte 랜덤 nonce | `Math.random()` | `crypto.randomBytes(32)` | CSPRNG 필수. EIP-3009 표준 요구 |

**Key insight:** 이 phase의 구현은 3개의 보안-민감 영역(SSRF, 결제 서명, 키 관리)을 다루므로, 검증된 라이브러리 함수를 최대한 활용하고 자체 구현을 최소화해야 한다.

## Common Pitfalls

### Pitfall 1: DNS 리바인딩 TOCTOU -- validateUrlSafety()와 fetch() 사이의 갭

**What goes wrong:** SSRF 가드에서 DNS를 해석하여 "공용 IP"를 확인한 후, 실제 fetch()가 별도로 DNS를 재해석하면 두 번째 해석에서 공격자 DNS가 사설 IP를 반환할 수 있다.

**Why it happens:** Node.js native fetch(undici)가 자체적으로 DNS 해석을 수행하므로, validateUrlSafety()의 해석 결과와 fetch()의 실제 연결 대상이 다를 수 있다.

**How to avoid:** 현재 WAIaaS 아키텍처에서 완벽한 DNS pinning은 native fetch의 한계로 불가능하다. 대신 다층 방어를 적용한다:
1. X402_ALLOWED_DOMAINS 도메인 화이트리스트가 1차 방어 (Phase 132에서 구현)
2. SSRF 가드의 DNS 사전 해석이 2차 방어 (대부분의 공격 차단)
3. HTTPS 강제로 443 포트만 허용 (내부 서비스 대부분 HTTP)
4. `request_timeout` 30초 제한으로 slow DNS rebinding 완화

**Warning signs:** SSRF 가드가 URL 검증만 하고 실제 연결에는 관여하지 않는 구조.

### Pitfall 2: IPv4-mapped IPv6 및 대체 IP 표현 바이패스

**What goes wrong:** `::ffff:127.0.0.1`, `0x7f000001`, `0177.0.0.1`, `2130706433` 등 다양한 IP 표현이 사설 IP 차단을 우회할 수 있다.

**Why it happens:** `node:net`의 `isIP()`는 `127.000.000.001`(옥탈 스타일)을 IP로 인식하지 않는다(0 반환). URL constructor는 이를 호스트명으로 처리하여 DNS 해석을 시도한다.

**How to avoid:**
1. `::ffff:` 접두사 감지 -> IPv4 부분 추출 -> IPv4 검증
2. 숫자만으로 구성된 hostname은 10진수 IP로 간주하여 변환 후 검증
3. `0x` 접두사 hostname은 16진수 IP로 간주하여 변환 후 검증
4. 옥탈 표현(`0177`)은 URL constructor가 hostname으로 처리하므로 DNS 해석 단계에서 차단됨 (일반적으로 해석 실패)
5. 모든 edge case에 대한 테스트 케이스 작성

**Warning signs:** `isIP()` 반환값만으로 판단하고 정규화를 하지 않는 코드.

### Pitfall 3: EIP-3009 validBefore를 너무 길게 설정

**What goes wrong:** `validBefore`를 1시간으로 설정하면, 서명이 리소스 서버에 전달된 후 최대 1시간 동안 누구나 정산을 실행할 수 있다. 이 기간에 SPENDING_LIMIT reserved_amount가 TTL로 해제되면 한도 초과 결제가 가능하다.

**Why it happens:** x402 기본 권장이 1시간이지만, WAIaaS의 SPENDING_LIMIT reservation TTL과 동기화하지 않으면 보안 갭이 발생한다.

**How to avoid:** `validBefore = now + 5분` (300초). 이 값은 x402 재요청 + facilitator 정산에 충분하며, 공격 창구를 최소화한다.

**Warning signs:** validBefore가 하드코딩된 큰 값(3600)으로 설정.

### Pitfall 4: Solana blockhash 만료

**What goes wrong:** Solana blockhash는 약 60초(150 slot) 유효. x402 흐름에서 DNS 해석 -> 첫 요청 -> 402 파싱 -> 정책 평가 -> blockhash 획득 -> 트랜잭션 빌드 -> 서명 -> 재요청 -> facilitator 제출까지 수 초~수십 초가 소요될 수 있어 blockhash가 만료될 위험이 있다.

**Why it happens:** EVM의 validBefore(5분)와 달리 Solana blockhash의 유효 기간이 매우 짧다.

**How to avoid:**
1. 정책 평가 통과 후에야 `getLatestBlockhash()` 호출 (정책 거부 시 불필요한 RPC 호출 방지)
2. blockhash 획득 -> 트랜잭션 빌드 -> 서명을 최대한 빠르게 연속 수행
3. 전체 타임아웃을 엄격하게 관리

**Warning signs:** blockhash를 함수 시작 시 획득하고 여러 단계를 거친 후 사용.

### Pitfall 5: x402 v2 헤더명 혼동 (PAYMENT-SIGNATURE vs X-PAYMENT)

**What goes wrong:** x402 v1은 `X-PAYMENT` 헤더를 사용하지만, v2는 `PAYMENT-SIGNATURE` 헤더를 사용한다. 잘못된 헤더명을 사용하면 리소스 서버가 결제를 인식하지 못한다.

**Why it happens:** 이전 x402 문서/예제가 v1 헤더명을 사용하는 경우가 많다.

**How to avoid:** @x402/core v2.3.1의 소스 코드 확인 결과:
- v2 요청: `PAYMENT-SIGNATURE` 헤더에 `base64(JSON.stringify(PaymentPayload))`
- v2 응답 (402): `PAYMENT-REQUIRED` 헤더 + JSON body
- v2 정산 응답: `X-PAYMENT-RESPONSE` 헤더
- v1 호환: `X-PAYMENT` 헤더

`@x402/core/http`의 `encodePaymentSignatureHeader()` 사용 시 자동으로 올바른 인코딩이 적용되므로, 헤더 이름만 `PAYMENT-SIGNATURE`로 정확히 설정하면 된다.

**Warning signs:** 하드코딩된 `X-PAYMENT` 헤더명.

### Pitfall 6: 리다이렉트 후 도메인 재검증 누락

**What goes wrong:** 첫 요청이 허용된 도메인(api.example.com)으로 가지만, 301 리다이렉트로 악의적 도메인(evil.com)이나 사설 IP로 유도될 수 있다.

**Why it happens:** `redirect: 'follow'`를 사용하거나, 수동 리다이렉트 처리 시 새 URL에 대한 SSRF 검증을 생략.

**How to avoid:**
1. `redirect: 'manual'`로 리다이렉트 수동 처리
2. 3xx 응답 시 `Location` 헤더의 새 URL에 대해 `validateUrlSafety()` 재호출
3. 최대 리다이렉트 횟수 3회 제한
4. 리다이렉트 후 도메인이 변경되면 X402_ALLOWED_DOMAINS 재검증 (Phase 132)

## Code Examples

### EIP-3009 USDC Domain Separator 상수 테이블

```typescript
// Source: USDC v2 컨트랙트 분석 + EIP-3009 표준
// 각 체인의 USDC 컨트랙트마다 domain separator가 다름

interface Eip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

const USDC_DOMAINS: Record<string, Eip712Domain> = {
  // Base (주요 x402 네트워크)
  'eip155:8453': {
    name: 'USD Coin',
    version: '2',
    chainId: 8453,
    verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  // Base Sepolia (테스트넷)
  'eip155:84532': {
    name: 'USD Coin',
    version: '2',
    chainId: 84532,
    verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  // Ethereum Mainnet
  'eip155:1': {
    name: 'USD Coin',
    version: '2',
    chainId: 1,
    verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  // Ethereum Sepolia
  'eip155:11155111': {
    name: 'USD Coin',
    version: '2',
    chainId: 11155111,
    verifyingContract: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },
  // Polygon Mainnet
  'eip155:137': {
    name: 'USD Coin',
    version: '2',
    chainId: 137,
    verifyingContract: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  },
  // Arbitrum One
  'eip155:42161': {
    name: 'USD Coin',
    version: '2',
    chainId: 42161,
    verifyingContract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  // Optimism
  'eip155:10': {
    name: 'USD Coin',
    version: '2',
    chainId: 10,
    verifyingContract: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  },
};
```

### 사설 IP 판별 함수 (RFC 5735/6890 전체 범위)

```typescript
// Source: OWASP SSRF Prevention Cheat Sheet + RFC 5735/6890

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  const [a, b] = parts.map(Number);

  // 0.0.0.0/8 - This network
  if (a === 0) return true;
  // 10.0.0.0/8 - Private
  if (a === 10) return true;
  // 100.64.0.0/10 - Shared address space (CGNAT)
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 - Loopback
  if (a === 127) return true;
  // 169.254.0.0/16 - Link-local
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 - Private
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 - IETF Protocol Assignments
  if (a === 192 && b === 0 && parts[2] !== undefined && Number(parts[2]) === 0) return true;
  // 192.0.2.0/24 - Documentation (TEST-NET-1)
  if (a === 192 && b === 0 && parts[2] !== undefined && Number(parts[2]) === 2) return true;
  // 192.168.0.0/16 - Private
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 - Benchmarking
  if (a === 198 && b !== undefined && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 - Documentation (TEST-NET-2)
  if (a === 198 && b === 51 && parts[2] !== undefined && Number(parts[2]) === 100) return true;
  // 203.0.113.0/24 - Documentation (TEST-NET-3)
  if (a === 203 && b === 0 && parts[2] !== undefined && Number(parts[2]) === 113) return true;
  // 224.0.0.0/4 - Multicast
  if (a !== undefined && a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 - Reserved
  if (a !== undefined && a >= 240) return true;

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // ::1 - Loopback
  if (lower === '::1') return true;
  // :: - Unspecified
  if (lower === '::') return true;
  // fe80::/10 - Link-local
  if (lower.startsWith('fe80:') || lower.startsWith('fe80')) return true;
  // fc00::/7 - Unique local (fd00::/8 + fc00::/8)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // ff00::/8 - Multicast
  if (lower.startsWith('ff')) return true;

  return false;
}

/**
 * Normalize IPv4-mapped IPv6 addresses to IPv4.
 * ::ffff:127.0.0.1 -> 127.0.0.1
 * ::ffff:7f00:0001 -> 127.0.0.1
 */
function normalizeIPv6Mapped(ip: string): string {
  const lower = ip.toLowerCase();

  // ::ffff:A.B.C.D format
  if (lower.startsWith('::ffff:') && lower.includes('.')) {
    return lower.slice(7); // strip ::ffff:
  }

  // ::ffff:HHHH:HHHH format (hex-encoded IPv4)
  const match = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (match) {
    const hi = parseInt(match[1]!, 16);
    const lo = parseInt(match[2]!, 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  return ip;
}
```

### 리다이렉트 처리 (최대 3회, 매 hop SSRF 재검증)

```typescript
async function safeFetchWithRedirects(
  url: URL,
  method: string,
  headers?: Record<string, string>,
  body?: string,
  timeout: number = 30_000,
): Promise<Response> {
  const maxRedirects = 3;
  let currentUrl = url;

  for (let i = 0; i <= maxRedirects; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(currentUrl.toString(), {
        method: i === 0 ? method : 'GET',  // 리다이렉트 후 GET으로 변경
        headers: i === 0 ? headers : undefined,
        body: i === 0 && method !== 'GET' ? body : undefined,
        signal: controller.signal,
        redirect: 'manual',
      });

      // 비-리다이렉트: 응답 반환
      if (response.status < 300 || response.status >= 400) {
        return response;
      }

      // 리다이렉트: Location 검증
      const location = response.headers.get('Location');
      if (!location) {
        return response; // Location 없으면 그대로 반환
      }

      // 새 URL에 대해 SSRF 재검증
      currentUrl = await validateUrlSafety(
        new URL(location, currentUrl).toString(),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw new WAIaaSError('X402_SSRF_BLOCKED', {
    message: `Too many redirects (max ${maxRedirects})`,
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| x402 v1: `X-PAYMENT` 헤더 | x402 v2: `PAYMENT-SIGNATURE` 헤더 | x402 v2 (2025) | 헤더명 변경. v1은 `X-PAYMENT`, v2는 `PAYMENT-SIGNATURE` |
| x402 v1: 네트워크 문자열 | x402 v2: CAIP-2 식별자 (`eip155:8453`) | x402 v2 (2025) | 표준화된 네트워크 식별 |
| 402 body-only 응답 | 402 `PAYMENT-REQUIRED` 헤더 + body | x402 v2 (2025) | 헤더 + body 이중 전달 |
| @solana/kit 5.x | @solana/kit 6.x | 2025 | `createKeyPairFromPrivateKeyBytes` API 추가 |
| `http.Agent` 기반 SSRF 방어 | DNS 사전 해석 + IP 검증 | native fetch 등장 (Node.js 22) | native fetch는 http.Agent 미지원 |

**Deprecated/outdated:**
- `X-PAYMENT` 헤더: x402 v1 전용. v2에서는 `PAYMENT-SIGNATURE` 사용
- `request-filtering-agent`: native fetch와 호환 불가
- `private-ip` 라이브러리: multicast SSRF 바이패스 CVE

## Open Questions

1. **EIP-3009 USDC domain separator의 `name`/`version` 값 체인별 확인**
   - What we know: Base, Ethereum mainnet USDC는 `name: 'USD Coin'`, `version: '2'` 사용. 이는 EIP-3009 표준과 x402 참조 구현에서 확인됨.
   - What's unclear: Polygon, Arbitrum, Optimism 등 L2 체인의 USDC 컨트랙트가 동일한 name/version을 사용하는지 100% 확인 필요. Circle의 네이티브 USDC v2는 모든 체인에서 동일할 것으로 예상되나, bridged USDC는 다를 수 있음.
   - Recommendation: 구현 시 USDC_DOMAINS 상수 테이블에 Base + Ethereum을 먼저 등록하고, 나머지 체인은 on-chain `DOMAIN_SEPARATOR()` 호출로 검증 후 추가. 테스트에서는 Base Sepolia 사용. [MEDIUM confidence]

2. **Solana x402 partial signing의 정확한 feePayer 처리**
   - What we know: PaymentRequirements.extra.feePayer에 facilitator 주소가 제공됨. 클라이언트는 이 주소를 feePayer로 설정하고 noopSigner로 처리하여 서명 슬롯만 만듦.
   - What's unclear: @solana/kit 6.x에서 feePayer를 address(string)로만 설정하고 서명하지 않을 때의 정확한 compileTransaction 동작. SolanaAdapter의 buildTransaction은 `setTransactionMessageFeePayer(from, msg)`에서 from을 address로 전달하는 패턴.
   - Recommendation: SolanaAdapter.buildTransaction()의 기존 패턴을 따르되, feePayer는 facilitator 주소로 변경. 부분 서명 후 인코딩된 트랜잭션이 올바른 형식인지 base64 디코딩으로 검증하는 테스트 작성. [MEDIUM confidence]

3. **undici(native fetch)의 DNS 캐싱 동작과 SSRF 가드 상호작용**
   - What we know: Node.js 22의 undici는 내부적으로 DNS 해석을 수행하며, DNS 캐싱을 사용할 수 있음.
   - What's unclear: undici의 DNS 캐시 TTL이 얼마인지, validateUrlSafety()와 fetch() 사이에 DNS 캐시가 일치하는지 보장할 수 없음.
   - Recommendation: 완벽한 DNS pinning이 불가능한 것을 인정하고, 다층 방어(도메인 화이트리스트 + SSRF 가드 + HTTPS 강제)로 충분한 보안을 확보. DNS 리바인딩 공격은 화이트리스트된 도메인의 DNS를 공격자가 제어해야 하므로 현실적 위험도가 낮다. [MEDIUM confidence]

## Sources

### Primary (HIGH confidence)

- **WAIaaS 코드베이스 직접 검증:**
  - `packages/daemon/src/pipeline/stages.ts` -- Stage 5c 키 관리 패턴 (decrypt -> sign -> finally release)
  - `packages/daemon/src/pipeline/sign-only.ts` -- 10-step 독립 파이프라인, DELAY/APPROVAL 즉시 거부 패턴
  - `packages/daemon/src/infrastructure/keystore/keystore.ts` -- decryptPrivateKey, releaseKey, sodium guarded memory
  - `packages/adapters/evm/src/adapter.ts` -- privateKeyToAccount + signTransaction 패턴
  - `packages/adapters/solana/src/adapter.ts` -- signBytes + createKeyPairFromBytes + compileTransaction + createNoopSigner 패턴
  - `packages/core/src/interfaces/x402.types.ts` -- CAIP2_TO_NETWORK, resolveX402Network, X402FetchRequest/Response 스키마
  - `packages/core/src/errors/error-codes.ts` -- X402 도메인 에러 코드 8개

- **@x402/core v2.3.1 소스 코드 직접 검증:**
  - `dist/esm/schemas/index.mjs` -- PaymentRequiredV2Schema, PaymentPayloadV2Schema 정확한 구조
  - `dist/esm/chunk-BA4MQXNQ.mjs` -- encodePaymentSignatureHeader (base64(JSON.stringify)), 헤더명 확인 (v2: `PAYMENT-SIGNATURE`, v1: `X-PAYMENT`)
  - `dist/esm/chunk-TDLQZ6MP.mjs` -- safeBase64Encode/Decode 구현
  - `README.md` -- 헤더명 문서 확인: `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`(=`X-PAYMENT` for v1), `X-PAYMENT-RESPONSE`

- **EIP-3009 표준:**
  - [ERC-3009: Transfer With Authorization](https://eips.ethereum.org/EIPS/eip-3009) -- transferWithAuthorization 타입 해시, 랜덤 bytes32 nonce, validAfter/validBefore 시맨틱
  - TransferWithAuthorization 타입: `(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce)`

- **x402 스펙:**
  - [x402 EVM Exact Scheme](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md) -- EIP-3009 authorization 객체, payload 구조
  - [x402 SVM Exact Scheme](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_svm.md) -- TransferChecked instruction 순서, feePayer in extra, base64 부분 서명

- **OWASP:**
  - [SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) -- DNS resolve + IP 검증 패턴, 사설 IP 범위, 리다이렉트 재검증

### Secondary (MEDIUM confidence)

- **Node.js 22 공식 문서:**
  - [DNS module](https://nodejs.org/docs/latest-v22.x/api/dns.html) -- `lookup({ all: true })` API, IPv4/IPv6 해석
  - [Net module](https://nodejs.org/docs/latest-v22.x/api/net.html) -- `isIP()` 동작: `127.000.000.001` = 0 반환 (IP로 인식하지 않음)

- **WAIaaS 연구 파일 (이전 phase):**
  - `.planning/research/v1.5.1-x402-client-STACK.md` -- 6개 기술 영역 분석
  - `.planning/research/v1.5.1-x402-client-ARCHITECTURE.md` -- 컴포넌트 경계, 데이터 흐름
  - `.planning/research/v1.5.1-x402-client-PITFALLS.md` -- 15개 도메인 함정 (C-01~C-05, H-01~H-05, M-01~M-05)

### Tertiary (LOW confidence)

- Solana x402 부분 서명의 Compute Budget instruction 필요 여부 -- SVM 스펙에서 "(1) Set Compute Unit Limit (2) Set Compute Unit Price (3) TransferChecked" 순서를 명시하지만, Compute Budget instruction이 필수인지 선택인지 불명확. facilitator가 추가할 수도 있음. 구현 시 TransferChecked만으로 시작하고, facilitator 거부 시 Compute Budget 추가.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 모든 라이브러리가 기존 설치/사용 중. @x402/core 소스 직접 검증.
- Architecture: HIGH -- sign-only 패턴(독립 파이프라인, DELAY/APPROVAL 거부)이 x402와 동일한 구조적 제약. 키 관리 패턴(decrypt->sign->finally release) 3곳에서 검증됨.
- Pitfalls: HIGH -- OWASP SSRF 가이드, EIP-3009 표준, @x402/core 소스 코드에서 교차 검증. v1/v2 헤더명 차이를 소스 코드에서 직접 확인.
- Code examples: HIGH -- 기존 EvmAdapter.signTransaction, SolanaAdapter.signTransaction, sign-only.ts 패턴에서 직접 추출.

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (@x402/core minor 업데이트, USDC 컨트랙트 주소 변경 시 domain 테이블 갱신 필요)
