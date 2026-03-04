/**
 * ERC-8004 Registry Client.
 *
 * Provides calldata encoding for 3 ERC-8004 registries (Identity, Reputation,
 * Validation) using viem's encodeFunctionData. Does NOT execute transactions
 * or read on-chain state -- that is handled by the pipeline (write) and
 * REST routes (read, Phase 319/320).
 *
 * All encode* methods return 0x-prefixed hex calldata suitable for
 * ContractCallRequest.calldata.
 */
import { encodeFunctionData, toHex, type Hex } from 'viem';
import { ChainError } from '@waiaas/core';
import { IDENTITY_REGISTRY_ABI } from './identity-abi.js';
import { REPUTATION_REGISTRY_ABI } from './reputation-abi.js';
import { VALIDATION_REGISTRY_ABI } from './validation-abi.js';
import type { Erc8004Config } from './config.js';

// ---------------------------------------------------------------------------
// Registry type
// ---------------------------------------------------------------------------

export type RegistryType = 'identity' | 'reputation' | 'validation';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class Erc8004RegistryClient {
  private readonly identityAddress: Hex;
  private readonly reputationAddress: Hex;
  private readonly validationAddress: string;

  constructor(config: Erc8004Config) {
    this.identityAddress = config.identityRegistryAddress as Hex;
    this.reputationAddress = config.reputationRegistryAddress as Hex;
    this.validationAddress = config.validationRegistryAddress;
  }

  // -------------------------------------------------------------------------
  // Address resolution
  // -------------------------------------------------------------------------

  /**
   * Get the contract address for a specific registry.
   * Throws ChainError if validation registry is not configured (feature-gated).
   */
  getRegistryAddress(registry: RegistryType): Hex {
    switch (registry) {
      case 'identity':
        return this.identityAddress;
      case 'reputation':
        return this.reputationAddress;
      case 'validation':
        if (!this.validationAddress) {
          throw new ChainError(
            'INVALID_INSTRUCTION',
            'ethereum',
            { message: 'Validation Registry not configured (not deployed on mainnet)' },
          );
        }
        return this.validationAddress as Hex;
    }
  }

  // -------------------------------------------------------------------------
  // Identity Registry encoding
  // -------------------------------------------------------------------------

  /** Encode register(string agentURI) calldata. */
  encodeRegister(agentURI: string): Hex {
    return encodeFunctionData({
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [agentURI],
    });
  }

  /** Encode register(string agentURI, MetadataEntry[] metadata) calldata. */
  encodeRegisterWithMetadata(
    agentURI: string,
    metadata: Array<{ key: string; value: string }>,
  ): Hex {
    // Convert string values to bytes for on-chain MetadataEntry[] tuple
    const metadataEntries = metadata.map(({ key, value }) => ({
      key,
      value: toHex(value),
    }));

    return encodeFunctionData({
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [agentURI, metadataEntries],
    });
  }

  /**
   * Encode setAgentWallet(uint256, address, uint256, bytes) calldata.
   * Phase 321 will provide the EIP-712 signature via ApprovalWorkflow.
   */
  encodeSetAgentWallet(
    agentId: bigint,
    newWallet: Hex,
    deadline: bigint,
    signature: Hex,
  ): Hex {
    return encodeFunctionData({
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'setAgentWallet',
      args: [agentId, newWallet, deadline, signature],
    });
  }

  /** Encode unsetAgentWallet(uint256) calldata. */
  encodeUnsetAgentWallet(agentId: bigint): Hex {
    return encodeFunctionData({
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'unsetAgentWallet',
      args: [agentId],
    });
  }

  /** Encode setAgentURI(uint256, string) calldata. */
  encodeSetAgentURI(agentId: bigint, newURI: string): Hex {
    return encodeFunctionData({
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'setAgentURI',
      args: [agentId, newURI],
    });
  }

  /** Encode setMetadata(uint256, string, bytes) calldata. */
  encodeSetMetadata(agentId: bigint, key: string, value: string): Hex {
    return encodeFunctionData({
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'setMetadata',
      args: [agentId, key, toHex(value)],
    });
  }

  // -------------------------------------------------------------------------
  // Reputation Registry encoding
  // -------------------------------------------------------------------------

  /** Encode giveFeedback(uint256, int128, uint8, string, string, string, string, bytes32) calldata. */
  encodeGiveFeedback(
    agentId: bigint,
    value: bigint,
    valueDecimals: number,
    tag1: string,
    tag2: string,
    endpoint: string,
    feedbackURI: string,
    feedbackHash: Hex,
  ): Hex {
    return encodeFunctionData({
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'giveFeedback',
      args: [agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash],
    });
  }

  /** Encode revokeFeedback(uint256, uint64) calldata. */
  encodeRevokeFeedback(agentId: bigint, feedbackIndex: bigint): Hex {
    return encodeFunctionData({
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'revokeFeedback',
      args: [agentId, feedbackIndex],
    });
  }

  // -------------------------------------------------------------------------
  // Validation Registry encoding
  // -------------------------------------------------------------------------

  /** Encode validationRequest(address, uint256, string, bytes32) calldata. */
  encodeValidationRequest(
    validatorAddress: Hex,
    agentId: bigint,
    requestURI: string,
    requestHash: Hex,
  ): Hex {
    return encodeFunctionData({
      abi: VALIDATION_REGISTRY_ABI,
      functionName: 'validationRequest',
      args: [validatorAddress, agentId, requestURI, requestHash],
    });
  }
}
