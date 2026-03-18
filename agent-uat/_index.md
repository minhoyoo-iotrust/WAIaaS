---
title: "Agent UAT Scenario Index"
updated: "2026-03-18"
---

# Agent UAT Scenario Index

## Summary
| Category | Count | Description |
|----------|-------|-------------|
| testnet | 6 | Testnet 기능 검증 |
| mainnet | 6 | Mainnet 전송 검증 |
| defi | 13 | DeFi 프로토콜 검증 |
| admin | 13 | Admin UI 검증 |
| admin-ops | 2 | 운영 모니터링 검증 |
| advanced | 5 | 고급 기능 검증 |

## Categories

### Testnet
| ID | Title | Network | Env | Funds | Cost | Risk |
|----|-------|---------|-----|-------|------|------|
| testnet-01 | Sepolia ETH 전송 | ethereum-sepolia | testnet | Yes | $0.01 | low |
| testnet-02 | Devnet SOL 전송 | solana-devnet | testnet | Yes | $0 | low |
| testnet-03 | Sepolia ERC-20 전송 | ethereum-sepolia | testnet | Yes | $0.02 | low |
| testnet-04 | Devnet SPL 전송 | solana-devnet | testnet | Yes | $0 | low |
| testnet-05 | Hyperliquid Spot/Perp | hyperliquid-testnet | testnet | Yes | $0 | medium |
| testnet-06 | Sepolia NFT 전송 | ethereum-sepolia | testnet | Yes | $0.02 | low |

### Mainnet
| ID | Title | Network | Env | Funds | Cost | Risk |
|----|-------|---------|-----|-------|------|------|
| mainnet-01 | ETH 전송 | ethereum-mainnet | mainnet | Yes | $0.50 | medium |
| mainnet-02 | SOL 전송 | solana-mainnet | mainnet | Yes | $0.001 | medium |
| mainnet-03 | ERC-20 USDC 전송 | ethereum-mainnet | mainnet | Yes | $1.00 | medium |
| mainnet-04 | SPL USDC 전송 | solana-mainnet | mainnet | Yes | $0.001 | medium |
| mainnet-05 | L2 네이티브 전송 | polygon/arbitrum/base | mainnet | Yes | $0.05 | medium |
| mainnet-06 | NFT 전송 | base-mainnet | mainnet | Yes | $0.01 | medium |

### DeFi
| ID | Title | Network | Env | Funds | Cost | Risk |
|----|-------|---------|-----|-------|------|------|
| defi-01 | Jupiter Swap (SOL -> USDC) | solana-mainnet | mainnet | Yes | $0.01 | medium |
| defi-02 | 0x EVM DEX Swap (ETH -> USDC) | ethereum-mainnet, polygon-mainnet | mainnet | Yes | $5.00 | medium |
| defi-03 | LI.FI Bridge (L1 -> L2) | ethereum-mainnet, arbitrum-mainnet | mainnet | Yes | $5.00 | medium |
| defi-04 | Across Bridge (L2 -> L2) | arbitrum-mainnet, base-mainnet | mainnet | Yes | $0.50 | medium |
| defi-05 | Lido ETH Staking | ethereum-mainnet | mainnet | Yes | $3.00 | medium |
| defi-06 | Jito SOL Staking | solana-mainnet | mainnet | Yes | $0.01 | medium |
| defi-07 | Aave V3 Lending (USDC Supply) | ethereum-mainnet, polygon-mainnet | mainnet | Yes | $5.00 | medium |
| defi-08 | Kamino Lending (USDC Supply) | solana-mainnet | mainnet | Yes | $0.01 | medium |
| defi-09 | Pendle Yield Trading (PT) | ethereum-mainnet | mainnet | Yes | $5.00 | medium |
| defi-10 | Drift Perpetual Trading | solana-mainnet | mainnet | Yes | $0.01 | medium |
| defi-11 | Hyperliquid Mainnet Perp/Spot | hyperliquid-mainnet | mainnet | Yes | $0 | medium |
| defi-12 | DCent Swap Aggregator | ethereum-mainnet | mainnet | Yes | $5.00 | medium |
| defi-13 | Polymarket 예측 시장 주문 | polygon-mainnet | mainnet | Yes | $1.00 | medium |

### Admin-Ops
| ID | Title | Network | Env | Funds | Cost | Risk |
|----|-------|---------|-----|-------|------|------|
| admin-ops-01 | 수신 트랜잭션 감지 | ethereum-sepolia, solana-devnet | testnet | Yes | $0.01 | low |
| admin-ops-02 | 잔액 모니터링 | ethereum-sepolia, solana-devnet | testnet | Yes | $0.01 | low |

