# 마일스톤 m32-00: 컨트랙트 이름 해석 (Contract Name Resolution)

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

CONTRACT_CALL 알림에서 raw 주소 대신 사람이 이해할 수 있는 컨트랙트 이름을 표시한다. Action Provider 메타데이터(비용 0)를 1순위로, 내장 Well-known 컨트랙트 레지스트리를 2순위로 활용하여 RPC 호출 없이 알림 가독성을 높인다.

---

## 배경

### 현재 문제

CONTRACT_CALL 알림이 raw 주소로 표시되어 어떤 프로토콜과 상호작용하는지 즉시 파악하기 어렵다:

```
현재: "MyWallet이(가) 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2로 1 ETH contract call을(를) 요청했습니다"
목표: "MyWallet이(가) Aave V3 Pool (0x8787...4E2)로 1 ETH contract call을(를) 요청했습니다"
```

Owner가 승인 알림을 받았을 때 컨트랙트 주소만 보이면:
1. 해당 주소가 어떤 프로토콜인지 확인하기 위해 블록 익스플로러를 별도 조회해야 함
2. 피싱 컨트랙트와 정상 프로토콜 컨트랙트를 육안으로 구분할 수 없음
3. 승인/거부 판단에 불필요한 지연이 발생함

### ENS/SNS 리버스 리졸루션을 채택하지 않는 이유

ENS 리버스 레코드는 주소 소유자가 직접 설정해야 하며, 실제 DeFi 프로토콜 컨트랙트(Pool, Router 등)에는 거의 설정되어 있지 않다:
- DeFi 컨트랙트 대부분이 프록시/멀티시그 소유로, 리버스 레코드 설정에 관심 없음
- L2 컨트랙트는 ENS가 Ethereum mainnet 전용이라 아예 불가
- `uniswap.eth` 같은 ENS 이름은 프로토콜 팀의 EOA에 설정된 것이지, 실제 Router 주소가 아님

따라서 ENS/SNS에 의존하면 신규 패키지 + RPC 호출 비용 대비 실제 해석 성공률이 극히 낮다. 대신 **내장 Well-known 컨트랙트 레지스트리**로 RPC 호출 없이 동일하거나 더 높은 커버리지를 확보한다.

### 기존 인프라 활용

| 인프라 | 현재 상태 | 활용 방안 |
|--------|----------|----------|
| `actionProvider` 필드 | ContractCallRequest에 존재하나 알림에 미전달 | 알림 vars에 포함하여 DeFi 프로토콜명 표시 |
| `transactions.metadata` | `{ provider, action }` JSON 저장 중 | 이미 저장된 provider 이름 재활용 가능 |
| `CONTRACT_WHITELIST.name` | 정책에 선택적 name 필드 존재 | 사용자 지정 컨트랙트 이름 3순위 활용 |

---

## 설계

### 이름 해석 우선순위

```
┌─────────────────────────────────────────────────────────┐
│ 1. Action Provider 메타데이터 (비용 0, 즉시 반환)         │
│    ctx.request.actionProvider → "Aave V3"               │
├─────────────────────────────────────────────────────────┤
│ 2. Well-known 컨트랙트 레지스트리 (비용 0, 정적 매핑)     │
│    address+chain 조회 → "Uniswap V3 Router"             │
├─────────────────────────────────────────────────────────┤
│ 3. CONTRACT_WHITELIST name (비용 0, 사용자 지정)         │
│    정책에 등록된 name 필드 → "My Custom DEX"             │
├─────────────────────────────────────────────────────────┤
│ 4. Fallback: 축약 주소                                   │
│    formatAddress() → "0x8787...4E2"                     │
└─────────────────────────────────────────────────────────┘
```

모든 단계가 RPC 호출 없이 인메모리에서 동기적으로 해석된다. 알림 발송 지연 없음.

### ContractNameResolver

새로운 서비스가 이름 해석 로직을 중앙 관리한다:

