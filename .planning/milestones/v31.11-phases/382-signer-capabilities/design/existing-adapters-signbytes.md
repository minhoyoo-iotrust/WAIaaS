# 기존 4종 어댑터 + signBytes 2종 상세 설계

> Phase 382, Plan 01 — Eip712/Personal/Erc8128/Transaction 어댑터 + EcdsaSignBytes/Ed25519SignBytes capability 설계

---

## 1. 개요

### 어댑터 패턴 선택 근거

ISignerCapability 구현체는 기존 서명 모듈을 **래핑(wrapping)**하는 어댑터 패턴을 사용한다. 이유:

1. **기존 파이프라인 무변경**: sign-message.ts, http-message-signer.ts의 코드를 수정하지 않음
2. **의존성 최소화**: 어댑터는 기존 모듈을 import하지 않고, 같은 하위 라이브러리(viem 등)를 독립적으로 호출
3. **예외 — Erc8128만 기존 모듈 import 허용**: RFC 9421 구현이 복잡하여 중복 불가

### 기존 파이프라인 무변경 원칙 재확인

- 기존 경로 (sign-message REST API, sign-http REST API, 6-stage pipeline)는 ISignerCapability를 import하지 않음
- 새 경로 (ActionProvider `/actions/:provider/:action`)에서만 ISignerCapability 경유
- 두 경로는 완전히 독립적이며, 기존 코드 변경 0줄

---

## 2. 기존 4종 어댑터

### 2.1 Eip712SignerCapability

| 항목 | 내용 |
|------|------|
| **scheme** | `'eip712'` |
| **래핑 대상** | `sign-message.ts`의 signTypedData 경로 (viem `signTypedData` 사용) |
| **import 관계** | 기존 sign-message.ts 직접 import **없음** — viem의 `signTypedData` 함수를 독립적으로 호출 |

#### canSign() 로직

```typescript
canSign(params: SigningParams): boolean {
  if (params.scheme !== 'eip712') return false;
  const p = params as Eip712SigningParams;
  return (
    p.domain !== undefined &&
    p.types !== undefined &&
    p.value !== undefined &&
    p.primaryType !== undefined &&
    p.privateKey !== undefined
  );
}
```

검사 항목:
- `params.scheme === 'eip712'` (discriminant check)
- `domain`, `types`, `value`, `primaryType` 존재 확인
- `privateKey` (`0x${string}` 형태) 존재 확인

#### sign() 위임 흐름

```typescript
async sign(params: SigningParams): Promise<SigningResult> {
  if (params.scheme !== 'eip712') {
    throw new SigningError('Scheme mismatch', 'eip712', 'INVALID_PARAMS');
  }
  const p = params as Eip712SigningParams;

  try {
    // viem의 signTypedData 직접 호출 (sign-message.ts import 없음)
    const signature = await signTypedData({
      privateKey: p.privateKey,
      domain: p.domain,
      types: p.types,
      primaryType: p.primaryType,
      message: p.value,
    });

    // v, r, s 분리
    const { v, r, s } = parseSignature(signature);

    return {
      signature,  // hex string, 0x-prefixed
      metadata: { v, r, s },
    };
  } catch (err) {
    throw new SigningError(
      `EIP-712 signing failed: ${(err as Error).message}`,
      'eip712',
      'SIGNING_FAILED',
      err as Error,
    );
  }
}
```

#### metadata 반환

```typescript
{
  v: number,   // recovery id (27 or 28)
  r: string,   // 0x-prefixed hex, 32 bytes
  s: string,   // 0x-prefixed hex, 32 bytes
}
```

`v, r, s` 분리값은 CoW Protocol, Polymarket CLOB 등에서 필요한 경우가 있으므로 metadata로 반환한다.

#### 에러 매핑

| viem 에러 | SigningErrorCode | 설명 |
|-----------|-----------------|------|
| `InvalidAddressError` | `INVALID_PARAMS` | domain.verifyingContract 주소 오류 |
| `SerializeTypedDataError` | `INVALID_PARAMS` | types 구조 오류 |
| 기타 서명 실패 | `SIGNING_FAILED` | viem 내부 서명 연산 실패 |

---

### 2.2 PersonalSignCapability

| 항목 | 내용 |
|------|------|
| **scheme** | `'personal'` |
| **래핑 대상** | `sign-message.ts`의 signPersonalMessage 경로 |
| **import 관계** | 기존 sign-message.ts 직접 import **없음** — viem의 `signMessage` 함수를 독립적으로 호출 |

#### canSign() 로직

