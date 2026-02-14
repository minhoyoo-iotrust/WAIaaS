# Phase 115: Core Types + DB Migration + Parsers - Research

**Researched:** 2026-02-14
**Domain:** Core type system extension, SQLite schema migration, blockchain transaction parsing
**Confidence:** HIGH

## Summary

Phase 115 extends the WAIaaS type system with SIGNED status and SIGN transaction type, creates DB migration v9 to update CHECK constraints, adds `parseTransaction()` and `signExternalTransaction()` to IChainAdapter, and implements these methods in both SolanaAdapter and EvmAdapter.

The codebase has well-established patterns for all three areas: Zod SSoT enum arrays drive DB CHECK constraints via `inList()`, the 12-step table recreation pattern handles SQLite's inability to ALTER CHECK constraints, and both adapters already use the exact serialization/deserialization APIs needed for parsing (txDecoder/txEncoder for Solana, parseTransaction/serializeTransaction for EVM).

**Primary recommendation:** Follow existing patterns exactly. Add SIGNED/SIGN to SSoT arrays, create migration v9 as a 12-step table recreation for transactions (same pattern as v3/v7), use `decompileTransactionMessage()` from @solana/kit for Solana instruction extraction, and viem's `parseTransaction()` for EVM field extraction. No new dependencies required.

## Standard Stack

### Core (already in use - no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @solana/kit | ^6.0.1 | Solana tx decode/decompile/sign | Already used in SolanaAdapter; has `decompileTransactionMessage()`, `getTransactionDecoder()`, `partiallySignTransaction()` |
| @solana-program/system | ^0.11.0 | System program address constant | Already used; provides `SYSTEM_PROGRAM_ADDRESS` for identifying SOL transfers |
| @solana-program/token | ^0.10.0 | Token program address constant | Already used; provides `TOKEN_PROGRAM_ADDRESS` for identifying SPL transfers |
| viem | ^2.21.0 | EVM tx parse/sign | Already used; provides `parseTransaction()`, `decodeFunctionData()`, `privateKeyToAccount().signTransaction()` |
| zod | (workspace) | Schema SSoT | Core enum arrays drive all CHECK constraints |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 | (workspace) | Migration runner | DB migration v9 execution |
| drizzle-orm | (workspace) | Drizzle schema update | Adding SIGNED/SIGN to CHECK constraint helpers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| decompileTransactionMessage | Manual byte parsing of compiled tx | decompileTransactionMessage already in @solana/kit, returns structured instruction list with programAddress and accounts |
| viem parseTransaction | Manual RLP decode | viem already imported, parseTransaction returns typed object with to/value/data/chainId |

**Installation:**
```bash
# No new packages needed -- all dependencies already present
```

## Architecture Patterns

### Recommended File Changes
```
packages/core/src/
  enums/transaction.ts          # Add 'SIGNED' to TRANSACTION_STATUSES, 'SIGN' to TRANSACTION_TYPES
  interfaces/chain-adapter.types.ts  # Add ParsedTransaction, ParsedOperation, SignedTransaction
  interfaces/IChainAdapter.ts   # Add parseTransaction() + signExternalTransaction() (20 -> 22 methods)
  errors/error-codes.ts         # Add INVALID_TRANSACTION, WALLET_NOT_SIGNER, UNSUPPORTED_TX_TYPE, CHAIN_ID_MISMATCH
  errors/chain-error.ts         # Add INVALID_RAW_TRANSACTION, WALLET_NOT_SIGNER ChainErrorCodes
  index.ts                      # Export new types (ParsedTransaction, ParsedOperation, SignedTransaction)

packages/daemon/src/
  infrastructure/database/migrate.ts  # Add v9 migration (12-step transactions table recreation)
  infrastructure/database/schema.ts   # CHECK constraints auto-update via SSoT arrays (no manual change needed)

packages/adapters/solana/src/
  adapter.ts                    # Add parseTransaction() + signExternalTransaction()
  tx-parser.ts                  # NEW: Solana tx parsing utilities (instruction identification)

packages/adapters/evm/src/
  adapter.ts                    # Add parseTransaction() + signExternalTransaction()
  tx-parser.ts                  # NEW: EVM tx parsing utilities (function selector identification)
```

