# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v27.0 전 페이즈 완료 — 마일스톤 감사 준비

## Current Position

Phase: 221 (7 of 7 in v27.0) — 설정 구조 + 설계 통합 검증
Plan: 2 of 2 in current phase
Status: All phases complete
Last activity: 2026-02-21 — All 7 phases (215-221) completed

Progress: [██████████] 100%

## Performance Metrics

**Cumulative:** 50 milestones, 214 phases, 462 plans, 1,272 reqs, 4,396+ tests, ~145,704 LOC TS

**v27.0 (complete):**
- Phases: 7 (215-221) — all done
- Plans: 12 total (2+1+1+2+2+2+2) — all done
- Requirements: 29 — all done
- Design decisions: 17 (D-01 ~ D-17)
- Output: docs/design/76-incoming-transaction-monitoring.md (8 sections, ~1,900 lines)

## Accumulated Context

### Decisions

1. D-01: IChainSubscriber를 IChainAdapter와 별도 인터페이스로 설계
2. D-02: UNIQUE(tx_hash, wallet_id) 복합 제약
3. D-03: 2단계 상태 (DETECTED/CONFIRMED)
4. D-04: 메모리 큐 + 5초 flush (SQLite 보호)
5. D-05: Solana logsSubscribe({ mentions }) 단일 구독
6. D-06: EVM 폴링(getLogs) 우선
7. D-07: 3-state 연결 상태 머신
8. D-08: 체인별 WebSocket 공유 멀티플렉서
9. D-09: 블라인드 구간 커서 기반 복구
10. D-10: NotificationEventType 28→30
11. D-11: IIncomingSafetyRule 3규칙
12. D-12: config.toml [incoming] 6키 flat
13. D-13: 전역 게이트 + 지갑별 opt-in 2단계
14. D-14: incoming_tx_cursors 별도 테이블
15. D-15: v21 마이그레이션
16. D-16: 6키 모두 hot-reload 가능
17. D-17: confirmed 감지 → finalized 확정

### Blockers/Concerns

- (None — 설계 마일스톤 완료)

## Session Continuity

Last session: 2026-02-21
Stopped at: All 7 phases complete, ready for milestone audit/completion
Resume file: None
