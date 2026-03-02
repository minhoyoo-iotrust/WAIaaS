# 마일스톤 m29-07: D'CENT 직접 서명 + Human Wallet Apps 통합

- **Status:** SHIPPED
- **Milestone:** v29.7
- **Completed:** 2026-03-01

## 목표

D'CENT 오너 지갑 프리셋의 승인 방식을 WalletConnect에서 Push Relay 기반 직접 서명(`sdk_ntfy`)으로 전환하고, 지갑별 `wallet_type`이 서명 토픽 라우팅에 반영되도록 파이프라인을 수정한다. 동시에 "Signing SDK"를 사용자 친화적인 "Human Wallet Apps" 개념으로 재구성하여 사람(운영자)이 사용하는 지갑 앱을 1급 개념으로 관리하고, Admin UI의 설정 구조를 정리한다.

---

## 배경

### 현재 문제

**1. D'CENT 프리셋이 WalletConnect를 사용**

D'CENT는 자사 Push Relay 서버를 운영하여 ntfy 기반 직접 서명이 가능하지만, 현재 프리셋은 `walletconnect`를 approval method로 설정한다:

```typescript
// core/schemas/wallet-preset.ts — 현재
dcent: {
  approvalMethod: 'walletconnect',  // WalletConnect v2 경유
  ...
}
```

D'CENT 앱은 Push Relay를 통해 서명 요청을 수신하고 응답할 수 있으므로, WalletConnect 세션 관리 없이 `sdk_ntfy` 방식으로 직접 연동하는 것이 자연스럽다.

**2. `walletName`(ntfy 토픽)이 글로벌 설정에 의존**

서명 요청의 ntfy 토픽은 `signing_sdk.preferred_wallet` 글로벌 설정으로 결정된다:

```typescript
// sign-request-builder.ts:84-87
const walletName =
  params.walletName ||                              // 항상 undefined (미전달)
  this.settings.get('signing_sdk.preferred_wallet') || // 글로벌 1개
  undefined;
```

그러나 오너 지갑은 지갑별로 설정되므로(`wallets.wallet_type`), 지갑 A가 D'CENT이고 지갑 B가 다른 지갑이면 각각 다른 토픽으로 서명 요청이 발행되어야 한다:

| 지갑 | wallet_type | 기대 토픽 | 현재 토픽 |
|------|------------|----------|----------|
| wallet-A | `dcent` | `waiaas-sign-dcent` | `waiaas-sign-{글로벌 설정}` |
| wallet-B | `other` | `waiaas-sign-other` | `waiaas-sign-{글로벌 설정}` |

**3. Admin UI 오너 설정 화면 한계**

| 문제 | 현재 동작 |
|------|----------|
| Wallet Type 변경 UX 부재 | API는 NONE+GRACE에서 변경 가능하나, Admin UI에 Wallet Type 변경 UI가 없음 |
| 프리셋 ↔ Approval Method 분리 | D'CENT 선택해도 approval method를 수동으로 따로 변경해야 함 |
| WalletConnect 섹션 항상 표시 | sdk_ntfy 사용 중에도 WalletConnect 연결 UI가 표시되어 혼란 유발 |
| D'CENT 설명 부정확 | `"Hardware wallet with WalletConnect signing"` — sdk_ntfy로 변경 시 맞지 않음 |

**4. "Signing SDK"가 기술 전문 용어**

System 페이지 내 "Signing SDK" 서브섹션 명칭이 사용자에게 불친절하다. "SDK"는 개발자 용어이며, WAIaaS의 핵심 구도는 "AI 에이전트가 지갑을 사용하고, 사람이 감독하는" 구조다. 사람(운영자)이 서명·알림에 사용하는 지갑 앱을 "Human Wallet Apps"로 1급 개념으로 승격하고, System 페이지에서 분리하여 최상위 메뉴로 재구성해야 한다.

**5. 알림 토픽이 지갑별이지 앱별이 아님**

