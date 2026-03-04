/**
 * ERC-8004 Trustless Agents Action Provider.
 *
 * Implements IActionProvider with 8 write actions for 3 ERC-8004 registries:
 * - Identity: register_agent, set_agent_wallet, unset_agent_wallet, set_agent_uri, set_metadata
 * - Reputation: give_feedback, revoke_feedback
 * - Validation: request_validation
 *
 * Each resolve() returns a ContractCallRequest with encoded calldata for the
 * existing 6-stage pipeline (policy evaluation -> signing -> submission).
 */
import { keccak256, toHex, type Hex } from 'viem';
import { ChainError } from '@waiaas/core';
import type {
  IActionProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ContractCallRequest,
} from '@waiaas/core';
import { Erc8004RegistryClient } from './erc8004-registry-client.js';
import type { Erc8004Config } from './config.js';
import { ERC8004_DEFAULTS } from './config.js';
import {
  RegisterAgentInputSchema,
  SetAgentWalletInputSchema,
  UnsetAgentWalletInputSchema,
  SetAgentUriInputSchema,
  SetMetadataInputSchema,
  GiveFeedbackInputSchema,
  RevokeFeedbackInputSchema,
  RequestValidationInputSchema,
} from './schemas.js';
import { buildRegistrationFile } from './registration-file.js';

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class Erc8004ActionProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];

  private readonly config: Erc8004Config;
  private readonly client: Erc8004RegistryClient;

  constructor(config?: Partial<Erc8004Config>) {
    this.config = { ...ERC8004_DEFAULTS, ...config };
    this.client = new Erc8004RegistryClient(this.config);

    this.metadata = {
      name: 'erc8004_agent',
      description: 'ERC-8004 Trustless Agents — identity registration, reputation management, and on-chain validation',
      version: '1.0.0',
      chains: ['ethereum'],
      mcpExpose: true,
      requiresApiKey: false,
      requiredApis: [],
    };

    this.actions = [
      {
        name: 'register_agent',
        description: 'Register agent identity on ERC-8004 Identity Registry (NFT minting)',
        chain: 'ethereum',
        inputSchema: RegisterAgentInputSchema,
        riskLevel: 'high',
        defaultTier: 'APPROVAL',
      },
      {
        name: 'set_agent_wallet',
        description: 'Link agent wallet address via EIP-712 owner signature on Identity Registry',
        chain: 'ethereum',
        inputSchema: SetAgentWalletInputSchema,
        riskLevel: 'high',
        defaultTier: 'APPROVAL',
      },
      {
        name: 'unset_agent_wallet',
        description: 'Unlink agent wallet from Identity Registry entry',
        chain: 'ethereum',
        inputSchema: UnsetAgentWalletInputSchema,
        riskLevel: 'high',
        defaultTier: 'APPROVAL',
      },
      {
        name: 'set_agent_uri',
        description: 'Update agent registration file URI on Identity Registry',
        chain: 'ethereum',
        inputSchema: SetAgentUriInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
      {
        name: 'set_metadata',
        description: 'Set or update agent metadata key-value pair on Identity Registry',
        chain: 'ethereum',
        inputSchema: SetMetadataInputSchema,
        riskLevel: 'low',
        defaultTier: 'NOTIFY',
      },
      {
        name: 'give_feedback',
        description: 'Post reputation feedback for another agent on Reputation Registry',
        chain: 'ethereum',
        inputSchema: GiveFeedbackInputSchema,
        riskLevel: 'low',
        defaultTier: 'NOTIFY',
      },
      {
        name: 'revoke_feedback',
        description: 'Revoke previously posted feedback on Reputation Registry',
        chain: 'ethereum',
        inputSchema: RevokeFeedbackInputSchema,
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      },
      {
        name: 'request_validation',
        description: 'Request on-chain validation for an agent via Validation Registry',
        chain: 'ethereum',
        inputSchema: RequestValidationInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
    ] as const;
  }

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest> {
    switch (actionName) {
      case 'register_agent':
        return this.resolveRegisterAgent(params, context);
      case 'set_agent_wallet':
        return this.resolveSetAgentWallet(params, context);
      case 'unset_agent_wallet':
        return this.resolveUnsetAgentWallet(params);
      case 'set_agent_uri':
        return this.resolveSetAgentUri(params);
      case 'set_metadata':
        return this.resolveSetMetadata(params);
      case 'give_feedback':
        return this.resolveGiveFeedback(params);
      case 'revoke_feedback':
        return this.resolveRevokeFeedback(params);
      case 'request_validation':
        return this.resolveRequestValidation(params);
      default:
        throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
          message: `Unknown ERC-8004 action: ${actionName}`,
        });
    }
  }

  // -------------------------------------------------------------------------
  // Identity Registry resolve methods
  // -------------------------------------------------------------------------

  private resolveRegisterAgent(
    params: Record<string, unknown>,
    context: ActionContext,
  ): ContractCallRequest {
    const input = RegisterAgentInputSchema.parse(params);

    // Build registration file JSON
    buildRegistrationFile({
      name: input.name,
      description: input.description,
      services: input.services,
      baseUrl: this.config.registrationFileBaseUrl,
    });

    // Determine agentURI: registration file endpoint or empty string
    const agentURI = this.config.registrationFileBaseUrl
      ? `${this.config.registrationFileBaseUrl.replace(/\/$/, '')}/v1/erc8004/registration-file/${context.walletId}`
      : '';

    // Choose encoding based on whether metadata is provided
    const calldata = input.metadata
      ? this.client.encodeRegisterWithMetadata(
          agentURI,
          Object.entries(input.metadata).map(([key, value]) => ({ key, value })),
        )
      : this.client.encodeRegister(agentURI);

    return {
      type: 'CONTRACT_CALL',
      to: this.client.getRegistryAddress('identity'),
      calldata,
    };
  }

  /**
   * Phase 321: EIP-712 signature will be provided via ApprovalWorkflow.
   * Current implementation uses a placeholder '0x' signature.
   */
  private resolveSetAgentWallet(
    params: Record<string, unknown>,
    context: ActionContext,
  ): ContractCallRequest {
    const input = SetAgentWalletInputSchema.parse(params);
    const agentId = this.toBigInt(input.agentId);
    const newWallet = context.walletAddress as Hex;
    const deadline = input.deadline
      ? BigInt(input.deadline)
      : BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
    // Placeholder signature — Phase 321 will provide EIP-712 signature via ApprovalWorkflow
    const signature: Hex = '0x';

    const calldata = this.client.encodeSetAgentWallet(agentId, newWallet, deadline, signature);

    return {
      type: 'CONTRACT_CALL',
      to: this.client.getRegistryAddress('identity'),
      calldata,
    };
  }

  private resolveUnsetAgentWallet(params: Record<string, unknown>): ContractCallRequest {
    const input = UnsetAgentWalletInputSchema.parse(params);
    const agentId = this.toBigInt(input.agentId);
    const calldata = this.client.encodeUnsetAgentWallet(agentId);

    return {
      type: 'CONTRACT_CALL',
      to: this.client.getRegistryAddress('identity'),
      calldata,
    };
  }

  private resolveSetAgentUri(params: Record<string, unknown>): ContractCallRequest {
    const input = SetAgentUriInputSchema.parse(params);
    const agentId = this.toBigInt(input.agentId);
    const calldata = this.client.encodeSetAgentURI(agentId, input.uri);

    return {
      type: 'CONTRACT_CALL',
      to: this.client.getRegistryAddress('identity'),
      calldata,
    };
  }

  private resolveSetMetadata(params: Record<string, unknown>): ContractCallRequest {
    const input = SetMetadataInputSchema.parse(params);
    const agentId = this.toBigInt(input.agentId);
    const calldata = this.client.encodeSetMetadata(agentId, input.key, input.value);

    return {
      type: 'CONTRACT_CALL',
      to: this.client.getRegistryAddress('identity'),
      calldata,
    };
  }

  // -------------------------------------------------------------------------
  // Reputation Registry resolve methods
  // -------------------------------------------------------------------------

  private resolveGiveFeedback(params: Record<string, unknown>): ContractCallRequest {
    const input = GiveFeedbackInputSchema.parse(params);
    const agentId = this.toBigInt(input.agentId);
    const value = BigInt(input.value);

    // Generate feedbackHash from feedbackURI or use zero hash
    const feedbackHash: Hex = input.feedbackURI
      ? keccak256(toHex(input.feedbackURI))
      : ('0x' + '0'.repeat(64)) as Hex;

    const calldata = this.client.encodeGiveFeedback(
      agentId,
      value,
      input.valueDecimals,
      input.tag1,
      input.tag2,
      input.endpoint,
      input.feedbackURI,
      feedbackHash,
    );

    return {
      type: 'CONTRACT_CALL',
      to: this.client.getRegistryAddress('reputation'),
      calldata,
    };
  }

  private resolveRevokeFeedback(params: Record<string, unknown>): ContractCallRequest {
    const input = RevokeFeedbackInputSchema.parse(params);
    const agentId = this.toBigInt(input.agentId);
    const feedbackIndex = BigInt(input.feedbackIndex);
    const calldata = this.client.encodeRevokeFeedback(agentId, feedbackIndex);

    return {
      type: 'CONTRACT_CALL',
      to: this.client.getRegistryAddress('reputation'),
      calldata,
    };
  }

  // -------------------------------------------------------------------------
  // Validation Registry resolve methods
  // -------------------------------------------------------------------------

  private resolveRequestValidation(params: Record<string, unknown>): ContractCallRequest {
    const input = RequestValidationInputSchema.parse(params);
    const agentId = this.toBigInt(input.agentId);
    const validatorAddress = input.validatorAddress as Hex;

    // Build requestURI JSON
    const requestURI = JSON.stringify({
      agentId: input.agentId,
      description: input.requestDescription,
      tag: input.tag,
      timestamp: Date.now(),
    });

    const requestHash = keccak256(toHex(requestURI));

    // This throws if validation registry is not configured (feature gate)
    const registryAddress = this.client.getRegistryAddress('validation');

    const calldata = this.client.encodeValidationRequest(
      validatorAddress,
      agentId,
      requestURI,
      requestHash,
    );

    return {
      type: 'CONTRACT_CALL',
      to: registryAddress,
      calldata,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Convert string agentId to BigInt with error handling.
   * @throws ChainError if the string is not a valid numeric value.
   */
  private toBigInt(value: string): bigint {
    try {
      return BigInt(value);
    } catch {
      throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
        message: `Invalid agentId: must be a numeric string, got "${value}"`,
      });
    }
  }
}
