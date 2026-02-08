---
phase: 29-api-integration-protocol
plan: 01
subsystem: api, desktop
tags: [tauri, cors, sqlite, sidecar, cli, idempotent]

# Dependency graph
requires:
  - phase: 27-daemon-security-foundation
    provides: Rate Limiter 2단계, killSwitchGuard, 미들웨어 10단계
  - phase: 28-dependency-build-resolution
    provides: SEA 크로스 컴파일, native addon 번들 전략
provides:
  - Sidecar 종료 35초 타임아웃 + 4단계 종료 플로우 (SIGKILL 포함)
  - SQLite integrity_check 비정상 종료 복구 로직
  - CORS 5종 Origin (tauri://localhost, http/https://tauri.localhost)
  - 개발 모드 Origin 로깅
  - Setup Wizard CLI 위임 구조 (waiaas init --json)
  - waiaas init idempotent 동작 스펙 (--json, --master-password)
affects:
  - 29-02 (Owner disconnect, Transaction status)
  - 29-03 (Python SDK, Zod export)
  - v1.0 구현 시 Tauri sidecar 종료 + init 구현

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sidecar 4단계 종료: HTTP shutdown -> 35초 대기 -> SIGTERM -> SIGKILL"
    - "SQLite integrity_check + WAL checkpoint 복구"
    - "CLI --json idempotent 패턴: 이미 존재하면 에러 없이 성공 반환"
    - "CORS 플랫폼별 Origin 대응 (macOS/Linux tauri://, Windows http/https://tauri.localhost)"

key-files:
  created: []
  modified:
    - ".planning/deliverables/39-tauri-desktop-architecture.md"
    - ".planning/deliverables/29-api-framework-design.md"
    - ".planning/deliverables/28-daemon-lifecycle-cli.md"
    - ".planning/deliverables/54-cli-flow-redesign.md"

key-decisions:
  - "Sidecar 종료 타임아웃 35초 = 데몬 30초 + 5초 마진"
  - "SIGKILL은 최후 수단: SIGTERM 5초 대기 후에만 실행"
  - "integrity_check는 비정상 종료 후에만 실행 (정상 시 생략)"
  - "CORS 5종 Origin: macOS/Linux + Windows 기본 + Windows HTTPS"
  - "waiaas init --json: idempotent (alreadyInitialized: true 반환)"
  - "--force와 idempotent 상호 배타적"
  - "--master-password 옵션: localhost Tauri sidecar 전용"

patterns-established:
  - "CLI --json idempotent: 이미 완료된 작업은 에러 없이 현재 상태 반환"
  - "SQLite 비정상 종료 복구: integrity_check -> WAL checkpoint -> 재검증"
  - "Setup Wizard CLI 위임: UI가 직접 초기화하지 않고 sidecar CLI를 호출"

# Metrics
duration: 7min
completed: 2026-02-08
---

# Phase 29 Plan 01: Tauri Sidecar 종료/CORS/init idempotent Summary

**Sidecar 종료 35초 타임아웃 + SQLite integrity_check 복구, CORS 5종 Origin, Setup Wizard CLI 위임 + waiaas init --json idempotent 스펙 확정**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-08T11:14:27Z
- **Completed:** 2026-02-08T11:21:28Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Tauri sidecar 종료 타임아웃을 5초에서 35초로 변경하고, 4단계 종료 플로우(HTTP shutdown -> 35초 대기 -> SIGTERM -> 5초 대기 -> SIGKILL)를 확정
- 비정상 종료 시 다음 데몬 시작에서 SQLite PRAGMA integrity_check -> WAL checkpoint 복구 로직 설계
- CORS 허용 목록을 3종에서 5종으로 확장하여 Windows WebView2 호환성 확보 (http/https://tauri.localhost 추가)
- 개발 모드 Origin 로깅으로 플랫폼별 CORS 디버깅 지원
- Setup Wizard가 CLI init을 sidecar로 호출하는 구조 확정 (waiaas init --json --master-password)
- waiaas init idempotent 동작 스펙: --json 모드에서 이미 초기화된 경우 에러 없이 성공 반환, --force와 상호 배타적

## Task Commits

Each task was committed atomically:

1. **Task 1: Tauri sidecar 종료 35초 + SQLite integrity_check + CORS 5종 Origin** - `d7c0503` (feat)
2. **Task 2: Setup Wizard CLI 위임 + waiaas init idempotent + --json 모드** - `6a87695` (feat)

## Files Created/Modified

- `.planning/deliverables/39-tauri-desktop-architecture.md` - Sidecar 종료 35초, integrity_check 복구, CORS 5종, Setup Wizard CLI 위임, init --json 스키마
- `.planning/deliverables/29-api-framework-design.md` - CORS 미들웨어 5종 Origin, 개발 모드 Origin 로깅
- `.planning/deliverables/28-daemon-lifecycle-cli.md` - waiaas init idempotent, --json, --master-password 옵션, 구현 수도코드
- `.planning/deliverables/54-cli-flow-redesign.md` - init 옵션 테이블 --json/--master-password 추가, idempotent 플로우차트/수도코드

## Decisions Made

| 결정 | 근거 |
|------|------|
| Sidecar 종료 타임아웃 35초 | 28번 문서 shutdown_timeout=30초 + 5초 마진 |
| SIGKILL은 SIGTERM 5초 대기 후 최후 수단 | OS 수준 graceful shutdown 기회 부여 |
| integrity_check는 비정상 종료 후에만 실행 | 정상 종료 시 불필요한 O(NlogN) 비용 방지 |
| CORS 5종 Origin 모두 포함 | macOS/Linux + Windows 기본 + Windows HTTPS. useHttpsScheme 설정 여부 무관하게 호환 |
| waiaas init --json: idempotent | Tauri Setup Wizard 재시도/재진입 안전성 |
| --force와 idempotent 상호 배타적 | --force는 삭제 후 재초기화, idempotent는 존재하면 skip |
| --master-password 옵션 추가 | Tauri sidecar 호출 시 stdin 프롬프트 불가. localhost 전용 |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- API-01 (Sidecar 종료 타임아웃), API-02 (CORS Origin), API-05 (Setup Wizard CLI 위임) 해소 완료
- Plan 29-02 (Owner disconnect cascade + Transaction status) 진행 가능
- Plan 29-03 (Python SDK snake_case + Zod export) 진행 가능

## Self-Check: PASSED

---
*Phase: 29-api-integration-protocol*
*Completed: 2026-02-08*
