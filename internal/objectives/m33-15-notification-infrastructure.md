# 마일스톤 m33-15: 알림 인프라 확장

- **Status:** PLANNED
- **Milestone:** v33.5

## 목표

알림 시스템의 인프라를 확장한다. 우선순위 시스템으로 긴급 알림과 일상 알림을 구분하고, Quiet Hours로 방해 금지 시간대를 설정하고, 일일 요약을 실질적으로 유용한 리포트로 강화하고, Read Receipt으로 알림 도달 확인을 제공한다. m33-14에서 개선된 메시지 품질 위에 인프라 레이어를 쌓는 마일스톤이다.

이 마일스톤은 Push Relay payload에 신규 optional 필드를 추가하므로, CLAUDE.md에 하위호환 컨벤션을 선행 추가한다.

---

## 배경

m33-14에서 알림 수와 메시지 품질이 개선되더라도 다음 문제가 남는다:

| 문제 | 현황 |
|------|------|
| 모든 알림이 동일 무게 | KILL_SWITCH_ACTIVATED와 SESSION_CREATED가 같은 레벨로 도착 |
| 24시간 알림 | 새벽 3시에도 SESSION_EXPIRED 푸시 |
| 일일 요약이 숫자 나열 | `"Wallets: 3, Transactions: 15, Sessions: 2"` — 인사이트 없음 |
| 알림 도달 확인 불가 | 사용자가 알림을 읽었는지 추적할 방법 없음 |

---

## 선행 작업: Push Relay 하위호환 컨벤션

CLAUDE.md에 다음 규칙을 추가한다:

```
## Push Relay Protocol Compatibility

- **Additive-only**: Push Relay payload의 기존 필드를 삭제하거나 이름을 변경하지 않는다.
  신규 필드만 추가한다 (additive change). 기존 필드의 값 형식(type, encoding)도 변경하지 않는다.
- **Optional new fields**: 신규 필드는 항상 optional이어야 한다.
  지갑 앱이 해당 필드를 무시해도 기존 동작에 영향 없어야 한다.
- **Integration contract**: `docs/integration/push-relay-payload.md`에
  라이브 지갑 벤더(D'CENT 등)가 의존하는 필드 목록을 관리한다.
  이 문서에 명시된 필드는 제거/변경 금지 (breaking change 금지).
- **Deprecation process**: 필드 제거가 불가피할 경우, 최소 2개 minor 릴리스 동안
  deprecated 마킹(문서 + 필드 유지) 후 다음 major에서 제거한다.
  제거 전 라이브 벤더에게 사전 고지한다.
```

※ payload `version` 필드는 현재 `'1'` 고정값으로 분기 로직 없이 하드코딩 상태. 실제 버전 관리 수단이 아니므로 컨벤션에서 의존하지 않는다. 향후 breaking change가 필요해지면 그 시점에 버전 분기 전략을 설계한다.

---

## 산출물

### 1. Integration Contract 문서

`docs/integration/push-relay-payload.md` 생성 — 라이브 벤더가 의존하는 필드를 명시적으로 관리:

```markdown
# Push Relay Payload Integration Contract

## Sign Request Payload (category: "sign_request")

| Field | Type | Required | Since | Description |
|-------|------|----------|-------|-------------|
| title | string | Y | v1.0 | 알림 제목 |
| body | string | Y | v1.0 | 사람 친화적 요약 (displayMessage) |
| version | string | Y | v1.0 | 프로토콜 버전 (현재 "1") |
| requestId | string (UUID) | Y | v1.0 | 서명 요청 고유 ID |
| signerAddress | string | Y | v1.0 | 서명 대상 주소 |
| message | string | Y | v1.0 | 서명할 메시지 전문 |
| displayMessage | string | Y | v1.0 | 사용자 표시용 요약 |
| expiresAt | string (ISO 8601) | Y | v1.0 | 요청 만료 시각 |
| metadata | string (JSON) | Y | v1.0 | 트랜잭션 메타데이터 |
| responseChannel | string (JSON) | Y | v1.0 | 응답 채널 정보 |
| caip2ChainId | string | N | v1.0 | CAIP-2 체인 ID |
| networkName | string | N | v1.0 | 네트워크 이름 |
| universalLinkUrl | string | N | v1.0 | 딥링크 URL |

## Notification Payload (category: "notification")

| Field | Type | Required | Since | Description |
|-------|------|----------|-------|-------------|
| version | string | Y | v1.0 | 프로토콜 버전 |
| eventType | string | Y | v1.0 | 이벤트 타입 |
| walletId | string | Y | v1.0 | 지갑 ID |
| walletName | string | Y | v1.0 | 지갑 이름 |
| category | string | Y | v1.0 | 알림 카테고리 |
| title | string | Y | v1.0 | 알림 제목 |
| body | string | Y | v1.0 | 알림 본문 |
| timestamp | number | Y | v1.0 | Unix epoch (초) |
| details | object | N | v1.0 | 이벤트별 상세 |

## Live Vendors
- D'CENT Wallet (since v2.9.0-rc)
```

