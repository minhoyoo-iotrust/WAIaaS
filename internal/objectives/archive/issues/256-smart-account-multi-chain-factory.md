# #256 Smart Account 멀티체인 Factory 전환 (permissionless.js)

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **마일스톤:** v31.3
- **상태:** FIXED

## 현상

현재 Smart Account가 viem의 `toSoladySmartAccount()` 기본 factory(`0x5d82735936c6Cd5DE57cC3c1A799f6B2E6F933Df`)만 사용한다. 이 Solady ERC4337Factory는 **ethereum-mainnet과 ethereum-sepolia에만 배포**되어 있어서, base-sepolia/polygon/arbitrum/optimism 등 다른 체인에서는 Smart Account 생성 및 트랜잭션이 실패한다.

### 에러 상황

```
Smart Account Factory 컨트랙트(0x5d82...933Df)에서 getAddress 호출 실패
— Factory가 해당 체인에 배포되지 않음
```

- `toSoladySmartAccount()`의 `getAddress()`가 on-chain `readContract`를 호출 → factory 미존재 시 revert
- Pimlico paymaster 활성화 여부와 무관하게, factory 호출 단계에서 실패

## 원인

- `SmartAccountService.createSmartAccount()`가 viem의 `toSoladySmartAccount()`에 `factoryAddress` 옵션 없이 호출
- viem 기본값 `0x5d82735936c6Cd5DE57cC3c1A799f6B2E6F933Df` 사용
- Solady ERC4337Factory는 Vectorized가 ethereum-mainnet/sepolia에만 배포

## 해결 방안

### 1. permissionless.js 도입

viem의 `toSoladySmartAccount()` 대신 [permissionless.js](https://github.com/pimlicoHQ/permissionless.js)의 Smart Account 구현체(Safe, Kernel, Simple 등)를 사용한다.

- 이들 factory는 주요 EVM 체인 대부분에 배포되어 있음
- permissionless.js는 **provider-agnostic** — Pimlico/Alchemy/Custom 모두 호환
- EntryPoint v0.7 지원

### 2. 기존 AA 지갑 deprecation 처리

Factory가 바뀌면 CREATE2 주소가 달라지므로 기존 Solady factory로 생성된 AA 지갑은 사용 불가.

- DB `wallets` 테이블에 `factory_address` 컬럼 추가 (마이그레이션)
- 기존 AA 지갑에 Solady factory 주소 backfill
- UserOp build/sign/send 진입점에서 현재 활성 factory와 `factory_address` 비교
- 불일치 시 `DEPRECATED_SMART_ACCOUNT` 에러 반환:
  ```
  DEPRECATED_SMART_ACCOUNT: This Smart Account was created with a deprecated factory.
  Please create a new Smart Account wallet.
  ```

## 변경 범위

| 작업 | 파일 |
|------|------|
| permissionless.js 의존성 추가 | `package.json` |
| SmartAccountService 교체 | `packages/daemon/src/infrastructure/smart-account/smart-account-service.ts` |
| smart-account-clients 업데이트 | `packages/daemon/src/infrastructure/smart-account/smart-account-clients.ts` |
| DB 마이그레이션 (factory_address 컬럼) | `packages/daemon/src/infrastructure/database/migrations/` |
| DB 스키마 업데이트 | `packages/daemon/src/infrastructure/database/schema.ts` |
| deprecated factory 체크 + 에러 코드 | `packages/daemon/src/api/routes/userop.ts`, `transactions.ts` |
| 에러 코드 추가 | `packages/core/src/errors/` |
| 테스트 업데이트 | `smart-account-service.test.ts`, `userop-*.test.ts` 등 |

## 테스트 항목

1. **Smart Account 구현체 교체 검증**
   - permissionless.js Smart Account 인스턴스 생성 성공
   - CREATE2 주소 예측 정상 동작
   - encodeCalls/decodeCalls 호환성
   - signUserOperation 정상 동작
   - getFactoryArgs로 factory/factoryData 정상 반환

2. **멀티체인 factory 배포 확인**
   - ethereum-sepolia, base-sepolia, arbitrum-sepolia, polygon-amoy 등에서 factory 존재 확인
   - 각 체인에서 getAddress 호출 성공

3. **기존 지갑 deprecation 처리**
   - 기존 Solady factory AA 지갑으로 userop/build 호출 시 `DEPRECATED_SMART_ACCOUNT` 에러 반환
   - 기존 Solady factory AA 지갑으로 transactions/send 호출 시 `DEPRECATED_SMART_ACCOUNT` 에러 반환
   - 새 factory로 생성된 AA 지갑은 정상 동작
   - 마이그레이션 후 기존 AA 지갑의 factory_address가 Solady 주소로 backfill 확인

4. **Provider 호환성**
   - Pimlico provider로 UserOp 정상 제출
   - Alchemy provider로 UserOp 정상 제출
   - Custom bundler URL로 UserOp 정상 제출

5. **기존 테스트 호환성**
   - 기존 userop-build-api, userop-sign-api 테스트 통과
   - smart-account-pipeline 테스트 통과
