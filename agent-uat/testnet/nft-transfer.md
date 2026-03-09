---
id: "testnet-07"
title: "Sepolia NFT 전송"
category: "testnet"
network: ["ethereum-sepolia"]
requires_funds: true
estimated_cost_usd: "0.02"
risk_level: "low"
tags: ["nft", "erc721", "erc1155", "transfer", "sepolia"]
---

# Sepolia NFT 전송

## Metadata
- **ID**: testnet-07
- **Category**: testnet
- **Network**: ethereum-sepolia
- **Requires Funds**: Yes
- **Estimated Cost**: ~$0.02
- **Risk Level**: low -- Testnet NFT, 자기 전송 패턴

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] Sepolia 네트워크 설정된 EVM 지갑 보유
- [ ] Sepolia ETH 보유 (가스비용, 최소 0.005 ETH)
- [ ] Sepolia NFT 보유 (ERC-721 또는 ERC-1155). 테스트 NFT 획득 방법:
  - Remix IDE에서 간단한 ERC-721 컨트랙트 배포 후 민팅
  - Testnet NFT faucet 사용 (예: https://testnets.opensea.io)
  - 기존 보유 Sepolia NFT 사용

## Scenario Steps

### Step 1: NFT 목록 조회
**Action**: Sepolia 네트워크에서 지갑의 NFT 목록을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/nfts?network=ethereum-sepolia \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, 보유 NFT 목록이 반환된다
**Check**: 최소 1개 이상의 NFT가 목록에 있는지 확인. `CONTRACT_ADDRESS`, `TOKEN_ID` 기록

### Step 2: NFT 상세 조회
**Action**: 특정 NFT의 상세 정보를 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/nfts/<CONTRACT_ADDRESS>/<TOKEN_ID>?network=ethereum-sepolia \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, NFT 상세 정보 (name, description, image, attributes 등)가 반환된다
**Check**: `contractAddress`, `tokenId`, `tokenType` (ERC-721 또는 ERC-1155) 필드 확인

### Step 3: Dry-Run NFT 자기 전송
**Action**: NFT를 자기 주소로 전송하는 dry-run을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions/dry-run \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "NFT_TRANSFER",
    "to": "<MY_ADDRESS>",
    "contractAddress": "<CONTRACT_ADDRESS>",
    "tokenId": "<TOKEN_ID>",
    "network": "ethereum-sepolia"
  }'
```
**Expected**: 200 OK, 예상 가스비가 반환된다
**Check**: `estimatedGas` 필드 확인 (~50,000-80,000 gas)

### Step 4: 실제 NFT 자기 전송
**Action**: dry-run 확인 후 실제 NFT 자기 전송을 실행한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "NFT_TRANSFER",
    "to": "<MY_ADDRESS>",
    "contractAddress": "<CONTRACT_ADDRESS>",
    "tokenId": "<TOKEN_ID>",
    "network": "ethereum-sepolia"
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
**Expected**: 트랜잭션 상태가 `confirmed` 또는 `success`로 전환된다
**Check**: `status` 필드 확인

### Step 6: NFT 소유권 재확인
**Action**: NFT 목록을 재조회하여 여전히 소유하고 있는지 확인한다 (자기 전송이므로).
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/nfts?network=ethereum-sepolia \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 동일한 NFT가 여전히 목록에 존재한다
**Check**: Step 1에서 확인한 NFT가 여전히 보유 목록에 있는지 확인

### Step 7: (선택) ERC-1155 NFT 전송
**Action**: ERC-1155 NFT를 보유한 경우, amount 파라미터를 포함하여 자기 전송을 테스트한다.
```bash
curl -s -X POST http://localhost:3100/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "NFT_TRANSFER",
    "to": "<MY_ADDRESS>",
    "contractAddress": "<ERC1155_CONTRACT>",
    "tokenId": "<TOKEN_ID>",
    "amount": "1",
    "network": "ethereum-sepolia"
  }'
```
**Expected**: 200 OK, ERC-1155 전송 성공
**Check**: ERC-1155의 경우 `amount` 파라미터가 정상 처리되는지 확인

## Verification
- [ ] NFT 목록 조회 성공 (최소 1개 NFT 확인)
- [ ] NFT 상세 조회 성공 (contractAddress, tokenId, tokenType 확인)
- [ ] Dry-run 성공 (예상 가스비 반환)
- [ ] NFT_TRANSFER 트랜잭션 생성 성공 (txId, txHash 반환)
- [ ] 트랜잭션 컨펌 완료 (status: confirmed/success)
- [ ] 자기 전송 후 NFT 소유권 유지 확인

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| ERC-721 self-transfer | ethereum-sepolia | ~50,000 | ~$0.02 |
| ERC-1155 self-transfer (선택) | ethereum-sepolia | ~60,000 | ~$0.02 |
| **Total** | | | **~$0.02-0.04** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| No NFTs found | Sepolia NFT 미보유 | Prerequisites의 NFT 획득 방법 참고 |
| Insufficient ETH for gas | Sepolia ETH 부족 | Faucet에서 Sepolia ETH 충전 |
| ERC-721: not owner | NFT 소유권 불일치 | NFT contractAddress와 tokenId 정확성 확인 |
| ERC-1155: insufficient balance | ERC-1155 수량 부족 | 보유 수량 확인 후 amount 조정 |
| NFT indexer timeout | NFT 인덱서(Alchemy/Helius) 응답 지연 | 잠시 대기 후 재시도 |
