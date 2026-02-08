# Project Research Summary

**Project:** WAIaaS v0.8 - Owner 선택적 등록 + 점진적 보안 모델
**Domain:** Self-hosted AI agent wallet daemon with progressive security unlock
**Researched:** 2026-02-08
**Confidence:** HIGH (14개 기존 설계 문서 + objectives 직접 분석 기반)

## Executive Summary

v0.8 마일스톤은 WAIaaS의 Owner 등록을 필수에서 선택으로 전환하고, Owner 등록 여부에 따라 보안 기능이 점진적으로 해금되는 모델을 설계한다. 이는 Argent의 Guardian 점진적 모델과 Safe의 선택적 보안 확장 패턴을 AI 에이전트 지갑 컨텍스트에 맞게 변형한 것이다. 가장 중요한 발견은 **v0.8이 새로운 라이브러리나 시스템을 추가하지 않는다는 점**이다. 기존 스택(Drizzle ORM, @solana-program/token, Hono)으로 모든 기능을 구현할 수 있으며, 변경의 본질은 "Owner가 반드시 있다"는 가정을 "Owner가 있을 수도, 없을 수도 있다"로 전환하는 것이다.

기술적 핵심은 세 가지 패턴 확장에 있다: (1) SQLite 테이블 재생성 마이그레이션으로 owner_address nullable 전환, (2) PolicyEngine evaluate()의 9단계 직후 APPROVAL 다운그레이드 삽입, (3) owner_verified 플래그 기반의 유예/잠금 2단계 생명주기. 이 변경은 기존 6-stage 파이프라인, 8-state 트랜잭션 상태 머신, 3-tier 인증 모델의 구조를 건드리지 않으면서 owner-presence 조건 분기만 주입한다.

핵심 위험은 상태 전이 레이스 컨디션과 보안 다운그레이드 공격이다. 특히 유예 구간(owner_verified = 0)에서 잠금 구간(owner_verified = 1)으로 전이하는 순간에 masterAuth 탈취 시 Owner 주소를 변경할 수 있는 윈도우가 존재한다. 이를 방어하려면 BEGIN IMMEDIATE 트랜잭션으로 owner_verified 전이를 원자화하고, 유예 구간 시간 제한(1시간)을 도입해야 한다. 자금 회수(sweepAll)의 부분 실패 시 잔여 자산 고립과 APPROVAL 다운그레이드 시 Owner 등록/제거 레이스 컨디션도 실행 시점 재검증으로 완화한다.

## Key Findings

### Recommended Stack

v0.8은 **추가 의존성 제로(0)**이다. 모든 기능은 기존 스택의 패턴 확장으로 구현 가능하다.

**핵심 스택 (v0.1-v0.7 확정, v0.8 변경 없음):**
- **Drizzle ORM** (0.45.x): agents 테이블 스키마 변경 (owner_address nullable + owner_verified 추가), SQLite NOT NULL 제거 시 테이블 재생성 마이그레이션 필요 — 커스텀 SQL 작성 (`--custom` 플래그)
- **@solana-program/token** (v0.6 추가): sweepAll의 `getCloseAccountInstruction` 제공 — SPL 토큰 계정 폐쇄로 rent 회수
- **Hono** (4.x): 미들웨어 체인 구조 유지, Owner 유무 분기는 미들웨어 내부 조건 로직으로 처리
- **Node.js** (22.x), **jose** (JWT HS256), **viem** (EVM stub), **@solana/kit** (3.x): 모두 변경 없음

**v0.8 패턴 변경:**
1. **SQLite NOT NULL 제거 마이그레이션**: ALTER TABLE로 직접 제거 불가, create-copy-rename 패턴의 수동 마이그레이션 필요. Drizzle-kit의 자동 생성에 의존하지 않고 커스텀 SQL 작성 (PRAGMA foreign_keys OFF 후 트랜잭션 내 실행).
2. **sweepAll 배치 구현**: 기존 buildBatch() (v0.6 추가)를 활용하여 토큰별 `transfer + closeAccount`를 원자적 배치로 묶음. SOL 전송은 반드시 마지막 (tx fee 확보).
3. **조건부 미들웨어**: Hono `hono/combine`의 `every`, `some`, `except`는 라우트 레벨 분기에 유용하지만, v0.8의 Owner 유무 분기는 요청별 런타임 데이터(DB agent 조회)에 기반하므로 미들웨어 내부 조건 분기가 적합.

