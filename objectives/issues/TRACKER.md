# Bug Tracker

> 버그 리포트 추적 현황. 새 버그는 `v{milestone}-BUG-{NNN}-{slug}.md`로 추가하고 이 표를 갱신한다.

## Status Legend

| 상태 | 설명 |
|------|------|
| OPEN | 미처리 — 수정 필요 |
| FIXED | 수정 완료 — 코드 반영됨 |
| VERIFIED | 수정 후 검증 완료 |
| WONTFIX | 수정하지 않음 (의도된 동작 또는 해당 없음) |

## Active Bugs

| ID | 심각도 | 제목 | 마일스톤 | 상태 | 수정일 |
|----|--------|------|----------|------|--------|
| BUG-001 | HIGH | 트랜잭션 라우트 미등록 (POST /v1/transactions/send 404) | v1.1 | FIXED | 2026-02-10 |
| BUG-002 | CRITICAL | 세션 라우트 미등록 + masterAuth 미적용 (POST /v1/sessions 404) | v1.2 | FIXED | 2026-02-10 |
| BUG-003 | LOW | mcp setup 헬스체크가 인증 필요 엔드포인트 호출 (/v1/admin/status) | v1.3 | FIXED | 2026-02-11 |
| BUG-004 | MEDIUM | mcp setup 에이전트 목록 조회 시 X-Master-Password 헤더 누락 | v1.3 | FIXED | 2026-02-11 |
| BUG-005 | CRITICAL | MCP SessionManager가 JWT의 sub 대신 sessionId 클레임 참조 | v1.3 | FIXED | 2026-02-11 |
| BUG-006 | MEDIUM | mcp setup 에이전트 자동 감지 시 API 응답 필드 불일치 (items vs agents) | v1.3 | FIXED | 2026-02-11 |
| BUG-007 | MEDIUM | Admin UI 알림 테스트 응답 파싱 오류 (results 래퍼 미처리) | v1.3.4 | FIXED | 2026-02-12 |
| BUG-008 | MEDIUM | vitest fork pool 워커 프로세스가 고아 상태로 누적 | v1.3.4 | FIXED | 2026-02-12 |
| BUG-009 | LOW | E2E E-11 테스트가 잘못된 인증 모델 전제 (X-Agent-Id 미사용, sessionAuth 누락) | v1.1 | FIXED | 2026-02-12 |
| BUG-010 | HIGH | Admin UI EVM 에이전트 생성 시 network 값 불일치 (sepolia → ethereum-sepolia) | v1.4.1 | FIXED | 2026-02-12 |
| BUG-011 | MEDIUM | MCP 서버 초기화 순서 레이스 컨디션 (sessionManager.start → server.connect) | v1.3 | FIXED | 2026-02-12 |
| BUG-012 | MEDIUM | MCP에 get_assets 도구 미구현 — SPL/ERC-20 토큰 잔액 조회 불가 | v1.3 | FIXED | 2026-02-12 |
| BUG-013 | LOW | Admin UI에서 MCP 토큰 발급 불가 — CLI 의존 | v1.4.1 | OPEN (v1.4.3) | — |
| BUG-014 | MEDIUM | EVM getAssets()가 ERC-20 토큰 잔액 미반환 — ALLOWED_TOKENS 정책 미연동 | v1.4.1 | OPEN (v1.4.3) | — |
| BUG-015 | HIGH | EVM 트랜잭션 확인 타임아웃 시 온체인 성공 건을 FAILED로 처리 | v1.4.1 | OPEN (v1.4.3) | — |
| BUG-016 | LOW | 모든 패키지 버전이 0.0.0 — Admin UI/OpenAPI에 잘못된 버전 표시 | v1.4.1 | OPEN (v1.4.3) | — |

## Summary

- **OPEN:** 4
- **FIXED:** 12
- **VERIFIED:** 0
- **WONTFIX:** 0
- **Total:** 16