### Pattern 1: Zod SSoT Enum Extension
**What:** Add new values to existing SSoT arrays in `packages/core/src/enums/transaction.ts`
**When to use:** Whenever a new status or type is needed across the system
**Example:**
```typescript
// Source: packages/core/src/enums/transaction.ts (existing pattern)
export const TRANSACTION_STATUSES = [
  'PENDING', 'QUEUED', 'EXECUTING', 'SUBMITTED', 'CONFIRMED',
  'FAILED', 'CANCELLED', 'EXPIRED', 'PARTIAL_FAILURE',
  'SIGNED',  // NEW: sign-only completed, not submitted to chain
] as const;

export const TRANSACTION_TYPES = [
  'TRANSFER', 'TOKEN_TRANSFER', 'CONTRACT_CALL', 'APPROVE', 'BATCH',
  'SIGN',  // NEW: external transaction signing
] as const;
```
**Impact cascade:** Adding to these arrays automatically updates:
1. TypeScript types (via `typeof X[number]`)
2. Zod schemas (via `z.enum(X)`)
3. DB CHECK constraints in `migrate.ts` (via `inList(TRANSACTION_STATUSES)`)
4. DB CHECK constraints in `schema.ts` (via `buildCheckSql()`)
5. Fresh database DDL (via `getCreateTableStatements()`)

### Pattern 2: 12-Step Table Recreation Migration (SQLite CHECK constraint update)
**What:** SQLite cannot ALTER CHECK constraints, so the table must be recreated
**When to use:** When CHECK constraint values change (new enum values in IN (...) clause)
**Example:**
```typescript
// Source: packages/daemon/src/infrastructure/database/migrate.ts (v3/v7 pattern)
MIGRATIONS.push({
  version: 9,
  description: 'Add SIGNED status and SIGN type to transactions CHECK constraints',
  managesOwnTransaction: true,
  up: (sqlite) => {
    sqlite.exec('BEGIN');
    try {
      // 1. Create transactions_new with updated CHECK constraints
      sqlite.exec(`CREATE TABLE transactions_new (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        chain TEXT NOT NULL,
        tx_hash TEXT,
        type TEXT NOT NULL CHECK (type IN (${inList(TRANSACTION_TYPES)})),
        /* ... all columns ... */
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (${inList(TRANSACTION_STATUSES)})),
        /* ... remaining columns ... */
      )`);
      // 2. Copy data
      sqlite.exec('INSERT INTO transactions_new SELECT * FROM transactions');
      // 3. Drop old table
      sqlite.exec('DROP TABLE transactions');
      // 4. Rename
      sqlite.exec('ALTER TABLE transactions_new RENAME TO transactions');
      // 5. Recreate indexes (all 8 existing indexes)
      // 6. Commit
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
    // 7. Re-enable FK and verify integrity
    sqlite.pragma('foreign_keys = ON');
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) throw new Error(...);
  },
});
```
**Critical:** Must also update `LATEST_SCHEMA_VERSION` from 8 to 9 in migrate.ts.

### Pattern 3: IChainAdapter Method Extension
**What:** Add new methods to the interface and implement in both adapters
**When to use:** When new chain-level capabilities are needed
**Example:**
```typescript
// Source: packages/core/src/interfaces/IChainAdapter.ts (existing pattern)
interface IChainAdapter {
  // ... existing 20 methods ...

  // Sign-only operations (2) -- v1.4.7
  /** Parse an unsigned external transaction into structured operations. */
  parseTransaction(rawTx: string): Promise<ParsedTransaction>;
  /** Sign an unsigned external transaction with wallet's private key. */
  signExternalTransaction(rawTx: string, privateKey: Uint8Array): Promise<SignedTransaction>;
}
```

