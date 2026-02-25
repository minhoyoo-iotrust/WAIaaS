# #185 — EVM IncomingSubscriber free-tier RPC 408 타임아웃으로 수신 트랜잭션 무음 누락

- **유형:** BUG
- **심각도:** HIGH
- **컴포넌트:** `packages/adapters/evm/src/evm-incoming-subscriber.ts`
- **관련:** #169 (rate limit 429, FIXED), #172 (L2 getBlock timeout, FIXED), #175 (per-wallet 무한 재시도, FIXED)

## 현상

Arbitrum 네트워크에서 `eth_getLogs` 요청이 dRPC 무료 티어 408 타임아웃으로 반복 실패:

```
EVM poll failed for wallet 019c88f6-... (backoff 120s, consecutive: 3): HTTP request failed.
Status: 408
URL: https://arbitrum.drpc.org/
Details: {"message":"Request timeout on the free tier, please upgrade your tier to the paid one","code":30}
```

- 연속 실패 3회 → 4회 → 5회로 증가, backoff 120s → 240s → 300s(최대)로 도달
- 300s 이후에도 계속 재시도하지만 동일 결과 반복

## 근본 원인

1. **무료 티어 RPC 제한**: dRPC free tier가 `eth_getLogs` 요청에 대해 HTTP 408 타임아웃 반환. #169에서 429 rate limit은 backoff+stagger로 완화했으나, 408 타임아웃은 근본적으로 무료 티어 한계로 backoff만으로는 해결 불가.

2. **수신 트랜잭션 무음 누락**: `MAX_RETRY_SAME_RANGE = 3` 도달 시 cursor가 강제 전진(`sub.lastBlock += MAX_BLOCK_RANGE`)되어 해당 블록 범위의 수신 트랜잭션이 **영구적으로 누락**됨. 누락 사실이 로그 외에 관리자/사용자에게 통보되지 않음.

3. **복구 메커니즘 부재**:
   - 영구 circuit breaker 없음 — backoff 최대(300s) 도달 후에도 무한 재시도
   - RPC provider failover 없음 — 대체 엔드포인트로 자동 전환 불가
   - 관리자 알림 없음 — Admin UI나 알림 채널에 RPC 장애 통보 없음
   - 누락된 블록 범위 재스캔 메커니즘 없음

## 영향

- **데이터 무결성**: 3회 연속 실패한 블록 범위의 수신 ERC-20 전송이 영구 누락
- **사용자 신뢰**: 수신된 자금이 DB에 기록되지 않아 잔액 불일치 발생 가능
- **운영 가시성**: 관리자가 RPC 장애 및 트랜잭션 누락을 인지할 수단 없음
- **리소스 낭비**: 무한 재시도가 실패할 것이 확실한 요청을 계속 발생시킴

## 재현 조건

- Arbitrum (또는 기타 L2) 네트워크에서 무료 dRPC 엔드포인트 사용
- IncomingTxMonitor가 해당 네트워크의 지갑 구독 중
- RPC 프로바이더가 부하 또는 무료 티어 정책으로 408 반환

## 수정 제안

### P0 — 즉시 대응
1. **RPC 장애 알림 이벤트 추가**: 연속 실패 N회(예: 5회) 도달 시 `RPC_HEALTH_DEGRADED` 알림을 NotificationService로 발송. 관리자가 RPC 엔드포인트 변경 또는 유료 티어 업그레이드 필요 인지.
2. **cursor 강제 전진 시 누락 알림**: cursor 전진 발생 시 `INCOMING_TX_RANGE_SKIPPED` 이벤트 발행하여 어떤 블록 범위가 스캔 누락되었는지 기록.

### P1 — 단기 개선
3. **RPC 상태 Admin UI 표시**: System 페이지에 네트워크별 RPC 상태(연속 실패 횟수, 마지막 성공 시각) 표시.
4. **영구 circuit breaker**: 연속 실패 N회(예: 10회) 도달 시 해당 네트워크 구독을 SUSPENDED로 전환하고, Admin UI에서 수동 재개 가능하게 함.

### P2 — 중기 개선
5. **fallback RPC 엔드포인트**: `config.toml`에 네트워크별 대체 RPC URL 목록 지원. primary 실패 시 자동 전환.
6. **누락 블록 범위 재스캔**: SUSPENDED 복구 또는 RPC 정상화 시, 기록된 누락 범위를 역순으로 재스캔.

## 부가 관찰

로그에 함께 나타난 `POST /v1/actions/lifi/cross_swap 502`는 LI.FI 업스트림 API의 502 Bad Gateway로 별도 원인. 본 이슈와는 무관하나, 액션 프로바이더의 외부 API 실패에 대한 사용자 안내 개선은 별도 이슈로 검토 가능.

## 테스트 항목

1. **단위 테스트**: EvmIncomingSubscriber에서 연속 N회 실패 시 알림 이벤트 발행 검증
2. **단위 테스트**: cursor 강제 전진 시 누락 블록 범위 기록 및 알림 검증
3. **통합 테스트**: RPC 장애 상태가 Admin API를 통해 정상 조회되는지 검증
4. **통합 테스트**: circuit breaker SUSPENDED 전환 후 수동 재개 시나리오 검증
