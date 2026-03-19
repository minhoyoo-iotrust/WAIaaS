# Issue #392: PositionTracker가 지갑 UUID를 온체인 주소로 사용하여 모든 DeFi 포지션 조회 실패

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** FIXED
- **발견 경로:** Admin 대시보드 DeFi 포지션 반복 미표시 조사 — #386, #380 수정 후에도 재발

## 배경

Admin 대시보드 DeFi Positions 섹션에서 "Include testnets" 활성화 후에도 Lido 스테이킹 포지션이 표시되지 않는다. 이 문제는 이전 이슈(#386 Holesky 주소 불일치, #380 RPC URL 누락) 수정 후에도 반복된다.

반면 지갑 상세 → Assets 탭의 "Staking Positions"에는 정상 표시된다.

## 원인 분석

### 핵심 버그: walletId(UUID v7)를 온체인 주소로 사용

`PositionQueryContext`에는 `walletId` 필드만 존재하며, 이는 DB의 `wallets.id` (UUID v7, 예: `01927f6e-3c4a-7f1b-...`)이다. **지갑의 블록체인 주소(`public_key` 컬럼, 예: `0x1234...abcd`)가 아니다.**

모든 포지션 프로바이더가 이 UUID를 `balanceOf(address)` 등 온체인 RPC 호출의 주소 파라미터로 사용한다:

```typescript
// position-tracker.ts:155-157 — UUID를 walletId로 전달
const wallets = this.sqlite
  .prepare("SELECT id, chain, environment FROM wallets WHERE status = 'ACTIVE'")
  .all(); // wallet.id = UUID v7

// position-tracker.ts:179-184 — UUID가 ctx.walletId에 들어감
const ctx: PositionQueryContext = {
  walletId: wallet.id,  // ← UUID v7, NOT 블록체인 주소
  chain, networks, environment, rpcUrls,
};
```

### 영향받는 프로바이더 (전수 조사)

| 프로바이더 | 파일 | 사용 위치 | 호출 내용 |
|-----------|------|----------|----------|
| **Lido Staking** | `lido-staking/index.ts` | L230, L255 | `encodeBalanceOfCalldata(walletId)` — stETH/wstETH 잔액 |
| **Aave V3** | `aave-v3/index.ts` | L490, L502, L505 | `encodeGetUserAccountDataCalldata(walletId)`, `encodeBalanceOfCalldata(walletId)` — aToken/debtToken 잔액 |
| **Pendle Yield** | `pendle/index.ts` | L349, L373 | `encodeBalanceOfCalldata(walletId)` — PT/YT 토큰 잔액 |
| **Jito Staking** | `jito-staking/index.ts` | L176 | `getJitoSolBalance(walletId)` — JitoSOL 잔액 |
| **Kamino Lending** | `kamino/index.ts` | L430 | `walletAddress: walletId` — obligation 조회 |
| **Drift Perp** | `drift/index.ts` | L353 | `sdkWrapper.getPositions(walletId)` — 포지션 조회 |
| **Hyperliquid Spot** | `hyperliquid/spot-provider.ts` | L369 | `marketData.getSpotBalances(walletId)` — 잔액 조회 |

### 결과

- `addressToHex(walletId)` → UUID의 첫 2글자(`01`)가 `0x` 접두사로 오인되어 잘림 → 잘못된 주소로 RPC 호출
- EVM: `balanceOf(잘못된주소)` → 항상 0 반환 → 포지션 미생성
- Solana: 유효하지 않은 base58 파싱 실패 → 에러 → 포지션 미생성
- 모든 프로바이더에서 `defi_positions` 테이블에 아무 행도 삽입되지 않음

### Assets 탭은 왜 작동하는가

Assets 탭의 "Staking Positions"는 **다른 데이터 소스**를 사용한다:
- `GET /v1/admin/wallets/{id}/staking` → `aggregateStakingBalance()` → **`transactions` 테이블 기반 집계** (온체인 조회 없음)
- DeFi Positions 대시보드 → `GET /v1/admin/defi/positions` → **`defi_positions` 테이블 조회** (PositionTracker가 온체인 동기화한 데이터)

## 수정 사항

### 1. `PositionQueryContext`에 `walletAddress` 필드 추가

```typescript
// packages/core/src/interfaces/position-provider.types.ts
export interface PositionQueryContext {
  walletId: string;
  walletAddress: string;  // ← 신규: 온체인 주소 (0x... 또는 base58)
  chain: ChainType;
  networks: readonly NetworkType[];
  environment: EnvironmentType;
  rpcUrls: Record<string, string>;
}
```

### 2. PositionTracker에서 `public_key` 조회 후 전달

```typescript
// packages/daemon/src/services/defi/position-tracker.ts:155-157
const wallets = this.sqlite
  .prepare("SELECT id, public_key, chain, environment FROM wallets WHERE status = 'ACTIVE'")
  .all() as Array<{ id: string; public_key: string; chain: string; environment: string }>;

// :179-184
const ctx: PositionQueryContext = {
  walletId: wallet.id,
  walletAddress: wallet.public_key,  // ← 블록체인 주소
  chain, networks, environment, rpcUrls,
};
```

### 3. 모든 포지션 프로바이더에서 `walletAddress` 사용

각 프로바이더의 `getPositions()` 및 내부 메서드에서 `walletId` 대신 `ctx.walletAddress`를 온체인 호출에 사용:

- **Lido**: `encodeBalanceOfCalldata(walletAddress)` (L230, L255)
- **Aave V3**: `encodeGetUserAccountDataCalldata(walletAddress)` (L490), `encodeBalanceOfCalldata(walletAddress)` (L502, L505)
- **Pendle**: `encodeBalanceOfCalldata(walletAddress)` (L349, L373)
- **Jito**: `getJitoSolBalance(walletAddress)` (L176)
- **Kamino**: `walletAddress: walletAddress` (L430)
- **Drift**: `sdkWrapper.getPositions(walletAddress)` (L353)
- **Hyperliquid Spot**: `marketData.getSpotBalances(walletAddress)` (L369)

### 4. 테스트 헬퍼 업데이트

```typescript
// position-tracker.test.ts:44-49
function insertTestWallet(sqlite: DatabaseType, walletId: string): void {
  sqlite.prepare(
    "INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at) VALUES (?, 'test', 'ethereum', 'testnet', ?, 'ACTIVE', 0, 0)"
  ).run(walletId, '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01'); // 유효한 주소 사용
}
```

## 영향 범위

- **전 프로바이더 영향**: 모든 IPositionProvider 구현체 (7개 프로바이더)
- **DeFi 대시보드 전체 비작동**: defi_positions 테이블에 데이터 미적재 → 대시보드 빈 상태
- **HealthFactorMonitor 비작동**: Aave 포지션이 없으므로 health factor 모니터링 무효화
- **MarginMonitor 비작동**: Drift/Hyperliquid 포지션 미감지

## 테스트 항목

- [ ] `PositionQueryContext`에 `walletAddress` 필드 추가 확인 (타입 레벨)
- [ ] PositionTracker가 `SELECT id, public_key` 쿼리 후 `walletAddress`에 `public_key` 전달 확인
- [ ] Lido `getPositions()`이 `walletAddress`로 `balanceOf` 호출 확인 (단위 테스트)
- [ ] Aave V3 `getPositions()`이 `walletAddress`로 `getUserAccountData`, `balanceOf` 호출 확인
- [ ] Pendle `getPositions()`이 `walletAddress`로 PT/YT `balanceOf` 호출 확인
- [ ] Jito `getPositions()`이 `walletAddress`로 JitoSOL 잔액 조회 확인
- [ ] Kamino `getPositions()`이 `walletAddress`로 obligation 조회 확인
- [ ] Drift `getPositions()`이 `walletAddress`로 포지션 조회 확인
- [ ] Hyperliquid Spot `getPositions()`이 `walletAddress`로 잔액 조회 확인
- [ ] 통합 테스트: PositionTracker → Lido Provider → defi_positions 테이블 행 삽입 확인
- [ ] Admin 대시보드: "Include testnets" 토글 시 테스트넷 Lido 포지션 표시 확인
- [ ] 기존 PositionTracker 유닛 테스트 전수 통과 확인
