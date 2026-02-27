# Requirements: WAIaaS v29.3

**Defined:** 2026-02-27
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v29.3 Requirements

Requirements for removing default wallet/default network concepts. Each maps to roadmap phases.

### DB Migration

- [x] **DB-01**: session_wallets 테이블에서 is_default 컬럼이 삭제된다
- [x] **DB-02**: wallets 테이블에서 default_network 컬럼이 삭제된다
- [x] **DB-03**: default_network 관련 CHECK 제약이 삭제된다
- [x] **DB-04**: 마이그레이션이 기존 데이터를 손실 없이 처리한다

### Core Schema / Error Codes

- [x] **CORE-01**: WalletSchema에서 defaultNetwork 필드가 제거된다
- [x] **CORE-02**: CreateSessionRequestSchema에서 defaultWalletId 필드가 제거된다
- [x] **CORE-03**: WALLET_ID_REQUIRED 에러 코드가 추가되어 세션에 지갑 2개 이상일 때 walletId 누락 시 반환된다
- [x] **CORE-04**: NETWORK_REQUIRED 에러 코드가 추가되어 EVM 지갑에서 network 누락 시 반환된다
- [x] **CORE-05**: CANNOT_REMOVE_DEFAULT_WALLET 에러 코드가 삭제된다
- [x] **CORE-06**: getDefaultNetwork 함수가 getSingleNetwork로 리네임되고 EVM은 null을 반환한다
- [x] **CORE-07**: ENVIRONMENT_DEFAULT_NETWORK 상수가 ENVIRONMENT_SINGLE_NETWORK로 변경되고 EVM 항목이 제거된다
- [x] **CORE-08**: en.ts/ko.ts i18n 메시지가 신규 에러 코드에 맞게 업데이트된다

### Resolution Logic

- [x] **RSLV-01**: resolveWalletId에서 Priority 3 (JWT 기본 지갑)이 제거된다
- [x] **RSLV-02**: 세션에 지갑 1개일 때 walletId 생략 시 자동 해석된다
- [x] **RSLV-03**: 세션에 지갑 2개 이상일 때 walletId 생략 시 WALLET_ID_REQUIRED 에러가 반환된다
- [x] **RSLV-04**: network-resolver에서 Priority 2 (wallet.defaultNetwork)가 제거된다
- [x] **RSLV-05**: Solana 지갑에서 network 생략 시 단일 네트워크로 자동 해석된다
- [x] **RSLV-06**: EVM 지갑에서 network 생략 시 NETWORK_REQUIRED 에러가 반환된다

### JWT / Auth

- [x] **AUTH-01**: JWT 페이로드에서 wlt claim이 제거된다
- [x] **AUTH-02**: session-auth 미들웨어에서 defaultWalletId 컨텍스트 설정이 제거된다
- [x] **AUTH-03**: 기존 JWT의 wlt claim이 있어도 에러 없이 무시된다 (하위 호환)
- [x] **AUTH-04**: owner-auth 미들웨어에서 defaultWalletId 의존이 제거된다
- [x] **AUTH-05**: Telegram Bot 세션 생성에서 wlt claim 구성과 is_default INSERT가 제거된다

### API Endpoints

- [ ] **API-01**: PATCH /v1/sessions/:id/wallets/:walletId/default 엔드포인트가 삭제된다
- [x] **API-02**: PUT /v1/wallets/:id/default-network 엔드포인트가 삭제된다
- [x] **API-03**: PUT /v1/wallet/default-network 엔드포인트가 삭제된다
- [x] **API-04**: POST /v1/sessions 요청에서 defaultWalletId 파라미터가 제거된다
- [x] **API-05**: GET /v1/wallets/:id/networks 응답에서 isDefault 필드가 제거된다
- [x] **API-06**: GET /v1/wallets/:id 응답에서 defaultNetwork 필드가 제거된다
- [x] **API-07**: GET /v1/connect-info 응답에서 defaultNetwork, isDefault 필드가 제거된다
- [x] **API-08**: 트랜잭션/액션 라우트에서 wallet.defaultNetwork 네트워크 해석이 제거된다
- [x] **API-09**: Admin 라우트에서 defaultNetwork 잔고 정렬/표시 및 isDefault 세팅이 제거된다
- [x] **API-10**: OpenAPI 스키마에서 defaultNetwork/isDefault 관련 스키마가 제거된다

### Pipeline / Infrastructure

