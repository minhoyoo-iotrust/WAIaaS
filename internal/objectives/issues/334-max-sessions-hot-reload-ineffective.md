# #334 — Admin Settings max_sessions_per_wallet 변경이 런타임에 반영되지 않음

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **발견일:** 2026-03-11

## 현상

Admin Settings에서 `security.max_sessions_per_wallet`을 5에서 10으로 변경해도 세션 생성 시 여전히 5개 제한이 적용됨. PUT /v1/admin/settings 응답에는 10으로 저장되었으나, 실제 세션 생성 시 이전 값(5)이 사용됨.

## 원인 분석

세션 생성 로직이 `deps.config.security.max_sessions_per_wallet`(데몬 시작 시 config.toml에서 로드된 정적 객체)에서 값을 읽고 있음. `SettingsService.get()`을 사용하지 않아 런타임 변경이 반영되지 않음.

### hot-reload 코드의 주석과 실제 동작 불일치

`hot-reload.ts:158-161`에서:
```typescript
if (hasSecurityChanges) {
  // Security reload is synchronous (just read new values on next request)
  // No action needed -- SettingsService.get() already reads from DB first
  console.log('Hot-reload: Security parameters updated (effective on next request)');
}
```

이 주석은 "다음 요청에서 SettingsService.get()으로 읽힌다"고 가정하지만, 실제 세션 코드는 `deps.config`(정적 객체)에서 읽음.

### 영향 범위 (3곳)

| 파일 | 라인 | 용도 |
|------|------|------|
| `packages/daemon/src/api/routes/sessions.ts` | 260 | POST /v1/sessions (세션 생성) |
| `packages/daemon/src/api/routes/sessions.ts` | 678 | POST /v1/sessions/:id/wallets (세션에 지갑 추가) |
| `packages/daemon/src/api/routes/mcp.ts` | 126 | POST /v1/mcp/tokens (MCP 토큰 생성) |

## 수정 방안

1. `SessionRouteDeps`와 `McpTokenRouteDeps`에 `settingsService` 추가
2. `deps.config.security.max_sessions_per_wallet` → `parseInt(deps.settingsService.get('security.max_sessions_per_wallet'), 10) || deps.config.security.max_sessions_per_wallet` 로 변경 (SettingsService 우선, config.toml 폴백)
3. `server.ts`에서 sessionRoutes/mcpTokenRoutes에 `settingsService` 주입

## 테스트 항목

1. **단위 테스트**: Admin Settings에서 max_sessions_per_wallet 변경 후 세션 생성 시 새 값 적용 확인
2. **단위 테스트**: SettingsService 미설정 시 config.toml 기본값 폴백 확인
3. **통합 테스트**: MCP 토큰 생성 시에도 변경된 max_sessions 반영 확인
4. **회귀 테스트**: 기존 세션 생성/지갑 추가 테스트 통과 확인
