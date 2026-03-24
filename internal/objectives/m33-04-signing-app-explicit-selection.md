# 마일스톤 m33-04: 서명 앱 명시적 선택

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

같은 `wallet_type`으로 등록된 지갑 앱이 여러 개일 때, 서명 요청 대상 앱을 명확하게 선택할 수 있도록 한다. `signing_enabled` 컬럼의 의미를 **signing primary**(그룹 내 대표 서명 앱)로 변경하고, Admin UI에서 wallet_type 그룹별 라디오 선택 방식으로 전환한다.

---

## 배경

현재 `SignRequestBuilder`는 `wallet_apps.name = wallet_type`인 앱을 암묵적으로 선택한다. 같은 `wallet_type`에 앱이 여러 개 등록되면:

- 어떤 앱이 서명 대상인지 불투명
- Admin UI에서 서명 대상 앱을 제어하는 UI 부재
- 개발/운영 환경 간 Push Relay 전환이 불편

## 변경 범위

### 1. DB 마이그레이션 (v61)

- 같은 `wallet_type` 내 `signing_enabled = 1` 최대 1개 보장
- 기존 데이터: 같은 그룹에 다수 활성화 시 `created_at` 가장 빠른 앱만 유지, 나머지 비활성화

### 2. WalletAppService 백엔드

- **`update()`**: `signingEnabled = true` 설정 시 같은 `wallet_type`의 다른 앱을 자동으로 `signing_enabled = 0`으로 변경
- **`register()`**: 같은 `wallet_type`에 이미 `signing_enabled = 1`인 앱이 있으면 새 앱은 `signing_enabled = 0`으로 등록

### 3. SignRequestBuilder 조회 변경

```typescript
// 기존: wallet_apps.name = walletName
// 변경: wallet_apps.wallet_type = walletType AND signing_enabled = 1
const appRow = this.sqlite.prepare(
  'SELECT name, push_relay_url, subscription_token FROM wallet_apps WHERE wallet_type = ? AND signing_enabled = 1',
).get(walletType);
```

- `requestTopic`을 `appRow.subscription_token || appRow.name`으로 변경하여 Push Relay에서 정확한 디바이스에 전달

### 4. Admin UI — Human Wallet Apps 페이지

#### 4-1. wallet_type별 그룹 표시

같은 `wallet_type`의 앱을 시각적 그룹으로 묶어 표시:

```
D'CENT (dcent)
┌──────────────────────────────────────────────┐
│ dcent         waiaas-push.dcentwallet.com    │
│   (●) 서명    [✓] 알림                       │
│                                              │
│ dcent-test    192.168.0.145:3200             │
│   (○) 서명    [✓] 알림                       │
└──────────────────────────────────────────────┘
```

#### 4-2. 서명 컨트롤 변경

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 서명 | 체크박스 (앱별 독립) | **라디오 버튼** (그룹 내 하나만 선택) |
| 알림 | 체크박스 (앱별 독립) | 체크박스 유지 (여러 앱 동시 발송) |

- 서명 라디오 선택 시: 해당 앱 `signing_enabled = 1`, 같은 wallet_type 나머지 `signing_enabled = 0`
- wallet_type에 앱이 1개만 있으면 라디오 자동 선택 (비활성 표시)

### 5. ApprovalChannelRouter

기존 signing_enabled 체크 로직은 그대로 유지 가능 — signing primary인 앱이 있으면 통과.

## 테스트 항목

### 단위 테스트
- signing_enabled 라디오 토글 시 같은 wallet_type의 다른 앱이 자동으로 0이 되는지
- SignRequestBuilder가 signing_enabled = 1인 앱의 push_relay_url을 사용하는지
- subscriptionToken이 선택된 앱의 subscription_token으로 설정되는지
- register 시 기존 primary가 있으면 새 앱이 signing_enabled = 0인지

### Admin UI 테스트
- 같은 wallet_type 앱이 그룹으로 표시되는지
- 서명 라디오 선택 시 API 호출 및 UI 반영
- 앱이 1개인 wallet_type에서 라디오가 자동 선택 상태인지

### 통합 테스트
- APPROVAL 티어 TX 생성 시 signing_enabled = 1인 앱의 Push Relay URL로 요청 전송 확인

## 영향

- 같은 wallet_type에 앱이 여러 개인 경우 서명 대상이 명확해짐
- 개발/운영 환경에서 로컬 Push Relay와 프로덕션 Push Relay를 전환하기 쉬워짐
- 개별 지갑마다 앱을 선택할 필요 없이, wallet_type 그룹 단위로 한 번만 설정
