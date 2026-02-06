# v0.1 -> v0.2 변경 매핑 문서

**문서 ID:** MAPPING-01
**작성일:** 2026-02-06
**버전:** 1.0
**상태:** 완료

---

## 1. 개요

### 1.1 문서 목적

이 문서는 WAIaaS v0.1(리서치/기획) 설계 문서와 v0.2(Self-Hosted 설계) 설계 문서 간의 대체/계승 관계를 명확히 한다. 구현 단계에서 v0.1의 구식 설계를 참조하는 실수를 방지하기 위함이다.

### 1.2 핵심 변경 요약

v0.1 -> v0.2 전환의 핵심은 **Cloud-First에서 Self-Hosted-First로의 전환**이다.

| 영역 | v0.1 접근 방식 | v0.2 접근 방식 |
|------|---------------|---------------|
| 인프라 | AWS RDS, ElastiCache, KMS, Nitro Enclaves | SQLite + 로컬 키스토어, 단일 프로세스 |
| 데이터베이스 | PostgreSQL + Redis | SQLite + LRU 캐시 |
| API 프레임워크 | Fastify | Hono |
| 인증 | 영구 API Key + RBAC/ABAC | 단기 JWT 세션 토큰 + SIWS/SIWE |
| 키 관리 | AWS KMS + Nitro Enclaves | 로컬 Keystore + sodium-native |
| 정책 엔진 | 온체인 Squads 멀티시그 | 오프체인 로컬 정책 엔진 |
| 에러 코드 | RFC 9457 46개 코드 | 7-domain 36개 코드 |

---

## 2. 문서 대체 관계 매핑

### 2.1 SUPERSEDED 대상 (완전 대체)

아래 v0.1 문서들은 v0.2 문서로 **완전 대체**되었다. 구현 시 반드시 v0.2 문서를 참조해야 한다.

| # | v0.1 문서 | 문서 ID | v0.2 대체 문서 | 대체 문서 ID | 변경 요약 |
|---|-----------|---------|---------------|-------------|-----------|
| 1 | [03-database-caching-strategy.md](./03-database-caching-strategy.md) | TECH-03 | [25-sqlite-schema.md](./25-sqlite-schema.md) | CORE-02 | PostgreSQL+Redis -> SQLite+LRU |
| 2 | [09-system-components.md](./09-system-components.md) | ARCH-02 | [29-api-framework-design.md](./29-api-framework-design.md) | CORE-06 | Fastify -> Hono, 클라우드 컴포넌트 제거 |
| 3 | [10-transaction-flow.md](./10-transaction-flow.md) | ARCH-03 | [32-transaction-pipeline-api.md](./32-transaction-pipeline-api.md) | TX-PIPE | 8단계 -> 6단계, Enclave/Squads 제거 |
| 4 | [18-authentication-model.md](./18-authentication-model.md) | API-02 | [30-session-token-protocol.md](./30-session-token-protocol.md) | SESS-PROTO | API Key -> JWT 세션 토큰 |
| 5 | [19-permission-policy-model.md](./19-permission-policy-model.md) | API-03 | [33-time-lock-approval-mechanism.md](./33-time-lock-approval-mechanism.md) | LOCK-MECH | 4단계 에스컬레이션 -> 4-tier 정책 |
| 6 | [15-agent-lifecycle-management.md](./15-agent-lifecycle-management.md) | REL-03 | [26-keystore-spec.md](./26-keystore-spec.md) | CORE-03 | AWS KMS -> 로컬 Keystore |

### 2.2 PARTIALLY VALID (일부 유효)

아래 v0.1 문서들은 개념적 가치는 유지되나 구체적 구현 방식이 변경되었다.

| # | v0.1 문서 | 문서 ID | 유효 부분 | 대체된 부분 | 참조할 v0.2 문서 |
|---|-----------|---------|----------|------------|-----------------|
| 1 | 08-dual-key-architecture.md | ARCH-01 | Dual Key 개념, Owner/Agent 역할 분리 | Squads 2-of-2 멀티시그 구현 | 33-time-lock-approval-mechanism.md |
| 2 | 11-security-threat-model.md | ARCH-04 | 위협 분류, 방어 원칙 | Enclave/KMS 기반 대응 | 35-notification-architecture.md, 36-killswitch-autostop-evm.md |
| 3 | 13-fund-deposit-process.md | REL-01 | 자금 충전 개념 | Squads Vault -> 에이전트 지갑 직접 전송 | 계획된 v0.3 충전 모델 문서 |
| 4 | 14-fund-withdrawal-process.md | REL-02 | 회수 개념 | Owner Key 서명 -> SIWS/SIWE 서명 | 34-owner-wallet-connection.md |
| 5 | 12-multichain-extension.md | ARCH-05 | 멀티체인 확장 개념 | IBlockchainAdapter 인터페이스 | 27-chain-adapter-interface.md |
| 6 | 20-error-codes.md | API-04 | 에러 핸들링 원칙 | RFC 9457 46개 코드 | 37-rest-api-complete-spec.md |

