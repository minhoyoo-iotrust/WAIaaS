# #331 — Admin UI 감사 로그 페이지 미구현

- **유형:** MISSING
- **심각도:** MEDIUM
- **마일스톤:** v31.9
- **상태:** FIXED

## 현상

Admin UI에 감사 로그(Audit Logs) 조회 페이지가 없어, 운영자가 감사 이벤트를 확인하려면 REST API를 직접 호출해야 한다.

## 원인

v30.2에서 감사 로그 백엔드 API(`GET /v1/audit-logs`)는 구현되었으나, Admin UI 페이지는 구현 범위에 포함되지 않았다.

## 현재 상태

- **백엔드 API 완성:**
  - `GET /v1/audit-logs` — masterAuth 인증, 커서 기반 페이지네이션
  - 6개 필터: `wallet_id`, `event_type`, `severity`, `from`, `to`, `tx_id`
  - Zod 스키마: `AuditLogQuerySchema`, `AuditLogResponseSchema` (`@waiaas/core`)
- **Admin UI 미구현:** 네비게이션 메뉴, 페이지 컴포넌트, API 클라이언트 엔드포인트 모두 없음

## 기대 동작

Admin UI에서 감사 로그를 조회할 수 있어야 한다:

1. 좌측 내비게이션에 "Audit Logs" 메뉴 항목 추가
2. 감사 로그 리스트 페이지 — 테이블 형식, 커서 기반 페이지네이션
3. 6개 필터 지원: 지갑, 이벤트 타입, 심각도, 기간(from/to), 트랜잭션 ID
4. 이벤트 상세 보기 (JSON 데이터 확인)

## 관련 코드

- `packages/daemon/src/api/routes/audit-logs.ts` — API 라우트
- `packages/core/src/schemas/audit.schema.ts` — Zod 스키마
- `packages/core/src/enums/audit.ts` — AuditEventType, AuditSeverity 열거형
- `packages/admin/src/components/layout.tsx` — 내비게이션 정의

## 테스트 항목

1. 감사 로그 페이지 렌더링 테스트 — 빈 상태, 데이터 있는 상태
2. 필터 적용 테스트 — 6개 필터 각각 및 조합
3. 커서 기반 페이지네이션 테스트 — 다음/이전 페이지 이동
4. 이벤트 상세 보기 테스트 — JSON 데이터 표시
5. 내비게이션 메뉴 테스트 — Audit Logs 항목 존재 및 라우팅
