# 159 — 딜레이/승인 대기 거래 취소 UX 개선 (Telegram 버튼 + Admin UI)

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **마일스톤:** v28.2
- **상태:** OPEN
- **발견일:** 2026-02-23

## 요약

딜레이 정책(DELAY tier) 또는 승인 대기(APPROVAL tier)에 걸린 거래를 사용자가 쉽게 취소/거부할 수 있도록
Telegram 알림에 인라인 버튼을 추가하고, Admin UI 트랜잭션 상세에 취소/거부 버튼을 추가한다.

## 현재 문제

1. 거래 요청 Telegram 알림이 텍스트 전용 — 취소/거부 액션 버튼 없음
2. Admin UI 트랜잭션 페이지에 취소/거부 버튼 없음
3. 현재 취소 가능한 경로가 REST API 직접 호출뿐 — 일반 사용자에게 비현실적

## 기존 인프라 (추가 구현 불필요)

- `POST /v1/transactions/{id}/cancel` (sessionAuth) — DELAY tier QUEUED 거래 취소
- `POST /v1/transactions/{id}/reject` (ownerAuth) — APPROVAL tier 거래 거부
- `TelegramBotService` — Long Polling + `callback_query` 수신 + `approve:`/`reject:` 핸들러 패턴
- `TelegramApi.answerCallbackQuery()` — 버튼 클릭 응답
- `buildApprovalKeyboard()` — 인라인 키보드 빌더 참조 패턴

## 변경 범위

### A. Telegram 거래 알림에 인라인 버튼 추가

#### 봇 활성화 상태

- `TelegramChannel.send()`: 거래 관련 이벤트(`TX_DELAYED`, `TX_PENDING_APPROVAL`) 알림 시 인라인 키보드 포함
  - DELAY tier: `[거래 취소]` 버튼 (`callback_data: 'cancel:{txId}'`)
  - APPROVAL tier: `[승인]` `[거부]` 버튼 (`callback_data: 'approve:{txId}'` / `'reject:{txId}'`)
- `TelegramBotService.handleCallbackQuery()`: `cancel:` 콜백 핸들러 추가
  - `delayQueue.cancelDelay(txId)` 호출
  - `answerCallbackQuery('거래가 취소되었습니다')` 응답
  - 감사 로그: `TX_CANCELLED_VIA_TELEGRAM`

#### 봇 미활성 상태 (알림 채널만 사용)

- `TelegramChannel.send()`: 인라인 키보드 버튼 대신 안내 텍스트 추가
  - "거래를 취소하려면 Telegram Bot을 활성화하거나 Admin 페이지에서 취소할 수 있습니다."
- 봇 활성 여부 판단: `TelegramChannel.initialize()`에서 봇 활성 상태를 주입받거나,
  SettingsService에서 `telegram.bot_enabled` 값을 참조

### B. Admin UI 트랜잭션 상세에 취소/거부 버튼 추가

- `packages/admin/src/pages/transactions.tsx`:
  - QUEUED + DELAY tier 거래 상세에 "거래 취소" 버튼 표시
  - QUEUED + APPROVAL tier 거래 상세에 "거부" 버튼 표시
  - 확인 모달 → `POST /v1/transactions/{id}/cancel` (masterAuth) 또는 `POST /v1/transactions/{id}/reject` (masterAuth) 호출
  - 성공 시 목록 새로고침 + 토스트 알림

### C. Admin 전용 거래 취소 API 권한 확장

- 현재 cancel은 sessionAuth, reject는 ownerAuth만 가능
- Admin(masterAuth)에서도 취소/거부할 수 있도록 권한 확장 검토
  - 방안 1: 기존 엔드포인트에 masterAuth 대체 인증 추가
  - 방안 2: `POST /v1/admin/transactions/{id}/cancel` 별도 엔드포인트

## 테스트 항목

- [ ] Telegram 봇 활성 + DELAY 거래 알림 시 "거래 취소" 인라인 버튼 표시 확인
- [ ] Telegram 봇 활성 + APPROVAL 거래 알림 시 "승인"/"거부" 인라인 버튼 표시 확인
- [ ] "거래 취소" 버튼 클릭 시 QUEUED → CANCELLED 전이 + answerCallbackQuery 응답 확인
- [ ] 이미 처리된 거래의 버튼 클릭 시 "거래를 찾을 수 없습니다" 응답 확인
- [ ] Telegram 봇 미활성 + 알림 채널만 활성 시 안내 텍스트 포함 확인
- [ ] Admin UI QUEUED+DELAY 거래 상세에 취소 버튼 표시 확인
- [ ] Admin UI QUEUED+APPROVAL 거래 상세에 거부 버튼 표시 확인
- [ ] Admin UI 취소/거부 클릭 → 확인 모달 → API 호출 → 상태 갱신 확인
- [ ] 감사 로그에 TX_CANCELLED_VIA_TELEGRAM / TX_CANCELLED_VIA_ADMIN 기록 확인
