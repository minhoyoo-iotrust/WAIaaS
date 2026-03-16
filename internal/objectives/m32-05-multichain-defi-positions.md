# 마일스톤 m32-05: 멀티체인 DeFi 포지션 + 테스트넷 토글

- **Status:** SHIPPED
- **Milestone:** v32.5
- **Completed:** 2026-03-16

## 목표

DeFi 포지션 시스템의 `IPositionProvider` 인터페이스를 확장하여 지갑의 체인/네트워크/환경 컨텍스트를 전달하고, 각 프로바이더가 해당 네트워크에 맞는 컨트랙트 주소로 포지션을 조회하도록 개선한다. Admin 대시보드에는 테스트넷 포지션 포함 여부를 제어하는 토글을 제공한다.

---

## 배경

### 현재 문제

1. **`IPositionProvider.getPositions(walletId: string)` — 컨텍스트 부재**: 프로바이더가 `walletId`만 받아 지갑의 환경(testnet/mainnet)과 네트워크를 알 수 없다.
2. **네트워크 하드코딩**: Lido → `ethereum-mainnet`, Jito → `solana-mainnet`, Aave → 단일 RPC 등 모든 프로바이더가 메인넷을 하드코딩한다.
3. **멀티체인 미지원**: wstETH가 Base/Arbitrum/Optimism/Polygon에도 브릿지되어 있지만 이더리움 메인넷만 조회한다.
4. **테스트넷 포지션 누락**: 테스트넷 지갑의 DeFi 포지션이 대시보드에 표시되지 않는다 (Assets 탭의 Staking Positions는 트랜잭션 집계 방식이라 정상 작동).

### 영향받는 프로바이더 (8개)

`IPositionProvider`를 구현하는 프로바이더만 대상. Polymarket은 자체 `polymarket_positions` 테이블로 별도 관리하므로 제외. DCent Swap, Across Bridge는 포지션 프로바이더가 아니므로 제외.

| 프로바이더 | 현재 하드코딩 네트워크 | 멀티체인 컨트랙트 존재 |
|-----------|----------------------|---------------------|
| Lido Staking | `ethereum-mainnet` | stETH/wstETH: Ethereum, Base, Arbitrum, Optimism, Polygon, Scroll |
| Jito Staking | `solana-mainnet` | jitoSOL: Solana만 |
| Aave V3 | 단일 RPC | Ethereum, Base, Arbitrum, Optimism, Polygon, Avalanche |
| Kamino | `solana-mainnet` | Solana만 |
| Pendle | 단일 RPC | Ethereum, Arbitrum |
| Drift | `solana-mainnet` | Solana만 |
| Hyperliquid Perp | Hyperliquid L1 | Hyperliquid만 |
| Hyperliquid Spot | Hyperliquid L1 | Hyperliquid만 |

---

## 구현 대상

### Phase 1: IPositionProvider 인터페이스 확장 + PositionTracker 컨텍스트 전달

| 대상 | 내용 |
|------|------|
| `IPositionProvider` 인터페이스 변경 | `getPositions(walletId: string)` → `getPositions(context: PositionQueryContext)` |
| `PositionQueryContext` 타입 정의 | `{ walletId, chain, networks: NetworkInfo[], environment }` — 지갑이 속한 체인과 활성 네트워크 목록 전달 |
| `PositionTracker.syncCategory()` 수정 | 지갑 조회 시 `chain`, `environment` 포함. `getNetworksForEnvironment()`로 네트워크 목록 결정 후 컨텍스트에 포함 |
| 기존 프로바이더 시그니처 일괄 수정 | 8개 프로바이더의 `getPositions` 시그니처를 `PositionQueryContext` 수용으로 변경 (동작은 기존 유지) |
| 테스트 | 인터페이스 contract 테스트, PositionTracker 컨텍스트 전달 테스트 |

### Phase 2: 프로바이더별 멀티체인 컨트랙트 매핑

