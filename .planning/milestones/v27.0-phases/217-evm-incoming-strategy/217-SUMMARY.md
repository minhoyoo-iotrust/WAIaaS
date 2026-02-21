# Phase 217 Summary: EVM 수신 감지 전략 설계

## Completed
- [x] 217-01: EvmIncomingSubscriber 감지 전략 + ETH/ERC-20 파싱 + 폴링 명세

## Key Decisions
1. 폴링(getLogs) 우선 전략 — WebSocket 연결 관리 복잡도 제거, self-hosted 환경 호환성
2. ERC-20: getLogs + Transfer 이벤트 topic[2] (to 필터)로 수신 감지
3. 네이티브 ETH: getBlock(includeTransactions: true) + to-주소 필터
4. token_registry 화이트리스트 필터 — 미등록 토큰은 SUSPICIOUS로 분류
5. 폴링 간격 12초 (1블록 ≈ 12초), 한 번에 최대 10블록
6. 체인별 confirmation 임계값 (Ethereum 12, Sepolia 3, L2 1)
7. WebSocket 전환은 config.toml incoming_mode='websocket' 설정 시에만

## Output
- internal/design/76-incoming-transaction-monitoring.md 섹션 4

## Requirements Covered
- MON-03: eth_subscribe(logs) Transfer + watchBlocks 이중 전략 정의 ✅
  (폴링 우선이지만 WebSocket 전환 경로도 명세)
