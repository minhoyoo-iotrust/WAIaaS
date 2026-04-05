---
phase: 21-dx-improvement
plan: 04
subsystem: docs-integration
tags: [v0.5, auth-model, hint, dev-mode, mcp, tauri, checklist]

dependency-graph:
  requires: [21-01, 21-02]
  provides: ["소규모 문서 6개 v0.5 반영", "통합 검증 체크리스트"]
  affects: [21-03]

tech-stack:
  added: []
  patterns: ["v0.5 인라인 변경 마킹", "참조 노트 패턴", "부록 체크리스트 패턴"]

key-files:
  created: []
  modified:
    - .planning/deliverables/24-monorepo-data-directory.md
    - .planning/deliverables/29-api-framework-design.md
    - .planning/deliverables/38-sdk-mcp-interface.md
    - .planning/deliverables/39-tauri-desktop-architecture.md
    - .planning/deliverables/33-time-lock-approval-mechanism.md
    - .planning/deliverables/36-killswitch-autostop-evm.md
    - .planning/deliverables/54-cli-flow-redesign.md

decisions:
  - id: D1
    summary: "33/36 참조 노트는 인라인 코드 수정 없이 blockquote 노트만 추가"
    rationale: "원본 설계의 무결성 유지, v0.5 변경은 참조 경로로만 안내"

metrics:
  duration: "6m"
  completed: "2026-02-07"
---

# Phase 21 Plan 04: 소규모 문서 v0.5 반영 + 통합 검증 체크리스트 Summary

**One-liner:** 6개 기존 설계 문서에 dev_mode/hint/authRouter/MCP검토/Setup Wizard/인증변경 반영 + 54에 6카테고리 29항목 통합 검증 체크리스트 부록 추가

## Task Commits

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | 24, 29 문서 소규모 업데이트 | `9382fe5` | dev_mode config, .master-password, hint 필드, authRouter 참조 |
| 2 | 38, 39, 33, 36 문서 업데이트 + 참조 노트 | `8929243` | MCP 검토 결과, sessions.renew(), Setup Wizard 재구성, 인증 참조 노트 |
| 3 | v0.5 통합 검증 체크리스트 부록 | `926c7a5` | 부록 A: 6 카테고리, 29 확인 항목, 17 문서 참조 |

## Changes Made

### Task 1: 24-monorepo + 29-api-framework

**24-monorepo-data-directory.md:**
- [daemon] 테이블에 `dev_mode` 키 추가 (boolean, 기본 false)
- config.toml 예시에 `dev_mode = false` 추가
- Zod ConfigSchema에 `dev_mode: z.boolean().default(false)` 추가
- 디렉토리 트리에 `.master-password` 파일 추가 (mode 0o600)
- 파일/디렉토리 상세 테이블에 `.master-password` 행 추가
- 참조 문서에 54-cli-flow-redesign.md 추가

**29-api-framework-design.md:**
- ErrorResponseSchema에 `hint: z.string().optional()` 필드 추가
- 미들웨어 체인 설명에 authRouter 통합 디스패처 참조 추가
- 문서 헤더에 v0.5 업데이트 날짜 및 52/55 참조 추가
- 섹션 10.3에 v0.5 참조 문서 테이블 추가

### Task 2: 38-sdk-mcp + 39-tauri + 33/36 참조 노트

**38-sdk-mcp-interface.md:**
- MCP 섹션 5에 내장 옵션 검토 결과 기록 (옵션 B 유지 결정)
- Owner 클라이언트에 v0.5 인증 변경 노트 추가 (signMessage = approve/recover만)
- MCP tools에 인증 설명 업데이트 (sessionAuth + 세션 갱신 미래 확장 노트)
- TS SDK WAIaaSClient에 `renewSession()` 메서드 추가
- 52/53/55 참조 문서 추가

**39-tauri-desktop-architecture.md:**
- HTTP localhost 섹션에 v0.5 인증 모델 변경 반영 (masterAuth implicit)
- Setup Wizard 5-step v0.5 재구성 비교 테이블 추가
- 52/54 참조 문서 추가

**33-time-lock-approval-mechanism.md:**
- DELAY 섹션에 v0.5 인증 변경 참조 노트 (cancel = masterAuth implicit)
- APPROVAL 섹션에 v0.5 인증 변경 참조 노트 (approve = ownerAuth 유지, reject = masterAuth)

**36-killswitch-autostop-evm.md:**
- Kill Switch 상태 머신 섹션에 v0.5 인증 변경 참조 노트 (activate = masterAuth, recover = ownerAuth 유지)

### Task 3: 통합 검증 체크리스트

**54-cli-flow-redesign.md:**
- 부록 A: v0.5 설계 문서 통합 검증 체크리스트 추가
- 6개 핵심 용어: masterAuth, ownerAuth, agents.owner_address, 세션 갱신, hint, CLI 플로우
- 17개 문서 참조, 29개 확인 항목
- Phase 21 Plan 03 검증 단계에서 활용 가능

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | 33/36 참조 노트는 인라인 코드 수정 없이 blockquote 노트만 추가 | 원본 설계의 무결성 유지, v0.5 변경은 참조 경로로만 안내 |

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

- Phase 21 Plan 03 (21-03): 통합 검증 체크리스트(부록 A) 활용하여 전수 검증 가능
- 6개 문서 소규모 변경 완료로 Phase 21 Success Criteria #5 달성을 위한 최종 검증 가능 상태

## Self-Check: PASSED
