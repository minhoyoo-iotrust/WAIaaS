---
id: "mainnet-06"
title: "NFT 전송"
category: "mainnet"
auth: "session"
network: ["ethereum-mainnet"]
requires_funds: true
estimated_cost_usd: "2.00"
risk_level: "medium"
tags: ["nft", "erc721", "erc1155", "transfer", "mainnet"]
---

# NFT 전송

## Metadata
- **ID**: mainnet-06
- **Category**: mainnet
- **Network**: ethereum-mainnet
- **Requires Funds**: Yes
- **Estimated Cost**: ~$2.00
- **Risk Level**: medium -- 실제 메인넷 NFT, 가스비 높음. 자기 전송 패턴으로 NFT 손실 없음

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Ethereum Mainnet EVM 지갑 보유
- [ ] ETH 보유 (가스비용, 최소 0.005 ETH)
- [ ] NFT 보유 (ERC-721 또는 ERC-1155) 1개 이상
- [ ] **NFT 미보유 시 이 시나리오는 SKIP 가능** -- 강제 실행하지 않음

## Scenario Steps

### Step 1: NFT 목록 조회
**Action**: Ethereum Mainnet에서 지갑의 NFT 목록을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallet/nfts?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 보유 NFT 목록이 반환된다
**Check**: 최소 1개 이상의 NFT 확인. 미보유 시 이 시나리오 SKIP. `CONTRACT_ADDRESS`, `TOKEN_ID` 기록

### Step 2: NFT 선택 및 사용자 확인
**Action**: 보유 NFT 목록에서 전송할 NFT를 사용자에게 보여주고 선택을 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/nfts/<CONTRACT_ADDRESS>/<TOKEN_ID>?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 선택된 NFT의 상세 정보가 반환된다
**Check**: NFT name, collection, image 등을 사용자에게 표시하고 "이 NFT를 자기 전송하시겠습니까?" 확인

### Step 3: Simulate NFT 자기 전송
**Action**: NFT를 자기 주소로 전송하는 simulate을 실행한다. **메인넷이므로 가스비를 반드시 사전 확인한다.**
```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "NFT_TRANSFER",
    "to": "<MY_ADDRESS>",
    "contractAddress": "<CONTRACT_ADDRESS>",
    "tokenId": "<TOKEN_ID>",
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, 예상 가스비가 반환된다
**Check**: `estimatedGas` (~50,000-80,000), `totalCost` 확인. $5.00 초과 시 사용자에게 가스비 경고

### Step 4: 실제 NFT 자기 전송
**Action**: 사용자 승인 후 실제 NFT 자기 전송을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/send \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "NFT_TRANSFER",
    "to": "<MY_ADDRESS>",
    "contractAddress": "<CONTRACT_ADDRESS>",
    "tokenId": "<TOKEN_ID>",
    "network": "ethereum-mainnet"
  }'
```
**Expected**: 200 OK, 트랜잭션 ID와 tx hash가 반환된다
**Check**: `txId`, `txHash` 필드 기록

### Step 5: 트랜잭션 상태 확인
**Action**: 트랜잭션 컨펌 상태를 확인한다.
```bash
curl -s http://localhost:3100/v1/transactions/<TX_ID> \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success`
**Check**: `status` 필드 확인

### Step 6: NFT 소유권 재확인
**Action**: NFT 목록을 재조회하여 여전히 소유하고 있는지 확인한다.
```bash
curl -s http://localhost:3100/v1/wallet/nfts?walletId=<WALLET_ID>&network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 동일한 NFT가 여전히 목록에 존재 (자기 전송이므로)
**Check**: Step 1에서 확인한 NFT가 여전히 보유 목록에 있는지 확인

## Verification
- [ ] NFT 목록 조회 성공 (또는 미보유 시 SKIP)
- [ ] NFT 상세 정보 확인 및 사용자 선택 완료
- [ ] Simulate 성공 (예상 가스비 반환, 사용자 승인 완료)
- [ ] NFT_TRANSFER 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] 자기 전송 후 NFT 소유권 유지 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| ERC-721 self-transfer | ethereum-mainnet | ~50,000 | ~$2.00 |
| ERC-1155 self-transfer | ethereum-mainnet | ~60,000 | ~$2.50 |
| **Total** | | | **~$2.00-2.50** |

> **Note**: Mainnet NFT 전송 가스비는 네트워크 혼잡도에 따라 크게 변동한다. $5 이상일 경우 가스비 안정 시 재시도 권장.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| No NFTs found | NFT 미보유 | 이 시나리오를 SKIP 처리. 강제 실행 불필요 |
| Insufficient ETH for gas | ETH 부족 | 최소 0.005 ETH 확보 필요 |
| Gas price too high | 네트워크 혼잡 | https://etherscan.io/gastracker 에서 가스 가격 안정 시 재시도 |
| NFT not owner | 소유권 불일치 | NFT contractAddress와 tokenId 정확성 확인, NFT 인덱서 캐시 갱신 대기 |
| NFT indexer stale data | 인덱서 캐시 지연 | 몇 분 대기 후 재조회, 또는 온체인 직접 확인 |
