# 124. 매직워드 프롬프트 생성 시 기존 세션 재활용

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** -
- **상태:** OPEN

## 현황

`POST /admin/agent-prompt`가 호출될 때마다 **무조건 새 세션을 생성**한다. 단일 데몬 환경에서 여러 세션이 필요한 경우는 드물고, Admin Dashboard에서 매직워드를 반복 생성하면 불필요한 세션이 누적된다.

## 개선 방안

### 기존 세션 재활용 로직

1. 모든 활성 지갑(또는 요청된 `walletIds`)을 커버하는 **유효한 기존 세션** 탐색
   - `sessions` JOIN `session_wallets`
   - 조건: 미만료(`expires_at > now`), 미취소(`revoked_at IS NULL`)
   - 대상 지갑 전체를 `session_wallets`로 커버하는 세션
2. 기존 세션이 있으면 해당 세션 ID로 **JWT를 재서명**하여 프롬프트에 포함
   - `session-auth` 미들웨어는 JWT 서명과 세션 존재만 검증하므로, 동일 세션 ID로 새 JWT를 발급해도 유효
   - 기존 토큰도 여전히 유효 (토큰 해시 검증 없음)
3. 기존 세션이 없으면 현재처럼 새 세션 생성

### 응답에 세션 재활용 여부 표시

```json
{
  "prompt": "...",
  "walletCount": 2,
  "sessionsCreated": 0,
  "sessionReused": true,
  "expiresAt": 1771729732
}
```

`sessionsCreated: 0` + `sessionReused: true`로 기존 세션을 재활용했음을 알림.

### 잔여 만료 시간이 짧은 경우

기존 세션의 남은 TTL이 너무 짧으면 (예: 1시간 미만) 새 세션 생성. 임계값은 `session_ttl`의 10% 또는 최소 1시간.

## 수정 대상

| 파일 | 변경 |
|------|------|
| `packages/daemon/src/api/routes/admin.ts` | agent-prompt 핸들러에 기존 세션 탐색 로직 추가 |

## 테스트 항목

### 통합 테스트 (`packages/daemon/src/__tests__/agent-prompt-session-reuse.test.ts`)

- 유효한 멀티 지갑 세션 존재 시 `POST /admin/agent-prompt` 호출하면 `sessionsCreated: 0`, `sessionReused: true` 반환 검증
- 반환된 토큰으로 `GET /v1/wallet/balance` 호출 시 200 응답 검증
- DB `sessions` 테이블에 새 행이 추가되지 않았는지 검증 (세션 수 변화 없음)
- 기존 세션이 없을 때 `sessionsCreated: 1`, `sessionReused: false` 반환 검증
- 기존 세션 만료 임박(잔여 TTL < 임계값) 시 새 세션 생성 검증
- 기존 세션이 취소(revoked)된 경우 새 세션 생성 검증
- 기존 세션이 일부 지갑만 커버할 때 새 세션 생성 검증 (지갑 추가 후 프롬프트 재생성)
