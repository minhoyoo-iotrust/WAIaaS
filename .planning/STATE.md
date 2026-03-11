---
gsd_state_version: 1.0
milestone: v31.11
milestone_name: — External Action 프레임워크 설계
status: completed
stopped_at: Completed 385-01-PLAN.md
last_updated: "2026-03-11T15:58:49.339Z"
last_activity: 2026-03-12 — Phase 385 complete (1 plan)
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 11
  completed_plans: 11
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.
**Current focus:** Phase 385 — 설계 문서 통합

## Current Position

Phase: 6 of 6 (Phase 385: 설계 문서 통합) — COMPLETE
Plan: 1/1 complete
Status: Milestone v31.11 complete (6/6 phases, 11/11 plans)
Last activity: 2026-03-12 — Phase 385 complete (1 plan)

Progress: [##########] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: 6min
- Total execution time: 1.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 380 | 2 | 15min | 8min |
| 381 | 2 | 16min | 8min |
| 382 | 2 | 10min | 5min |
| 383 | 2 | 10min | 5min |
| 384 | 2 | 10min | 5min |
| 385 | 1 | 7min | 7min |

## Accumulated Context
| Phase 380 P01 | 8min | 1 tasks | 1 files |
| Phase 380 P02 | 7min | 1 tasks | 1 files |
| Phase 381 P01 | 8min | 1 tasks | 1 files |
| Phase 381 P02 | 8min | 1 tasks | 1 files |
| Phase 382 P01 | 5min | 1 tasks | 1 files |
| Phase 382 P02 | 5min | 1 tasks | 1 files |
| Phase 383 P01 | 5min | 1 tasks | 1 files |
| Phase 383 P02 | 5min | 1 tasks | 1 files |
| Phase 384 P01 | 5min | 1 tasks | 1 files |
| Phase 384 P02 | 5min | 1 tasks | 1 files |
| Phase 385 P01 | 7min | 2 tasks | 3 files |

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
- [Phase 384]: VENUE_WHITELIST는 default-deny + Admin Settings venue_whitelist_enabled(기본 false)로 비활성화 가능
- [Phase 384]: ACTION_CATEGORY_LIMIT와 SPENDING_LIMIT 완전 독립 (on-chain amount vs off-chain notionalUsd)
- [Phase 384]: notionalUsd를 metadata JSON에 저장 (스키마 변경 최소화)
- [Phase 384]: riskLevel 4등급 자동 매핑: low->INSTANT, medium->NOTIFY, high->DELAY, critical->APPROVAL
- [Phase 384]: bridge_status/bridge_metadata 재사용 (별도 테이블 아님) — AsyncPollingService 인프라 100% 재사용
- [Phase 384]: AsyncTrackingResult.state 9종 (기존 4 + PARTIALLY_FILLED/FILLED/CANCELED/SETTLED/EXPIRED)
- [Phase 384]: tracking 없는 off-chain action은 bridge_status NULL (비동기 추적 불필요)
- [Phase 384]: DB 마이그레이션 v57 (복합 인덱스 action_kind + bridge_status)
- [Phase 385]: doc-81 번호 사용 (doc-77은 DCent Swap, doc-78은 Hyperliquid)
- [Phase 385]: 구현 우선순위 4 Wave: 타입+서명 -> CredentialVault -> 파이프라인 -> 정책+추적

### Pending Todos

None.

### Blockers/Concerns

- ~~transactions 테이블 txHash NOT NULL 가정 전수 조사 필요 (Phase 383)~~ — RESOLVED: txHash는 이미 nullable, wallets.ts 1곳만 수정 필요

## Session Continuity

Last session: 2026-03-11T15:57:41.646Z
Stopped at: Completed 385-01-PLAN.md
Resume file: None
