# #177 지갑 상세 트랜잭션 목록 금액이 최소 단위(lamports/wei)로 표시

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v28.5
- **상태:** FIXED

---

## 증상

Admin UI 지갑 상세 페이지 > Transactions 탭에서 AMOUNT 컬럼이 raw 단위로 표시:
- `4000000000` (Solana, 실제 4 SOL)
- `2000000000` (Solana, 실제 2 SOL)

사람이 읽기 어렵고, 금액 규모를 직관적으로 파악할 수 없음.

---

## 기대 동작

| 현재 표시 | 기대 표시 |
|----------|----------|
| 4000000000 | 4 SOL |
| 2000000000 | 2 SOL |
| 1000000000000000000 (ETH) | 1 ETH |
| 1000000 (USDC) | 1 USDC |

- 네이티브 토큰: 체인별 decimals 적용 (SOL=9, ETH=18)
- ERC-20/SPL 토큰: 토큰 decimals 적용 + 토큰 심볼 표시
- SIGN, CONTRACT_CALL 등 금액 없는 타입: 기존 `—` 유지

---

## 참고

- #168 (FIXED): Transactions 페이지(전체 목록)에서 동일 이슈 수정 완료
- 지갑 상세 페이지의 트랜잭션 목록은 별도 컴포넌트로, #168 수정이 적용되지 않은 것으로 추정
- #168에서 사용한 포맷 함수를 재사용하면 일관성 확보 가능

---

## 수정 방안

- #168에서 구현한 금액 포맷 로직(formatHumanAmount 또는 유사 함수)을 지갑 상세 트랜잭션 테이블에도 적용
- 체인/네트워크 정보를 활용하여 decimals + 심볼 결정

---

## 관련 파일

- `packages/admin/src/pages/wallet-detail.tsx` — Transactions 탭 테이블 렌더링
- #168 수정에서 사용한 포맷 유틸리티 함수

## 관련 이슈

- #168: Admin UI 트랜잭션 금액이 raw 단위로 표시 (v28.4 FIXED — 전체 목록 페이지만 수정)

---

## 테스트 항목

- [ ] SOL 전송 금액이 decimals 9 적용되어 표시되는지 확인
- [ ] ETH 전송 금액이 decimals 18 적용되어 표시되는지 확인
- [ ] ERC-20/SPL 토큰 전송 시 토큰 심볼과 decimals가 올바르게 표시되는지 확인
- [ ] SIGN, CONTRACT_CALL 등 금액 없는 타입에서 `—` 유지 확인
