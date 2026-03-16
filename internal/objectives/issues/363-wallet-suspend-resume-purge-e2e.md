# 363 — Wallet Suspend/Resume/Purge E2E 테스트 추가

- **유형:** MISSING
- **심각도:** MEDIUM
- **상태:** OPEN
- **발견일:** 2026-03-16

## 현상

Wallet Suspend/Resume/Purge 기능에 단위/통합 테스트(49개)는 있으나 E2E 시나리오가 없음. 세션 차단/복원, DB 완전 삭제 등 연쇄 효과에 대한 E2E 검증 부재.

## 수정 방안

packages/e2e-tests에 Wallet lifecycle E2E 시나리오 추가:
1. Suspend → 해당 지갑 세션으로 API 호출 시 차단 확인
2. Resume → 세션 복원 후 API 호출 성공 확인
3. Purge → DB에서 지갑 및 관련 데이터 완전 삭제 확인

## 대상 파일

- `packages/e2e-tests/src/scenarios/` — 신규 E2E 시나리오 추가

## 테스트 항목

- Suspend된 지갑의 세션 토큰으로 balance 조회 시 거부되는지 확인
- Resume 후 동일 세션 토큰으로 정상 조회되는지 확인
- Purge 후 GET /v1/wallets/{id} 404 반환 확인
- Purge 후 해당 지갑의 트랜잭션/세션/정책 레코드 삭제 확인
