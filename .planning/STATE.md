# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v2.6 Wallet SDK 설계 - Phase 199 Plan 01 complete, ready for Plan 02

## Current Position

Phase: 199 of 201 (Wallet SDK + 데몬 컴포넌트 설계)
Plan: 1 of 2 in current phase
Status: In Progress
Last activity: 2026-02-20 — Plan 199-01 completed (SDK 공개 API + WalletLinkConfig + 패키지 구조 설계)

Progress: [####░░░░░░] 43% (3/7 plans)

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

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 199-01-PLAN.md (SDK 공개 API + WalletLinkConfig + 패키지 구조 설계)
Resume file: None
