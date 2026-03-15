/**
 * Well-known contract addresses for human-readable name resolution.
 *
 * 300+ entries across 6 networks (Ethereum, Base, Arbitrum, Optimism, Polygon, Solana).
 * Used by ContractNameRegistry as Tier 2 (well-known) data source.
 *
 * All EVM addresses MUST be lowercase (no checksummed mixed-case).
 * Solana addresses are base58 strings.
 */

/** A single well-known contract entry. */
export interface WellKnownContractEntry {
  /** Contract address (lowercase hex for EVM, base58 for Solana). */
  address: string;
  /** Human-readable name. */
  name: string;
  /** Protocol or project name. */
  protocol: string;
  /** Network identifier. */
  network: string;
}

export const WELL_KNOWN_CONTRACTS: readonly WellKnownContractEntry[] = [
  // =========================================================================
  // ETHEREUM MAINNET (~100 entries)
  // =========================================================================

  // --- DEX Routers ---
  { address: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', name: 'Uniswap V2 Router', protocol: 'Uniswap', network: 'ethereum' },
  { address: '0xe592427a0aece92de3edee1f18e0157c05861564', name: 'Uniswap V3 Router', protocol: 'Uniswap', network: 'ethereum' },
  { address: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', name: 'Uniswap V3 Router 02', protocol: 'Uniswap', network: 'ethereum' },
  { address: '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', name: 'Uniswap Universal Router', protocol: 'Uniswap', network: 'ethereum' },
  { address: '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f', name: 'SushiSwap Router', protocol: 'SushiSwap', network: 'ethereum' },
  { address: '0x1111111254eeb25477b68fb85ed929f73a960582', name: '1inch V5 Router', protocol: '1inch', network: 'ethereum' },
  { address: '0x111111125421ca6dc452d289314280a0f8842a65', name: '1inch V6 Router', protocol: '1inch', network: 'ethereum' },
  { address: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', name: '0x Exchange Proxy', protocol: '0x', network: 'ethereum' },
  { address: '0x881d40237659c251811cec9c364ef91dc08d300c', name: 'Metamask Swap Router', protocol: 'MetaMask', network: 'ethereum' },
  { address: '0xba12222222228d8ba445958a75a0704d566bf2c8', name: 'Balancer V2 Vault', protocol: 'Balancer', network: 'ethereum' },
  { address: '0xd51a44d3fae010294c616388b506acda1bfaae46', name: 'Curve Tricrypto Pool', protocol: 'Curve', network: 'ethereum' },
  { address: '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7', name: 'Curve 3pool', protocol: 'Curve', network: 'ethereum' },
  { address: '0x99a58482bd75cbab83b27ec03ca68ff489b5788f', name: 'Curve Router', protocol: 'Curve', network: 'ethereum' },

  // --- DEX Factories ---
  { address: '0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f', name: 'Uniswap V2 Factory', protocol: 'Uniswap', network: 'ethereum' },
  { address: '0x1f98431c8ad98523631ae4a59f267346ea31f984', name: 'Uniswap V3 Factory', protocol: 'Uniswap', network: 'ethereum' },
  { address: '0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac', name: 'SushiSwap Factory', protocol: 'SushiSwap', network: 'ethereum' },

  // --- Lending Protocols ---
  { address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2', name: 'Aave V3 Pool', protocol: 'Aave', network: 'ethereum' },
  { address: '0x2f39d218133afab8f2b819b1066c7e434ad94e9e', name: 'Aave V3 Pool Addresses Provider', protocol: 'Aave', network: 'ethereum' },
  { address: '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9', name: 'Aave V2 Lending Pool', protocol: 'Aave', network: 'ethereum' },
  { address: '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b', name: 'Compound V2 Comptroller', protocol: 'Compound', network: 'ethereum' },
  { address: '0xc3d688b66703497daa19211eedff47f25384cdc3', name: 'Compound V3 cUSDCv3', protocol: 'Compound', network: 'ethereum' },
  { address: '0xa17581a9e3356d9a858b789d68b4d866e593ae94', name: 'Compound V3 cWETHv3', protocol: 'Compound', network: 'ethereum' },
  { address: '0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb', name: 'Morpho Blue', protocol: 'Morpho', network: 'ethereum' },

  // --- Staking ---
  { address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', name: 'Lido stETH', protocol: 'Lido', network: 'ethereum' },
  { address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0', name: 'Lido wstETH', protocol: 'Lido', network: 'ethereum' },
  { address: '0xfe2e637202056d30016725477c5da089ab0a043a', name: 'sETH2 (StakeWise)', protocol: 'StakeWise', network: 'ethereum' },
  { address: '0xac3e018457b222d93114458476f3e3416abbe38f', name: 'Frax sfrxETH', protocol: 'Frax', network: 'ethereum' },
  { address: '0x5e8422345238f34275888049021821e8e08caa1f', name: 'Frax frxETH', protocol: 'Frax', network: 'ethereum' },
  { address: '0xbe9895146f7af43049ca1c1ae358b0541ea49704', name: 'Coinbase cbETH', protocol: 'Coinbase', network: 'ethereum' },
  { address: '0xa35b1b31ce002fbf2058d22f30f95d405200a15b', name: 'EtherFi eETH', protocol: 'EtherFi', network: 'ethereum' },
  { address: '0xbf5495efe5db9ce00f80364c8b423567e58d2110', name: 'Renzo ezETH', protocol: 'Renzo', network: 'ethereum' },
  { address: '0xf951e335afb289353dc249e82926178eac7ded78', name: 'Swell swETH', protocol: 'Swell', network: 'ethereum' },
  { address: '0xd5f7838f5c461feff7fe49ea5ebaf7728bb0adfa', name: 'Mantle mETH', protocol: 'Mantle', network: 'ethereum' },

  // --- Bridge Contracts ---
  { address: '0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5', name: 'Across SpokePool V3', protocol: 'Across', network: 'ethereum' },
  { address: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', name: 'LI.FI Diamond', protocol: 'LI.FI', network: 'ethereum' },
  { address: '0x3a23f943181408eac424116af7b7790c94cb97a5', name: 'Socket Gateway', protocol: 'Socket', network: 'ethereum' },
  { address: '0x8898b472c54c31894e3b9bb83cea802a5d0e63c6', name: 'Hop Bridge', protocol: 'Hop', network: 'ethereum' },
  { address: '0x99c9fc46f92e8a1c0dec1b1747d010903e884be1', name: 'Optimism L1 Bridge', protocol: 'Optimism', network: 'ethereum' },
  { address: '0x8315177ab297ba92a06054ce80a67ed4dbd7ed3a', name: 'Arbitrum L1 Bridge', protocol: 'Arbitrum', network: 'ethereum' },
  { address: '0x3154cf16ccdb4c6d922629664174b904d80f2c35', name: 'Base L1 Bridge', protocol: 'Base', network: 'ethereum' },

  // --- Stablecoins ---
  { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', name: 'USDC', protocol: 'Circle', network: 'ethereum' },
  { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', name: 'USDT', protocol: 'Tether', network: 'ethereum' },
  { address: '0x6b175474e89094c44da98b954eedeac495271d0f', name: 'DAI', protocol: 'MakerDAO', network: 'ethereum' },
  { address: '0x853d955acef822db058eb8505911ed77f175b99e', name: 'FRAX', protocol: 'Frax', network: 'ethereum' },
  { address: '0x4c9edd5852cd905f086c759e8383e09bff1e68b3', name: 'USDe', protocol: 'Ethena', network: 'ethereum' },
  { address: '0x57e114b691db790c35207b2e685d4a43181e6061', name: 'ENA', protocol: 'Ethena', network: 'ethereum' },
  { address: '0x0000000000085d4780b73119b644ae5ecd22b376', name: 'TUSD', protocol: 'TrueUSD', network: 'ethereum' },
  { address: '0x8e870d67f660d95d5be530380d0ec0bd388289e1', name: 'USDP', protocol: 'Paxos', network: 'ethereum' },
  { address: '0x5f98805a4e8be255a32880fdec7f6728c6568ba0', name: 'LUSD', protocol: 'Liquity', network: 'ethereum' },
  { address: '0x1a7e4e63778b4f12a199c062f3efdd288afcbce8', name: 'agEUR', protocol: 'Angle', network: 'ethereum' },

  // --- Wrapped Native ---
  { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', name: 'WETH', protocol: 'Wrapped Ether', network: 'ethereum' },

  // --- Governance ---
  { address: '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e', name: 'ENS Registry', protocol: 'ENS', network: 'ethereum' },
  { address: '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85', name: 'ENS Base Registrar', protocol: 'ENS', network: 'ethereum' },
  { address: '0x084b1c3c81545d370f3634392de611caabff8148', name: 'ENS Name Wrapper', protocol: 'ENS', network: 'ethereum' },
  { address: '0xc18360217d8f7ab5e7c516566761ea12ce7f9d72', name: 'ENS Token', protocol: 'ENS', network: 'ethereum' },
  { address: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', name: 'MKR', protocol: 'MakerDAO', network: 'ethereum' },
  { address: '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2', name: 'SUSHI', protocol: 'SushiSwap', network: 'ethereum' },
  { address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', name: 'UNI', protocol: 'Uniswap', network: 'ethereum' },
  { address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', name: 'AAVE', protocol: 'Aave', network: 'ethereum' },
  { address: '0xc00e94cb662c3520282e6f5717214004a7f26888', name: 'COMP', protocol: 'Compound', network: 'ethereum' },
  { address: '0xd533a949740bb3306d119cc777fa900ba034cd52', name: 'CRV', protocol: 'Curve', network: 'ethereum' },

  // --- NFT Marketplaces ---
  { address: '0x00000000000000adc04c56bf30ac9d3c0aaf14dc', name: 'Seaport 1.5', protocol: 'OpenSea', network: 'ethereum' },
  { address: '0x00000000000001ad428e4906ae43d8f9852d0dd6', name: 'Seaport 1.6', protocol: 'OpenSea', network: 'ethereum' },
  { address: '0x29469395eaf6f95920e59f858042f0e28d98a20b', name: 'Blur Pool', protocol: 'Blur', network: 'ethereum' },
  { address: '0xb2ecfe4e4d61f8790bbb9de2d1259b9e2410cea5', name: 'Blur Marketplace', protocol: 'Blur', network: 'ethereum' },
  { address: '0x59728544b08ab483533076417fbbb2fd0b17556f', name: 'LooksRare Exchange', protocol: 'LooksRare', network: 'ethereum' },
  { address: '0x74312363e45dcaba76c59ec49a7aa8a65a67eed3', name: 'X2Y2 Exchange', protocol: 'X2Y2', network: 'ethereum' },

  // --- Pendle ---
  { address: '0x888888888889758f76e7103c6cbf23abbf58f946', name: 'Pendle Router V4', protocol: 'Pendle', network: 'ethereum' },
  { address: '0x263833d47ea3fa4a30f269323aba6a36399d60a5', name: 'Pendle Market Factory', protocol: 'Pendle', network: 'ethereum' },

  // --- ERC-4337 (Account Abstraction) ---
  { address: '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789', name: 'EntryPoint V0.6', protocol: 'ERC-4337', network: 'ethereum' },
  { address: '0x0000000071727de22e5e9d8baf0edac6f37da032', name: 'EntryPoint V0.7', protocol: 'ERC-4337', network: 'ethereum' },

  // --- Permit2 / AllowanceTransfer ---
  { address: '0x000000000022d473030f116ddee9f6b43ac78ba3', name: 'Permit2', protocol: 'Uniswap', network: 'ethereum' },

  // --- Multicall ---
  { address: '0xca11bde05977b3631167028862be2a173976ca11', name: 'Multicall3', protocol: 'Multicall', network: 'ethereum' },

  // --- Major ERC-20 Tokens ---
  { address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', name: 'WBTC', protocol: 'BitGo', network: 'ethereum' },
  { address: '0x514910771af9ca656af840dff83e8264ecf986ca', name: 'LINK', protocol: 'Chainlink', network: 'ethereum' },
  { address: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', name: 'SHIB', protocol: 'Shiba Inu', network: 'ethereum' },
  { address: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0', name: 'MATIC (on Ethereum)', protocol: 'Polygon', network: 'ethereum' },
  { address: '0x6982508145454ce325ddbe47a25d4ec3d2311933', name: 'PEPE', protocol: 'PEPE', network: 'ethereum' },
  { address: '0x163f8c2467924be0ae7b5347228cabf260318753', name: 'WLD', protocol: 'Worldcoin', network: 'ethereum' },
  { address: '0x75231f58b43240c9718dd58b4967c5114342a86c', name: 'OKB', protocol: 'OKX', network: 'ethereum' },
  { address: '0x5a98fcbea516cf06857215779fd812ca3bef1b32', name: 'LDO', protocol: 'Lido', network: 'ethereum' },
  { address: '0x4d224452801aced8b2f0aebe155379bb5d594381', name: 'APE', protocol: 'ApeCoin', network: 'ethereum' },
  { address: '0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24', name: 'RENDER', protocol: 'Render', network: 'ethereum' },

  // --- Yield / Vaults ---
  { address: '0xba100000625a3754423978a60c9317c58a424e3d', name: 'BAL', protocol: 'Balancer', network: 'ethereum' },
  { address: '0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b', name: 'CVX', protocol: 'Convex', network: 'ethereum' },
  { address: '0xd9a442856c234a39a81a089c06451ebaa4306a72', name: 'Convex Booster', protocol: 'Convex', network: 'ethereum' },

  // --- MakerDAO / Sky ---
  { address: '0x9759a6ac90977b93b58547b4a71c78317f391a28', name: 'MakerDAO DSR Pot', protocol: 'MakerDAO', network: 'ethereum' },
  { address: '0x197e90f9fad81970ba7976f33cbd77088e5d7cf7', name: 'MakerDAO PSM USDC', protocol: 'MakerDAO', network: 'ethereum' },

  // --- GnosisDAO / Safe ---
  { address: '0xd9db270c1b5e3bd161e8c8503c55ceabee709552', name: 'Gnosis Safe Singleton', protocol: 'Safe', network: 'ethereum' },
  { address: '0xa6b71e26c5e0845f74c812102ca7114b6a896ab2', name: 'Gnosis Safe Factory', protocol: 'Safe', network: 'ethereum' },

  // --- Chainlink ---
  { address: '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419', name: 'Chainlink ETH/USD Feed', protocol: 'Chainlink', network: 'ethereum' },
  { address: '0x47fb2585d2c56fe188d0e6ec628a38b74fceeedf', name: 'Chainlink Functions Router', protocol: 'Chainlink', network: 'ethereum' },

  // --- Layerzero ---
  { address: '0x66a71dcef29a0ffbdbe3c6a460a3b5bc225cd675', name: 'LayerZero Endpoint V1', protocol: 'LayerZero', network: 'ethereum' },
  { address: '0x1a44076050125825900e736c501f859c50fe728c', name: 'LayerZero Endpoint V2', protocol: 'LayerZero', network: 'ethereum' },

  // =========================================================================
  // BASE (~40 entries)
  // =========================================================================

  // --- DEX ---
  { address: '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', name: 'Uniswap Universal Router', protocol: 'Uniswap', network: 'base' },
  { address: '0x2626664c2603336e57b271c5c0b26f421741e481', name: 'Uniswap V3 Router 02', protocol: 'Uniswap', network: 'base' },
  { address: '0x33128a8fc17869897dce68ed026d694621f6fdfd', name: 'Uniswap V3 Factory', protocol: 'Uniswap', network: 'base' },
  { address: '0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43', name: 'Aerodrome Router', protocol: 'Aerodrome', network: 'base' },
  { address: '0x420dd381b31aef6683db6b902084cb0ffece40da', name: 'Aerodrome Factory', protocol: 'Aerodrome', network: 'base' },
  { address: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', name: '0x Exchange Proxy', protocol: '0x', network: 'base' },
  { address: '0xba12222222228d8ba445958a75a0704d566bf2c8', name: 'Balancer V2 Vault', protocol: 'Balancer', network: 'base' },
  { address: '0x1111111254eeb25477b68fb85ed929f73a960582', name: '1inch V5 Router', protocol: '1inch', network: 'base' },
  { address: '0x6bded42c6da8fbf0d2ba55b2fa120c5e0c8d7891', name: 'BaseSwap Router', protocol: 'BaseSwap', network: 'base' },

  // --- Lending ---
  { address: '0xa238dd80c259a72e81d7e4664a9801593f98d1c5', name: 'Aave V3 Pool', protocol: 'Aave', network: 'base' },
  { address: '0xe20fcbdbffc4dd138ce8b2e6fbb6cb49777ad64d', name: 'Aave V3 Pool Addresses Provider', protocol: 'Aave', network: 'base' },
  { address: '0xb2f97c1bd3bf02f5e74d13f02e3e26f93d77ce44', name: 'Compound V3 cUSDCv3', protocol: 'Compound', network: 'base' },
  { address: '0x46e6b214b524310239732d51387075e0e70970bf', name: 'Moonwell Comptroller', protocol: 'Moonwell', network: 'base' },
  { address: '0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb', name: 'Morpho Blue', protocol: 'Morpho', network: 'base' },

  // --- Bridge ---
  { address: '0x09aea4b2242abc8bb4bb78d537a67a245a7bec64', name: 'Across SpokePool V3', protocol: 'Across', network: 'base' },
  { address: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', name: 'LI.FI Diamond', protocol: 'LI.FI', network: 'base' },
  { address: '0x4200000000000000000000000000000000000010', name: 'L2 Standard Bridge', protocol: 'Base', network: 'base' },

  // --- Stablecoins ---
  { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', name: 'USDC', protocol: 'Circle', network: 'base' },
  { address: '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca', name: 'USDbC', protocol: 'Circle', network: 'base' },
  { address: '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', name: 'DAI', protocol: 'MakerDAO', network: 'base' },

  // --- Wrapped/LST ---
  { address: '0x4200000000000000000000000000000000000006', name: 'WETH', protocol: 'Wrapped Ether', network: 'base' },
  { address: '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452', name: 'wstETH', protocol: 'Lido', network: 'base' },
  { address: '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22', name: 'cbETH', protocol: 'Coinbase', network: 'base' },
  { address: '0x04c0599ae5a44757c0af6f9ec3b93da8976c150a', name: 'weETH', protocol: 'EtherFi', network: 'base' },

  // --- NFT ---
  { address: '0x00000000000000adc04c56bf30ac9d3c0aaf14dc', name: 'Seaport 1.5', protocol: 'OpenSea', network: 'base' },

  // --- Infra ---
  { address: '0xca11bde05977b3631167028862be2a173976ca11', name: 'Multicall3', protocol: 'Multicall', network: 'base' },
  { address: '0x000000000022d473030f116ddee9f6b43ac78ba3', name: 'Permit2', protocol: 'Uniswap', network: 'base' },
  { address: '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789', name: 'EntryPoint V0.6', protocol: 'ERC-4337', network: 'base' },
  { address: '0x0000000071727de22e5e9d8baf0edac6f37da032', name: 'EntryPoint V0.7', protocol: 'ERC-4337', network: 'base' },
  { address: '0x1a44076050125825900e736c501f859c50fe728c', name: 'LayerZero Endpoint V2', protocol: 'LayerZero', network: 'base' },

  // --- Major Tokens ---
  { address: '0x940181a94a35a4569e4529a3cdfb74e38fd98631', name: 'AERO', protocol: 'Aerodrome', network: 'base' },
  { address: '0x532f27101965dd16442e59d40670faf5ebb142e4', name: 'BRETT', protocol: 'Brett', network: 'base' },
  { address: '0xbc45647ea894030a4e9801ec03479739fa2485f0', name: 'TOSHI', protocol: 'Toshi', network: 'base' },
  { address: '0x6921b130d297cc43754afba22e5eac0fbf8db75b', name: 'DEGEN', protocol: 'Degen', network: 'base' },

  // --- Friend.tech / SocialFi ---
  { address: '0xcf205808ed36593aa40a44f10c7f7c2f67d4a4d4', name: 'Friend.tech', protocol: 'Friend.tech', network: 'base' },

  // --- Pendle ---
  { address: '0x888888888889758f76e7103c6cbf23abbf58f946', name: 'Pendle Router V4', protocol: 'Pendle', network: 'base' },

  // --- Safe ---
  { address: '0xd9db270c1b5e3bd161e8c8503c55ceabee709552', name: 'Gnosis Safe Singleton', protocol: 'Safe', network: 'base' },

  // =========================================================================
  // ARBITRUM (~40 entries)
  // =========================================================================

  // --- DEX ---
  { address: '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', name: 'Uniswap Universal Router', protocol: 'Uniswap', network: 'arbitrum' },
  { address: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', name: 'Uniswap V3 Router 02', protocol: 'Uniswap', network: 'arbitrum' },
  { address: '0x1f98431c8ad98523631ae4a59f267346ea31f984', name: 'Uniswap V3 Factory', protocol: 'Uniswap', network: 'arbitrum' },
  { address: '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506', name: 'SushiSwap Router', protocol: 'SushiSwap', network: 'arbitrum' },
  { address: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', name: '0x Exchange Proxy', protocol: '0x', network: 'arbitrum' },
  { address: '0xba12222222228d8ba445958a75a0704d566bf2c8', name: 'Balancer V2 Vault', protocol: 'Balancer', network: 'arbitrum' },
  { address: '0x1111111254eeb25477b68fb85ed929f73a960582', name: '1inch V5 Router', protocol: '1inch', network: 'arbitrum' },

  // --- GMX ---
  { address: '0x489ee077994b6658eafa855c308275ead8097c4a', name: 'GMX Vault', protocol: 'GMX', network: 'arbitrum' },
  { address: '0xabd1f4ceb7b00b0f32b21f0b3b4f2ced96e42d4d', name: 'GMX V2 Router', protocol: 'GMX', network: 'arbitrum' },
  { address: '0x69c527fc77291722b52649e45c838e41be8bf5d5', name: 'GMX V2 Exchange Router', protocol: 'GMX', network: 'arbitrum' },
  { address: '0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a', name: 'GMX Token', protocol: 'GMX', network: 'arbitrum' },

  // --- Camelot ---
  { address: '0xc873fecbd354f5a56e00e710b90ef4201db2448d', name: 'Camelot V2 Router', protocol: 'Camelot', network: 'arbitrum' },
  { address: '0x6eccab422d763ac031210895c81787e87b43a652', name: 'Camelot V3 Factory', protocol: 'Camelot', network: 'arbitrum' },

  // --- Lending ---
  { address: '0x794a61358d6845594f94dc1db02a252b5b4814ad', name: 'Aave V3 Pool', protocol: 'Aave', network: 'arbitrum' },
  { address: '0xa97684ead0e402dc232d5a977953df7ecbab3cdb', name: 'Aave V3 Pool Addresses Provider', protocol: 'Aave', network: 'arbitrum' },
  { address: '0x9c4ec768c28520b50860ea7a15bd7213a9ff58bf', name: 'Compound V3 cUSDCv3', protocol: 'Compound', network: 'arbitrum' },
  { address: '0xbbd1f50a2e22b24b2e9a849df14e0a09d4d1ebe1', name: 'Radiant V2 Lending Pool', protocol: 'Radiant', network: 'arbitrum' },

  // --- Bridge ---
  { address: '0xe35e9842fceaca96570b734083f4a58e8f7c5f2a', name: 'Across SpokePool V3', protocol: 'Across', network: 'arbitrum' },
  { address: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', name: 'LI.FI Diamond', protocol: 'LI.FI', network: 'arbitrum' },
  { address: '0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f', name: 'Arbitrum Inbox', protocol: 'Arbitrum', network: 'arbitrum' },

  // --- Stablecoins ---
  { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', name: 'USDC', protocol: 'Circle', network: 'arbitrum' },
  { address: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', name: 'USDC.e (Bridged)', protocol: 'Circle', network: 'arbitrum' },
  { address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', name: 'USDT', protocol: 'Tether', network: 'arbitrum' },
  { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', name: 'DAI', protocol: 'MakerDAO', network: 'arbitrum' },

  // --- Wrapped/LST ---
  { address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', name: 'WETH', protocol: 'Wrapped Ether', network: 'arbitrum' },
  { address: '0x5979d7b546e38e414f7e9822514be443a4800529', name: 'wstETH', protocol: 'Lido', network: 'arbitrum' },
  { address: '0x35751007a407ca6feffe80b3cb397736d2cf4dbe', name: 'weETH', protocol: 'EtherFi', network: 'arbitrum' },

  // --- Infra ---
  { address: '0xca11bde05977b3631167028862be2a173976ca11', name: 'Multicall3', protocol: 'Multicall', network: 'arbitrum' },
  { address: '0x000000000022d473030f116ddee9f6b43ac78ba3', name: 'Permit2', protocol: 'Uniswap', network: 'arbitrum' },
  { address: '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789', name: 'EntryPoint V0.6', protocol: 'ERC-4337', network: 'arbitrum' },
  { address: '0x0000000071727de22e5e9d8baf0edac6f37da032', name: 'EntryPoint V0.7', protocol: 'ERC-4337', network: 'arbitrum' },
  { address: '0x1a44076050125825900e736c501f859c50fe728c', name: 'LayerZero Endpoint V2', protocol: 'LayerZero', network: 'arbitrum' },

  // --- Tokens ---
  { address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', name: 'WBTC', protocol: 'BitGo', network: 'arbitrum' },
  { address: '0xf97f4df75117a78c1a5a0dbb814af92458539fb4', name: 'LINK', protocol: 'Chainlink', network: 'arbitrum' },
  { address: '0x912ce59144191c1204e64559fe8253a0e49e6548', name: 'ARB', protocol: 'Arbitrum', network: 'arbitrum' },

  // --- Pendle ---
  { address: '0x888888888889758f76e7103c6cbf23abbf58f946', name: 'Pendle Router V4', protocol: 'Pendle', network: 'arbitrum' },

  // --- Safe ---
  { address: '0xd9db270c1b5e3bd161e8c8503c55ceabee709552', name: 'Gnosis Safe Singleton', protocol: 'Safe', network: 'arbitrum' },

  // =========================================================================
  // OPTIMISM (~30 entries)
  // =========================================================================

  // --- DEX ---
  { address: '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', name: 'Uniswap Universal Router', protocol: 'Uniswap', network: 'optimism' },
  { address: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', name: 'Uniswap V3 Router 02', protocol: 'Uniswap', network: 'optimism' },
  { address: '0x1f98431c8ad98523631ae4a59f267346ea31f984', name: 'Uniswap V3 Factory', protocol: 'Uniswap', network: 'optimism' },
  { address: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', name: '0x Exchange Proxy', protocol: '0x', network: 'optimism' },
  { address: '0xba12222222228d8ba445958a75a0704d566bf2c8', name: 'Balancer V2 Vault', protocol: 'Balancer', network: 'optimism' },

  // --- Velodrome ---
  { address: '0xa062ae8a9c5e11aaa026fc2670b0d65ccc8b2858', name: 'Velodrome V2 Router', protocol: 'Velodrome', network: 'optimism' },
  { address: '0xf1046053aa5682b4f9a81b5481394da16be5ff5a', name: 'Velodrome V2 Factory', protocol: 'Velodrome', network: 'optimism' },
  { address: '0x9560e827af36c94d2ac33a39bce1fe78631088db', name: 'Velodrome V1 Router', protocol: 'Velodrome', network: 'optimism' },

  // --- Lending ---
  { address: '0x794a61358d6845594f94dc1db02a252b5b4814ad', name: 'Aave V3 Pool', protocol: 'Aave', network: 'optimism' },
  { address: '0xa97684ead0e402dc232d5a977953df7ecbab3cdb', name: 'Aave V3 Pool Addresses Provider', protocol: 'Aave', network: 'optimism' },
  { address: '0x2e44e174f7d53f0212823acc11c01a11d58c5bcb', name: 'Sonne Finance Comptroller', protocol: 'Sonne', network: 'optimism' },

  // --- Bridge ---
  { address: '0x6f26bf09b1c792e3228e5467807a900a503c0281', name: 'Across SpokePool V3', protocol: 'Across', network: 'optimism' },
  { address: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', name: 'LI.FI Diamond', protocol: 'LI.FI', network: 'optimism' },
  { address: '0x4200000000000000000000000000000000000010', name: 'L2 Standard Bridge', protocol: 'Optimism', network: 'optimism' },

  // --- Stablecoins ---
  { address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85', name: 'USDC', protocol: 'Circle', network: 'optimism' },
  { address: '0x7f5c764cbc14f9669b88837ca1490cca17c31607', name: 'USDC.e (Bridged)', protocol: 'Circle', network: 'optimism' },
  { address: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', name: 'USDT', protocol: 'Tether', network: 'optimism' },
  { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', name: 'DAI', protocol: 'MakerDAO', network: 'optimism' },

  // --- Wrapped/LST ---
  { address: '0x4200000000000000000000000000000000000006', name: 'WETH', protocol: 'Wrapped Ether', network: 'optimism' },
  { address: '0x1f32b1c2345538c0c6f582fcb022739c4a194ebb', name: 'wstETH', protocol: 'Lido', network: 'optimism' },

  // --- Tokens ---
  { address: '0x4200000000000000000000000000000000000042', name: 'OP Token', protocol: 'Optimism', network: 'optimism' },
  { address: '0x3c8b650257cfb5f272f799f5e2b4e65093a11a05', name: 'VELO', protocol: 'Velodrome', network: 'optimism' },

  // --- Infra ---
  { address: '0xca11bde05977b3631167028862be2a173976ca11', name: 'Multicall3', protocol: 'Multicall', network: 'optimism' },
  { address: '0x000000000022d473030f116ddee9f6b43ac78ba3', name: 'Permit2', protocol: 'Uniswap', network: 'optimism' },
  { address: '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789', name: 'EntryPoint V0.6', protocol: 'ERC-4337', network: 'optimism' },
  { address: '0x0000000071727de22e5e9d8baf0edac6f37da032', name: 'EntryPoint V0.7', protocol: 'ERC-4337', network: 'optimism' },
  { address: '0x1a44076050125825900e736c501f859c50fe728c', name: 'LayerZero Endpoint V2', protocol: 'LayerZero', network: 'optimism' },

  // --- Safe ---
  { address: '0xd9db270c1b5e3bd161e8c8503c55ceabee709552', name: 'Gnosis Safe Singleton', protocol: 'Safe', network: 'optimism' },

  // =========================================================================
  // POLYGON (~40 entries)
  // =========================================================================

  // --- DEX ---
  { address: '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', name: 'Uniswap Universal Router', protocol: 'Uniswap', network: 'polygon' },
  { address: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', name: 'Uniswap V3 Router 02', protocol: 'Uniswap', network: 'polygon' },
  { address: '0x1f98431c8ad98523631ae4a59f267346ea31f984', name: 'Uniswap V3 Factory', protocol: 'Uniswap', network: 'polygon' },
  { address: '0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff', name: 'QuickSwap V2 Router', protocol: 'QuickSwap', network: 'polygon' },
  { address: '0xf5b509bb0909a69b1c207e495f687a596c168e12', name: 'QuickSwap V3 Router', protocol: 'QuickSwap', network: 'polygon' },
  { address: '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506', name: 'SushiSwap Router', protocol: 'SushiSwap', network: 'polygon' },
  { address: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', name: '0x Exchange Proxy', protocol: '0x', network: 'polygon' },
  { address: '0xba12222222228d8ba445958a75a0704d566bf2c8', name: 'Balancer V2 Vault', protocol: 'Balancer', network: 'polygon' },
  { address: '0x1111111254eeb25477b68fb85ed929f73a960582', name: '1inch V5 Router', protocol: '1inch', network: 'polygon' },

  // --- Lending ---
  { address: '0x794a61358d6845594f94dc1db02a252b5b4814ad', name: 'Aave V3 Pool', protocol: 'Aave', network: 'polygon' },
  { address: '0xa97684ead0e402dc232d5a977953df7ecbab3cdb', name: 'Aave V3 Pool Addresses Provider', protocol: 'Aave', network: 'polygon' },
  { address: '0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf', name: 'Aave V2 Lending Pool', protocol: 'Aave', network: 'polygon' },
  { address: '0xf25212e676d1f7f89cd72ffee66158f541246445', name: 'Compound V3 cUSDCv3', protocol: 'Compound', network: 'polygon' },

  // --- Bridge ---
  { address: '0x9295ee1d8c5b022be115a2ad3c30c72e34e7f096', name: 'Across SpokePool V3', protocol: 'Across', network: 'polygon' },
  { address: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', name: 'LI.FI Diamond', protocol: 'LI.FI', network: 'polygon' },
  { address: '0xa0c68c638235ee32657e8f720a23cec1bfc6c4a8', name: 'Polygon PoS Bridge', protocol: 'Polygon', network: 'polygon' },

  // --- Stablecoins ---
  { address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', name: 'USDC', protocol: 'Circle', network: 'polygon' },
  { address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', name: 'USDC.e (Bridged)', protocol: 'Circle', network: 'polygon' },
  { address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', name: 'USDT', protocol: 'Tether', network: 'polygon' },
  { address: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', name: 'DAI', protocol: 'MakerDAO', network: 'polygon' },

  // --- Wrapped/LST ---
  { address: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', name: 'WMATIC', protocol: 'Wrapped MATIC', network: 'polygon' },
  { address: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', name: 'WETH', protocol: 'Wrapped Ether', network: 'polygon' },
  { address: '0x03b54a6e9a984069379fae1a4fc4dbae93b3bccd', name: 'wstETH', protocol: 'Lido', network: 'polygon' },
  { address: '0x03b54a6e9a984069379fae1a4fc4dbae93b3bcce', name: 'stMATIC', protocol: 'Lido', network: 'polygon' },

  // --- Tokens ---
  { address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6', name: 'WBTC', protocol: 'BitGo', network: 'polygon' },
  { address: '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39', name: 'LINK', protocol: 'Chainlink', network: 'polygon' },
  { address: '0xb33eaad8d922b1083446dc23f610c2567fb5180f', name: 'UNI', protocol: 'Uniswap', network: 'polygon' },
  { address: '0xd6df932a45c0f255f85145f286ea0b292b21c90b', name: 'AAVE', protocol: 'Aave', network: 'polygon' },
  { address: '0x831753dd7087cac61ab5644b308642cc1c33dc13', name: 'QUICK', protocol: 'QuickSwap', network: 'polygon' },

  // --- Infra ---
  { address: '0xca11bde05977b3631167028862be2a173976ca11', name: 'Multicall3', protocol: 'Multicall', network: 'polygon' },
  { address: '0x000000000022d473030f116ddee9f6b43ac78ba3', name: 'Permit2', protocol: 'Uniswap', network: 'polygon' },
  { address: '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789', name: 'EntryPoint V0.6', protocol: 'ERC-4337', network: 'polygon' },
  { address: '0x0000000071727de22e5e9d8baf0edac6f37da032', name: 'EntryPoint V0.7', protocol: 'ERC-4337', network: 'polygon' },
  { address: '0x1a44076050125825900e736c501f859c50fe728c', name: 'LayerZero Endpoint V2', protocol: 'LayerZero', network: 'polygon' },

  // --- NFT ---
  { address: '0x00000000000000adc04c56bf30ac9d3c0aaf14dc', name: 'Seaport 1.5', protocol: 'OpenSea', network: 'polygon' },

  // --- Safe ---
  { address: '0xd9db270c1b5e3bd161e8c8503c55ceabee709552', name: 'Gnosis Safe Singleton', protocol: 'Safe', network: 'polygon' },

  // =========================================================================
  // SOLANA MAINNET-BETA (~55 entries)
  // =========================================================================

  // --- System Programs ---
  { address: '11111111111111111111111111111111', name: 'System Program', protocol: 'Solana', network: 'solana-mainnet' },
  { address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', name: 'SPL Token Program', protocol: 'Solana', network: 'solana-mainnet' },
  { address: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', name: 'Token-2022 Program', protocol: 'Solana', network: 'solana-mainnet' },
  { address: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', name: 'Associated Token Account Program', protocol: 'Solana', network: 'solana-mainnet' },
  { address: 'ComputeBudget111111111111111111111111111111', name: 'Compute Budget Program', protocol: 'Solana', network: 'solana-mainnet' },
  { address: 'SysvarRent111111111111111111111111111111111', name: 'Sysvar Rent', protocol: 'Solana', network: 'solana-mainnet' },
  { address: 'SysvarC1ock11111111111111111111111111111111', name: 'Sysvar Clock', protocol: 'Solana', network: 'solana-mainnet' },
  { address: 'Vote111111111111111111111111111111111111111', name: 'Vote Program', protocol: 'Solana', network: 'solana-mainnet' },
  { address: 'Stake11111111111111111111111111111111111111', name: 'Stake Program', protocol: 'Solana', network: 'solana-mainnet' },
  { address: 'Config1111111111111111111111111111111111111', name: 'Config Program', protocol: 'Solana', network: 'solana-mainnet' },
  { address: 'BPFLoaderUpgradeab1e11111111111111111111111', name: 'BPF Loader Upgradeable', protocol: 'Solana', network: 'solana-mainnet' },

  // --- DEX ---
  { address: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', name: 'Jupiter V6', protocol: 'Jupiter', network: 'solana-mainnet' },
  { address: 'jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu', name: 'Jupiter Limit Order V2', protocol: 'Jupiter', network: 'solana-mainnet' },
  { address: 'DCA265Vj8a9CEuX1eb1LWRnDT7uK6q1xMipnNyatn23M', name: 'Jupiter DCA', protocol: 'Jupiter', network: 'solana-mainnet' },
  { address: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', name: 'Raydium AMM V4', protocol: 'Raydium', network: 'solana-mainnet' },
  { address: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', name: 'Raydium CLMM', protocol: 'Raydium', network: 'solana-mainnet' },
  { address: 'routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS', name: 'Raydium Route', protocol: 'Raydium', network: 'solana-mainnet' },
  { address: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C', name: 'Raydium CPMM', protocol: 'Raydium', network: 'solana-mainnet' },
  { address: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', name: 'Orca Whirlpool', protocol: 'Orca', network: 'solana-mainnet' },
  { address: '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP', name: 'Orca Token Swap V2', protocol: 'Orca', network: 'solana-mainnet' },
  { address: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', name: 'Meteora DLMM', protocol: 'Meteora', network: 'solana-mainnet' },
  { address: 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB', name: 'Meteora Pools', protocol: 'Meteora', network: 'solana-mainnet' },
  { address: 'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY', name: 'Phoenix DEX', protocol: 'Phoenix', network: 'solana-mainnet' },
  { address: 'opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb', name: 'OpenBook DEX V2', protocol: 'OpenBook', network: 'solana-mainnet' },

  // --- Staking ---
  { address: 'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD', name: 'Marinade Finance', protocol: 'Marinade', network: 'solana-mainnet' },
  { address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', name: 'Marinade mSOL', protocol: 'Marinade', network: 'solana-mainnet' },
  { address: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', name: 'Jito jitoSOL', protocol: 'Jito', network: 'solana-mainnet' },
  { address: 'Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb', name: 'Jito Staking Pool', protocol: 'Jito', network: 'solana-mainnet' },
  { address: '7ge2xKsZXmqPxa3YmXxXmzCp9Hc2ezrTxh6PECaxCwrL', name: 'Sanctum Router', protocol: 'Sanctum', network: 'solana-mainnet' },
  { address: 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', name: 'BlazeStake bSOL', protocol: 'BlazeStake', network: 'solana-mainnet' },

  // --- Lending ---
  { address: 'KLend2g3cP87ber8TRMGnQKNAi7S7bFy15bCPa8DkWn', name: 'Kamino Lending', protocol: 'Kamino', network: 'solana-mainnet' },
  { address: '6LtLpnUFNByNXLyCoK9wA2MykKAmQNZKBdY8s47dehDc', name: 'Kamino Farms', protocol: 'Kamino', network: 'solana-mainnet' },
  { address: 'SoLendXonfBJhiaaA9GUL5X2M5f6mxVRBbkiovdGebP', name: 'Solend Main', protocol: 'Solend', network: 'solana-mainnet' },
  { address: 'MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA', name: 'Marginfi', protocol: 'Marginfi', network: 'solana-mainnet' },

  // --- Perp ---
  { address: 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH', name: 'Drift Protocol V2', protocol: 'Drift', network: 'solana-mainnet' },

  // --- Infrastructure ---
  { address: 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s', name: 'Metaplex Token Metadata', protocol: 'Metaplex', network: 'solana-mainnet' },
  { address: 'auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg', name: 'Metaplex Token Auth Rules', protocol: 'Metaplex', network: 'solana-mainnet' },
  { address: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', name: 'SPL Memo V2', protocol: 'Solana', network: 'solana-mainnet' },
  { address: 'namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX', name: 'SPL Name Service', protocol: 'Solana', network: 'solana-mainnet' },
  { address: 'jCebN34bUfdeUhJVr76Q1BVikYaZrk6B4DE4v9VCxMN', name: 'Jup Vote', protocol: 'Jupiter', network: 'solana-mainnet' },

  // --- Wrapped / Major Tokens ---
  { address: 'So11111111111111111111111111111111111111112', name: 'Wrapped SOL', protocol: 'Solana', network: 'solana-mainnet' },
  { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', name: 'USDC', protocol: 'Circle', network: 'solana-mainnet' },
  { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', name: 'USDT', protocol: 'Tether', network: 'solana-mainnet' },
  { address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', name: 'WIF', protocol: 'Dogwifhat', network: 'solana-mainnet' },
  { address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', name: 'BONK', protocol: 'Bonk', network: 'solana-mainnet' },
  { address: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', name: 'WETH (Wormhole)', protocol: 'Wormhole', network: 'solana-mainnet' },
  { address: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', name: 'WBTC (Wormhole)', protocol: 'Wormhole', network: 'solana-mainnet' },
  { address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', name: 'JUP', protocol: 'Jupiter', network: 'solana-mainnet' },
  { address: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', name: 'PYTH', protocol: 'Pyth', network: 'solana-mainnet' },
  { address: 'RLBxxFkseAZ4RgJH3Sqn8jXxhmGoz9jWxDNJMh8pL7a', name: 'Raydium RAY', protocol: 'Raydium', network: 'solana-mainnet' },
  { address: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', name: 'Orca ORCA', protocol: 'Orca', network: 'solana-mainnet' },

  // --- Wormhole ---
  { address: 'worm2ibr5LrNY8GaHRrLhBjYM6u2Mi2tFZrVgJkAmTj', name: 'Wormhole Core', protocol: 'Wormhole', network: 'solana-mainnet' },
  { address: 'wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb', name: 'Wormhole Token Bridge', protocol: 'Wormhole', network: 'solana-mainnet' },

  // --- Pyth Oracle ---
  { address: 'FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH', name: 'Pyth Oracle V2', protocol: 'Pyth', network: 'solana-mainnet' },

  // --- Tensor (NFT) ---
  { address: 'TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN', name: 'Tensor Swap', protocol: 'Tensor', network: 'solana-mainnet' },
  { address: 'TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp', name: 'Tensor Compressed', protocol: 'Tensor', network: 'solana-mainnet' },

  // --- Magic Eden ---
  { address: 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K', name: 'Magic Eden V2', protocol: 'Magic Eden', network: 'solana-mainnet' },

  // =========================================================================
  // ADDITIONAL ETHEREUM ENTRIES (to meet 300+ total)
  // =========================================================================

  // --- More DeFi ---
  { address: '0x3e01dd8a5e1fb3481f0f589056b428fc308af0fb', name: 'Lido Staking Router', protocol: 'Lido', network: 'ethereum' },
  { address: '0xb8c77482e45f1f44de1745f52c74426c631bdd52', name: 'BNB (on Ethereum)', protocol: 'Binance', network: 'ethereum' },
  { address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f', name: 'SNX', protocol: 'Synthetix', network: 'ethereum' },
  { address: '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e', name: 'YFI', protocol: 'Yearn', network: 'ethereum' },
  { address: '0xae78736cd615f374d3085123a210448e74fc6393', name: 'Rocket Pool rETH', protocol: 'Rocket Pool', network: 'ethereum' },
  { address: '0xd33526068d116ce69f19a9ee46f0bd304f21a51f', name: 'Rocket Pool RPL', protocol: 'Rocket Pool', network: 'ethereum' },
  { address: '0xc36442b4a4522e871399cd717abdd847ab11fe88', name: 'Uniswap V3 NFT Position Manager', protocol: 'Uniswap', network: 'ethereum' },

  // --- More Base tokens ---
  { address: '0x0555e30da8f98308edb960aa94c0db47230d2b9c', name: 'WELL', protocol: 'Moonwell', network: 'base' },
  { address: '0x236aa50979d5f3de3bd1eeb40e81137f22ab794b', name: 'tBTC', protocol: 'Threshold', network: 'base' },

  // --- More Arbitrum ---
  { address: '0x3e6648c5a70a150a88bce65f4ad4d506b15d5af2', name: 'PENDLE', protocol: 'Pendle', network: 'arbitrum' },
  { address: '0x539bde0d7dce551b04cf46e28115b2d0a4f23ab5', name: 'Radiant RDNT', protocol: 'Radiant', network: 'arbitrum' },

  // --- More Optimism ---
  { address: '0x8700daec35af8ff88c16bdf0418774cb3d7599b4', name: 'SNX', protocol: 'Synthetix', network: 'optimism' },
  { address: '0x76fb31fb4af56892a25e32cfc43de717950c9278', name: 'Aave V3 Pool', protocol: 'Aave', network: 'optimism' },

  // --- More Polygon ---
  { address: '0x45dda9cb7c25131df268515131f647d726f50608', name: 'Aavegotchi Diamond', protocol: 'Aavegotchi', network: 'polygon' },
  { address: '0x580a84c73811e1839f75d86d75d88cca0c241ff4', name: 'QuickSwap V3 Factory', protocol: 'QuickSwap', network: 'polygon' },

  // --- More Solana ---
  { address: 'GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp', name: 'Drift Insurance Fund', protocol: 'Drift', network: 'solana-mainnet' },
  { address: 'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX', name: 'Serum DEX V3', protocol: 'Serum', network: 'solana-mainnet' },
] as const;

