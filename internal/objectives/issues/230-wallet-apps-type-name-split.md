# 230 — wallet_apps wallet_type / name 분리

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **발견:** v29.10
- **상태:** OPEN

## 증상

wallet_apps 테이블의 `name`이 프리셋명과 결합되어 있어 동일 지갑 종류(예: 디센트)를 여러 디바이스로 등록할 수 없음. "dcent"라는 이름이 프리셋 결정과 사용자 식별을 동시에 담당.

## 현재 구조 (문제)

```
wallet_apps:
┌──────────┬────────────┬──────────────┐
│ name(PK) │ sign_topic │ alerts       │
├──────────┼────────────┼──────────────┤
│ dcent    │ waiaas-... │ true         │  ← name = 프리셋명 = 유일한 식별자
└──────────┴────────────┴──────────────┘
  → "dcent" 하나만 등록 가능
  → 프리셋 조회도 name 기준, 사용자 식별도 name 기준
```

## 수정 방안

### 1. wallet_type 컬럼 추가

```sql
ALTER TABLE wallet_apps ADD COLUMN wallet_type TEXT;
-- 마이그레이션: UPDATE wallet_apps SET wallet_type = name;
```

- `wallet_type`: 프리셋 결정 (서명 프로토콜, 푸시 릴레이 URL, 자동 설정 등)
- `name`: 사용자가 자유롭게 지정하는 라벨 (PK, UNIQUE)

### 2. 변경 후 구조

```
wallet_apps:
┌──────────┬─────────────┬────────────┬──────────────┐
│ name(PK) │ wallet_type │ sign_topic │ alerts       │
├──────────┼─────────────┼────────────┼──────────────┤
│ 내 폰    │ dcent       │ waiaas-... │ true         │
│ 아내 폰  │ dcent       │ waiaas-... │ true         │
│ 사무실   │ dcent       │ waiaas-... │ false        │
└──────────┴─────────────┴────────────┴──────────────┘
```

### 3. 프리셋 참조를 name → wallet_type으로 전환

- `PresetAutoSetupService`: wallet_type 기준으로 프리셋 자동 설정
- `WalletAppService`: wallet_type 기준으로 프리셋 조회
- `SignRequestBuilder`: wallet_type 기준으로 토픽 폴백
- `ApprovalChannelRouter`: wallet_type 기준으로 서명 채널 결정

### 4. Admin UI 폼 변경

```
┌──────────────────────────────────────────────────────┐
│ Add Wallet App                                       │
│                                                      │
│ Wallet Type: [D'CENT           ▼]  ← 프리셋 선택     │
│ Name:        [내 폰              ]  ← 사용자 라벨     │
│ Alerts:      ☑ ON                                    │
│                                                [Save]│
└──────────────────────────────────────────────────────┘
```

### 5. REST API 변경

```
POST /v1/admin/wallet-apps
  { walletType: "dcent", name: "내 폰", alertsEnabled: true }

GET /v1/admin/wallet-apps
  → [{ name: "내 폰", walletType: "dcent", ... }, ...]
```

## 영향 범위

- `packages/daemon/src/infrastructure/database/schema.ts` — wallet_apps 스키마
- `packages/daemon/src/infrastructure/database/migrations/` — wallet_type 컬럼 + 백필
- `packages/daemon/src/services/signing-sdk/wallet-app-service.ts` — wallet_type 기반 조회
- `packages/daemon/src/services/signing-sdk/preset-auto-setup.ts` — wallet_type 기준 자동 설정
- `packages/daemon/src/services/signing-sdk/sign-request-builder.ts` — wallet_type 기반 토픽 폴백
- `packages/daemon/src/api/routes/admin.ts` — CRUD API에 wallet_type 필드
- `packages/admin/src/pages/wallet-apps.tsx` — wallet_type 드롭다운 + name 자유 입력

## 테스트 항목

- [ ] wallet_type 컬럼 추가 + 기존 데이터 마이그레이션 (wallet_type = name)
- [ ] 동일 wallet_type으로 여러 앱 등록 가능 (name만 다르면 OK)
- [ ] 프리셋 자동 설정이 wallet_type 기준으로 동작
- [ ] 서명 요청 시 wallet_type 기준으로 토픽 결정
- [ ] Admin UI에서 wallet_type 드롭다운 + name 자유 입력
- [ ] REST API에서 walletType 필드 수용 + 반환
- [ ] 기존 데이터(wallet_type 미지정) 하위 호환
