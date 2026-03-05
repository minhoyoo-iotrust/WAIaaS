# Architecture Patterns: ERC-8128 Signed HTTP Requests

**Domain:** HTTP 메시지 서명 (RFC 9421 + Ethereum)
**Researched:** 2026-03-05

## Recommended Architecture

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `erc8128/http-message-signer.ts` | RFC 9421 Signature Base 구성 + EIP-191 서명 오케스트레이션 | content-digest, signature-input-builder, keyid, viem |
| `erc8128/signature-input-builder.ts` | Signature-Input 헤더 직렬화 (RFC 8941 Structured Fields) | structured-headers 라이브러리 |
| `erc8128/content-digest.ts` | RFC 9530 Content-Digest 생성 (SHA-256) | Node.js crypto |
| `erc8128/keyid.ts` | keyid 형식 생성/파싱 (`erc8128:<chainId>:<address>`) | 없음 (pure function) |
| `erc8128/verifier.ts` | 서명 검증 (ecrecover + Signature Base 재구성) | signature-input-builder, content-digest, viem |
| `erc8128/types.ts` | Zod 스키마 + TypeScript 타입 | zod |
| `erc8128/constants.ts` | 알고리즘 ID, Covered Components 프리셋, 기본값 | 없음 |
| Route handler (daemon) | POST /v1/erc8128/sign, /verify 전용 라우트 | http-message-signer, policy engine, session auth |
| ERC8128 domain policy | ERC8128_ALLOWED_DOMAINS 평가 | policies 테이블 (기존) |

### Data Flow: 서명 생성

```
Agent Request (POST /v1/erc8128/sign)
    |
    v
[1] Route Handler
    ├── sessionAuth 검증 (기존)
    ├── erc8128.enabled 확인 (Admin Settings)
    ├── 지갑 EVM 체인 검증
    └── ERC8128_ALLOWED_DOMAINS 정책 직접 평가
    |
    v
[2] http-message-signer.ts (오케스트레이터)
    ├── content-digest.ts: body → SHA-256 → Content-Digest 헤더
    ├── signature-input-builder.ts: Covered Components + Params → Signature-Input 헤더
    ├── Signature Base 구성 (RFC 9421 §2.5 직렬화)
    └── viem signMessage(signatureBase) → Signature 헤더
    |
    v
[3] Response: { headers: { Signature-Input, Signature, Content-Digest }, keyid, expires, ... }
```

### Data Flow: 서명 검증

```
Verify Request (POST /v1/erc8128/verify)
    |
    v
[1] Route Handler
    └── sessionAuth 검증
    |
    v
[2] verifier.ts
    ├── Signature-Input 파싱 (structured-headers parseDictionary)
    ├── Covered Components + Params 추출
    ├── Content-Digest 검증 (body 해시 일치)
    ├── Signature Base 재구성 (RFC 9421 §2.5)
    └── viem recoverMessageAddress(signatureBase, signature)
    |
    v
[3] Response: { valid, recoveredAddress, keyid, error? }
```

## Patterns to Follow

### Pattern 1: 전용 라우트 (Pipeline Bypass)

**What:** ERC-8128 서명은 6-stage 트랜잭션 파이프라인을 경유하지 않고 전용 라우트 핸들러에서 처리한다.
**When:** HTTP 서명은 트랜잭션이 아닌 인증 메커니즘이므로 파이프라인 구조에 맞지 않을 때.
**Precedent:** x402 서명도 동일 패턴 (전용 라우트 + 정책 직접 평가).

```typescript
// daemon/routes/erc8128.ts
app.post('/v1/erc8128/sign', sessionAuth, async (c) => {
  // 1. Feature gate
  if (!settings.get('erc8128.enabled')) throw new WAIaaSError(403, 'ERC8128_DISABLED');

  // 2. EVM chain validation
  const wallet = await walletService.getWallet(body.walletId);
  if (wallet.chain !== 'evm') throw new WAIaaSError(422, 'EVM_NETWORK_REQUIRED');

  // 3. Policy evaluation (직접, not through pipeline)
  const policyResult = await evaluateErc8128Policy(wallet.id, targetDomain);
  if (!policyResult.allowed) throw new WAIaaSError(403, 'ERC8128_DOMAIN_NOT_ALLOWED');

  // 4. Sign
  const result = await httpMessageSigner.sign(body, wallet);
  return c.json(result);
});
```

### Pattern 2: X402 도메인 정책 재사용

