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
- ✅ **v1.1 ~ v31.11** — (96 milestones shipped)
- 🚧 **v31.12** — External Action 프레임워크 구현 (Phases 386-392)

## Phases

**Phase Numbering:**
- Integer phases (386, 387, ...): Planned milestone work
- Decimal phases (386.1, 386.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 386: 타입 시스템 + 에러 코드 + DB 마이그레이션** - ResolvedAction 3-kind Zod union, 에러 코드 6종, DB v55-v56 스키마 (completed 2026-03-11)
- [x] **Phase 387: Signer Capability 레지스트리** - ISignerCapability 7-scheme 구현 + 자동 매핑 레지스트리 (completed 2026-03-11)
- [x] **Phase 388: Credential Vault** - per-wallet/글로벌 credential 암호화 저장 + CRUD REST API (completed 2026-03-11)
- [x] **Phase 389: 추적 + 정책 확장** - AsyncTracker 9-state + Venue Whitelist + Category Limit 정책 (completed 2026-03-11)
- [x] **Phase 390: 파이프라인 라우팅 + 조회 API** - signedData/signedHttp 파이프라인 + action 이력 조회 (completed 2026-03-12)
- [x] **Phase 391: Admin UI** - Credential/External Action/Venue/Policy 관리 화면 4종 (completed 2026-03-12)
- [ ] **Phase 392: MCP + SDK + 스킬 파일** - 통합 인터페이스 3종 + 스킬 문서 4종

## Phase Details

### Phase 386: 타입 시스템 + 에러 코드 + DB 마이그레이션
**Goal**: ResolvedAction 3-kind Zod 타입과 DB 스키마가 준비되어 후속 구현의 기반이 확립된다
**Depends on**: Nothing (first phase)
**Requirements**: RTYPE-01, RTYPE-02, RTYPE-03, RTYPE-04, RTYPE-05, RTYPE-06, RTYPE-07, ERR-01, ERR-02, ERR-03, DBMIG-01, DBMIG-02, DBMIG-03
**Success Criteria** (what must be TRUE):
  1. ResolvedAction Zod 스키마로 contractCall/signedData/signedHttp 3종을 파싱하면 kind별로 올바르게 분기된다
  2. 기존 13개 ActionProvider가 kind 없이 ContractCallRequest를 반환해도 contractCall로 정규화되어 기존 동작이 유지된다
  3. DB v55 마이그레이션 실행 후 wallet_credentials 테이블이 생성되고, v56 실행 후 transactions 테이블에 action_kind/venue/operation 컬럼이 추가된다
  4. 마이그레이션 테스트가 스키마 스냅샷 검증과 데이터 변환 검증을 통과한다
  5. CREDENTIAL_NOT_FOUND, SIGNING_SCHEME_UNSUPPORTED, VENUE_NOT_ALLOWED 등 6종 에러 코드가 등록되어 사용 가능하다
**Plans:** 3/3 plans complete
Plans:
- [ ] 386-01-PLAN.md — ResolvedAction Zod 타입 시스템 + 에러 코드 6종
- [ ] 386-02-PLAN.md — DB v55+v56 마이그레이션 + Drizzle 스키마
- [ ] 386-03-PLAN.md — IActionProvider 반환 타입 확장 + 하위 호환 검증

### Phase 387: Signer Capability 레지스트리
**Goal**: 7종 서명 스킴이 레지스트리에 등록되어 signingScheme 문자열로 적절한 서명기를 자동 선택할 수 있다
**Depends on**: Phase 386
**Requirements**: SIGN-01, SIGN-02, SIGN-03, SIGN-04, SIGN-05, SIGN-06, SIGN-07, SIGN-08
**Success Criteria** (what must be TRUE):
  1. SignerCapabilityRegistry에 signingScheme 문자열을 전달하면 해당 ISignerCapability 구현체가 반환된다
  2. Eip712/PersonalSign/Erc8128 어댑터가 기존 서명 함수를 래핑하여 동일한 결과를 생성한다
  3. HmacSignerCapability와 RsaPssSignerCapability가 credential 바이트를 받아 올바른 서명을 생성한다
  4. 기존 sign-message/sign-only/ERC-8128 파이프라인 경로가 변경 없이 동작한다
**Plans:** 2/2 plans complete
Plans:
- [ ] 387-01-PLAN.md — ISignerCapability 타입 + SigningError + 7종 Capability 구현체 (TDD)
- [ ] 387-02-PLAN.md — SignerCapabilityRegistry + bootstrap + 하위 호환 검증 (TDD)

### Phase 388: Credential Vault
**Goal**: AI 에이전트의 외부 서비스 인증 정보가 per-wallet/글로벌 레벨로 암호화 저장되고 REST API로 관리할 수 있다
**Depends on**: Phase 386
**Requirements**: CRED-01, CRED-02, CRED-03, CRED-04, CRED-05, CRED-06, CRED-07, CRED-08, CRED-09, CRED-10, CRED-11
**Success Criteria** (what must be TRUE):
  1. masterAuth로 credential을 등록하면 AES-256-GCM으로 암호화되어 DB에 저장되고, sessionAuth로 목록 조회 시 원문이 노출되지 않는다
  2. credentialRef 문자열로 파이프라인 내부에서 credential을 복호화하여 사용할 수 있고, API 응답에는 절대 포함되지 않는다
  3. per-wallet credential이 글로벌 credential보다 우선하여 조회된다
  4. Master Password 변경 시 wallet_credentials 전 레코드가 re-encrypt된다
  5. 만료된 credential이 WorkerScheduler에 의해 자동 정리된다
**Plans:** 2/2 plans complete
Plans:
- [x] 388-01-PLAN.md — ICredentialVault 타입 + 암호화 + LocalCredentialVault + re-encrypt (TDD)
- [x] 388-02-PLAN.md — Credential REST API 8 endpoints + cleanup worker

### Phase 389: 추적 + 정책 확장
**Goal**: off-chain action의 상태가 9-state로 추적되고, Venue Whitelist/Category Limit 정책이 적용된다
**Depends on**: Phase 386
**Requirements**: TRACK-01, TRACK-02, TRACK-03, TRACK-04, TRACK-05, TRACK-06, POLICY-01, POLICY-02, POLICY-03, POLICY-04, POLICY-05, POLICY-06
**Success Criteria** (what must be TRUE):
  1. ExternalActionTracker가 off-chain action 상태를 venue별로 폴링하여 PARTIALLY_FILLED/FILLED/CANCELED/SETTLED/EXPIRED 전이를 감지한다
  2. VENUE_WHITELIST가 활성화되면 허용 목록에 없는 venue의 action이 VENUE_NOT_ALLOWED로 거부된다
  3. ACTION_CATEGORY_LIMIT 정책이 카테고리별 USD 한도를 daily/monthly/per_action 단위로 적용하고, 초과 시 tier_on_exceed 동작이 실행된다
  4. 기존 SPENDING_LIMIT/provider-trust 정책과 충돌 없이 공존한다
**Plans:** 2/2 plans complete
Plans:
- [ ] 389-01-PLAN.md — AsyncTrackingResult 9-state + DB v57 + AsyncPollingService 확장 + 알림 이벤트 6종
- [ ] 389-02-PLAN.md — TransactionParam 확장 + VENUE_WHITELIST + ACTION_CATEGORY_LIMIT 정책

### Phase 390: 파이프라인 라우팅 + 조회 API
**Goal**: signedData/signedHttp action이 새 파이프라인으로 라우팅되어 실행되고, 실행 이력을 조회할 수 있다
**Depends on**: Phase 387, Phase 388, Phase 389
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05, PIPE-06, PIPE-07, QUERY-01, QUERY-02, QUERY-03
**Success Criteria** (what must be TRUE):
  1. POST /v1/actions/:provider/:action 요청 시 resolve 결과의 kind에 따라 기존 파이프라인(contractCall) 또는 새 파이프라인(signedData/signedHttp)으로 자동 분기된다
  2. signedData action이 credential 복호화 -> 정책 평가 -> DB 저장 -> signer 서명 -> 추적 등록 순서로 실행된다
  3. GET /v1/wallets/:id/actions로 off-chain action 목록을 venue/status 필터와 페이지네이션으로 조회할 수 있다
  4. connect-info API에 externalActions/signing/supportedVenues capability가 노출된다
  5. 서명 완료 후 keyStore.releaseKey()가 즉시 호출되고, ACTION_SIGNED/ACTION_HTTP_SIGNED 감사 로그가 기록된다
**Plans:** 2/2 plans complete
Plans:
- [x] 390-01-PLAN.md — signedData/signedHttp 파이프라인 함수 + kind-based 라우팅 분기 + 감사 이벤트
- [x] 390-02-PLAN.md — off-chain action 조회 API 2종 + connect-info capability 확장

### Phase 391: Admin UI
**Goal**: 운영자가 Admin UI에서 credential 관리, off-chain action 모니터링, venue/category 정책을 설정할 수 있다
**Depends on**: Phase 390
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04
**Success Criteria** (what must be TRUE):
  1. Credentials 페이지에서 per-wallet/글로벌 credential을 등록/삭제/로테이션할 수 있고, 원문은 표시되지 않는다
  2. 지갑 상세의 External Actions 탭에서 off-chain action 이력(venue, operation, status, createdAt)을 확인할 수 있다
  3. Venue Whitelist 설정 UI에서 허용 venue를 추가/제거/토글할 수 있다
  4. ACTION_CATEGORY_LIMIT 설정 UI에서 카테고리별 USD 한도를 등록/수정/삭제할 수 있다
**Plans:** 2/2 plans complete
Plans:
- [x] 391-01-PLAN.md — Credentials 페이지 + Wallet Detail Credentials/External Actions 탭
- [x] 391-02-PLAN.md — VENUE_WHITELIST + ACTION_CATEGORY_LIMIT 정책 폼

### Phase 392: MCP + SDK + 스킬 파일
**Goal**: MCP 도구와 SDK 메서드로 off-chain action을 실행/조회할 수 있고, 스킬 파일이 AI 에이전트에게 사용법을 안내한다
**Depends on**: Phase 390
**Requirements**: INTEG-01, INTEG-02, INTEG-03, INTEG-04, INTEG-05, INTEG-06, SKILL-01, SKILL-02, SKILL-03, SKILL-04
**Success Criteria** (what must be TRUE):
  1. MCP 기존 action 도구로 off-chain action을 실행하면 resolve 결과에 따라 자동으로 올바른 파이프라인이 호출된다
  2. SDK executeAction()으로 off-chain action 실행, listOffchainActions()/getActionResult()로 이력 조회가 가능하다
  3. SDK AdminClient로 credential CRUD(create/delete/rotate)가 가능하다
  4. external-actions.skill.md가 off-chain action 개념, signing scheme, credential 설정, 사용 예시를 포함한다
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 386 -> 387 -> 388 -> 389 -> 390 -> 391 -> 392
(388, 389 can run after 386 independently; 391, 392 can run after 390 independently)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 386. 타입 시스템 + 에러 코드 + DB 마이그레이션 | 3/3 | Complete    | 2026-03-11 |
| 387. Signer Capability 레지스트리 | 2/2 | Complete    | 2026-03-11 |
| 388. Credential Vault | 2/2 | Complete    | 2026-03-11 |
| 389. 추적 + 정책 확장 | 2/2 | Complete    | 2026-03-11 |
| 390. 파이프라인 라우팅 + 조회 API | 2/2 | Complete    | 2026-03-11 |
| 391. Admin UI | 2/2 | Complete    | 2026-03-12 |
| 392. MCP + SDK + 스킬 파일 | 0/TBD | Not started | - |
