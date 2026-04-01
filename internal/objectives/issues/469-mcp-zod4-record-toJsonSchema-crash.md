# 469 — MCP tools/list Zod 4 z.record() toJSONSchema 크래시

- **유형:** BUG
- **심각도:** CRITICAL
- **패키지:** @waiaas/mcp
- **보고:** 크로디파이 외부 리포트 (2026-04-01)
- **상태:** FIXED

## 증상

`@waiaas/mcp@latest` stdio 모드에서 `tools/list` 호출 시 action provider 도구 54개가 JSON Schema 변환 과정에서 에러 발생:

```
MCP error -32603: Cannot read properties of undefined (reading '_zod')
```

- 조회 도구(connect_info, get_assets, get_balance, get_address 등)는 정상 반환
- action provider 도구 54개는 목록에 포함되지 않음
- `tools/list` 실패 → MCP 클라이언트가 실행 도구를 발견할 수 없어 `tools/call`도 불가

## 근본 원인

### 1. `@waiaas/mcp`에 `zod` 미선언 + MCP SDK 의존성 충돌

`@waiaas/mcp`의 `package.json`에 `zod`가 dependency로 선언되어 있지 않다. `@modelcontextprotocol/sdk@^1.12.0`이 `zod: "^3.25 || ^4.0"`을 **dependency**(peer가 아님)로 갖고 있어, npm/yarn/pnpm이 이를 호이스팅하면 소비자 환경에서 `import { z } from 'zod'`가 zod@4.x로 해석될 수 있다.

### 2. Zod 4의 `z.record(valueSchema)` 단일 인자 형태 toJSONSchema 버그

Zod 4의 `toJSONSchema` 내부 `recordProcessor`가 단일 인자 `z.record(valueSchema)` 형태를 처리할 때 key schema가 내부적으로 `undefined`인 상태에서 `._zod` 프로퍼티에 접근하여 크래시한다:

```
TypeError: Cannot read properties of undefined (reading '_zod')
    at process (zod/v4/core/to-json-schema.cjs:40:24)
    at Object.recordProcessor (zod/v4/core/json-schema-processors.cjs:464:69)
```

**재현 증명:**

```javascript
const z = require('zod');       // zod@4.3.6
const z4mini = require('zod/v4-mini');

// CRASH: 단일 인자 z.record
z4mini.toJSONSchema(z4mini.object({ f: z.record(z.unknown()) }));
// → TypeError: Cannot read properties of undefined (reading '_zod')

// OK: 두 인자 z.record
z4mini.toJSONSchema(z4mini.object({ f: z.record(z.string(), z.unknown()) }));
// → 정상 변환
```

### 3. 영향 경로

MCP SDK `ListToolsRequestSchema` 핸들러 → `.map()` 내부에서 각 도구의 `inputSchema`를 `toJsonSchemaCompat()`로 변환 → Zod 4 경로(`z4mini.toJSONSchema`) 진입 → `z.record()` 단일 인자 형태에서 크래시 → `.map()` 전체 실패 → 전체 도구 목록 미반환.

한 도구라도 크래시하면 `.map()` 전체가 실패하므로 **정상 도구도 반환되지 않는다.**

## 영향 범위

`packages/mcp/src/tools/` 내 단일 인자 `z.record()` 사용 위치 10곳:

| 파일 | 라인 | 패턴 | 용도 |
|------|------|------|------|
| `action-provider.ts` | 218 | `z.record(z.unknown())` | fallback params bag |
| `simulate-transaction.ts` | 33 | `z.array(z.record(z.unknown()))` | abi 필드 |
| `simulate-transaction.ts` | 45 | `z.array(z.record(z.unknown()))` | instructions 필드 |
| `call-contract.ts` | 21 | `z.array(z.record(z.unknown()))` | abi 필드 |
| `encode-calldata.ts` | 26 | `z.array(z.record(z.unknown()))` | abi 필드 |
| `send-batch.ts` | 19 | `z.array(z.record(z.unknown()))` | instructions 필드 |
| `sign-message.ts` | 39 | `z.record(z.unknown())` | EIP-712 typed data |
| `x402-fetch.ts` | 29 | `z.record(z.string())` | HTTP headers |
| `erc8128-sign-request.ts` | 28 | `z.record(z.string())` | HTTP headers |
| `erc8128-verify-signature.ts` | 27 | `z.record(z.string())` | HTTP headers |

**참고:** `z.array(z.record(...))` 형태도 내부 `z.record` 변환 시 동일하게 크래시한다.

## 수정 방안

### A. 단일 인자 `z.record()` → 두 인자 형태로 변환 (필수)

모든 `z.record(valueSchema)` → `z.record(z.string(), valueSchema)`:

```typescript
// Before (crashes with Zod 4)
z.record(z.unknown())
z.record(z.string())

// After (works with both Zod 3 and Zod 4)
z.record(z.string(), z.unknown())
z.record(z.string(), z.string())
```

Zod 3에서도 두 인자 형태는 동일하게 동작하므로 하위 호환성 문제 없음.

### B. `zod`를 `@waiaas/mcp` 의존성에 추가 (권장)

`packages/mcp/package.json`에 `zod`를 `peerDependencies`로 추가하여 소비자가 명시적으로 설치하도록 유도:

```json
{
  "peerDependencies": {
    "zod": "^3.25.0 || ^4.0.0"
  }
}
```

## 테스트 항목

1. **z.record 두 인자 변환 단위 테스트**: 변경된 10개 위치가 Zod 3/4 모두에서 정상 JSON Schema 변환되는지 확인
2. **tools/list 통합 테스트**: `listTools()` 호출 시 조회 도구 + action provider 도구 전체가 반환되는지 확인
3. **tools/call 통합 테스트**: `callTool('action_jupiter_swap', {...})` 등 실행 도구 호출 가능 여부
4. **Zod 4 환경 CI 테스트**: zod@4.x를 설치한 환경에서 MCP 서버 기동 → tools/list → tools/call 전체 경로 검증
