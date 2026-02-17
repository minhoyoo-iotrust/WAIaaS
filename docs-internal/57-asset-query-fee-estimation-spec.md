# 자산 조회 + 수수료 추정 스펙 (CHAIN-EXT-02)

**문서 ID:** CHAIN-EXT-02
**작성일:** 2026-02-07
**상태:** 완료
**참조:** CORE-04 (27-chain-adapter-interface.md), CHAIN-SOL (31-solana-adapter-detail.md), API-SPEC (37-rest-api-complete-spec.md), KILL-AUTO-EVM (36-killswitch-autostop-evm.md), CHAIN-EXT-01 (56-token-transfer-extension-spec.md)
**요구사항:** TOKEN-03 (자산 조회), TOKEN-04 (수수료 추정), TOKEN-05 (테스트 시나리오)

---

## 1. 개요

### 1.1 목적

이 문서는 WAIaaS v0.6 Phase 22의 CHAIN-EXT-02 산출물로서, 지갑 보유 자산 조회(getAssets), 토큰 전송 수수료 추정(estimateFee 확장), 토큰 전송 테스트 시나리오를 정의한다.

지갑이 보유한 모든 토큰(네이티브 + SPL/ERC-20)을 조회하고, 토큰 전송 전 정확한 수수료를 예측할 수 있도록 한다. 또한 SPL/ERC-20 토큰 전송의 테스트 전략을 정의하여 Phase 25 통합 테스트의 기초를 놓는다.

### 1.2 범위

| 요구사항 | 커버리지 |
|----------|---------|
| TOKEN-03 | getAssets() 인터페이스 + AssetInfo 스키마 + Solana/EVM 구현 설계 + REST API |
| TOKEN-04 | estimateFee 확장 (SPL ATA 생성 비용 동적 조회, ERC-20 gas 추정) |
| TOKEN-05 | 테스트 레벨 4개, 보안 시나리오 8개, Mock 경계 3개 |

### 1.3 getAssets() 복원 배경

v0.1의 `IBlockchainAdapter`에 존재하던 `getAssets(walletAddress): Promise<Asset[]>` 메서드가 v0.2에서 "v0.3 이연"으로 제거되었다(27-chain-adapter-interface.md 1.1절). v0.6에서 토큰 전송이 추가되면서 지갑이 보유한 자산 목록을 조회할 수 있어야 하므로, getAssets()를 IChainAdapter의 14번째 메서드로 복원한다.

> **[v0.8] sweepAll 교차 참조:** v0.8에서 추가된 `sweepAll()`(27-chain-adapter-interface.md §6.11, IChainAdapter 20번째 메서드)은 `getAssets()`로 지갑 보유 토큰 잔액을 조회한 후 배치 전송한다. sweepAll의 1단계가 `getAssets(address) -> AssetInfo[]`이며, 이 결과로 토큰별 transfer + closeAccount instruction을 구성한다 (objectives/v0.8 §5.4 참조).

### 1.4 핵심 원칙

| 원칙 | 설명 | 적용 |
|------|------|------|
| **Self-Hosted 원칙** | 외부 인덱서(Alchemy, Moralis)에 의존하지 않는다 | EVM getAssets()는 ALLOWED_TOKENS 기반 보수적 조회 |
| **ALLOWED_TOKENS 기반 보수적 조회** | 지갑에 명시적으로 허용된 토큰만 조회한다 | 미등록 토큰은 조회 대상에서 제외 |
| **RPC 효율성** | 최소 RPC 호출로 최대 정보를 조회한다 | Solana: getTokenAccountsByOwner 단일 호출, EVM: multicall |
| **하위 호환** | 기존 네이티브 토큰 기능에 영향을 주지 않는다 | getAssets()는 네이티브 토큰을 첫 번째 항목으로 포함 |

---

## 2. AssetInfo 스키마

### 2.1 AssetInfo 인터페이스

파일 위치: `packages/core/src/interfaces/chain-adapter.types.ts`

```typescript
/**
 * 지갑이 보유한 개별 자산 정보.
 * getAssets()의 반환값 배열 요소이다.
 *
 * 네이티브 토큰(SOL, ETH)과 프로그램/컨트랙트 토큰(SPL, ERC-20)을
 * 하나의 타입으로 표현한다.
 *
 * 예시:
 * - SOL: { tokenAddress: 'native', symbol: 'SOL', name: 'Solana', decimals: 9, balance: 1_500_000_000n, type: 'native' }
 * - USDC (SPL): { tokenAddress: 'EPjFWdd5...', symbol: 'USDC', name: 'USD Coin', decimals: 6, balance: 50_000_000n, type: 'spl' }
 * - USDC (ERC-20): { tokenAddress: '0xA0b86991...', symbol: 'USDC', name: 'USD Coin', decimals: 6, balance: 50_000_000n, type: 'erc20' }
 */
interface AssetInfo {
  /**
   * 토큰 민트/컨트랙트 주소.
   * 네이티브 토큰이면 'native' 고정값.
   * - Solana SPL: 토큰 민트 주소 (Base58)
   * - EVM ERC-20: 토큰 컨트랙트 주소 (0x hex)
   */
  tokenAddress: string

  /** 토큰 심볼 (예: SOL, USDC, ETH, WETH) */
  symbol: string

  /** 토큰 이름 (예: Solana, USD Coin, Ethereum) */
  name: string

  /**
   * 소수점 자릿수.
   * - SOL: 9, ETH: 18, USDC: 6, USDT: 6
   * - UI에서 잔액 표시 시 balance / 10^decimals 로 변환
   */
  decimals: number

  /**
   * 잔액 (최소 단위, bigint).
   * - Solana: lamports (SOL) 또는 token amount (SPL)
   * - EVM: wei (ETH) 또는 smallest unit (ERC-20)
   */
  balance: bigint

  /** 로고 URI (선택적). known_tokens 레지스트리에서 제공 */
  logoUri?: string

  /**
   * 토큰 유형.
   * - 'native': 네이티브 토큰 (SOL, ETH)
   * - 'spl': Solana SPL Token 또는 Token-2022
   * - 'erc20': EVM ERC-20 토큰
   */
  type: 'native' | 'spl' | 'erc20'
}
```

### 2.2 AssetInfoSchema (Zod - REST API 응답용)

```typescript
import { z } from 'zod'

/**
 * REST API 응답용 AssetInfo Zod 스키마.
 * balance를 string으로 직렬화한다 (JSON은 bigint를 지원하지 않음).
 */
const AssetInfoSchema = z.object({
  tokenAddress: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number().int().min(0).max(18),
  /** bigint를 string으로 직렬화. 예: '1500000000' */
  balance: z.string().regex(/^\d+$/, 'balance must be a non-negative integer string'),
  logoUri: z.string().url().optional(),
  type: z.enum(['native', 'spl', 'erc20']),
})
```

### 2.3 v0.1 Asset 타입과의 차이점 대조

| 항목 | v0.1 (`Asset`) | v0.6 (`AssetInfo`) | 변경 근거 |
|------|----------------|-------------------|----------|
| 구조 | 중첩: `{ identifier: AssetIdentifier, balance: Balance }` | flat 구조 | v0.2 BalanceInfo 패턴(flat)에 맞춤 |
| 식별자 | `AssetIdentifier { chain, type, contractAddress?, tokenId? }` | `tokenAddress: string` + `type` | 단순화. chain은 어댑터 컨텍스트에서 결정 |
| 잔액 | `Balance { raw: bigint, formatted: string, usdValue? }` | `balance: bigint` | raw만 반환, formatted/usdValue는 클라이언트에서 계산 |
| 토큰 유형 | `type: 'native' \| 'token' \| 'nft'` | `type: 'native' \| 'spl' \| 'erc20'` | NFT 제외 (v0.6 범위 외), 체인별 토큰 유형 구분 |
| 메타데이터 | 별도 조회 (tokenId 기반) | `symbol`, `name`, `decimals` 인라인 | 메타데이터를 항상 포함하여 별도 조회 불필요 |

