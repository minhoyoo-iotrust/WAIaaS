# Phase 27 Plan 02: Rate Limiter 2단계 분리 + killSwitchGuard 확정 Summary

**One-liner:** Rate Limiter를 globalRateLimit(IP 1000/min) + sessionRateLimit(세션 300/min)으로 2단계 분리, killSwitchGuard 허용 4개 + 503 SYSTEM_LOCKED 확정

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| Phase | 27-daemon-security-foundation |
| Plan | 02 |
| 유형 | execute |
| 소요 시간 | ~12분 |
| 완료일 | 2026-02-08 |
| 문서 수정 | 5개 |

## 해소된 이슈

| 이슈 ID | 설명 | 해소 방법 |
|---------|------|-----------|
| DAEMON-03 | 미인증 공격자가 인증 사용자의 rate limit 소진 가능 | Rate Limiter 2단계 분리 (#3.5 globalRateLimit + #9 sessionRateLimit) |
| DAEMON-04 | killSwitchGuard 허용 목록 불완전, 부적절한 401 응답 | 허용 목록 4개 확정, HTTP 503 SYSTEM_LOCKED 응답, recover 경로 통일 |

## Task Commits

| Task | Name | Commit | Files Modified |
|------|------|--------|----------------|
| 1 | Rate Limiter 2단계 분리 (DAEMON-03) | 1df3815 | 29-api-framework-design.md, 37-rest-api-complete-spec.md, 24-monorepo-data-directory.md |
| 2 | killSwitchGuard 허용 목록 확정 + 503 응답 (DAEMON-04) | c579d29 | 36-killswitch-autostop-evm.md, 37-rest-api-complete-spec.md, 52-auth-model-redesign.md |

## 변경 상세

### Task 1: Rate Limiter 2단계 분리

**29-api-framework-design.md:**
- 섹션 2.1: 미들웨어 순서 9단계 -> 10단계. #3.5 globalRateLimit(IP 1000/min) + #9 sessionRateLimit(세션 300/min, tx 10/min) 추가. 기존 #7 rateLimiter 삭제. killSwitchGuard #8->#7, authRouter #9->#8
- 섹션 2.2: `registerMiddleware()` 코드 갱신 (globalRateLimitMiddleware, killSwitchGuardMiddleware, authRouter, sessionRateLimitMiddleware)
- 섹션 2.3: 미들웨어 3.5/7/8/9 상세 설명 + TypeScript 코드 추가
- 섹션 2.4: Mermaid 시퀀스 다이어그램 10단계 갱신
- 섹션 3.2: Layer 4 Rate Limiter -> 2단계 분리 반영
- 섹션 7: 전면 재구성 -- 3-level -> 2-stage, globalRateLimitMiddleware + sessionRateLimitMiddleware 전체 코드, config.toml 키 변경

**37-rest-api-complete-spec.md:**
- 섹션 4.1: 9단계 -> 10단계 미들웨어 순서 갱신
- Rate Limit 참조: `전역 100 req/min` -> `globalRateLimit 1000 req/min (Stage 1)` (5곳 일괄 변경)

**24-monorepo-data-directory.md:**
- [security] 테이블: `rate_limit_global_rpm`(100) -> `rate_limit_global_ip_rpm`(1000) 이름/값 변경
- config.toml 예시: 동일 변경
- 환경변수 테이블: `WAIAAS_SECURITY_RATE_LIMIT_GLOBAL_RPM` -> `WAIAAS_SECURITY_RATE_LIMIT_GLOBAL_IP_RPM`
- Zod 스키마: `rate_limit_global_rpm` -> `rate_limit_global_ip_rpm`, min 100, max 10000, default 1000

### Task 2: killSwitchGuard 허용 목록 확정 + 503 응답

**36-killswitch-autostop-evm.md:**
- 섹션 2.4: KILL_SWITCH_ALLOWED_PATHS 4개로 확장 (health, status, recover, kill-switch). HTTP 503 SYSTEM_LOCKED 응답. recover 경로 /v1/admin/recover
- 상태 다이어그램: recover 경로 갱신
- 섹션 4.4: 엔드포인트 스펙 경로 변경
- 섹션 11.4: 미들웨어 체인 10단계 갱신

**37-rest-api-complete-spec.md:**
- 섹션 4.2: killSwitchGuard 허용 목록 4개, 503 SYSTEM_LOCKED 응답 예시 추가
- 에러 코드 테이블: SYSTEM_LOCKED 401 -> 503 변경
- 섹션 8.6: 엔드포인트 경로 /v1/owner/recover -> /v1/admin/recover
- 전체 엔드포인트 맵: #18 경로 갱신
- ownerAuth/dualAuth 참조: recover 경로 갱신

**52-auth-model-redesign.md:**
- 섹션 3.2: ownerAuth 적용 범위 경로 갱신
- authRouter 코드: DUAL_AUTH_PATHS, ROUTE_ACTION_MAP 경로 갱신
- 섹션 4.2: 엔드포인트 인증 맵 테이블 경로 갱신
- 섹션 4.3: dualAuth 그룹 경로 갱신
- 섹션 6: 보안 비다운그레이드 검증 테이블 경로 갱신
- 섹션 7.1: 미들웨어 체인 10단계 갱신
- 섹션 7.4: killSwitchGuard 허용 목록 4개 확정
- 섹션 7.5: 미들웨어 순서 변경 요약 v0.7 열 추가

## 결정 사항

| 결정 | 근거 | 영향 |
|------|------|------|
| globalRateLimit IP 1000/min + sessionRateLimit 세션 300/min 2단계 분리 | 미인증 공격자의 인증 사용자 rate limit 소진 방지 (DAEMON-03) | 미들웨어 9->10단계, config 키 변경 |
| killSwitchGuard 허용 목록 4개 (health, status, recover, kill-switch) | 모니터링 + 복구 + 상태 확인 최소 필요 엔드포인트 | 36, 37, 52 문서 통일 |
| HTTP 503 SYSTEM_LOCKED (기존 401) | Kill Switch는 인증 실패가 아닌 시스템 가용성 문제 | 에러 코드 HTTP 상태 변경 |
| recover 경로 /v1/admin/recover (기존 /v1/owner/recover) | Kill Switch 복구는 시스템 관리 작업, /v1/admin/ 네임스페이스 적절 | 5개 문서 경로 통일 |

## 크로스 문서 정합성

| 검증 항목 | 문서 | 결과 |
|-----------|------|------|
| 미들웨어 순서 10단계 | 29-api + 37-rest-api + 52-auth + 36-killswitch | 4개 문서 동일 |
| killSwitchGuard 허용 목록 4개 | 36-killswitch + 37-rest-api + 52-auth | 3개 문서 동일 |
| config 키 rate_limit_global_ip_rpm | 24-monorepo + 29-api | 2개 문서 동일 |
| recover 경로 /v1/admin/recover | 36 + 37 + 52 | 3개 문서 통일 |
| SYSTEM_LOCKED 503 | 36 + 37 | 2개 문서 동일 |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
