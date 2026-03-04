/**
 * ERC-8004 Reputation Registry ABI (as const for viem type inference).
 *
 * Reference: https://github.com/erc-8004/erc-8004-contracts
 * Mainnet: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
 *
 * Functions: giveFeedback, revokeFeedback, getSummary, readAllFeedback,
 * getClients, getLastIndex.
 * Events: NewFeedback, FeedbackRevoked.
 */
export const REPUTATION_REGISTRY_ABI = [
  // -------------------------------------------------------------------------
  // Write functions
  // -------------------------------------------------------------------------

  // giveFeedback(uint256, int128, uint8, string, string, string, string, bytes32)
  {
    type: 'function',
    name: 'giveFeedback',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'value', type: 'int128', internalType: 'int128' },
      { name: 'valueDecimals', type: 'uint8', internalType: 'uint8' },
      { name: 'tag1', type: 'string', internalType: 'string' },
      { name: 'tag2', type: 'string', internalType: 'string' },
      { name: 'endpoint', type: 'string', internalType: 'string' },
      { name: 'feedbackURI', type: 'string', internalType: 'string' },
      { name: 'feedbackHash', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // revokeFeedback(uint256, uint64)
  {
    type: 'function',
    name: 'revokeFeedback',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'feedbackIndex', type: 'uint64', internalType: 'uint64' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // -------------------------------------------------------------------------
  // Read functions
  // -------------------------------------------------------------------------

  // getSummary(uint256, address[], string, string) -> (uint64, int128, uint8)
  {
    type: 'function',
    name: 'getSummary',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'clientAddresses', type: 'address[]', internalType: 'address[]' },
      { name: 'tag1', type: 'string', internalType: 'string' },
      { name: 'tag2', type: 'string', internalType: 'string' },
    ],
    outputs: [
      { name: 'count', type: 'uint64', internalType: 'uint64' },
      { name: 'summaryValue', type: 'int128', internalType: 'int128' },
      { name: 'summaryValueDecimals', type: 'uint8', internalType: 'uint8' },
    ],
    stateMutability: 'view',
  },

  // readAllFeedback(uint256, address[], string, string, bool)
  //   -> (address[], uint64[], int128[], uint8[], string[], string[], bool[])
  {
    type: 'function',
    name: 'readAllFeedback',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'clientAddresses', type: 'address[]', internalType: 'address[]' },
      { name: 'tag1', type: 'string', internalType: 'string' },
      { name: 'tag2', type: 'string', internalType: 'string' },
      { name: 'includeRevoked', type: 'bool', internalType: 'bool' },
    ],
    outputs: [
      { name: 'clients', type: 'address[]', internalType: 'address[]' },
      { name: 'feedbackIndexes', type: 'uint64[]', internalType: 'uint64[]' },
      { name: 'values', type: 'int128[]', internalType: 'int128[]' },
      { name: 'valueDecimals', type: 'uint8[]', internalType: 'uint8[]' },
      { name: 'tag1s', type: 'string[]', internalType: 'string[]' },
      { name: 'tag2s', type: 'string[]', internalType: 'string[]' },
      { name: 'revokedStatuses', type: 'bool[]', internalType: 'bool[]' },
    ],
    stateMutability: 'view',
  },

  // getClients(uint256) -> address[]
  {
    type: 'function',
    name: 'getClients',
    inputs: [{ name: 'agentId', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'address[]', internalType: 'address[]' }],
    stateMutability: 'view',
  },

  // getLastIndex(uint256, address) -> uint64
  {
    type: 'function',
    name: 'getLastIndex',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'clientAddress', type: 'address', internalType: 'address' },
    ],
    outputs: [{ name: '', type: 'uint64', internalType: 'uint64' }],
    stateMutability: 'view',
  },

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  {
    type: 'event',
    name: 'NewFeedback',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'clientAddress', type: 'address', indexed: true, internalType: 'address' },
      { name: 'feedbackIndex', type: 'uint64', indexed: false, internalType: 'uint64' },
      { name: 'value', type: 'int128', indexed: false, internalType: 'int128' },
      { name: 'valueDecimals', type: 'uint8', indexed: false, internalType: 'uint8' },
      { name: 'indexedTag1', type: 'string', indexed: true, internalType: 'string' },
      { name: 'tag2', type: 'string', indexed: false, internalType: 'string' },
      { name: 'endpoint', type: 'string', indexed: false, internalType: 'string' },
      { name: 'feedbackURI', type: 'string', indexed: false, internalType: 'string' },
      { name: 'feedbackHash', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
  },

  {
    type: 'event',
    name: 'FeedbackRevoked',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'clientAddress', type: 'address', indexed: true, internalType: 'address' },
      { name: 'feedbackIndex', type: 'uint64', indexed: true, internalType: 'uint64' },
    ],
  },
] as const;
