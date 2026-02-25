# Phase 259 Context

## Inherited from Phase 258

- GAS_WAITING 상태는 v23 마이그레이션에서 이미 추가됨 -- DB 마이그레이션 불필요
- 가스 조건 평가는 Stage 3(정책 평가) 통과 후 수행 -- 정책 위반은 가스 대기 없이 즉시 거부
- GAS_WAITING 트랜잭션은 nonce를 실행 시점에 할당 (대기 진입 시 미할당)
- 배치 조회로 한 번의 RPC 호출로 가스 가격 확인 후 모든 대기 TX 일괄 평가
- Admin Settings(런타임) 5개 키로 운영 파라미터 조정 (config.toml 아님)
- gas_condition.* 설정 키가 미등록일 때 graceful fallback (try/catch + defaults) -- 258-02에서 등록 완료
- bridgeMetadata에 gasCondition 저장 (metadata 아님) -- AsyncPollingService의 tracker 라우팅 호환
- max_pending_count는 전역 GAS_WAITING 카운트 (지갑별 아님)
- GasConditionTracker는 raw JSON-RPC fetch 사용 (adapter 의존성 없음) -- rpcUrl은 bridgeMetadata에서 읽음
- 10s 가스 가격 캐시로 동일 폴링 사이클 내 중복 RPC 호출 방지
- gas-condition COMPLETED -> GAS_WAITING->PENDING 전환 후 executeFromStage4로 파이프라인 재진입
- resumePipeline은 reservation 해제 안 함 -- 온체인 실행에 자금 필요
- executeFromStage4는 stage4Wait 건너뜀 -- 정책은 GAS_WAITING 진입 전 이미 평가됨

## Phase 259 Decisions

- MCP 도구는 snake_case 파라미터명 사용 (gas_condition.max_gas_price), REST API body는 camelCase (gasCondition.maxGasPrice)
- ActionProvider DeFi 트랜잭션에 gasCondition 적용: actions.ts route에서 ActionExecuteRequestSchema에 gasCondition 추가, contractCall 객체에 병합하여 stage3_5GasCondition이 감지
- SIGN type에는 gasCondition 미적용 (sign-only pipeline은 동기 반환, 가스 대기 불가)
- Python SDK gas_condition은 Pydantic v2 모델 + Field(alias="gasCondition")으로 camelCase 직렬화
- TS SDK는 SendTokenParams에 직접 gasCondition 추가 (params를 그대로 body로 전달하는 구조)

## Phase 258 Gap Fix — Already Resolved

- **NOTE:** handleTimeout() CANCELLED 분기의 TX_CANCELLED 알림 발송은 Phase 258 실행 중에 이미 구현 완료됨
- 구현 위치: `packages/daemon/src/services/async-polling-service.ts` lines 185-192
- 테스트: `packages/daemon/src/__tests__/gas-condition-pipeline.test.ts` lines 276-348
- 원래 259-01에서 수정 예정이었으나, Phase 258 실행 시 commit `27848045`에서 해결됨
- 따라서 259-01에서 해당 작업(T1)을 제거하고 나머지 작업만 진행
