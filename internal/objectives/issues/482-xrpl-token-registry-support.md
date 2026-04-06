# 482 — XRPL 토큰 레지스트리 지원

- **유형:** MISSING
- **심각도:** MEDIUM
- **상태:** OPEN
- **발견일:** 2026-04-07
- **발견 경위:** Admin UI Tokens 페이지 네트워크 드롭다운에 XRPL 네트워크가 없음을 확인

## 증상

- Admin UI > Tokens 페이지 네트워크 드롭다운에 XRPL 네트워크(xrpl-mainnet, xrpl-testnet, xrpl-devnet)가 표시되지 않음
- 빌트인 토큰 프리셋에 XRPL 토큰(RLUSD 등)이 없음
- REST API `GET /v1/tokens?network=xrpl-mainnet` 호출 시 `validateEvmNetwork` 검증 실패

## 원인

토큰 레지스트리 시스템이 EVM (ERC-20) 전용으로 설계되어 있음:
1. `builtin-tokens.ts` — EVM 네트워크만 포함
2. `tokens.ts` (API route) — `validateEvmNetwork()` 로 XRPL 네트워크 거부
3. `tokens.tsx` (Admin UI) — `EVM_NETWORK_TYPES`만 드롭다운에 표시

XRPL은 ERC-20이 아닌 Issued Currency (Trust Line 기반) 모델을 사용하지만, 토큰 레지스트리의 `address` 필드에 `currency:issuer` 형식을 저장하면 기존 구조를 확장할 수 있음.

## 수정 계획

| 파일 | 변경 내용 |
|------|-----------|
| `packages/daemon/src/infrastructure/token-registry/builtin-tokens.ts` | XRPL 빌트인 토큰 추가 (RLUSD 등), `currency+issuer` → address 매핑 |
| `packages/daemon/src/api/routes/tokens.ts` | `validateEvmNetwork` → XRPL 네트워크 허용, resolve 엔드포인트 XRPL 분기 |
| `packages/daemon/src/infrastructure/token-registry/token-registry-service.ts` | XRPL `currency:issuer` 형식 지원 확인 (이미 string 기반) |
| `packages/admin/src/pages/tokens.tsx` | 드롭다운에 XRPL 네트워크 포함 |

- DB 스키마 변경 없음 (token_registry.address 컬럼에 string 저장)
- 예상 변경: 4~5파일, 테스트 포함 ~200줄 이내

## 테스트 항목

- [ ] `GET /v1/tokens?network=xrpl-mainnet` 빌트인 RLUSD 반환 확인
- [ ] `POST /v1/tokens` XRPL 커스텀 토큰 추가/삭제
- [ ] Admin UI 드롭다운에 XRPL 네트워크 표시 확인
- [ ] 기존 EVM 토큰 레지스트리 기능 정상 동작 확인 (회귀 테스트)