**What:** ERC8128_ALLOWED_DOMAINS는 X402_ALLOWED_DOMAINS와 동일한 구조 (allowed_domains, default_deny, 와일드카드).
**When:** 도메인 기반 접근 제어가 필요할 때.
**Precedent:** x402-domain-policy.ts

```typescript
// 정책 평가 함수 -- x402-domain-policy.ts와 동일 패턴
async function evaluateErc8128Policy(
  walletId: string,
  targetDomain: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const policy = await policyRepository.findByType(walletId, 'ERC8128_ALLOWED_DOMAINS');

  if (!policy) return { allowed: false, reason: 'No ERC8128_ALLOWED_DOMAINS policy configured' };
  if (!policy.rules.default_deny) return { allowed: true };

  const domainAllowed = isDomainAllowed(targetDomain, policy.rules.allowed_domains);
  return { allowed: domainAllowed, reason: domainAllowed ? undefined : 'Domain not in allowed list' };
}
```

### Pattern 3: Structured Fields 상수 분리

**What:** ERC-8128 Draft 스펙에서 변경 가능한 값(keyid 형식, alg ID)을 constants.ts에 상수로 분리.
**When:** 외부 표준 의존 시 스펙 변경 대비.

```typescript
// erc8128/constants.ts
export const ERC8128_KEYID_PREFIX = 'erc8128';
export const ERC8128_KEYID_SEPARATOR = ':';
export const ERC8128_DEFAULT_ALGORITHM = 'eip191-secp256k1';
export const ERC8128_SIGNATURE_LABEL = 'sig1';

// keyid 형식이 변경되면 여기만 수정
export function formatKeyId(chainId: number, address: string): string {
  return `${ERC8128_KEYID_PREFIX}${ERC8128_KEYID_SEPARATOR}${chainId}${ERC8128_KEYID_SEPARATOR}${address}`;
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: 파이프라인 경유

**What:** ERC-8128 서명을 SIGN 타입으로 6-stage 파이프라인에 통과시키는 것.
**Why bad:** (1) Stage 1~6 구조가 트랜잭션용이며 HTTP 서명에 불필요한 단계 다수, (2) discriminatedUnion에 새 타입 추가는 기존 7개 타입의 테스트/검증에 영향, (3) Signature Base 구성이라는 RFC 9421 특유 로직이 파이프라인에 부적합.
**Instead:** 전용 라우트 핸들러에서 정책 평가 + 서명 생성을 일체형으로 처리.

### Anti-Pattern 2: Content-Digest 외부 라이브러리

**What:** RFC 9530 Content-Digest 생성을 위해 별도 npm 패키지를 도입하는 것.
**Why bad:** SHA-256 해시 + Base64 인코딩 + 형식 래핑으로 3줄 코드. 외부 의존성 추가는 오버엔지니어링.
**Instead:** Node.js `crypto.createHash('sha256').update(body).digest('base64')` 직접 사용.

### Anti-Pattern 3: 서명 로그 DB 저장

**What:** 모든 ERC-8128 서명 이력을 DB에 저장하는 것.
**Why bad:** 금전 리스크 없는 인증 서명이므로 스토리지 비용 대비 가치 없음. 트랜잭션과 달리 감사 추적이 불필요.
**Instead:** 알림 이벤트(ERC8128_SIGNATURE_CREATED, ERC8128_DOMAIN_BLOCKED)로 옵저버빌리티 확보.

## Scalability Considerations

| Concern | 단일 에이전트 | 10+ 에이전트 | 비고 |
|---------|-------------|-------------|------|
| Rate limit counter | Map<domain, counter> | 동일 (단일 데몬) | WAIaaS는 self-hosted 단일 인스턴스, 수평 확장 N/A |
| 서명 성능 | <10ms/서명 | <10ms/서명 | secp256k1 서명은 CPU 바운드지만 매우 빠름 |
| Nonce 유일성 | UUID v4 충돌 확률 무시 가능 | 동일 | 데몬 재시작 시 카운터 리셋 (의도적) |

## Sources

- [RFC 9421 SS2.5 (Signature Base)](https://www.rfc-editor.org/rfc/rfc9421#section-2.5) -- Signature Base 구성 규칙
- [RFC 9530](https://www.rfc-editor.org/rfc/rfc9530) -- Content-Digest 형식
- m30-10 설계 문서 D12 (파이프라인 바이패스 결정)
- x402 구현 패턴 (v1.5.1)
