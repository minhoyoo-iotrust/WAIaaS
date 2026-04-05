---
phase: 05-api-및-통합-설계
plan: 04
subsystem: api
tags: [sdk, mcp, typescript, python, model-context-protocol, openapi, error-handling]

# Dependency graph
requires:
  - phase: 05-api-및-통합-설계
    provides: "인증 모델 (API-02), 권한/정책 모델 (API-03), 에러 코드 (API-04)"
  - phase: 04-owner-agent-relationship
    provides: "자금 충전/회수 (REL-01~02), 에이전트 생명주기 (REL-03), 비상 회수 (REL-04), 멀티 에이전트 (REL-05)"
provides:
  - "TypeScript SDK 인터페이스: WaiassClient + 5 sub-clients, 31 methods (API-05)"
  - "Python SDK 인터페이스: Sync + Async clients with full type hints (API-05)"
  - "SDK 공통 패턴: Options Bag, PagedAsyncIterableIterator, auto-retry, error hierarchy"
  - "MCP Server 스펙: waiass-wallet, 9 Tools, 4 Resources (API-06)"
  - "MCP 인증: OAuth 2.1 + API Key adapter (API-06)"
  - "REST vs MCP 기능 매트릭스 (API-06)"
affects: [implementation, sdk-development, mcp-server-development, documentation]

# Tech tracking
tech-stack:
  added: ["@waiass/sdk (npm)", "waiass-sdk (PyPI)", "@waiass/mcp-server (npm)", "@modelcontextprotocol/sdk", "httpx (Python)", "zod"]
  patterns: ["Options Bag", "PagedAsyncIterableIterator", "SyncPaginator/AsyncPaginator", "MCP Tool/Resource pattern", "Error type hierarchy (9 domain classes)", "API Key adapter for MCP Bearer token"]

key-files:
  created:
    - ".planning/deliverables/22-sdk-interface.md"
    - ".planning/deliverables/23-mcp-integration.md"
  modified: []

key-decisions:
  - "API-05: TypeScript SDK 수동 작성 (최적 DX), Python SDK 하이브리드 (타입 생성 + 수동 클라이언트)"
  - "API-05: 31개 SDK 메서드가 REST API 엔드포인트와 1:1 매핑"
  - "API-05: 9개 도메인별 에러 클래스 (WaiassError 기반) - WalletApiError type과 1:1 매핑"
  - "API-06: MCP Tools 9개 (핵심 7 + 소유자 전용 2) - 10개 이내 제한 준수"
  - "API-06: MCP Resources 4개 (balance, policy, status, transactions/recent) - 구독 지원"
  - "API-06: MCP 인증 이중 경로 - OAuth 2.1 (프로덕션) + API Key 직접 전달 (개발/테스트)"
  - "API-06: 에이전트는 사용(MCP), 소유자는 관리(REST) - 기능 분리 원칙"

patterns-established:
  - "Options Bag: 모든 SDK 메서드에 단일 옵션 객체/keyword-only args 사용"
  - "Auto-pagination: TypeScript PagedAsyncIterableIterator, Python SyncPaginator/AsyncPaginator"
  - "Error hierarchy: 9 domain error classes, instanceof/except 기반 분기"
  - "MCP Tool convention: LLM-friendly description, Zod schema, REST API 매핑"
  - "MCP Resource URI scheme: wallet:// prefix"
  - "SDK-REST 1:1 mapping: 모든 SDK 메서드가 정확히 하나의 REST 엔드포인트에 매핑"

# Metrics
duration: 7min
completed: 2026-02-05
---

# Phase 5 Plan 04: SDK 인터페이스(API-05) 및 MCP 통합 스펙(API-06) Summary

**TypeScript/Python SDK 31개 메서드 인터페이스와 MCP 서버 9개 Tools + 4 Resources 스펙 설계, OAuth 2.1 + API Key 어댑터 인증 이중 경로 확정**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-05T05:13:14Z
- **Completed:** 2026-02-05T05:20:13Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- TypeScript SDK 전체 인터페이스 설계: WaiassClient + 5개 sub-clients (Agents, Transactions, Owner, Webhooks, Auth) 31개 메서드, 모든 Options/Return 타입 완전 정의
- Python SDK 동기(WaiassClient) + 비동기(AsyncWaiassClient) 이중 클라이언트 설계: keyword-only arguments, SyncPaginator/AsyncPaginator 패턴
- SDK 공통 패턴 상세 설계: Options Bag, PagedAsyncIterableIterator, 자동 재시도(17개 retryable 에러), 9개 도메인 에러 클래스 계층, 로깅
- MCP Server waiass-wallet 스펙: 9개 Tools (Zod 스키마 포함), 4개 Resources (구독 지원), 에러 변환 + LLM 친화 suggestion
- MCP 인증 설계: OAuth 2.1 PRM + API Key 어댑터, Tools/Resources별 스코프 매핑
- REST vs MCP 기능 매트릭스: 31개 엔드포인트 중 9개만 MCP 제공, 나머지 REST-only

## Task Commits

Each task was committed atomically:

1. **Task 1: SDK 인터페이스 설계 문서 작성 (API-05)** - `b8d8b96` (docs)
2. **Task 2: MCP 통합 스펙 설계 문서 작성 (API-06)** - `623a5de` (docs)

## Files Created

- `.planning/deliverables/22-sdk-interface.md` - TypeScript/Python SDK 전체 인터페이스, 공통 패턴, 에러 계층, 사용 예제, REST API 매핑 테이블
- `.planning/deliverables/23-mcp-integration.md` - MCP Server 구성, 9개 Tools, 4개 Resources, 인증 설계, 에러 처리, 배포 가이드, 기능 매트릭스

## Decisions Made

- **SDK 생성 전략:** TypeScript SDK는 수동 작성 (핵심 제품, 최적 DX), Python SDK는 하이브리드 (타입 생성 + 수동 클라이언트). 두 SDK 모두 OpenAPI 스펙과의 일관성을 CI 테스트로 검증.
- **MCP Tools 9개 확정:** 핵심 7개 (execute_transaction, get_balance, get_transaction, list_transactions, get_policy, get_policy_usage, get_agent_status) + 소유자 전용 2개 (suspend_agent, resume_agent). 관리 기능은 REST-only.
- **MCP Resources 4개 확정:** wallet://balance, wallet://policy, wallet://status, wallet://transactions/recent. 모두 구독(subscription) 지원.
- **에러 계층 9개 클래스:** WaiassError -> AuthenticationError, ValidationError, PolicyError, AgentError, TransactionError, FundingError, EmergencyError, SystemError, WebhookError. WalletApiError type과 1:1 매핑.
- **MCP 에러 변환:** WalletApiError를 MCP isError 형식으로 변환하며, LLM이 다음 행동을 결정할 수 있도록 suggestion 필드를 추가.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 5 전체 API 설계가 완료됨 (05-01 인증/권한, 05-02 에러 코드, 05-03 OpenAPI, 05-04 SDK/MCP)
- SDK 구현 준비 완료: 인터페이스 설계, 에러 계층, REST API 매핑 테이블이 모두 확정됨
- MCP 서버 구현 준비 완료: Tools/Resources 스펙, 인증 플로우, 에러 변환 매핑이 확정됨
- 모든 설계 문서가 상호 참조 관계를 명시하여 구현 시 일관성 유지 가능

---
*Phase: 05-api-및-통합-설계*
*Completed: 2026-02-05*