**스택 위험도: LOW** — 새로운 라이브러리 없음, 검증된 패턴 확장만 수행.

### Expected Features

**Table Stakes (필수 8개):**
1. **Owner 없는 에이전트 생성 및 운영** (TS-1): `--owner` 플래그 없이 에이전트 생성, INSTANT/NOTIFY/DELAY 범위 내에서 완전 동작. agents.owner_address = NULL, owner_verified = 0.
2. **APPROVAL 다운그레이드** (TS-2): Owner 없는 에이전트에서 APPROVAL 티어 거래를 차단하지 않고 DELAY로 자동 다운그레이드. evaluate() 9단계 직후 삽입. downgraded 플래그로 알림에 Owner 등록 안내 포함.
3. **Owner 주소 등록** (TS-3): masterAuth만으로 사후 등록. 서명 불필요 (주소는 공개 정보). 등록 즉시 APPROVAL 해금 + 자금 회수 가능.
4. **Owner 주소 변경** (TS-4): 유예/잠금 2단계. 유예(owner_verified = 0)에서는 masterAuth만, 잠금(owner_verified = 1)에서는 ownerAuth(기존 주소) + masterAuth 필요. 잠금 구간에서 Owner 해제는 불가 (보안 다운그레이드 방지).
5. **자금 회수 (sweepAll)** (TS-5): Owner 등록된 에이전트의 모든 자산(네이티브 + 토큰 + rent)을 owner_address로 전량 회수. 수신 주소 고정 → masterAuth만으로 안전. Solana: transfer + closeAccount 배치 → SOL 전량 전송 순서 엄수.
6. **Kill Switch 복구 분기** (TS-6): Owner 없음 → masterAuth + 24시간, Owner 있음 → ownerAuth + masterAuth + 30분. 시간으로 보안 수준 보상.
7. **세션 갱신 분기** (TS-7): Owner 없음 → 즉시 확정 (거부 윈도우 없음), Owner 있음 → 1시간 거부 윈도우 활성.
8. **다운그레이드 알림 + Owner 등록 안내** (TS-8): downgraded 플래그 시 알림에 CLI 명령어 안내 포함. 자연스러운 보안 업그레이드 유도.

**Differentiators (차별화 4개):**
1. **유예/잠금 2단계 생명주기** (DF-1): Argent의 시간 딜레이, Safe의 m-of-n과 다른 "행동 기반 전환". ownerAuth 사용 전에는 유연(오타 교정), 사용 후에는 강력(기존 Owner 서명 필요).
2. **APPROVAL 다운그레이드 + 안내 유도** (DF-2): ElizaOS(보호 없음)와 Coinbase(항상 통제) 사이의 유일한 점진적 위치. 강제 없이 보안 강화 유도.
3. **Owner 유무별 Kill Switch 시간 보상** (DF-3): 이중 인증 부재를 시간(24h)으로 대체. 대부분의 지갑은 고정 시간만 제공.
4. **자금 회수의 목적지 고정 보안** (DF-4): withdraw(to: any address) 대신 owner_address로만 전송. masterAuth 유출 시에도 공격자 이득 없음.

**Anti-Features (의도적 비구현 6개):**
1. **다중 Owner (AF-1)**: 복잡성 폭발. 에이전트 1개 = 관리자 1명이 자연스러운 모델. 필요 시 Owner 주소를 multi-sig로 설정.
2. **Owner 없는 에이전트의 APPROVAL 차단 (AF-2)**: DELAY 다운그레이드로 시간 보호 유지, 완전 차단은 자율성 제한.
3. **Owner 등록 시 서명 요구 (AF-3)**: 온보딩 마찰. 서명 검증은 ownerAuth 첫 사용 시점에 수행.
4. **잠금 구간에서 Owner 해제 (AF-4)**: 보안 다운그레이드 공격 경로. Bybit 해킹 ($1.4B) 사례.
5. **Owner 등록 시간 딜레이 (AF-5)**: 에이전트 지갑은 즉시 APPROVAL 해금 기대. 딜레이 불필요.
6. **Kill Switch 상태에서 보안 설정 변경 (AF-6)**: 긴급 정지 후 Owner 변경 공격 방지.

