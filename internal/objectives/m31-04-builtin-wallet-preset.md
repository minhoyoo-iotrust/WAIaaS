# 빌트인 지갑 프리셋 자동 설정

- **Status:** PLANNED
- **Milestone:** -

## 목표

Owner 지갑 등록 시 지갑 종류(D'CENT 등)를 선택하면 signing SDK, 지갑 레지스트리, approval method 등 관련 설정이 자동으로 완료되도록 한다. 사용자가 수동으로 여러 설정을 건드릴 필요 없이, 주소 입력 + 지갑 선택만으로 푸시 알림 수신 환경이 구성된다.

## 배경

현재 signing SDK 기반 지갑 연동을 위해 운영자가 수행해야 하는 수동 설정:

1. Admin Settings에서 `signing_sdk.enabled = true`
2. `signing_sdk.wallets`에 지갑 레지스트리 항목 수동 등록 (universalLink, deepLink, ntfy topic 등)
3. `signing_sdk.preferred_wallet` 설정
4. Owner 등록 시 `approval_method: "sdk_ntfy"` 명시

D'CENT가 `@waiaas/wallet-sdk`를 연동한 이후, 이 과정을 자동화하여 사용자 경험을 개선한다.

## 전제 조건

- D'CENT 측 `@waiaas/wallet-sdk` 연동 완료
- universalLink, deepLink 경로는 D'CENT 측과 협의 후 확정

## 설계

### 1. 빌트인 지갑 프리셋

데몬에 알려진 지갑 앱의 설정을 내장한다. 초기에는 D'CENT만 등록.

```typescript
const BUILTIN_WALLETS: Record<string, WalletPreset> = {
  dcent: {
    displayName: "D'CENT Wallet",
    approvalMethod: 'sdk_ntfy',
    universalLink: { base: 'https://link.dcentwallet.com', signPath: '/waiaas/sign' },
    deepLink: { scheme: 'dcent', signPath: '/waiaas-sign' },
  },
};
```

향후 지갑 추가 시 이 맵에 항목을 추가하면 된다.

### 2. Owner 등록 API 확장

`PUT /v1/wallets/{walletId}/owner`에 `wallet_type` 필드 추가.

```json
{
  "owner_address": "0x1234...",
  "wallet_type": "dcent"
}
```

- `wallet_type` 제공 시 `approval_method`는 프리셋에서 자동 결정 (생략 가능)
- `wallet_type` 미제공 시 기존 동작 유지

### 3. 자동 설정 플로우

`wallet_type: "dcent"` 전달 시 데몬이 자동 수행하는 작업:

| 순서 | 설정 | 동작 |
|------|------|------|
| 1 | `signing_sdk.enabled` | `true` (미설정 시 자동 활성화) |
| 2 | `signing_sdk.wallets` | dcent 항목 자동 등록 (미등록 시) |
| 3 | `wallets.owner_approval_method` | `sdk_ntfy` 자동 설정 |
| 4 | `signing_sdk.preferred_wallet` | `dcent` 자동 설정 |

### 4. DB 스키마 변경

`wallets` 테이블에 `wallet_type` 컬럼 추가 (nullable, TEXT).

```sql
ALTER TABLE wallets ADD COLUMN wallet_type TEXT;
```

### 5. Admin UI Owner 등록 폼

```
Owner Address:  [0x1234...________________]
Wallet Type:    [D'CENT Wallet        ▼]
                  D'CENT Wallet
                  Custom...
```

지갑 종류 드롭다운 선택 시 나머지 설정 자동 — 사용자는 주소 입력 + 선택만 수행.

### 6. 호환성

- `wallet_type` 미제공 → 기존 `approval_method` 수동 설정 방식 유지
- `wallet_type`과 `approval_method` 동시 제공 → `wallet_type` 프리셋 우선
- 빌트인에 없는 `wallet_type` → 400 에러

## 요구사항

| ID | 구분 | 내용 |
|----|------|------|
| R1 | 기능 | 빌트인 지갑 프리셋 맵 (초기: D'CENT 1종) |
| R2 | API | `PUT /v1/wallets/{walletId}/owner`에 `wallet_type` 필드 추가 |
| R3 | 자동화 | `wallet_type` 제공 시 signing SDK + 레지스트리 + approval method 자동 설정 |
| R4 | DB | `wallets.wallet_type` 컬럼 추가 (마이그레이션) |
| R5 | Admin UI | Owner 등록 폼에 지갑 종류 드롭다운 추가 |
| R6 | 호환성 | `wallet_type` 미제공 시 기존 동작 100% 유지 |
| R7 | 검증 | 빌트인에 없는 `wallet_type` 제공 시 400 에러 |
| R8 | SDK/MCP | Owner 등록 관련 인터페이스에 `wallet_type` 반영 |
| R9 | Skill | `wallet.skill.md` Owner 등록 섹션에 `wallet_type` 사용법 추가 |
