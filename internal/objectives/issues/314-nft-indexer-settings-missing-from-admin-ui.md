# #314 — NFT Indexer 설정이 Admin UI에서 접근 불가

- **유형:** MISSING
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-03-10

## 현상

Admin UI에서 NFT Indexer API 키(Alchemy NFT, Helius DAS)를 설정할 수 없음.
REST API(`PUT /v1/admin/settings` 또는 `PUT /v1/admin/api-keys/:provider`)로만 설정 가능.

## 원인

Settings 페이지가 기능별 페이지로 분리(v2.3)되면서 `NftIndexerSection`이 레거시 `settings.tsx`에만 남아있고, 분리된 활성 페이지로 이전되지 않음.

- `settings.tsx:873`: `NftIndexerSection()` 함수 존재 (Alchemy NFT + Helius 키 관리 UI)
- `/settings` 라우트: `layout.tsx:114`에서 `/dashboard`로 리다이렉트 → 접근 불가
- 활성 페이지(system.tsx, security.tsx 등): NFT Indexer 관련 UI 없음

### 누락 설정 키

| 키 | 용도 |
|---|---|
| `actions.alchemy_nft_api_key` | Alchemy NFT API (EVM ERC-721/1155) |
| `actions.helius_das_api_key` | Helius DAS API (Solana Metaplex) |
| `actions.nft_indexer_cache_ttl_sec` | NFT 메타데이터 캐시 TTL |

## 수정 방안

System 페이지에 NFT Indexer 섹션 추가. `settings.tsx`의 `NftIndexerSection` 로직을 `system.tsx`로 이전.

## 재발 방지

daemon `setting-keys.ts`에 정의된 모든 사용자 설정 키가 활성 Admin UI 페이지 소스에서 참조되는지 검증하는 단위 테스트 추가:

- **테스트 위치**: `packages/admin/src/__tests__/settings-completeness.test.ts`
- **검증 방법**: `setting-keys.ts`의 `SETTING_DEFINITIONS` 파싱 → 각 키(또는 short key)가 활성 페이지 소스(`system.tsx`, `security.tsx`, `wallets.tsx` 등)에서 참조되는지 정적 문자열 매칭
- **제외 목록**: `rpc_pool`(JSON 배열 관리), `position_tracker`(내부 설정) 등 의도적으로 API-only인 카테고리는 사유와 함께 제외
- **효과**: 새 설정 키 추가 시 Admin UI 미반영 감지, 페이지 분리/재구성 시 누락 감지

## 테스트 항목

1. **단위 테스트**: settings-completeness — 모든 사용자 설정 키가 활성 Admin UI 페이지에서 참조되는지 검증
2. **단위 테스트**: System 페이지에 NFT Indexer 섹션이 렌더링되는지 확인
3. **단위 테스트**: Alchemy NFT / Helius API 키 Set/Change/Delete 동작 확인