### Architecture Approach

v0.8은 **새로운 시스템 추가가 아니라 기존 시스템에 owner-presence 조건 분기를 주입**한다. 아키텍처 변경은 4개 레이어로 구성된다:

**Layer 0 (데이터 모델):**
- `agents.owner_address` NOT NULL → nullable (SQLite 테이블 재생성 마이그레이션)
- `agents.owner_verified` INTEGER 추가 (0/1 플래그)
- PolicyDecision.downgraded, OwnerState, SweepResult 타입 정의

**Layer 1 (핵심 도메인 로직, 병렬 구현 가능):**
1. **OwnerLifecycleService**: 등록/변경/해제 + 유예/잠금 상태 머신. ownerAuth 첫 사용 시 자동 잠금 전환.
2. **SolanaAdapter.sweepAll**: getAssets → 토큰별 transfer+closeAccount 배치 → SOL 전량 전송.
3. **DatabasePolicyEngine**: evaluate() Step 9.5에 APPROVAL 다운그레이드 삽입.

**Layer 2 (통합 서비스):**
- **WithdrawService**: sweepAll 오케스트레이션 + 정책 엔진 우회 (owner_address 고정으로 안전)
- **KillSwitchService**: 복구 대기 시간 분기 (30min vs 24h)
- **SessionRenewalService**: 거부 윈도우 분기

**Layer 3 (외부 인터페이스):**
- REST API: withdraw 엔드포인트, agent create --owner 선택적
- CLI: set-owner / remove-owner 신규, agent info 출력에 보안 수준 표시
- NotificationService: 다운그레이드 알림 템플릿 + Owner 등록 안내

**Major Components:**
1. **OwnerPresenceGuard** — resolveOwnerState(agent) 공통 유틸리티, 3-state 판정 (NONE / GRACE / LOCKED)
2. **OwnerLifecycleService** — 등록/변경/해제 비즈니스 로직, ownerAuth 미들웨어와 통합하여 자동 잠금 전환
3. **WithdrawService** — 자금 회수 오케스트레이션, HTTP 207 부분 성공 처리

**변경하지 않는 컴포넌트:**
- TransactionPipeline (6-stage), StateMachine (8-state), IPriceOracle, ActionProvider — 모두 Owner 유무와 무관

### Critical Pitfalls

**1. Grace-to-Locked 전이 레이스 컨디션 (C-01)**
**위험:** 유예→잠금 전이 시 masterAuth 탈취 → 공격자 주소로 변경 → 잠금 전환 → 원래 사용자는 변경 불가. BEGIN IMMEDIATE 트랜잭션으로 owner_verified 전이 원자화 필수. 주소 변경 API에서 owner_verified 재확인 (FOR UPDATE 패턴).

**2. Security Downgrade Attack (C-02)**
**위험:** 유예 구간에서 masterAuth로 Owner 제거 → APPROVAL이 DELAY로 다운그레이드. 유예 구간 시간 제한 (1시간) 도입, Owner 등록/제거 시 전 채널 알림, remove-owner에 5분 쿨다운 적용.

**3. sweepAll 부분 실패 시 잔여 자산 고립 (C-03)**
**위험:** 토큰 전송 실패 시 SOL이 이미 전송되어 재시도 fee 부족. SOL 전송을 반드시 마지막에 실행, 토큰별 transfer+closeAccount를 같은 배치에 원자적으로 묶기, 부분 실패 시 자동 재시도 (최대 3회), sweepAll 전용 SOL 예약 (토큰 수 x 5000 lamports).

