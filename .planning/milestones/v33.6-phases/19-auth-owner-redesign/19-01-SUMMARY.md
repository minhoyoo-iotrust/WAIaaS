---
phase: 19-auth-owner-redesign
plan: 01
subsystem: auth
tags: [masterAuth, ownerAuth, sessionAuth, SIWS, SIWE, Argon2id, middleware, endpoint-mapping]

# Dependency graph
requires:
  - phase: 09-integration-client
    provides: 31-endpoint REST API spec (37-rest-api-complete-spec.md), ownerAuth middleware (34-owner-wallet-connection.md)
  - phase: 06-core-architecture
    provides: Hono middleware chain (29-api-framework-design.md), session protocol (30-session-token-protocol.md)
  - phase: 08-security-layers
    provides: Kill Switch dual-auth recovery (36-killswitch-autostop-evm.md)
provides:
  - "3-tier 인증 모델 정의 (masterAuth/ownerAuth/sessionAuth)"
  - "31 엔드포인트 인증 맵 재배치 (ownerAuth 2곳 한정)"
  - "보안 비다운그레이드 검증표"
  - "CLI 수동 서명 4단계 플로우"
  - "authRouter 통합 디스패처 미들웨어 설계"
affects:
  - 19-02 (Owner 주소 에이전트 귀속 -- agents.owner_address 검증 로직)
  - 19-03 (기존 설계 문서 반영 -- 34, 37 문서 업데이트)
  - Phase 20 (세션 갱신 -- sessionAuth 정의 확정에 의존)
  - Phase 21 (DX 개선 -- masterAuth 기반 CLI 플로우)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "authRouter 통합 디스패처 (경로 기반 인증 미들웨어 선택)"
    - "implicit/explicit masterAuth 이중 모드"
    - "dualAuth (ownerAuth + masterAuth explicit) 복합 인증"

key-files:
  created:
    - ".planning/deliverables/52-auth-model-redesign.md"
  modified: []

key-decisions:
  - "masterAuth 암묵적/명시적 이중 모드: 데몬 구동=인증 완료(implicit), X-Master-Password 헤더(explicit, Admin API + KS 복구)"
  - "ownerAuth 정확히 2곳: POST /v1/owner/approve/:txId (거래 승인), POST /v1/owner/recover (KS 복구 dual-auth)"
  - "OwnerSignaturePayload action enum 7개에서 2개로 축소 (approve_tx, recover)"
  - "ownerAuth Step 5를 agents.owner_address 대조로 변경 (owner_wallets.address 대신)"
  - "APPROVAL 타임아웃 설정 가능: min 300s, max 86400s, default 3600s"
  - "authRouter 단일 디스패처로 기존 3개 인증 미들웨어 통합"
  - "16개 다운그레이드 엔드포인트 모두 보상 통제(compensating control) 존재"
  - "CLI 수동 서명 4단계 플로우: nonce 발급 -> 메시지 구성 -> 오프라인 서명 -> API 호출"

patterns-established:
  - "자금 영향 기준(Fund Impact Criterion): 자금 이동/동결 해제 = ownerAuth, 보호적 행위/시스템 관리 = masterAuth"
  - "보안 비다운그레이드 검증 패턴: Change + Fund Impact + Verdict + Compensating Control"

# Metrics
duration: 5min
completed: 2026-02-07
---

# Phase 19 Plan 01: 3-tier 인증 모델 재설계 Summary

**masterAuth(implicit/explicit)/ownerAuth(2곳)/sessionAuth 3-tier 재분리, 31-endpoint 인증 맵 재배치, 16-downgrade 보상 통제 검증, CLI 수동 서명 4단계 플로우**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-06T16:41:40Z
- **Completed:** 2026-02-06T16:47:17Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- masterAuth/ownerAuth/sessionAuth 3-tier 인증 모델을 대상/방법/적용 범위로 명확히 분리 정의
- 31개 REST API 엔드포인트의 v0.5 인증 맵을 완성하고, ownerAuth를 정확히 2곳(거래 승인, KS 복구)으로 한정
- v0.2 vs v0.5 보안 비다운그레이드 검증표 작성: 16개 다운그레이드 항목 모두 보상 통제 존재 확인
- WalletConnect 없이 CLI 수동 서명으로 모든 ownerAuth 기능이 동작하는 4단계 플로우 정의
- authRouter 통합 디스패처를 통한 미들웨어 아키텍처 업데이트 설계

## Task Commits

Each task was committed atomically:

1. **Task 1: 3-tier 인증 모델 정의 + 31 엔드포인트 인증 맵 작성** - `8bc39b2` (feat)

## Files Created/Modified

- `.planning/deliverables/52-auth-model-redesign.md` - 3-tier 인증 모델 재설계 전체 스펙 (987줄, 8개 섹션)

## Decisions Made

1. **masterAuth 이중 모드 채택**: 암묵적(데몬 구동=인증)과 명시적(X-Master-Password 헤더)을 분리. 대부분의 시스템 관리는 암묵적, Admin API와 KS 복구만 명시적. 근거: DX 향상 + localhost 바인딩 보안.
2. **ownerAuth 2곳 한정 결정**: approve_tx와 recover만. reject_tx, kill_switch는 보호적 행위이므로 masterAuth. 근거: 자금 영향 기준(Fund Impact Criterion).
3. **OwnerSignaturePayload action enum 축소**: 7개에서 2개(approve_tx, recover)로. ownerAuth 적용 범위 축소와 일관.
4. **authRouter 단일 디스패처 도입**: 기존 라우트별 sessionAuth/ownerAuth/masterAuth 개별 적용을 경로 기반 통합 디스패처로 변경. 인증 로직의 중앙 관리.
5. **APPROVAL 타임아웃 설정화**: 기존 1시간 고정에서 300s~86400s 범위로 설정 가능. config.toml [security].approval_timeout.
6. **감사 추적 트레이드오프 수용**: masterAuth 전환으로 actor='master' 기록 (개인 식별 불가). Self-Hosted 단일 운영자 환경에서 의도적 수용.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 3-tier 인증 모델 정의 완료 -> 19-02(Owner 주소 에이전트 귀속)에서 agents.owner_address 스키마 변경 가능
- 31 엔드포인트 인증 맵 완료 -> 19-03(기존 설계 문서 반영)에서 37-rest-api-complete-spec.md 업데이트 가능
- ownerAuth Step 5 변경 정의 완료 -> 19-03에서 34-owner-wallet-connection.md 업데이트 가능
- 차단 요소 없음

## Self-Check: PASSED

---
*Phase: 19-auth-owner-redesign*
*Completed: 2026-02-07*
