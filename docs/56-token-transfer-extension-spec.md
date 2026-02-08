# 토큰 전송 확장 스펙 (CHAIN-EXT-01)

**문서 ID:** CHAIN-EXT-01
**작성일:** 2026-02-07
**상태:** 완료
**Phase:** 22 (토큰 확장 설계)
**참조:** CORE-04 (27-chain-adapter-interface.md), CHAIN-SOL (31-solana-adapter-detail.md), LOCK-MECH (33-time-lock-approval-mechanism.md), TX-PIPE (32-transaction-pipeline-api.md), API-SPEC (37-rest-api-complete-spec.md), CORE-02 (25-sqlite-schema.md), ENUM-MAP (45-enum-unified-mapping.md), KILL-AUTO-EVM (36-killswitch-autostop-evm.md)
**요구사항:** TOKEN-01 (TransferRequest.token 확장), TOKEN-02 (ALLOWED_TOKENS 정책)

---

## 1. 개요

### 1.1 목적

이 문서는 WAIaaS의 IChainAdapter와 트랜잭션 파이프라인을 **SPL/ERC-20 토큰 전송**까지 확장하는 정식 설계 스펙이다. v0.2 Design Milestone에서 예비 설계로 남겨둔 토큰 관련 확장 포인트를 정식화하고, 누락된 영역(EVM 빌드 로직, ALLOWED_TOKENS 정책, 보안 티어 전략)을 완성한다.

### 1.2 범위

| 요구사항 | 커버리지 | 섹션 |
|---------|---------|------|
| TOKEN-01 | TransferRequest.token 필드 확장 + 체인별 빌드 로직 | 섹션 2, 3, 4, 5 |
| TOKEN-02 | ALLOWED_TOKENS 정책 + DatabasePolicyEngine 토큰 검증 | 섹션 6, 7 |

**TOKEN-03 (getAssets), TOKEN-04 (estimateFee 확장), TOKEN-05 (토큰 테스트)** 는 22-02-PLAN.md에서 별도 설계한다.

### 1.3 v0.2 예비 설계 승격 배경

v0.2 설계 문서 8개에는 토큰 확장을 위한 예비 포인트가 이미 존재한다:

| 문서 | 예비 설계 | Phase 22 승격 내용 |
|------|----------|-------------------|
| CORE-04 (27) | TransferRequest: `from, to, amount, memo?` 만 정의 | `token?` 필드 추가 (섹션 2) |
| CHAIN-SOL (31) | 섹션 5.2 `buildSplTokenTransfer()` 예비 설계 | 정식 스펙으로 승격 + Token-2022 분기 (섹션 3) |
| CHAIN-SOL (31) | 섹션 5.3 buildTransaction 분기 주석 | `request.token` 기반 정식 분기 (섹션 3) |
| API-SPEC (37) | TransferRequestSchema에 `type`, `tokenMint` 이미 존재 | 서비스 레이어 매핑 정식화 (섹션 5) |
| CORE-02 (25) | transactions.type: `'TOKEN_TRANSFER'` 주석 열거 | 사용 정식화 (섹션 5) |
| KILL-AUTO-EVM (36) | EvmAdapterStub 13개 메서드 스텁 | buildErc20Transfer 실 구현 수준 설계 (섹션 4) |
| LOCK-MECH (33) | PolicyType 4개 (SPENDING_LIMIT, WHITELIST, TIME_RESTRICTION, RATE_LIMIT) | ALLOWED_TOKENS 추가 (섹션 6) |
| ENUM-MAP (45) | PolicyType 4개 값 | ALLOWED_TOKENS 확장 명세 (섹션 6) |

### 1.4 핵심 설계 원칙

| 원칙 | 설명 | 적용 |
|------|------|------|
| **하위 호환** | `token: undefined` → 네이티브 전송 (기존 로직 무변경) | TransferRequest (섹션 2) |
| **IChainAdapter 저수준 유지** | 어댑터는 "전송 실행"만 담당. DeFi 지식은 Phase 24 Action Provider | buildSplTokenTransfer, buildErc20Transfer |
| **정책 엔진 독립** | 토큰 정책은 DatabasePolicyEngine에서 평가. 어댑터와 분리 | ALLOWED_TOKENS (섹션 6) |
| **6단계 파이프라인 구조 변경 없음** | 기존 파이프라인 위에 적층. 새 Stage 없음 | 섹션 5 |
| **기본 거부** | ALLOWED_TOKENS 미설정 시 토큰 전송 거부 (네이티브만 허용) | 섹션 6 |
| **USD 정책은 Phase 24** | Phase 22-23은 과도기 -- 토큰 금액 비교 없이 안전 마진 적용 | 섹션 7 |

---

## 2. TransferRequest 타입 확장

### 2.1 기존 TransferRequest (CORE-04 현재)

```typescript
// packages/core/src/interfaces/chain-adapter.types.ts (현재)
interface TransferRequest {
  from: string
  to: string
  amount: bigint
  memo?: string
}
```

### 2.2 확장된 TransferRequest

```typescript
// packages/core/src/interfaces/chain-adapter.types.ts (Phase 22 확장)

/**
 * 토큰 정보.
 * TransferRequest에서 선택적으로 사용하여 네이티브/토큰 전송을 구분한다.
 *
 * address는 체인별 포맷:
 * - Solana: Base58 인코딩 mint 주소 (예: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' = USDC)
 * - EVM: 0x 접두어 hex 컨트랙트 주소 (예: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' = USDC)
 */
interface TokenInfo {
  /** 토큰 민트/컨트랙트 주소 (체인별 포맷) */
  address: string

  /**
   * 소수점 자릿수.
   * - Solana USDC: 6
   * - EVM USDC: 6
   * - Solana wSOL: 9
   * - EVM WETH: 18
   *
   * transferChecked (Solana) 및 ERC-20 decimals 검증에 사용한다.
   */
  decimals: number

  /** 토큰 심볼 (UI 표시 및 로그용) */
  symbol: string
}

/**
 * 전송 요청.
 * 네이티브 토큰(SOL, ETH)과 SPL/ERC-20 토큰 전송을 통합한다.
 *
 * 하위 호환:
 * - token이 undefined면 네이티브 전송 (v0.2와 동일)
 * - token이 정의되면 SPL/ERC-20 토큰 전송
 *
 * from/to는 체인별 주소 포맷:
 * - Solana: Base58 인코딩 (32-44자)
 * - EVM: 0x 접두어 hex (42자)
 */
interface TransferRequest {
  /** 발신 주소 (체인별 포맷) */
  from: string

  /** 수신 주소 (체인별 포맷) */
  to: string

  /**
   * 전송 금액 (최소 단위, bigint).
   * - 네이티브: lamports / wei
   * - 토큰: 토큰 최소 단위 (예: USDC 6 decimals면 1 USDC = 1_000_000n)
   */
  amount: bigint

  /**
   * 선택적 메모.
   * - Solana: Memo Program instruction으로 첨부
   * - EVM: transaction data 필드에 UTF-8 인코딩 (토큰 전송 시 미지원)
   * 최대 길이: 256바이트
   */
  memo?: string

  /**
   * 토큰 정보 (Phase 22 추가).
   * undefined면 네이티브 전송, 정의되면 토큰 전송.
   * 서비스 레이어에서 REST API의 tokenMint -> 온체인 메타데이터 조회 -> TokenInfo 객체 구성.
   */
  token?: TokenInfo
}
```

### 2.3 Zod 스키마

```typescript
// packages/core/src/schema/transfer-request.ts

import { z } from 'zod'

/**
 * TokenInfo Zod 스키마.
 * TransferRequest.token 필드의 검증에 사용한다.
 */
export const TokenInfoSchema = z.object({
  address: z.string().min(1, '토큰 주소는 비어있을 수 없습니다'),
  decimals: z.number().int().min(0).max(18),
  symbol: z.string().min(1).max(10),
})

/**
 * TransferRequest Zod 스키마 (IChainAdapter 수준).
 *
 * REST API의 TransferRequestSchema (37-rest-api-complete-spec.md)와는 구분한다:
 * - REST API: `to`, `amount` (string), `type`, `tokenMint`, `priority`
 * - IChainAdapter: `from`, `to`, `amount` (bigint), `memo?`, `token?`
 *
 * 서비스 레이어에서 REST API 스키마 → IChainAdapter 스키마로 변환한다.
 */
export const TransferRequestSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  amount: z.bigint().positive(),
  memo: z.string().max(256).optional(),
  token: TokenInfoSchema.optional(),
})

export type TokenInfoType = z.infer<typeof TokenInfoSchema>
export type TransferRequestType = z.infer<typeof TransferRequestSchema>
```

### 2.4 REST API → TransferRequest 변환 (서비스 레이어)

REST API의 `POST /v1/transactions/send`는 `type`, `tokenMint` 필드를 사용한다 (37-rest-api-complete-spec.md 참조). 서비스 레이어에서 이를 IChainAdapter의 TransferRequest로 변환한다.

