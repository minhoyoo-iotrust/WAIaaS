---
id: "admin-07"
title: "Admin NFT 탭 검증"
category: "admin"
network: ["ethereum-mainnet", "solana-mainnet"]
requires_funds: false
estimated_cost_usd: "0"
risk_level: "none"
tags: ["admin", "nft", "tab", "onchain", "indexer"]
---

# Admin NFT 탭 검증

## Metadata
- **ID**: admin-07
- **Category**: admin
- **Network**: ethereum-mainnet, solana-mainnet
- **Requires Funds**: No
- **Estimated Cost**: ~$0
- **Risk Level**: none -- 조회만 수행

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] masterAuth 인증 완료
- [ ] NFT 보유 지갑 (없으면 빈 목록 확인으로 SKIP 가능)
- [ ] NFT 인덱서 설정 (Alchemy 또는 Helius)

## Scenario Steps

### Step 1: NFT 인덱서 상태 확인
**Action**: NFT 인덱서(Alchemy/Helius)가 설정되어 있는지 확인한다.
```bash
curl -s http://localhost:3100/v1/admin/settings \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: 200 OK, NFT 인덱서 관련 설정이 포함된다
**Check**: Alchemy API Key 또는 Helius API Key 설정 여부 확인. 미설정 시 NFT 조회 불가 안내

### Step 2: 지갑별 NFT 조회
**Action**: NFT 보유 지갑에서 NFT 목록을 조회한다.
```bash
curl -s http://localhost:3100/v1/wallets/<WALLET_ID>/nfts?network=ethereum-mainnet \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, NFT 목록이 반환된다 (보유 시) 또는 빈 배열 (미보유 시)
**Check**: NFT 항목 수, 각 항목의 기본 정보(name, collection, tokenId)

### Step 3: Admin UI NFT 탭 데이터 비교
**Action**: Admin UI의 NFT 탭 표시 데이터와 API 조회 결과를 비교한다.
- 사용자에게 Admin UI `/admin/nft` 페이지 확인 요청
- API 결과의 NFT 수와 Admin UI 표시 수 비교

**Expected**: API 조회 결과와 Admin UI 표시가 일치한다
**Check**: NFT 수, 이름, 컬렉션 정보 일치 확인

### Step 4: NFT 메타데이터 확인
**Action**: 개별 NFT의 메타데이터를 확인한다.
- 이름 (name)
- 컬렉션 (collection)
- 이미지 URL (image)
- CAIP-19 식별자 (예: eip155:1/erc721:0x.../123)

**Expected**: 메타데이터가 정확하고 CAIP-19 형식을 준수한다
**Check**: CAIP-19 네임스페이스가 erc721/erc1155/metaplex 중 하나인지 확인

### Step 5: 페이지네이션 확인
**Action**: NFT가 다수인 경우 페이지네이션 동작을 확인한다.
```bash
curl -s "http://localhost:3100/v1/wallets/<WALLET_ID>/nfts?network=ethereum-mainnet&limit=5&offset=0" \
  -H 'Authorization: Bearer <session-token>'
```
**Expected**: 200 OK, limit/offset에 따른 페이지네이션이 동작한다
**Check**: NFT 수가 5개 이하로 반환되는지, 다음 페이지 정보가 있는지 확인. NFT 미보유 시 SKIP

## Verification
- [ ] NFT 인덱서 설정 확인 (Alchemy/Helius)
- [ ] NFT 조회 API 정상 응답 (200)
- [ ] API 결과와 Admin UI NFT 탭 표시 일치
- [ ] NFT 메타데이터 정확 (name, collection, CAIP-19)
- [ ] 페이지네이션 동작 확인 (다수 NFT 보유 시)

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| API queries only | ethereum-mainnet, solana-mainnet | 0 | $0 |
| **Total** | | | **$0** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 인덱서 미설정 | Alchemy/Helius API Key 없음 | Admin Settings에서 인덱서 API Key 설정 |
| 캐시 만료 | NFT 메타데이터 캐시 TTL 24h 초과 | 캐시 리프레시 대기 또는 강제 갱신 |
| 네트워크별 인덱서 불일치 | EVM과 Solana 인덱서 설정 차이 | 각 네트워크에 맞는 인덱서 설정 확인 |
| CAIP-19 형식 오류 | NFT 식별자 파싱 오류 | NFT 컨트랙트 주소와 tokenId 확인 |
| 빈 목록 표시 | NFT 미보유 | 정상 동작 -- 빈 목록이 에러 없이 표시되는지 확인 |
