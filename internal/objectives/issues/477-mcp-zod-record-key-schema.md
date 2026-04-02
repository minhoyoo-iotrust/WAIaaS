# 477 — MCP tools/list Zod z.record() 키 스키마 누락으로 빈 배열 반환

- **유형:** BUG
- **심각도:** CRITICAL
- **마일스톤:** —
- **상태:** FIXED

## 증상

`tools/list` 호출 시 빈 배열 반환. 54개 action provider tools가 `server.tool()`로 등록되고 `list_changed` 알림도 발송되지만, 클라이언트에서 도구를 사용할 수 없음.

## 원인

Zod 4의 `toJSONSchema`가 `z.record(valueSchema)` (키 스키마 인자 누락) 형태를 처리하지 못함. MCP SDK가 전체 도구의 inputSchema를 JSON Schema로 변환할 때 `.map()`이 하나라도 실패하면 **전체 도구 목록이 빈 배열**로 반환됨.

이슈 #469에서 대부분 수정되었으나, 다음 3개 파일이 누락됨:

| 파일 | 라인 | 문제 코드 |
|---|---|---|
| `packages/mcp/src/tools/x402-fetch.ts` | 29 | `z.record(z.string())` |
| `packages/mcp/src/tools/erc8128-sign-request.ts` | 28 | `z.record(z.string())` |
| `packages/mcp/src/tools/erc8128-verify-signature.ts` | 27 | `z.record(z.string())` |

## 수정 방향

`z.record(z.string())` → `z.record(z.string(), z.string())`으로 키 스키마를 명시.

## 테스트 항목

- [ ] `tools/list` 호출 시 42개 built-in + 54개 action provider tools 반환 확인
- [ ] `tools/call`로 action provider 도구 실행 가능 확인
- [ ] 각 수정 파일의 inputSchema가 JSON Schema로 정상 변환되는지 단위 테스트
