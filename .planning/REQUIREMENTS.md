# Requirements: WAIaaS v28.5 가스비 조건부 실행

**Defined:** 2026-02-25
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다

## v1 Requirements

Requirements for v28.5 milestone. Each maps to roadmap phases.

### Pipeline

- [x] **PIPE-01**: 트랜잭션 요청에 선택적 gasCondition 필드를 지정할 수 있다 (maxGasPrice/maxPriorityFee/timeout)
- [x] **PIPE-02**: gasCondition이 지정된 트랜잭션은 Stage 3(정책 평가) 통과 후 GAS_WAITING 상태로 진입한다
- [x] **PIPE-03**: gasCondition 미지정 트랜잭션은 기존 동작 그대로 즉시 실행된다 (하위 호환)
- [ ] **PIPE-04**: 정책 위반 트랜잭션은 gasCondition 유무와 관계없이 즉시 거부된다 (가스 대기 없음)
- [ ] **PIPE-05**: GAS_WAITING 트랜잭션은 nonce를 실행 시점에 할당한다 (대기 진입 시 미할당)
- [x] **PIPE-06**: GasCondition Zod 스키마가 기존 discriminatedUnion 7-type 모두에 적용된다

### Evaluator

- [ ] **EVAL-01**: GasConditionEvaluator가 현재 가스 가격을 RPC에서 조회하여 조건과 비교한다
- [ ] **EVAL-02**: EVM에서 eth_gasPrice로 baseFee+priorityFee를 조회하여 maxGasPrice 조건을 평가한다
- [ ] **EVAL-03**: EVM에서 eth_maxPriorityFeePerGas로 priorityFee를 조회하여 maxPriorityFee 조건을 평가한다
- [ ] **EVAL-04**: Solana에서 computeUnitPrice 기반으로 maxPriorityFee 조건을 평가한다

### Worker

- [ ] **WRKR-01**: GasConditionWorker가 대기 중인 트랜잭션의 가스 조건을 주기적으로 재평가한다
- [ ] **WRKR-02**: 가스 조건 충족 시 GAS_WAITING에서 파이프라인을 재개한다 (Stage 4부터)
- [ ] **WRKR-03**: 타임아웃 초과 시 트랜잭션을 CANCELLED로 전이하고 알림을 발송한다
- [ ] **WRKR-04**: 데몬 재시작 후 DB의 GAS_WAITING 트랜잭션을 자동 복원하여 재평가를 재개한다
- [ ] **WRKR-05**: 배치 조회로 한 번의 RPC 호출로 가스 가격을 확인 후 모든 대기 트랜잭션을 일괄 평가한다
- [x] **WRKR-06**: max_pending_count 초과 시 새 gasCondition 트랜잭션을 에러로 거부한다

### Notification

- [x] **NOTF-01**: 트랜잭션이 GAS_WAITING 상태 진입 시 TX_GAS_WAITING 알림을 발송한다
- [ ] **NOTF-02**: 가스 조건 충족되어 실행 재개 시 TX_GAS_CONDITION_MET 알림을 발송한다
- [ ] **NOTF-03**: 타임아웃 취소 시 기존 TX_CANCELLED 이벤트를 재사용한다

### Integration

- [ ] **INTF-01**: REST API 트랜잭션 제출 엔드포인트에 gasCondition 옵션 필드가 추가된다
- [ ] **INTF-02**: Admin Settings에 gas_condition 5개 키가 추가된다 (enabled/poll_interval_sec/default_timeout_sec/max_timeout_sec/max_pending_count)
- [ ] **INTF-03**: Admin UI System > Settings에 Gas Condition 설정 섹션이 추가된다
- [ ] **INTF-04**: MCP send_token/call_contract 등 도구에 gasCondition 파라미터가 노출된다
- [ ] **INTF-05**: TS/Python SDK에 gasCondition 파라미터가 노출된다
- [ ] **INTF-06**: transactions.skill.md에 가스 조건부 실행 섹션이 추가된다
- [ ] **INTF-07**: ActionProvider resolve 후 gasCondition이 적용된다

## v2 Requirements

해당 없음 -- 이번 마일스톤에서 가스 조건부 실행 전체 기능을 구현.

## Out of Scope

| Feature | Reason |
|---------|--------|
| 외부 가스 오라클 (Blocknative 등) | 기존 RPC 인프라로 충분, 추가 의존성 불필요 |
| 가스비 USD 환산 기반 조건 | maxGasPrice/maxPriorityFee wei/micro-lamports 단위 충분, 향후 확장 가능 |
| 자동 가스 최적화 (최적 시점 AI 예측) | 선언적 조건 기반 우선, ML 기반 예측은 별도 마일스톤 |
| EIP-4844 blob gas 조건 | L2 blob 가스는 별도 사용 패턴, 필요 시 향후 추가 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PIPE-01 | Phase 258 | Pending |
| PIPE-02 | Phase 258 | Pending |
| PIPE-03 | Phase 258 | Pending |
| PIPE-04 | Phase 258 | Pending |
| PIPE-05 | Phase 258 | Pending |
| PIPE-06 | Phase 258 | Pending |
| EVAL-01 | Phase 258 | Pending |
| EVAL-02 | Phase 258 | Pending |
| EVAL-03 | Phase 258 | Pending |
| EVAL-04 | Phase 258 | Pending |
| WRKR-01 | Phase 258 | Pending |
| WRKR-02 | Phase 258 | Pending |
| WRKR-03 | Phase 258 | Pending |
| WRKR-04 | Phase 258 | Pending |
| WRKR-05 | Phase 258 | Pending |
| WRKR-06 | Phase 258 | Pending |
| NOTF-01 | Phase 258 | Pending |
| NOTF-02 | Phase 258 | Pending |
| NOTF-03 | Phase 258 | Pending |
| INTF-01 | Phase 259 | Pending |
| INTF-02 | Phase 259 | Pending |
| INTF-03 | Phase 259 | Pending |
| INTF-04 | Phase 259 | Pending |
| INTF-05 | Phase 259 | Pending |
| INTF-06 | Phase 259 | Pending |
| INTF-07 | Phase 259 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-02-25*
*Last updated: 2026-02-25 after roadmap creation*
