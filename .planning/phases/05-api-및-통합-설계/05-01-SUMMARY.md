---
phase: 05-api-및-통합-설계
plan: 01
subsystem: api
tags: [authentication, api-key, oauth2.1, mcp, rbac, abac, rate-limiting, policy]

# Dependency graph
requires:
  - phase: 03-system-architecture
    provides: "Dual Key Architecture (ARCH-01), 3중 정책 검증 (ARCH-03), 4-tier 에스컬레이션"
  - phase: 04-owner-agent-relationship
    provides: "BudgetConfig (REL-01), 에이전트 생명주기 (REL-03), 비상 회수 (REL-04), 멀티 에이전트 (REL-05)"
provides:
  - "3-Layer 인증 모델 (API Key + OAuth 2.1 + MCP Authorization)"
  - "API Key 구조, 생명주기, SHA-256 해싱 저장 설계"
  - "OAuth 2.1 Client Credentials + PKCE + DCR 설계"
  - "MCP Authorization + PRM 메타데이터 + API Key 어댑터"
  - "RBAC + ABAC 하이브리드 권한 모델 (4역할 x 11스코프)"
  - "AgentPolicy 인터페이스 (한도/화이트리스트/시간/에스컬레이션)"
  - "3-Layer Rate Limiting 전략"
  - "정책 템플릿 3종 (conservative/standard/permissive)"
  - "온체인-오프체인 정책 동기화 메커니즘"
affects:
  - 05-02 (에러 코드 규격에서 인증/권한 에러 코드 참조)
  - 05-03 (OpenAPI 스펙에서 인증 스킴, 스코프 참조)
  - 05-04 (SDK 인터페이스에서 인증 클라이언트 설계)
  - 05-05 (MCP 통합 스펙에서 MCP Authorization 참조)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "3-Layer 인증: API Key Primary, OAuth 2.1 Secondary, MCP Authorization"
    - "SHA-256 해싱 저장 (Stripe 패턴): 원본 1회 반환, 해시만 DB 저장"
    - "RBAC + ABAC 하이브리드: 역할 기반 API 접근 + 속성 기반 정책 제어"
    - "정책 템플릿 프리셋: conservative/standard/permissive 3종"
    - "온체인-오프체인 동기화: 서버 정책 >= 온체인 한도 (defense-in-depth)"

key-files:
  created:
    - ".planning/deliverables/18-authentication-model.md"
    - ".planning/deliverables/19-permission-policy-model.md"
  modified: []

key-decisions:
  - "API-02: API Key를 Primary 인증 수단으로 채택 (AI 에이전트 비인터랙티브 특성)"
  - "API-02: MCP Authorization에 API Key 직접 전달 어댑터 지원 (OAuth + API Key 이중 경로)"
  - "API-02: JWT 토큰 수명 15분 access / 7일 refresh (refresh rotation 적용)"
  - "API-03: RBAC 4역할 (owner/agent/viewer/auditor) + ABAC 4정책 속성"
  - "API-03: Rate Limiting 3-Layer (IP 1000/min, Key 100-500/min, Agent tx 10/min)"
  - "API-03: 정책 변경 시 한도 증가는 즉시 적용, 감소는 사용량 초과 시 다음 기간"
  - "API-03: 서버 정책은 항상 온체인 한도보다 같거나 엄격하게 유지 (defense-in-depth)"

patterns-established:
  - "ApiScope 체계: 11개 스코프, API Key와 OAuth가 공유"
  - "AgentPolicy 인터페이스: Phase 4 BudgetConfig를 API 레벨로 변환"
  - "정책 검증 순서: 금액 한도 -> 화이트리스트 -> 시간 제어 -> 에스컬레이션"

# Metrics
duration: 6min
completed: 2026-02-05
---

# Phase 5 Plan 01: 에이전트 인증 및 권한 모델 설계 Summary

**3-Layer 인증 모델(API Key/OAuth 2.1/MCP Authorization) + RBAC+ABAC 하이브리드 권한 모델 + 3-Layer Rate Limiting + 정책 템플릿 3종 설계**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-05T05:02:26Z
- **Completed:** 2026-02-05T05:08:58Z
- **Tasks:** 2/2
- **Files created:** 2

## Accomplishments

- 3계층 인증 모델 설계: API Key(Primary) + OAuth 2.1 Client Credentials(Secondary) + MCP Authorization, Phase 3 Dual Key Architecture와의 레이어링 관계 정의
- RBAC + ABAC 하이브리드 권한 모델: 4역할(owner/agent/viewer/auditor) x 11스코프 매트릭스 + 30개 엔드포인트 스코프 매핑 + AgentPolicy 인터페이스(4정책 속성)
- 정책 관리 체계: 템플릿 3종(conservative/standard/permissive), 사용량 추적 API, 변경 이력 기록, 온체인-오프체인 동기화 메커니즘

## Task Commits

Each task was committed atomically:

1. **Task 1: 에이전트 인증 모델 설계 (API-02)** - `ebb9c8f` (docs)
2. **Task 2: 권한 및 정책 모델 설계 (API-03)** - `ca9cfb2` (docs)

## Files Created/Modified

- `.planning/deliverables/18-authentication-model.md` - API-02: 3-Layer 인증 모델, API Key 구조/생명주기, OAuth 2.1 Client Credentials, MCP Authorization, 보안 고려사항, 인증 API 엔드포인트
- `.planning/deliverables/19-permission-policy-model.md` - API-03: RBAC+ABAC 하이브리드, 역할-스코프 매트릭스, AgentPolicy 인터페이스, 정책 관리 API, 3-Layer Rate Limiting, 정책 템플릿, 온체인-오프체인 동기화

## Decisions Made

- API Key를 Primary 인증 수단으로 채택: AI 에이전트의 비인터랙티브 특성상 브라우저 기반 OAuth 플로우 부적합, API Key가 즉시 접근 제공
- MCP Authorization에 API Key 직접 전달 어댑터 지원: MCP 클라이언트가 OAuth 2.1 표준 플로우 또는 API Key 직접 전달 모두 가능 (05-RESEARCH.md Open Question 2 해결)
- JWT 토큰 수명 15분/7일: 핀테크 업계 표준, refresh token rotation으로 보안 강화
- RBAC 4역할 체계: owner(전체), agent(실행+읽기), viewer(읽기), auditor(감사 읽기)
- Rate Limiting 3-Layer: DDoS 방어(IP) + 등급별 차등(Key) + 트랜잭션 빈도(Agent)
- 정책 변경 적용 시점: 한도 증가는 즉시, 감소는 현재 사용량 초과 시 다음 기간 (에이전트 운영 안정성)
- 서버 정책 >= 온체인 한도: defense-in-depth 원칙, 동기화 실패 시에도 서버가 더 엄격

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 인증 모델(API-02)과 권한/정책 모델(API-03)이 완료되어 Phase 5의 나머지 설계 기반 확보
- ApiScope 체계가 확정되어 OpenAPI 스펙(API-01), SDK 인터페이스(API-05), MCP 통합(API-06)에서 참조 가능
- AgentPolicy 인터페이스가 확정되어 에러 코드(API-04)에서 정책 위반 에러 코드 설계 가능

---
*Phase: 05-api-및-통합-설계*
*Completed: 2026-02-05*
