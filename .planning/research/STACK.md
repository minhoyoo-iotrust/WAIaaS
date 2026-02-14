# Technology Stack: v1.4.7 Sign-Only Transaction Signing API

**Project:** WAIaaS v1.4.7 -- 임의 트랜잭션 서명 API
**Researched:** 2026-02-14
**Mode:** Subsequent Milestone (stack additions only)

---

## Executive Summary

v1.4.7의 핵심 발견: **새로운 의존성 추가가 필요하지 않다.** 기존 스택(viem 2.45.3, @solana/kit 6.0.1, @modelcontextprotocol/sdk 1.26.0)이 unsigned tx 파싱, EVM calldata 인코딩, MCP 리소스 템플릿 기능을 모두 내장하고 있다. 이 마일스톤은 기존 라이브러리의 미사용 API를 활용하여 새 기능을 구현하는 것이 핵심이다.

---

## Recommended Stack Additions

### 신규 의존성: 없음

v1.4.7에서 **새로운 npm 패키지를 추가하지 않는다.** 모든 필요 기능이 기존 의존성에 내장되어 있다.

---

## 기존 라이브러리의 미사용 API 활성화

### 1. EVM Unsigned Transaction 파싱 (viem 2.45.3)

| 함수 | 임포트 경로 | 용도 | 현재 사용 여부 |
|------|------------|------|--------------|
| `parseTransaction` | `viem` | unsigned hex -> to, value, data, chainId, nonce 추출 | O (simulateTransaction, signTransaction에서 사용 중) |
| `decodeFunctionData` | `viem` | calldata -> functionName, args 디코딩 | X (신규 활용) |
| `decodeAbiParameters` | `viem` | ABI 파라미터 디코딩 (개별 파라미터 수준) | X (신규 활용) |
| `encodeFunctionData` | `viem` | ABI + functionName + args -> calldata hex 인코딩 | O (buildTokenTransfer, buildApprove에서 사용 중) |

**신규 활용 상세:**

```typescript
// 1. EVM unsigned tx 파싱: parseTransaction은 이미 사용 중
import { parseTransaction } from 'viem';
const parsed = parseTransaction(unsignedHex);
// parsed.to, parsed.value, parsed.data, parsed.chainId, parsed.nonce 모두 접근 가능

// 2. EVM calldata 디코딩: decodeFunctionData 신규 활용
import { decodeFunctionData } from 'viem';
const { functionName, args } = decodeFunctionData({ abi: ERC20_ABI, data: parsed.data });
// -> functionName: 'transfer', args: [to, amount]

// 3. EVM calldata 인코딩 API: encodeFunctionData는 이미 사용 중
// POST /v1/utils/encode-calldata 엔드포인트에서 래핑만 하면 됨
import { encodeFunctionData } from 'viem';
const calldata = encodeFunctionData({ abi, functionName, args });
```

**EVM tx 파싱 전략 (4byte selector 기반):**

```typescript
// tx-parser.ts에서 ERC-20 메서드를 하드코딩으로 식별
// decodeFunctionData는 ABI가 필요하므로 알려진 ABI(ERC-20)에만 사용
// 알려지지 않은 컨트랙트는 4byte selector 추출만으로 CONTRACT_WHITELIST + METHOD_WHITELIST 평가 가능
function parseEvmCalldata(data: Hex): ParsedOperation {
  if (!data || data === '0x') {
    return { type: 'NATIVE_TRANSFER' };  // data 없음 = ETH 전송
  }
  const selector = data.slice(0, 10);  // 0x + 8 hex chars = 4 bytes

  // 알려진 ERC-20 selectors
  if (selector === '0xa9059cbb') {  // transfer(address,uint256)
    const { args } = decodeFunctionData({ abi: ERC20_ABI, data });
    return { type: 'TOKEN_TRANSFER', to: args[0], amount: args[1] };
  }
  if (selector === '0x095ea7b3') {  // approve(address,uint256)
    const { args } = decodeFunctionData({ abi: ERC20_ABI, data });
    return { type: 'APPROVE', to: args[0], amount: args[1] };
  }

  // 미지의 컨트랙트 호출
  return { type: 'CONTRACT_CALL', method: selector };
}
```