**4. APPROVAL->DELAY 다운그레이드 레이스 컨디션 (H-01)**
**위험:** Owner 등록 직후 DELAY 대기 중인 거래가 Owner 서명 없이 실행. DELAY 만료 시 실행 시점 재검증 (re-validate), Owner 변경 시 pending queue 재분류.

**5. 유예 구간 withdraw 자금 탈취 (H-02)**
**위험:** masterAuth 탈취 → set-owner 공격자 주소 → 즉시 withdraw. 유예 구간에서 withdraw 비활성화 (owner_verified = 1에서만 활성) 권장. 또는 유예 구간 withdraw 시 강제 1시간 대기 + 전 채널 알림.

## Implications for Roadmap

v0.8은 설계 마일스톤이므로 코드 구현이 아닌 **14개 설계 문서 수정**이 산출물이다. 그러나 향후 구현 마일스톤 (v1.1-v1.7)에서의 작업 순서를 권장한다.

### Phase 1: 데이터 모델 + 핵심 유틸리티 (Foundation)
**Rationale:** agents 테이블 변경이 모든 기능의 전제 조건. owner_address nullable + owner_verified 추가가 완료되어야 후속 기능 구현 가능.

**Delivers:**
- agents 테이블 스키마 변경 (DDL + 마이그레이션 SQL)
- OwnerState, PolicyDecision.downgraded, SweepResult 타입 정의
- IChainAdapter.sweepAll 시그니처 추가 (19->20)
- OwnerPresenceGuard: resolveOwnerState() 구현

**Addresses:** TS-1 (Owner 없는 에이전트 생성)

**Avoids:** M-01 (SQLite NOT NULL 마이그레이션 리스크) — 수동 커스텀 SQL, PRAGMA foreign_keys OFF

**Phase 순서:** 최우선 — Layer 0 완료 후 Layer 1-3 병렬 진행 가능

---

### Phase 2A: Owner 생명주기 (병렬 가능)
**Rationale:** 등록/변경/해제 로직은 다른 기능의 전제 조건 (Owner 유무 판단 함수). Phase 1 완료 후 즉시 구현 가능.

**Delivers:**
- OwnerLifecycleService: 등록/변경/해제 비즈니스 로직
- 유예/잠금 2단계 상태 머신
- ownerAuth 미들웨어와 통합 (자동 잠금 전환)
- CLI: set-owner / remove-owner 명령

**Addresses:** TS-3 (Owner 등록), TS-4 (Owner 변경), DF-1 (유예/잠금 생명주기)

**Avoids:** C-01 (Grace-to-Locked 레이스 컨디션), C-02 (Security Downgrade Attack)

**Uses:** Drizzle ORM (조건부 UPDATE), Hono ownerAuth 미들웨어

---

### Phase 2B: 정책 엔진 다운그레이드 (병렬 가능)
**Rationale:** evaluate() 9단계 직후 삽입만 필요. Owner 유무 판단 함수(OwnerPresenceGuard)에 의존하지만 OwnerLifecycleService와는 독립.

**Delivers:**
- DatabasePolicyEngine: evaluate() Step 9.5 다운그레이드 로직
- PolicyDecision.downgraded 플래그 처리
- 알림: 다운그레이드 발생 시 Owner 등록 안내 템플릿

**Addresses:** TS-2 (APPROVAL 다운그레이드), TS-8 (다운그레이드 알림), DF-2 (안내 유도)

**Avoids:** H-01 (APPROVAL 다운그레이드 레이스 컨디션) — 실행 시점 재검증

**Uses:** 기존 PolicyEngine 11단계 알고리즘, NotificationService 확장

---

### Phase 2C: sweepAll 구현 (병렬 가능)
**Rationale:** SolanaAdapter 확장. getAssets, buildBatch는 v0.6에서 이미 존재. Owner 등록 기능과 독립적으로 구현 가능.

**Delivers:**
- SolanaAdapter.sweepAll: getAssets → 토큰 배치 전송 → SOL 전량 전송
- getCloseAccountInstruction 활용 (rent 회수)
- 부분 실패 처리 (207 응답 + failed 배열)