- [x] **PIPE-01**: daemon.ts에서 getDefaultNetwork() 폴백이 제거되고 network null 시 에러 처리된다
- [x] **PIPE-02**: PipelineContext에서 wallet.defaultNetwork 필드가 제거된다
- [x] **PIPE-03**: notification-service.ts에서 defaultNetwork 셀렉트/폴백이 제거되고 chain 값으로 대체된다
- [x] **PIPE-04**: adapter-pool.ts에서 evm_default_network skip 로직이 제거된다
- [x] **PIPE-05**: balance-monitor-service.ts에서 default_network 폴백이 getNetworksForEnvironment() 순회로 대체된다
- [x] **PIPE-06**: WC 페어링 API에서 default_network 의존이 제거되고 network 파라미터가 필수화된다

### Admin Settings

- [x] **ASET-01**: rpc.evm_default_network 설정 키가 setting-keys.ts에서 삭제된다
- [x] **ASET-02**: config loader에서 evm_default_network 스키마 필드가 삭제된다
- [x] **ASET-03**: hot-reload.ts에서 evm_default_network 특수 skip 로직이 삭제된다

### SDK / CLI / Python SDK

- [x] **SDK-01**: SDK CreateSessionParams에서 defaultWalletId 필드가 제거된다
- [x] **SDK-02**: SDK ConnectInfoWallet에서 defaultNetwork 필드가 제거된다
- [x] **SDK-03**: SDK setDefaultNetwork() 메서드가 삭제된다
- [x] **SDK-04**: CLI wallet set-default-network 서브커맨드가 삭제된다
- [x] **SDK-05**: CLI quickstart에서 defaultNetwork 타입/표시 로직이 제거된다
- [x] **SDK-06**: Python SDK models.py에서 is_default, default_network, isDefault 필드가 제거된다
- [x] **SDK-07**: Python SDK client.py에서 set_default_network() 메서드가 삭제된다

### MCP Tools

- [x] **MCP-01**: set-default-network.ts MCP 도구 파일이 삭제된다
- [x] **MCP-02**: server.ts에서 registerSetDefaultNetwork 등록이 제거된다
- [x] **MCP-03**: 25개 MCP 도구의 wallet_id description에서 "Omit to use the default wallet" 문구가 제거/수정된다
- [x] **MCP-04**: action-provider.ts의 network description에서 "Defaults to wallet default network" 문구가 제거된다

### Admin UI

- [ ] **ADMN-01**: wallets.tsx에서 Default Network 표시, Set as Default 버튼, evm_default_network 설정 폼이 제거된다
- [ ] **ADMN-02**: sessions.tsx에서 세션 생성 시 defaultWalletId 선택 UI가 제거된다
- [ ] **ADMN-03**: settings.tsx에서 rpc.evm_default_network 설정 필드가 제거된다
- [ ] **ADMN-04**: settings-helpers.ts에서 evm_default_network 라벨이 삭제된다
- [ ] **ADMN-05**: settings-search-index.ts에서 rpc.evm_default_network 항목이 삭제된다
- [ ] **ADMN-06**: endpoints.ts에서 WALLET_DEFAULT_NETWORK 상수가 삭제된다

### Skill Files

- [ ] **SKIL-01**: wallet.skill.md에서 default network 관련 문구가 제거/수정된다
- [ ] **SKIL-02**: transactions.skill.md에서 network 명시 필수 안내가 추가된다
- [ ] **SKIL-03**: quickstart.skill.md에서 "wallet's default network" 참조가 제거/수정된다
- [ ] **SKIL-04**: admin.skill.md에서 rpc.evm_default_network 설정 문서가 제거된다

### E2E Verification

- [ ] **E2E-01**: 세션에 지갑 1개 + walletId 생략 → 자동 해석 테스트 통과
- [ ] **E2E-02**: 세션에 지갑 2개 + walletId 생략 → WALLET_ID_REQUIRED 테스트 통과
- [ ] **E2E-03**: Solana 지갑 + network 생략 → 자동 해석 테스트 통과
- [ ] **E2E-04**: EVM 지갑 + network 생략 → NETWORK_REQUIRED 테스트 통과
- [ ] **E2E-05**: 삭제된 엔드포인트 3개 → 404 테스트 통과
- [ ] **E2E-06**: 신규 JWT에 wlt claim 없음 테스트 통과
- [ ] **E2E-07**: connect-info 응답에 defaultNetwork/isDefault 없음 테스트 통과
- [ ] **E2E-08**: MCP 멀티 지갑 + wallet_id 생략 → WALLET_ID_REQUIRED 테스트 통과
- [ ] **E2E-09**: 기존 테스트 전체 통과 (기존 테스트 수정 포함)

