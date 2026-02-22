# Phase 218 Summary: WebSocket 연결 관리 + 폴링 폴백 설계

## Completed
- [x] 218-01: 폴링 폴백 전환 상태 머신 + 재연결 백오프 + heartbeat 명세
- [x] 218-02: WebSocket 멀티플렉서 + 구독 레지스트리 + 동적 관리 + 블라인드 구간 복구 명세

## Key Decisions
1. 3-state 상태 머신 (WEBSOCKET → POLLING → DISABLED)
2. 지수 백오프 재연결 (1s→2s→...→60s + ±30% jitter), 3회 실패 시 폴링 전환
3. Solana heartbeat 60초 ping (10분 inactivity timeout 대응)
4. EVM viem keepAlive 30초 내장 사용
5. SubscriptionMultiplexer: 체인+네트워크별 단일 WebSocket, 지갑별 개별 구독
6. syncSubscriptions() 5분 주기 동기화 + 이벤트 드리븐 즉시 반영
7. 블라인드 구간 복구: 재연결 직후 커서 이후 갭 보상 폴링 (Solana: getSignaturesForAddress, EVM: getLogs)

## Output
- internal/design/76-incoming-transaction-monitoring.md 섹션 5

## Requirements Covered
- MON-04: WebSocket 실패 시 폴링 폴백 자동 전환/복구 ✅
- MON-05: 재연결 지수 백오프, heartbeat 60초, 연결 상태 모니터링 ✅
- MON-06: 런타임 지갑 추가/삭제/활성화/비활성화 동적 관리 ✅
- MON-07: 체인+네트워크별 WebSocket 공유 멀티플렉서 ✅
- MON-09: 블라인드 구간 갭 보상 폴링 복구 ✅
