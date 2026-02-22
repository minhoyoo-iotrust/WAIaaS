# Phase 215 Summary: IChainSubscriber 인터페이스 + DB 스키마 설계

## Completed
- [x] 215-01: IChainSubscriber 인터페이스 + IncomingTransaction 타입 정의
- [x] 215-02: incoming_transactions 테이블 스키마 + 중복 방지 + 보존 정책 + 마이그레이션 명세

## Key Decisions
1. IChainSubscriber를 IChainAdapter와 별도 인터페이스로 설계 (stateful vs stateless 분리)
2. UNIQUE(tx_hash, wallet_id) 복합 제약 — 배치 전송 시 하나의 TX가 여러 지갑에 수신 가능
3. 2단계 상태 모델(DETECTED/CONFIRMED) — 알림은 DETECTED, 에이전트 로직은 CONFIRMED만
4. 메모리 큐 + BackgroundWorkers 5초 flush — SQLite 단일 라이터 보호 (C-02)
5. incoming_tx_cursors 별도 테이블 — 블라인드 구간 복구용 커서 관리
6. v21 마이그레이션 — ALTER TABLE + CREATE TABLE 2개 (incoming_transactions, incoming_tx_cursors)

## Output
- internal/design/76-incoming-transaction-monitoring.md 섹션 1-2

## Requirements Covered
- MON-01: IChainSubscriber 인터페이스 4메서드 + IncomingTransaction 타입 ✅
- DATA-01: incoming_transactions 테이블 완성 ✅
- DATA-02: UNIQUE(tx_hash, wallet_id) + ON CONFLICT DO NOTHING ✅
- DATA-03: retention_days 기반 자동 삭제 스케줄러 ✅
- DATA-04: 메모리 큐 + 배치 flush 패턴 ✅
