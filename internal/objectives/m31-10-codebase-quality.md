# 마일스톤 m31-10: 코드베이스 품질 개선

- **Status:** PLANNED
- **Milestone:** v31.10

## 목표

93개 마일스톤(v0.1~v31.9)에 걸쳐 누적된 코드 중복, 타입 안전성 문제, 대형 파일을 정리하여 코드 품질을 개선한다. **행위 변경 없이 순수 리팩토링만 수행**하며, 기존 7,200+ 테스트가 regression guard 역할을 한다.

> **선행**: v31.9 완료
> **원칙**: 기능 추가 없음, API 변경 없음, DB 마이그레이션 없음

---

## 배경

### 현재 문제

코드베이스가 ~304,000 LOC TS, 14개 DeFi ActionProvider, 14개 패키지로 성장하면서 다음 문제가 누적됨:

| 카테고리 | 심각도 | 영향 범위 | 설명 |
|---------|--------|----------|------|
| 유틸리티 함수 중복 | HIGH | 14개 프로바이더 | `parseTokenAmount` 8곳, `padHex`/`encodeApproveCalldata` 5+곳 중복 |
| `as any` 타입 캐스팅 | HIGH | 40+곳 | SmartAccount 필드 접근 시 `(wallet as any).accountType` 반복 |
| 대형 파일 | MEDIUM | 5개 파일 | admin.ts(3,107L), stages.ts(2,225L), policy-engine(2,145L) |
| API 에러 응답 불일치 | MEDIUM | 4개 라우트 | `c.json({error})` vs `WAIaaSError` 혼용 |
| 함수 중복 | MEDIUM | 3-5곳 | `resolveChainId()` 2곳, wallet resolution 로직 분산 |
| 매직 넘버 산재 | LOW | 10+곳 | GAS_MARGIN, TIMEOUT, CACHE_TTL 등 |

### 정리가 잘 되어 있는 부분

- 의존성 관리 (버전 충돌 없음, 순환 의존성 없음)
- 에러 핸들링 3계층 구조 (WAIaaSError → ChainError → Error)
- Zod SSoT 원칙 준수
- slippage 처리 (`common/slippage.ts` 이미 통합)

---

## 요구사항

### R1. 유틸리티 함수 통합 (Phase 1)

- **R1-1.** `packages/actions/src/common/amount-parser.ts` 생성: `parseTokenAmount(amount: string, decimals: number): bigint` 통합
  - 대상: Aave V3 `parseTokenAmount`, Lido `parseEthAmount`, Jito `parseSolAmount`, Hyperliquid `parseUsdcAmount` 등 8곳
  - 기존 각 프로바이더의 로컬 함수를 공통 함수로 교체
- **R1-2.** `packages/actions/src/common/contract-encoding.ts` 생성: `padHex()`, `addressToHex()`, `uint256ToHex()`, `encodeApproveCalldata()` 통합
  - 대상: aave-contracts.ts, lido-contract.ts, 0x inline, Across inline, DCent inline 등 5+곳
- **R1-3.** 기존 프로바이더에서 로컬 구현 제거, 공통 모듈 import로 교체
- **R1-4.** 예상 제거: ~650줄 중복 코드

### R2. 타입 안전성 개선 (Phase 2)

- **R2-1.** SmartAccount 필드를 포함한 WalletRow 타입 정의 확장: `accountType`, `signerKey`, `deployed`, `aaProvider` 등
  - 대상: `wallets.ts`의 `(wallet as any).accountType` 40+곳 제거
- **R2-2.** `resolveChainId()` 중복 통합: `actions.ts:661`과 `admin-actions.ts:127`의 2곳 → 1곳으로 통합
- **R2-3.** CAIP-19 regex 중복 제거: `policy.schema.ts`의 인라인 regex → `caip/index.ts`에서 import
- **R2-4.** `nft-approvals.ts`의 `(adapter as any).getNftApprovalStatus` → 인터페이스 기반 타입 가드로 교체

### R3. 대형 파일 분할 (Phase 3)

- **R3-1.** `admin.ts` (3,107줄) 분할:
  - `admin-auth.ts` — 인증/세션 관련 엔드포인트
  - `admin-settings.ts` — 설정 CRUD 엔드포인트
  - `admin-notifications.ts` — 알림 설정 엔드포인트
  - `admin-wallets.ts` — 지갑 관리 엔드포인트
  - `admin-monitoring.ts` — 모니터링/통계 엔드포인트
  - 기존 `admin.ts`는 라우트 등록만 담당하는 thin aggregator로 유지