```typescript
canSign(params: SigningParams): boolean {
  if (params.scheme !== 'personal') return false;
  const p = params as PersonalSigningParams;
  return p.message !== undefined && p.message.length > 0 && p.privateKey !== undefined;
}
```

검사 항목:
- `params.scheme === 'personal'`
- `message` 존재 및 비어있지 않음
- `privateKey` 존재

#### sign() 위임 흐름

```typescript
async sign(params: SigningParams): Promise<SigningResult> {
  if (params.scheme !== 'personal') {
    throw new SigningError('Scheme mismatch', 'personal', 'INVALID_PARAMS');
  }
  const p = params as PersonalSigningParams;

  try {
    // viem의 signMessage 직접 호출
    const signature = await signMessage({
      privateKey: p.privateKey,
      message: p.message,
    });

    return { signature };  // hex string, 0x-prefixed
  } catch (err) {
    throw new SigningError(
      `Personal sign failed: ${(err as Error).message}`,
      'personal',
      'SIGNING_FAILED',
      err as Error,
    );
  }
}
```

#### 기존 경로와 분리 보장

| 기존 경로 | 새 경로 |
|----------|---------|
| `POST /v1/wallets/:id/sign-message` | `POST /v1/actions/:provider/:action` |
| sign-message.ts pipeline 직접 호출 | ISignerCapability.sign() 경유 |
| ActionContext.privateKey 사용 | SigningParams.privateKey 사용 |

---

### 2.3 Erc8128SignerCapability

| 항목 | 내용 |
|------|------|
| **scheme** | `'erc8128'` |
| **래핑 대상** | `packages/core/src/erc8128/http-message-signer.ts` |
| **import 관계** | 기존 `HttpMessageSigner` 모듈 **import 허용** (예외) |

#### Import 허용 근거

ERC-8128은 RFC 9421 (HTTP Message Signatures) + EIP-191을 결합한 복합 표준이다. 구현 복잡도가 높아 중복 작성이 불가하며, 기존 모듈이 이미 완전한 구현을 제공한다. 따라서 이 경우에만 예외적으로 기존 모듈을 import하여 위임한다.

- RFC 9421의 서명 기반(Signature Base) 구성 로직이 ~200줄
- covered components, derived components 처리
- content-digest 계산 + 검증
- 이 로직을 복제하면 유지보수 이중 부담 + 표준 불일치 리스크

#### canSign() 로직

```typescript
canSign(params: SigningParams): boolean {
  if (params.scheme !== 'erc8128') return false;
  const p = params as Erc8128SigningParams;
  return (
    p.method !== undefined &&
    p.url !== undefined &&
    p.headers !== undefined &&
    p.privateKey !== undefined &&
    p.chainId !== undefined &&
    p.address !== undefined
  );
}
```

검사 항목:
- `params.scheme === 'erc8128'`
- `method`, `url`, `headers` (HTTP 요청 필수 요소)
- `privateKey`, `chainId`, `address` (EIP-191 서명 필수 요소)

#### sign() 위임 흐름

```typescript
async sign(params: SigningParams): Promise<SigningResult> {
  if (params.scheme !== 'erc8128') {
    throw new SigningError('Scheme mismatch', 'erc8128', 'INVALID_PARAMS');
  }
  const p = params as Erc8128SigningParams;

  try {
    // 기존 HttpMessageSigner 모듈에 위임 (유일한 예외)
    const signer = new HttpMessageSigner({
      privateKey: p.privateKey,
      chainId: p.chainId,
      address: p.address,
    });

    const result = await signer.sign({
      method: p.method,
      url: p.url,
      headers: p.headers,
      body: p.body,
      coveredComponents: p.coveredComponents,
      preset: p.preset,
      ttlSec: p.ttlSec,
      nonce: p.nonce,
    });

    return {
      signature: result.signature,
      metadata: {
        signatureInput: result.signatureInput,
        signedHeaders: result.signedHeaders,
      },
    };
  } catch (err) {
    throw new SigningError(
      `ERC-8128 signing failed: ${(err as Error).message}`,
      'erc8128',
      'SIGNING_FAILED',
      err as Error,
    );
  }
}
```

#### metadata 반환

```typescript
{
  signatureInput: string,      // RFC 9421 Signature-Input 헤더 값
  signedHeaders: Record<string, string>,  // 서명이 포함된 전체 헤더 세트
}
```

`signatureInput`과 `signedHeaders`는 HTTP 요청에 첨부해야 하므로 metadata로 반환한다.

---

