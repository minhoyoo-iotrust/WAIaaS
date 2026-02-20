# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** Phase 213 - 통합 레이어

## Current Position

Phase: 213 of 213 (통합 레이어)
Plan: 3 of 4 in current phase
Status: In Progress
Last activity: 2026-02-21 -- Completed 213-03-PLAN.md (Admin UI + CLI multi-wallet session support)

Progress: [##########] 100%

## Performance Metrics

**Cumulative:** 49 milestones, 209 phases, 447 plans, 1,242 reqs, 4,396+ tests, ~163,416 LOC TS

**v26.4 Milestone:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 210. 세션 모델 재구조화 | 3/3 | 19min | 6.3min |
| 211. API 레이어 지갑 선택 | 3/3 | 11min | 3.7min |
| 212. 자기 발견 엔드포인트 | 2/2 | 9min | 4.5min |
| 213. 통합 레이어 | 3/4 | 8min | 2.7min |

## Accumulated Context

### Decisions

- DB v19: session_wallets junction 테이블로 1:N 관계 (JWT에 지갑 배열 넣지 않음, DB 기반 동적 관리)
- walletId 선택적 파라미터 (미지정 시 기본 지갑 자동 선택 -> 하위 호환 유지)
- connect-info는 sessionAuth (마스터 패스워드 불필요)
- 에러 코드 4개 신규: WALLET_ACCESS_DENIED, WALLET_ALREADY_LINKED, CANNOT_REMOVE_DEFAULT_WALLET, SESSION_REQUIRES_WALLET
- session_wallets composite PK (session_id, wallet_id) -- surrogate key 불필요
- v19 migration: 12-step sessions 재생성 + transactions FK reconnection
- CreateSessionRequestSchema: Zod refine()으로 walletId/walletIds 상호 배타 검증
- session-auth: defaultWalletId만 설정 (walletId 제거 완료, Phase 211-01)
- resolveWalletId: body > query > defaultWalletId 3단계 우선순위 + session_wallets 접근 검증
- owner-auth: defaultWalletId 사용 (walletId 대신)
- 세션 생성: walletIds/walletId 정규화, 첫 번째 지갑이 기본 지갑
- 세션 갱신: session_wallets에서 is_default=true 지갑을 JWT wlt 클레임에 설정
- masterAuth: /v1/sessions/:id/wallets 및 하위 경로 보호
- CASCADE 방어: 지갑 상태 변경 전에 session_wallets 처리 (promote/revoke -> delete junction -> cancel txs -> TERMINATED)
- 자동 승격: created_at ASC 순서로 가장 먼저 연결된 지갑이 기본 지갑으로 승격
- 마지막 지갑 삭제 시 세션 자동 revoke (revokedAt 설정)
- SessionRenewResponseSchema에 walletId 미포함 (의도적: JWT wlt 클레임이 기본 지갑 정보 전달)
- OpenAPI 스키마는 Phase 210-02에서 이미 정합 완료 (211-03에서 변경 불필요)
- POST body walletId: OpenAPI 스키마에 optional 필드로 추가 (TxSignRequest, x402 fetch, ActionExecuteRequest)
- cancel 핸들러: verifyWalletAccess(sessionId, tx.walletId) 패턴 사용 (resolveWalletId 대신)
- BetterSQLite3Database<any> 타입 확장으로 typed/untyped DB 인스턴스 호환
- connect-info: policies grouped by walletId, capabilities dynamically computed (transfer/token_transfer/balance/assets + sign/actions/x402)
- signing_sdk capability: settingsService.get() 사용 (DaemonConfig에 signing_sdk 섹션 없음)
- buildConnectInfoPrompt: 재사용 가능 함수로 분리 (Plan 02 agent-prompt에서 재사용)
- agent-prompt: 단일 세션 생성 (N개 지갑당 1세션, session_wallets N행)
- agent-prompt: JWT wlt 클레임은 첫 번째(기본) 지갑 ID
- agent-prompt: buildConnectInfoPrompt 출력 후 Session Token/ID 추가 (에이전트 즉시 사용 가능)
- capabilities 동일 로직: connect-info와 agent-prompt 모두 동일한 동적 감지
- SDK createSession: auto-updates sessionToken/sessionId (renewSession과 동일 패턴)
- SDK masterHeaders(): masterAuth와 sessionAuth 헤더 구성 분리
- Python SDK: get_connect_info만 추가 (sessionAuth 전용, masterAuth 미지원)
- ConnectInfo 타입: daemon 응답 형태 그대로 미러링 (변환 없음)
- Admin UI: Create Session 모달로 전환 (체크박스 멀티 지갑 선택 + 라디오 기본 지갑)
- Admin UI: 단일 지갑은 walletId, 다중은 walletIds + defaultWalletId 전송 (하위 호환)
- CLI quickset: 단일 POST /v1/sessions { walletIds } + 단일 mcp-token 파일
- CLI MCP config: 단일 'waiaas' entry, WAIAAS_WALLET_ID 미설정 (connect-info로 발견)
- MCP connect_info: walletContext prefix 없음 (세션 스코프, 지갑별 아님)
- MCP wallet_id: snake_case(MCP param) -> walletId camelCase(API) 변환 컨벤션
- MCP GET tools: walletId query param, POST/PUT: body, DELETE: query param
- MCP action-provider dynamic tools에도 wallet_id 추가 (일관성)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-21
Stopped at: Completed 213-02-PLAN.md (MCP multi-wallet support)
Resume file: None
