# #263 — DeFi 포지션 대시보드에 Mock 데이터 오염 — 가짜 포지션 대량 생성

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **발견일:** 2026-03-07
- **마일스톤:** —
- **영향 범위:** `packages/actions/src/index.ts`, `packages/actions/src/providers/kamino/index.ts`, `packages/actions/src/providers/drift/index.ts`

## 증상

Admin UI 대시보드의 DeFi Positions 섹션에 실제로 수행한 적 없는 가짜 포지션이 대량 표시됨:

- **Active Positions:** 7,761건
- **Total DeFi Value:** $116,325,000
- kamino LENDING: 동일한 패턴 반복 (10,000,000,000 / $10,000 + 50,000,000,000 / $5,000)
- drift_perp PERP: 동일한 패턴 반복 (100 / $15,000)
- 모든 포지션이 solana 체인

## 재현 조건

1. 데몬에 1개 이상의 활성 지갑이 존재
2. Admin Settings에서 `actions.kamino_enabled` 또는 `actions.drift_enabled`가 `true`
3. PositionTracker가 주기적으로 syncCategory() 실행 (LENDING: 5분, PERP: 1분)
4. 대시보드 → DeFi Positions에 가짜 포지션이 누적 표시됨

## 근본 원인

### 원인 체인

1. `registerBuiltInProviders()` (`packages/actions/src/index.ts:251,277`)에서 `KaminoLendingProvider`와 `DriftPerpProvider`를 생성할 때 `sdkWrapper` 파라미터를 전달하지 않음
2. 두 provider의 생성자에서 `sdkWrapper`가 없으면 **Mock wrapper를 기본값으로 사용**:
   - `packages/actions/src/providers/kamino/index.ts:107`: `this.sdkWrapper = sdkWrapper ?? new MockKaminoSdkWrapper()`
   - `packages/actions/src/providers/drift/index.ts:96`: `this.sdkWrapper = sdkWrapper ?? new MockDriftSdkWrapper()`
3. Mock wrapper의 데이터 조회 메서드가 **입력 파라미터를 무시하고 항상 하드코딩된 가짜 데이터를 반환**:
   - `MockKaminoSdkWrapper.getObligation()` (`kamino-sdk-wrapper.ts:205`): 항상 10,000 USDC deposit + 50 SOL borrow 반환
   - `MockDriftSdkWrapper.getPositions()` (`drift-sdk-wrapper.ts:242`): 항상 SOL-PERP LONG 100 ($15,000) 반환
4. `PositionTracker.syncCategory()` (`position-tracker.ts:147-161`)가 모든 활성 지갑에 대해 `provider.getPositions(wallet.id)` 호출
5. Mock이 모든 지갑에 대해 동일한 가짜 포지션을 반환 → `PositionWriteQueue`가 DB에 upsert
6. 결과: 활성 지갑 수 × 2 (kamino deposit+borrow) + 활성 지갑 수 × 1 (drift perp) = 지갑당 3개 가짜 포지션이 주기적으로 DB에 기록

### 비교: 정상 동작하는 Aave V3

`AaveV3LendingProvider.getPositions()` (`aave-v3/index.ts:444-447`)는 빈 배열을 반환하여 문제 없음:
```typescript
async getPositions(_walletId: string): Promise<PositionUpdate[]> {
  // Deferred: PositionTracker will use ILendingProvider.getPosition via adapter
  return [];
}
```

### 코드 위치

```typescript
// packages/actions/src/index.ts:245-252 — sdkWrapper 미전달
factory: () => {
  const config: KaminoConfig = { ... };
  return new KaminoLendingProvider(config); // ← sdkWrapper 없음 → MockKaminoSdkWrapper 사용
},

// packages/actions/src/index.ts:270-278 — sdkWrapper 미전달
factory: () => {
  const config: DriftConfig = { ... };
  return new DriftPerpProvider(config); // ← sdkWrapper 없음 → MockDriftSdkWrapper 사용
},
```

## 해결 방안

`registerBuiltInProviders()`에서 실제 SDK wrapper (`KaminoSdkWrapper`, `DriftSdkWrapper`)를 전달하도록 수정. 실제 wrapper는 SDK 미설치 시 `throwNotConfigured()`를 던지고, provider의 `getPositions()` catch 블록에서 빈 배열을 반환하므로 안전:

```typescript
// packages/actions/src/index.ts

// 추가 import
import { KaminoSdkWrapper } from './providers/kamino/kamino-sdk-wrapper.js';
import { DriftSdkWrapper } from './providers/drift/drift-sdk-wrapper.js';

// kamino factory 수정
return new KaminoLendingProvider(config, new KaminoSdkWrapper(''));

// drift factory 수정
return new DriftPerpProvider(config, new DriftSdkWrapper('', config.subAccount));
```

### 대안

- options에 `solanaRpcUrl`을 추가하여 실제 RPC URL 전달 (더 정확하나 변경 범위 증가)
- Mock wrapper의 `getObligation()`/`getPositions()`가 null/빈 배열을 반환하도록 변경 (테스트 6건 수정 필요)

### 기존 오염 데이터 정리

수정 배포 후 기존 가짜 포지션 데이터를 정리하는 마이그레이션 또는 수동 SQL 필요:
```sql
DELETE FROM defi_positions WHERE provider IN ('kamino', 'drift_perp');
```

## 테스트 항목

1. **단위 테스트:** `registerBuiltInProviders()`에서 생성된 Kamino provider의 `getPositions()`가 빈 배열을 반환하는지 검증 (SDK 미설치 상태)
2. **단위 테스트:** `registerBuiltInProviders()`에서 생성된 Drift provider의 `getPositions()`가 빈 배열을 반환하는지 검증 (SDK 미설치 상태)
3. **단위 테스트:** Kamino provider에 `MockKaminoSdkWrapper`를 명시적으로 주입한 경우 기존 테스트가 정상 동작하는지 확인 (기존 테스트 호환성)
4. **통합 테스트:** PositionTracker가 SDK 미설치 provider에 대해 DB에 포지션을 기록하지 않는지 검증
5. **회귀 테스트:** Admin UI 대시보드 DeFi Positions가 실제 포지션이 없을 때 빈 상태를 표시하는지 확인