### 2.4 TransactionSignerCapability (참조용)

| 항목 | 내용 |
|------|------|
| **scheme** | 해당 없음 (`SigningSchemeEnum`에 `'transaction'`은 없음) |
| **래핑 대상** | `IChainAdapter.signTransaction()` |
| **registry 등록** | **등록하지 않음** |

#### 설계 목적

기존 6-stage pipeline의 `IChainAdapter.signTransaction()`을 ISignerCapability로 표현하는 것이 **가능함**을 보여주되, 실제로 registry에 등록하지 않는다.

```typescript
// 참조용 설계 — 구현 우선순위 낮음
class TransactionSignerCapability implements ISignerCapability {
  readonly scheme: SigningScheme = 'ecdsa-secp256k1'; // 가장 가까운 scheme

  constructor(private readonly chainAdapter: IChainAdapter) {}

  canSign(params: SigningParams): boolean {
    // transaction signing은 이 경로를 사용하지 않으므로 항상 false 반환
    return false;
  }

  async sign(params: SigningParams): Promise<SigningResult> {
    // IChainAdapter.signTransaction()에 위임
    // 실제 구현 시 체인별 직렬화 + 서명 로직 필요
    throw new SigningError(
      'TransactionSignerCapability is reference-only',
      'ecdsa-secp256k1',
      'KEY_NOT_SUPPORTED',
    );
  }
}
```

#### registry 미등록 근거

- `contractCall` kind는 기존 6-stage pipeline 그대로 사용
- ISignerCapability 경로와 별개 — 혼용하면 두 경로가 얽혀 복잡도 증가
- pipeline의 Stage 4 (gas estimation) + Stage 5 (execution) 로직이 signTransaction()에 결합되어 있어 분리 비현실적

#### 향후 활용 시나리오

1. **서명만 필요한 off-chain 시나리오**: 예를 들어, 트랜잭션을 빌드하고 서명만 받아 외부 시스템에 전달하는 경우
2. **멀티 시그 트랜잭션**: 여러 서명자가 각각 서명을 제공하는 경우
3. 이 경우 별도의 `'transaction'` scheme을 `SigningSchemeEnum`에 추가하여 구현 가능

---

## 3. signBytes 2종

### 3.1 EcdsaSignBytesCapability

| 항목 | 내용 |
|------|------|
| **scheme** | `'ecdsa-secp256k1'` |
| **구현 기반** | viem의 `sign()` 또는 `@noble/secp256k1` 직접 사용 |
| **용도** | 크로스체인 메시지, 커스텀 프로토콜, arbitrary bytes signing |

#### canSign() 로직

```typescript
canSign(params: SigningParams): boolean {
  if (params.scheme !== 'ecdsa-secp256k1') return false;
  const p = params as EcdsaSecp256k1SigningParams;
  return (
    p.data !== undefined &&
    p.data.length > 0 &&
    p.privateKey !== undefined
  );
}
```

검사 항목:
- `params.scheme === 'ecdsa-secp256k1'`
- `data` (hex string) 존재 및 비어있지 않음
- `privateKey` (`0x${string}` 형태) 존재

#### sign() 흐름

```typescript
async sign(params: SigningParams): Promise<SigningResult> {
  if (params.scheme !== 'ecdsa-secp256k1') {
    throw new SigningError('Scheme mismatch', 'ecdsa-secp256k1', 'INVALID_PARAMS');
  }
  const p = params as EcdsaSecp256k1SigningParams;

  try {
    const dataBytes = hexToBytes(p.data);

    // hashData 옵션: 기본값 true (keccak256 적용)
    const hashData = (p as any).hashData !== false;
    const messageHash = hashData ? keccak256(dataBytes) : dataBytes;

    // secp256k1 ECDSA sign
    const signature = await sign({
      hash: messageHash,
      privateKey: p.privateKey,
    });

    return {
      signature,  // hex string, 0x-prefixed (65 bytes: r + s + v)
      metadata: {
        hashApplied: hashData,
        algorithm: 'secp256k1',
      },
    };
  } catch (err) {
    throw new SigningError(
      `ECDSA secp256k1 signing failed: ${(err as Error).message}`,
      'ecdsa-secp256k1',
      'SIGNING_FAILED',
      err as Error,
    );
  }
}
```

#### hash 전략

| 시나리오 | hashData | 동작 |
|----------|----------|------|
| raw data 서명 (기본) | `true` (기본값) | keccak256(data) 후 서명 |
| 이미 해시된 데이터 | `false` | data를 직접 서명 (32 bytes여야 함) |

