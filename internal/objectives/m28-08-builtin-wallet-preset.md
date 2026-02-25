# 빌트인 지갑 프리셋 자동 설정

- **Status:** IN_PROGRESS
- **Milestone:** v28.8

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
- universalLink, deepLink 경로 확정됨

## 페이즈 구분

본 마일스톤은 두 개의 독립적인 페이즈로 분리한다:

| 페이즈 | 범위 | 요구사항 |
|--------|------|----------|
| Phase A | 빌트인 지갑 프리셋 자동 설정 | R1-R9 |
| Phase B | Push Relay 선언적 Payload 변환 | R10-R13 |

Phase B는 Phase A와 독립적으로 구현 가능하다.

---

## Phase A: 빌트인 지갑 프리셋 자동 설정

### 1. 빌트인 지갑 프리셋

데몬에 알려진 지갑 앱의 설정을 내장한다. 초기에는 D'CENT만 등록. 프리셋은 기존 `WalletLinkConfig` 타입(`@waiaas/core`)에 `approvalMethod`를 추가한 확장 형태이다.

```typescript
interface WalletPreset {
  /** WalletLinkConfig 필드 — 레지스트리 자동 등록에 사용 */
  linkConfig: WalletLinkConfig;
  /** Owner 등록 시 자동 설정할 approval method */
  approvalMethod: ApprovalMethod;
}

const BUILTIN_WALLETS: Record<string, WalletPreset> = {
  dcent: {
    linkConfig: {
      name: 'dcent',
      displayName: "D'CENT Wallet",
      universalLink: { base: 'https://link.dcentwallet.com', signPath: '/waiaas/sign' },
      deepLink: { scheme: 'dcent-wallet', signPath: '/waiaas/sign' },
      ntfy: { requestTopic: 'waiaas-sign-dcent' },
    },
    approvalMethod: 'sdk_ntfy',
  },
};
```

프리셋 → 레지스트리 매핑: `WalletPreset.linkConfig`를 `WalletLinkRegistry.registerWallet()`에 그대로 전달.

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

### 3. `wallet_type` + `approval_method` 동시 제공 시 동작

`wallet_type`과 `approval_method`를 동시에 제공하면:

- `wallet_type` 프리셋의 `approvalMethod`를 우선 적용
- 응답에 `warning` 필드 포함: `"wallet_type preset overrides explicit approval_method"`
- HTTP 200 (에러가 아닌 경고)

```json
{
  "id": "...",
  "ownerAddress": "0x1234...",
  "approvalMethod": "sdk_ntfy",
  "warning": "wallet_type preset overrides explicit approval_method"
}
```

### 4. 자동 설정 플로우

`wallet_type: "dcent"` 전달 시 데몬이 자동 수행하는 작업:

| 순서 | 설정 | 동작 |
|------|------|------|
| 1 | `signing_sdk.enabled` | `true` (미설정 시 자동 활성화) |
| 2 | `signing_sdk.wallets` | dcent 항목 자동 등록 (미등록 시, `WalletLinkRegistry.registerWallet()`) |
| 3 | `wallets.owner_approval_method` | `sdk_ntfy` 자동 설정 |
| 4 | `signing_sdk.preferred_wallet` | `dcent` 자동 설정 |

#### 에러 처리: 자동 롤백

4단계 자동 설정은 트랜잭션으로 처리한다. 어느 단계에서든 실패 시 **모든 변경을 롤백**하고 에러를 반환한다.

```
시작 → [1] enabled → [2] wallets 등록 → [3] approval_method → [4] preferred_wallet → 성공
                ↓ 실패 시                    ↓ 실패 시
              전체 롤백 ←──────────────────── 전체 롤백
```

- Settings 변경은 원래 값을 스냅샷으로 저장 후 복원
- Owner 등록 자체도 롤백 (DB 트랜잭션)
- 에러 응답: `500 PRESET_SETUP_FAILED` + 실패 단계 정보

### 5. DB 스키마 변경

`wallets` 테이블에 `wallet_type` 컬럼 추가 (nullable, TEXT).

**마이그레이션 버전: 24** (`LATEST_SCHEMA_VERSION` 23 → 24)

```sql
ALTER TABLE wallets ADD COLUMN wallet_type TEXT;
```

### 6. Admin UI Owner 등록 폼

```
Owner Address:  [0x1234...________________]
Wallet Type:    [D'CENT Wallet        ▼]
                  D'CENT Wallet
                  Custom...
```

지갑 종류 드롭다운 선택 시 나머지 설정 자동 — 사용자는 주소 입력 + 선택만 수행.

### 7. 호환성

- `wallet_type` 미제공 → 기존 `approval_method` 수동 설정 방식 유지
- `wallet_type`과 `approval_method` 동시 제공 → `wallet_type` 프리셋 우선 + 경고 응답
- 빌트인에 없는 `wallet_type` → 400 에러

### 8. 인터페이스 반영 범위

현재 코드베이스 조사 결과에 기반한 구체적 반영 대상:

| 대상 | 파일 | 변경 내용 |
|------|------|-----------|
| REST API | `openapi-schemas.ts` | `SetOwnerRequestSchema`에 `wallet_type` 필드 추가 |
| REST API | `WalletOwnerResponseSchema` | `walletType`, `warning` 필드 추가 |
| Admin UI | `wallets.tsx` OwnerTab | 지갑 종류 드롭다운 추가 |
| Skill | `wallet.skill.md` | Owner 등록 섹션에 `wallet_type` 사용법 추가 |

