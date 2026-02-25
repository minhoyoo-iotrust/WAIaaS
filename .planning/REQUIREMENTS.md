# Requirements: WAIaaS v28.6 RPC Pool

**Defined:** 2026-02-25
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for v28.6. Each maps to roadmap phases.

### RPC Pool Core

- [ ] **POOL-01**: 네트워크당 N개 RPC URL을 우선순위 순서로 등록할 수 있다
- [ ] **POOL-02**: 요청 시 우선순위 순서대로 시도하고 실패 시 다음 엔드포인트로 자동 전환한다
- [ ] **POOL-03**: 429/408/5xx 응답 시 해당 RPC에 cooldown 적용 (60초 기본, 지수 증가, 최대 5분)
- [ ] **POOL-04**: cooldown 중인 RPC를 자동 스킵하고 cooldown 해제 시 자동 복귀한다
- [ ] **POOL-05**: 네트워크의 전체 RPC가 실패하면 에러를 전파한다

### Built-in Defaults

- [ ] **DFLT-01**: 메인넷 6개 네트워크에 빌트인 기본 RPC 목록을 제공한다
- [ ] **DFLT-02**: 테스트넷 7개 네트워크에 빌트인 기본 RPC 목록을 제공한다
- [ ] **DFLT-03**: 설정 미지정 시 빌트인 기본값으로 자동 동작한다

### Adapter Integration

- [ ] **ADPT-01**: RpcPool 추상 레이어를 AdapterPool과 어댑터 사이에 도입한다
- [ ] **ADPT-02**: SolanaAdapter의 잔액/자산 조회가 RPC Pool을 경유한다
- [ ] **ADPT-03**: EvmAdapter의 PublicClient 생성이 RPC Pool에서 URL을 획득한다
- [ ] **ADPT-04**: IncomingTxMonitor 각 Subscriber가 RPC Pool을 통해 폴링한다

### Config + Settings

- [ ] **CONF-01**: config.toml 기존 단일 URL 설정이 1개짜리 Pool로 하위 호환 동작한다
- [ ] **CONF-02**: Admin Settings에서 네트워크별 RPC URL 목록을 추가/삭제/순서 변경할 수 있다
- [ ] **CONF-03**: RPC 목록 변경 시 데몬 재시작 없이 hot-reload된다
- [ ] **CONF-04**: 환경 변수 WAIAAS_RPC_* URL이 Pool 첫 번째 항목으로 추가된다

### Admin UI

- [ ] **ADUI-01**: RPC Endpoints 탭에서 네트워크별 복수 URL 목록을 표시하고 순서를 변경할 수 있다
- [ ] **ADUI-02**: URL별 상태를 표시한다 (정상: 레이턴시+블록번호 / cooldown: 남은시간+실패횟수)
- [ ] **ADUI-03**: URL 추가/삭제 폼을 제공한다
- [ ] **ADUI-04**: 개별 URL 연결 테스트 버튼이 동작한다
- [ ] **ADUI-05**: 빌트인 기본 URL은 (built-in) 라벨로 구분하며 삭제 불가, 비활성화 가능하다

### Monitoring + Alerts

- [ ] **MNTR-01**: GET /admin/rpc-status API가 네트워크별 RPC 상태를 반환한다
- [ ] **MNTR-02**: 특정 RPC가 cooldown 진입 시 RPC_HEALTH_DEGRADED 알림이 발생한다
- [ ] **MNTR-03**: 네트워크 전체 RPC 실패 시 RPC_ALL_FAILED 알림이 발생한다
- [ ] **MNTR-04**: cooldown 해제 후 정상 복귀 시 RPC_RECOVERED 알림이 발생한다

## v2 Requirements

Deferred to future release.

### WebSocket Pool

- **WSPL-01**: WebSocket RPC도 Pool 대상으로 확장 (현재 HTTP만)
- **WSPL-02**: Solana logsSubscribe WebSocket failover

### Advanced Optimization

- **OPTM-01**: RPC 응답 시간 기반 자동 최적화 라우팅
- **OPTM-02**: 유료 RPC 프로바이더 자동 프로비저닝

## Out of Scope

| Feature | Reason |
|---------|--------|
| 유료 RPC 프로바이더 자동 프로비저닝 | 사용자가 직접 URL 입력 — 자동 생성 불필요 |
| RPC 응답 시간 기반 자동 최적화 | 우선순위 fallback + cooldown으로 충분 |
| WebSocket RPC Pool | HTTP RPC만 대상, WS는 단일 유지 — 복잡도 제한 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| POOL-01 | Phase 260 | Pending |
| POOL-02 | Phase 260 | Pending |
| POOL-03 | Phase 260 | Pending |
| POOL-04 | Phase 260 | Pending |
| POOL-05 | Phase 260 | Pending |
| DFLT-01 | Phase 260 | Pending |
| DFLT-02 | Phase 260 | Pending |
| DFLT-03 | Phase 260 | Pending |
| ADPT-01 | Phase 261 | Pending |
| ADPT-02 | Phase 261 | Pending |
| ADPT-03 | Phase 261 | Pending |
| ADPT-04 | Phase 261 | Pending |
| CONF-01 | Phase 261 | Pending |
| CONF-02 | Phase 262 | Pending |
| CONF-03 | Phase 262 | Pending |
| CONF-04 | Phase 261 | Pending |
| ADUI-01 | Phase 263 | Pending |
| ADUI-02 | Phase 263 | Pending |
| ADUI-03 | Phase 263 | Pending |
| ADUI-04 | Phase 263 | Pending |
| ADUI-05 | Phase 263 | Pending |
| MNTR-01 | Phase 264 | Pending |
| MNTR-02 | Phase 264 | Pending |
| MNTR-03 | Phase 264 | Pending |
| MNTR-04 | Phase 264 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-02-25*
*Last updated: 2026-02-25 after roadmap creation (traceability updated)*
