# Phase 25 Plan 03: 기능 계층 문서 3개 v0.6 통합 Summary

**One-liner:** PolicyType 10개 + evaluate() 11단계를 33-time-lock에, discriminatedUnion 5-type + IPriceOracle + actionSource를 32-pipeline에, SPL/Token-2022 + getAssets + buildApprove/buildBatch를 31-solana에 통합

---

## Metadata

- **Phase:** 25-test-strategy-doc-integration
- **Plan:** 03
- **Subsystem:** document-integration
- **Tags:** policy-engine, pipeline, solana-adapter, SPL, Token-2022, IPriceOracle, v0.6-integration
- **Duration:** ~15min
- **Completed:** 2026-02-08

---

## Dependency Graph

- **Requires:** Phase 22-24 (CHAIN-EXT-01~08 소스 문서), Plan 25-02 (SSoT 3개 업데이트)
- **Provides:** v0.6 통합된 기능 계층 문서 3개 (33-time-lock, 32-pipeline, 31-solana)
- **Affects:** 25-04 (후속 2개 문서 통합 시 파이프라인/어댑터 참조)

---

## Tech Tracking

- **Patterns established:** 인라인 마킹 패턴 (`(v0.6 추가)`, `(v0.6 변경)`, `(v0.6 정식 설계)`) 일관 적용
- **Key files modified:**
  - `.planning/deliverables/33-time-lock-approval-mechanism.md` -- PolicyType 4->10, evaluate() 6->11단계, 6개 신규 정책 스키마, USD 확장
  - `.planning/deliverables/32-transaction-pipeline-api.md` -- Stage 1 5-type discriminatedUnion, Stage 2 세션제약+3, Stage 3 IPriceOracle 주입, Stage 5 type별 빌드, actionSource 메타, v0.6 요약 섹션
  - `.planning/deliverables/31-solana-adapter-detail.md` -- SPL 정식화(getTransferCheckedInstruction), Token-2022 지원/거부, getAssets(), FeeEstimate, buildApprove/buildBatch, Jupiter 참조, 17 메서드

---

## Task Commits

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | 33-time-lock 정책 엔진 + 32-pipeline 파이프라인 v0.6 통합 | df84eca | PolicyType 10개, evaluate() 11단계, 6 신규 스키마, USD 확장; Stage 1-5 v0.6 확장, IPriceOracle, actionSource, v0.6 요약 섹션 |
| 2 | 31-solana-adapter v0.6 통합 | d03dd8c | SPL getTransferCheckedInstruction, Token-2022 위험 확장 감지, getAssets(), FeeEstimate 구조체, buildApprove/buildBatch, Jupiter 참조, 17메서드 |

---

## Decisions Made

| # | Decision | Context | Alternatives Considered |
|---|----------|---------|----------------------|
| 1 | Token-2022 위험 확장은 detectDangerousExtensions() 메서드로 사전 감지 | 56 섹션 5.3의 "위험 확장 감지 시 거부" 결정을 구체 구현 | 모든 Token-2022 거부 (과도), 확장별 핸들러 (복잡) |
| 2 | getAssets()에서 Token-2022도 type='spl' 통합 반환 | 57 섹션 5 결정 "type='spl'로 통합" 준수, programId 필드로 구분 | type='token2022' 별도 (API 소비자 복잡) |
| 3 | ATA 생성 비용 getMinimumBalanceForRentExemption(165) 동적 조회 | 57 결정 "하드코딩 금지" 준수 | BigInt(2_039_280) 하드코딩 (네트워크 변경 시 오류) |
| 4 | 32-pipeline의 v0.6 확장을 섹션 10으로 추가 (기존 섹션 구조 유지) | 기존 섹션 1-9 구조 보존하면서 v0.6 내용 일관 배치 | 기존 섹션 내 인라인만 (참조 어려움) |

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Verification Results

### must_haves Verification

| # | Truth | Status |
|---|-------|--------|
| 1 | 33-time-lock에 PolicyType 10개, evaluate() 11단계, 6개 신규 정책 스키마가 반영 | PASSED (APPROVE_TIER_OVERRIDE 13회, 11단계 5회, instant_max_usd 1회) |
| 2 | 32-pipeline에 Stage 1 discriminatedUnion 5-type 분기, IPriceOracle 주입, actionSource 메타가 반영 | PASSED (discriminatedUnion 8회, IPriceOracle 11회, actionSource 16회) |
| 3 | 31-solana에 SPL 전송 정식화, Token-2022 지원, getAssets() 구현, approve/batch 참조가 반영 | PASSED (getTransferCheckedInstruction 8회, Token-2022 30회, getAssets 7회, buildApprove 7회, buildBatch 5회) |

### Artifact Verification

| Path | Contains | Status |
|------|----------|--------|
| 33-time-lock-approval-mechanism.md | APPROVE_TIER_OVERRIDE | PASSED |
| 32-transaction-pipeline-api.md | discriminatedUnion | PASSED |
| 31-solana-adapter-detail.md | getAssets | PASSED |

### Key Links Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| 33-time-lock | 45-enum | PolicyType 10개 참조 | PASSED |
| 32-pipeline | 33-time-lock | Stage 3 evaluate() 호출 | PASSED |
| 32-pipeline | 61-price-oracle | IPriceOracle 주입 참조 | PASSED |

### Success Criteria

| Criteria | Status |
|----------|--------|
| 33의 10개 PolicyType이 45-enum의 10개와 정확히 일치 | PASSED |
| 32의 5-type 분기가 45-enum의 TransactionType 5개와 정확히 일치 | PASSED |
| INTEG-01 누적 6/8 문서 | PASSED (25-02: 3개 SSoT + 25-03: 3개 기능) |

---

## Next Phase Readiness

- **For 25-04:** 이 3개 기능 계층 문서를 참조하여 나머지 2개 인터페이스 문서(37-rest-api, 38-sdk-mcp) v0.6 통합 가능
- **Blockers:** 없음
- **Concerns:** 없음

## Self-Check: PASSED
