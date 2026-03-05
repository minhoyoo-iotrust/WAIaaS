# Technology Stack: ERC-8128 Signed HTTP Requests

**Project:** WAIaaS v30.10 - ERC-8128 Signed HTTP Requests
**Researched:** 2026-03-05

## Recommended Stack

### RFC 9421 HTTP Message Signatures

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **자체 구현** | - | RFC 9421 Signature Base 구성, Signature-Input 빌더 | 기존 npm 라이브러리들이 secp256k1/EIP-191 커스텀 서명을 충분히 지원하지 않음. 핵심 로직이 Signature Base 문자열 구성(RFC 9421 SS2.5)이며 이는 문자열 조작으로 ~150 LOC 이내 구현 가능 |

**근거:** 조사한 3개 라이브러리 비교:

| Library | Version | RFC 9421 | Custom Signer | 문제점 |
|---------|---------|----------|---------------|--------|
| `http-message-signatures` (dhensby) | 1.0.4 | Yes (draft 13 기준) | Yes (pluggable) | Draft 기준, 1년 전 마지막 업데이트, RFC final 반영 미확인 |
| `@misskey-dev/node-http-message-signatures` | 0.0.10 | Yes | No (Ed25519/RSA만) | secp256k1 미지원, ActivityPub 특화 |
| `@slicekit/erc8128` | 0.2.0 | Yes | viem 연동 | npm 미발행 (GitHub only), 0.x 초기 단계 |

**자체 구현 선택 이유:**
1. RFC 9421 Signature Base 구성은 명세가 명확하고 구현 범위가 작음 (Covered Components 직렬화 + @signature-params 조립)
2. ERC-8128은 서명 알고리즘으로 EIP-191 `personal_sign`을 사용하며, 이미 viem의 `signMessage()`로 구현 완료
3. 외부 라이브러리 도입 시 (a) secp256k1 어댑터 작성 필요, (b) 라이브러리 업데이트 추적 부담, (c) Draft 기반 코드의 RFC final 불일치 리스크
4. `@slicekit/erc8128`는 참조 구현으로 활용하되 직접 의존하지 않음 (npm 미발행, 0.x 불안정)

### Structured Fields (RFC 8941)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `structured-headers` | 2.0.2 | Signature-Input/Signature 헤더의 Structured Fields 직렬화/파싱 | 573K weekly downloads, 2805 unit tests (HTTP WG 공식 테스트 슈트), 0 dependencies, TypeScript, ESM+CJS. RFC 9421의 Signature-Input 헤더가 RFC 8941 Inner List + Parameters 형식을 사용하므로 필수 |

**Confidence:** HIGH -- 이 라이브러리는 사실상 Node.js 생태계의 RFC 8941 표준 구현. 573K weekly downloads, HTTP WG 공식 테스트 슈트 통과, 활발히 유지보수됨 (최근 1개월 내 업데이트).

### Content-Digest (RFC 9530)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Node.js crypto (내장)** | - | SHA-256 해시 생성 → Content-Digest 헤더 값 | RFC 9530 Content-Digest는 `sha-256=:base64(SHA-256(body)):` 형식. `crypto.createHash('sha256').update(body).digest('base64')` 한 줄로 구현 가능. 별도 라이브러리 불필요 |

**근거:** RFC 9530 전용 npm 패키지가 존재하지 않음. Content-Digest 생성은 (1) body를 SHA-256 해싱, (2) Base64 인코딩, (3) `sha-256=:...:` 형식으로 래핑 -- 이 3단계가 전부. Node.js 내장 crypto로 충분.

### ERC-8128 Specific

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **참조만: @slicekit/erc8128** | 0.2.0 (GitHub) | 구현 참조용 (keyid 형식, nonce 전략, 서명 흐름) | npm 미발행, 0.x 초기 단계이므로 직접 의존하지 않음. MIT 라이선스이므로 로직 참조 가능. 유일한 dep이 `@noble/hashes`이며 viem이 이미 내부적으로 noble 사용 |

### Crypto Primitives

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `viem` (기존) | 2.x | EIP-191 `signMessage()`, `recoverAddress()` | 이미 프로젝트에 포함. ERC-8128 서명(secp256k1 + personal_sign)에 필요한 모든 crypto primitive 제공 |
| Node.js `crypto` (내장) | - | SHA-256 해싱 (Content-Digest) | 추가 설치 불필요 |

**추가 crypto primitive 불필요 확인:**
- ERC-8128은 EIP-191 personal_sign (secp256k1) 사용 -- viem이 이미 제공
- Content-Digest는 SHA-256 -- Node.js crypto 내장
- P-256 등 추가 알고리즘은 ERC-8128 스펙에서 요구하지 않음 (현재 Draft 상태에서 secp256k1만 정의)
- `@noble/hashes`는 @slicekit/erc8128의 유일한 dep이지만, WAIaaS는 viem을 통해 이미 noble 계열 사용 중이므로 별도 추가 불필요

## 신규 의존성 요약

### Production Dependencies (1개만 추가)

```bash
# packages/core에 추가
pnpm add structured-headers
```

