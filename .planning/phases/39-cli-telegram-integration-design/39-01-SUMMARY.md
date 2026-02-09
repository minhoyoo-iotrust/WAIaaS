---
phase: 39-cli-telegram-integration-design
plan: 01
subsystem: cli
tags: [cli, mcp, session, token-file, claude-desktop]
requires:
  - phase: 36
    provides: "토큰 파일 유틸리티 (writeMcpToken, readMcpToken, getMcpTokenPath)"
  - phase: 37
    provides: "SessionManager 인터페이스 (jose decodeJwt 패턴)"
provides:
  - "CLI mcp setup 커맨드 설계 (7단계 플로우)"
  - "CLI mcp refresh-token 커맨드 설계 (8단계 플로우)"
  - "Claude Desktop config.json 플랫폼별 안내"
affects: [phase-40-test-design, implementation-v1.3]
tech-stack:
  added: []
  patterns: ["CLI mcp subcommand group pattern"]
key-files:
  created: []
  modified: [".planning/deliverables/54-cli-flow-redesign.md", "objectives/v0.9-session-management-automation.md"]
key-decisions:
  - id: CLI-01
    summary: "mcp 서브커맨드 그룹 (setup + refresh-token) 진입점 패턴"
  - id: CLI-02
    summary: "mcp setup 7단계 동작 플로우"
  - id: CLI-03
    summary: "mcp refresh-token 8단계 동작 플로우 (생성->파일->폐기, Pitfall 5)"
  - id: CLI-04
    summary: "에이전트 자동 선택 (1개면 자동, 0개 에러, 2개+ 필수)"
  - id: CLI-05
    summary: "Claude Desktop config.json 플랫폼별 경로 안내"
  - id: CLI-06
    summary: "constraints 계승 규칙 (기존 세션 constraints 전달, renewalCount 리셋)"
duration: 5min
completed: 2026-02-09
---

# Phase 39 Plan 01: CLI MCP 서브커맨드 설계 Summary

CLI `waiaas mcp setup` 및 `waiaas mcp refresh-token` 두 커맨드의 인터페이스(parseArgs 옵션), 동작 플로우(7/8단계), 출력 포맷(text/json), 에러 케이스를 54-cli-flow-redesign.md 섹션 10에 구현 가능한 수준으로 설계 완료.

## Performance

| Metric | Value |
|--------|-------|
| Duration | 5min |
| Tasks | 2/2 |
| Deviations | 0 |
| Decisions | 6 (CLI-01 ~ CLI-06) |

## Accomplishments

### Task 1: 54-cli-flow-redesign.md에 mcp 서브커맨드 그룹 설계 섹션 추가

**Commit:** `fb314a7`

54-cli-flow-redesign.md에 섹션 10 "[v0.9] MCP 서브커맨드 그룹" 신규 추가:

- **섹션 10.1:** 설계 원칙, Phase 36/37 유틸리티 의존 관계 명시
- **섹션 10.2:** `waiaas mcp setup` (CLIP-01)
  - 커맨드 인터페이스: `--agent`, `--expires-in`, `--max-amount`, `--allowed-ops`, `--data-dir`, `--output`
  - 7단계 동작 플로우: 데몬확인 -> 에이전트결정 -> constraints -> 세션생성 -> 파일저장 -> 출력 -> config안내
  - resolveAgentId 에이전트 자동 선택 로직 (1개=자동, 0개=에러, 2개+=필수)
  - resolveDefaultConstraints (CLI 옵션 > config.toml > 하드코딩)
  - Claude Desktop config.json 플랫폼별 경로 (macOS/Windows/Linux)
  - 텍스트/JSON 출력 예시, 에러 케이스 테이블 5건