```typescript
interface IContractNameResolver {
  /** 주소에 대한 사람이 읽을 수 있는 이름을 반환한다 (동기) */
  resolve(address: string, chain: ChainType, network?: string): ResolvedName;
}

interface ResolvedName {
  /** 해석된 표시명: "Aave V3 Pool (0x8787...4E2)" 또는 "0x8787...4E2" */
  displayName: string;
  /** 원본 주소 */
  address: string;
  /** 이름 출처 */
  source: 'action_provider' | 'well_known' | 'whitelist' | 'fallback';
}
```

### Well-known 컨트랙트 레지스트리

Etherscan "labeled addresses"와 유사한 체인별 내장 매핑. 주요 DeFi 프로토콜의 핵심 컨트랙트 주소를 수록:

```typescript
// 레지스트리 데이터 구조
interface WellKnownContract {
  address: string;         // 체크섬 주소 (EVM) 또는 base58 주소 (Solana)
  name: string;            // 표시명 (e.g. "Aave V3 Pool")
  protocol: string;        // 프로토콜명 (e.g. "Aave")
  chain: ChainType;        // ethereum | solana
  networks: string[];      // ["ethereum-mainnet", "base-mainnet", ...]
}
```

#### Well-known 데이터 수집 전략

**레지스트리의 가치는 수록된 컨트랙트 수에 비례한다.** 마일스톤 구현 전에 리서치 페이즈를 통해 주요 프로토콜의 컨트랙트 주소를 대량 확보해야 한다:

| 수집 대상 | 수집 방법 | 예상 엔트리 수 |
|----------|----------|---------------|
| **주요 DeFi 프로토콜** | 각 프로토콜 공식 문서 + GitHub 배포 스크립트에서 체인별 컨트랙트 주소 수집 | 200-300개 |
| **DEX Router/Factory** | Uniswap, SushiSwap, Curve, PancakeSwap, Balancer 등 5+ 체인 배포 주소 | 80-120개 |
| **Lending 프로토콜** | Aave V2/V3, Compound V2/V3, Morpho, Spark 체인별 Pool/Comptroller | 60-80개 |
| **브릿지 프로토콜** | LI.FI, Stargate, Across, Wormhole 체인별 엔트리 포인트 | 40-60개 |
| **Liquid Staking** | Lido, Rocket Pool, Frax, Jito, Marinade 컨트랙트 | 20-30개 |
| **Solana 프로그램** | Jupiter, Raydium, Orca, Marinade, Jito, SPL Token 등 | 30-50개 |
| **인프라 컨트랙트** | WETH/WMATIC/WAVAX (각 체인), Multicall3, Create2Deployer 등 | 20-30개 |
| **NFT 마켓플레이스** | OpenSea Seaport, Blur, Magic Eden | 10-20개 |

**수집 소스:**
1. **공식 문서** — Aave Deployed Contracts, Uniswap Contract Addresses 등 각 프로토콜의 공식 배포 주소 문서
2. **Etherscan/Basescan Labels** — 블록 익스플로러의 라벨링된 주소 목록 참조
3. **DeFiLlama** — TVL 상위 프로토콜 목록 + 체인별 배포 현황
4. **GitHub 배포 스크립트** — 프로토콜의 `deployments/` 디렉토리에 체인별 주소 기록

**리서치 페이즈 목표: 최소 300개 이상의 well-known 엔트리 확보** (5 EVM 체인 + Solana). 이를 통해 Action Provider를 거치지 않는 직접 CONTRACT_CALL에서도 높은 이름 해석률을 달성한다.

#### 초기 수록 범위

