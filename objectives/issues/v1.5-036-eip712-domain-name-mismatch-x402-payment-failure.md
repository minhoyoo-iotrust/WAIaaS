# v1.5-036: x402 EIP-712 도메인 name 불일치로 결제 서명 검증 실패

## 유형

BUG

## 심각도

HIGH

## 마일스톤

v1.5.1

## 증상

Base Sepolia 테스트넷에서 x402 자동 결제(`POST /v1/x402/fetch`) 실행 시, WAIaaS가 EIP-3009 서명을 생성하고 `PAYMENT-SIGNATURE` 헤더로 재요청하지만, 리소스 서버(facilitator)가 `invalid_exact_evm_payload_signature` 에러로 결제를 거부하여 `X402_PAYMENT_REJECTED` 반환.

## 근본 원인

`signEip3009()` 함수가 EIP-712 도메인 분리자의 `name` 필드를 하드코딩 `USDC_DOMAINS` 테이블에서 조회했으나, 해당 테이블의 Base Sepolia 값(`"USD Coin"`)이 실제 온체인 USDC 컨트랙트 및 @x402/evm 라이브러리가 사용하는 값(`"USDC"`)과 달랐음.

### 상세 메커니즘

```
[수정 전 흐름]

1. 리소스 서버 → 402 응답, accepts[].extra = { name: "USDC", version: "2" }
2. WAIaaS signEip3009() → USDC_DOMAINS["eip155:84532"].name = "USD Coin" 사용
3. EIP-712 domain separator hash = keccak256("USD Coin" || "2" || 84532 || 0x036C...)
4. 서명 생성 (도메인 해시 기반)
5. 리소스 서버 검증 → extra.name="USDC"로 도메인 해시 재계산 → ecrecover 주소 불일치
6. 결과: invalid_exact_evm_payload_signature
```

EIP-712 서명은 도메인 분리자의 모든 필드(name, version, chainId, verifyingContract)가 서명 시점과 검증 시점에서 정확히 일치해야 한다. `name` 필드가 한 글자라도 다르면 도메인 해시가 완전히 달라져서 `ecrecover`가 다른 주소를 반환한다.

## 수정 내용

**파일**: `packages/daemon/src/services/x402/payment-signer.ts` (`signEip3009` 함수)

### 수정 전

```typescript
const domain = USDC_DOMAINS[requirements.network];
if (!domain) {
  throw new WAIaaSError('X402_UNSUPPORTED_SCHEME', {
    message: `No USDC domain configured for network: ${requirements.network}`,
  });
}

const signature = await account.signTypedData({
  domain: {
    name: domain.name,
    version: domain.version,
    chainId: BigInt(chainId),
    verifyingContract: domain.verifyingContract as Hex,
  },
  ...
});
```

### 수정 후

```typescript
// Resolve EIP-712 domain: prefer server-provided extra.name/version (x402 v2 spec),
// fall back to USDC_DOMAINS table for backward compatibility.
const extra = requirements.extra as Record<string, unknown> | undefined;
const domainName = (extra?.name as string) ?? USDC_DOMAINS[requirements.network]?.name;
const domainVersion = (extra?.version as string) ?? USDC_DOMAINS[requirements.network]?.version;
if (!domainName || !domainVersion) {
  throw new WAIaaSError('X402_UNSUPPORTED_SCHEME', {
    message: `No EIP-712 domain (name/version) for network: ${requirements.network}`,
  });
}

const signature = await account.signTypedData({
  domain: {
    name: domainName,
    version: domainVersion,
    chainId: BigInt(chainId),
    verifyingContract: requirements.asset as Hex,  // asset 직접 사용
  },
  ...
});
```

### 변경 요약

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| domain.name | `USDC_DOMAINS[network].name` 고정 | `extra.name ?? USDC_DOMAINS[network].name` |
| domain.version | `USDC_DOMAINS[network].version` 고정 | `extra.version ?? USDC_DOMAINS[network].version` |
| verifyingContract | `USDC_DOMAINS[network].verifyingContract` | `requirements.asset` (서버 제공값 직접 사용) |
| extra 미제공 시 | 정상 (USDC_DOMAINS 사용) | 동일 (fallback) |
| 미등록 네트워크 + extra 없음 | X402_UNSUPPORTED_SCHEME | 동일 |

