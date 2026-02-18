# 마일스톤 m15-06: 멀티체인 월렛 구현

## 목표

v1.4.5에서 설계한 멀티체인 월렛 모델을 구현하여, 하나의 EVM 월렛이 Ethereum·Polygon·Arbitrum·Optimism·Base 네트워크에서 트랜잭션을 실행할 수 있는 상태. 트랜잭션 실행 시 네트워크를 지정하고, 미지정 시 기본 네트워크에서 처리된다. Quickstart 명령으로 테스트넷/메인넷 월렛을 원스톱 생성할 수 있다.

---

## 배경

v1.4.5에서 다음 설계가 완료된 상태를 전제:

| 설계 항목 | 내용 |
|-----------|------|
| 환경 모델 | `wallets.network` → `wallets.environment` (`testnet` / `mainnet`) |
| 트랜잭션 네트워크 | `transactions.network` 컬럼 추가, 요청 시 명시적 지정 |
| ALLOWED_NETWORKS | 새 정책 타입 — 월렛이 사용 가능한 네트워크 제한 |
| Quickstart | `waiaas quickstart --mode testnet` — Solana + EVM 월렛 일괄 생성 |
| 키스토어 | 환경 모델에 맞는 키 저장 경로 변경 |

---

## 구현 범위

### 1. DB 마이그레이션

| 테이블 | 변경 | 내용 |
|--------|------|------|
| `wallets` | ALTER | `network` → `environment` 컬럼 변환, CHECK 제약 변경 |
| `wallets` | ADD | `default_network TEXT` — 기본 네트워크 (nullable, null이면 환경 기본값) |
| `transactions` | ADD | `network TEXT` — 실행 네트워크 기록 |
| `policies` | ADD | `network TEXT` — 네트워크 스코프 (nullable, null이면 전체 적용) |

#### 데이터 이전

```sql
-- 기존 wallets.network → environment 변환
-- 'mainnet' | 'ethereum-mainnet' | 'polygon-mainnet' ... → 'mainnet'
-- 'devnet' | 'testnet' | 'ethereum-sepolia' | 'polygon-amoy' ... → 'testnet'

-- 기존 wallets.network → default_network 보존
-- 기존 값이 그대로 default_network가 됨 (1:1 월렛의 하위호환)

-- 기존 transactions에 network 역참조
-- transactions.network = wallets.network (조인 후 UPDATE)
```

### 2. 스키마 변경

#### Zod 스키마 (packages/core)

| 파일 | 변경 |
|------|------|
| `enums/chain.ts` | `EnvironmentType = 'testnet' \| 'mainnet'` 추가, 환경-네트워크 매핑 함수 |
| `schemas/wallet.schema.ts` | `network` → `environment`, `defaultNetwork` 추가 |
| `schemas/wallet.schema.ts` | `CreateWalletRequestSchema`에 `environment` 필드 |
| `schemas/transaction.schema.ts` | `SendTransactionRequestSchema`에 `network` 선택 파라미터 |
| `schemas/policy.schema.ts` | `CreatePolicyRequestSchema`에 `network` 선택 필드 |
| `enums/policy.ts` | `ALLOWED_NETWORKS` 정책 타입 추가 |

#### 환경-네트워크 매핑 함수

```typescript
// packages/core/src/enums/chain.ts

export function getNetworksForEnvironment(
  chain: ChainType,
  environment: EnvironmentType,
): NetworkType[] {
  if (chain === 'solana') {
    return environment === 'mainnet' ? ['mainnet'] : ['devnet', 'testnet'];
  }
  // ethereum
  return environment === 'mainnet'
    ? ['ethereum-mainnet', 'polygon-mainnet', 'arbitrum-mainnet', 'optimism-mainnet', 'base-mainnet']
    : ['ethereum-sepolia', 'polygon-amoy', 'arbitrum-sepolia', 'optimism-sepolia', 'base-sepolia'];
}

export function getDefaultNetwork(
  chain: ChainType,
  environment: EnvironmentType,
): NetworkType {
  if (chain === 'solana') return environment === 'mainnet' ? 'mainnet' : 'devnet';
  return environment === 'mainnet' ? 'ethereum-mainnet' : 'ethereum-sepolia';
}

export function validateNetworkEnvironment(
  chain: ChainType,
  environment: EnvironmentType,
  network: NetworkType,
): void {
  const allowed = getNetworksForEnvironment(chain, environment);
  if (!allowed.includes(network)) {
    throw new Error(`Network '${network}' not in ${environment} environment for ${chain}`);
  }
}
```

### 3. API 변경

