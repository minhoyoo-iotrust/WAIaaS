# Feature Landscape: 멀티체인 월렛 환경 모델 (v1.4.5)

**Domain:** 멀티체인 월렛 아키텍처 -- 환경 기반 월렛 모델, 트랜잭션 레벨 네트워크 선택, 멀티 네트워크 잔액 집계
**Researched:** 2026-02-14
**Overall Confidence:** HIGH (업계 표준 패턴 + 공식 문서 + 실제 코드베이스 분석 기반)
**Milestone:** v1.4.5 멀티체인 월렛 모델 설계

---

## 개요

v1.4.5는 WAIaaS의 "1 월렛 = 1 체인 + 1 네트워크" 모델을 "1 월렛 = 1 체인 + 1 환경(testnet/mainnet)"으로 전환한다. 이 전환은 업계의 보편적 흐름과 일치한다. MetaMask는 2025년 말 Multichain Accounts로 리아키텍처하여 하나의 계정이 여러 네트워크를 아우르도록 변경했고, Dfns는 key-centric 모델로 하나의 키가 여러 체인에서 월렛을 만드는 구조를 도입했으며, Phantom은 Solana/Ethereum/Bitcoin 잔액을 하나의 대시보드에서 보여준다.

WAIaaS의 핵심 이점: secp256k1 키는 모든 EVM 체인에서 동일한 0x 주소를 생성하고, Ed25519 키는 Solana mainnet/devnet/testnet에서 동일한 주소를 생성한다. 현재 이 사실에도 불구하고 각 네트워크마다 별도 월렛을 만들어야 한다. 이는 AI 에이전트 관점에서 불필요한 복잡성이다 -- "Polygon에서 ETH 보내줘"라고 말하면 되어야 하는데, 별도 Polygon 월렛을 만들고 세션을 따로 발급받아야 한다.

**핵심 설계 긴장:** 환경 모델의 단순성(testnet vs mainnet) 대 네트워크별 정책 세분성(Polygon에서만 DeFi 허용) 사이의 균형.

---

## Table Stakes (필수 기능)

사용자가 "멀티체인 월렛"에서 당연히 기대하는 기능. 빠지면 제품이 불완전하게 느껴진다.

### TS-1: 환경 기반 월렛 모델 (wallets.network -> wallets.environment)

| 속성 | 값 |
|------|-----|
| 복잡도 | Medium |
| 기존 의존 | wallets 테이블, WalletSchema, CreateWalletRequestSchema, NETWORK_TYPES enum |
| 우선순위 | CRITICAL -- 전체 아키텍처 전환의 기반 |

**업계 표준 패턴 (HIGH confidence):**

MetaMask, Phantom, Dfns, Coinbase 모두 "하나의 계정/키가 여러 네트워크에서 동작"하는 모델로 수렴했다. 핵심은 **월렛이 네트워크가 아닌 키 커브(cryptographic curve)에 바인딩**된다는 점이다.

- **MetaMask Multichain Accounts:** 하나의 계정 = 1 EVM 주소 + 1 Solana 주소 + 1 Bitcoin 주소. 네트워크는 트랜잭션 시점에 선택.
- **Dfns key-centric model:** 하나의 키 = 동일 커브의 모든 체인에서 월렛 생성 가능. `POST /wallets { network: "Polygon", signingKey: { id: "key-001" } }`
- **Phantom:** 월렛 생성 시 자동으로 Solana + Ethereum + Bitcoin 주소 생성. 네트워크 전환 불필요.

**WAIaaS 적용:**

```
현재 모델:
  wallet A -> chain: ethereum, network: ethereum-sepolia  (테스트)
  wallet B -> chain: ethereum, network: polygon-mainnet   (프로덕션)
  wallet C -> chain: ethereum, network: base-mainnet      (프로덕션)
  -> 같은 0x 주소인데 3개의 별도 월렛, 3개의 세션

환경 모델:
  wallet X -> chain: ethereum, environment: testnet
    -> ethereum-sepolia, polygon-amoy, arbitrum-sepolia, base-sepolia 모두 사용
  wallet Y -> chain: ethereum, environment: mainnet
    -> ethereum-mainnet, polygon-mainnet, arbitrum-mainnet, base-mainnet 모두 사용
  -> 같은 키로 2개 월렛, 각각 1개 세션
```

