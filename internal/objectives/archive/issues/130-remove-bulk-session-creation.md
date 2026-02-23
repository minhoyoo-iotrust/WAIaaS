# 130 — 1:N 세션 모델 도입으로 불필요해진 벌크 세션/MCP 토큰 생성 기능 제거

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v27.0
- **상태:** FIXED
- **등록일:** 2026-02-21

## 현상

v2.5(이슈 #096)에서 도입한 벌크 세션 생성 기능은 **1:1 세션 모델**(세션 하나 = 지갑 하나)을 전제로, 여러 지갑에 대해 세션을 일괄 생성하는 편의 기능이었다.

v26.4에서 **1:N 세션 모델**(session_wallets junction, DB v19)이 도입되면서 **하나의 세션으로 여러 지갑을 관리**할 수 있게 되었다. 멀티 지갑 세션 생성 UI도 이미 존재한다(`createModal` — sessions.tsx:292-294).

따라서 벌크 생성 기능은 다음과 같은 이유로 제거 대상이다:

1. **기능 중복**: 멀티 지갑 세션 생성(1:N)이 벌크 생성(N×1:1)의 상위 호환
2. **UX 혼란**: 동일 페이지에 "Create Session"(1:N)과 "Bulk Create"(N×1:1) 두 가지 경로가 공존
3. **유지보수 부담**: 사용되지 않는 엔드포인트 2개 + UI 코드 + 테스트 유지

## 수정 범위

### 1. REST API 엔드포인트 제거

- `POST /v1/admin/sessions/bulk` — 벌크 세션 생성 (`admin.ts:565-596`, 핸들러 `1745-1795`)
- `POST /v1/admin/mcp/tokens/bulk` — 벌크 MCP 토큰 생성 (`admin.ts:598-630`, 핸들러 `1797-1874`)
- `BulkResultItemSchema` (`admin.ts:556-563`) — 공유 스키마

### 2. Admin UI 제거

- `sessions.tsx:296-303` — 벌크 관련 signal 7개 (`bulkModal`, `bulkType`, `bulkSelectedIds`, `bulkLoading`, `bulkResultModal`, `bulkResults`, `bulkClaudeConfig`)
- `sessions.tsx:371-383` — `toggleBulkSelect`, `toggleBulkSelectAll` 핸들러
- `sessions.tsx:385-417` — `handleBulkCreate` 핸들러
- `sessions.tsx:596-606` — "Bulk Create" 버튼
- `sessions.tsx:688-729` — 벌크 생성 모달
- `sessions.tsx:731-767` — 벌크 결과 모달

### 3. API 상수 제거

- `endpoints.ts:35-36` — `ADMIN_BULK_SESSIONS`, `ADMIN_BULK_MCP_TOKENS`

### 4. 테스트 제거

- `sessions.test.tsx` — 벌크 관련 테스트 4건 (Select All/Deselect, API Session, MCP Token, Error Handling)

### 5. OpenAPI 스키마 정리

- `openapi-schemas.ts` — 벌크 관련 스키마가 있으면 제거

### 영향 범위

- `packages/daemon/src/api/routes/admin.ts` — 엔드포인트 + 핸들러 + 스키마 제거
- `packages/admin/src/pages/sessions.tsx` — 벌크 UI/상태/핸들러 제거
- `packages/admin/src/api/endpoints.ts` — 상수 2개 제거
- `packages/admin/src/__tests__/sessions.test.tsx` — 테스트 4건 제거

## 테스트 항목

### 단위 테스트

1. `POST /v1/admin/sessions/bulk` 호출 시 404 반환 확인
2. `POST /v1/admin/mcp/tokens/bulk` 호출 시 404 반환 확인
3. 세션 페이지에 "Bulk Create" 버튼이 없는지 확인
4. 멀티 지갑 세션 생성(1:N) 기능이 정상 동작하는지 확인 (회귀 테스트)

### 회귀 테스트

5. 기존 멀티 지갑 세션 생성 모달(`createModal`)이 정상 렌더링되는지 확인
6. 단일 지갑 세션 생성이 정상 동작하는지 확인
7. MCP 토큰 개별 생성이 정상 동작하는지 확인
