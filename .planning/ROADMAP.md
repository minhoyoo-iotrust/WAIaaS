# Roadmap: WAIaaS v31.10 코드베이스 품질 개선

## Overview

순수 리팩토링 마일스톤. 유틸리티 함수 통합, 타입 안전성 개선, 대형 파일 분할, 에러 응답 일관성, 상수 중앙화를 통해 코드베이스 유지보수성을 높인다. 행위 변경 없음, API 변경 없음, DB 마이그레이션 없음. 각 Phase는 독립적이며 순서 무관하게 실행 가능.

## Phases

**Phase Numbering:**
- Integer phases (375-379): Planned milestone work
- All phases are independent — no inter-phase dependencies

- [x] **Phase 375: 유틸리티 함수 통합** - 중복된 parseTokenAmount/contract-encoding 헬퍼를 공통 모듈로 추출하고 ~260줄 중복 제거
- [x] **Phase 376: 타입 안전성 개선** - WalletRow SmartAccount 필드 타입 추가, `as any` 40+곳 제거, 중복 함수/regex 통합 (completed 2026-03-11)
- [ ] **Phase 377: 대형 파일 분할** - admin.ts (3,107줄) 도메인별 분할, openapi-schemas.ts (1,606줄) 그룹핑 검토
- [ ] **Phase 378: API 에러 응답 일관성** - 비표준 에러/응답 패턴을 WAIaaSError 및 표준 패턴으로 통일
- [ ] **Phase 379: 상수 중앙화** - 매직 넘버 식별 및 명명된 상수로 추출

## Phase Details

### Phase 375: 유틸리티 함수 통합
**Goal**: 프로바이더 전반에 산재된 중복 유틸리티 구현이 단일 공통 모듈로 통합되어 코드 중복이 ~650줄 감소한다
**Depends on**: Nothing (independent)
**Requirements**: UTIL-01, UTIL-02, UTIL-03, UTIL-04
**Success Criteria** (what must be TRUE):
  1. `packages/actions/src/common/amount-parser.ts`에 `parseTokenAmount` 함수가 존재하고 8곳 이상의 프로바이더가 이를 import하여 사용한다
  2. `packages/actions/src/common/contract-encoding.ts`에 `padHex`, `addressToHex`, `uint256ToHex`, `encodeApproveCalldata` 함수가 존재하고 5곳 이상의 프로바이더가 이를 import하여 사용한다
  3. 프로바이더 파일에 로컬로 정의된 parseTokenAmount/padHex/addressToHex/uint256ToHex/encodeApproveCalldata 구현이 0개이다
  4. `pnpm turbo run lint && pnpm turbo run typecheck && pnpm turbo run test` 전체 통과
**Plans**: 2 plans

Plans:
- [x] 375-01-PLAN.md — parseTokenAmount 공통 모듈 추출 및 7개 프로바이더 교체
- [x] 375-02-PLAN.md — contract-encoding 공통 모듈 추출 및 4개 프로바이더 교체

### Phase 376: 타입 안전성 개선
**Goal**: `(wallet as any)` 및 `(adapter as any)` 타입 escape가 제거되고 중복된 타입 관련 코드가 통합된다
**Depends on**: Nothing (independent)
**Requirements**: TYPE-01, TYPE-02, TYPE-03, TYPE-04
**Success Criteria** (what must be TRUE):
  1. WalletRow 타입이 SmartAccount 필드 (`accountType`, `signerKey`, `deployed`, `aaProvider`)를 포함하고, `(wallet as any)` 패턴이 코드베이스에서 제거된다
  2. `resolveChainId()` 함수가 단일 위치에만 존재하고 actions.ts와 admin-actions.ts 모두 해당 단일 구현을 import한다
  3. CAIP-19 regex가 `caip/index.ts`에서만 정의되고 policy.schema.ts에서 import하여 사용한다
  4. `nft-approvals.ts`에서 `(adapter as any)` 캐스팅 없이 인터페이스 기반 타입 가드로 getNftApprovalStatus를 호출한다
  5. `pnpm turbo run lint && pnpm turbo run typecheck && pnpm turbo run test` 전체 통과