### Pattern 4: Solana Transaction Decompilation
**What:** Decode base64 wire-format tx, decompile to get instruction list with programAddress and data
**When to use:** When extracting instruction-level info from a serialized Solana transaction
**Example:**
```typescript
// Source: @solana/kit API
import {
  getTransactionDecoder,
  decompileTransactionMessage,
  address,
} from '@solana/kit';

const txDecoder = getTransactionDecoder();
const txBytes = Buffer.from(base64RawTx, 'base64');
const compiled = txDecoder.decode(txBytes);

// decompileTransactionMessage returns a TransactionMessage with .instructions[]
// Each instruction has: programAddress, accounts[], data (Uint8Array)
const message = decompileTransactionMessage(compiled.messageBytes, {
  // NOTE: For v0 transactions with lookup tables, use decompileTransactionMessageFetchingLookupTables
  // For now, most unsigned txs from dApps will be legacy or v0 without lookup tables
});

// Each instruction in message.instructions has:
//   .programAddress: Address (branded string)
//   .accounts: Array<{ address: Address; role: AccountRole }>
//   .data: Uint8Array
```

### Pattern 5: EVM Transaction Parsing
**What:** Use viem's parseTransaction to extract to/value/data from serialized hex
**When to use:** When extracting fields from a serialized EVM unsigned transaction
**Example:**
```typescript
// Source: viem API (already used in EvmAdapter.simulateTransaction)
import { parseTransaction, type TransactionSerializedEIP1559 } from 'viem';

const parsed = parseTransaction(hexRawTx as TransactionSerializedEIP1559);
// parsed.to: string | undefined (contract or recipient address)
// parsed.value: bigint (ETH value)
// parsed.data: string | undefined (calldata hex)
// parsed.chainId: number
// parsed.type: 'eip1559' | 'legacy' | 'eip2930'

// For ERC-20 identification, check first 4 bytes of data:
const ERC20_TRANSFER_SELECTOR = '0xa9059cbb'; // transfer(address,uint256)
const ERC20_APPROVE_SELECTOR = '0x095ea7b3';  // approve(address,uint256)
```

### Anti-Patterns to Avoid
- **Hardcoding CHECK constraint values in migration SQL:** Always use `inList(TRANSACTION_TYPES)` from SSoT arrays, never literal strings. The existing pattern in v3/v7 migrations does this correctly.
- **Adding new error codes without domain assignment:** Every new error code in ERROR_CODES must have domain, httpStatus, retryable, and message fields.
- **Testing with real RPC in parser tests:** Parser tests should use pre-built serialized transaction fixtures, not live RPC calls. Both adapters already mock RPC in their test suites.
- **Duplicating signTransaction logic in signExternalTransaction:** signExternalTransaction should reuse the same key handling (createKeyPairFromBytes for Solana, privateKeyToAccount for EVM) but work with the external rawTx format instead of UnsignedTransaction.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Solana tx deserialization | Manual byte parsing of Solana wire format | `getTransactionDecoder().decode()` from @solana/kit | Wire format is complex (signatures + compiled message), decoder handles all versions |
| Solana instruction extraction | Manual message byte parsing | `decompileTransactionMessage()` from @solana/kit | Handles account table expansion, v0 format, address lookup table refs |
| EVM tx deserialization | Manual RLP decode | `parseTransaction()` from viem | Handles legacy, EIP-2930, EIP-1559 types with correct typing |
| ERC-20 method identification | Manual calldata parsing | Compare first 4 bytes (selector) against known constants | Standard approach; selectors are stable |
| Solana program identification | Custom program registry | Compare instruction.programAddress against well-known constants | SYSTEM_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS, TOKEN_2022 are importable |

**Key insight:** Both adapters already import and use the exact encoding/decoding primitives needed. parseTransaction for parsing is the inverse of the build pipeline that already exists.

## Common Pitfalls

### Pitfall 1: SQLite 12-Step Migration Missing Index Recreation
**What goes wrong:** After DROP TABLE + CREATE TABLE + RENAME, all indexes on the old table are lost.
**Why it happens:** SQLite indexes are tied to the table; dropping the table drops its indexes.
**How to avoid:** Recreate ALL 8 existing transactions table indexes after the rename step. Copy the exact index list from v7 migration (lines 752-759 of migrate.ts).
**Warning signs:** Test queries that were fast become slow; unique constraint violations stop being caught.