---

## 3. IChainAdapter.getAssets() 인터페이스

### 3.1 메서드 시그니처

14번째 메서드로 IChainAdapter에 추가한다.

파일 위치: `packages/core/src/interfaces/IChainAdapter.ts`

```typescript
interface IChainAdapter {
  // ... 기존 13개 메서드 ...

  // ===============================================================
  // 자산 조회
  // ===============================================================

  /**
   * [14] 주소가 보유한 모든 자산(네이티브 + 토큰)을 조회한다.
   *
   * 반환 순서:
   * 1. 네이티브 토큰 (SOL, ETH) -- 항상 첫 번째
   * 2. 이후 토큰은 잔액 내림차순으로 정렬 (동일 잔액 시 symbol 알파벳순)
   *
   * 에러 처리:
   * - RPC 연결 실패 시 ChainError(RPC_ERROR) throw (빈 배열 반환 아님)
   * - 개별 토큰 조회 실패 시 해당 항목 skip + 경고 로그
   *   (예: Token-2022 확장 토큰 파싱 실패)
   *
   * @param address - 조회 대상 주소 (체인별 포맷)
   * @returns 보유 자산 목록 (AssetInfo[])
   *
   * @throws {ChainError} code=INVALID_ADDRESS -- 주소 형식 오류
   * @throws {ChainError} code=RPC_ERROR -- RPC 호출 실패
   * @throws {ChainError} code=NOT_CONNECTED -- 어댑터 미연결
   */
  getAssets(address: string): Promise<AssetInfo[]>
}
```

### 3.2 IChainAdapter 메서드 전체 목록 (14개)

| # | 메서드 | 카테고리 | v0.2 | v0.6 |
|---|--------|---------|------|------|
| 1 | `connect(rpcUrl)` | 연결 | O | O |
| 2 | `disconnect()` | 연결 | O | O |
| 3 | `isConnected()` | 연결 | O | O |
| 4 | `getHealth()` | 연결 | O | O |
| 5 | `isValidAddress(addr)` | 검증 | O | O |
| 6 | `getBalance(addr)` | 조회 | O | O |
| 7 | `buildTransaction(req)` | 파이프라인 | O | O |
| 8 | `simulateTransaction(tx)` | 파이프라인 | O | O |
| 9 | `signTransaction(tx, key)` | 파이프라인 | O | O |
| 10 | `submitTransaction(signed)` | 파이프라인 | O | O |
| 11 | `getTransactionStatus(hash)` | 조회 | O | O |
| 12 | `waitForConfirmation(hash, timeout)` | 조회 | O | O |
| 13 | `estimateFee(req)` | 추정 | O | O (확장) |
| 14 | **`getAssets(addr)`** | **조회** | X | **신규** |

### 3.3 EvmAdapterStub 확장

36-killswitch-autostop-evm.md의 EvmAdapterStub에 getAssets()를 추가한다.

```typescript
class EvmAdapterStub implements IChainAdapter {
  // ... 기존 13개 메서드 (all throw CHAIN_NOT_SUPPORTED) ...

  /**
   * [14] getAssets stub.
   * EvmAdapter 실 구현 시 ALLOWED_TOKENS 기반 보수적 조회로 대체.
   */
  async getAssets(address: string): Promise<AssetInfo[]> {
    throw new ChainError(
      'EVM adapter is a stub. getAssets() not implemented.',
      'CHAIN_NOT_SUPPORTED',
    )
  }
}
```

---

## 4. Solana getAssets() 구현 설계

### 4.1 구현 알고리즘

```
[1] getBalance(address) ─────────────────────────> 네이티브 SOL AssetInfo
         │
[2] rpc.getTokenAccountsByOwner(address,           SPL 토큰 계정 목록
         { programId: TOKEN_PROGRAM_ID },            (Token Program)
         { encoding: 'jsonParsed' })
         │
[3] rpc.getTokenAccountsByOwner(address,           Token-2022 토큰 계정 목록
         { programId: TOKEN_2022_PROGRAM_ID },
         { encoding: 'jsonParsed' })
         │
[4] 각 토큰 계정에서 mint, amount, decimals 추출   jsonParsed 자동 파싱
         │
[5] 잔액 0인 토큰 계정 제외                        close되지 않은 빈 ATA 필터링
         │
[6] 토큰 메타데이터(symbol, name) 조회              3단계 전략 (아래 4.2 참조)
         │
[7] 잔액 내림차순 정렬                              네이티브 SOL 첫 번째
         │
[8] AssetInfo[] 반환
```

### 4.2 토큰 메타데이터 조회 전략

토큰의 symbol, name을 결정하기 위한 3단계 fallback 전략:

| 우선순위 | 소스 | RPC 호출 | 설명 |
|----------|------|---------|------|
| 1순위 | known_tokens 로컬 레지스트리 | 0회 | config.toml `[tokens.solana]` 섹션. 주요 토큰(USDC, USDT, wSOL 등) 사전 등록 |
| 2순위 | Metaplex Token Metadata Program | 1회/토큰 | mint 주소에서 PDA 유도 -> metadata 계정 조회. on-chain 메타데이터 |
| 3순위 | 미확인 토큰 기본값 | 0회 | symbol='UNKNOWN', name='Unknown Token ({mint 주소 앞 8자})' |

**config.toml [tokens.solana] 예시:**

```toml
[tokens.solana]
# 주요 SPL 토큰 레지스트리 (symbol, name, decimals, logoUri)
# 이 목록은 getAssets() 메타데이터 조회의 1순위 소스이다.

[[tokens.solana.known]]
address = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
symbol = "USDC"
name = "USD Coin"
decimals = 6

[[tokens.solana.known]]
address = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
symbol = "USDT"
name = "Tether USD"
decimals = 6

[[tokens.solana.known]]
address = "So11111111111111111111111111111111111111112"
symbol = "wSOL"
name = "Wrapped SOL"
decimals = 9

[[tokens.solana.known]]
address = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"
symbol = "JUP"
name = "Jupiter"
decimals = 6
```

### 4.3 성능 고려

| 항목 | RPC 호출 수 | 비고 |
|------|------------|------|
| 네이티브 SOL 잔액 | 1 | `getBalance()` |
| Token Program 토큰 계정 | 1 | `getTokenAccountsByOwner` -- 모든 SPL 토큰을 단일 호출로 반환 |
| Token-2022 토큰 계정 | 1 | `getTokenAccountsByOwner` -- 별도 Program ID |
| 메타데이터 (known_tokens) | 0 | 로컬 레지스트리 lookup |
| 메타데이터 (Metaplex) | N | 미등록 토큰 수만큼 추가 호출 |
| **총합 (known_tokens만)** | **3** | **최소 RPC 호출** |
| **총합 (미등록 N개)** | **3 + N** | 미등록 토큰이 많으면 성능 저하 가능 |

**최적화 전략:**
- known_tokens 레지스트리에 주요 토큰을 충분히 등록하면 Metaplex 조회를 최소화할 수 있다
- Metaplex 메타데이터 조회 결과는 인메모리 캐시(TTL 1시간)에 저장하여 반복 호출 방지
- 토큰 계정이 50개 이상인 경우 경고 로그 출력 (비정상적으로 많은 토큰 보유)

### 4.4 코드 수준 의사코드

