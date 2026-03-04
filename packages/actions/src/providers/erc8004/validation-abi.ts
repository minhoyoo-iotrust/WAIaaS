/**
 * ERC-8004 Validation Registry ABI (as const for viem type inference).
 *
 * Reference: https://github.com/erc-8004/erc-8004-contracts
 * NOTE: Validation Registry is NOT yet deployed to mainnet (feature-gated).
 *
 * Functions: validationRequest, validationResponse, getValidationStatus,
 * getSummary, getAgentValidations.
 * Events: ValidationRequest, ValidationResponse.
 */
export const VALIDATION_REGISTRY_ABI = [
  // -------------------------------------------------------------------------
  // Write functions
  // -------------------------------------------------------------------------

  // validationRequest(address, uint256, string, bytes32)
  {
    type: 'function',
    name: 'validationRequest',
    inputs: [
      { name: 'validatorAddress', type: 'address', internalType: 'address' },
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'requestURI', type: 'string', internalType: 'string' },
      { name: 'requestHash', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // validationResponse(bytes32, uint8, string, bytes32, string) -- called by validator
  {
    type: 'function',
    name: 'validationResponse',
    inputs: [
      { name: 'requestHash', type: 'bytes32', internalType: 'bytes32' },
      { name: 'response', type: 'uint8', internalType: 'uint8' },
      { name: 'responseURI', type: 'string', internalType: 'string' },
      { name: 'responseHash', type: 'bytes32', internalType: 'bytes32' },
      { name: 'tag', type: 'string', internalType: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // -------------------------------------------------------------------------
  // Read functions
  // -------------------------------------------------------------------------

  // getValidationStatus(bytes32) -> (address, uint256, uint8, bytes32, string, uint256)
  {
    type: 'function',
    name: 'getValidationStatus',
    inputs: [{ name: 'requestHash', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [
      { name: 'validatorAddress', type: 'address', internalType: 'address' },
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'response', type: 'uint8', internalType: 'uint8' },
      { name: 'responseHash', type: 'bytes32', internalType: 'bytes32' },
      { name: 'tag', type: 'string', internalType: 'string' },
      { name: 'lastUpdate', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },

  // getSummary(uint256, address[], string) -> (uint64, uint8)
  {
    type: 'function',
    name: 'getSummary',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'validatorAddresses', type: 'address[]', internalType: 'address[]' },
      { name: 'tag', type: 'string', internalType: 'string' },
    ],
    outputs: [
      { name: 'count', type: 'uint64', internalType: 'uint64' },
      { name: 'averageResponse', type: 'uint8', internalType: 'uint8' },
    ],
    stateMutability: 'view',
  },

  // getAgentValidations(uint256) -> bytes32[]
  {
    type: 'function',
    name: 'getAgentValidations',
    inputs: [{ name: 'agentId', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: 'requestHashes', type: 'bytes32[]', internalType: 'bytes32[]' }],
    stateMutability: 'view',
  },

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  {
    type: 'event',
    name: 'ValidationRequest',
    inputs: [
      { name: 'validatorAddress', type: 'address', indexed: true, internalType: 'address' },
      { name: 'agentId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'requestURI', type: 'string', indexed: false, internalType: 'string' },
      { name: 'requestHash', type: 'bytes32', indexed: true, internalType: 'bytes32' },
    ],
  },

  {
    type: 'event',
    name: 'ValidationResponse',
    inputs: [
      { name: 'validatorAddress', type: 'address', indexed: true, internalType: 'address' },
      { name: 'agentId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'requestHash', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'response', type: 'uint8', indexed: false, internalType: 'uint8' },
      { name: 'responseURI', type: 'string', indexed: false, internalType: 'string' },
      { name: 'responseHash', type: 'bytes32', indexed: false, internalType: 'bytes32' },
      { name: 'tag', type: 'string', indexed: false, internalType: 'string' },
    ],
  },
] as const;
