---
phase: 06-core-architecture-design
plan: 05
subsystem: api, server
tags: [hono, openapi-hono, zod-openapi, cors, rate-limiter, lru-cache, localhost-security, middleware, rest-api]

requires:
  - phase: 06-01
    provides: 모노레포 패키지 구조 (daemon/server/), config.toml [daemon] + [security] 섹션, SQLite 7-테이블 스키마
  - phase: 06-02
    provides: ILocalKeyStore 인터페이스 (서명 연동), sodium guarded memory (키 접근)
  - phase: 06-03
    provides: IChainAdapter 13 메서드 (getBalance/buildTransaction 등), AdapterRegistry
  - phase: 06-04
    provides: 데몬 시작 시퀀스 5단계 HTTP 서버 초기화, Graceful Shutdown 소켓 추적, waiaas status CLI 연동
provides:
  - OpenAPIHono 서버 아키텍처 (초기화 코드 패턴, 서비스 의존성 주입)
  - 8개 미들웨어 스택 (requestId -> requestLogger -> shutdownGuard -> secureHeaders -> hostValidation -> cors -> rateLimiter -> sessionAuth)
  - localhost 4중 보안 전략 (127.0.0.1 바인딩 + Host 검증 + CORS/세션 토큰 + Rate Limiter)
  - v0.2 에러 응답 포맷 (ErrorResponseSchema + WaiaasError 클래스 계층)
  - HTTP 상태 코드 매핑 (200/201/400/401/403/404/409/422/429/500/503)
  - v0.2 에러 코드 체계 (v0.1 재사용 11개 + v0.2 신규 16개)
  - Zod -> TypeScript -> OpenAPI 3.0 SSoT 6단계 파이프라인
  - 13개 라우트 구조 (Phase 매핑, 인증 레벨, 라우트 그룹화)
  - /health 엔드포인트 상세 스키마 (서비스 상태 + 어댑터 상태)
  - lru-cache 슬라이딩 윈도우 Rate Limiter (전역 100/세션 300/엔드포인트별)
  - API 버전 관리 전략 (URL 기반 /v1/, Deprecation 프로세스)
affects: [Phase 7 (세션 인증 JWT 검증 + 거래 파이프라인 라우트 핸들러 + Zod 스키마 상세화), Phase 8 (ownerAuth 라우트 레벨 미들웨어 + 시간 지연/승인 에러 코드 + Kill Switch 연동), Phase 9 (REST API 전체 스펙 완성 + SDK 인터페이스 + MCP 도구 스키마 + Tauri CORS 추가)]

tech-stack:
  added: [hono, "@hono/node-server", "@hono/zod-openapi", "@hono/swagger-ui", lru-cache]
  patterns: [OpenAPIHono + createRoute + app.openapi SSoT, 8-step middleware cascade, 4-layer localhost security, WaiaasError class hierarchy, sliding window rate limiter, URL-based API versioning]

key-files:
  created:
    - .planning/deliverables/29-api-framework-design.md
  modified: []

key-decisions:
  - "v0.2 에러 포맷 간소화: RFC 9457 -> 단순 JSON (type/title/instance/docUrl 제거, code/message/details/requestId/retryable 유지)"
  - "미들웨어 순서 8단계 확정 (보안 순서: ID -> 로깅 -> 종료검사 -> 보안헤더 -> Host -> CORS -> Rate -> 인증)"
  - "IPv6 (::1) 미지원 결정: 공격 표면 축소, localhost 전용에서 실질 이점 없음"
  - "기본 포트 3100: 3000/3001/8080 충돌 방지"
  - "Swagger UI는 debug 모드에서만 활성화"
  - "Rate Limiter 3-레벨: 전역 100/세션 300/거래 10 req/min"
  - "Content negotiation 미채택: application/json 단일 포맷"
  - "ownerAuth는 전역 미들웨어가 아닌 라우트 레벨 미들웨어 (Phase 8 상세)"

patterns-established:
  - "OpenAPIHono<AppBindings> 타입 파라미터로 서비스 의존성 주입 (Variables에 db, keyStore, adapters)"
  - "createMiddleware() + createRoute() + app.openapi() 3단계 라우트 정의"
  - "Zod 스키마 파일 위치: packages/core/src/schemas/ (SSoT, daemon/adapters는 import)"
  - "에러 처리: WaiaasError extends Error + app.onError() 글로벌 핸들러 + Zod defaultHook"
  - "Rate limit 헤더: 모든 응답에 X-RateLimit-* 포함 (429 아닌 정상 응답에도)"
  - "공개 엔드포인트는 /health, /doc만. 나머지 /v1/* 모두 인증 필요"
  - "SocketTracker 패턴: server.on('connection') -> Set<Socket> -> destroySoon()"

duration: 7min
completed: 2026-02-05
---

# Phase 6 Plan 5: Hono API 프레임워크 설계 Summary

**OpenAPIHono 서버 + 8단계 미들웨어 스택(보안 순서 정의) + localhost 4중 보안(0.0.0.0 Day 방지) + Zod/OpenAPI SSoT 파이프라인 + 13개 라우트 구조 + lru-cache Rate Limiter + v0.2 에러 코드 체계**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-05T09:10:46Z
- **Completed:** 2026-02-05T09:17:57Z
- **Tasks:** 2
- **Files created:** 1

