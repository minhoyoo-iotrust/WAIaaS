/**
 * SEC-07-01~28 Contract whitelist attack scenarios.
 *
 * Tests 28 attack vectors against CONTRACT_WHITELIST and METHOD_WHITELIST policies:
 * Default deny, non-whitelisted contract, whitelisted contract,
 * METHOD_WHITELIST restriction, case-insensitive bypass, empty array,
 * disabled policy, global vs wallet override, network scoping,
 * special character injection, and boundary variations.
 *
 * @see docs/64-extension-test-strategy.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createInMemoryDb,
  insertPolicy,
} from '../helpers/security-test-helpers.js';
import type { DatabaseConnection } from '../../../infrastructure/database/index.js';
import { generateId } from '../../../infrastructure/database/index.js';
import { wallets } from '../../../infrastructure/database/schema.js';
import { DatabasePolicyEngine } from '../../../pipeline/database-policy-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let engine: DatabasePolicyEngine;
let walletId: string;

async function insertTestWallet(connection: DatabaseConnection): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await connection.db.insert(wallets).values({
    id,
    name: 'sec-contract-test-wallet',
    chain: 'ethereum',
    environment: 'testnet',
    defaultNetwork: 'ethereum-sepolia',
    publicKey: `pk-sec-${id}`,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * Build a CONTRACT_CALL transaction for policy evaluation.
 */
function contractTx(
  contractAddress: string,
  opts?: { selector?: string; toAddress?: string; chain?: string; network?: string; amount?: string },
) {
  return {
    type: 'CONTRACT_CALL',
    contractAddress,
    amount: opts?.amount ?? '0',
    toAddress: opts?.toAddress ?? contractAddress,
    selector: opts?.selector,
    chain: opts?.chain ?? 'ethereum',
    ...(opts?.network ? { network: opts.network } : {}),
  };
}

/**
 * Build a TOKEN_TRANSFER transaction for non-applicability testing.
 */
function tokenTransferTx() {
  return {
    type: 'TOKEN_TRANSFER',
    tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: '1000000',
    toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    chain: 'solana',
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  conn = createInMemoryDb();
  engine = new DatabasePolicyEngine(conn.db);
  walletId = await insertTestWallet(conn);
});

afterEach(() => {
  try {
    conn.sqlite.close();
  } catch {
    // already closed
  }
});

// ---------------------------------------------------------------------------
// SEC-07-01: CONTRACT_WHITELIST not configured -> CONTRACT_CALL default deny
// ---------------------------------------------------------------------------

describe('SEC-07-01: CONTRACT_WHITELIST not configured -> CONTRACT_CALL default deny', () => {
  it('denies CONTRACT_CALL when no CONTRACT_WHITELIST policy exists', async () => {
    // Need at least one enabled policy
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluate(
      walletId,
      contractTx('0x1234567890abcdef1234567890abcdef12345678'),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no CONTRACT_WHITELIST policy configured');
  });
});

// ---------------------------------------------------------------------------
// SEC-07-02: Non-whitelisted contract -> deny
// ---------------------------------------------------------------------------

describe('SEC-07-02: non-whitelisted contract -> deny', () => {
  it('denies CONTRACT_CALL to non-whitelisted contract', async () => {
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: '0xaaaabbbbccccddddeeeeffffaaaabbbbccccdddd', name: 'Uniswap' }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      contractTx('0x1111222233334444555566667777888899990000'),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Contract not whitelisted');
  });
});

// ---------------------------------------------------------------------------
// SEC-07-03: Whitelisted contract -> allow
// ---------------------------------------------------------------------------

