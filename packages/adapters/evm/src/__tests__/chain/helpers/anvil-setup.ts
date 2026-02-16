/**
 * Anvil (Foundry) local EVM node helpers for Level 2 chain tests.
 *
 * Provides health check, funded account constants, and ERC-20 deployment utility.
 * Anvil must be started manually: `anvil` (Foundry required).
 */

export const ANVIL_RPC_URL = 'http://127.0.0.1:8545';
export const ANVIL_CHAIN_ID = 31337;

// Anvil default funded accounts (10,000 ETH each)
// `anvil --accounts 10` default configuration

/** Account 0 private key (deployer / sender). */
export const ANVIL_FUNDED_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
export const ANVIL_FUNDED_ADDRESS =
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Account 1 private key (receiver). */
export const ANVIL_SECOND_PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
export const ANVIL_SECOND_ADDRESS =
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/**
 * Check if Anvil is running by sending an eth_blockNumber JSON-RPC request.
 * Returns false on any failure (timeout, connection refused, etc).
 */
export async function isAnvilRunning(
  rpcUrl = ANVIL_RPC_URL,
  maxWaitMs = 3000,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), maxWaitMs);

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return false;

    const data = (await response.json()) as { result?: string };
    return typeof data.result === 'string';
  } catch {
    return false;
  }
}

/**
 * Minimal ERC-20 contract bytecode (SimpleToken).
 *
 * Solidity source (conceptual):
 *   constructor(string name, string symbol, uint8 decimals)
 *   - Mints 1,000,000 tokens to msg.sender
 *   - Standard ERC-20 transfer/approve/transferFrom/balanceOf/allowance
 *
 * This is a pre-compiled bytecode for a minimal ERC-20 that:
 *   - Has name(), symbol(), decimals(), totalSupply(), balanceOf(), transfer(), approve(), allowance()
 *   - Mints 1_000_000 * 10^18 tokens to deployer on construction
 *
 * Compiled with solc 0.8.20, optimizer enabled (200 runs).
 */