## Future Requirements

None — 이 마일스톤은 기존 기능 정리이므로 추가 기능 없음.

## Out of Scope

| Feature | Reason |
|---------|--------|
| environment (mainnet/testnet) 제거 | 보안 경계이므로 유지. 네트워크 검증(chain-network, environment-network)도 유지 |
| 하위 호환 레이어 (deprecated 유지) | pre-release (v2.x RC) 단계이므로 깔끔한 제거. Semver minor bump |
| 새로운 네트워크 자동 해석 규칙 추가 | 현재 규칙(Solana=자동, EVM=필수)만 적용. 향후 체인 추가 시 검토 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 279 | Complete |
| DB-02 | Phase 279 | Complete |
| DB-03 | Phase 279 | Complete |
| DB-04 | Phase 279 | Complete |
| CORE-01 | Phase 279 | Complete |
| CORE-02 | Phase 279 | Complete |
| CORE-03 | Phase 279 | Complete |
| CORE-04 | Phase 279 | Complete |
| CORE-05 | Phase 279 | Complete |
| CORE-06 | Phase 279 | Complete |
| CORE-07 | Phase 279 | Complete |
| CORE-08 | Phase 279 | Complete |
| RSLV-01 | Phase 279 | Complete |
| RSLV-02 | Phase 279 | Complete |
| RSLV-03 | Phase 279 | Complete |
| RSLV-04 | Phase 279 | Complete |
| RSLV-05 | Phase 279 | Complete |
| RSLV-06 | Phase 279 | Complete |
| AUTH-01 | Phase 280 | Complete |
| AUTH-02 | Phase 280 | Complete |
| AUTH-03 | Phase 280 | Complete |
| AUTH-04 | Phase 280 | Complete |
| AUTH-05 | Phase 280 | Complete |
| API-01 | Phase 280 | Pending |
| API-02 | Phase 280 | Complete |
| API-03 | Phase 280 | Complete |
| API-04 | Phase 280 | Complete |
| API-05 | Phase 280 | Complete |
| API-06 | Phase 280 | Complete |
| API-07 | Phase 280 | Complete |
| API-08 | Phase 280 | Complete |
| API-09 | Phase 280 | Complete |
| API-10 | Phase 280 | Complete |
| PIPE-01 | Phase 280 | Complete |
| PIPE-02 | Phase 280 | Complete |
| PIPE-03 | Phase 280 | Complete |
| PIPE-04 | Phase 280 | Complete |
| PIPE-05 | Phase 280 | Complete |
| PIPE-06 | Phase 280 | Complete |
| ASET-01 | Phase 280 | Complete |
| ASET-02 | Phase 280 | Complete |
| ASET-03 | Phase 280 | Complete |
| SDK-01 | Phase 281 | Complete |
| SDK-02 | Phase 281 | Complete |
| SDK-03 | Phase 281 | Complete |
| SDK-04 | Phase 281 | Complete |
| SDK-05 | Phase 281 | Complete |
| SDK-06 | Phase 281 | Complete |
| SDK-07 | Phase 281 | Complete |
| MCP-01 | Phase 281 | Complete |
| MCP-02 | Phase 281 | Complete |
| MCP-03 | Phase 281 | Complete |
| MCP-04 | Phase 281 | Complete |
| ADMN-01 | Phase 281 | Pending |
| ADMN-02 | Phase 281 | Pending |
| ADMN-03 | Phase 281 | Pending |
| ADMN-04 | Phase 281 | Pending |
| ADMN-05 | Phase 281 | Pending |
| ADMN-06 | Phase 281 | Pending |
| SKIL-01 | Phase 281 | Pending |
| SKIL-02 | Phase 281 | Pending |
| SKIL-03 | Phase 281 | Pending |
| SKIL-04 | Phase 281 | Pending |
| E2E-01 | Phase 282 | Pending |
| E2E-02 | Phase 282 | Pending |
| E2E-03 | Phase 282 | Pending |
| E2E-04 | Phase 282 | Pending |
| E2E-05 | Phase 282 | Pending |
| E2E-06 | Phase 282 | Pending |
| E2E-07 | Phase 282 | Pending |
| E2E-08 | Phase 282 | Pending |
| E2E-09 | Phase 282 | Pending |

**Coverage:**
- v29.3 requirements: 72 total
- Mapped to phases: 72
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after roadmap creation -- traceability table populated, coverage count corrected (55 -> 72)*