현재 `WalletNotificationChannel`은 지갑 ID로 개별 조회(`SELECT id, name, owner_approval_method FROM wallets WHERE id = ?`)하여 `waiaas-notify-{wallet.name}` 토픽으로 발행한다. 브로드캐스트 시 복수 지갑에 개별 발행하지만, 토픽이 **지갑 인스턴스 이름** 기반이므로 동일 앱(예: D'CENT)을 사용하는 지갑이 여러 개이면 토픽이 분산된다. 앱 단위로 `waiaas-notify-{wallet_apps.name}` 토픽을 사용하고, Alerts 토글로 앱별 수신 여부를 제어할 수 있어야 한다.

**6. ntfy 설정이 "Other Channels"에 혼재**

Notifications 페이지에서 텔레그램은 독립 섹션(Telegram Users 탭)으로 분리되어 있으나, ntfy 관련 설정(서버 URL, 활성화 등)은 Settings 탭의 "Other Channels"에 ntfy·Discord·Slack과 함께 섞여 있어 찾기 어렵다.

---

## 데이터 모델

### `wallet_apps` 테이블 (신규)

지갑 앱 레지스트리. 사람(운영자)이 사용하는 지갑 앱을 1급 엔티티로 관리한다.

```sql
CREATE TABLE wallet_apps (
  id TEXT PRIMARY KEY,                              -- UUID v7
  name TEXT NOT NULL UNIQUE,                        -- 앱 식별자 (e.g., "dcent", "my-custom-wallet")
  display_name TEXT NOT NULL,                       -- 표시 이름 (e.g., "D'CENT Wallet")
  signing_enabled INTEGER NOT NULL DEFAULT 1,       -- 서명 요청 수신 토글
  alerts_enabled INTEGER NOT NULL DEFAULT 1,        -- 활동 알림 수신 토글
  created_at INTEGER NOT NULL,                      -- Unix timestamp (seconds)
  updated_at INTEGER NOT NULL                       -- Unix timestamp (seconds)
);
```

### `wallet_type` ↔ `wallet_apps.name` 매핑

`wallets.wallet_type` 컬럼 값이 `wallet_apps.name`과 동일한 네임스페이스를 공유한다:

| wallets 테이블 | wallet_apps 테이블 | 관계 |
|---------------|-------------------|------|
| `wallet_type = 'dcent'` | `name = 'dcent'` | 프리셋 적용 시 자동 등록 |
| `wallet_type = 'my-custom'` | `name = 'my-custom'` | 사용자가 수동 등록 |
| `wallet_type = NULL` | — | 글로벌 `preferred_wallet` fallback |

**"Used by" 역추적 쿼리:**

```sql
SELECT w.id, w.label FROM wallets w WHERE w.wallet_type = ?  -- wallet_apps.name 값
```

### ntfy 토픽 네임스페이스

서명과 알림 토픽 모두 `wallet_apps.name`을 기반으로 생성된다:

| 용도 | 토픽 패턴 | 예시 |
|------|----------|------|
| 서명 요청 | `waiaas-sign-{name}` | `waiaas-sign-dcent` |
| 활동 알림 | `waiaas-notify-{name}` | `waiaas-notify-dcent` |
| fallback (wallet_type=NULL) | `waiaas-sign-{preferred_wallet}` | `waiaas-sign-{글로벌 설정}` |

### DB 마이그레이션

`wallet_apps` 테이블 신규 생성. 기존 테이블 변경 없음. 마이그레이션 버전: v31 (v30은 v29.6 MATURED status에서 사용됨).

```sql
-- migration v31: wallet_apps 테이블
CREATE TABLE IF NOT EXISTS wallet_apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  signing_enabled INTEGER NOT NULL DEFAULT 1,
  alerts_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

---

## 구현 대상

### Phase 1: D'CENT 프리셋 변경 + 토픽 라우팅 수정

| 대상 | 내용 |
|------|------|
| `wallet-preset.ts` | D'CENT `approvalMethod`: `'walletconnect'` → `'sdk_ntfy'` |
| `wallet-preset.ts` | D'CENT `description`: `"D'CENT hardware wallet with push notification signing"` |
| `approval-channel-router.ts` | DB 조회에 `wallet_type` 추가. `params.walletName`에 `wallet_type` 값 세팅 |
| `sign-request-builder.ts` | `walletName` 우선순위: `params.walletName`(지갑별) > `preferred_wallet`(글로벌 fallback) — 기존 로직 유지, 호출부 변경으로 해결. `wallet_type=NULL + preferred_wallet 미설정` 시 `WALLET_NOT_REGISTERED` 에러 추가 |
| `PresetAutoSetupService` | D'CENT `approvalMethod`가 `sdk_ntfy`로 변경되므로, 기존 `case 'sdk_ntfy'` 분기가 자동으로 `preferred_channel = 'ntfy'`를 설정. 코드 변경 불필요 — 프리셋 정의 변경만으로 동작 |
| `WALLET_PRESETS` (admin) | `description` 텍스트 갱신 |
| 테스트 | 지갑별 wallet_type → 올바른 토픽 라우팅 검증, 글로벌 fallback 검증 |

> **Note**: `signing_enabled` 차단 로직은 `wallet_apps` 테이블에 의존하므로 Phase 3에서 추가한다.

**ApprovalChannelRouter 변경 핵심:**

```typescript
// approval-channel-router.ts — 변경
const row = this.sqlite.prepare(
  'SELECT owner_approval_method, wallet_type FROM wallets WHERE id = ?',
).get(walletId);

// wallet_type을 walletName으로 전달
const enrichedParams = { ...params, walletName: row.wallet_type || undefined };

// 이후 route 로직은 enrichedParams 사용
```

### Phase 2: Admin UI 오너 설정 화면 개선

| 대상 | 내용 |
|------|------|
| Wallet Type GRACE 상태 변경 | NONE + GRACE 상태에서 프리셋 선택/변경 가능 (LOCKED는 읽기 전용) |
| 프리셋 선택 시 미리보기 | 프리셋이 설정할 approval method를 드롭다운 아래에 표시 |
| 프리셋 변경 → approval method 연동 | 프리셋 변경 시 approval method 자동 갱신 (수동 오버라이드 가능) |
| WalletConnect 섹션 조건부 표시 | `approval_method === 'walletconnect'`일 때만 표시 |
| API 검증 | `PUT /v1/wallets/{id}/owner`는 이미 `wallet_type`을 수용 — GRACE 상태 변경이 정상 동작하는지 확인 후 필요 시 검증 로직 추가 |
| 테스트 | 프리셋 변경 UI 테스트, WalletConnect 섹션 조건부 표시 테스트 |

**Admin UI 상태별 화면:**

```
NONE 상태:
┌───────────────────────────────────────┐
│ Wallet Type: [D'CENT Wallet ▼]        │
│  → Push notification signing          │
│    Approval: Wallet App (ntfy)        │
│                                       │
│ Address:     [0x...           ] Save  │
└───────────────────────────────────────┘

GRACE 상태:
┌───────────────────────────────────────┐
│ Address: 0xABC...    State: GRACE     │
│ Wallet Type: D'CENT Wallet [변경]     │
│───────────────────────────────────────│
│ Approval Method                       │
│ ● Wallet App (ntfy)  ← preset        │
│ ○ WalletConnect                       │
│ ○ ...                                 │
└───────────────────────────────────────┘
  (WalletConnect 섹션 숨김 — sdk_ntfy 사용 중)

LOCKED 상태:
┌───────────────────────────────────────┐
│ Address: 0xABC...    State: LOCKED    │
│ Wallet Type: D'CENT Wallet            │
│───────────────────────────────────────│
│ Approval Method                       │
│ ● Wallet App (ntfy)                   │
└───────────────────────────────────────┘
```

### Phase 3: Human Wallet Apps 페이지 신설 (Signing SDK 대체)

System > Signing SDK를 **Human Wallet Apps** 최상위 메뉴로 재구성한다. 사람(운영자)이 사용하는 지갑 앱 등록·관리를 1급 개념으로 승격하고, 서명과 알림을 앱 단위로 토글한다.

| 대상 | 내용 |
|------|------|
| DB 마이그레이션 v31 | `wallet_apps` 테이블 생성 (데이터 모델 섹션 참조) |
| `WalletAppService` 신규 | `wallet_apps` CRUD 서비스. 등록/삭제/토글 변경/목록 조회 |
| REST API | `GET /v1/admin/wallet-apps`, `POST /v1/admin/wallet-apps`, `PUT /v1/admin/wallet-apps/{id}`, `DELETE /v1/admin/wallet-apps/{id}` |
| `approval-channel-router.ts` | `signing_enabled` 차단 로직 추가: `wallet_apps.signing_enabled = 0`이면 `SIGNING_DISABLED` 에러 |
| `human-wallet-apps.tsx` 신규 | Human Wallet Apps 페이지. `wallet_apps` 테이블 기반 앱 카드 목록 + ntfy 서버 설정 |
| 사이드바 메뉴 | System 페이지 내 Signing SDK 서브섹션 제거 → 최상위 **Human Wallet Apps** 메뉴 추가 |
| 설정 키 유지 | `signing_sdk.*` 설정 키 그대로 사용 (내부 호환). UI 레이블만 "Human Wallet Apps"로 변경 |
| 앱 카드 구조 | `wallet_apps` 행 기반: 표시 이름, Signing 토글, Alerts 토글, "Used by" (역추적 쿼리) |
| ntfy 서버 설정 | 페이지 상단에 ntfy 서버 URL 필드 (기존 `signing_sdk.ntfy_server`) |
| 프리셋 연동 | 프리셋 적용 시 `wallet_apps`에 해당 앱 자동 등록 (PresetAutoSetupService 확장) |
| 테스트 | WalletAppService CRUD, REST API, Human Wallet Apps 페이지 렌더링, 프리셋 자동 등록 테스트, signing_enabled=0 차단 검증 |

**signing_enabled 차단 로직 (Phase 1에서 이동):**

```typescript
// approval-channel-router.ts — Phase 3에서 추가
if (row.wallet_type) {
  const app = this.sqlite.prepare(
    'SELECT signing_enabled FROM wallet_apps WHERE name = ?',
  ).get(row.wallet_type);
  if (app && app.signing_enabled === 0) {
    throw new ChainError('SIGNING_DISABLED', `Signing disabled for wallet app: ${row.wallet_type}`);
  }
}
```

**Human Wallet Apps 페이지 화면:**

```
Human Wallet Apps
─────────────────────────────────────────

ntfy Server: [https://ntfy.sh        ] Save

┌─────────────────────────────────────┐
│ D'CENT Wallet                       │
│                                     │
│ ☑ Signing   서명 요청 수신          │
│ ☑ Alerts    활동 알림 수신          │
│                                     │
│ Used by: wallet-1, wallet-3         │
│                          [Remove]   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ My Custom Wallet                    │
│                                     │
│ ☑ Signing   서명 요청 수신          │
│ ☐ Alerts    활동 알림 수신          │
│                                     │
│ Used by: wallet-2                   │
│                          [Remove]   │
└─────────────────────────────────────┘

[+ Register App]
```

### Phase 4: 지갑 앱 알림 구독 + WalletNotificationChannel 복수 발행

현재 `WalletNotificationChannel`은 지갑별 `wallet.name`으로 토픽을 생성하여 `sdk_ntfy` 지갑에 개별 발행한다. 이를 `wallet_apps` 테이블 기반 앱별 토픽(`waiaas-notify-{wallet_apps.name}`)으로 전환하여, Alerts 토글이 활성화된 앱 전체에 알림을 발행하도록 수정한다.

**토픽 네임스페이스 전환:**

기존 토픽(`waiaas-notify-{wallet.name}`)은 지갑 인스턴스 이름 기반이었으므로 동일 앱을 사용하는 지갑이 여럿이면 토픽이 분산되었다. 새 토픽(`waiaas-notify-{wallet_apps.name}`)은 앱 타입 기반이므로 토픽 수가 앱 수로 수렴한다. 기존 토픽을 구독하던 사용자는 새 앱별 토픽을 재구독해야 한다. 단, WAIaaS Wallet SDK가 구독 토픽을 자동 생성하므로 수동 구독자(ntfy CLI 직접 사용 등)만 영향받으며, 이는 소수 고급 사용자에 한정된다.

| 대상 | 내용 |
|------|------|
| `wallet-notification-channel.ts` | 지갑별 토픽(`wallet.name`) → `wallet_apps` 테이블에서 `alerts_enabled = 1` 목록 조회 → 앱별 토픽(`wallet_apps.name`)에 발행 |
| `WalletAppService` 의존 | `getAlertEnabledApps()` 메서드로 Alerts 활성 앱 목록 조회 |
| 발행 토픽 | 앱별 `waiaas-notify-{wallet_apps.name}` 토픽으로 각각 발행 |
| 테스트 | 복수 앱 알림 발행, Alerts 비활성 앱 미발행, 앱 0개 시 skip 검증 |

**발행 흐름:**

```
이벤트 발생 → WalletNotificationChannel.send()
  → WalletAppService.getAlertEnabledApps()
     → SELECT name FROM wallet_apps WHERE alerts_enabled = 1
     → [dcent, custom-wallet]
  → ntfy publish: waiaas-notify-dcent
  → ntfy publish: waiaas-notify-custom-wallet
```

### Phase 5: Notifications 페이지 ntfy 섹션 분리 + 연동

Notifications 페이지에서 ntfy 설정을 독립 섹션으로 분리하고, Human Wallet Apps 페이지와의 연동 안내를 추가한다.

| 대상 | 내용 |
|------|------|
| `notifications.tsx` Settings 탭 | "Other Channels" 내 ntfy 설정을 별도 FieldGroup "ntfy" 로 분리 |
| ntfy FieldGroup | 활성화 토글 + 서버 URL (Human Wallet Apps 페이지와 동일 값, 읽기 전용 + 링크) |
| Human Wallet Apps 알림 안내 | "지갑 앱별 알림 수신 설정은 Human Wallet Apps 페이지에서 관리합니다" + 링크 |
| "Other Channels" 정리 | ntfy 제거 후 Discord + Slack만 남음 |
| 테스트 | ntfy 섹션 독립 렌더링, 링크 동작, Other Channels에서 ntfy 제거 확인 |

**Notifications Settings 탭 변경:**

```
Settings 탭 (변경 후):
┌─────────────────────────────────────┐
│ Notification Settings               │
│─────────────────────────────────────│
│ ntfy                                │
│ Enabled: ☑                          │
│ Server:  https://ntfy.sh (→ 변경)   │
│ ℹ 지갑 앱별 알림 → Human Wallet Apps│
│─────────────────────────────────────│
│ Other Channels                      │
│ Discord Webhook URL: [...]          │
│ Slack Webhook URL:   [...]          │
│─────────────────────────────────────│
│ Global Settings                     │
│ Min Priority: [...]                 │
│ Quiet Hours:  [...]                 │
└─────────────────────────────────────┘
```

### Phase 6: Skill 파일 + 문서 갱신

| 대상 | 내용 |
|------|------|
| `skills/admin.skill.md` | Human Wallet Apps 메뉴, 오너 설정 프리셋, ntfy 섹션 설명 갱신 |
| `skills/wallet.skill.md` | D'CENT 오너 설정 예시, Human Wallet Apps 연동 예시 갱신 |
| OpenAPI 스키마 | `PUT /v1/wallets/{id}/owner` — GRACE 상태 wallet_type 변경 명시 |

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | D'CENT approval method | walletconnect vs sdk_ntfy | **sdk_ntfy** — D'CENT가 자사 Push Relay를 운영하므로 WalletConnect 세션 관리 불필요. ntfy 기반 직접 서명이 UX 단순화 |
| 2 | walletName 결정 경로 | stages.ts에서 전달 vs router에서 DB 조회 | **router에서 DB 조회** — 이미 walletId로 DB 조회 중이므로 `wallet_type` 컬럼 추가 조회만으로 해결. stages.ts 변경 불필요 |
| 3 | Wallet Type 변경 허용 범위 | NONE만 vs NONE+GRACE vs 전체 | **NONE+GRACE** — LOCKED는 ownerAuth 필요한 보안 상태이므로 프리셋 변경도 ownerAuth 필요. GRACE는 아직 검증 전이므로 변경 허용 |
| 4 | 프리셋 변경 시 approval method | 자동 덮어쓰기 vs 사용자 확인 | **자동 덮어쓰기** — 프리셋의 핵심 가치가 자동 설정. 사용자가 이후 수동으로 approval method 변경 가능 |
| 5 | WalletConnect 섹션 표시 조건 | approval_method 기반 vs 항상 표시 | **approval_method 기반** — sdk_ntfy 사용 시 WC 연결 UI는 혼란만 유발. walletconnect 선택 시에만 표시 |
| 6 | Push Relay URL 데몬 설정 | 데몬에 설정 추가 vs 불필요 | **불필요** — 데몬과 Push Relay는 ntfy를 허브로 간접 연결. 데몬은 Push Relay URL을 알 필요 없음. 지갑 앱은 자사 Push Relay URL 내장 |
| 7 | `preferred_wallet` 글로벌 설정 유지 | 제거 vs fallback으로 유지 | **fallback으로 유지** — wallet_type이 NULL인 지갑의 기본값 역할. 기존 동작 하위 호환 |
| 8 | "Signing SDK" 메뉴명 변경 | 유지 vs Wallet Apps vs Human Wallet Apps | **Human Wallet Apps** — WAIaaS는 "AI 에이전트 지갑 + 사람 감독" 구조. Wallets=AI용, Human Wallet Apps=사람(운영자)이 서명·알림에 쓰는 앱. SDK/Connection은 기술 용어 |
| 9 | Human Wallet Apps 메뉴 위치 | System 하위 vs 최상위 | **최상위** — 오너 지갑 설정(Wallets 탭), 알림(Notifications), 서명(Human Wallet Apps)이 동일 계층에서 접근 가능. System은 포트/DB 등 인프라 설정 전용 |
| 10 | 알림 구독 모델 | 지갑별 개별 구독 vs 앱별 전체 수신 | **앱별 전체 수신** — 텔레그램과 동일 패턴. Alerts=true인 앱은 모든 지갑의 알림을 수신. 지갑별 필터링은 복잡도 대비 실용성 낮음 |
| 11 | ntfy 설정 위치 | Notifications에 통합 vs Human Wallet Apps에 통합 vs 양쪽 표시 | **Human Wallet Apps에 관리, Notifications에 읽기 전용 표시** — ntfy 서버는 서명+알림 공용 인프라. 관리 포인트는 하나, Notifications에서는 현재 상태 확인 + 링크 |
| 12 | 설정 키 변경 | signing_sdk.* → human_wallet_apps.* | **기존 키 유지** — UI 레이블만 "Human Wallet Apps"로 변경. 내부적으로 `signing_sdk.*` 설정 키 그대로 사용. 앱 레지스트리는 별도 DB 테이블로 관리 (설정 키와 무관) |
| 13 | 앱 레지스트리 저장소 | Admin Settings JSON 배열 vs DB 테이블 | **DB 테이블 (`wallet_apps`)** — 앱은 엔티티(이름, 토글 2개, 관계)이므로 정규화된 테이블이 적합. "Used by" 역추적이 자연스러운 JOIN/쿼리로 해결. Settings는 key-value 저장소이지 엔티티 저장소가 아님 |
| 14 | `wallet_type` ↔ 앱 매핑 | 별도 매핑 테이블 vs 동일 네임스페이스 | **동일 네임스페이스** — `wallets.wallet_type` 값이 `wallet_apps.name`과 직접 대응. 별도 매핑 테이블은 불필요한 간접 참조 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

### 토픽 라우팅 (Phase 1)

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | wallet_type=dcent → 토픽 `waiaas-sign-dcent` | ApprovalChannelRouter.route() 호출 → ntfy 발행 토픽 assert | [L0] |
| 2 | wallet_type=other-wallet → 토픽 `waiaas-sign-other-wallet` | 동일 | [L0] |
| 3 | wallet_type=NULL → 글로벌 preferred_wallet fallback | wallet_type 미설정 지갑 → preferred_wallet 설정값 사용 assert | [L0] |
| 4 | wallet_type=NULL + preferred_wallet 미설정 → 에러 | `WALLET_NOT_REGISTERED` 에러 assert | [L0] |

### D'CENT 프리셋

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 5 | D'CENT 프리셋 적용 시 approval_method=sdk_ntfy | `PUT /wallets/{id}/owner` + wallet_type=dcent → DB에 sdk_ntfy 저장 assert | [L0] |
| 6 | D'CENT 프리셋 적용 시 signing SDK 자동 활성화 | PresetAutoSetupService.apply() → signing_sdk.enabled=true assert | [L0] |
| 7 | D'CENT 프리셋 적용 시 WalletLinkConfig 등록 | WalletLinkRegistry에 dcent 등록 assert | [L0] |

### Admin UI 오너 탭

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 8 | NONE 상태: 프리셋 선택 시 approval method 미리보기 | D'CENT 선택 → "Approval: Wallet App (ntfy)" 텍스트 표시 assert | [L0] |
| 9 | GRACE 상태: Wallet Type 변경 가능 | [변경] 버튼 → 드롭다운 표시 → 변경 저장 성공 assert | [L0] |
| 10 | LOCKED 상태: Wallet Type 변경 불가 | [변경] 버튼 미표시 assert | [L0] |
| 11 | sdk_ntfy 선택 시 WC 섹션 숨김 | approval_method=sdk_ntfy → WalletConnect 섹션 미렌더링 assert | [L0] |
| 12 | walletconnect 선택 시 WC 섹션 표시 | approval_method=walletconnect → WalletConnect 섹션 렌더링 assert | [L0] |
| 13 | 프리셋 변경 → approval method 자동 갱신 | Custom→D'CENT 변경 → approval_method=sdk_ntfy 자동 세팅 assert | [L0] |

### 앱 레지스트리 (wallet_apps DB — Phase 3)

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 14 | WalletAppService CRUD | 앱 등록 → 조회 → 토글 변경 → 삭제 — DB 상태 assert | [L0] |
| 15 | REST API CRUD | `POST/GET/PUT/DELETE /v1/admin/wallet-apps` — 정상 응답 + DB 반영 assert | [L0] |
| 16 | 앱 이름 UNIQUE 제약 | 동일 name으로 중복 등록 → 409 Conflict assert | [L0] |
| 17 | 프리셋 적용 시 자동 등록 | D'CENT 프리셋 적용 → `wallet_apps`에 name=dcent 자동 삽입 assert | [L0] |
| 18 | "Used by" 역추적 | wallet_type=dcent 지갑 2개 → GET /wallet-apps → "used_by" 목록에 2개 지갑 포함 assert | [L0] |
| 19 | signing_enabled=0 → 서명 차단 | wallet_type 앱의 `signing_enabled = 0` → ApprovalChannelRouter에서 `SIGNING_DISABLED` 에러 assert | [L0] |

### Human Wallet Apps 페이지 (Phase 3)

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 20 | Human Wallet Apps 페이지 렌더링 | 사이드바 Human Wallet Apps 클릭 → 페이지 렌더링 + `wallet_apps` 기반 앱 카드 표시 | [L0] |
| 21 | 지갑 앱 Signing 토글 | D'CENT 카드 Signing 토글 해제 → `wallet_apps.signing_enabled = 0` + 해당 앱으로 서명 요청 미발행 assert | [L0] |
| 22 | 지갑 앱 Alerts 토글 | D'CENT 카드 Alerts 토글 활성 → `wallet_apps.alerts_enabled = 1` + 해당 앱으로 알림 발행 assert | [L0] |
| 23 | ntfy 서버 URL 변경 | Human Wallet Apps에서 URL 변경 → Notifications 페이지에 반영 assert | [L0] |
| 24 | 앱 등록/삭제 UI | [+ Register] → 새 앱 카드 추가 → [Remove] → 앱 카드 제거 assert | [L0] |

### 알림 복수 발행 (Phase 4)

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 25 | Alerts 활성 앱 복수 → 각 토픽에 발행 | 2개 앱 Alerts=true → 이벤트 발생 → 2개 토픽 각각 발행 assert | [L0] |
| 26 | Alerts 비활성 앱 미발행 | 1개 앱 Alerts=false → 해당 토픽 미발행 assert | [L0] |
| 27 | Alerts 앱 0개 → skip | 모든 앱 Alerts=false → WalletNotificationChannel skip assert | [L0] |

### Notifications 페이지 (Phase 5)

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 28 | ntfy 독립 섹션 표시 | Settings 탭 → ntfy FieldGroup 독립 렌더링 assert | [L0] |
| 29 | Other Channels에서 ntfy 제거 | Settings 탭 → Other Channels에 Discord+Slack만 표시 assert | [L0] |
| 30 | Human Wallet Apps 링크 동작 | ntfy 섹션 "Human Wallet Apps" 링크 → Human Wallet Apps 페이지 이동 assert | [L0] |

### 하위 호환

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 31 | 기존 WC 기반 D'CENT 지갑 정상 동작 | wallet_type=dcent + approval_method=walletconnect(수동 변경) → WC 플로우 정상 | [L0] |
| 32 | 기존 signing_sdk.* 설정 키 호환 | API/CLI에서 기존 키로 설정 → 정상 동작 | [L0] |
| 33 | DB 마이그레이션 v31 정상 적용 | 빈 DB → 마이그레이션 → wallet_apps 테이블 존재 + CRUD 정상 | [L0] |
| 34 | 전체 테스트 통과 | `pnpm turbo run test:unit` + `typecheck` + `lint` | [L0] |

---

## 선행 조건

없음 — 독립적으로 실행 가능.

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 기존 D'CENT 사용자 approval_method 변경 | 기존에 WC로 설정된 D'CENT 지갑의 approval_method는 변경되지 않음 (DB 값 유지) | 프리셋 변경은 신규 설정에만 적용. 기존 사용자는 Admin UI에서 수동 변경 가능 |
| 2 | Push Relay 미운영 시 서명 불가 | D'CENT Push Relay가 다운되면 ntfy→모바일 푸시 경로 차단 | ntfy 직접 구독(SSE)은 Push Relay 무관하게 동작. Push Relay는 모바일 푸시 전달만 담당 |
| 3 | GRACE 상태 wallet_type 변경 시 불일치 | wallet_type 변경 시 이전 프리셋의 WalletLinkConfig가 잔존 | 프리셋 변경 시 PresetAutoSetupService.apply()가 idempotent하게 덮어씀 |
| 4 | WalletConnect 섹션 숨김으로 기존 UX 혼란 | WC로 연결된 상태에서 approval_method를 sdk_ntfy로 변경하면 WC 섹션이 사라짐 | WC 세션이 있으면 "기존 WalletConnect 세션이 있습니다. 해제하시겠습니까?" 안내 표시 |
| 5 | Human Wallet Apps 메뉴 도입으로 사이드바 혼란 | 기존 System 페이지 내 Signing SDK 섹션을 사용하던 사용자가 메뉴를 찾지 못함 | Signing SDK는 별도 URL 라우트가 아니라 `/system` 페이지 내 서브섹션이므로 URL 리다이렉트 불필요. System 페이지에서 해당 섹션을 제거하고 최상위 Human Wallet Apps 메뉴를 추가하면 사이드바에서 자연스럽게 발견 가능 |
| 6 | 복수 앱 알림 발행으로 ntfy 부하 증가 | 등록된 앱이 N개이면 이벤트당 N회 ntfy publish | 앱 수는 실질적으로 2-3개 이하. ntfy publish는 경량 HTTP POST이므로 부하 무시 가능 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 6개 |
| 수정 파일 | 20-25개 |
| 신규 파일 | 4-5개 (`wallet-apps` 마이그레이션, `WalletAppService`, REST 라우트, `human-wallet-apps.tsx`, 테스트) |
| DB 마이그레이션 | v31 (`wallet_apps` 테이블 신규 생성) |
| 예상 LOC 변경 | +1,800/-600 |
| 테스트 | 34개 (E2E 시나리오 기준) |

---

*생성일: 2026-03-01*
*관련: 설계 문서 73(Signing Protocol), 74(Wallet SDK + Daemon Components), 75(Push Relay)*