### 2. 우선순위 시스템 (E)

#### 3-Tier Priority

| Priority | 값 | 이벤트 | OS 알림 동작 |
|----------|---|--------|-------------|
| **critical** | 1 | KILL_SWITCH_ACTIVATED, KILL_SWITCH_ESCALATED, LIQUIDATION_IMMINENT, TX_INCOMING_SUSPICIOUS, AUTO_STOP_TRIGGERED | 소리+진동, DND 무시 |
| **normal** | 2 | TX_CONFIRMED, TX_FAILED, TX_QUEUED, TX_APPROVAL_REQUIRED, TX_CANCELLED, TX_INCOMING, LOW_BALANCE, BRIDGE_COMPLETED/FAILED/TIMEOUT/REFUNDED, STAKING_*, EXCHANGE_*, EXTERNAL_ACTION_FILLED/FAILED, POLICY_VIOLATION, MARGIN_WARNING, LIQUIDATION_WARNING, MATURITY_WARNING | 기본 알림 |
| **low** | 3 | SESSION_CREATED, SESSION_EXPIRED, SESSION_IDLE, OWNER_SET, OWNER_VERIFIED, OWNER_REMOVED, UPDATE_AVAILABLE, RPC_RECOVERED, DAILY_SUMMARY, CUMULATIVE_LIMIT_WARNING, APPROVAL_CHANNEL_SWITCHED, ERC8128_*, AGENT_*, REPUTATION_* | 무음 뱃지만 |

#### Push Relay payload 추가 필드 (additive)

Notification payload에 optional `priority` 필드 추가:

```typescript
// WalletNotificationChannel payload (신규 필드)
{
  // ... 기존 필드 유지
  priority?: 'critical' | 'normal' | 'low',  // 신규 optional
}
```

- D'CENT 앱이 `priority`를 무시해도 기존 동작에 영향 없음 (additive-only)
- 지갑 앱이 priority를 지원하면 OS 알림 채널/소리를 분기 가능
- Telegram: critical은 `disable_notification: false`, low는 `disable_notification: true`

#### 구현 위치

- `notification-service.ts`에 `EVENT_PRIORITY_MAP: Record<NotificationEventType, Priority>` 상수 추가
- `WalletNotificationChannel.publishNotification()`에서 payload에 priority 포함
- Telegram 채널에서 `disable_notification` 옵션 priority 기반 설정

### 3. Quiet Hours / Do Not Disturb (F)

#### 설정

| 설정 키 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `notifications.quiet_hours_enabled` | boolean | false | Quiet Hours 활성화 |
| `notifications.quiet_hours_start` | string | "23:00" | 시작 시각 (HH:MM, 로컬) |
| `notifications.quiet_hours_end` | string | "07:00" | 종료 시각 (HH:MM, 로컬) |
| `notifications.quiet_hours_timezone` | string | "UTC" | 시간대 (IANA) |

#### 동작

```
Quiet Hours 중:
  - critical → 즉시 전송 (DND 무시)
  - normal, low → 버퍼에 저장
  
Quiet Hours 해제 시:
  - 버퍼된 알림을 요약으로 발송:
    "Quiet Hours 중 알림 12건: 전송 완료 8, 수신 3, 세션 만료 1"
  - 개별 재전송 안 함 (요약만)
```

#### 구현

- `notification-service.ts`에 `isQuietHours(): boolean` 체크 추가
- `quiet_hours_buffer: Map<string, NotificationPayload[]>` 인메모리 버퍼
- Quiet Hours 해제 감지: 분 단위 체크 (기존 SessionExpirationWorker와 동일 패턴)
- 버퍼 요약 발송: `QUIET_HOURS_SUMMARY` 신규 이벤트 타입 추가

### 4. 일일 요약 강화 (G)

현재 DAILY_SUMMARY:
```
"Wallets: 3, Transactions: 15, Sessions: 2"
```

개선안:

```
📊 Daily Summary — Apr 1, 2026

Transactions: 15 (✓ 14 success / ✗ 1 failed)
Total spent: $2,340.50
Received: 2 incoming ($890.00)
Active sessions: 2
Alerts: Low balance on wallet-A (0.02 ETH)
DeFi: Aave HF 1.8 (safe), Pendle matures in 3d

Quiet Hours buffered: 4 notifications
```

#### 변수 확장

