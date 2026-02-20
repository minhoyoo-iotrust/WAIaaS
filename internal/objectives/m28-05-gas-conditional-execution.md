# 마일스톤 m28-05: 가스비 조건부 실행

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

트랜잭션 파이프라인에 가스비 조건부 실행 기능을 추가하여, AI 에이전트가 "가스비가 N gwei 이하일 때만 실행" 같은 비용 최적화 조건을 선언적으로 지정할 수 있는 상태.

---

## 배경

### 현재 한계

WAIaaS의 6-stage 트랜잭션 파이프라인은 트랜잭션 제출 시 즉시 실행을 시도한다. 에이전트가 비용을 최적화하려면 **직접** 가스비를 폴링하고 적절한 시점에 API를 호출해야 한다. 이는 에이전트 로직 복잡도를 높이고, 가스비 급등 시 예상치 못한 비용이 발생할 수 있다.

m28-01~m28-04에서 DeFi 프로토콜(Swap, Bridge, Staking)이 도입되면 트랜잭션 빈도와 가스비 민감도가 크게 증가한다. 특히 EVM 체인에서 대량 스왑이나 브릿지는 가스비가 트랜잭션 비용의 상당 부분을 차지할 수 있다.

### 사용 시나리오

```
AI 에이전트: "SOL을 USDC로 스왑해줘. 단, EVM 가스비가 30 gwei 이하일 때"

1. 트랜잭션 제출 (gasCondition: { maxGasPrice: "30000000000" })
2. 파이프라인 Stage 2(정책 평가) 통과 후, 가스 조건 평가에서 대기
3. 가스 조건 충족 시 → Stage 4(서명) → Stage 5(전송) 진행
4. 타임아웃(기본 1시간) 초과 시 → CANCELLED + 알림
```

```
AI 에이전트: "이 컨트랙트 호출을 실행해줘. 가스 우선순위 수수료 2 gwei 이하에서만"

1. 트랜잭션 제출 (gasCondition: { maxPriorityFee: "2000000000", timeout: 7200 })
2. 조건 충족까지 폴링 대기 (30초 간격)
3. 2시간 내 조건 충족 시 실행, 미충족 시 취소
```

---

## 구현 대상

### 컴포넌트

| 컴포넌트 | 내용 |
|----------|------|
| GasCondition 스키마 | 트랜잭션 요청에 선택적 `gasCondition` 필드 추가. `maxGasPrice` (EVM baseFee + priorityFee 상한), `maxPriorityFee` (EVM priorityFee 상한), `timeout` (대기 최대 시간, 초) |
| GasConditionEvaluator | 파이프라인 내 가스 조건 평가 로직. 현재 가스 가격을 RPC에서 조회하여 조건과 비교. 조건 미충족 시 대기 큐에 보관 |
| GasConditionWorker | 백그라운드 워커. 대기 중인 트랜잭션의 가스 조건을 주기적으로 재평가. 조건 충족 시 파이프라인 재개, 타임아웃 시 CANCELLED |
| Solana 가스 조건 | Solana는 가스비가 고정적(priority fee만 변동)이므로, `maxPriorityFee` 조건만 지원. computeUnitPrice 기반 평가 |

### REST API 변경

기존 트랜잭션 제출 API에 `gasCondition` 옵션 필드 추가:

```json
{
  "type": "TRANSFER",
  "to": "0x...",
  "amount": "1000000000000000000",
  "gasCondition": {
    "maxGasPrice": "30000000000",
    "timeout": 3600
  }
}
```

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `gasCondition.maxGasPrice` | string (optional) | — | EVM: baseFee + priorityFee 상한 (wei). 둘 중 하나 필수 |
| `gasCondition.maxPriorityFee` | string (optional) | — | EVM: priorityFee 상한 (wei). Solana: computeUnitPrice 상한 (micro-lamports) |
| `gasCondition.timeout` | number (optional) | Admin Settings 기본값 | 대기 최대 시간 (초). 범위: 60~86400 (1분~24시간) |

### 트랜잭션 상태 확장

| 상태 | 설명 |
|------|------|
| `GAS_WAITING` | 가스 조건 미충족으로 대기 중 (신규) |
| `CANCELLED` | 타임아웃으로 취소 (기존 상태 재사용) |

### 알림 이벤트

| 이벤트 | 시점 |
|--------|------|
| `TX_GAS_WAITING` | 트랜잭션이 가스 대기 상태 진입 시 (신규) |
| `TX_GAS_CONDITION_MET` | 가스 조건 충족되어 실행 재개 시 (신규) |
| `TX_CANCELLED` | 타임아웃으로 취소 시 (기존 이벤트 재사용) |

### Admin Settings

가스 조건부 실행의 운영 파라미터를 Admin Settings에서 런타임 조정 가능:

| 설정 키 | 기본값 | 범위 | 설명 |
|---------|--------|------|------|
| `gas_condition.enabled` | `true` | boolean | 가스 조건부 실행 기능 활성화 |
| `gas_condition.poll_interval_sec` | `30` | 10~300 | 가스 조건 재평가 주기 (초) |
| `gas_condition.default_timeout_sec` | `3600` | 60~86400 | 기본 타임아웃 (1시간) |
| `gas_condition.max_timeout_sec` | `86400` | 3600~86400 | 최대 타임아웃 (24시간) |
| `gas_condition.max_pending_count` | `100` | 1~1000 | 동시 대기 가능 트랜잭션 수 |

Admin UI > System > Settings 페이지의 "Gas Condition" 섹션에서 설정.

### 파일/모듈 구조