### Advanced
| ID | Title | Network | Env | Funds | Cost | Risk |
|----|-------|---------|-----|-------|------|------|
| advanced-01 | Smart Account UserOp Build/Sign | ethereum-sepolia | testnet | Yes | $0.02 | low |
| advanced-02 | x402 HTTP 결제 | ethereum-mainnet, base-mainnet | mainnet | Yes | $1.00 | medium |
| advanced-03 | 가스 조건부 실행 | ethereum-mainnet | mainnet | No | $0 | none |
| advanced-04 | 메시지 서명 및 검증 | ethereum-mainnet | mainnet | No | $0 | none |
| advanced-05 | 트랜잭션 승인 워크플로우 | ethereum-mainnet | mainnet | Yes | $0.50 | medium |

### Admin
| ID | Title | Network | Env | Funds | Cost | Risk |
|----|-------|---------|-----|-------|------|------|
| admin-01 | Admin UI 전체 페이지 접근 검증 | all | offchain | No | $0 | none |
| admin-02 | Admin 마스터 패스워드 인증 | all | offchain | No | $0 | none |
| admin-03 | Admin Dashboard 데이터 정확성 검증 | all | offchain | No | $0 | none |
| admin-04 | Admin Settings 변경 및 반영 검증 | all | offchain | Yes | $0.01 | low |
| admin-05 | 정책 관리 CRUD 검증 | all | offchain | No | $0 | none |
| admin-06 | Admin 지갑 관리 및 잔액 검증 | ethereum-mainnet, solana-mainnet | mainnet | No | $0 | none |
| admin-07 | Admin NFT 탭 검증 | ethereum-mainnet, solana-mainnet | mainnet | No | $0 | none |
| admin-08 | Admin DeFi 포지션 탭 검증 | ethereum-mainnet, solana-mainnet | mainnet | No | $0 | none |
| admin-09 | Admin 알림 설정 및 수신 검증 | all | offchain | Yes | $0.01 | low |
| admin-10 | Admin 감사 로그 정확성 검증 | all | offchain | No | $0 | none |
| admin-11 | Admin 백업/복원 무결성 검증 | all | offchain | No | $0 | low |
| admin-12 | Admin 토큰 레지스트리 검증 | ethereum-mainnet | mainnet | No | $0 | none |
| admin-13 | Admin 통계/모니터링 API 검증 | all | offchain | No | $0 | none |

## Network Index
| Network | Scenarios |
|---------|-----------|
| all | admin-01, admin-02, admin-03, admin-04, admin-05, admin-09, admin-10, admin-11, admin-13 |
| ethereum-sepolia | testnet-01, testnet-03, testnet-06, advanced-01, admin-ops-01, admin-ops-02, admin-09 |
| solana-devnet | testnet-02, testnet-04, admin-ops-01, admin-ops-02 |
| hyperliquid-testnet | testnet-05 |
| ethereum-mainnet | mainnet-01, mainnet-03, defi-02, defi-03, defi-05, defi-07, defi-09, defi-12, advanced-02, advanced-03, advanced-04, advanced-05, admin-06, admin-07, admin-08, admin-12 |
| solana-mainnet | mainnet-02, mainnet-04, defi-01, defi-06, defi-08, defi-10, admin-06, admin-07, admin-08 |
| polygon-mainnet | mainnet-05, defi-02, defi-07, defi-13 |
| arbitrum-mainnet | mainnet-05, defi-03, defi-04 |
| base-mainnet | mainnet-05, mainnet-06, defi-04, advanced-02 |
| hyperliquid-mainnet | defi-11 |

## Quick Filters
- **마스터 패스워드 필요 (masterAuth)**: admin-01 ~ admin-13
- **세션 토큰만 (sessionAuth)**: testnet-01 ~ testnet-06, mainnet-01 ~ mainnet-06, defi-01 ~ defi-13, admin-ops-01 ~ admin-ops-02, advanced-01 ~ advanced-05
- **무료 (no funds)**: advanced-03, advanced-04, admin-01, admin-02, admin-03, admin-05, admin-06, admin-07, admin-08, admin-10, admin-11, admin-12, admin-13
- **Low risk**: testnet-01, testnet-02, testnet-03, testnet-04, testnet-06, advanced-01, admin-ops-01, admin-ops-02, admin-04, admin-09, admin-11
- **Medium risk**: testnet-05, mainnet-01, mainnet-02, mainnet-03, mainnet-04, mainnet-05, mainnet-06, defi-01, defi-02, defi-03, defi-04, defi-05, defi-06, defi-07, defi-08, defi-09, defi-10, defi-11, defi-12, defi-13, advanced-02, advanced-05
- **High risk**: (none yet)
- **Offchain (no blockchain)**: admin-01, admin-02, admin-03, admin-04, admin-05, admin-09, admin-10, admin-11, admin-13
- **Testnet only**: testnet-01, testnet-02, testnet-03, testnet-04, testnet-05, testnet-06, admin-ops-01, admin-ops-02, advanced-01
- **Mainnet**: mainnet-01, mainnet-02, mainnet-03, mainnet-04, mainnet-05, mainnet-06, defi-01, defi-02, defi-03, defi-04, defi-05, defi-06, defi-07, defi-08, defi-09, defi-10, defi-11, defi-12, defi-13, admin-06, admin-07, admin-08, admin-12, advanced-02, advanced-03, advanced-04, advanced-05