```typescript
// packages/daemon/src/services/transaction-service.ts

/**
 * REST API 요청 → TransferRequest 변환.
 * tokenMint가 존재하면 온체인에서 토큰 메타데이터를 조회하여 TokenInfo 객체를 구성한다.
 *
 * @param apiRequest REST API TransferRequestSchema 파싱 결과
 * @param agent 에이전트 정보 (publicKey, chain)
 * @param adapter IChainAdapter 인스턴스 (메타데이터 조회용)
 */
async function buildTransferRequest(
  apiRequest: { to: string; amount: string; type?: string; tokenMint?: string; memo?: string },
  agent: { publicKey: string; chain: ChainType },
  adapter: IChainAdapter,
): Promise<TransferRequest> {
  const base: TransferRequest = {
    from: agent.publicKey,
    to: apiRequest.to,
    amount: BigInt(apiRequest.amount),
    memo: apiRequest.memo,
  }

  // 네이티브 전송 (type='TRANSFER' 또는 tokenMint 미지정)
  if (!apiRequest.tokenMint || apiRequest.type === 'TRANSFER') {
    return base
  }

  // 토큰 전송: 온체인 메타데이터 조회
  const tokenInfo = await resolveTokenInfo(apiRequest.tokenMint, agent.chain, adapter)
  return { ...base, token: tokenInfo }
}

/**
 * 토큰 민트/컨트랙트 주소에서 메타데이터(decimals, symbol)를 조회한다.
 *
 * Solana: mint account를 getAccountInfo()로 조회하여 decimals, symbol 추출
 * EVM: readContract()로 decimals(), symbol() 함수 호출
 *
 * 결과는 런타임 캐시(LRU, max 100, TTL 10분)에 저장하여 반복 조회 최소화.
 */
async function resolveTokenInfo(
  tokenAddress: string,
  chain: ChainType,
  adapter: IChainAdapter,
): Promise<TokenInfo> {
  // 캐시 조회
  const cacheKey = `${chain}:${tokenAddress}`
  const cached = tokenInfoCache.get(cacheKey)
  if (cached) return cached

  let tokenInfo: TokenInfo

  if (chain === 'solana') {
    tokenInfo = await resolveSolanaTokenInfo(tokenAddress, adapter)
  } else {
    // EVM chains: ethereum, polygon, arbitrum
    tokenInfo = await resolveEvmTokenInfo(tokenAddress, adapter)
  }

  tokenInfoCache.set(cacheKey, tokenInfo)
  return tokenInfo
}

/**
 * Solana 토큰 메타데이터 조회.
 * mint account의 data 필드를 디코딩하여 decimals를 추출한다.
 * symbol은 Metaplex Token Metadata Program에서 조회하거나,
 * 알려진 토큰 목록(하드코딩 fallback)에서 조회한다.
 *
 * @solana/kit: rpc.getAccountInfo(mintAddress)
 * mint account layout: 82 bytes, decimals는 offset 44에 1바이트 uint8
 */
async function resolveSolanaTokenInfo(
  mintAddress: string,
  adapter: IChainAdapter,
): Promise<TokenInfo> {
  // rpc.getAccountInfo()로 mint account 조회
  // mint account data layout (SPL Token / Token-2022 공통):
  //   [0..36]   mintAuthority (COption<Pubkey>) -- 4 + 32 bytes
  //   [36..44]  supply (u64) -- 8 bytes
  //   [44]      decimals (u8) -- 1 byte
  //   [45]      isInitialized (bool) -- 1 byte
  //   [46..82]  freezeAuthority (COption<Pubkey>) -- 4 + 32 bytes
  //
  // Token-2022 확장: 82바이트 이후에 확장 데이터가 추가됨

  const accountInfo = await adapter.getAccountInfo(mintAddress)

  if (!accountInfo || !accountInfo.data) {
    throw new ChainError({
      code: 'TOKEN_METADATA_FETCH_FAILED',
      chain: 'solana',
      message: `토큰 메타데이터 조회 실패: ${mintAddress}`,
      retryable: true,
    })
  }

  const data = accountInfo.data
  const decimals = data[44]  // offset 44: decimals (u8)

  // symbol 조회: Metaplex Token Metadata 또는 알려진 목록
  const symbol = await resolveTokenSymbol(mintAddress, 'solana')

  return { address: mintAddress, decimals, symbol }
}

/**
 * EVM 토큰 메타데이터 조회.
 * ERC-20 표준 decimals(), symbol() 함수를 readContract()로 호출한다.
 *
 * viem: publicClient.readContract({ address, abi, functionName })
 */
async function resolveEvmTokenInfo(
  contractAddress: string,
  adapter: IChainAdapter,
): Promise<TokenInfo> {
  // ERC-20 Standard ABI (필요한 함수만)
  const ERC20_ABI = [
    { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
    { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  ] as const

  try {
    const [decimals, symbol] = await Promise.all([
      adapter.readContract({ address: contractAddress, abi: ERC20_ABI, functionName: 'decimals' }),
      adapter.readContract({ address: contractAddress, abi: ERC20_ABI, functionName: 'symbol' }),
    ])

    return {
      address: contractAddress,
      decimals: Number(decimals),
      symbol: symbol as string,
    }
  } catch (error) {
    throw new ChainError({
      code: 'TOKEN_METADATA_FETCH_FAILED',
      chain: adapter.chain,
      message: `ERC-20 메타데이터 조회 실패: ${contractAddress}`,
      retryable: true,
      cause: error,
    })
  }
}
```

**참고:** `adapter.getAccountInfo()`와 `adapter.readContract()`는 IChainAdapter에 현재 정의되지 않은 메서드이다. 이들은 서비스 레이어에서 어댑터의 내부 RPC 클라이언트를 통해 직접 호출하거나, Phase 22-02에서 IChainAdapter에 유틸리티 메서드로 추가하는 방안을 검토한다. 본 문서에서는 서비스 레이어가 어댑터의 RPC 클라이언트에 접근 가능한 것으로 설계한다.

### 2.5 기존 문서 변경 영향

| 문서 | 변경 대상 | 변경 내용 |
|------|----------|----------|
| 27-chain-adapter-interface.md | 섹션 2.3 TransferRequest | `token?: TokenInfo` 필드 추가 |
| 27-chain-adapter-interface.md | 섹션 2.2 TokenAmount | TokenInfo와의 관계 명시 |
| 27-chain-adapter-interface.md | 섹션 2.8 타입 요약 | TokenInfo 행 추가 |

---

## 3. Solana SPL 토큰 전송 빌드 로직

### 3.1 개요

31-solana-adapter-detail.md 섹션 5.2의 예비 설계를 정식 스펙으로 승격한다. 주요 변경 사항:

| 항목 | v0.2 예비 설계 | Phase 22 정식 스펙 |
|------|--------------|-------------------|
| instruction | `getTransferInstruction` | `getTransferCheckedInstruction` (decimals 검증 포함) |
| Token Program 판별 | Token Program 하드코딩 | mint account owner 기반 동적 판별 |
| Token-2022 | 미고려 | 기본 transfer 지원 + 확장 감지/거부 |
| compute unit | 미조정 | SPL 전송 ~450 CU 명시 (기본 200K CU limit 내) |
| 분기 기준 | `request.type === 'TOKEN_TRANSFER'` | `request.token !== undefined` |

### 3.2 buildSplTokenTransfer() 정식 명세

```typescript
// packages/adapters/solana/src/transaction-builder.ts

import { getTransferCheckedInstruction } from '@solana-program/token'
import {
  getCreateAssociatedTokenAccountInstruction,
  findAssociatedTokenPda,
} from '@solana-program/associated-token-account'
import type { Address } from '@solana/kit'

/** SPL Token Program 주소 */
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address
/** Token-2022 Program 주소 */
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' as Address

/**
 * SPL 토큰 전송 트랜잭션을 빌드한다.
 *
 * v0.2 예비 설계(CHAIN-SOL 섹션 5.2)를 정식화한 버전.
 * 주요 개선:
 * 1. getTransferCheckedInstruction 사용 (decimals 검증)
 * 2. Token Program vs Token-2022 동적 판별
 * 3. Token-2022 확장(TransferFee 등) 감지 시 거부
 *
 * 빌드 단계:
 * 1. mint account owner로 Token Program / Token-2022 판별
 * 2. 발신자/수신자 ATA(Associated Token Account) PDA 계산
 * 3. 수신자 ATA 존재 확인 (getAccountInfo)
 * 4. ATA 미존재 시 생성 instruction 선행
 * 5. transferChecked instruction 추가 (decimals 검증 포함)
 * 6. 컴파일 + 직렬화
 *
 * Compute Unit: SPL transfer ~200 CU, ATA 생성 ~250 CU (합산 ~450 CU)
 * 기본 200,000 CU limit 내에서 충분히 처리됨. 별도 setComputeUnitLimit 불필요.
 *
 * @param from 발신자 주소 (에이전트 public key)
 * @param to 수신자 주소
 * @param amount 전송량 (토큰 최소 단위)
 * @param token 토큰 정보 (address, decimals, symbol)
 * @param blockhash 최근 blockhash
 * @param lastValidBlockHeight blockhash 유효 블록 높이
 * @returns UnsignedTransaction
 */
async function buildSplTokenTransfer(
  from: Address,
  to: Address,
  amount: bigint,
  token: TokenInfo,
  blockhash: string,
  lastValidBlockHeight: bigint,
): Promise<UnsignedTransaction> {
  const mintAddress = token.address as Address

  // ═══════════════════════════════════════════════════
  // Step 1: Token Program vs Token-2022 판별
  // ═══════════════════════════════════════════════════
  //
  // mint account의 owner 필드로 판별한다:
  // - owner === TOKEN_PROGRAM_ID → Token Program (SPL Token)
  // - owner === TOKEN_2022_PROGRAM_ID → Token-2022
  // - 그 외 → INVALID_TOKEN_MINT 에러
  //
  // mint account 조회는 캐시 가능 (mint의 owner는 변경 불가)
  const mintAccountInfo = await rpc.getAccountInfo(mintAddress, {
    encoding: 'base64',
  }).send()

  if (!mintAccountInfo.value) {
    throw new ChainError({
      code: 'INVALID_TOKEN_MINT',
      chain: 'solana',
      message: `유효하지 않은 토큰 민트: ${token.address} (계정 미존재)`,
      retryable: false,
    })
  }

  const mintOwner = mintAccountInfo.value.owner
  let tokenProgramId: Address

  if (mintOwner === TOKEN_PROGRAM_ID) {
    tokenProgramId = TOKEN_PROGRAM_ID
  } else if (mintOwner === TOKEN_2022_PROGRAM_ID) {
    tokenProgramId = TOKEN_2022_PROGRAM_ID

    // Token-2022 확장 감지 및 거부 (Step 1a)
    await validateToken2022Extensions(mintAccountInfo.value.data, token)
  } else {
    throw new ChainError({
      code: 'INVALID_TOKEN_MINT',
      chain: 'solana',
      message: `유효하지 않은 토큰 민트: ${token.address} (owner가 Token Program이 아님: ${mintOwner})`,
      retryable: false,
    })
  }

  // ═══════════════════════════════════════════════════
  // Step 2: 발신자/수신자 ATA PDA 계산
  // ═══════════════════════════════════════════════════
  //
  // ATA = Associated Token Account
  // PDA derivation: [owner_pubkey, token_program_id, mint_pubkey]
  // 올바른 tokenProgram을 전달해야 한다 (Token Program vs Token-2022)
  const [sourceAta] = await findAssociatedTokenPda({
    owner: from,
    mint: mintAddress,
    tokenProgram: tokenProgramId,
  })

  const [destinationAta] = await findAssociatedTokenPda({
    owner: to,
    mint: mintAddress,
    tokenProgram: tokenProgramId,
  })

  // ═══════════════════════════════════════════════════
  // Step 3: 수신자 ATA 존재 확인
  // ═══════════════════════════════════════════════════
  let needCreateAta = false
  try {
    const destinationAccountInfo = await rpc.getAccountInfo(destinationAta, {
      encoding: 'base64',
    }).send()

    if (!destinationAccountInfo.value) {
      needCreateAta = true
    }
  } catch {
    // 계정 조회 실패 시 ATA 미존재로 간주
    needCreateAta = true
  }

  // ═══════════════════════════════════════════════════
  // Step 4: 트랜잭션 메시지 구성
  // ═══════════════════════════════════════════════════
  let transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayer(from, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(
      { blockhash, lastValidBlockHeight },
      tx,
    ),
  )

  // Step 4a: ATA 생성 instruction (필요 시)
  //
  // 수신자 ATA가 존재하지 않으면 생성 instruction을 선행 추가한다.
  // ATA 생성 비용: rent-exempt 최소 잔액 ~0.00203928 SOL (2,039,280 lamports)
  // payer = 발신자 (에이전트). 수신자가 아닌 발신자가 비용 부담.
  if (needCreateAta) {
    transactionMessage = appendTransactionMessageInstruction(
      getCreateAssociatedTokenAccountInstruction({
        payer: from,
        owner: to,
        mint: mintAddress,
        tokenProgram: tokenProgramId,
      }),
      transactionMessage,
    )
  }

  // Step 4b: SPL 토큰 전송 instruction
  //
  // getTransferCheckedInstruction을 사용한다 (getTransferInstruction 대신).
  // transferChecked는 decimals 파라미터를 추가로 받아 온체인에서 검증한다:
  // - 전달된 decimals가 mint account의 decimals와 불일치하면 트랜잭션 실패
  // - 이는 UI에서 잘못된 decimals로 금액을 구성하는 사고를 방지한다
  //
  // 예시: USDC (6 decimals) 1.5 USDC 전송
  //   amount = 1_500_000n, decimals = 6 → 온체인 검증 통과
  //   amount = 1_500_000n, decimals = 9 → 온체인 검증 실패 (decimals 불일치)
  transactionMessage = appendTransactionMessageInstruction(
    getTransferCheckedInstruction({
      source: sourceAta,
      mint: mintAddress,
      destination: destinationAta,
      authority: from,   // owner = 발신자 (에이전트)
      amount,            // 토큰 최소 단위
      decimals: token.decimals,
      tokenProgram: tokenProgramId,
    }),
    transactionMessage,
  )

  // Step 4c: 메모 instruction (선택적)
  // 네이티브 전송과 동일하게 Memo Program instruction 추가 가능
  // (buildNativeTransfer와 동일 로직, 생략)

  // ═══════════════════════════════════════════════════
  // Step 5: 컴파일 + 직렬화
  // ═══════════════════════════════════════════════════
  const compiledMessage = compileTransactionMessage(transactionMessage)
  const encoder = getCompiledTransactionMessageEncoder()
  const serialized = encoder.encode(compiledMessage)

  // 수수료 추정
  const baseFee = BigInt(5000)  // 기본 서명 수수료: 5000 lamports
  const ataCreationCost = needCreateAta ? BigInt(2_039_280) : BigInt(0)  // rent-exempt
  const estimatedFee = baseFee + ataCreationCost

  // 유효 기한: 현재 시각 + 50초 (CHAIN-SOL 결정과 동일)
  const expiresAt = new Date(Date.now() + 50_000)

  return {
    chain: 'solana',
    serialized,
    estimatedFee,
    expiresAt,
    metadata: {
      blockhash,
      lastValidBlockHeight,
      version: 0,
      from: from as string,
      to: to as string,
      amount: amount.toString(),
      mintAddress: token.address,
      tokenSymbol: token.symbol,
      tokenDecimals: token.decimals,
      tokenProgramId: tokenProgramId as string,
      needCreateAta,
      type: 'SPL_TOKEN_TRANSFER',
    },
  }
}
```