```typescript
import type { Address, Rpc, SolanaRpcApi } from '@solana/kit'

// Token Program IDs
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' as Address

// Metaplex Token Metadata Program ID
const METADATA_PROGRAM_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s' as Address

/**
 * SolanaAdapter.getAssets() 구현.
 */
async getAssets(address: string): Promise<AssetInfo[]> {
  this.ensureConnected()

  if (!this.isValidAddress(address)) {
    throw new ChainError('Invalid Solana address', 'INVALID_ADDRESS')
  }

  const assets: AssetInfo[] = []

  // ── 1. 네이티브 SOL 잔액 ──
  const solBalance = await this.getBalance(address)
  assets.push({
    tokenAddress: 'native',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    balance: solBalance.balance,
    type: 'native',
  })

  // ── 2. Token Program SPL 토큰 조회 ──
  const tokenAccounts = await this.rpc!.getTokenAccountsByOwner(
    address as Address,
    { programId: TOKEN_PROGRAM_ID },
    { encoding: 'jsonParsed' },
  ).send()

  for (const account of tokenAccounts.value) {
    try {
      const parsed = account.account.data.parsed.info
      const mint: string = parsed.mint
      const amount: bigint = BigInt(parsed.tokenAmount.amount)
      const decimals: number = parsed.tokenAmount.decimals

      // 잔액 0인 계정 skip (close되지 않은 빈 ATA)
      if (amount === 0n) continue

      // 메타데이터 조회 (3단계 fallback)
      const metadata = await this.resolveTokenMetadata(mint, decimals)

      assets.push({
        tokenAddress: mint,
        symbol: metadata.symbol,
        name: metadata.name,
        decimals,
        balance: amount,
        logoUri: metadata.logoUri,
        type: 'spl',
      })
    } catch (err) {
      // 개별 토큰 파싱 실패 시 skip + 경고 로그
      this.logger.warn(`Failed to parse token account: ${account.pubkey}`, err)
    }
  }

  // ── 3. Token-2022 토큰 조회 ──
  const token2022Accounts = await this.rpc!.getTokenAccountsByOwner(
    address as Address,
    { programId: TOKEN_2022_PROGRAM_ID },
    { encoding: 'jsonParsed' },
  ).send()

  for (const account of token2022Accounts.value) {
    try {
      const parsed = account.account.data.parsed.info
      const mint: string = parsed.mint
      const amount: bigint = BigInt(parsed.tokenAmount.amount)
      const decimals: number = parsed.tokenAmount.decimals

      if (amount === 0n) continue

      const metadata = await this.resolveTokenMetadata(mint, decimals)

      assets.push({
        tokenAddress: mint,
        symbol: metadata.symbol,
        name: metadata.name,
        decimals,
        balance: amount,
        logoUri: metadata.logoUri,
        type: 'spl', // Token-2022도 type='spl'로 통합 (프로그램 구분은 내부)
      })
    } catch (err) {
      this.logger.warn(`Failed to parse Token-2022 account: ${account.pubkey}`, err)
    }
  }

  // ── 4. 잔액 내림차순 정렬 (네이티브 첫 번째 유지) ──
  const [native, ...tokens] = assets
  tokens.sort((a, b) => {
    if (a.balance > b.balance) return -1
    if (a.balance < b.balance) return 1
    return a.symbol.localeCompare(b.symbol)
  })

  return [native, ...tokens]
}

/**
 * 토큰 메타데이터 3단계 fallback 조회.
 */
private async resolveTokenMetadata(
  mint: string,
  decimals: number,
): Promise<{ symbol: string; name: string; logoUri?: string }> {
  // 1순위: known_tokens 로컬 레지스트리
  const known = this.knownTokens.get(mint)
  if (known) {
    return { symbol: known.symbol, name: known.name, logoUri: known.logoUri }
  }

  // 2순위: Metaplex Token Metadata Program (캐시 확인)
  const cached = this.metadataCache.get(mint)
  if (cached) return cached

  try {
    const metadataAddress = this.deriveMetadataPda(mint)
    const accountInfo = await this.rpc!.getAccountInfo(
      metadataAddress,
      { encoding: 'base64' },
    ).send()

    if (accountInfo.value) {
      const metadata = this.parseMetaplexMetadata(accountInfo.value.data)
      const result = {
        symbol: metadata.symbol.replace(/\0/g, '').trim(),
        name: metadata.name.replace(/\0/g, '').trim(),
        logoUri: metadata.uri?.replace(/\0/g, '').trim() || undefined,
      }
      this.metadataCache.set(mint, result) // TTL 1시간 캐시
      return result
    }
  } catch {
    // Metaplex 조회 실패 -- 3순위로 fallback
  }

  // 3순위: 미확인 토큰 기본값
  return {
    symbol: 'UNKNOWN',
    name: `Unknown Token (${mint.slice(0, 8)})`,
  }
}
```

---

## 5. EVM getAssets() 구현 설계

### 5.1 ALLOWED_TOKENS 기반 보수적 조회

EVM 체인에는 Solana의 `getTokenAccountsByOwner`처럼 단일 RPC 호출로 모든 토큰을 조회하는 표준 메서드가 없다. 따라서 Self-Hosted 원칙에 따라 ALLOWED_TOKENS 정책에 등록된 토큰만 조회하는 보수적 접근을 채택한다.

```
[1] getBalance(address) ──────────────────────────> 네이티브 ETH AssetInfo
         │
[2] ALLOWED_TOKENS 정책에서 해당 지갑의              정책 DB에서 토큰 목록 로드
    EVM 토큰 목록 로드
         │
    ┌── ALLOWED_TOKENS 미설정 시 ──┐
    │   known_tokens 레지스트리만    │
    │   조회 (config.toml 기반)      │
    └───────────────────────────────┘
         │
[3] 각 토큰에 대해                                   개별 balanceOf 호출
    readContract({ functionName: 'balanceOf' })       또는 multicall 일괄 호출
         │
[4] 잔액 > 0인 토큰만 결과에 포함                    0 잔액 필터링
         │
[5] 잔액 내림차순 정렬                               네이티브 ETH 첫 번째
         │
[6] AssetInfo[] 반환
```

### 5.2 multicall 최적화

N개 토큰의 잔액을 1회 RPC 호출로 조회한다.

```typescript
import { parseAbi } from 'viem'

const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
])

/**
 * EVM multicall을 사용한 일괄 토큰 잔액 조회.
 * viem의 publicClient.multicall()은 Multicall3 컨트랙트를 통해
 * N개의 readContract 호출을 1회 RPC로 묶어 실행한다.
 *
 * Multicall3 배포 주소 (대부분의 EVM 체인):
 * 0xcA11bde05977b3631167028862bE2a173976CA11
 */
async function batchGetBalances(
  publicClient: PublicClient,
  ownerAddress: `0x${string}`,
  tokenAddresses: `0x${string}`[],
): Promise<{ address: string; balance: bigint }[]> {
  const calls = tokenAddresses.map((tokenAddress) => ({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf' as const,
    args: [ownerAddress] as const,
  }))

  const results = await publicClient.multicall({ contracts: calls })

  return results.map((result, index) => ({
    address: tokenAddresses[index],
    balance: result.status === 'success' ? (result.result as bigint) : 0n,
  }))
}
```

### 5.3 known_tokens 레지스트리 (EVM)

```toml
[tokens.ethereum]
# 기본 포함 ERC-20 토큰 레지스트리
# ALLOWED_TOKENS 미설정 시 이 목록만 조회한다

[[tokens.ethereum.known]]
address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
symbol = "USDC"
name = "USD Coin"
decimals = 6

[[tokens.ethereum.known]]
address = "0xdAC17F958D2ee523a2206206994597C13D831ec7"
symbol = "USDT"
name = "Tether USD"
decimals = 6

[[tokens.ethereum.known]]
address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
symbol = "WETH"
name = "Wrapped Ether"
decimals = 18

[[tokens.ethereum.known]]
address = "0x6B175474E89094C44Da98b954EedeAC495271d0F"
symbol = "DAI"
name = "Dai Stablecoin"
decimals = 18
```

**토큰 조회 우선순위:**

| 조건 | 조회 대상 | 비고 |
|------|----------|------|
| ALLOWED_TOKENS 정책 설정됨 | ALLOWED_TOKENS 목록의 토큰 | 정책 기반 엄격 조회 |
| ALLOWED_TOKENS 미설정 | known_tokens 레지스트리만 | 기본 메이저 토큰(USDC, USDT, WETH, DAI) |

### 5.4 외부 인덱서 선택적 지원 (향후 확장)

설계 수준에서 ITokenDiscovery 인터페이스를 정의하여 향후 외부 인덱서 플러그인을 지원할 수 있도록 확장 포인트를 남긴다. v0.6에서는 기본 구현(AllowedTokensDiscovery)만 제공한다.

