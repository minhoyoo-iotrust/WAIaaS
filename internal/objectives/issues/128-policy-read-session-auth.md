# #128 — 에이전트 읽기 전용 API 접근 확대 + 스킬 파일 권한 구분 명확화

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **마일스톤:** v27.0
- **상태:** OPEN

## 현상

에이전트(세션 토큰 사용)가 자기 지갑에 적용된 정책이나 등록된 토큰 목록을 조회할 수 없다.

```json
// GET /v1/policies?walletId=... (sessionAuth)
{
  "code": "INVALID_MASTER_PASSWORD",
  "message": "X-Master-Password header is required"
}
```

또한 스킬 파일들이 에이전트/관리자 권한 구분을 명시적으로 하지 않아, AI 에이전트가 자기 역할 범위를 정확히 파악하기 어렵다.

## 원인

`server.ts`에서 정책(`/v1/policies`)과 토큰 레지스트리(`/v1/tokens`) 라우트에 모든 HTTP 메서드에 masterAuth가 일괄 적용되어 있다.

## 수정 범위

### Part A: 읽기 전용 API 접근 확대

#### A-1. `GET /v1/policies` — sessionAuth 허용

- **server.ts**: GET은 sessionAuth/masterAuth 모두 허용, POST/PUT/DELETE는 masterAuth 유지
- **policies.ts GET 핸들러**: 인증 방식별 분기
  - masterAuth: 전체 정책 조회 (기존 동작 유지)
  - sessionAuth: 세션 토큰의 walletId에 해당하는 정책만 반환

기존 패턴 참조 (server.ts:219-225 kill-switch):
```typescript
app.use('/v1/policies', async (c, next) => {
  if (c.req.method === 'GET') {
    await next(); // sessionAuth 또는 masterAuth 모두 처리
    return;
  }
  return masterAuth(c, next);
});
```

#### A-2. `GET /v1/tokens` — sessionAuth 허용

- **server.ts**: GET은 sessionAuth 허용, POST/DELETE는 masterAuth 유지
- 에이전트가 "어떤 토큰을 보낼 수 있는지" 파악하는 데 필요
- walletId 필터링 없이 전체 목록 반환 (토큰 레지스트리는 글로벌 리소스)

### Part B: 스킬 파일 권한 구분 명확화

현재 스킬 파일은 인증 방식(sessionAuth/masterAuth)을 기술하지만, **에이전트 관점에서 "내가 할 수 있는 것"과 "관리자만 할 수 있는 것"을 명시적으로 구분하지 않는다.**

#### 현황 및 문제

| 파일 | 현재 구분 | 문제 |
|------|-----------|------|
| `policies.skill.md` | sessionAuth로 잘못 기술 | 실제는 masterAuth — **완전히 잘못됨** |
| `wallet.skill.md` | 인증별 구분 있음 | 에이전트/관리자 관점 구분은 약함 |
| `transactions.skill.md` | sessionAuth 통일 | agent vs owner 구분 불명확 |
| `admin.skill.md` | masterAuth 통일 | 관리자 전용 명시됨 (양호) |
| `actions.skill.md` | sessionAuth 통일 | API 키 설정(관리자) 전제 조건 불명확 |
| `x402.skill.md` | sessionAuth 통일 | 정책 설정(관리자) 전제 조건 불명확 |

#### 수정 방향

각 스킬 파일 상단에 **권한 요약 섹션** 추가:

```markdown
## Permissions

### Agent (sessionAuth)
- Query policies applied to own wallet
- View registered tokens
- ...

### Admin (masterAuth)
- Create/update/delete policies
- Register/remove tokens
- ...
```

대상 파일:
- `policies.skill.md` — 인증 방식 수정 + 에이전트 조회/관리자 CRUD 구분
- `wallet.skill.md` — 에이전트 조회/관리자 CRUD 구분 강화
- `transactions.skill.md` — 에이전트 실행/Owner 승인 구분 명시
- `actions.skill.md` — 에이전트 실행 + 관리자 전제 조건 명시
- `x402.skill.md` — 에이전트 실행 + 관리자 전제 조건 명시

### Part C: MCP 도구 추가

MCP에 정책 조회 도구가 없으므로 추가:
- `get_policies` — 자기 지갑에 적용된 정책 목록 조회
- `get_tokens` — 등록된 토큰 목록 조회 (선택)

## 영향 범위

- `packages/daemon/src/api/server.ts` — 인증 미들웨어 분기
- `packages/daemon/src/api/routes/policies.ts` — GET 핸들러 인증 분기
- `packages/daemon/src/api/routes/token-registry.ts` — GET 핸들러 (확인 필요)
- `packages/mcp/src/tools/` — get_policies, get_tokens 도구 추가
- `skills/*.skill.md` — 전체 6개 파일 권한 구분 섹션 추가

## 테스트 항목

### API 인증
- sessionAuth로 `GET /v1/policies?walletId={자기지갑}` 조회 시 정책 목록 반환 확인
- sessionAuth로 다른 지갑의 정책 조회 시 빈 목록 또는 403 반환 확인
- masterAuth로 `GET /v1/policies` 전체 조회 기존 동작 유지 확인
- sessionAuth로 `POST/PUT/DELETE /v1/policies` 시도 시 401 반환 확인
- sessionAuth로 `GET /v1/tokens` 조회 시 토큰 목록 반환 확인
- sessionAuth로 `POST/DELETE /v1/tokens` 시도 시 401 반환 확인

### MCP 도구
- MCP get_policies 도구로 자기 지갑 정책 조회 확인
- MCP get_tokens 도구로 등록된 토큰 목록 조회 확인

### 스킬 파일
- 각 스킬 파일에 Permissions 섹션이 존재하고 에이전트/관리자 구분이 명확한지 확인
- policies.skill.md의 인증 방식이 실제 구현과 일치하는지 확인
