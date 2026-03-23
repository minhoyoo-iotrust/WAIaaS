# 408 — Drift SDK Wallet.local is not a function

- **유형:** BUG
- **심각도:** HIGH
- **발견일:** 2026-03-19
- **발견 경로:** Agent UAT defi-10 (Drift Perpetual Trading)
- **상태:** FIXED

## 증상

`POST /v1/actions/drift_perp/drift_add_margin?dryRun=true` 호출 시 `ACTION_RESOLVE_FAILED`:

```json
{
  "code": "ACTION_RESOLVE_FAILED",
  "message": "Action resolve failed: sdk.Wallet.local is not a function"
}
```

## 근본 원인

**`DriftSdkWrapper.getClient()`에서 존재하지 않는 `Wallet.local()` 정적 메서드를 호출.**

| 파일 | 위치 | 문제 |
|------|------|------|
| `packages/actions/src/providers/drift/drift-sdk-wrapper.ts:370` | `getClient()` | `wallet: sdk.Wallet.local()` ← 존재하지 않는 메서드 |

### 상세 분석

1. **`@drift-labs/sdk@2.156.0`의 `Wallet` 클래스**는 인스턴스 생성자만 존재:
   ```typescript
   export class Wallet implements IWallet {
     constructor(readonly payer: Keypair) {}
     // signTransaction(), signAllTransactions(), get publicKey() 등
     // static local() 메서드는 없음
   }
   ```

2. **`drift-sdk-wrapper.ts:364-377`의 `getClient()`**:
   ```typescript
   private async getClient(): Promise<any> {
     const sdk = await this.loadSdk();
     const conn = new sdk.Connection(this.rpcUrl);
     return new sdk.DriftClient({
       connection: conn,
       wallet: sdk.Wallet.local(), // ← 에러 발생 지점
       programID: new sdk.PublicKey(DRIFT_PROGRAM_ID),
       ...
     });
   }
   ```

3. **테스트에서는 모킹되어 발견 안 됨**: `drift-sdk-wrapper-real.test.ts:114-129`에서 `Wallet: { local: vi.fn().mockReturnValue({}) }`로 모킹하여 존재하지 않는 메서드를 가짜로 주입

4. **turbo-test 로그에서 이미 확인됨**: `expected [Function] to throw error including '@drift-labs/sdk' but got 'sdk.Wallet.local is not a function'`

## 수정 방향

읽기 전용 DriftClient 초기화를 위한 더미 Wallet 생성:
```typescript
const dummyKeypair = sdk.Keypair.generate();
wallet: new sdk.Wallet(dummyKeypair), // read-only queries에 사용
```

또는 `@drift-labs/sdk`가 `Wallet` 없이 초기화를 지원하는 경우 해당 API 사용.

## 테스트 항목

- [ ] Drift add_margin dryRun 호출 시 정상 응답 반환
- [ ] Drift open_position 호출 시 정상 동작
- [ ] DriftSdkWrapper 초기화 시 Wallet 팩토리 정상 호출 확인
- [ ] 모킹 대신 실제 SDK Wallet 생성자 사용으로 테스트 수정
