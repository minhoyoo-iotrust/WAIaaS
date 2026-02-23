# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v28.0 기본 DeFi 프로토콜 설계 -- Phase 245 런타임 동작 설계

## Current Position

Milestone: v28.0 기본 DeFi 프로토콜 설계
Phase: 245 of 245 (런타임 동작 설계)
Plan: 2 of 3 in current phase
Status: Plan 245-01 + 245-02 complete
Last activity: 2026-02-23 -- Completed 245-01-PLAN.md (DEFI-04 비동기 상태 추적 설계)

Progress: [██████████] 67% (Phase 245, 2/3 plans)

## Performance Metrics

**Cumulative:** 55 milestones, 243 phases, 521 plans, 1,421 reqs, 4,396+ tests, ~186,724 LOC TS

## Accumulated Context

### Decisions

(Cleared at milestone boundary -- see PROJECT.md Key Decisions for full log)

- Research: 0x AllowanceHolder 사용 (Permit2 대신) -- m28-02 objective 수정 완료 (244-01)
- Research: wstETH vs stETH 아키텍처 결정 -- SAFE-02에서 wstETH 채택 확정 (245-02)
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
- SAFE-01: Jito fail-closed -- JITO_UNAVAILABLE 에러, 공개 RPC 폴백 절대 금지, JITO_DEGRADED 알림
- SAFE-02: wstETH 채택 (stETH 대신) -- 리베이스/dust/L2 문제 근본 해결, PLCY-02 Lido 번들 3개 주소로 업데이트
- SAFE-03: re-resolve 패턴 -- bridge_metadata에 providerName+originalParams 저장, 가스 조건 충족 시 재호출
- SAFE-03: per-wallet 가스 대기 제한 max_per_wallet=5, per-wallet lock으로 nonce 순차 처리
- SAFE-04: API drift 3중 방어 -- Zod + 버전 고정 URL + redirect:'error' + API_SCHEMA_DRIFT 알림 (3회 연속 실패)
- SAFE-04: RPC 장애 시 effectiveWaitTime으로 타임아웃 시계 일시 정지
- ASNC-01: IAsyncStatusTracker with timeoutTransition discriminator (TIMEOUT/BRIDGE_MONITORING/CANCELLED)
- ASNC-02: Per-tracker timing via bridge_metadata.lastPolledAt, BackgroundWorkers 30s interval
- ASNC-03: 통합 DB migration v23 -- bridge_status + bridge_metadata + GAS_WAITING + partial indexes 2개
- ASNC-04: GAS_WAITING 11번째 트랜잭션 상태, Stage 3.5 진입, SIGNED/CANCELLED 탈출
- ASNC-05: 브릿지 3단계 타임아웃 (2h active -> 22h monitoring -> TIMEOUT), 자동 취소 금지

### Blockers/Concerns

- STO-03: Confirmation Worker RPC 콜백 미주입 (v27.1 known gap, unrelated to v28.0)

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 245-01-PLAN.md (DEFI-04 비동기 상태 추적 설계 확정)
Resume file: None
