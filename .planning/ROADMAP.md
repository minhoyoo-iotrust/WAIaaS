# Roadmap: WAIaaS

## Milestones

- ✅ **v0.1 Research & Design** — Phases 1-5 (shipped 2026-02-05)
- ✅ **v0.2 Self-Hosted Secure Wallet Design** — Phases 6-9 (shipped 2026-02-05)
- ✅ **v0.3 설계 논리 일관성 확보** — Phases 10-13 (shipped 2026-02-06)
- ✅ **v0.4 테스트 전략 및 계획 수립** — Phases 14-18 (shipped 2026-02-07)
- ✅ **v0.5 인증 모델 재설계 + DX 개선** — Phases 19-21 (shipped 2026-02-07)
- ✅ **v0.6 블록체인 기능 확장 설계** — Phases 22-25 (shipped 2026-02-08)
- ✅ **v0.7 구현 장애 요소 해소** — Phases 26-30 (shipped 2026-02-08)
- ✅ **v0.8 Owner 선택적 등록 + 점진적 보안** — Phases 31-35 (shipped 2026-02-09)
- ✅ **v0.9 MCP 세션 관리 자동화 설계** — Phases 36-40 (shipped 2026-02-09)
- ✅ **v0.10 구현 전 설계 완결성 확보** — Phases 41-44 (shipped 2026-02-09)
- ✅ **v1.0 구현 계획 수립** — Phases 45-47 (shipped 2026-02-09)
- ✅ **v1.1 코어 인프라 + 기본 전송** — Phases 48-51 (shipped 2026-02-10, 281 tests, 10,925 LOC)
- ✅ **v1.2 인증 + 정책 엔진** — Phases 52-57 (shipped 2026-02-10, 457 tests, ~15,800 LOC)

## Phases

<details>
<summary>v0.1 Research & Design (Phases 1-5) -- SHIPPED 2026-02-05</summary>

- [x] Phase 1: AI 에이전트 지갑 요구사항 분석 (3 plans)
- [x] Phase 2: 커스터디 모델 비교 연구 (3 plans)
- [x] Phase 3: Solana 기술 스택 조사 (3 plans)
- [x] Phase 4: 주인-에이전트 관계 모델 설계 (3 plans)
- [x] Phase 5: 오픈소스/기존 솔루션 조사 + 에이전트 프레임워크 통합 (3 plans)

</details>

<details>
<summary>v0.2 Self-Hosted Secure Wallet Design (Phases 6-9) -- SHIPPED 2026-02-05</summary>

- [x] Phase 6: 코어 지갑 서비스 설계 (4 plans)
- [x] Phase 7: 세션 + 체인 추상화 설계 (4 plans)
- [x] Phase 8: 보안 계층 설계 (4 plans)
- [x] Phase 9: 통합 + 배포 설계 (4 plans)

</details>

<details>
<summary>v0.3 설계 논리 일관성 확보 (Phases 10-13) -- SHIPPED 2026-02-06</summary>

- [x] Phase 10: v0.1 잔재 정리 + 변경 매핑 (2 plans)
- [x] Phase 11: CRITICAL 의사결정 확정 (2 plans)
- [x] Phase 12: Enum/상태값 통합 대응표 (2 plans)
- [x] Phase 13: REST API<>Framework 스펙 통일 (2 plans)

</details>

<details>
<summary>v0.4 테스트 전략 및 계획 수립 (Phases 14-18) -- SHIPPED 2026-02-07</summary>

- [x] Phase 14: 테스트 레벨/매트릭스/커버리지 정의 (2 plans)
- [x] Phase 15: 보안 공격 시나리오 71건 (2 plans)
- [x] Phase 16: 블록체인 3단계 테스트 환경 (2 plans)
- [x] Phase 17: CI/CD 4단계 파이프라인 (1 plan)
- [x] Phase 18: 배포 타겟별 테스트 시나리오 (2 plans)

</details>

<details>
<summary>v0.5 인증 모델 재설계 + DX 개선 (Phases 19-21) -- SHIPPED 2026-02-07</summary>

- [x] Phase 19: 3-Tier 인증 모델 재설계 (3 plans)
- [x] Phase 20: 세션 낙관적 갱신 + CLI DX (3 plans)
- [x] Phase 21: 기존 설계 문서 11개 v0.5 통합 (3 plans)

</details>

<details>
<summary>v0.6 블록체인 기능 확장 설계 (Phases 22-25) -- SHIPPED 2026-02-08</summary>

- [x] Phase 22: 토큰 확장 + 정책 (3 plans)
- [x] Phase 23: 트랜잭션 타입 확장 (3 plans)
- [x] Phase 24: 상위 추상화 레이어 (3 plans)
- [x] Phase 25: 테스트 전략 통합 + 문서 통합 (2 plans)