**Plans**: 2 plans

Plans:
- [x] 376-01-PLAN.md — WalletRow SmartAccount 필드 타입 확장 및 as any 제거
- [x] 376-02-PLAN.md — resolveChainId 통합, CAIP-19 regex 중복 제거, NFT 타입 가드 교체

### Phase 377: 대형 파일 분할
**Goal**: admin.ts (3,107줄)가 도메인별 모듈로 분할되어 각 파일이 관리 가능한 크기가 된다
**Depends on**: Nothing (independent)
**Requirements**: SPLIT-01, SPLIT-02, SPLIT-03
**Success Criteria** (what must be TRUE):
  1. admin.ts가 라우트 등록만 담당하는 thin aggregator (200줄 이하)이고, 실제 핸들러는 admin-auth.ts, admin-settings.ts, admin-notifications.ts, admin-wallets.ts, admin-monitoring.ts에 분산된다
  2. openapi-schemas.ts가 검토되어 필요 시 도메인별 그룹핑이 적용되거나, 현 상태 유지 사유가 문서화된다
  3. 모든 기존 Admin API 엔드포인트가 동일하게 동작한다 (E2E 관점 변경 없음)
  4. `pnpm turbo run lint && pnpm turbo run typecheck && pnpm turbo run test` 전체 통과
**Plans**: 2 plans

Plans:
- [ ] 377-01-PLAN.md — admin.ts 도메인별 핸들러 분할 (5개 모듈 파일 생성)
- [ ] 377-02-PLAN.md — admin.ts thin aggregator 재구성 및 openapi-schemas.ts 검토

### Phase 378: API 에러 응답 일관성
**Goal**: 비표준 에러/응답 패턴이 WAIaaSError 및 표준 패턴으로 통일되어 API 응답이 일관된다
**Depends on**: Nothing (independent)
**Requirements**: ERR-01, ERR-02, ERR-03
**Success Criteria** (what must be TRUE):
  1. `nft-approvals.ts`에서 `c.json({ error: "..." }, 400)` 패턴이 0개이고 모두 WAIaaSError throw로 교체된다
  2. `sessions.ts`에서 `new Response(null, { status: 204 }) as any` 패턴이 표준 204 응답 패턴으로 교체된다
  3. `as any` 타입 escape가 포함된 응답 패턴이 식별 및 정리된다
  4. `pnpm turbo run lint && pnpm turbo run typecheck && pnpm turbo run test` 전체 통과
**Plans**: TBD

Plans:
- [ ] 378-01: 비표준 에러/응답 패턴 식별 및 WAIaaSError/표준 패턴으로 교체

### Phase 379: 상수 중앙화
**Goal**: 코드베이스에 산재된 매직 넘버가 명명된 상수로 추출되어 의미가 명확해진다
**Depends on**: Nothing (independent)
**Requirements**: CONST-01, CONST-02
**Success Criteria** (what must be TRUE):
  1. MAX_RETRIES, TIMEOUT_MS, CACHE_TTL_SECONDS, POLLING_INTERVAL_MS 등 반복 사용되는 매직 넘버가 식별 목록으로 정리된다
  2. 식별된 매직 넘버가 패키지별 constants 파일 또는 Admin Settings로 이동되고, 원래 위치에서 해당 상수를 참조한다
  3. `pnpm turbo run lint && pnpm turbo run typecheck && pnpm turbo run test` 전체 통과
**Plans**: TBD

Plans:
- [ ] 379-01: 매직 넘버 식별 및 상수 추출

## Progress

**Execution Order:**
All phases are independent and can execute in any order: 375 → 376 → 377 → 378 → 379

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 375. 유틸리티 함수 통합 | 2/2 | Complete    | 2026-03-11 |
| 376. 타입 안전성 개선 | 2/2 | Complete    | 2026-03-11 |
| 377. 대형 파일 분할 | 0/2 | Not started | - |
| 378. API 에러 응답 일관성 | 0/1 | Not started | - |
| 379. 상수 중앙화 | 0/1 | Not started | - |