### Pitfall 2: Forgetting LATEST_SCHEMA_VERSION Update
**What goes wrong:** Fresh databases (via pushSchema) still get version 8, then migration v9 runs on top of a schema that already has the new values, causing CHECK constraint text mismatches between DDL and migration paths.
**Why it happens:** pushSchema uses `LATEST_SCHEMA_VERSION` to record all versions up to N as "already applied". If this isn't bumped, fresh DBs don't know about v9.
**How to avoid:** Update `LATEST_SCHEMA_VERSION = 9` whenever v9 migration is added. pushSchema DDL automatically uses SSoT arrays so the schema is correct; only the version tracking needs the bump.
**Warning signs:** Migration tests that create fresh databases and then check schema_version table will show version 8 instead of 9.

### Pitfall 3: decompileTransactionMessage Fails on v0 with Lookup Tables
**What goes wrong:** `decompileTransactionMessage()` throws when the compiled message references address lookup tables but the lookup table data isn't provided.
**Why it happens:** v0 transactions can use address lookup tables to compress the account list. The decompiler needs the full lookup table data to resolve compressed addresses.
**How to avoid:** Use `decompileTransactionMessageFetchingLookupTables()` for v0 transactions, or catch the error and fall back to a simpler parsing approach that only extracts programAddress from the static account keys. For Phase 115 scope, the simpler approach of directly examining the compiled message's instruction data (programAddressIndex + account indices + data) may be sufficient without full decompilation.
**Warning signs:** Tests pass with legacy transactions but fail with v0 transactions from real dApps.

### Pitfall 4: EVM parseTransaction Type Assertion
**What goes wrong:** viem's parseTransaction needs the serialized hex to be typed correctly (e.g., `TransactionSerializedEIP1559`).
**Why it happens:** viem uses branded types for different tx serialization formats.
**How to avoid:** Detect the transaction type from the first byte(s) of the RLP-encoded data. viem parseTransaction actually handles this automatically -- just pass the hex string and it detects the type. The existing codebase casts to `TransactionSerializedEIP1559` but viem accepts any serialized transaction format.
**Warning signs:** TypeScript type errors when passing unknown-type serialized transactions.

### Pitfall 5: Solana Signature Slot Mismatch in signExternalTransaction
**What goes wrong:** signExternalTransaction signs with the wallet's key, but the unsigned tx may have the wallet at a different signature slot position.
**Why it happens:** In Solana, signature slots correspond to the signer account positions in the message. The wallet must be one of the signers listed in the transaction.
**How to avoid:** After decoding the transaction, verify the wallet's public key is in the signers list. Use `getAddressFromPublicKey()` to get the address from the private key, then check it matches one of the signer addresses. Use the same `signBytes()` + slot assignment pattern from existing `signTransaction()`.
**Warning signs:** Signature is placed in wrong slot, causing "signature verification failed" on chain.

### Pitfall 6: Solana SystemProgram.transfer Instruction Data Layout
**What goes wrong:** Incorrectly parsing the transfer amount from SystemProgram.transfer instruction data.
**Why it happens:** SystemProgram instructions have a 4-byte instruction index followed by variable data. Transfer (index 2) has 8 bytes of lamports as a little-endian u64.
**How to avoid:** Check instruction data bytes 0-3 for the instruction discriminator (2 = Transfer, as little-endian u32), then read bytes 4-11 as a little-endian u64 for the amount. For SPL Token transferChecked, the discriminator is 1 byte (12 = transferChecked), followed by amount (u64 LE) and decimals (u8).
**Warning signs:** Amount values are wrong or astronomically large.

## Code Examples

