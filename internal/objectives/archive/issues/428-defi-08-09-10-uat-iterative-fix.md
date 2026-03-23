# #428 — DeFi UAT defi-08/09/10 반복 검증 및 수정 루프

- **유형**: BUG
- **심각도**: HIGH
- **영향 시나리오**: defi-08 (Kamino Supply), defi-09 (Pendle buy_pt), defi-10 (Drift add_margin)
- **컴포넌트**: `packages/actions/src/providers/kamino/`, `packages/actions/src/providers/pendle/`, `packages/actions/src/providers/drift/`

## 현상

Helius 유료 RPC가 Admin Settings에 등록된 상태에서 defi-08/09/10 UAT dryRun이 실패한다.

### defi-08 Kamino Supply — InvalidInstructionData
```
Simulation FAIL: "408268839 is not a recent slot" → InvalidInstructionData
Program: AddressLookupTab1e1111111111111111111111111111111
```
Kamino SDK가 생성한 AddressLookupTable 명령이 stale slot을 참조.

### defi-09 Pendle buy_pt — API 400
```
ACTION_RESOLVE_FAILED: API error 400: "Unable to classify convert action"
```
Pendle REST API가 market/tokenIn 조합을 인식하지 못함.

### defi-10 Drift add_margin — No user
```
ACTION_RESOLVE_FAILED: DriftClient has no user for user id 0_FjkgrSFgSybCkZ6kY3r5d2ExhpPSEhXrwMdL7LJzX3ei
```
DriftClient.subscribe() 실패 → user 미로드 → 후속 명령 전체 실패.

## 원인 분석

### defi-08 / defi-10 공통 — RPC Pool 시딩 누락 (#424)

1. **#424 수정이 같은 커밋에 포함**되었으나, UAT 실행 시 데몬이 수정 전 코드로 기동됨
2. Admin Settings `rpc_pool.solana-mainnet`에 Helius URL이 저장되어 있으나, daemon-startup Step 4에서 DB 키를 RpcPool에 시딩하지 않았음 (수정 전 코드)
3. `resolveRpcUrlFromPool()`이 public RPC로 fallback → rate limit(429) + stale slot
4. **수정된 데몬으로 재시작 시 해결 가능성 높음** — 먼저 확인 필요

### defi-09 — Pendle market 파라미터 문제 (RPC 무관)

1. Pendle은 REST API 기반으로 RPC Pool과 무관
2. 테스트 market 주소(`0xd0354d4e7bcf345fb117cabe41acadb724eccca2`)가 만료/비활성 가능성
3. `tokenIn`과 market의 underlying asset 조합이 Pendle API에서 유효하지 않음
4. 활성 마켓 목록 조회 → 유효한 market/tokenIn 재선정 필요

## 수정 방향

### Phase 1: #424 수정 반영 확인 (defi-08, defi-10)

1. 수정된 코드로 데몬 재빌드 + 재시작
2. RpcPool에 Helius URL이 시딩되었는지 로그 확인
3. defi-08 Kamino Supply dryRun 재시도
4. defi-10 Drift add_margin dryRun 재시도
5. 통과 시 실거래까지 진행

### Phase 2: Pendle market 파라미터 수정 (defi-09)

1. Pendle API에서 현재 활성 마켓 목록 조회
2. 만기일이 미래이고 유동성이 있는 마켓 선택
3. UAT 시나리오의 market 주소 + tokenIn 업데이트
4. dryRun → 실거래 검증

### Phase 3: 반복 수정 루프 (필요 시)

각 시나리오별로 PASS할 때까지:
- 에러 로그 분석 → 코드 수정 → 재빌드 → dryRun → 실거래

## 테스트 항목

- [ ] 수정된 데몬 시작 시 RpcPool에 Admin Settings rpc_pool.* URL 시딩 확인
- [ ] defi-08 Kamino Supply dryRun PASS (simulation success)
- [ ] defi-08 Kamino Supply 실거래 CONFIRMED
- [ ] defi-09 Pendle buy_pt dryRun PASS (유효 market으로)
- [ ] defi-09 Pendle buy_pt 실거래 CONFIRMED
- [ ] defi-10 Drift add_margin dryRun PASS (subscribe 성공)
- [ ] defi-10 Drift open_position/close_position 정상 동작
- [ ] defi-10 Drift 실거래 CONFIRMED

## 참고

- 이전 유사 이슈: #419 (DeFi UAT 6시나리오 반복 검증 — 3/6 PASS)
- #424 (RPC Pool Admin seed) 수정이 이미 반영됨 — 데몬 재시작으로 효과 확인 필요
- #425 (Drift getDepositIx → getDepositInstruction) 수정이 이미 반영됨
