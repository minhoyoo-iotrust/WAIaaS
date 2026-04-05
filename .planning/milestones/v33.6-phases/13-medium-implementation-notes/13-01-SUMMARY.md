# Phase 13 Plan 01: 단위 변환/매핑/패리티 구현 노트 Summary

**One-liner:** 8개 MEDIUM 구현 노트(NOTE-01~04, 08~11)를 6개 v0.2 설계 문서에 추가 -- BalanceInfo 변환 규칙, MCP 31개 패리티 매트릭스, SDK 36개 에러 타입 매핑, 에이전트 상태 v0.1-v0.2 매핑, Python snake_case 검증, 커서 페이지네이션 통일, 알림 채널-정책 연동, Docker shutdown 타임라인

---

## Metadata

- **Phase:** 13-medium-implementation-notes
- **Plan:** 01
- **Type:** execute
- **Started:** 2026-02-06T10:02:34Z
- **Completed:** 2026-02-06T10:08:24Z
- **Duration:** ~6 min

---

## Task Commits

| # | Task | Commit | Description |
|---|------|--------|-------------|
| 1 | 단위 변환/채널/페이지네이션/shutdown 구현 노트 | `a3f808c` | NOTE-01, NOTE-02, NOTE-08, NOTE-11 -- 6개 문서 수정 |
| 2 | MCP 패리티/SDK 에러 매핑/에이전트 상태/Python 네이밍 | `11b9bea` | NOTE-03, NOTE-04, NOTE-09, NOTE-10 -- 2개 문서 수정 |

---

## What Was Done

### NOTE-01: BalanceInfo 단위 변환 규칙 (27-chain-adapter-interface.md)
- 저장/전송 레이어: 모든 금액은 최소 단위(lamports/wei) bigint
- API 레이어 변환 공식: `formatted = Number(balance) / 10^decimals + symbol`
- 체인별 변환표: SOL(decimals=9), ETH(decimals=18)
- SDK 헬퍼 인터페이스: `formatAmount()`, `parseAmount()`
- 37-rest-api-complete-spec.md에 크로스레퍼런스 추가

### NOTE-02: 알림 채널과 정책 엔진 연동 규칙 (35-notification-architecture.md)
- 핵심 규칙: `enabled=true` + 활성 채널 >= 2일 때만 4-tier 정책 동작
- 활성 채널 < 2이면 INSTANT만 허용
- 초기화 시나리오별 동작표 (init 직후 -> 채널 설정 -> 4-tier 활성화)
- 24-monorepo-data-directory.md에 크로스레퍼런스 추가

### NOTE-03: MCP <-> REST API 기능 패리티 매트릭스 (38-sdk-mcp-interface.md)
- 31개 REST 엔드포인트 전체를 5개 카테고리로 분류
- 커버됨: 7개 (도구 6 + 리소스 3), 의도적 미커버: 24개
- 보안 근거: MCP는 AI 에이전트 권한 범위(세션 Bearer)만 노출

### NOTE-04: SDK 에러 코드 타입 매핑 전략 (38-sdk-mcp-interface.md)
- TS SDK: `WAIaaSErrorCode` string literal union (36개 코드)
- Python SDK: `ErrorCode(str, Enum)` (36개 코드)
- 7개 도메인별 에러 코드 전체 목록표
- 기존 retryable/MCP 에러 패턴 현행 유지 확인

### NOTE-08: Docker graceful shutdown 타임라인 검증 (28-daemon-lifecycle-cli.md)
- 30초 강제 타이머 vs 10단계 합산 시간의 관계
- Step 4-5 병렬성(포함 관계) 명시
- 4개 시나리오 타임라인 검증표: 모두 35초 Docker stop_grace_period 내
- 40-telegram-bot-docker.md에 크로스레퍼런스 추가

### NOTE-09: 에이전트 상태 v0.1 -> v0.2 매핑 (25-sqlite-schema.md)
- 5단계 상태 매핑표: lowercase(v0.1) -> UPPERCASE(v0.2)
- 의미 변경 요약: Squads 온체인 -> 로컬 키스토어/정책 엔진
- suspension_reason 4가지 세분화 (kill_switch, policy_violation, manual, auto_stop)

### NOTE-10: Python SDK snake_case 변환 검증 (38-sdk-mcp-interface.md)
- 17개 camelCase 필드 -> snake_case 변환 일관성 전부 OK
- Pydantic `model_config = {"populate_by_name": True}` 필수 확인
- 에러 코드 무변환 원칙: UPPER_SNAKE_CASE는 Python에서도 그대로

### NOTE-11: 커서 페이지네이션 표준 (37-rest-api-complete-spec.md)
- 표준 파라미터 4개: cursor, nextCursor, limit, order
- UUID v7 커서 구현 규칙: `WHERE id < cursor ORDER BY id DESC LIMIT n+1`
- 페이지네이션 적용/미적용 엔드포인트 분류
- 클라이언트 구현 가이드 포함

---

## Key Files Modified

| 문서 | 추가 NOTE | 크로스레퍼런스 |
|------|----------|-------------|
| 27-chain-adapter-interface.md | NOTE-01 | -> 37-rest-api |
| 37-rest-api-complete-spec.md | NOTE-11 | <- 27-chain-adapter |
| 35-notification-architecture.md | NOTE-02 | -> 24-monorepo |
| 24-monorepo-data-directory.md | - (참조만) | <- 35-notification |
| 28-daemon-lifecycle-cli.md | NOTE-08 | -> 40-telegram-bot |
| 40-telegram-bot-docker.md | - (참조만) | <- 28-daemon-lifecycle |
| 38-sdk-mcp-interface.md | NOTE-03, 04, 10 | - |
| 25-sqlite-schema.md | NOTE-09 | - |

---

## Decisions Made

| 결정 | 근거 |
|------|------|
| 구현 노트는 기존 설계 변경 없이 "구현 시 참고" 수준으로 제한 | Pitfall 1 방지 -- 새 인터페이스/타입 정의 없음 |
| 크로스레퍼런스는 양방향 참조로 작성 | SSoT 유지, 중복 정보 최소화 (Pitfall 2 방지) |
| SDK 에러 코드는 타입만 명시하고 서브클래스 불필요 | 단일 WAIaaSError + code 필드 현행 유지 |
| MCP 미커버 24개는 "의도적" 미커버로 분류 | 보안 원칙 -- AI 에이전트에 Owner/Admin 권한 미노출 |

---

## Deviations from Plan

None -- plan executed exactly as written.

---

## Success Criteria Verification

- [x] 27-chain-adapter-interface.md에 단위 변환 규칙(formatted 공식, 체인별 decimals) 존재
- [x] 35-notification-architecture.md에 알림 채널 < 2일 때 INSTANT만 허용 규칙 존재
- [x] 38-sdk-mcp-interface.md에 (1) 31개 패리티 매트릭스, (2) 36개 에러 코드 타입 매핑, (3) 17개 필드 snake_case 검증 존재
- [x] 37-rest-api-complete-spec.md에 커서 페이지네이션 표준 파라미터 4개 명시됨
- [x] 25-sqlite-schema.md에 에이전트 상태 5단계 v0.1-v0.2 매핑표 존재
- [x] 28-daemon-lifecycle-cli.md에 30초 타이머 vs 10단계 합산 검증표 존재
- [x] 수정된 8개 문서 모두 기존 설계 미변경 (구현 노트 섹션만 추가)
- [x] 크로스레퍼런스 양방향 존재 (NOTE-01, NOTE-02, NOTE-08)

---

## Self-Check: PASSED
