---
phase: 05-api-및-통합-설계
plan: 03
subsystem: api
tags: [openapi, rest, zod, webhook, hmac, pagination, versioning, fastify]

# Dependency graph
requires:
  - phase: 05-api-및-통합-설계
    provides: 인증 모델 (API-02), 권한/정책 모델 (API-03), 에러 코드 (API-04)
  - phase: 04-owner-agent-relationship
    provides: 자금 충전/회수 프로세스, 에이전트 생명주기, 비상 회수, 멀티 에이전트 관리
  - phase: 03-system-architecture
    provides: Dual Key 아키텍처, 트랜잭션 플로우, 보안 모델
provides:
  - OpenAPI 3.0 REST API 전체 스펙 (33개 엔드포인트, 8개 도메인)
  - Zod + OpenAPI YAML 병행 스키마 정의 (Agent, Transaction, Balance, AgentPolicy, WalletApiError 등)
  - Webhook 이벤트 스펙 (17개 이벤트, HMAC-SHA256 서명, 재시도 정책)
  - API 버전 관리 거버넌스 (Sunset 헤더, deprecation 정책, oasdiff CI/CD)
  - 엔드포인트별 스코프/역할 매핑 (API-03 일관성 검증 완료)
affects: [05-04-PLAN (SDK/MCP), implementation phase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zod as Single Source of Truth: Zod -> TypeScript 타입 + OpenAPI 스키마 + 런타임 검증"
    - "비동기 트랜잭션 패턴: 202 Accepted + Webhook 알림 (ARCH-03)"
    - "커서 기반 페이지네이션: cursor + limit + hasMore"
    - "HMAC-SHA256 Webhook 서명: timestamp + payload 해싱, timing-safe 비교"

key-files:
  created:
    - .planning/deliverables/21-openapi-spec.md
  modified: []

key-decisions:
  - "API-01: 33개 엔드포인트를 8개 도메인(Agents, Transactions, Funding, Policies, Owner, Emergency, Webhooks, Auth)으로 분류"
  - "API-01: Zod 스키마를 SSoT로 Fastify 라우트에 등록, @fastify/swagger가 OpenAPI 3.0 스펙 자동 생성"
  - "API-01: 트랜잭션 API는 202 Accepted 비동기 패턴, Webhook으로 최종 상태 전달"
  - "API-01: Webhook 서명에 타임스탬프 포함하여 리플레이 공격 방지 (300초 tolerance)"
  - "API-01: 에이전트 삭제(DELETE)는 202 반환 (9단계 폐기 프로세스 비동기)"
  - "API-01: OAuth 2.1 엔드포인트(/oauth/token, /oauth/register)는 /api/v1 경로 밖에 위치"
  - "API-01: 금액 필드는 string 타입(lamports) - JavaScript BigInt 직렬화 문제 회피"

patterns-established:
  - "엔드포인트 문서 구조: 메서드/경로/설명/태그/스코프/허용역할/요청스키마/응답스키마/에러코드"
  - "Zod + OpenAPI YAML 병행 표기: 구현 참조용 Zod + 문서 참조용 YAML"

# Metrics
duration: 6.3min
completed: 2026-02-05
---

# Phase 5 Plan 03: OpenAPI 3.0 REST API 스펙 설계 (API-01) Summary

**33개 REST API 엔드포인트를 OpenAPI 3.0 + Zod SSoT로 정의하고, Webhook 이벤트 17종과 HMAC-SHA256 서명 검증 포함**

## Performance

- **Duration:** 6.3 min
- **Started:** 2026-02-05T05:13:02Z
- **Completed:** 2026-02-05T05:19:19Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments
- 33개 REST API 엔드포인트를 8개 도메인(Agents, Transactions, Funding, Policies, Owner, Emergency, Webhooks, Auth)으로 분류하여 완전 정의
- 모든 엔드포인트에 경로, 메서드, 스코프, 허용 역할, 요청/응답 Zod + OpenAPI YAML 스키마, 에러 코드를 포함
- 17개 Webhook 이벤트 타입, HMAC-SHA256 서명 검증 절차, 재시도 정책(3회, exponential backoff) 정의
- Phase 3-4 설계(에이전트 5단계 상태, Dual Key, 3중 정책 검증, Budget Pool, 비상 회수, Hub-and-Spoke)를 API로 완전 변환
- API-02(인증), API-03(권한/정책), API-04(에러 코드) 문서를 정확히 참조하여 통합

## Task Commits

Each task was committed atomically:

1. **Task 1: OpenAPI 3.0 REST API 스펙 설계 문서 작성** - `cb8cb02` (docs)

## Files Created/Modified
- `.planning/deliverables/21-openapi-spec.md` - OpenAPI 3.0 REST API 전체 스펙 설계 문서 (API-01)

## Decisions Made
- 금액 필드를 `string` 타입으로 통일 (lamports): JavaScript의 BigInt JSON 직렬화 제한을 고려하여 모든 금액 필드를 문자열로 처리
- OAuth 2.1 엔드포인트(`/oauth/token`, `/oauth/register`)는 `/api/v1/` 경로 밖에 위치: OAuth 스펙 표준 경로 관례 준수
- 에이전트 삭제(DELETE)는 202 Accepted 반환: REL-03의 9단계 폐기 프로세스가 비동기로 진행되므로 204가 아닌 202
- Webhook 서명에 타임스탬프 포함: Stripe 패턴 따라 `t=timestamp,v1=signature` 형식, 300초 tolerance로 리플레이 공격 방지

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- API 스펙 완성으로 SDK(API-05) 및 MCP(API-06) 인터페이스 설계 준비 완료
- 33개 엔드포인트의 스코프/역할 매핑이 API-03과 일관되어 SDK 메서드 매핑에 직접 사용 가능
- Webhook 이벤트 스펙이 SDK의 이벤트 리스너 인터페이스 설계의 입력이 됨

---
*Phase: 05-api-및-통합-설계*
*Completed: 2026-02-05*
