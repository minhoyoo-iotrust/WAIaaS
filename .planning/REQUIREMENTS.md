# Requirements: WAIaaS v30.9

**Defined:** 2026-03-04
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v30.9 Requirements

Requirements for Smart Account DX 개선. Each maps to roadmap phases.

### Provider (지갑별 프로바이더 설정)

- [ ] **PROV-01**: Smart Account 지갑 단위로 프로바이더(pimlico/alchemy/custom) + API 키 설정
- [ ] **PROV-02**: 프로바이더 + API 키 → 번들러 URL + 페이마스터 URL 자동 조합
- [ ] **PROV-03**: custom 선택 시 번들러 URL + 페이마스터 URL 직접 입력
- [ ] **PROV-04**: API 키 AES-256-GCM 암호화 저장 (HKDF 기반 경량 KDF)
- [ ] **PROV-05**: Smart Account 지갑 생성 시 프로바이더 설정 필수 (미설정 시 400 에러)
- [ ] **PROV-06**: Admin UI 지갑 생성 폼에서 accountType: smart 선택 시에만 프로바이더 필드 노출
- [ ] **PROV-07**: Admin UI 지갑 상세 페이지에서 프로바이더 설정 변경 가능
- [ ] **PROV-08**: REST API로 지갑별 프로바이더 설정 변경 가능 (masterAuth)
- [ ] **PROV-09**: 기존 글로벌 설정 23개 키 제거 (smart_account.entry_point 유지)
- [ ] **PROV-10**: EOA/Solana 지갑은 프로바이더 설정 불필요 — 기존 동작 유지

### Chain Mapping (프로바이더별 체인 매핑)

- [ ] **CMAP-01**: WAIaaS networkId → 프로바이더별 chainId 매핑 테이블 정의
- [ ] **CMAP-02**: 프리셋 프로바이더 사용 시 매핑에 없는 networkId면 400 사전 차단
- [ ] **CMAP-03**: 에러 메시지에 프로바이더명 + 미지원 네트워크 명시

### Guide (API 키 발급 안내)

- [ ] **GUID-01**: 프로바이더 선택 시 API 키 발급 대시보드 링크 Admin UI 표시
- [ ] **GUID-02**: 기존 CoinGecko API 키 안내와 동일한 패턴
- [ ] **GUID-03**: 프로바이더 변경 시 링크 동적 전환

### Agent Self-Service (에이전트 셀프 프로바이더 등록)

- [ ] **ASSR-01**: PUT /v1/wallets/:id/provider — sessionAuth로 자기 지갑 프로바이더 설정
- [ ] **ASSR-02**: 요청 바디: { provider, apiKey } 또는 { provider: 'custom', bundlerUrl, paymasterUrl }
- [ ] **ASSR-03**: 세션에 연결된 지갑만 설정 가능 (다른 지갑 설정 시 403)
- [ ] **ASSR-04**: 서비스 프로바이더가 에이전트에게 스코프 키 전달 → 에이전트 자력 등록 플로우

### Status Query (에이전트 프로바이더 상태 조회)

- [ ] **STAT-01**: GET /v1/wallets/:id 응답에 프로바이더 상태 포함
- [ ] **STAT-02**: 응답 필드: provider.name, provider.supportedChains, provider.paymasterEnabled
- [ ] **STAT-03**: 프로바이더 미설정 시 provider: null
- [ ] **STAT-04**: connect-info 프롬프트에 프로바이더 상태 포함
- [ ] **STAT-05**: MCP 도구에서 프로바이더 상태 조회 가능

### Default (AA 기본 활성화)

- [ ] **DFLT-01**: smart_account.enabled 기본값 false → true 변경
- [ ] **DFLT-02**: 프로바이더 미설정 시 지갑 생성 400 에러 가드 기존 유지

## Future Requirements

(None — scope is focused on Smart Account DX)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Gelato/Stackup/기타 프로바이더 지원 | Pimlico + Alchemy + Custom으로 충분, 추후 추가 가능 |
| 프로바이더 health check / 자동 failover | v30.9 범위 외, RPC Pool 패턴 적용은 추후 고려 |
| Paymaster 정책 세부 설정 (가스 한도 등) | 프로바이더 대시보드에서 관리, WAIaaS는 키만 전달 |
| Solana Smart Account (Squads 등) | EVM ERC-4337만 대상 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROV-01 | — | Pending |
| PROV-02 | — | Pending |
| PROV-03 | — | Pending |
| PROV-04 | — | Pending |
| PROV-05 | — | Pending |
| PROV-06 | — | Pending |
| PROV-07 | — | Pending |
| PROV-08 | — | Pending |
| PROV-09 | — | Pending |
| PROV-10 | — | Pending |
| CMAP-01 | — | Pending |
| CMAP-02 | — | Pending |
| CMAP-03 | — | Pending |
| GUID-01 | — | Pending |
| GUID-02 | — | Pending |
| GUID-03 | — | Pending |
| ASSR-01 | — | Pending |
| ASSR-02 | — | Pending |
| ASSR-03 | — | Pending |
| ASSR-04 | — | Pending |
| STAT-01 | — | Pending |
| STAT-02 | — | Pending |
| STAT-03 | — | Pending |
| STAT-04 | — | Pending |
| STAT-05 | — | Pending |
| DFLT-01 | — | Pending |
| DFLT-02 | — | Pending |

**Coverage:**
- v30.9 requirements: 27 total
- Mapped to phases: 0
- Unmapped: 27 ⚠️

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 after initial definition*
