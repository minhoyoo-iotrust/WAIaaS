---
phase: 09-integration-client-interface-design
plan: 02
subsystem: sdk-mcp
tags: [typescript-sdk, python-sdk, mcp-server, claude-desktop, zod-ssot, httpx, pydantic]
requires:
  - "09-01 (API-SPEC: REST API 전체 스펙 통합)"
  - "06-05 (CORE-06: Zod SSoT 파이프라인)"
  - "07-01 (SESS-PROTO: JWT Session Token)"
  - "07-03 (TX-PIPE: Transaction Pipeline API)"
provides:
  - "SDK-MCP: TypeScript SDK, Python SDK, MCP Server 전체 인터페이스 설계"
  - "Phase 9 Success Criteria #2: SDK/MCP 인터페이스 완성"
affects:
  - "09-03 (Desktop: Tauri WebView에서 TS SDK Owner 사용)"
  - "09-04 (Telegram/Docker: REST API 직접 호출 + Docker 환경 MCP 확장)"
tech-stack:
  added:
    - "@modelcontextprotocol/sdk ^1.0.0 (MCP Server)"
    - "openapi-typescript (보조 타입 생성)"
    - "httpx >=0.27.0 (Python SDK async HTTP)"
    - "pydantic >=2.0.0 (Python SDK 모델)"
  patterns:
    - "Zod SSoT -> z.infer / openapi-typescript / MCP Zod 재사용 타입 파이프라인"
    - "Options Bag 패턴 (Azure SDK Guidelines)"
    - "WAIaaSError code/statusCode/retryable 에러 타입"
    - "MCP Tool 6개 제한 (Agent API 1:1, Owner/Admin 미노출)"
    - "MCP stdio transport (Claude Desktop 기본)"
    - "MCP 전용 장기 세션 (최대 7일, WAIAAS_SESSION_TOKEN 환경변수)"
key-files:
  created:
    - ".planning/deliverables/38-sdk-mcp-interface.md"
  modified: []
key-decisions:
  - "SDK 외부 런타임 의존성 0개 (Node.js 22 내장 fetch, @waiaas/core workspace)"
  - "MCP Tools 6개로 제한 (send_token, get_balance, get_address, list_transactions, get_transaction, get_nonce)"
  - "MCP Resources 3개 (waiaas://wallet/balance, waiaas://wallet/address, waiaas://system/status)"
  - "MCP 세션 토큰: 환경변수 WAIAAS_SESSION_TOKEN, 장기 세션(7일) 권장"
  - "MCP Transport: stdio 기본 (v0.2), Streamable HTTP는 v0.3 설계만"
  - "Python SDK: httpx AsyncClient + Pydantic v2, snake_case 메서드"
  - "TS SDK Owner: signMessage 콜백 패턴 (지갑 라이브러리 위임)"
  - "openapi-typescript는 보조 경로, primary는 @waiaas/core 직접 import"
duration: "~8min"
completed: "2026-02-05"
---

# Phase 9 Plan 02: SDK & MCP Server 인터페이스 설계 Summary

**One-liner:** WAIaaSClient/WAIaaSOwnerClient TS 클래스 + Python async SDK + MCP Server 6 Tools/3 Resources를 Zod SSoT 파이프라인에서 파생하는 3경로 통합 인터페이스 완성

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~8 minutes |
| Started | 2026-02-05T12:56:26Z |
| Completed | 2026-02-05T13:04:01Z |
| Tasks | 2/2 |
| Files created | 1 |
| Lines written | 2610 |

## Accomplishments

### Task 1: TypeScript SDK + Python SDK 인터페이스 설계
- Zod SSoT -> SDK 타입 파이프라인 설계 (z.infer, openapi-typescript, MCP Zod 재사용)
- WAIaaSClient: Agent API 7개 메서드 (getBalance, getAddress, sendToken, listTransactions, getTransaction, listPendingTransactions, getNonce)
- WAIaaSClientOptions: Options Bag 패턴 (baseUrl, sessionToken, retry, timeout, signal)
- WAIaaSOwnerClient: Owner API 16개 메서드 (createSession, listSessions, revokeSession, approveTransaction, rejectTransaction, listPendingApprovals, listAgents, getAgent, getStatus, getDashboard, getSettings, updateSettings, activateKillSwitch, recover, connect, disconnect)
- WAIaaSOwnerClientOptions: signMessage 콜백, ownerAddress, chain
- WAIaaSError: code, statusCode, retryable, requestId, details
- RetryPolicy: maxRetries, backoff (exponential/linear/none), baseDelay, retryableStatuses
- Python SDK: WAIaaSClient async class (httpx.AsyncClient, snake_case), Pydantic v2 models
- Python WAIaaSOwnerClient: 동일 기능 async 제공

