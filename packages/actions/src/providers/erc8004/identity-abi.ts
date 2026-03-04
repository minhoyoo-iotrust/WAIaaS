/**
 * ERC-8004 Identity Registry ABI (as const for viem type inference).
 *
 * Reference: https://github.com/erc-8004/erc-8004-contracts
 * Mainnet: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 *
 * Functions: register (2 overloads), setAgentWallet, unsetAgentWallet,
 * setAgentURI, setMetadata, getAgentWallet, getMetadata, tokenURI.
 * Events: Registered, URIUpdated, MetadataSet.
 */
export const IDENTITY_REGISTRY_ABI = [
  // -------------------------------------------------------------------------
  // Write functions
  // -------------------------------------------------------------------------

  // register(string agentURI) -> uint256 agentId
  {
    type: 'function',
    name: 'register',
    inputs: [{ name: 'agentURI', type: 'string', internalType: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },

  // register(string agentURI, MetadataEntry[] metadata) -> uint256 agentId
  {
    type: 'function',
    name: 'register',
    inputs: [
      { name: 'agentURI', type: 'string', internalType: 'string' },
      {
        name: 'metadata',
        type: 'tuple[]',
        internalType: 'struct MetadataEntry[]',
        components: [
          { name: 'key', type: 'string', internalType: 'string' },
          { name: 'value', type: 'bytes', internalType: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'agentId', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },

  // setAgentWallet(uint256, address, uint256, bytes)
  {
    type: 'function',
    name: 'setAgentWallet',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'newWallet', type: 'address', internalType: 'address' },
      { name: 'deadline', type: 'uint256', internalType: 'uint256' },
      { name: 'signature', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // unsetAgentWallet(uint256)
  {
    type: 'function',
    name: 'unsetAgentWallet',
    inputs: [{ name: 'agentId', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // setAgentURI(uint256, string)
  {
    type: 'function',
    name: 'setAgentURI',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'newURI', type: 'string', internalType: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // setMetadata(uint256, string, bytes)
  {
    type: 'function',
    name: 'setMetadata',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'metadataKey', type: 'string', internalType: 'string' },
      { name: 'metadataValue', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // -------------------------------------------------------------------------
  // Read functions
  // -------------------------------------------------------------------------

  // getAgentWallet(uint256) -> address
  {
    type: 'function',
    name: 'getAgentWallet',
    inputs: [{ name: 'agentId', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },

  // getMetadata(uint256, string) -> bytes
  {
    type: 'function',
    name: 'getMetadata',
    inputs: [
      { name: 'agentId', type: 'uint256', internalType: 'uint256' },
      { name: 'metadataKey', type: 'string', internalType: 'string' },
    ],
    outputs: [{ name: '', type: 'bytes', internalType: 'bytes' }],
    stateMutability: 'view',
  },

  // tokenURI(uint256) -> string (ERC-721 standard)
  {
    type: 'function',
    name: 'tokenURI',
    inputs: [{ name: 'tokenId', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'string', internalType: 'string' }],
    stateMutability: 'view',
  },

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  {
    type: 'event',
    name: 'Registered',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'agentURI', type: 'string', indexed: false, internalType: 'string' },
      { name: 'owner', type: 'address', indexed: true, internalType: 'address' },
    ],
  },

  {
    type: 'event',
    name: 'URIUpdated',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'newURI', type: 'string', indexed: false, internalType: 'string' },
      { name: 'updatedBy', type: 'address', indexed: true, internalType: 'address' },
    ],
  },

  {
    type: 'event',
    name: 'MetadataSet',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'metadataKey', type: 'string', indexed: true, internalType: 'string' },
      { name: 'metadataValue', type: 'bytes', indexed: false, internalType: 'bytes' },
    ],
  },
] as const;