```
packages/daemon/src/
  pipeline/
    gas-condition-evaluator.ts    # 가스 조건 평가 로직
    pipeline.ts                   # Stage 분기: gasCondition 존재 시 GAS_WAITING
  lifecycle/
    workers.ts                    # gas-condition 백그라운드 워커 등록

packages/core/src/
  schemas/
    transaction.schema.ts         # GasConditionSchema 추가
  enums/
    transaction.ts                # GAS_WAITING 상태 추가
    notification.ts               # TX_GAS_WAITING, TX_GAS_CONDITION_MET 추가

packages/mcp/src/tools/
  send-token.ts                   # gasCondition 파라미터 노출
  call-contract.ts                # gasCondition 파라미터 노출

packages/admin/src/pages/
  system.tsx                      # Gas Condition 설정 섹션 추가

skills/
  transactions.skill.md           # 가스 조건부 실행 섹션 추가
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 가스 조건 평가 시점 | 정책 평가(Stage 2) 통과 후 | 정책 위반 트랜잭션은 가스 대기 없이 즉시 거부. 불필요한 대기 방지 |
| 2 | 가스 가격 조회 방식 | RPC eth_gasPrice / eth_maxPriorityFeePerGas | 외부 가스 오라클(Blocknative 등) 대신 기존 RPC 인프라 활용. 추가 의존성 없음 |
| 3 | 대기 중 트랜잭션 저장 | DB (transactions 테이블 상태 활용) | 메모리 큐 대신 DB 저장으로 데몬 재시작 시에도 대기 유지 |
| 4 | Solana 지원 범위 | maxPriorityFee만 | Solana 기본 수수료(5000 lamports)는 고정. priority fee만 변동하므로 maxPriorityFee 조건만 의미 있음 |
| 5 | 가스 조건 + DeFi 연동 | ActionProvider resolve 후 가스 조건 평가 | Swap 등 ActionProvider 실행 시에도 gasCondition 적용 가능. resolve() 결과인 ContractCallRequest에 gasCondition 전달 |
| 6 | 설정 위치 | Admin Settings (런타임 조정) | config.toml이 아닌 Admin Settings에서 운영 파라미터 변경. 데몬 재시작 없이 폴링 간격, 타임아웃 등 조정 가능 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | gasCondition 지정 → GAS_WAITING 상태 진입 | mock RPC gasPrice 50 gwei + maxGasPrice 30 gwei → 상태 GAS_WAITING assert | [L0] |
| 2 | 가스 조건 충족 → 실행 재개 | mock RPC gasPrice 20 gwei → GAS_WAITING → QUEUED → CONFIRMED assert | [L0] |
| 3 | 타임아웃 → CANCELLED | timeout 1초 + mock 높은 가스비 유지 → CANCELLED assert | [L0] |
| 4 | gasCondition 미지정 → 즉시 실행 (기존 동작) | gasCondition 없는 요청 → GAS_WAITING 거치지 않고 즉시 실행 assert | [L0] |
| 5 | maxPriorityFee 조건 평가 | mock priorityFee 3 gwei + maxPriorityFee 2 gwei → GAS_WAITING assert | [L0] |
| 6 | Solana maxPriorityFee 조건 | mock computeUnitPrice 50000 + maxPriorityFee 30000 → GAS_WAITING assert | [L0] |
| 7 | 정책 위반 → 가스 대기 없이 거부 | SPENDING_LIMIT 초과 + gasCondition → 즉시 POLICY_VIOLATION assert | [L0] |
| 8 | 데몬 재시작 후 대기 복원 | GAS_WAITING 상태 트랜잭션 생성 → 데몬 재시작 → 워커가 재평가 재개 assert | [L0] |
| 9 | max_pending_count 초과 → 에러 | 101번째 gasCondition 트랜잭션 → 에러 반환 assert | [L0] |
| 10 | 가스 조건 충족 알림 | GAS_WAITING → 조건 충족 → TX_GAS_CONDITION_MET 알림 발송 assert | [L0] |
| 11 | ActionProvider + gasCondition | Jupiter Swap + gasCondition → resolve() 후 가스 조건 평가 assert | [L0] |
| 12 | Admin Settings 변경 반영 | poll_interval_sec 변경 → 워커 주기 즉시 반영 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m28-00~m28-04 (기본 DeFi) | DeFi 트랜잭션이 가스 조건부 실행의 주요 사용처. Swap/Bridge 파이프라인이 안정화된 후 진행 |
| v1.5 (가격 오라클) | 가스비 USD 환산 시 오라클 활용 가능 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 가스비 급등 장기화 | 에이전트 트랜잭션이 장시간 대기 → 시의성 상실 | 타임아웃 기본 1시간 + 최대 24시간 제한. 타임아웃 시 알림 발송 |
| 2 | 대기 중 nonce 충돌 | 같은 지갑의 다른 트랜잭션이 먼저 실행되면 nonce 불일치 | GAS_WAITING 트랜잭션은 nonce를 실행 시점에 할당 (대기 진입 시 할당 안 함) |
| 3 | RPC 가스 조회 실패 | 가스 가격 확인 불가 → 조건 평가 불가 | 조회 실패 시 해당 폴링 주기 건너뜀. 3회 연속 실패 시 알림 + 수동 확인 안내 |
| 4 | 폴링 부하 | 동시 대기 100건 × 30초 간격 → RPC 부하 | 배치 조회 (한 번의 RPC 호출로 가스 가격 확인 후 모든 대기 트랜잭션 일괄 평가) |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 2개 (GasConditionEvaluator + Worker 1 / MCP+SDK+알림+스킬+Admin Settings 1) |
| 신규 파일 | 3-5개 |
| 수정 파일 | 8-12개 |
| 테스트 | 12-16개 |
| DB 마이그레이션 | 1건 (transactions 상태 enum 확장) |

---

*생성일: 2026-02-20*
*선행: m28-00~m28-04 (기본 DeFi 프로토콜)*