## Accomplishments

- OpenAPIHono 서버 아키텍처를 데몬 라이프사이클(CORE-05) 5단계와 정확히 연동하여 설계. 서비스 의존성(DB, KeyStore, AdapterRegistry)을 Hono 컨텍스트로 주입하는 코드 패턴 정의
- 8개 미들웨어를 보안 우선 순서로 확정. 각 미들웨어의 입력/출력/에러/코드 패턴을 모두 정의. Mermaid 시퀀스 다이어그램으로 실행 흐름 시각화
- localhost 4중 보안 전략을 6가지 공격 벡터에 대한 방어 매트릭스로 완성. 0.0.0.0 Day, DNS Rebinding, CSRF 모두 대응
- v0.1 RFC 9457 에러 포맷을 v0.2 Self-Hosted 환경에 맞게 간소화. WaiaasError 클래스 계층 + Zod defaultHook으로 통일된 에러 처리 구현
- Zod -> TypeScript -> OpenAPI 3.0 SSoT 파이프라인을 Balance 엔드포인트 전체 예시로 6단계 문서화
- 13개 엔드포인트를 인증 레벨(None/Session/Owner) + 담당 Phase(6/7/8)로 매핑. /health 엔드포인트를 서비스 상태 상세 스키마까지 설계
- lru-cache 슬라이딩 윈도우 Rate Limiter를 3-레벨(전역/세션/엔드포인트)로 설계. config.toml [security] 섹션 연동
- API 버전 관리(URL 기반 /v1/) + Deprecation/Sunset 헤더 프로세스 정의

## Task Commits

Each task was committed atomically:

1. **Task 1: Hono 서버 아키텍처 + 미들웨어 스택 + localhost 보안 + 에러 체계** - `196b1f4` (docs)
2. **Task 2: Zod/OpenAPI 파이프라인 + 라우트 구조 + Rate Limiter + API 버전 관리** - `c67c516` (docs)

## Files Created/Modified

- `.planning/deliverables/29-api-framework-design.md` - CORE-06: Hono 서버 아키텍처(섹션1), 미들웨어 스택(섹션2), localhost 보안(섹션3), 에러 처리(섹션4), Zod/OpenAPI 파이프라인(섹션5), 라우트 구조(섹션6), Rate Limiter(섹션7), API 버전 관리(섹션8), 요구사항 매핑(섹션9), 참조(섹션10)

## Decisions Made

1. **v0.2 에러 포맷 간소화:** RFC 9457의 `type`/`title`/`instance`/`docUrl` 필드를 제거하고 `code`/`message`/`details`/`requestId`/`retryable`로 간소화. Self-Hosted 단일 서버에서 URI 기반 에러 타입과 외부 문서 링크의 실질적 이점 없음
2. **IPv6 미지원:** `::1` (IPv6 loopback)을 의도적으로 제외. IPv4/IPv6 듀얼 스택은 공격 표면을 넓히고, localhost 전용 서비스에서 IPv6의 실질적 이점 없음
3. **기본 포트 3100:** 3000(React/Next.js), 3001(개발 서버), 8080(기타) 등 흔히 사용되는 포트와 충돌 방지. WAIAAS_DAEMON_PORT 환경변수로 오버라이드 가능
4. **ownerAuth 라우트 레벨:** Owner 인증은 `/v1/owner/*` 라우트에만 적용되므로 전역 미들웨어가 아닌 라우트 레벨 미들웨어로 설계. Phase 8에서 SIWS/SIWE 서명 검증 상세 정의
5. **Swagger UI debug 모드 제한:** Swagger UI는 공격 정보 노출 위험이 있으므로 `log_level: debug`일 때만 `/swagger` 활성화
6. **Content negotiation 미채택:** Self-Hosted 단일 서버에서 복수 포맷 지원의 복잡성 대비 이점 없음. JSON 단일 포맷으로 통일

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 7 (세션 & 트랜잭션): sessionAuth 미들웨어의 JWT 검증 로직(jose 라이브러리) 상세화. /v1/sessions, /v1/transactions, /v1/wallet 라우트 핸들러 구현. Zod 스키마(session.ts, transaction.ts, wallet.ts, agent.ts) 상세화
- Phase 8 (보안 계층): ownerAuth 라우트 레벨 미들웨어(SIWS/SIWE) 설계. 시간 지연/승인 에러 코드(APPROVAL_REQUIRED, APPROVAL_TIMEOUT) 활용. Kill Switch 발동 시 KILL_SWITCH_ACTIVE 에러 코드 + kill-switch CLI와 /v1/owner/kill-switch 연동
- Phase 9 (통합): REST API 전체 스펙 완성 (OpenAPI /doc 기반). SDK 인터페이스(Zod 타입 기반 TypeScript/Python). MCP 도구 스키마(/doc JSON 참조). Tauri WebView CORS(tauri://localhost Origin 추가)
- **Phase 6 완료:** 5개 플랜(CORE-01~CORE-06) 모두 완료. Phase 7 시작 가능
- 차단 요소 없음

---
*Phase: 06-core-architecture-design*
*Completed: 2026-02-05*
