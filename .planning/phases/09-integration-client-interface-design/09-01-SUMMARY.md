---
phase: 09-integration-client-interface-design
plan: 01
subsystem: api-spec
tags: [rest-api, openapi, zod, authentication, error-codes]
requires:
  - "06-05 (CORE-06: API Framework Design)"
  - "07-01 (SESS-PROTO: Session Token Protocol)"
  - "07-03 (TX-PIPE: Transaction Pipeline API)"
  - "08-02 (OWNR-CONN: Owner Wallet Connection)"
  - "08-04 (KILL-AUTO-EVM: Kill Switch + AutoStop + EVM Stub)"
provides:
  - "API-SPEC: REST API 전체 스펙 통합 문서 (31 endpoints, 3 auth schemes, 36 error codes)"
  - "Phase 9 Success Criteria #1: REST API 전체 스펙 완성"
affects:
  - "09-02 (SDK/MCP: Zod 스키마 + OpenAPI 타입 파생)"
  - "09-03 (Desktop: Tauri WebView CORS + API 호출)"
  - "09-04 (Telegram Bot + Docker: API 엔드포인트 참조)"
tech-stack:
  added: []
  patterns:
    - "Zod SSoT -> OpenAPI 3.0 -> SDK Type -> MCP Tool 자동 파생 파이프라인"
    - "3종 인증 체계 (Session Bearer, Owner Signature, Master Password)"
    - "9단계 미들웨어 체인 (killSwitchGuard 포함)"
    - "7도메인 에러 코드 체계 (36개 코드)"
    - "커서 기반 페이지네이션 (UUID v7 시간순)"
key-files:
  created:
    - ".planning/deliverables/37-rest-api-complete-spec.md"
  modified: []
key-decisions:
  - "CORS에 tauri://localhost 추가 (Phase 9 Tauri WebView 대응)"
  - "nonce 경로를 /v1/auth/nonce에서 /v1/nonce로 단순화"
  - "Owner API 7개 Phase 9 신규 엔드포인트 (sessions, agents, settings, dashboard)"
  - "Admin status 엔드포인트 추가 (데몬 상세 상태 조회)"
  - "에러 코드 36개를 7개 도메인으로 분류 (AUTH, SESSION, TX, POLICY, OWNER, SYSTEM, AGENT)"
  - "API 버전 관리: v1 additive, breaking change 시 v2 신설, 6개월 병행"
  - "SuccessResponse 래퍼 미사용 (직접 반환, HTTP status code로 성공/실패 판별)"
duration: "~8min"
completed: "2026-02-05"
---

# Phase 9 Plan 01: REST API 전체 스펙 통합 Summary

**One-liner:** Phase 6-8 분산 정의 23개 + Phase 9 신규 7개 = 31개 엔드포인트를 Zod 스키마 수준으로 통합, 3종 인증 + 36개 에러 코드 + OpenAPI 3.0 파이프라인을 단일 문서로 확립

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~8 minutes |
| Started | 2026-02-05T12:44:21Z |
| Completed | 2026-02-05T12:52:00Z |
| Tasks | 2/2 |
| Files created | 1 |
| Lines written | 2440 |

## Accomplishments

### Task 1: Agent/Session/Transaction/Wallet API 통합 스펙 + 인증 체계 설계
- 인증 체계 3종을 OpenAPI securitySchemes로 정의 (bearerAuth, ownerAuth, masterAuth)
- 9단계 미들웨어 체인을 Phase 8 killSwitchGuard 반영으로 확정
- CORS에 `tauri://localhost` Origin 추가 (Phase 9 Tauri Desktop 대응)
- Public API 3개: health, doc, nonce (nonce 경로 /v1/auth/nonce -> /v1/nonce 단순화)
- Session API 5개: balance, address, send (200/202 분기), transactions, pending
- Session Management API 3개: create, list, revoke sessions

### Task 2: Owner/Admin API 확장 스펙 + 에러 코드 체계 + OpenAPI 구조 요약
- Owner API 기존 10개 (connect, disconnect, approve, reject, kill-switch, recover, pending-approvals, status, policies CRUD)
- Owner API Phase 9 신규 7개 (owner/sessions, owner/sessions/:id, owner/agents, owner/agents/:id, owner/settings GET/PUT, owner/dashboard)
- Admin API 3개 (admin/kill-switch, admin/shutdown, admin/status)
- 에러 코드 36개를 7개 도메인으로 분류 (AUTH 8, SESSION 4, TX 7, POLICY 4, OWNER 4, SYSTEM 6, AGENT 3)
- 공통 응답 스키마 (PaginatedResponse, ErrorResponse, SuccessResponse 래퍼 없이 직접 반환)
- OpenAPI 3.0 문서 구조 (Zod SSoT 파이프라인, 태그 6개, securitySchemes 3종)
- API 버전 관리 전략 (v1 additive, Deprecation 정책 6개월)

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Agent/Session/Transaction/Wallet API + 인증 체계 | 21a5b00 | 37-rest-api-complete-spec.md (sections 1-7) |
| 2 | Owner/Admin API + 에러 코드 + OpenAPI 구조 | ceeba05 | 37-rest-api-complete-spec.md (sections 8-14) |

## Files Created

| File | Lines | Description |
|------|-------|-------------|
| `.planning/deliverables/37-rest-api-complete-spec.md` | 2440 | REST API 전체 스펙 통합 문서 (API-SPEC) |

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | CORS에 `tauri://localhost` Origin 추가 | Tauri 2.x WebView는 tauri://localhost Origin 사용. CORE-06에서 Phase 9 과제로 예고 |
| 2 | nonce 경로 `/v1/auth/nonce` -> `/v1/nonce` 단순화 | 인증 불필요 공개 엔드포인트에 /auth/ 접두사 불필요 |
| 3 | Phase 9 신규 Owner 엔드포인트 7개 정의 | Tauri Desktop + Telegram Bot이 참조할 관리 API 필요 (sessions, agents, settings, dashboard) |
| 4 | Admin status 엔드포인트 신규 추가 | 데몬 상세 상태 (어댑터 건강, 워커 상태, DB 정보) 조회 필요 |
| 5 | 에러 코드 7개 도메인 36개로 확정 | v0.1의 46개에서 간소화하되 Self-Hosted 특화 코드 추가 (SYSTEM_LOCKED, KEYSTORE_LOCKED 등) |
| 6 | SuccessResponse 래퍼 미사용 | Self-Hosted 단일 클라이언트 환경에서 불필요한 오버헤드. HTTP status로 성공/실패 판별 |
| 7 | ownerAuth action enum에 `recover`, `view_dashboard` 추가 | Phase 9 신규 엔드포인트 (recover, settings, dashboard)에 대한 action binding 필요 |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- **09-02 (SDK/MCP):** API-SPEC 문서의 Zod 스키마가 SDK 타입 생성과 MCP tool inputSchema의 기반
- **09-03 (Desktop):** CORS tauri://localhost 추가 완료, Owner API 17개 엔드포인트가 Desktop UI의 API 호출 대상
- **09-04 (Telegram/Docker):** Dashboard API가 Telegram Bot 알림 데이터 소스, Admin API가 Docker healthcheck 대상

**Blockers:** None
**Concerns:** None
