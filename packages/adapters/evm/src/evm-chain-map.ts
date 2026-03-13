import type { Chain } from 'viem';
import {
  mainnet, sepolia,
  polygon, polygonAmoy,
  arbitrum, arbitrumSepolia,
  optimism, optimismSepolia,
  base, baseSepolia,
  hyperEvm, hyperliquidEvmTestnet,
} from 'viem/chains';
import type { EvmNetworkType } from '@waiaas/core';

// Re-export EvmNetworkType for downstream consumers (avoids importing @waiaas/core directly)

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
  'hyperevm-mainnet': { viemChain: hyperEvm, chainId: 999, nativeSymbol: 'HYPE', nativeName: 'HYPE' },
  'hyperevm-testnet': { viemChain: hyperliquidEvmTestnet, chainId: 998, nativeSymbol: 'HYPE', nativeName: 'HYPE' },
};

// ---------------------------------------------------------------------------
// v31.14: Reverse lookup -- chainId (number) -> EvmNetworkType slug
// ---------------------------------------------------------------------------

/** Reverse lookup: EVM chainId (number) -> WAIaaS EvmNetworkType slug. */
export const EVM_CHAIN_ID_TO_NETWORK: ReadonlyMap<number, EvmNetworkType> = new Map(
  (Object.entries(EVM_CHAIN_MAP) as [EvmNetworkType, EvmChainEntry][])
    .map(([network, entry]) => [entry.chainId, network]),
);

/**
 * Resolve EvmNetworkType from EVM chainId number.
 * @returns EvmNetworkType slug or undefined if chainId is not registered.
 */
export function getNetworkByChainId(chainId: number): EvmNetworkType | undefined {
  return EVM_CHAIN_ID_TO_NETWORK.get(chainId);
}