### Example 1: Solana ParseTransaction Implementation Pattern
```typescript
import {
  getTransactionDecoder,
  decompileTransactionMessage,
  address,
} from '@solana/kit';
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';

const SYSTEM_PROGRAM = SYSTEM_PROGRAM_ADDRESS; // '11111111111111111111111111111111'
const TOKEN_PROGRAM = TOKEN_PROGRAM_ADDRESS;   // 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

// SystemProgram.transfer instruction layout:
// bytes 0-3: instruction index (2 for Transfer, LE u32)
// bytes 4-11: lamports (LE u64)
const SYSTEM_TRANSFER_INDEX = 2;

// SPL Token transferChecked instruction layout:
// byte 0: instruction type (12 for TransferChecked)
// bytes 1-8: amount (LE u64)
// byte 9: decimals (u8)
const SPL_TRANSFER_CHECKED = 12;

// SPL Token approve/approveChecked instruction layout:
// byte 0: instruction type (4 for Approve, 13 for ApproveChecked)
const SPL_APPROVE = 4;
const SPL_APPROVE_CHECKED = 13;

function identifyOperation(
  programAddress: string,
  data: Uint8Array,
  accounts: Array<{ address: string; role: number }>
): ParsedOperation {
  if (programAddress === SYSTEM_PROGRAM) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const instrIndex = view.getUint32(0, true); // LE
    if (instrIndex === SYSTEM_TRANSFER_INDEX && data.length >= 12) {
      const lamports = view.getBigUint64(4, true); // LE
      return {
        type: 'NATIVE_TRANSFER',
        to: accounts[1]?.address, // destination is account[1]
        amount: lamports,
      };
    }
  }

  if (programAddress === TOKEN_PROGRAM || programAddress === TOKEN_2022) {
    const instrType = data[0];
    if (instrType === SPL_TRANSFER_CHECKED && data.length >= 10) {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const amount = view.getBigUint64(1, true);
      return {
        type: 'TOKEN_TRANSFER',
        token: accounts[1]?.address, // mint is account[1] in transferChecked
        to: accounts[2]?.address,    // destination is account[2]
        amount,
      };
    }
    if (instrType === SPL_APPROVE || instrType === SPL_APPROVE_CHECKED) {
      return {
        type: 'APPROVE',
        token: instrType === SPL_APPROVE_CHECKED ? accounts[1]?.address : undefined,
        to: accounts[1]?.address, // delegate
      };
    }
  }

  // Unknown program = CONTRACT_CALL
  return {
    type: 'CONTRACT_CALL',
    programId: programAddress,
    method: data.length >= 8 ? toHex(data.slice(0, 8)) : undefined, // Anchor discriminator
  };
}
```

### Example 2: EVM ParseTransaction Implementation Pattern
```typescript
import { parseTransaction, type Hex } from 'viem';

const ERC20_TRANSFER_SELECTOR = '0xa9059cbb'; // transfer(address,uint256)
const ERC20_APPROVE_SELECTOR = '0x095ea7b3';  // approve(address,uint256)

function parseEvmTransaction(hexRawTx: string): ParsedTransaction {
  const parsed = parseTransaction(hexRawTx as Hex);
  const operations: ParsedOperation[] = [];

  if (!parsed.data || parsed.data === '0x') {
    // No calldata = native ETH transfer
    operations.push({
      type: 'NATIVE_TRANSFER',
      to: parsed.to,
      amount: parsed.value ?? 0n,
    });
  } else {
    const selector = parsed.data.slice(0, 10); // '0x' + 4 bytes

    if (selector === ERC20_TRANSFER_SELECTOR) {
      // ERC-20 transfer(address to, uint256 amount)
      const recipientHex = '0x' + parsed.data.slice(34, 74); // offset 10+24=34, length 40
      const amountHex = '0x' + parsed.data.slice(74, 138);
      operations.push({
        type: 'TOKEN_TRANSFER',
        token: parsed.to, // ERC-20 contract address
        to: recipientHex,
        amount: BigInt(amountHex),
      });
    } else if (selector === ERC20_APPROVE_SELECTOR) {
      // ERC-20 approve(address spender, uint256 amount)
      const spenderHex = '0x' + parsed.data.slice(34, 74);
      const amountHex = '0x' + parsed.data.slice(74, 138);
      operations.push({
        type: 'APPROVE',
        token: parsed.to,
        to: spenderHex,
        amount: BigInt(amountHex),
      });
    } else {
      // Arbitrary contract call
      operations.push({
        type: 'CONTRACT_CALL',
        programId: parsed.to,
        method: selector,
      });
    }
  }

  return { operations, rawTx: hexRawTx };
}
```

