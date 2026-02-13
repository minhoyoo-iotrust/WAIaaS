# WAIaaS v1.4.5 멀티체인 월렛 환경 모델 설계 -- 연구 요약

**Project:** WAIaaS v1.4.5 (멀티체인 월렛 모델 설계) + v1.4.6 (구현)
**Domain:** Self-hosted AI agent wallet daemon -- 단일 네트워크 바인딩에서 환경 기반 멀티네트워크 모델로 전환
**Researched:** 2026-02-14
**Overall Confidence:** HIGH (62,296 LOC 코드베이스 직접 분석 + 1,467 테스트 + 업계 표준 패턴 크로스 검증)

---

## Executive Summary

WAIaaS는 "1 월렛 = 1 체인 + 1 네트워크" 모델에서 "1 월렛 = 1 체인 + 1 환경(testnet/mainnet)"으로 전환한다. 이 변경은 AI 에이전트가 자연어로 네트워크를 지정하는 UX를 가능하게 하며("Polygon에서 ETH 보내줘"), 동시에 단일 키쌍으로 모든 EVM 체인(또는 Solana 네트워크)에서 트랜잭션을 실행하는 블록체인의 본질적 특성과 일치한다.

핵심 아키텍처 변경은 **네트워크 리졸브 시점의 이동**이다. 현재는 월렛 생성 시 network가 고정되고 모든 후속 작업이 이를 따른다. 새 모델에서는 트랜잭션 요청 시 network를 지정(또는 default_network로 폴백)하여, 파이프라인이 실행 시점에 environment-network 일치를 검증한다. 기술 스택 변경은 불필요하다 -- viem PublicClient는 이미 네트워크별 인스턴스이고, AdapterPool의 `chain:network` 캐시 키가 정확한 추상화이며, DB 마이그레이션은 기존 12-step 패턴을 재사용한다.

가장 중요한 위험은 **환경 격리 실패**(testnet 키로 mainnet 트랜잭션)와 **DB 마이그레이션의 데이터 순서 의존성**이다. 환경 검증을 파이프라인 Stage 1에서 가장 먼저 수행하고, 마이그레이션에서 `transactions.network` 컬럼을 먼저 채운 후 `wallets.network` -> `wallets.environment` 변환을 진행하면 안전하다. 두 가지 모두 검증된 패턴이 있다.

---

## Key Findings

### Recommended Stack

**새 라이브러리 추가 불필요.** 기존 viem 2.x + better-sqlite3 + Drizzle ORM 스택이 환경 모델을 완전히 지원한다.

**핵심 기술 유지:**
- **viem 2.x (^2.45.3)**: PublicClient는 설계적으로 단일 체인. AdapterPool이 이미 per-network 인스턴스 맵 패턴을 올바르게 구현 중. 새 라이브러리 불필요
- **better-sqlite3 12.6.2**: SQLite 3.51.2 번들로 ALTER TABLE RENAME COLUMN 지원. 하지만 CHECK 제약 변경은 12-step 테이블 재생성 필요 (v2, v3 마이그레이션에서 검증된 패턴)
- **Drizzle ORM 0.45.x**: 스키마에서 `network` -> `environment` 필드 변경만으로 충분. DDL은 자체 migrate.ts에서 관리
- **Zod 3.24.x**: 새 EnvironmentType enum 추가 + 환경-네트워크 매핑 함수. 기존 NETWORK_TYPES는 그대로 유지

**명시적으로 추가하지 않을 기술:**
- wagmi / @wagmi/core: 프론트엔드 멀티체인 라이브러리. 서버 사이드에서는 viem PublicClient 맵이 더 가볍고 적합
- chainlist / chains npm: viem/chains가 이미 Tier 1 체인 + testnet 정의 포함
- drizzle-kit migrate: 프로그래매틱 Migration[] 배열이 12-step 같은 복잡한 마이그레이션에 더 적합

**Source confidence:** HIGH (코드베이스 직접 분석 + viem PublicClient Map 패턴 공식 Discussion 확인)

---

### Expected Features

#### Table Stakes (필수)

환경 모델 전환에 필수인 기능. 하나라도 빠지면 하위호환이 깨지거나 사용 불가.

