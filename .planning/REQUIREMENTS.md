# Requirements: WAIaaS v29.5 내부 일관성 정리

**Defined:** 2026-02-28
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v29.5 Requirements

Requirements for internal consistency fixes. Each maps to roadmap phases.

### API 키 저장소 통합 (#214)

- [ ] **APIKEY-01**: ApiKeyStore(`api-key-store.ts`) 제거, `api_keys` 테이블 의존 완전 삭제
- [ ] **APIKEY-02**: Admin UI에서 API 키 저장 시 `SettingsService`(`settings` 테이블)에 즉시 반영되어 프로바이더가 올바른 키로 동작
- [ ] **APIKEY-03**: DB migration v28: 기존 `api_keys` 데이터를 `settings`로 이전 후 테이블 DROP
- [ ] **APIKEY-04**: `/admin/api-keys/*` REST API 경로 유지, 내부적으로 `settingsService`에 위임 (하위 호환)
- [ ] **APIKEY-05**: hot-reload 시 `BUILTIN_NAMES`에 `aave_v3`, `kamino` 포함되어 중복 등록 방지
- [ ] **APIKEY-06**: `reloadActionProviders()`에서 `rpcCaller` 옵션 정상 전달
- [ ] **APIKEY-07**: 기존 `api-admin-api-keys.test.ts` 테스트를 SettingsService 기반으로 전환

### Solana 네트워크 ID 통일 (#211)

- [ ] **NETID-01**: `SOLANA_NETWORK_TYPES` 상수가 `solana-mainnet`, `solana-devnet`, `solana-testnet`으로 정의
- [ ] **NETID-02**: DB migration v29: `wallets.network`, `transactions.network`, `incoming_transactions.network` 등 `mainnet` → `solana-mainnet` 일괄 변환
- [ ] **NETID-03**: config.toml 키 `solana_mainnet` 유지, `rpcConfigKey()`/`configKeyToNetwork()` 양방향 매핑
- [ ] **NETID-04**: CLI/API에서 레거시 `mainnet` 입력 시 `solana-mainnet`으로 자동 변환 + deprecation 경고
- [ ] **NETID-05**: Admin UI 네트워크 드롭다운, 필터, 표시 레이블이 `solana-mainnet` 형식으로 표시
- [ ] **NETID-06**: MCP 네트워크 파라미터 스키마가 `solana-mainnet` 형식 사용
- [ ] **NETID-07**: SDK `NetworkType` 타입 정의가 `solana-mainnet` 형식 반영
- [ ] **NETID-08**: DeFi 프로바이더(Jupiter/Jito/Kamino)가 `solana-mainnet` 정상 인식
- [ ] **NETID-09**: RPC Pool 설정이 `solana-mainnet` 키로 정상 라우팅
- [ ] **NETID-10**: skills 파일 네트워크 예시 갱신
- [ ] **NETID-11**: 전 패키지 기존 테스트 전체 통과

## Future Requirements

### 관련 이슈 (미포함)

- **STO-03**: Confirmation Worker RPC 콜백 미주입 — DETECTED→CONFIRMED 상태 전환 (별도 마일스톤)
- **#164**: IncomingTxMonitorService 환경 기본 네트워크만 구독 (별도 마일스톤)

## Out of Scope

| Feature | Reason |
|---------|--------|
| API 키 암호화 방식 변경 | SettingsService 기존 암호화 스키마 유지, 별도 보안 마일스톤 |
| EVM 네트워크 ID 변경 | 이미 `{chain}-{network}` 패턴 준수 |
| config.toml 키 리네이밍 | 하위 호환성 위해 기존 `solana_mainnet` 키 유지 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| APIKEY-01 | — | Pending |
| APIKEY-02 | — | Pending |
| APIKEY-03 | — | Pending |
| APIKEY-04 | — | Pending |
| APIKEY-05 | — | Pending |
| APIKEY-06 | — | Pending |
| APIKEY-07 | — | Pending |
| NETID-01 | — | Pending |
| NETID-02 | — | Pending |
| NETID-03 | — | Pending |
| NETID-04 | — | Pending |
| NETID-05 | — | Pending |
| NETID-06 | — | Pending |
| NETID-07 | — | Pending |
| NETID-08 | — | Pending |
| NETID-09 | — | Pending |
| NETID-10 | — | Pending |
| NETID-11 | — | Pending |

**Coverage:**
- v29.5 requirements: 18 total
- Mapped to phases: 0
- Unmapped: 18 ⚠️

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 after initial definition*
