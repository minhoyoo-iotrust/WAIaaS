# Roadmap: WAIaaS

## Milestones

- ✅ **v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글** — Phases 432-434 (shipped 2026-03-16)
- 🚧 **v32.6 성능 + 구조 개선** — Phases 435-438 (in progress)

<details>
<summary>✅ v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글 (Phases 432-434) — SHIPPED 2026-03-16</summary>

- [x] Phase 432: Interface Extension (2/2 plans) — completed 2026-03-16
- [x] Phase 433: Multichain Positions (4/4 plans) — completed 2026-03-16
- [x] Phase 434: Testnet Toggle (2/2 plans) — completed 2026-03-16

</details>

See `.planning/milestones/v32.5-ROADMAP.md` for full details.

## Phases

**Phase Numbering:**
- Integer phases (435, 436, 437, 438): Planned milestone work
- Decimal phases (e.g., 435.1): Urgent insertions (marked with INSERTED)

- [x] **Phase 435: N+1 쿼리 해소** - 세션/지갑/토큰 조회의 개별 쿼리를 배치 쿼리로 전환
- [ ] **Phase 436: 페이지네이션 추가** - sessions/policies API에 limit/offset 페이지네이션 적용
- [ ] **Phase 437: 대형 파일 분할 (migrate + daemon + policy-engine)** - 3개 대형 모듈을 책임 단위로 분리
- [ ] **Phase 438: 파이프라인 분할 + 추가 정리** - stages.ts 6단계 분할, Solana mapError, ILogger 인터페이스

## Phase Details

### Phase 435: N+1 쿼리 해소
**Goal**: API 응답 시 발생하는 N+1 개별 쿼리가 배치 쿼리로 전환되어 DB 라운드트립이 감소한다
**Depends on**: Nothing (first phase)
**Requirements**: NQ-01, NQ-02, NQ-03, NQ-04, NQ-05, NQ-06, NQ-07
**Success Criteria** (what must be TRUE):
  1. GET /v1/sessions 호출 시 세션 수에 관계없이 지갑 조회가 단일 IN() 쿼리로 수행된다
  2. POST /admin/sessions/prompt 호출 시 지갑 정보와 linked count가 각각 단일 쿼리로 조회된다
  3. 트랜잭션 목록 조회 시 토큰 정보가 unique address 기반 배치 조회로 수행된다
  4. 세션 생성 시 다수 walletId 검증이 단일 IN() 쿼리로 수행된다
  5. 기존 전체 테스트 스위트가 변경 없이 통과한다
**Plans**: 2 plans

Plans:
- [x] 435-01-PLAN.md — 세션 관련 N+1 배치 전환 (sessions.ts, admin-monitoring.ts agent-prompt)
- [x] 435-02-PLAN.md — formatTxAmount 토큰 정보 배치 조회 전환 (admin-wallets, admin-monitoring, admin-auth)

### Phase 436: 페이지네이션 추가
**Goal**: 대량 데이터를 반환하는 목록 API가 페이지네이션을 지원하여 클라이언트가 필요한 범위만 조회할 수 있다
**Depends on**: Phase 435
**Requirements**: PAG-01, PAG-02, PAG-03, PAG-04, PAG-05, PAG-06, PAG-07, PAG-08
**Success Criteria** (what must be TRUE):
  1. GET /v1/sessions?limit=10&offset=20 호출 시 해당 범위의 세션과 total 카운트가 반환된다
  2. GET /v1/policies?limit=10&offset=0 호출 시 해당 범위의 정책과 total 카운트가 반환된다
  3. limit/offset 생략 시 기본값(50/0)이 적용되어 기존 클라이언트가 동작 변경 없이 사용할 수 있다
  4. SDK listSessions()/listPolicies()와 MCP list-sessions/list-policies에서 pagination 옵션을 사용할 수 있다
  5. OpenAPI 스키마에 페이지네이션 파라미터와 응답 형식이 문서화되어 있다
**Plans**: 2 plans

Plans:
- [ ] 436-01-PLAN.md — API 페이지네이션 구현 (sessions/policies route + OpenAPI 스키마 + semver 정적 import)
- [ ] 436-02-PLAN.md — SDK listSessions/listPolicies 메서드 + MCP list_sessions/get_policies pagination

### Phase 437: 대형 파일 분할 (migrate + daemon + policy-engine)
**Goal**: 1,500줄 이상 대형 파일 3개가 책임 단위 모듈로 분리되어 각 파일이 단일 책임을 가진다
**Depends on**: Phase 436
**Requirements**: MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, MIG-06, MIG-07, MIG-08, MIG-09, DMN-01, DMN-02, DMN-03, DMN-04, DMN-05, DMN-06, DPE-01, DPE-02, DPE-03, DPE-04, DPE-05, DPE-06, DPE-07, DPE-08
**Success Criteria** (what must be TRUE):
  1. migrate.ts가 러너 로직만 포함하고 DDL/마이그레이션은 6개 하위 모듈에서 import된다
  2. daemon.ts가 DaemonLifecycle 조합 클래스와 필드 선언만 포함하고 startup/shutdown/pipeline이 별도 파일이다
  3. database-policy-engine.ts가 evaluator 조합 로직만 포함하고 6개 정책 evaluator가 별도 파일이다
  4. v1-v59 마이그레이션 체인 테스트, 데몬 라이프사이클 테스트, 7개+ 정책 타입 테스트가 모두 통과한다
  5. 모든 inline import() 타입이 정적 import type으로 교체되어 있다
**Plans**: TBD

Plans:
- [ ] 437-01: TBD
- [ ] 437-02: TBD
- [ ] 437-03: TBD

### Phase 438: 파이프라인 분할 + 추가 정리
**Goal**: stages.ts가 스테이지별 모듈로 분리되고, Solana 에러 처리가 표준화되며, 로깅 추상화 인터페이스가 도입된다
**Depends on**: Phase 437
**Requirements**: STG-01, STG-02, STG-03, STG-04, STG-05, STG-06, STG-07, STG-08, CLN-01, CLN-02, CLN-03, CLN-04
**Success Criteria** (what must be TRUE):
  1. stages.ts 대신 stage1-validate.ts ~ stage6-confirm.ts 6개 파일과 pipeline-helpers.ts가 존재한다
  2. Solana 어댑터의 catch 블록 20곳이 중앙 mapError() 메서드를 호출하고 에러 분류 테스트가 존재한다
  3. ILogger 인터페이스가 정의되고 console 기본 구현이 제공된다
  4. 전체 테스트 스위트(unit + typecheck + lint)가 통과한다
**Plans**: TBD

Plans:
- [ ] 438-01: TBD
- [ ] 438-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 435 -> 436 -> 437 -> 438

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 435. N+1 쿼리 해소 | 2/2 | Complete    | 2026-03-16 |
| 436. 페이지네이션 추가 | 0/2 | Not started | - |
| 437. 대형 파일 분할 | 0/3 | Not started | - |
| 438. 파이프라인 분할 + 추가 정리 | 0/2 | Not started | - |
