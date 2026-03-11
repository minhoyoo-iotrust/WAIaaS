# 327 — 다수 DELAY 큐 항목 처리 중 데몬 크래시

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v31.9
- **상태:** OPEN

## 현상

DeFi UAT 중 다수 트랜잭션이 DELAY 큐에 적재된 상태에서 데몬 프로세스가 크래시되었다. Across Bridge DELAY 대기 중 발생하여 defi-04 INCOMPLETE.

- 크래시 후 `/v1/health` 응답 불능 (DAEMON_DOWN)
- 정확한 크래시 시점의 로그 미확보

## 원인

불명. 추정 가능한 원인:
1. 다수 DELAY 타이머 동시 만료 시 메모리/리소스 소진
2. DELAY 재진입 경로에서 예외 미처리
3. 기존 #194 (reconnectLoop 무지연 루프) 유사 패턴 재발

## 해결 방안

1. 데몬 크래시 로그 확보 (stderr, core dump 등)
2. DELAY 큐 부하 테스트 — 다수 항목 동시 적재 시 리소스 모니터링
3. uncaughtException / unhandledRejection 핸들러 점검
4. DELAY 재진입 경로의 에러 핸들링 강화

## 영향 범위

- `packages/daemon/src/pipeline/stages.ts` — DELAY 재진입 경로
- `packages/daemon/src/daemon.ts` — 프로세스 안정성

## 테스트 항목

1. DELAY 큐에 10+ 항목 동시 적재 후 순차 만료 시 데몬 안정성 확인
2. DELAY 재진입 중 예외 발생 시 프로세스 미종료 확인
3. uncaughtException 핸들러가 로그를 남기고 graceful shutdown 수행하는지 확인