- **R3-2.** `openapi-schemas.ts` (1,606줄) 분할 검토: 라우트별 schema를 해당 라우트 파일로 이동 (또는 domain별 그룹핑)

### R4. API 에러 응답 일관성 (Phase 4)

- **R4-1.** `nft-approvals.ts`의 `c.json({ error: "..." }, 400)` → `WAIaaSError` 패턴으로 통일
- **R4-2.** `sessions.ts`의 `new Response(null, { status: 204 }) as any` → 표준 204 응답 패턴으로 교체
- **R4-3.** 기타 `as any` 타입 escape가 있는 응답 패턴 정리

### R5. 상수 중앙화 (Phase 5)

- **R5-1.** 산재된 매직 넘버 식별 및 상수 추출:
  - `MAX_RETRIES` (x402, oracle, wallet-connect)
  - `TIMEOUT_MS` (rpc, api, incoming tx)
  - `CACHE_TTL_SECONDS` (price-oracle, token-registry)
  - `POLLING_INTERVAL_MS` (incoming tx, monitoring)
- **R5-2.** 적절한 위치에 상수 정의 (패키지별 constants 파일 또는 Admin Settings로 전환)

---

## 안전성 보장 전략

1. **순수 리팩토링**: 행위 변경 없음, API 변경 없음, DB 마이그레이션 없음
2. **Phase별 검증**: 매 Phase 완료 후 `pnpm turbo run lint && pnpm turbo run typecheck && pnpm turbo run test`
3. **Atomic commit**: Phase별 독립 커밋, 문제 시 개별 revert 가능
4. **기존 테스트 활용**: 7,200+ 테스트가 regression guard
5. **점진적 진행**: Phase 1-2 우선 (High ROI), Phase 3-5 선택적

---

## 설계 결정

### D1. 유틸리티 위치: `packages/actions/src/common/`

Action Provider 전용 유틸리티(amount parsing, contract encoding)는 `packages/actions/src/common/`에 배치한다. `packages/shared/`는 모든 패키지가 공유하는 순수 상수/타입 전용이며, DeFi 특화 유틸리티와 성격이 다르다.

### D2. admin.ts 분할 전략: thin aggregator 패턴

분할된 서브 모듈이 각자의 라우트를 export하고, `admin.ts`가 이를 import하여 Hono app에 등록하는 형태. 기존 `/v1/admin/*` URL 구조는 변경하지 않는다.

### D3. Phase별 독립성

각 Phase는 다른 Phase에 의존하지 않는다. Phase 1만 진행하고 나머지는 이후로 미룰 수 있다.

---

## 영향 범위

| 파일/영역 | 변경 내용 |
|----------|----------|
| `packages/actions/src/common/` | amount-parser.ts, contract-encoding.ts 신규 |
| `packages/actions/src/providers/*/` | 로컬 유틸 함수 → 공통 모듈 import으로 교체 |
| `packages/core/src/schemas/` | WalletRow 타입 확장 (SmartAccount 필드 포함) |
| `packages/daemon/src/api/routes/admin.ts` | 서브 모듈로 분할 |
| `packages/daemon/src/api/routes/nft-approvals.ts` | 에러 응답 패턴 통일 |
| `packages/daemon/src/api/routes/sessions.ts` | 204 응답 패턴 정리 |
| `packages/daemon/src/api/routes/actions.ts` | resolveChainId 통합 |

---

## 범위 밖 (명시적 제외)

| 항목 | 이유 | 대안 |
|------|------|------|
| 기능 추가 | 순수 리팩토링 마일스톤 | 이후 마일스톤에서 추가 |
| API 변경 | 하위 호환 유지 | — |
| DB 마이그레이션 | 스키마 변경 불필요 | — |
| pipeline 리팩토링 (stages.ts, policy-engine) | 위험도 높음, 별도 마일스톤 검토 | Phase 3에서 admin.ts만 분할 |
| migrate.ts (3,301줄) 분할 | 마이그레이션 코드는 추가만 되고 수정 안 됨 | 구조적 문제 아님 |
| 테스트 리팩토링 | 테스트 중복은 안전성에 영향 없음 | 필요 시 별도 |
| barrel export 재구성 (core/index.ts) | 영향 범위 넓음, 모든 패키지 import 변경 | 별도 검토 |
