# Requirements: WAIaaS

**Defined:** 2026-02-23
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v28.2 Requirements

Requirements for milestone v28.2 0x EVM DEX Swap. Each maps to roadmap phases.

### Provider Infrastructure

- [ ] **PINF-01**: Admin Settings에 `actions` 카테고리가 등록되어 프로바이더별 설정 키를 관리할 수 있다
- [ ] **PINF-02**: `registerBuiltInProviders()`가 SettingsService에서 설정을 읽어 `enabled !== false`일 때 기본 활성화한다
- [ ] **PINF-03**: config.toml `[actions]` 섹션이 제거되고 기존 Jupiter 설정이 Admin Settings로 이관된다
- [ ] **PINF-04**: Admin UI Actions 페이지에서 빌트인 프로바이더 목록, 활성화 토글, API 키 관리가 가능하다
- [ ] **PINF-05**: API 키 미설정 시 ACTION_API_KEY_REQUIRED 알림 이벤트가 발송된다 (adminUrl 필드 포함)
- [ ] **PINF-06**: IActionProvider.resolve() 반환 타입이 ContractCallRequest[]로 확장되고 actions route가 배열을 순차 파이프라인으로 실행한다
- [ ] **PINF-07**: ContractCallRequest에 actionProvider 옵션 필드가 추가되고 활성화된 프로바이더의 resolve() 결과에 자동 태깅된다
- [ ] **PINF-08**: Policy Stage 3에서 actionProvider 태그가 있고 해당 프로바이더가 활성화 상태이면 CONTRACT_WHITELIST 검사를 skip한다

### 0x Swap Provider

- [ ] **ZXSW-01**: ZeroExApiClient가 api.0x.org에 chainId 쿼리 파라미터 + 0x-api-key + 0x-version: v2 헤더로 요청한다
- [ ] **ZXSW-02**: /swap/allowance-holder/price 견적 조회가 Zod 스키마 검증을 거쳐 반환된다
- [ ] **ZXSW-03**: /swap/allowance-holder/quote 실행 calldata 조회가 Zod 스키마 검증을 거쳐 반환된다
- [ ] **ZXSW-04**: ZeroExSwapActionProvider가 ERC-20 판매 시 [approve, swap] ContractCallRequest 배열을 반환한다
- [ ] **ZXSW-05**: ZeroExSwapActionProvider가 ETH(네이티브) 판매 시 [swap] 단일 ContractCallRequest를 반환한다
- [ ] **ZXSW-06**: 슬리피지가 기본 1%(0.01) 적용되고 상한 5%(0.05)로 클램프된다
- [ ] **ZXSW-07**: liquidityAvailable=false 응답 시 명확한 에러가 반환된다
- [ ] **ZXSW-08**: 0x API 에러 응답 시 ACTION_API_ERROR가 반환된다
- [ ] **ZXSW-09**: AllowanceHolder 컨트랙트 주소가 chainId 기반으로 정확히 매핑된다 (Cancun 19체인 + Mantle)
- [ ] **ZXSW-10**: 요청 타임아웃 10초(AbortController)가 적용된다

### Integration

- [ ] **INTG-01**: TS SDK client.executeAction(provider, action, params) 메서드가 POST /v1/actions/{provider}/{action}을 호출한다
- [ ] **INTG-02**: Python SDK await client.execute_action(provider, action, params) 메서드가 동일 엔드포인트를 호출한다
- [ ] **INTG-03**: MCP action_0x_swap_swap 도구가 자동 노출된다
- [ ] **INTG-04**: actions.skill.md에 0x Swap 상세 문서(REST API/MCP/SDK 예시, config, 안전 장치)가 추가된다

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### DeFi Extensions

- **DEFI-01**: LI.FI 크로스체인 브릿지 ActionProvider (m28-03)
- **DEFI-02**: Lido 스테이킹 ActionProvider (m28-04)
- **DEFI-03**: Aave 대출/차입 ActionProvider (m28-05)

## Out of Scope

| Feature | Reason |
|---------|--------|
| 0x Gasless API (tx relay) | 서버사이드 키 보유 환경에 불필요 — AllowanceHolder 직접 실행이 단순 |
| Permit2 서명 방식 | AllowanceHolder가 서버사이드에 최적 — EIP-712 불필요, 낮은 복잡도 |
| 1inch Fusion (gasless swap) | 향후 별도 ActionProvider로 추가 가능 |
| 견적 캐시 구현 | v28.2 범위 초과 — rate limit 도달 시 에러 반환으로 충분 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PINF-01 | — | Pending |
| PINF-02 | — | Pending |
| PINF-03 | — | Pending |
| PINF-04 | — | Pending |
| PINF-05 | — | Pending |
| PINF-06 | — | Pending |
| PINF-07 | — | Pending |
| PINF-08 | — | Pending |
| ZXSW-01 | — | Pending |
| ZXSW-02 | — | Pending |
| ZXSW-03 | — | Pending |
| ZXSW-04 | — | Pending |
| ZXSW-05 | — | Pending |
| ZXSW-06 | — | Pending |
| ZXSW-07 | — | Pending |
| ZXSW-08 | — | Pending |
| ZXSW-09 | — | Pending |
| ZXSW-10 | — | Pending |
| INTG-01 | — | Pending |
| INTG-02 | — | Pending |
| INTG-03 | — | Pending |
| INTG-04 | — | Pending |

**Coverage:**
- v28.2 requirements: 22 total
- Mapped to phases: 0
- Unmapped: 22 ⚠️

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-23 after initial definition*