### Example 3: signExternalTransaction Pattern (Solana)
```typescript
// Reuses existing signTransaction key handling pattern
async signExternalTransaction(rawTx: string, privateKey: Uint8Array): Promise<SignedTransaction> {
  const txBytes = Buffer.from(rawTx, 'base64');
  const compiled = txDecoder.decode(txBytes);

  // Create key pair (same pattern as existing signTransaction)
  const keyPair = privateKey.length === 64
    ? await createKeyPairFromBytes(privateKey)
    : await createKeyPairFromPrivateKeyBytes(privateKey.slice(0, 32));

  const signerAddress = await getAddressFromPublicKey(keyPair.publicKey);

  // Verify wallet is a signer in this transaction
  // (check signerAddress is in compiled.signatures keys)
  if (!(signerAddress in compiled.signatures)) {
    throw new ChainError('WALLET_NOT_SIGNER', 'solana', {
      message: `Wallet ${signerAddress} is not a signer in this transaction`,
    });
  }

  // Sign and place signature (same pattern as existing signTransaction)
  const signature = await signBytes(keyPair.privateKey, compiled.messageBytes);
  const signedTx = {
    ...compiled,
    signatures: { ...compiled.signatures, [signerAddress]: signature },
  };

  const signedBytes = new Uint8Array(txEncoder.encode(signedTx));
  const signedBase64 = Buffer.from(signedBytes).toString('base64');

  return { signedTransaction: signedBase64 };
}
```

