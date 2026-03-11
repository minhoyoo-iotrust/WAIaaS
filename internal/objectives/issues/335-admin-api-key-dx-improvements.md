# #335 Admin UI 레거시 Settings 페이지 제거 + API 키 발급 링크 추가

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **발견:** v31.9
- **상태:** FIXED
- **해결일:** 2026-03-11

## 설명

Admin UI의 레거시 Settings 페이지(`settings.tsx`)가 라우터에서 이미 제거되어 Dashboard로 리다이렉트되지만, 컴포넌트와 테스트 파일이 그대로 남아있다. 13개 섹션 중 12개는 이미 전용 페이지로 이관되었으나, Smart Account 글로벌 기본 키만 유일하게 다른 곳에 존재하지 않는다.

레거시 코드가 남아있으면 신규 기능 추가 시 잘못된 파일에 코드가 추가되는 혼란을 유발한다.

## 문제 1: 레거시 Settings 페이지 잔존

### 현재 settings.tsx 섹션별 이관 현황

| # | 섹션 | 이관 대상 | 상태 |
|---|------|----------|------|
| 1 | Notification Settings | Notifications 페이지 | 이관 완료 |
| 2 | RPC Settings | System 페이지 | 이관 완료 |
| 3 | Security Settings | Security 페이지 | 이관 완료 |
| 4 | WalletConnect | Wallets 페이지 탭 | 이관 완료 |
| 5 | Telegram Bot | Notifications 페이지 | 이관 완료 |
| 6 | Signing SDK | Human Wallet Apps 페이지 | 이관 완료 |
| 7 | **Smart Account 글로벌 키** | **없음 (여기에만 존재)** | **미이관** |
| 8 | Daemon | System 페이지 | 이관 완료 |
| 9 | Display | System 페이지 | 이관 완료 |
| 10 | API Keys | DeFi(Actions) 페이지 | 이관 완료 |
| 11 | NFT Indexer | System 페이지 | 이관 완료 |
| 12 | AutoStop | System 페이지 | 이관 완료 |
| 13 | Balance Monitoring | Notifications 페이지 | 이관 완료 |
| — | Kill Switch | Security 페이지 | 이관 완료 |
| — | Invalidate Tokens | Security 페이지 | 이관 완료 |
| — | Shutdown Daemon | Security 페이지 | 이관 완료 |

### 제거 대상 파일

- `packages/admin/src/pages/settings.tsx` — 레거시 페이지 컴포넌트
- `packages/admin/src/__tests__/settings.test.tsx` — settings 페이지 테스트
- `packages/admin/src/__tests__/settings-coverage.test.tsx` — settings 커버리지 보충 테스트
- `packages/admin/src/__tests__/settings-nft-indexer.test.tsx` — settings NFT Indexer 테스트

### 유지 대상 (다른 페이지에서 공유 사용)

- `packages/admin/src/utils/settings-helpers.ts` — 10개 페이지에서 import
- `packages/admin/src/components/settings-search.tsx` — 글로벌 설정 검색 (Cmd+K)
- `packages/admin/src/__tests__/settings-search.test.tsx` — 검색 기능 테스트

## 문제 2: Smart Account 글로벌 키 이관 필요

Smart Account 글로벌 기본 API 키(Pimlico, Alchemy)를 System 페이지로 이동해야 한다. System에 NFT Indexer, Oracle(CoinGecko) 등 외부 서비스 API 키가 모여있으므로 일관적이다.

| 프로바이더 | 이동 대상 | 발급 URL |
|-----------|----------|----------|
| Pimlico | System 페이지 | https://dashboard.pimlico.io |
| Alchemy | System 페이지 | https://dashboard.alchemy.com |

## 문제 3: API 키 발급처 안내 링크 누락

### Actions 페이지 (`actions.tsx`)

| 프로바이더 | 발급 URL |
|-----------|----------|
| Jupiter Swap | https://portal.jup.ag |
| 0x Swap | https://dashboard.0x.org |

### System 페이지 (`system.tsx`)

| 프로바이더 | 발급 URL |
|-----------|----------|
| Alchemy NFT | https://dashboard.alchemy.com |
| Helius | https://dashboard.helius.dev |

### 이미 링크가 있는 항목 (참고)

- CoinGecko Oracle: "Get your API key from CoinGecko API Dashboard" (system.tsx)
- WalletConnect: "Get your project ID from cloud.walletconnect.com" (wallets.tsx)
- Smart Account AA Provider: Wallet 상세 페이지에서 대시보드 링크 제공 (wallets.tsx)

## 해결 방안

1. Smart Account 글로벌 키 섹션을 System 페이지로 이동 + 발급 링크 추가
2. Actions 페이지: API Key 섹션에 발급 URL 안내 링크 추가
3. System 페이지: NFT Indexer 섹션에 발급 링크 추가
4. `settings.tsx` 및 관련 테스트 파일 4개 제거
5. 설정 검색(`settings-search.tsx`)에서 settings 페이지 참조가 있다면 갱신

## 테스트 항목

- [ ] System 페이지: Smart Account 글로벌 키 섹션 표시 확인 (Pimlico API Key, Alchemy API Key, Policy ID)
- [ ] System 페이지: Pimlico 발급 링크 (dashboard.pimlico.io) 표시 확인
- [ ] System 페이지: Alchemy AA 발급 링크 (dashboard.alchemy.com) 표시 확인
- [ ] System 페이지: NFT Indexer Alchemy 발급 링크 표시 확인
- [ ] System 페이지: NFT Indexer Helius 발급 링크 표시 확인
- [ ] Actions 페이지: Jupiter API Key 발급 링크 (portal.jup.ag) 표시 확인
- [ ] Actions 페이지: 0x API Key 발급 링크 (dashboard.0x.org) 표시 확인
- [ ] `/settings` URL 접근 시 Dashboard 리다이렉트 유지 확인
- [ ] `settings.tsx` 및 settings 전용 테스트 3개 파일 제거 확인
- [ ] `settings-helpers.ts`, `settings-search.tsx` 정상 동작 확인
- [ ] 설정 검색(Cmd+K)에서 Smart Account 검색 시 System 페이지로 이동 확인
- [ ] 모든 링크가 `target="_blank" rel="noopener noreferrer"`로 새 탭에서 열림
- [ ] 기존 커버리지 임계값 유지 (제거된 테스트 커버리지를 다른 테스트로 보전)
