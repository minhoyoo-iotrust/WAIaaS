/** ERC-165 interface detection ABI. */
export const ERC165_ABI = [
  {
    type: 'function',
    name: 'supportsInterface',
    inputs: [{ name: 'interfaceId', type: 'bytes4' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

/** Well-known ERC interface IDs. */
export const ERC_INTERFACE_IDS = {
  ERC721: '0x80ac58cd',
  ERC1155: '0xd9b67a26',
  ERC165: '0x01ffc9a7',
} as const;
