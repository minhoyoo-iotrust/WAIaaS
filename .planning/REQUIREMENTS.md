# Requirements: WAIaaS v1.4.6

**Defined:** 2026-02-14
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

v1.4.5 설계 문서(docs/68-72) 기반 멀티체인 월렛 모델 구현.

### DB 마이그레이션

- [ ] **MIGR-01**: v6a 마이그레이션으로 transactions.network 컬럼 추가 + 기존 레코드 wallets.network 역참조 UPDATE
- [ ] **MIGR-02**: v6b 마이그레이션(12-step)으로 wallets 테이블 network→environment 전환 + default_network 추가 + FK 4개 테이블 재생성
- [ ] **MIGR-03**: v8 마이그레이션으로 policies 테이블에 network 컬럼 추가 (nullable, 12-step 재생성)
- [ ] **MIGR-04**: 마이그레이션 후 기존 데이터 무결성 검증 (network→environment 변환 정확성, default_network 보존)

### 스키마 + 환경 모델

- [ ] **SCHEMA-01**: EnvironmentType Zod SSoT 추가 + 5단계 파생 체인 (Zod→TS→OpenAPI→Drizzle→CHECK)
- [ ] **SCHEMA-02**: 환경-네트워크 매핑 함수 4개 구현 (getNetworksForEnvironment, getDefaultNetwork, deriveEnvironment, validateNetworkEnvironment)
- [ ] **SCHEMA-03**: WalletSchema network→environment 전환 + defaultNetwork 추가 + CreateWalletRequest environment 파라미터
- [ ] **SCHEMA-04**: TransactionRequestSchema 5-type에 network 선택 파라미터 추가
- [ ] **SCHEMA-05**: ALLOWED_NETWORKS PolicyType 추가 + AllowedNetworksRulesSchema 정의

### 파이프라인

- [ ] **PIPE-01**: resolveNetwork() 순수 함수 구현 (요청 network > wallet.defaultNetwork > getDefaultNetwork 3단계 우선순위)
- [ ] **PIPE-02**: PipelineContext에 wallet.environment/defaultNetwork + resolvedNetwork 확장
- [ ] **PIPE-03**: Stage 1에서 네트워크 해결 + 환경 일치 검증 + transactions.network INSERT
- [ ] **PIPE-04**: Stage 3 정책 평가에서 네트워크 스코프 매칭 (policy.network = tx.network OR policy.network IS NULL)
- [ ] **PIPE-05**: Stage 5에서 resolvedNetwork로 AdapterPool.resolve() 호출

### 정책 엔진

- [ ] **PLCY-01**: ALLOWED_NETWORKS 정책 평가 로직 구현 (permissive default — 미설정 시 전체 허용)
- [ ] **PLCY-02**: 네트워크 스코프 정책 4단계 override 우선순위 (wallet+network > wallet+null > global+network > global+null)
- [ ] **PLCY-03**: evaluateAndReserve() SQL에 network 필터 추가

### REST API

- [ ] **API-01**: POST /v1/wallets에 environment 파라미터 추가 (기본값 testnet) + deriveEnvironment 하위호환
- [ ] **API-02**: POST /v1/transactions/send에 network 선택 파라미터 추가
- [ ] **API-03**: GET /v1/wallets/:id/balance + GET /v1/wallets/:id/assets에 network 쿼리 파라미터 추가
- [ ] **API-04**: PUT /v1/wallets/:id/default-network 신규 엔드포인트
- [ ] **API-05**: GET /v1/wallets/:id/networks 신규 엔드포인트 (사용 가능 네트워크 목록)
- [ ] **API-06**: ALLOWED_NETWORKS 정책 CRUD API 지원

### MCP + SDK