1. **wallets.network -> environment 마이그레이션**: 데이터 모델 전환의 핵심. 기존 월렛이 새 모델에서 동작해야 함. 12-step 재생성 + 데이터 변환 (complexity: High)
2. **트랜잭션 레벨 network 지정**: `POST /v1/transactions/send`에 optional `network` 필드. 미지정 시 `default_network` 폴백 (complexity: Medium)
3. **기본 네트워크(default_network)**: network 미지정 시 폴백. 하위호환 보장의 핵심 (complexity: Low)
4. **환경-네트워크 매핑 함수**: `getNetworksForEnvironment(chain, environment)`, `validateNetworkEnvironment()` (complexity: Low)
5. **transactions.network 컬럼**: 실행된 네트워크를 기록. 감사/추적에 필수 (complexity: Medium -- ADD COLUMN + 기존 레코드 역참조 UPDATE)
6. **Zod SSoT EnvironmentType**: 타입 안전성 보장. Zod -> TypeScript -> DB CHECK 파생 체인 (complexity: Low)

#### Differentiators (차별화)

기본 동작에는 영향 없지만, 환경 모델의 가치를 극대화하는 기능.

1. **ALLOWED_NETWORKS 정책**: 월렛이 사용할 수 있는 네트워크 제한. 보안 강화 (complexity: Medium)
2. **네트워크 스코프 정책**: 네트워크별 차등 정책 (e.g., Polygon에서만 높은 한도). policies에 network 컬럼 추가 (complexity: Medium)
3. **Quickstart 원스톱**: `waiaas quickstart --mode testnet` -> 2 월렛(6 네트워크) 일괄 생성. DX 핵심 개선 (complexity: High)
4. **MCP network 파라미터**: AI 에이전트가 "Polygon에서 ETH 보내줘" 직접 지정 (complexity: Low)
5. **월렛 네트워크 목록 API**: `GET /v1/wallets/:id/networks` -> 사용 가능 네트워크 (complexity: Low)

#### Anti-Features (의도적으로 만들지 않는 기능)

- **환경 간 키 공유**: testnet 키가 mainnet에서 사용되면 보안 위험
- **자동 크로스체인 브리징**: 브리지는 보안 위험 높음 (2024-2025년 $3B+ 해킹). 명시적 CONTRACT_CALL로 사용자가 직접 실행
- **동적 네트워크 추가**: 보안 위험 (악성 RPC 노드). 지원 네트워크는 소스 코드에 하드코딩 (EVM_CHAIN_MAP)

**Source confidence:** HIGH (MetaMask/Dfns/Phantom 공식 문서 + WAIaaS 코드베이스 분석)

---

### Architecture Approach

**핵심 개념: Environment Model**

```
현재 모델:
  Wallet Creation -> network 고정 (e.g., 'ethereum-sepolia')
                  -> 모든 후속 작업이 이 network 사용

환경 모델:
  Wallet Creation -> environment 고정 (e.g., 'testnet' 또는 'mainnet')
                  -> 트랜잭션 요청 시 network 지정 (e.g., 'polygon-amoy')
                  -> AdapterPool.resolve(chain, request.network)
```

**주요 컴포넌트 변경:**

1. **NetworkResolver (신규)**: 트랜잭션 요청에서 network 해결 + environment 교차 검증. 우선순위: request.network > wallet.defaultNetwork > environment 기본값
2. **PipelineContext 확장**: `wallet.network` -> `wallet.environment` + `wallet.network`(리졸브된). Stage 1에서 environment-network 일치를 가장 먼저 검증
3. **PolicyEngine 확장**: `TransactionParam`에 `network` 필드 추가. ALLOWED_NETWORKS 정책 타입(11번째) 추가. 기존 정책의 네트워크 스코프 지정
4. **AdapterPool**: 변경 불필요. 이미 `chain:network` 키로 올바른 캐싱. 호출자만 리졸브된 network를 전달
5. **DB Schema**: `wallets.environment` + `wallets.default_network` + `transactions.network` + `policies.network` (선택적)

**패턴:**

