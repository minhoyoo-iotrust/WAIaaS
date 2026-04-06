---
phase: 110-schema-policy-engine
plan: 01
subsystem: api, database
tags: [zod, policy-engine, environment-model, allowed-networks, openapi]

# Dependency graph
requires:
  - phase: 109-db-migration-environment-ssot
    provides: DB 스키마 environment/defaultNetwork 컬럼, policies.network 컬럼
provides:
  - ALLOWED_NETWORKS 11번째 PolicyType SSoT + AllowedNetworksRulesSchema
  - WalletSchema environment + defaultNetwork 전환 (network 제거)
  - CreateWalletRequestSchema environment 파라미터 (default testnet)
  - 5-type TransactionRequestSchema network optional 파라미터
  - CreatePolicyRequestSchema network optional 파라미터
  - IPolicyEngine.evaluate() network 필드
  - POST /wallets environment 기반 생성
  - POST /policies network 파라미터 DB INSERT
affects: [110-02-policy-engine, 111-pipeline-network-resolve]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "environment-first wallet creation (getDefaultNetwork로 defaultNetwork 자동 결정)"
    - "ALLOWED_NETWORKS PolicyType SSoT 파생 패턴 (POLICY_TYPES -> PolicyTypeEnum -> DB CHECK)"

key-files:
  created: []
  modified:
    - packages/core/src/enums/policy.ts
    - packages/core/src/schemas/wallet.schema.ts
    - packages/core/src/schemas/transaction.schema.ts
    - packages/core/src/schemas/policy.schema.ts
    - packages/core/src/interfaces/IPolicyEngine.ts
    - packages/daemon/src/api/routes/wallets.ts
    - packages/daemon/src/api/routes/policies.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/core/src/__tests__/schemas.test.ts
    - packages/core/src/__tests__/enums.test.ts

key-decisions:
  - "WalletSchema에서 network 필드 완전 제거, environment + defaultNetwork로 전환"
  - "CreateWalletRequestSchema에서 environment default 'testnet' (기존 network optional과 다른 패턴)"
  - "POST /wallets에서 validateChainNetwork 제거, getDefaultNetwork()로 단순화"
  - "OpenAPI 응답 스키마에서 network 필드 하위호환 유지 + environment optional 추가"
  - "AllowedNetworksRulesSchema: networks[].network + name(optional) 구조"

patterns-established:
  - "environment-first wallet creation: chain + environment -> getDefaultNetwork -> defaultNetwork"
  - "PolicyType SSoT 확장 시 POLICY_TYPES 배열만 수정, 나머지 자동 파생"

# Metrics
duration: 7min
completed: 2026-02-14
---

# Phase 110 Plan 01: Zod 스키마 환경 모델 전환 + ALLOWED_NETWORKS Summary

**Wallet/Transaction/Policy Zod 스키마를 environment 모델로 전환하고, ALLOWED_NETWORKS 11번째 PolicyType SSoT + 라우트 레이어 적용**

## Performance

- **Duration:** 7min
- **Started:** 2026-02-14T11:26:01Z
- **Completed:** 2026-02-14T11:33:30Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- POLICY_TYPES SSoT에 ALLOWED_NETWORKS 11번째 항목 추가 (AllowedNetworksRulesSchema 정의 + POLICY_RULES_SCHEMAS 등록)
- WalletSchema/CreateWalletRequestSchema를 environment 모델로 전환 (network 필드 제거)
- 5-type TransactionRequestSchema + TransactionSchema에 network 필드 추가
- POST /wallets 라우트를 environment 기반 생성으로 전환 (getDefaultNetwork 사용)
- POST/GET/PUT /policies 라우트에 network 파라미터 지원 추가
- 전체 모노레포 빌드 통과 + 테스트 회귀 없음

## Task Commits

Each task was committed atomically:

1. **Task 1: Zod 스키마 환경 모델 전환 + ALLOWED_NETWORKS PolicyType SSoT** - `5aaf67f` (feat)
2. **Task 2: Route 레이어 environment/network 적용 + 빌드/테스트 회귀 확인** - `23ac192` (feat)

