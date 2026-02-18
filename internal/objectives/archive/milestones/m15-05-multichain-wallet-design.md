# 마일스톤 m15-05: 멀티체인 월렛 모델 설계

## 목표

하나의 월렛이 동일 체인의 여러 네트워크에서 트랜잭션을 실행할 수 있는 아키텍처를 설계한다. 현재 "1 월렛 = 1 체인 + 1 네트워크" 모델을 "1 월렛 = 1 체인 + 1 환경(testnet/mainnet)" 모델로 전환하여, EVM 월렛이 Ethereum·Polygon·Arbitrum 등 여러 네트워크를 하나의 키로 사용할 수 있도록 한다.

---

## 배경

### 현재 모델의 문제

| 항목 | 현재 | 문제 |
|------|------|------|
| 월렛-네트워크 관계 | 1:1 (월렛 생성 시 network 고정) | Ethereum Sepolia 월렛은 Polygon Amoy에서 트랜잭션 불가 |
| EVM 키 특성 | secp256k1 → 모든 EVM 체인에서 동일 0x 주소 | 같은 키를 다른 network로 재생성하면 별도 월렛으로 취급 |
| MCP 사용자 경험 | 체인×네트워크 조합별 월렛 필요 | "EVM 메인넷에서 ETH 보내줘"가 안 됨 — 어떤 월렛? |
| 관리 부담 | 5 EVM 네트워크 × 2 환경 = 10개 월렛 | 동일 키로 10개 월렛을 만들어야 함 |

### EVM 암호학적 특성

모든 EVM 호환 체인은 secp256k1 + keccak256 주소 파생을 공유한다:

```
secp256k1 private key → public key → keccak256 → 0x address
```

따라서 **하나의 키가 Ethereum, Polygon, Arbitrum, Optimism, Base 모든 메인넷/테스트넷에서 동일한 주소를 가진다.** 네트워크를 월렛 레벨이 아닌 트랜잭션 레벨에서 지정하는 것이 자연스럽다.

### Solana 특성

Solana도 Ed25519 키가 mainnet/devnet/testnet에서 동일 주소를 가진다. 다만 Solana는 단일 체인이므로 멀티네트워크 수요가 EVM보다 적다.

---

## 설계 변경 범위

### 1. 환경(Environment) 모델 도입

#### 현재

```
wallets 테이블:
  chain: 'solana' | 'ethereum'
  network: 'mainnet' | 'devnet' | 'ethereum-mainnet' | 'ethereum-sepolia' | ...
```

#### 변경 후

```
wallets 테이블:
  chain: 'solana' | 'ethereum'
  environment: 'testnet' | 'mainnet'
```

| 필드 | 역할 | 예시 |
|------|------|------|
| `chain` | 암호학 계열 | `'solana'` / `'ethereum'` |
| `environment` | 네트워크 그룹 | `'testnet'` = 모든 테스트넷, `'mainnet'` = 모든 메인넷 |

#### 환경-네트워크 매핑

| chain | environment | 사용 가능 네트워크 |
|-------|------------|------------------|
| solana | mainnet | mainnet |
| solana | testnet | devnet, testnet |
| ethereum | mainnet | ethereum-mainnet, polygon-mainnet, arbitrum-mainnet, optimism-mainnet, base-mainnet |
| ethereum | testnet | ethereum-sepolia, polygon-amoy, arbitrum-sepolia, optimism-sepolia, base-sepolia |

#### 테스트넷-메인넷 분리 근거

- **안전성**: AI 에이전트가 실수로 메인넷 자산을 사용하는 것을 구조적으로 방지
- **키 격리**: 테스트넷 키가 메인넷에서 사용되지 않도록 월렛 레벨에서 분리
- **정책 분리**: 테스트넷은 관대한 정책, 메인넷은 엄격한 정책 적용 가능

### 2. 트랜잭션 레벨 네트워크 지정