| Package | Size | Dependencies | Weekly Downloads | 근거 |
|---------|------|--------------|-----------------|------|
| `structured-headers` | ~30KB | 0 | 573K | RFC 8941 Structured Fields 파싱/직렬화. Signature-Input 헤더 구성에 필수 |

### Dev Dependencies

추가 없음.

### 추가하지 않는 패키지

| Package | Why Not |
|---------|---------|
| `http-message-signatures` | Draft 13 기준, secp256k1 어댑터 작성 필요, 자체 구현이 더 단순 |
| `@misskey-dev/node-http-message-signatures` | secp256k1 미지원 (Ed25519/RSA only), ActivityPub 특화 |
| `@slicekit/erc8128` | npm 미발행, 0.x 초기 단계, 참조만 활용 |
| `@noble/hashes` | viem이 이미 내부적으로 사용, 직접 의존 불필요 |
| `http-message-sig` | ltonetwork fork, 0.1.0, 6개월 전 발행, 불안정 |

## 기존 스택 활용 (변경 없음)

| 기존 기술 | ERC-8128에서의 역할 |
|-----------|-------------------|
| `viem 2.x` | signMessage (EIP-191), recoverAddress (검증) |
| `OpenAPIHono 4.x` | POST /v1/erc8128/sign, /verify 라우트 |
| `Drizzle + SQLite` | ERC8128_ALLOWED_DOMAINS 정책 저장 (기존 policies 테이블) |
| `jose` | 세션 인증 (기존 sessionAuth) |
| `zod` | 요청/응답 스키마 (SignHttpRequestSchema 등) |
| Node.js `crypto` | SHA-256 해싱 (Content-Digest) |

## ERC-8128 스펙 현황 (리서치 결과)

| 항목 | 현재 상태 | Confidence |
|------|----------|------------|
| EIP Status | **Draft** (2026-01 제안, jacopo-eth) | HIGH |
| 서명 알고리즘 | secp256k1 + EIP-191 personal_sign | HIGH |
| keyid 형식 | `erc8128:<chainId>:<address>` (주 형식), 대안으로 `erc8128;eip155:<chainId>:<address>` 논의 중 | MEDIUM -- 형식 미확정 |
| Nonce | 현재 mandatory (strict nonce-based replay protection), 일부 커뮤니티에서 optional 논의 중 | MEDIUM |
| Covered Components | RFC 9421 SS2 기반 (@method, @target-uri, content-digest 등) | HIGH |
| 참조 구현 | @slicekit/erc8128 (GitHub only, 0.2.0, TypeScript, MIT) | HIGH |
| 생태계 채택 | 매우 초기 단계. ERC-8128 지원 API 서비스 미확인 | HIGH |

## 통합 포인트

### structured-headers 사용 위치

```typescript
// Signature-Input 헤더 구성 시
import { serializeInnerList, serializeDict } from 'structured-headers';

// Signature-Input: sig1=("@method" "@target-uri" "content-digest");created=1709251200;keyid="erc8128:1:0xAbC..."
const signatureInput = serializeDict(new Map([
  ['sig1', [
    // Inner List: covered components
    [['@method', new Map()], ['@target-uri', new Map()], ['content-digest', new Map()]],
    // Parameters
    new Map([
      ['created', 1709251200],
      ['keyid', 'erc8128:1:0xAbC...'],
      ['alg', 'eip191-secp256k1'],
      ['nonce', 'uuid-v4'],
    ])
  ]]
]));

// Signature 헤더 구성 시
// Signature: sig1=:base64signature:
const signature = serializeDict(new Map([
  ['sig1', [new Uint8Array(signatureBytes), new Map()]]
]));
```

### 검증 시 파싱

```typescript
import { parseDictionary } from 'structured-headers';

// 수신된 Signature-Input 헤더 파싱
const parsed = parseDictionary(signatureInputHeader);
const [innerList, params] = parsed.get('sig1');
// innerList: covered components 배열
// params: created, keyid, alg, nonce 등
```

## Sources

- [structured-headers npm](https://www.npmjs.com/package/structured-headers) -- 573K weekly downloads, RFC 8941/9651 구현
- [http-message-signatures (dhensby)](https://github.com/dhensby/node-http-message-signatures) -- RFC 9421 구현, custom signer 지원
- [@misskey-dev/node-http-message-signatures](https://github.com/misskey-dev/node-http-message-signatures) -- RFC 9421 + RFC 9530, Ed25519/RSA only
- [@slicekit/erc8128](https://github.com/slice-so/erc8128) -- 유일한 ERC-8128 참조 구현, npm 미발행
- [ERC-8128 EIP](https://eip.tools/eip/8128) -- Draft 상태
- [ERC-8128 Discussion](https://ethereum-magicians.org/t/erc-8128-signed-http-requests-with-ethereum/27515) -- keyid/nonce 논의 진행 중
- [RFC 9421](https://www.rfc-editor.org/rfc/rfc9421) -- HTTP Message Signatures (Published)
- [RFC 9530](https://www.rfc-editor.org/rfc/rfc9530) -- Digest Fields (Published)
- [RFC 8941](https://www.rfc-editor.org/rfc/rfc8941) -- Structured Field Values (Published)
