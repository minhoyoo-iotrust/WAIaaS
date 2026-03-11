# 마일스톤 m31-13: DeFi 포지션 대시보드 완성

- **Status:** PLANNED
- **Milestone:** v31.13

## 목표

기존 PositionTracker 인프라와 Admin Dashboard DeFi 섹션을 활용하여, **미구현 상태인 6개 DeFi 프로바이더의 `getPositions()` 로직을 구현**하고 PositionTracker에 연결한다. Admin Dashboard에서 스테이킹, 렌딩, Yield, Perp 등 모든 DeFi 예치 포지션을 카테고리별·프로바이더별로 조회할 수 있도록 완성한다.

> **선행**: 없음 (기존 인프라 활용)
> **참조**: PositionTracker, IPositionProvider, `GET /v1/admin/defi/positions`

---

## 배경

v28.4~v31.4에 걸쳐 12개 DeFi ActionProvider를 구현했으나, 포지션 추적(`getPositions()`)은 Kamino(Solana Lending)만 완성되어 있다. 나머지 프로바이더는 빈 배열을 반환하거나 PositionTracker에 연결되지 않았다.

### 현재 포지션 추적 현황

| Provider | 카테고리 | `getPositions()` | PositionTracker 연결 |
|----------|---------|-----------------|---------------------|
| Kamino | LENDING | ✅ 구현 완료 | ✅ 연결됨 |
| Aave V3 | LENDING | ❌ 빈 배열 반환 | ✅ 연결됨 |
| Pendle | YIELD | ❌ 빈 배열 반환 | ✅ 연결됨 |
| Lido | STAKING | ❌ 미구현 | ❌ 미연결 |
| Jito | STAKING | ❌ 미구현 | ❌ 미연결 |
| Drift | PERP | ⚠️ SDK 내부 구현 있음 | ❌ 미연결 |
| Hyperliquid | PERP | ⚠️ MarketData 내부 구현 있음 | ❌ 미연결 |

### 기존 인프라 (변경 불필요)

- `defi_positions` DB 테이블 (v52 스키마)
- `PositionTracker` 서비스 (카테고리별 주기적 동기화: LENDING 5분, PERP 1분, STAKING 15분, YIELD 1시간)
- `PositionWriteQueue` (메모리 버퍼 → 배치 upsert)
- `GET /v1/admin/defi/positions` API (totalValueUsd, worstHealthFactor, activeCount)
- Admin Dashboard DeFi 섹션 (총 가치, Health Factor, 활성 포지션 표시)

---

## 요구사항

### R1. Lido 스테이킹 포지션 추적

- **R1-1.** `LidoStakingActionProvider`에 `IPositionProvider` 인터페이스 구현
- **R1-2.** `getPositions()`: 지갑의 stETH/wstETH 잔액 조회 → STAKING 포지션 반환
  - `category: 'STAKING'`, `provider: 'lido'`
  - `assetId`: CAIP-19 형식 (예: `eip155:1/erc20:{stETH_address}`)
  - `amount`: stETH 수량, `amountUsd`: 가격 오라클 기반 USD 환산
  - `metadata`: `{ protocol: 'lido', tokenType: 'stETH' | 'wstETH', apr?: number }`
- **R1-3.** wstETH → stETH 환산 비율 반영 (wstETH는 래핑 토큰이므로 실제 스테이킹 수량 계산)
- **R1-4.** `ActionProviderRegistry`에 Lido를 PositionProvider로 등록

### R2. Jito 스테이킹 포지션 추적

- **R2-1.** `JitoStakingActionProvider`에 `IPositionProvider` 인터페이스 구현
- **R2-2.** `getPositions()`: 지갑의 jitoSOL 잔액 조회 → STAKING 포지션 반환
  - `category: 'STAKING'`, `provider: 'jito'`
  - `assetId`: CAIP-19 형식
  - `amount`: jitoSOL 수량, `amountUsd`: 가격 오라클 기반 USD 환산
  - `metadata`: `{ protocol: 'jito', tokenType: 'jitoSOL', apr?: number }`