```typescript
/**
 * 토큰 발견 전략 인터페이스.
 * EVM getAssets()에서 조회할 토큰 목록을 결정한다.
 *
 * v0.6: AllowedTokensDiscovery (ALLOWED_TOKENS 정책 기반)
 * 향후: AlchemyDiscovery, MoralisDiscovery (외부 인덱서 플러그인)
 */
interface ITokenDiscovery {
  /**
   * 주소가 보유한 것으로 추정되는 토큰 목록을 반환한다.
   * 실제 잔액 조회(balanceOf)는 호출자가 수행한다.
   *
   * @param address - 조회 대상 주소
   * @param chain - 체인 식별자
   * @returns 조회 대상 토큰 정보 목록
   */
  discoverTokens(
    address: string,
    chain: ChainType,
  ): Promise<{ address: string; symbol: string; name: string; decimals: number }[]>
}

/**
 * ALLOWED_TOKENS 정책 기반 토큰 발견.
 * 지갑에 설정된 ALLOWED_TOKENS 정책의 토큰 목록 + known_tokens 레지스트리를 반환한다.
 */
class AllowedTokensDiscovery implements ITokenDiscovery {
  constructor(
    private readonly policyEngine: IPolicyEngine,
    private readonly knownTokens: Map<string, TokenRegistryEntry>,
  ) {}

  async discoverTokens(
    address: string,
    chain: ChainType,
  ): Promise<{ address: string; symbol: string; name: string; decimals: number }[]> {
    // 1. ALLOWED_TOKENS 정책에서 토큰 목록 로드
    const policies = await this.policyEngine.getPolicies(address, 'ALLOWED_TOKENS')
    const allowedTokens = policies.flatMap((p) => p.rules.allowed_tokens)

    // 2. ALLOWED_TOKENS 미설정 시 known_tokens 레지스트리 사용
    if (allowedTokens.length === 0) {
      return Array.from(this.knownTokens.values())
        .filter((t) => t.chain === chain)
        .map((t) => ({
          address: t.address,
          symbol: t.symbol,
          name: t.name,
          decimals: t.decimals,
        }))
    }

    // 3. 해당 체인의 토큰만 필터
    return allowedTokens
      .filter((t) => t.chain === chain)
      .map((t) => ({
        address: t.address,
        symbol: t.symbol,
        name: t.name ?? t.symbol,
        decimals: t.decimals,
      }))
  }
}
```

### 5.5 코드 수준 의사코드 (TypeScript, viem 기준)

```typescript
import type { PublicClient } from 'viem'

/**
 * EvmAdapter.getAssets() 구현.
 * ALLOWED_TOKENS 기반 보수적 조회. 외부 인덱서 의존 없음.
 */
async getAssets(address: string): Promise<AssetInfo[]> {
  this.ensureConnected()

  if (!this.isValidAddress(address)) {
    throw new ChainError('Invalid EVM address', 'INVALID_ADDRESS')
  }

  const assets: AssetInfo[] = []
  const addr = address as `0x${string}`

  // ── 1. 네이티브 ETH 잔액 ──
  const ethBalance = await this.publicClient!.getBalance({ address: addr })
  const nativeSymbol = this.getNativeSymbol() // chain에 따라 ETH, MATIC 등

  assets.push({
    tokenAddress: 'native',
    symbol: nativeSymbol,
    name: this.getNativeName(),
    decimals: 18,
    balance: ethBalance,
    type: 'native',
  })

  // ── 2. 조회 대상 토큰 목록 로드 ──
  const targetTokens = await this.tokenDiscovery.discoverTokens(address, this.chain)

  if (targetTokens.length === 0) {
    return assets // 조회 대상 토큰 없으면 네이티브만 반환
  }

  // ── 3. multicall로 일괄 잔액 조회 ──
  const tokenAddresses = targetTokens.map((t) => t.address as `0x${string}`)
  const balances = await batchGetBalances(this.publicClient!, addr, tokenAddresses)

  // ── 4. 잔액 > 0인 토큰만 결과에 포함 ──
  for (let i = 0; i < balances.length; i++) {
    if (balances[i].balance > 0n) {
      const token = targetTokens[i]
      assets.push({
        tokenAddress: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        balance: balances[i].balance,
        type: 'erc20',
      })
    }
  }

  // ── 5. 잔액 내림차순 정렬 (네이티브 첫 번째 유지) ──
  const [native, ...tokens] = assets
  tokens.sort((a, b) => {
    if (a.balance > b.balance) return -1
    if (a.balance < b.balance) return 1
    return a.symbol.localeCompare(b.symbol)
  })

  return [native, ...tokens]
}
```

---

## 6. REST API 엔드포인트

### 6.1 GET /v1/wallet/assets

지갑이 보유한 모든 자산(네이티브 + 토큰)을 조회하는 엔드포인트.

| 항목 | 값 |
|------|-----|
| Method | GET |
| Path | `/v1/wallet/assets` |
| Auth | sessionAuth (Bearer JWT) |
| 카테고리 | Session API (Agent) |

> **명명 변경:** 37-rest-api-complete-spec.md 섹션 12.5에서 v0.3 예약으로 명시된 `GET /v1/wallet/tokens`를 `GET /v1/wallet/assets`로 확정한다. `assets`가 네이티브 토큰과 프로그램/컨트랙트 토큰을 모두 포괄하는 정확한 명칭이다.

### 6.2 Query Parameters

```typescript
const AssetsQuerySchema = z.object({
  /**
   * 체인 필터. 멀티 체인 지갑 확장 시 사용.
   * v0.6에서는 지갑이 단일 체인에 바인딩되므로 생략 시 지갑 체인 자동 사용.
   */
  chain: z.enum(['solana', 'ethereum', 'polygon', 'arbitrum']).optional(),

  /**
   * 잔액 0인 토큰 포함 여부.
   * - false (기본): 잔액 > 0인 토큰만 반환
   * - true: 잔액 0인 토큰도 포함 (ALLOWED_TOKENS에 등록된 경우)
   */
  include_zero: z.coerce.boolean().default(false),
})
```

### 6.3 Response 200

```typescript
const AssetsResponseSchema = z.object({
  /** 자산 목록. 네이티브 토큰이 항상 첫 번째 */
  assets: z.array(AssetInfoSchema),

  /** 조회된 체인 */
  chain: z.enum(['solana', 'ethereum', 'polygon', 'arbitrum']),

  /** 조회 시각 (ISO 8601) */
  timestamp: z.string().datetime(),
})
```

**응답 예시 (Solana):**

```json
{
  "assets": [
    {
      "tokenAddress": "native",
      "symbol": "SOL",
      "name": "Solana",
      "decimals": 9,
      "balance": "1500000000",
      "type": "native"
    },
    {
      "tokenAddress": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "symbol": "USDC",
      "name": "USD Coin",
      "decimals": 6,
      "balance": "50000000",
      "type": "spl"
    },
    {
      "tokenAddress": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      "symbol": "USDT",
      "name": "Tether USD",
      "decimals": 6,
      "balance": "10000000",
      "type": "spl"
    }
  ],
  "chain": "solana",
  "timestamp": "2026-02-07T12:00:00Z"
}
```

**응답 예시 (EVM):**

```json
{
  "assets": [
    {
      "tokenAddress": "native",
      "symbol": "ETH",
      "name": "Ethereum",
      "decimals": 18,
      "balance": "500000000000000000",
      "type": "native"
    },
    {
      "tokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "symbol": "USDC",
      "name": "USD Coin",
      "decimals": 6,
      "balance": "100000000",
      "type": "erc20"
    }
  ],
  "chain": "ethereum",
  "timestamp": "2026-02-07T12:00:00Z"
}
```

### 6.4 에러 응답