**신뢰도: HIGH** -- viem 2.45.3의 `_types/index.d.ts`에서 `decodeFunctionData`, `decodeAbiParameters`, `encodeFunctionData` 모두 export 확인 완료. 기존 EvmAdapter에서 `parseTransaction`, `encodeFunctionData` 이미 실사용 중.

### 2. Solana Unsigned Transaction 파싱 (@solana/kit 6.0.1)

| 함수 | 임포트 경로 | 용도 | 현재 사용 여부 |
|------|------------|------|--------------|
| `getTransactionDecoder` | `@solana/kit` (via @solana/transactions) | wire bytes -> Transaction (signatures + messageBytes) | O (SolanaAdapter에서 사용 중) |
| `getCompiledTransactionMessageDecoder` | `@solana/kit` (via @solana/transaction-messages) | messageBytes -> CompiledTransactionMessage | X (신규 활용) |
| `decompileTransactionMessageFetchingLookupTables` | `@solana/kit` | CompiledTransactionMessage -> TransactionMessage (lookup table 해석 포함) | X (신규 활용) |

**신규 활용 상세:**

```typescript
import {
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
} from '@solana/kit';

// 1단계: wire bytes -> Transaction 객체 (이미 SolanaAdapter에서 사용 중)
const txDecoder = getTransactionDecoder();
const transaction = txDecoder.decode(rawBytes);
// transaction.messageBytes, transaction.signatures

// 2단계: messageBytes -> CompiledTransactionMessage (신규 활용)
const msgDecoder = getCompiledTransactionMessageDecoder();
const compiledMsg = msgDecoder.decode(transaction.messageBytes);
// compiledMsg.header, compiledMsg.staticAccounts[], compiledMsg.instructions[]

// 3단계: instruction에서 programId, accounts, data 추출
for (const ix of compiledMsg.instructions) {
  const programAddress = compiledMsg.staticAccounts[ix.programAddressIndex];
  const accountAddresses = ix.accountIndices?.map(i => compiledMsg.staticAccounts[i]);
  const instructionData = ix.data;  // Uint8Array
}
```

**CompiledTransactionMessage 구조 (d.ts에서 확인):**

```typescript
{
  header: { numSignerAccounts, numReadonlySignerAccounts, numReadonlyNonSignerAccounts },
  staticAccounts: Address[],  // 모든 계정 주소 배열
  instructions: Array<{
    programAddressIndex: number,        // staticAccounts 인덱스
    accountIndices?: number[],          // staticAccounts 인덱스 배열
    data?: ReadonlyUint8Array,          // instruction data
  }>,
  lifetimeToken: string,  // blockhash
  version: 'legacy' | 0,
  addressTableLookups?: Array<{...}>,  // v0 only
}
```

**Solana instruction 파싱 전략:**

```typescript
// tx-parser.ts에서 알려진 프로그램을 하드코딩으로 식별
function classifySolanaInstruction(
  programAddress: string,
  data: Uint8Array | undefined,
  accounts: string[],
): ParsedOperation {
  switch (programAddress) {
    case '11111111111111111111111111111111': {
      // System Program: instruction type은 data[0..3] LE uint32
      if (data && data.length >= 4) {
        const instructionType = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
        if (instructionType === 2) {  // Transfer
          // amount는 data[4..11] LE uint64
          const amount = readU64LE(data, 4);
          return { type: 'NATIVE_TRANSFER', to: accounts[1], amount };
        }
      }
      return { type: 'CONTRACT_CALL', programId: programAddress };
    }
    case 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA':
    case 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb': {
      // SPL Token / Token-2022: instruction type은 data[0] uint8
      if (data && data.length >= 1) {
        if (data[0] === 12) return { type: 'TOKEN_TRANSFER', token: accounts[1] };  // TransferChecked
        if (data[0] === 13) return { type: 'APPROVE', token: accounts[1] };  // ApproveChecked
      }
      return { type: 'CONTRACT_CALL', programId: programAddress };
    }
    default:
      // Anchor discriminator: 처음 8바이트
      const discriminator = data ? toHex(data.slice(0, 8)) : undefined;
      return { type: 'CONTRACT_CALL', programId: programAddress, method: discriminator };
  }
}
```

