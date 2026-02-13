# Requirements: WAIaaS v1.4.5 멀티체인 월렛 모델 설계

**Defined:** 2026-02-14
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

"1 월렛 = 1 체인 + 1 네트워크" → "1 월렛 = 1 체인 + 1 환경(testnet/mainnet)" 전환 설계. 각 요구사항은 설계 문서 산출물을 의미한다.

### 데이터 모델 (DATA)

- [ ] **DATA-01**: EnvironmentType enum(testnet/mainnet)을 정의하고 환경-네트워크 매핑 테이블을 설계한다
- [ ] **DATA-02**: wallets 테이블의 network → environment 전환 DB 마이그레이션(v6) 전략을 설계한다
- [ ] **DATA-03**: transactions 테이블에 network 컬럼 추가 및 기존 데이터 역참조 전략을 설계한다
- [ ] **DATA-04**: wallets.default_network 기본 네트워크 저장 전략을 설계한다
- [ ] **DATA-05**: 키스토어 경로/메타데이터의 환경 모델 영향을 분석하고 변경 필요 여부를 확정한다

### 트랜잭션 + 파이프라인 (PIPE)

- [ ] **PIPE-01**: NetworkResolver 추상화를 설계한다 (environment + request.network → NetworkType 리졸브)
- [ ] **PIPE-02**: PipelineContext에서 트랜잭션 레벨 네트워크가 전파되는 데이터 흐름을 설계한다
- [ ] **PIPE-03**: 환경-네트워크 교차 검증 로직(mainnet 월렛 + testnet 네트워크 차단)을 설계한다
- [ ] **PIPE-04**: AdapterPool 호출부의 네트워크 리졸브 변경 방안을 설계한다

### 정책 엔진 (PLCY)

- [ ] **PLCY-01**: ALLOWED_NETWORKS 정책 타입(11번째 PolicyType)의 스키마와 평가 로직을 설계한다
- [ ] **PLCY-02**: 기존 정책(SPENDING_LIMIT 등)에 network 필드를 추가하는 네트워크 스코프 정책을 설계한다
- [ ] **PLCY-03**: policies 테이블의 network 컬럼 추가 및 4단계 override 우선순위를 설계한다

### API/인터페이스 (API)

- [ ] **API-01**: REST API 트랜잭션 엔드포인트에 network 선택 파라미터 추가를 설계한다
- [ ] **API-02**: getAssets의 멀티네트워크 잔액 집계(Promise.allSettled 병렬) 인터페이스를 설계한다
- [ ] **API-03**: 월렛 생성 API의 environment 파라미터 + 기본 네트워크 자동 설정을 설계한다
- [ ] **API-04**: MCP 도구/SDK 메서드의 network 파라미터 추가를 설계한다
- [ ] **API-05**: 기존 클라이언트 하위호환 전략(default_network fallback)을 설계한다

### DX (Quickstart)

- [ ] **DX-01**: quickstart --mode testnet/mainnet 워크플로우(Solana+EVM 2월렛 일괄 생성)를 설계한다
- [ ] **DX-02**: Quickstart에서 MCP 토큰 자동 생성 + MCP 클라이언트 설정 스니펫 출력을 설계한다

## v2 Requirements

설계 완료 후 v1.4.6에서 구현 시 추가 검토:

- **IMPL-01**: EnvironmentType → Zod SSoT → TypeScript → OpenAPI 파생 체인 구현
- **IMPL-02**: DB 마이그레이션 v6 구현 (12-step 테이블 재생성)
- **IMPL-03**: NetworkResolver + Pipeline 통합 구현
- **IMPL-04**: REST API/MCP/SDK network 파라미터 구현
- **IMPL-05**: Quickstart CLI 명령 구현

## Out of Scope

| Feature | Reason |
|---------|--------|
| 크로스체인 브릿지 | 별도 마일스톤으로 분리 (PROJECT.md 명시) |
| Non-EVM 체인 추가 (Cosmos, Bitcoin 등) | IChainAdapter 확장은 별도 작업 |
| 가격 오라클 / USD 정책 | v1.5 DeFi 마일스톤 범위 |
| 실제 코드 구현 | v1.4.5는 설계 only, 구현은 v1.4.6 |
| EVM L2 특화 기능 (L1→L2 deposit, L2 gas token) | 환경 모델 이후 별도 검토 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | — | Pending |
| DATA-02 | — | Pending |
| DATA-03 | — | Pending |
| DATA-04 | — | Pending |
| DATA-05 | — | Pending |
| PIPE-01 | — | Pending |
| PIPE-02 | — | Pending |
| PIPE-03 | — | Pending |
| PIPE-04 | — | Pending |
| PLCY-01 | — | Pending |
| PLCY-02 | — | Pending |
| PLCY-03 | — | Pending |
| API-01 | — | Pending |
| API-02 | — | Pending |
| API-03 | — | Pending |
| API-04 | — | Pending |
| API-05 | — | Pending |
| DX-01 | — | Pending |
| DX-02 | — | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 0
- Unmapped: 19

---
*Requirements defined: 2026-02-14*
*Last updated: 2026-02-14 after initial definition*
