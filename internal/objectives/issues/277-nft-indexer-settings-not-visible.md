# #277 — Admin UI NFT Indexer 설정 섹션 미표시 — API 키 직접 입력 불가

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **발견일:** 2026-03-07

## 현상

Admin UI Settings 페이지에서 NFT Indexer(Alchemy NFT / Helius) 설정 섹션이 표시되지 않는다. ERC-8128 섹션 다음에 바로 Danger Zone이 나타나며, NFT 인덱서 API 키를 설정할 방법이 없다.

## 원인

`NftIndexerSection` 컴포넌트(settings.tsx:889)의 렌더링 로직에 2가지 문제가 있다:

### 1. API Keys 미등록 시 NFT Indexer도 미표시

`NftIndexerSection`은 `apiKeys` 시그널에서 `alchemy_nft` / `helius` 프로바이더를 필터링한다:

```tsx
// settings.tsx:890
const indexerKeys = apiKeys.value.filter((k) => k.providerName in NFT_INDEXER_PROVIDERS);
```

NFT 인덱서 프로바이더가 `ActionProviderRegistry`에 등록되지 않은 환경(NFT 액션 미활성)에서는 API Keys 목록에 `alchemy_nft` / `helius`가 포함되지 않아 `indexerKeys`가 빈 배열이 된다.

### 2. apiKeysLoading 타이밍 문제

`apiKeysLoading`이 `true`인 동안(892행 조건 불충족) 927행의 `if (indexerKeys.length === 0) return null`에 도달하여 아무것도 렌더링하지 않는다.

### 3. "configure via API Keys above" 안내가 무의미

미등록 상태에서 보여주는 안내 메시지가 "configure via API Keys above"인데, `ApiKeysSection`도 `apiKeys.value.length === 0`이면 `return null`이므로 "above"에 해당하는 섹션이 존재하지 않는다.

## 수정 방향

NFT Indexer 섹션에 **API 키 직접 입력 폼**을 제공하여, API Keys 목록에 프로바이더가 미등록이어도 독립적으로 키를 설정할 수 있도록 한다:

1. `NftIndexerSection`이 항상 렌더링되도록 가드 조건 수정
2. Alchemy NFT / Helius 각각에 대해 API 키 입력 필드 + Save 버튼 직접 제공
3. "configure via API Keys above" 참조 안내 제거

## 영향 범위

- `packages/admin/src/pages/settings.tsx` — `NftIndexerSection` 컴포넌트
- NFT 조회 기능 전체 (API 키 미설정 시 인덱서 사용 불가)

## 테스트 항목

- [ ] NFT 액션 프로바이더 미활성 상태에서도 NFT Indexer 섹션이 표시되는지 확인
- [ ] Alchemy NFT API 키 직접 입력 및 저장이 정상 동작하는지 확인
- [ ] Helius API 키 직접 입력 및 저장이 정상 동작하는지 확인
- [ ] API 키 저장 후 Configured 배지가 표시되는지 확인
- [ ] `settings-nft-indexer.test.tsx` 유닛 테스트 갱신