**DB 스키마 변경:**

```sql
-- wallets 테이블
ALTER TABLE wallets RENAME COLUMN network TO environment;
-- environment: 'testnet' | 'mainnet'
-- transactions 테이블에 network 컬럼 추가 (실행된 네트워크 기록)
ALTER TABLE transactions ADD COLUMN network TEXT;
```

**서브 기능:**
- [ ] `environment` 컬럼 도입 (`'testnet'` | `'mainnet'`)
- [ ] Solana: testnet 환경 = devnet + testnet, mainnet 환경 = mainnet
- [ ] EVM: testnet 환경 = all *-sepolia/*-amoy networks, mainnet 환경 = all *-mainnet networks
- [ ] `EnvironmentType` Zod enum + SSoT 파생
- [ ] DB 마이그레이션 (기존 network 값 -> environment 매핑)
- [ ] 하위 호환: 기존 월렛의 network 값을 environment로 자동 변환

**환경-네트워크 매핑:**

| 환경 | Solana 네트워크 | EVM 네트워크 |
|------|----------------|-------------|
| `testnet` | devnet, testnet | ethereum-sepolia, polygon-amoy, arbitrum-sepolia, optimism-sepolia, base-sepolia |
| `mainnet` | mainnet | ethereum-mainnet, polygon-mainnet, arbitrum-mainnet, optimism-mainnet, base-mainnet |

---

### TS-2: 트랜잭션 레벨 네트워크 선택

| 속성 | 값 |
|------|-----|
| 복잡도 | Medium |
| 기존 의존 | TransactionRequestSchema (5-type discriminatedUnion), AdapterPool, 6-stage pipeline |
| 우선순위 | CRITICAL -- 환경 모델의 핵심 사용성 |

**업계 표준 패턴 (HIGH confidence):**

- **MetaMask Multichain API:** "targeting specific chains as part of each method call, eliminating the need to detect and switch networks before executing signatures and transactions." 각 메서드 호출에서 체인을 지정.
- **Coinbase Wallet API v2:** 트랜잭션에 `chainId` 파라미터를 포함하여 트랜잭션 레벨에서 체인 선택.
- **Fireblocks:** 트랜잭션 생성 시 asset ID로 네트워크를 암시적으로 결정.
- **Phantom:** 자산의 체인에 따라 자동으로 네트워크 결정. 사용자는 "어떤 체인의 어떤 자산"만 선택.

**WAIaaS 적용:**

```typescript
// 현재: 월렛이 network를 결정
POST /v1/transactions/send
{ "type": "TRANSFER", "to": "0x...", "amount": "1000000000000000000" }
// -> 월렛의 network (예: ethereum-sepolia)에서 실행

// 환경 모델: 트랜잭션이 network를 지정
POST /v1/transactions/send
{
  "type": "TRANSFER",
  "to": "0x...",
  "amount": "1000000000000000000",
  "network": "polygon-mainnet"  // 선택적, 미지정시 기본 네트워크 사용
}
// -> polygon-mainnet에서 실행 (월렛은 mainnet 환경)
```

**네트워크 결정 우선순위:**
1. 요청의 `network` 필드 (명시적 지정)
2. 월렛의 기본 네트워크 (`default_network` 설정, 선택)
3. 환경의 기본 네트워크 (Solana mainnet = mainnet, EVM mainnet = ethereum-mainnet)

**AI 에이전트 UX 고려사항:**
- "Send ETH on Polygon" -> MCP가 `network: "polygon-mainnet"` 추론
- "Send ETH" -> 기본 네트워크 사용 (명시 불필요)
- "Send ETH on Arbitrum Sepolia" -> `network: "arbitrum-sepolia"` 추론 (월렛이 testnet 환경인 경우만 유효)

**서브 기능:**
- [ ] 5-type TransactionRequestSchema에 `network` 옵션 필드 추가
- [ ] 네트워크-환경 유효성 검증 (mainnet 월렛은 mainnet 네트워크만 사용 가능)
- [ ] AdapterPool.resolve() 호출 시 요청의 network 사용
- [ ] Pipeline Stage 1에서 네트워크 결정 + 유효성 검사
- [ ] transactions 테이블에 실제 실행 네트워크 기록
- [ ] SDK/MCP에서 network 파라미터 노출
- [ ] 미지정 시 기본 네트워크 폴백 로직

---

### TS-3: ALLOWED_NETWORKS 정책

| 속성 | 값 |
|------|-----|
| 복잡도 | Low-Medium |
| 기존 의존 | PolicyTypeEnum (10 types), PolicySchema, DatabasePolicyEngine |
| 우선순위 | HIGH -- 보안 제어 (기본 거부 원칙과 일치) |

**업계 표준 패턴 (MEDIUM confidence):**

네트워크 레벨 제한은 WaaS 제품에서 일반적이다. Fireblocks는 vault account별로 활성 네트워크를 설정하고, Dfns는 키별로 허용 네트워크를 관리한다. WAIaaS의 기본 거부 정책 원칙과 자연스럽게 맞물린다.

**설계 결정: 기본 허용 vs 기본 거부**

`ALLOWED_TOKENS`와 `CONTRACT_WHITELIST`는 기본 거부이다. ALLOWED_NETWORKS도 기본 거부로 할 수 있지만, 환경 모델에서는 **환경이 이미 범위를 제한**하므로 다른 접근이 적절하다:

- **권장: 환경 내 기본 허용, ALLOWED_NETWORKS로 제한 가능** -- testnet 환경의 월렛은 기본적으로 모든 testnet 네트워크 사용 가능. ALLOWED_NETWORKS 정책 설정 시 특정 네트워크로만 제한.
- 이유: 환경 구분 자체가 mainnet/testnet 격리를 보장하므로 추가적인 기본 거부는 DX를 저하시킴.

```typescript
// PolicyType에 ALLOWED_NETWORKS 추가 (11번째)
{
  "walletId": "...",
  "type": "ALLOWED_NETWORKS",
  "rules": {
    "networks": ["ethereum-mainnet", "polygon-mainnet"]
    // 이 월렛은 Ethereum과 Polygon에서만 거래 가능
    // Arbitrum, Optimism, Base는 차단
  }
}
```

**서브 기능:**
- [ ] PolicyType enum에 `ALLOWED_NETWORKS` 추가 (11번째)
- [ ] AllowedNetworksRulesSchema: `{ networks: string[] }` + 환경 유효성 검증
- [ ] Pipeline Stage 2 (정책 평가)에서 ALLOWED_NETWORKS 체크
- [ ] 미설정 시 환경 내 모든 네트워크 허용 (기본 허용)
- [ ] 설정 시 명시된 네트워크만 허용 (제한적 거부)
- [ ] 기존 10개 정책에 네트워크 스코프 선택 기능 추가 (SPENDING_LIMIT per network 등)

---

### TS-4: 멀티 네트워크 잔액 조회 (getAssets 확장)

| 속성 | 값 |
|------|-----|
| 복잡도 | Medium-High |
| 기존 의존 | IChainAdapter.getAssets(), GET /v1/wallet/assets, AdapterPool |
| 우선순위 | HIGH -- 가장 빈번한 조회 작업 |

**업계 표준 패턴 (HIGH confidence):**

- **Zerion API:** 단일 API 호출로 모든 지원 체인의 토큰 잔액, NFT, DeFi 포지션 반환
- **Covalent API:** 100+ 블록체인에서 모든 토큰과 NFT를 단일 호출로 반환
- **Ankr.js:** `getAccountBalance(address)` -> 모든 체인의 코인/토큰 잔액
- **MetaMask:** Multichain Accounts에서 모든 네트워크의 잔액을 집계하여 표시
- **Phantom:** 지원 체인의 모든 자산을 하나의 대시보드에서 표시

**WAIaaS 적용:**

```
현재:
  GET /v1/wallet/assets -> 월렛의 단일 네트워크 자산만 반환

환경 모델:
  GET /v1/wallet/assets -> 모든 네트워크의 자산을 집계하여 반환
  GET /v1/wallet/assets?network=polygon-mainnet -> 특정 네트워크 필터

응답 구조:
{
  "walletId": "...",
  "chain": "ethereum",
  "environment": "mainnet",
  "assets": [
    {
      "network": "ethereum-mainnet",  // 네트워크 필드 추가
      "mint": "native",
      "symbol": "ETH",
      "name": "Ether",
      "balance": "1500000000000000000",
      "decimals": 18,
      "isNative": true
    },
    {
      "network": "polygon-mainnet",   // 다른 네트워크의 자산
      "mint": "native",
      "symbol": "POL",
      "name": "POL",
      "balance": "50000000000000000000",
      "decimals": 18,
      "isNative": true
    },
    {
      "network": "ethereum-mainnet",
      "mint": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "symbol": "USDC",
      "name": "USD Coin",
      "balance": "10000000",
      "decimals": 6,
      "isNative": false
    }
  ]
}
```

**RPC 호출 최적화:**
- 모든 네트워크에 병렬로 `getAssets()` 호출 (Promise.allSettled)
- 실패한 네트워크는 에러로 표시하되 성공한 네트워크 결과는 반환
- 응답에 `errors` 배열로 실패 네트워크 정보 포함
- 캐싱 전략: 짧은 TTL (10-30초) 인메모리 캐시로 동일 요청 중복 방지

**서브 기능:**
- [ ] AssetInfo에 `network` 필드 추가
- [ ] 다중 네트워크 병렬 조회 로직 (Promise.allSettled)
- [ ] `?network=` 쿼리 파라미터로 특정 네트워크 필터링
- [ ] 부분 실패 허용 (일부 네트워크 RPC 실패 시 나머지 결과 반환)
- [ ] getBalance 엔드포인트도 `?network=` 지원
- [ ] 응답에 각 네트워크별 조회 상태 포함

---

### TS-5: DB 마이그레이션 (ALTER TABLE 증분)

| 속성 | 값 |
|------|-----|
| 복잡도 | Medium |
| 기존 의존 | schema_version 테이블, MIG-01~06 전략 (docs/65), 기존 10 테이블 |
| 우선순위 | CRITICAL -- v1.4 이후 스키마 변경 시 필수 |

**마이그레이션 대상:**

```sql
-- Migration: v_1_4_5_multichain_wallet_model

-- 1. wallets 테이블: network -> environment 변환
-- SQLite는 RENAME COLUMN 지원 (3.25.0+, Node.js 22의 better-sqlite3가 지원)
ALTER TABLE wallets RENAME COLUMN network TO environment;

-- 2. 기존 network 값 -> environment 값 매핑
UPDATE wallets SET environment = 'testnet'
  WHERE environment IN ('devnet', 'testnet', 'ethereum-sepolia', 'polygon-amoy',
    'arbitrum-sepolia', 'optimism-sepolia', 'base-sepolia');
UPDATE wallets SET environment = 'mainnet'
  WHERE environment IN ('mainnet', 'ethereum-mainnet', 'polygon-mainnet',
    'arbitrum-mainnet', 'optimism-mainnet', 'base-mainnet');

-- 3. CHECK 제약 업데이트 (SQLite는 ALTER CHECK 미지원 -> 재생성 필요 없음, Drizzle 레벨에서 처리)

-- 4. transactions 테이블: network 컬럼 추가
ALTER TABLE transactions ADD COLUMN network TEXT;

-- 5. wallets 테이블: default_network 컬럼 추가 (선택적 기본 네트워크)
ALTER TABLE wallets ADD COLUMN default_network TEXT;

-- 6. idx_wallets_chain_network -> idx_wallets_chain_environment 인덱스 변경
DROP INDEX IF EXISTS idx_wallets_chain_network;
CREATE INDEX idx_wallets_chain_environment ON wallets(chain, environment);

-- 7. schema_version 업데이트
INSERT INTO schema_version (version, applied_at, description)
VALUES (5, unixepoch(), 'v1.4.5 multichain wallet environment model');
```

**서브 기능:**
- [ ] 마이그레이션 스크립트 작성 (증분, 롤백 가능)
- [ ] 기존 데이터 자동 변환 (network -> environment 매핑)
- [ ] Drizzle 스키마 업데이트 (wallets.environment, transactions.network)
- [ ] CHECK 제약 업데이트 (EnvironmentType SSoT)
- [ ] schema_version 레코드 추가

---

## Differentiators (차별화 기능)

WAIaaS를 다른 월렛 제품과 구분짓는 기능. 기대되지는 않지만 AI 에이전트 use case에서 가치가 높다.

### D-1: Quickstart 원스톱 셋업 (2 월렛 = 전체 체인 커버)

| 속성 | 값 |
|------|-----|
| 복잡도 | Low |
| 기존 의존 | CLI init 플로우, CreateWalletRequest, CreateSessionRequest |
| 우선순위 | HIGH -- DX 핵심 개선 |

**업계 패턴:**

Phantom은 월렛 생성 시 자동으로 Solana + Ethereum + Bitcoin 주소를 생성한다. 사용자는 하나만 만들면 모든 체인에서 바로 사용할 수 있다. WAIaaS도 동일한 경험을 제공해야 한다.

**현재 문제:**
```bash
# 현재: 5개 EVM 네트워크를 쓰려면 5개 월렛 + 5개 세션
waiaas init  # config 생성
waiaas start
curl POST /v1/wallets -d '{"name":"eth-sepolia","chain":"ethereum","network":"ethereum-sepolia"}'
curl POST /v1/wallets -d '{"name":"polygon-mainnet","chain":"ethereum","network":"polygon-mainnet"}'
curl POST /v1/wallets -d '{"name":"arb-mainnet","chain":"ethereum","network":"arbitrum-mainnet"}'
# ... 세션도 각각 생성
```

**환경 모델 Quickstart:**
```bash
# 환경 모델: 2개 월렛 = 전체 체인 커버 (Solana + EVM)
waiaas init  # 자동으로:
  # 1. config.toml 생성
  # 2. Solana testnet 월렛 생성 (devnet, testnet 커버)
  # 3. EVM testnet 월렛 생성 (5개 EVM testnet 커버)
  # 4. 두 월렛의 세션 토큰 발급
  # -> 즉시 10개 네트워크에서 거래 가능
```

**서브 기능:**
- [ ] quickstart 모드에서 자동 2월렛 생성 (Solana testnet + EVM testnet)
- [ ] mainnet 모드 옵션 (`--mainnet` 플래그)
- [ ] 두 월렛의 세션을 자동 생성하여 즉시 사용 가능한 토큰 출력
- [ ] MCP 설정 자동 생성 (Claude Desktop config snippet)

---

### D-2: 네트워크 스코프 정책 (기존 정책의 네트워크별 세분화)

| 속성 | 값 |
|------|-----|
| 복잡도 | Medium |
| 기존 의존 | 10 PolicyType, DatabasePolicyEngine, policy.schema.ts |
| 우선순위 | MEDIUM -- 고급 보안 사용자를 위한 세분화 |

**개념:**

현재 SPENDING_LIMIT 정책은 월렛 전체에 적용된다. 멀티 네트워크 환경에서는 "Polygon에서는 일일 100 USDC, Ethereum에서는 일일 1 ETH" 같은 네트워크별 차등 정책이 유용하다.

```typescript
// 네트워크 스코프 정책 예시
{
  "type": "SPENDING_LIMIT",
  "rules": {
    "daily": "1000000000000000000",  // 1 ETH
    "network": "ethereum-mainnet"     // 이 네트워크에만 적용
  }
}

// 또는 ALLOWED_TOKENS에 네트워크 스코프
{
  "type": "ALLOWED_TOKENS",
  "rules": {
    "tokens": [
      { "address": "0xA0b86...", "symbol": "USDC", "network": "ethereum-mainnet" },
      { "address": "0x2791Bca...", "symbol": "USDC", "network": "polygon-mainnet" }
    ]
  }
}
```

**설계 결정:** 기존 정책 스키마에 선택적 `network` 필드를 추가하는 것이 가장 적은 변경으로 최대 유연성을 제공한다. `network` 미지정 시 월렛 전체(모든 네트워크)에 적용.

**서브 기능:**
- [ ] CreatePolicyRequestSchema에 선택적 `network` 필드 추가
- [ ] policies 테이블에 `network` 컬럼 추가 (nullable)
- [ ] DatabasePolicyEngine에서 네트워크 매칭 로직 추가
- [ ] 전역 정책(network 미지정) + 네트워크 특정 정책 우선순위 규칙

---

### D-3: AI 에이전트 네트워크 추론 (MCP 자연어 네트워크 결정)

| 속성 | 값 |
|------|-----|
| 복잡도 | Low (MCP 도구 설명 개선만으로 달성) |
| 기존 의존 | @waiaas/mcp 9 도구, skill 파일 5개 |
| 우선순위 | MEDIUM -- AI 에이전트 DX의 핵심 차별화 |

**개념:**

AI 에이전트가 "Polygon에서 USDC 전송해줘"라고 하면 MCP 도구가 `network: "polygon-mainnet"`을 자동으로 추론한다. 이는 MetaMask의 "You don't have to worry about switching networks. Each flow will ask you to select the relevant network" 철학의 AI 버전이다.

**구현:** MCP 도구 설명에 네트워크 파라미터와 유효 값을 명확히 기술하면 LLM이 자연어에서 올바른 네트워크를 추론한다. 별도의 복잡한 추론 엔진은 불필요하다.

**서브 기능:**
- [ ] MCP send_transaction 도구에 network 파라미터 추가
- [ ] 도구 설명에 네트워크 목록과 사용법 명시
- [ ] get_assets 도구에 network 필터 파라미터 추가
- [ ] skill 파일 업데이트 (네트워크 선택 가이드 추가)

---

### D-4: 환경 간 격리 보장

| 속성 | 값 |
|------|-----|
| 복잡도 | Low |
| 기존 의존 | validateChainNetwork(), Pipeline Stage 1-2 |
| 우선순위 | HIGH -- 보안 기본 원칙 |

**개념:**

testnet 월렛이 절대로 mainnet 트랜잭션을 실행할 수 없어야 한다. 이는 실제 자금 손실을 방지하는 가장 기본적인 안전장치이다. MetaMask의 testnet 토글과 동일한 역할을 환경 모델이 강제한다.

**Trust Wallet 경고 (공식 문서):** "Ethereum addresses and private keys work on both mainnet and testnets, so users must be extremely careful not to send real assets to testnet addresses." -- WAIaaS는 이를 시스템 레벨에서 강제한다.

**서브 기능:**
- [ ] Pipeline Stage 1에서 환경-네트워크 교차 검증
- [ ] testnet 월렛은 mainnet 네트워크로 트랜잭션 불가 (하드 블록)
- [ ] mainnet 월렛은 testnet 네트워크로 트랜잭션 불가 (하드 블록)
- [ ] 에러 메시지에 명확한 설명과 hint 포함

---

## Anti-Features (의도적으로 만들지 않는 기능)

### AF-1: 자동 크로스체인 브리징

| Anti-Feature | 회피 이유 | 대안 |
|---|---|---|
| "Polygon의 ETH를 Ethereum으로 자동 브리지" | 브리지는 보안 위험이 높고 (2024-2025년 브리지 해킹 누적 $3B+), 복잡한 외부 의존성을 도입. AI 에이전트가 자동으로 브리지하면 예측 불가능한 자금 이동 발생 가능. | 각 네트워크의 자산은 해당 네트워크에서만 사용. 브리징이 필요하면 명시적 CONTRACT_CALL로 사용자가 직접 실행. |

### AF-2: 동적 환경 전환

| Anti-Feature | 회피 이유 | 대안 |
|---|---|---|
| 월렛의 환경을 testnet에서 mainnet으로 전환하는 기능 | 환경 전환은 월렛의 근본적 속성을 바꾸는 것으로, 세션/정책/감사 로그의 맥락이 깨진다. 또한 testnet에서 개발하다가 실수로 mainnet으로 전환하는 사고 가능. | mainnet 사용이 필요하면 새 월렛 생성. 환경은 월렛 생성 시 고정 (immutable). |

### AF-3: 글로벌 포트폴리오 집계 (크로스 월렛)

| Anti-Feature | 회피 이유 | 대안 |
|---|---|---|
| 모든 월렛의 잔액을 하나로 합산하여 총 자산 표시 | 월렛 간 자산 합산은 보안 경계를 흐림. 각 월렛은 독립된 보안 도메인이어야 한다. Zerion/Covalent 같은 포트폴리오 API는 외부 서비스의 역할. | 단일 월렛 내 멀티 네트워크 집계만 제공. 크로스 월렛 집계는 Admin UI의 대시보드 레벨에서 표시 (정보 목적). |

### AF-4: 네트워크별 별도 키

| Anti-Feature | 회피 이유 | 대안 |
|---|---|---|
| 각 EVM 네트워크마다 다른 키페어 사용 | EVM의 핵심 이점은 하나의 secp256k1 키로 모든 체인에서 동일 주소를 사용하는 것. 네트워크별 별도 키는 이 이점을 무력화하고 키 관리 복잡도만 증가. | 환경별 하나의 키. EVM 환경 내 모든 네트워크는 동일 키/주소. |

### AF-5: 자동 네트워크 탐지/추가

| Anti-Feature | 회피 이유 | 대안 |
|---|---|---|
| 사용자가 임의의 EVM RPC URL을 추가하여 새 네트워크 자동 등록 | 보안 위험 (악성 RPC 노드), 정책 엔진이 미지원 네트워크의 동작을 예측 불가, 테스트되지 않은 네트워크에서의 트랜잭션 실패 위험. | 지원 네트워크는 소스 코드에 하드코딩 (EVM_CHAIN_MAP). 새 네트워크 추가는 코드 변경 + 릴리스 필요. 커스텀 RPC URL은 기존 지원 네트워크에 대해서만 허용. |

---

## Feature Dependencies

```
[TS-5: DB 마이그레이션] -- 반드시 먼저
       |
[TS-1: 환경 기반 월렛 모델]
       |
       +---> [TS-2: 트랜잭션 레벨 네트워크 선택]
       |            |
       |            +---> [TS-3: ALLOWED_NETWORKS 정책]
       |            |
       |            +---> [D-2: 네트워크 스코프 정책]
       |
       +---> [TS-4: 멀티 네트워크 잔액 조회]
       |
       +---> [D-4: 환경 간 격리 보장]
       |
       +---> [D-1: Quickstart 원스톱 셋업]
       |
       +---> [D-3: AI 에이전트 네트워크 추론]
```

**순서 근거:**
1. DB 마이그레이션은 모든 것의 전제조건 (스키마가 바뀌어야 모든 기능이 동작)
2. 환경 모델이 핵심 기반 (월렛 생성/조회의 근본 변경)
3. 트랜잭션 네트워크 선택과 잔액 조회는 환경 모델 위에 독립적으로 구축 가능
4. 정책 기능은 트랜잭션 흐름이 안정된 후 추가
5. Quickstart와 MCP는 마지막 (API가 확정된 후)

---

## MVP 권장사항

### Phase 1: 환경 모델 전환 (핵심)

| 기능 | 범위 |
|------|------|
| TS-5: DB 마이그레이션 | wallets.environment, transactions.network, default_network |
| TS-1: 환경 기반 월렛 모델 | Zod 스키마, Drizzle 스키마, enum SSoT, 월렛 CRUD |
| D-4: 환경 간 격리 | validateChainNetwork -> validateEnvironmentNetwork |

### Phase 2: 트랜잭션 + 잔액

| 기능 | 범위 |
|------|------|
| TS-2: 트랜잭션 레벨 네트워크 선택 | 5-type 스키마 확장, Pipeline Stage 1, AdapterPool |
| TS-4: 멀티 네트워크 잔액 조회 | 병렬 조회, AssetInfo.network, ?network= 필터 |

### Phase 3: 정책 + DX

| 기능 | 범위 |
|------|------|
| TS-3: ALLOWED_NETWORKS 정책 | 11번째 PolicyType, Stage 2 체크 |
| D-2: 네트워크 스코프 정책 | 기존 정책 네트워크 옵션 |
| D-1: Quickstart 원스톱 | CLI init 플로우 개선 |
| D-3: AI 에이전트 네트워크 추론 | MCP 도구/skill 파일 업데이트 |

### Deferred (v1.4.5 이후):

| 기능 | 이유 |
|------|------|
| 크로스체인 브리징 | 보안 위험 + 복잡도 (AF-1) |
| 포트폴리오 API (크로스 월렛) | Admin UI 개선 시 추후 검토 |
| 동적 네트워크 추가 | 코드 변경 릴리스 모델 유지 (AF-5) |

---

## 기존 기능과의 호환성 매트릭스

| 기존 기능 | v1.4.5 영향 | 변경 수준 |
|-----------|-------------|----------|
| `POST /v1/wallets` | `network` -> `environment` 파라미터, 하위 호환 가능 | **Breaking** (API 변경) |
| `GET /v1/wallet/assets` | 응답에 `network` 필드 추가, 다중 네트워크 자산 | **Additive** |
| `POST /v1/transactions/send` | 선택적 `network` 필드 추가 | **Additive** |
| `GET /v1/wallet/balance` | `?network=` 쿼리 파라미터 추가 | **Additive** |
| `GET /v1/wallet/address` | 응답에 `environment` + 모든 네트워크 주소 목록 | **Additive** |
| PolicyEngine 10 types | 11번째 ALLOWED_NETWORKS 추가 | **Additive** |
| SDK (TypeScript/Python) | `network` 파라미터 추가, `environment` 개념 반영 | **Breaking** (type 변경) |
| MCP 9 도구 | `network` 파라미터 추가 | **Additive** |
| Admin UI | 월렛 목록에 environment 표시, 네트워크 선택 UI | **UI 변경** |
| skill 파일 5개 | 네트워크 선택 가이드 추가 | **문서 변경** |

**하위 호환 전략:**
- 월렛 생성 시 `network` 파라미터를 계속 수용하되 자동으로 environment로 변환 (deprecation notice)
- 트랜잭션의 `network` 필드는 선택적이므로 기존 코드는 수정 없이 동작 (기본 네트워크 사용)
- SDK v2 릴리스 시 breaking change를 일괄 적용하되, v1 호환 레이어 유지

---

## Sources

### HIGH Confidence (공식 문서 + 코드베이스 분석)
- WAIaaS 코드베이스 직접 분석: `packages/core/src/enums/chain.ts`, `packages/daemon/src/infrastructure/database/schema.ts`, `packages/adapters/evm/src/evm-chain-map.ts`, `packages/daemon/src/infrastructure/adapter-pool.ts`
- [MetaMask Multichain Accounts](https://metamask.io/news/multichain-accounts) -- 계정 모델 리아키텍처, EVM+Solana+Bitcoin 통합
- [Dfns Multichain Wallets](https://www.dfns.co/article/introducing-multichain-wallets) -- key-centric 모델, ECDSA/EdDSA 커브 기반 멀티체인
- [Dfns Wallet Creation API](https://docs.dfns.co/guides/developers/creating-wallets) -- keyId 재사용으로 멀티 네트워크 월렛 생성
- [Phantom Multichain](https://phantom.com/learn/blog/introducing-phantom-multichain) -- 자동 멀티체인 주소 생성, 통합 포트폴리오 뷰

### MEDIUM Confidence (WebSearch + 크로스 검증)
- [Zerion Multichain Portfolio APIs Guide 2026](https://zerion.io/blog/best-multichain-portfolio-apis-2026-guide/) -- 단일 API 호출 멀티체인 잔액 집계
- [Coinbase Wallet API v2](https://www.coinbase.com/developer-platform/products/wallet-sdk) -- chainId 트랜잭션 레벨 선택
- [Fireblocks Multichain Deployment](https://developers.fireblocks.com/reference/sdk-multichain-deployment) -- vault account 멀티체인 지원
- [Ankr getAccountBalance](https://www.ankr.com/docs/advanced-api/quickstart/account-balance-ankrjs/) -- 크로스체인 잔액 조회 API
- [Circle Unified Wallet Addressing](https://developers.circle.com/wallets/unified-wallet-addressing-evm) -- EVM 통합 주소 체계
- [Trust Wallet Testnet/Mainnet](https://trustwallet.com/blog/guides/what-is-a-testnet-in-crypto) -- 환경 분리 UX 패턴
- [MetaMask Multichain API](https://docs.metamask.io/wallet/how-to/manage-networks/use-multichain/) -- 멀티 네트워크 동시 인터랙션
