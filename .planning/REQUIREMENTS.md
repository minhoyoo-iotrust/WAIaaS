# Requirements: WAIaaS v31.17 OpenAPI 기반 프론트엔드 타입 자동 생성

**Defined:** 2026-03-15
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Pipeline (타입 생성 파이프라인)

- [ ] **PIPE-01**: OpenAPI spec을 createApp() stub deps 주입으로 빌드 타임에 JSON 파일로 추출할 수 있다
- [ ] **PIPE-02**: 추출된 spec의 엔드포인트 수가 실제 등록된 라우트 수와 일치하는지 자동 검증된다
- [ ] **PIPE-03**: openapi-typescript로 openapi.json에서 types.generated.ts를 자동 생성할 수 있다
- [ ] **PIPE-04**: pnpm run generate:api-types 명령으로 추출+생성이 한 번에 실행된다
- [ ] **PIPE-05**: Turbo build pipeline에서 admin 빌드 전에 타입 생성이 실행된다
- [ ] **PIPE-06**: CI에서 types.generated.ts freshness를 검증하여 stale 타입을 차단한다
- [ ] **PIPE-07**: openapi-fetch 기반 타입 안전 API 클라이언트가 경로와 응답 타입을 자동 연결한다
- [ ] **PIPE-08**: 타입 안전 클라이언트가 X-Master-Password 헤더 주입과 401 로그아웃을 미들웨어로 처리한다

### Migration (Admin UI 타입 전환)

- [ ] **MIG-01**: Admin UI 수동 interface 62개가 생성 타입 alias로 전환된다
- [ ] **MIG-02**: apiGet<수동타입>() 등 28개 수동 타입 단언이 타입 안전 래퍼 호출로 교체된다
- [ ] **MIG-03**: BUILTIN_PROVIDERS 하드코딩 배열이 @waiaas/shared import 또는 API 디스커버리로 교체된다
- [ ] **MIG-04**: CRED_TYPES 하드코딩이 @waiaas/shared re-export로 교체된다
- [ ] **MIG-05**: 정책 타입 하드코딩이 @waiaas/shared re-export 또는 생성 타입으로 교체된다
- [ ] **MIG-06**: 에러 코드 매핑 하드코딩이 @waiaas/shared re-export로 교체된다
- [ ] **MIG-07**: Admin UI 테스트의 mock 객체가 satisfies GeneratedType으로 구조 검증된다
- [ ] **MIG-08**: 백엔드 응답 스키마 변경 시 Admin UI 빌드가 실패하여 불일치를 사전 감지한다

### API (백엔드 API 확장)

- [ ] **API-01**: GET /v1/actions/providers 응답에 enabledKey, category, isEnabled 필드가 추가된다
- [ ] **API-02**: Admin UI가 BUILTIN_PROVIDERS 없이 API 응답만으로 프로바이더 목록을 렌더링한다
- [ ] **API-03**: GET /v1/admin/settings/schema 엔드포인트가 등록된 설정 키 목록과 메타데이터를 반환한다
- [ ] **API-04**: Admin UI가 설정 키 검색/표시에 하드코딩 대신 schema API를 사용한다
- [ ] **API-05**: OpenAPI spec 응답 스키마 키와 프론트엔드 사용 키를 비교하는 contract test가 CI에서 실행된다

## v2 Requirements

Deferred to future release.

None — all identified features are in scope.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full codegen (hey-api) | Over-engineering — openapi-typescript + openapi-fetch covers all needs |
| Big-bang interface replacement | Risk — incremental page-by-page migration is safer |
| Frontend Zod validation duplication | Unnecessary — server-side validation sufficient, types for compile-time only |
| Discriminated union migration | openapi-typescript doesn't produce narrowed TS discriminants from OpenAPI oneOf — keep Zod-derived types from @waiaas/core |
| Runtime type validation in client | Bundle size concern — compile-time types sufficient for Admin UI |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PIPE-01 | — | Pending |
| PIPE-02 | — | Pending |
| PIPE-03 | — | Pending |
| PIPE-04 | — | Pending |
| PIPE-05 | — | Pending |
| PIPE-06 | — | Pending |
| PIPE-07 | — | Pending |
| PIPE-08 | — | Pending |
| MIG-01 | — | Pending |
| MIG-02 | — | Pending |
| MIG-03 | — | Pending |
| MIG-04 | — | Pending |
| MIG-05 | — | Pending |
| MIG-06 | — | Pending |
| MIG-07 | — | Pending |
| MIG-08 | — | Pending |
| API-01 | — | Pending |
| API-02 | — | Pending |
| API-03 | — | Pending |
| API-04 | — | Pending |
| API-05 | — | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 0
- Unmapped: 21 ⚠️

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after initial definition*