| 체인 | 수록 프로토콜 |
|------|-------------|
| Ethereum mainnet | Uniswap V2/V3, Aave V2/V3, Compound V2/V3, Lido, Curve, 1inch, 0x, OpenSea, WETH |
| Base mainnet | Uniswap V3, Aave V3, Aerodrome, 0x, LI.FI, WETH |
| Arbitrum mainnet | Uniswap V3, Aave V3, GMX, Camelot, 0x, LI.FI, WETH |
| Optimism mainnet | Uniswap V3, Aave V3, Velodrome, 0x, LI.FI, WETH |
| Polygon mainnet | Uniswap V3, Aave V3, QuickSwap, 0x, LI.FI, WMATIC |
| Solana mainnet-beta | Jupiter, Raydium, Orca, Marinade, Jito, SPL Token, Token-2022 |

### 알림 템플릿 변경

```typescript
// 현재 (packages/core/src/i18n/ko.ts)
TX_REQUESTED: { title: '거래 요청', body: '{walletName}이(가) {to}로 {amount} {type}을(를) 요청했습니다 {display_amount}' }

// 변경 후
TX_REQUESTED: { title: '거래 요청', body: '{walletName}이(가) {to_display}로 {amount} {type}을(를) 요청했습니다 {display_amount}' }
```

`{to_display}` 값 예시:
- Action Provider: `"Aave V3 (0x8787...4E2)"`
- Well-known: `"Uniswap V3 Router (0xE592...3b6e)"`
- Whitelist: `"My Custom DEX (0x1234...5678)"`
- Fallback: `"0x8787...4E2"` (현재와 동일)

---

## 구현 대상

### ContractNameResolver (핵심)

| 컴포넌트 | 내용 |
|----------|------|
| ContractNameResolver | IContractNameResolver 구현. 4단계 우선순위 기반 이름 해석. 동기 API |
| WellKnownRegistry | 체인+네트워크별 컨트랙트 주소 → 이름 매핑. 정적 데이터. `Map<lowercase_address, WellKnownContract>` |
| well-known 데이터 파일 | EVM 체인별 + Solana 프로그램 주소 데이터. TS const 오브젝트 |
| ActionProviderDisplayNames | Action Provider snake_case ID → 사람이 읽을 수 있는 표시명 매핑 |

### 알림 파이프라인 연동

| 대상 | 변경 내용 |
|------|----------|
| `stages.ts` Stage 1 | TX_REQUESTED 알림에 `to_display` 변수 추가. CONTRACT_CALL이면 ContractNameResolver로 이름 해석 |
| `stages.ts` Stage 3 | TX_APPROVAL_REQUIRED 알림에 `to_display` 변수 추가 |
| `stages.ts` Stage 5 | TX_SUBMITTED / TX_CONFIRMED 알림에 `to_display` 변수 추가 |
| `message-templates.ts` | `to_display` 포맷팅 로직: `name (축약주소)` 형태 |
| `i18n/en.ts`, `i18n/ko.ts` | CONTRACT_CALL 관련 이벤트 템플릿에서 `{to}` → `{to_display}` |

### Action Provider 표시명 매핑

파이프라인의 `actionProvider` 값(snake_case ID)을 사람이 읽을 수 있는 이름으로 변환:

| actionProvider (ID) | 표시명 |
|---------------------|--------|
| `jupiter_swap` | Jupiter |
| `aave_v3` | Aave V3 |
| `lido_staking` | Lido |
| `jito_staking` | Jito |
| `zerox_swap` | 0x |
| `lifi_bridge` | LI.FI |

방법: `IActionProvider.metadata`에 `displayName` 필드를 추가하여 각 프로바이더가 자체 표시명을 제공.

### 파일/모듈 구조