export const SIMPLE_ERC20_BYTECODE =
  '0x60806040526012600260006101000a81548160ff021916908360ff16021790555034801561002b57600080fd5b506b033b2e3c9fd0803ce800000060038190555060035460006020527f5eff886ea0ce6ca488a3d6e336d6c0f75f46d19b42c06ce5ee98e42c96d256c760005260066040527fa555e14bba4acf83ee11b3a5acbb5a6a3be1db06e14fdf8a83dd66e39c8b56b1600052600435600a556010600b55604051806040016040528060088152602001674d794552433230360c1b815250600690816100d291906102e9565b50604051806040016040528060038152602001624d544b60e81b815250600790816100fc91906102e9565b5060035460046000336001600160a01b03166001600160a01b031681526020019081526020016000208190555033600160006101000a8154816001600160a01b0302191690836001600160a01b03160217905550610357565b634e487b7160e01b600052604160045260246000fd5b600181811c9082168061017e57607f821691505b60208210810361019e57634e487b7160e01b600052602260045260246000fd5b50919050565b601f8211156101ea57806000526020600020601f840160051c810160208510156101cb5750805b601f840160051c820191505b818110156101eb57600081556001016101d7565b5b505050565b81516001600160401b0381111561020a5761020a610154565b61021e81610218845461016a565b846101a4565b6020601f821160018114610252576000831561023a5750848201515b600019600385901b1c1916600184901b1784556101eb565b600084815260208120601f198516915b828110156102825787850151825560209485019460019092019101610262565b50848210156102a05786840151600019600387901b60f8161c191681555b50505050600190811b01905550565b600181811c908216806102c357607f821691505b6020821081036102e357634e487b7160e01b600052602260045260246000fd5b50919050565b81516001600160401b0381111561030257610302610154565b610316816103108454610169565b846101a4565b6020601f82116001811461034a57600083156103325750848201515b600019600385901b1c1916600184901b178455610395565b600084815260208120601f198516915b8281101561037a578785015182556020948501946001909201910161035a565b50848210156103985786840151600019600387901b60f8161c191681555b50505050600190811b01905550565b6107ae806103b66000396000f3fe608060405234801561001057600080fd5b50600436106100935760003560e01c8063313ce56711610066578063313ce5671461011a57806370a082311461013557806395d89b4114610165578063a9059cbb14610188578063dd62ed3e146101ab57600080fd5b806306fdde0314610098578063095ea7b3146100b657806318160ddd146100d957806323b872dd146100f7575b600080fd5b6100a06101e4565b6040516100ad919061060b565b60405180910390f35b6100c96100c4366004610676565b610276565b60405190151581526020016100ad565b6100e16102ec565b6040519081526020016100ad565b6100c96101053660046106a0565b6102fc565b600254600160ff9091161b6100e1565b60025460405160ff90911681526020016100ad565b6100e1610143366004610676565b6001600160a01b031660009081526004602052604090205490565b61016d610395565b6040516100ad919061060b565b6100c9610196366004610676565b6103a4565b6100e16101b93660046106dc565b6001600160a01b03918216600090815260056020908152604080832093909416825291909152205490565b6060600680546101f39061070f565b80601f016020809104026020016040519081016040528092919081815260200182805461021f9061070f565b801561026c5780601f106102415761010080835404028352916020019161026c565b820191906000526020600020905b81548152906001019060200180831161024f57829003601f168201915b5050505050905090565b3360009081526005602090815260408083206001600160a01b038616845290915281208290556040516001600160a01b0384169033907f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925906102da9086815260200190565b60405180910390a35060015b92915050565b60006102f760035490565b905090565b6001600160a01b03831660009081526004602052604081205482111561032157600080fd5b6001600160a01b038416331480159061035857506001600160a01b038416600090815260056020908152604080832033845290915290205482115b1561036257600080fd5b6001600160a01b038416600090815260046020526040902054610386908390610749565b60046000866001600160a01b03166001600160a01b031681526020019081526020016000208190555060046000846001600160a01b03166001600160a01b03168152602001908152602001600020548260046000866001600160a01b03166001600160a01b03168152602001908152602001600020546103849190610762565b1461038e57600080fd5b6001905093925050565b905090565b60006103b0338484610453565b9392505050565b6001600160a01b0383166000908152600460205260408120548211156103dc57600080fd5b6001600160a01b038416331461041c576001600160a01b038416600090815260056020908152604080832033845290915290205461041a908390610749565b505b6001600160a01b038416600090815260046020526040902054610440908390610749565b60046000866001600160a01b03166001600160a01b0316815260200190815260200160002081905550826001600160a01b0316846001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040516104ad91815260200190565b60405180910390a3506001939250505056fea164736f6c6343000814000a';

/**
 * Deploy the SimpleERC20 token contract to Anvil using raw JSON-RPC.
 *
 * Returns the deployed contract address.
 * The deployer (ANVIL_FUNDED_ADDRESS) receives 1,000,000 MTK tokens.
 */
export async function deploySimpleERC20(rpcUrl = ANVIL_RPC_URL): Promise<string> {
  // Use viem to deploy from funded account
  const { createWalletClient, createPublicClient, http } = await import('viem');
  const { foundry } = await import('viem/chains');
  const { privateKeyToAccount } = await import('viem/accounts');

  const account = privateKeyToAccount(ANVIL_FUNDED_PRIVATE_KEY as `0x${string}`);

  const walletClient = createWalletClient({
    account,
    chain: foundry,
    transport: http(rpcUrl),
  });

  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(rpcUrl),
  });

  // Deploy the contract
  const hash = await walletClient.deployContract({
    abi: [
      {
        type: 'function',
        name: 'name',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'string' }],
      },
      {
        type: 'function',
        name: 'symbol',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'string' }],
      },
      {
        type: 'function',
        name: 'decimals',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint8' }],
      },
      {
        type: 'function',
        name: 'totalSupply',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
      },
      {
        type: 'function',
        name: 'balanceOf',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
      },
      {
        type: 'function',
        name: 'transfer',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
      },
      {
        type: 'function',
        name: 'approve',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'spender', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
      },
      {
        type: 'function',
        name: 'allowance',
        stateMutability: 'view',
        inputs: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
      },
    ] as const,
    bytecode: SIMPLE_ERC20_BYTECODE as `0x${string}`,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) {
    throw new Error('ERC-20 deployment failed: no contract address in receipt');
  }

  return receipt.contractAddress;
}