### 3.3 Token-2022 호환성 전략

Token-2022 (SPL Token-2022 Program)는 Token Program의 상위 호환 프로그램으로, 기본 전송 기능에 더해 확장(extensions)을 제공한다.

#### 지원 범위

| Token-2022 기능 | 지원 여부 | 근거 |
|----------------|----------|------|
| 기본 transfer (확장 없는 토큰) | **지원** | transferChecked instruction이 Token Program과 동일하게 동작 (tokenProgram만 다름) |
| TransferFee 확장 | **거부** | 수수료가 자동 공제되어 실제 수신액이 달라짐. 정책 엔진의 금액 검증을 무효화 |
| ConfidentialTransfer 확장 | **거부** | 금액이 암호화되어 정책 엔진이 금액을 검증할 수 없음 |
| TransferHook 확장 | **거부** | 외부 프로그램이 전송 시 자동 실행됨. 예측 불가능한 부작용 |
| MintCloseAuthority 확장 | **지원** | 전송에 영향 없음 |
| PermanentDelegate 확장 | **거부** | 위임자가 토큰을 임의로 전송/소각 가능. 보안 위험 |
| NonTransferable 확장 | **거부** | 전송 자체가 불가능한 토큰 |

#### 확장 감지 및 거부 로직

```typescript
// packages/adapters/solana/src/token-2022-validator.ts

/**
 * Token-2022 mint account에서 위험한 확장(extension)을 감지하여 거부한다.
 *
 * Token-2022 mint account layout:
 * - [0..82]: Token Program 호환 기본 데이터 (mint authority, supply, decimals 등)
 * - [82..83]: account type (1 = mint, 2 = token account)
 * - [83..]: 확장 데이터 (TLV 형식: Type(2) + Length(2) + Value)
 *
 * TLV (Type-Length-Value) 형식:
 * - Type: u16 LE -- 확장 종류 식별자
 * - Length: u16 LE -- Value 바이트 수
 * - Value: 확장별 데이터
 *
 * 차단 대상 확장 타입:
 */

/** Token-2022 확장 타입 ID (u16 LE) */
const BLOCKED_EXTENSION_TYPES: Record<number, string> = {
  1:  'TransferFeeConfig',       // 전송 시 수수료 자동 공제
  2:  'TransferFeeAmount',       // 전송 수수료 누적 (Transfer Fee의 토큰 계정 확장)
  10: 'ConfidentialTransferMint',// 암호화된 전송 (금액 비공개)
  11: 'ConfidentialTransferAccount',
  14: 'TransferHook',           // 외부 프로그램 자동 실행
  18: 'PermanentDelegate',      // 영구 위임자
  19: 'NonTransferable',        // 전송 불가
}

/**
 * Token-2022 mint account의 확장 데이터를 파싱하여 차단 대상 확장이 있는지 검사한다.
 *
 * @param data mint account의 raw data (base64 디코딩된 Uint8Array)
 * @param token 토큰 정보 (에러 메시지용)
 * @throws ChainError(UNSUPPORTED_TOKEN_EXTENSION) 차단 대상 확장 감지 시
 */
async function validateToken2022Extensions(
  data: Uint8Array,
  token: TokenInfo,
): Promise<void> {
  // Token-2022 기본 데이터 크기 확인
  if (data.length <= 83) {
    // 확장 없음 (기본 mint 데이터만 있음) → 안전
    return
  }

  // TLV 확장 데이터 파싱 (offset 83부터)
  let offset = 83
  const detectedExtensions: string[] = []

  while (offset + 4 <= data.length) {
    // Type: u16 LE
    const extensionType = data[offset] | (data[offset + 1] << 8)
    // Length: u16 LE
    const extensionLength = data[offset + 2] | (data[offset + 3] << 8)

    // 차단 대상 확장 검사
    const blockedName = BLOCKED_EXTENSION_TYPES[extensionType]
    if (blockedName) {
      detectedExtensions.push(blockedName)
    }

    // 다음 TLV로 이동
    offset += 4 + extensionLength
  }

  if (detectedExtensions.length > 0) {
    throw new ChainError({
      code: 'UNSUPPORTED_TOKEN_EXTENSION',
      chain: 'solana',
      message: `토큰 ${token.symbol} (${token.address})에 지원하지 않는 Token-2022 확장이 감지됨: ${detectedExtensions.join(', ')}`,
      details: { extensions: detectedExtensions, mint: token.address },
      retryable: false,
    })
  }
}
```

### 3.4 buildTransaction 분기 로직

```typescript
// packages/adapters/solana/src/adapter.ts
// SolanaAdapter.buildTransaction() 내부

async buildTransaction(request: TransferRequest): Promise<UnsignedTransaction> {
  this.ensureConnected()

  // 주소 검증
  if (!this.isValidAddress(request.from)) {
    throw new ChainError({
      code: ChainErrorCode.INVALID_ADDRESS,
      chain: 'solana',
      message: `유효하지 않은 발신자 주소: ${request.from}`,
      retryable: false,
    })
  }
  if (!this.isValidAddress(request.to)) {
    throw new ChainError({
      code: ChainErrorCode.INVALID_ADDRESS,
      chain: 'solana',
      message: `유효하지 않은 수신자 주소: ${request.to}`,
      retryable: false,
    })
  }

  // blockhash 조회 (캐시 활용, CHAIN-SOL 섹션 5.1과 동일)
  const { blockhash, lastValidBlockHeight } = await this.getRecentBlockhash()

  // *** Phase 22 핵심 분기 ***
  // token 필드 존재 여부로 네이티브/토큰 전송 분기
  if (request.token) {
    // SPL 토큰 전송
    return buildSplTokenTransfer(
      request.from as Address,
      request.to as Address,
      request.amount,
      request.token,
      blockhash,
      lastValidBlockHeight,
    )
  }

  // 네이티브 SOL 전송 (기존 v0.2 로직, 변경 없음)
  return this.buildNativeTransfer(
    request.from as Address,
    request.to as Address,
    request.amount,
    request.memo,
    blockhash,
    lastValidBlockHeight,
  )
}
```

### 3.5 SPL 전송 에러 매핑

