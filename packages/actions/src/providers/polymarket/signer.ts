/**
 * PolymarketSigner: EIP-712 signing + HMAC header generation.
 *
 * 3 static signing responsibilities:
 * 1. signOrder() -- CLOB order EIP-712 signature (Domain 2 or 3)
 * 2. signClobAuth() -- API Key creation EIP-712 signature (Domain 1)
 * 3. buildHmacHeaders() -- L2 HMAC-SHA256 request headers
 *
 * @see design doc 80, Section 4.5
 */
import { createHmac } from 'node:crypto';
import type { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  CTF_EXCHANGE_DOMAIN,
  NEG_RISK_CTF_EXCHANGE_DOMAIN,
  CLOB_AUTH_DOMAIN,
  ORDER_TYPES,
  CLOB_AUTH_TYPES,
  CLOB_AUTH_MESSAGE,
} from './config.js';
import type { PolymarketOrderStruct } from './schemas.js';

/**
 * Static signing utility for Polymarket CLOB operations.
 * No instance state -- all methods are static.
 */
export class PolymarketSigner {
  /**
   * EIP-712 Order signature.
   * Selects Domain 2 (CTF Exchange) or Domain 3 (Neg Risk CTF Exchange)
   * based on the isNegRisk flag.
   *
   * @returns 65-byte hex signature
   */
  static async signOrder(
    order: PolymarketOrderStruct,
    privateKey: Hex,
    isNegRisk: boolean,
  ): Promise<Hex> {
    const account = privateKeyToAccount(privateKey);
    const domain = isNegRisk
      ? NEG_RISK_CTF_EXCHANGE_DOMAIN
      : CTF_EXCHANGE_DOMAIN;

    return account.signTypedData({
      domain,
      types: ORDER_TYPES,
      primaryType: 'Order',
      message: order,
    });
  }

  /**
   * EIP-712 ClobAuth signature for API Key generation (L1 auth).
   * Uses fixed message: "This message attests that I control the given wallet"
   */
  static async signClobAuth(
    address: Hex,
    timestamp: string,
    nonce: bigint,
    privateKey: Hex,
  ): Promise<Hex> {
    const account = privateKeyToAccount(privateKey);
    return account.signTypedData({
      domain: CLOB_AUTH_DOMAIN,
      types: CLOB_AUTH_TYPES,
      primaryType: 'ClobAuth',
      message: {
        address,
        timestamp,
        nonce,
        message: CLOB_AUTH_MESSAGE,
      },
    });
  }

  /**
   * Build L2 HMAC-SHA256 request headers for authenticated CLOB endpoints.
   *
   * HMAC message format: timestamp + METHOD + path + body
   * Secret is base64-decoded before use.
   */
  static buildHmacHeaders(
    apiKey: string,
    secret: string,
    passphrase: string,
    walletAddress: string,
    method: string,
    path: string,
    body: string = '',
  ): Record<string, string> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const message = timestamp + method.toUpperCase() + path + body;
    const signature = createHmac('sha256', Buffer.from(secret, 'base64'))
      .update(message)
      .digest('base64');

    return {
      POLY_ADDRESS: walletAddress,
      POLY_SIGNATURE: signature,
      POLY_TIMESTAMP: timestamp,
      POLY_API_KEY: apiKey,
      POLY_PASSPHRASE: passphrase,
    };
  }
}
