# Roadmap: WAIaaS

## Milestones

- ✅ **v0.1** — Research & Design (shipped 2026-02-05)
- ✅ **v0.2** — Self-Hosted Secure Wallet Design (shipped 2026-02-05)
- ✅ **v0.3** — 설계 논리 일관성 확보 (shipped 2026-02-06)
- ✅ **v0.4** — 테스트 전략 및 계획 수립 (shipped 2026-02-07)
- ✅ **v0.5** — 인증 모델 재설계 + DX 개선 (shipped 2026-02-07)
- ✅ **v0.6** — 블록체인 기능 확장 설계 (shipped 2026-02-08)
- ✅ **v0.7** — 구현 장애 요소 해소 (shipped 2026-02-08)
- ✅ **v0.8** — Owner 선택적 등록 + 점진적 보안 모델 (shipped 2026-02-09)
- ✅ **v0.9** — MCP 세션 관리 자동화 설계 (shipped 2026-02-09)
- ✅ **v0.10** — 구현 전 설계 완결성 확보 (shipped 2026-02-09)
- ✅ **v1.0** — 구현 계획 수립 (shipped 2026-02-09)
- ✅ **v1.1 ~ v31.16** — (102 milestones shipped)

## Phases

<details>
<summary>✅ v31.13 DeFi 포지션 대시보드 완성 (Phases 393-397) — SHIPPED 2026-03-12</summary>

- [x] Phase 393: Staking Positions (Lido + Jito) (2/2 plans) — completed 2026-03-12
- [x] Phase 394: Lending Positions (Aave V3) (1/1 plan) — completed 2026-03-12
- [x] Phase 395: Yield Positions (Pendle) (1/1 plan) — completed 2026-03-12
- [x] Phase 396: Perp/Spot Positions (Hyperliquid) (2/2 plans) — completed 2026-03-12
- [x] Phase 397: Admin Dashboard UX (2/2 plans) — completed 2026-03-12

</details>

<details>
<summary>✅ v31.14 EVM RPC 프록시 모드 (Phases 398-401) — SHIPPED 2026-03-13</summary>

- [x] Phase 398: Type System + Infrastructure Foundation (2/2 plans) — completed 2026-03-13
- [x] Phase 399: Core RPC Proxy Engine (3/3 plans) — completed 2026-03-13
- [x] Phase 400: Route Assembly + Async Approval (3/3 plans) — completed 2026-03-13
- [x] Phase 401: DX Integration + Testing (3/3 plans) — completed 2026-03-13

</details>

<details>
<summary>✅ v31.15 Amount 단위 표준화 및 AI 에이전트 DX 개선 (Phases 402-406) — SHIPPED 2026-03-14</summary>

- [x] Phase 402: Schema Hardening (1/1 plan) — completed 2026-03-14
- [x] Phase 403: Provider Unit Migration (2/2 plans) — completed 2026-03-14
- [x] Phase 404: Typed MCP Schemas + Response Enrichment (2/2 plans) — completed 2026-03-14
- [x] Phase 405: humanAmount Parameter (2/2 plans) — completed 2026-03-14
- [x] Phase 406: SDK + Skill File Sync + E2E (2/2 plans) — completed 2026-03-14

</details>

<details>
<summary>✅ v31.16 CAIP 표준 식별자 승격 (Phases 407-411) — SHIPPED 2026-03-15</summary>

- [x] Phase 407: CAIP-2 Network Input (1/1 plan) — completed 2026-03-14
- [x] Phase 408: CAIP-19 Asset Input + Resolve (2/2 plans) — completed 2026-03-14
- [x] Phase 409: Response CAIP Enrichment + OpenAPI (2/2 plans) — completed 2026-03-14
- [x] Phase 410: SDK + MCP CAIP Extension (2/2 plans) — completed 2026-03-14
- [x] Phase 411: Skill Files Sync (1/1 plan) — completed 2026-03-14

</details>

### v31.17 OpenAPI 기반 프론트엔드 타입 자동 생성

