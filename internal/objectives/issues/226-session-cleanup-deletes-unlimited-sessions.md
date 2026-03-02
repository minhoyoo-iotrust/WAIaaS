# #226 세션 클린업 워커가 무제한 세션을 만료로 삭제

- **유형:** BUG
- **심각도:** CRITICAL
- **마일스톤:** v29.10
- **상태:** FIXED
- **발견일:** 2026-03-02

## 증상

- 무제한 세션(TTL 미지정) 토큰 생성 후 `SESSION_NOT_FOUND` 에러 발생
- Admin UI 세션 리스트에서 무제한 세션이 표시되지 않음 (생성 직후 1분 이내 삭제)
- 하루짜리(TTL=86400) 세션은 정상 동작

## 원인

`daemon.ts:1389-1414` 세션 클린업 워커(1분 주기)의 SQL 쿼리가 무제한 세션을 만료된 것으로 오인하여 삭제:

```sql
DELETE FROM sessions WHERE expires_at < unixepoch() AND revoked_at IS NULL
```

무제한 세션은 `expires_at = 0`으로 저장된다. `0 < unixepoch()` (현재 Unix timestamp ~1,740,000,000)는 **항상 true**이므로, 클린업 워커가 무제한 세션을 1분 이내에 삭제한다.

동일한 문제가 알림 발송 쿼리에도 존재:

```sql
SELECT id, wallet_id FROM sessions WHERE expires_at < unixepoch() AND revoked_at IS NULL
```

## 영향 범위

- `packages/daemon/src/lifecycle/daemon.ts` 라인 1397-1410
  - 만료 세션 알림 SELECT 쿼리 (라인 1397-1398)
  - 만료 세션 DELETE 쿼리 (라인 1409-1410)

## 수정 방안

클린업 쿼리에 `expires_at > 0` 조건 추가 (무제한 세션 제외):

```sql
-- 알림 발송
SELECT id, wallet_id FROM sessions
WHERE expires_at > 0 AND expires_at < unixepoch() AND revoked_at IS NULL

-- 삭제
DELETE FROM sessions
WHERE expires_at > 0 AND expires_at < unixepoch() AND revoked_at IS NULL
```

`expires_at = 0`은 무제한 세션의 센티널 값이므로 클린업 대상에서 제외해야 한다.

## 재현 방법

1. 데몬 시작
2. `POST /v1/sessions` — TTL 미지정 (무제한 세션 생성)
3. 응답에서 토큰 수령 (201 성공)
4. 1분 대기 (클린업 워커 실행)
5. 수령한 토큰으로 API 호출 → `SESSION_NOT_FOUND`
6. `GET /v1/sessions` → 해당 세션 미표시

## 테스트 항목

1. **단위 테스트**: 무제한 세션(expires_at=0) 생성 후 클린업 워커 실행 시 세션이 삭제되지 않는지 확인
2. **단위 테스트**: TTL 세션(expires_at>0)이 만료 후 클린업 워커에 의해 정상 삭제되는지 확인
3. **통합 테스트**: 무제한 세션 생성 → 1분 경과 시뮬레이션 → 세션 토큰으로 API 호출 성공 확인