| 대상 | 내용 |
|------|------|
| 멀티체인 주소 레지스트리 | 프로바이더별 `Record<networkId, ContractAddresses>` 매핑 테이블 정의 |
| Lido 멀티체인 | stETH/wstETH 주소: Ethereum, Base, Arbitrum, Optimism, Polygon, Scroll — 네트워크별 CAIP-19 assetId 생성 |
| Aave V3 멀티체인 | Pool/PoolDataProvider 주소: Ethereum, Base, Arbitrum, Optimism, Polygon — 네트워크별 RPC 호출 |
| Pendle 멀티체인 | Router/Market 주소: Ethereum, Arbitrum — 네트워크별 조회 |
| Solana 프로바이더 (Jito, Kamino, Drift) | `context.networks`에서 Solana 네트워크 추출, 하드코딩 제거 |
| Hyperliquid Perp/Spot | 단일 네트워크이므로 컨텍스트 기반 조건부 스킵 (해당 체인이 아니면 `[]` 반환) |
| 테스트넷 지원 | 테스트넷 환경의 지갑도 해당 네트워크의 컨트랙트 주소로 조회 (Sepolia stETH 등) |
| 테스트 | 프로바이더별 멀티네트워크 조회 테스트, 미지원 네트워크 스킵 테스트 |

### Phase 3: Admin 대시보드 테스트넷 토글 + API 필터링

| 대상 | 내용 |
|------|------|
| `GET /v1/admin/defi/positions` 쿼리 파라미터 | `?includeTestnets=true/false` (기본 `false`) 추가 |
| API 필터링 로직 | `defi_positions` 테이블 조회 시 `network` 컬럼의 환경 판별 → 테스트넷 포지션 포함/제외 |
| Admin UI 토글 | DeFi Positions 대시보드에 "Include testnets" 토글 버튼 추가 (기본 OFF) |
| 토글 상태 유지 | `localStorage`에 저장하여 새로고침 후에도 유지 |
| 테스트 | API 필터링 테스트 (testnet 포함/제외), UI 토글 렌더링 테스트 |

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 인터페이스 변경 방식 | (A) 기존 시그니처 유지 + 오버로드 (B) **breaking change로 일괄 변경** | **B** — 내부 전용 인터페이스이고 모든 프로바이더가 daemon 내부에 있으므로 클린 전환이 가능. 오버로드는 불필요한 복잡성 |
| 2 | 멀티체인 주소 저장 위치 | (A) DB 테이블 (B) **프로바이더 내부 상수** | **B** — 컨트랙트 주소는 불변이고 프로바이더 배포와 함께 버전 관리되어야 함. 런타임 변경 불필요 |
| 3 | 네트워크별 RPC URL 확보 | (A) **PositionQueryContext에 rpcUrl 포함** (B) 프로바이더가 RpcPool에서 resolve | **A** — 프로바이더는 actions 패키지에 위치하므로 daemon의 RpcPool에 직접 접근 불가. 컨텍스트에 네트워크별 rpcUrl 매핑 포함 |
| 4 | 테스트넷 판별 방법 | (A) `environment` 컬럼 조회 (B) **네트워크 ID 패턴 매칭** (`*-sepolia`, `*-goerli`, `solana-devnet`) | **A** — `PositionUpdate.network` 저장 시 지갑의 `environment` 정보도 함께 저장. 패턴 매칭은 신규 테스트넷 추가 시 누락 위험 |
| 5 | 토글 기본값 | (A) **OFF (메인넷만)** (B) ON (전체) | **A** — 운영 환경에서 테스트넷 포지션은 노이즈. 필요한 사용자만 ON으로 전환 |
| 6 | `defi_positions` 환경 컬럼 | (A) **`environment` 컬럼 추가** (B) network에서 추론 | **A** — 명시적 컬럼이 쿼리 성능과 정확성 보장. DB 마이그레이션 1건 추가 |
| 7 | 멀티네트워크 병렬 조회 | (A) 순차 조회 (B) **`Promise.allSettled`로 병렬 조회** | **B** — 네트워크당 독립 RPC 호출이므로 병렬 처리가 효율적. 하나 실패해도 나머지 결과 사용 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

### 인터페이스 + 컨텍스트

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | PositionTracker가 지갑 컨텍스트 전달 | mock 프로바이더에서 `context.chain`, `context.environment` 수신 확인 | [L0] |
| 2 | 테스트넷 지갑 포지션 조회 | testnet 환경 지갑 → 프로바이더가 테스트넷 네트워크 컨트랙트로 조회 | [L0] |
| 3 | 미지원 체인 프로바이더 스킵 | Solana 지갑에 대해 Lido(EVM) 프로바이더 → `[]` 반환 확인 | [L0] |