**Milestone Goal:** Admin UI의 수동 TypeScript 인터페이스와 unsafe 타입 캐스트를 OpenAPI 자동 생성 타입으로 전환하고, 하드코딩된 상수를 API 디스커버리 및 @waiaas/shared로 교체한다.

- [ ] **Phase 412: Spec 추출 파이프라인 및 CI 게이트** - OpenAPI spec 빌드 타임 추출, 타입 생성, CI freshness 검증
- [ ] **Phase 413: 타입 안전 클라이언트 및 첫 페이지 마이그레이션** - openapi-fetch 클라이언트 래퍼, 고트래픽 페이지 1개 전환
- [ ] **Phase 414: 인터페이스 점진적 마이그레이션** - 나머지 수동 인터페이스/타입 캐스트 페이지별 전환
- [ ] **Phase 415: 백엔드 API 확장 및 상수 통합** - 프로바이더 디스커버리 API, 설정 스키마 엔드포인트, @waiaas/shared 상수 이관
- [ ] **Phase 416: Contract Test 및 검증** - OpenAPI spec 대비 Admin UI 필드 사용 검증, CI 통합

## Phase Details

### Phase 412: Spec 추출 파이프라인 및 CI 게이트
**Goal**: 빌드 타임에 완전한 OpenAPI spec이 추출되고, 타입이 자동 생성되며, CI에서 drift가 차단된다
**Depends on**: Nothing (first phase)
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05, PIPE-06
**Success Criteria** (what must be TRUE):
  1. `pnpm run generate:api-types` 실행 시 openapi.json과 types.generated.ts가 생성된다
  2. 생성된 openapi.json의 엔드포인트 수가 실제 등록된 라우트 수와 일치한다
  3. 백엔드 스키마를 변경한 후 CI에서 types.generated.ts freshness 검증이 실패한다
  4. Turbo 파이프라인에서 admin 빌드 전에 타입 생성 태스크가 실행된다
**Plans**: TBD

Plans:
- [ ] 412-01: TBD
- [ ] 412-02: TBD

### Phase 413: 타입 안전 클라이언트 및 첫 페이지 마이그레이션
**Goal**: openapi-fetch 기반 타입 안전 API 클라이언트가 동작하고, 고트래픽 페이지 1개가 수동 타입 없이 작동한다
**Depends on**: Phase 412
**Requirements**: PIPE-07, PIPE-08, MIG-07
**Success Criteria** (what must be TRUE):
  1. typed-client.ts가 경로 문자열에서 요청/응답 타입을 자동 추론한다
  2. X-Master-Password 헤더가 미들웨어로 자동 주입되고 401 응답 시 로그아웃 처리된다
  3. 마이그레이션된 페이지의 테스트 mock 객체가 satisfies GeneratedType으로 구조 검증된다
**Plans**: TBD

Plans:
- [ ] 413-01: TBD
- [ ] 413-02: TBD

### Phase 414: 인터페이스 점진적 마이그레이션
**Goal**: Admin UI의 모든 수동 인터페이스와 타입 캐스트가 생성 타입으로 전환되어, 백엔드 변경 시 빌드 실패로 불일치가 감지된다
**Depends on**: Phase 413
**Requirements**: MIG-01, MIG-02, MIG-08
**Success Criteria** (what must be TRUE):
  1. Admin UI에 수동 interface 선언이 0개이다 (생성 타입 alias로 전환 완료)
  2. apiGet<수동타입>() 등 수동 타입 단언이 0개이다 (타입 안전 래퍼로 교체 완료)
  3. 백엔드 Zod 스키마에 필드를 추가/제거하면 Admin UI 빌드가 실패한다
  4. pnpm typecheck이 전체 코드베이스에서 에러 없이 통과한다
**Plans**: TBD

Plans:
- [ ] 414-01: TBD
- [ ] 414-02: TBD
- [ ] 414-03: TBD