**Address Lookup Table 처리:**

v0 트랜잭션에서 `addressTableLookups`가 있으면 `decompileTransactionMessageFetchingLookupTables`로 실제 주소를 해석해야 한다. 이 함수는 RPC 호출이 필요하므로, sign-only 파이프라인에서 RPC 연결이 활성화되어 있어야 한다.

```typescript
import { decompileTransactionMessageFetchingLookupTables } from '@solana/kit';

// Address Lookup Table이 있는 v0 tx 처리
if (compiledMsg.addressTableLookups && compiledMsg.addressTableLookups.length > 0) {
  const fullMessage = await decompileTransactionMessageFetchingLookupTables(
    compiledMsg,
    rpc,
  );
  // fullMessage.instructions에서 실제 주소로 해석된 계정 목록 접근 가능
}
```

**신뢰도: HIGH** -- `@solana/kit` 6.0.1의 index.d.ts에서 `@solana/transaction-messages` re-export 확인. `getCompiledTransactionMessageDecoder`는 `@solana/transaction-messages/dist/types/codecs/message.d.ts`에서 선언 확인. `decompileTransactionMessageFetchingLookupTables`는 `@solana/kit` 자체 export 확인.

### 3. MCP 리소스 템플릿 (@modelcontextprotocol/sdk 1.26.0)

| 클래스/함수 | 임포트 경로 | 용도 | 현재 사용 여부 |
|------------|------------|------|--------------|
| `ResourceTemplate` | `@modelcontextprotocol/sdk/server/mcp.js` | URI 템플릿 기반 동적 리소스 등록 | X (신규 활용) |
| `server.resource()` (template overload) | `@modelcontextprotocol/sdk/server/mcp.js` | 템플릿 리소스 핸들러 등록 | X (신규 활용) |

**현재 MCP 리소스 패턴 (정적 URI):**

```typescript
// 기존: 정적 URI 리소스 (3개)
server.resource('Wallet Balance', 'waiaas://wallet/balance', { ... }, async () => { ... });
server.resource('Wallet Address', 'waiaas://wallet/address', { ... }, async () => { ... });
server.resource('System Status', 'waiaas://system/status', { ... }, async () => { ... });
```

**신규: 스킬 리소스 템플릿 패턴:**

```typescript
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

// 스킬 파일 목록 (skills/ 디렉토리)
const SKILL_FILES = ['quickstart', 'wallet', 'transactions', 'policies', 'admin'];

// waiaas://skills/{name} 리소스 템플릿
const skillTemplate = new ResourceTemplate(
  'waiaas://skills/{name}',
  {
    list: async () => ({
      resources: SKILL_FILES.map(name => ({
        uri: `waiaas://skills/${name}`,
        name: `${name} skill`,
        description: `API reference for ${name}`,
        mimeType: 'text/markdown',
      })),
    }),
  },
);

server.resource(
  'API Skills',
  skillTemplate,
  {
    description: 'WAIaaS API skill files for agent reference',
    mimeType: 'text/markdown',
  },
  async (uri, { name }) => ({
    contents: [{
      uri: uri.href,
      text: await readSkillFile(name as string),
      mimeType: 'text/markdown',
    }],
  }),
);
```

**ResourceTemplate API (v1.26.0 mcp.d.ts 확인):**

```typescript
class ResourceTemplate {
  constructor(
    uriTemplate: string | UriTemplate,
    callbacks: {
      list: ListResourcesCallback | undefined;  // 필수 (undefined 허용)
      complete?: { [variable: string]: CompleteResourceTemplateCallback };
    },
  );
  get uriTemplate(): UriTemplate;
  get listCallback(): ListResourcesCallback | undefined;
  completeCallback(variable: string): CompleteResourceTemplateCallback | undefined;
}

// server.resource() template overload 시그니처
resource(
  name: string,
  template: ResourceTemplate,
  metadata: ResourceMetadata,
  readCallback: ReadResourceTemplateCallback,
): RegisteredResourceTemplate;

