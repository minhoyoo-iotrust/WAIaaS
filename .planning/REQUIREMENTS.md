# Requirements: WAIaaS v32.6 성능 + 구조 개선

**Defined:** 2026-03-17
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### N+1 쿼리 해소

- [ ] **NQ-01**: GET /sessions에서 세션당 개별 wallet 쿼리 대신 단일 IN(sessionIds) 쿼리로 지갑 목록을 조회한다
- [ ] **NQ-02**: POST /admin/sessions/prompt에서 walletId별 개별 쿼리 대신 단일 IN(walletIds) 쿼리로 지갑 정보를 조회한다
- [ ] **NQ-03**: POST /admin/sessions/prompt에서 후보 세션별 linked count 개별 쿼리 대신 단일 JOIN 쿼리로 동시 조회한다
- [ ] **NQ-04**: formatTxAmount에서 행당 token_registry 개별 조회 대신 unique tokenAddress 수집 후 단일 IN() 배치 조회한다
- [ ] **NQ-05**: formatTxAmount 호출부 3곳(admin-wallets, admin-monitoring x2, admin-auth)에서 사전 배치 조회 후 tokenMap을 전달한다
- [ ] **NQ-06**: 세션 생성 시 walletId별 개별 조회 대신 단일 IN(walletIds) 쿼리로 지갑을 검증한다
- [ ] **NQ-07**: N+1 해소 후 기존 테스트가 전체 통과한다

### 페이지네이션

- [ ] **PAG-01**: GET /v1/sessions가 limit/offset 쿼리 파라미터를 지원하고 응답에 total을 포함한다
- [ ] **PAG-02**: GET /v1/policies가 limit/offset 쿼리 파라미터를 지원하고 응답에 total을 포함한다
- [ ] **PAG-03**: 파라미터 생략 시 기본값(limit=50, offset=0)이 적용되어 하위 호환성을 유지한다
- [ ] **PAG-04**: offset이 total을 초과하면 빈 배열을 반환한다
- [ ] **PAG-05**: OpenAPI 스키마에 페이지네이션 파라미터와 응답 스키마가 반영된다
- [ ] **PAG-06**: SDK listSessions()와 listPolicies()에 pagination 옵션이 추가된다
- [ ] **PAG-07**: MCP list-sessions와 list-policies 도구에 pagination 파라미터가 추가된다
- [ ] **PAG-08**: admin-auth.ts의 dynamic import('semver')가 정적 import로 교체된다

### migrate.ts 분할

- [ ] **MIG-01**: 초기 DDL이 schema-ddl.ts로 분리된다
- [ ] **MIG-02**: 마이그레이션 v2-v10이 migrations/v2-v10.ts로 분리된다
- [ ] **MIG-03**: 마이그레이션 v11-v20이 migrations/v11-v20.ts로 분리된다
- [ ] **MIG-04**: 마이그레이션 v21-v30이 migrations/v21-v30.ts로 분리된다
- [ ] **MIG-05**: 마이그레이션 v31-v40이 migrations/v31-v40.ts로 분리된다
- [ ] **MIG-06**: 마이그레이션 v41-v50이 migrations/v41-v50.ts로 분리된다
- [ ] **MIG-07**: 마이그레이션 v51-v59가 migrations/v51-v59.ts로 분리된다
- [ ] **MIG-08**: migrate.ts가 마이그레이션 러너만 포함하고 분할된 모듈을 import한다
- [ ] **MIG-09**: v1→v59 순차 마이그레이션 체인 테스트가 통과한다

### daemon.ts 분할

- [ ] **DMN-01**: daemon-startup.ts로 start()와 서비스 초기화 로직이 분리된다
- [ ] **DMN-02**: daemon-shutdown.ts로 stop()과 graceful shutdown 로직이 분리된다
- [ ] **DMN-03**: daemon-pipeline.ts로 reEntryPendingTransactions() 로직이 분리된다
- [ ] **DMN-04**: daemon.ts가 DaemonLifecycle 조합 클래스와 필드 선언만 포함한다
- [ ] **DMN-05**: inline import() 타입이 정적 import type으로 교체된다
- [ ] **DMN-06**: 분할 후 데몬 시작→요청 처리→종료 플로우 기존 테스트가 통과한다

### database-policy-engine.ts 분할

- [ ] **DPE-01**: evaluators/spending-limit.ts로 SpendingLimit 평가 로직이 분리된다
- [ ] **DPE-02**: evaluators/contract-whitelist.ts로 CONTRACT_WHITELIST 평가 로직이 분리된다
- [ ] **DPE-03**: evaluators/allowed-tokens.ts로 ALLOWED_TOKENS 평가 로직이 분리된다
- [ ] **DPE-04**: evaluators/approved-spenders.ts로 APPROVED_SPENDERS 평가 로직이 분리된다
- [ ] **DPE-05**: evaluators/lending-asset-whitelist.ts로 Lending 자산 화이트리스트 평가 로직이 분리된다
- [ ] **DPE-06**: evaluators/lending-ltv-limit.ts로 Lending LTV 한도 평가 로직이 분리된다
- [ ] **DPE-07**: database-policy-engine.ts가 evaluator 조합과 공통 로직만 포함한다
- [ ] **DPE-08**: 7개+ 정책 타입 기존 테스트가 전체 통과한다

