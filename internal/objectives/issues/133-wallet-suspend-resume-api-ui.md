# 133 — 지갑 Suspend/Resume REST API 및 Admin UI 버튼 추가

- **유형:** MISSING
- **심각도:** HIGH
- **마일스톤:** v27.0
- **상태:** FIXED
- **등록일:** 2026-02-21

## 현상

지갑 상태 enum에 `SUSPENDED`가 정의되어 있고, DB 스키마에 `suspended_at`과 `suspension_reason` 컬럼이 존재하지만, 관리자가 수동으로 지갑을 suspend/resume할 수 있는 REST API와 Admin UI가 없다.

현재 `SUSPENDED` 전환은 킬 스위치 활성화(`KILL_SWITCH_ACTIVATED`)나 AutoStopService(`CONSECUTIVE_FAILURES`, `UNUSUAL_ACTIVITY`)에 의해 내부적으로만 발생한다. 킬 스위치 복구 후 지갑이 `SUSPENDED` 상태로 남았을 때 Admin UI에서 복원할 방법이 없어, DB 직접 수정이 필요하다.

### 현재 상태

| 기능 | 상태 |
|------|------|
| `SUSPENDED` enum/DB 컬럼 | 구현됨 (`wallet.ts:6`, `schema.ts:66-72`) |
| 킬 스위치/AutoStop에 의한 자동 suspend | 구현됨 |
| `POST /wallets/:id/suspend` | **미구현** |
| `POST /wallets/:id/resume` | **미구현** |
| Admin UI Suspend 버튼 | **미구현** |
| Admin UI Resume 버튼 | **미구현** |
| 상세 페이지 suspension_reason 표시 | **미구현** |

## 수정 범위

### 1. REST API 추가

**`POST /v1/wallets/:id/suspend`** (masterAuth):

요청:
```json
{
  "reason": "maintenance"
}
```

응답 (200):
```json
{
  "id": "uuid",
  "status": "SUSPENDED",
  "suspendedAt": 1771682679,
  "suspensionReason": "maintenance"
}
```

- `reason`은 optional (기본값: `"MANUAL"`)
- 상태가 `ACTIVE`일 때만 전환 가능, 그 외 상태에서는 `INVALID_STATE_TRANSITION` 에러
- `suspended_at` = 현재 시각, `suspension_reason` = 요청 reason

**`POST /v1/wallets/:id/resume`** (masterAuth):

응답 (200):
```json
{
  "id": "uuid",
  "status": "ACTIVE",
  "resumedAt": 1771682700
}
```

- 상태가 `SUSPENDED`일 때만 전환 가능, 그 외 상태에서는 `INVALID_STATE_TRANSITION` 에러
- `suspended_at` = NULL, `suspension_reason` = NULL로 초기화

### 2. Admin UI 지갑 상세 페이지

**ACTIVE 상태일 때:**
```
[Suspend Wallet]  [Terminate Wallet]
```
- "Suspend Wallet" 버튼 (warning variant) — 클릭 시 확인 모달 + 선택적 사유 입력

**SUSPENDED 상태일 때:**
```
⚠ Wallet suspended: maintenance (2026-02-21 15:30)
[Resume Wallet]  [Terminate Wallet]
```
- suspension reason + suspended_at 표시
- "Resume Wallet" 버튼 (primary variant)
- "Terminate Wallet"은 SUSPENDED 상태에서도 가능 유지

### 3. 지갑 상세 응답에 suspend 정보 포함

`GET /v1/wallets/:id` 응답에 `suspendedAt`, `suspensionReason` 필드를 추가하여 Admin UI에서 표시할 수 있도록 한다. `SUSPENDED` 상태가 아닌 경우 `null`.

### 영향 범위

- `packages/daemon/src/api/routes/wallets.ts` — suspend/resume 엔드포인트 추가
- `packages/daemon/src/api/routes/openapi-schemas.ts` — 요청/응답 스키마
- `packages/admin/src/pages/wallets.tsx` — Suspend/Resume 버튼 + suspension 정보 표시
- `skills/wallet.skill.md` — suspend/resume API 레퍼런스 추가

## 테스트 항목

### 단위 테스트

1. `POST /wallets/:id/suspend` — ACTIVE 상태에서 SUSPENDED로 전환되는지 확인
2. `POST /wallets/:id/suspend` — SUSPENDED 상태에서 호출 시 `INVALID_STATE_TRANSITION` 에러 확인
3. `POST /wallets/:id/suspend` — TERMINATED 상태에서 호출 시 `INVALID_STATE_TRANSITION` 에러 확인
4. `POST /wallets/:id/suspend` — `suspended_at`과 `suspension_reason`이 DB에 저장되는지 확인
5. `POST /wallets/:id/suspend` — reason 미전달 시 기본값 `"MANUAL"`이 저장되는지 확인
6. `POST /wallets/:id/resume` — SUSPENDED 상태에서 ACTIVE로 전환되는지 확인
7. `POST /wallets/:id/resume` — ACTIVE 상태에서 호출 시 `INVALID_STATE_TRANSITION` 에러 확인
8. `POST /wallets/:id/resume` — `suspended_at`과 `suspension_reason`이 NULL로 초기화되는지 확인
9. `GET /wallets/:id` — SUSPENDED 상태에서 `suspendedAt`, `suspensionReason`이 응답에 포함되는지 확인
10. masterAuth 없이 호출 시 401 확인

### Admin UI 테스트

11. ACTIVE 상태에서 "Suspend Wallet" 버튼이 표시되는지 확인
12. SUSPENDED 상태에서 "Resume Wallet" 버튼이 표시되는지 확인
13. SUSPENDED 상태에서 suspension reason과 timestamp가 표시되는지 확인
14. TERMINATED 상태에서 Suspend/Resume 버튼이 모두 없는지 확인

### 회귀 테스트

15. 킬 스위치 활성화 시 기존 자동 suspend 동작이 변경되지 않는지 확인
16. "Terminate Wallet" 기능이 ACTIVE/SUSPENDED 양 상태에서 정상 동작하는지 확인