| 엔드포인트 | 변경 | 내용 |
|-----------|------|------|
| `POST /v1/wallets` | 수정 | `network` → `environment` 파라미터, 기본값: `'testnet'` |
| `POST /v1/transactions/send` | 수정 | `network` 선택 파라미터 추가 |
| `GET /v1/wallet/balance` | 수정 | `network` 쿼리 파라미터 추가 (특정 네트워크 잔액) |
| `GET /v1/wallet/assets` | 수정 | `network` 쿼리 파라미터 추가 |
| `PUT /v1/wallets/:id/default-network` | 신규 | 기본 네트워크 변경 |
| `GET /v1/wallets/:id/networks` | 신규 | 월렛이 사용 가능한 네트워크 목록 |

#### 네트워크 해결 흐름

```
요청의 network 파라미터
  ├─ 지정됨 → 환경 일치 검증 → ALLOWED_NETWORKS 정책 검증 → 사용
  └─ 미지정 → 월렛의 default_network 사용
```

### 4. 파이프라인 변경

| Stage | 변경 |
|-------|------|
| Stage 1 (검증) | 네트워크 해결 + 환경 일치 검증 + ALLOWED_NETWORKS 정책 검사 |
| Stage 3 (정책) | 네트워크 스코프 정책 매칭 (policy.network = tx.network OR policy.network IS NULL) |
| Stage 4 (빌드) | 해결된 network로 AdapterPool.resolve() 호출 |
| Stage 5 (제출) | 변경 없음 (어댑터가 이미 올바른 네트워크에 연결) |
| Stage 6 (확인) | 변경 없음 |

### 5. AdapterPool 변경

AdapterPool의 캐시 키는 이미 `${chain}:${network}` 형태이므로 구조 변경 불필요. 변경 사항:

| 항목 | 변경 |
|------|------|
| resolve() 호출자 | 월렛의 network 대신 트랜잭션의 network 전달 |
| 지연 연결 | 사용 시점에 어댑터 생성 (기존과 동일) |
| disconnect | 전체 해제 시 월렛에 연결된 모든 네트워크 어댑터 해제 |

### 6. 키스토어 변경

| 항목 | 변경 |
|------|------|
| 키 생성 | `generateKeyPair(id, chain, environment, password)` — network 대신 environment |
| 키 로드 | `loadKeyPair(id, chain, password)` — network 불필요 (키는 환경 내 공유) |
| 서명 | `signTransaction()` — 동일 키로 모든 네트워크 트랜잭션 서명 |
| 키 파일 경로 | v1.4.5 설계에 따라 결정 |

### 7. ALLOWED_NETWORKS 정책

```typescript
// 정책 타입 추가
export const POLICY_TYPES = [
  ...existingTypes,
  'ALLOWED_NETWORKS',
] as const;

// 규칙 스키마
export const AllowedNetworksRulesSchema = z.object({
  networks: z.array(NetworkTypeEnum).min(1),
});

// Stage 1에서 검사
function checkAllowedNetworks(walletId: string, network: NetworkType): void {
  const policies = resolveOverrides(walletId, 'ALLOWED_NETWORKS');
  if (policies.length === 0) return; // 미설정 = 전체 허용
  const allowed = policies[0].ruleConfig.networks;
  if (!allowed.includes(network)) {
    throw new WAIaaSError('POLICY_VIOLATION', { message: `Network ${network} not allowed` });
  }
}
```

### 8. MCP 도구 변경

| 도구 | 변경 |
|------|------|
| `send_transaction` | `network` 선택 파라미터 추가 |
| `send_token` | `network` 선택 파라미터 추가 |
| `get_balance` | `network` 선택 파라미터 추가 |
| `get_assets` | `network` 선택 파라미터 추가 (미지정 시 기본 네트워크) |
| `get_wallet_info` | 사용 가능 네트워크 목록 포함 |

### 9. SDK 변경

| 메서드 | 변경 |
|--------|------|
| `sendTransaction()` | `options.network` 추가 |
| `sendToken()` | `options.network` 추가 |
| `getBalance()` | `options.network` 추가 |
| `getAssets()` | `options.network` 추가 |

### 10. Admin UI 변경

| 페이지 | 변경 |
|--------|------|
| 월렛 생성 | `network` 드롭다운 → `environment` 라디오버튼 (testnet/mainnet) |
| 월렛 상세 | 사용 가능 네트워크 목록 표시, 기본 네트워크 변경 UI |
| 트랜잭션 목록 | `network` 컬럼 추가 |
| 정책 생성 | ALLOWED_NETWORKS 타입 추가, 네트워크 스코프 선택 |

### 11. CLI Quickstart

환경(testnet/mainnet)을 선택하면 지원하는 **모든 블록체인의 월렛을 일괄 생성**하는 원스톱 명령:

