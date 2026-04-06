---
phase: 02-custody-model
verified: 2026-02-04T13:20:14Z
status: passed
score: 4/4 must-haves verified
---

# Phase 2: 커스터디 모델 분석 Verification Report

**Phase Goal:** AI 에이전트 지갑에 최적화된 커스터디 모델을 분석하고 권장 방식을 제안한다
**Verified:** 2026-02-04T13:20:14Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Custodial/Non-custodial/MPC-TSS 모델이 명확히 비교 분석됨 | ✓ VERIFIED | 04-custody-model-comparison.md 754줄, 각 모델별 장단점/AI 적합성 분석 완료 |
| 2 | AI 에이전트와 기존 WaaS의 차이점이 도출됨 | ✓ VERIFIED | 06-ai-agent-custody-considerations.md 1,429줄, 6가지 시나리오 비교 완료 |
| 3 | Turnkey/Crossmint/Dfns 기능/가격/API가 비교됨 | ✓ VERIFIED | 05-provider-comparison.md 676줄, 6개 프로바이더 상세 분석 완료 |
| 4 | WAIaaS 권장 모델이 근거와 함께 제안됨 | ✓ VERIFIED | 07-recommended-custody-model.md 1,118줄, KMS+TEE+Squads 하이브리드 권장 및 선택 근거/트레이드오프 명시 |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/deliverables/04-custody-model-comparison.md` | Custodial/Non-custodial/MPC-TSS 비교 분석 (CUST-01) | ✓ VERIFIED | 754줄, 3개 모델 각각 장단점/규제/AI 적합성 분석, HSM/KMS/MPC/TEE 직접 구축 옵션 비교 포함 |
| `.planning/deliverables/05-provider-comparison.md` | Turnkey/Crossmint/Dfns 비교표 (CUST-03) | ✓ VERIFIED | 676줄, 6개 프로바이더 보안모델/Solana지원/API/가격 비교, 참고자료로 명시 |
| `.planning/deliverables/06-ai-agent-custody-considerations.md` | AI 에이전트 특화 고려사항 (CUST-02) | ✓ VERIFIED | 1,429줄, 일반사용자 vs AI에이전트 6가지 시나리오 비교, 복합정책 설계, Dual Key 개념 정의 |
| `.planning/deliverables/07-recommended-custody-model.md` | WAIaaS 권장 커스터디 모델 제안서 (CUST-04) | ✓ VERIFIED | 1,118줄, KMS+TEE+Squads 하이브리드 권장, 선택근거 종합, 위험분석, 비용분석, 대안검토 포함 |
| `.planning/deliverables/01-tech-stack-decision.md` | Turnkey 결정 철회 반영 (TECH-01 수정) | ✓ VERIFIED | 수정이력 추가, 키관리 섹션 업데이트 (Turnkey → KMS+TEE+Squads), 철회 표시 명확 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| CUST-04 제안서 | CUST-01 모델 비교 | 분석 참조 | ✓ WIRED | 07-recommended-custody-model.md가 04-custody-model-comparison.md 분석 결과 참조하여 권장안 도출 |
| CUST-04 제안서 | CUST-02 AI 고려사항 | 요구사항 매핑 | ✓ WIRED | 07에서 06의 Dual Key 개념과 복합정책 설계를 권장 아키텍처에 반영 |
| CUST-04 제안서 | CUST-03 프로바이더 비교 | 벤치마킹 참조 | ✓ WIRED | 07에서 05의 프로바이더 기능 비교를 벤치마킹 자료로 활용, 직접 구축 vs 프로바이더 비용 비교 수행 |
| CUST-04 제안서 | TECH-01 기술 스택 | 결정 철회 | ✓ WIRED | 07 권장안에 따라 01의 Turnkey 결정 철회 반영됨 |
| CUST-02 → Phase 3 | 아키텍처 설계 | Dual Key 개념 | ✓ WIRED | 06에서 Dual Key 아키텍처 개념 정의, Phase 3 연결 포인트 명시 |

### Requirements Coverage

| Requirement | Status | Supporting Documents |
|-------------|--------|---------------------|
| CUST-01: Custodial/Non-custodial/MPC-TSS 비교 분석 문서 | ✓ SATISFIED | 04-custody-model-comparison.md - 3개 모델 각각 장단점, 규제적합성, AI적합성 명확히 분석 |
| CUST-02: AI 에이전트 특화 커스터디 고려사항 도출 | ✓ SATISFIED | 06-ai-agent-custody-considerations.md - 일반사용자와 6가지 시나리오 비교, 자율성 제한 복합정책 설계 |
| CUST-03: 주요 프로바이더 비교표 | ✓ SATISFIED | 05-provider-comparison.md - Turnkey/Dfns/Crossmint 포함 6개 프로바이더 기능/가격/API 비교 |
| CUST-04: WAIaaS 권장 커스터디 모델 제안서 | ✓ SATISFIED | 07-recommended-custody-model.md - KMS+TEE+Squads 하이브리드 권장, 선택근거 종합, 위험분석, 비용분석, 트레이드오프 명시 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | - |

**No anti-patterns detected.** All deliverables are substantive documents with:
- Zero TODO/FIXME/placeholder markers
- Complete sections with detailed technical analysis
- Proper conclusions and forward references to Phase 3
- Cross-references between documents
- Code examples and concrete recommendations

---

## Verification Details

### Must-Have 1: Custodial/Non-custodial/MPC-TSS 모델 비교 분석

**Artifact:** `.planning/deliverables/04-custody-model-comparison.md`

**Level 1 - Existence:** ✓ EXISTS (754 lines)

**Level 2 - Substantive:** ✓ SUBSTANTIVE
- Length: 754 lines (well above 15-line minimum)
- Structure: Complete sections for all three models
  - Section 2.1: Custodial (수탁형) - 장점/단점/규제/AI적합성
  - Section 2.2: Non-Custodial (비수탁형) - 장점/단점/규제/AI적합성  
  - Section 2.3: MPC-TSS - 장점/단점/프로토콜비교/AI적합성
- Section 3: 직접 구축 옵션 4가지 (HSM, KMS, 자체 MPC, TEE) 비교
- Section 4: 비교 매트릭스 및 종합 분석
- Section 5: 하이브리드 접근법 권장
- Section 6: 다음 단계 연결
- No stub patterns (0 occurrences of TODO/FIXME/placeholder)

**Level 3 - Wired:** ✓ WIRED
- Referenced by: CUST-04 제안서 (07-recommended-custody-model.md)
- References: 02-RESEARCH.md, 02-CONTEXT.md
- Provides: 권장 아키텍처 도출의 기초 분석

**Content Quality Verification:**
- All three custody models analyzed: YES (grep confirmed Custodial, Non-Custodial, MPC-TSS sections)
- Pros/cons for each: YES (6 sections found: 2.1.2, 2.1.3, 2.2.2, 2.2.3, 2.3.2, 2.3.3)
- AI agent suitability scoring: YES (각 모델별 "AI 에이전트 적합성" 섹션 존재)
- Direct build options: YES (HSM, KMS, TEE 비교 포함)

---

### Must-Have 2: AI 에이전트 특화 고려사항

**Artifact:** `.planning/deliverables/06-ai-agent-custody-considerations.md`

**Level 1 - Existence:** ✓ EXISTS (1,429 lines)

**Level 2 - Substantive:** ✓ SUBSTANTIVE
- Length: 1,429 lines (well above minimum)
- Structure:
  - Section 1: 개요 - 기존 WaaS 가정 vs AI 에이전트 특성
  - Section 2: 일반 사용자 vs AI 에이전트 비교 분석 (6가지 시나리오)
  - Section 3: 자율적 트랜잭션 시나리오 4개
  - Section 4: 자율성 제한 복합 정책 설계 (금액한도/화이트리스트/시간제어/에스컬레이션)
  - Section 5: 에이전트-서버 비밀값 분리 (3가지 옵션 비교)
  - Section 6: 장애 복구 메커니즘 (5가지 유형)
  - Section 7: 위협 모델 (내부 3가지 + 외부 3가지)
  - Section 8: Dual Key 아키텍처 개념
  - Section 9: 규제 고려사항
  - Section 10: 종합 및 Phase 3 연결
- No stub patterns

**Level 3 - Wired:** ✓ WIRED
- Referenced by: CUST-04 제안서 (Dual Key 아키텍처 채택, 복합 정책 반영)
- References: 02-CONTEXT.md, 02-RESEARCH.md
- Provides: AI 에이전트 특화 요구사항 정의

**Content Quality Verification:**
- General user vs AI agent differences: YES (Section 2 with 6 scenarios)
- Comparison count: 16 instances of "일반 사용자" or "AI 에이전트" comparisons
- Autonomy limitation policies: YES (4가지 정책 유형 상세 설계)
- Dual Key concept introduction: YES (Section 8, Phase 3 연결 명시)

---

### Must-Have 3: Turnkey/Crossmint/Dfns 비교표

**Artifact:** `.planning/deliverables/05-provider-comparison.md`

**Level 1 - Existence:** ✓ EXISTS (676 lines)

**Level 2 - Substantive:** ✓ SUBSTANTIVE
- Length: 676 lines
- Structure:
  - Preface: 참고 자료로만 활용한다는 명확한 공지
  - Section 2.1: Turnkey (보안모델, Solana지원, 정책엔진, API, 가격)
  - Section 2.2: Dfns (MPC아키텍처, Solana지원, API, 가격)
  - Section 2.3: Crossmint (AI특화기능, Dual Key, API, 가격)
  - Section 2.4-2.6: Privy, Dynamic, Capsule 추가 분석
  - Section 3: 기능 비교 매트릭스
  - Section 4: 비용 비교 (프로바이더 vs 직접 구축)
  - Section 5: AI 에이전트 적합성 분석
  - Section 6: 벤치마킹 결론
- No stub patterns

**Level 3 - Wired:** ✓ WIRED
- Referenced by: CUST-04 제안서 (벤치마킹 자료로 활용, 비용 비교 인용)
- Status: 참고 자료 (외부 프로바이더 배제 결정에 따라)
- Provides: 업계 표준 기능 벤치마킹

**Content Quality Verification:**
- All three required providers: YES (Turnkey, Dfns, Crossmint 섹션 확인)
- Feature/price/API analysis: YES (54 instances of "기능|가격|API" in headings)
- Additional providers: YES (Privy, Dynamic, Capsule 추가 분석으로 총 6개)
- Cost comparison: YES (5년 기준 프로바이더 $90K vs 직접구축 $57.6K)

---

### Must-Have 4: WAIaaS 권장 커스터디 모델 제안서

**Artifact:** `.planning/deliverables/07-recommended-custody-model.md`

**Level 1 - Existence:** ✓ EXISTS (1,118 lines)

**Level 2 - Substantive:** ✓ SUBSTANTIVE
- Length: 1,118 lines
- Structure:
  - Section 1: Executive Summary (권장 모델, 핵심 구성, 선택 이유)
  - Section 2: 권장 아키텍처 개요 (다이어그램, Dual Key 설명)
  - Section 3: 구성 요소별 상세 분석
    - 3.1: Owner Key (AWS KMS) - 역할/선택근거/구현/보안/비용
    - 3.2: Agent Key (Nitro Enclaves) - 역할/선택근거/구현/격리/비용
    - 3.3: Squads Protocol - 역할/선택근거/구현/정책/비용
  - Section 4: 선택 근거 종합 (배제된 옵션과 이유)
  - Section 5: AI 에이전트 요구사항 충족 매핑
  - Section 6: 구현 로드맵
  - Section 7: 위험 요소 및 완화 방안 (6개 위험, 상세 완화 전략)
  - Section 8: 비용 분석 (초기/운영/5년 총계, ROI)
  - Section 9: 대안 검토
  - Section 10: 결론 및 Phase 3 연결
  - Section 11: 참조 문서
- No stub patterns
- Includes code examples, diagrams, specific implementation guidance

**Level 3 - Wired:** ✓ WIRED
- References: CUST-01, CUST-02, CUST-03 (10 references confirmed)
- Synthesizes: All prior phase analysis into final recommendation
- Triggers: TECH-01 update (Turnkey withdrawal)
- Connects: Phase 3 architecture design (5 specific handoff points)

**Content Quality Verification:**
- Recommendation specified: YES (AWS KMS + Nitro Enclaves + Squads Protocol)
- Selection rationale: YES (Section 4 - 근거 종합)
- Tradeoffs documented: YES (Section 7 - 6개 위험과 완화방안)
- Cost analysis: YES (Section 8 - 36% savings over 5 years)
- Alternative consideration: YES (Section 9 - 대안 검토)
- Phase 3 handoff: YES (Section 10.3 - 5 specific connection points)

---

## Phase Goal Achievement Assessment

**Phase Goal:** AI 에이전트 지갑에 최적화된 커스터디 모델을 분석하고 권장 방식을 제안한다

**Achievement Status:** ✓ GOAL ACHIEVED

### Evidence:

1. **분석 완료:**
   - 3가지 커스터디 모델 (Custodial/Non-custodial/MPC-TSS) 비교 완료
   - 4가지 직접 구축 옵션 (HSM/KMS/MPC/TEE) 비교 완료
   - 6개 외부 프로바이더 벤치마킹 완료

2. **AI 에이전트 최적화 분석:**
   - 일반 사용자 vs AI 에이전트 6가지 시나리오 비교
   - AI 특화 요구사항 도출 (자율성, 상시운영, 고빈도, 정책기반)
   - 복합 정책 설계 (4가지 유형)

3. **권장 방식 제안:**
   - 명확한 권장안: AWS KMS + Nitro Enclaves + Squads Protocol 하이브리드
   - 선택 근거 종합 (보안성, 자율성, 통제권 균형)
   - 트레이드오프 분석 (6개 위험 + 완화방안)
   - 비용 분석 (5년 기준 36% 절감)
   - 구현 로드맵 (5단계)

4. **설계 결정 완료:**
   - Dual Key Architecture 개념 정의 (Owner Key + Agent Key)
   - 정책 기반 자율성 프레임워크 설계
   - 직접 구축 방향 확정 (외부 프로바이더 배제)
   - Phase 1 Turnkey 결정 철회 반영

5. **Phase 3 준비 완료:**
   - 5개 명확한 연결 포인트 (KMS 키 생성, Enclave 구축, Squads 통합, 정책 엔진, 장애 복구)
   - 각 구성 요소별 구현 가이드 제공
   - 기술 스택 확정 (TECH-01 업데이트)

### Success Criteria Verification:

| Criterion | Status | Evidence |
|-----------|--------|----------|
| 1. Custodial/Non-custodial/MPC-TSS 모델 비교 문서에 각 모델의 장단점이 명확히 분석됨 | ✓ MET | 04-custody-model-comparison.md: 3개 모델 각각 장점/단점/규제/AI적합성 섹션 완료 |
| 2. AI 에이전트 특화 고려사항 문서에 기존 WaaS와의 차이점이 도출됨 | ✓ MET | 06-ai-agent-custody-considerations.md: 일반사용자 vs AI에이전트 6가지 시나리오 비교 완료 |
| 3. Turnkey/Crossmint/Dfns 비교표에 기능, 가격, API 특성이 정리됨 (참고 자료) | ✓ MET | 05-provider-comparison.md: 3개 필수 + 3개 추가 프로바이더 기능/가격/API 비교 완료 |
| 4. WAIaaS 권장 커스터디 모델 제안서에 선택 근거와 트레이드오프가 명시됨 | ✓ MET | 07-recommended-custody-model.md: KMS+TEE+Squads 권장, 선택근거 종합, 위험/비용 분석 포함 |

**All 4 success criteria met.**

---

## Next Phase Readiness

### Phase 3 Prerequisites: ✓ READY

**Architectural foundation established:**
- Dual Key Architecture concept defined (Owner Key + Agent Key)
- Technology stack confirmed (AWS KMS ED25519 + Nitro Enclaves + Squads v4)
- Policy framework designed (4 policy types)
- Security model established (3-tier policy enforcement)

**Handoff points defined:**

| Phase 3 Task | Reference Document | Section |
|--------------|-------------------|---------|
| AWS KMS key generation | CUST-04 | 3.1 Owner Key 관리 |
| Nitro Enclave setup | CUST-04 | 3.2 Agent Key 런타임 |
| Squads integration | CUST-04 | 3.3 온체인 권한 제어 |
| Policy engine design | CUST-02 | 4. 자율성 제한 복합 정책 설계 |
| Failure recovery | CUST-02 | 6. 장애 복구 메커니즘 |

**No blockers identified.**

---

_Verified: 2026-02-04T13:20:14Z_
_Verifier: Claude (gsd-verifier)_
