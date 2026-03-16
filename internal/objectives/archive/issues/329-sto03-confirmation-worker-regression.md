# 329 — Confirmation Worker STO-03 회귀 — Lido 스테이킹 온체인 성공 후 상태 미갱신

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v31.9
- **상태:** FIXED

## 현상

Lido 스테이킹(defi-05) 온체인 트랜잭션 성공 후 15분+ 경과해도 트랜잭션 상태가 SUBMITTED → CONFIRMED로 갱신되지 않는다. 기존 STO-03 이슈(#143)에서 FIXED 처리되었으나 재발 확인.

## 관련 이력

- #143 (v27.2, FIXED): Confirmation Worker RPC 콜백 미주입 — DETECTED→CONFIRMED 전이 불가
- 현재 증상은 SUBMITTED→CONFIRMED 전이 실패로, #143과 동일 워커이나 다른 경로일 수 있음

## 원인 (추정)

1. #143 수정이 IncomingTx 경로(DETECTED→CONFIRMED)만 다뤘고, 발신 트랜잭션(SUBMITTED→CONFIRMED) 경로는 미수정
2. Confirmation Worker가 특정 네트워크(Ethereum mainnet)에서 RPC 타임아웃/rate limit으로 확인 실패
3. CONTRACT_CALL 타입 트랜잭션의 확인 로직이 TRANSFER와 다르게 동작

## 해결 방안

1. Confirmation Worker의 발신 트랜잭션 확인 로직 점검
2. CONTRACT_CALL 타입 트랜잭션의 receipt 조회 경로 확인
3. RPC 타임아웃/rate limit 시 재시도 로직 확인

## 영향 범위

- `packages/daemon/src/workers/confirmation.ts` — Confirmation Worker
- SUBMITTED 상태의 모든 트랜잭션 타입에 영향

## 테스트 항목

1. CONTRACT_CALL 타입 트랜잭션 SUBMITTED→CONFIRMED 전이 확인 (mock RPC)
2. RPC 타임아웃 시 Confirmation Worker 재시도 동작 확인
3. 장시간(15분+) SUBMITTED 고착 시 경고 로그 또는 알림 발송 확인