**MCP/SDK 해당 없음:**
- MCP: Owner 등록 도구 없음 (23개 도구 중 해당 없음)
- SDK: `WAIaaSClient`에 Owner 등록 메서드 없음 (`WAIaaSOwnerClient`는 approve/reject 전용)

---

## Phase B: Push Relay 선언적 Payload 변환

Push Relay가 지갑 앱별 푸시 메시지 포맷 차이를 **코드 변경 없이 config.toml에서 선언적으로 처리**한다.

### 문제

현재 `buildPushPayload()`가 범용 `PushPayload`를 생성하면 `IPushProvider`가 그대로 전달한다. 그러나 지갑 앱마다 `data` 필드에 기대하는 구조가 다르다.

예: D'CENT는 `tag_group_name`, `tag_value` 필드를 요구:

```json
{
  "data": {
    "tag_group_name": "common_push",
    "tag_value": "waiaas_sign_request",
    "requestId": "...",
    "chain": "evm"
  }
}
```

### config.toml 스키마

Push Relay의 config.toml은 중첩을 허용한다 (데몬 config.toml과 별도 정책, CLAUDE.md 반영 완료).

```toml
[relay.push.payload]
# 모든 푸시에 주입되는 정적 필드
[relay.push.payload.static_fields]
tag_group_name = "common_push"

# category(sign_request | notification) → 키-값 매핑
[relay.push.payload.category_map]
target_key = "tag_value"
sign_request = "waiaas_sign_request"
notification = "waiaas_notification"
```

### 변환 파이프라인

```
ntfy 메시지
  → buildPushPayload()         # 범용 PushPayload 생성
  → ConfigurablePayloadTransformer.transform()  # config 기반 변환
  → IPushProvider.send()       # Pushwoosh/FCM 전송
```

### ConfigurablePayloadTransformer

```typescript
interface PayloadTransformConfig {
  static_fields?: Record<string, string>;
  category_map?: {
    target_key: string;
    sign_request?: string;
    notification?: string;
  };
}

class ConfigurablePayloadTransformer {
  constructor(private readonly config: PayloadTransformConfig) {}

  transform(payload: PushPayload): PushPayload {
    const data = { ...payload.data };

    // 1. 정적 필드 주입
    if (this.config.static_fields) {
      Object.assign(data, this.config.static_fields);
    }

    // 2. 카테고리 매핑
    if (this.config.category_map) {
      const { target_key, ...mapping } = this.config.category_map;
      const mapped = mapping[payload.category];
      if (mapped) data[target_key] = mapped;
    }

    return { ...payload, data };
  }
}
```

### 설계 결정

| ID | 결정 | 근거 |
|----|------|------|
| D1 | config 선언적 변환 우선 | 지갑 앱 추가 시 Push Relay 코드 변경 불필요. 대부분의 경우 정적 필드 주입 + 카테고리 매핑으로 충분 |
| D2 | `[relay.push.payload]` 섹션 선택적 | 미설정 시 기존 동작 유지 (변환 없이 bypass) |
| D3 | 변환은 Provider 앞단 | Provider는 전송 인프라(Pushwoosh/FCM) 책임, payload 구조는 수신측 앱의 관심사 |
| D4 | Push Relay config.toml 중첩 허용 | 데몬 config.toml은 플랫 구조 유지, Push Relay는 별도 패키지로 중첩 허용 (CLAUDE.md 반영 완료) |

---

## 요구사항

### Phase A: 빌트인 지갑 프리셋

| ID | 구분 | 내용 |
|----|------|------|
| R1 | 기능 | 빌트인 지갑 프리셋 맵 (초기: D'CENT 1종), `WalletPreset` → `WalletLinkConfig` 매핑 |
| R2 | API | `PUT /v1/wallets/{walletId}/owner`에 `wallet_type` 필드 추가 |
| R3 | 자동화 | `wallet_type` 제공 시 signing SDK + 레지스트리 + approval method + preferred_wallet 자동 설정 |
| R4 | DB | `wallets.wallet_type` 컬럼 추가 (마이그레이션 v24) |
| R5 | Admin UI | Owner 등록 폼에 지갑 종류 드롭다운 추가 |
| R6 | 호환성 | `wallet_type` 미제공 시 기존 동작 100% 유지 |
| R7 | 검증 | 빌트인에 없는 `wallet_type` 제공 시 400 에러 |
| R8 | 인터페이스 | REST API 스키마(`SetOwnerRequestSchema`, `WalletOwnerResponseSchema`), Admin UI OwnerTab, `wallet.skill.md` 반영. MCP/SDK 해당 없음 |
| R9 | 에러 처리 | 자동 설정 실패 시 전체 롤백 (Settings 스냅샷 복원 + DB 트랜잭션 롤백) |

### Phase B: Push Relay Payload 변환

| ID | 구분 | 내용 |
|----|------|------|
| R10 | Push Relay | config.toml `[relay.push.payload]` 스키마 확장 (Zod 검증) |
| R11 | Push Relay | `ConfigurablePayloadTransformer` 구현 — static_fields 주입 + category_map 매핑 |
| R12 | Push Relay | 변환 파이프라인 통합 — `buildPushPayload()` → transformer → `IPushProvider.send()` |
| R13 | Push Relay | `[relay.push.payload]` 미설정 시 기존 동작 유지 (bypass) |
