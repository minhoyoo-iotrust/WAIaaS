# Requirements: WAIaaS v31.10 코드베이스 품질 개선

**Defined:** 2026-03-11
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v1 Requirements

순수 리팩토링 마일스톤. 행위 변경 없음, API 변경 없음, DB 마이그레이션 없음.

### Utility (유틸리티 함수 통합)

- [ ] **UTIL-01**: `packages/actions/src/common/amount-parser.ts`에 `parseTokenAmount(amount: string, decimals: number): bigint` 통합 (8곳 중복 제거)
- [ ] **UTIL-02**: `packages/actions/src/common/contract-encoding.ts`에 `padHex()`, `addressToHex()`, `uint256ToHex()`, `encodeApproveCalldata()` 통합 (5+곳)
- [ ] **UTIL-03**: 기존 프로바이더에서 로컬 구현 제거 및 공통 모듈 import으로 교체
- [ ] **UTIL-04**: ~650줄 중복 코드 제거 검증

### Type Safety (타입 안전성)

- [ ] **TYPE-01**: WalletRow 타입에 SmartAccount 필드 포함 (`accountType`, `signerKey`, `deployed`, `aaProvider`)하여 `(wallet as any)` 40+곳 제거
- [ ] **TYPE-02**: `resolveChainId()` 중복 통합 (`actions.ts`와 `admin-actions.ts` 2곳 → 1곳)
- [ ] **TYPE-03**: CAIP-19 regex 중복 제거 (`policy.schema.ts` 인라인 → `caip/index.ts` import)
- [ ] **TYPE-04**: `nft-approvals.ts`의 `(adapter as any).getNftApprovalStatus` → 인터페이스 기반 타입 가드로 교체

### File Split (대형 파일 분할)

- [ ] **SPLIT-01**: `admin.ts` (3,107줄) → `admin-auth.ts`, `admin-settings.ts`, `admin-notifications.ts`, `admin-wallets.ts`, `admin-monitoring.ts` 분할
- [ ] **SPLIT-02**: `admin.ts`를 라우트 등록만 담당하는 thin aggregator로 유지
- [ ] **SPLIT-03**: `openapi-schemas.ts` (1,606줄) 분할 검토 및 필요 시 도메인별 그룹핑

### Error (API 에러 응답 일관성)

- [ ] **ERR-01**: `nft-approvals.ts`의 `c.json({ error: "..." }, 400)` → `WAIaaSError` 패턴으로 통일
- [ ] **ERR-02**: `sessions.ts`의 `new Response(null, { status: 204 }) as any` → 표준 204 응답 패턴으로 교체
- [ ] **ERR-03**: 기타 `as any` 타입 escape가 있는 응답 패턴 정리

### Constants (상수 중앙화)

- [ ] **CONST-01**: 산재된 매직 넘버 식별 (`MAX_RETRIES`, `TIMEOUT_MS`, `CACHE_TTL_SECONDS`, `POLLING_INTERVAL_MS`)
- [ ] **CONST-02**: 적절한 위치에 상수 정의 (패키지별 constants 파일 또는 Admin Settings 전환)

## v2 Requirements

None — 순수 리팩토링 마일스톤이므로 추가 기능 없음.

## Out of Scope

| Feature | Reason |
|---------|--------|
| 기능 추가 | 순수 리팩토링 마일스톤 |
| API 변경 | 하위 호환 유지 |
| DB 마이그레이션 | 스키마 변경 불필요 |
| pipeline 리팩토링 (stages.ts, policy-engine) | 위험도 높음, 별도 마일스톤 검토 |
| migrate.ts (3,301줄) 분할 | 마이그레이션 코드는 추가만 되고 수정 안 됨 |
| 테스트 리팩토링 | 테스트 중복은 안전성에 영향 없음 |
| barrel export 재구성 (core/index.ts) | 영향 범위 넓음, 모든 패키지 import 변경 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UTIL-01 | Phase 375 | Pending |
| UTIL-02 | Phase 375 | Pending |
| UTIL-03 | Phase 375 | Pending |
| UTIL-04 | Phase 375 | Pending |
| TYPE-01 | Phase 376 | Pending |
| TYPE-02 | Phase 376 | Pending |
| TYPE-03 | Phase 376 | Pending |
| TYPE-04 | Phase 376 | Pending |
| SPLIT-01 | Phase 377 | Pending |
| SPLIT-02 | Phase 377 | Pending |
| SPLIT-03 | Phase 377 | Pending |
| ERR-01 | Phase 378 | Pending |
| ERR-02 | Phase 378 | Pending |
| ERR-03 | Phase 378 | Pending |
| CONST-01 | Phase 379 | Pending |
| CONST-02 | Phase 379 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after roadmap creation*
