---
phase: 169-skills-package
plan: 02
subsystem: sdk
tags: [sdk, example, typescript, agent, tutorial]

requires:
  - phase: 169-01
    provides: "@waiaas/sdk 패키지 (npm publish 준비 완료)"
provides:
  - "examples/simple-agent/ SDK 예제 에이전트 (잔액 조회 -> 조건부 전송 -> 완료 대기)"
  - "README.md 설치/실행 안내 문서"
affects: [skills-package, documentation]

tech-stack:
  added: []
  patterns: ["examples/ 독립 프로젝트 (pnpm-workspace 외부, workspace:* 로컬 개발)"]

key-files:
  created:
    - examples/simple-agent/package.json
    - examples/simple-agent/tsconfig.json
    - examples/simple-agent/.env.example
    - examples/simple-agent/src/index.ts
    - examples/simple-agent/README.md
  modified: []

key-decisions:
  - "examples/는 pnpm-workspace.yaml에 포함하지 않음 -- 독립 프로젝트로 유지"
  - "workspace:* 참조로 모노레포 내 로컬 SDK 사용, 외부 사용자는 npm 버전으로 교체"
  - "toBaseUnits() 헬퍼로 잔액 문자열을 base unit BigInt로 변환 -- 안정적 비교"

patterns-established:
  - "examples/ 디렉토리 구조: package.json + tsconfig.json + .env.example + src/index.ts + README.md"
  - "Node.js 22 --env-file 플래그 사용 (dotenv 의존성 불필요)"

requirements-completed: [PKG-02]

duration: 4min
completed: 2026-02-17
---

# Phase 169 Plan 02: Simple Agent Example Summary

**@waiaas/sdk 기반 예제 에이전트: 잔액 조회 -> 조건부 전송 -> 트랜잭션 완료 대기 3단계 흐름 시연**

## Performance

- **Duration:** 4min
- **Started:** 2026-02-17T06:12:16Z
- **Completed:** 2026-02-17T06:16:55Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- examples/simple-agent/에 TypeScript 빌드 가능한 SDK 기반 예제 에이전트 생성
- 잔액 조회 -> 임계치 비교 -> 조건부 전송 -> 폴링 대기 3단계 워크플로우 구현
- README.md에 모노레포 내/외부 양쪽 사용법, 환경변수 테이블, SDK 메서드 레퍼런스 포함

## Task Commits

Each task was committed atomically:

1. **Task 1: examples/simple-agent 프로젝트 구조 + 에이전트 로직 구현** - `2573266` (feat)
2. **Task 2: README.md 작성 + 빌드 검증** - `64b7a9a` (docs)

## Files Created/Modified
- `examples/simple-agent/package.json` - 예제 프로젝트 정의 (@waiaas/sdk workspace 참조)
- `examples/simple-agent/tsconfig.json` - ES2022 + NodeNext 모듈 TypeScript 설정
- `examples/simple-agent/.env.example` - 5개 환경변수 템플릿
- `examples/simple-agent/src/index.ts` - 메인 에이전트 로직 (173줄, 3단계 워크플로우)
- `examples/simple-agent/README.md` - 설치/실행 안내 (113줄, 7개 섹션)

## Decisions Made
- examples/는 pnpm-workspace.yaml에 포함하지 않음 -- 독립 프로젝트로 유지하여 외부 사용자 경험과 동일하게 유지
- workspace:* 참조로 모노레포 내 로컬 SDK 사용, 외부 사용자는 npm 버전으로 교체 안내
- toBaseUnits() 헬퍼 함수로 소수점 잔액 문자열을 base unit BigInt로 변환 -- 복잡한 문자열 파싱 대신 안정적 비교

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] toBaseUnits() 헬퍼로 잔액 파싱 로직 교체**
- **Found during:** Task 1
- **Issue:** 초기 잔액 파싱 코드가 복잡한 문자열 조작(slice/padEnd/replace 체인)으로 취약
- **Fix:** 단순 toBaseUnits(amount, decimals) 헬퍼 함수로 교체
- **Files modified:** examples/simple-agent/src/index.ts
- **Verification:** TypeScript 타입 체크 성공
- **Committed in:** 2573266 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** 코드 안정성 향상. 범위 변경 없음.

## Issues Encountered
- examples/ 디렉토리가 pnpm-workspace 외부이므로 npm install이 workspace:* 프로토콜을 처리하지 못함. 타입 체크를 위해 SDK 패키지와 @types/node를 절대 심볼릭 링크로 연결하여 해결.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- examples/simple-agent/ 예제 에이전트 완성, Phase 169 (skills-package) 2개 플랜 모두 완료 예정
- 다음 Phase 170 진행 준비 완료

## Self-Check: PASSED

All 6 files exist. All 2 commits verified.

---
*Phase: 169-skills-package*
*Completed: 2026-02-17*
