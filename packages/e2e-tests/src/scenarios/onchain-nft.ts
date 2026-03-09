/**
 * E2E Scenario registration: NFT Transfer (ERC-721 / ERC-1155).
 *
 * Registers 2 onchain scenarios for NFT self-transfer on Sepolia.
 * Tests skip gracefully if wallet owns no NFTs.
 *
 * @see ONCH-09
 */

import { registry } from '../types.js';

registry.register({
  id: 'nft-erc721-transfer',
  name: 'NFT ERC-721 Transfer',
  track: 'onchain',
  category: 'nft',
  networks: ['ethereum-sepolia'],
  protocols: ['nft'],
  description:
    'Self-transfer an ERC-721 NFT on Sepolia, verify txHash and CONFIRMED status. Skips if no NFT owned.',
});

registry.register({
  id: 'nft-erc1155-transfer',
  name: 'NFT ERC-1155 Transfer',
  track: 'onchain',
  category: 'nft',
  networks: ['ethereum-sepolia'],
  protocols: ['nft'],
  description:
    'Self-transfer an ERC-1155 NFT on Sepolia, verify txHash and CONFIRMED status. Skips if no NFT owned.',
});