</details>

<details>
<summary>v0.7 구현 장애 요소 해소 (Phases 26-30) -- SHIPPED 2026-02-08</summary>

- [x] Phase 26: 체인 어댑터 안정화 (2 plans)
- [x] Phase 27: 데몬 보안 기반 확립 (3 plans)
- [x] Phase 28: 의존성 빌드 환경 해소 (2 plans)
- [x] Phase 29: API 통합 프로토콜 완성 (2 plans)
- [x] Phase 30: 스키마 설정 확정 (2 plans)

</details>

<details>
<summary>v0.8 Owner 선택적 등록 + 점진적 보안 (Phases 31-35) -- SHIPPED 2026-02-09</summary>

- [x] Phase 31: Owner 선택적 데이터 모델 (2 plans)
- [x] Phase 32: Owner 생명주기 상태 머신 (3 plans)
- [x] Phase 33: 정책 다운그레이드 메커니즘 (2 plans)
- [x] Phase 34: 자금 회수 프로토콜 (2 plans)
- [x] Phase 35: DX + 설계 문서 통합 (2 plans)

</details>

<details>
<summary>v0.9 MCP 세션 관리 자동화 설계 (Phases 36-40) -- SHIPPED 2026-02-09</summary>

- [x] Phase 36: 토큰 파일 인프라 (2 plans)
- [x] Phase 37: SessionManager 핵심 설계 (2 plans)
- [x] Phase 38: MCP 통합 설계 (2 plans)
- [x] Phase 39: CLI + Telegram 연동 (2 plans)
- [x] Phase 40: 테스트 설계 + 문서 통합 (2 plans)

</details>

<details>
<summary>v0.10 구현 전 설계 완결성 확보 (Phases 41-44) -- SHIPPED 2026-02-09</summary>

- [x] Phase 41: 정책 엔진 완결 (2 plans)
- [x] Phase 42: 에러 처리 체계 완결 (2 plans)
- [x] Phase 43: 동시성 + 실행 로직 완결 (3 plans)
- [x] Phase 44: 운영 로직 완결 (3 plans)

</details>

<details>
<summary>v1.0 구현 계획 수립 (Phases 45-47) -- SHIPPED 2026-02-09</summary>

- [x] Phase 45: 코어 구현 objective 문서 생성 (2 plans)
- [x] Phase 46: 확장 + 릴리스 objective 문서 생성 (2 plans)
- [x] Phase 47: 설계 부채 + 로드맵 최종 검증 (1 plan)

</details>

<details>
<summary>✅ v1.1 코어 인프라 + 기본 전송 (Phases 48-51) — SHIPPED 2026-02-10</summary>

- [x] Phase 48: 모노레포 스캐폴드 + @waiaas/core (3/3 plans) — completed 2026-02-10
- [x] Phase 49: 데몬 인프라 (3/3 plans) — completed 2026-02-10
- [x] Phase 50: API 서버 + SolanaAdapter + 파이프라인 (4/4 plans) — completed 2026-02-10
- [x] Phase 51: CLI + E2E 통합 검증 (2/2 plans) — completed 2026-02-10

</details>

### ✅ v1.2 인증 + 정책 엔진 (SHIPPED 2026-02-10)

**Milestone Goal:** v1.1에서 구축한 코어 인프라 위에 3-tier 인증 체계(masterAuth/ownerAuth/sessionAuth)와 4-tier 정책 엔진(DatabasePolicyEngine)을 구현하여, 세션 기반 에이전트 접근 제어와 금액별 보안 분류가 동작하는 상태를 달성한다.

