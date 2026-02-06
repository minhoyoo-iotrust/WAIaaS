---
phase: 12-high-schema-unification
plan: 03
outcome: success
subsystem: api-spec-unification
tags: [cors, health, rate-limiter, ownerAuth, memo, successResponse, api-framework, rest-api]

requires:
  - phase-11 (CRITICAL 의사결정 확정 -- port 3100, hostname z.union)
  - phase-12-01 (Enum 통합 대응표 -- AgentStatus 5개 통일)
  - phase-12-02 (config.toml 누락 설정 -- rate_limit 3-level 구조)

provides:
  - API-01 해결: 메모 200자 + Solana 256 bytes 관계 명시
  - API-02 해결: CORS 미들웨어 API-SPEC 기준 통일 (tauri://localhost, X-Master-Password, RateLimit expose)
  - API-03 해결: Health status healthy/degraded/unhealthy 양쪽 통일
  - API-04 해결: Rate Limiter config.toml 참조 추가 (rate_limit_global_rpm 등)
  - API-05 해결: SuccessResponse 래퍼 잔존 없음 확인
  - API-06 해결: ownerAuth 미들웨어 CORE-06에 9단계 순서로 반영

affects:
  - phase-13 (MEDIUM 구현 노트 -- API 스펙 통일 완료로 구현 기준 확보)

tech-stack:
  patterns:
    - SSoT 기반 문서 통일 (API-SPEC이 최종 기준, CORE-06 역방향 업데이트)
    - 미들웨어 9단계 순서 (글로벌 7 + 라우트 레벨 2)
    - /health vs /v1/admin/status 역할 분리 패턴

key-files:
  modified:
    - .planning/deliverables/29-api-framework-design.md
    - .planning/deliverables/37-rest-api-complete-spec.md

decisions:
  - API-02: CORS origin에 tauri://localhost 추가 (Phase 9 TAURI-DESK 대응)
  - API-02: allowHeaders에 X-Master-Password 추가 (Phase 8 Admin API 대응)
  - API-02: exposeHeaders에 X-RateLimit-* 3개 추가 (Rate Limiter 응답 헤더)
  - API-03: Health status enum을 healthy/degraded/unhealthy로 통일 (CORE-06 기준이 SSoT)
  - API-03: /health (공개, 간단)과 /v1/admin/status (masterAuth, 상세) 역할 분리 문서화
  - API-06: 미들웨어 순서를 8단계에서 9단계로 확장 (ownerAuth 라우트 레벨 추가)
  - API-01: memo 200자 제한 유지 + Solana 256 bytes 이중 검증 설명 추가

metrics:
  duration: ~3min
  completed: 2026-02-06
---

# Phase 12 Plan 03: REST API <-> API Framework 스펙 통일 Summary

CORE-06(29-api-framework-design.md)과 API-SPEC(37-rest-api-complete-spec.md) 간 CORS/Health/Rate Limiter/ownerAuth/memo/SuccessResponse 6건 불일치를 해소. API-SPEC을 SSoT로 CORE-06를 역방향 업데이트하고, Health status enum을 양쪽 healthy/degraded/unhealthy로 통일.

---

## Task Commits

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | CORS/Health/Rate Limiter 통일 + ownerAuth 반영 | `c997513` | 29-api-framework: CORS 3항목 추가, Health timestamp, 미들웨어 9단계, ownerAuth 설명, config.toml 참조 |
| 2 | Health status 통일 + 메모 제한 명시 + SuccessResponse 정리 | `2f7d03f` | 37-rest-api: Health ok->healthy/error->unhealthy, memo 256 bytes 설명, SuccessResponse 잔존 없음 확인 |

---

## Decisions Made

### API-02: CORS 미들웨어 통일

- **결정**: API-SPEC(37-rest-api) 기준으로 CORE-06(29-api-framework) CORS 설정을 업데이트
- **변경**: origin에 `tauri://localhost`, allowHeaders에 `X-Master-Password`, exposeHeaders에 `X-RateLimit-*` 3개 추가
- **근거**: CORE-06은 Phase 6 기본 설정, Phase 8-9에서 확장된 API-SPEC이 최종 SSoT
- **영향**: 양쪽 문서의 CORS 설정이 완전 일치

### API-03: Health status enum 통일

- **결정**: `healthy/degraded/unhealthy`로 양쪽 통일 (API-SPEC의 `ok/error`를 CORE-06 기준으로 변경)
- **근거**: `healthy/unhealthy`가 `ok/error`보다 헬스체크 도메인에서 더 명시적이고 표준적
- **추가**: CORE-06의 HealthResponseSchema에 `timestamp` 필드 추가 (API-SPEC에는 이미 존재)
- **영향**: `/health` 응답의 status 값이 양쪽 문서에서 동일

### API-06: ownerAuth 미들웨어 반영

- **결정**: CORE-06 미들웨어 순서를 8단계에서 9단계로 확장, ownerAuth를 라우트 레벨 미들웨어로 추가
- **근거**: Phase 8에서 ownerAuth가 34-owner-wallet-connection.md에서 상세 설계 완료됨. "Phase 8에서 상세 설계" 주석을 실제 참조로 교체
- **영향**: 미들웨어 실행 순서가 API-SPEC(섹션 4.1)과 CORE-06에서 일치

### API-01: 메모 길이 이중 검증 명시

- **결정**: REST API의 memo Zod `.max(200)` 유지 + description에 Solana 256 bytes 보장 설명 추가
- **근거**: 200 UTF-8 문자는 최대 800 bytes이나, 실제 메모는 대부분 ASCII이므로 200자 < 256 bytes. 체인 어댑터에서 바이트 길이 이중 검증으로 안전성 확보
- **영향**: 구현 시 Zod(문자 수) + 어댑터(바이트 수) 2중 검증 패턴 확립

---

## Deviations from Plan

None -- plan executed exactly as written.

---

## Files Modified

| File | Changes |
|------|---------|
| `29-api-framework-design.md` | CORS: origin/allowHeaders/exposeHeaders 3곳 업데이트 (코드 블록, 테이블, 설정 상세 모두). Health: timestamp 필드 추가 (스키마, 핸들러, JSON 예시). /health vs /v1/admin/status 역할 분리 문서화. Rate Limiter: config.toml 참조 문구 + 필드명 통일 (rate_limit_global_rpm 등). 미들웨어: 8단계->9단계 (ownerAuth 추가). ownerAuth 상세 설명 + 34-owner-wallet 참조. Phase 8 주석 제거. Tauri 방어 설명 현행화. |
| `37-rest-api-complete-spec.md` | Health: z.enum ok->healthy, error->unhealthy 변경 + 예시 JSON 업데이트. memo: description에 200자/256 bytes 이중 검증 설명 추가. SuccessResponse: 잔존 없음 확인 (섹션 11.3 결정 유지). |

---

## Verification Results

| Check | Result |
|-------|--------|
| CORS: tauri://localhost in 29-api (count >= 1) | PASS (5) |
| CORS: X-Master-Password in 29-api (count >= 1) | PASS (3) |
| CORS: X-RateLimit-Limit in 29-api (count >= 1) | PASS (6) |
| Health: timestamp in 29-api (count >= 1) | PASS (13) |
| Health: z.enum ok 제거 in 37-rest (count = 0) | PASS |
| Health: 'healthy' in 37-rest (count >= 1) | PASS (2) |
| Health: 'unhealthy' in 37-rest (count >= 1) | PASS (1) |
| ownerAuth in 29-api (count >= 1) | PASS (6) |
| Phase 8에서 상세 설계 제거 (count = 0) | PASS |
| memo: 256 bytes in 37-rest (count >= 1) | PASS (1) |
| 12-01 보존: CREATING in 37-rest (count >= 1) | PASS (3) |
| Nonce: /v1/nonce in 37-rest (count >= 1) | PASS (5) |
| SuccessResponse: 잔존 패턴 없음 (문서 섹션만 존재) | PASS |

---

## Next Phase Readiness

- Phase 12 완료: ENUM-01~04 (12-01), CONF-01~05 (12-02), API-01~06 (12-03) 모두 해결
- Phase 13 (MEDIUM 구현 노트) 진행 가능
- HIGH 15건 전부 해결:
  - H1 (인터페이스명): 42-interface-mapping.md
  - H2 (세션 TTL): 12-02 CONF-01
  - H3 (jwt_secret): 12-02 CONF-02
  - H4 (메모 길이): 12-03 API-01
  - H5 (연속 실패): 12-02 CONF-03
  - H6-H7 (에이전트/정책 Enum): 12-01 ENUM-01/02
  - H8-H9 (CORS/Health): 12-03 API-02/03
  - H10-H11 (v0.1 잔재): 42/43-mapping.md
  - H12 (Rate Limiter): 12-02 rate_limit 3-level + 12-03 API-04
  - H13 (에스컬레이션): 44-escalation-mapping.md
  - H14 (SuccessResponse): 12-03 API-05
  - H15 (ownerAuth): 12-03 API-06

## Self-Check: PASSED
