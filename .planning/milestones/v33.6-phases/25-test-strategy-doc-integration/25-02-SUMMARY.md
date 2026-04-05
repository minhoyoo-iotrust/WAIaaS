# Phase 25 Plan 02: SSoT 기반 문서 3개 v0.6 통합 Summary

**One-liner:** TransactionType 5개, PolicyType 10개, ActionErrorCode 7개를 45-enum SSoT에 등록하고, 27-chain-adapter에 4개 메서드 + FeeEstimate, 25-sqlite에 감사 컬럼 4개 + 인덱스 2개 추가

---

## Metadata

- **Phase:** 25-test-strategy-doc-integration
- **Plan:** 02
- **Subsystem:** document-integration
- **Tags:** enum, chain-adapter, sqlite-schema, v0.6-integration, SSoT
- **Duration:** ~11min
- **Completed:** 2026-02-08

---

## Dependency Graph

- **Requires:** Phase 22-24 (CHAIN-EXT-01~08 소스 문서)
- **Provides:** v0.6 통합된 SSoT 기반 문서 3개 (45-enum, 27-chain-adapter, 25-sqlite)
- **Affects:** 25-03 (후속 5개 문서 통합 시 이 SSoT 참조)

---

## Tech Tracking

- **Patterns established:** 인라인 마킹 패턴 (`(v0.6 추가)`, `(v0.6 변경)`) 일관 적용
- **Key files modified:**
  - `.planning/deliverables/45-enum-unified-mapping.md` -- Enum 9개 -> 12개 (TransactionType, ActionErrorCode, PriceSource 추가), PolicyType 4 -> 10
  - `.planning/deliverables/27-chain-adapter-interface.md` -- IChainAdapter 13 -> 17 메서드, 5개 타입 추가, FeeEstimate 반환 변경
  - `.planning/deliverables/25-sqlite-schema.md` -- transactions 감사 컬럼 4+1, 인덱스 2, type CHECK 5, PolicyType CHECK 10

---

## Task Commits

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | 45-enum SSoT + 27-chain-adapter v0.6 통합 | 5dec354 | TransactionType 5개, PolicyType 10개, ActionErrorCode 7개, PriceSource 5개 등록; getAssets/buildContractCall/buildApprove/buildBatch 4메서드 추가; FeeEstimate 타입 |
| 2 | 25-sqlite-schema v0.6 통합 | 4df64d0 | type CHECK 5, 감사 컬럼 4+token_mint, 인덱스 2, PolicyType 10 CHECK, USD 확장 |

---

## Decisions Made

| # | Decision | Context | Alternatives Considered |
|---|----------|---------|----------------------|
| 1 | 45-enum 섹션 번호 재번호 (2.3~2.12) | TransactionType 신규 섹션 삽입으로 기존 2.3 AgentStatus -> 2.4로 이동 | 기존 번호 유지 + 부록 추가 (구조 불일치) |
| 2 | ActionErrorCode ACTION_PROVIDER_NOT_FOUND 대신 ACTION_NOT_FOUND 사용 | 62-action-provider-architecture.md의 실제 정의를 그대로 반영 | 계획 문서의 이름 사용 (소스와 불일치) |
| 3 | 27-chain-adapter AdapterRegistry에 Action Provider 협력 패턴 추가 | 62-action-provider-architecture.md의 resolve-then-execute 패턴 설명 필요 | 별도 문서 참조만 기록 (상호 참조 부족) |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ActionErrorCode 7개 코드명 수정**

- **Found during:** Task 1
- **Issue:** 계획에 ACTION_PROVIDER_NOT_FOUND, ACTION_PROVIDER_LOAD_FAILED로 기재되어 있으나, 소스 문서(62-action-provider-architecture.md)에서는 ACTION_NOT_FOUND, ACTION_PLUGIN_LOAD_FAILED로 정의
- **Fix:** 소스 문서의 실제 코드명으로 반영 (ACTION_NOT_FOUND, ACTION_VALIDATION_FAILED, ACTION_RESOLVE_FAILED, ACTION_RETURN_INVALID, ACTION_PLUGIN_LOAD_FAILED, ACTION_NAME_CONFLICT, ACTION_CHAIN_MISMATCH)
- **Files modified:** 45-enum-unified-mapping.md

**2. [Rule 1 - Bug] PriceSource 값 정정**

- **Found during:** Task 1
- **Issue:** 계획에 coingecko, pyth_http, chainlink_http 등으로 기재되어 있으나, 소스 문서(61-price-oracle-spec.md)에서는 coingecko, pyth, chainlink, jupiter, cache
- **Fix:** 소스 문서의 실제 값으로 반영
- **Files modified:** 45-enum-unified-mapping.md

---

## Verification Results

### must_haves Verification

| # | Truth | Status |
|---|-------|--------|
| 1 | TransactionType 5개가 45-enum에 등록 | PASSED (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH) |
| 2 | PolicyType 10개가 45-enum에 등록 | PASSED (기존 4 + ALLOWED_TOKENS + CONTRACT_WHITELIST + METHOD_WHITELIST + APPROVED_SPENDERS + APPROVE_AMOUNT_LIMIT + APPROVE_TIER_OVERRIDE) |
| 3 | IChainAdapter에 getAssets(), buildContractCall(), buildApprove(), buildBatch() 추가 | PASSED (14~17번째 메서드) |
| 4 | transactions 테이블에 TransactionType 5개 CHECK, PolicyType 10개 CHECK, 감사 컬럼 4개 반영 | PASSED |

### Artifact Verification

| Path | Contains | Status |
|------|----------|--------|
| 45-enum-unified-mapping.md | CONTRACT_CALL | PASSED |
| 27-chain-adapter-interface.md | buildContractCall | PASSED |
| 25-sqlite-schema.md | contract_address | PASSED |

---

## Next Phase Readiness

- **For 25-03:** 이 3개 SSoT 문서를 참조하여 나머지 5개 문서(33-time-lock, 32-transaction-pipeline, 31-solana-adapter, 37-rest-api, 38-sdk-mcp) v0.6 통합 가능
- **Blockers:** 없음
- **Concerns:** 없음

## Self-Check: PASSED