**Phase Numbering:**
- Integer phases (52, 53, ...): Planned milestone work
- Decimal phases (52.1, 52.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 52: 인증 기반** - JWT Secret 관리 + 3종 인증 미들웨어 + 엔드포인트 인증 적용 — completed 2026-02-10
- [x] **Phase 53: 세션 관리** - 세션 CRUD API + 낙관적 갱신 + 안전 장치 — completed 2026-02-10
- [x] **Phase 54: 정책 엔진** - DatabasePolicyEngine + 정책 CRUD API + TOCTOU 방지 — completed 2026-02-10
- [x] **Phase 55: 워크플로우 + Owner 상태** - DELAY/APPROVAL 워크플로우 + Owner 3-State 상태 머신 — completed 2026-02-10
- [x] **Phase 56: 파이프라인 통합** - Stage 2/3/4 실제 구현 + 감사 로그 — completed 2026-02-10
- [x] **Phase 57: 통합 테스트** - 전 구간 인증/정책/워크플로우/Owner 검증 — completed 2026-02-10

#### Phase 52: 인증 기반
**Goal**: API 호출 시 요청자의 신원이 검증되고, 인증 없이는 어떤 엔드포인트도 접근할 수 없는 상태
**Depends on**: v1.1 (Phases 48-51)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, SESS-06
**Success Criteria** (what must be TRUE):
  1. 유효한 wai_sess_ JWT 토큰이 있는 요청만 세션 보호 엔드포인트에 접근할 수 있다
  2. 올바른 X-Master-Password 헤더가 있는 요청만 관리 엔드포인트에 접근할 수 있다
  3. 유효한 SIWS/SIWE 서명이 있는 요청만 Owner 인가 엔드포인트에 접근할 수 있다
  4. 기존 6개 엔드포인트가 인증 없이 호출하면 401/403을 반환한다
  5. JWT Secret이 key_value_store에 안전하게 저장되고 dual-key 로테이션이 동작한다
**Plans**: 2 plans

Plans:
- [x] 52-01: JWT Secret 관리 + sessionAuth 미들웨어
- [x] 52-02: masterAuth + ownerAuth 미들웨어 + authRouter + 기존 엔드포인트 적용

#### Phase 53: 세션 관리
**Goal**: 에이전트가 세션을 생성하여 API에 인증 접근하고, 세션을 갱신/폐기하여 수명 주기를 완전히 제어할 수 있는 상태
**Depends on**: Phase 52
**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04, SESS-05
**Success Criteria** (what must be TRUE):
  1. masterAuth 인증 후 POST /v1/sessions로 에이전트 세션을 생성하면 JWT 토큰이 발급된다
  2. 활성 세션 목록을 조회할 수 있고 세션별 상태(만료, 갱신 횟수 등)를 확인할 수 있다
  3. 세션을 즉시 폐기하면 해당 토큰으로 더 이상 API 접근이 불가능하다
  4. 세션 갱신 시 새 토큰이 발급되고 이전 토큰은 즉시 무효화된다
  5. 갱신 30회 초과, 절대수명 30일 초과, 50% 미만 시점 갱신 시도가 거부된다
**Plans**: 2 plans

Plans:
- [x] 53-01: 세션 생성 + 조회 + 폐기 API
- [x] 53-02: 세션 낙관적 갱신 + 5종 안전 장치

#### Phase 54: 정책 엔진
**Goal**: 모든 거래 요청이 정책 규칙에 따라 4-tier(INSTANT/NOTIFY/DELAY/APPROVAL)로 자동 분류되고, 관리자가 정책을 CRUD할 수 있는 상태
**Depends on**: Phase 52
**Requirements**: PLCY-01, PLCY-02, PLCY-03, PLCY-04, PLCY-05
**Success Criteria** (what must be TRUE):
  1. DatabasePolicyEngine이 policies 테이블에서 규칙을 로드하여 우선순위 순으로 평가한다
  2. SPENDING_LIMIT 규칙으로 금액별 INSTANT/NOTIFY/DELAY/APPROVAL 4단계 분류가 동작한다
  3. WHITELIST 규칙으로 허용/차단 주소 목록 기반 평가가 동작한다
  4. masterAuth explicit 인증 후 정책을 생성/조회/수정/삭제할 수 있다
  5. 동시 거래 시 BEGIN IMMEDIATE + reserved amount로 TOCTOU가 방지된다
**Plans**: 2 plans

Plans:
- [x] 54-01-PLAN.md -- DatabasePolicyEngine TDD (SPENDING_LIMIT 4-tier + WHITELIST evaluation)
- [x] 54-02-PLAN.md -- 정책 CRUD API + TOCTOU 방지 (BEGIN IMMEDIATE + reserved amount)

#### Phase 55: 워크플로우 + Owner 상태
**Goal**: DELAY 거래가 쿨다운 후 자동 실행되고, APPROVAL 거래가 Owner 승인을 거치며, Owner 등록 여부에 따라 보안 수준이 점진적으로 해금되는 상태
**Depends on**: Phase 52, Phase 54
**Requirements**: FLOW-01, FLOW-02, FLOW-03, FLOW-04, FLOW-05, FLOW-06, OWNR-01, OWNR-02, OWNR-03, OWNR-04, OWNR-05, OWNR-06
**Success Criteria** (what must be TRUE):
  1. DELAY 티어 거래가 쿨다운 대기 후 미취소 시 자동 실행되고, 대기 중 취소가 가능하다
  2. APPROVAL 티어 거래가 pending_approvals에 기록되고 Owner가 승인/거절할 수 있다
  3. APPROVAL 미승인 거래가 타임아웃(정책별 > config > 3600초) 후 자동 만료된다
  4. resolveOwnerState()가 NONE/GRACE/LOCKED를 정확히 파생하고, 각 상태에서 Owner 변경/해제 규칙이 적용된다
  5. Owner 미등록 시 APPROVAL 거래가 DELAY로 자동 다운그레이드되고 TX_DOWNGRADED_DELAY 이벤트가 발행된다
**Plans**: 3 plans

Plans:
- [x] 55-01-PLAN.md -- DelayQueue TDD (queueDelay/cancelDelay/processExpired)
- [x] 55-02-PLAN.md -- ApprovalWorkflow TDD (requestApproval/approve/reject/processExpiredApprovals)
- [x] 55-03-PLAN.md -- Owner 3-State 상태 머신 + 다운그레이드 + approve/reject/cancel API routes

#### Phase 56: 파이프라인 통합
**Goal**: 트랜잭션 파이프라인 전 단계가 인증/정책/워크플로우를 실제로 사용하여, 거래 요청이 인증 → 정책 평가 → 대기/승인 → 실행 흐름을 완전히 따르는 상태
**Depends on**: Phase 53, Phase 54, Phase 55
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04
**Success Criteria** (what must be TRUE):
  1. Stage 2(Auth)가 세션 토큰을 검증하고 PipelineContext에 sessionId를 설정한다
  2. Stage 3(Policy)가 DatabasePolicyEngine으로 정책을 평가하여 tier를 결정한다
  3. Stage 4(Wait)가 DELAY 타이머와 APPROVAL 대기를 실행한다
  4. transactions 테이블에 sessionId가 기록되고 감사 추적이 가능하다
**Plans**: 2 plans

Plans:
- [x] 56-01-PLAN.md -- stage2Auth sessionId + stage3Policy evaluateAndReserve + Owner downgrade (TDD)
- [x] 56-02-PLAN.md -- stage4Wait DELAY/APPROVAL branching + BackgroundWorkers integration (TDD)

#### Phase 57: 통합 테스트
**Goal**: 인증/세션/정책/워크플로우/Owner/파이프라인 전 구간이 테스트로 검증되어, 리그레션 없이 다음 마일스톤으로 진행할 수 있는 상태
**Depends on**: Phase 56
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. sessionAuth/masterAuth/ownerAuth 각각 유효/무효/만료 케이스가 테스트로 검증된다
  2. DatabasePolicyEngine의 4-tier 분류, 우선순위 평가, TOCTOU 방지가 테스트로 검증된다
  3. 세션 생성 → 사용 → 갱신 → 폐기 전 흐름이 E2E 테스트로 검증된다
  4. DELAY 대기 → 자동 실행, APPROVAL 승인/거절/만료/취소가 E2E 테스트로 검증된다
  5. Owner NONE → GRACE → LOCKED 전이와 APPROVAL → DELAY 다운그레이드가 테스트로 검증된다
**Plans**: 2 plans

Plans:
- [x] 57-01-PLAN.md -- CLI E2E harness 수정 + auth/policy 커버리지 갭 테스트
- [x] 57-02-PLAN.md -- 세션 라이프사이클 + DELAY/APPROVAL 워크플로우 + Owner 상태 전이 E2E 테스트

## Progress

**Execution Order:**
Phases execute in numeric order: 52 → 53 → 54 → 55 → 56 → 57

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v0.1 Research & Design | 1-5 | 15 | Complete | 2026-02-05 |
| v0.2 Self-Hosted Design | 6-9 | 16 | Complete | 2026-02-05 |
| v0.3 설계 일관성 | 10-13 | 8 | Complete | 2026-02-06 |
| v0.4 테스트 전략 | 14-18 | 9 | Complete | 2026-02-07 |
| v0.5 인증 재설계 | 19-21 | 9 | Complete | 2026-02-07 |
| v0.6 블록체인 확장 | 22-25 | 11 | Complete | 2026-02-08 |
| v0.7 장애 요소 해소 | 26-30 | 11 | Complete | 2026-02-08 |
| v0.8 Owner 선택적 등록 | 31-35 | 11 | Complete | 2026-02-09 |
| v0.9 MCP 세션 자동화 | 36-40 | 10 | Complete | 2026-02-09 |
| v0.10 설계 완결성 | 41-44 | 10 | Complete | 2026-02-09 |
| v1.0 구현 계획 수립 | 45-47 | 5 | Complete | 2026-02-09 |
| v1.1 코어 인프라 | 48-51 | 12 | Complete | 2026-02-10 |
| v1.2 인증 + 정책 엔진 | 52-57 | 13/13 | Complete | 2026-02-10 |

**Total:** 14 milestones shipped, 57 phases completed, 140 plans completed
**v1.2:** 6 phases, 13 plans — SHIPPED 2026-02-10

---

*Last updated: 2026-02-10 after Phase 57 verified — v1.2 milestone complete*
