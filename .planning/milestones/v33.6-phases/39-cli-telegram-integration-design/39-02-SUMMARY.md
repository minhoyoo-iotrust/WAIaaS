---
phase: 39-cli-telegram-integration-design
plan: 02
subsystem: telegram
tags: [telegram, mcp, session, token-file, constraints, inline-keyboard, newsession]
requires:
  - phase: 36
    provides: "토큰 파일 유틸리티 (writeMcpToken, getMcpTokenPath)"
provides:
  - "Telegram /newsession 명령어 플로우 설계"
  - "기본 constraints 결정 규칙 (2-level + 3-level 확장 예약)"
  - "resolveDefaultConstraints 공용 함수 설계"
affects: [phase-40-test-design, implementation-v1.6]
tech-stack:
  added: []
  patterns: ["Telegram inline keyboard agent selection", "2-level constraints resolution"]
key-files:
  created: []
  modified: [".planning/deliverables/40-telegram-bot-docker.md", "objectives/v0.9-session-management-automation.md"]
key-decisions:
  - "TG-01: /newsession 9번째 명령어 등록 (Tier 1 chatId 인증)"
  - "TG-02: 에이전트 인라인 키보드 (1개 자동, 2개+ 선택, callback_data 47바이트)"
  - "TG-03: createNewSession private 메서드 (세션 생성 + writeMcpToken + 완료 메시지)"
  - "TG-04: 기본 constraints 2-level (config.toml > 하드코딩), EXT-03 3-level 확장 예약"
  - "TG-05: resolveDefaultConstraints 공용 함수 (CLI + Telegram 공유)"
  - "TG-06: 최소 보안 보장 (expiresIn/maxRenewals 항상 값 존재, Pitfall 4 대응)"
duration: 6min
completed: 2026-02-09
---

# Phase 39 Plan 02: Telegram /newsession + 기본 Constraints 설계 Summary

Telegram /newsession 9번째 명령어 플로우(인증/에이전트선택/세션생성/토큰파일저장/완료메시지)와 CLI+Telegram 공용 resolveDefaultConstraints 2-level 우선순위 체계를 40-telegram-bot-docker.md에 설계 완료

## Performance

| Metric | Value |
|--------|-------|
| Duration | 6min |
| Tasks | 2/2 |
| Commits | 2 |
| Files Modified | 2 |
| Decisions | 6 (TG-01 ~ TG-06) |

## Accomplishments

### Task 1: 40-telegram-bot-docker.md에 /newsession + 기본 constraints 규칙 설계 추가
- /newsession을 9번째 명령어로 등록 (Tier 1 chatId 인증)
- handleNewSession 핸들러: 5단계 플로우 (인증 -> 에이전트 조회 -> 분기(0/1/2+) -> 인라인 키보드 -> 타임아웃)
- handleNewSessionCallback 콜백 핸들러: 4단계 (파싱 -> 재인증 -> 로딩해제 -> 세션생성)
- createNewSession private 메서드: 4단계 (constraints결정 -> 세션생성 -> 토큰파일저장 -> 완료메시지)
- 에러 처리 분기 3종 (생성 실패 / 파일 쓰기 실패 / 성공)
- 기본 Constraints 결정 규칙: 2-level (config.toml [security] > 하드코딩 상수)
- resolveDefaultConstraints 함수: 입력 AppConfig, 출력 DefaultConstraints, CLI cliOverrides 지원
- 3-level 확장 예약: EXT-03 agents.default_constraints DB 컬럼 (v1.x 이연)
- 최소 보안 보장: expiresIn/maxRenewals 항상 값 존재 (Pitfall 4 대응)
- BotFather 명령어 목록, Command Handler Registry, Callback Query switch에 반영
- callback_data 포맷 테이블에 newsession:{agentId} (47바이트) 추가
- 부록 C 설계 결정 요약에 13-18번 결정 6건 추가
- v0.9 업데이트 이력 테이블 추가

### Task 2: v0.9 objectives에 Phase 39-02 설계 결과 반영
- Phase 39-02 설계 결과 섹션 신설 (TG-01~TG-06 결정 6건)
- 영향받는 설계 문서 테이블의 TGBOT-DOCK 행에 [설계 완료: Phase 39-02] 태그
- 성공 기준 #4, #8에 [설계 확정 -- Phase 39-02] 태그
- 문서 푸터에 Phase 39-02 업데이트 이력 추가

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | /newsession + 기본 constraints 규칙 설계 | be79344 | .planning/deliverables/40-telegram-bot-docker.md |
| 2 | v0.9 objectives Phase 39-02 반영 | 1cc25e1 | objectives/v0.9-session-management-automation.md |

## Files Modified

| File | Changes |
|------|---------|
| `.planning/deliverables/40-telegram-bot-docker.md` | /newsession 명령어 섹션 4.12, 기본 Constraints 섹션 4.13, 명령어 테이블/핸들러/BotFather/콜백 업데이트, 부록 C 결정 추가, v0.9 이력 |
| `objectives/v0.9-session-management-automation.md` | Phase 39-02 설계 결과 섹션, 영향받는 문서/성공 기준 태그, 푸터 이력 |

## Decisions Made

| # | ID | Decision | Rationale |
|---|-----|----------|-----------|
| 1 | TG-01 | /newsession 9번째 명령어, Tier 1 chatId 인증 | 세션 생성은 자금 이동 아님. masterAuth implicit. constraints가 자금 이동 범위 제한 |
| 2 | TG-02 | 에이전트 인라인 키보드 (1개 자동, 2개+ 선택) | UX 최적화. callback_data "newsession:" (11) + UUID v7 (36) = 47 < 64바이트 |
| 3 | TG-03 | createNewSession (세션 생성 + writeMcpToken + 완료 메시지) | Phase 36 토큰 파일 유틸리티 재사용. 에러 분기 3종으로 부분 실패 대응 |
| 4 | TG-04 | 기본 constraints 2-level, EXT-03 3-level 확장 예약 | config.toml [security] > 하드코딩. agents.default_constraints는 v1.x 이연 |
| 5 | TG-05 | resolveDefaultConstraints 공용 함수 | CLI --expires-in 최우선, Telegram은 config > 하드코딩. 중복 제거 |
| 6 | TG-06 | 최소 보안 보장 (expiresIn/maxRenewals 항상 값 존재) | Pitfall 4: 빈 constraints로 무제한 세션 생성 방지. 604800/30 하드코딩 안전망 |

## Deviations from Plan

None - plan executed exactly as written.

## Issues

None.

## Next Phase Readiness

- Phase 39 (CLI + Telegram 통합 설계) 2/2 plans 완료
- Phase 38 (SessionManager MCP 통합) 병렬 진행 가능 (Phase 37 의존)
- Phase 40 (테스트 설계 + 문서 통합) 진입 가능 조건: Phase 38, 39 모두 완료

## Self-Check: PASSED