| HTTP 코드 | 에러 코드 | 설명 |
|-----------|----------|------|
| 401 | `UNAUTHORIZED` | 세션 토큰 미제공 또는 만료 |
| 500 | `RPC_ERROR` | 체인 RPC 호출 실패 |
| 503 | `SERVICE_UNAVAILABLE` | 어댑터 미연결 (데몬 시작 중) |

### 6.5 Hono 라우터 구현 스케치

```typescript
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'

const assetsRoute = createRoute({
  method: 'get',
  path: '/v1/wallet/assets',
  tags: ['Wallet'],
  summary: '보유 자산 목록 조회',
  description: '지갑이 보유한 모든 자산(네이티브 + 토큰)을 조회한다.',
  security: [{ bearerAuth: [] }],
  request: {
    query: AssetsQuerySchema,
  },
  responses: {
    200: {
      description: '자산 목록 조회 성공',
      content: {
        'application/json': {
          schema: AssetsResponseSchema,
        },
      },
    },
    401: { description: 'Unauthorized' },
    500: { description: 'RPC Error' },
  },
})

app.openapi(assetsRoute, async (c) => {
  const session = c.get('session') // sessionAuth 미들웨어에서 주입
  const { chain, include_zero } = c.req.valid('query')

  const wallet = await walletService.getWallet(session.walletId)
  const adapter = adapterRegistry.getAdapter(wallet.chain)
  const assets = await adapter.getAssets(wallet.address)

  // include_zero 필터링
  const filtered = include_zero
    ? assets
    : assets.filter((a) => a.balance > 0n)

  return c.json({
    assets: filtered.map((a) => ({
      ...a,
      balance: a.balance.toString(), // bigint -> string 직렬화
    })),
    chain: wallet.chain,
    timestamp: new Date().toISOString(),
  })
})
```

### 6.6 37-rest-api-complete-spec.md 변경 요약

| 변경 | 상세 |
|------|------|
| 기존 v0.3 예약 `GET /v1/wallet/tokens` | `GET /v1/wallet/assets`로 명칭 확정 |
| Session API (Agent) 엔드포인트 수 | 7 -> 8 (GET /v1/wallet/assets 추가) |
| 전체 엔드포인트 수 | 31 -> 32 (GET /v1/wallet/assets 추가) |

---

## 7. 토큰 전송 수수료 추정 확장

### 7.1 기존 estimateFee() 인터페이스

현재(v0.2) estimateFee()는 네이티브 토큰 전송만 고려하여 `bigint`를 반환한다.

```typescript
// v0.2 현재 (27-chain-adapter-interface.md)
estimateFee(request: TransferRequest): Promise<bigint>
```

### 7.2 FeeEstimate 확장 타입

토큰 전송 수수료의 세부 항목을 표현하기 위해 반환 타입을 `FeeEstimate` 구조체로 확장한다.

```typescript
/**
 * 수수료 추정 결과.
 * estimateFee()의 반환 타입.
 *
 * v0.2에서는 bigint(= total)만 반환했으나,
 * v0.6에서 토큰 전송의 ATA 생성 비용, ERC-20 가스 등
 * 세부 항목을 구분하기 위해 구조체로 확장한다.
 *
 * 하위 호환: total 필드가 기존 bigint 반환값에 대응한다.
 */
interface FeeEstimate {
  /**
   * 기본 수수료 (lamports/wei).
   * - Solana: 서명당 5,000 lamports (단일 서명 = 5,000)
   * - EVM: gasLimit * baseFeePerGas (EIP-1559)
   */
  baseFee: bigint

  /**
   * 우선순위 수수료.
   * - Solana: getRecentPrioritizationFees 중앙값 기반
   * - EVM: maxPriorityFeePerGas * gasLimit
   */
  priorityFee: bigint

  /**
   * 총 수수료.
   * baseFee + priorityFee + (ataCreationCost ?? 0n)
   */
  total: bigint

  /**
   * Solana ATA 생성 비용 (토큰 전송 시에만 존재).
   * 수신자의 Associated Token Account가 미존재할 때 발생하는 rent-exempt 비용.
   * getMinimumBalanceForRentExemption(165) RPC로 동적 조회한다.
   * 현재 ~2,039,280 lamports (~0.00204 SOL).
   *
   * EVM 전송 시 undefined (ATA 개념 없음).
   * 네이티브 전송 시 undefined.
   */
  ataCreationCost?: bigint

  /**
   * 수수료 지불 통화.
   * 토큰 전송이라도 수수료는 항상 네이티브 토큰으로 지불된다.
   * - Solana: 'SOL'
   * - EVM: 'ETH' (Polygon일 때는 'MATIC' 등 체인별 네이티브)
   */
  feeCurrency: string
}
```

### 7.3 estimateFee() 시그니처 변경

```typescript
// v0.6 확장 (하위 호환 유지)
// TransferRequest에 token 필드가 포함될 수 있다 (CHAIN-EXT-01 참조)
estimateFee(request: TransferRequest): Promise<FeeEstimate>
```

> **하위 호환:** 기존 호출자가 `const fee = await adapter.estimateFee(req)` 후 `fee`를 bigint로 사용하던 코드는 `fee.total`로 변경해야 한다. 이 변경은 Phase 25에서 기존 문서 반영 시 일괄 처리한다.

### 7.4 Solana SPL 수수료 추정 상세

```typescript
/**
 * SolanaAdapter.estimateFee() -- SPL 토큰 전송 확장.
 */
async estimateFee(request: TransferRequest): Promise<FeeEstimate> {
  this.ensureConnected()

  // ── 1. Base Fee ──
  // Solana base fee: 서명 1개당 5,000 lamports (고정)
  const baseFee = 5_000n

  // ── 2. Priority Fee ──
  // getRecentPrioritizationFees 중앙값 기반
  const priorityFee = await this.getMedianPriorityFee()

  // ── 3. ATA 생성 비용 (토큰 전송 시에만) ──
  let ataCreationCost: bigint | undefined

  if (request.token) {
    // 수신자 ATA 존재 여부 확인
    const [destinationAta] = await findAssociatedTokenPda({
      owner: request.to as Address,
      mint: request.token.address as Address,
      tokenProgram: await this.resolveTokenProgram(request.token.address),
    })

    const accountInfo = await this.rpc!.getAccountInfo(destinationAta).send()
    const needCreateAta = !accountInfo.value

    if (needCreateAta) {
      // 동적 조회: getMinimumBalanceForRentExemption(165)
      // 165 = Token Account 데이터 크기 (bytes)
      const rentExempt = await this.rpc!
        .getMinimumBalanceForRentExemption(165n)
        .send()
      ataCreationCost = rentExempt
    }
    // 발신자 ATA는 이미 존재한다고 가정 (토큰 보유 중이므로)
  }

  // ── 4. Compute Unit ──
  // SPL 전송: ~450 CU (기본 200K limit 내, 추가 비용 없음)
  // CU 가격은 priorityFee에 이미 반영됨

  // ── 5. 총 수수료 ──
  const total = baseFee + priorityFee + (ataCreationCost ?? 0n)

  // ── 6. SOL 잔액 부족 검증 ──
  const solBalance = await this.getBalance(request.from)
  if (request.token) {
    // 토큰 전송: SOL 잔액이 수수료를 커버하는지 확인
    if (solBalance.balance < total) {
      throw new ChainError(
        `Insufficient SOL for token transfer fee. ` +
        `Required: ${total} lamports, Available: ${solBalance.balance} lamports. ` +
        `SOL is needed for transaction fee${ataCreationCost ? ' and ATA creation' : ''}.`,
        'INSUFFICIENT_BALANCE',
      )
    }
  }

  return {
    baseFee,
    priorityFee,
    total,
    ataCreationCost,
    feeCurrency: 'SOL',
  }
}
```

**Solana SPL 수수료 구성 요소:**

| 항목 | 값 | 조건 | 비고 |
|------|-----|------|------|
| Base Fee | 5,000 lamports | 항상 | 서명 1개 기준 |
| Priority Fee | 가변 | 항상 | `getRecentPrioritizationFees` 중앙값 |
| ATA 생성 비용 | ~2,039,280 lamports | 수신자 ATA 미존재 시 | `getMinimumBalanceForRentExemption(165)` 동적 조회 |
| Compute Unit | ~450 CU | SPL 전송 | 기본 200K limit 내, 추가 비용 없음 |
| **총 수수료** | baseFee + priorityFee + ataCreationCost | | SOL로 지불 |