| 에러 코드 | ChainErrorCode | HTTP | 발생 조건 |
|----------|---------------|------|----------|
| `INVALID_TOKEN_MINT` | TOKEN_ERROR | 400 | mint 주소가 유효하지 않음 (계정 미존재, owner가 Token Program이 아님) |
| `INSUFFICIENT_TOKEN_BALANCE` | INSUFFICIENT_BALANCE | 400 | 발신자 ATA의 토큰 잔액 부족 (시뮬레이션에서 감지) |
| `ATA_CREATION_FAILED` | CHAIN_ERROR | 502 | 수신자 ATA 생성 instruction 실패 (rent-exempt 잔액 부족 등) |
| `UNSUPPORTED_TOKEN_EXTENSION` | TOKEN_ERROR | 400 | Token-2022 위험 확장 감지 (TransferFee, ConfidentialTransfer 등) |
| `TOKEN_METADATA_FETCH_FAILED` | RPC_ERROR | 502 | 토큰 메타데이터 조회 실패 (RPC 오류) |

---

## 4. EVM ERC-20 토큰 전송 빌드 로직

### 4.1 개요

36-killswitch-autostop-evm.md의 EvmAdapterStub을 실 구현 수준으로 확장한다. v0.2에서 EvmAdapterStub은 모든 메서드가 `CHAIN_NOT_SUPPORTED` 에러를 던지는 스텁이었다. Phase 22에서는 **buildErc20Transfer()의 설계 스펙**을 정의하여, 향후 EvmAdapter 본구현 시 토큰 전송도 함께 구현할 수 있도록 한다.

**기반 스택:** viem 2.45.x+ (36-killswitch-autostop-evm.md 섹션 10.5에서 확정)

### 4.2 ERC-20 표준 ABI 정의

```typescript
// packages/adapters/evm/src/abi/erc20.ts

/**
 * ERC-20 토큰 표준 ABI.
 * 토큰 전송에 필요한 최소한의 함수만 정의한다.
 *
 * 참고: USDT (Tether)는 transfer의 반환값이 비표준이다:
 * - ERC-20 표준: `transfer(address,uint256) returns (bool)`
 * - USDT: `transfer(address,uint256)` (반환값 없음)
 * simulateContract()로 사전 검증하여 비표준 대응.
 */
export const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const
```

### 4.3 buildErc20Transfer() 전체 명세

```typescript
// packages/adapters/evm/src/transaction-builder.ts

import { encodeFunctionData, type Hex, type Address as EvmAddress } from 'viem'
import type { PublicClient, WalletClient } from 'viem'
import { ERC20_ABI } from './abi/erc20.js'

/**
 * ERC-20 토큰 전송 트랜잭션을 빌드한다.
 *
 * ERC-20 전송은 네이티브 전송과 근본적으로 다르다:
 * - 네이티브: { to: 수신자, value: 금액, data: 0x }
 * - ERC-20:  { to: 컨트랙트, value: 0, data: transfer(수신자, 금액) }
 *
 * 빌드 단계:
 * 1. simulateContract() -- 전송 가능 여부 사전 검증
 * 2. encodeFunctionData() -- transfer(to, amount) calldata 인코딩
 * 3. estimateGas() -- gas 추정
 * 4. prepareTransactionRequest() -- 트랜잭션 빌드
 *
 * Gas 추정:
 * - 네이티브 ETH 전송: ~21,000 gas
 * - ERC-20 transfer: ~65,000 gas (컨트랙트에 따라 45,000~100,000)
 * - 수신자에게 처음 전송하는 경우 (storage slot 생성): ~80,000 gas
 *
 * @param from 발신자 주소 (에이전트 EOA)
 * @param to 수신자 주소 (최종 수신자)
 * @param amount 전송량 (토큰 최소 단위)
 * @param token 토큰 정보 (address = 컨트랙트 주소, decimals, symbol)
 * @param publicClient viem PublicClient 인스턴스
 * @returns UnsignedTransaction
 */
async function buildErc20Transfer(
  from: EvmAddress,
  to: EvmAddress,
  amount: bigint,
  token: TokenInfo,
  publicClient: PublicClient,
): Promise<UnsignedTransaction> {
  const contractAddress = token.address as EvmAddress

  // ═══════════════════════════════════════════════════
  // Step 1: simulateContract() -- 전송 가능 여부 사전 검증
  // ═══════════════════════════════════════════════════
  //
  // simulateContract는 EVM 노드에서 트랜잭션을 시뮬레이션한다.
  // 실패 사유:
  // - 잔액 부족 (ERC20: Insufficient balance)
  // - 컨트랙트 없음 (코드 없는 주소)
  // - 블랙리스트 (일부 토큰은 특정 주소 차단)
  // - paused 상태 (일부 토큰은 pause 기능 보유)
  //
  // USDT 비표준 대응:
  // viem의 simulateContract는 반환값 디코딩 실패를 적절히 처리한다.
  // USDT의 transfer는 반환값이 없지만, simulateContract는 revert 여부만 확인하므로 정상 동작.
  try {
    await publicClient.simulateContract({
      account: from,
      address: contractAddress,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [to, amount],
    })
  } catch (error) {
    // 시뮬레이션 실패 분류
    const errorMessage = (error as Error).message ?? ''

    if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) {
      throw new ChainError({
        code: 'INSUFFICIENT_TOKEN_BALANCE',
        chain: publicClient.chain?.name ?? 'evm',
        message: `토큰 잔액 부족: ${token.symbol} (${token.address})`,
        details: { from, to, amount: amount.toString(), token: token.address },
        retryable: false,
      })
    }

    throw new ChainError({
      code: 'ERC20_SIMULATION_FAILED',
      chain: publicClient.chain?.name ?? 'evm',
      message: `ERC-20 시뮬레이션 실패: ${errorMessage}`,
      details: { from, to, amount: amount.toString(), token: token.address, error: errorMessage },
      retryable: false,
    })
  }

  // ═══════════════════════════════════════════════════
  // Step 2: encodeFunctionData() -- calldata 인코딩
  // ═══════════════════════════════════════════════════
  //
  // ERC-20 transfer 함수 시그니처: transfer(address,uint256)
  // Selector: 0xa9059cbb (keccak256("transfer(address,uint256)")의 첫 4바이트)
  // calldata: 0xa9059cbb + 수신자주소(32바이트) + 금액(32바이트) = 68바이트
  const calldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [to, amount],
  })

  // ═══════════════════════════════════════════════════
  // Step 3: estimateGas() -- gas 추정
  // ═══════════════════════════════════════════════════
  //
  // ERC-20 transfer의 gas 소비:
  // - 기본 트랜잭션 비용: 21,000 gas
  // - 컨트랙트 실행: ~25,000-60,000 gas (SLOAD, SSTORE, LOG 등)
  // - 새 storage slot 생성 (첫 전송): +20,000 gas
  //
  // 안전 마진: 추정값 * 1.2 (20% 여유)
  let estimatedGas: bigint
  try {
    estimatedGas = await publicClient.estimateGas({
      account: from,
      to: contractAddress,
      data: calldata,
      value: 0n,
    })
  } catch (error) {
    throw new ChainError({
      code: 'ERC20_TRANSFER_FAILED',
      chain: publicClient.chain?.name ?? 'evm',
      message: `ERC-20 gas 추정 실패: ${(error as Error).message}`,
      retryable: true,
    })
  }

  // 안전 마진 적용 (20%)
  const gasLimit = (estimatedGas * 120n) / 100n

  // ═══════════════════════════════════════════════════
  // Step 4: prepareTransactionRequest() -- 트랜잭션 빌드
  // ═══════════════════════════════════════════════════
  //
  // EIP-1559 트랜잭션 (type 2):
  // - to: 컨트랙트 주소 (수신자가 아님!)
  // - value: 0 (네이티브 토큰 전송 아님)
  // - data: calldata (transfer 함수 인코딩)
  // - maxFeePerGas, maxPriorityFeePerGas: 현재 가스 가격 기반
  const preparedTx = await publicClient.prepareTransactionRequest({
    account: from,
    to: contractAddress,
    data: calldata,
    value: 0n,
    gas: gasLimit,
    type: 'eip1559',
  })

  // 트랜잭션 직렬화 (서명 전)
  // viem의 prepareTransactionRequest는 nonce, maxFeePerGas 등을 자동 채움
  const serialized = serializeTransaction(preparedTx)

  // 수수료 추정: gasLimit * maxFeePerGas
  const estimatedFee = gasLimit * (preparedTx.maxFeePerGas ?? 0n)

  return {
    chain: publicClient.chain?.name === 'Ethereum' ? 'ethereum'
         : publicClient.chain?.name === 'Polygon' ? 'polygon'
         : publicClient.chain?.name === 'Arbitrum One' ? 'arbitrum'
         : 'ethereum',
    serialized,
    estimatedFee,
    expiresAt: undefined,  // EVM은 nonce 기반이므로 유효 기한 없음 (CORE-04 결정)
    metadata: {
      nonce: preparedTx.nonce,
      chainId: publicClient.chain?.id,
      maxFeePerGas: preparedTx.maxFeePerGas,
      maxPriorityFeePerGas: preparedTx.maxPriorityFeePerGas,
      gasLimit,
      from: from as string,
      to: to as string,
      amount: amount.toString(),
      contractAddress: token.address,
      tokenSymbol: token.symbol,
      tokenDecimals: token.decimals,
      calldata,
      type: 'ERC20_TOKEN_TRANSFER',
    },
  }
}
```

### 4.4 buildTransaction 분기 로직

```typescript
// packages/adapters/evm/src/adapter.ts
// EvmAdapter.buildTransaction() 내부 (v0.3 본구현 시)

async buildTransaction(request: TransferRequest): Promise<UnsignedTransaction> {
  this.ensureConnected()

  // 주소 검증 (viem isAddress)
  if (!isAddress(request.from)) {
    throw new ChainError({
      code: ChainErrorCode.INVALID_ADDRESS,
      chain: this.chain,
      message: `유효하지 않은 발신자 주소: ${request.from}`,
      retryable: false,
    })
  }
  if (!isAddress(request.to)) {
    throw new ChainError({
      code: ChainErrorCode.INVALID_ADDRESS,
      chain: this.chain,
      message: `유효하지 않은 수신자 주소: ${request.to}`,
      retryable: false,
    })
  }

  // *** Phase 22 핵심 분기 ***
  // Solana와 동일 패턴: token 필드 존재 여부로 분기
  if (request.token) {
    // ERC-20 토큰 전송
    return buildErc20Transfer(
      request.from as EvmAddress,
      request.to as EvmAddress,
      request.amount,
      request.token,
      this.publicClient,
    )
  }

  // 네이티브 전송 (ETH/MATIC/ARB)
  return this.buildNativeTransfer(
    request.from as EvmAddress,
    request.to as EvmAddress,
    request.amount,
    request.memo,
  )
}
```