## Files Created/Modified
- `packages/core/src/enums/policy.ts` - POLICY_TYPES에 ALLOWED_NETWORKS 추가
- `packages/core/src/schemas/wallet.schema.ts` - WalletSchema environment+defaultNetwork 전환
- `packages/core/src/schemas/transaction.schema.ts` - 5-type에 network optional 추가, TransactionSchema에 network nullable 추가
- `packages/core/src/schemas/policy.schema.ts` - AllowedNetworksRulesSchema 정의, PolicySchema/CreatePolicyRequest에 network 추가
- `packages/core/src/interfaces/IPolicyEngine.ts` - evaluate() transaction에 network? 추가
- `packages/daemon/src/api/routes/wallets.ts` - POST /wallets environment 기반 생성
- `packages/daemon/src/api/routes/policies.ts` - POST/GET/PUT에 network 파라미터 지원
- `packages/daemon/src/api/routes/openapi-schemas.ts` - 응답 스키마에 network/environment 추가
- `packages/core/src/__tests__/schemas.test.ts` - 스키마 변경 반영 (environment, network nullable)
- `packages/core/src/__tests__/enums.test.ts` - PolicyType 개수 10 -> 11 수정

## Decisions Made
- WalletSchema에서 `network` 필드 완전 제거, `environment + defaultNetwork`로 전환 (DB 스키마 Phase 109와 일치)
- CreateWalletRequestSchema에서 `environment` default 'testnet' 적용 (기존 network optional 대신)
- POST /wallets에서 `validateChainNetwork` 제거, `getDefaultNetwork(chain, environment)` 단일 함수로 단순화
- OpenAPI 응답 스키마에서 `network` 필드 하위호환 유지, `environment` optional 추가 (점진적 전환)
- AllowedNetworksRulesSchema: `networks[].network + name(optional)` 구조 (docs/71 섹션 2.1 기반)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 스키마 테스트 network -> environment/defaultNetwork 수정**
- **Found during:** Task 1 (core build verification)
- **Issue:** schemas.test.ts가 기존 `network` 필드를 참조하여 빌드 실패
- **Fix:** CreateWalletRequestSchema 테스트를 environment 기반으로, WalletSchema/TransactionSchema/PolicySchema 테스트에 새 필드 반영
- **Files modified:** packages/core/src/__tests__/schemas.test.ts
- **Verification:** `pnpm build` (core) 통과
- **Committed in:** 5aaf67f (Task 1 commit)

**2. [Rule 1 - Bug] PolicyType 개수 테스트 10 -> 11 수정**
- **Found during:** Task 2 (test regression check)
- **Issue:** enums.test.ts에서 POLICY_TYPES 길이를 10으로 하드코딩, ALLOWED_NETWORKS 추가로 11개가 됨
- **Fix:** expect(POLICY_TYPES).toHaveLength(11) 로 수정
- **Files modified:** packages/core/src/__tests__/enums.test.ts
- **Verification:** `pnpm test` 전체 통과
- **Committed in:** 23ac192 (Task 2 commit)

**3. [Rule 1 - Bug] wallets.ts NetworkType 미사용 import 제거**
- **Found during:** Task 2 (monorepo build)
- **Issue:** environment 전환 후 NetworkType import이 미사용으로 TS6196 에러
- **Fix:** import에서 NetworkType 제거
- **Files modified:** packages/daemon/src/api/routes/wallets.ts
- **Verification:** `pnpm build` 전체 통과
- **Committed in:** 23ac192 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** 모두 스키마 변경에 따른 필수적인 테스트/타입 수정. 스코프 변경 없음.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Zod 스키마가 DB 스키마(Phase 109)와 완전히 일치
- ALLOWED_NETWORKS PolicyType SSoT 확립 -- Phase 110-02에서 DatabasePolicyEngine 평가 로직 구현 가능
- API 라우트가 environment/network 파라미터를 처리 -- Phase 111에서 파이프라인 네트워크 리졸브 구현 가능
- Pre-existing CLI E2E 3건 (E-07~09) 유지, 이 플랜과 무관

## Self-Check: PASSED

- All 10 modified files: FOUND
- Task 1 commit 5aaf67f: FOUND
- Task 2 commit 23ac192: FOUND
- ALLOWED_NETWORKS in POLICY_TYPES: FOUND
- environment in WalletSchema: FOUND

---
*Phase: 110-schema-policy-engine*
*Completed: 2026-02-14*
