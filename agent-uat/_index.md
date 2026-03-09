---
title: "Agent UAT Scenario Index"
updated: "2026-03-09"
---

# Agent UAT Scenario Index

## Summary
| Category | Count | Description |
|----------|-------|-------------|
| testnet | 8 | Testnet 기능 검증 |
| mainnet | 6 | Mainnet 전송 검증 |
| defi | 12 | DeFi 프로토콜 검증 |
| admin | 0 | Admin UI 검증 |
| advanced | 0 | 고급 기능 검증 |

## Categories

### Testnet
| ID | Title | Network | Funds | Cost | Risk |
|----|-------|---------|-------|------|------|
| testnet-01 | 지갑 CRUD 검증 | all | No | $0 | none |
| testnet-02 | Sepolia ETH 전송 | ethereum-sepolia | Yes | $0.01 | low |
| testnet-03 | Devnet SOL 전송 | solana-devnet | Yes | $0 | low |
| testnet-04 | Sepolia ERC-20 전송 | ethereum-sepolia | Yes | $0.02 | low |
| testnet-05 | Devnet SPL 전송 | solana-devnet | Yes | $0 | low |
| testnet-06 | Hyperliquid Spot/Perp | hyperliquid-testnet | Yes | $0 | medium |
| testnet-07 | Sepolia NFT 전송 | ethereum-sepolia | Yes | $0.02 | low |
| testnet-08 | 수신 트랜잭션 감지 | ethereum-sepolia, solana-devnet | Yes | $0.01 | low |

### Mainnet
| ID | Title | Network | Funds | Cost | Risk |
|----|-------|---------|-------|------|------|
| mainnet-01 | ETH 전송 | ethereum-mainnet | Yes | $0.50 | medium |
| mainnet-02 | SOL 전송 | solana-mainnet | Yes | $0.001 | medium |
| mainnet-03 | ERC-20 USDC 전송 | ethereum-mainnet | Yes | $1.00 | medium |
| mainnet-04 | SPL USDC 전송 | solana-mainnet | Yes | $0.001 | medium |
| mainnet-05 | L2 네이티브 전송 | polygon/arbitrum/base | Yes | $0.05 | medium |
| mainnet-06 | NFT 전송 | ethereum-mainnet | Yes | $2.00 | medium |

### DeFi
| ID | Title | Network | Funds | Cost | Risk |
|----|-------|---------|-------|------|------|
| defi-01 | Jupiter Swap (SOL -> USDC) | solana-mainnet | Yes | $0.01 | medium |
| defi-02 | 0x EVM DEX Swap (ETH -> USDC) | ethereum-mainnet, polygon-mainnet | Yes | $5.00 | medium |
| defi-03 | LI.FI Bridge (L1 -> L2) | ethereum-mainnet, arbitrum-mainnet | Yes | $5.00 | medium |
| defi-04 | Across Bridge (L2 -> L2) | arbitrum-mainnet, base-mainnet | Yes | $0.50 | medium |
| defi-05 | Lido ETH Staking | ethereum-mainnet | Yes | $3.00 | medium |
| defi-06 | Jito SOL Staking | solana-mainnet | Yes | $0.01 | medium |
| defi-07 | Aave V3 Lending (USDC Supply) | ethereum-mainnet, polygon-mainnet | Yes | $5.00 | medium |
| defi-08 | Kamino Lending (USDC Supply) | solana-mainnet | Yes | $0.01 | medium |
| defi-09 | Pendle Yield Trading (PT) | ethereum-mainnet | Yes | $5.00 | medium |
| defi-10 | Drift Perpetual Trading | solana-mainnet | Yes | $0.01 | medium |
| defi-11 | Hyperliquid Mainnet Perp/Spot | hyperliquid-mainnet | Yes | $0 | medium |
| defi-12 | DCent Swap Aggregator | ethereum-mainnet | Yes | $5.00 | medium |

### Admin
_No scenarios yet._

### Advanced
_No scenarios yet._

## Network Index
| Network | Scenarios |
|---------|-----------|
| all | testnet-01 |
| ethereum-sepolia | testnet-02, testnet-04, testnet-07, testnet-08 |
| solana-devnet | testnet-03, testnet-05, testnet-08 |
| hyperliquid-testnet | testnet-06 |
| ethereum-mainnet | mainnet-01, mainnet-03, mainnet-06, defi-02, defi-03, defi-05, defi-07, defi-09, defi-12 |
| solana-mainnet | mainnet-02, mainnet-04, defi-01, defi-06, defi-08, defi-10 |
| polygon-mainnet | mainnet-05, defi-02, defi-07 |
| arbitrum-mainnet | mainnet-05, defi-03, defi-04 |
| base-mainnet | mainnet-05, defi-04 |
| hyperliquid-mainnet | defi-11 |

## Quick Filters
- **무료 (no funds)**: testnet-01
- **Low risk**: testnet-02, testnet-03, testnet-04, testnet-05, testnet-07, testnet-08
- **Medium risk**: testnet-06, mainnet-01, mainnet-02, mainnet-03, mainnet-04, mainnet-05, mainnet-06, defi-01, defi-02, defi-03, defi-04, defi-05, defi-06, defi-07, defi-08, defi-09, defi-10, defi-11, defi-12
- **High risk**: (none yet)