### Example 4: signExternalTransaction Pattern (EVM)
```typescript
async signExternalTransaction(rawTx: string, privateKey: Uint8Array): Promise<SignedTransaction> {
  const privateKeyHex = `0x${Buffer.from(privateKey).toString('hex')}` as Hex;
  const account = privateKeyToAccount(privateKeyHex);

  // Verify wallet address matches the expected signer
  // (EVM unsigned txs don't embed from, but we verify via account.address)

  const parsed = parseTransaction(rawTx as Hex);

  // Sign the transaction
  const signedHex = await account.signTransaction({
    ...parsed,
    type: parsed.type ?? 'eip1559',
  } as Parameters<typeof account.signTransaction>[0]);

  return {
    signedTransaction: signedHex,
    txHash: undefined, // Could compute keccak256(signedHex) but optional
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @solana/web3.js Transaction class | @solana/kit functional API (getTransactionDecoder/decompileTransactionMessage) | @solana/kit 6.x | Old Transaction.from(buffer) replaced by decode+decompile two-step |
| viem parseTransaction type assertion | viem parseTransaction auto-detects tx type | viem 2.x | No need to know tx type before parsing |

**Deprecated/outdated:**
- @solana/web3.js: Project uses @solana/kit 6.x exclusively. No legacy Transaction/VersionedTransaction classes available.

## Open Questions

1. **v0 Transactions with Address Lookup Tables**
   - What we know: `decompileTransactionMessage()` throws if lookup table data is missing. The alternative `decompileTransactionMessageFetchingLookupTables()` requires an RPC connection to fetch lookup tables.
   - What's unclear: Whether unsigned txs from dApps like Agentra will commonly use v0 with lookup tables.
   - Recommendation: For Phase 115, use the compiled message directly (access instructions via accountKeys array indices + instruction data) rather than decompileTransactionMessage. This avoids the lookup table issue entirely. The compiled format has all the info needed for programAddress identification. If full decompilation is needed later, it can be added. **Alternatively**, attempt `decompileTransactionMessage()` first, and if it throws due to missing lookup tables, fall back to compiled-message-level parsing that only identifies programId and raw data bytes. This graceful degradation handles both cases.

2. **EVM from Address Verification**
   - What we know: EVM unsigned transactions don't include a `from` field. The signer is implicit.
   - What's unclear: How to verify the wallet "should" sign this transaction.
   - Recommendation: The wallet signs because the caller (authenticated via sessionAuth) requests it. The wallet's address can be verified by the caller. No from-address validation needed at the adapter level, but the pipeline (Phase 117) should verify the wallet owns the session.

3. **Solana Compiled Message Instruction Access Pattern**
   - What we know: The txDecoder.decode() returns `{ messageBytes: Uint8Array, signatures: Record<Address, Signature> }`. The `getCompiledTransactionMessageDecoder()` can decode messageBytes into a structured message with `staticAccounts[]`, `instructions[]` (each with `programAddressIndex`, `accountIndices`, `data`).
   - What's unclear: Whether the compiled message decoder gives enough for our needs without full decompile.
   - Recommendation: Use `getCompiledTransactionMessageDecoder()` to decode messageBytes. This gives structured access to instructions with indices into the static accounts array. Map `staticAccounts[instruction.programAddressIndex]` to get the program address. This works without lookup tables and is sufficient for Phase 115.

## Sources

### Primary (HIGH confidence)
- Codebase: `packages/core/src/enums/transaction.ts` -- current TRANSACTION_STATUSES (9 values) and TRANSACTION_TYPES (5 values)
- Codebase: `packages/daemon/src/infrastructure/database/migrate.ts` -- migration patterns v2-v8, 12-step recreation, LATEST_SCHEMA_VERSION=8
- Codebase: `packages/adapters/solana/src/adapter.ts` -- SolanaAdapter 20 methods, uses txDecoder/txEncoder/signBytes/createKeyPairFromBytes
- Codebase: `packages/adapters/evm/src/adapter.ts` -- EvmAdapter 20 methods, uses parseTransaction/serializeTransaction/privateKeyToAccount
- Codebase: `packages/core/src/interfaces/IChainAdapter.ts` -- current 20-method interface
- Codebase: `packages/core/src/interfaces/chain-adapter.types.ts` -- all current type definitions
- Codebase: `packages/core/src/errors/error-codes.ts` -- 69 error codes with domain/httpStatus/retryable
- Codebase: `packages/core/src/errors/chain-error.ts` -- 27 ChainErrorCode values, 3 categories
- Runtime verification: @solana/kit exports `decompileTransactionMessage`, `getTransactionDecoder`, `getCompiledTransactionMessageDecoder`
- Runtime verification: viem exports `parseTransaction`, `decodeFunctionData`

### Secondary (MEDIUM confidence)
- Milestone document: `objectives/v1.4.7-arbitrary-transaction-signing.md` -- full design spec with IChainAdapter extension, ParsedTransaction/ParsedOperation/SignedTransaction types, DB changes

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all APIs verified at runtime
- Architecture: HIGH -- extends existing patterns (SSoT enums, 12-step migration, adapter methods) with clear codebase examples
- Pitfalls: HIGH -- identified from actual codebase patterns and migration history (v2/v3/v7/v8 migrations)

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable -- internal codebase patterns, locked dependency versions)

## Detailed Findings for Planner

### 1. SSoT Enum Extension Impact Analysis

Adding `SIGNED` to `TRANSACTION_STATUSES` and `SIGN` to `TRANSACTION_TYPES`:

| Consumer | Auto-updates? | Manual change needed? |
|----------|---------------|----------------------|
| TypeScript types | YES (const assertion) | No |
| Zod schemas (TransactionStatusEnum, TransactionTypeEnum) | YES (z.enum(array)) | No |
| DB DDL in pushSchema (fresh DBs) | YES (inList uses SSoT arrays) | No |
| DB migration v9 | YES (inList uses SSoT arrays) | Need to write migration |
| Drizzle schema.ts | YES (buildCheckSql uses SSoT arrays) | No |
| Enum count tests (enums.test.ts) | NO | Update count assertions (9->10 statuses, 5->6 types) |
| Chain adapter interface test | NO | Update method count (20->22) |
| Package exports test | NO | Add new type exports to assertion |

### 2. DB Migration v9 Scope

Only the `transactions` table needs recreation because:
- `wallets` table: no status/type changes
- `sessions` table: no enum changes
- `policies` table: no status/type changes
- `transactions` table: CHECK on `type` and `status` columns must include new values

The migration is relatively simple compared to v3 (which recreated 6 tables) or v7 (which recreated 5 tables). Only 1 table recreation + 8 index recreations.

**FK consideration:** transactions has self-referencing FK (parent_id REFERENCES transactions(id)). The v3/v7 pattern handles this by using `REFERENCES transactions_new(id)` in the CREATE TABLE for parent_id, then renaming. Follow the same approach.

### 3. New Error Codes Needed

| Error Code | Domain | httpStatus | retryable | Purpose |
|------------|--------|------------|-----------|---------|
| INVALID_TRANSACTION | TX | 400 | false | rawTx cannot be decoded (invalid base64/hex) |
| WALLET_NOT_SIGNER | TX | 400 | false | Wallet public key not in transaction's signer list |
| UNSUPPORTED_TX_TYPE | TX | 400 | false | EVM tx type not supported (e.g., type 3 blob tx) |
| CHAIN_ID_MISMATCH | TX | 400 | false | EVM tx chainId doesn't match requested network |

New ChainErrorCodes (internal adapter errors):
| Code | Category | Purpose |
|------|----------|---------|
| INVALID_RAW_TRANSACTION | PERMANENT | Failed to decode raw transaction bytes |
| WALLET_NOT_SIGNER | PERMANENT | Wallet not in signer list (Solana feePayer/signers) |

### 4. ParsedTransaction Type Design

Following the milestone document exactly:
```typescript
interface ParsedTransaction {
  operations: ParsedOperation[];
  rawTx: string;
}

