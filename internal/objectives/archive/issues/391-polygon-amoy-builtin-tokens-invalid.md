# 391 — Polygon Amoy 빌트인 토큰 3개 컨트랙트 미존재로 매 요청마다 에러 로그 발생

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** FIXED
- **마일스톤:** (미정)
- **발견일:** 2026-03-19

## 현상

`GET /v1/wallet/balance` 및 `GET /v1/wallet/assets` 호출 시 polygon-amoy 네트워크에서 다음 3개 토큰의 `balanceOf` 호출이 매번 실패한다:

| 토큰 | 주소 | 오류 |
|------|------|------|
| AAVE | `0x1558c6FadDe1bEaf0f6628BDd1DFf3461185eA24` | `balanceOf returned no data ("0x")` |
| DAI | `0xc8c0Cf9436F4862a8F60Ce680Ca5a9f0f99b5ded` | `balanceOf returned no data ("0x")` |
| USDT | `0x1fdE0eCc619726f4cD597887C9F3b4c8740e19e2` | `balanceOf returned no data ("0x")` |

viem 에러 메시지: "The address is not a contract" — 해당 주소에 배포된 컨트랙트가 없음.

## 영향

- **모든 지갑**의 polygon-amoy 잔액/자산 조회 시 발생 (지갑당 3개 토큰 × 2단계 시도 = 6회 에러 로그)
- multicall 실패 → 개별 readContract fallback → 또 실패 → skip — 불필요한 2단계 fallback으로 응답 시간 증가
- 데몬 로그가 에러로 오염되어 실제 문제 식별이 어려움

## 원인

`packages/daemon/src/infrastructure/token-registry/builtin-tokens.ts`의 `polygon-amoy` 항목에 등록된 토큰 주소가 Aave TestnetMintableERC20 기반이었으나, Polygon Amoy 테스트넷 리셋/재배포로 해당 컨트랙트가 더 이상 존재하지 않음.

## 수정 방안

### A. 즉시 수정 — 미존재 토큰 제거 (권장)

`builtin-tokens.ts`에서 polygon-amoy의 AAVE, DAI, USDT 3개 항목 제거. 7토큰 → 4토큰(USDC, WETH, LINK, WPOL).

### B. 방어적 개선 — 컨트랙트 존재 확인 캐싱

EVM adapter에서 `balanceOf` 실패 시 해당 토큰 주소를 "invalid contract" 캐시에 추가하여, 이후 조회에서 반복 시도하지 않도록 함. 이는 사용자 등록 토큰이나 향후 다른 테스트넷 리셋에도 대응 가능.

### C. 전체 테스트넷 토큰 검증

다른 테스트넷(ethereum-sepolia, arbitrum-sepolia, optimism-sepolia, base-sepolia) 빌트인 토큰도 현재 유효한지 확인. 현재 데몬 로그에는 polygon-amoy만 발생하고 있으나, 테스트넷 특성상 주기적 검증 필요.

### D. 영향받는 네트워크/토큰 전체 분석

| 네트워크 | 토큰 수 | 확인된 상태 |
|----------|---------|-------------|
| ethereum-sepolia | 11 | 로그 에러 없음 — 정상 추정 |
| polygon-amoy | 7 → **3개 미존재** | AAVE, DAI, USDT 컨트랙트 없음 |
| arbitrum-sepolia | 4 | 로그 에러 없음 — 정상 추정 |
| optimism-sepolia | 3 | 로그 에러 없음 — 정상 추정 |
| base-sepolia | 7 | 로그 에러 없음 — 정상 추정 |
| 메인넷 5개 | 3~6 | 메인넷은 리셋 없으므로 안정 |

## 수정 대상 파일

- `packages/daemon/src/infrastructure/token-registry/builtin-tokens.ts` — polygon-amoy 항목 수정
- (선택) `packages/adapters/evm/src/adapter.ts` — invalid contract 캐싱 로직 추가

## 테스트 항목

1. **유닛 테스트**: `getBuiltinTokens('polygon-amoy')` 반환 토큰 수 검증 (7→4)
2. **유닛 테스트**: EVM adapter에서 `balanceOf` 실패 시 에러 로그 확인 및 skip 동작 기존 테스트 유지
3. **통합 테스트**: polygon-amoy 지갑의 `/v1/wallet/assets` 호출 시 에러 로그 없이 정상 응답 확인
4. (B안 적용 시) **유닛 테스트**: invalid contract 캐시에 추가된 토큰은 재시도하지 않음 검증
