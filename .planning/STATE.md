---
gsd_state_version: 1.0
milestone: v31.11
milestone_name: — External Action 프레임워크 설계
status: completed
stopped_at: Completed 383-02-PLAN.md
last_updated: "2026-03-12T15:25:00.000Z"
last_activity: 2026-03-12 — Phase 383 complete (2 plans)
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 8
  completed_plans: 8
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.
**Current focus:** Phase 384 — 정책 + 추적 확장

## Current Position

Phase: 4 of 6 (Phase 383: 파이프라인 라우팅) — COMPLETE
Plan: 2/2 complete
Status: Phase 383 complete, ready for Phase 384
Last activity: 2026-03-12 — Phase 383 complete (2 plans)

Progress: [######░░░░] 67%

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 6min
- Total execution time: 0.8 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 380 | 2 | 15min | 8min |
| 381 | 2 | 16min | 8min |
| 382 | 2 | 10min | 5min |
| 383 | 2 | 10min | 5min |

## Accumulated Context
| Phase 380 P01 | 8min | 1 tasks | 1 files |
| Phase 380 P02 | 7min | 1 tasks | 1 files |
| Phase 381 P01 | 8min | 1 tasks | 1 files |
| Phase 381 P02 | 8min | 1 tasks | 1 files |
| Phase 382 P01 | 5min | 1 tasks | 1 files |
| Phase 382 P02 | 5min | 1 tasks | 1 files |
| Phase 383 P01 | 5min | 1 tasks | 1 files |
| Phase 383 P02 | 5min | 1 tasks | 1 files |

### Decisions

- Design-only milestone: Zod 스키마 초안 + 설계 문서만, 구현 코드 없음
- Widening strategy: 기존 13개 ActionProvider/4개 파이프라인 경로 무변경, 새 kind 기반 라우팅 분기 추가
- kind normalization: registry에서만 수행, 기존 provider는 kind 없이 반환해도 contractCall로 정규화
- [Phase 380]: kind 필드를 optional로 추가하여 기존 13개 provider 코드 변경 0줄 보장
- [Phase 380]: ApiDirectResult는 ResolvedAction union 밖으로 분리 (의미론적 차이: 실행 완료 vs 서명 대기)
- [Phase 380]: SigningParams는 scheme별 discriminated union (타입 안전성 보장)
- [Phase 380]: credential 주입 시점: sign() 직전에 CredentialVault에서 주입 (노출 최소화)
- [Phase 381]: auth_tag을 별도 DB 컬럼으로 분리 (디버깅 용이성)
- [Phase 381]: node:crypto 사용 (sodium-native 아님) — credential 암호화에는 표준 AES-256-GCM으로 충분
- [Phase 381]: AAD에 credentialId 포함하여 cipher text 재배치 공격 방지
- [Phase 381]: credential 이력 보존은 v1에서 생략 (rotate 시 덮어쓰기)
- [Phase 381]: 만료 체크는 get() 시점에서 lazy evaluation
- [Phase 381]: Admin UI Credentials 탭은 per-wallet + 글로벌 두 진입점
- [Phase 381]: MCP/SDK에서도 복호화된 credential 값 비반환 원칙
- [Phase 382]: Erc8128만 기존 모듈 import 허용 (RFC 9421 복잡도), Eip712/Personal은 viem 직접 호출
- [Phase 382]: EcdsaSignBytes hashData 옵션 (기본 true=keccak256), Ed25519는 외부 해시 불필요
- [Phase 382]: TransactionSignerCapability는 설계만, registry 미등록 (기존 pipeline 사용)
- [Phase 382]: HMAC signing target 조합은 ActionProvider 책임 (거래소마다 prehash 상이)
- [Phase 382]: resolve()에서 canSign() 미호출 (credential 미주입 시점)
- [Phase 382]: CAPABILITY_NOT_FOUND 에러 코드 추가 (기존 5종 + 1종 = 6종)
- [Phase 382]: SignerCapabilityRegistry singleton, daemon 부팅 시 7종 자동 등록
- [Phase 383]: signedHttp pipeline은 서명만 반환, fetch는 ActionProvider 책임 (관심사 분리)
- [Phase 383]: txHash는 이미 nullable (Drizzle 스키마 확인 완료), wallets.ts 1곳만 action_kind 기반 수정 필요
- [Phase 383]: action_kind DEFAULT 'contractCall'로 기존 레코드 자동 호환
- [Phase 383]: off-chain action은 즉시 CONFIRMED 상태 기록 (비동기 추적은 Phase 384)
- [Phase 383]: DB 마이그레이션 v56 (wallet_credentials v55 다음)
- [Phase 383]: 별도 off-chain 엔드포인트 없이 기존 POST /v1/actions/:provider/:action 확장
- [Phase 383]: MCP action-list-offchain 신규 도구 + SDK ActionResult kind-union
- [Phase 383]: connect-info에 externalActions + supportedVenues capability 추가

### Pending Todos

None.

### Blockers/Concerns

- ~~transactions 테이블 txHash NOT NULL 가정 전수 조사 필요 (Phase 383)~~ — RESOLVED: txHash는 이미 nullable, wallets.ts 1곳만 수정 필요

## Session Continuity

Last session: 2026-03-12T15:25:00.000Z
Stopped at: Completed 383-02-PLAN.md
Resume file: None