- **Per-Network Adapter Instance**: viem PublicClient는 chain당 하나. AdapterPool이 `${chain}:${network}` 키로 캐싱
- **12-step Table Recreation**: CHECK 제약 변경 시 테이블 재생성. v2, v3 마이그레이션의 검증된 패턴 재사용
- **Zod SSoT Cascade**: EnvironmentType enum -> TypeScript -> DB CHECK -> Drizzle schema -> API validation 순서로 파생

**Anti-Pattern 회피:**

- AdapterPool 구조 변경 금지: 기존 캐시 키가 이미 정확한 추상화
- 단일 마이그레이션에 모든 변경 집중 금지: 논리 단위로 분리 (v6a: ADD COLUMN, v6b: 12-step 재생성)
- 기존 네트워크 값 삭제 금지: `default_network`에 보존하여 하위호환 유지

**Source confidence:** HIGH (62,296 LOC 코드베이스 직접 분석 + 12-step 패턴 v2/v3에서 실전 검증 완료)

---

### Critical Pitfalls

환경 모델 전환의 가장 위험한 함정 5개:

1. **Testnet 키로 Mainnet 트랜잭션 서명 -- 환경 격리 실패 (CRITICAL)**
   - **문제**: environment 모델에서 `testnet` 환경의 지갑이 트랜잭션 요청 시 `network: 'ethereum-mainnet'`을 지정하면, 같은 개인키로 서명되어 실 자금이 이동
   - **회피**: `validateEnvironmentNetwork(environment, network)` 함수를 파이프라인 Stage 1에서 가장 먼저 실행. mainnet 환경은 `*-mainnet` 네트워크만, testnet 환경은 `*-sepolia/*-amoy/devnet/testnet` 네트워크만 허용. AdapterPool.resolve()에서도 이중 검증
   - **Phase**: environment 모델 설계 단계에서 반드시 해결. 구현 첫 번째 단계에서 이 검증부터 작성

2. **DB 마이그레이션 v6 -- CHECK 제약 변경의 12-step 테이블 재생성 위험 (CRITICAL)**
   - **문제**: `wallets.network` -> `wallets.environment` 변환 시 CHECK 제약 변경 필요. SQLite의 12-step 테이블 재생성(CREATE-COPY-RENAME)에서 5개 FK 테이블 모두 재생성 필요. 데이터 변환 로직 오류 시 기존 월렛 정보 유실
   - **회피**: 마이그레이션을 2단계로 분리 (v6a: ADD COLUMN + 데이터 복사, v6b: 12-step 재생성). `transactions.network`를 먼저 채운 후 `wallets.network` 변환. `PRAGMA foreign_key_check` 후 COMMIT. 실제 데이터 시나리오(Solana mainnet + EVM sepolia 혼합)로 round-trip 테스트
   - **Phase**: DB 마이그레이션 설계 단계. 마이그레이션 스크립트 TDD 작성이 최우선

3. **기존 지갑 network 정보의 비가역적 유실 -- 마이그레이션 데이터 변환 순서 오류 (CRITICAL)**
   - **문제**: `transactions` 테이블에 `network` 컬럼이 없고, `wallets.network`를 `environment`로 변환하면 기존 트랜잭션이 어느 네트워크에서 실행됐는지 정보가 영구 유실
   - **회피**: 마이그레이션 순서 엄격 준수. Step 1: `transactions`에 `network` 컬럼 추가 (ALTER TABLE ADD COLUMN). Step 2: `UPDATE transactions SET network = (SELECT network FROM wallets WHERE id = transactions.wallet_id)` -- 기존 wallet.network에서 복사. Step 3: 그 다음에야 `wallets.network` -> `wallets.environment` 변환
   - **Phase**: DB 마이그레이션 구현 단계의 첫 번째 작업. 데이터 보존이 확인된 후에만 스키마 변경 진행

4. **API 하위 호환성 파괴 -- 선택적 network 파라미터의 암묵적 계약 변경 (HIGH)**
   - **문제**: `POST /v1/transactions/send`에 optional `network` 필드 추가 시, 기존 SDK 클라이언트가 network를 보내지 않으면 어떤 network가 기본값인가? 응답의 `network` 필드 의미가 wallet-level에서 transaction-level로 바뀌어 혼란
   - **회피**: `default_network` 전략. wallet에 `default_network`를 저장하고, network 미지정 시 default_network 사용 (기존 동작과 동일). 응답에 `resolvedNetwork` 필드 추가하여 실제 실행된 network 명시. SDK/MCP/Admin 동시 업데이트 필수
   - **Phase**: API 설계 단계. 응답 스키마 변경 전에 하위 호환성 전략 확정