| 변수 | 타입 | 설명 |
|------|------|------|
| `txSuccessCount` | number | 성공 거래 수 |
| `txFailCount` | number | 실패 거래 수 |
| `totalSpentUsd` | string | 총 지출 USD |
| `incomingCount` | number | 수신 거래 수 |
| `incomingUsd` | string | 수신 총액 USD |
| `activeSessionCount` | number | 활성 세션 수 |
| `alerts` | string | 경고 요약 (잔액 부족, DeFi 위험 등) |
| `defiSummary` | string | DeFi 포지션 상태 요약 |
| `quietBuffered` | number | Quiet Hours 중 버퍼된 알림 수 |

#### 데이터 수집

- 트랜잭션 집계: `transactions` 테이블 WHERE created_at >= today AND status IN ('CONFIRMED', 'FAILED')
- USD 집계: `transaction_metadata.usd_amount` SUM
- 수신 집계: `incoming_transactions` 테이블 WHERE detected_at >= today
- DeFi 상태: PositionTracker 최신 캐시에서 HF/margin/maturity 조회
- 잔액 경고: BalanceMonitor 최신 상태에서 threshold 미달 지갑 조회

### 5. Read Receipt (M)

#### Push Relay API 확장

Push Relay 서버에 신규 엔드포인트 추가:

```
POST /v1/notifications/{notificationId}/read
Content-Type: application/json

{ "readAt": "2026-04-01T10:30:00Z" }
```

#### Notification payload 추가 필드

```typescript
{
  // ... 기존 필드 유지
  notificationId?: string,  // 신규 optional — 읽음 확인용 고유 ID
}
```

#### 데몬 연동

- Push Relay가 read receipt을 수신하면 daemon의 webhook으로 전달
- Daemon은 `notification_logs` 테이블에 `read_at` 컬럼 추가
- Admin UI 알림 로그에 읽음/미읽음 상태 표시
- Admin 대시보드에 "미읽은 알림" 카운트 위젯

#### 주의사항

- Read receipt은 best-effort — 지갑 앱이 미지원해도 기존 동작 영향 없음
- D'CENT 앱의 read receipt 지원은 벤더 협의 필요
- 초기에는 daemon 자체 notification_logs 기반으로 "전송됨/실패" 표시만 강화하고, read receipt은 지갑 앱 지원 준비되면 활성화

---

## 파일/모듈 구조

