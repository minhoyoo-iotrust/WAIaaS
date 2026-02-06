# IBlockchainAdapter -> IChainAdapter 인터페이스 대응표

**문서 ID:** MAPPING-01
**작성일:** 2026-02-06
**상태:** 완료
**참조:** ARCH-05 (12-multichain-extension.md), CORE-04 (27-chain-adapter-interface.md)
**요구사항:** LEGACY-06 (H1 인터페이스명 업데이트), LEGACY-07 (H10 Squads 메서드 정리)

---

## 1. 개요

### 1.1 목적

v0.1의 `IBlockchainAdapter` 인터페이스(ARCH-05)와 v0.2의 `IChainAdapter` 인터페이스(CORE-04)의 대응 관계를 명확히 정의한다. 이 문서는 구현자가 v0.1 문서를 참조할 때 v0.2 용어로 올바르게 변환할 수 있도록 돕는다.

### 1.2 핵심 변경 요약

| 항목 | v0.1 (ARCH-05) | v0.2 (CORE-04) | 변경 이유 |
|------|---------------|----------------|-----------|
| 인터페이스 이름 | `IBlockchainAdapter` | `IChainAdapter` | 간결한 명칭 |
| 설계 철학 | Cloud-First + Squads 의존 | Self-Hosted + 로컬 정책 엔진 | Self-Hosted 전환 |
| 스마트 월렛 | Squads Protocol 멀티시그 | **제거** -- 로컬 키스토어 | 온체인 의존 제거 |
| 멤버 관리 | 온체인 멀티시그 멤버 | **제거** -- 단일 Owner 모델 | 단순화 |
| 서명 | KMS 외부 위임 | `signTransaction()` 로컬 | 외부 의존 제거 |
| 헬스 체크 | `boolean` 반환 | `{ healthy, latency }` 반환 | 레이턴시 정보 추가 |

### 1.3 참조 문서

- **v0.1 원본:** [12-multichain-extension.md](./12-multichain-extension.md) (ARCH-05)
- **v0.2 대체:** [27-chain-adapter-interface.md](./27-chain-adapter-interface.md) (CORE-04)

---

## 2. 인터페이스명 변경

```
v0.1: IBlockchainAdapter
            ↓
v0.2: IChainAdapter
```

**변경 근거:**
- "Blockchain"보다 "Chain"이 더 간결
- v0.2 프로젝트 전반에서 `chain` 접두어 사용 (예: `ChainType`, `ChainError`)

---

## 3. 메서드 대응표

### 3.1 체인 식별

| v0.1 (IBlockchainAdapter) | v0.2 (IChainAdapter) | 변경 유형 | 설명 |
|---------------------------|---------------------|-----------|------|
| `getChainId(): string` | `readonly chain: ChainType` | **타입 강화** | 자유 문자열 -> 리터럴 유니온 (`'solana' \| 'ethereum' \| ...`) |
| `getNetwork(): string` | `readonly network: NetworkType` | **타입 강화** | 자유 문자열 -> 리터럴 유니온 |

**구현 시 주의:**
- v0.1에서 `adapter.getChainId()` 호출은 v0.2에서 `adapter.chain` 프로퍼티 접근으로 대체
- v0.2 `ChainType`은 컴파일 타임 타입 체크 지원

### 3.2 지갑 관리 (Squads 관련 -- 모두 제거)

| v0.1 (IBlockchainAdapter) | v0.2 (IChainAdapter) | 변경 유형 | 설명 |
|---------------------------|---------------------|-----------|------|
| `createSmartWallet(ownerKey, agentKey, config)` | **제거** | **삭제** | Squads 멀티시그 의존. 로컬 키스토어로 대체 |
| `addMember(walletAddress, memberKey, permissions)` | **제거** | **삭제** | 온체인 멀티시그 멤버 관리 불필요 |
| `removeMember(walletAddress, memberKey)` | **제거** | **삭제** | 온체인 멀티시그 멤버 관리 불필요 |
| `updateWalletConfig(walletAddress, config)` | **제거** | **삭제** | Squads 설정. 로컬 정책 엔진으로 대체 |

**제거 근거:**
- v0.2 Self-Hosted 모델에서는 Squads Protocol 온체인 멀티시그를 사용하지 않음
- 키 관리: `CORE-03 (26-keystore-spec.md)` -- 로컬 키스토어
- 정책 관리: `LOCK-MECH (33-time-lock-approval-mechanism.md)` -- 로컬 정책 엔진

### 3.3 트랜잭션 처리

