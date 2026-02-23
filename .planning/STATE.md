# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v28.0 기본 DeFi 프로토콜 설계 -- Phase 244 코어 설계 기반

## Current Position

Milestone: v28.0 기본 DeFi 프로토콜 설계
Phase: 244 of 245 (코어 설계 기반)
Plan: 2 of 2 in current phase
Status: Phase 244 complete
Last activity: 2026-02-23 -- Completed 244-02-PLAN.md (DEFI-03 정책 연동 설계)

Progress: [█████████░] 100% (Phase 244)

## Performance Metrics

**Cumulative:** 55 milestones, 243 phases, 521 plans, 1,421 reqs, 4,396+ tests, ~186,724 LOC TS

## Accumulated Context

### Decisions

(Cleared at milestone boundary -- see PROJECT.md Key Decisions for full log)

- Research: 0x AllowanceHolder 사용 (Permit2 대신) -- m28-02 objective 수정 완료 (244-01)
- Research: wstETH vs stETH 아키텍처 결정 -- m28-00 설계에서 확정 필요
- DEFI-01: packages/actions/ 디렉토리 트리, package.json, registerBuiltInProviders() 6-step 라이프사이클 확정
- DEFI-02: ActionApiClient base (fetch+Zod), 8개 DeFi 에러 코드, SlippageBps/SlippagePct branded types 확정
- APIC-05: AllowanceHolder 플로우 확정 -- standard ERC-20 approve, EIP-712 불필요
- config.toml [actions.*] 공통 스키마: enabled/api_base_url/api_key + 프로바이더별 슬리피지
- Admin Settings 경계: api_key + 운영 파라미터 = hot-reload, enabled + urls + 주소 = config.toml only
- Research: 신규 npm 의존성 0개 -- 모든 DeFi 프로토콜 기존 패키지로 통합
- PLCY-01: resolve() 순수 함수 -- 정책 평가는 Stage 3에서만 수행
- PLCY-02: approve 트랜잭션은 $0 지출 평가 (승인 != 지출)
- PLCY-03: 크로스체인 브릿지는 출발 체인 월렛 정책으로 평가
- PLCY-04: 도착 주소 기본 정책 self-bridge only, 외부 주소 APPROVAL 격상
- PLCY-04: SPENDING_LIMIT 예약은 COMPLETED/REFUNDED에서만 해제 (P4 대응)
- PLCY-02: Settings snapshot을 resolve() 진입 시 획득, 파이프라인 완료까지 유지

### Blockers/Concerns

- STO-03: Confirmation Worker RPC 콜백 미주입 (v27.1 known gap, unrelated to v28.0)

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 244-01-PLAN.md (DEFI-01/DEFI-02 확정 + m28-02 AllowanceHolder 업데이트)
Resume file: None