### 7.5 EVM ERC-20 수수료 추정 상세

```typescript
/**
 * EvmAdapter.estimateFee() -- ERC-20 토큰 전송 확장.
 */
async estimateFee(request: TransferRequest): Promise<FeeEstimate> {
  this.ensureConnected()

  let gasLimit: bigint
  let maxFeePerGas: bigint
  let maxPriorityFeePerGas: bigint

  if (request.token) {
    // ── ERC-20 전송 수수료 추정 ──

    // 1. transfer calldata 인코딩
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [request.to as `0x${string}`, request.amount],
    })

    // 2. Gas 추정 (estimateGas)
    gasLimit = await this.publicClient!.estimateGas({
      to: request.token.address as `0x${string}`, // 컨트랙트 주소
      data,
      account: request.from as `0x${string}`,
      value: 0n, // ETH 전송 없음
    })

    // 3. EIP-1559 수수료 조회
    const fees = await this.publicClient!.estimateFeesPerGas()
    maxFeePerGas = fees.maxFeePerGas!
    maxPriorityFeePerGas = fees.maxPriorityFeePerGas!
  } else {
    // ── 네이티브 ETH 전송 수수료 추정 ──
    gasLimit = 21_000n // 기본 전송 gas

    const fees = await this.publicClient!.estimateFeesPerGas()
    maxFeePerGas = fees.maxFeePerGas!
    maxPriorityFeePerGas = fees.maxPriorityFeePerGas!
  }

  // ── 수수료 계산 (EIP-1559) ──
  const baseFee = gasLimit * (maxFeePerGas - maxPriorityFeePerGas)
  const priorityFee = gasLimit * maxPriorityFeePerGas
  const total = gasLimit * maxFeePerGas // baseFee + priorityFee

  return {
    baseFee,
    priorityFee,
    total,
    // EVM에는 ATA 개념이 없으므로 ataCreationCost는 undefined
    feeCurrency: this.getNativeSymbol(), // 'ETH', 'MATIC' 등
  }
}
```

**EVM ERC-20 수수료 구성 요소:**

| 항목 | 값 | 조건 | 비고 |
|------|-----|------|------|
| Gas Limit | ~65,000 gas | ERC-20 transfer | `estimateGas()`로 동적 추정 |
| Gas Limit (비표준) | ~100,000 gas | USDT 등 비표준 ERC-20 | `estimateGas()`가 정확히 반영 |
| maxFeePerGas | 가변 (EIP-1559) | 항상 | `estimateFeesPerGas()` |
| maxPriorityFeePerGas | 가변 | 항상 | `estimateFeesPerGas()` |
| **총 수수료** | gasLimit * maxFeePerGas (wei) | | ETH로 지불 |

### 7.6 수수료 비교 테이블 (네이티브 vs 토큰)

| | Solana 네이티브 | Solana SPL | EVM 네이티브 | EVM ERC-20 |
|---|---|---|---|---|
| 기본 수수료 | 5,000 lamports | 5,000 lamports | ~21,000 gas | ~65,000 gas |
| 우선순위 수수료 | 가변 | 가변 | 가변 | 가변 |
| ATA 생성 비용 | N/A | 0 또는 ~2,039,280 lamports | N/A | N/A |
| Compute Unit | ~200 CU | ~450 CU | N/A | N/A |
| 수수료 통화 | SOL | SOL | ETH | ETH |
| 추정 방식 | 고정 + RPC | 고정 + RPC + ATA 확인 | estimateGas + estimateFeesPerGas | estimateGas + estimateFeesPerGas |
| 일반 수수료 범위 | ~0.000005 SOL | ~0.000005-0.002 SOL | ~0.0003-0.003 ETH | ~0.001-0.01 ETH |

---

## 8. 토큰 전송 테스트 시나리오 (TOKEN-05)

v0.4 테스트 프레임워크(41-test-architecture-coverage-spec.md) 기반으로 토큰 전송 관련 테스트 시나리오를 정의한다.

### 8.1 Level 1: Unit Tests (Mock 의존성)

Mock된 의존성으로 개별 함수/모듈의 로직을 검증한다.

| ID | 시나리오 | 입력 | 기대 결과 | Mock 대상 |
|----|---------|------|----------|----------|
| UT-TOKEN-01 | TransferRequest.token 파싱: 유효한 토큰 필드 | `{ from, to, amount, token: { address, decimals: 6, symbol: 'USDC' } }` | 파싱 성공, 토큰 전송으로 분기 | 없음 (순수 타입 검증) |
| UT-TOKEN-02 | TransferRequest.token 하위 호환 | `{ from, to, amount }` (token 미제공) | 네이티브 전송으로 분기 | 없음 |
| UT-TOKEN-03 | TransferRequest.token 잘못된 주소 형식 | `{ token: { address: 'invalid', decimals: 6, symbol: 'X' } }` | 검증 실패, INVALID_ADDRESS | 없음 |
| UT-TOKEN-04 | ALLOWED_TOKENS 정책 검증: 허용 토큰 | USDC 전송, ALLOWED_TOKENS에 USDC 포함 | 정책 통과 | MockPolicyEngine |
| UT-TOKEN-05 | ALLOWED_TOKENS 정책 검증: 미등록 토큰 거부 | 미등록 토큰 전송 시도 | TOKEN_NOT_ALLOWED 에러 | MockPolicyEngine |
| UT-TOKEN-06 | ALLOWED_TOKENS 정책 미설정 시 기본 동작 | 토큰 전송, ALLOWED_TOKENS 정책 없음 | unknown_token_action 기본값(DENY) 적용 | MockPolicyEngine |
| UT-TOKEN-07 | AllowedTokensRuleSchema Zod 검증: 유효 | 올바른 rules JSON | 파싱 성공 | 없음 |
| UT-TOKEN-08 | AllowedTokensRuleSchema Zod 검증: 무효 | 누락된 필드 rules JSON | Zod 에러 | 없음 |
| UT-TOKEN-09 | FeeEstimate 계산: ATA 미존재 | SPL 전송 + ATA 생성 필요 | total = baseFee + priorityFee + ataCreationCost | MockRpc |
| UT-TOKEN-10 | FeeEstimate 계산: ATA 존재 | SPL 전송 + ATA 이미 존재 | total = baseFee + priorityFee, ataCreationCost = undefined | MockRpc |
| UT-TOKEN-11 | FeeEstimate 계산: ERC-20 gas 추정 | ERC-20 transfer | total = gasLimit * maxFeePerGas | MockEvmClient |
| UT-TOKEN-12 | AssetInfo 직렬화: bigint -> string | balance: 1500000000n | balance: '1500000000' | 없음 |
| UT-TOKEN-13 | AssetInfo type enum 검증 | type: 'spl' | Zod 검증 통과 | 없음 |
| UT-TOKEN-14 | AssetInfo type enum 무효값 | type: 'invalid' | Zod 에러 | 없음 |

### 8.2 Level 2: Integration Tests (Local DB + Mock RPC)

로컬 SQLite + Mock RPC 클라이언트로 모듈 간 연동을 검증한다.