**Addresses:** TS-5 (자금 회수 일부), IChainAdapter 확장

**Avoids:** C-03 (sweepAll 부분 실패 자산 고립) — SOL 마지막, 자동 재시도, fee 예약

**Uses:** @solana-program/token (getCloseAccountInstruction), buildBatch (v0.6)

---

### Phase 3: 통합 서비스 + API (Orchestration)
**Rationale:** Phase 2A-C 완료 후 통합. WithdrawService는 OwnerLifecycle + sweepAll 조합. Kill Switch, Session은 Owner 유무 분기만 추가.

**Delivers:**
- WithdrawService: sweepAll 오케스트레이션 + 정책 엔진 우회
- KillSwitchService: 복구 대기 시간 분기 (30min vs 24h)
- SessionRenewalService: 거부 윈도우 분기
- REST API: POST /v1/owner/agents/:id/withdraw
- CLI: waiaas withdraw --agent <name> --scope all

**Addresses:** TS-5 (자금 회수 완료), TS-6 (Kill Switch 분기), TS-7 (세션 갱신 분기), DF-3, DF-4

**Avoids:** H-02 (유예 구간 withdraw 자금 탈취), H-03 (Kill Switch 복구 시간 역전)

**Uses:** WithdrawService, KillSwitchService 기존 구조 확장

---

### Phase 4: 설계 문서 수정 (Design Doc Updates)
**Rationale:** 14개 기존 설계 문서 수정. 코드 변경과 병렬로 진행 가능하나, cross-reference drift 방지 위해 순서 고정 권장.

**Delivers:**
- 25-sqlite (agents 스키마), 52-auth (ownerAuth 선택적), 33-time-lock (다운그레이드), 34-owner (생명주기), 37-rest-api (withdraw), 27-chain-adapter (sweepAll), 31-solana (sweepAll 구현), 36-killswitch (복구 분기), 30/53-session (갱신 분기), 35-notification (알림 템플릿), 54-cli (set-owner/remove-owner), 28-daemon, 40-telegram
- Owner 상태 분기 매트릭스 (decision matrix) — 각 API x Owner 유무 x 유예/잠금 조합

**Addresses:** H-04 (14개 문서 일관성 붕괴), M-04 (기존 테스트 시나리오 무효화)

**Avoids:** Cross-reference drift — 문서 수정 순서 고정 (25→52→33→34→37→나머지)

---

### Phase Ordering Rationale

1. **데이터 모델 먼저 (Phase 1):** owner_address nullable + owner_verified는 모든 기능의 전제. 첫 구현 마일스톤 (v1.1)에서 최초 DB 생성 시 v0.8 스키마 반영하면 마이그레이션 문제 회피.

2. **Phase 2A-C 병렬 구현 가능:** OwnerLifecycle, PolicyEngine 다운그레이드, sweepAll은 서로 의존하지 않음. Phase 1 완료 후 동시 진행 가능. 단, OwnerPresenceGuard는 공통 의존으로 Phase 1에서 먼저 구현.

3. **Phase 3 통합 (Orchestration):** WithdrawService는 OwnerLifecycle + sweepAll 조합이므로 Phase 2A+2C 완료 후. Kill Switch, Session 분기는 Owner 유무 판단만 필요하므로 Phase 2A 완료 후 가능.

4. **Phase 4 문서 수정 병렬/순차 선택:** 코드 구현과 병렬 진행 가능하나, cross-reference drift 방지 위해 순서 고정 권장 (25→52→33→34→37→나머지). v0.3 교훈 (5개 대응표 작성에 전체 마일스톤 소요) 반복 방지.

5. **복잡도 순서:** TS-1 (Low) → TS-2 (Medium) → TS-3 (Low) → TS-4 (Medium) → TS-6/7 (Low-Medium) → TS-5 (High) → TS-8 (Low). sweepAll (TS-5)이 가장 높은 구현 복잡도이므로 마지막 권장.

### Research Flags

