---
phase: 106-pipeline-network-resolve-design
verified: 2026-02-14T02:45:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 106: 파이프라인 네트워크 리졸브 설계 Verification Report

**Phase Goal:** 트랜잭션 요청에서 실제 네트워크가 리졸브되고 환경 격리가 검증되는 데이터 흐름이 설계되어, 구현자가 Stage 1부터 AdapterPool 호출까지 코드를 작성할 수 있다

**Verified:** 2026-02-14T02:45:00Z

**Status:** passed

**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | resolveNetwork() 순수 함수의 3단계 우선순위(request.network > wallet.defaultNetwork > getDefaultNetwork) 인터페이스, 에러 분기 3개, 의사코드가 정의되어 있다 | ✓ VERIFIED | docs/70 섹션 2: 함수 시그니처(line 92-141), 3단계 우선순위 테이블(line 144-155), 에러 분기 3개 테이블(line 179-186), 입출력 예시 11개(line 188-201), 의사코드 완비 |
| 2 | PipelineContext.resolvedNetwork + wallet.environment 필드가 Stage 1~6 전체 데이터 흐름도에서 전파 경로가 명시되어 있다 | ✓ VERIFIED | docs/70 섹션 5.1: PipelineContext 인터페이스 변경 전/후(line 485-575), 섹션 5.2: Stage 1~6 데이터 흐름도(line 577-647), 각 Stage별 resolvedNetwork 참조 방식 의사코드(line 649-696) |
| 3 | 환경-네트워크 교차 검증의 검증 시점(PipelineContext 생성 전), 에러 코드(ENVIRONMENT_NETWORK_MISMATCH), 에러 메시지 템플릿이 명시되어 있다 | ✓ VERIFIED | docs/70 섹션 3: 에러 코드 정의(line 222-303), 섹션 4.1: 검증 시점 명시(line 309-331), 섹션 4.2: 검증 로직 흐름 의사코드(line 333-374), 에러 메시지 템플릿(line 203-217), 보안 로깅(line 437-461) |
| 4 | AdapterPool.resolve() 호출부 2곳(transactions.ts, daemon.ts)의 변경 방안이 캐시 키 호환성 확인과 함께 기술되어 있다 | ✓ VERIFIED | docs/70 섹션 6.2: 캐시 키 호환성 확인(line 749-766), 섹션 6.4: transactions.ts 변경 의사코드(line 782-876), 섹션 6.5: daemon.ts executeFromStage5 변경 의사코드(line 879-957) |
| 5 | daemon.ts Stage 5 재진입부(executeFromStage5)에서 tx.network 사용 방안이 NULL 처리 포함하여 설계되어 있다 | ✓ VERIFIED | docs/70 섹션 6.5: tx.network 직접 사용 의사코드(line 910-921), 섹션 6.6: 재진입 경로 특이사항 설명(line 959-970), 섹션 6.7: NULL 처리 시나리오 테이블(line 973-993) |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `docs/70-pipeline-network-resolve-design.md` | 파이프라인 네트워크 리졸브 + 환경 교차 검증 + AdapterPool 호출 변경 통합 설계 문서 | ✓ VERIFIED | 1,075 lines, 7 main sections + 2 appendices, contains "resolveNetwork" (26 occurrences), "PipelineContext" (27 occurrences), "adapterPool.resolve" (9 occurrences) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| docs/70 | docs/68-environment-model-design.md | 매핑 함수 참조 (getDefaultNetwork, validateNetworkEnvironment) | ✓ WIRED | docs/70 line 5 references docs/68, line 68-75 매핑 함수 매트릭스, 26 occurrences of getDefaultNetwork/validateNetworkEnvironment |
| docs/70 | packages/daemon/src/pipeline/stages.ts | PipelineContext 확장 설계가 현재 인터페이스를 참조 | ✓ WIRED | docs/70 섹션 5.1 line 487: "현재 (v1.4.4) -- packages/daemon/src/pipeline/stages.ts", PipelineContext 변경 전/후 비교, 27 occurrences |
| docs/70 | packages/daemon/src/api/routes/transactions.ts | AdapterPool.resolve() 호출부 변경 설계 | ✓ WIRED | docs/70 섹션 6.4 line 782: "transactions.ts (line 255-291)", 현재 코드 참조 + 변경 후 의사코드 |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| PIPE-01: NetworkResolver 추상화를 설계한다 (environment + request.network → NetworkType 리졸브) | ✓ SATISFIED | None — docs/70 섹션 2에서 resolveNetwork() 3단계 우선순위, 2중 검증, 에러 분기 완전 정의 |
| PIPE-02: PipelineContext에서 트랜잭션 레벨 네트워크가 전파되는 데이터 흐름을 설계한다 | ✓ SATISFIED | None — docs/70 섹션 5에서 wallet.environment + resolvedNetwork 필드 + Stage 1~6 데이터 흐름도 완비 |
| PIPE-03: 환경-네트워크 교차 검증 로직(mainnet 월렛 + testnet 네트워크 차단)을 설계한다 | ✓ SATISFIED | None — docs/70 섹션 3~4에서 ENVIRONMENT_NETWORK_MISMATCH 에러 코드 + 검증 시점(PipelineContext 생성 전) + 보안 로깅 완비 |
| PIPE-04: AdapterPool 호출부의 네트워크 리졸브 변경 방안을 설계한다 | ✓ SATISFIED | None — docs/70 섹션 6에서 transactions.ts + daemon.ts 2곳 변경 의사코드 + 캐시 키 호환성 확인 + NULL 처리 완비 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| N/A | N/A | No anti-patterns detected | N/A | docs/70 contains no TODO/FIXME/placeholder markers, all sections complete with pseudocode |