5. **정책 엔진의 네트워크 범위 불일치 -- ALLOWED_TOKENS이 다른 네트워크의 토큰을 허용 (HIGH)**
   - **문제**: 현재 ALLOWED_TOKENS 평가에서 네트워크 구분이 없음. 같은 contract address가 다른 네트워크에서 전혀 다른 컨트랙트일 수 있는데, 한 네트워크에서 허용된 주소가 다른 네트워크에서도 자동 허용됨
   - **회피**: 정책 rules에 `network` 필드 추가. network가 명시되면 해당 네트워크에서만 적용, 미명시면 모든 네트워크에 적용. ALLOWED_NETWORKS 정책 타입 추가 (gate keeper). `TransactionParam`에 `network` 필드 추가하여 현재 어떤 네트워크인지 정책 엔진에 전달
   - **Phase**: 정책 엔진 확장 설계 단계. 새 PolicyType 추가와 기존 정책의 네트워크 범위 지정을 동시에 설계

**Source confidence:** HIGH (코드베이스 직접 분석 + TheCharlatan의 Coin Isolation Bypass 연구 + SQLite 공식 문서)

---

## Implications for Roadmap

환경 모델 전환은 **설계 마일스톤(v1.4.5)과 구현 마일스톤(v1.4.6)으로 분리**를 권장한다.

### v1.4.5 (설계): 멀티체인 월렛 환경 모델 설계

**Rationale:** 62K LOC 시스템의 근본적 데이터 모델 변경은 구현 전에 설계 문서로 확정 필요. 특히 DB 마이그레이션, API 하위 호환성, 정책 엔진 확장의 3가지 고위험 영역은 코드 작성 전에 의사 결정 완료해야 함.

**Delivers:**
- 설계 문서 신규 작성: `docs/68-multichain-environment-model.md` (아키텍처 변경, 데이터 흐름, NetworkResolver)
- 설계 문서 수정: `docs/25-sqlite-schema.md` (wallets.environment), `docs/32-transaction-pipeline-api.md` (Stage 1 변경), `docs/52-auth-model.md` (환경 검증)
- DB 마이그레이션 v6 설계: 12-step 재생성 전략, 데이터 변환 순서, 검증 쿼리
- API 하위 호환성 전략: `default_network` + `resolvedNetwork` 응답 필드
- Zod SSoT EnvironmentType enum 명세

**Avoids:**
- C-02: DB 마이그레이션 v6 설계 오류
- C-03: 데이터 변환 순서 의존성
- H-01: API 하위 호환성 파괴

**Research Flag:** Standard patterns (기존 12-step 패턴 재사용, 새 연구 불필요)

---

### v1.4.6 Phase 1: Core Types + DB Schema

**Rationale:** 타입 시스템을 먼저 변경하여 컴파일러가 영향 범위를 가이드하게 함. DB 스키마가 바뀌어야 모든 후속 기능이 동작 가능.

**Delivers:**
- `@waiaas/core`: EnvironmentType enum, validateEnvironmentNetwork() 함수, 환경-네트워크 매핑 함수
- DB 마이그레이션 v6 구현: wallets.environment, transactions.network, policies.network 컬럼 추가
- DDL pushSchema 업데이트: LATEST_SCHEMA_VERSION 갱신
- Drizzle 스키마 동기화: schema.ts 필드 변경

**Uses:** better-sqlite3 12.6.2 (12-step 패턴), Drizzle ORM (스키마 미러)

**Addresses:** TS-1 (환경 기반 월렛 모델), TS-5 (DB 마이그레이션)

**Avoids:** C-02, C-03 (마이그레이션 안전성)

**Research Flag:** Skip research (검증된 패턴)

---

### v1.4.6 Phase 2: NetworkResolver + Pipeline Integration

**Rationale:** 네트워크 해결 로직이 확정된 후에야 파이프라인과 라우트에서 사용 가능. 환경 격리 검증은 가장 중요한 보안 기능이므로 독립 단계로 분리.