### 2.3 VALID (여전히 유효)

아래 v0.1 문서들은 리서치/분석 가치를 유지하며 v0.2에서도 참조할 수 있다.

| # | v0.1 문서 | 문서 ID | 유효 이유 |
|---|-----------|---------|----------|
| 1 | 01-tech-stack-decision.md | TECH-01 | 기술 스택 비교 분석 참고 (선택 결과만 v0.2에서 변경) |
| 2 | 02-solana-environment.md | TECH-02 | Solana 개발 환경은 v0.2에서도 동일 |
| 3 | 04-custody-model-comparison.md | CUST-01 | 커스터디 모델 비교 참고 자료 |
| 4 | 05-provider-comparison.md | CUST-02 | 외부 프로바이더 비교 참고 자료 |
| 5 | 06-ai-agent-custody-considerations.md | CUST-03 | AI 에이전트 특화 고려사항 기록 |
| 6 | 07-recommended-custody-model.md | CUST-04 | Self-Custody 선택 근거 |
| 7 | 16-emergency-recovery.md | REL-04 | 비상 회수 개념 (구현 방식만 변경) |
| 8 | 17-multi-agent-management.md | REL-05 | 멀티 에이전트 개념 (구현 방식만 변경) |
| 9 | 21-webhook-events.md | API-05 | Webhook 이벤트 타입 참고 |
| 10 | 22-api-endpoints-summary.md | API-06 | 엔드포인트 개념 참고 (스펙은 v0.2 참조) |
| 11 | 23-phase5-integration-checklist.md | INTG-01 | 통합 체크리스트 참고 |

---

## 3. 상세 대응표

### 3.1 IBlockchainAdapter -> IChainAdapter 변경 대응표

v0.1 `12-multichain-extension.md`의 `IBlockchainAdapter`는 v0.2 `27-chain-adapter-interface.md`의 `IChainAdapter`로 대체되었다.

| v0.1 (IBlockchainAdapter) | v0.2 (IChainAdapter) | 변경 유형 |
|---------------------------|----------------------|-----------|
| `IBlockchainAdapter` | `IChainAdapter` | 이름 변경 |
| `getChainId(): string` | `readonly chain: ChainType` | 타입 강화 |
| `getNetwork(): string` | `readonly network: NetworkType` | 타입 강화 |
| `createSmartWallet()` | **제거** | Squads 의존 제거 |
| `addMember()` | **제거** | 로컬 키스토어로 대체 |
| `removeMember()` | **제거** | 로컬 키스토어로 대체 |
| `updateWalletConfig()` | **제거** | 로컬 정책 엔진으로 대체 |
| - | `signTransaction()` | **신규** 로컬 서명 |
| - | `connect()`, `disconnect()` | **신규** 연결 관리 |
| - | `waitForConfirmation()` | **신규** 확인 대기 |
| - | `estimateFee()` | **신규** 수수료 추정 |
| `healthCheck(): boolean` | `getHealth(): {healthy, latency}` | 응답 확장 |
| `getBalance(address)` | `getBalance(address)` | 유지 |
| `buildTransaction()` | `buildTransferTransaction()` | 이름 명확화 |
| `submitTransaction()` | `submitTransaction()` | 유지 |

### 3.2 RFC 9457 에러 코드 -> v0.2 7-domain 에러 코드 매핑

v0.1 `20-error-codes.md`의 RFC 9457 기반 46개 코드는 v0.2 `37-rest-api-complete-spec.md`의 7-domain 36개 코드로 단순화되었다.

#### 삭제된 코드 (v0.1 only)

| v0.1 코드 | v0.1 HTTP | 삭제 이유 |
|-----------|-----------|----------|
| `SQUADS_THRESHOLD_NOT_MET` | 403 | Squads 미사용 |
| `MULTISIG_TIMEOUT` | 408 | 온체인 멀티시그 미사용 |
| `ENCLAVE_UNAVAILABLE` | 503 | Nitro Enclave 미사용 |
| `KMS_KEY_NOT_FOUND` | 404 | AWS KMS 미사용 |
| `MEMBER_PERMISSION_DENIED` | 403 | Squads 멤버십 미사용 |
| (기타 Squads/Enclave 관련 10개) | - | Self-Hosted 모델에서 불필요 |

#### 변환된 코드

| v0.1 코드 (RFC 9457) | v0.2 코드 (7-domain) | 매핑 근거 |
|---------------------|---------------------|-----------|
| `POLICY_DAILY_LIMIT_EXCEEDED` | `POLICY_001` | 도메인 코드 체계로 전환 |
| `AUTH_TOKEN_EXPIRED` | `AUTH_002` | 영구 API Key -> JWT 세션 만료 |
| `WALLET_NOT_FOUND` | `WALLET_001` | 도메인 분류 유지 |
| `TRANSACTION_SIMULATION_FAILED` | `TX_003` | 축약된 도메인 코드 |
| `RATE_LIMIT_EXCEEDED` | `RATE_001` | 도메인 분류 유지 |

### 3.3 4단계 에스컬레이션 -> 4-tier 정책 대응표

