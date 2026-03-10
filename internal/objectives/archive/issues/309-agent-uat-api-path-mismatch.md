# #309 — Agent UAT 시나리오 문서 API 경로 불일치 2건 (추가)

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** FIXED
- **수정일:** 2026-03-10
- **마일스톤:** —

## 현상

Agent UAT 시나리오 문서에서 사용하는 API 경로가 실제 데몬 엔드포인트와 불일치한다. #304에서 3건을 수정했으나 추가로 2건이 발견되었다.

### 불일치 목록

| # | 시나리오 문서 경로 | 실제 엔드포인트 | 영향 시나리오 |
|---|-------------------|---------------|-------------|
| 1 | `GET /v1/wallets/:id/balance?network=...` | `GET /v1/wallet/balance?walletId=...&network=...` | testnet-02~08, mainnet 전체, defi 전체, advanced 전체 |
| 2 | `POST /v1/transactions` | `POST /v1/transactions/send` | testnet-02~08, mainnet 전체, defi 일부 |

## 원인

- #304에서 `dry-run→simulate`, `value→amount`, `token 문자열→객체` 3건만 수정
- 잔액 조회와 트랜잭션 전송 경로 불일치는 발견되지 않음
- 시나리오 작성 시 OpenAPI 스펙 대신 추정 경로 사용

## 분석

### 영향 범위

1. **`/v1/wallets/:id/balance`** → `/v1/wallet/balance?walletId=...`
   - RESTful 리소스 경로(`/wallets/:id/balance`)가 아닌 쿼리 파라미터 방식(`/wallet/balance?walletId=...`) 사용
   - testnet, mainnet, defi, advanced 카테고리의 거의 모든 시나리오에 잔액 조회 Step 존재
   - 관련 시나리오: ~30개+

2. **`POST /v1/transactions`** → `/v1/transactions/send`
   - 트랜잭션 전송 경로에 `/send` 서브경로 필요
   - 관련 시나리오: ~25개+

### 추가 확인 결과

- `GET /v1/wallets/:id/nfts` → `GET /v1/wallet/nfts?walletId=...` 확인, 3개 파일 6건 수정
- `GET /v1/wallets/:id/transactions?direction=incoming` → `GET /v1/wallet/incoming?walletId=...` 확인, 2개 파일 4건 수정
- `GET /v1/wallets/:id/defi/positions` → `GET /v1/wallet/positions?walletId=...` 확인, 5개 파일 9건 수정
- Hyperliquid `/v1/wallets/:walletId/hyperliquid/*` 경로는 실제 라우트와 일치 (변경 불필요)
- Admin CRUD `/v1/wallets/:id` GET/PATCH/DELETE 경로는 masterAuth 전용으로 정상

## 수정 내역

1. **잔액 조회** (26개 파일, 44건): `/v1/wallets/<ID>/balance?network=` → `/v1/wallet/balance?walletId=<ID>&network=`
2. **트랜잭션 전송** (29개 파일, 43건): `POST /v1/transactions` → `POST /v1/transactions/send`
3. **NFT 조회** (3개 파일, 6건): `/v1/wallets/<ID>/nfts` → `/v1/wallet/nfts?walletId=<ID>`
4. **수신 트랜잭션** (2개 파일, 4건): `/v1/wallets/<ID>/transactions?direction=incoming` → `/v1/wallet/incoming?walletId=<ID>`
5. **DeFi 포지션** (5개 파일, 9건): `/v1/wallets/<ID>/defi/positions` → `/v1/wallet/positions?walletId=<ID>`

총 수정: 35+ 파일, 106건

## 테스트 항목

- [x] 전체 시나리오 파일에서 `/v1/wallets/:id/balance` 패턴 0건 확인
- [x] 전체 시나리오 파일에서 `POST /v1/transactions` (send 없이) 패턴 0건 확인
- [x] 전체 시나리오 파일에서 `/v1/wallets/:id/nfts` (session-auth) 패턴 0건 확인
- [x] 전체 시나리오 파일에서 `/v1/wallets/:id/transactions?direction=incoming` 패턴 0건 확인
- [x] 전체 시나리오 파일에서 `/v1/wallets/:id/defi/positions` 패턴 0건 확인
- [ ] 수정된 경로로 실제 API 호출 성공 확인 (testnet-02 재실행)
- [ ] CI `validate-uat-scenarios.sh`에 API 경로 패턴 검증 추가
