# 478 — MCP 서버 버전 0.0.0 하드코딩

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** —
- **상태:** FIXED

## 증상

MCP `serverInfo.version`이 `"0.0.0"`으로 표시됨. 실제 패키지 버전(`2.13.0-rc.6`)과 불일치하여 클라이언트 측 디버깅/호환성 확인이 어려움.

## 원인

서버 생성, API 클라이언트, 세션 매니저에서 버전이 하드코딩됨:

| 파일 | 위치 | 하드코딩 값 |
|---|---|---|
| `packages/mcp/src/server.ts` | L84 | `version: '0.0.0'` |
| `packages/mcp/src/api-client.ts` | L16 | `'@waiaas/mcp/0.0.0'` |
| `packages/mcp/src/session-manager.ts` | L320 | `'@waiaas/mcp/0.0.0'` |

## 수정 방향

`packages/mcp/package.json`에서 버전을 읽어 동적으로 주입. `createRequire`를 통해 package.json을 import하거나, 빌드 시 버전을 주입.

## 테스트 항목

- [ ] `serverInfo.version`이 package.json 버전과 일치하는지 확인
- [ ] User-Agent 헤더에 실제 버전이 포함되는지 확인