```
CLAUDE.md                                    # Push Relay 하위호환 컨벤션 추가

docs/integration/
  push-relay-payload.md                      # Integration Contract (신규)

packages/core/src/
  enums/
    notification.ts                          # QUIET_HOURS_SUMMARY 이벤트 추가
  i18n/
    en.ts                                    # DAILY_SUMMARY 템플릿 개편, QUIET_HOURS_SUMMARY 추가
    ko.ts                                    # 동일
  schemas/
    signing-protocol.ts                      # NotificationMessageSchema에 priority, notificationId optional 추가

packages/daemon/src/
  notifications/
    notification-service.ts                  # Priority 매핑, Quiet Hours 로직, 버퍼
    daily-summary-builder.ts                 # 일일 요약 데이터 수집 + 포맷 (신규)
  infrastructure/
    settings/
      setting-keys.ts                        # quiet_hours_* 설정 키 추가
    database/
      schema.ts                              # notification_logs.read_at 컬럼 추가
      migrations/                            # ALTER TABLE migration

packages/push-relay/src/
  relay/
    notification-routes.ts                   # POST /v1/notifications/:id/read (신규)
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | Priority를 payload에 포함 vs 채널 레벨만 | payload에 optional 포함 | 지갑 앱이 자체적으로 OS 알림 채널 분기 가능. additive-only이므로 하위호환 보장 |
| 2 | Quiet Hours 버퍼 | 인메모리 Map | 데몬 재시작 시 버퍼 유실되지만, 재시작은 드물고 알림은 이미 notification_logs에 기록됨. DB 버퍼는 과도한 복잡도 |
| 3 | 일일 요약 데이터 수집 | 기존 테이블 직접 쿼리 | 별도 집계 테이블 불필요. transactions, incoming_transactions, notification_logs를 date 범위 조회 |
| 4 | Read Receipt 프로토콜 | Push Relay 중계 | 데몬 → 지갑 앱 → Push Relay → 데몬 경로. Push Relay가 중계하므로 데몬 외부 노출 불필요 |
| 5 | payload version 필드 | 현행 유지 ('1' 고정) | 신규 필드는 모두 optional이므로 version bump 불필요. version 분기는 breaking change 시점에 도입 |

---

## E2E 검증 시나리오

**자동화 비율: 80%+ — `[HUMAN]` 3건, `[L1]` 12건**

### 우선순위 시스템

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | Critical 이벤트 priority | KILL_SWITCH_ACTIVATED → Push Relay payload에 `priority: 'critical'` 포함 assert | [L1] |
| 2 | Normal 이벤트 priority | TX_CONFIRMED → payload에 `priority: 'normal'` 포함 assert | [L1] |
| 3 | Low 이벤트 priority | SESSION_CREATED → payload에 `priority: 'low'` 포함 assert | [L1] |
| 4 | Telegram silent 전송 | low priority 이벤트 → Telegram `disable_notification: true` assert | [L1] |
| 5 | D'CENT priority 무시 호환 | priority 필드 추가 후 D'CENT 앱에서 기존 알림 정상 수신 확인 | [HUMAN] |

### Quiet Hours

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 6 | Normal 이벤트 버퍼링 | Quiet Hours 중 TX_CONFIRMED → notification_logs에 `status='buffered'`, 푸시 미전송 assert | [L1] |
| 7 | Critical 이벤트 관통 | Quiet Hours 중 KILL_SWITCH_ACTIVATED → 즉시 전송 assert | [L1] |
| 8 | 해제 시 요약 발송 | Quiet Hours 종료 → QUIET_HOURS_SUMMARY 이벤트 발생 + 버퍼된 건수 포함 assert | [L1] |
| 9 | 비활성화 시 무동작 | quiet_hours_enabled=false → 모든 알림 즉시 전송 assert | [L1] |

### 일일 요약

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 10 | 요약 데이터 정확성 | 10건 성공 + 2건 실패 거래 후 DAILY_SUMMARY → txSuccessCount=10, txFailCount=2 assert | [L1] |
| 11 | USD 집계 | 총 지출 $500 거래 5건 → totalSpentUsd에 $500 반영 assert | [L1] |
| 12 | DeFi 상태 포함 | Aave 포지션 존재 시 → defiSummary에 HF 값 포함 assert | [L1] |

### Read Receipt

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 13 | Read endpoint 동작 | POST /v1/notifications/{id}/read → 200 OK + read_at 기록 assert | [L1] |
| 14 | Admin UI 읽음 상태 | read_at 존재 → 알림 로그에 "읽음" 표시 assert | [L1] |
| 15 | D'CENT read receipt E2E | D'CENT 앱에서 알림 열기 → read receipt 전송 → Admin 반영 확인 | [HUMAN] |

---

## 하위호환성

| 변경 | 유형 | 영향 |
|------|------|------|
| payload에 `priority` 필드 추가 | additive | D'CENT 무시 가능 — 영향 없음 |
| payload에 `notificationId` 필드 추가 | additive | D'CENT 무시 가능 — 영향 없음 |
| Push Relay에 `/v1/notifications/:id/read` API 추가 | 신규 | 기존 API 변경 없음 |
| notification_logs에 `read_at` 컬럼 추가 | ALTER TABLE | nullable 컬럼 — 기존 쿼리 영향 없음 |
| NotificationMessageSchema 확장 | optional 필드 | Zod parse 기존 메시지 통과 |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m33-14 (알림 메시지 품질 개선) | Quiet Event 시스템 + 개선된 템플릿 위에 인프라 확장 |
| Push Relay 서버 | Read Receipt API 추가, priority 전달 |
| BalanceMonitor, PositionTracker | 일일 요약 데이터 수집 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | Quiet Hours 버퍼 메모리 | 장시간 Quiet Hours + 대량 알림 시 메모리 증가 | 버퍼 최대 크기 제한 (default 100건). 초과 시 oldest drop + 요약에 "N건 추가 생략" 표시 |
| 2 | 일일 요약 쿼리 부하 | 대량 거래 시 집계 쿼리 느려질 수 있음 | SQLite WAL 모드 + 인덱스 활용. 요약은 새벽 시간(데몬 유휴) 실행 |
| 3 | Read Receipt 벤더 지원 | D'CENT 앱이 read receipt API를 호출하지 않을 수 있음 | 초기에는 daemon-side "전송됨/실패" 표시만 강화. read receipt은 벤더 협의 후 활성화 |
| 4 | 시간대 처리 | Quiet Hours timezone 잘못 설정 시 예기치 않은 시간에 버퍼링 | Admin Settings에 현재 시각 + Quiet Hours 상태 미리보기 표시 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 5~6개 (컨벤션+Integration Contract 1 / Priority 시스템 1 / Quiet Hours 1 / 일일 요약 1 / Read Receipt 1~2) |
| 수정/신규 파일 | 15~20개 |
| 신규 테스트 | 40~60개 |
| DB 마이그레이션 | 1건 (notification_logs.read_at) |

---

*생성일: 2026-04-01*
*선행: m33-14 (알림 메시지 품질 개선)*