- [ ] **INTEG-01**: MCP 6개 도구에 network 선택 파라미터 추가 (send_transaction, send_token, get_balance, get_assets, call_contract, approve_token)
- [ ] **INTEG-02**: get_wallet_info에 사용 가능 네트워크 목록 포함
- [ ] **INTEG-03**: TS SDK sendTransaction/sendToken/getBalance/getAssets에 options.network 추가
- [ ] **INTEG-04**: Python SDK 동일 network 파라미터 확장

### Admin UI

- [ ] **ADMIN-01**: 월렛 생성 UI에서 network 드롭다운 → environment 라디오버튼 (testnet/mainnet) 전환
- [ ] **ADMIN-02**: 월렛 상세에서 사용 가능 네트워크 목록 + 기본 네트워크 변경 UI
- [ ] **ADMIN-03**: 트랜잭션 목록에 network 컬럼 추가
- [ ] **ADMIN-04**: 정책 생성에 ALLOWED_NETWORKS 타입 + 네트워크 스코프 선택 추가

### CLI Quickstart

- [ ] **CLI-01**: waiaas quickstart --mode testnet/mainnet 명령 구현 (Solana + EVM 2 월렛 일괄 생성)
- [ ] **CLI-02**: Quickstart 출력에 체인별 네트워크·주소 목록 + MCP 클라이언트 설정 스니펫

### DX + 통합

- [ ] **DX-01**: Skill 파일 4개 동기화 (quickstart, wallet, transactions, policies)
- [ ] **DX-02**: 기존 월렛/API/MCP/정책 하위호환 검증 (network 미지정 시 기존 동작 유지)

## Future Requirements

(v1.5 이후로 이관)

## Out of Scope

| Feature | Reason |
|---------|--------|
| 새 EVM 네트워크 추가 (Base Sepolia 등) | Tier 1 네트워크만 우선, 추후 확장 |
| 멀티체인 잔액 집계 API | 네트워크별 개별 조회로 충분, 집계는 v1.5+ |
| 크로스체인 브릿지 | 별도 마일스톤으로 분리 |
| Quickstart rollback 로직 | 멱등성으로 대체, 복잡성 감소 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MIGR-01 | Phase 109 | Pending |
| MIGR-02 | Phase 109 | Pending |
| MIGR-03 | Phase 109 | Pending |
| MIGR-04 | Phase 109 | Pending |
| SCHEMA-01 | Phase 109 | Pending |
| SCHEMA-02 | Phase 109 | Pending |
| SCHEMA-03 | Phase 110 | Pending |
| SCHEMA-04 | Phase 110 | Pending |
| SCHEMA-05 | Phase 110 | Pending |
| PLCY-01 | Phase 110 | Pending |
| PLCY-02 | Phase 110 | Pending |
| PLCY-03 | Phase 110 | Pending |
| PIPE-01 | Phase 111 | Pending |
| PIPE-02 | Phase 111 | Pending |
| PIPE-03 | Phase 111 | Pending |
| PIPE-04 | Phase 111 | Pending |
| PIPE-05 | Phase 111 | Pending |
| API-01 | Phase 112 | Pending |
| API-02 | Phase 112 | Pending |
| API-03 | Phase 112 | Pending |
| API-04 | Phase 112 | Pending |
| API-05 | Phase 112 | Pending |
| API-06 | Phase 112 | Pending |
| INTEG-01 | Phase 113 | Pending |
| INTEG-02 | Phase 113 | Pending |
| INTEG-03 | Phase 113 | Pending |
| INTEG-04 | Phase 113 | Pending |
| ADMIN-01 | Phase 113 | Pending |
| ADMIN-02 | Phase 113 | Pending |
| ADMIN-03 | Phase 113 | Pending |
| ADMIN-04 | Phase 113 | Pending |
| CLI-01 | Phase 114 | Pending |
| CLI-02 | Phase 114 | Pending |
| DX-01 | Phase 114 | Pending |
| DX-02 | Phase 114 | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0

---
*Requirements defined: 2026-02-14*
*Last updated: 2026-02-14 after roadmap creation*
