# 382: DeFi 포지션 해제 UAT 시나리오 누락 — Lido 언스테이킹 없음, Hyperliquid/Polymarket 포지션 클로즈 없음

- **유형:** MISSING
- **심각도:** MEDIUM
- **상태:** FIXED
- **마일스톤:** v32.8
- **수정일:** 2026-03-18
- **발견일:** 2026-03-17
- **발견 경로:** agent-uat/defi/ 시나리오 분석

## 현상

DeFi UAT 시나리오에서 포지션 진입(스테이킹, 공급, 매수)은 존재하지만 포지션 해제(언스테이킹, 출금, 매도) 시나리오가 누락되거나 불완전함.

### 완전 누락

| 시나리오 | 프로토콜 | 진입 액션 | 누락된 해제 액션 |
|----------|----------|-----------|------------------|
| defi-05 | Lido | `lido-stake` (ETH → stETH) | `lido-unstake` (stETH → ETH) 시나리오 없음 |

### 부분 누락 (주문 취소만 있고 포지션 클로즈 없음)

| 시나리오 | 프로토콜 | 있는 것 | 누락된 것 |
|----------|----------|---------|-----------|
| defi-11 | Hyperliquid | order 생성 + order 취소 | 포지션 클로즈(perp close, spot 매도) |
| defi-13 | Polymarket | order 매수 + order 취소 | 아웃컴 토큰 매도, 포지션 정산 |

### 정상 (참고)

| 시나리오 | 프로토콜 | 해제 액션 | 비고 |
|----------|----------|-----------|------|
| defi-06 | Jito | `jito-unstake` (Step 6) | optional |
| defi-07 | Aave V3 | `aave-withdraw` (Step 9) | optional |
| defi-08 | Kamino | `kamino-withdraw` (Step 7) | optional |
| defi-09 | Pendle | `pendle-redeem-pt` (Step 8) | optional |
| defi-10 | Drift | `drift-withdraw` (Step 9) | optional |

## 영향

- Lido 언스테이킹 플로우가 메인넷에서 검증되지 않음
- Hyperliquid perp 포지션 청산(반대 매매) 시나리오 미검증
- Polymarket 결과 확정 후 토큰 정산 플로우 미검증
- 포지션 해제 시 발생할 수 있는 에러(잔액 부족, 쿨다운 기간, 오픈 포지션 충돌 등) 사전 발견 불가

## 수정 방향

### defi-05 (Lido)
- `lido-unstake` 스텝 추가: stETH → ETH 언스테이킹 시뮬레이트
- Lido withdrawal 큐 대기 시간 안내 포함

### defi-11 (Hyperliquid)
- Perp 포지션 클로즈 스텝 추가: 반대 방향 주문으로 포지션 청산
- Spot 매도 스텝 추가: 보유 토큰 매도

### defi-13 (Polymarket)
- 아웃컴 토큰 매도 스텝 추가: 보유 포지션 시장 매도
- (선택) 결과 확정 후 정산(redeem) 플로우

## 수정 대상 파일

- `agent-uat/defi/lido-staking.md` — 언스테이킹 스텝 추가
- `agent-uat/defi/hyperliquid-mainnet.md` — 포지션 클로즈 스텝 추가
- `agent-uat/defi/polymarket-prediction.md` — 토큰 매도/정산 스텝 추가

## 테스트 항목

- [ ] Lido: stETH → ETH 언스테이킹 시뮬레이트 성공 확인
- [ ] Hyperliquid: perp 포지션 오픈 → 반대 매매로 클로즈 플로우 검증
- [ ] Hyperliquid: spot 토큰 매수 → 매도 플로우 검증
- [ ] Polymarket: 아웃컴 토큰 매수 → 매도 플로우 검증
- [ ] 각 해제 시나리오의 에러 핸들링 확인 (쿨다운, 잔액 부족 등)
