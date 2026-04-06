---
phase: 18-배포-타겟별-테스트
plan: 01
subsystem: testing
tags: [platform-test, cli, docker, tauri, telegram-bot, child_process, jest, mock]

# Dependency graph
requires:
  - phase: 14-테스트-기반-정의
    provides: Platform 테스트 레벨 정의 (TLVL-01), Mock 경계 (MOCK-ALL-LEVELS-NOTIFICATION)
  - phase: 17-cicd-pipeline-design
    provides: release.yml Stage 4 platform-cli/platform-docker job 골격
provides:
  - 4개 배포 타겟(CLI/Docker/Tauri/Telegram) 테스트 범위 및 검증 방법 설계
  - 118건 테스트 시나리오 (자동화 90건 + 수동 QA 28건)
  - Phase 17 release.yml platform job 확장 포인트 상세
  - Phase 14/17 결정 10건 정합성 검증
affects: [v0.5-implementation, platform-test-code, release-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "child_process.spawn 기반 CLI Platform 테스트 패턴"
    - "Docker CLI 기반 컨테이너 빌드/실행/검증 패턴"
    - "jest.fn() + global.fetch mock 기반 Telegram Bot 테스트 패턴"
    - "Tauri 자동화/수동 QA 분리 패턴"

key-files:
  created:
    - docs/v0.4/51-platform-test-scope.md
  modified: []

key-decisions:
  - "PLAT-TGBOT-SPLIT: Telegram Bot 명령어/콜백은 Integration(매PR), Long Polling 루프만 Platform(릴리스)으로 분리"
  - "PLAT-TAURI-OPTIONAL: Tauri CI 빌드는 선택적 Stage 4 job (빌드 시간 ~30min/platform 제약)"
  - "PLAT-118-SCENARIOS: 4타겟 총 118건 시나리오 확정 (CLI 32 + Docker 18 + Tauri 34 + Telegram 34)"

patterns-established:
  - "CLI Platform 테스트: mkdtempSync + 고유 포트 + child_process.spawn + exit code 검증"
  - "Docker Platform 테스트: docker build/run/stop + healthcheck 폴링 + docker exec 검증 + 강제 teardown"
  - "Telegram Bot Mock: jest.fn() global.fetch 교체 + 서비스 DI Mock + processUpdates 단위 메서드"
  - "수동 QA 체크리스트 포맷: [검증 단계] + [기대 결과] + [PASS/FAIL 체크박스]"

# Metrics
duration: 7min
completed: 2026-02-06
---

# Phase 18 Plan 01: 배포 타겟별 테스트 범위 설계 Summary

**4개 배포 타겟(CLI 32건, Docker 18건, Tauri 6+28건, Telegram 34건) 총 118건 시나리오 확정 + Phase 17 CI/CD Stage 4 통합 매핑 + 정합성 검증 10건**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-06T14:56:37Z
- **Completed:** 2026-02-06T15:04:01Z
- **Tasks:** 2
- **Files created:** 1

## Accomplishments

- PLAT-01: CLI Daemon 32건 시나리오 (init/start/stop/status/signal/windows/exit codes) + child_process.spawn 검증 패턴
- PLAT-02: Docker 18건 시나리오 (빌드/compose/named volume/환경변수/hostname/grace period/Secrets/healthcheck/non-root/auto-init)
- PLAT-03: Tauri Desktop 자동화 6건 + 수동 QA 28건 (빌드/SEA/IPC + Setup Wizard 5단계/트레이 3색/WalletConnect QR/8화면/크래시 복구/OS 알림/크로스 플랫폼)
- PLAT-04: Telegram Bot 34건 시나리오 (Long Polling/8명령어/5콜백/2-Tier 인증/MarkdownV2/callback_data/직접 승인/Graceful shutdown)
- Phase 14/17 결정 10건 정합성 검증 완료, 불일치 2건 해결 방안 명시
- Anti-pattern 4건 + Pitfall 6건 명시
- v0.4 테스트 전략 전체 완결 선언 (Phase 14~18, 설계 문서 11건, 시나리오 ~300건 이상)

## Task Commits

Each task was committed atomically:

1. **Task 1: 4개 배포 타겟별 테스트 시나리오 및 검증 방법 설계** - `e8a6158` (feat)
2. **Task 2: CI/CD 통합 매핑 + 정합성 검증표 + 요약 테이블** - Task 1에 포함 (문서를 단일 완결 단위로 작성)

## Files Created/Modified

- `docs/v0.4/51-platform-test-scope.md` - 4개 배포 타겟별 테스트 범위/시나리오/검증 방법/자동화 한계 설계 문서 (833줄)

## Decisions Made

1. **PLAT-TGBOT-SPLIT:** Telegram Bot은 daemon 패키지 내부 서비스이므로, 명령어/콜백 핸들러는 Integration(매 PR)으로, Long Polling 루프 + Docker 통합만 Platform(릴리스)으로 분류
2. **PLAT-TAURI-OPTIONAL:** Tauri CI 빌드는 선택적 Stage 4 job으로 정의. macOS/Windows/Linux 3종 빌드가 각 ~30min 소요되므로 필수가 아닌 선택
3. **PLAT-118-SCENARIOS:** CLI 32 + Docker 18 + Tauri 34(자동 6+수동 28) + Telegram 34 = 총 118건 시나리오 확정

## Deviations from Plan

### Task 2 병합

Task 2(CI/CD 통합 매핑 + 정합성 검증표 + 요약 테이블)의 내용을 Task 1에서 문서를 생성할 때 함께 작성하여 단일 완결 문서로 산출했다. 이는 문서의 논리적 일관성을 위한 것이며, 별도 커밋은 생성하지 않았다.

**Total deviations:** 0 auto-fixed (Task 병합은 구조적 선택)
**Impact on plan:** 산출물은 동일하며, 커밋이 1건으로 통합됨

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- v0.4 테스트 전략 수립 완결: Phase 14~18 전체를 통해 6개 테스트 레벨, 9모듈 매트릭스, 보안 71건, 블록체인 21건, 플랫폼 118건 시나리오가 확정됨
- 구현 단계(v0.5)에서 이 문서들을 참조하여 테스트 코드 작성 가능
- 차단 요소 없음

## Self-Check: PASSED

---
*Phase: 18-배포-타겟별-테스트*
*Completed: 2026-02-06*