| v0.1 (IBlockchainAdapter) | v0.2 (IChainAdapter) | 변경 유형 | 설명 |
|---------------------------|---------------------|-----------|------|
| `buildTransaction(request)` | `buildTransaction(request)` | **유지** | 동일 기능, 타입 일부 변경 |
| `simulateTransaction(tx)` | `simulateTransaction(tx)` | **유지** | 동일 |
| `submitTransaction(signedTx)` | `submitTransaction(signedTx)` | **유지** | 동일 |
| `getTransactionStatus(signature)` | `getTransactionStatus(txHash)` | **파라미터명 변경** | `signature` -> `txHash` (범용화) |
| - | `signTransaction(tx, privateKey)` | **신규** | 로컬 서명 추가 (KMS 대신) |
| - | `waitForConfirmation(txHash, options?)` | **신규** | 확인 대기 (polling) |
| - | `estimateFee(request)` | **신규** | 수수료 추정 독립 메서드 |

**v0.2 4단계 트랜잭션 파이프라인:**
```
[1] buildTransaction()      -> UnsignedTransaction
[2] simulateTransaction()   -> SimulationResult
    *** 정책 엔진 검증 (Phase 8 LOCK-MECH) ***
[3] signTransaction()       -> SignedTransaction (Uint8Array)
[4] submitTransaction()     -> SubmitResult
```

### 3.4 연결 관리 (신규)

| v0.1 (IBlockchainAdapter) | v0.2 (IChainAdapter) | 변경 유형 | 설명 |
|---------------------------|---------------------|-----------|------|
| - | `connect(rpcUrl)` | **신규** | RPC 연결 초기화 |
| - | `disconnect()` | **신규** | 연결 종료 (graceful shutdown) |
| - | `isConnected()` | **신규** | 연결 상태 확인 |

**v0.1 차이점:**
- v0.1은 생성자에서 연결 처리 (`constructor(rpcUrl, ...)`)
- v0.2는 명시적 연결 관리 메서드 제공 (테스트/재연결 용이)

### 3.5 잔액 및 자산 조회

| v0.1 (IBlockchainAdapter) | v0.2 (IChainAdapter) | 변경 유형 | 설명 |
|---------------------------|---------------------|-----------|------|
| `getBalance(address, asset?)` | `getBalance(address)` | **단순화** | 네이티브 토큰 전용. SPL/ERC-20은 v0.3 이연 |
| `getAssets(walletAddress)` | **제거 (v0.3 이연)** | **삭제** | 토큰 목록 조회는 v0.3에서 구현 |

### 3.6 상태 확인

| v0.1 (IBlockchainAdapter) | v0.2 (IChainAdapter) | 변경 유형 | 설명 |
|---------------------------|---------------------|-----------|------|
| `healthCheck(): Promise<boolean>` | `getHealth(): Promise<{ healthy, latency }>` | **응답 확장** | 레이턴시(ms) 정보 추가 |
| `getBlockHeight(): Promise<bigint>` | **제거** | **삭제** | `getHealth()`에서 간접 확인 가능 |
| - | `isValidAddress(address)` | **신규** | 주소 형식 검증 (온체인 조회 없음) |

---

## 4. 타입 대응표

### 4.1 요청/응답 타입

| v0.1 타입 | v0.2 타입 | 변경 내용 |
|-----------|-----------|-----------|
| `WalletConfig` | **제거** | Squads 설정. 로컬 정책으로 대체 |
| `WalletCreationResult` | **제거** | Squads 관련 |
| `MemberPermissions` | **제거** | Squads 멤버 권한 |
| `TransactionRequest` | `TransferRequest` | 명칭 변경, 필드 유지 |
| `UnsignedTransaction` | `UnsignedTransaction` | 구조 변경 (아래 참조) |
| `SignedTransaction` | `Uint8Array` | 단순화 (체인별 직렬화) |
| `SimulationResult` | `SimulationResult` | 동일 구조 |
| `TransactionResult` | `SubmitResult` | 명칭 변경 |
| `TransactionStatus` | `SubmitResult.status` | enum 축소 |
| `Balance` | `BalanceInfo` | 명칭 변경, 필드 유사 |

### 4.2 UnsignedTransaction 구조 비교

**v0.1 (ARCH-05):**
```typescript
interface UnsignedTransaction {
  chainId: string;
  rawTransaction: Uint8Array;
  metadata: TransactionMetadata;
}
```

**v0.2 (CORE-04):**
```typescript
interface UnsignedTransaction {
  chain: ChainType;              // chainId -> chain (타입 강화)
  serialized: Uint8Array;        // rawTransaction -> serialized
  estimatedFee: bigint;          // metadata에서 승격
  expiresAt?: Date;              // metadata에서 승격
  metadata: Record<string, unknown>;  // 체인별 추가 정보
}
```

### 4.3 TransactionStatus 상태 비교