## 재발 방지 테스트

기존 `payment-signer.test.ts`의 테스트 커버리지 부족 3건을 추가해야 한다.

### 테스트 1: extra.name 우선 사용 검증 (핵심 회귀 테스트)

```typescript
it('extra.name/version이 제공되면 USDC_DOMAINS 대신 사용한다', async () => {
  // extra.name = "USDC" (USDC_DOMAINS의 "USD Coin"과 다른 값)
  const requirements = makeEvmRequirements({
    extra: { name: 'USDC', version: '2' },
  });
  const result = await signEip3009(requirements, EVM_PRIVATE_KEY, EVM_WALLET_ADDRESS);

  const payload = result.payload as Record<string, unknown>;
  const auth = payload.authorization as Record<string, unknown>;
  const signature = payload.signature as Hex;

  // "USDC" 도메인으로 검증해야 성공
  const recoveredAddress = await recoverTypedDataAddress({
    domain: {
      name: 'USDC',  // extra.name 값
      version: '2',
      chainId: BigInt(84532),
      verifyingContract: requirements.asset as Hex,
    },
    types: { TransferWithAuthorization: [...] },
    primaryType: 'TransferWithAuthorization',
    message: { from, to, value, validAfter, validBefore, nonce },
    signature,
  });
  expect(recoveredAddress.toLowerCase()).toBe(EVM_WALLET_ADDRESS.toLowerCase());

  // "USD Coin" 도메인으로 검증하면 실패해야 함 (다른 주소 반환)
  const wrongRecovered = await recoverTypedDataAddress({
    domain: { name: 'USD Coin', ... },
    ...
    signature,
  });
  expect(wrongRecovered.toLowerCase()).not.toBe(EVM_WALLET_ADDRESS.toLowerCase());
});
```

### 테스트 2: extra 미제공 시 USDC_DOMAINS fallback

```typescript
it('extra가 비어있으면 USDC_DOMAINS 테이블로 fallback한다', async () => {
  const requirements = makeEvmRequirements({ extra: {} });
  const result = await signEip3009(requirements, EVM_PRIVATE_KEY, EVM_WALLET_ADDRESS);

  const payload = result.payload as Record<string, unknown>;
  const signature = payload.signature as Hex;
  const auth = payload.authorization as Record<string, unknown>;

  // USDC_DOMAINS["eip155:84532"].name = "USD Coin"으로 검증 성공
  const recoveredAddress = await recoverTypedDataAddress({
    domain: {
      name: 'USD Coin',
      version: '2',
      chainId: BigInt(84532),
      verifyingContract: requirements.asset as Hex,
    },
    ...
    signature,
  });
  expect(recoveredAddress.toLowerCase()).toBe(EVM_WALLET_ADDRESS.toLowerCase());
});
```

### 테스트 3: extra/USDC_DOMAINS 모두 없으면 에러

```typescript
it('extra와 USDC_DOMAINS 모두 없으면 X402_UNSUPPORTED_SCHEME 에러', async () => {
  const requirements = makeEvmRequirements({
    network: 'eip155:999999',
    extra: {},
  });

  await expect(
    signEip3009(requirements, EVM_PRIVATE_KEY, EVM_WALLET_ADDRESS),
  ).rejects.toThrow(/X402_UNSUPPORTED_SCHEME|No EIP-712 domain/);
});
```

## 연관 이슈

- #035: USDC_DOMAINS 하드코딩 테이블과 실제 온체인 도메인 불일치 (ENHANCEMENT — 테이블 자체 정리)
- 테스트 결과: `how-to-test/x402-test-240216/`

## 검증

- Base Sepolia 테스트넷 결제 성공 확인 (tx: `0xd689347219ff139e7659a16ef07d043304942bb3fa27eca3f1a4e94dbeed9076`)
- 기존 단위 테스트 23개 전체 통과 (`payment-signer.test.ts`)
- x402 관련 테스트 83개 전체 통과 (`x402-*.test.ts` 4개 파일)