- **R2-3.** jitoSOL → SOL 환산 비율 반영 (실제 스테이킹 SOL 수량 계산)
- **R2-4.** `ActionProviderRegistry`에 Jito를 PositionProvider로 등록

### R3. Aave V3 렌딩 포지션 추적

- **R3-1.** `AaveV3ActionProvider`의 기존 빈 `getPositions()` 구현 완성
- **R3-2.** aToken 잔액 조회로 예치(Supply) 포지션 추출
  - `metadata`: `{ positionType: 'SUPPLY', apy?: number }`
- **R3-3.** debtToken(variableDebt/stableDebt) 잔액 조회로 대출(Borrow) 포지션 추출
  - `metadata`: `{ positionType: 'BORROW', interestRateMode: 'VARIABLE' | 'STABLE', apy?: number }`
- **R3-4.** Health Factor 계산: Aave Pool `getUserAccountData()` 호출 → `metadata.healthFactor` 포함
- **R3-5.** USD 가치: Aave 오라클 가격 활용 (별도 가격 오라클 호출 최소화)

### R4. Pendle Yield 포지션 추적

- **R4-1.** `PendleActionProvider`의 기존 빈 `getPositions()` 구현 완성
- **R4-2.** PT(Principal Token) 잔액 조회 → YIELD 포지션 반환
  - `metadata`: `{ tokenType: 'PT', maturity: ISO8601, underlyingAsset, impliedApy?: number }`
- **R4-3.** YT(Yield Token) 잔액 조회 → YIELD 포지션 반환
  - `metadata`: `{ tokenType: 'YT', maturity: ISO8601, underlyingAsset, impliedApy?: number }`
- **R4-4.** 만기(maturity) 정보 포함: 만기일 경과 시 `status: 'MATURED'` 자동 전환

### R5. Drift Perp 포지션 연결

- **R5-1.** `DriftPerpActionProvider`에 `IPositionProvider` 인터페이스 구현
- **R5-2.** 기존 Drift SDK의 포지션 조회 로직을 `getPositions()`로 래핑
  - `category: 'PERP'`, `provider: 'drift'`
  - `metadata`: `{ market, side: 'LONG' | 'SHORT', entryPrice, markPrice, leverage, unrealizedPnl, liquidationPrice }`
- **R5-3.** `ActionProviderRegistry`에 Drift를 PositionProvider로 등록

### R6. Hyperliquid Perp/Spot 포지션 연결

- **R6-1.** `HyperliquidPerpProvider`에 `IPositionProvider` 인터페이스 구현
- **R6-2.** 기존 `MarketData`/`ExchangeClient`의 포지션 조회 로직을 `getPositions()`로 래핑
  - Perp: `category: 'PERP'`, `provider: 'hyperliquid'`
  - `metadata`: `{ market, side, entryPrice, markPrice, leverage, unrealizedPnl, liquidationPrice, marginUsed }`
- **R6-3.** `HyperliquidSpotProvider`에 `IPositionProvider` 인터페이스 구현 (spot 잔액 포지션)
- **R6-4.** `ActionProviderRegistry`에 Hyperliquid를 PositionProvider로 등록

### R7. Admin Dashboard UX 개선

- **R7-1.** 카테고리별 필터 탭: STAKING / LENDING / YIELD / PERP / ALL
- **R7-2.** 프로바이더별 그룹핑: 같은 프로바이더 포지션을 묶어서 표시 (예: Aave V3 → Supply 3건, Borrow 1건)
- **R7-3.** 포지션 상세 정보 표시: metadata 기반으로 카테고리별 맞춤 UI
  - STAKING: 프로토콜, 토큰 타입, APR
  - LENDING: Supply/Borrow 구분, Health Factor 경고(< 1.5 주의, < 1.2 위험), APY
  - YIELD: PT/YT 구분, 만기일, Implied APY
  - PERP: 마켓, Long/Short, 진입가, 미실현 PnL, 청산가
- **R7-4.** Health Factor 글로벌 경고: 전체 지갑 중 worst health factor가 임계값 미만일 때 대시보드 상단 경고 배너
- **R7-5.** 지갑별 필터: 특정 지갑의 DeFi 포지션만 조회
- **R7-6.** 자동 새로고침: 30초 주기 (기존 대시보드 패턴 유지)

