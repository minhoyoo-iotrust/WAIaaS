# 블록체인 테스트 환경 전략 -- Solana 3단계 격리 + Mock RPC + EVM Stub

**문서 ID:** CHAIN
**작성일:** 2026-02-06
**상태:** 완료
**참조:** CHAIN-SOL (31-solana-adapter-detail.md), CORE-04 (27-chain-adapter-interface.md), KILL-AUTO-EVM (36-killswitch-autostop-evm.md), TX-PIPE (32-transaction-pipeline-api.md), TLVL (41-test-levels-matrix-coverage.md), MOCK (42-mock-boundaries-interfaces-contracts.md), SEC-05 (47-boundary-value-chain-scenarios.md)
**요구사항:** CHAIN-01 (3단계 테스트 환경), CHAIN-02 (Mock RPC 시나리오), CHAIN-03 (Local Validator E2E), CHAIN-04 (EVM Adapter Stub 테스트)

---

## 목차

1. [Solana 3단계 테스트 환경 (CHAIN-01)](#1-solana-3단계-테스트-환경-chain-01)
2. [Mock RPC 시나리오 명세 (CHAIN-02)](#2-mock-rpc-시나리오-명세-chain-02)
3. [Local Validator E2E 흐름 (CHAIN-03)](#3-local-validator-e2e-흐름-chain-03)
4. [EVM Adapter Stub 테스트 범위 (CHAIN-04)](#4-evm-adapter-stub-테스트-범위-chain-04)
5. [요구사항 충족 매트릭스](#5-요구사항-충족-매트릭스)
6. [구현 가이드 요약](#6-구현-가이드-요약)

---

## 1. Solana 3단계 테스트 환경 (CHAIN-01)

### 1.1 환경 요약 테이블

Solana 블록체인 의존성을 3단계(Level 1 Mock RPC / Level 2 Local Validator / Level 3 Devnet)로 격리한다. 각 환경은 용도, 실행 조건, 적용 테스트 레벨이 명확히 구분된다.

| 항목 | Level 1: Mock RPC | Level 2: Local Validator | Level 3: Devnet |
|------|-------------------|------------------------|----------------|
| **용도** | 로직 검증, 에러 매핑, 시나리오 시뮬레이션 | 실제 노드 E2E 흐름 (온체인 동작 포함) | 네트워크 호환성, 실제 혼잡도 대응 |
| **실행 환경** | `createMockRpcTransport()` (메모리 내) | `solana-test-validator` (로컬 프로세스) | Solana Devnet 공용 RPC |
| **속도** | <1ms/call | ~100ms/call | ~500ms/call (네트워크 편차 있음) |
| **실행 빈도** | 매 커밋 (Unit), 매 PR (Integration/E2E/Security) | 매 PR (선택적), nightly (필수) | nightly/릴리스 |
| **결정성** | 100% (완전 제어) | ~99% (단일 노드, 타이밍 편차) | ~90% (네트워크 상태 의존) |
| **Mock 대상** | 전체 RPC 응답 (커스텀 Transport) | 없음 (실제 노드) | 없음 (실제 네트워크) |
| **적용 테스트 레벨** | Unit, Integration, E2E, Security | Chain Integration | Chain Integration |
| **의존성** | `@solana/kit` RpcTransport 타입만 | Solana CLI suite (solana-test-validator) | 인터넷 연결 |
| **Airdrop** | N/A (Mock 응답) | `requestAirdrop` 10 SOL (beforeAll 1회) | `requestAirdrop` 2 SOL (테스트별 + 재시도) |
| **Jest 설정** | `--maxWorkers=75%` (Unit/Security), `--runInBand` (Integration) | `--runInBand --testTimeout=60000` | `--runInBand --testTimeout=60000` |

### 1.2 Phase 14 결정 준수 확인

Phase 14(TLVL-01, MOCK-01)에서 확정한 테스트 레벨별 블록체인 RPC Mock 방식과의 정합성을 확인한다.

| 테스트 레벨 | Phase 14 결정 (MOCK-01) | 본 문서 적용 | 정합 |
|------------|------------------------|------------|------|
| Unit | MockChainAdapter (canned responses) | Level 1 Mock RPC (Stateless) | O |
| Integration | MockChainAdapter (canned responses) | Level 1 Mock RPC (Stateless) | O |
| E2E | MockChainAdapter (시나리오 기반) | Level 1 Mock RPC (Stateful) | O |
| Chain Integration | 실제 Devnet/Testnet | Level 2 Local Validator + Level 3 Devnet | O |
| Security | MockChainAdapter | Level 1 Mock RPC (Stateless/Stateful) | O |
| Platform | 환경에 따라 다름 | 환경별 판단 | O |

**핵심 원칙:** Unit/Integration/E2E/Security 에서는 실제 RPC 호출을 절대 하지 않는다. Chain Integration에서만 실제 노드를 사용한다.

### 1.3 환경 간 역할 분담 매트릭스

어떤 검증을 어디서 수행하는지 구분한다.

| 검증 항목 | Level 1 Mock RPC | Level 2 Local Validator | Level 3 Devnet |
|----------|:-----------------:|:----------------------:|:--------------:|
| SolanaAdapter 13개 메서드 로직 | **O** (핵심) | - | - |
| ChainError 에러 매핑 11종 | **O** (핵심) | - | - |
| 에러 복구 (재시도/재빌드) | **O** | - | - |
| 트랜잭션 4단계 전체 흐름 | O (시나리오) | **O** (핵심) | O (호환성) |
| 잔액 조회 + 수수료 추정 | O (canned) | **O** (실제 값) | O (실제 값) |
| 주소 검증 (Base58 + 32바이트) | **O** (순수 로직) | O (보조) | - |
| RPC 연결/해제/헬스 체크 | O (Mock 상태) | **O** (실제 연결) | O (실제 연결) |
| Blockhash 만료 시나리오 | **O** (FakeClock) | - | - |
| 시뮬레이션 실패 에러 | **O** (Mock 응답) | O (잔액 0에서) | - |
| 네트워크 레이턴시 | - | - | **O** (핵심) |
| Priority Fee 동적 변화 | - | - | **O** (실제 혼잡도) |
| Rate Limit 대응 | - | - | **O** (공용 RPC 제한) |
| 중복 트랜잭션 제출 | **O** (Mock 에러) | O (보조) | - |
| 확인 대기 폴링 | **O** (시뮬레이션) | **O** (실제 폴링) | O (보조) |

---

## 2. Mock RPC 시나리오 명세 (CHAIN-02)

### 2.1 시나리오 총괄

31-solana-adapter-detail.md의 에러 매핑(섹션 10)과 Phase 15 보안 시나리오(SEC-05)를 교차 분석하여 13개 Mock RPC 시나리오를 확정한다. 각 시나리오는 RPC 메서드, 입력 파라미터, Mock 응답 JSON 구조, SolanaAdapter의 기대 결과를 포함한다.

| # | 시나리오명 | 카테고리 | 대상 SolanaAdapter 메서드 | 참조 |
|---|----------|---------|------------------------|------|
| 1 | SOL 전송 전체 흐름 (성공) | 성공 | connect, buildTransaction, simulateTransaction, signTransaction, submitTransaction, waitForConfirmation | 기본 흐름 |
| 2 | 잔액 조회 (성공) | 성공 | getBalance | getBalance |
| 3 | 수수료 추정 (성공) | 성공 | estimateFee | estimateFee |
| 4 | RPC 연결 실패 | 실패 | connect (3회 재시도 후 실패) | 31-solana 섹션 3 |
| 5 | 잔액 부족 (InsufficientFundsForFee) | 실패 | simulateTransaction | SEC-05 금액 경계, 에러 매핑 10.1 |
| 6 | Blockhash 만료 (BlockhashNotFound) | 실패 | submitTransaction | SEC-05-T06, 에러 매핑 10.1 |
| 7 | 유효하지 않은 주소 | 실패 | isValidAddress, buildTransaction | 에러 매핑 (클라이언트 검증) |
| 8 | 시뮬레이션 실패 (프로그램 에러) | 실패 | simulateTransaction | 에러 매핑 10.1 InstructionError |
| 9 | 트랜잭션 실행 실패 | 실패 | getTransactionStatus, waitForConfirmation | 에러 매핑 10.1 TransactionError |
| 10 | RPC 타임아웃 | 실패 | 아무 메서드 (getBalance 대표) | 에러 매핑 10.1 RPC timeout |
| 11 | Priority Fee 조회 실패 시 기본값 | 지연 | estimateFee | 31-solana 섹션 9 fallback |
| 12 | 확인 대기 타임아웃 | 지연 | waitForConfirmation | 31-solana 섹션 8 폴링 |
| 13 | 이미 처리된 트랜잭션 (중복 제출) | 중복 | submitTransaction | 에러 매핑 AlreadyProcessed |

### 2.2 시나리오 상세 명세

#### 시나리오 1: SOL 전송 전체 흐름 (성공)

| 항목 | 내용 |
|------|------|
| **카테고리** | 성공 |
| **상태 관리** | Stateful (시나리오 큐 -- 6개 RPC 호출 순차 소비) |
| **대상 메서드** | connect -> buildTransaction -> simulateTransaction -> signTransaction -> submitTransaction -> waitForConfirmation |

**입력 RPC 호출 순서 및 Mock 응답:**

| 순서 | RPC 메서드 | 파라미터 | Mock 응답 JSON |
|------|----------|---------|---------------|
| 1 | `getHealth` | 없음 | `"ok"` |
| 2 | `getLatestBlockhash` | `{ commitment: "confirmed" }` | `{ value: { blockhash: "mock-blockhash-abc123", lastValidBlockHeight: 200 }, context: { slot: 100 } }` |
| 3 | `getRecentPrioritizationFees` | 없음 | `[{ slot: 99, prioritizationFee: 5000 }]` |
| 4 | `simulateTransaction` | `(base64 encoded tx)` | `{ value: { err: null, logs: ["Program 11111111... invoke [1]", "Program 11111111... success"], unitsConsumed: 200 } }` |
| 5 | `sendTransaction` | `(base64 encoded signed tx)` | `"mock-signature-abc123def456"` |
| 6 | `getSignatureStatuses` | `{ signatures: ["mock-signature-abc123def456"] }` | `{ value: [{ slot: 101, confirmations: 1, err: null, confirmationStatus: "confirmed" }] }` |

**SolanaAdapter 기대 결과:**

| 단계 | 반환값 | 검증 항목 |
|------|--------|----------|
| `connect` | void (성공) | `adapter.isConnected() === true` |
| `buildTransaction` | `UnsignedTransaction { chain: 'solana', expiresAt: now+50s }` | `tx.chain === 'solana'`, `tx.expiresAt > now` |
| `simulateTransaction` | `SimulationResult { success: true, estimatedFee: bigint }` | `result.success === true` |
| `signTransaction` | `Uint8Array` (서명된 트랜잭션) | `signedTx.length > 0` |
| `submitTransaction` | `SubmitResult { txHash: 'mock-signature-...', status: 'submitted' }` | `result.txHash` 존재 |
| `waitForConfirmation` | `SubmitResult { status: 'confirmed' }` | `result.status === 'confirmed'` |

---

#### 시나리오 2: 잔액 조회 (성공)

| 항목 | 내용 |
|------|------|
| **카테고리** | 성공 |
| **상태 관리** | Stateless (단일 메서드 호출) |
| **대상 메서드** | `getBalance` |

**입력:**

| RPC 메서드 | 파라미터 | Mock 응답 JSON |
|----------|---------|---------------|
| `getBalance` | `(address, { commitment: "confirmed" })` | `{ value: 5000000000, context: { slot: 100 } }` |

**SolanaAdapter 기대 결과:**

| 반환 타입 | 반환값 | 검증 항목 |
|----------|--------|----------|
| `BalanceInfo` | `{ amount: "5000000000", decimals: 9, symbol: "SOL" }` | `amount === "5000000000"` (5 SOL), `decimals === 9` |

---

#### 시나리오 3: 수수료 추정 (성공)

| 항목 | 내용 |
|------|------|
| **카테고리** | 성공 |
| **상태 관리** | Stateless |
| **대상 메서드** | `estimateFee` |

**입력:**

| RPC 메서드 | 파라미터 | Mock 응답 JSON |
|----------|---------|---------------|
| `getRecentPrioritizationFees` | 없음 | `[{ slot: 100, prioritizationFee: 1000 }, { slot: 99, prioritizationFee: 2000 }, { slot: 98, prioritizationFee: 1500 }]` |

**SolanaAdapter 기대 결과:**

| 반환 타입 | 반환값 | 검증 항목 |
|----------|--------|----------|
| `bigint` | base fee 5000 + priority fee 중앙값 | `fee >= 5000n` (최소 base fee), `typeof fee === 'bigint'` |

**31-solana-adapter 참조:** base fee = 5000 lamports 고정, priority fee = `getRecentPrioritizationFees` 중앙값.

---

#### 시나리오 4: RPC 연결 실패

| 항목 | 내용 |
|------|------|
| **카테고리** | 실패 |
| **상태 관리** | Stateful (3회 호출 모두 실패) |
| **대상 메서드** | `connect` |

**입력:**

| RPC 메서드 | 파라미터 | Mock 응답 JSON |
|----------|---------|---------------|
| `getHealth` (1차) | 없음 | `error: { code: -32005, message: "Node is unhealthy" }` |
| `getHealth` (2차) | 없음 | `error: { code: -32005, message: "Node is unhealthy" }` |
| `getHealth` (3차) | 없음 | `error: { code: -32005, message: "Node is unhealthy" }` |

**SolanaAdapter 기대 결과:**

| 결과 | 기대 에러 | 검증 항목 |
|------|----------|----------|
| throw | `ChainError { code: 'RPC_ERROR', chain: 'solana', retryable: true }` | `err.code === ChainErrorCode.RPC_ERROR`, `adapter.isConnected() === false` |

**31-solana-adapter 참조:** connect는 3회 재시도 후 `RPC_ERROR` throw, `connected = false` 유지.

---

#### 시나리오 5: 잔액 부족 (InsufficientFundsForFee)

| 항목 | 내용 |
|------|------|
| **카테고리** | 실패 |
| **상태 관리** | Stateful (buildTx 성공 후 simulate 실패) |
| **대상 메서드** | `simulateTransaction` |
| **Phase 15 참조** | SEC-05 금액 경계 (INSTANT/NOTIFY 경계에서 잔액 부족) |

**입력:**

| 순서 | RPC 메서드 | 파라미터 | Mock 응답 JSON |
|------|----------|---------|---------------|
| 1 | `getLatestBlockhash` | `{ commitment: "confirmed" }` | `{ value: { blockhash: "mock-blockhash", lastValidBlockHeight: 200 }, context: { slot: 100 } }` |
| 2 | `getRecentPrioritizationFees` | 없음 | `[{ slot: 99, prioritizationFee: 5000 }]` |
| 3 | `simulateTransaction` | `(base64 encoded tx)` | `{ value: { err: "InsufficientFundsForFee", logs: [], unitsConsumed: 0 } }` |

**SolanaAdapter 기대 결과:**

| 결과 | 기대 에러 | 검증 항목 |
|------|----------|----------|
| `SimulationResult` 또는 throw | `ChainError { code: 'INSUFFICIENT_BALANCE', chain: 'solana', retryable: false }` | `err.code === ChainErrorCode.INSUFFICIENT_BALANCE` |

**에러 매핑 근거 (31-solana 10.1):** `InsufficientFundsForFee` -> `INSUFFICIENT_BALANCE` (HTTP 400, 재시도 불가).

---

#### 시나리오 6: Blockhash 만료 (BlockhashNotFound)

| 항목 | 내용 |
|------|------|
| **카테고리** | 실패 |
| **상태 관리** | Stateful |
| **대상 메서드** | `submitTransaction` |
| **Phase 15 참조** | SEC-05-T06 Blockhash 만료 경계 (50초) |

**입력:**

| RPC 메서드 | 파라미터 | Mock 응답 JSON |
|----------|---------|---------------|
| `sendTransaction` | `(base64 encoded signed tx)` | `error: { code: -32002, message: "Transaction simulation failed: Blockhash not found" }` |

**SolanaAdapter 기대 결과:**

| 결과 | 기대 에러 | 검증 항목 |
|------|----------|----------|
| throw | `ChainError { code: 'SOLANA_BLOCKHASH_EXPIRED', chain: 'solana', retryable: true }` | `err.code === SolanaErrorCode.BLOCKHASH_EXPIRED`, `err.retryable === true` |

**에러 매핑 근거 (31-solana 10.1):** `BlockhashNotFound` -> `SOLANA_BLOCKHASH_EXPIRED` (HTTP 408, 재시도 가능 -- buildTransaction부터 재실행).

---

#### 시나리오 7: 유효하지 않은 주소

| 항목 | 내용 |
|------|------|
| **카테고리** | 실패 |
| **상태 관리** | Stateless (RPC 호출 없음 -- 클라이언트 사이드 검증) |
| **대상 메서드** | `isValidAddress`, `buildTransaction` |

**입력:**

| 검증 대상 | 입력 주소 | RPC 호출 |
|----------|----------|---------|
| `isValidAddress` 검증 | `"not-a-valid-address"` | 없음 (순수 로직) |
| `isValidAddress` 검증 | `""` (빈 문자열) | 없음 |
| `isValidAddress` 검증 | `"0x742d35Cc"` (EVM 형식) | 없음 |
| `buildTransaction` 호출 | `{ from: "invalid", to: validAddr, amount: 1n }` | 없음 |

**SolanaAdapter 기대 결과:**

| 호출 | 결과 | 검증 항목 |
|------|------|----------|
| `isValidAddress("not-a-valid-address")` | `false` | Base58 디코딩 실패 또는 32바이트 아님 |
| `isValidAddress("")` | `false` | 빈 문자열 |
| `isValidAddress("0x742d35Cc")` | `false` | EVM 형식 (Base58 아님) |
| `buildTransaction({ from: "invalid", ... })` | throw `ChainError { code: 'INVALID_ADDRESS' }` | `err.code === ChainErrorCode.INVALID_ADDRESS` |

**주소 검증 근거 (31-solana 섹션 4):** Base58 디코딩 + 32바이트 길이 확인. `@solana/addresses`의 `isAddress` 사용.

---

#### 시나리오 8: 시뮬레이션 실패 (프로그램 에러)

| 항목 | 내용 |
|------|------|
| **카테고리** | 실패 |
| **상태 관리** | Stateful |
| **대상 메서드** | `simulateTransaction` |

**입력:**

| 순서 | RPC 메서드 | 파라미터 | Mock 응답 JSON |
|------|----------|---------|---------------|
| 1 | `getLatestBlockhash` | `{ commitment: "confirmed" }` | `{ value: { blockhash: "mock-blockhash", lastValidBlockHeight: 200 }, context: { slot: 100 } }` |
| 2 | `getRecentPrioritizationFees` | 없음 | `[{ slot: 99, prioritizationFee: 5000 }]` |
| 3 | `simulateTransaction` | `(base64 encoded tx)` | `{ value: { err: { "InstructionError": [0, { "Custom": 1 }] }, logs: ["Program failed to complete: custom program error: 0x1"], unitsConsumed: 150 } }` |

**SolanaAdapter 기대 결과:**

| 결과 | 기대 에러 | 검증 항목 |
|------|----------|----------|
| throw 또는 `SimulationResult { success: false }` | `ChainError { code: 'SOLANA_PROGRAM_ERROR', retryable: false }` 또는 실패 결과 | 에러 메시지에 InstructionError 정보 포함 |

**에러 매핑 근거 (31-solana 10.2):** `InstructionError` 또는 `custom program error` -> `SOLANA_PROGRAM_ERROR` (재시도 불가).

---

#### 시나리오 9: 트랜잭션 실행 실패

| 항목 | 내용 |
|------|------|
| **카테고리** | 실패 |
| **상태 관리** | Stateful |
| **대상 메서드** | `getTransactionStatus`, `waitForConfirmation` |

**입력:**

| RPC 메서드 | 파라미터 | Mock 응답 JSON |
|----------|---------|---------------|
| `getSignatureStatuses` | `{ signatures: ["tx-hash-abc"] }` | `{ value: [{ slot: 101, confirmations: null, err: { "InstructionError": [0, "InvalidAccountData"] }, confirmationStatus: "confirmed" }] }` |

**SolanaAdapter 기대 결과:**

| 결과 | 기대 에러 | 검증 항목 |
|------|----------|----------|
| throw | `ChainError { code: 'TRANSACTION_FAILED', chain: 'solana', retryable: false }` | `err.code === ChainErrorCode.TRANSACTION_FAILED` |

**에러 매핑 근거 (31-solana 섹션 5):** `getSignatureStatuses`에서 `err`가 존재하면 `TRANSACTION_FAILED`.

---

#### 시나리오 10: RPC 타임아웃

| 항목 | 내용 |
|------|------|
| **카테고리** | 실패 |
| **상태 관리** | Stateless (delay 활용) |
| **대상 메서드** | `getBalance` (대표 -- 어떤 메서드에든 적용 가능) |

**입력:**

| RPC 메서드 | 파라미터 | Mock 응답 JSON |
|----------|---------|---------------|
| `getBalance` | `(address, { commitment: "confirmed" })` | `delay: 5000` (5초 지연 후 에러 throw) |

**SolanaAdapter 기대 결과:**

| 결과 | 기대 에러 | 검증 항목 |
|------|----------|----------|
| throw | `ChainError { code: 'RPC_ERROR', chain: 'solana', retryable: true }` | `err.code === ChainErrorCode.RPC_ERROR`, `err.retryable === true` |

**에러 매핑 근거 (31-solana 10.1):** RPC timeout -> `RPC_ERROR` (HTTP 503, 재시도 가능).

**테스트 기법:** `jest.setTimeout` 또는 Mock Transport의 `delay` 파라미터를 활용하여 타임아웃 시뮬레이션. SolanaAdapter 내부 타임아웃(설정값)보다 `delay`를 길게 설정한다.

---

#### 시나리오 11: Priority Fee 조회 실패 시 기본값

| 항목 | 내용 |
|------|------|
| **카테고리** | 지연/폴백 |
| **상태 관리** | Stateless |
| **대상 메서드** | `estimateFee` |

**입력:**

| RPC 메서드 | 파라미터 | Mock 응답 JSON |
|----------|---------|---------------|
| `getRecentPrioritizationFees` | 없음 | `error: { code: -32603, message: "Internal error" }` |

**SolanaAdapter 기대 결과:**

| 결과 | 반환값 | 검증 항목 |
|------|--------|----------|
| 성공 (fallback) | `5000n` (base fee만) | `fee === 5000n` -- priority fee = 0으로 폴백 |

**31-solana-adapter 참조 (섹션 9):** `getRecentPrioritizationFees` 실패 시 priority fee를 0으로 폴백하고 base fee(5000 lamports)만 반환.

---

#### 시나리오 12: 확인 대기 타임아웃

| 항목 | 내용 |
|------|------|
| **카테고리** | 지연 |
| **상태 관리** | Stateful (반복 호출, 모두 null 반환) |
| **대상 메서드** | `waitForConfirmation` |

**입력:**

| RPC 메서드 | 파라미터 | Mock 응답 JSON |
|----------|---------|---------------|
| `getSignatureStatuses` (반복) | `{ signatures: ["tx-hash-abc"] }` | `{ value: [null] }` (매 폴링마다 동일) |

**테스트 설정:**

| 항목 | 값 |
|------|-----|
| `timeout` 파라미터 | 5000ms (테스트용 단축) |
| 폴링 간격 | 2s (31-solana 설계값) |
| 예상 폴링 횟수 | 2~3회 |

**SolanaAdapter 기대 결과:**

| 결과 | 기대 에러 | 검증 항목 |
|------|----------|----------|
| throw | `ChainError { code: 'TRANSACTION_FAILED', message: '확인 대기 시간 초과' }` 또는 timeout 관련 에러 | 타임아웃 이후 에러 throw, `mockTransport.calls.length >= 2` (폴링 시도 확인) |

**31-solana-adapter 참조 (섹션 8):** 폴링 간격 2초, 최대 타임아웃 설정값까지 반복 후 에러.

---

#### 시나리오 13: 이미 처리된 트랜잭션 (중복 제출)

| 항목 | 내용 |
|------|------|
| **카테고리** | 중복 |
| **상태 관리** | Stateless |
| **대상 메서드** | `submitTransaction` |

**입력:**

| RPC 메서드 | 파라미터 | Mock 응답 JSON |
|----------|---------|---------------|
| `sendTransaction` | `(base64 encoded signed tx)` | `error: { code: -32002, message: "Transaction already processed" }` |

**SolanaAdapter 기대 결과:**

| 결과 | 기대 에러 | 검증 항목 |
|------|----------|----------|
| throw | `ChainError { code: 'TRANSACTION_FAILED', message: '이미 처리된 트랜잭션', retryable: false }` | `err.code === ChainErrorCode.TRANSACTION_FAILED`, txHash 추출 가능 여부 확인 |

**에러 매핑 근거 (31-solana 섹션 7.2):** `AlreadyProcessed` -> `TRANSACTION_FAILED` (재시도 불가, 하지만 txHash를 반환하여 상태 조회 가능).

---

### 2.3 Mock RPC Transport 구현 가이드

#### 2.3.1 팩토리 함수 시그니처

16-RESEARCH.md Pattern 2 기반의 `createMockRpcTransport()` 팩토리 함수를 사용한다.

```typescript
// packages/core/src/testing/mock-rpc-transport.ts
import type { RpcTransport } from '@solana/rpc-transport'

type CannedResponse = {
  method: string
  params?: unknown        // 특정 파라미터 매칭 (생략 시 메서드명만 매칭)
  result: unknown          // 정상 응답 result 값
  error?: {                // 에러 응답 (result 대신 사용)
    code: number
    message: string
  }
  delay?: number           // 응답 지연 시뮬레이션 (ms)
}

interface MockRpcTransportOptions {
  responses: CannedResponse[]
  mode: 'stateless' | 'stateful'
}

interface MockRpcTransportResult extends RpcTransport {
  /** 기록된 RPC 호출 목록. 호출 순서와 파라미터 검증에 사용 */
  calls: Array<{ method: string; params: unknown }>
  /** 호출 기록 초기화 (테스트 간 격리) */
  resetCalls(): void
}

/**
 * Solana Mock RPC Transport.
 *
 * @param options.mode - 'stateless': 메서드명으로 응답 매칭 (Unit)
 *                       'stateful': 큐에서 순차 소비 (E2E/Security)
 * @returns RpcTransport 호환 객체 + 호출 기록 (calls 배열)
 */
export function createMockRpcTransport(
  options: MockRpcTransportOptions
): MockRpcTransportResult
```

#### 2.3.2 Stateless vs Stateful 모드 선택 기준

| 테스트 레벨 | 모드 | 근거 |
|------------|------|------|
| Unit | **Stateless** | 단일 함수 로직만 검증. 메서드명으로 고정 응답 매칭. 호출 순서 무관 |
| Integration | **Stateless** | DB 연동이 목적. RPC 응답은 고정 canned response로 충분 |
| E2E | **Stateful** | 전체 흐름에서 순차적 RPC 호출 시뮬레이션 필요 (시나리오 1의 6단계 등) |
| Security | **Stateless 또는 Stateful** | 시나리오별 판단. 에러 주입은 Stateless, 흐름 공격(예: TOCTOU)은 Stateful |

#### 2.3.3 호출 검증 패턴

```typescript
// 테스트에서 호출 검증 예시
const mockTransport = createMockRpcTransport({
  mode: 'stateful',
  responses: [/* ... */]
})

// SolanaAdapter에 mockTransport를 주입하여 테스트 실행
// ...

// 검증: 호출된 RPC 메서드 순서 확인
expect(mockTransport.calls.map(c => c.method)).toEqual([
  'getHealth',
  'getLatestBlockhash',
  'getRecentPrioritizationFees',
  'simulateTransaction',
  'sendTransaction',
  'getSignatureStatuses'
])

// 검증: 특정 호출의 파라미터 확인
expect(mockTransport.calls[3].method).toBe('simulateTransaction')
```

#### 2.3.4 패키지 위치

```
packages/
  core/
    src/
      testing/
        mock-rpc-transport.ts    # createMockRpcTransport 구현
        index.ts                 # 테스트 유틸리티 re-export
    __tests__/
      contracts/
        chain-adapter.contract.ts  # Contract Test (Phase 14 MOCK-04)
```

**모노레포 공유 전략:** `packages/core/src/testing/`에 배치하여 `@waiaas/core/testing`으로 import. 다른 패키지(daemon, adapter-solana 등)의 테스트에서 공유한다.

### 2.4 시나리오 커버리지 매핑

13개 시나리오가 SolanaAdapter 13개 메서드 중 어떤 것을 커버하는지 크로스 레퍼런스 표이다.

| SolanaAdapter 메서드 | 커버 시나리오 | 커버리지 |
|---------------------|-------------|---------|
| 1. `connect(rpcUrl)` | #1 (성공), #4 (실패) | 성공 + 실패 |
| 2. `disconnect()` | #1 (암묵적) | 간접 |
| 3. `isConnected()` | #1, #4 | 상태 검증 |
| 4. `getHealth()` | #1, #4 (connect 내부) | 간접 (connect에서 호출) |
| 5. `isValidAddress(addr)` | #7 (실패) | 실패 케이스 |
| 6. `getBalance(addr)` | #2 (성공), #10 (타임아웃) | 성공 + 실패 |
| 7. `buildTransaction(req)` | #1 (성공), #5 (선행), #7 (주소 검증) | 성공 + 실패 |
| 8. `simulateTransaction(tx)` | #1 (성공), #5 (잔액 부족), #8 (프로그램 에러) | 성공 + 실패 2종 |
| 9. `signTransaction(tx, key)` | #1 (성공) | 성공 |
| 10. `submitTransaction(signed)` | #1 (성공), #6 (Blockhash 만료), #13 (중복) | 성공 + 실패 2종 |
| 11. `getTransactionStatus(hash)` | #9 (실패) | 실패 |
| 12. `waitForConfirmation(hash, timeout)` | #1 (성공), #9 (실행 실패), #12 (타임아웃) | 성공 + 실패 2종 |
| 13. `estimateFee(req)` | #3 (성공), #11 (폴백) | 성공 + 폴백 |

**커버리지 분석:**
- 13개 메서드 모두 최소 1개 시나리오로 커버됨
- 주요 에러 경로(INSUFFICIENT_BALANCE, BLOCKHASH_EXPIRED, RPC_ERROR, TRANSACTION_FAILED, PROGRAM_ERROR)가 모두 포함
- `disconnect()`는 E2E 흐름에서 암묵적으로 검증 (afterAll에서 호출)

---

## 3. Local Validator E2E 흐름 (CHAIN-03)

### 3.1 전제 조건

모든 Local Validator E2E 흐름은 다음 전제를 공유한다:

| 전제 | 내용 |
|------|------|
| **solana-test-validator** | `localhost:8899`(HTTP) / `localhost:8900`(WS)에서 실행 중 |
| **Health check** | `getHealth` RPC 호출이 `"ok"` 반환 확인 (최대 30초 폴링) |
| **Airdrop** | `beforeAll`에서 테스트 계정에 10 SOL airdrop 완료 |
| **SolanaAdapter** | `network: 'devnet'` 설정 (local validator는 devnet 설정 사용) |
| **테스트 타임아웃** | 60초 (`--testTimeout=60000`) |
| **Jest 설정** | `--runInBand` (순차 실행, nonce 충돌 방지) |

### 3.2 E2E 흐름 상세

#### E2E-1: SOL 전송 전체 흐름

**목적:** 트랜잭션 4단계 파이프라인(build -> simulate -> sign -> submit -> confirm)의 실제 온체인 동작 검증

**예상 시간:** ~10초

```
Given:
  - solana-test-validator 실행 중 (localhost:8899)
  - 테스트 계정 A: airdrop으로 10 SOL 보유
  - 테스트 계정 B: 수신 주소 (미생성 가능)
  - SolanaAdapter 인스턴스 생성 완료

When:
  Step 1 - connect:
    - adapter.connect('http://127.0.0.1:8899')
  Step 2 - buildTransaction:
    - adapter.buildTransaction({
        from: accountA.address,
        to: accountB.address,
        amount: 1_000_000n  // 0.001 SOL
      })
  Step 3 - simulateTransaction:
    - adapter.simulateTransaction(unsignedTx)
  Step 4 - signTransaction:
    - adapter.signTransaction(unsignedTx, accountA.privateKey)
  Step 5 - submitTransaction:
    - adapter.submitTransaction(signedTx)
  Step 6 - waitForConfirmation:
    - adapter.waitForConfirmation(submitResult.txHash, 30_000)

Then:
  Step 1: adapter.isConnected() === true
  Step 2: unsignedTx.chain === 'solana', unsignedTx.expiresAt > now
  Step 3: simResult.success === true
  Step 4: signedTx instanceof Uint8Array, signedTx.length > 0
  Step 5: submitResult.txHash 존재 (Base58 문자열, 길이 > 0)
  Step 6: result.status === 'confirmed' 또는 'finalized'

Cleanup:
  - adapter.disconnect()
```

**검증 항목:**

| 단계 | 검증 | 실패 시 의미 |
|------|------|------------|
| Step 2 | `expiresAt` = now + 50s (31-solana 설계값) | Blockhash 만료 시간 계산 오류 |
| Step 3 | `estimatedFee` > 0 | 수수료 추정 로직 오류 |
| Step 5 | txHash가 Base58 형식 | 서명/인코딩 오류 |
| Step 6 | `confirmationStatus`가 'confirmed' 이상 | 확인 폴링 로직 오류 |

---

#### E2E-2: 잔액 조회 + 수수료 추정

**목적:** Airdrop 후 잔액이 정확히 반영되는지, 수수료 추정이 유효한 값을 반환하는지 검증

**예상 시간:** ~3초

```
Given:
  - solana-test-validator 실행 중
  - 테스트 계정 A: airdrop으로 10 SOL 보유
  - SolanaAdapter 연결 완료

When:
  Step 1 - getBalance:
    - adapter.getBalance(accountA.address)
  Step 2 - estimateFee:
    - adapter.estimateFee({
        from: accountA.address,
        to: accountB.address,
        amount: 1_000_000n
      })

Then:
  Step 1:
    - balance.amount === "10000000000" (10 SOL = 10 * 10^9 lamports)
    - balance.decimals === 9
    - balance.symbol === "SOL"
  Step 2:
    - fee >= 5000n (최소 base fee)
    - typeof fee === 'bigint'
```

**검증 항목:**

| 단계 | 검증 | 실패 시 의미 |
|------|------|------------|
| Step 1 | 금액이 airdrop 금액과 일치 | RPC 응답 파싱 또는 단위 변환 오류 |
| Step 2 | fee >= 5000 (base fee) | 수수료 추정 로직 또는 RPC 호출 오류 |

---

#### E2E-3: 주소 검증

**목적:** 다양한 주소 형식에 대한 `isValidAddress` 검증 (RPC 호출 불필요, 로컬 검증)

**예상 시간:** <1초

```
Given:
  - SolanaAdapter 인스턴스 (connect 불필요)

When:
  Case 1: adapter.isValidAddress(validSolanaAddress)     // 유효한 Base58, 32바이트
  Case 2: adapter.isValidAddress("11111111111111111111111111111111")  // System Program
  Case 3: adapter.isValidAddress("not-valid")             // 잘못된 형식
  Case 4: adapter.isValidAddress("")                      // 빈 문자열
  Case 5: adapter.isValidAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f2bD")  // EVM 주소

Then:
  Case 1: true
  Case 2: true   (System Program은 유효한 Solana 주소)
  Case 3: false
  Case 4: false
  Case 5: false  (EVM 형식은 Solana에서 무효)
```

---

#### E2E-4: 연결 관리

**목적:** connect / isConnected / getHealth / disconnect 생명주기 동작 검증

**예상 시간:** ~2초

```
Given:
  - solana-test-validator 실행 중
  - SolanaAdapter 인스턴스 (미연결 상태)

When:
  Step 1 - 초기 상태:
    - adapter.isConnected()
  Step 2 - connect:
    - adapter.connect('http://127.0.0.1:8899')
  Step 3 - 연결 확인:
    - adapter.isConnected()
  Step 4 - 헬스 체크:
    - adapter.getHealth()
  Step 5 - disconnect:
    - adapter.disconnect()
  Step 6 - 해제 확인:
    - adapter.isConnected()

Then:
  Step 1: false (초기 상태)
  Step 2: 에러 없이 완료
  Step 3: true
  Step 4: { healthy: true, latency: number } (latency > 0, latency < 1000ms)
  Step 5: 에러 없이 완료
  Step 6: false
```

---

#### E2E-5: 에러 복구 (잔액 부족 시뮬레이션)

**목적:** 잔액이 0인 계정에서 트랜잭션 시뮬레이션 시 올바른 에러 매핑 검증

**예상 시간:** ~5초

```
Given:
  - solana-test-validator 실행 중
  - SolanaAdapter 연결 완료
  - 테스트 계정 C: airdrop 없음 (잔액 0)

When:
  Step 1 - buildTransaction (잔액 0인 계정):
    - adapter.buildTransaction({
        from: accountC.address,  // 잔액 0
        to: accountB.address,
        amount: 1_000_000n  // 0.001 SOL
      })
  Step 2 - simulateTransaction:
    - adapter.simulateTransaction(unsignedTx)

Then:
  Step 1: UnsignedTransaction 정상 생성 (빌드 단계는 잔액을 확인하지 않음)
  Step 2: throw ChainError
    - err.code === ChainErrorCode.INSUFFICIENT_BALANCE
      또는 SimulationResult { success: false }
    - 에러 메시지에 'InsufficientFunds' 관련 정보 포함

Cleanup:
  - adapter.disconnect()
```

**검증 항목:**

| 단계 | 검증 | 실패 시 의미 |
|------|------|------------|
| Step 1 | 정상 생성 | buildTransaction이 잔액을 미리 확인하면 설계 위반 |
| Step 2 | INSUFFICIENT_BALANCE 에러 | 에러 매핑 로직 오류 |

### 3.3 E2E 흐름 합계

| 흐름 | 예상 시간 | 핵심 검증 |
|------|----------|----------|
| E2E-1 SOL 전송 전체 | ~10s | 4단계 파이프라인 온체인 동작 |
| E2E-2 잔액 + 수수료 | ~3s | RPC 응답 파싱, 단위 변환 |
| E2E-3 주소 검증 | <1s | Base58 클라이언트 검증 |
| E2E-4 연결 관리 | ~2s | connect/disconnect 생명주기 |
| E2E-5 에러 복구 | ~5s | 에러 매핑 정확성 |
| **합계** | **~21초** | Phase 14 목표 "전체 <10min" 충족 |

### 3.4 CI 실행 가이드

#### solana-test-validator 시작/종료 스크립트

```bash
#!/bin/bash
# scripts/start-test-validator.sh

# 기존 프로세스 정리
pkill -f solana-test-validator 2>/dev/null || true

# validator 시작 (백그라운드)
solana-test-validator \
  --reset \
  --quiet \
  --rpc-port 8899 \
  --no-bpf-jit \
  &

VALIDATOR_PID=$!
echo "Validator PID: $VALIDATOR_PID"

# Health check 폴링 (최대 30초)
for i in $(seq 1 30); do
  if curl -s http://127.0.0.1:8899 \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
    | grep -q '"ok"'; then
    echo "Validator ready (${i}s)"
    exit 0
  fi
  sleep 1
done

echo "Validator failed to start within 30s"
kill $VALIDATOR_PID 2>/dev/null
exit 1
```

```bash
#!/bin/bash
# scripts/stop-test-validator.sh
pkill -f solana-test-validator 2>/dev/null || true
```

#### Jest 설정 (Chain Integration)

```typescript
// jest.config.chain.ts
export default {
  testMatch: ['**/__tests__/chain-integration/**/*.test.ts'],
  testTimeout: 60_000,
  maxWorkers: 1,  // --runInBand 동등
  globalSetup: './scripts/start-test-validator.ts',
  globalTeardown: './scripts/stop-test-validator.ts',
}
```

#### beforeAll / afterAll 패턴

```typescript
describe('SolanaAdapter Chain Integration', () => {
  let adapter: SolanaAdapter

  beforeAll(async () => {
    adapter = new SolanaAdapter({ network: 'devnet', rpcUrl: 'http://127.0.0.1:8899' })
    await adapter.connect('http://127.0.0.1:8899')

    // Airdrop 10 SOL to test account
    const rpc = createSolanaRpc('http://127.0.0.1:8899')
    await rpc.requestAirdrop(testAddress, lamports(10_000_000_000n)).send()
    // Local validator는 즉시 처리되므로 별도 확인 대기 불필요
  })

  afterAll(async () => {
    await adapter.disconnect()
  })

  // E2E-1 ~ E2E-5 테스트 케이스
})
```

### 3.5 Devnet 역할

#### 테스트 제한

Devnet 테스트는 **최대 2~3건**으로 제한한다. 네트워크 불안정에 의한 CI 실패를 최소화하기 위함이다.

| # | Devnet 테스트 | 목적 | Local Validator와 차이 |
|---|-------------|------|---------------------|
| 1 | SOL 전송 + 확인 | 실제 네트워크 호환성 | 네트워크 레이턴시, 실제 블록 생성 |
| 2 | 잔액 조회 | RPC 응답 형식 호환 | 공용 RPC 응답 형식 차이 감지 |
| 3 | 헬스 체크 | RPC 엔드포인트 가용성 | 공용 RPC 가용 여부 |

#### Rate Limit 대응

| 설정 | 값 | 근거 |
|------|-----|------|
| Jest 실행 모드 | `--runInBand` | 순차 실행으로 동시 RPC 호출 방지 |
| 재시도 횟수 | 최대 3회 | Airdrop 실패, RPC 429 대응 |
| 재시도 간격 | 2초 | Solana Devnet rate limit (~40 req/s) 준수 |
| FLAKY 마킹 | `@flaky` 어노테이션 | 네트워크 불안정 허용, CI 실패 시 자동 재시도 |

#### Airdrop 전략 상세

| 환경 | 시점 | 방법 | SOL 양 | 재시도 | 근거 |
|------|------|------|--------|--------|------|
| Local Validator | `beforeAll` 1회 | `requestAirdrop` via `@solana/kit` | 10 SOL | 불필요 (로컬) | genesis에 1000 SOL. 한 번에 대량 할당 |
| Devnet | 테스트별 `beforeEach` | `requestAirdrop` via `@solana/kit` | 2 SOL | 최대 3회, 2초 간격 | Devnet rate limit 대응. 필요 최소량 사용 |

---

## 4. EVM Adapter Stub 테스트 범위 (CHAIN-04)

### 4.1 EvmAdapterStub 테스트 5항목

EvmAdapterStub(36-killswitch-autostop-evm.md 섹션 10)은 IChainAdapter 인터페이스를 준수하되 대부분의 메서드가 `CHAIN_NOT_SUPPORTED`를 throw하는 스텁 구현이다. 테스트 범위는 5개 항목으로 구성된다.

#### 항목 1: IChainAdapter 타입 준수 (빌드타임)

| 항목 | 내용 |
|------|------|
| **테스트 레벨** | 빌드타임 (`tsc --noEmit`) |
| **검증 방법** | `EvmAdapterStub implements IChainAdapter` 선언이 TypeScript 컴파일을 통과 |
| **기대 결과** | 컴파일 에러 없음 (13개 메서드 시그니처 모두 일치) |
| **실패 시 의미** | IChainAdapter 인터페이스 변경 시 EvmAdapterStub도 업데이트 필요 |

**검증 코드:**

```typescript
// 별도 테스트 파일 불필요 -- tsc --noEmit에서 자동 검증
// packages/adapter-evm/src/evm-adapter-stub.ts
import type { IChainAdapter } from '@waiaas/core'

class EvmAdapterStub implements IChainAdapter {
  // ... (모든 메서드 구현)
}

// tsc --noEmit 실행 시 시그니처 불일치가 있으면 컴파일 에러 발생
```

#### 항목 2: isConnected() 반환값 (Unit)

| 항목 | 내용 |
|------|------|
| **테스트 레벨** | Unit |
| **검증 방법** | `new EvmAdapterStub('mainnet').isConnected()` 호출 |
| **기대 결과** | `false` 반환 (throw 하지 않음) |
| **파일 위치** | `packages/adapter-evm/__tests__/unit/evm-adapter-stub.test.ts` |

```typescript
test('isConnected()는 항상 false를 반환해야 한다', () => {
  const stub = new EvmAdapterStub('mainnet')
  expect(stub.isConnected()).toBe(false)
})
```

**36-killswitch-autostop-evm 참조 (섹션 10.4):** `isConnected()`와 `getHealth()`는 예외적으로 throw하지 않는다. 어댑터 상태 조회 시 크래시를 방지하기 위함.

#### 항목 3: getHealth() 반환값 (Unit)

| 항목 | 내용 |
|------|------|
| **테스트 레벨** | Unit |
| **검증 방법** | `new EvmAdapterStub('mainnet').getHealth()` 호출 |
| **기대 결과** | `{ healthy: false, latency: -1 }` 반환 (throw 하지 않음) |
| **파일 위치** | `packages/adapter-evm/__tests__/unit/evm-adapter-stub.test.ts` |

```typescript
test('getHealth()는 { healthy: false, latency: -1 }을 반환해야 한다', async () => {
  const stub = new EvmAdapterStub('mainnet')
  const health = await stub.getHealth()
  expect(health).toEqual({ healthy: false, latency: -1 })
})
```

#### 항목 4: 11개 메서드 CHAIN_NOT_SUPPORTED throw (Unit)

| 항목 | 내용 |
|------|------|
| **테스트 레벨** | Unit |
| **검증 방법** | 11개 메서드 각각 호출 후 `ChainError { code: 'CHAIN_NOT_SUPPORTED' }` throw 확인 |
| **기대 결과** | 모든 11개 메서드가 동일한 에러를 throw |
| **파일 위치** | `packages/adapter-evm/__tests__/unit/evm-adapter-stub.test.ts` |

**대상 메서드 11개** (isConnected, getHealth 제외):

| # | 메서드 | 테스트 호출 | 기대 에러 |
|---|--------|-----------|----------|
| 1 | `connect(rpcUrl)` | `stub.connect('http://localhost:8545')` | `ChainError { code: 'CHAIN_NOT_SUPPORTED' }` |
| 2 | `disconnect()` | `stub.disconnect()` | `ChainError { code: 'CHAIN_NOT_SUPPORTED' }` |
| 3 | `isValidAddress(addr)` | `stub.isValidAddress('0x...')` | `ChainError { code: 'CHAIN_NOT_SUPPORTED' }` |
| 4 | `getBalance(addr)` | `stub.getBalance('0x...')` | `ChainError { code: 'CHAIN_NOT_SUPPORTED' }` |
| 5 | `buildTransaction(req)` | `stub.buildTransaction({...})` | `ChainError { code: 'CHAIN_NOT_SUPPORTED' }` |
| 6 | `simulateTransaction(tx)` | `stub.simulateTransaction({...})` | `ChainError { code: 'CHAIN_NOT_SUPPORTED' }` |
| 7 | `signTransaction(tx, key)` | `stub.signTransaction({...}, key)` | `ChainError { code: 'CHAIN_NOT_SUPPORTED' }` |
| 8 | `submitTransaction(signed)` | `stub.submitTransaction(new Uint8Array())` | `ChainError { code: 'CHAIN_NOT_SUPPORTED' }` |
| 9 | `getTransactionStatus(hash)` | `stub.getTransactionStatus('0x...')` | `ChainError { code: 'CHAIN_NOT_SUPPORTED' }` |
| 10 | `waitForConfirmation(hash)` | `stub.waitForConfirmation('0x...')` | `ChainError { code: 'CHAIN_NOT_SUPPORTED' }` |
| 11 | `estimateFee(req)` | `stub.estimateFee({...})` | `ChainError { code: 'CHAIN_NOT_SUPPORTED' }` |

```typescript
// 루프 기반 테스트 (DRY)
const throwingMethods = [
  ['connect', ['http://localhost:8545']],
  ['disconnect', []],
  ['isValidAddress', ['0x742d35Cc6634C0532925a3b844Bc9e7595f2bD']],
  ['getBalance', ['0x742d35Cc6634C0532925a3b844Bc9e7595f2bD']],
  ['buildTransaction', [{ from: '0x...', to: '0x...', amount: 1n }]],
  ['simulateTransaction', [{}]],
  ['signTransaction', [{}, new Uint8Array(32)]],
  ['submitTransaction', [new Uint8Array(0)]],
  ['getTransactionStatus', ['0x123']],
  ['waitForConfirmation', ['0x123']],
  ['estimateFee', [{ from: '0x...', to: '0x...', amount: 1n }]],
] as const

test.each(throwingMethods)(
  '%s()는 CHAIN_NOT_SUPPORTED를 throw해야 한다',
  async (method, args) => {
    const stub = new EvmAdapterStub('mainnet')
    await expect(
      (stub as any)[method](...args)
    ).rejects.toMatchObject({
      code: ChainErrorCode.CHAIN_NOT_SUPPORTED,
    })
  }
)
```

#### 항목 5: AdapterRegistry 등록/조회 (Unit)

| 항목 | 내용 |
|------|------|
| **테스트 레벨** | Unit |
| **검증 방법** | AdapterRegistry에 EvmAdapterStub을 등록 후 `registry.get('ethereum')` 호출 |
| **기대 결과** | EvmAdapterStub 인스턴스 반환, `stub.chain === 'ethereum'` |
| **파일 위치** | `packages/daemon/__tests__/unit/adapter-registry.test.ts` |

```typescript
test('AdapterRegistry에서 ethereum 어댑터를 조회할 수 있어야 한다', () => {
  const registry = new AdapterRegistry()
  registry.register('ethereum', {
    factory: (network) => new EvmAdapterStub(network),
    supportedNetworks: ['mainnet', 'sepolia'],
  })

  const adapter = registry.get('ethereum', 'mainnet')
  expect(adapter).toBeInstanceOf(EvmAdapterStub)
  expect(adapter.chain).toBe('ethereum')
  expect(adapter.network).toBe('mainnet')
})
```

### 4.2 Contract Test 적용 가이드

Phase 14(MOCK-04)에서 확정한 CONTRACT-TEST-FACTORY-PATTERN에 따라, EvmAdapterStub에도 `chainAdapterContractTests`를 실행한다.

```typescript
// packages/adapter-evm/__tests__/contracts/evm-adapter-stub.contract.test.ts
import { chainAdapterContractTests } from '@waiaas/core/__tests__/contracts/chain-adapter.contract'
import { EvmAdapterStub } from '../../src/evm-adapter-stub'

chainAdapterContractTests(
  () => new EvmAdapterStub('mainnet'),
  {
    skipNetworkTests: true,  // 네트워크 의존 테스트 건너뜀
    // rpcUrl 불필요 (skipNetworkTests: true)
    // validAddress/privateKey 불필요 (대부분 CHAIN_NOT_SUPPORTED throw)
  }
)
```

**Contract Test 실행 결과 예상:**

| Contract Test 케이스 | EvmAdapterStub 결과 | 설명 |
|--------------------|-------------------|------|
| `chain`이 유효한 ChainType | PASS | `'ethereum'` 반환 |
| `network`가 유효한 NetworkType | PASS | `'mainnet'` 반환 |
| connect 전 isConnected는 false | PASS | `false` 반환 |
| connect 후 isConnected는 true | **SKIP** (skipNetworkTests) | - |
| getHealth는 healthy와 latency 반환 | PASS | `{ healthy: false, latency: -1 }` |
| isValidAddress는 boolean 반환 | **FAIL** (CHAIN_NOT_SUPPORTED throw) | **예상된 실패** |
| 나머지 메서드 | **FAIL** (CHAIN_NOT_SUPPORTED throw) | **예상된 실패** |

**중요:** Contract Test에서 EvmAdapterStub의 대부분 메서드는 CHAIN_NOT_SUPPORTED를 throw하므로 FAIL이 **정상 동작**이다. Contract Test의 목적은 "Mock과 실제 구현의 일치 보장"이므로, EvmAdapterStub은 Contract Test의 주 대상이 아니다. 향후 v0.3에서 EvmAdapter 본구현이 되면 Contract Test가 PASS해야 한다.

**테스트 전략 권고:** EvmAdapterStub에 대해서는 항목 1~5의 전용 Unit 테스트가 주 검증 수단이며, Contract Test는 "인터페이스 구조 호환성" 확인 용도로 보조적으로 실행한다. `skipNetworkTests: true`로 네트워크 의존 케이스를 건너뛰고, 나머지 CHAIN_NOT_SUPPORTED throw는 `expect.toThrow`로 래핑하여 expected failure로 처리한다.

---

## 5. 요구사항 충족 매트릭스

### 5.1 CHAIN-01 ~ CHAIN-04 충족 추적

| 요구사항 | 설명 | 충족 섹션 | 검증 기준 |
|---------|------|-----------|----------|
| **CHAIN-01** | Solana 3단계 환경별 실행 범위와 시나리오 구분 | 섹션 1 (1.1 환경 요약, 1.3 역할 분담 매트릭스) | 3단계 환경 표 존재, 환경별 검증 항목 구분 |
| **CHAIN-02** | Mock RPC 13개 시나리오 입력-출력 명세 | 섹션 2 (2.2 시나리오 상세, 2.4 커버리지 매핑) | 13개 시나리오 각각에 RPC 메서드/응답/기대 결과 |
| **CHAIN-03** | Local Validator E2E 5개 흐름 단계별 정의 | 섹션 3 (3.2 E2E 흐름 상세, 3.4 CI 실행 가이드) | 5개 흐름의 Given-When-Then + CI 스크립트 |
| **CHAIN-04** | EvmAdapterStub 테스트 범위 정의 | 섹션 4 (4.1 테스트 5항목, 4.2 Contract Test 적용) | 5개 검증 항목 + Contract Test 가이드 |

### 5.2 Phase 14 결정 정합성 체크리스트

| Phase 14 결정 | 본 문서 적용 | 정합 |
|--------------|------------|------|
| TLVL-01: Unit 매커밋 | Mock RPC Level 1을 Unit에 적용, 매 커밋 실행 | O |
| TLVL-01: Integration 매PR | Mock RPC Level 1을 Integration에 적용, 매 PR 실행 | O |
| TLVL-01: E2E 매PR | Mock RPC Level 1(Stateful)을 E2E에 적용, 매 PR 실행 | O |
| TLVL-01: Chain Integration nightly/릴리스 | Level 2/3을 Chain Integration에 적용, nightly/릴리스 실행 | O |
| TLVL-01: Security 매PR | Mock RPC Level 1을 Security에 적용, 매 PR 실행 | O |
| MOCK-01: Unit은 MockChainAdapter (canned) | Level 1 Stateless 모드 = canned responses | O |
| MOCK-01: E2E는 MockChainAdapter (시나리오) | Level 1 Stateful 모드 = 시나리오 큐 | O |
| MOCK-01: Chain Integration은 실제 노드 | Level 2 Local Validator + Level 3 Devnet | O |
| MOCK-04: CONTRACT-TEST-FACTORY-PATTERN | 섹션 4.2에서 chainAdapterContractTests(factory, options) 적용 | O |
| Chain Integration Jest 설정 | `--runInBand --testTimeout=60000` (섹션 3.4) | O |

### 5.3 Phase 15 보안 시나리오 교차 참조

| Phase 15 시나리오 | 본 문서 관련 항목 | 충돌 여부 |
|-----------------|----------------|----------|
| SEC-05-T06: Blockhash 만료 경계 (50초) | 시나리오 #6, E2E-1의 expiresAt 검증 | 충돌 없음 -- 동일 경계값(50초) 사용 |
| SEC-05 금액 경계 (INSTANT/NOTIFY/DELAY/APPROVAL) | 시나리오 #5 (잔액 부족), E2E-5 (에러 복구) | 충돌 없음 -- 금액 경계는 PolicyEngine 레벨, 본 문서는 ChainAdapter 레벨 |
| SEC-01 세션 인증 공격 | 직접 관련 없음 (Layer 1은 블록체인 독립) | N/A |
| SEC-02 정책 우회 TOCTOU | Mock RPC에서 정책 검증은 범위 밖 | N/A |
| SEC-03 Kill Switch 캐스케이드 | EvmAdapterStub의 CHAIN_NOT_SUPPORTED는 Kill Switch에서도 안전 | 충돌 없음 |
| SEC-04 키스토어 보안 | 블록체인 테스트와 독립 (키스토어는 서명 단계에서만 관여) | N/A |

---

## 6. 구현 가이드 요약

### 6.1 Mock RPC Transport

| 항목 | 내용 |
|------|------|
| **패키지 위치** | `packages/core/src/testing/mock-rpc-transport.ts` |
| **의존성** | `@solana/rpc-transport` (타입만 -- `RpcTransport`) |
| **Export** | `@waiaas/core/testing` |
| **모드** | Stateless (Unit/Integration) / Stateful (E2E/Security) |
| **호출 검증** | `mockTransport.calls` 배열로 메서드/파라미터 검증 |

### 6.2 Local Validator 셋업

| 항목 | 내용 |
|------|------|
| **바이너리** | `solana-test-validator` (Solana CLI suite) |
| **시작 플래그** | `--reset --quiet --rpc-port 8899 --no-bpf-jit` |
| **Health check** | `getHealth` RPC 폴링 (최대 30초, 1초 간격) |
| **종료** | `pkill -f solana-test-validator` |
| **CI 스크립트 위치** | `scripts/start-test-validator.sh`, `scripts/stop-test-validator.sh` |
| **Jest 설정** | `jest.config.chain.ts` (globalSetup/globalTeardown) |

### 6.3 Devnet 테스트 제한 사항

| 항목 | 내용 |
|------|------|
| **최대 테스트 수** | 2~3건 (SOL 전송 + 잔액 + 헬스) |
| **실행 빈도** | nightly/릴리스 |
| **Rate Limit** | `--runInBand`, 재시도 3회 (2초 간격) |
| **네트워크 불안정** | `@flaky` 마킹, CI 재시도 허용 |
| **RPC URL** | Solana 공용 Devnet RPC (`https://api.devnet.solana.com`) |

### 6.4 EvmAdapterStub 테스트 파일 위치

| 테스트 | 파일 경로 |
|--------|----------|
| Unit (5항목) | `packages/adapter-evm/__tests__/unit/evm-adapter-stub.test.ts` |
| Contract Test | `packages/adapter-evm/__tests__/contracts/evm-adapter-stub.contract.test.ts` |
| 타입 검증 | `tsc --noEmit` (빌드 파이프라인에 포함) |
| AdapterRegistry | `packages/daemon/__tests__/unit/adapter-registry.test.ts` |
