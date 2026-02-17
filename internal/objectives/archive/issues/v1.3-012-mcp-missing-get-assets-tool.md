# BUG-012: MCP에 get_assets 도구 미구현 — SPL/ERC-20 토큰 잔액 조회 불가

## 심각도

**MEDIUM** — SPL 토큰 전송(`send_token` TYPE=TOKEN_TRANSFER)은 가능하나 토큰 잔액 조회 도구가 없어 Claude Desktop에서 에이전트 보유 토큰 목록 및 잔액 확인 불가.

## 증상

Claude Desktop에서 "SPL 토큰 잔액 확인해줘"라고 요청 시:
- "SPL 토큰 잔액은 기본 제공 도구로는 직접 조회가 어렵지만..." 응답
- `get_balance`는 네이티브 토큰(SOL/ETH)만 반환
- 토큰 자산 조회 수단 없음

## 원인

### 데몬 API에는 존재하지만 MCP 도구로 노출되지 않음

**데몬**: `GET /v1/wallet/assets` (`packages/daemon/src/api/routes/wallet.ts` 86-211행)
- `adapter.getAssets(publicKey)` 호출
- 네이티브 + SPL/ERC-20 토큰 전체 목록 반환
- 응답: `{ agentId, chain, network, assets: [{ mint, symbol, name, balance, decimals, isNative, usdValue }] }`

**MCP**: `get_assets` 도구 미등록 (`packages/mcp/src/tools/`에 해당 파일 없음)

### 현재 MCP 도구 목록 (6개)

| 도구 | 엔드포인트 | 설명 |
|------|-----------|------|
| `get_balance` | `GET /v1/wallet/balance` | 네이티브 잔액만 (SOL/ETH) |
| `get_address` | `GET /v1/wallet/address` | 지갑 주소 |
| `send_token` | `POST /v1/transactions/send` | 전송 (5-type, TOKEN_TRANSFER 포함) |
| `list_transactions` | `GET /v1/transactions` | 거래 내역 |
| `get_transaction` | `GET /v1/transactions/:id` | 거래 상세 |
| `get_nonce` | `GET /v1/nonce` | 소유자 서명 nonce |

### 비대칭: 전송은 가능하나 조회 불가

v1.4(Phase 86)에서 `send_token`에 `type=TOKEN_TRANSFER` + `token` 파라미터를 추가하여 SPL/ERC-20 토큰 전송 기능을 확장했으나, 대응되는 토큰 잔액 조회 도구는 추가하지 않음.

## 수정안

### `packages/mcp/src/tools/get-assets.ts` 신규 생성

기존 `get-balance.ts` 패턴을 따라 구현:

```typescript
/**
 * get_assets tool: Get all assets (native + tokens) held by the agent wallet.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type AgentContext, withAgentPrefix } from '../server.js';

export function registerGetAssets(server: McpServer, apiClient: ApiClient, agentContext?: AgentContext): void {
  server.tool(
    'get_assets',
    withAgentPrefix('Get all assets (native + tokens) held by the agent wallet.', agentContext?.agentName),
    async () => {
      const result = await apiClient.get('/v1/wallet/assets');
      return toToolResult(result);
    },
  );
}
```

### `packages/mcp/src/server.ts` 등록 추가

```typescript
import { registerGetAssets } from './tools/get-assets.js';
// ...
registerGetAssets(server, apiClient, agentContext);
```

### MCP 리소스에도 추가 (선택)

기존 `waiaas://wallet/balance` 리소스와 함께 `waiaas://wallet/assets` 리소스 추가 가능.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 파일 | `packages/mcp/src/tools/get-assets.ts` (신규), `packages/mcp/src/server.ts` |
| 기능 영향 | Claude Desktop에서 SPL/ERC-20 토큰 잔액 조회 불가 |
| API 영향 | **없음** — 데몬 `GET /v1/wallet/assets`는 정상 동작 |
| SDK 영향 | TS/Python SDK에서는 직접 API 호출로 조회 가능 |
| 우회 방법 | `curl http://127.0.0.1:3100/v1/wallet/assets -H "Authorization: Bearer <token>"` |

## 기존 테스트가 감지하지 못한 이유

- MCP 도구 등록 테스트(`packages/mcp/src/__tests__/tools.test.ts`)는 기존 6개 도구의 동작만 검증
- "데몬 API 엔드포인트 ↔ MCP 도구" 대응 관계를 검증하는 테스트 없음
- v1.4에서 `send_token`에 TOKEN_TRANSFER를 추가할 때 조회 측 도구 추가를 누락

## 재발 방지 테스트

### 데몬 월렛 엔드포인트 ↔ MCP 도구 대응 검증 (권장)

```typescript
it('월렛 관련 데몬 엔드포인트가 모두 MCP 도구로 노출된다', () => {
  const walletEndpoints = ['/v1/wallet/address', '/v1/wallet/balance', '/v1/wallet/assets'];
  const mcpTools = ['get_address', 'get_balance', 'get_assets'];

  // MCP 서버에 등록된 도구 이름 추출
  const registeredTools = getRegisteredToolNames(server);

  for (const tool of mcpTools) {
    expect(registeredTools).toContain(tool);
  }
});
```

---

*발견일: 2026-02-12*
*마일스톤: v1.3 (MCP 도구 구현), v1.4에서 TOKEN_TRANSFER 추가 시 누락*
*상태: FIXED*
*관련: 없음*