#### 현재

```typescript
// POST /v1/transactions/send — network는 월렛에서 자동 결정
{ walletId: 'uuid', to: '0x...', amount: '0.01' }
```

#### 변경 후

```typescript
// POST /v1/transactions/send — network 명시적 지정 (선택)
{ walletId: 'uuid', to: '0x...', amount: '0.01', network: 'polygon-mainnet' }
```

| 시나리오 | network 파라미터 | 결과 |
|---------|----------------|------|
| EVM, network 지정 | `'polygon-mainnet'` | Polygon 메인넷에서 전송 |
| EVM, network 미지정 | 없음 | 월렛의 기본 네트워크에서 전송 |
| Solana, network 미지정 | 없음 | 월렛의 환경에 따라 mainnet 또는 devnet |
| EVM, 환경 불일치 | mainnet 월렛 + `'ethereum-sepolia'` | 400 에러 (환경 불일치) |

### 3. 기본 네트워크(Default Network)

각 월렛에 기본 네트워크를 설정하여, network 파라미터 생략 시 사용:

| chain | environment | 기본 네트워크 |
|-------|------------|-------------|
| solana | mainnet | mainnet |
| solana | testnet | devnet |
| ethereum | mainnet | ethereum-mainnet |
| ethereum | testnet | ethereum-sepolia |

기본 네트워크는 월렛 생성 시 자동 설정되며, API로 변경 가능.

### 4. ALLOWED_NETWORKS 정책

월렛이 사용할 수 있는 네트워크를 제한하는 새 정책 타입:

```typescript
// 정책 규칙 예시
{
  type: 'ALLOWED_NETWORKS',
  ruleConfig: {
    networks: ['ethereum-mainnet', 'polygon-mainnet']  // 이 네트워크만 허용
  }
}
```

| 정책 상태 | 동작 |
|----------|------|
| 미설정 | 환경 내 모든 네트워크 허용 (기본) |
| 설정됨 | 나열된 네트워크만 허용 |

기본 거부 원칙은 적용하지 않음 — ALLOWED_NETWORKS 미설정 시 환경 내 전체 허용. 이유: 새 모델 도입 시 기존 사용자가 추가 정책 없이 동작해야 하위호환 유지.

### 5. 네트워크 스코프 정책 (선택)

기존 정책에 `network` 필드를 추가하여 네트워크별 차등 적용:

```typescript
// Polygon에서만 일일 1 ETH 한도
{
  type: 'SPENDING_LIMIT',
  walletId: 'uuid',
  network: 'polygon-mainnet',  // 새 필드 — null이면 모든 네트워크에 적용
  ruleConfig: { dailyLimit: '1', currency: 'USD' }
}
```

---

## 리서치 대상

### 1. DB 마이그레이션 전략

| 결정 항목 | 선택지 |
|-----------|--------|
| network → environment 변환 | A) 기존 network 값에서 environment 자동 파생 B) 수동 매핑 |
| 기본 네트워크 저장 | wallets 테이블에 `default_network` 컬럼 추가 vs 별도 설정 |
| transactions 테이블 | `network` 컬럼 추가, 기존 레코드에 월렛의 network 값 역참조 |
| 하위호환 | 기존 1:1 월렛이 환경 모델에서 그대로 동작하는지 검증 |

### 2. AdapterPool 확장

| 결정 항목 | 선택지 |
|-----------|--------|
| 어댑터 캐시 키 | 현재 `${chain}:${network}` 유지 (변경 불필요) |
| 어댑터 해결 흐름 | 트랜잭션의 network → RPC URL 해결 → AdapterPool.resolve() |
| 지연 연결 | 사용 시점에 어댑터 연결 vs 월렛 생성 시 모든 네트워크 연결 |
| 메모리 영향 | EVM mainnet 월렛 1개 → 최대 5개 어댑터 인스턴스 |

### 3. MCP/SDK 인터페이스 변경

