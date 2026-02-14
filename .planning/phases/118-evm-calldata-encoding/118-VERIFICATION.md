---
phase: 118-evm-calldata-encoding
verified: 2026-02-14T16:49:37Z
status: passed
score: 4/4 observable truths verified
re_verification: false
---

# Phase 118: EVM Calldata Encoding Verification Report

**Phase Goal:** AI 에이전트가 ABI + 함수명 + 인자를 보내면 인코딩된 calldata hex를 받을 수 있는 상태
**Verified:** 2026-02-14T16:49:37Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                        | Status     | Evidence                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------- |
| 1   | POST /v1/utils/encode-calldata에 ABI + 함수명 + 인자를 보내면 인코딩된 calldata hex가 반환된다                | ✓ VERIFIED | Route exists in utils.ts, uses viem encodeFunctionData, returns calldata/selector/functionName     |
| 2   | TS SDK encodeCalldata()와 Python SDK encode_calldata()로 동일 기능을 호출할 수 있다                          | ✓ VERIFIED | TS SDK client.ts line 176, Python SDK client.py line 246, both call POST /v1/utils/encode-calldata |
| 3   | MCP encode_calldata 도구로 동일 기능을 사용할 수 있다                                                        | ✓ VERIFIED | MCP tool registered in server.ts line 66, calls apiClient.post('/v1/utils/encode-calldata')        |
| 4   | 존재하지 않는 함수명이나 타입 불일치 시 ABI_ENCODING_FAILED 에러가 반환된다                                  | ✓ VERIFIED | Error code registered in error-codes.ts line 327, thrown in utils.ts catch block line 53-55        |

**Score:** 4/4 truths verified

### Required Artifacts

#### Plan 118-01 Artifacts

| Artifact                                             | Expected                                  | Status     | Details                                                                                               |
| ---------------------------------------------------- | ----------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `packages/daemon/src/api/routes/utils.ts`            | encode-calldata route handler             | ✓ VERIFIED | 61 lines, exports utilsRoutes(), uses viem encodeFunctionData                                         |
| `packages/core/src/errors/error-codes.ts`            | ABI_ENCODING_FAILED error code            | ✓ VERIFIED | Lines 327-333, domain TX, httpStatus 400, retryable false                                             |
| `packages/daemon/src/api/routes/openapi-schemas.ts`  | EncodeCalldataRequest/Response schemas    | ✓ VERIFIED | Line 712+, EncodeCalldataRequestSchema and EncodeCalldataResponseSchema with .openapi() metadata      |

#### Plan 118-02 Artifacts

| Artifact                                      | Expected                                       | Status     | Details                                                                                               |
| --------------------------------------------- | ---------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `packages/sdk/src/client.ts`                  | encodeCalldata() method                        | ✓ VERIFIED | Lines 176-183, async method, calls POST /v1/utils/encode-calldata with typed params/response         |
| `packages/sdk/src/types.ts`                   | EncodeCalldataParams/Response interfaces       | ✓ VERIFIED | Utils section with EncodeCalldataParams (abi, functionName, args) and EncodeCalldataResponse types    |
| `packages/mcp/src/tools/encode-calldata.ts`   | registerEncodeCalldata function                | ✓ VERIFIED | 40 lines, exports registerEncodeCalldata, tool schema with abi/functionName/args, calls REST API     |
| `packages/mcp/src/server.ts`                  | encode_calldata tool registration              | ✓ VERIFIED | Line 66, registerEncodeCalldata(server, apiClient, walletContext), 12th tool registered              |
| `python-sdk/waiaas/client.py`                 | encode_calldata() method                       | ✓ VERIFIED | Lines 246-267, async method, calls POST /v1/utils/encode-calldata with Pydantic models               |
| `python-sdk/waiaas/models.py`                 | EncodeCalldataRequest/Response models          | ✓ VERIFIED | Lines 156-170, Pydantic models with field aliases (function_name <-> functionName)                    |
| `skills/transactions.skill.md`                | encode-calldata documentation section          | ✓ VERIFIED | Section 10, lines 516+, documents request/response, SDK references, MCP tool name                     |

**All artifacts:** 10/10 verified (3 from Plan 01, 7 from Plan 02)

### Key Link Verification

#### Plan 118-01 Key Links