| ID | 시나리오 | 구성 | 기대 결과 |
|----|---------|------|----------|
| IT-TOKEN-01 | SPL 토큰 전송 파이프라인 | MockSolanaRpc -> SolanaAdapter.buildTransaction(token req) | buildSplTokenTransfer 호출, UnsignedTransaction 반환 |
| IT-TOKEN-02 | SPL 전송 실패: 잔액 부족 | MockSolanaRpc (잔액 0) -> buildTransaction | INSUFFICIENT_BALANCE 에러 |
| IT-TOKEN-03 | ERC-20 토큰 전송 파이프라인 | MockEvmClient -> EvmAdapter.buildTransaction(token req) | ERC-20 transfer calldata 생성 |
| IT-TOKEN-04 | ERC-20 전송 실패: 시뮬레이션 실패 | MockEvmClient (simulateContract revert) | SIMULATION_FAILED 에러 |
| IT-TOKEN-05 | ALLOWED_TOKENS 정책 DB 라운드트립 | 정책 생성 -> DB 저장 -> 조회 -> 검증 | 정책 규칙 일관성 유지 |
| IT-TOKEN-06 | ALLOWED_TOKENS 정책 변경 후 재검증 | 정책 수정 -> 이전에 허용된 토큰 거부 | 변경된 정책 즉시 반영 |
| IT-TOKEN-07 | getAssets() Solana 통합 | MockSolanaRpc (SOL + 2 SPL) -> getAssets() | AssetInfo[] 3개 (native 첫 번째) |
| IT-TOKEN-08 | getAssets() EVM 통합 | MockEvmClient (ETH + 1 ERC-20) -> getAssets() | AssetInfo[] 2개 |
| IT-TOKEN-09 | getAssets() -> REST API 응답 변환 | getAssets() 결과 -> AssetsResponseSchema | bigint -> string 변환, Zod 검증 통과 |
| IT-TOKEN-10 | estimateFee() -> ATA 비용 포함 응답 | MockSolanaRpc (ATA 미존재) -> estimateFee(token req) | FeeEstimate.ataCreationCost > 0 |

### 8.3 Level 3: Solana Validator Tests (solana-test-validator)

로컬 Solana validator에서 실제 SPL 토큰 전송을 검증한다.

| ID | 시나리오 | 사전 조건 | 기대 결과 |
|----|---------|----------|----------|
| VT-TOKEN-01 | SPL 토큰 민팅 + ATA 생성 + 전송 | 로컬 validator, 테스트 토큰 민트 | 발신자 잔액 감소, 수신자 잔액 증가 |
| VT-TOKEN-02 | Token-2022 토큰 기본 전송 | Token-2022 프로그램으로 민트된 토큰 | transferChecked 성공 |
| VT-TOKEN-03 | ATA 미존재 수신자로 전송 | 수신자 ATA 미생성 상태 | ATA 자동 생성 + 토큰 전송 성공 |
| VT-TOKEN-04 | 잔액 부족 전송 시도 | 발신자 토큰 잔액 < 전송량 | 트랜잭션 실패, 에러 코드 확인 |
| VT-TOKEN-05 | SOL 잔액 부족으로 토큰 전송 실패 | 토큰 잔액 충분, SOL 잔액 0 | INSUFFICIENT_BALANCE (수수료 부족) |
| VT-TOKEN-06 | getAssets() 실제 조회 | 지갑이 SOL + 2개 SPL 보유 | AssetInfo[] 3개 반환, 잔액 정확 |
| VT-TOKEN-07 | transferChecked decimals 검증 | decimals 불일치 전달 | 프로그램 에러 (TokenInvalidAccountError) |
| VT-TOKEN-08 | estimateFee() ATA 비용 정확도 | 수신자 ATA 미존재 | ataCreationCost = 실제 rent-exempt 금액 |

### 8.4 Level 4: EVM Local Tests (Hardhat/Anvil)

로컬 EVM 노드에서 실제 ERC-20 전송을 검증한다.

| ID | 시나리오 | 사전 조건 | 기대 결과 |
|----|---------|----------|----------|
| ET-TOKEN-01 | ERC-20 배포 + transfer + balanceOf | Anvil 로컬 노드, 테스트 ERC-20 배포 | transfer 성공, balanceOf 확인 |
| ET-TOKEN-02 | USDT-like 비표준 ERC-20 transfer | bool 미반환 ERC-20 배포 | 시뮬레이션 성공, 전송 성공 |
| ET-TOKEN-03 | gas 추정 정확도 | ERC-20 transfer estimateGas | 추정 gas >= 실제 gas used |
| ET-TOKEN-04 | 잔액 부족 시뮬레이션 | 발신자 토큰 잔액 < 전송량 | simulateContract revert |
| ET-TOKEN-05 | ETH 잔액 부족으로 ERC-20 전송 실패 | 토큰 잔액 충분, ETH 잔액 0 | 가스 부족 에러 |
| ET-TOKEN-06 | getAssets() multicall 조회 | 지갑이 ETH + 3개 ERC-20 보유 | AssetInfo[] 4개 반환 |
| ET-TOKEN-07 | getAssets() 일부 토큰 조회 실패 | 1개 컨트랙트 주소 무효 | 유효한 토큰만 반환, 경고 로그 |
| ET-TOKEN-08 | estimateFee() ERC-20 gas 정확도 | ERC-20 transfer | total >= 실제 수수료 |

### 8.5 보안 시나리오

42-security-scenario-test-spec.md 확장. 토큰 전송 관련 공격 벡터를 검증한다.

| ID | 시나리오 | 공격 벡터 | 기대 방어 | 검증 방법 |
|----|---------|----------|----------|----------|
| SEC-TOKEN-01 | 미등록 토큰 전송 시도 | ALLOWED_TOKENS에 없는 토큰 전송 요청 | ALLOWED_TOKENS 정책 거부 | Unit + Integration |
| SEC-TOKEN-02 | 악성 토큰 민트/컨트랙트 주소 | 존재하지 않거나 악성 컨트랙트 주소 제공 | 주소 검증 실패 또는 시뮬레이션 실패 | Unit + Integration |
| SEC-TOKEN-03 | Token-2022 TransferFee 확장 토큰 | TransferFee 확장이 활성화된 토큰 전송 | 감지 후 거부 (v0.6 범위 외 확장) | Validator Test |
| SEC-TOKEN-04 | ERC-20 approve 위장 (transfer 시그니처 조작) | transfer() 호출인 척하지만 다른 함수 호출 | 시뮬레이션에서 예상 외 동작 감지 | Integration + Anvil |
| SEC-TOKEN-05 | SOL/ETH 잔액 0에서 토큰 전송 시도 | 네이티브 잔액 0으로 수수료 지불 불가 | 수수료 부족 사전 차단 (estimateFee 단계) | Unit + Validator/Anvil |
| SEC-TOKEN-06 | decimals 불일치 공격 | 잘못된 decimals 값으로 전송 시도 | transferChecked에서 거부 (Solana), on-chain decimals 검증 (EVM) | Validator + Anvil |
| SEC-TOKEN-07 | 매우 큰 토큰 금액 전송 (uint256 max) | amount = 2^256 - 1 | overflow 방지: bigint 범위 검증, 잔액 초과 체크 | Unit |
| SEC-TOKEN-08 | 동일 주소로 자기 전송 | from === to 주소 | 정책 또는 어댑터에서 감지, 경고/거부 | Unit + Integration |

### 8.6 Mock 경계 정의

테스트에서 사용할 Mock 객체의 인터페이스와 범위를 정의한다.

#### MockSolanaRpc

```typescript
/**
 * Solana RPC Mock.
 * SPL/Token-2022 토큰 관련 RPC 메서드를 Mock한다.
 */
interface MockSolanaRpc {
  // 기존 (v0.2에서 정의)
  getBalance(address: Address): Promise<{ value: bigint }>
  getHealth(): Promise<'ok'>
  getRecentPrioritizationFees(): Promise<PrioritizationFeeEntry[]>

  // v0.6 추가: SPL 토큰 조회
  getTokenAccountsByOwner(
    address: Address,
    filter: { programId: Address },
    config: { encoding: 'jsonParsed' },
  ): Promise<{ value: TokenAccountInfo[] }>

  // v0.6 추가: ATA 존재 확인 + rent-exempt 비용
  getAccountInfo(address: Address): Promise<{ value: AccountInfo | null }>
  getMinimumBalanceForRentExemption(size: bigint): Promise<bigint>
}

/**
 * Mock용 토큰 계정 정보.
 * getTokenAccountsByOwner의 jsonParsed 응답 형태.
 */
interface TokenAccountInfo {
  pubkey: Address
  account: {
    data: {
      parsed: {
        info: {
          mint: string
          tokenAmount: {
            amount: string  // '50000000'
            decimals: number // 6
            uiAmount: number // 50.0
          }
        }
      }
    }
  }
}
```