```bash
# 테스트넷 환경 — Solana devnet + EVM testnet (2 월렛, 6 블록체인)
waiaas quickstart --mode testnet --password <master_password>

# 메인넷 환경 — Solana mainnet + EVM mainnet (2 월렛, 6 블록체인)
waiaas quickstart --mode mainnet --password <master_password>
```

#### 출력 예시

```
$ waiaas quickstart --mode mainnet --password ****

Creating wallets for mainnet environment...

✓ 2 wallets created (1 Solana + 1 EVM)

  Chain      Network            Address
  ─────────  ─────────────────  ──────────────────
  Solana     mainnet            So1ana...xyz
  Ethereum   ethereum-mainnet   0xAbC...789
  Polygon    polygon-mainnet    0xAbC...789
  Arbitrum   arbitrum-mainnet   0xAbC...789
  Optimism   optimism-mainnet   0xAbC...789
  Base       base-mainnet       0xAbC...789

  * EVM chains share the same key — one wallet, same address everywhere.

✓ MCP tokens saved (2 files)

  Add to your MCP client config:
  ┌─────────────────────────────────────────────┐
  │ "waiaas-mainnet": {                         │
  │   "command": "node",                        │
  │   "args": ["path/to/mcp/index.js"],         │
  │   "env": { "WAIAAS_PASSWORD": "****" }      │
  │ }                                           │
  └─────────────────────────────────────────────┘
```

#### 실행 흐름

1. 데몬 구동 확인 (미구동 시 에러 + 안내)
2. Solana 월렛 생성 (해당 환경)
3. EVM 월렛 생성 (해당 환경) — 1개 키로 Tier 1 5체인 전체 커버
4. MCP 토큰 생성 (두 월렛 모두)
5. 체인별 네트워크·주소 목록 출력 — EVM은 동일 주소 반복 표시로 "6개 블록체인 준비 완료" 인식
6. MCP 클라이언트 설정 스니펫 출력 (Claude Desktop, Cursor 등)

#### 설계 원칙

| 원칙 | 내용 |
|------|------|
| 물리 월렛 최소화 | 키 2개(Solana + EVM)만 생성 — 동일 키를 네트워크마다 복제하지 않음 |
| 사용자 인식 최대화 | 출력은 체인별로 펼쳐서 "모든 블록체인 지갑이 생겼다"고 인식 |
| MCP 클라이언트 무관 | Claude Desktop, Cursor, 커스텀 MCP 클라이언트 모두 동일 설정 |
| 확장 가능 | 새 EVM 체인 추가 시 quickstart 출력에 자동 포함 (Tier 1 목록 참조) |

---

## 하위호환

| 항목 | 보장 방식 |
|------|----------|
| 기존 월렛 | DB 마이그레이션이 network → environment 자동 변환 + default_network 보존 |
| 기존 API 호출 | `network` 파라미터 미지정 시 default_network 사용 — 기존 동작 동일 |
| 기존 MCP 도구 | `network` 미지정 → 기존과 동일하게 기본 네트워크 사용 |
| 기존 정책 | `network` 스코프 null → 모든 네트워크 적용 (기존 동작) |
| ALLOWED_NETWORKS 미설정 | 환경 내 모든 네트워크 허용 (기본) |

---

## 순서 의존성

| 선행 | 내용 |
|------|------|
| v1.4.5 | 멀티체인 월렛 설계 — 모든 설계 결정 확정 후 구현 |
| v1.4.3 | EVM 토큰 레지스트리 — 네트워크별 토큰 목록이 멀티체인에서 활용됨 |
| v1.4.4 | Admin 설정 관리 — RPC hot-reload + Admin UI 기반 |

---

## 해소 DX 문제

| 문제 | 해소 방식 |
|------|----------|
| EVM 월렛 5개 네트워크별 생성 | 1개 월렛으로 전체 환경 커버 |
| 네트워크 전환 불가 | 트랜잭션 레벨 네트워크 지정 |
| MCP 초기 설정 번거로움 | Quickstart 원스톱 명령 |
| 네트워크 제한 불가 | ALLOWED_NETWORKS 정책 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 5~7개 (DB 1 + 스키마/API 1 + 파이프라인 1 + MCP/SDK 1 + Admin 1 + CLI 1 + 통합 1) |
| 신규/수정 파일 | 25~35개 |
| DB 마이그레이션 | 4 테이블 (wallets, transactions, policies, schema_version) |
| 테스트 | DB 마이그레이션 + 네트워크 해결 + 파이프라인 + MCP + Admin UI |
| 리스크 | 마이그레이션 복잡도 (기존 데이터 보존), 키스토어 경로 변경 |

---

*생성일: 2026-02-13*
*선행: v1.4.5 (멀티체인 월렛 설계)*
*관련: v1.5 (DeFi + 가격 오라클 — 멀티체인 환경에서 오라클 활용)*