// ReadResourceTemplateCallback 시그니처
type ReadResourceTemplateCallback = (
  uri: URL,
  variables: Variables,
  extra: RequestHandlerExtra,
) => ReadResourceResult | Promise<ReadResourceResult>;
```

`list` 콜백이 `undefined`가 아닌 함수이면 `resources/list` 요청 시 해당 콜백이 호출되어 동적 리소스 목록을 반환한다.

**스킬 파일 읽기 전략:**

MCP 서버는 daemon과 별도 프로세스이므로 skills/ 파일 접근 방식을 결정해야 한다:
- **옵션 A: 파일 시스템에서 직접 읽기** -- MCP 서버가 프로젝트 루트를 알아야 함
- **옵션 B: daemon REST API 경유** -- `GET /v1/skills/{name}` 엔드포인트 추가
- **권장: 옵션 B** -- 기존 ApiClient 패턴과 일관성 유지. daemon이 skills/ 파일을 서빙

**신뢰도: HIGH** -- `@modelcontextprotocol/sdk` 1.26.0의 `dist/esm/server/mcp.d.ts`에서 `ResourceTemplate` 클래스 선언 확인. `server.resource()` 메서드의 template overload 시그니처 확인.

### 4. Solana Transaction 서명 (@solana/kit 6.0.1)

기존 SolanaAdapter.signTransaction()과 동일 패턴. 외부 unsigned tx를 서명하는 `signExternalTransaction`은 기존 코드 재사용.

```typescript
import {
  getTransactionDecoder,
  getTransactionEncoder,
  signBytes,
  createKeyPairFromBytes,
  createKeyPairFromPrivateKeyBytes,
  getAddressFromPublicKey,
} from '@solana/kit';

// 외부 unsigned tx를 base64에서 디코딩
const rawBytes = new Uint8Array(Buffer.from(base64Tx, 'base64'));
const txDecoder = getTransactionDecoder();
const txEncoder = getTransactionEncoder();
const transaction = txDecoder.decode(rawBytes);

// 월렛 키로 서명 (SolanaAdapter.signTransaction 기존 로직과 동일)
const keyPair = privateKey.length === 64
  ? await createKeyPairFromBytes(privateKey)
  : await createKeyPairFromPrivateKeyBytes(privateKey.slice(0, 32));
const signerAddress = await getAddressFromPublicKey(keyPair.publicKey);
const signature = await signBytes(keyPair.privateKey, transaction.messageBytes);

// 서명을 트랜잭션에 삽입
const signedTx = {
  ...transaction,
  signatures: {
    ...transaction.signatures,
    [signerAddress]: signature,
  },
};