### 4.5 ERC-20 전송 에러 매핑

| 에러 코드 | ChainErrorCode | HTTP | 발생 조건 |
|----------|---------------|------|----------|
| `INSUFFICIENT_TOKEN_BALANCE` | INSUFFICIENT_BALANCE | 400 | ERC-20 balanceOf가 전송량 미만 (simulateContract에서 감지) |
| `ERC20_TRANSFER_FAILED` | CHAIN_ERROR | 502 | ERC-20 transfer 함수 실행 실패 (gas 추정 실패, revert 등) |
| `ERC20_SIMULATION_FAILED` | CHAIN_ERROR | 422 | simulateContract 실패 (블랙리스트, pause, 컨트랙트 없음 등) |
| `TOKEN_METADATA_FETCH_FAILED` | RPC_ERROR | 502 | decimals(), symbol() 조회 실패 |

### 4.6 EVM vs Solana 빌드 비교

| 항목 | Solana SPL | EVM ERC-20 |
|------|-----------|-----------|
| 주소 변환 | ATA (Associated Token Account) PDA 계산 | 불필요 (EOA가 직접 보유) |
| 수신자 계정 생성 | ATA 미존재 시 생성 instruction 선행 | 불필요 (ERC-20 내부 매핑) |
| 전송 instruction | `getTransferCheckedInstruction()` | `encodeFunctionData('transfer')` |
| decimals 검증 | transferChecked에서 온체인 검증 | 서비스 레이어에서 사전 검증 |
| 수수료 단위 | lamports (SOL) | gas * gasPrice (ETH/MATIC) |
| 유효 기한 | blockhash 기반 ~50초 | nonce 기반 (무기한) |
| 추가 비용 | ATA 생성: ~0.002 SOL | 새 storage slot: +20,000 gas |
| 위험 토큰 감지 | Token-2022 확장 TLV 파싱 | 별도 블랙리스트 필요 (Phase 24+) |

---

## 5. 파이프라인 통합

### 5.1 6단계 파이프라인 구조 변경 없음

v0.6 핵심 결정에 따라 파이프라인 구조는 변경하지 않는다. 토큰 전송은 기존 6단계 파이프라인 위에 적층된다.

```
Stage 1 (RECEIVE)      -- 요청 접수 + Zod 검증
Stage 2 (SESSION)       -- 세션 제약 검증
Stage 3 (POLICY)        -- 정책 엔진 평가 ← ALLOWED_TOKENS 추가 (섹션 6)
Stage 4 (TIER)          -- 보안 티어 분류 ← TOKEN_TRANSFER 기본 NOTIFY (섹션 7)
Stage 5 (EXECUTE)       -- IChainAdapter 4단계 실행 ← token 분기 (섹션 3, 4)
Stage 6 (CONFIRM)       -- 온체인 확정 대기
```

### 5.2 Stage 1 -- 요청 접수 확장

#### REST API → TransferRequest 변환 흐름

```
클라이언트                  서비스 레이어              IChainAdapter
───────────────────        ──────────────────        ──────────────
POST /v1/transactions/send
{                          buildTransferRequest()
  to: "수신자",            ┌──────────────────┐
  amount: "1000000",       │ type='TRANSFER'? │
  type: "TOKEN_TRANSFER",  │ → token: undefined│
  tokenMint: "EPjFW...",   │                  │
  memo: "payment",         │ type='TOKEN_     │      buildTransaction(req)
  priority: "medium"       │  TRANSFER'?      │      ┌──────────────┐
}                          │ → resolveToken   │      │ req.token?   │
                           │   Info(tokenMint)│      │ → SPL/ERC-20 │
                           │ → token: {       │      │ → buildSpl/  │
                           │    address,      │      │   buildErc20 │
                           │    decimals,     │      │              │
                           │    symbol        │      │ !req.token?  │
                           │   }              │      │ → buildNative│
                           └──────────────────┘      └──────────────┘
```

#### Stage 1 의사코드 변경

```typescript
// packages/daemon/src/services/transaction-pipeline.ts
// stageReceive() 확장

async function stageReceive(
  apiRequest: ApiTransferRequest,
  sessionContext: SessionContext,
): Promise<string> {
  // 1. Zod 검증 (기존과 동일 -- REST API 스키마로 검증)

  // 2. 토큰 전송 시 type/tokenMint 정합성 검증
  if (apiRequest.type === 'TOKEN_TRANSFER' && !apiRequest.tokenMint) {
    throw new ValidationError(
      'INVALID_REQUEST',
      'type=TOKEN_TRANSFER 시 tokenMint은 필수입니다.',
    )
  }

  // 3. TransferRequest 구성 (서비스 레이어 변환)
  const transferRequest = await buildTransferRequest(
    apiRequest,
    sessionContext.agent,
    adapter,
  )

  // 4. transactions 테이블 INSERT
  //    type 필드: 'TRANSFER' 또는 'TOKEN_TRANSFER'
  const txId = generateUUIDv7()
  await db.insert(transactions).values({
    id: txId,
    agentId: sessionContext.agentId,
    sessionId: sessionContext.sessionId,
    type: apiRequest.type ?? 'TRANSFER',       // 'TOKEN_TRANSFER' 정식 사용
    amount: apiRequest.amount,
    toAddress: apiRequest.to,
    status: 'PENDING',
    metadata: JSON.stringify({
      tokenMint: apiRequest.tokenMint,          // 토큰 주소 기록
      tokenSymbol: transferRequest.token?.symbol,
      tokenDecimals: transferRequest.token?.decimals,
      priority: apiRequest.priority,
    }),
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  // 5. 감사 로그
  await insertAuditLog({
    eventType: 'TX_REQUESTED',
    severity: 'info',
    agentId: sessionContext.agentId,
    metadata: {
      txId,
      type: apiRequest.type ?? 'TRANSFER',
      tokenMint: apiRequest.tokenMint,
      amount: apiRequest.amount,
      to: apiRequest.to,
    },
  })

  return txId
}
```

### 5.3 Stage 2 -- 세션 제약 검증 (변경 없음)

세션 제약(SessionConstraints)은 `maxAmount`, `allowedAddresses`, `maxTransactions` 등을 검증한다. 토큰 전송에서:
- `maxAmount`: **적용하지 않음** (토큰 금액은 네이티브와 단위가 다르므로 비교 불가. Phase 24 USD 변환 후 적용)
- `allowedAddresses`: **적용** (수신자 주소는 토큰과 무관하게 동일)
- `maxTransactions`: **적용** (거래 횟수는 유형 무관)

### 5.4 Stage 3 -- 정책 엔진 평가 확장

Stage 3에 ALLOWED_TOKENS 검증이 추가된다. 상세는 섹션 6에서 정의.

```typescript
// DatabasePolicyEngine.evaluate() 확장 (의사코드)

async evaluate(agentId: string, request: TxRequest): Promise<PolicyDecision> {
  const rules = await this.loadActivePolicies(agentId)
  if (rules.length === 0) return { allowed: true, tier: 'INSTANT' }

  const effectiveRules = this.resolveOverrides(rules, agentId)

  // Step 2: WHITELIST 평가 (기존)
  const whitelistResult = this.evaluateWhitelist(effectiveRules, request)
  if (!whitelistResult.allowed) return whitelistResult

  // Step 2.5: ALLOWED_TOKENS 평가 (Phase 22 추가)
  const tokenResult = this.evaluateAllowedTokens(effectiveRules, request)
  if (!tokenResult.allowed) return tokenResult

  // Step 3: TIME_RESTRICTION 평가 (기존)
  const timeResult = this.evaluateTimeRestriction(effectiveRules)
  if (!timeResult.allowed) return timeResult

  // Step 4: RATE_LIMIT 평가 (기존)
  const rateResult = await this.evaluateRateLimit(effectiveRules, agentId)
  if (!rateResult.allowed) return rateResult

  // Step 5: SPENDING_LIMIT 평가 -> 4-티어 분류 (기존, 토큰은 미적용)
  const tierResult = this.evaluateSpendingLimit(effectiveRules, request)
  return tierResult
}
```

### 5.5 Stage 5 -- IChainAdapter 4단계 실행

변경사항은 `buildTransaction()` 내부 분기뿐이다. simulate, sign, submit, confirm은 변경 없음.

```
Stage 5a: adapter.buildTransaction(request)
          ├─ request.token → buildSplTokenTransfer() / buildErc20Transfer()
          └─ !request.token → buildNativeTransfer() (기존)

Stage 5b: adapter.simulateTransaction(unsignedTx)  ← 변경 없음
          SPL/ERC-20도 동일하게 시뮬레이션 가능

Stage 5c: adapter.signTransaction(unsignedTx, privateKey)  ← 변경 없음
          직렬화된 트랜잭션에 서명. 내용과 무관

Stage 5d: adapter.submitTransaction(signedTx)  ← 변경 없음
          서명된 트랜잭션 제출. 내용과 무관
```

### 5.6 transactions 테이블 확장

| 필드 | 변경 | 내용 |
|------|------|------|
| `type` | 정식 사용 | `'TOKEN_TRANSFER'` 값 정식화 (기존 주석에서 열거만 됨) |
| `metadata` | 확장 | `tokenMint`, `tokenSymbol`, `tokenDecimals` 필드 추가 |

**CHECK 제약 추가는 하지 않는다.** transactions.type은 TEXT 자유 문자열로 유지한다. Phase 23에서 `CONTRACT_CALL`, `APPROVE`, `BATCH` 등이 추가되므로, 모든 타입이 확정된 후 Phase 25에서 일괄 CHECK 제약을 설정한다.

### 5.7 REST API 확장

37-rest-api-complete-spec.md의 `POST /v1/transactions/send`는 이미 `type`, `tokenMint` 필드를 정의하고 있다. Phase 22에서 추가 변경 사항:

| 항목 | 현재 | Phase 22 |
|------|------|---------|
| `type` 필드 | `z.enum(['TRANSFER', 'TOKEN_TRANSFER']).optional().default('TRANSFER')` | 변경 없음 |
| `tokenMint` 필드 | `z.string().optional()` | `type=TOKEN_TRANSFER 시 필수` 검증 추가 (`.refine()`) |
| 응답 | TransactionStatusSchema | `metadata.tokenMint`, `metadata.tokenSymbol` 필드 추가 |

```typescript
// REST API TransferRequestSchema 확장 (37-rest-api-complete-spec.md 수정 대상)

const TransferRequestSchema = z.object({
  to: z.string().min(1),
  amount: z.string().min(1),
  type: z.enum(['TRANSFER', 'TOKEN_TRANSFER']).optional().default('TRANSFER'),
  tokenMint: z.string().optional(),
  memo: z.string().max(200).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
}).refine(
  (data) => data.type !== 'TOKEN_TRANSFER' || !!data.tokenMint,
  { message: 'type=TOKEN_TRANSFER 시 tokenMint은 필수입니다', path: ['tokenMint'] },
).openapi('TransferRequest')
```

---

## 6. ALLOWED_TOKENS 정책 규칙

### 6.1 PolicyType Enum 확장

기존 4개 PolicyType에 `ALLOWED_TOKENS`를 추가하여 5개로 확장한다.

| # | PolicyType | 용도 | SSoT |
|---|-----------|------|------|
| 1 | `SPENDING_LIMIT` | 거래 금액 기반 4-티어 분류 | LOCK-MECH |
| 2 | `WHITELIST` | 허용 수신 주소 목록 | LOCK-MECH |
| 3 | `TIME_RESTRICTION` | 시간대 기반 거래 제한 | LOCK-MECH |
| 4 | `RATE_LIMIT` | 거래 횟수 제한 | LOCK-MECH |
| 5 | **`ALLOWED_TOKENS`** | **허용 토큰 종류 목록 (Phase 22 추가)** | **CHAIN-EXT-01** |

### 6.2 ALLOWED_TOKENS vs WHITELIST 구분

| 정책 | 검증 대상 | 질문 | 직교성 |
|------|----------|------|--------|
| `WHITELIST` | 수신 주소 | "어디로 보낼 수 있는가?" | 독립 |
| `ALLOWED_TOKENS` | 토큰 종류 | "무엇을 보낼 수 있는가?" | 독립 |

두 정책은 직교한다. 하나의 거래에 WHITELIST와 ALLOWED_TOKENS가 모두 적용될 수 있다:
- WHITELIST 통과: 수신자 주소가 허용 목록에 있음
- ALLOWED_TOKENS 통과: 전송하는 토큰이 허용 목록에 있음

### 6.3 AllowedTokensRuleSchema (Zod)

```typescript
// packages/core/src/schema/policy-rules.ts (확장)

/**
 * ALLOWED_TOKENS: 에이전트별 허용 토큰 종류 화이트리스트.
 *
 * 이 정책이 설정된 에이전트는 allowed_tokens 목록에 있는 토큰만 전송할 수 있다.
 * 정책 미설정 에이전트는 네이티브 토큰만 전송 가능 (토큰 전송 거부).
 *
 * 설계 원칙:
 * - 기본 거부 (allow_native: true, 나머지 모두 거부)
 * - 명시적 허용 (allowed_tokens에 등록된 토큰만 허용)
 * - Phase 24 USD 정책과 결합: 등록된 토큰만 가격 오라클에서 조회 가능
 */
export const AllowedTokensRuleSchema = z.object({
  /**
   * 허용된 토큰 목록.
   * 비어있으면 어떤 토큰도 전송 불가 (네이티브만 허용, allow_native=true 기본).
   */
  allowed_tokens: z.array(z.object({
    /** 토큰 민트/컨트랙트 주소 (체인별 포맷) */
    address: z.string().min(1),
    /** 토큰 심볼 (관리 UI 표시용) */
    symbol: z.string().min(1),
    /** 소수점 자릿수 (검증용) */
    decimals: z.number().int().min(0).max(18),
    /** 대상 체인 ('solana' | 'ethereum' | 'polygon' | 'arbitrum') */
    chain: z.string().min(1),
  })).default([]),

  /**
   * 네이티브 토큰(SOL/ETH/MATIC) 전송 허용 여부.
   * true (기본): 네이티브 전송은 항상 허용 (ALLOWED_TOKENS 정책과 무관)
   * false: 네이티브 전송도 차단 (극히 드문 케이스)
   */
  allow_native: z.boolean().default(true),

  /**
   * 미등록 토큰 처리 정책.
   * 'DENY' (기본): 미등록 토큰 전송 거부 (POLICY_VIOLATION)
   * 'WARN': 미등록 토큰 전송 허용 + Owner 알림 발송
   */
  unknown_token_action: z.enum(['DENY', 'WARN']).default('DENY'),
})

export type AllowedTokensRule = z.infer<typeof AllowedTokensRuleSchema>
```

#### PolicyRuleSchema 확장

```typescript
// packages/core/src/schema/policy-rules.ts

/**
 * PolicyRule 유니온 스키마: type 필드에 따라 rules 구조가 결정된다.
 * Phase 22: ALLOWED_TOKENS 추가 (5번째 타입)
 */
export const PolicyRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SPENDING_LIMIT'), rules: SpendingLimitRuleSchema }),
  z.object({ type: z.literal('WHITELIST'), rules: WhitelistRuleSchema }),
  z.object({ type: z.literal('TIME_RESTRICTION'), rules: TimeRestrictionRuleSchema }),
  z.object({ type: z.literal('RATE_LIMIT'), rules: RateLimitRuleSchema }),
  z.object({ type: z.literal('ALLOWED_TOKENS'), rules: AllowedTokensRuleSchema }),  // Phase 22 추가
])
```

### 6.4 DatabasePolicyEngine 토큰 검증 로직

```typescript
// packages/daemon/src/domain/policy-engine.ts (확장)

/**
 * ALLOWED_TOKENS 정책 평가.
 *
 * 평가 로직:
 * 1. 토큰 전송 요청인지 확인 (request.tokenMint 존재 여부)
 * 2. 네이티브 전송이면 ALLOWED_TOKENS 평가 건너뜀 (하위 호환)
 * 3. ALLOWED_TOKENS 정책이 없으면 토큰 전송 거부 (기본 거부)
 * 4. allowed_tokens 목록에서 address + chain 매칭
 * 5. 매칭 실패 시 unknown_token_action에 따라 처리
 *
 * @param effectiveRules 적용 가능한 정책 목록
 * @param request 거래 요청 (tokenMint 포함)
 */
private evaluateAllowedTokens(
  effectiveRules: PolicyRow[],
  request: TxRequest,
): PolicyDecision {
  // 1. 네이티브 전송이면 ALLOWED_TOKENS 평가 건너뜀
  // request.type이 'TRANSFER'이거나 tokenMint가 없으면 네이티브 전송
  if (request.type === 'TRANSFER' || !request.tokenMint) {
    // 네이티브 전송에 대한 ALLOWED_TOKENS 정책:
    // allow_native=false인 정책이 있으면 거부
    const tokenPolicy = effectiveRules.find(r => r.type === 'ALLOWED_TOKENS')
    if (tokenPolicy) {
      const rules = AllowedTokensRuleSchema.parse(JSON.parse(tokenPolicy.rules))
      if (!rules.allow_native) {
        return {
          allowed: false,
          tier: 'INSTANT',
          reason: '네이티브 토큰 전송이 정책에 의해 차단됨',
          policyId: tokenPolicy.id,
        }
      }
    }
    // 네이티브 전송 허용 (ALLOWED_TOKENS 평가 종료)
    return { allowed: true, tier: 'INSTANT' }
  }

  // 2. 토큰 전송 -- ALLOWED_TOKENS 정책 조회
  const tokenPolicy = effectiveRules.find(r => r.type === 'ALLOWED_TOKENS')

  // 3. ALLOWED_TOKENS 정책 미설정 → 토큰 전송 거부
  // 핵심 안전 장치: 정책 없이 토큰 전송은 불가
  if (!tokenPolicy) {
    return {
      allowed: false,
      tier: 'INSTANT',
      reason: 'ALLOWED_TOKENS 정책 미설정: 토큰 전송이 허용되지 않습니다. 에이전트에 ALLOWED_TOKENS 정책을 먼저 설정하세요.',
      policyId: undefined,
    }
  }

  // 4. 정책 파싱 및 토큰 매칭
  const rules = AllowedTokensRuleSchema.parse(JSON.parse(tokenPolicy.rules))

  const isAllowed = rules.allowed_tokens.some(
    (t) => t.address.toLowerCase() === request.tokenMint!.toLowerCase()
        && t.chain === request.chain,
  )

  if (isAllowed) {
    // 등록된 토큰 → 허용
    return { allowed: true, tier: 'INSTANT' }
  }

  // 5. 미등록 토큰 처리
  if (rules.unknown_token_action === 'WARN') {
    // WARN 모드: 전송 허용 + Owner 알림 발송
    // 알림은 Stage 4 (NOTIFY 티어) 또는 별도 로직에서 발송
    return {
      allowed: true,
      tier: 'NOTIFY',  // 강제 NOTIFY 티어로 승격 (Owner 알림 보장)
      reason: `미등록 토큰 전송 경고: ${request.tokenMint} (WARN 모드)`,
    }
  }

  // DENY 모드 (기본): 전송 거부
  return {
    allowed: false,
    tier: 'INSTANT',
    reason: `토큰 ${request.tokenMint}이(가) 허용 목록에 없습니다 (TOKEN_NOT_ALLOWED)`,
    policyId: tokenPolicy.id,
  }
}
```

### 6.5 IPolicyEngine.evaluate 입력 타입 확장

```typescript
// packages/core/src/interfaces/policy-engine.ts (확장)

/** 정책 엔진 인터페이스 */
interface IPolicyEngine {
  evaluate(agentId: string, request: {
    type: string           // 'TRANSFER' | 'TOKEN_TRANSFER'
    amount: string
    to: string
    chain: string
    tokenMint?: string     // Phase 22 추가: 토큰 민트/컨트랙트 주소
  }): Promise<PolicyDecision>
}
```