interface ParsedOperation {
  type: 'NATIVE_TRANSFER' | 'TOKEN_TRANSFER' | 'CONTRACT_CALL' | 'APPROVE' | 'UNKNOWN';
  to?: string;
  amount?: bigint;
  token?: string;
  programId?: string;
  method?: string;
}

interface SignedTransaction {
  signedTransaction: string; // base64 for Solana, hex for EVM
  txHash?: string;
}
```

### 5. Solana Instruction Identification Strategy

Using the compiled message decoder approach (avoids lookup table issues):

```
1. Decode: getTransactionDecoder().decode(bytes) -> { messageBytes, signatures }
2. Decode message: getCompiledTransactionMessageDecoder().decode(messageBytes) -> compiledMessage
3. For each instruction in compiledMessage.instructions:
   a. programAddress = compiledMessage.staticAccounts[instruction.programAddressIndex]
   b. accountAddresses = instruction.accountIndices.map(i => compiledMessage.staticAccounts[i])
   c. data = instruction.data (Uint8Array)
4. Identify by programAddress:
   - '11111111111111111111111111111111' -> parse SystemProgram instruction
   - 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' -> parse SPL Token instruction
   - 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' -> parse Token-2022 instruction
   - anything else -> CONTRACT_CALL with first 8 bytes as Anchor discriminator
```

### 6. EVM Function Selector Identification Strategy

```
1. Parse: parseTransaction(hex) -> { to, value, data, chainId, type, ... }
2. If no data or data === '0x': NATIVE_TRANSFER
3. Extract selector = data.slice(0, 10) (0x + 4 bytes)
4. Match:
   - '0xa9059cbb' -> TOKEN_TRANSFER (transfer(address,uint256))
   - '0x095ea7b3' -> APPROVE (approve(address,uint256))
   - any other selector -> CONTRACT_CALL
5. For TOKEN_TRANSFER/APPROVE, decode args from remaining calldata:
   - address = data[34:74] (20 bytes, padded to 32)
   - uint256 = data[74:138] (32 bytes)
```

### 7. Test Fixture Strategy

For both parsers, tests should use pre-built serialized transactions as fixtures:

**Solana fixtures:** Use the existing build pipeline to create transactions:
```typescript
// Build a real SystemProgram.transfer tx using the adapter's buildTransaction
// Then use the serialized bytes as a fixture for parseTransaction tests
const unsignedTx = await adapter.buildTransaction({ from, to, amount });
const base64 = Buffer.from(unsignedTx.serialized).toString('base64');
// This base64 string becomes the fixture for parseTransaction
```

**EVM fixtures:** Use viem's serializeTransaction to create test fixtures:
```typescript
const serializedHex = serializeTransaction({
  type: 'eip1559', to: addr, value: 1000000000000000000n,
  nonce: 0, gas: 21000n, maxFeePerGas: 10n, maxPriorityFeePerGas: 1n, chainId: 1
});
// This hex string becomes the fixture for parseTransaction
```
