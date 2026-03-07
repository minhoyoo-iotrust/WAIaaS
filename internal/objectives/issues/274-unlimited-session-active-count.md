# #274 무제한 세션(expires_at=0)이 활성 세션 카운트에서 누락

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **발견일:** 2026-03-07

## 증상

Admin UI 대시보드의 "Active Sessions" 카드가 0을 표시한다. 실제로는 다수의 세션이 존재하며 모두 무제한(expires_at=0) 세션이다.

## 원인

v29.9에서 무제한 세션(기본값)이 도입되면서 `expires_at = 0`으로 저장된다. 그러나 활성 세션을 카운트하는 SQL 쿼리 3곳이 `expires_at > nowSec` 조건만 사용하여, `0 > nowSec`이 항상 FALSE로 평가되어 무제한 세션이 모두 제외된다.

## 영향 범위

### 버그가 있는 3곳 (expires_at=0 미처리)

| # | 파일 | 라인 | 쿼리 | 용도 |
|---|------|------|------|------|
| 1 | `packages/daemon/src/api/routes/admin.ts` | 982 | `expiresAt > ${nowSec}` | Admin UI 대시보드 "Active Sessions" 카드 |
| 2 | `packages/daemon/src/services/admin-stats-service.ts` | 84 | `expires_at > ?` | GET /admin/stats 세션 통계 |
| 3 | `packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts` | 410 | `expires_at > unixepoch()` | Telegram Bot /status 명령어 |

### 이미 올바르게 처리된 곳 (참고)

| 파일 | 라인 | 패턴 | 비고 |
|------|------|------|------|
| `api/routes/sessions.ts` | 272, 689 | `(expiresAt = 0 OR expiresAt > nowSec)` | 세션 목록 조회 |
| `api/routes/sessions.ts` | 427 | `expiresAtSec === 0 ? 'ACTIVE' : ...` | 세션 상태 판정 |
| `lifecycle/daemon.ts` | 1479, 1491 | `expires_at > 0 AND expires_at < unixepoch()` | 세션 클린업 워커 |

## 수정 방법

3곳 모두 동일한 패턴으로 수정:

```sql
-- Before
WHERE revoked_at IS NULL AND expires_at > ?

-- After
WHERE revoked_at IS NULL AND (expires_at = 0 OR expires_at > ?)
```

## 재발 방지

이 버그는 #226(세션 클린업 워커), #258(세션 Reissue)에 이어 3번째로 동일한 패턴이 반복되었다. `expires_at = 0` 무제한 세션 처리를 누락하기 쉬운 구조적 문제이다.

**안정화 제안:**
1. **헬퍼 함수 통일**: #258에서 도입한 `isSessionActive()` / `isSessionExpired()` 헬퍼를 전체 코드베이스에 적용하여, raw SQL에서 직접 `expires_at` 비교를 하지 않도록 한다.
2. **Drizzle 쿼리 헬퍼**: Drizzle ORM용 `activeSessionFilter()` SQL 조건 빌더를 만들어 재사용한다.
3. **grep 기반 lint 규칙**: `expires_at >` 또는 `expiresAt >` 패턴이 `= 0 OR` 없이 사용되면 경고하는 커스텀 린트를 추가한다.

## 관련 이슈

- #226: 세션 클린업 워커가 무제한 세션(expires_at=0)을 만료로 삭제 (v29.10 FIXED)
- #258: Admin 세션 Reissue가 무제한 세션을 만료로 판정 (v31.3 FIXED)

## 테스트 항목

1. **단위 테스트**: expires_at=0인 세션이 admin status의 activeSessionCount에 포함되는지 검증
2. **단위 테스트**: expires_at=0인 세션이 admin-stats-service의 sessions.active에 포함되는지 검증
3. **단위 테스트**: expires_at=0인 세션이 Telegram Bot /status의 activeCount에 포함되는지 검증
4. **통합 테스트**: 무제한 세션 + 유한 세션 + 만료 세션 + 취소 세션 혼합 시 카운트 정확성 검증
5. **회귀 테스트**: 헬퍼 함수 도입 후 기존 세션 관련 쿼리 전체가 동일하게 동작하는지 검증