**v0.1:**
```typescript
type TransactionStatus =
  | 'pending'     // 제출됨
  | 'confirmed'   // 확인됨
  | 'finalized'   // 최종 확정
  | 'failed'      // 실패
  | 'expired';    // 만료
```

**v0.2:**
```typescript
// SubmitResult.status
type TransactionStatus = 'submitted' | 'confirmed' | 'finalized';
// 실패/만료는 에러로 처리 (ChainError)
```

---

## 5. 에러 처리 변경

### 5.1 v0.1 vs v0.2 비교

| 항목 | v0.1 | v0.2 |
|------|------|------|
| 에러 타입 | 문자열 에러 | `ChainError` 클래스 |
| 에러 코드 | 없음 | 계층적 코드 (`INVALID_ADDRESS`, `RPC_ERROR` 등) |
| 체인 구분 | 없음 | `SolanaError`, 일반 `ChainError` |

### 5.2 v0.2 ChainError 코드

```typescript
// 공통 ChainError 코드 (CORE-04 정의)
type ChainErrorCode =
  | 'INVALID_ADDRESS'      // 주소 형식 오류
  | 'INSUFFICIENT_BALANCE' // 잔액 부족
  | 'RPC_ERROR'            // RPC 호출 실패
  | 'NETWORK_ERROR'        // 네트워크 도달 불가
  | 'SIMULATION_FAILED'    // 시뮬레이션 실패
  | 'BUILD_FAILED'         // 트랜잭션 빌드 실패
  | 'SIGN_FAILED'          // 서명 실패
  | 'SUBMIT_FAILED'        // 제출 실패
  | 'CHAIN_NOT_SUPPORTED'  // 지원하지 않는 체인
```

---

## 6. 어댑터 구현체 대응

### 6.1 SolanaAdapter

| v0.1 | v0.2 | 변경 |
|------|------|------|
| `@sqds/multisig` | **제거** | Squads 의존 제거 |
| `@solana/web3.js` | `@solana/kit` 3.x | 최신 SDK로 전환 |
| Squads 멀티시그 PDA | - | 로컬 키스토어 |

### 6.2 EVMAdapter

| v0.1 | v0.2 | 변경 |
|------|------|------|
| `ethers.js` | `viem` | 경량 라이브러리로 전환 |
| ERC-4337/Safe | - | v0.3 이연 (현재 stub만 존재) |

---

## 7. 마이그레이션 가이드

### 7.1 v0.1 코드를 v0.2로 변환 시 체크리스트

- [ ] `IBlockchainAdapter` -> `IChainAdapter`로 이름 변경
- [ ] `getChainId()` -> `adapter.chain` 프로퍼티 접근
- [ ] `getNetwork()` -> `adapter.network` 프로퍼티 접근
- [ ] `createSmartWallet()`, `addMember()`, `removeMember()`, `updateWalletConfig()` 호출 제거
- [ ] `healthCheck()` -> `getHealth()` 변경 (반환 타입 `{ healthy, latency }`)
- [ ] `signTransaction()` 메서드 추가 (4단계 파이프라인)
- [ ] `connect()`, `disconnect()` 명시적 연결 관리 추가
- [ ] 에러 처리를 `ChainError` 클래스 기반으로 변경

### 7.2 v0.2 새 기능 활용

1. **4단계 트랜잭션 파이프라인**: 정책 엔진이 simulate 후 sign 전에 개입 가능
2. **로컬 서명**: `signTransaction(tx, privateKey)`로 KMS 없이 로컬 서명
3. **연결 관리**: `connect()`/`disconnect()`로 RPC 연결 명시적 관리
4. **헬스 체크 확장**: `getHealth()`로 레이턴시 모니터링 가능

---

## 8. 참조 문서

### 8.1 내부 문서

| 문서 | 내용 | 상태 |
|------|------|------|
| [12-multichain-extension.md](./12-multichain-extension.md) | v0.1 IBlockchainAdapter 정의 (ARCH-05) | SUPERSEDED |
| [27-chain-adapter-interface.md](./27-chain-adapter-interface.md) | v0.2 IChainAdapter 정의 (CORE-04) | **유효** |
| [31-solana-adapter-detail.md](./31-solana-adapter-detail.md) | v0.2 SolanaAdapter 상세 | **유효** |
| [36-killswitch-autostop-evm.md](./36-killswitch-autostop-evm.md) | v0.2 EVMAdapter Stub | **유효** |

### 8.2 관련 요구사항

| 요구사항 | 설명 |
|---------|------|
| H1 | 인터페이스명 (IBlockchainAdapter vs IChainAdapter) |
| H10 | Squads 메서드(createSmartWallet 등) 정리 |

---

*문서 ID: MAPPING-01*
*작성일: 2026-02-06*
*Phase: 10-v01-잔재-정리*
*상태: 완료*
