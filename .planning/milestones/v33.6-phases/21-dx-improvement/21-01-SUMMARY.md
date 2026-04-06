---
phase: 21-dx-improvement
plan: 01
subsystem: cli
tags: [cli, dx, init, quickstart, dev-mode, agent-create, session-create]

# Dependency graph
requires:
  - phase: 19-auth-owner-redesign
    provides: masterAuth/ownerAuth/sessionAuth 3-tier 인증 모델, agents.owner_address NOT NULL
  - phase: 20-session-renewal-protocol
    provides: 세션 갱신 API, SessionConstraints 확장
provides:
  - 54-cli-flow-redesign.md -- CLI 플로우 재설계 SSoT 문서 (DX-01~05)
  - waiaas init 2단계 간소화 (v0.2 4단계 -> v0.5 2단계)
  - waiaas agent create --owner 커맨드 정의 (Owner 주소 필수, 서명 불필요)
  - waiaas session create 커맨드 정의 (masterAuth implicit, 3가지 출력 포맷)
  - --quickstart 4단계 오케스트레이션 (init->start->agent->session)
  - --dev 모드 (고정 패스워드 "waiaas-dev" + 3종 보안 경고)
  - CLI 커맨드 전체 요약표 (v0.5, 17개 커맨드, 인증 수준별 분류)
  - v0.2->v0.5 마이그레이션 가이드
affects:
  - 21-02 (28-daemon-lifecycle-cli.md v0.5 반영 -- 이 문서가 섹션 6 대체)
  - 21-03 (37-rest-api, 29-api-framework 문서 수정 시 CLI 변경 참조)
  - 21-04 (통합 일관성 검증 시 54 문서 포함)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "관심사 분리: init은 순수 인프라, agent create는 에이전트+Owner, session create는 토큰 발급"
    - "오케스트레이션 패턴: --quickstart로 4개 독립 커맨드를 단일 커맨드로 통합"
    - "3종 보안 경고: 배너 + 응답 헤더 + 감사 로그 (dev 모드 감지 다중 방어)"
    - "패스워드 자동 생성: randomBytes(24).toString('base64url'), 파일 저장 mode 0o600"

key-files:
  created:
    - .planning/deliverables/54-cli-flow-redesign.md
  modified: []

key-decisions:
  - "init에서 에이전트 생성/알림 설정/Owner 등록을 제거하여 순수 인프라 초기화로 한정"
  - "--owner 플래그는 agent create의 필수 옵션 (agents.owner_address NOT NULL 정책 반영)"
  - "session create는 masterAuth(implicit)만으로 동작 (ownerAuth 서명 제거)"
  - "--quickstart의 패스워드 자동 생성은 파일 저장(~/.waiaas/.master-password, mode 0o600)"
  - "--dev 고정 패스워드는 'waiaas-dev' (하드코딩, 공개적으로 알려진 값)"
  - "--dev + --expose 조합 금지 (고정 패스워드로 외부 노출 시 보안 취약)"
  - "config.toml [daemon].dev_mode 영구 설정 지원 (boolean, 기본 false)"
  - "28-daemon-lifecycle-cli.md 섹션 6을 이 문서가 대체 (충돌 시 54 우선)"

patterns-established:
  - "CLI 커맨드의 인증 수준을 52-auth-model-redesign.md 3-tier와 일관되게 매핑"
  - "출력 포맷 3종(token/json/env): token은 파이프용, json은 상세, env는 eval용"

# Metrics
duration: 7min
completed: 2026-02-07
---

# Phase 21 Plan 01: CLI 플로우 재설계 Summary

**CLI 플로우 재설계 SSoT(54-cli-flow-redesign.md) 신규 작성: init 2단계 간소화(DX-01) + agent create --owner(DX-02) + session create masterAuth(DX-03) + --quickstart 4단계 오케스트레이션(DX-04) + --dev 고정 패스워드 + 3종 보안 경고(DX-05), v0.5 CLI 17개 커맨드 전체 요약표 + v0.2 마이그레이션 가이드**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-07T03:27:13Z
- **Completed:** 2026-02-07T03:33:51Z
- **Tasks:** 2
- **Files created:** 1

## Accomplishments

- 54-cli-flow-redesign.md 신규 작성 (9개 섹션, ~1320줄): v0.5 CLI 플로우의 SSoT 문서
- waiaas init 2단계 간소화: 마스터 패스워드 설정 + 인프라 초기화만 수행, 에이전트/Owner/알림 제거
- waiaas agent create --owner 정의: Owner 주소 필수(NOT NULL), SIWS/SIWE 서명 불필요, masterAuth(implicit)
- waiaas session create 정의: 3가지 출력 포맷(token/json/env), masterAuth(implicit), 셸 파이프 호환
- --quickstart 4단계 오케스트레이션: init->start->agent->session, 에러 롤백 전략, 패스워드 자동 생성
- --dev 모드: 고정 패스워드 "waiaas-dev", 3종 보안 경고(배너/헤더/감사로그), --expose 조합 금지
- CLI 커맨드 전체 요약표: 17개 커맨드, 4개 인증 수준별 분류, v0.5 변경 유형 표기
- v0.2->v0.5 마이그레이션 가이드: 기존/신규 사용자 절차, DB 마이그레이션 안내, 삭제 항목 정리

## Task Commits

Each task was committed atomically:

1. **Task 1: 섹션 1~5 (init, agent create, session create, CLI 요약표)** - `d8e4564` (feat)
2. **Task 2: 섹션 6~9 (--quickstart, --dev, 마이그레이션, 요구사항 매핑)** - `ecc78f2` (feat)

## Files Created/Modified

- `.planning/deliverables/54-cli-flow-redesign.md` - CLI 플로우 재설계 SSoT (9개 섹션, DX-01~05 충족)

## Decisions Made

1. **init 순수 인프라 한정**: 에이전트/Owner/알림을 init에서 제거. agents.owner_address NOT NULL이므로 init 시점에 에이전트 생성 불가 (Owner 주소 미확정 가능).
2. **--owner 필수 옵션**: agent create에서 Owner 주소를 서명 없이 문자열로 전달. Self-Hosted 단일 운영자 환경에서 소유권 증명 불필요.
3. **session create masterAuth**: ownerAuth에서 masterAuth(implicit)로 변경. 보안은 세션 제약(constraints) + 정책 엔진이 담당.
4. **패스워드 자동 생성 -> 파일 저장**: randomBytes(24) base64url로 32자 생성, ~/.waiaas/.master-password mode 0o600. 터미널 히스토리 미노출.
5. **--dev 고정값 "waiaas-dev"**: 하드코딩된 공개 패스워드. --expose 조합 시 즉시 에러 반환.
6. **config.toml dev_mode**: CLI --dev 플래그 외에 영구 설정 지원. 우선순위: --dev > config.toml > false.
7. **28 문서 대체**: 이 문서가 28-daemon-lifecycle-cli.md 섹션 6(CLI 커맨드)을 대체. 섹션 1~5(데몬 아키텍처)는 유효 유지.
8. **요약표에 owner 서브커맨드 추가**: approve/reject/recover 3개 커맨드를 CLI에서 직접 실행 가능하게 정의.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 21-02-PLAN.md (기존 문서 중규모 수정: 28, 29/37, 40) 실행 준비 완료
- 54-cli-flow-redesign.md가 SSoT로서 28-daemon-lifecycle-cli.md 섹션 6 대체 근거 확보
- CLI 커맨드 전체 요약표가 21-03/21-04 통합 검증 시 참조 가능

## Self-Check: PASSED

---
*Phase: 21-dx-improvement*
*Completed: 2026-02-07*
