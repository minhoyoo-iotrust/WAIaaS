# #272 — Smart Account 지갑 주소가 EOA signer 주소로 저장됨

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** FIXED
- **수정일:** 2026-03-07
- **발견일:** 2026-03-07

## 증상

AA(Smart Account) 지갑 생성 시 데몬이 보고하는 주소가 CREATE2 counterfactual 주소가 아닌 EOA signer 주소로 저장·표시됨.

- 데몬 보고 주소: `0xe3fB131d...` (EOA signer)
- 실제 AA 주소: `0xecDe3610...` (UserOp sender)
- 토큰을 데몬 보고 주소로 전송 → EOA에 도착 → AA 지갑에서 전송 시 InsufficientBalance

## 근본 원인

`daemon.ts`의 `createApp()` 호출(1386-1425행)에 `smartAccountService` 의존성이 **전달되지 않음**.

```typescript
// packages/daemon/src/lifecycle/daemon.ts:1386-1425
const app = createApp({
  db: this._db!,
  // ... 기타 의존성 ...
  // smartAccountService: ???  ← 누락!
});
```

이로 인해 `wallets.ts:527`의 조건문이 항상 `false`:

```typescript
if (accountType === 'smart' && deps.smartAccountService) {
  // ← smartAccountService가 undefined이므로 진입 불가
  signerKey = publicKey;                        // 실행 안 됨
  walletPublicKey = smartAccountInfo.address;   // 실행 안 됨
  factoryAddress = smartAccountInfo.factoryAddress; // 실행 안 됨
  deployed = false;                             // 실행 안 됨
}
```

결과적으로 DB에 저장되는 값:

| 필드 | 기대값 | 실제 저장값 |
|------|--------|-------------|
| `publicKey` | AA counterfactual 주소 | EOA signer 주소 |
| `signerKey` | EOA signer 주소 | `null` |
| `deployed` | `false` | `true` (기본값) |
| `entryPoint` | `0x00000...032` | `null` |
| `factoryAddress` | Factory 주소 | `null` |

## 영향 범위

### 반쪽짜리 AA 상태
- **UserOp 전송은 동작**: `pipeline/stages.ts:1378`에서 매번 `new SmartAccountService()`를 직접 생성하여 올바른 AA 주소 재계산
- **주소 보고 오류**: 모든 API(`GET /wallets`, `connect-info` 등)가 EOA 주소 반환
- **잔액 조회 오류**: EOA 주소 기준으로 조회하여 AA 지갑의 토큰 미표시
- **토큰 수신 실패**: 사용자가 데몬 보고 주소(EOA)로 토큰 전송 시 AA 지갑에서 접근 불가

### 기존 AA 지갑 마이그레이션 필요
- 이미 생성된 smart account 지갑의 `publicKey`, `signerKey`, `deployed`, `entryPoint`, `factoryAddress` 필드를 올바르게 재계산하여 갱신해야 함

## 수정 방안

### 1. 의존성 주입 수정 (신규 지갑)

`daemon.ts`에서 `SmartAccountService` 인스턴스를 생성하고 `createApp()`에 전달:

```typescript
const { SmartAccountService } = await import('../infrastructure/smart-account/index.js');
const smartAccountService = new SmartAccountService();

const app = createApp({
  // ... 기존 ...
  smartAccountService,
});
```

### 2. 기존 잘못 생성된 AA 지갑 → EOA 전환 마이그레이션

`accountType = 'smart'`이면서 `signerKey IS NULL`인 지갑은 이 버그로 생성된 것이므로 EOA로 전환:
- 사용자가 이미 데몬이 보고한 EOA 주소로 토큰을 보냈으므로, AA 주소로 변경하면 기존 자산에 접근 불가
- `publicKey`는 이미 EOA 주소이므로 그대로 유지
- `accountType`을 `'eoa'`로 변경

```sql
UPDATE wallets
SET account_type = 'eoa'
WHERE account_type = 'smart' AND signer_key IS NULL;
```

### 3. 테스트 보강

- 통합 테스트: `createApp()`에 `smartAccountService`가 주입된 상태에서 smart wallet 생성 후 `publicKey ≠ signerKey` 검증
- 기존 `smart-account-wallet-creation.test.ts`에 AA 주소 검증 테스트 추가 (현재 EOA 생성만 검증)

## 관련 파일

| 파일 | 역할 |
|------|------|
| `packages/daemon/src/lifecycle/daemon.ts:1386-1425` | `createApp()` 호출 — **smartAccountService 누락** |
| `packages/daemon/src/api/server.ts:150,433` | deps 인터페이스 정의 + 라우트 주입 |
| `packages/daemon/src/api/routes/wallets.ts:527-566` | Smart Account 생성 분기 |
| `packages/daemon/src/pipeline/stages.ts:1378` | 파이프라인 내 자체 SmartAccountService 생성 (정상 동작) |
| `packages/daemon/src/infrastructure/smart-account/smart-account-service.ts` | CREATE2 주소 예측 서비스 |

## 테스트 항목

1. **단위 테스트**: `daemon.ts` `createApp()`에 `smartAccountService`가 전달되는지 검증
2. **통합 테스트**: smart wallet 생성 후 응답의 `publicKey`가 EOA가 아닌 AA 주소인지 검증
3. **통합 테스트**: smart wallet 생성 후 DB의 `signerKey`가 EOA 주소인지 검증
4. **통합 테스트**: smart wallet 생성 후 `deployed = false`, `entryPoint` 비null, `factoryAddress` 비null 검증
5. **마이그레이션 테스트**: 기존 잘못된 AA 지갑(`signerKey IS NULL`)이 마이그레이션 후 `accountType = 'eoa'`로 전환되는지 검증
6. **회귀 테스트**: EOA 지갑 생성이 영향받지 않는지 검증
