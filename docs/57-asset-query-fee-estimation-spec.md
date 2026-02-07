# 자산 조회 + 수수료 추정 스펙 (CHAIN-EXT-02)

**문서 ID:** CHAIN-EXT-02
**작성일:** 2026-02-07
**상태:** 완료
**참조:** CORE-04 (27-chain-adapter-interface.md), CHAIN-SOL (31-solana-adapter-detail.md), API-SPEC (37-rest-api-complete-spec.md), KILL-AUTO-EVM (36-killswitch-autostop-evm.md), CHAIN-EXT-01 (56-token-transfer-extension-spec.md)
**요구사항:** TOKEN-03 (자산 조회), TOKEN-04 (수수료 추정), TOKEN-05 (테스트 시나리오)

---

## 1. 개요

### 1.1 목적

이 문서는 WAIaaS v0.6 Phase 22의 CHAIN-EXT-02 산출물로서, 에이전트 보유 자산 조회(getAssets), 토큰 전송 수수료 추정(estimateFee 확장), 토큰 전송 테스트 시나리오를 정의한다.

에이전트가 보유한 모든 토큰(네이티브 + SPL/ERC-20)을 조회하고, 토큰 전송 전 정확한 수수료를 예측할 수 있도록 한다. 또한 SPL/ERC-20 토큰 전송의 테스트 전략을 정의하여 Phase 25 통합 테스트의 기초를 놓는다.

### 1.2 범위

| 요구사항 | 커버리지 |
|----------|---------|
| TOKEN-03 | getAssets() 인터페이스 + AssetInfo 스키마 + Solana/EVM 구현 설계 + REST API |
| TOKEN-04 | estimateFee 확장 (SPL ATA 생성 비용 동적 조회, ERC-20 gas 추정) |
| TOKEN-05 | 테스트 레벨 4개, 보안 시나리오 8개, Mock 경계 3개 |

### 1.3 getAssets() 복원 배경

v0.1의 `IBlockchainAdapter`에 존재하던 `getAssets(walletAddress): Promise<Asset[]>` 메서드가 v0.2에서 "v0.3 이연"으로 제거되었다(27-chain-adapter-interface.md 1.1절). v0.6에서 토큰 전송이 추가되면서 에이전트가 보유한 자산 목록을 조회할 수 있어야 하므로, getAssets()를 IChainAdapter의 14번째 메서드로 복원한다.

### 1.4 핵심 원칙

| 원칙 | 설명 | 적용 |
|------|------|------|
| **Self-Hosted 원칙** | 외부 인덱서(Alchemy, Moralis)에 의존하지 않는다 | EVM getAssets()는 ALLOWED_TOKENS 기반 보수적 조회 |
| **ALLOWED_TOKENS 기반 보수적 조회** | 에이전트에 명시적으로 허용된 토큰만 조회한다 | 미등록 토큰은 조회 대상에서 제외 |
| **RPC 효율성** | 최소 RPC 호출로 최대 정보를 조회한다 | Solana: getTokenAccountsByOwner 단일 호출, EVM: multicall |
| **하위 호환** | 기존 네이티브 토큰 기능에 영향을 주지 않는다 | getAssets()는 네이티브 토큰을 첫 번째 항목으로 포함 |

---

## 2. AssetInfo 스키마

### 2.1 AssetInfo 인터페이스

파일 위치: `packages/core/src/interfaces/chain-adapter.types.ts`

```typescript
/**
 * 에이전트가 보유한 개별 자산 정보.
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
[2] ALLOWED_TOKENS 정책에서 해당 에이전트의          정책 DB에서 토큰 목록 로드
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
 * 에이전트에 설정된 ALLOWED_TOKENS 정책의 토큰 목록 + known_tokens 레지스트리를 반환한다.
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

에이전트가 보유한 모든 자산(네이티브 + 토큰)을 조회하는 엔드포인트.

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
   * 체인 필터. 멀티 체인 에이전트 확장 시 사용.
   * v0.6에서는 에이전트가 단일 체인에 바인딩되므로 생략 시 에이전트 체인 자동 사용.
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
  description: '에이전트가 보유한 모든 자산(네이티브 + 토큰)을 조회한다.',
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

  const agent = await agentService.getAgent(session.agentId)
  const adapter = adapterRegistry.getAdapter(agent.chain)
  const assets = await adapter.getAssets(agent.address)

  // include_zero 필터링
  const filtered = include_zero
    ? assets
    : assets.filter((a) => a.balance > 0n)

  return c.json({
    assets: filtered.map((a) => ({
      ...a,
      balance: a.balance.toString(), // bigint -> string 직렬화
    })),
    chain: agent.chain,
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

> **섹션 7-9** (수수료 추정 확장, 테스트 시나리오, 기존 문서 변경 요약)은 Task 2에서 추가된다.