### Phase 415: 백엔드 API 확장 및 상수 통합
**Goal**: Admin UI가 하드코딩된 프로바이더/정책/에러코드/설정 상수 없이 API 및 @waiaas/shared에서 데이터를 가져온다
**Depends on**: Phase 412
**Requirements**: API-01, API-02, API-03, API-04, MIG-03, MIG-04, MIG-05, MIG-06
**Success Criteria** (what must be TRUE):
  1. GET /v1/actions/providers 응답에 enabledKey, category, isEnabled가 포함되고, Admin UI가 이를 사용해 프로바이더 목록을 렌더링한다
  2. GET /v1/admin/settings/schema가 등록된 설정 키 목록과 메타데이터(category, label, description)를 반환한다
  3. Admin UI에 BUILTIN_PROVIDERS, CRED_TYPES, 정책 타입, 에러 코드 하드코딩이 0개이다
  4. @waiaas/shared에서 re-export된 상수가 daemon과 Admin UI 양쪽에서 동일하게 사용된다
**Plans**: TBD

Plans:
- [ ] 415-01: TBD
- [ ] 415-02: TBD
- [ ] 415-03: TBD

### Phase 416: Contract Test 및 검증
**Goal**: OpenAPI spec과 Admin UI 간 필드 사용 일관성이 CI에서 자동 검증된다
**Depends on**: Phase 414, Phase 415
**Requirements**: API-05
**Success Criteria** (what must be TRUE):
  1. CI에서 OpenAPI spec 응답 스키마 키와 Admin UI 사용 키를 비교하는 contract test가 실행된다
  2. 백엔드에서 응답 필드를 제거하면 contract test가 실패한다
**Plans**: TBD

Plans:
- [ ] 416-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 412 → 413 → 414 → 415 → 416
Note: Phase 415 depends only on Phase 412, so can parallel with 413/414.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 393. Staking Positions (Lido + Jito) | v31.13 | 2/2 | Complete | 2026-03-12 |
| 394. Lending Positions (Aave V3) | v31.13 | 1/1 | Complete | 2026-03-12 |
| 395. Yield Positions (Pendle) | v31.13 | 1/1 | Complete | 2026-03-12 |
| 396. Perp/Spot Positions (Hyperliquid) | v31.13 | 2/2 | Complete | 2026-03-12 |
| 397. Admin Dashboard UX | v31.13 | 2/2 | Complete | 2026-03-12 |
| 398. Type System + Infrastructure Foundation | v31.14 | 2/2 | Complete | 2026-03-13 |
| 399. Core RPC Proxy Engine | v31.14 | 3/3 | Complete | 2026-03-13 |
| 400. Route Assembly + Async Approval | v31.14 | 3/3 | Complete | 2026-03-13 |
| 401. DX Integration + Testing | v31.14 | 3/3 | Complete | 2026-03-13 |
| 402. Schema Hardening | v31.15 | 1/1 | Complete | 2026-03-14 |
| 403. Provider Unit Migration | v31.15 | 2/2 | Complete | 2026-03-14 |
| 404. Typed MCP Schemas + Response Enrichment | v31.15 | 2/2 | Complete | 2026-03-14 |
| 405. humanAmount Parameter | v31.15 | 2/2 | Complete | 2026-03-14 |
| 406. SDK + Skill File Sync + E2E | v31.15 | 2/2 | Complete | 2026-03-14 |
| 407. CAIP-2 Network Input | v31.16 | 1/1 | Complete | 2026-03-14 |
| 408. CAIP-19 Asset Input + Resolve | v31.16 | 2/2 | Complete | 2026-03-14 |
| 409. Response CAIP Enrichment + OpenAPI | v31.16 | 2/2 | Complete | 2026-03-14 |
| 410. SDK + MCP CAIP Extension | v31.16 | 2/2 | Complete | 2026-03-14 |
| 411. Skill Files Sync | v31.16 | 1/1 | Complete | 2026-03-14 |
| 412. Spec 추출 파이프라인 및 CI 게이트 | v31.17 | 0/2 | Not started | - |
| 413. 타입 안전 클라이언트 및 첫 페이지 마이그레이션 | v31.17 | 0/2 | Not started | - |
| 414. 인터페이스 점진적 마이그레이션 | v31.17 | 0/3 | Not started | - |
| 415. 백엔드 API 확장 및 상수 통합 | v31.17 | 0/3 | Not started | - |
| 416. Contract Test 및 검증 | v31.17 | 0/1 | Not started | - |
