import type { Chain } from 'viem';
import {
  mainnet, sepolia,
  polygon, polygonAmoy,
  arbitrum, arbitrumSepolia,
  optimism, optimismSepolia,
  base, baseSepolia,
} from 'viem/chains';
import type { EvmNetworkType } from '@waiaas/core';

export interface EvmChainEntry {
  viemChain: Chain;
  chainId: number;
  nativeSymbol: string;
  nativeName: string;
}

export const EVM_CHAIN_MAP: Record<EvmNetworkType, EvmChainEntry> = {
  'ethereum-mainnet': { viemChain: mainnet, chainId: 1, nativeSymbol: 'ETH', nativeName: 'Ether' },
  'ethereum-sepolia': { viemChain: sepolia, chainId: 11155111, nativeSymbol: 'ETH', nativeName: 'Ether' },
  'polygon-mainnet': { viemChain: polygon, chainId: 137, nativeSymbol: 'POL', nativeName: 'POL' },
  'polygon-amoy': { viemChain: polygonAmoy, chainId: 80002, nativeSymbol: 'POL', nativeName: 'POL' },
  'arbitrum-mainnet': { viemChain: arbitrum, chainId: 42161, nativeSymbol: 'ETH', nativeName: 'Ether' },
  'arbitrum-sepolia': { viemChain: arbitrumSepolia, chainId: 421614, nativeSymbol: 'ETH', nativeName: 'Ether' },
  'optimism-mainnet': { viemChain: optimism, chainId: 10, nativeSymbol: 'ETH', nativeName: 'Ether' },
  'optimism-sepolia': { viemChain: optimismSepolia, chainId: 11155420, nativeSymbol: 'ETH', nativeName: 'Ether' },
  'base-mainnet': { viemChain: base, chainId: 8453, nativeSymbol: 'ETH', nativeName: 'Ether' },
  'base-sepolia': { viemChain: baseSepolia, chainId: 84532, nativeSymbol: 'ETH', nativeName: 'Ether' },
};