### Task 2: MCP Server 도구/리소스/전송 + Claude Desktop 연동 설계
- MCP Server (@waiaas/mcp) 패키지 구조 + McpServer 초기화
- MCP Tools 6개: send_token, get_balance, get_address, list_transactions, get_transaction, get_nonce (Agent API 1:1 매핑)
- MCP Resources 3개: wallet-balance, wallet-address, system-status (waiaas:// URI, application/json)
- Tool 응답 형식: JSON text + isError boolean
- MCP 세션 토큰 전달: WAIAAS_SESSION_TOKEN 환경변수, 장기 세션 발급 가이드
- Claude Desktop 설정 JSON 예시 (macOS/Windows 경로)
- MCP Transport: stdio 기본 (v0.2) + Streamable HTTP 설계 (v0.3)
- Claude Desktop 통합 시나리오 4개 (잔액, 전송, 이력, APPROVAL 대기)
- SDK vs MCP 기능 매트릭스 (Agent 7기능, Owner 10기능, Resource 3개)
- 통합 경로 선택 가이드 (TS SDK, Python SDK, MCP, REST 직접)
- 보안 고려사항: 토큰 보호, MCP 보안 경계, 에러 코드 행동 매핑

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | TypeScript SDK + Python SDK 인터페이스 설계 | 6d4a382 | 38-sdk-mcp-interface.md (sections 1-4) |
| 2 | MCP Server + Claude Desktop 연동 설계 | a8d18b2 | 38-sdk-mcp-interface.md (sections 5-10) |

## Files Created

| File | Lines | Description |
|------|-------|-------------|
| `.planning/deliverables/38-sdk-mcp-interface.md` | 2610 | SDK & MCP Server 전체 인터페이스 설계 (SDK-MCP) |

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | SDK 외부 런타임 의존성 0개 | Node.js 22 내장 fetch 사용, @waiaas/core는 workspace. 번들 크기 최소화 + 의존성 취약점 최소화 |
| 2 | MCP Tools 6개 제한 | Agent API만 노출, Owner/Admin 미노출. LLM 컨텍스트 절약 + 도구 선택 정확도 (Pitfall 2 방지) |
| 3 | MCP Resources 3개 (balance, address, status) | LLM이 컨텍스트로 미리 로드하는 읽기 전용 데이터. 자주 참조하는 3개만 |
| 4 | MCP 세션: 환경변수 + 장기 세션(7일) | Claude Desktop 프로세스 수명주기에 맞춤. 동적 환경변수 갱신 불가하므로 최대 만료 활용 |
| 5 | MCP Transport: stdio only (v0.2) | Claude Desktop/Cursor 모두 stdio 지원. Streamable HTTP는 v0.3 Docker 시나리오 대비 |
| 6 | Python SDK: httpx + Pydantic v2 | async/await 네이티브, connection pooling, model_validate 자동 파싱 |
| 7 | TS Owner SDK: signMessage 콜백 | 지갑 라이브러리(Phantom, MetaMask)에 서명 위임. SDK가 지갑 구현에 비의존적 |
| 8 | openapi-typescript는 보조 경로 | Primary는 @waiaas/core 직접 import (drift 0%). 외부 배포용 독립 타입은 openapi-typescript로 생성 |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- **09-03 (Desktop):** WAIaaSOwnerClient가 Tauri WebView에서 Owner API 호출의 기반. CORS tauri://localhost 이미 설정됨 (API-SPEC). signMessage 콜백은 @reown/appkit에서 제공
- **09-04 (Telegram/Docker):** Telegram Bot은 REST API 직접 호출 (SDK 불필요). Docker 환경에서 MCP Server는 Streamable HTTP (v0.3) 경로 설계 완료

**Blockers:** None
**Concerns:** None