#### MockEvmClient

```typescript
/**
 * EVM Client Mock.
 * ERC-20 토큰 관련 viem 메서드를 Mock한다.
 */
interface MockEvmClient {
  // 기존 (v0.2에서 정의)
  getBalance(params: { address: `0x${string}` }): Promise<bigint>
  estimateGas(params: EstimateGasParams): Promise<bigint>
  estimateFeesPerGas(): Promise<FeeValues>

  // v0.6 추가: ERC-20 읽기/시뮬레이션
  readContract(params: ReadContractParams): Promise<unknown>
  // 지원 functionName: 'balanceOf', 'decimals', 'symbol', 'name'

  simulateContract(params: SimulateContractParams): Promise<{ result: unknown }>
  // 지원 functionName: 'transfer'

  // v0.6 추가: multicall
  multicall(params: { contracts: ContractCall[] }): Promise<MulticallResult[]>
}
```

#### MockPolicyEngine

```typescript
/**
 * PolicyEngine Mock.
 * ALLOWED_TOKENS 정책 반환을 Mock한다.
 */
interface MockPolicyEngine {
  /**
   * 지갑의 정책 목록 반환.
   * - 허용 토큰 설정 시: ALLOWED_TOKENS 정책 포함
   * - 미설정 시: 빈 배열
   * - 거부 설정 시: unknown_token_action = 'DENY'
   */
  getPolicies(
    walletId: string,
    policyType?: string,
  ): Promise<PolicyEntry[]>

  /**
   * 단일 정책 평가 결과 반환.
   */
  evaluate(
    walletId: string,
    request: TransferRequest,
  ): Promise<PolicyEvaluationResult>
}
```

---

## 9. 기존 문서 변경 요약

이 문서(CHAIN-EXT-02)로 인해 Phase 25에서 반영할 기존 문서 변경 목록이다.

### 9.1 수정 대상

| 문서 | 섹션 | 변경 내용 | 변경 유형 |
|------|------|----------|----------|
| 27-chain-adapter-interface.md | 3. IChainAdapter | getAssets() 14번째 메서드 추가 | 인터페이스 확장 |
| 27-chain-adapter-interface.md | 2. 공통 타입 | AssetInfo 타입 추가, FeeEstimate 타입 추가 | 타입 추가 |
| 27-chain-adapter-interface.md | 2.3 TransferRequest | (CHAIN-EXT-01과 공동) token? 필드 참조 | 타입 확장 |
| 27-chain-adapter-interface.md | 13. estimateFee | 반환 타입 bigint -> FeeEstimate 변경 | 시그니처 변경 |
| 31-solana-adapter-detail.md | 1.3 메서드 매핑 | 14번째 메서드(getAssets) 행 추가 | 테이블 확장 |
| 31-solana-adapter-detail.md | 신규 섹션 | getAssets() Solana 구현 설계 (이 문서 섹션 4) | 섹션 추가 |
| 31-solana-adapter-detail.md | 4.4 estimateFee | ATA 생성 비용 포함 확장 (이 문서 섹션 7.4) | 로직 확장 |
| 36-killswitch-autostop-evm.md | 10. EvmAdapterStub | getAssets() stub 추가 | 메서드 추가 |
| 36-killswitch-autostop-evm.md | 10. EvmAdapterStub | estimateFee() 반환 타입 FeeEstimate 변경 노트 | 노트 추가 |
| 37-rest-api-complete-spec.md | 1.4 전체 엔드포인트 요약 | Session API 7 -> 8, 전체 31 -> 32 | 수치 변경 |
| 37-rest-api-complete-spec.md | 12.5 v0.3 확장 | GET /v1/wallet/tokens -> GET /v1/wallet/assets 확정 | 엔드포인트 확정 |
| 37-rest-api-complete-spec.md | 신규 | GET /v1/wallet/assets 엔드포인트 스펙 추가 | 엔드포인트 추가 |

### 9.2 테스트 문서 확장

| 문서 | 변경 내용 |
|------|----------|
| 41-test-architecture-coverage-spec.md (docs/v0.4/) | Mock 경계 추가: MockSolanaRpc (SPL 토큰 메서드), MockEvmClient (ERC-20 메서드) |
| 42-mock-boundaries-interfaces-contracts.md (docs/v0.4/) | SEC-TOKEN-01~08 보안 시나리오 추가 |
| 48-blockchain-test-environment-strategy.md (docs/v0.4/) | SPL 토큰 테스트 시나리오 (validator): VT-TOKEN-01~08 |

### 9.3 참조만 (수정 없음)

| 문서 | 참조 이유 |
|------|----------|
| 32-transaction-pipeline-api.md | 파이프라인 6단계 구조 변경 없음. Stage 1 type 분기 확인 |
| 25-sqlite-schema.md | transactions.type 'TOKEN_TRANSFER' 사용 확인 |
| 52-auth-model-redesign.md | 인증 체계 변경 없음. sessionAuth가 자산 조회에도 동일 적용 |
| 56-token-transfer-extension-spec.md | ALLOWED_TOKENS 정책 참조, TransferRequest.token 참조 |

---

## 부록 A: AssetInfo 직렬화 규칙

### A.1 bigint -> string 변환

JSON은 bigint를 지원하지 않으므로, REST API 응답에서 balance 필드를 string으로 직렬화한다.

```typescript
// 내부 타입 (TypeScript)
const asset: AssetInfo = {
  tokenAddress: 'native',
  symbol: 'SOL',
  name: 'Solana',
  decimals: 9,
  balance: 1_500_000_000n, // bigint
  type: 'native',
}

// REST API 응답 (JSON)
{
  "tokenAddress": "native",
  "symbol": "SOL",
  "name": "Solana",
  "decimals": 9,
  "balance": "1500000000", // string
  "type": "native"
}
```

### A.2 UI 표시 변환 (클라이언트 책임)

```typescript
// 클라이언트에서 balance 표시 변환
const displayBalance = Number(BigInt(asset.balance)) / Math.pow(10, asset.decimals)
// 1500000000 / 10^9 = 1.5 SOL
```

---

## 부록 B: config.toml [tokens] 전체 구조

```toml
# ─── 토큰 레지스트리 ───
# getAssets() 메타데이터 조회의 1순위 소스.
# 여기에 등록된 토큰은 RPC 메타데이터 조회 없이 즉시 메타정보를 제공한다.
# 사용자가 필요에 따라 토큰을 추가할 수 있다.

[tokens]

# Solana 토큰 레지스트리
[[tokens.solana.known]]
address = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
symbol = "USDC"
name = "USD Coin"
decimals = 6

[[tokens.solana.known]]
address = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
symbol = "USDT"
name = "Tether USD"
decimals = 6

[[tokens.solana.known]]
address = "So11111111111111111111111111111111111111112"
symbol = "wSOL"
name = "Wrapped SOL"
decimals = 9

[[tokens.solana.known]]
address = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"
symbol = "JUP"
name = "Jupiter"
decimals = 6

# Ethereum 토큰 레지스트리
[[tokens.ethereum.known]]
address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
symbol = "USDC"
name = "USD Coin"
decimals = 6

[[tokens.ethereum.known]]
address = "0xdAC17F958D2ee523a2206206994597C13D831ec7"
symbol = "USDT"
name = "Tether USD"
decimals = 6

[[tokens.ethereum.known]]
address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
symbol = "WETH"
name = "Wrapped Ether"
decimals = 18

[[tokens.ethereum.known]]
address = "0x6B175474E89094C44Da98b954EedeAC495271d0F"
symbol = "DAI"
name = "Dai Stablecoin"
decimals = 18

# Polygon 토큰 레지스트리 (필요 시 추가)
# [[tokens.polygon.known]]
# address = "0x..."
```
