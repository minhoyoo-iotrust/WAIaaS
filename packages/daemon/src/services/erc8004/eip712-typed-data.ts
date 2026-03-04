/**
 * EIP-712 typed data construction for ERC-8004 AgentWalletSet.
 *
 * Produces { domain, types, primaryType, message } matching viem's
 * TypedDataDefinition shape, ready for eth_signTypedData_v4 signing
 * and recoverTypedDataAddress verification.
 *
 * On-chain typehash: AgentWalletSet(uint256 agentId, address newWallet, address owner, uint256 deadline)
 *
 * @see Phase 321 -- EIP-712 Approval + Wallet Linking
 */

import type { Hex } from 'viem';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** EIP-712 domain for ERC-8004 Identity Registry (chainId + verifyingContract filled at runtime). */
export const ERC8004_EIP712_DOMAIN = {
  name: 'ERC8004IdentityRegistry',
  version: '1',
} as const;

/** EIP-712 struct types for AgentWalletSet (4-field, includes owner). */
export const AGENT_WALLET_SET_TYPES = {
  AgentWalletSet: [
    { name: 'agentId', type: 'uint256' },
    { name: 'newWallet', type: 'address' },
    { name: 'owner', type: 'address' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface BuildAgentWalletSetParams {
  agentId: bigint;
  newWallet: Hex;
  owner: Hex;
  deadline: bigint;
  chainId: number;
  verifyingContract: Hex;
}

export interface AgentWalletSetTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Hex;
  };
  types: typeof AGENT_WALLET_SET_TYPES;
  primaryType: 'AgentWalletSet';
  message: {
    agentId: bigint;
    newWallet: Hex;
    owner: Hex;
    deadline: bigint;
  };
}

/**
 * Build EIP-712 typed data for AgentWalletSet.
 *
 * Returns a complete TypedDataDefinition suitable for:
 * - viem's signTypedData() and recoverTypedDataAddress()
 * - WalletConnect eth_signTypedData_v4 (after JSON.stringify)
 */
export function buildAgentWalletSetTypedData(
  params: BuildAgentWalletSetParams,
): AgentWalletSetTypedData {
  return {
    domain: {
      ...ERC8004_EIP712_DOMAIN,
      chainId: params.chainId,
      verifyingContract: params.verifyingContract,
    },
    types: AGENT_WALLET_SET_TYPES,
    primaryType: 'AgentWalletSet',
    message: {
      agentId: params.agentId,
      newWallet: params.newWallet,
      owner: params.owner,
      deadline: params.deadline,
    },
  };
}
