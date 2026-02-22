# Phase 220 Summary: REST API + SDK/MCP 명세 설계

## Completed
- [x] 220-01: REST API 엔드포인트 스키마 + Zod SSoT 명세
- [x] 220-02: SDK/MCP 인터페이스 + summary 집계 엔드포인트 명세

## Key Decisions
1. GET /v1/wallet/incoming — cursor 페이지네이션 (Base64 JSON cursor)
2. 8개 쿼리 필터: cursor, limit, from_address, token, chain, status, since, until
3. Zod SSoT: IncomingTransactionQuerySchema, IncomingTransactionSchema, IncomingTransactionListResponseSchema
4. PATCH /v1/wallet/:id에 monitorIncoming 필드 추가 (opt-in/out)
5. SDK: listIncomingTransactions + getIncomingTransactionSummary (TS + Python)
6. MCP: list_incoming_transactions + get_incoming_summary 2도구
7. GET /v1/wallet/incoming/summary — daily/weekly/monthly 집계
8. resolveWalletId 3단계 우선순위로 지갑 선택

## Output
- internal/design/76-incoming-transaction-monitoring.md 섹션 7

## Requirements Covered
- API-01: GET /v1/wallet/incoming 스키마 (cursor pagination + 필터) ✅
- API-02: Zod SSoT 스키마 정의 ✅
- API-03: SDK listIncomingTransactions TS/Python 인터페이스 ✅
- API-04: MCP list_incoming_transactions 도구 스키마 ✅
- API-05: GET /v1/wallet/incoming/summary 집계 엔드포인트 ✅