| From                                            | To                               | Via                                      | Status     | Details                                                                                 |
| ----------------------------------------------- | -------------------------------- | ---------------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| `packages/daemon/src/api/routes/utils.ts`       | viem.encodeFunctionData          | `import { encodeFunctionData } from 'viem'` | ✓ WIRED    | Line 9 import, line 45 usage in try-catch block                                        |
| `packages/daemon/src/api/server.ts`             | `packages/daemon/src/api/routes/utils.ts` | `app.route('/v1', utilsRoutes())`       | ✓ WIRED    | Line 59 import, line 202 registration                                                   |
| `packages/daemon/src/api/server.ts`             | sessionAuth middleware           | `app.use('/v1/utils/*', sessionAuth)`    | ✓ WIRED    | Line 164, sessionAuth applied to all /v1/utils/* routes                                 |

#### Plan 118-02 Key Links

| From                                        | To                           | Via                                           | Status     | Details                                                                    |
| ------------------------------------------- | ---------------------------- | --------------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| `packages/sdk/src/client.ts`                | `/v1/utils/encode-calldata`  | `this.http.post`                              | ✓ WIRED    | Line 179, POST request with params and authHeaders                        |
| `packages/mcp/src/tools/encode-calldata.ts` | `/v1/utils/encode-calldata`  | `apiClient.post`                              | ✓ WIRED    | Line 31, POST request with abi/functionName/args payload                  |
| `python-sdk/waiaas/client.py`               | `/v1/utils/encode-calldata`  | `self._request`                               | ✓ WIRED    | Line 266, POST request with Pydantic model serialization                  |
| `packages/mcp/src/server.ts`                | `packages/mcp/src/tools/encode-calldata.ts` | `import { registerEncodeCalldata }`   | ✓ WIRED    | Line 26 import, line 66 registration                                       |

**All key links:** 7/7 verified and wired

### Requirements Coverage

| Requirement | Description                                                                               | Status       | Supporting Truths |
| ----------- | ----------------------------------------------------------------------------------------- | ------------ | ----------------- |
| ENCODE-01   | POST /v1/utils/encode-calldata에 ABI + 함수명 + 인자를 보내면 인코딩된 calldata hex 반환   | ✓ SATISFIED  | Truth 1           |
| ENCODE-02   | TS SDK에 encodeCalldata() 메서드 추가                                                     | ✓ SATISFIED  | Truth 2           |
| ENCODE-03   | Python SDK에 encode_calldata() 메서드 추가                                                | ✓ SATISFIED  | Truth 2           |
| ENCODE-04   | MCP에 encode_calldata 도구 추가                                                           | ✓ SATISFIED  | Truth 3           |
| ENCODE-05   | 존재하지 않는 함수명/타입 불일치 시 ABI_ENCODING_FAILED 에러 반환                          | ✓ SATISFIED  | Truth 4           |

**Requirements:** 5/5 satisfied

### Anti-Patterns Found

None. No TODOs, FIXMEs, placeholders, or stub implementations found in any of the modified files.

**Build status:** @waiaas/core and @waiaas/daemon build successfully. Test suite shows 884/885 tests passing (1 pre-existing failure in settings-service.test.ts unrelated to Phase 118 changes, documented in 118-01-SUMMARY.md).

### Implementation Quality

**Strengths:**
- Direct viem import (not via adapter-evm) keeps utils route truly stateless
- Proper error handling with try-catch wrapping viem encodeFunctionData
- Consistent type casting pattern (as unknown as Abi) documented in decisions
- All three client interfaces (TS SDK, Python SDK, MCP) tested and working
- OpenAPI schemas provide full type safety and documentation
- sessionAuth properly applied to /v1/utils/* path
- Skill file updated per CLAUDE.md Interface Sync rule

**Code coverage:**
- REST API: utils.ts route handler complete with error handling
- TS SDK: encodeCalldata() method with typed params/response
- Python SDK: encode_calldata() method with Pydantic models and field aliases
- MCP: encode_calldata tool (12th tool) with z.array(z.any()) for polymorphic args
- Documentation: transactions.skill.md section 10 with request/response examples

---

## Verification Summary

Phase 118 goal ACHIEVED. All 4 observable truths verified, all 10 artifacts exist and are substantive, all 7 key links wired. All 5 requirements satisfied.

AI agents can now:
1. Call POST /v1/utils/encode-calldata directly via REST API
2. Use TS SDK client.encodeCalldata({ abi, functionName, args })
3. Use Python SDK await client.encode_calldata(abi, function_name, args)
4. Use MCP encode_calldata tool with abi/functionName/args parameters
5. Receive ABI_ENCODING_FAILED 400 errors for invalid ABI/function/args

The implementation is complete, tested (884/885 tests passing, 1 pre-existing failure), and ready for use.

---

_Verified: 2026-02-14T16:49:37Z_
_Verifier: Claude (gsd-verifier)_