### R8. 테스트

- **R8-1.** 각 프로바이더 `getPositions()` 단위 테스트 (모킹된 RPC/API 응답 기반)
- **R8-2.** PositionTracker 통합 테스트: 신규 프로바이더 등록 후 동기화 확인
- **R8-3.** Admin API 테스트: 카테고리별 필터링, 집계 정확성
- **R8-4.** Admin UI 컴포넌트 테스트: 필터 탭, 그룹핑, 경고 배너

---

## 설계 결정

### D1. 기존 인프라 활용 — 신규 DB/API 변경 없음

PositionTracker, defi_positions 테이블, Admin API가 이미 범용적으로 설계되어 있다. 각 프로바이더에 `getPositions()` 로직만 추가하면 기존 파이프라인(동기화 → DB upsert → API 조회 → Dashboard 표시)이 자동으로 동작한다. DB 마이그레이션, API 엔드포인트 추가 불필요.

### D2. 가격 조회 전략: 프로바이더 내부 오라클 우선

USD 환산 시 각 프로바이더의 내부 가격 소스를 우선 사용한다:
- Aave: Aave Oracle (`getAssetPrice()`)
- Lido/Jito: PriceOracleService (기존 DeFi Price Oracle, v1.5)
- Pendle: Pendle SDK 가격
- Drift/Hyperliquid: 각 거래소 마켓 데이터

별도의 통합 가격 서비스 구축은 범위 밖.

### D3. Perp 포지션의 기존 코드 래핑

Drift와 Hyperliquid는 이미 포지션 조회 로직이 내부에 구현되어 있다(SDK/MarketData). 이를 새로 작성하지 않고 `IPositionProvider.getPositions()` 어댑터로 래핑하여 PositionTracker에 연결한다.

### D4. 카테고리별 동기화 주기 유지

기존 PositionTracker의 카테고리별 폴링 주기(LENDING 5분, PERP 1분, STAKING 15분, YIELD 1시간)를 그대로 유지한다. 스테이킹은 변동이 느리므로 15분, Perp은 빠른 갱신이 필요하므로 1분이 적절하다.

---

## 영향 범위

| 파일/영역 | 변경 내용 |
|----------|----------|
| `packages/actions/src/providers/lido/index.ts` | IPositionProvider 구현, getPositions() 추가 |
| `packages/actions/src/providers/jito/index.ts` | IPositionProvider 구현, getPositions() 추가 |
| `packages/actions/src/providers/aave-v3/index.ts` | 기존 빈 getPositions() 로직 완성 |
| `packages/actions/src/providers/pendle/index.ts` | 기존 빈 getPositions() 로직 완성 |
| `packages/actions/src/providers/drift/index.ts` | IPositionProvider 구현, 기존 SDK 래핑 |
| `packages/actions/src/providers/hyperliquid/perp.ts` | IPositionProvider 구현, MarketData 래핑 |
| `packages/actions/src/providers/hyperliquid/spot.ts` | IPositionProvider 구현 |
| `packages/admin/src/pages/dashboard.tsx` | 카테고리 필터, 프로바이더 그룹핑, 경고 배너 |
| `packages/admin/src/components/` | DeFi 포지션 상세 컴포넌트 (카테고리별 맞춤 표시) |

---

## 범위 밖 (명시적 제외)

| 항목 | 이유 | 대안 |
|------|------|------|
| DB 마이그레이션 | 기존 defi_positions 테이블로 충분 | — |
| 새 API 엔드포인트 | 기존 `/v1/admin/defi/positions`로 충분 | — |
| 통합 가격 오라클 서비스 | 각 프로바이더 내부 가격 소스 사용 | 필요 시 별도 마일스톤 |
| DCent Swap/Across Bridge/LI.FI 포지션 | 스왑/브릿지는 일회성 거래, 지속 포지션 아님 | — |
| MCP/SDK 포지션 조회 확장 | 기존 세션 API `/v1/wallet/positions` 이미 존재 | — |
| 알림 연동 (Health Factor 경고 푸시) | Dashboard 표시만 범위 내 | 필요 시 별도 이슈 |
