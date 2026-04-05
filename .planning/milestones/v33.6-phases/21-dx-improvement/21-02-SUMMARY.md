---
phase: 21-dx-improvement
plan: 02
subsystem: api, dx
tags: [error-hints, mcp, stdio, ssh-tunnel, vpn, remote-access, errorResponseSchema]

requires:
  - phase: 19-auth-owner-redesign
    provides: 3-tier 인증 모델, masterAuth implicit/explicit
  - phase: 20-session-renewal-protocol
    provides: 세션 갱신 API, 에러 코드 4개 추가 (40개 총)
provides:
  - 55-dx-improvement-spec.md (DX-06~DX-08 SSoT)
  - ErrorResponseSchema hint 필드 backward-compatible 확장
  - 에러 코드별 hint 맵 31개 (7도메인 40개 중)
  - MCP 아키텍처 옵션 비교 (A 기각, B 채택, C 미래)
  - 원격 접근 가이드 (SSH 추천, VPN, --expose 위험성)
affects:
  - 구현 Phase (ErrorResponseSchema 확장, MCP 자동화)
  - 29-api-framework-design.md (hint 필드 반영)
  - 38-sdk-mcp-interface.md (MCP 아키텍처 결정 반영)

tech-stack:
  added: []
  patterns:
    - "hint 필드: errorHintMap + resolveHint() 동적 치환 패턴"
    - "MCP 세션 자동 갱신: McpSessionManager 50% 시점 갱신"
    - "SSH 터널 + autossh 자동 재연결 패턴"

key-files:
  created:
    - ".planning/deliverables/55-dx-improvement-spec.md"
  modified: []

key-decisions:
  - "hint 필드는 z.string().optional()로 ErrorResponseSchema backward-compatible 확장"
  - "40개 에러 중 31개에 hint 매핑 (78%), 9개 미매핑 (보안/복구불가 사유)"
  - "MCP 옵션 B(별도 stdio) 채택: MCP Host 표준 + sessionAuth 보장 + 관심사 분리"
  - "MCP 옵션 A(Streamable HTTP) 기각: Host 호환성 부족 + 인증 모델 충돌"
  - "MCP 옵션 C(--mcp-stdio) 미래 확장: stdout 충돌 + sessionAuth 우회 문제 선해결 필요"
  - "세션 토큰 불편함 완화 3방안: mcp setup 커맨드, 세션 자동 갱신, env 파일"
  - "원격 접근 SSH 터널 추천, --expose는 mTLS+IP화이트리스트 구현 후에만 안전"

patterns-established:
  - "errorHintMap: 에러 코드별 hint 템플릿 + {variable} 동적 치환"
  - "mcpErrorResponse(): MCP Tool 에러 응답 공통 헬퍼 (hint 포함)"
  - "McpSessionManager: MCP Server 세션 자동 갱신 (50% 시점)"
  - "waiaas mcp setup: Claude Desktop config 자동 생성 CLI"

duration: 7min
completed: 2026-02-07
---

# Phase 21 Plan 02: DX 개선 스펙 Summary

**ErrorResponseSchema hint 필드(31개 에러 맵) + MCP 옵션 B(stdio) 채택 + SSH 터널 원격 접근 가이드를 단일 SSoT로 정의**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-07T03:27:59Z
- **Completed:** 2026-02-07T03:34:45Z
- **Tasks:** 2/2
- **Files created:** 1

## Accomplishments

- ErrorResponseSchema에 hint 필드를 backward-compatible 확장으로 추가, 7도메인 40개 에러 중 31개에 actionable hint 매핑 정의
- MCP 데몬 내장 3가지 옵션(A: Streamable HTTP, B: 별도 stdio, C: 하이브리드)을 비교하고 B를 채택, 세션 토큰 완화 3방안 제시
- SSH 터널(추천) + VPN(WireGuard) + --expose(위험성 문서화) 3가지 원격 접근 방법 가이드 작성

## Task Commits

Each task was committed atomically:

1. **Task 1: 55-dx-improvement-spec.md 섹션 1~2 (개요 + hint 필드)** - `0651df3` (feat)
2. **Task 2: 55-dx-improvement-spec.md 섹션 3~4 (MCP 검토 + 원격 접근)** - `a5122de` (feat)

## Files Created/Modified

- `.planning/deliverables/55-dx-improvement-spec.md` - DX 개선 스펙 SSoT (DX-06~DX-08), ~1260줄

## Decisions Made

1. **hint 필드 backward-compatible 확장:** `z.string().optional()`로 기존 클라이언트 무영향. hint는 영문 기반(AI 에이전트 소비 기준).
2. **31개 hint 매핑, 9개 미매핑:** 보안상 노출 불가(WHITELIST_DENIED), 복구 불가(AGENT_TERMINATED, KILL_SWITCH_ACTIVE), 행동 불가(MASTER_PASSWORD_LOCKED) 등은 의도적 미매핑.
3. **MCP 옵션 B 채택 핵심 근거:** (1) stdio는 모든 주요 MCP Host 표준, (2) sessionAuth 제약(금액 한도, 허용 작업) 보장, (3) 프로세스 격리로 데몬 안정성 확보.
4. **MCP 마이그레이션 경로:** B(현재) -> B+자동화(단기) -> C 검토(중기) -> A 재검토(장기, Streamable HTTP 안정화 후).
5. **SSH 터널 추천:** 추가 인프라 없음, masterAuth implicit 유효, 암호화 보장. --expose는 mTLS + IP 화이트리스트 + masterAuth explicit 강제가 선행되어야 안전.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DX-06~DX-08 3개 요구사항 SSoT 완성
- 55-dx-improvement-spec.md가 구현 Phase에서 ErrorResponseSchema 확장, MCP 자동화, CLI mcp setup 커맨드의 설계 참조 역할
- Phase 21의 나머지 Plan(21-03: 기존 문서 중규모 수정, 21-04: 소규모 수정 + 통합 검증)으로 진행 가능

## Self-Check: PASSED

---
*Phase: 21-dx-improvement*
*Completed: 2026-02-07*