**Delivers:**
- `daemon/infrastructure/network-resolver.ts`: NetworkResolver 클래스 (트랜잭션 요청 -> 실제 네트워크 해결 + 환경 교차 검증)
- `daemon/pipeline/stages.ts`: PipelineContext 확장, Stage 1에 environment-network 검증 추가, transactions.network INSERT
- `daemon/pipeline/database-policy-engine.ts`: TransactionParam에 network 추가, ALLOWED_NETWORKS 평가

**Implements:** Pipeline Stage 1 변경, 정책 엔진 확장

**Addresses:** TS-2 (트랜잭션 레벨 network 지정), TS-3 (ALLOWED_NETWORKS 정책)

**Avoids:** C-01 (환경 격리 실패), H-03 (정책 네트워크 범위)

**Research Flag:** Skip research (파이프라인 로직 확장)

---

### v1.4.6 Phase 3: Route Integration + API 하위 호환성

**Rationale:** NetworkResolver와 파이프라인 변경이 완료된 후 API 라우트에서 사용. 하위 호환성 전략(default_network)이 이 단계의 핵심.

**Delivers:**
- `daemon/api/routes/wallets.ts`: POST /wallets에 environment 파라미터 처리
- `daemon/api/routes/transactions.ts`: POST /transactions/send에 NetworkResolver 통합
- `daemon/api/routes/wallet.ts`: GET /wallet/assets 멀티네트워크 집계 (optional `?network=` 파라미터)
- `daemon/lifecycle/daemon.ts`: executeFromStage5에서 network 리졸브 변경

**Addresses:** TS-4 (멀티 네트워크 잔액 조회), H-01 (API 하위 호환성)

**Avoids:** H-02 (AdapterPool 캐시 키 변경 -- 변경 불필요 확인), M-01 (getAssets 성능 폭발)

**Research Flag:** Skip research (기존 route 패턴 확장)

---

### v1.4.6 Phase 4: SDK + MCP Integration

**Rationale:** REST API가 확정된 후 SDK/MCP 반영. 두 인터페이스는 독립적이므로 병렬 작업 가능.

**Delivers:**
- `@waiaas/sdk`: sendTransaction에 optional network 파라미터
- `@waiaas/mcp`: MCP 도구에 network 파라미터 추가
- Python SDK: send_transaction에 optional network 파라미터
- skill 파일 업데이트: network 선택 가이드 추가

**Addresses:** D-3 (AI 에이전트 네트워크 추론 -- MCP 자연어 네트워크 결정)

**Avoids:** H-05 (MCP 토큰 + 세션의 하위 호환성 -- default_network가 해결)

**Research Flag:** Skip research (SDK/MCP 메서드 확장)

---

### v1.4.6 Phase 5: Quickstart + Admin UI + Tests

**Rationale:** 모든 기능 구현 후 DX 개선과 UI 반영. 통합 테스트가 마지막.

**Delivers:**
- CLI Quickstart: `waiaas quickstart --mode testnet` -> 2 월렛 일괄 생성
- Admin UI: 지갑 상세에서 environment 표시, 네트워크 선택 UI
- 단위 테스트: NetworkResolver, ALLOWED_NETWORKS 정책
- 통합 테스트: 멀티네트워크 파이프라인 E2E
- 마이그레이션 테스트: v6 마이그레이션 검증

**Addresses:** D-1 (Quickstart 원스톱), M-05 (Admin UI 표시 혼란)

**Avoids:** H-04 (1,467 테스트 광범위 실패 -- 타입 시스템으로 컴파일 에러 가이드)

**Research Flag:** Skip research (테스트 확장)

---

### Phase Ordering Rationale