`hashData` 옵션은 `EcdsaSecp256k1SigningParams` 확장으로 구현:

```typescript
export interface EcdsaSecp256k1SigningParams extends BaseSigningParams {
  scheme: 'ecdsa-secp256k1';
  data: string;                 // hex-encoded bytes
  privateKey: `0x${string}`;
  hashData?: boolean;           // default: true (keccak256 적용)
}
```

#### 보안 고려

- **위험성**: raw bytes signing은 임의 데이터에 서명하는 것이므로 피싱/악용 위험이 높음
- **정책 권장**: Phase 384에서 signBytes 액션에 별도 `riskLevel: 'high'` 부여 설계
- **경고 메시지**: sign() 결과의 metadata에 `{ warning: 'raw-bytes-signing' }` 포함하여 호출자에게 위험성 알림

---

### 3.2 Ed25519SignBytesCapability

| 항목 | 내용 |
|------|------|
| **scheme** | `'ed25519'` |
| **구현 기반** | `@solana/kit`의 `signBytes()` 또는 `tweetnacl.sign.detached()` |
| **용도** | Solana native off-chain signing, 커스텀 프로토콜 |

#### canSign() 로직

```typescript
canSign(params: SigningParams): boolean {
  if (params.scheme !== 'ed25519') return false;
  const p = params as Ed25519SigningParams;
  return (
    p.data !== undefined &&
    p.data.length > 0 &&
    p.privateKey !== undefined &&
    p.privateKey.length === 64  // Ed25519 keypair: secret 32 + public 32
  );
}
```

검사 항목:
- `params.scheme === 'ed25519'`
- `data` (hex string) 존재 및 비어있지 않음
- `privateKey` (Uint8Array, 64 bytes) 존재 및 길이 검증

#### sign() 흐름

```typescript
async sign(params: SigningParams): Promise<SigningResult> {
  if (params.scheme !== 'ed25519') {
    throw new SigningError('Scheme mismatch', 'ed25519', 'INVALID_PARAMS');
  }
  const p = params as Ed25519SigningParams;

  try {
    const dataBytes = hexToBytes(p.data);

    // Ed25519는 내부적으로 SHA-512 수행 — 외부 해시 불필요
    // @solana/kit signBytes() 또는 tweetnacl.sign.detached() 사용
    const signatureBytes = await signBytes(p.privateKey, dataBytes);

    // hex로 변환하여 반환
    const signature = bytesToHex(signatureBytes);

    return {
      signature,  // hex string, 64 bytes (512 bits)
      metadata: {
        algorithm: 'ed25519',
        signatureLength: signatureBytes.length,
      },
    };
  } catch (err) {
    throw new SigningError(
      `Ed25519 signing failed: ${(err as Error).message}`,
      'ed25519',
      'SIGNING_FAILED',
      err as Error,
    );
  }
}
```

#### Ed25519 내부 해시

Ed25519 알고리즘은 서명 과정에서 내부적으로 SHA-512를 수행한다. 따라서:
- 외부에서 추가 해시를 적용할 필요 없음
- `hashData` 옵션 불필요 (EcdsaSignBytes와 차이점)
- 입력 데이터를 그대로 전달하면 됨

#### 키 형태

```
Solana keypair (64 bytes):
┌──────────────────────┬──────────────────────┐
│  Secret Key (32B)    │  Public Key (32B)    │
└──────────────────────┴──────────────────────┘
```

- `@solana/kit`의 keypair 형태와 호환
- 기존 SolanaAdapter의 키 관리와 동일한 형태
- `tweetnacl.sign.detached()` 사용 시에도 64-byte keypair 직접 전달 가능

---

## 4. 공통 패턴

### 4.1 canSign narrowing

모든 capability에서 `canSign()`은 다음 패턴을 따른다:

```typescript
canSign(params: SigningParams): boolean {
  // 1. scheme discriminant check
  if (params.scheme !== this.scheme) return false;

  // 2. scheme-specific narrowing (as assertion)
  const p = params as SpecificSigningParams;

  // 3. 필수 필드 존재 확인
  return requiredFields.every(field => p[field] !== undefined);
}
```

`canSign()`이 `true`를 반환하면 `sign()`에서 안전하게 타입 narrowing이 가능하다.

### 4.2 privateKey 메모리 클리어

서명 완료 후 키 메모리를 즉시 클리어하는 것이 원칙이다. 다만, JavaScript에서의 제약:

| 키 타입 | 클리어 방법 | 실효성 |
|---------|-----------|--------|
| `0x${string}` (hex string) | 문자열은 immutable — 클리어 불가 | GC에 의존 |
| `Uint8Array` (Ed25519) | `privateKey.fill(0)` | 즉시 0으로 덮어쓰기 가능 |
| `string` (PEM, HMAC secret) | `Buffer.from(secret).fill(0)` | Buffer만 클리어, 원본 string은 GC에 의존 |

**설계 방침:**
- `Uint8Array` 키는 sign() 완료 후 `fill(0)`으로 즉시 클리어
- hex string 키는 JavaScript 엔진의 GC에 의존 (문자열 immutable 제약)
- 향후 개선: `Uint8Array` 기반 키 전달로 일원화 검토 (별도 마일스톤)

### 4.3 에러 매핑 공통 패턴

모든 capability에서 외부 라이브러리 에러를 `SigningError`로 변환한다:

```typescript
try {
  // 서명 로직
} catch (err) {
  // 에러 유형 분류
  if (isInvalidKeyError(err)) {
    throw new SigningError(msg, this.scheme, 'INVALID_KEY', err);
  }
  if (isInvalidParamsError(err)) {
    throw new SigningError(msg, this.scheme, 'INVALID_PARAMS', err);
  }
  // 기타 모든 에러
  throw new SigningError(msg, this.scheme, 'SIGNING_FAILED', err);
}
```

에러 분류 기준:
- `INVALID_KEY`: 키 형식 오류 (잘못된 hex, PEM 파싱 실패, 길이 불일치)
- `INVALID_PARAMS`: 페이로드 구조 오류 (domain 스키마 불일치, types 누락 등)
- `SIGNING_FAILED`: 서명 연산 자체 실패 (crypto 내부 에러)
- `CREDENTIAL_MISSING`: credential 주입 실패 (CredentialVault 조회 실패)
- `KEY_NOT_SUPPORTED`: 해당 체인에서 지원하지 않는 키 타입

---

## 5. 설계 결정 테이블

| # | 결정 | 근거 |
|---|------|------|
| D1 | Erc8128만 기존 모듈 import 허용 | RFC 9421 구현이 ~200줄로 복잡하여 중복 작성 불가. Eip712/Personal은 viem 함수 1줄 호출이므로 독립 호출이 합리적 |
| D2 | Eip712/Personal은 viem 함수 직접 호출 | sign-message.ts를 import하면 기존 경로와 새 경로가 결합되어 변경 파급 위험. viem 함수는 stateless이므로 독립 호출이 안전 |
| D3 | EcdsaSignBytes는 hashData 옵션으로 hash 여부 제어 | 입력이 이미 32-byte hash인 경우(크로스체인 메시지 등)와 raw data인 경우를 구분. 기본값 true = keccak256 적용 |
| D4 | Ed25519는 외부 해시 불필요 | Ed25519 알고리즘이 내부적으로 SHA-512를 수행하므로 추가 해시는 오히려 표준 위반 |
| D5 | TransactionSignerCapability는 설계만, registry 미등록 | contractCall은 기존 6-stage pipeline 사용. ISignerCapability 경로와 혼용하면 복잡도만 증가 |
| D6 | privateKey 메모리 클리어는 Uint8Array만 확실히 보장 | JavaScript string은 immutable이므로 클리어 불가. Uint8Array.fill(0)만 실효성 있음 |

---

## 6. 전체 capability 매핑 요약

| # | 구현체 | scheme | 래핑 대상 | import 관계 | registry 등록 |
|---|--------|--------|----------|-------------|--------------|
| 1 | Eip712SignerCapability | `eip712` | viem signTypedData | 독립 호출 | O |
| 2 | PersonalSignCapability | `personal` | viem signMessage | 독립 호출 | O |
| 3 | Erc8128SignerCapability | `erc8128` | HttpMessageSigner | 예외적 import | O |
| 4 | TransactionSignerCapability | _(N/A)_ | IChainAdapter | 참조용 | X |
| 5 | EcdsaSignBytesCapability | `ecdsa-secp256k1` | viem sign / noble | 독립 호출 | O |
| 6 | Ed25519SignBytesCapability | `ed25519` | @solana/kit signBytes | 독립 호출 | O |

registry에 실제 등록되는 capability: 5종 (Eip712, Personal, Erc8128, EcdsaSignBytes, Ed25519SignBytes)
(HMAC, RSA-PSS는 Plan 382-02에서 설계)

---

*Phase: 382-signer-capabilities, Plan: 01*
*작성일: 2026-03-11*
