# 266 — Smart Account 팩토리별 지원 네트워크 표시 (하이브리드 검증)

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** FIXED
- **마일스톤:** —
- **수정일:** 2026-03-07

## 현상

Smart Account(AA) 지갑의 팩토리 컨트랙트는 모든 EVM 체인에 배포된 것이 아니다. 현재 v0.7 SimpleAccount Factory(`0x91E6...`)는 주요 EVM 체인에 배포되어 있으나, 향후 EVM 체인이 추가되면 해당 팩토리가 미배포인 네트워크에서 AA 지갑이 동작 불가할 수 있다.

현재 REST API(`GET /v1/wallets/:id`) 응답에 `factoryAddress`는 포함되지만, 해당 팩토리가 어떤 네트워크를 지원하는지 정보가 없어 사용자와 에이전트가 AA 지갑의 네트워크 호환성을 판단할 수 없다.

## 기대 동작

하이브리드 방식으로 팩토리별 지원 네트워크를 관리하고 API 응답에 포함한다.

### 1. 정적 리스트 (기본)

팩토리 주소별 알려진 지원 네트워크 상수 관리:

```ts
const FACTORY_SUPPORTED_NETWORKS: Record<Address, string[]> = {
  [DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07]: [
    'ethereum-mainnet', 'ethereum-sepolia', 'base-mainnet', 'base-sepolia',
    'polygon-mainnet', 'arbitrum-mainnet', 'optimism-mainnet', ...
  ],
  [SOLADY_FACTORY_ADDRESS]: ['ethereum-mainnet', 'ethereum-sepolia'], // deprecated
};
```

### 2. 런타임 검증 (보완)

지갑 생성 시점 또는 최초 조회 시 `eth_getCode`로 해당 네트워크에 팩토리 코드 존재 여부 확인. 결과를 캐시(TTL 24시간)하여 RPC 부담 최소화.

### 3. API 응답 확장

`GET /v1/wallets/:id` 응답에 팩토리 지원 네트워크 정보 추가:

```json
{
  "factoryAddress": "0x91E6...",
  "factorySupportedNetworks": ["ethereum-mainnet", "base-mainnet", ...],
  "factoryVerifiedOnNetwork": true
}
```

- `factorySupportedNetworks`: 정적 리스트 기반 전체 지원 네트워크 목록
- `factoryVerifiedOnNetwork`: 현재 요청 네트워크(또는 지갑의 활성 네트워크)에서 실제 `eth_getCode` 검증 결과

### 4. Admin UI 표시

지갑 상세 페이지에서 Smart Account인 경우:
- 지원 네트워크 목록 표시
- 미지원 네트워크에서 트랜잭션 시도 시 사전 경고

## 수정 대상

- `packages/daemon/src/infrastructure/smart-account/smart-account-service.ts` — 팩토리별 지원 네트워크 상수 + `eth_getCode` 검증 로직 + 캐시
- `packages/daemon/src/api/routes/wallets.ts` — 지갑 조회 응답에 `factorySupportedNetworks`, `factoryVerifiedOnNetwork` 추가
- `packages/core/src/schemas/` — 지갑 응답 스키마 확장
- `packages/admin/src/pages/wallets.tsx` — 지갑 상세에 지원 네트워크 목록 + 미지원 경고 표시
- `packages/daemon/src/api/routes/connect-info.ts` — 에이전트 프롬프트에 AA 네트워크 호환성 정보 포함
- `skills/wallet.skill.md` — 지갑 조회 응답 스키마 변경 반영 (factorySupportedNetworks, factoryVerifiedOnNetwork)

## 테스트 항목

- [ ] 정적 리스트에 등록된 팩토리의 지원 네트워크가 API 응답에 포함되는지 확인
- [ ] 미등록 팩토리(커스텀)인 경우 빈 배열 반환 + `factoryVerifiedOnNetwork` 런타임 검증으로 폴백
- [ ] `eth_getCode` 검증 결과가 캐시되고 TTL 경과 후 갱신되는지 확인
- [ ] RPC 실패 시 정적 리스트로 폴백하고 `factoryVerifiedOnNetwork`가 null 반환되는지 확인
- [ ] Admin UI 지갑 상세에서 지원 네트워크 목록이 표시되는지 확인
- [ ] EOA 지갑에서는 팩토리 관련 필드가 응답에 포함되지 않는지 확인
