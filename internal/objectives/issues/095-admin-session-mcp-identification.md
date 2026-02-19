# 095 — Admin 세션 페이지에서 MCP 세션 식별 불가

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v2.4
- **상태:** OPEN
- **등록일:** 2026-02-19

## 현상

Admin UI 세션 페이지에서 MCP 토큰으로 생성된 세션과 일반 API로 생성된 세션을 구분할 수 없다. 두 경로 모두 동일한 `sessions` 테이블에 동일한 스키마로 저장되며, DB에 세션 생성 경로를 나타내는 컬럼이 없다.

운영자가 MCP 에이전트용 세션을 관리(모니터링, 만료 확인, 일괄 취소 등)하려면 MCP 세션을 식별할 수 있어야 한다.

## 원인

- `sessions` 테이블에 `source` 또는 `type` 컬럼 없음
- `POST /v1/mcp/tokens`와 `POST /v1/sessions` 모두 동일한 INSERT 수행
- `GET /v1/sessions` 응답에 생성 경로 정보 미포함
- Admin UI 세션 목록에 MCP 뱃지/필터 없음

## 기대 동작

1. MCP로 생성된 세션에 `source: 'mcp'` 표시, 일반 세션은 `source: 'api'`
2. Admin 세션 페이지에서 MCP 뱃지로 시각적 구분
3. MCP/API 소스별 필터링 가능

## 수정 범위

### 1. DB 스키마 — `sessions` 테이블에 `source` 컬럼 추가

- `source TEXT NOT NULL DEFAULT 'api'` — 값: `'api'` | `'mcp'`
- 마이그레이션: `ALTER TABLE sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'api'`
- 기존 세션은 `'api'`로 초기화 (기존 MCP 세션은 구분 불가하나 허용)

### 2. 백엔드 — 세션 생성 시 `source` 기록

- `POST /v1/mcp/tokens` 핸들러: `source: 'mcp'`로 INSERT
- `POST /v1/sessions` 핸들러: `source: 'api'`로 INSERT (기본값)
- `GET /v1/sessions` 응답에 `source` 필드 포함

### 3. Admin UI — 세션 목록 개선

- 세션 테이블에 Source 컬럼 추가 (MCP 뱃지 / API 뱃지)
- Source별 필터 드롭다운 추가 (All / MCP / API)

## 테스트 항목

### 단위 테스트
1. `POST /v1/mcp/tokens`로 생성된 세션의 `source`가 `'mcp'`인지 확인
2. `POST /v1/sessions`로 생성된 세션의 `source`가 `'api'`인지 확인
3. `GET /v1/sessions` 응답에 `source` 필드가 포함되는지 확인
4. 마이그레이션 후 기존 세션의 `source`가 `'api'`(기본값)인지 확인

### 통합 테스트
5. Admin UI 세션 목록에서 MCP 뱃지 표시 확인
6. Source 필터 적용 시 해당 소스의 세션만 표시되는지 확인
