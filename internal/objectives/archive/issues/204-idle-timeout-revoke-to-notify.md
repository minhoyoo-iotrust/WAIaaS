# #204 — AUTO-03 idle timeout이 세션을 revoke하여 에이전트 운영 방해

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v29.2
- **상태:** FIXED

## 현상

에이전트가 WAIaaS를 장기간 호출하지 않으면 (기본 1시간) AUTO-03 IdleTimeoutRule이
세션을 revoke하여 `SESSION_REVOKED` 에러가 발생한다.

에이전트는 다른 작업을 수행하면서 WAIaaS를 간헐적으로 호출하는 것이 일반적이므로,
1시간 idle timeout은 정상 사용 패턴에서도 세션이 끊기는 결과를 초래한다.

추가로 세션이 revoke되면 에이전트가 복구 과정에서 마스터 패스워드를 사용자에게
요청하는 문제도 발생한다 (보안 위반).

## 원인 분석

1. `AutoStopService` AUTO-03 규칙: `idleTimeoutSec` 기본값 3600초 (1시간)
2. `IdleTimeoutRule.checkIdle()`이 타임아웃 초과 세션을 반환
3. `AutoStopService.checkIdleSessions()`이 해당 세션을 revoke (`revoked_at` 설정)
4. `session-auth.ts:63-64`에서 `revokedAt !== null` → `SESSION_REVOKED` 에러
5. 에이전트가 자력 복구 불가 → 마스터 패스워드 요청 (보안 위반)

세션 보안은 이미 TTL(30일) + JWT expiry + Kill Switch로 3중 보호되므로,
idle timeout에 의한 자동 revoke는 과도한 보안 조치이다.

## 수정 방안

**idle 감지 시 revoke 대신 `SESSION_IDLE` 알림만 발송**

- `AutoStopService.checkIdleSessions()`에서 idle 세션 감지 시:
  - ~~기존: `revokeSession()` 호출 → `revoked_at` 설정~~
  - **변경: `SESSION_IDLE` 알림만 오퍼레이터에게 발송, 세션 유지**
- 오퍼레이터가 필요 시 Admin UI / CLI에서 수동 revoke 가능
- 보안 모니터링 목적은 유지하면서 에이전트 운영을 방해하지 않음

### `SESSION_IDLE` 알림

- 기존 30개 알림 이벤트에 `SESSION_IDLE` 추가
- Admin UI Notifications 페이지에서 수신 여부 설정 가능 (기존 이벤트 필터 체계 활용)
- 설정된 채널(Telegram, Slack, Ntfy, Wallet App)로 발송
- idle 알림 발송 후 해당 세션을 IdleTimeoutRule에서 제거하여 중복 알림 방지

### 수정 대상 파일

1. `packages/daemon/src/services/autostop-service.ts`
   - `checkIdleSessions()`: revoke → notify로 변경
   - idle 알림 발송 후 IdleTimeoutRule에서 세션 제거 (중복 알림 방지)
2. `packages/daemon/src/notifications/notification-events.ts`
   - `SESSION_IDLE` 이벤트 등록 (카테고리, 메시지 템플릿)
3. Admin UI 알림 설정
   - `SESSION_IDLE` 이벤트 필터 체크박스 자동 노출 (기존 체계)

## 테스트 항목

1. idle timeout 초과 시 세션이 revoke되지 않고 유지되는지 확인
2. idle timeout 초과 시 `SESSION_IDLE` 알림이 오퍼레이터에게 발송되는지 확인
3. 동일 세션에 대해 중복 `SESSION_IDLE` 알림이 발송되지 않는지 확인
4. `SESSION_IDLE` 알림이 Admin UI 알림 필터에서 설정 가능한지 확인
5. 수동 revoke / Kill Switch는 여전히 세션을 revoke하는지 확인
6. 기존 AUTO-01(CONSECUTIVE_FAILURES), AUTO-02(UNUSUAL_ACTIVITY) 동작 미영향 확인
