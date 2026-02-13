# Requirements: WAIaaS v1.4.4

**Defined:** 2026-02-13
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1.4.4 Requirements

운영 설정을 Admin UI에서 관리하고(hot-reload), MCP 5-type feature parity를 달성하며, AI 에이전트용 스킬 파일을 제공한다.

### Settings (설정 인프라)

- [x] **SETTINGS-01**: settings key-value 테이블 DB 마이그레이션 (schema_version 5)
- [x] **SETTINGS-02**: credential(bot token, webhook URL) AES-GCM 암호화 저장
- [x] **SETTINGS-03**: 설정 우선순위 fallback (DB > config.toml > 환경변수 > 기본값)
- [x] **SETTINGS-04**: 최초 기동 시 config.toml 기존 값 DB 자동 import
- [x] **SETTINGS-05**: 알림 채널 hot-reload (credential 변경 시 채널 인스턴스 재생성)
- [x] **SETTINGS-06**: RPC 엔드포인트 hot-reload (URL 변경 시 adapter 재연결)
- [x] **SETTINGS-07**: 보안 파라미터 hot-reload (session_ttl, rate_limit 등 즉시 반영)

### API (설정 관리 API)

- [x] **API-01**: GET /v1/admin/settings — 전체 설정 조회 (credential 마스킹)
- [x] **API-02**: PUT /v1/admin/settings — 설정 수정 + hot-reload 트리거
- [x] **API-03**: POST /v1/admin/settings/test-rpc — RPC 연결 테스트

### Admin (Admin UI 설정 페이지)

- [ ] **ADMIN-01**: 알림 설정 섹션 (Telegram/Discord/Ntfy credential + 활성화 + 테스트)
- [ ] **ADMIN-02**: RPC 엔드포인트 섹션 (Solana 3 + EVM 13 + 테스트 연결 버튼)
- [ ] **ADMIN-03**: 보안 파라미터 섹션 (session_ttl, rate_limit, policy_defaults)
- [ ] **ADMIN-04**: WalletConnect 섹션 (project_id 입력 + 획득 방법 안내)
- [ ] **ADMIN-05**: 데몬 log_level 설정

### MCP (5-type Feature Parity)

- [ ] **MCP-01**: MCP call_contract 도구 (CONTRACT_CALL 트랜잭션)
- [ ] **MCP-02**: MCP approve_token 도구 (APPROVE 트랜잭션)
- [ ] **MCP-03**: MCP send_batch 도구 (BATCH 트랜잭션)
- [ ] **MCP-04**: MCPSDK-04 설계 결정 철회 + 설계 문서 38 업데이트

### Skill (API 스킬 파일)

- [ ] **SKILL-01**: quickstart.skill.md (월렛 생성 → 세션 → 잔액 → 첫 전송)
- [ ] **SKILL-02**: wallet.skill.md (월렛 CRUD + 자산 조회 + 멀티체인)
- [ ] **SKILL-03**: transactions.skill.md (5-type 전송 + 상태 조회)
- [ ] **SKILL-04**: policies.skill.md (10 PolicyType CRUD)
- [ ] **SKILL-05**: admin.skill.md (관리자 API — 상태/알림/설정)

## Future Requirements

### DeFi + 가격 오라클 (v1.5)

- **DEFI-01**: IPriceOracle (CoinGecko/Pyth/Chainlink)
- **DEFI-02**: Action Provider resolve-then-execute 패턴
- **DEFI-03**: Jupiter Swap
- **DEFI-04**: USD 기준 정책 평가

### x402 클라이언트 지원 (v1.5.1)

- **X402-01**: x402 자동 결제
- **X402-02**: X402_ALLOWED_DOMAINS 정책
- **X402-03**: 결제 서명 생성

## Out of Scope

| Feature | Reason |
|---------|--------|
| config.toml 완전 폐기 | 인프라 설정(port, hostname, DB path)은 파일 기반 유지 필수 |
| Admin UI에서 JWT secret 변경 | 핵심 시크릿은 DB 저장 부적합, config.toml 유지 |
| Kill Switch/AutoStop 설정 UI | v1.6에서 구현 시점에 결정 |
| 스킬 파일 npm 패키지 배포 | 마크다운 파일 직접 제공으로 충분, 향후 확대 시 검토 |
| MCP 도구 파라미터 런타임 검증 | 정책 엔진이 Stage 3에서 동일하게 적용 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETTINGS-01 | Phase 100 | Done |
| SETTINGS-02 | Phase 100 | Done |
| SETTINGS-03 | Phase 100 | Done |
| SETTINGS-04 | Phase 100 | Done |
| SETTINGS-05 | Phase 101 | Done |
| SETTINGS-06 | Phase 101 | Done |
| SETTINGS-07 | Phase 101 | Done |
| API-01 | Phase 101 | Done |
| API-02 | Phase 101 | Done |
| API-03 | Phase 101 | Done |
| ADMIN-01 | Phase 102 | Pending |
| ADMIN-02 | Phase 102 | Pending |
| ADMIN-03 | Phase 102 | Pending |
| ADMIN-04 | Phase 102 | Pending |
| ADMIN-05 | Phase 102 | Pending |
| MCP-01 | Phase 103 | Pending |
| MCP-02 | Phase 103 | Pending |
| MCP-03 | Phase 103 | Pending |
| MCP-04 | Phase 103 | Pending |
| SKILL-01 | Phase 104 | Pending |
| SKILL-02 | Phase 104 | Pending |
| SKILL-03 | Phase 104 | Pending |
| SKILL-04 | Phase 104 | Pending |
| SKILL-05 | Phase 104 | Pending |

**Coverage:**
- v1.4.4 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-02-13*
*Last updated: 2026-02-13 after Phase 101 completion*
