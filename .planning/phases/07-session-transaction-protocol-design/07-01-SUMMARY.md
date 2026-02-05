---
phase: 07-session-transaction-protocol-design
plan: 01
subsystem: auth
tags: [jwt, jose, siws, siwe, session, nonce, zod, hono-middleware]

# Dependency graph
requires:
  - phase: 06-core-architecture-design
    provides: "sessions 테이블 (CORE-02), sessionAuth 미들웨어 stub (CORE-06), config.toml [security] 섹션 (CORE-01)"
provides:
  - "세션 토큰 프로토콜 전체 설계 (SESS-PROTO)"
  - "JWT claims 구조 (HS256, jose v6.x, wai_sess_ 접두사)"
  - "SIWS/SIWE Owner 서명 검증 플로우 + owner-verifier 유틸리티"
  - "SessionConstraintsSchema Zod 스키마 (6 필드)"
  - "SessionUsageStatsSchema Zod 스키마 (3 필드)"
  - "sessionAuth 미들웨어 2단계 검증 로직"
  - "nonce 관리 (LRU 캐시, TTL 5분)"
  - "세션 수명주기 4단계 (발급/검증/폐기/만료)"
affects: [07-02, 07-03, 08-security-layers, 09-integration]

# Tech tracking
tech-stack:
  added: [jose v6.x, "@web3auth/sign-in-with-solana", siwe v3.x, tweetnacl, lru-cache]
  patterns: [JWT 하이브리드 인증 (HS256 + DB 폐기 확인), SIWS/SIWE 지갑 서명 인가, usageStats 원자적 갱신 (BEGIN IMMEDIATE)]

key-files:
  created: [".planning/deliverables/30-session-token-protocol.md"]
  modified: []

key-decisions:
  - "JWT claims에 제약 조건 미포함 -- DB에서 조회 (변경 가능성 + JWT 크기 절약)"
  - "nonce 저장소: 인메모리 LRU 캐시 (lru-cache, max 1000, TTL 5분) -- DB 부하 불필요"
  - "토큰 포맷: wai_sess_ 접두사 + JWT (~270 bytes)"
  - "JWT Secret: config.toml [security] 평문 저장 (파일 권한 600), 키스토어 마스터 패스워드와 분리"
  - "세션 만료 범위: 최소 300초(5분) ~ 최대 604800초(7일), 기본 86400초(24시간)"
  - "만료 세션 정리: DELETE 방식 (SET NULL FK로 거래 기록 유지)"
  - "폐기 세션 보관: 24시간 후 DELETE (감사 추적 기간)"
  - "nonce 에러 응답 통일: INVALID_NONCE만 반환 (상태 정보 비노출)"

patterns-established:
  - "2단계 세션 검증: Stage 1 (JWT 서명/만료, DB 불필요) -> Stage 2 (DB lookup, 폐기/제약 확인)"
  - "owner-verifier 유틸리티: verifySIWS/verifySIWE 함수를 세션 생성 핸들러 + Phase 8 ownerAuth 재사용"
  - "usageStats 원자적 갱신: better-sqlite3 transaction().immediate() + Read-Modify-Write"
  - "토큰 해싱: SHA-256(원본 토큰) -> DB 저장, 원본 미저장"

# Metrics
duration: 6min
completed: 2026-02-05
---

# Phase 7 Plan 01: Session Token Protocol Summary

**JWT HS256 세션 토큰(jose v6.x) + SIWS/SIWE Owner 서명 인가 + 세션 제약/사용 통계 모델 + sessionAuth 2단계 미들웨어를 구현 가능 수준으로 설계**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-05T10:26:25Z
- **Completed:** 2026-02-05T10:32:50Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- JWT claims 구조 완전 정의 (iss/exp/iat/jti/sid/aid) + wai_sess_ 접두사 토큰 포맷
- SIWS(Solana) + SIWE(Ethereum) Owner 서명 검증 플로우를 시퀀스 다이어그램 + 코드 패턴으로 설계
- SessionConstraintsSchema (6필드) + SessionUsageStatsSchema (3필드) Zod 스키마 확정
- sessionAuth 미들웨어 2단계 검증 로직(jose jwtVerify -> DB lookup) 코드 수준 설계
- 세션 수명주기 4단계(발급/검증/폐기/만료) 시퀀스 다이어그램 완성
- nonce 관리: LRU 캐시 기반, TTL 5분, 검증+삭제 일회성 패턴
- CORE-02 sessions 테이블의 constraints/usage_stats JSON 구조 확정
- CORE-06 sessionAuth 미들웨어 stub을 2단계 검증으로 완성

## Task Commits

Each task was committed atomically:

1. **Task 1: JWT 토큰 구조 + SIWS/SIWE 검증 플로우 + nonce 관리 설계** - `4a38d6a` (feat)
2. **Task 2: 세션 제약 모델 + 수명주기 + sessionAuth 미들웨어 설계** - `7b3f881` (feat)

## Files Created/Modified

- `.planning/deliverables/30-session-token-protocol.md` - 세션 토큰 프로토콜 전체 설계 (9개 섹션, ~1500 lines)

## Decisions Made

1. **JWT claims에 제약 조건 미포함** -- constraints는 Owner가 동적 변경 가능해야 하므로 DB에서 조회. JWT에는 sid/aid만 포함하여 크기 절약 (~270 bytes).
2. **nonce 저장소: 인메모리 LRU 캐시** -- 단기 일회성 데이터이므로 DB 부하 불필요. 데몬 재시작 시 소멸해도 클라이언트가 새 nonce 재요청하면 해결.
3. **JWT Secret: config.toml 평문 저장** -- 키스토어 잠금 해제 없이도 세션 검증이 가능해야 하므로 마스터 패스워드와 분리. 파일 권한 600으로 보호.
4. **nonce 에러 응답 통일** -- INVALID_NONCE와 NONCE_ALREADY_USED를 구분하지 않고 INVALID_NONCE만 반환. 공격자에게 상태 정보 비노출.
5. **만료 세션 DELETE 방식** -- sessions -> transactions FK가 SET NULL이므로 안전. 폐기 세션은 24시간 보관 후 삭제.
6. **POST /v1/sessions는 sessionAuth 제외** -- Owner 서명(요청 본문)으로 인증하므로 세션 토큰 불필요. sessionAuth가 아닌 핸들러 내에서 직접 검증.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 세션 토큰 프로토콜이 완성되어 07-02 (트랜잭션 처리 파이프라인) 설계 준비 완료
- sessionAuth 미들웨어가 설계되어 07-03 (Solana 어댑터 상세)의 파이프라인 Stage 2에서 활용 가능
- Phase 8의 ownerAuth 미들웨어가 owner-verifier 유틸리티를 재사용할 수 있는 구조 확보
- Kill Switch의 세션 일괄 폐기가 revokedAt 필드로 구현 가능한 구조 확보

---
*Phase: 07-session-transaction-protocol-design*
*Completed: 2026-02-05*
