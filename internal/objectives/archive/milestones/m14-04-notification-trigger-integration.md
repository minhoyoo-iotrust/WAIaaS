# 마일스톤 m14-04: 알림 이벤트 트리거 연결 + 어드민 알림 패널

## 목표

v1.3에서 구현된 알림 인프라(TelegramChannel, NotificationService, 메시지 템플릿)를 파이프라인/라우트 핸들러에 연결하여 실제 알림이 발송되도록 하고, 어드민 페이지에 알림 상태 확인 및 테스트 발송 기능을 추가한다.

---

## 배경

- v1.3에서 알림 인프라 전체 구현 완료: TelegramChannel, DiscordChannel, NtfyChannel, NotificationService, 21개 이벤트 타입, 영문/한글 메시지 템플릿
- 데몬 초기화 시 `notifications.enabled=true`이면 채널 자동 생성, NotificationService 인스턴스가 createApp()에 주입됨
- **누락 사항**: 파이프라인 스테이지 및 라우트 핸들러에서 `notificationService.notify()` 호출이 없어 실제 알림이 발송되지 않음

---

## 구현 범위

### 1. 이벤트 트리거 연결

파이프라인 스테이지와 라우트 핸들러에서 `notificationService.notify()`를 호출하여 이벤트를 발생시킨다.

#### 현재 구현 가능한 이벤트 (v1.1~v1.3 기반)

| 이벤트 | 트리거 위치 | 설명 |
|--------|------------|------|
| `TX_REQUESTED` | 파이프라인 stage1 (수신) | 전송 요청 접수 시 |
| `TX_SUBMITTED` | 파이프라인 stage5 (실행) | 체인에 서명/브로드캐스트 시 |
| `TX_CONFIRMED` | 파이프라인 stage6 (확인) | 트랜잭션 확정 시 |
| `TX_FAILED` | 파이프라인 stage5 (실행) | 전송 실패 시 |
| `POLICY_VIOLATION` | 파이프라인 stage3 (정책) | 정책 위반 거부 시 |
| `SESSION_CREATED` | POST /v1/auth/session | 에이전트 세션 생성 시 |
| `SESSION_EXPIRED` | SessionManager 만료 처리 | 세션 만료 시 |
| `OWNER_SET` | PUT /v1/agents/:id/owner | Owner 지갑 등록 시 |

#### 향후 마일스톤에서 연결할 이벤트 (현재 미구현 기능)

| 이벤트 | 의존 마일스톤 | 사유 |
|--------|-------------|------|
| `TX_QUEUED`, `TX_CANCELLED` | v1.6 (시간지연 큐) | 시간지연 파이프라인 미구현 |
| `TX_DOWNGRADED_DELAY`, `TX_APPROVAL_REQUIRED`, `TX_APPROVAL_EXPIRED` | v1.6 (승인 흐름) | Owner 승인 흐름 미구현 |
| `AGENT_SUSPENDED` | v1.6 (AutoStop) | AutoStopService 미구현 |
| `KILL_SWITCH_ACTIVATED`, `KILL_SWITCH_RECOVERED` | v1.6 (Kill Switch) | KillSwitchService 미구현 |
| `AUTO_STOP_TRIGGERED` | v1.6 (AutoStop) | AutoStopService 미구현 |
| `SESSION_EXPIRING_SOON` | SessionManager 확장 | 만료 임박 감지 로직 추가 필요 |
| `OWNER_REMOVED`, `OWNER_VERIFIED` | Owner 상태 전이 확장 | GRACE→LOCKED 전이 시 |
| `DAILY_SUMMARY` | 스케줄러 | 일일 요약 cron 미구현 |

### 2. 어드민 알림 패널

어드민 페이지에 알림 관련 UI를 추가한다. **설정 변경은 config.toml에서만** 수행하며, 어드민 UI는 읽기전용 상태 표시 + 테스트 + 로그 조회만 제공한다.

#### UI 구성

| 항목 | 유형 | 설명 |
|------|------|------|
| 채널 상태 표시 | 읽기전용 | Telegram/Discord/Ntfy 각 채널의 활성화 여부 표시 (연결됨/미설정) |
| 테스트 발송 버튼 | 액션 | 채널별 "테스트 발송" 버튼으로 실제 도달 확인 |
| 최근 알림 로그 | 목록 | notification_logs 테이블의 최근 발송/실패 이력 (v1.3.4에서 신규 생성) |
| 설정 안내 | 텍스트 | "config.toml [notifications] 섹션에서 설정을 변경하세요" 안내 |

#### 민감 정보 보호

- bot token, webhook URL 등 credential은 API 응답에 포함하지 않음
- 채널 활성 여부만 boolean으로 반환 (예: `{ telegram: true, discord: false, ntfy: false }`)

### 3. notification_logs 테이블 신규 생성

알림 발송 이력을 기록하는 테이블을 추가한다. v1.4부터 적용되는 DB 마이그레이션 정책(MIG-01~06)에 따라 ALTER TABLE 증분 마이그레이션으로 제공한다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT (UUID v7) | PK |
| event_type | TEXT | NotificationEvent enum 값 |
| agent_id | TEXT | 관련 에이전트 ID (nullable) |
| channel | TEXT | telegram / discord / ntfy |
| status | TEXT | sent / failed |
| error | TEXT | 실패 시 에러 메시지 (nullable) |
| created_at | INTEGER | 발송 시각 (epoch 초) |

### 4. 필요한 API 엔드포인트

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| GET | /admin/notifications/status | masterAuth | 채널별 활성화 상태 반환 |
| POST | /admin/notifications/test | masterAuth | 테스트 알림 발송 |
| GET | /admin/notifications/log | masterAuth | 최근 알림 발송 로그 조회 |

---

## E2E 검증 시나리오

| # | 시나리오 | 검증 방법 |
|---|---------|----------|
| 1 | config.toml에 Telegram 설정 → 데몬 시작 → SOL 전송 → TX_CONFIRMED 텔레그램 수신 | Telegram 메시지 도착 확인 |
| 2 | 잔액 부족 전송 → TX_FAILED 텔레그램 수신 | 실패 알림 메시지 확인 |
| 3 | 정책 한도 초과 전송 → POLICY_VIOLATION 텔레그램 수신 | 정책 위반 알림 확인 |
| 4 | 세션 생성 → SESSION_CREATED 알림 수신 | 세션 알림 확인 |
| 5 | 어드민 UI → 알림 채널 상태 확인 | Telegram "연결됨" 표시 확인 |
| 6 | 어드민 UI → 테스트 발송 → 텔레그램 수신 | 테스트 메시지 도착 확인 |
| 7 | 어드민 UI → 알림 로그에 발송 이력 표시 | 로그 목록 확인 |

---

## 의존성

- v1.3 알림 인프라 (완료): TelegramChannel, NotificationService, 메시지 템플릿
- v1.3.2 어드민 UI (완료): 기본 레이아웃, 라우팅, API 클라이언트
- Telegram Bot Token + Chat ID (사용자 사전 준비)

## 범위 외

- config.toml 설정을 어드민 UI에서 직접 수정하는 기능 (SSoT 위반)
- bot token 등 credential을 API로 노출하는 기능 (보안 리스크)
- Telegram Bot 인터랙티브 기능 (명령 수신, 승인/거부) — v1.6 범위
- Kill Switch, AutoStop 연동 알림 — v1.6 범위