### 6.6 policies 테이블 변경

#### CHECK 제약 수정

```sql
-- 기존 (LOCK-MECH)
CHECK (type IN ('SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT'))

-- Phase 22 확장
CHECK (type IN ('SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT', 'ALLOWED_TOKENS'))
```

#### Drizzle ORM 수정

```typescript
// packages/core/src/schema/policies.ts (확장)

type: text('type', {
  enum: ['SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT', 'ALLOWED_TOKENS']
}).notNull(),
```

### 6.7 ALLOWED_TOKENS 정책 예시

```typescript
// 에이전트에 USDC(Solana) + USDT(Ethereum) 허용 설정

const agentTokenPolicy = {
  id: generateUUIDv7(),
  agentId: 'agent-001-uuid',
  type: 'ALLOWED_TOKENS',
  rules: JSON.stringify({
    allowed_tokens: [
      {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  // Solana USDC
        symbol: 'USDC',
        decimals: 6,
        chain: 'solana',
      },
      {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',     // Ethereum USDT
        symbol: 'USDT',
        decimals: 6,
        chain: 'ethereum',
      },
    ],
    allow_native: true,            // SOL/ETH 전송도 허용
    unknown_token_action: 'DENY',  // 미등록 토큰 거부
  }),
  priority: 10,
  enabled: 1,
  createdAt: now,
  updatedAt: now,
}
```

### 6.8 45-enum-unified-mapping.md PolicyType 확장 명세

```typescript
// 45-enum-unified-mapping.md 섹션 2.4 PolicyType 수정 대상

// Zod Schema (확장)
const PolicyTypeEnum = z.enum([
  'SPENDING_LIMIT', 'WHITELIST', 'TIME_RESTRICTION', 'RATE_LIMIT', 'ALLOWED_TOKENS'
])

// TypeScript Type
type PolicyType = z.infer<typeof PolicyTypeEnum>
// = 'SPENDING_LIMIT' | 'WHITELIST' | 'TIME_RESTRICTION' | 'RATE_LIMIT' | 'ALLOWED_TOKENS'
```

---

## 7. TOKEN_TRANSFER 보안 티어 전략

### 7.1 과도기 전략 (Phase 22-23)

v0.6 핵심 결정: **USD 기준 정책 평가는 Phase 24**에서 IPriceOracle로 구현한다. Phase 22-23 동안은 토큰 금액을 USD로 변환할 수 없으므로, SPENDING_LIMIT의 4-티어 분류(INSTANT/NOTIFY/DELAY/APPROVAL)를 토큰 전송에 적용할 수 없다.

#### TOKEN_TRANSFER 기본 보안 티어: NOTIFY

```typescript
// DatabasePolicyEngine.evaluateSpendingLimit() 내부

private evaluateSpendingLimit(
  effectiveRules: PolicyRow[],
  request: TxRequest,
): PolicyDecision {
  // 토큰 전송인 경우: SPENDING_LIMIT 적용 불가
  // 금액 비교가 불가능하므로 기본 NOTIFY 티어 적용
  if (request.type === 'TOKEN_TRANSFER' || request.tokenMint) {
    return {
      allowed: true,
      tier: 'NOTIFY',  // 기본 NOTIFY (INSTANT보다 한 단계 높은 안전 마진)
      reason: 'TOKEN_TRANSFER: SPENDING_LIMIT 미적용 (Phase 24 USD 변환 전 과도기)',
    }
  }

  // 네이티브 전송: 기존 4-티어 분류 로직 (변경 없음)
  const spendingLimit = effectiveRules.find(r => r.type === 'SPENDING_LIMIT')
  if (!spendingLimit) return { allowed: true, tier: 'INSTANT' }

  const rules = SpendingLimitRuleSchema.parse(JSON.parse(spendingLimit.rules))
  const amount = BigInt(request.amount)

  if (amount <= BigInt(rules.instant_max)) return { allowed: true, tier: 'INSTANT' }
  if (amount <= BigInt(rules.notify_max)) return { allowed: true, tier: 'NOTIFY' }
  if (amount <= BigInt(rules.delay_max)) {
    return {
      allowed: true,
      tier: 'DELAY',
      delaySeconds: rules.delay_seconds,
    }
  }
  return {
    allowed: true,
    tier: 'APPROVAL',
    approvalTimeoutSeconds: rules.approval_timeout,
  }
}
```

#### NOTIFY 티어 선택 근거

| 티어 | TOKEN_TRANSFER 적합성 | 근거 |
|------|---------------------|------|
| INSTANT | **부적합** | 금액 검증 없이 즉시 실행은 위험. 소액 보장 불가 |
| **NOTIFY** | **채택** | 즉시 실행 + Owner 알림. 과도기 안전 마진으로 적절 |
| DELAY | 과잉 | 모든 토큰 전송에 15분 대기는 DX 저하 |
| APPROVAL | 과잉 | 모든 토큰 전송에 Owner 서명 필요는 자율성 제거 |

#### Phase 22-23 동안 TOKEN_TRANSFER에 적용되는 정책

| 정책 | 적용 여부 | 근거 |
|------|----------|------|
| ALLOWED_TOKENS | **적용** | 허용 토큰 화이트리스트 (핵심 보안) |
| WHITELIST | **적용** | 수신 주소 화이트리스트 (토큰과 무관) |
| TIME_RESTRICTION | **적용** | 시간대 제한 (토큰과 무관) |
| RATE_LIMIT | **적용** | 거래 횟수 제한 (토큰과 무관) |
| SPENDING_LIMIT | **미적용** | 금액 비교 불가 (토큰/네이티브 단위 다름) |

### 7.2 Phase 24 통합 후

Phase 24에서 IPriceOracle이 구현되면:

1. **IPriceOracle로 토큰 → USD 변환**
   ```typescript
   const usdValue = await priceOracle.getPrice(token.address, token.chain)
   const usdAmount = (amount * usdValue) / (10n ** BigInt(token.decimals))
   ```

2. **USD 금액 기준으로 SPENDING_LIMIT 적용**
   - 네이티브와 동일한 4-티어 분류
   - USD 임계값: instant_max_usd, notify_max_usd, delay_max_usd

3. **TOKEN_TRANSFER의 기본 NOTIFY 티어 제거**
   - USD 기준 동적 분류로 대체
   - 소액 토큰 전송도 INSTANT 가능

```
Phase 22-23 (과도기)           Phase 24 (USD 통합)
──────────────────            ──────────────────
TOKEN_TRANSFER                TOKEN_TRANSFER
  ↓                             ↓
ALLOWED_TOKENS 검증           ALLOWED_TOKENS 검증
  ↓                             ↓
WHITELIST 검증                WHITELIST 검증
  ↓                             ↓
TIME_RESTRICTION 검증         TIME_RESTRICTION 검증
  ↓                             ↓
RATE_LIMIT 검증               RATE_LIMIT 검증
  ↓                             ↓
기본 NOTIFY 티어 (고정)       IPriceOracle → USD 변환
                                ↓
                              SPENDING_LIMIT (USD 기준) → 동적 4-티어
```

### 7.3 보안 모델 다이어그램

```
요청: POST /v1/transactions/send

┌─────────────────────────────────────────────────────┐
│ 네이티브 전송 (token=undefined)                       │
│                                                      │
│  Stage 3: WHITELIST → TIME → RATE → SPENDING_LIMIT  │
│                                          ↓           │
│  Stage 4: 4-티어 분류 (금액 기반)                    │
│           INSTANT / NOTIFY / DELAY / APPROVAL        │
│                                                      │
│  정책 평가 경로: 기존 v0.2와 동일 (변경 없음)          │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 토큰 전송 (token={address, decimals, symbol})         │
│                                                      │
│  Stage 3: ALLOWED_TOKENS → WHITELIST → TIME → RATE  │
│                                                  ↓   │
│           SPENDING_LIMIT 미적용 (Phase 24 전)         │
│                                                      │
│  Stage 4: 기본 NOTIFY 티어 (고정)                    │
│           → Phase 24에서 USD 기준 동적 분류로 대체     │
│                                                      │
│  추가 보안: ALLOWED_TOKENS 미설정 시 토큰 전송 거부     │
└─────────────────────────────────────────────────────┘
```

---

## 8. 에러 코드 통합

### 8.1 TOKEN 도메인 에러 코드

기존 에러 코드 체계(37-rest-api-complete-spec.md 섹션 10)에 TOKEN 도메인을 추가한다.

| 코드 | HTTP | retryable | 설명 | 발생 위치 |
|------|------|-----------|------|----------|
| `TOKEN-001` `INVALID_TOKEN_MINT` | 400 | false | 유효하지 않은 토큰 민트/컨트랙트 주소 (계정 미존재, owner 불일치) | Stage 5a (buildTransaction) |
| `TOKEN-002` `INSUFFICIENT_TOKEN_BALANCE` | 400 | false | 토큰 잔액 부족 (시뮬레이션 감지) | Stage 5b (simulateTransaction) |
| `TOKEN-003` `TOKEN_NOT_ALLOWED` | 403 | false | ALLOWED_TOKENS 정책 위반 (미등록 토큰 전송 시도) | Stage 3 (POLICY CHECK) |
| `TOKEN-004` `ATA_CREATION_FAILED` | 502 | true | Solana ATA 생성 실패 (rent-exempt 잔액 부족 등) | Stage 5a (buildSplTokenTransfer) |
| `TOKEN-005` `UNSUPPORTED_TOKEN_EXTENSION` | 400 | false | Token-2022 위험 확장 감지 (TransferFee, ConfidentialTransfer 등) | Stage 5a (buildSplTokenTransfer) |
| `TOKEN-006` `ERC20_TRANSFER_FAILED` | 502 | true | ERC-20 transfer 함수 실행 실패 (gas 추정 실패, revert) | Stage 5a (buildErc20Transfer) |
| `TOKEN-007` `ERC20_SIMULATION_FAILED` | 422 | false | ERC-20 simulateContract 실패 (블랙리스트, pause 등) | Stage 5a (buildErc20Transfer) |
| `TOKEN-008` `TOKEN_METADATA_FETCH_FAILED` | 502 | true | 토큰 메타데이터 조회 실패 (decimals, symbol RPC 오류) | Stage 1 (서비스 레이어) |

