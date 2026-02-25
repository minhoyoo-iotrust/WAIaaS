# 157 — IncomingTxMonitorService가 삭제된 wallets.network 컬럼 참조

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v28.1
- **상태:** OPEN
- **발견일:** 2026-02-23

## 증상

데몬 시작 시 아래 경고가 출력되며 수신 트랜잭션 모니터링이 비활성화됨:

```
Step 4c-9 (fail-soft): Incoming TX monitor init warning: SqliteError: no such column: network
```

## 원인

v7 마이그레이션(v1.4.6)에서 `wallets.network` 컬럼이 `environment` + `default_network`로 분리되었으나,
`IncomingTxMonitorService`의 raw SQL 쿼리 2곳이 업데이트되지 않음.

## 영향 범위

- **파일:** `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts`
- **위치:** line 143 (`start()`), line 213 (`syncSubscriptions()`)
- **쿼리:** `SELECT id, chain, network, public_key FROM wallets WHERE monitor_incoming = 1`

## 수정 방안

1. `network` → `environment`로 변경 (SubscriptionMultiplexer 키가 `chain:environment` 형태)
2. TypeScript 타입 캐스트도 `network: string` → `environment: string`으로 변경
3. `addWallet()` 호출 시 `wallet.network` → `wallet.environment`로 변경

총 2곳 (start + syncSubscriptions) 동일 패턴 수정.

## 테스트 항목

- [ ] `incoming-tx-monitor-service.test.ts`: 테스트 DB에 `environment` 컬럼이 있는 wallets 레코드로 start() 호출 시 정상 구독 확인
- [ ] `incoming-tx-monitor-service.test.ts`: syncSubscriptions()가 `environment` 컬럼으로 정상 조회 확인
- [ ] 기존 incoming TX 모니터 테스트 전체 PASS 확인