```
packages/daemon/src/services/
  name-resolution/
    contract-name-resolver.ts       # ContractNameResolver (오케스트레이터)
    well-known-registry.ts          # WellKnownRegistry (정적 매핑 조회)
    action-provider-resolver.ts     # Action Provider 표시명 조회
    types.ts                        # ResolvedName, IContractNameResolver 인터페이스

packages/core/src/data/
  well-known-contracts/
    ethereum.ts                     # Ethereum mainnet 컨트랙트
    base.ts                         # Base mainnet 컨트랙트
    arbitrum.ts                     # Arbitrum mainnet 컨트랙트
    optimism.ts                     # Optimism mainnet 컨트랙트
    polygon.ts                      # Polygon mainnet 컨트랙트
    solana.ts                       # Solana mainnet-beta 프로그램
    index.ts                        # 체인별 데이터 통합 export

수정 대상 (기존 파일):
  packages/core/src/i18n/en.ts                                        # {to_display} 템플릿 변수
  packages/core/src/i18n/ko.ts                                        # {to_display} 템플릿 변수
  packages/daemon/src/pipeline/stages.ts                              # 알림 트리거에 to_display 전달
  packages/daemon/src/notifications/templates/message-templates.ts    # to_display 포맷 로직
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 이름 해석 2순위 | Well-known 레지스트리 (내장 매핑) vs ENS/SNS (온체인 리버스 조회) | ENS 리버스 레코드가 DeFi 컨트랙트에 거의 미설정. 내장 매핑이 RPC 비용 0으로 동일하거나 더 높은 커버리지 제공 |
| 2 | 레지스트리 데이터 형태 | TS const 오브젝트 (코드 내장) vs JSON 파일 vs DB 테이블 | TS const가 타입 안전하고 번들에 포함. 컨트랙트 주소는 불변이므로 하드코딩 적합. 버전 업데이트로 관리 |
| 3 | API 동기/비동기 | 동기 (RPC 호출 없음) | 모든 데이터 소스가 인메모리. 비동기가 불필요하며 알림 파이프라인 통합이 단순해짐 |
| 4 | 3순위 CONTRACT_WHITELIST | 정책 데이터 활용 vs 생략 | 사용자가 이미 등록한 name 필드를 활용하면 임의 컨트랙트도 커버 가능. 추가 비용 최소 |
| 5 | 표시명 포맷 | "이름 (축약주소)" | 이름만 표시하면 주소 확인 불가. 축약 주소를 함께 표시하여 검증 가능성 유지 |
| 6 | Admin UI 표시 | 트랜잭션 목록에도 이름 표시 | ContractNameResolver를 Admin API에서도 활용하여 트랜잭션 상세에 컨트랙트 이름 표시 |
| 7 | Well-known 데이터 확보 | 리서치 페이즈에서 대량 수집 | 레지스트리 가치는 수록 데이터 양에 비례. 구현 전 300+ 엔트리 확보 목표 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

### Action Provider 이름 해석

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | Action Provider 경유 CONTRACT_CALL → 프로토콜명 포함 알림 | actionProvider='aave_v3' + notify → to_display에 "Aave V3 (0x...)" 포함 assert | [L0] |
| 2 | actionProvider 없는 CONTRACT_CALL → Well-known 또는 축약 주소 | actionProvider=undefined + Aave Pool 주소 → "Aave V3 Pool (0x...)" assert | [L0] |
| 3 | 전체 Action Provider 표시명 매핑 | 등록된 모든 provider에 대해 displayName 반환 assert | [L0] |

### Well-known 레지스트리

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 4 | Well-known 주소 → 이름 반환 | Uniswap V3 Router 주소 + ethereum → "Uniswap V3 Router" assert | [L0] |
| 5 | 동일 주소, 다른 체인 → 각각 올바른 이름 | 같은 주소가 Ethereum/Base에서 다른 이름일 수 있음 assert | [L0] |
| 6 | 미등록 주소 → fallback | 레지스트리에 없는 주소 → 축약 주소 반환 assert | [L0] |
| 7 | 대소문자 무시 → 정상 매칭 | lowercase/checksum 주소 모두 동일 결과 assert | [L0] |
| 8 | Solana 프로그램 → 이름 반환 | Jupiter Aggregator 프로그램 주소 → "Jupiter Aggregator" assert | [L0] |
| 9 | 레지스트리 엔트리 수 검증 | 전체 well-known 엔트리 수 ≥ 300 assert | [L0] |

### CONTRACT_WHITELIST 이름

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 10 | 화이트리스트에 name 지정된 컨트랙트 → 이름 반환 | CONTRACT_WHITELIST {address, name: "My DEX"} → "My DEX (0x...)" assert | [L0] |
| 11 | 화이트리스트에 name 미지정 → fallback | CONTRACT_WHITELIST {address} (name 없음) → 축약 주소 assert | [L0] |

### 우선순위 동작

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 12 | Action Provider > Well-known > Whitelist 우선순위 | 3개 소스 모두 매칭되는 주소 → Action Provider 이름 반환 assert | [L0] |
| 13 | Well-known > Whitelist 우선순위 | Action Provider 없음 + Well-known과 Whitelist 모두 매칭 → Well-known 이름 반환 assert | [L0] |

### 알림 통합

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 14 | TX_REQUESTED 알림에 to_display 포함 | CONTRACT_CALL + actionProvider → 알림 body에 프로토콜명 포함 assert | [L0] |
| 15 | TX_APPROVAL_REQUIRED 알림에 to_display 포함 | 승인 필요 알림 → body에 컨트랙트 이름 포함 assert | [L0] |
| 16 | TX_SUBMITTED 알림에 to_display 포함 | 트랜잭션 제출 알림 → body에 컨트랙트 이름 포함 assert | [L0] |
| 17 | TRANSFER/TOKEN_TRANSFER는 기존 동작 유지 | 비 CONTRACT_CALL 타입 → to_display 미적용, 기존 to 사용 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| v1.5 (Action Provider 프레임워크) | ActionProviderRegistry, IActionProvider.metadata.name |
| v1.3.4 (알림 이벤트 트리거) | NotificationService, 메시지 템플릿 인프라 |
| v1.2 (정책 엔진) | CONTRACT_WHITELIST 정책의 name 필드 조회 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | Well-known 레지스트리 불완전 | 수록되지 않은 신규/마이너 프로토콜은 이름 해석 불가 | 리서치 페이즈에서 300+ 엔트리 확보. Action Provider가 대부분 커버. 버전 업데이트로 점진적 확대 |
| 2 | 컨트랙트 업그레이드로 주소 변경 | 프록시 뒤의 구현체 교체 시 프록시 주소는 유지되므로 영향 없음. 프록시 자체가 교체되면 레지스트리 갱신 필요 | 메이저 프로토콜은 프록시 주소 유지. 교체 시 버전 업데이트로 반영 |
| 3 | 레지스트리 데이터 관리 부담 | 체인 수 × 프로토콜 수만큼 주소 관리 필요 | 초기에는 5개 EVM 체인 + Solana만 수록. 체인 추가는 점진적으로 |
| 4 | 리서치 데이터 정확성 | 잘못된 주소 매핑은 오히려 혼란 유발 | 공식 문서 + 블록 익스플로러 교차 검증. 테스트에서 실제 주소 검증 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 3개 (Well-known 컨트랙트 리서치 + 데이터 수집 1 / ContractNameResolver + 레지스트리 구현 1 / 파이프라인 알림 연동 + 템플릿 + 테스트 1) |
| 신규 파일 | 10-12개 (서비스 4 + 데이터 6-7 + 타입 1) |
| 수정 파일 | 4-5개 |
| 테스트 | 17-22개 |
| 신규 의존성 | 없음 |
| Well-known 엔트리 | 목표 300개 이상 (5 EVM 체인 + Solana) |

---

*생성일: 2026-02-27*
*선행: v1.5 (Action Provider), v1.3.4 (알림 이벤트), v1.2 (정책 엔진)*
*관련: Etherscan Labeled Addresses, DeFiLlama Protocol Registry, 설계 문서 62 (action-provider-architecture)*