### 8.2 에러 코드 체계 통계 갱신

| 도메인 | 코드 수 | Phase 22 변경 |
|--------|--------|-------------|
| AUTH | 8 | 변경 없음 |
| SESSION | 8 | 변경 없음 |
| TX | 7 | 변경 없음 |
| POLICY | 4 | 변경 없음 (TOKEN_NOT_ALLOWED는 TOKEN 도메인) |
| OWNER | 4 | 변경 없음 |
| SYSTEM | 6 | 변경 없음 |
| AGENT | 3 | 변경 없음 |
| **TOKEN** | **8** | **신규 도메인** |
| **합계** | **48** | **+8** |

### 8.3 hint 매핑 (55-dx-improvement-spec.md 확장)

```typescript
// DX hint 매핑 확장

const tokenErrorHints: Record<string, string> = {
  INVALID_TOKEN_MINT:
    '토큰 주소를 확인하세요. Solana는 base58, EVM은 0x hex 형식이어야 합니다.',
  INSUFFICIENT_TOKEN_BALANCE:
    '에이전트 지갑의 토큰 잔액을 확인하세요. waiaas status --tokens로 조회 가능합니다.',
  TOKEN_NOT_ALLOWED:
    '이 토큰은 허용 목록에 없습니다. waiaas policy add --type ALLOWED_TOKENS로 토큰을 등록하세요.',
  ATA_CREATION_FAILED:
    '에이전트 지갑에 SOL이 부족할 수 있습니다 (ATA 생성에 ~0.002 SOL 필요). waiaas status로 잔액을 확인하세요.',
  UNSUPPORTED_TOKEN_EXTENSION:
    '이 토큰은 Token-2022 확장(TransferFee 등)을 사용합니다. WAIaaS에서 아직 지원하지 않습니다.',
  ERC20_TRANSFER_FAILED:
    '토큰 전송이 실패했습니다. 잔액, gas, 컨트랙트 상태를 확인하세요.',
  ERC20_SIMULATION_FAILED:
    '토큰 전송 시뮬레이션이 실패했습니다. 컨트랙트가 유효한지, 토큰이 pause 상태가 아닌지 확인하세요.',
  TOKEN_METADATA_FETCH_FAILED:
    '토큰 정보 조회에 실패했습니다. RPC 연결 상태를 확인하고 재시도하세요.',
}
```

---

## 9. 기존 문서 변경 요약

Phase 25에서 반영할 기존 문서 변경 목록이다. 각 변경은 "무엇을, 어디서, 왜" 형태로 기술하여 Phase 25 실행자가 바로 반영할 수 있도록 한다.

### 9.1 27-chain-adapter-interface.md (CORE-04)

| # | 대상 섹션 | 변경 내용 | 근거 |
|---|----------|----------|------|
| 1 | 2.3 TransferRequest | `token?: TokenInfo` 필드 추가, TokenInfo 인터페이스 정의 | 토큰 전송 지원 |
| 2 | 2.3 TransferRequest JSDoc | "SPL/ERC-20 토큰 전송은 v0.3에서 확장 예정" 문구 제거, Phase 22 정식 지원 반영 | 상태 갱신 |
| 3 | 2.8 타입 요약 | TokenInfo 행 추가: `TokenInfo | 토큰 식별 | address, decimals, symbol | 토큰 전송 시 사용` | 타입 목록 완성 |
| 4 | 5. 에러 코드 | TOKEN 도메인 에러 8개 추가 (TOKEN-001~008) | 에러 체계 확장 |

### 9.2 31-solana-adapter-detail.md (CHAIN-SOL)

| # | 대상 섹션 | 변경 내용 | 근거 |
|---|----------|----------|------|
| 1 | 5.2 SPL 토큰 전송 | `getTransferInstruction` → `getTransferCheckedInstruction`으로 교체, decimals 파라미터 추가 | 안전성 향상 |
| 2 | 5.2 SPL 토큰 전송 | Token Program 하드코딩 → mint owner 기반 동적 판별 (TOKEN_PROGRAM_ID / TOKEN_2022_PROGRAM_ID) | Token-2022 지원 |
| 3 | 5.2 SPL 토큰 전송 | Token-2022 확장 감지/거부 로직 추가 (validateToken2022Extensions) | 보안 |
| 4 | 5.2 SPL 토큰 전송 | "v0.2 설계만 포함, 구현은 v0.3" 문구 제거 → "Phase 22 정식 스펙. CHAIN-EXT-01 참조" | 상태 갱신 |
| 5 | 5.3 buildTransaction 분기 | 주석 처리된 분기 코드 → `request.token` 기반 정식 분기로 교체 | token 필드 기반 분기 |
| 6 | 11.5 제약사항 | "네이티브 SOL만 지원" 제거 → "SPL 토큰 지원 (CHAIN-EXT-01)" | 상태 갱신 |
| 7 | 11.4 의존 패키지 | `@solana-program/token-2022` 추가 | Token-2022 지원 |

### 9.3 36-killswitch-autostop-evm.md (KILL-AUTO-EVM)

| # | 대상 섹션 | 변경 내용 | 근거 |
|---|----------|----------|------|
| 1 | 10.5 viem 기반 v0.3 구현 노트 | buildErc20Transfer 설계 참조 추가: "토큰 전송 빌드 로직은 CHAIN-EXT-01 섹션 4 참조" | 문서 간 링크 |
| 2 | 10.1 개요 | "v0.3에서 본구현으로 교체" → "v0.3에서 본구현. 토큰 전송은 CHAIN-EXT-01 설계 기반" | 상태 갱신 |

### 9.4 33-time-lock-approval-mechanism.md (LOCK-MECH)

| # | 대상 섹션 | 변경 내용 | 근거 |
|---|----------|----------|------|
| 1 | 2.1 policies 테이블 | CHECK 제약에 `'ALLOWED_TOKENS'` 추가 | PolicyType 확장 |
| 2 | 2.1 Drizzle ORM | enum 배열에 `'ALLOWED_TOKENS'` 추가 | PolicyType 확장 |
| 3 | 2.2 PolicyRuleSchema | `ALLOWED_TOKENS` discriminated union 추가, AllowedTokensRuleSchema 참조 | 정책 규칙 확장 |
| 4 | 3.2 DatabasePolicyEngine | evaluateAllowedTokens() 단계 추가 (Step 2와 Step 3 사이) | 토큰 검증 로직 |
| 5 | 3.2 evaluate() | tokenMint 파라미터 추가 (TxRequest 확장) | 입력 타입 확장 |

### 9.5 25-sqlite-schema.md (CORE-02)

| # | 대상 섹션 | 변경 내용 | 근거 |
|---|----------|----------|------|
| 1 | 2.2 policies 테이블 CHECK | `'ALLOWED_TOKENS'` 추가 | PolicyType 확장 |
| 2 | 2.2 policies Drizzle ORM | enum 배열에 `'ALLOWED_TOKENS'` 추가 | PolicyType 확장 |
| 3 | 2.3 transactions 테이블 주석 | `type` 필드 설명에 'TOKEN_TRANSFER' 정식 사용 명시 | 사용 정식화 |

### 9.6 37-rest-api-complete-spec.md (API-SPEC)

| # | 대상 섹션 | 변경 내용 | 근거 |
|---|----------|----------|------|
| 1 | 4.3 POST /v1/transactions/send | tokenMint 필드에 `.refine()` 추가: type=TOKEN_TRANSFER 시 필수 | 검증 강화 |
| 2 | 4.3 응답 스키마 | metadata에 tokenMint, tokenSymbol, tokenDecimals 추가 | 토큰 정보 반환 |
| 3 | 10. 에러 코드 | TOKEN 도메인 8개 에러 추가, 합계 40→48 | 에러 체계 확장 |
| 4 | 12.5 v0.3 확장 포인트 | "SPL 토큰" → "CHAIN-EXT-01에서 설계 완료 (Phase 22)" | 상태 갱신 |

### 9.7 45-enum-unified-mapping.md (ENUM-MAP)

| # | 대상 섹션 | 변경 내용 | 근거 |
|---|----------|----------|------|
| 1 | 2.4 PolicyType | 값 5개로 확장: `ALLOWED_TOKENS` 추가 | Enum 통합 |
| 2 | 2.4 DB CHECK, Drizzle ORM, Zod | 각각 `'ALLOWED_TOKENS'` 추가 | 일관성 |
| 3 | 2.4 변경 이력 | "Phase 22 (CHAIN-EXT-01): ALLOWED_TOKENS 추가" 기록 | 이력 추적 |

### 9.8 32-transaction-pipeline-api.md (TX-PIPE)

| # | 대상 섹션 | 변경 내용 | 근거 |
|---|----------|----------|------|
| 1 | Stage 1 stageReceive | tokenMint 처리 로직, transactions.type='TOKEN_TRANSFER' INSERT | 토큰 전송 접수 |
| 2 | Stage 3 POLICY CHECK | evaluateAllowedTokens 단계 추가 참조 (CHAIN-EXT-01 섹션 6) | 토큰 정책 검증 |
| 3 | Stage 5a buildTransaction | `request.token` 분기 참조 (CHAIN-EXT-01 섹션 3, 4) | 빌드 분기 |
| 4 | 7.1 TransactionPipeline | policyEngine.evaluate 호출 시 tokenMint 전달 | 입력 확장 |

### 9.9 변경 요약 통계

| 문서 | 변경 항목 수 | 변경 유형 |
|------|------------|----------|
| 27-chain-adapter-interface.md | 4 | 타입 확장, 에러 추가 |
| 31-solana-adapter-detail.md | 7 | SPL 정식화, Token-2022, 분기 교체 |
| 36-killswitch-autostop-evm.md | 2 | 참조 추가 |
| 33-time-lock-approval-mechanism.md | 5 | PolicyType/정책 로직 확장 |
| 25-sqlite-schema.md | 3 | CHECK 제약, Drizzle 확장 |
| 37-rest-api-complete-spec.md | 4 | refine 추가, 에러 도메인, 메타데이터 |
| 45-enum-unified-mapping.md | 3 | Enum 확장 |
| 32-transaction-pipeline-api.md | 4 | 파이프라인 토큰 통합 |
| **합계** | **32** | |
