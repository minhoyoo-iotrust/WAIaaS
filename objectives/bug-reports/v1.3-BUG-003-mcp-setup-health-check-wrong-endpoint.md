# BUG-003: mcp setup 헬스체크가 인증 필요 엔드포인트 호출 (/v1/admin/status)

## 심각도

**LOW** — 경고 메시지만 출력되며 이후 동작에 영향 없음 (continue anyway)

## 증상

`waiaas mcp setup` 실행 시 Step 1에서 데몬 정상 동작 여부를 확인하기 위해 `GET /v1/admin/status`를 호출하지만, 이 엔드포인트는 masterAuth가 필요하여 401 반환. 결과적으로 데몬이 정상 실행 중임에도 경고 메시지가 출력됨:

```
Warning: daemon returned 401 on health check
```

## 재현 방법

```bash
waiaas mcp setup --password test1234 --agent <agent-id>
# → "Warning: daemon returned 401 on health check" 출력
# → 이후 세션 생성은 정상 동작
```

## 원인

`packages/cli/src/commands/mcp-setup.ts` 32행:

```typescript
// Step 1: Check daemon is running
const healthRes = await fetch(`${baseUrl}/v1/admin/status`, {
  signal: AbortSignal.timeout(5000),
});
```

`/v1/admin/status`는 `server.ts` 159행에서 masterAuth 미들웨어가 적용된 엔드포인트:

```typescript
app.use('/v1/admin/status', masterAuthForAdmin);
```

반면 `/health`는 인증 없이 접근 가능한 공개 엔드포인트.

## 수정안

`packages/cli/src/commands/mcp-setup.ts` 32행 수정:

```typescript
// Before (인증 필요 엔드포인트)
const healthRes = await fetch(`${baseUrl}/v1/admin/status`, {

// After (공개 엔드포인트)
const healthRes = await fetch(`${baseUrl}/health`, {
```

## 영향 범위

| 항목 | 내용 |
|------|------|
| 파일 | `packages/cli/src/commands/mcp-setup.ts` (32행) |
| 기능 영향 | 없음 — 경고 출력 후 정상 진행 |
| 사용자 경험 | 불필요한 경고 메시지로 혼란 유발 |

---

*발견일: 2026-02-11*
*마일스톤: v1.3*
*상태: FIXED*
*수정일: 2026-02-11*
