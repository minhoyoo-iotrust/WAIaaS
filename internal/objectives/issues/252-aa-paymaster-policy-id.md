# #252 Smart Account 페이마스터 Policy ID 전달 경로 추가

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** OPEN
- **발견일:** 2026-03-05

## 배경

ERC-4337 Smart Account의 가스비 대납(sponsorship) 시 페이마스터 정책 ID를 전달하는 경로가 없음.

- **Pimlico**: `sponsorshipPolicyId`는 선택 사항이므로 API Key만으로도 대납 가능하나, 프로덕션에서 한도/규칙 제어를 위해 정책 ID 지정이 필요.
- **Alchemy**: Gas Manager Policy ID가 **필수**. 현재 코드에서 전달하지 않으므로 Alchemy 페이마스터 대납이 동작하지 않음.

## 현재 상태

`createSmartAccountBundlerClient()` (`packages/daemon/src/infrastructure/smart-account/smart-account-clients.ts:120-142`)에서 `createPaymasterClient`의 기본 `getPaymasterData`/`getPaymasterStubData`를 그대로 사용. `paymasterContext`에 `sponsorshipPolicyId`를 전달하는 경로가 없음.

```typescript
// 현재 코드 — context 전달 없음
const pmClient = createPaymasterClient({ transport: http(paymasterUrl) });
return {
  getPaymasterData: pmClient.getPaymasterData,
  getPaymasterStubData: pmClient.getPaymasterStubData,
};
```

## 해결 방안

### 1. DB 스키마 확장 (DB v43)

`wallets` 테이블에 `aa_paymaster_policy_id TEXT` 컬럼 추가.

```sql
ALTER TABLE wallets ADD COLUMN aa_paymaster_policy_id TEXT;
```

### 2. Zod 스키마 확장

- `CreateWalletRequestSchema` (`packages/core/src/schemas/wallet.schema.ts`): `aaPaymasterPolicyId: z.string().optional()` 추가
- `SetProviderRequestSchema` (`packages/daemon/src/api/routes/openapi-schemas.ts`): `policyId: z.string().optional()` 추가

### 3. WalletProviderData 확장

`WalletProviderData` 인터페이스에 `aaPaymasterPolicyId` 필드 추가.

```typescript
export interface WalletProviderData {
  aaProvider: AaProviderName | null;
  aaProviderApiKey: string | null;
  aaBundlerUrl: string | null;
  aaPaymasterUrl: string | null;
  aaPaymasterPolicyId: string | null;  // 추가
}
```

### 4. PaymasterClient context 전달

`createSmartAccountBundlerClient()`에서 `getPaymasterData`/`getPaymasterStubData` 호출 시 `context` 파라미터를 래핑하여 전달:

```typescript
const pmClient = createPaymasterClient({ transport: http(paymasterUrl) });
const policyId = opts.walletProvider.aaPaymasterPolicyId;
return {
  getPaymasterData: policyId
    ? (params) => pmClient.getPaymasterData({ ...params, context: { sponsorshipPolicyId: policyId } })
    : pmClient.getPaymasterData,
  getPaymasterStubData: policyId
    ? (params) => pmClient.getPaymasterStubData({ ...params, context: { sponsorshipPolicyId: policyId } })
    : pmClient.getPaymasterStubData,
};
```

### 5. 라우트/파이프라인 연결

- `wallets.ts`: 지갑 생성/프로바이더 설정 시 `aa_paymaster_policy_id` 저장
- `stages.ts`: `walletProvider` 구성 시 `aaPaymasterPolicyId` 포함

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `packages/core/src/schemas/wallet.schema.ts` | `aaPaymasterPolicyId` 필드 추가 |
| `packages/daemon/src/infrastructure/database/schema.ts` | 컬럼 추가 |
| `packages/daemon/src/infrastructure/database/migrate.ts` | DB v43 마이그레이션 |
| `packages/daemon/src/api/routes/openapi-schemas.ts` | `SetProviderRequest`에 `policyId` 필드 |
| `packages/daemon/src/infrastructure/smart-account/smart-account-clients.ts` | context 전달 로직 |
| `packages/daemon/src/api/routes/wallets.ts` | 생성/업데이트 저장 |
| `packages/daemon/src/pipeline/stages.ts` | walletProvider 구성 |
| 테스트 파일 | paymaster/provider 테스트 확장 |
| 스킬 파일 | wallet/admin 스킬 동기화 |

## 테스트 항목

1. **단위 테스트**: `createSmartAccountBundlerClient`가 policyId 있을 때 `context.sponsorshipPolicyId`를 전달하는지 검증
2. **단위 테스트**: policyId 없을 때 기존 동작(context 없이 호출)과 동일한지 확인
3. **단위 테스트**: DB v43 마이그레이션이 `aa_paymaster_policy_id` 컬럼을 정상 추가하는지 검증
4. **통합 테스트**: `POST /v1/wallets` (accountType=smart)에서 `aaPaymasterPolicyId` 포함 시 DB에 저장되는지 확인
5. **통합 테스트**: `PUT /v1/wallets/:id/provider`에서 `policyId` 설정/변경/제거 동작 검증
6. **통합 테스트**: Smart Account 파이프라인에서 walletProvider에 policyId가 포함되어 bundlerClient까지 전달되는지 확인
7. **회귀 테스트**: policyId 미설정 상태의 기존 Smart Account 지갑이 정상 동작하는지 확인