- **섹션 10.3:** `waiaas mcp refresh-token` (CLIP-02)
  - 8단계 동작 플로우: 데몬확인 -> 토큰로드 -> sessionId추출 -> 세션조회 -> 새세션생성 -> 파일교체 -> 구세션폐기 -> 출력
  - Pitfall 5 순서 적용: 생성 -> 파일 -> 폐기 (서비스 연속성 보장)
  - jose decodeJwt 기반 sessionId 추출 (SM-05 패턴)
  - constraints 계승 규칙 테이블 (CLI-06)
  - 에러 케이스 테이블 6건 (구 세션 폐기 실패=경고만)

추가로 업데이트한 기존 섹션:
- 문서 헤더: v0.9 참조/상태 갱신, CLIP-01/CLIP-02 요구사항 추가
- 섹션 1.2: 요구사항 매핑 테이블에 CLIP-01, CLIP-02 행 추가
- 섹션 5.1: 커맨드 목록 테이블에 mcp setup, mcp refresh-token 2행 추가
- 섹션 5.4: CLI 진입점 switch에 `case 'mcp': return runMcp()` 추가
- 섹션 9: 요구사항 매핑 총괄에 CLIP-01, CLIP-02 추가 (7/7 완료)

### Task 2: v0.9 objectives에 Phase 39-01 설계 결과 반영

**Commit:** `931130f`

objectives/v0.9-session-management-automation.md 업데이트:

- 영향받는 설계 문서 테이블: CLI-REDESIGN 행에 `[설계 완료: Phase 39-01]` 태그
- 성공 기준 #3, #9에 `[설계 확정 -- Phase 39-01]` 태그
- "Phase 39-01 설계 결과" 섹션 신설: CLI-01~CLI-06 설계 결정 6건, 설계 문서 위치
- 문서 푸터에 Phase 39-01 업데이트 이력 추가

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | mcp 서브커맨드 그룹 설계 | `fb314a7` | .planning/deliverables/54-cli-flow-redesign.md |
| 2 | v0.9 objectives 반영 | `931130f` | objectives/v0.9-session-management-automation.md |

## Files Modified

| File | Changes |
|------|---------|
| `.planning/deliverables/54-cli-flow-redesign.md` | +603 lines: 섹션 10 신규 (mcp setup/refresh-token 설계), 헤더/커맨드표/진입점/요구사항 갱신 |
| `objectives/v0.9-session-management-automation.md` | +28 lines: Phase 39-01 설계 결과 섹션, 설계 문서 테이블/성공 기준 태그, 푸터 |

## Decisions Made

| # | ID | Decision | Rationale |
|---|-----|----------|-----------|
| 1 | CLI-01 | mcp 서브커맨드 그룹 진입점 패턴 (runMcp -> setup/refresh-token) | 기존 switch 구조 확장. 향후 mcp status 등 추가 용이 |
| 2 | CLI-02 | mcp setup 7단계 플로우 | 단계별 독립 검증 가능. 에이전트 자동 선택으로 최소 옵션 |
| 3 | CLI-03 | mcp refresh-token 8단계 플로우 (생성->파일->폐기) | Pitfall 5 대응: 파일 쓰기 실패 시 구 세션 유지 = 서비스 연속성 |
| 4 | CLI-04 | 에이전트 자동 선택 (1개=자동, 0개=에러, 2개+=--agent 필수) | MCP 사용자 대부분 에이전트 1개. DX 최적화 |
| 5 | CLI-05 | Claude Desktop config.json 3개 플랫폼 경로 안내 | macOS/Windows/Linux 각각 다른 경로. 사용자 혼란 방지 |
| 6 | CLI-06 | constraints 계승 (기존 세션 constraints 복사, renewalCount 리셋) | 동일 권한 수준 유지. 새 세션이므로 카운터만 초기화 |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues / Risks

None identified.

## Next Phase Readiness

Phase 39 Plan 02 (Telegram /newsession 설계): Phase 39-01과 독립적. 바로 진행 가능.
Phase 40 (테스트 설계 + 문서 통합): Phase 38, 39 완료 후 진행.

## Self-Check: PASSED