describe('SEC-07-03: whitelisted contract -> allow', () => {
  it('allows CONTRACT_CALL to whitelisted contract', async () => {
    const contractAddr = '0xaaaabbbbccccddddeeeeffffaaaabbbbccccdddd';
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: contractAddr, name: 'Uniswap' }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      contractTx(contractAddr),
    );
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-07-04: METHOD_WHITELIST + non-allowed method -> deny
// ---------------------------------------------------------------------------

describe('SEC-07-04: METHOD_WHITELIST with non-allowed method -> deny', () => {
  it('denies CONTRACT_CALL when method selector not whitelisted', async () => {
    const contractAddr = '0xaaaabbbbccccddddeeeeffffaaaabbbbccccdddd';

    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: contractAddr }],
      }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'METHOD_WHITELIST',
      rules: JSON.stringify({
        methods: [{
          contractAddress: contractAddr,
          selectors: ['0xa9059cbb'], // transfer only
        }],
      }),
      priority: 20,
    });

    // Non-whitelisted method selector
    const result = await engine.evaluate(
      walletId,
      contractTx(contractAddr, { selector: '0x095ea7b3' }), // approve selector
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Method not whitelisted');
  });
});

// ---------------------------------------------------------------------------
// SEC-07-05: METHOD_WHITELIST + allowed method -> allow
// ---------------------------------------------------------------------------

describe('SEC-07-05: METHOD_WHITELIST with allowed method -> allow', () => {
  it('allows CONTRACT_CALL when method selector is whitelisted', async () => {
    const contractAddr = '0xaaaabbbbccccddddeeeeffffaaaabbbbccccdddd';

    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: contractAddr }],
      }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'METHOD_WHITELIST',
      rules: JSON.stringify({
        methods: [{
          contractAddress: contractAddr,
          selectors: ['0xa9059cbb', '0x095ea7b3'],
        }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      contractTx(contractAddr, { selector: '0xa9059cbb' }),
    );
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-07-06: METHOD_WHITELIST not set (CONTRACT_WHITELIST only) -> all methods allowed
// ---------------------------------------------------------------------------

describe('SEC-07-06: no METHOD_WHITELIST -> all methods allowed', () => {
  it('allows any method when only CONTRACT_WHITELIST exists', async () => {
    const contractAddr = '0xaaaabbbbccccddddeeeeffffaaaabbbbccccdddd';

    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: contractAddr }],
      }),
      priority: 20,
    });

    // Any selector should pass
    const r1 = await engine.evaluate(
      walletId,
      contractTx(contractAddr, { selector: '0xdeadbeef' }),
    );
    expect(r1.allowed).toBe(true);

    // Even without selector
    const r2 = await engine.evaluate(
      walletId,
      contractTx(contractAddr),
    );
    expect(r2.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-07-07: Case-insensitive contract address matching
// ---------------------------------------------------------------------------

describe('SEC-07-07: case-insensitive contract address matching', () => {
  it('matches EVM contract address case-insensitively', async () => {
    const checksumAddr = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';

    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: checksumAddr }],
      }),
      priority: 20,
    });

    // Lowercase query
    const r1 = await engine.evaluate(
      walletId,
      contractTx(checksumAddr.toLowerCase()),
    );
    expect(r1.allowed).toBe(true);

    // Uppercase query
    const r2 = await engine.evaluate(
      walletId,
      contractTx(checksumAddr.toUpperCase()),
    );
    expect(r2.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-07-08: Empty contracts array -> all CONTRACT_CALL denied
// ---------------------------------------------------------------------------

describe('SEC-07-08: empty contracts array -> all CONTRACT_CALL denied', () => {
  it('denies all CONTRACT_CALL when contracts array is empty', async () => {
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [] }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      contractTx('0x1234567890abcdef1234567890abcdef12345678'),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Contract not whitelisted');
  });
});

// ---------------------------------------------------------------------------
// SEC-07-09: Disabled CONTRACT_WHITELIST -> default deny
// ---------------------------------------------------------------------------

