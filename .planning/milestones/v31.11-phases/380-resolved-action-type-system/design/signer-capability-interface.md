# ISignerCapability 인터페이스 + SigningSchemeEnum 설계

> Phase 380, Plan 02 — ISignerCapability 통합 인터페이스 + SigningSchemeEnum(7종) 설계

---

## 1. 개요

### 문제

WAIaaS의 서명 역량은 현재 4종이 분산 구현되어 있다:

| 서명 방식 | 현재 위치 | 호출 패턴 |
|----------|----------|----------|
| signTransaction | `IChainAdapter.signTransaction()` | 6-stage pipeline 내부 |
| signTypedData (EIP-712) | `packages/daemon/src/pipeline/sign-message.ts` | sign-message pipeline |
| signMessage (personal) | `packages/daemon/src/pipeline/sign-message.ts` | sign-message pipeline |
| signHttpRequest (ERC-8128) | `packages/core/src/erc8128/http-message-signer.ts` | 독립 모듈 |

이 분산 구조는 다음 문제를 야기한다:

1. **새 서명 방식 추가가 어려움**: HMAC-SHA256 (CEX API), RSA-PSS (금융 API) 등을 추가하려면 어디에 구현해야 하는지 불명확
2. **ActionProvider가 서명 능력을 선언할 수 없음**: provider가 EIP-712 서명을 요구하더라도 이를 타입 수준에서 표현할 방법이 없음
3. **서명 방식별 파라미터가 통일되지 않음**: EIP-712는 domain/types/value, personal은 message, ERC-8128은 method/url/headers 등 각각 다른 인터페이스

### 목표

`ISignerCapability` 통합 인터페이스와 `SigningSchemeEnum`(7종)을 설계하여:

1. 분산된 서명 역량을 단일 추상화로 통합
2. `ResolvedAction.signingScheme` 필드가 참조하는 기반 타입 제공
3. `SignerCapabilityRegistry`를 통한 scheme → capability 자동 매핑 기반 마련

### 기존 파이프라인 무변경 원칙

**기존 sign-message.ts / sign-only pipeline / ERC-8128 모듈의 호출 경로는 절대 변경하지 않는다.** ISignerCapability는 새 ActionProvider 경로 (SignedDataAction/SignedHttpAction 처리)에서만 사용한다.

---

## 2. SigningSchemeEnum 설계

### 2.1 Zod enum 정의

```typescript
import { z } from 'zod';

export const SigningSchemeEnum = z.enum([
  'eip712',           // EIP-712 typed structured data signing
  'personal',         // EIP-191 personal sign (arbitrary message)
  'hmac-sha256',      // HMAC-SHA256 symmetric key signing
  'rsa-pss',          // RSA-PSS asymmetric key signing
  'ecdsa-secp256k1',  // raw ECDSA secp256k1 arbitrary bytes signing
  'ed25519',          // Ed25519 arbitrary bytes signing
  'erc8128',          // ERC-8128 signed HTTP request (RFC 9421 + EIP-191)
]);

export type SigningScheme = z.infer<typeof SigningSchemeEnum>;
```

### 2.2 각 scheme 상세

#### `eip712` — EIP-712 Typed Structured Data