v0.1 `19-permission-policy-model.md`의 4단계 에스컬레이션은 v0.2 `33-time-lock-approval-mechanism.md`의 4-tier 정책으로 재설계되었다.

| v0.1 에스컬레이션 | v0.2 4-tier | 임계값 기준 | 동작 |
|------------------|------------|------------|------|
| Level 1: 경고 (Warning) | NOTIFY (<1 SOL) | 금액 | 즉시 실행 + 알림 발송 |
| Level 2: 제한 (Throttle) | - | - | **v0.2에서 미사용** (세션 제약으로 대체) |
| Level 3: 승인 필요 (Require Approval) | APPROVAL (>=10 SOL) | 금액 | 1시간 타임아웃, Owner 서명 필요 |
| Level 4: 동결 (Freeze) | Kill Switch | 위협 | 캐스케이드 정지, 복구에 dual-auth 필요 |
| - | INSTANT (<0.1 SOL) | 금액 | **v0.2 신규**: 즉시 실행, 알림 없음 |
| - | DELAY (<10 SOL) | 금액 | **v0.2 신규**: 15분 쿨다운 큐잉 |

### 3.4 데이터베이스 스키마 변경

v0.1 `03-database-caching-strategy.md`의 PostgreSQL 스키마는 v0.2 `25-sqlite-schema.md`의 SQLite 스키마로 대체되었다.

| v0.1 테이블 | v0.2 테이블 | 변경 사항 |
|------------|------------|----------|
| `owners` | 제거 | Self-Hosted: 단일 소유자, owner_wallets로 대체 |
| `agents` | `agents` | 구조 단순화, status Enum 변경 |
| `wallets` | `agent_wallets` | Turnkey 참조 제거, 로컬 키스토어 참조 |
| `wallet_policies` | `policies` | JSONB -> TEXT (Zod 직렬화) |
| `transactions` | `transactions` | 상태 Enum 8개 -> 6개 |
| - | `sessions` | **v0.2 신규**: JWT 세션 관리 |
| - | `audit_log` | **v0.2 신규**: 감사 로그 (FK 없음) |

---

## 4. 인터페이스명 변경 요약

| 영역 | v0.1 인터페이스 | v0.2 인터페이스 |
|------|---------------|---------------|
| 체인 어댑터 | `IBlockchainAdapter` | `IChainAdapter` |
| 키 관리 | `IKeyManagementService` | `IKeystore` |
| 정책 엔진 | `IPolicyEngine` | `DatabasePolicyEngine` |
| 트랜잭션 서비스 | `TransactionService` | `TransactionPipeline` |
| 인증 컨텍스트 | `AuthContext` | `SessionContext` |

---

## 5. 구현 가이드

### 5.1 v0.2 우선 참조 원칙

1. **항상 v0.2 문서를 먼저 참조**하라
2. v0.1 문서는 **개념 이해 목적**으로만 참조
3. SUPERSEDED 표기가 있는 문서의 코드 예시를 복사하지 말 것
4. 인터페이스명은 반드시 v0.2 명칭 사용

### 5.2 v0.2 핵심 문서 목록 (구현 시 필수 참조)

| 영역 | 문서 | 문서 ID |
|------|------|---------|
| 데이터 디렉토리 | 24-monorepo-data-directory.md | CORE-01 |
| 데이터베이스 | 25-sqlite-schema.md | CORE-02 |
| 키스토어 | 26-keystore-spec.md | CORE-03 |
| 체인 어댑터 | 27-chain-adapter-interface.md | CORE-04 |
| 데몬 라이프사이클 | 28-daemon-lifecycle-cli.md | CORE-05 |
| API 프레임워크 | 29-api-framework-design.md | CORE-06 |
| 세션 프로토콜 | 30-session-token-protocol.md | SESS-PROTO |
| Solana 어댑터 | 31-solana-adapter-detail.md | CHAIN-SOL |
| 트랜잭션 파이프라인 | 32-transaction-pipeline-api.md | TX-PIPE |
| 시간 잠금/승인 | 33-time-lock-approval-mechanism.md | LOCK-MECH |
| Owner 연결 | 34-owner-wallet-connection.md | OWNR-CONN |
| 알림 | 35-notification-architecture.md | NOTI-ARCH |
| Kill Switch | 36-killswitch-autostop-evm.md | KILL-AUTO-EVM |
| REST API 스펙 | 37-rest-api-complete-spec.md | REST-API |
| SDK/MCP | 38-sdk-mcp-interface.md | SDK-MCP |
| Tauri 데스크톱 | 39-tauri-desktop-architecture.md | TAURI-DESK |
| Telegram Bot | 40-telegram-bot-docker.md | TGBOT-DOCKER |

---

## 6. 버전 이력

| 버전 | 날짜 | 변경 사항 |
|------|------|----------|
| 1.0 | 2026-02-06 | 초기 작성 |

---

*문서 ID: MAPPING-01*
*작성일: 2026-02-06*
*Phase: 10-v01-잔재-정리*
*상태: 완료*