| 결정 항목 | 선택지 |
|-----------|--------|
| MCP 도구 파라미터 | `send_transaction`에 `network` 선택 파라미터 추가 |
| SDK 메서드 | `sendTransaction()`에 `network` 옵션 추가 |
| 자연어 해석 | "Polygon에서 ETH 보내줘" → network 자동 매핑 여부 |
| 잔액 조회 | 전체 네트워크 잔액 vs 네트워크 지정 조회 |

### 4. Quickstart 워크플로우

환경 선택 시 지원하는 모든 블록체인 월렛을 일괄 생성하는 원스톱 명령.

| 결정 항목 | 선택지 |
|-----------|--------|
| 명령어 형태 | `waiaas quickstart --mode testnet` vs `waiaas quickstart --env testnet` |
| 생성 월렛 | 2개 (Solana + EVM) — EVM 1개 키가 Tier 1 5체인 전체 커버 |
| 사용자 표시 | 체인별 네트워크·주소를 펼쳐서 "6개 블록체인 준비 완료"로 인식 |
| MCP 설정 | MCP 토큰 자동 생성 + MCP 클라이언트 설정 스니펫 출력 |
| MCP 클라이언트 | Claude Desktop에 한정하지 않음 (Cursor, 커스텀 등 범용) |
| 확장성 | 새 EVM 체인(Tier 1) 추가 시 quickstart 출력에 자동 포함 |

### 5. 키스토어 영향

| 결정 항목 | 선택지 |
|-----------|--------|
| 키 저장 경로 | 현재 `{walletId}/{chain}/{network}` → 환경 모델에서 변경 필요 여부 |
| 키 공유 | 동일 체인+환경 내 키 재사용 (이미 같은 키) vs 네트워크별 별도 저장 |
| 마이그레이션 | 기존 키 파일 경로 변경 필요 여부 |

---

## 산출물

### 설계 문서

| 문서 | 내용 |
|------|------|
| 멀티체인 월렛 아키텍처 | 환경 모델, 네트워크 해결 흐름, 어댑터 풀 변경 |
| DB 마이그레이션 설계 | wallets/transactions/policies 테이블 변경, 데이터 이전 |
| API 변경 설계 | 트랜잭션 네트워크 파라미터, 잔액 조회 확장, Quickstart |
| MCP/SDK 변경 설계 | 도구 파라미터 추가, 네트워크 자동 감지 |

### 설계 결정

| 영역 | 예상 결정 수 |
|------|------------|
| 데이터 모델 | 5~8개 (환경 enum, 기본 네트워크, 키 경로 등) |
| API 인터페이스 | 3~5개 (네트워크 파라미터, 잔액 조회, Quickstart) |
| 정책 확장 | 2~3개 (ALLOWED_NETWORKS, 네트워크 스코프) |
| 마이그레이션 | 3~4개 (테이블 변환, 키 경로, 하위호환) |

---

## 순서 의존성

| 선행 | 내용 |
|------|------|
| v1.4.2 | 용어 변경 (agent → wallet) — wallet 용어 기반으로 설계 |
| v1.4.3 | EVM 토큰 레지스트리 — 토큰 레지스트리가 네트워크별 토큰 목록을 관리하므로 멀티체인과 연동 |
| v1.4.4 | Admin 설정 관리 — RPC 설정 hot-reload가 멀티체인에서 활용됨 |
| v1.4.5 → v1.4.6 | 설계 완료 후 구현 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 리서치 | DB 마이그레이션, 어댑터 풀, MCP 인터페이스, Quickstart |
| 페이즈 | 3~4개 (리서치 1 + 설계 2~3) |
| 설계 문서 | 3~4개 |
| 설계 결정 | 15~20개 |

---

*생성일: 2026-02-13*
*선행: v1.4.4 (Admin 설정 관리)*
*후행: v1.4.6 (멀티체인 월렛 구현)*
