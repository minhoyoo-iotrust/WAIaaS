# Requirements: WAIaaS v28.3 LI.FI 크로스체인 브릿지

**Defined:** 2026-02-24
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for v28.3 release. Each maps to roadmap phases.

### 비동기 상태 추적 공통 인프라

- [ ] **ASNC-01**: IAsyncStatusTracker 공통 인터페이스를 정의하여 checkStatus/name/maxAttempts/pollIntervalMs/timeoutTransition을 표준화한다
- [ ] **ASNC-02**: AsyncPollingService가 등록된 tracker들의 DB 기반 폴링을 관리하고 per-tracker 타이밍/maxAttempts/에러 격리를 보장한다
- [ ] **ASNC-03**: DB v23 마이그레이션으로 transactions 테이블에 bridge_status(6-value CHECK) + bridge_metadata(TEXT) 컬럼을 추가한다
- [ ] **ASNC-04**: DB v23 마이그레이션으로 TRANSACTION_STATUSES에 GAS_WAITING을 추가하여 11-state로 확장한다
- [ ] **ASNC-05**: DB v23 마이그레이션으로 idx_transactions_bridge_status, idx_transactions_gas_waiting partial index 2개를 생성한다
- [ ] **ASNC-06**: AsyncPollingService를 BackgroundWorkers에 30초 간격으로 등록하여 pollAll()을 실행한다

### LI.FI 프로바이더

- [ ] **LIFI-01**: LiFiApiClient가 LI.FI /quote API를 호출하여 크로스체인 경로+calldata를 조회하고 Zod로 응답을 검증한다
- [ ] **LIFI-02**: LiFiApiClient가 LI.FI /status API를 호출하여 브릿지 트랜잭션 상태를 조회한다
- [ ] **LIFI-03**: LiFiActionProvider가 cross_swap 액션으로 크로스체인 브릿지+스왑을 resolve하여 ContractCallRequest를 반환한다
- [ ] **LIFI-04**: LiFiActionProvider가 bridge 액션으로 단순 크로스체인 브릿지를 resolve한다
- [ ] **LIFI-05**: BridgeStatusTracker가 IAsyncStatusTracker를 구현하여 활성 폴링(30초×240회=2시간) 후 BRIDGE_MONITORING으로 전환한다
- [ ] **LIFI-06**: BridgeStatusTracker가 축소 폴링(5분×264회=22시간)에서 완료/실패/환불 상태를 감지한다
- [ ] **LIFI-07**: 슬리피지 기본 3%, 최대 5% 클램프를 적용하고 Admin Settings에서 설정 가능하다
- [ ] **LIFI-08**: LI.FI API 에러 시 ACTION_API_ERROR를 반환하고 미지원 체인 조합 시 명확한 에러 메시지를 제공한다
- [ ] **LIFI-09**: config.toml [actions] 섹션에 lifi 5개 키(enabled/api_key/api_base_url/default_slippage_pct/max_slippage_pct)를 지원한다

### 정책 연동

- [ ] **PLCY-01**: 크로스체인 브릿지의 정책 평가를 출발 체인 월렛 기준으로 수행한다
- [ ] **PLCY-02**: COMPLETED/FAILED/REFUNDED 시 SPENDING_LIMIT 예약을 해제하고, BRIDGE_MONITORING/TIMEOUT 시 예약을 유지한다
- [ ] **PLCY-03**: provider-trust 정책 바이패스가 LI.FI 프로바이더에도 적용되어 CONTRACT_WHITELIST 없이 동작한다

### 알림

- [ ] **NTFY-01**: BRIDGE_COMPLETED/BRIDGE_FAILED/BRIDGE_MONITORING_STARTED/BRIDGE_TIMEOUT/BRIDGE_REFUNDED 5개 NotificationEventType을 추가한다
- [ ] **NTFY-02**: 브릿지 알림 이벤트에 대한 en/ko i18n 메시지 템플릿을 제공한다

### 인터페이스 통합

- [ ] **INTG-01**: MCP에 waiaas_lifi_bridge와 waiaas_lifi_cross_swap 2개 도구를 자동 노출한다
- [ ] **INTG-02**: TS SDK executeAction('lifi_bridge'/lifi_cross_swap) + Python SDK execute_action()으로 호출 가능하다
- [ ] **INTG-03**: actions.skill.md에 LI.FI 크로스체인 브릿지 상세 문서를 추가한다

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### 크로스체인 확장

- **XCHX-01**: LI.FI 단일 체인 내 스왑(swap 액션) — LI.FI로 Jupiter/0x 대체 가능하나 현재는 전용 프로바이더 유지
- **XCHX-02**: Admin UI Actions 페이지에 LI.FI 브릿지 상태 모니터링 뷰어

## Out of Scope

| Feature | Reason |
|---------|--------|
| LI.FI webhook 수신 | Self-hosted 환경 방화벽 이슈, 폴링으로 대체 |
| 도착 체인 정책 평가 | DEFI-03 확정: 출발 체인만 평가 (도착은 수신) |
| 폴링 간격 Admin Settings 노출 | 안전성 파라미터이므로 런타임 변경 불허 |
| TIMEOUT 시 자동 취소 | DEFI-04 ASNC-05: 자금 limbo 상태 가능, 예약 유지 |
| LI.FI 단일 체인 swap | Jupiter(Solana)/0x(EVM) 전용 프로바이더가 이미 존재 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ASNC-01 | Phase 251 | Pending |
| ASNC-02 | Phase 251 | Pending |
| ASNC-03 | Phase 251 | Pending |
| ASNC-04 | Phase 251 | Pending |
| ASNC-05 | Phase 251 | Pending |
| ASNC-06 | Phase 251 | Pending |
| LIFI-01 | Phase 252 | Pending |
| LIFI-02 | Phase 252 | Pending |
| LIFI-03 | Phase 252 | Pending |
| LIFI-04 | Phase 252 | Pending |
| LIFI-05 | Phase 252 | Pending |
| LIFI-06 | Phase 252 | Pending |
| LIFI-07 | Phase 252 | Pending |
| LIFI-08 | Phase 252 | Pending |
| LIFI-09 | Phase 252 | Pending |
| PLCY-01 | Phase 252 | Pending |
| PLCY-02 | Phase 252 | Pending |
| PLCY-03 | Phase 252 | Pending |
| NTFY-01 | Phase 252 | Pending |
| NTFY-02 | Phase 252 | Pending |
| INTG-01 | Phase 253 | Pending |
| INTG-02 | Phase 253 | Pending |
| INTG-03 | Phase 253 | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-24*
*Last updated: 2026-02-24 after roadmap creation*