- **표준**: [EIP-712](https://eips.ethereum.org/EIPS/eip-712)
- **용도**: CoW Protocol off-chain order, Polymarket CLOB, ERC-2612 permit, ERC-4337 UserOp signing
- **payload 구조**: `{ domain, types, primaryType, value }`
- **키 타입**: EVM private key (secp256k1)
- **기존 구현**: `sign-message.ts` — signTypedData 분기

#### `personal` — EIP-191 Personal Sign

- **표준**: [EIP-191](https://eips.ethereum.org/EIPS/eip-191)
- **용도**: 임의 메시지 서명, 인증 (SIWE/SIWS), off-chain attestation
- **payload 구조**: `{ message: string }`
- **키 타입**: EVM private key (secp256k1)
- **기존 구현**: `sign-message.ts` — signPersonalMessage 분기

#### `hmac-sha256` — HMAC-SHA256

- **표준**: [RFC 2104](https://tools.ietf.org/html/rfc2104)
- **용도**: CEX API 인증 (Binance, OKX, Bybit 등), webhook 서명 검증
- **payload 구조**: `{ data: string, timestamp: string, method: string, path: string }`
- **키 타입**: 대칭 키 (API secret) — CredentialVault에서 주입
- **기존 구현**: 없음 (신규)
- **구현 기반**: `node:crypto createHmac('sha256', secret).update(data).digest()`

#### `rsa-pss` — RSA-PSS

- **표준**: [RFC 8017](https://tools.ietf.org/html/rfc8017), [PKCS#1 v2.2](https://tools.ietf.org/html/rfc8017#section-8.1)
- **용도**: 일부 금융 API, 레거시 시스템, 특정 결제 게이트웨이
- **payload 구조**: `{ data: string }` (signing target)
- **키 타입**: RSA private key (PEM) — CredentialVault에서 주입
- **기존 구현**: 없음 (신규)
- **구현 기반**: `node:crypto sign('RSA-SHA256', data, { key, padding: RSA_PKCS1_PSS_PADDING })`

#### `ecdsa-secp256k1` — Raw ECDSA secp256k1

- **용도**: 크로스체인 메시지 서명, 커스텀 프로토콜, Bitcoin script 서명
- **payload 구조**: `{ data: string }` (hex-encoded arbitrary bytes)
- **키 타입**: EVM private key (secp256k1)
- **기존 구현**: 없음 (signBytes capability로 신규)
- **구현 기반**: `viem`의 `sign()` 또는 `secp256k1.sign()`

#### `ed25519` — Ed25519

- **표준**: [RFC 8032](https://tools.ietf.org/html/rfc8032)
- **용도**: Solana native signing, 크로스체인 메시지, 특정 프로토콜
- **payload 구조**: `{ data: string }` (hex-encoded arbitrary bytes)
- **키 타입**: Ed25519 private key (Solana keypair)
- **기존 구현**: 없음 (signBytes capability로 신규)
- **구현 기반**: `@solana/kit`의 `signBytes()` 또는 `tweetnacl.sign.detached()`

#### `erc8128` — ERC-8128 Signed HTTP Request

- **표준**: [ERC-8128](https://eips.ethereum.org/EIPS/eip-8128) (RFC 9421 + EIP-191)
- **용도**: Signed HTTP request for authenticated API access
- **payload 구조**: `{ method, url, headers, body?, coveredComponents?, preset?, ttlSec?, nonce? }`
- **키 타입**: EVM private key (secp256k1)
- **기존 구현**: `packages/core/src/erc8128/http-message-signer.ts`

### 2.3 확장 가능성

향후 추가 가능한 scheme:

| scheme | 용도 | 추가 시점 |
|--------|------|----------|
| `hmac-sha512` | 일부 거래소 (Kraken 등) | 필요 시 |
| `ecdsa-p256` | WebAuthn, FIDO2, 일부 금융 API | 필요 시 |
| `schnorr` | Bitcoin Taproot, Nostr | 필요 시 |
| `bls12-381` | Ethereum validator signing | 필요 시 |

새 scheme 추가 시 절차:
1. `SigningSchemeEnum`에 값 추가
2. `ISignerCapability` 구현체 작성
3. `SignerCapabilityRegistry`에 등록
4. 관련 `SigningParams` variant 추가

---

## 3. ISignerCapability 인터페이스 설계

### 3.1 핵심 인터페이스

```typescript
/**
 * 특정 서명 방식의 능력을 추상화하는 인터페이스.
 *
 * 각 구현체는 하나의 SigningScheme에 대응하며,
 * SignerCapabilityRegistry에 등록되어 scheme → capability 매핑을 제공한다.
 */
export interface ISignerCapability {
  /** 이 capability가 지원하는 서명 방식 */
  readonly scheme: SigningScheme;

  /**
   * 주어진 파라미터를 이 capability로 서명할 수 있는지 검사한다.
   *
   * 검사 항목:
   * - 키 타입 호환성 (EVM key vs Solana key)
   * - payload 구조 유효성
   * - 필수 credential 존재 여부
   *
   * @returns true이면 sign() 호출 가능
   */
  canSign(params: SigningParams): boolean;

  /**
   * 서명을 수행한다.
   *
   * credential은 sign() 직전에 CredentialVault/ActionContext에서 주입된다.
   * sign() 완료 후 키 메모리는 즉시 클리어한다.
   *
   * @throws SigningError - 서명 실패 시
   */
  sign(params: SigningParams): Promise<SigningResult>;
}
```

### 3.2 SigningParams — scheme별 discriminated union

타입 안전성을 위해 scheme별 discriminated union을 사용한다.

```typescript
// ── 공통 기반 ──
interface BaseSigningParams {
  scheme: SigningScheme;
}

// ── EIP-712 ──
export interface Eip712SigningParams extends BaseSigningParams {
  scheme: 'eip712';
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: string;
    salt?: string;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  value: Record<string, unknown>;
  privateKey: `0x${string}`;
}

// ── Personal Sign ──
export interface PersonalSigningParams extends BaseSigningParams {
  scheme: 'personal';
  message: string;
  privateKey: `0x${string}`;
}

// ── HMAC-SHA256 ──
export interface HmacSigningParams extends BaseSigningParams {
  scheme: 'hmac-sha256';
  data: string;          // signing target (raw string or hex)
  secret: string;        // HMAC secret (CredentialVault에서 주입)
}

// ── RSA-PSS ──
export interface RsaPssSigningParams extends BaseSigningParams {
  scheme: 'rsa-pss';
  data: string;          // signing target
  privateKey: string;    // PEM-encoded RSA private key (CredentialVault에서 주입)
  saltLength?: number;   // PSS salt length (default: 32)
}

// ── ECDSA secp256k1 (raw bytes) ──
export interface EcdsaSecp256k1SigningParams extends BaseSigningParams {
  scheme: 'ecdsa-secp256k1';
  data: string;          // hex-encoded arbitrary bytes
  privateKey: `0x${string}`;
}

// ── Ed25519 (raw bytes) ──
export interface Ed25519SigningParams extends BaseSigningParams {
  scheme: 'ed25519';
  data: string;          // hex-encoded arbitrary bytes
  privateKey: Uint8Array; // Ed25519 secret key (64 bytes, Solana keypair 형태)
}

// ── ERC-8128 Signed HTTP ──
export interface Erc8128SigningParams extends BaseSigningParams {
  scheme: 'erc8128';
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  privateKey: `0x${string}`;
  chainId: number;
  address: string;
  coveredComponents?: string[];
  preset?: 'minimal' | 'standard' | 'strict';
  ttlSec?: number;
  nonce?: string | false;
}

// ── 통합 union ──
export type SigningParams =
  | Eip712SigningParams
  | PersonalSigningParams
  | HmacSigningParams
  | RsaPssSigningParams
  | EcdsaSecp256k1SigningParams
  | Ed25519SigningParams
  | Erc8128SigningParams;
```

### 3.3 SigningResult

```typescript
/**
 * 서명 결과.
 *
 * signature 형태는 scheme에 따라 다르다:
 * - eip712/personal: hex string (0x-prefixed, EVM signature)
 * - hmac-sha256: hex string (HMAC digest)
 * - rsa-pss: base64 string (RSA signature)
 * - ecdsa-secp256k1: hex string (raw ECDSA signature)
 * - ed25519: hex string (Ed25519 signature)
 * - erc8128: Record (signed headers including Signature/Signature-Input)
 */
export interface SigningResult {
  /** 서명 값 (scheme별 형태 상이) */
  signature: string | Uint8Array;

  /**
   * 서명에 부가된 메타데이터.
   *
   * 예시:
   * - erc8128: { signatureInput: string, signedHeaders: Record<string, string> }
   * - eip712: { v: number, r: string, s: string }
   */
  metadata?: Record<string, unknown>;
}
```

### 3.4 SigningError

```typescript
/**
 * 서명 실패 에러.
 * ChainError extends Error 패턴을 따르되, 서명 도메인 전용.
 */
export class SigningError extends Error {
  constructor(
    message: string,
    public readonly scheme: SigningScheme,
    public readonly code: SigningErrorCode,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'SigningError';
  }
}

export type SigningErrorCode =
  | 'INVALID_KEY'         // 키 타입 불일치
  | 'INVALID_PARAMS'      // 파라미터 구조 오류
  | 'CREDENTIAL_MISSING'  // credential 없음
  | 'SIGNING_FAILED'      // 서명 연산 실패
  | 'KEY_NOT_SUPPORTED';  // 해당 체인에서 지원하지 않는 키 타입
```

---

## 4. 기존 4종 signer ISignerCapability 어댑터 개요

Phase 382에서 상세 설계하지만, 여기서는 매핑 관계만 정리한다.

### 4.1 어댑터 매핑 테이블

| ISignerCapability 구현체 | scheme | 래핑 대상 | 위치 |
|-------------------------|--------|----------|------|
| `Eip712SignerCapability` | `eip712` | sign-message.ts typedData 경로 | daemon/pipeline |
| `PersonalSignCapability` | `personal` | sign-message.ts personal 경로 | daemon/pipeline |
| `Erc8128SignerCapability` | `erc8128` | http-message-signer.ts | core/erc8128 |
| `TransactionSignerCapability` | _(해당 없음)_ | IChainAdapter.signTransaction() | 참조용 |

### 4.2 어댑터 설계 원칙

```typescript
// 예시: Eip712SignerCapability (Phase 382에서 상세 구현)
class Eip712SignerCapability implements ISignerCapability {
  readonly scheme: SigningScheme = 'eip712';

  canSign(params: SigningParams): boolean {
    return params.scheme === 'eip712'
      && 'domain' in params
      && 'types' in params
      && 'value' in params;
  }

  async sign(params: SigningParams): Promise<SigningResult> {
    if (params.scheme !== 'eip712') throw new SigningError(/*...*/);
    const p = params as Eip712SigningParams;

    // 기존 sign-message.ts의 signTypedData 로직을 위임
    // (내부적으로 viem의 signTypedData 사용)
    const signature = await signTypedData({
      privateKey: p.privateKey,
      domain: p.domain,
      types: p.types,
      primaryType: p.primaryType,
      message: p.value,
    });

    return { signature };
  }
}
```

### 4.3 TransactionSignerCapability 특수 사례

`TransactionSignerCapability`는 참조용으로만 포함한다. 이유:

- `contractCall` kind는 기존 6-stage pipeline 그대로 사용
- ISignerCapability 경로를 사용하지 않음
- 향후 특수 케이스 (예: 트랜잭션 서명만 필요한 off-chain 시나리오)에서 활용 가능

### 4.4 신규 capability (Phase 382 상세 설계)

| ISignerCapability 구현체 | scheme | 구현 기반 |
|-------------------------|--------|----------|
| `HmacSignerCapability` | `hmac-sha256` | `node:crypto createHmac` |
| `RsaPssSignerCapability` | `rsa-pss` | `node:crypto sign` (RSA-PSS padding) |
| `EcdsaSignBytesCapability` | `ecdsa-secp256k1` | `viem sign()` 또는 `secp256k1.sign()` |
| `Ed25519SignBytesCapability` | `ed25519` | `@solana/kit signBytes()` 또는 `tweetnacl` |

---

## 5. SignerCapabilityRegistry 개요

Phase 382에서 상세 설계하지만, 여기서는 인터페이스만 정리한다.

### 5.1 인터페이스

```typescript
/**
 * 서명 방식별 ISignerCapability를 관리하는 레지스트리.
 *
 * daemon 부팅 시 기존 4종 + 신규 capability를 자동 등록한다.
 * ResolvedAction의 signingScheme에 따라 적절한 capability를 조회한다.
 */
export interface ISignerCapabilityRegistry {
  /**
   * capability를 등록한다.
   * 같은 scheme의 기존 등록을 덮어쓴다 (테스트에서 mock 주입 용이).
   */
  register(capability: ISignerCapability): void;

  /**
   * scheme으로 capability를 조회한다.
   * @returns 등록된 capability 또는 undefined
   */
  get(scheme: SigningScheme): ISignerCapability | undefined;

  /**
   * ResolvedAction (SignedDataAction 또는 SignedHttpAction)에서 필요한
   * capability를 조회한다.
   *
   * @throws SigningError('CAPABILITY_NOT_FOUND') - 등록되지 않은 scheme
   */
  resolve(action: SignedDataAction | SignedHttpAction): ISignerCapability;

  /**
   * 등록된 모든 scheme 목록을 반환한다.
   * connect-info API에서 서명 능력 노출에 사용.
   */
  listSchemes(): readonly SigningScheme[];
}
```

### 5.2 초기 등록

daemon 부팅 시 자동 등록:

```typescript
// daemon bootstrap (의사 코드)
function bootstrapSignerCapabilities(registry: ISignerCapabilityRegistry) {
  // 기존 4종 어댑터
  registry.register(new Eip712SignerCapability());
  registry.register(new PersonalSignCapability());
  registry.register(new Erc8128SignerCapability());
  // TransactionSignerCapability는 등록하지 않음 (기존 pipeline 사용)

  // 신규 capability
  registry.register(new HmacSignerCapability());
  registry.register(new RsaPssSignerCapability());
  registry.register(new EcdsaSignBytesCapability());
  registry.register(new Ed25519SignBytesCapability());
}
```

### 5.3 resolve() 흐름

```
SignedDataAction { signingScheme: 'eip712', ... }
        │
        ▼
SignerCapabilityRegistry.resolve(action)
        │
        ▼
registry.get('eip712')
        │
        ▼
Eip712SignerCapability.sign(params)
        │
        ▼
SigningResult { signature: '0x...' }
```

---

## 6. 기존 파이프라인 무변경 원칙

### 6.1 기존 경로와 새 경로의 관계

```
┌─────────────────────────────────────────────────────────────────┐
│                      기존 경로 (무변경)                            │
│                                                                 │
│  REST API /v1/wallets/:id/sign-message                          │
│       │                                                         │
│       ▼                                                         │
│  sign-message.ts pipeline                                       │
│       ├── signTypedData (EIP-712)                               │
│       └── signPersonalMessage (personal)                        │
│                                                                 │
│  REST API /v1/wallets/:id/sign-http                             │
│       │                                                         │
│       ▼                                                         │
│  http-message-signer.ts                                         │
│                                                                 │
│  REST API /v1/actions/:provider/:action                         │
│       │                                                         │
│       ▼                                                         │
│  6-stage pipeline (ContractCallRequest)                         │
│       └── IChainAdapter.signTransaction()                       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                      새 경로 (ISignerCapability 사용)             │
│                                                                 │
│  REST API /v1/actions/:provider/:action                         │
│       │                                                         │
│       ▼                                                         │
│  ActionProviderRegistry.executeAction()                         │
│       │                                                         │
│       ▼                                                         │
│  normalizeResolvedAction()                                      │
│       │                                                         │
│       ├── kind: 'contractCall' ──→ 기존 6-stage pipeline         │
│       │                                                         │
│       ├── kind: 'signedData' ──→ sign-data pipeline (신규)       │
│       │       │                                                 │
│       │       ▼                                                 │
│       │  SignerCapabilityRegistry.resolve(action)               │
│       │       │                                                 │
│       │       ▼                                                 │
│       │  ISignerCapability.sign(params)                         │
│       │                                                         │
│       └── kind: 'signedHttp' ──→ sign-http pipeline (신규)       │
│               │                                                 │
│               ▼                                                 │
│          SignerCapabilityRegistry.resolve(action)               │
│               │                                                 │
│               ▼                                                 │
│          ISignerCapability.sign(params)                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 분리 보장 전략

| 항목 | 기존 경로 | 새 경로 |
|------|----------|---------|
| 진입점 | 전용 REST API (sign-message, sign-http) | ActionProvider 경로 (/actions/:provider/:action) |
| 서명 모듈 | sign-message.ts, http-message-signer.ts 직접 호출 | ISignerCapability 인터페이스 경유 |
| 키 주입 | ActionContext.privateKey | ISignerCapability.sign(params) — CredentialVault 또는 ActionContext |
| 정책 평가 | sign-message pipeline 내부 | ResolvedAction 정규화 후, sign 전 |

기존 경로의 코드는 ISignerCapability를 import하지 않으며, 새 경로의 코드는 sign-message.ts를 직접 호출하지 않는다. 두 경로는 완전히 독립적이다.

---

## 7. 설계 결정 사항

| # | 결정 | 근거 |
|---|------|------|
| D1 | SigningParams를 scheme별 discriminated union으로 | 타입 안전성 — scheme별 필수 필드가 다르므로 generic object보다 안전. IDE 자동완성, 컴파일 타임 검증 가능 |
| D2 | credential 주입 시점: sign() 직전 | resolve() 시점에는 credential이 불필요 (payload 구성만). sign() 직전에 CredentialVault에서 조회하여 주입하면 credential 노출 최소화 |
| D3 | 키 메모리 관리: sign() 완료 후 즉시 클리어 | 기존 ActionContext.privateKey 패턴과 동일. 서명 완료 후 메모리에 키를 유지할 이유 없음 |
| D4 | TransactionSignerCapability를 registry에 등록하지 않음 | contractCall은 기존 6-stage pipeline 사용. ISignerCapability 경로와 별개 |
| D5 | SigningResult.signature를 string \| Uint8Array로 | scheme에 따라 hex string (EVM) 또는 raw bytes (Ed25519)로 반환. 호출자가 scheme에 따라 해석 |
| D6 | canSign() 동기 메서드 | 키 타입/payload 구조 검사는 CPU 연산만 필요. 비동기 I/O 불필요 |
| D7 | SigningError에 scheme + code 포함 | 어떤 서명 방식에서 어떤 종류의 오류가 발생했는지 구조화. 디버깅과 에러 핸들링 용이 |

---

## 부록: ResolvedAction → ISignerCapability 연결

Plan 380-01에서 설계한 `ResolvedAction.signingScheme`과 본 문서의 `ISignerCapability`가 연결되는 지점:

```
ActionProvider.resolve()
        │
        ▼
ResolvedAction { kind: 'signedData', signingScheme: 'eip712', payload: {...} }
        │
        ▼
normalizeResolvedAction()
        │
        ▼
Pipeline Router (Phase 383)
        │ kind === 'signedData'
        ▼
SignerCapabilityRegistry.resolve(action)  ←── signingScheme: 'eip712'
        │
        ▼
Eip712SignerCapability.sign({
  scheme: 'eip712',
  domain: action.payload.domain,
  types: action.payload.types,
  primaryType: action.payload.primaryType,
  value: action.payload.value,
  privateKey: context.privateKey,   // ActionContext에서 주입
})
        │
        ▼
SigningResult { signature: '0x...', metadata: { v, r, s } }
```

이 연결은 Phase 383 (파이프라인 라우팅)에서 상세 구현된다.

---

*Phase: 380-resolved-action-type-system, Plan: 02*
*작성일: 2026-03-11*