1. **타입 -> 스키마 -> 로직 -> 인터페이스 순서**: 타입 시스템이 먼저 변경되면 컴파일러가 영향 범위를 명확히 보여줌. DB 스키마가 바뀌어야 모든 기능이 동작 가능. NetworkResolver가 확정된 후 파이프라인과 라우트에서 사용. API가 확정된 후 SDK/MCP 반영.
2. **설계와 구현 분리**: 62K LOC 시스템의 근본적 모델 변경은 코드 작성 전에 설계 문서로 확정 필요. DB 마이그레이션, API 하위 호환성, 정책 엔진 확장의 3가지 고위험 영역은 의사 결정 완료 후 구현.
3. **마이그레이션 안전성 최우선**: C-02, C-03의 CRITICAL pitfall을 회피하기 위해 DB 마이그레이션을 Phase 1에서 먼저 완료. 12-step 패턴 TDD 작성 + 실제 데이터 round-trip 테스트.
4. **환경 격리 검증 독립화**: C-01 (testnet/mainnet 격리 실패)은 자금 손실 위험이므로 Phase 2에서 NetworkResolver + 파이프라인 검증을 독립적으로 구현하고 집중 테스트.

---

### Research Flags

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Core Types + DB Schema):** 12-step 패턴은 v2/v3에서 검증 완료. EnvironmentType enum은 CHAIN_TYPES/NETWORK_TYPES와 동일한 Zod SSoT 패턴
- **Phase 2 (NetworkResolver + Pipeline):** 파이프라인 Stage 확장은 기존 6-stage 패턴 따름. 정책 엔진 확장도 기존 10 PolicyType 패턴 재사용
- **Phase 3 (Route Integration):** API 라우트 확장은 기존 42 엔드포인트 패턴과 일관
- **Phase 4 (SDK + MCP):** SDK/MCP 메서드 확장은 기존 인터페이스 패턴 따름
- **Phase 5 (Quickstart + Tests):** CLI 명령 추가는 기존 commander 패턴, 테스트는 기존 1,467 테스트와 동일 프레임워크

**Phases needing deeper research (none):**
- 환경 모델 전환에 새로운 연구 영역 없음. 모든 패턴이 기존 코드베이스 또는 검증된 업계 표준에서 파생

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | 새 라이브러리 추가 불필요. 기존 viem 2.x + better-sqlite3 + Drizzle ORM이 환경 모델을 완전히 지원. 코드베이스 62,296 LOC 직접 분석으로 검증 |
| Features | **HIGH** | Table stakes 6개, Differentiators 5개 모두 업계 표준 패턴과 일치. MetaMask Multichain Accounts, Dfns key-centric model, Phantom 멀티체인 사례로 검증 |
| Architecture | **HIGH** | NetworkResolver + PipelineContext 확장은 기존 6-stage 패턴의 자연스러운 확장. AdapterPool 변경 불필요 (이미 올바른 구현). 12-step 패턴은 v2/v3에서 실전 검증 완료 |
| Pitfalls | **HIGH** | 5개 CRITICAL/HIGH pitfall 모두 구체적 회피 방안 확인. C-01 (환경 격리)은 TheCharlatan 연구 + 하드웨어 지갑 취약점으로 검증. C-02/C-03 (마이그레이션)은 SQLite 공식 문서 + 기존 v2/v3 선례로 검증 |

**Overall confidence:** **HIGH**

---

### Gaps to Address

환경 모델 전환에서 연구가 불완전하거나 구현 중 검증이 필요한 영역:

1. **viem PublicClient 메모리 사용량 실측**: 13개 동시 연결 시 50-130MB 추가 메모리 추정은 경험적 추론. Phase 2 구현 시 실제 메모리 프로파일링으로 AdapterPool maxSize 튜닝 필요 (M-02 회피)
   - **구현 중 대응**: 개발 환경에서 13개 네트워크 동시 연결 후 메모리 모니터링. maxSize 기본값 8로 시작, 필요시 조정

2. **getAssets N-way RPC 호출 성능 실측**: 6 네트워크 x 10 토큰 = 60 RPC 호출의 실제 응답 시간이 QuickNode 벤치마크(200-500ms)와 일치하는지 검증 필요 (M-01)
   - **구현 중 대응**: 단일 네트워크 조회를 기본 동작으로 유지 (하위호환). 멀티네트워크 조회는 `?networks=all` opt-in. Phase 3에서 실제 RPC 타이밍 측정 후 캐싱 전략 튜닝

3. **기존 1,467 테스트의 영향 범위**: `wallet.network` 참조 42건이 모두 타입 에러로 나타나는지, 일부는 런타임 오류로 발견되는지 불확실 (H-04)
   - **구현 중 대응**: Phase 1에서 EnvironmentType 타입 변경 후 전체 테스트 실행. 컴파일 에러로 나타나지 않는 곳은 grep으로 전수 검사