// 서명된 트랜잭션을 base64로 인코딩하여 반환
const signedBytes = new Uint8Array(txEncoder.encode(signedTx));
return Buffer.from(signedBytes).toString('base64');
```

**이미 사용 중인 함수들이므로 추가 의존성 없음.** SolanaAdapter.signTransaction()의 기존 로직과 동일 패턴.

### 5. EVM Transaction 서명 (viem 2.45.3)

기존 EvmAdapter.signTransaction()과 동일 패턴. 외부에서 받은 unsigned hex를 파싱하고 서명.

```typescript
import { parseTransaction, toHex, hexToBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { TransactionSerializedEIP1559, Hex } from 'viem';

// 외부 unsigned tx를 파싱
const parsed = parseTransaction(unsignedHex as TransactionSerializedEIP1559);

// 월렛 키로 서명
const privateKeyHex = `0x${Buffer.from(privateKey).toString('hex')}` as Hex;
const account = privateKeyToAccount(privateKeyHex);
const signedHex = await account.signTransaction({
  ...parsed,
  type: 'eip1559',
} as Parameters<typeof account.signTransaction>[0]);

// 서명된 tx를 hex로 반환
return signedHex;
```

**이미 사용 중인 함수들이므로 추가 의존성 없음.**

---

## 패키지별 변경 사항

### @waiaas/core

| 변경 | 내용 | 의존성 변경 |
|------|------|-----------|
| chain-adapter.types.ts | `ParsedTransaction`, `ParsedOperation`, `SignedTransaction` 타입 추가 | 없음 (Zod + TS만) |
| IChainAdapter.ts | `parseTransaction()`, `signExternalTransaction()` 2개 메서드 추가 (20 -> 22) | 없음 |
| enums/transaction.ts | `SIGNED` 상태, `SIGN` 타입 추가 | 없음 |
| schemas/transaction.schema.ts | `SignTransactionRequestSchema` 추가 | 없음 (Zod만) |

### @waiaas/daemon

| 변경 | 내용 | 의존성 변경 |
|------|------|-----------|
| pipeline/sign-only.ts (신규) | sign-only 파이프라인 | 없음 |
| api/routes/transactions.ts | `POST /v1/transactions/sign` 추가 | 없음 |
| api/routes/utils.ts (신규) | `POST /v1/utils/encode-calldata` 추가 | 없음 (viem은 daemon에 이미 의존) |
| api/routes/skills.ts (신규) | `GET /v1/skills/:name` 추가 (MCP 스킬 리소스용) | 없음 |
| pipeline/database-policy-engine.ts | 기본 거부 토글 분기 추가 | 없음 |
| DB 마이그레이션 | CHECK 제약 업데이트 (SIGNED 상태, SIGN 타입) | 없음 |

**daemon의 viem 의존성:** daemon은 이미 `viem ^2.21.0`에 직접 의존하고 있으므로 (`packages/daemon/package.json` 확인) `encodeFunctionData`를 import하여 `POST /v1/utils/encode-calldata`에서 직접 사용 가능. adapter-evm을 경유할 필요 없음.

### @waiaas/adapter-solana

| 변경 | 내용 | 의존성 변경 |
|------|------|-----------|
| adapter.ts | `parseTransaction()`, `signExternalTransaction()` 구현 | 없음 |
| tx-parser.ts (신규) | Solana tx 파싱 유틸리티 | 없음 |

**@solana/kit에서 추가 import:**
- `getCompiledTransactionMessageDecoder` (기존 미사용, @solana/transaction-messages에서 re-export)
- `decompileTransactionMessageFetchingLookupTables` (기존 미사용, @solana/kit 자체 export)

### @waiaas/adapter-evm

| 변경 | 내용 | 의존성 변경 |
|------|------|-----------|
| adapter.ts | `parseTransaction()`, `signExternalTransaction()` 구현 | 없음 |
| tx-parser.ts (신규) | EVM tx 파싱 유틸리티 | 없음 |

**viem에서 추가 import:**
- `decodeFunctionData` (기존 미사용)

### @waiaas/sdk

| 변경 | 내용 | 의존성 변경 |
|------|------|-----------|
| client.ts | `signTransaction()`, `encodeCalldata()` 메서드 추가 | 없음 (0-dep SDK) |

### @waiaas/mcp

| 변경 | 내용 | 의존성 변경 |
|------|------|-----------|
| tools/sign-transaction.ts (신규) | sign_transaction 도구 | 없음 |
| tools/encode-calldata.ts (신규) | encode_calldata 도구 | 없음 |
| resources/skills.ts (신규) | waiaas://skills/{name} 리소스 템플릿 | 없음 |
| server.ts | 신규 도구 2개 + 리소스 1개 등록 (11 -> 13 도구, 3 -> 4 리소스) | 없음 |

**@modelcontextprotocol/sdk에서 추가 import:**
- `ResourceTemplate` (기존 미사용, `@modelcontextprotocol/sdk/server/mcp.js`에서 export)

### python-sdk (waiaas)

| 변경 | 내용 | 의존성 변경 |
|------|------|-----------|
| client.py | `sign_transaction()`, `encode_calldata()` 메서드 추가 | 없음 (httpx + Pydantic) |

### @waiaas/admin

| 변경 | 내용 | 의존성 변경 |
|------|------|-----------|
| Settings 페이지 | 기본 거부 토글 3개 추가 (보안 섹션) | 없음 |

---

## 설치 변경: 없음

```bash
# 신규 설치 명령 없음. 기존 의존성으로 모든 기능 구현 가능.
# pnpm install 변경 불필요.
```

---

## 명시적으로 추가하지 않는 것 (Anti-Dependencies)

| 라이브러리 | 왜 추가하지 않는가 |
|-----------|-----------------|
| `@solana/web3.js` (legacy) | `@solana/kit` 6.x가 이미 모든 기능을 제공. legacy 라이브러리 혼용은 번들 크기 증가 + 타입 충돌 유발 |
| `ethers.js` | viem 2.x가 이미 모든 ABI 인코딩/디코딩, tx 파싱 기능을 제공. 중복 의존성 불필요 |
| `@project-serum/borsh` | Anchor discriminator 파싱에 사용 가능하나, 8바이트 discriminator는 단순 슬라이싱으로 충분. 별도 borsh 디코더 불필요 |
| `abitype` | viem 2.x가 내부적으로 abitype에 의존하며 타입을 re-export. 직접 의존 불필요 |
| `@4byte/directory` / 4byte API | 4byte selector -> 함수명 매핑은 외부 API 호출. sign-only에서는 selector 추출만으로 CONTRACT_WHITELIST + METHOD_WHITELIST 평가 가능. 함수명 해석은 불필요 |
| `@coral-xyz/anchor` | Anchor IDL 기반 instruction 디코딩용이나, sign-only 정책 평가에는 programId + discriminator로 충분. 전체 Anchor 프레임워크 의존 불필요 |

---

## 알려진 프로그램/컨트랙트 식별을 위한 상수

### Solana (tx-parser.ts에 정의)

```typescript
// 알려진 프로그램 주소 -> 파싱 전략 매핑
const KNOWN_PROGRAMS: Record<string, string> = {
  '11111111111111111111111111111111': 'SYSTEM',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'SPL_TOKEN',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb': 'TOKEN_2022',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'ASSOCIATED_TOKEN',
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'MEMO',
};

// SystemProgram instruction discriminator (4 bytes LE)
const SYSTEM_TRANSFER_DISCRIMINATOR = 2;  // Transfer = instruction type 2
// SPL Token instruction type (1 byte)
const TOKEN_TRANSFER_CHECKED = 12;
const TOKEN_APPROVE_CHECKED = 13;
```

### EVM (tx-parser.ts에 정의)

```typescript
// ERC-20 4byte selectors
const ERC20_SELECTORS: Record<string, { type: string; name: string }> = {
  '0xa9059cbb': { type: 'TOKEN_TRANSFER', name: 'transfer(address,uint256)' },
  '0x23b872dd': { type: 'TOKEN_TRANSFER', name: 'transferFrom(address,address,uint256)' },
  '0x095ea7b3': { type: 'APPROVE', name: 'approve(address,uint256)' },
};
```

---

## 버전 핀 현황 (변경 없음)

| 패키지 | package.json 범위 | 실제 설치 버전 | v1.4.7 활용 |
|--------|------------------|-------------|-----------|
| viem | ^2.21.0 | 2.45.3 | parseTransaction, decodeFunctionData, encodeFunctionData |
| @solana/kit | ^6.0.1 | 6.0.1 | getTransactionDecoder, getCompiledTransactionMessageDecoder, decompileTransactionMessageFetchingLookupTables, signBytes |
| @modelcontextprotocol/sdk | ^1.12.0 | 1.26.0 | McpServer, ResourceTemplate |
| zod | ^3.24.0 | 3.25.76 | SignTransactionRequestSchema, EncodeCalldataRequestSchema |
| hono | ^4.11.9 | 4.x | 신규 라우트 추가 |
| drizzle-orm | ^0.45.0 | 0.45.x | DB 마이그레이션, CHECK 제약 |
| sodium-native | ^4.3.1 | 4.x | 키 복호화 (기존 keyStore 경유) |
| jose | ^6.1.3 | 6.x | sessionAuth (변경 없음) |

---

## Alternatives Considered

| 카테고리 | 권장 | 대안 | 왜 대안이 아닌가 |
|---------|------|------|-----------------|
| EVM tx 파싱 | viem `parseTransaction` + `decodeFunctionData` | ethers `utils.parseTransaction` + `Interface.decodeFunctionData` | 이미 viem 2.x 의존 중. ethers 추가는 번들 +2MB, API 스타일 충돌 |
| Solana tx 파싱 | @solana/kit `getTransactionDecoder` + `getCompiledTransactionMessageDecoder` | @solana/web3.js `Transaction.from()` + `VersionedTransaction.deserialize()` | 이미 @solana/kit 6.x 의존 중. web3.js 1.x 혼용은 타입 불일치 유발 |
| MCP 리소스 | `ResourceTemplate` (SDK 내장) | 커스텀 request handler에서 URI 파싱 | SDK 내장 API가 URI 파싱, list, complete를 모두 처리. 커스텀은 불필요한 복잡도 |
| EVM calldata 인코딩 | viem `encodeFunctionData` (이미 사용 중) | ethers `Interface.encodeFunctionData` | viem 이미 사용 중이므로 일관성 유지 |
| Anchor instruction 파싱 | 8바이트 discriminator 슬라이싱 | `@coral-xyz/anchor` IDL 기반 디코딩 | programId + discriminator로 CONTRACT_WHITELIST 평가에 충분. IDL 파싱은 과잉 |

---

## Integration Points

### sign-only 파이프라인과 기존 파이프라인의 관계

```
기존 executeSend():
  Stage 1 (Validate + DB INSERT)
  Stage 2 (Auth -- sessionId passthrough)
  Stage 3 (Policy evaluation)
  Stage 4 (Wait -- DELAY/APPROVAL)
  Stage 5 (Build -> Simulate -> Sign -> Submit)
  Stage 6 (Confirm)

sign-only executeSign():
  Step 1: Parse unsigned tx -> ParsedTransaction { operations[] }
  Step 2: DB INSERT (type=SIGN, status=PENDING)
  Step 3: Policy evaluation (operations[] -> 기존 evaluate/evaluateBatch)
  Step 4: DELAY/APPROVAL 판정 -> 즉시 거부 (sign-only는 동기 API)
  Step 5: Sign (키 복호화 -> signExternalTransaction)
  Step 6: DB UPDATE (status=SIGNED) + Return signed tx

차이점:
  - Stage 4 (Wait): DELAY/APPROVAL 티어는 즉시 거부 (blockhash/nonce 만료 위험)
  - Stage 5 (Build/Simulate): 건너뜀 (외부에서 빌드 완료)
  - Stage 6 (Confirm): 건너뜀 (제출은 호출자 책임)
  - SPENDING_LIMIT: 서명 시점에 reserved_amount에 포함 (evaluateAndReserve 활용)
```

### 기본 거부 토글과 DatabasePolicyEngine 통합

```typescript
// DatabasePolicyEngine에서 SettingsService를 통해 설정 읽기
// v1.4.4에서 구현된 SettingsService + DB settings 테이블 + hot-reload 활용

private evaluateContractPolicy(walletId: string, param: TransactionParam) {
  const policies = this.getContractWhitelistPolicies(walletId);
  if (policies.length === 0) {
    // 기본 거부 토글 확인 (DB settings 테이블에서 hot-reload)
    const defaultDeny = this.settingsService.get('default_deny_contracts');
    if (defaultDeny === 'false') {
      return null;  // 허용 -> 다음 정책 평가로 (SPENDING_LIMIT 등)
    }
    return { allowed: false, reason: 'Contract calls disabled: no CONTRACT_WHITELIST...' };
  }
  // ... 기존 화이트리스트 평가 로직 그대로
}
```

### encode-calldata 엔드포인트

daemon은 이미 `viem ^2.21.0`에 직접 의존하고 있으므로 (packages/daemon/package.json 확인) `encodeFunctionData`를 직접 import하여 사용 가능. adapter-evm을 경유할 필요 없음.

```typescript
// packages/daemon/src/api/routes/utils.ts
import { encodeFunctionData } from 'viem';

// POST /v1/utils/encode-calldata
app.post('/v1/utils/encode-calldata', async (c) => {
  const { abi, functionName, args } = c.req.valid('json');
  try {
    const calldata = encodeFunctionData({ abi, functionName, args });
    const selector = calldata.slice(0, 10);
    return c.json({ calldata, selector, functionName });
  } catch (err) {
    return c.json({ error: 'ENCODE_ERROR', code: 'ABI_ENCODING_FAILED', message: ... }, 400);
  }
});
```

---

## Confidence Assessment

| 영역 | 신뢰도 | 근거 |
|------|--------|------|
| EVM tx 파싱 (viem) | HIGH | parseTransaction, encodeFunctionData 이미 기존 코드에서 실사용 중. decodeFunctionData는 viem 2.45.3 d.ts에서 export 확인 |
| Solana tx 파싱 (@solana/kit) | HIGH | getTransactionDecoder 이미 사용 중. getCompiledTransactionMessageDecoder는 @solana/transaction-messages d.ts에서 확인. @solana/kit가 re-export |
| MCP ResourceTemplate | HIGH | @modelcontextprotocol/sdk 1.26.0 mcp.d.ts에서 ResourceTemplate 클래스, server.resource() template overload 확인 |
| EVM calldata 인코딩 | HIGH | encodeFunctionData는 EvmAdapter에서 이미 실사용 중. daemon도 viem 직접 의존 |
| 기본 거부 토글 | HIGH | SettingsService는 v1.4.4에서 구현 완료. DB settings 테이블 + hot-reload 가능 |
| Address Lookup Table 처리 | MEDIUM | decompileTransactionMessageFetchingLookupTables의 d.ts 확인했으나 실제 RPC 호출 동작은 미검증. 테스트에서 확인 필요 |
| Solana instruction 데이터 파싱 (SystemProgram, SPL Token) | MEDIUM | instruction layout은 Solana 공식 스펙 기반이나 코드베이스에서 직접 검증 필요. 오프셋 계산 실수 가능성 |

---

## Sources

### 코드베이스 직접 검증 (HIGH)

- `packages/adapters/evm/src/adapter.ts` -- viem `parseTransaction`, `encodeFunctionData`, `serializeTransaction`, `hexToBytes` 실사용 패턴
- `packages/adapters/solana/src/adapter.ts` -- @solana/kit `getTransactionDecoder`, `getTransactionEncoder`, `signBytes`, `createKeyPairFromBytes` 실사용 패턴
- `packages/mcp/src/resources/wallet-address.ts` -- 정적 리소스 등록 패턴 (`server.resource()` 사용 중)
- `packages/mcp/src/server.ts` -- McpServer 생성 + 11 도구 + 3 리소스 등록 구조
- `packages/daemon/package.json` -- `viem: "^2.21.0"` 직접 의존 확인

### 타입 선언 파일 검증 (HIGH)

- viem 2.45.3 `_types/index.d.ts` -- `decodeFunctionData`, `decodeAbiParameters`, `encodeFunctionData`, `parseTransaction` export
- @solana/transaction-messages 6.0.1 `dist/types/codecs/message.d.ts` -- `getCompiledTransactionMessageDecoder` 선언
- @solana/transactions 6.0.1 `dist/types/codecs/transaction-codec.d.ts` -- `getTransactionDecoder`, `getTransactionEncoder` 선언
- @solana/kit 6.0.1 `dist/types/index.d.ts` -- `@solana/transaction-messages`, `@solana/transactions` re-export, `decompileTransactionMessageFetchingLookupTables` export
- @modelcontextprotocol/sdk 1.26.0 `dist/esm/server/mcp.d.ts` -- `ResourceTemplate` 클래스, `server.resource()` template overload

### 공식 문서 (MEDIUM-HIGH)

- [viem encodeFunctionData](https://viem.sh/docs/contract/encodeFunctionData)
- [viem decodeFunctionData](https://viem.sh/docs/contract/decodeFunctionData)
- [MCP Resources Specification](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk)

### 프로젝트 내부 (HIGH)

- `objectives/v1.4.7-arbitrary-transaction-signing.md` -- 마일스톤 목표, 컴포넌트 정의, E2E 시나리오 50개
- `packages/core/src/interfaces/IChainAdapter.ts` -- 현재 20 메서드 인터페이스
- `packages/core/src/schemas/transaction.schema.ts` -- discriminatedUnion 5-type 스키마
- `packages/core/src/enums/policy.ts` -- 11 PolicyType 정의
- `packages/daemon/src/pipeline/stages.ts` -- 6-stage 파이프라인 구조, buildByType 라우팅
