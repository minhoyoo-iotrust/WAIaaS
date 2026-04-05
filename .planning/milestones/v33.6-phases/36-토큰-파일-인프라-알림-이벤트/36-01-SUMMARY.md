---
phase: "36"
plan: "01"
subsystem: "token-file-infrastructure"
tags: ["mcp-token", "write-then-rename", "atomic-write", "token-file", "POSIX", "symlink"]
requires: ["24-monorepo-data-directory", "30-session-token-protocol", "53-session-renewal-protocol"]
provides: ["mcp-token-file-spec", "token-file-utility-api", "atomic-write-pattern"]
affects: ["37-SessionManager", "38-MCP-integration", "39-CLI-Telegram"]
tech-stack:
  added: []
  patterns: ["write-then-rename atomic write", "Last-Writer-Wins file ownership", "lstat symlink rejection"]
key-files:
  created: []
  modified:
    - ".planning/deliverables/24-monorepo-data-directory.md"
    - "objectives/v0.9-session-management-automation.md"
key-decisions:
  - id: "TF-01"
    decision: "getMcpTokenPath, writeMcpToken, readMcpToken 3개 공유 유틸리티를 @waiaas/core utils/token-file.ts에 정의"
    rationale: "MCP/CLI/Telegram 3개 컴포넌트가 동일 코드로 토큰 파일 조작"
  - id: "TF-02"
    decision: "write-then-rename 원자적 쓰기 패턴, 외부 라이브러리(write-file-atomic) 없이 Node.js 내장 API"
    rationale: "~500byte JWT 파일에 외부 의존성은 과잉. 직접 구현 10줄이면 충분"
  - id: "TF-03"
    decision: "readMcpToken은 동기 함수(readFileSync)"
    rationale: "MCP tool handler 동기 확인. ~500byte I/O 비용 무시 가능"
  - id: "TF-04"
    decision: "Windows EPERM: 10-50ms 랜덤 대기, 최대 3회 재시도"
    rationale: "NTFS 동시 rename 충돌 대응"
  - id: "TF-05"
    decision: "Last-Writer-Wins 소유권 모델"
    rationale: "Self-Hosted 단일 머신에서 동시 쓰기 극히 드묾. 401 lazy reload 자동 복구"
patterns-established:
  - "write-then-rename: 임시 파일 생성 -> 쓰기 -> POSIX rename 원자적 이름 변경"
  - "lstat symlink rejection: lstat() (not stat()) 사용하여 symlink 감지 및 거부"
  - "Last-Writer-Wins: 다중 쓰기 주체, 마지막 쓰기 승리, 401 lazy reload 복구"
duration: "~4 minutes"
completed: "2026-02-09"
---

# Phase 36 Plan 01: 토큰 파일 인프라 설계 Summary

MCP/CLI/Telegram 3개 컴포넌트가 공유하는 mcp-token 파일 사양(9개 항목)과 원자적 쓰기 패턴(write-then-rename, 6단계, 4플랫폼)을 24-monorepo-data-directory.md에 정의하고, 3개 공유 유틸리티 함수의 시그니처/동작/에러 처리를 확정함.

## Performance

| Metric | Value |
|--------|-------|
| Total tasks | 2 |
| Completed | 2 |
| Deviations | 0 |
| Duration | ~4 minutes |

## Accomplishments

### Task 1: 24-monorepo-data-directory.md에 mcp-token 파일 사양 추가

- 데이터 디렉토리 트리(섹션 2.2)에 `mcp-token` 파일 항목 추가
- 파일/디렉토리 상세 테이블(섹션 2.3)에 `mcp-token` 행 추가
- `packages/core/src/` 디렉토리 트리(섹션 1.1)에 `utils/token-file.ts` 추가
- 토큰 파일 사양 섹션(섹션 4) 신설:
  - 섹션 4.1: 파일 사양 테이블 9개 항목 (경로, 포맷, 인코딩, 권한, 디렉토리 권한, symlink, 최대 크기, 소유권 모델, Windows 제한)
  - 섹션 4.2: 공유 유틸리티 API 3개 함수 (getMcpTokenPath, writeMcpToken, readMcpToken) 시그니처 + 동작 + 에러 처리
  - 섹션 4.3: 원자적 쓰기 패턴 6단계 절차 + 4개 플랫폼별 동작 테이블
  - 섹션 4.4: 3개 쓰기 주체 + Last-Writer-Wins 정책
- 요구사항 매핑에 SMGR-02, SMGR-07 추가
- 문서 헤더/푸터에 v0.9 업데이트 이력 반영

### Task 2: v0.9 objectives에 토큰 파일 인프라 설계 결과 반영

- 토큰 파일 사양(섹션 1.3)에 `[설계 확정]` 태그 추가
- 영향받는 설계 문서 테이블의 CORE-01 행에 `[설계 완료: Phase 36-01]` 표시
- "Phase 36-01 설계 결과" 섹션 신설: 핵심 설계 결정 7항목, 설계 문서 위치 4개 하위 섹션 참조
- 문서 푸터에 Phase 36-01 업데이트 이력 반영

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | 24-monorepo에 mcp-token 사양 추가 | `3839dc5` | `.planning/deliverables/24-monorepo-data-directory.md` |
| 2 | v0.9 objectives에 설계 결과 반영 | `7a40407` | `objectives/v0.9-session-management-automation.md` |

## Files Modified

| File | Changes |
|------|---------|
| `.planning/deliverables/24-monorepo-data-directory.md` | +94 lines: 디렉토리 트리 mcp-token 추가, 파일 상세 행 추가, utils/token-file.ts 추가, 토큰 파일 사양 섹션 4 신설, 요구사항 매핑 2건 추가 |
| `objectives/v0.9-session-management-automation.md` | +31 lines: [설계 확정] 태그, [설계 완료] 표시, Phase 36-01 설계 결과 섹션 |

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| TF-01 | 3개 공유 유틸리티를 `@waiaas/core` `utils/token-file.ts`에 정의 | MCP/CLI/Telegram 동일 코드 공유 |
| TF-02 | write-then-rename 패턴, 외부 라이브러리 없음 | ~500byte 파일에 write-file-atomic 의존성 과잉 |
| TF-03 | readMcpToken 동기 함수 (readFileSync) | MCP tool handler 동기 확인, I/O 비용 무시 가능 |
| TF-04 | Windows EPERM: 10-50ms 랜덤 대기, 최대 3회 재시도 | NTFS 동시 rename 충돌 대응 |
| TF-05 | Last-Writer-Wins 소유권 모델 | Self-Hosted 단일 머신, 동시 쓰기 극히 드묾, 401 lazy reload 자동 복구 |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Phase 36-02 (SESSION_EXPIRING_SOON 이벤트): 토큰 파일 사양이 확정되어 알림 이벤트 설계 진행 가능
- Phase 37 (SessionManager 핵심): getMcpTokenPath/writeMcpToken/readMcpToken API가 확정되어 SessionManager 내부에서 사용 가능
- Phase 38 (MCP 통합): 토큰 파일 경로/포맷/권한이 확정되어 MCP Server 통합 설계 가능
- Phase 39 (CLI+Telegram): writeMcpToken/readMcpToken 함수를 CLI `mcp setup`/`mcp refresh-token` 및 Telegram `/newsession`에서 사용 가능

## Self-Check: PASSED
