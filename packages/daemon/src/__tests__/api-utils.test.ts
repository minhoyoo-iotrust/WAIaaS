/**
 * Tests for POST /utils/encode-calldata route.
 * Covers happy path (valid ABI encoding), missing args (defaults to []), and error handling.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { utilsRoutes } from '../api/routes/utils.js';
import { errorHandler } from '../api/middleware/error-handler.js';

function createApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.route('/', utilsRoutes());
  return app;
}

describe('POST /utils/encode-calldata', () => {
  const app = createApp();

  const ERC20_ABI = [
    {
      type: 'function',
      name: 'transfer',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'nonpayable',
    },
  ];

  it('encodes ERC-20 transfer calldata', async () => {
    const res = await app.request('/utils/encode-calldata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8', '1000000'],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { calldata: string; selector: string; functionName: string };
    expect(body.calldata).toMatch(/^0x/);
    expect(body.selector).toBe(body.calldata.slice(0, 10));
    expect(body.functionName).toBe('transfer');
    // ERC-20 transfer selector: 0xa9059cbb
    expect(body.selector).toBe('0xa9059cbb');
  });

  it('handles missing args (defaults to [])', async () => {
    const abi = [
      {
        type: 'function',
        name: 'totalSupply',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
      },
    ];

    const res = await app.request('/utils/encode-calldata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        abi,
        functionName: 'totalSupply',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { calldata: string; selector: string };
    expect(body.calldata).toMatch(/^0x/);
  });

  it('returns ABI_ENCODING_FAILED for invalid ABI', async () => {
    const res = await app.request('/utils/encode-calldata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        abi: [{ type: 'function', name: 'foo', inputs: [{ name: 'x', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' }],
        functionName: 'foo',
        args: ['not-a-number'],
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('ABI_ENCODING_FAILED');
  });
});
