# #143 Confirmation Worker RPC 콜백 미주입 — DETECTED→CONFIRMED 전이 불가

- **유형:** BUG
- **심각도:** CRITICAL
- **마일스톤:** v27.1
- **상태:** FIXED

## 현재 상태

- `IncomingTxMonitorService.registerWorkers()`에서 confirmation worker(`incoming-tx-confirm-solana`, `incoming-tx-confirm-evm`)를 등록할 때 `{sqlite: this.sqlite}`만 전달
- `getBlockNumber` (EVM)과 `checkSolanaFinalized` (Solana) RPC 콜백이 주입되지 않음
- `createConfirmationWorkerHandler` 내부 가드 `if (!checkSolanaFinalized) continue` / `if (!getBlockNumber) continue`에 의해 모든 DETECTED 레코드가 무시됨
- 결과: 어떤 수신 트랜잭션도 CONFIRMED 상태로 전이되지 않음

## 사용자 영향

- `GET /v1/wallet/incoming`의 기본 필터 `status=CONFIRMED`가 항상 빈 결과 반환
- 수신 트랜잭션 모니터링이 감지(DETECTED)까지만 동작하고 확인(CONFIRMED) 단계가 완전히 비활성

## 수정 방향

두 가지 옵션:

### Option A: AdapterPool을 deps에 추가
- `IncomingTxMonitorDeps`에 `adapterPool` 추가
- `registerWorkers()`에서 adapter로부터 `getBlockNumber`/`checkSolanaFinalized` 콜백 생성

### Option B: daemon.ts에서 콜백 직접 주입
- `daemon.ts` Step 4c-9에서 `resolveRpcUrl` 헬퍼로 콜백 빌드
- deps에 직접 전달

### 수정 대상 파일

- `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts` — `registerWorkers()` RPC 콜백 주입
- `packages/daemon/src/daemon.ts` — deps 구성 시 콜백 전달
- 관련 테스트 파일 갱신

## 출처

- v27.1 Milestone Audit — STO-03
- `.planning/v27.1-MILESTONE-AUDIT.md`

## 테스트 항목

- [ ] Solana DETECTED 레코드가 finality 확인 후 CONFIRMED로 전이되는지 확인
- [ ] EVM DETECTED 레코드가 블록 확인 후 CONFIRMED로 전이되는지 확인
- [ ] `GET /v1/wallet/incoming` 기본 조회에서 CONFIRMED 레코드가 반환되는지 확인
- [ ] RPC 콜백 주입 누락 시 에러 로그가 출력되는지 확인 (silent skip 방지)
