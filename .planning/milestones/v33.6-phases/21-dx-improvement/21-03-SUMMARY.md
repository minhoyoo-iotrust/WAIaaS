---
phase: 21-dx-improvement
plan: 03
subsystem: api, auth, cli
tags: [masterAuth, ownerAuth, sessionAuth, hint, dev-mode, docker, telegram, cli-redesign]

# Dependency graph
requires:
  - phase: 21-01
    provides: 54-cli-flow-redesign.md (CLI 플로우 재설계 SSoT)
  - phase: 21-02
    provides: 55-dx-improvement-spec.md (DX 개선 스펙, hint 필드, MCP)
  - phase: 19-01
    provides: 52-auth-model-redesign.md (3-tier 인증 모델)
  - phase: 20-01
    provides: 53-session-renewal-protocol.md (세션 갱신 프로토콜)
provides:
  - 28-daemon-lifecycle-cli.md v0.5 CLI 변경 반영 (init 간소화, agent create, session create, --dev)
  - 37-rest-api-complete-spec.md 섹션 5-9 인증 맵 v0.5 전면 업데이트 + hint 필드
  - 40-telegram-bot-docker.md v0.5 인증 모델 참조 + Docker --dev 주의사항
affects: [21-04, v0.5-completion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "v0.5 인라인 마킹 패턴: 기존 구조 유지 + '(v0.5 변경/추가/제거)' 인라인 주석"
    - "hint backward-compatible 확장: z.string().optional()"
    - "masterAuth explicit/implicit 이중 모드 명시"

key-files:
  created: []
  modified:
    - .planning/deliverables/28-daemon-lifecycle-cli.md
    - .planning/deliverables/37-rest-api-complete-spec.md
    - .planning/deliverables/40-telegram-bot-docker.md

key-decisions:
  - "37-rest-api 에러 코드 테이블에 hint 열 추가 대신 위임 링크 채택 (테이블이 이미 넓어 55-dx-improvement-spec.md에 SSoT 위임)"
  - "40-telegram-bot 2-Tier 모델은 v0.5와 양립 (Tier 1 = masterAuth implicit API, Tier 2 = ownerAuth approve/recover)"
  - "Docker --dev 모드 별도 섹션 추가 (프로덕션 금지 + 테스트 예시 YAML 제공)"

patterns-established:
  - "중규모 문서 수정 패턴: 섹션 헤더에 v0.5 변경 요약 블록쿼트 + 개별 필드에 인라인 마킹"
  - "엔드포인트 맵 Auth 열 전면 업데이트: Auth (v0.5) 열명으로 버전 명시"

# Metrics
duration: 12min
completed: 2026-02-07
---

# Phase 21 Plan 03: 중규모 기존 문서 수정 Summary

**28/37/40 설계 문서 3개에 v0.5 인증 모델(masterAuth implicit/explicit, ownerAuth 2곳 한정) + hint 필드 + CLI 간소화 + Docker --dev 주의사항 반영**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-07T03:38:38Z
- **Completed:** 2026-02-07T03:51:23Z
- **Tasks:** 3/3
- **Files modified:** 3

## Accomplishments

- 28-daemon-lifecycle-cli.md에 v0.5 CLI 변경 5건 반영: init 간소화(4->2단계), agent create --owner 필수, session create/list/revoke 추가, start --dev 플래그, config.toml dev_mode 재로드 불가 명시
- 37-rest-api-complete-spec.md에 hint 필드 추가(ErrorResponseSchema backward-compatible 확장) + 섹션 5-9 전 엔드포인트 인증 v0.5 업데이트(19개 ownerAuth -> masterAuth implicit 전환, ownerAuth 2곳만 유지)
- 40-telegram-bot-docker.md에 3-tier 인증 참조 + Docker --dev 모드 주의사항 + 세션 갱신 참조 추가
- 37-rest-api 섹션 15 엔드포인트 맵 Auth 열 전면 재작성 (v0.5 인증 모델 반영)

## Task Commits

Each task was committed atomically:

1. **Task 1: 28-daemon-lifecycle-cli.md v0.5 CLI 변경 반영** - `d5cddc6` (feat)
2. **Task 2: 37-rest-api-complete-spec.md 섹션 5-9 업데이트 + hint 필드** - `5c55e6b` (feat)
3. **Task 3: 40-telegram-bot-docker.md v0.5 인증 모델 반영** - `00fddfe` (feat)

## Files Modified

- `.planning/deliverables/28-daemon-lifecycle-cli.md` -- v0.5 CLI 변경: init 간소화, agent create --owner, session commands, --dev flag, config.toml dev_mode
- `.planning/deliverables/37-rest-api-complete-spec.md` -- hint 필드 추가, 섹션 5-9 인증 업데이트, 엔드포인트 맵 v0.5 재작성
- `.planning/deliverables/40-telegram-bot-docker.md` -- 3-tier 인증 참조, 2-Tier 모델 v0.5 양립, Docker --dev 주의사항

## Decisions Made

1. **hint 열 위임 링크 채택**: 37-rest-api 에러 코드 테이블에 hint 열을 직접 추가하면 테이블이 과도하게 넓어짐. 대신 "hint 맵은 55-dx-improvement-spec.md 섹션 2.2 참조" 위임 링크 추가. 55 문서가 hint의 SSoT.
2. **2-Tier/3-tier 양립 설명**: 40-telegram-bot의 기존 2-Tier 모델(chatId vs ownerAuth)은 v0.5 3-tier 인증과 자연스럽게 양립: Tier 1 동작 = masterAuth(implicit) API, Tier 2 동작 = ownerAuth API(approve + recover). 기존 구조를 삭제하지 않고 양립 관계를 명시.
3. **Docker --dev 별도 섹션**: 기존 docker-compose 섹션에 인라인으로 추가하면 가독성이 떨어져 9.2 별도 서브섹션으로 독립. 프로덕션 금지 YAML + 테스트 허용 YAML 대비 예시 제공.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- 21-03 중규모 문서 수정 3건 완료
- 37-rest-api 섹션 5-9 위임 항목 해소 (19-03 결정 D2 완료)
- Phase 21 plan 3 of 4 complete. 21-04 (소규모 기존 문서 수정 + 참조 노트 + 통합 일관성 검증) 진행 준비 완료
- 잔여: 24, 29, 38, 39, 33, 36 소규모 수정 + v0.5 전체 11개 문서 일관성 최종 검증

## Self-Check: PASSED

---
*Phase: 21-dx-improvement*
*Completed: 2026-02-07*