### stages.ts 분할

- [ ] **STG-01**: stage1-validate.ts로 Stage 1 검증 로직이 분리된다
- [ ] **STG-02**: stage2-auth.ts로 Stage 2 인증 로직이 분리된다
- [ ] **STG-03**: stage3-policy.ts로 Stage 3 정책 로직이 분리된다
- [ ] **STG-04**: stage4-wait.ts로 Stage 4 대기 로직이 분리된다
- [ ] **STG-05**: stage5-execute.ts로 Stage 5 실행 로직이 분리된다
- [ ] **STG-06**: stage6-confirm.ts로 Stage 6 확인 로직이 분리된다
- [ ] **STG-07**: pipeline-helpers.ts로 공유 헬퍼/타입이 분리된다
- [ ] **STG-08**: 분할 후 파이프라인 기존 테스트가 전체 통과한다

### 추가 정리

- [ ] **CLN-01**: Solana 어댑터에 중앙화된 mapError() 메서드가 생성되어 20곳 catch 패턴을 대체한다
- [ ] **CLN-02**: Solana 에러 분류 테스트가 추가된다
- [ ] **CLN-03**: ILogger 인터페이스가 정의되고 console 기본 구현이 제공된다
- [ ] **CLN-04**: 전체 테스트 스위트(unit + typecheck + lint)가 통과한다

## v2 Requirements

None — 이 마일스톤은 자체 완결적 리팩토링.

## Out of Scope

| Feature | Reason |
|---------|--------|
| 구조화 로거 전체 구현 | ILogger 인터페이스만 정의, 실제 로거(winston/pino) 도입은 운영 인프라 마일스톤 |
| admin-monitoring.ts 분할 | 943줄로 대형이나 1,500줄 미만이므로 이 마일스톤에서 제외 |
| Cursor-based 페이지네이션 | 세션/정책은 대량 데이터가 아니므로 offset/limit으로 충분 |
| 신규 DB 마이그레이션 | 이 마일스톤은 코드 구조 변경만, 스키마 변경 없음 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| NQ-01 | Phase 435 | Pending |
| NQ-02 | Phase 435 | Pending |
| NQ-03 | Phase 435 | Pending |
| NQ-04 | Phase 435 | Pending |
| NQ-05 | Phase 435 | Pending |
| NQ-06 | Phase 435 | Pending |
| NQ-07 | Phase 435 | Pending |
| PAG-01 | Phase 436 | Pending |
| PAG-02 | Phase 436 | Pending |
| PAG-03 | Phase 436 | Pending |
| PAG-04 | Phase 436 | Pending |
| PAG-05 | Phase 436 | Pending |
| PAG-06 | Phase 436 | Pending |
| PAG-07 | Phase 436 | Pending |
| PAG-08 | Phase 436 | Pending |
| MIG-01 | Phase 437 | Pending |
| MIG-02 | Phase 437 | Pending |
| MIG-03 | Phase 437 | Pending |
| MIG-04 | Phase 437 | Pending |
| MIG-05 | Phase 437 | Pending |
| MIG-06 | Phase 437 | Pending |
| MIG-07 | Phase 437 | Pending |
| MIG-08 | Phase 437 | Pending |
| MIG-09 | Phase 437 | Pending |
| DMN-01 | Phase 437 | Pending |
| DMN-02 | Phase 437 | Pending |
| DMN-03 | Phase 437 | Pending |
| DMN-04 | Phase 437 | Pending |
| DMN-05 | Phase 437 | Pending |
| DMN-06 | Phase 437 | Pending |
| DPE-01 | Phase 437 | Pending |
| DPE-02 | Phase 437 | Pending |
| DPE-03 | Phase 437 | Pending |
| DPE-04 | Phase 437 | Pending |
| DPE-05 | Phase 437 | Pending |
| DPE-06 | Phase 437 | Pending |
| DPE-07 | Phase 437 | Pending |
| DPE-08 | Phase 437 | Pending |
| STG-01 | Phase 438 | Pending |
| STG-02 | Phase 438 | Pending |
| STG-03 | Phase 438 | Pending |
| STG-04 | Phase 438 | Pending |
| STG-05 | Phase 438 | Pending |
| STG-06 | Phase 438 | Pending |
| STG-07 | Phase 438 | Pending |
| STG-08 | Phase 438 | Pending |
| CLN-01 | Phase 438 | Pending |
| CLN-02 | Phase 438 | Pending |
| CLN-03 | Phase 438 | Pending |
| CLN-04 | Phase 438 | Pending |

**Coverage:**
- v1 requirements: 46 total
- Mapped to phases: 46
- Unmapped: 0

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 after roadmap creation*
