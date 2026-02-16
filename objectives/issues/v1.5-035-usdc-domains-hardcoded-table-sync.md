# v1.5-035: USDC_DOMAINS 하드코딩 테이블과 실제 온체인 도메인 불일치

## 유형

ENHANCEMENT

## 심각도

MEDIUM

## 마일스톤

v1.5.1

## 증상

x402 테스트넷(Base Sepolia) 결제 시 `invalid_exact_evm_payload_signature` 오류 발생.

## 근본 원인

`payment-signer.ts`의 `USDC_DOMAINS` 테이블이 EIP-712 도메인 `name`을 네트워크별로 하드코딩하고 있으나, 실제 온체인 USDC 컨트랙트 및 @x402/evm 라이브러리와 값이 다른 경우가 있음.

| 네트워크 | WAIaaS (기존) | @x402/evm 실제 | 일치 |
|----------|--------------|----------------|------|
| eip155:8453 (Base Mainnet) | `USD Coin` | `USD Coin` | O |
| eip155:84532 (Base Sepolia) | `USD Coin` | `USDC` | **X** |
| eip155:1 (Ethereum) | `USD Coin` | 미확인 | ? |
| eip155:11155111 (Eth Sepolia) | `USD Coin` | 미확인 | ? |
| eip155:137 (Polygon) | `USD Coin` | 미확인 | ? |
| eip155:42161 (Arbitrum) | `USD Coin` | 미확인 | ? |
| eip155:10 (Optimism) | `USD Coin` | 미확인 | ? |

## 현재 상태 (긴급 패치 적용)

`signEip3009()`가 서버가 402 응답의 `extra.name`/`extra.version`으로 제공하는 값을 우선 사용하고, `USDC_DOMAINS`는 fallback으로 사용하도록 수정 완료.

이 패치로 실제 결제는 정상 동작하나, `USDC_DOMAINS` 테이블 자체는 여전히 부정확한 값을 포함하고 있음.

## 개선 방안

### 옵션 A: USDC_DOMAINS 테이블 값 수정 (최소)

각 네트워크의 실제 USDC 컨트랙트에서 `eip712Domain()` 또는 `name()` view 함수를 호출하여 정확한 값으로 테이블 갱신.

### 옵션 B: USDC_DOMAINS 테이블 폐기 (권장)

x402 프로토콜 V2는 서버가 `extra.name`/`extra.version`을 제공하므로 하드코딩 테이블 불필요. `extra`에 값이 없는 경우에만 온체인 `eip712Domain()` 호출로 동적 조회하는 방식으로 전환.

### 옵션 C: 온체인 동적 조회 + 캐시

`publicClient.readContract({ functionName: 'eip712Domain' })` 호출 후 메모리 캐시. `USDC_DOMAINS` 테이블은 캐시 미적중 시 오프라인 fallback으로만 유지.

## 수정 대상 파일

- `packages/daemon/src/services/x402/payment-signer.ts` — `USDC_DOMAINS` 테이블 + `signEip3009()`
- `packages/daemon/src/__tests__/payment-signer.test.ts` — 테스트 갱신

## 관련

- x402 테스트 결과: `how-to-test/x402-test-240216/`
- 긴급 패치: `signEip3009()`에서 `extra.name`/`extra.version` 우선 사용
