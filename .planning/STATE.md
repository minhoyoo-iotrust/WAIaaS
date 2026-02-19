# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v2.6 Wallet SDK 설계 - Phase 199 complete, ready for Phase 200

## Current Position

Phase: 200 of 201 (알림 채널 설계)
Plan: 0 of ? in current phase
Status: In Progress
Last activity: 2026-02-20 — Plan 199-02 completed (데몬 컴포넌트 인터페이스 + 채널 라우팅 + DB 스키마 설계)

Progress: [######░░░░] 57% (4/7 plans)

## Performance Metrics

**Cumulative:** 45 milestones, 197 phases, 415 plans, 1,151 reqs, ~4,066+ tests, ~151,015+ LOC TS

**v2.6 Scope:** 4 phases, 23 requirements, ~7 plans (TBD)

## Accumulated Context

### Decisions

Full log in PROJECT.md and milestones/.
v2.6 design decisions: See internal/objectives/m26-00 through m26-03.

**198-01 decisions:**
- message 필드에 UTF-8 원문 텍스트 저장, 인코딩은 체인 라이브러리가 처리
- Nonce는 requestId(UUID v7) 재사용
- signature 인코딩: EVM hex(0x), Solana base64
- 2KB 초과 시 requestId 기반 ntfy 조회 fallback

**198-02 decisions:**
- ntfy 응답 토픽은 requestId 기반 1회용 (122비트 엔트로피, 토픽 자체가 인증)
- Telegram 응답은 chatId + signerAddress + 서명 검증의 3중 보안
- 자동 재시도 없음 원칙: 만료 후 새 SignRequest 생성 필요
- 프로덕션에서 self-hosted ntfy 권장

**199-01 decisions:**
- parseSignRequest 반환 타입 SignRequest | Promise<SignRequest>로 인라인/ntfy 조회 2모드 지원
- zod만 peerDependency, fetch/EventSource/URL은 내장 API로 의존성 최소화
- tsup ESM+CJS dual output, ES2022 타겟으로 React Native/Electron/Node.js 지원
- sendViaTelegram은 void 반환 (URL 스킴 호출은 비동기 결과 확인 불가)

**199-02 decisions:**
- ISigningChannel 공통 인터페이스: sendRequest+waitForResponse 2메서드로 ntfy/telegram 채널 교체 가능
- WalletLinkRegistry 저장소를 SettingsService signing_sdk.wallets JSON 배열로 결정 (별도 테이블 불필요)
- ApprovalChannelRouter 5단계 fallback: ownerApprovalMethod > SDK > WC > Telegram Bot > REST
- owner_approval_method CHECK 제약 + NULL 허용 (NULL=글로벌 fallback)
- SignRequest 임시 저장소: 메모리 Map 기본 사용
- ntfy 서버 URL: 기존 notifications.ntfy_server 재사용
- Telegram /sign_response 핸들러: 기존 Long Polling handleUpdate()에 명령어 추가

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 199-02-PLAN.md (데몬 컴포넌트 인터페이스 + 채널 라우팅 + DB 스키마 설계)
Resume file: None