describe('SEC-07-09: disabled CONTRACT_WHITELIST -> default deny', () => {
  it('denies CONTRACT_CALL when CONTRACT_WHITELIST is disabled', async () => {
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: '0x1234567890abcdef1234567890abcdef12345678' }],
      }),
      priority: 20,
      enabled: false, // Disabled
    });

    // Need at least one enabled policy
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluate(
      walletId,
      contractTx('0x1234567890abcdef1234567890abcdef12345678'),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no CONTRACT_WHITELIST policy configured');
  });
});

// ---------------------------------------------------------------------------
// SEC-07-10: Global vs wallet override priority
// ---------------------------------------------------------------------------

describe('SEC-07-10: global vs wallet CONTRACT_WHITELIST override', () => {
  it('wallet-specific CONTRACT_WHITELIST overrides global', async () => {
    const globalContract = '0xaaaa000000000000000000000000000000000001';
    const walletContract = '0xbbbb000000000000000000000000000000000002';

    // Global
    insertPolicy(conn.sqlite, {
      walletId: null,
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: globalContract }],
      }),
      priority: 10,
    });

    // Wallet-specific
    insertPolicy(conn.sqlite, {
      walletId,
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: walletContract }],
      }),
      priority: 10,
    });

    // walletContract allowed
    const r1 = await engine.evaluate(walletId, contractTx(walletContract));
    expect(r1.allowed).toBe(true);

    // globalContract denied (wallet-specific overrides)
    const r2 = await engine.evaluate(walletId, contractTx(globalContract));
    expect(r2.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-07-11: Network scoping (mainnet whitelist does not apply on devnet)
// ---------------------------------------------------------------------------

describe('SEC-07-11: network scoping for CONTRACT_WHITELIST', () => {
  it('mainnet-scoped CONTRACT_WHITELIST does not apply on devnet', async () => {
    const contractAddr = '0xaaaa000000000000000000000000000000000001';

    // Insert mainnet-scoped policy
    const id = generateId();
    const now = Math.floor(Date.now() / 1000);
    conn.sqlite
      .prepare(
        `INSERT INTO policies (id, wallet_id, type, rules, priority, enabled, network, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        null,
        'CONTRACT_WHITELIST',
        JSON.stringify({ contracts: [{ address: contractAddr }] }),
        20,
        1,
        'mainnet',
        now,
        now,
      );

    // Need another enabled policy
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluate(
      walletId,
      contractTx(contractAddr, { network: 'sepolia' }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no CONTRACT_WHITELIST policy configured');
  });
});

// ---------------------------------------------------------------------------
// SEC-07-12: Address with malicious character injection
// ---------------------------------------------------------------------------

describe('SEC-07-12: address with malicious character injection', () => {
  it('spaces in contract address do not match', async () => {
    const cleanAddr = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: cleanAddr }] }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      contractTx(' 0xaaaa000000000000000000000000000000000001 '),
    );
    expect(result.allowed).toBe(false);
  });

  it('null byte injection in contract address fails', async () => {
    const cleanAddr = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: cleanAddr }] }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      contractTx('0xaaaa000000000000000000000000000000000001\0'),
    );
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-07-13: TOKEN_TRANSFER type not affected by CONTRACT_WHITELIST
// ---------------------------------------------------------------------------

describe('SEC-07-13: TOKEN_TRANSFER not affected by CONTRACT_WHITELIST', () => {
  it('TOKEN_TRANSFER does not trigger CONTRACT_WHITELIST evaluation', async () => {
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: '0xaaaa000000000000000000000000000000000001' }],
      }),
      priority: 20,
    });

    // TOKEN_TRANSFER -> should trigger ALLOWED_TOKENS check, not CONTRACT_WHITELIST
    const result = await engine.evaluate(walletId, tokenTransferTx());
    expect(result.allowed).toBe(false);
    // Should be denied by ALLOWED_TOKENS (default deny), not CONTRACT_WHITELIST
    expect(result.reason).toContain('ALLOWED_TOKENS');
  });
});

// ---------------------------------------------------------------------------
// SEC-07-14: METHOD_WHITELIST selectors format (4-byte hex)
// ---------------------------------------------------------------------------

describe('SEC-07-14: METHOD_WHITELIST selectors format', () => {
  it('case-insensitive method selector matching', async () => {
    const contractAddr = '0xaaaa000000000000000000000000000000000001';

    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: contractAddr }] }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'METHOD_WHITELIST',
      rules: JSON.stringify({
        methods: [{
          contractAddress: contractAddr,
          selectors: ['0xA9059CBB'], // uppercase
        }],
      }),
      priority: 20,
    });

    // Lowercase query -> case-insensitive match
    const result = await engine.evaluate(
      walletId,
      contractTx(contractAddr, { selector: '0xa9059cbb' }),
    );
    expect(result.allowed).toBe(true);
  });

  it('missing selector with METHOD_WHITELIST present is denied', async () => {
    const contractAddr = '0xaaaa000000000000000000000000000000000001';

    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: contractAddr }] }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'METHOD_WHITELIST',
      rules: JSON.stringify({
        methods: [{
          contractAddress: contractAddr,
          selectors: ['0xa9059cbb'],
        }],
      }),
      priority: 20,
    });

    // No selector provided -> denied
    const result = await engine.evaluate(
      walletId,
      contractTx(contractAddr),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('missing selector');
  });
});

// ---------------------------------------------------------------------------
// SEC-07-15: Multiple METHOD_WHITELIST for same contract
// ---------------------------------------------------------------------------

describe('SEC-07-15: METHOD_WHITELIST for same contract (single policy resolved)', () => {
  it('resolved policy has the selectors from winning override', async () => {
    const contractAddr = '0xaaaa000000000000000000000000000000000001';

    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: contractAddr }] }),
      priority: 20,
    });

    // Global METHOD_WHITELIST with transfer selector
    insertPolicy(conn.sqlite, {
      walletId: null,
      type: 'METHOD_WHITELIST',
      rules: JSON.stringify({
        methods: [{
          contractAddress: contractAddr,
          selectors: ['0xa9059cbb'], // transfer
        }],
      }),
      priority: 10,
    });

    // Wallet-specific METHOD_WHITELIST with approve selector
    insertPolicy(conn.sqlite, {
      walletId,
      type: 'METHOD_WHITELIST',
      rules: JSON.stringify({
        methods: [{
          contractAddress: contractAddr,
          selectors: ['0x095ea7b3'], // approve
        }],
      }),
      priority: 10,
    });

    // Wallet-specific overrides -> only approve selector allowed
    const r1 = await engine.evaluate(
      walletId,
      contractTx(contractAddr, { selector: '0x095ea7b3' }),
    );
    expect(r1.allowed).toBe(true);

    // Transfer selector denied (not in wallet-specific policy)
    const r2 = await engine.evaluate(
      walletId,
      contractTx(contractAddr, { selector: '0xa9059cbb' }),
    );
    expect(r2.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-07-16: Empty selectors array in METHOD_WHITELIST
// ---------------------------------------------------------------------------

describe('SEC-07-16: empty selectors array in METHOD_WHITELIST', () => {
  it('empty selectors means no methods allowed for that contract', async () => {
    const contractAddr = '0xaaaa000000000000000000000000000000000001';

    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: contractAddr }] }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'METHOD_WHITELIST',
      rules: JSON.stringify({
        methods: [{
          contractAddress: contractAddr,
          selectors: [], // empty
        }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      contractTx(contractAddr, { selector: '0xa9059cbb' }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Method not whitelisted');
  });
});

// ---------------------------------------------------------------------------
// SEC-07-17: Multiple contracts in whitelist
// ---------------------------------------------------------------------------

describe('SEC-07-17: multiple contracts in whitelist', () => {
  it('all whitelisted contracts are individually allowed', async () => {
    const contracts = [
      '0xaaaa000000000000000000000000000000000001',
      '0xbbbb000000000000000000000000000000000002',
      '0xcccc000000000000000000000000000000000003',
    ];

    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: contracts.map((addr) => ({ address: addr })),
      }),
      priority: 20,
    });

    for (const addr of contracts) {
      const result = await engine.evaluate(walletId, contractTx(addr));
      expect(result.allowed).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// SEC-07-18: CONTRACT_CALL with value (amount > 0)
// ---------------------------------------------------------------------------

describe('SEC-07-18: CONTRACT_CALL with native value attached', () => {
  it('whitelisted contract with native value still evaluates SPENDING_LIMIT', async () => {
    const contractAddr = '0xaaaa000000000000000000000000000000000001';

    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: contractAddr }] }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // CONTRACT_CALL with 5 ETH value
    const result = await engine.evaluate(
      walletId,
      contractTx(contractAddr, { amount: '5000000000' }),
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY'); // 5G > 1G instant_max
  });
});

// ---------------------------------------------------------------------------
// SEC-07-19: Contract address with 0x prefix manipulation
// ---------------------------------------------------------------------------

describe('SEC-07-19: contract address 0x prefix manipulation', () => {
  it('address without 0x prefix does not match 0x-prefixed whitelist', async () => {
    const evmAddr = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: evmAddr }] }),
      priority: 20,
    });

    // Strip 0x
    const result = await engine.evaluate(
      walletId,
      contractTx('aaaa000000000000000000000000000000000001'),
    );
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-07-20: METHOD_WHITELIST for contract not in CONTRACT_WHITELIST
// ---------------------------------------------------------------------------

describe('SEC-07-20: METHOD_WHITELIST without CONTRACT_WHITELIST match', () => {
  it('METHOD_WHITELIST alone cannot bypass CONTRACT_WHITELIST deny', async () => {
    const contractA = '0xaaaa000000000000000000000000000000000001';
    const contractB = '0xbbbb000000000000000000000000000000000002';

    // CONTRACT_WHITELIST only allows contractA
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: contractA }] }),
      priority: 20,
    });

    // METHOD_WHITELIST for contractB (which is not in CONTRACT_WHITELIST)
    insertPolicy(conn.sqlite, {
      type: 'METHOD_WHITELIST',
      rules: JSON.stringify({
        methods: [{ contractAddress: contractB, selectors: ['0xa9059cbb'] }],
      }),
      priority: 20,
    });

    // contractB denied at CONTRACT_WHITELIST stage
    const result = await engine.evaluate(
      walletId,
      contractTx(contractB, { selector: '0xa9059cbb' }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Contract not whitelisted');
  });
});

// ---------------------------------------------------------------------------
// SEC-07-21: METHOD_WHITELIST for different contract -> no restriction on target
// ---------------------------------------------------------------------------

describe('SEC-07-21: METHOD_WHITELIST for different contract has no effect on target', () => {
  it('METHOD_WHITELIST for contractA does not restrict contractB', async () => {
    const contractA = '0xaaaa000000000000000000000000000000000001';
    const contractB = '0xbbbb000000000000000000000000000000000002';

    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: contractA }, { address: contractB }],
      }),
      priority: 20,
    });

    // METHOD_WHITELIST restricts contractA only
    insertPolicy(conn.sqlite, {
      type: 'METHOD_WHITELIST',
      rules: JSON.stringify({
        methods: [{ contractAddress: contractA, selectors: ['0xa9059cbb'] }],
      }),
      priority: 20,
    });

    // contractB: no method restriction -> any method passes
    const result = await engine.evaluate(
      walletId,
      contractTx(contractB, { selector: '0xdeadbeef' }),
    );
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-07-22: Partial contract address match attempt
// ---------------------------------------------------------------------------

describe('SEC-07-22: partial contract address match', () => {
  it('prefix-only match does not succeed', async () => {
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: '0xaaaa000000000000000000000000000000000001' }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(walletId, contractTx('0xaaaa'));
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-07-23: TRANSFER type not affected by CONTRACT_WHITELIST
// ---------------------------------------------------------------------------

describe('SEC-07-23: TRANSFER type not affected by CONTRACT_WHITELIST', () => {
  it('native TRANSFER is not checked against CONTRACT_WHITELIST', async () => {
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: '0xaaaa000000000000000000000000000000000001' }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '1000000000',
      toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      chain: 'ethereum',
    });
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-07-24: Contract address with unicode injection
// ---------------------------------------------------------------------------

describe('SEC-07-24: contract address with unicode injection', () => {
  it('zero-width space in address does not match', async () => {
    const cleanAddr = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: cleanAddr }] }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      contractTx('0xaaaa0000000\u200B00000000000000000000000001'),
    );
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-07-25: METHOD_WHITELIST case-insensitive contract address matching
// ---------------------------------------------------------------------------

describe('SEC-07-25: METHOD_WHITELIST case-insensitive contract matching', () => {
  it('METHOD_WHITELIST matches contract address case-insensitively', async () => {
    const contractAddr = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';

    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: contractAddr }] }),
      priority: 20,
    });

    // METHOD_WHITELIST uses lowercase address
    insertPolicy(conn.sqlite, {
      type: 'METHOD_WHITELIST',
      rules: JSON.stringify({
        methods: [{
          contractAddress: contractAddr.toLowerCase(),
          selectors: ['0xa9059cbb'],
        }],
      }),
      priority: 20,
    });

    // Query with checksum address -> should still match
    const result = await engine.evaluate(
      walletId,
      contractTx(contractAddr, { selector: '0xa9059cbb' }),
    );
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-07-26: Very long contract address
// ---------------------------------------------------------------------------

describe('SEC-07-26: very long contract address', () => {
  it('extremely long address string is denied', async () => {
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: '0xaaaa000000000000000000000000000000000001' }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      contractTx('0x' + 'a'.repeat(500)),
    );
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-07-27: Large number of contracts in whitelist
// ---------------------------------------------------------------------------

describe('SEC-07-27: large whitelist (100 contracts)', () => {
  it('correctly evaluates against large contract list', async () => {
    const contracts = Array.from({ length: 100 }, (_, i) => ({
      address: `0x${String(i).padStart(40, '0')}`,
    }));

    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts }),
      priority: 20,
    });

    // Contract at index 50
    const r1 = await engine.evaluate(
      walletId,
      contractTx('0x' + '50'.padStart(40, '0')),
    );
    expect(r1.allowed).toBe(true);

    // Contract not in list
    const r2 = await engine.evaluate(
      walletId,
      contractTx('0xnot_in_list_address_9999999999999999999'),
    );
    expect(r2.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-07-28: METHOD_WHITELIST with multiple selectors
// ---------------------------------------------------------------------------

describe('SEC-07-28: METHOD_WHITELIST with multiple selectors', () => {
  it('all listed selectors are allowed, unlisted are denied', async () => {
    const contractAddr = '0xaaaa000000000000000000000000000000000001';

    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: contractAddr }] }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'METHOD_WHITELIST',
      rules: JSON.stringify({
        methods: [{
          contractAddress: contractAddr,
          selectors: ['0xa9059cbb', '0x095ea7b3', '0x23b872dd'], // transfer, approve, transferFrom
        }],
      }),
      priority: 20,
    });

    // All three should pass
    for (const sel of ['0xa9059cbb', '0x095ea7b3', '0x23b872dd']) {
      const result = await engine.evaluate(
        walletId,
        contractTx(contractAddr, { selector: sel }),
      );
      expect(result.allowed).toBe(true);
    }

    // Unknown selector denied
    const denied = await engine.evaluate(
      walletId,
      contractTx(contractAddr, { selector: '0x12345678' }),
    );
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('Method not whitelisted');
  });
});
