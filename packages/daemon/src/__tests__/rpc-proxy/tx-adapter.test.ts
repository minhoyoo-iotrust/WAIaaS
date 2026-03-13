import { describe, it, expect } from 'vitest';
import { RpcTransactionAdapter, toHexChainId, hexToDecimal } from '../../rpc-proxy/tx-adapter.js';

describe('RpcTransactionAdapter', () => {
  const adapter = new RpcTransactionAdapter();
  const network = 'ethereum-mainnet';

  describe('TRANSFER (native ETH)', () => {
    it('converts to + value (no data) to TRANSFER', () => {
      const result = adapter.convert(
        { to: '0xRecipient', value: '0x1000' },
        network,
      );
      expect(result.type).toBe('TRANSFER');
      expect(result).toMatchObject({
        type: 'TRANSFER',
        to: '0xRecipient',
        amount: '4096', // 0x1000 = 4096
        network,
      });
    });

    it('converts to + no value and no data to TRANSFER with amount 0', () => {
      const result = adapter.convert({ to: '0xAddr' }, network);
      expect(result.type).toBe('TRANSFER');
      expect(result).toMatchObject({
        type: 'TRANSFER',
        to: '0xAddr',
        amount: '0',
        network,
      });
    });

    it('converts to + empty data (0x) to TRANSFER', () => {
      const result = adapter.convert(
        { to: '0xAddr', data: '0x', value: '0x10' },
        network,
      );
      expect(result.type).toBe('TRANSFER');
      expect(result).toMatchObject({
        type: 'TRANSFER',
        amount: '16',
      });
    });
  });

  describe('TOKEN_TRANSFER (ERC-20 transfer)', () => {
    it('converts to + data with 0xa9059cbb selector to TOKEN_TRANSFER', () => {
      // ERC-20 transfer(address,uint256)
      // selector: 0xa9059cbb
      // recipient: 0x000...deadbeef (padded to 32 bytes)
      // amount: 0x...3e8 (1000)
      const recipient = '0000000000000000000000001234567890abcdef1234567890abcdef12345678';
      const amount = '00000000000000000000000000000000000000000000000000000000000003e8';
      const data = `0xa9059cbb${recipient}${amount}`;

      const result = adapter.convert(
        { to: '0xTokenContract', data },
        network,
      );
      expect(result.type).toBe('TOKEN_TRANSFER');
      expect(result).toMatchObject({
        type: 'TOKEN_TRANSFER',
        tokenAddress: '0xTokenContract',
        to: '0x1234567890abcdef1234567890abcdef12345678',
        amount: '1000',
        network,
      });
    });
  });

  describe('APPROVE (ERC-20 approve)', () => {
    it('converts to + data with 0x095ea7b3 selector to APPROVE', () => {
      const spender = '0000000000000000000000001234567890abcdef1234567890abcdef12345678';
      const amount = '00000000000000000000000000000000000000000000000000000000000003e8';
      const data = `0x095ea7b3${spender}${amount}`;

      const result = adapter.convert(
        { to: '0xTokenContract', data },
        network,
      );
      expect(result.type).toBe('APPROVE');
      expect(result).toMatchObject({
        type: 'APPROVE',
        tokenAddress: '0xTokenContract',
        spenderAddress: '0x1234567890abcdef1234567890abcdef12345678',
        amount: '1000',
        network,
      });
    });
  });

  describe('CONTRACT_CALL (other selector)', () => {
    it('converts to + data with unknown selector to CONTRACT_CALL', () => {
      const data = '0x12345678deadbeef';
      const result = adapter.convert(
        { to: '0xContract', data, value: '0x100' },
        network,
      );
      expect(result.type).toBe('CONTRACT_CALL');
      expect(result).toMatchObject({
        type: 'CONTRACT_CALL',
        to: '0xContract',
        data,
        value: '256', // 0x100 = 256
        network,
      });
    });

    it('transferFrom (0x23b872dd) falls through to CONTRACT_CALL (Pitfall 14)', () => {
      const data = '0x23b872dd0000000000000000000000000000000000000000000000000000000000000001';
      const result = adapter.convert(
        { to: '0xToken', data },
        network,
      );
      expect(result.type).toBe('CONTRACT_CALL');
    });
  });

  describe('CONTRACT_DEPLOY (no to)', () => {
    it('converts to=null + data to CONTRACT_DEPLOY', () => {
      const result = adapter.convert(
        { to: null, data: '0x6080604052...' },
        network,
      );
      expect(result.type).toBe('CONTRACT_DEPLOY');
      expect(result).toMatchObject({
        type: 'CONTRACT_DEPLOY',
        bytecode: '0x6080604052...',
        value: '0',
        network,
      });
    });

    it('converts to=undefined + data to CONTRACT_DEPLOY', () => {
      const result = adapter.convert(
        { data: '0x6080604052...' },
        network,
      );
      expect(result.type).toBe('CONTRACT_DEPLOY');
      expect(result).toMatchObject({
        type: 'CONTRACT_DEPLOY',
        bytecode: '0x6080604052...',
        value: '0',
        network,
      });
    });

    it('CONTRACT_DEPLOY with value', () => {
      const result = adapter.convert(
        { to: null, data: '0x6080...', value: '0x3e8' },
        network,
      );
      expect(result.type).toBe('CONTRACT_DEPLOY');
      expect(result).toMatchObject({
        type: 'CONTRACT_DEPLOY',
        value: '1000',
      });
    });
  });

  describe('hex value conversion', () => {
    it('converts hex value to decimal string', () => {
      const result = adapter.convert(
        { to: '0xAddr', value: '0xde0b6b3a7640000' }, // 1 ETH in wei
        network,
      );
      expect(result).toMatchObject({
        type: 'TRANSFER',
        amount: '1000000000000000000',
      });
    });
  });
});

describe('toHexChainId', () => {
  it('converts 1 to 0x1', () => {
    expect(toHexChainId(1)).toBe('0x1');
  });

  it('converts 8453 (Base) to 0x2105', () => {
    expect(toHexChainId(8453)).toBe('0x2105');
  });

  it('converts 137 (Polygon) to 0x89', () => {
    expect(toHexChainId(137)).toBe('0x89');
  });
});

describe('hexToDecimal', () => {
  it('converts 0x1000 to 4096', () => {
    expect(hexToDecimal('0x1000')).toBe('4096');
  });

  it('returns 0 for undefined', () => {
    expect(hexToDecimal(undefined)).toBe('0');
  });

  it('returns 0 for empty hex (0x)', () => {
    expect(hexToDecimal('0x')).toBe('0');
  });

  it('returns 0 for 0x0', () => {
    expect(hexToDecimal('0x0')).toBe('0');
  });
});
