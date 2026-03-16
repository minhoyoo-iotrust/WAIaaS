# 361 — Admin UI NFT Indexer API 키 설정이 반영되지 않음 (2중 결함)

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **발견일:** 2026-03-16

## 현상

Admin UI System > General > NFT Indexer 섹션에서 Alchemy/Helius API 키를 입력하고 Set 버튼을 눌러도 "Not configured" 상태가 유지됨. 키 저장은 성공하나 UI 리페치 시 목록에서 누락.

## 원인

### 결함 1: GET /v1/admin/api-keys에서 NFT Indexer 누락

`GET /v1/admin/api-keys` 엔드포인트가 `ActionProviderRegistry.listProviders()`에 등록된 프로바이더만 반환. NFT 인덱서(alchemy_nft, helius)는 `INftIndexer` 인프라로 구현되어 ActionProviderRegistry에 미등록.

- PUT 저장은 성공 (`actions.alchemy_nft_api_key`에 정상 저장)
- 저장 후 GET 리페치 시 alchemy_nft가 목록에 없어 UI가 "Not configured"로 복귀

### 결함 2: Helius 설정 키 이름 불일치

| 위치 | 키 |
|------|-----|
| UI provider name | `helius` → PUT 시 `actions.helius_api_key`로 저장 |
| setting-keys.ts | `actions.helius_das_api_key`로 등록 |
| NftIndexerClient | `actions.helius_das_api_key`로 조회 |

UI가 `helius_api_key`로 저장하지만 백엔드는 `helius_das_api_key`를 찾으므로 키가 전달되지 않음.

## 수정 방안

1. **결함 1**: GET /v1/admin/api-keys 응답에 NFT 인덱서 키를 포함하도록 수정 (ActionProviderRegistry 외 NFT 인덱서 키도 반환)
2. **결함 2**: UI provider name을 `helius_das`로 변경하거나, setting-keys.ts에서 `actions.helius_api_key`로 통일

## 대상 파일

- `packages/daemon/src/api/routes/admin-settings.ts` — GET /v1/admin/api-keys 응답에 NFT 키 포함
- `packages/admin/src/pages/system.tsx` — NFT Indexer provider name 정의
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` — Helius 설정 키 이름
- `packages/daemon/src/infrastructure/nft/nft-indexer-client.ts` — Helius API 키 조회

## 테스트 항목

- Alchemy NFT API 키 저장 후 GET /v1/admin/api-keys에 alchemy_nft가 포함되는지 확인
- Helius API 키 저장 후 NftIndexerClient가 해당 키를 정상 조회하는지 확인
- Admin UI에서 키 저장 후 "Configured" 상태로 전환되는지 확인