### Design Decisions

docs/70 섹션 7.1에서 6개 설계 결정을 테이블로 정리:

- **PIPE-D01**: resolveNetwork()를 순수 함수로 설계 (클래스 아님) — 상태 없는 로직에 클래스는 과도. 순수 함수가 테스트/재사용 용이.
- **PIPE-D02**: 환경 검증 시점을 PipelineContext 생성 전(Route Handler)으로 결정 — DB INSERT 전 검증 보장. Stage 1에서 검증하면 PENDING 고아 레코드 발생 위험.
- **PIPE-D03**: ENVIRONMENT_NETWORK_MISMATCH를 별도 에러 코드로 신설 — 보안 중요도 높음 (환경 불일치 = 자금 위험). 별도 추적/로깅/대시보드 필터링 필요.
- **PIPE-D04**: daemon.ts executeFromStage5에서 tx.network 직접 사용 (resolveNetwork 재호출 안 함) — Stage 1에서 기록된 네트워크로 재실행해야 안전. wallet.defaultNetwork이 변경되었을 수 있음.
- **PIPE-D05**: AdapterPool 시그니처 변경 불필요 (호출부만 변경) — 캐시 키 `chain:network`가 이미 완벽한 추상화.
- **PIPE-D06**: resolveNetwork()를 별도 파일(network-resolver.ts)에 배치 — stages.ts가 700줄 이상으로 비대. route handler에서 import 필요하므로 별도 모듈이 적합.

### Phase Integration

**Phase 105 참조 관계:** docs/70 line 65-76에서 Phase 105 산출물(docs/68, docs/69)과의 참조 관계 매트릭스 정의:
- docs/68 섹션 3.1-3.4의 4개 매핑 함수 (getDefaultNetwork, validateNetworkEnvironment, getNetworksForEnvironment, deriveEnvironment)를 resolveNetwork() 내부 검증에서 호출
- docs/69의 transactions.network 컬럼 (v6a) + wallets.environment/default_network 컬럼 (v6b)을 데이터 흐름의 원천으로 사용

**Phase 107/108 영향:** docs/70 섹션 7.2에서 다음 Phase에 대한 영향 명시:
- Phase 107 (정책 설계): `ctx.resolvedNetwork`를 정책 평가 시 참조. `policies.network` 컬럼 추가 시 매칭.
- Phase 108 (API 설계): `POST /v1/transactions/send`에 `network?: NetworkType` 필드 추가. TransactionRequestSchema 확장.

### Commits

Task 1 (44dd4ab): NetworkResolver + ENVIRONMENT_NETWORK_MISMATCH + 환경 교차 검증 설계 (docs/70 섹션 1-4)
Task 2 (990bfc3): PipelineContext 확장 + Stage 1~6 흐름도 + AdapterPool 변경 + 설계 결정 (docs/70 섹션 5-7 + 부록)

Both commits verified to exist in git history.

### Implementability Assessment

**Can an implementer write code from this design?** YES

docs/70 provides:
1. **resolveNetwork() function**: Complete TypeScript signature, 3-level priority logic, 2-step validation, error handling (섹션 2)
2. **PipelineContext changes**: Before/after interface comparison, field-level changes (섹션 5.1)
3. **Stage-by-stage data flow**: Pseudocode for each Stage 1-6 referencing resolvedNetwork (섹션 5.2-5.4)
4. **transactions.ts changes**: Current code line references (255-291), changed pseudocode with error handling (섹션 6.4)
5. **daemon.ts changes**: Current code line references (624-655), changed pseudocode with NULL fallback (섹션 6.5)
6. **Error code addition**: Exact code block to add to error-codes.ts (섹션 3.4)
7. **Test cases**: 11 input/output examples for resolveNetwork(), 10 error scenarios, integration test cases (섹션 2.6, 4.3, 부록 B)

All pseudocode is TypeScript-compatible with proper type annotations, import statements, and error handling patterns.

---

## Summary

Phase 106 goal **ACHIEVED**. All 5 observable truths verified, all 4 requirements satisfied, all design decisions documented with rationale and alternatives. The design document (docs/70) provides complete, implementation-ready specifications for:

- resolveNetwork() pure function with 3-level priority and 2-step validation
- PipelineContext extension with wallet.environment + resolvedNetwork
- ENVIRONMENT_NETWORK_MISMATCH error code with security logging
- AdapterPool calling site changes in 2 locations with cache key compatibility
- daemon.ts Stage 5 re-entry with tx.network NULL handling

Implementer readiness: **READY** — v1.4.6 implementer can write code directly from docs/70 without additional design work.

---

_Verified: 2026-02-14T02:45:00Z_
_Verifier: Claude (gsd-verifier)_
