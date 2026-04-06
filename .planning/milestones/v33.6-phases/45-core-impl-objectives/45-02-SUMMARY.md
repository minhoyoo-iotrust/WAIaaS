---
phase: 45-core-impl-objectives
plan: 02
subsystem: docs
tags: [objective, sdk, mcp, typescript, python, notification, token, evm, solana, contract, approve, batch]

# Dependency graph
requires:
  - phase: 45-01
    provides: v1.1/v1.2 objective 문서 (동일 패턴)
provides:
  - v1.3 SDK + MCP + 알림 objective 문서 (27개 E2E 시나리오)
  - v1.4 토큰 + 컨트랙트 확장 objective 문서 (35개 E2E 시나리오)
affects: [46-auth-impl, 47-release-prep, v1.3-implementation, v1.4-implementation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "objective 문서 부록 구조: 목표/구현 대상 설계 문서/산출물/기술 결정/E2E 검증/의존/리스크"
    - "E2E 검증 시나리오 자동화 수준 태그: [L0]/[L1]/[HUMAN]"
    - "v0.10 설계 결정 참조 반영: CONC-01/ERRH-02/OPER-02/ERRH-03/PLCY-01"

key-files:
  created:
    - objectives/v1.3-sdk-mcp-notifications.md
    - objectives/v1.4-token-contract-extension.md
  modified: []

key-decisions:
  - "v1.3: MCP SessionManager eager 초기화 (서버 시작 시 즉시 토큰 로드 + 타이머 등록)"
  - "v1.3: TypeScript SDK ESM-only (Node.js 22 기준 CJS 불필요)"
  - "v1.3: Python SDK hatch 빌드 (PEP 517 표준)"
  - "v1.4: EVM 테스트 노드 Anvil (Foundry) 선택 (viem 친화적)"
  - "v1.4: CONTRACT_WHITELIST DB 저장 (config.toml 아님, 에이전트별 독립 정책)"
  - "v1.4: batch_items 테이블 정규화 (JSON -> 별도 테이블, v0.10 OPER-02)"

patterns-established:
  - "objective 문서에 v1.1/v1.2 이미 구현된 부분과 해당 마일스톤 신규 추가분을 명시적 구분"
  - "Stage 5 완전 의사코드 기반 E2E 시나리오 작성 패턴 (TRANSIENT/PERMANENT/STALE 각 분기 테스트)"

# Metrics
duration: 6min
completed: 2026-02-09
---

# Phase 45 Plan 02: v1.3/v1.4 objective 문서 Summary

**v1.3 SDK/MCP/알림 + v1.4 토큰/컨트랙트/EVM 확장 objective 문서 2개 생성, 총 62개 E2E 검증 시나리오 + 17개 기술 결정**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-09T13:30:35Z
- **Completed:** 2026-02-09T13:36:58Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- v1.3 objective 문서: 4개 설계 문서(35, 37, 38, 55) + v0.9 SessionManager 구현 범위 + 27개 E2E 시나리오 + 9개 기술 결정
- v1.4 objective 문서: 7개 설계 문서(56, 57, 58, 59, 60, 36, 27) + v0.10 설계 결정 5건 반영 + 35개 E2E 시나리오 + 8개 기술 결정
- 두 문서 모두 부록 구조(7개 섹션) 완전 준수, 산출물 파일/모듈 구조 상세 기술

## Task Commits

Each task was committed atomically:

1. **Task 1: v1.3 SDK + MCP + 알림 objective 문서 생성** - `0427752` (docs)
2. **Task 2: v1.4 토큰 + 컨트랙트 확장 objective 문서 생성** - `4c4d0ad` (docs)

## Files Created/Modified
- `objectives/v1.3-sdk-mcp-notifications.md` - v1.3 마일스톤 objective (TS/Python SDK, MCP 6도구+3리소스, 알림 3채널, REST API 38EP 완성)
- `objectives/v1.4-token-contract-extension.md` - v1.4 마일스톤 objective (SPL/ERC-20, 컨트랙트, Approve, 배치, EVM 어댑터, IChainAdapter 20 메서드)

## Decisions Made
- v1.3: MCP SessionManager eager 초기화 결정 (lazy 대비 첫 tool 호출 전 갱신 체계 보장)
- v1.3: TypeScript SDK ESM-only 발행 (AI 에이전트 프레임워크 대부분 ESM)
- v1.3: Python SDK hatch 빌드 도구 선택 (PEP 517 표준 준수)
- v1.3: 알림 채널 native fetch 전용 (외부 Bot 프레임워크 미사용)
- v1.4: EVM 테스트 노드 Anvil 선택 (Hardhat 대비 빠른 기동, viem 친화)
- v1.4: CONTRACT_WHITELIST DB policies 테이블 저장 (에이전트별 독립 정책)
- v1.4: EVM gas 추정 viem estimateGas + 1.2x 배수 적용

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- v1.3/v1.4 objective 문서 완성으로 Phase 45 plan 02 완료
- v1.1~v1.4 objective 문서 4개 완성 (45-01에서 v1.1/v1.2, 45-02에서 v1.3/v1.4)
- 남은 objective 문서: v1.5, v1.6, v1.7, v2.0 (Phase 46-47에서 생성 예정)
- 차단 요소 없음

## Self-Check: PASSED

---
*Phase: 45-core-impl-objectives*
*Completed: 2026-02-09*