### 멀티체인 포지션

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 4 | Lido wstETH 멀티체인 조회 | Ethereum + Base + Arbitrum 네트워크별 wstETH 잔액 조회 → 네트워크별 PositionUpdate 생성 | [L0] |
| 5 | Aave V3 멀티체인 조회 | Ethereum + Arbitrum 네트워크별 supply/borrow 포지션 조회 | [L0] |
| 6 | 네트워크별 CAIP-19 정확성 | 각 네트워크의 chainId에 맞는 CAIP-19 assetId 생성 확인 | [L0] |
| 7 | 단일 네트워크 실패 격리 | 3개 네트워크 중 1개 RPC 실패 → 나머지 2개 정상 반환 | [L0] |

### 테스트넷 토글

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 8 | 기본값(OFF) → 메인넷만 표시 | `GET /v1/admin/defi/positions` → testnet 포지션 미포함 확인 | [L0] |
| 9 | 토글 ON → 테스트넷 포함 | `?includeTestnets=true` → testnet + mainnet 포지션 모두 반환 | [L0] |
| 10 | UI 토글 상태 유지 | 토글 ON → 새로고침 → localStorage에서 복원 → 여전히 ON | [L0] |
| 11 | `environment` 컬럼 마이그레이션 | 기존 `defi_positions` 행의 environment가 `mainnet`으로 기본 채워짐 확인 | [L0] |

### 회귀

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 12 | 기존 메인넷 포지션 정상 표시 | 인터페이스 변경 후 메인넷 지갑 포지션 조회 → 기존과 동일 결과 | [L0] |
| 13 | Assets 탭 스테이킹 영향 없음 | 지갑 상세 Assets 탭의 Staking Positions → 기존과 동일 (트랜잭션 집계 방식) | [L0] |
| 14 | `typecheck` + 전체 테스트 통과 | `pnpm turbo run typecheck && pnpm turbo run test:unit` 통과 | [L0] |

---

## 선행 조건

| 의존 대상 | 이유 |
|----------|------|
| 없음 | 독립 실행 가능. m32-04(타입 안전)와 병렬 진행 가능 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 멀티체인 컨트랙트 주소 오류 | 잘못된 주소로 조회 시 잔액 0 반환 또는 revert | 각 체인의 공식 배포 문서에서 주소 확인. 체인별 smoke test로 검증 |
| 2 | 멀티네트워크 RPC 부하 증가 | 네트워크 수 × 지갑 수만큼 RPC 호출 증가 | `Promise.allSettled` + RPC Pool 기존 Rate Limiter 활용. PositionTracker sync 주기는 기존 유지 |
| 3 | `defi_positions` 마이그레이션 | `environment` 컬럼 추가 시 기존 데이터 기본값 설정 필요 | `ALTER TABLE ADD COLUMN environment TEXT DEFAULT 'mainnet'` — 기존 행은 메인넷으로 안전하게 기본 설정 |
| 4 | 테스트넷 컨트랙트 주소 가용성 | 일부 프로토콜은 테스트넷 배포 없음 | 테스트넷 미배포 프로토콜(Pendle, Drift, Hyperliquid Perp/Spot, Kamino)은 `[]` 반환으로 graceful skip. 테스트넷 배포 확인된 프로토콜: Lido(Sepolia stETH), Aave V3(Sepolia), Jito(devnet). 지원 여부를 주소 매핑 존재로 판단 |
| 5 | IPositionProvider breaking change | 8개 프로바이더 동시 수정 필요 | Phase 1에서 인터페이스 + 전 프로바이더 시그니처를 한 번에 변경. 내부 전용이므로 외부 영향 없음 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 3개 |
| 신규 파일 | 3-5개 (PositionQueryContext 타입, 멀티체인 주소 매핑, DB 마이그레이션) |
| 수정 파일 | 18-25개 (8개 프로바이더 + PositionTracker + API 라우트 + Admin UI) |
| DB 마이그레이션 | 1건 (`defi_positions.environment` 컬럼 추가) |
| 예상 LOC 변경 | +1,200/-300 (멀티체인 주소 매핑 + 테스트 추가, 하드코딩 제거) |

---

*생성일: 2026-03-16*
*관련 분석: DeFi 포지션 대시보드 테스트넷 미표시 이슈 (2026-03-16)*
*선행: 없음 (독립 실행 가능)*