4. **Solana testnet 환경의 devnet vs testnet 기본값**: devnet을 기본으로 할지 testnet을 기본으로 할지 사용자 설문 필요 (M-08)
   - **구현 중 대응**: devnet을 기본으로 시작 (Solana 공식 문서가 devnet 우선 언급). v1.4.6 후 사용자 피드백으로 조정 가능

---

## Sources

### Primary (HIGH confidence)

**코드베이스 직접 분석:**
- `packages/daemon/src/infrastructure/database/schema.ts` -- 10 테이블 스키마
- `packages/daemon/src/infrastructure/database/migrate.ts` -- v2-v5 마이그레이션 (12-step 패턴)
- `packages/daemon/src/infrastructure/adapter-pool.ts` -- AdapterPool 구현 (cacheKey, resolve)
- `packages/daemon/src/pipeline/pipeline.ts` -- 6-stage 파이프라인
- `packages/daemon/src/pipeline/database-policy-engine.ts` -- 정책 엔진 1007라인
- `packages/daemon/src/api/routes/transactions.ts` -- POST /v1/transactions/send
- `packages/core/src/enums/chain.ts` -- NETWORK_TYPES 13개
- `packages/adapters/evm/src/evm-chain-map.ts` -- EVM 10 네트워크 매핑

**공식 문서:**
- [SQLite ALTER TABLE 공식 문서](https://www.sqlite.org/lang_altertable.html) -- 12-step 테이블 재생성, CHECK 제약 제한사항
- [viem Chains documentation](https://viem.sh/docs/chains/introduction) -- viem/chains 내장 정의
- [viem Discussion #986: PublicClient Map pattern](https://github.com/wevm/viem/discussions/986) -- 네트워크별 PublicClient 인스턴스 패턴
- [Drizzle ORM Custom Migrations](https://orm.drizzle.team/docs/kit-custom-migrations) -- 수동 마이그레이션 패턴

### Secondary (MEDIUM-HIGH confidence)

**업계 표준 패턴:**
- [MetaMask Multichain Accounts](https://metamask.io/news/multichain-accounts) -- 계정 모델 리아키텍처, 런타임 네트워크 선택
- [Dfns Multichain Wallets](https://www.dfns.co/article/introducing-multichain-wallets) -- key-centric 모델
- [Phantom Multichain](https://phantom.com/learn/blog/introducing-phantom-multichain) -- 자동 멀티체인 주소 생성
- [Zerion Multichain Portfolio APIs Guide 2026](https://zerion.io/blog/best-multichain-portfolio-apis-2026-guide/) -- 단일 API 호출 멀티체인 잔액 집계

**보안 연구:**
- [Hardware Wallet Coin Isolation Bypass](https://thecharlatan.ch/Coin-Isolation/) -- testnet/mainnet 격리 취약점 (Ledger/Trezor/KeepKey)

**성능 최적화:**
- [QuickNode RPC 효율성 가이드](https://www.quicknode.com/guides/quicknode-products/apis/guide-to-efficient-rpc-requests) -- 병렬 vs 배치 요청, rate limiting
- [Chainstack Multicall vs HTTP Batch 비교](https://docs.chainstack.com/docs/http-batch-request-vs-multicall-contract) -- EVM Multicall3 최적화

**API 하위 호환성:**
- [Zalando REST API Guidelines - Compatibility](https://github.com/zalando/restful-api-guidelines/blob/main/chapters/compatibility.adoc) -- breaking change 정의

### Tertiary (MEDIUM confidence, WebSearch)

- [Magic.link multichain documentation](https://magic.link/docs/blockchains/multichain) -- 서버 사이드 멀티체인 패턴 (정확한 일치 없음)
- [Wepin multi-chain blog](https://www.wepin.io/en/blog/evm-non-evm-multi-chain) -- 환경 기반 월렛 그루핑 (간접 참조)
- [Coinbase Wallet API v2](https://www.coinbase.com/developer-platform/products/wallet-sdk) -- chainId 트랜잭션 레벨 선택 (간접 참조)

---

*Research completed: 2026-02-14*
*Ready for roadmap: yes*