**Needs research:**
- **Phase 2C (sweepAll):** Solana Token-2022 확장 토큰의 엣지 케이스 (permanent_delegate, frozen 토큰) 검증 필요. Solana CloseAccount 조건 (잔액 0, owner 권한) 재확인.
- **Phase 3 (Withdraw):** Kill Switch ACTIVATED 상태에서 withdraw 허용 여부 구현 시 최종 결정 필요. v0.8 objective에서 "구현 시 결정"으로 남겨둠.

**Standard patterns (skip research-phase):**
- **Phase 1 (DB 스키마):** SQLite 테이블 재생성 패턴은 25-sqlite-schema.md 섹션 4.6에 이미 정의, v0.5 마이그레이션 경험 있음.
- **Phase 2A (Owner 생명주기):** Argent Guardian 모델 선례 명확, 2-state 전환은 단순 플래그로 충분 (XState 같은 라이브러리 불필요).
- **Phase 2B (PolicyEngine):** evaluate() 11단계 알고리즘에 1개 조건 분기 삽입만 필요. 패턴 명확.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | 추가 의존성 제로, 기존 패턴 확장만 수행. Drizzle, @solana-program/token, Hono 공식 문서 검증 완료. |
| Features | HIGH | v0.8 objective에서 8개 필수 + 4개 차별화 + 6개 안티 확정. Argent, Safe, Coinbase AgentKit 선례 교차 검증. |
| Architecture | HIGH | 14개 기존 설계 문서 직접 분석. 4-layer 빌드 순서는 의존 그래프 기반. Layer 1A-C 병렬 가능성 확인. |
| Pitfalls | MEDIUM-HIGH | Critical 3개 (레이스 컨디션, 보안 다운그레이드, sweepAll 부분 실패)는 PortSwigger 연구 + Argent/Bybit 사례 기반. SQLite 마이그레이션 위험은 Drizzle 이슈 교차 검증. 알림 피로 (M-05)는 UX 패턴 추론. |

**Overall confidence:** HIGH (설계 변경 범위 명확, 기존 스택 활용 전략 검증됨)

### Gaps to Address

1. **유예 구간 시간 제한 도입 여부:** C-02 Prevention에서 제시한 "Owner 등록 후 최대 1시간까지만 유예 구간" 도입 시 owner_verified 플래그만으로 부족 (M-03). owner_registered_at 타임스탬프 추가 또는 owner_status enum 전환 검토 필요. v0.8 설계 문서 수정 시 결정.

2. **유예 구간에서 withdraw 정책:** H-02에서 4가지 방안 제시 (강제 대기, 주소 변경 후 차단, ownerAuth 요구, 비활성화). v0.8 objective 5.2절에서 "masterAuth만으로 안전"이라고 하지만, 유예 구간에서는 주소 변경 가능하므로 안전하지 않음. **추천: 유예 구간 withdraw 비활성화 (owner_verified = 1에서만 활성)**. v1.2 구현 시 최종 결정.

3. **Kill Switch 상태에서 withdraw 허용 여부:** Phase 3에서 "구현 시 결정". killSwitchGuard 허용 목록에 withdraw 추가 (방안 A) vs 데몬 내부 직접 실행 (방안 B). v0.8 objectives 섹션 5.5에서 방안 A 권장 (owner_address로만 전송되므로 공격자 이득 없음).

4. **sweepAll 부분 실패 재시도 메커니즘:** C-03에서 자동 재시도 권장하지만, 재시도 로직의 복잡성 (blockhash 만료, 네트워크 일시 장애 vs 구조적 실패 구분, SOL fee 예약 계산)은 구현 시 검증 필요. HTTP 207 응답으로 failed 배열 반환 + CLI `sweep-retry` 명령 제공하는 방식도 고려.

5. **14개 설계 문서 수정 순서와 일관성:** H-04에서 제시한 Owner 상태 분기 매트릭스를 SSoT로 먼저 작성. 각 API 엔드포인트 x Owner 유무 (NONE/GRACE/LOCKED) 조합의 동작을 하나의 표로 정의한 뒤 문서 수정 시작. v0.3 패턴 재사용 (enum/타입 통합 대응표).

