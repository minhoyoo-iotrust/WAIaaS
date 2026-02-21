# 125. Admin UI 세션 토큰 재발급 + 발급 이력 추적

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v26.5
- **상태:** FIXED

## 현황

세션 토큰은 생성 시 한 번만 표시되고 이후 조회할 수 없다 (`tokenHash`만 DB 저장). 토큰을 분실하면 새 세션을 생성해야 한다. `session-auth` 미들웨어가 `tokenHash`를 검증하지 않으므로, 동일 세션 ID로 JWT를 재서명하면 유효한 토큰을 다시 발급할 수 있다.

토큰 재발급이 가능해지면 하나의 세션에 여러 유효한 토큰이 공존할 수 있으므로, 발급 횟수 추적이 필요하다.

## 개선 방안

### 1. 세션 토큰 재발급 API

`POST /v1/admin/sessions/{id}/reissue` (masterAuth 필요)

- 기존 세션 ID로 JWT를 재서명하여 새 토큰 발급
- 세션의 만료 시간, 연결된 지갑 등 기존 속성 그대로 유지
- 응답에 새 토큰 포함

```json
{
  "token": "wai_sess_eyJ...",
  "sessionId": "019c7e2b-...",
  "tokenIssuedCount": 2,
  "expiresAt": 1771729732
}
```

### 2. 토큰 발급 횟수 추적

`sessions` 테이블에 `token_issued_count` 컬럼 추가 (DB 마이그레이션 필요).

- 세션 생성 시 `token_issued_count = 1`
- 재발급 시 `token_issued_count += 1`
- Admin UI 세션 목록에 발급 횟수 표시

### 3. Admin UI 세션 페이지에 재발급 버튼

세션 목록의 각 행에 "토큰 재발급" 버튼 추가. 클릭 시 새 토큰을 생성하고 복사 가능한 형태로 표시.

### 4. 보안 고려

- 재발급 시 이전 토큰도 만료 전까지 유효 (세션 기반 인증이므로)
- 모든 토큰을 무효화하려면 세션 자체를 취소(revoke)
- 재발급 이벤트를 감사 로그(audit_log)에 기록

## 수정 대상

| 파일 | 변경 |
|------|------|
| `packages/daemon/src/infrastructure/database/schema.ts` | `sessions` 테이블에 `token_issued_count` 컬럼 |
| `packages/daemon/src/infrastructure/database/migrate.ts` | 마이그레이션 v20: `token_issued_count` 컬럼 추가 |
| `packages/daemon/src/api/routes/admin.ts` | `POST /admin/sessions/{id}/reissue` 엔드포인트 |
| `packages/daemon/src/api/routes/sessions.ts` | 세션 생성 시 `token_issued_count = 1` 설정 |
| `packages/daemon/src/api/server.ts` | reissue 경로에 masterAuth 미들웨어 등록 |
| `packages/admin/src/pages/sessions.tsx` | 재발급 버튼 + 발급 횟수 컬럼 표시 |

## 테스트 항목

### 통합 테스트 (`packages/daemon/src/__tests__/session-reissue.test.ts`)

- `POST /admin/sessions/{id}/reissue` 정상 응답 (200 + 새 토큰) 검증
- 재발급된 토큰으로 `GET /v1/wallet/balance` 호출 성공 검증
- 재발급 후 이전 토큰으로도 API 호출 성공 검증 (병행 유효)
- 만료된 세션 재발급 시 적절한 에러 코드 반환 검증
- 취소(revoked)된 세션 재발급 시 에러 반환 검증
- `token_issued_count`가 재발급마다 1 증가하는지 DB 직접 검증

### 단위 테스트

- 마이그레이션 v20: 기존 세션의 `token_issued_count` 기본값 1 검증
- 세션 생성 시 `token_issued_count = 1` 초기화 검증

### Admin UI 테스트 (`packages/admin/src/__tests__/sessions.test.tsx`)

- 세션 목록에 발급 횟수 컬럼이 렌더링되는지 검증
- 재발급 버튼 클릭 시 API 호출 + 토큰 표시 검증
