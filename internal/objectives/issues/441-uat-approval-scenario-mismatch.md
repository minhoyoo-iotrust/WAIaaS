# 441 — UAT 오너 승인 시나리오(advanced-05)가 실제 구현과 불일치

- **유형:** BUG
- **심각도:** LOW
- **등록일:** 2026-03-24

## 현상

`agent-uat/advanced/tx-approval-workflow.md` (advanced-05)의 기대값이 실제 트랜잭션 상태 체계와 맞지 않아 시나리오대로 검증할 수 없다.

## 불일치 항목

| # | 시나리오 내용 | 실제 구현 |
|---|-------------|-----------|
| 1 | `GET /v1/owner/status` (세션 토큰) | 존재하지 않는 API. `GET /v1/connect-info`의 `wallets[].ownerState`로 변경 필요 (#440 선행) |
| 2 | Expected: `PENDING_APPROVAL` (Step 2,3,6,8,10) | `QUEUED` + `tier: APPROVAL` |
| 3 | Step 2 전송 응답 `status: "PENDING_APPROVAL"` | `status: "PENDING"` (이후 QUEUED 전환) |
| 4 | Verification 체크리스트 `PENDING_APPROVAL` 6회 | `QUEUED` (tier: APPROVAL) |
| 5 | Troubleshooting `PENDING_APPROVAL` 2회 | `QUEUED` |
| 6 | Prerequisites `state=LOCKED` 필수 | `GRACE` 또는 `LOCKED` (GRACE에서 approve 시 자동 LOCKED 전환) |

## 원인

시나리오 작성 시 `PENDING_APPROVAL`이라는 상태가 존재할 것으로 가정하고 작성되었으나, 실제 트랜잭션 상태 체계는 `QUEUED` 단일 상태 + `tier` 필드(DELAY/APPROVAL)로 구분하는 구조.

## 수정 방안

### 1. 시나리오 분리

현재 advanced-05는 Step 10개에 session/owner/master auth가 혼재되어 있다. 관심사와 auth 요구사항이 다른 두 시나리오로 분리한다:

| 시나리오 | auth | 내용 |
|----------|------|------|
| **advanced-05** (승인/거부/취소) | session + owner | approve, reject, cancel (기존 Step 1-9) |
| **advanced-06** (타임아웃 자동 만료) | session + master | approval_timeout 단축 → 생성 → 대기 → EXPIRED 확인 → 설정 원복 |

### 2. advanced-05 수정 (승인/거부/취소)

- `PENDING_APPROVAL` → `QUEUED` (+ `tier: APPROVAL` 확인 안내) 전체 치환
- Step 1의 API를 `GET /v1/connect-info`로 변경 (#440 해결 후)
- Prerequisites의 `state=LOCKED` → `state=GRACE 또는 LOCKED` (이미 수정됨)
- Step 2 Expected를 `status: "PENDING"` 후 조회 시 `QUEUED`로 수정
- 기존 Step 10 (타임아웃) 제거

### 3. advanced-06 신규 (타임아웃 자동 만료)

- Prerequisites: masterAuth(X-Master-Password) + 세션 토큰
- Step 1: `PUT /v1/admin/settings`로 `approval_timeout`을 짧게 설정 (예: 30초)
- Step 2: APPROVAL 티어 트랜잭션 생성 → `QUEUED`
- Step 3: 타임아웃 대기
- Step 4: 상태 확인 → `EXPIRED` (`CANCELLED`가 아님)
- Step 5: `PUT /v1/admin/settings`로 원래 값 복원

## 수정 파일

- `agent-uat/advanced/tx-approval-workflow.md` — 기존 시나리오 수정 (Step 10 제거, 상태값 수정)
- `agent-uat/advanced/approval-timeout.md` — 신규 시나리오 생성

## 테스트 항목

### 수동 확인

- 수정된 advanced-05의 각 Step을 실제 데몬에서 실행하여 Expected와 일치하는지 확인
- 신규 advanced-06의 타임아웃 흐름을 실제 데몬에서 실행하여 EXPIRED 전환을 확인
