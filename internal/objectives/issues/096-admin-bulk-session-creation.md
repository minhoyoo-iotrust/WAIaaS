# 096 — Admin 세션 페이지에서 다중 지갑 일괄 세션/MCP 토큰 생성 기능

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v2.5
- **상태:** OPEN
- **등록일:** 2026-02-19

## 현상

현재 세션 생성과 MCP 토큰 발급은 지갑 하나씩 개별 진행해야 한다.

- 일반 세션: Admin 세션 페이지에서 지갑 선택 → Create Session
- MCP 토큰: Admin 지갑 상세에서 Generate MCP Token

지갑이 여러 개인 운영 환경에서 초기 설정 시 반복 작업이 많아 DX가 떨어진다. 특히 AI 에이전트 다수를 동시에 운영하는 시나리오에서 각 에이전트(지갑)에 세션을 하나씩 만드는 것은 비효율적이다.

## 기대 동작

### 일괄 세션 생성

1. Admin 세션 페이지에 **"Bulk Create"** 버튼 추가
2. 체크박스로 대상 지갑 복수 선택 (활성 지갑 목록 표시)
3. 세션 타입 선택: **API Session** / **MCP Token**
4. 공통 옵션 설정 (TTL, constraints 등)
5. 일괄 생성 실행 → 결과 요약 (성공/실패 건수)

### MCP 토큰 일괄 생성 시 추가 UX

- 생성된 MCP 토큰별 Claude Desktop 설정 스니펫을 **통합 JSON**으로 제공
- 개별 복사 + 전체 복사 지원
- 파일 다운로드 옵션 (claude_desktop_config.json)

## 수정 범위

### 1. 백엔드 — 배치 API 엔드포인트

- `POST /v1/admin/sessions/bulk` — 다중 지갑에 대해 일반 세션 일괄 생성
  - 요청: `{ walletIds: string[], ttl?: number, constraints?: object }`
  - 응답: `{ results: Array<{ walletId, sessionId, token?, error? }> }`
- `POST /v1/admin/mcp/tokens/bulk` — 다중 지갑에 대해 MCP 토큰 일괄 생성
  - 요청: `{ walletIds: string[], ttl?: number }`
  - 응답: `{ results: Array<{ walletId, walletName, tokenPath, error? }>, claudeDesktopConfig: object }`
- 개별 실패가 전체 실패로 번지지 않도록 per-wallet 에러 처리

### 2. Admin UI — 일괄 생성 모달/페이지

- 세션 페이지 상단에 "Bulk Create" 버튼
- 모달 내 지갑 선택 체크박스 리스트 (Select All 지원)
- 세션 타입 라디오 (API Session / MCP Token)
- 생성 결과 요약 테이블 (지갑명, 상태, 에러 메시지)
- MCP 토큰의 경우 통합 Claude Desktop 설정 JSON 미리보기 + 복사/다운로드

## 테스트 항목

### 단위 테스트
1. `POST /v1/admin/sessions/bulk` — 복수 지갑에 대해 세션이 각각 생성되는지 확인
2. `POST /v1/admin/mcp/tokens/bulk` — 복수 지갑에 대해 MCP 토큰이 각각 생성되는지 확인
3. 일부 지갑이 TERMINATED 상태일 때 해당 건만 error 반환하고 나머지 정상 처리
4. 빈 walletIds 배열 시 400 에러 반환
5. 통합 claudeDesktopConfig에 모든 지갑의 MCP 서버 설정이 포함되는지 확인

### 통합 테스트
6. Admin UI Bulk Create 모달에서 지갑 선택 → 생성 → 결과 표시 플로우
7. MCP 토큰 일괄 생성 후 Claude Desktop 설정 JSON 복사/다운로드 동작 확인