## Sources

### PRIMARY (HIGH confidence)

**Official Documentation:**
- [Drizzle ORM Custom Migrations](https://orm.drizzle.team/docs/kit-custom-migrations) — `--custom` 플래그 워크플로우
- [SQLite ALTER TABLE Limitations](https://www.sqlite.org/lang_altertable.html) — NOT NULL 제거 불가 제약
- [Solana Close Token Account](https://solana.com/docs/tokens/basics/close-account) — getCloseAccountInstruction API, 잔액 0 필수
- [@solana-program/token Documentation](https://www.solana-program.com/docs/token) — closeAccount instruction
- [Hono Middleware Guide](https://hono.dev/docs/guides/middleware) — 커스텀 미들웨어 패턴
- [Hono Combine Middleware](https://hono.dev/docs/middleware/builtin/combine) — every, some, except API

**Project-Internal (v0.2-v0.7 확정 설계):**
- WAIaaS v0.8 objective (objectives/v0.8-optional-owner-progressive-security.md) — 설계 변경 명세 전문
- WAIaaS v1.0 implementation planning (objectives/v1.0-implementation-planning.md) — 구현 마일스톤 매핑
- 25-sqlite-schema.md 섹션 4.6 — 테이블 재생성 패턴 (v0.2 정의)
- 27-chain-adapter-interface.md — IChainAdapter 19 메서드 (v0.7 확정)
- 29-api-framework-design.md 섹션 2.1 — 10단계 미들웨어 체인
- 33-time-lock-policy.md — evaluate() 11단계 알고리즘
- 52-auth-redesign.md — 3-tier 인증 모델 (v0.5 확정)

### SECONDARY (MEDIUM confidence)

**Ecosystem Patterns:**
- [Argent Guardian Model](https://www.ready.co/blog/a-new-era-for-crypto-security) — 36시간 딜레이, 첫 Guardian 즉시
- [Argent Guardian Addition](https://support.argent.xyz/hc/en-us/articles/360008013258-How-to-add-a-guardian) — 36시간 딜레이 확인
- [Cantina: Smart Wallet Recovery Attack Paths](https://cantina.xyz/blog/smart-wallet-social-recovery-risks) — Guardian rotation 공격
- [Safe Multisig Best Practices](https://frameworks.securityalliance.org/wallet-security/secure-multisig-best-practices/) — 타임락, Owner 관리
- [Coinbase AgentKit](https://docs.cdp.coinbase.com/agent-kit/welcome) — Owner 기반 Smart Wallet
- [a16z Agent Payments](https://a16z.com/newsletter/agent-payments-stack/) — 지출 한도, 승인 워크플로우

**Technical Issues:**
- [Drizzle ORM Issue #1313](https://github.com/drizzle-team/drizzle-orm/issues/1313) — SQLite push 시 테이블 재생성 데이터 손실
- [Drizzle ORM Issue #2795](https://github.com/drizzle-team/drizzle-orm/issues/2795) — ALTER TABLE 기본값 미보존
- [PortSwigger - Smashing the State Machine](https://portswigger.net/research/smashing-the-state-machine) — HTTP 요청 간 레이스 컨디션

### TERTIARY (LOW confidence, needs validation)

- [Bybit 해킹 분석](https://mamk13.medium.com/top-blockchain-security-breaches-of-2025-a-year-end-post-mortem-new-years-lessons-babb33f97a95) — Owner 변경 공격 $1.4B (WebSearch 단일 소스)
- [Unleash Protocol 해킹](https://mamk13.medium.com/top-blockchain-security-breaches-of-2025-a-year-end-post-mortem-new-years-lessons-babb33f97a95) — 타임락 부재 $3.9M (WebSearch 단일 소스)
- Kill Switch 복구 시간 역전 공격 (H-03) — 특정 사례 미발견, 아키텍처적 추론 기반
- 알림 피로 패턴 (M-05) — 일반 UX 원칙 적용, 크립토 지갑 특화 연구 미발견

---
*Research completed: 2026-02-08*
*Ready for roadmap: yes*
