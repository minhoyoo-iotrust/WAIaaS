---
phase: 383-pipeline-routing
plan: 01
subsystem: pipeline
tags: [action-provider, pipeline-routing, off-chain, db-migration, policy]

requires:
  - phase: 380-resolved-action-type-system
    provides: ResolvedAction 3종 Zod union + normalizeResolvedAction()
  - phase: 381-credential-vault-infra
    provides: ICredentialVault + resolveCredentialRef()
  - phase: 382-signer-capabilities
    provides: SignerCapabilityRegistry + 7종 ISignerCapability
provides:
  - 3-way pipeline routing design (contractCall/signedData/signedHttp)
  - signedData 5-stage pipeline design
  - signedHttp 6-stage pipeline design
  - transactions table v56 migration design (action_kind, venue, operation, external_id)
  - txHash nullable audit results
  - Policy evaluation timing guarantee for all kinds
affects: [384-policy-tracking, 385-design-doc-integration]

tech-stack:
  added: []
  patterns: [kind-based pipeline routing, off-chain action DB recording]

key-files:
  created:
    - .planning/phases/383-pipeline-routing/design/pipeline-routing-design.md
  modified: []

key-decisions:
  - "signedHttp pipeline returns signature only, no fetch (ActionProvider responsibility)"
  - "txHash is already nullable in Drizzle schema; 1 code path in wallets.ts needs action_kind-based fix"
  - "action_kind DEFAULT 'contractCall' for backward compat with existing records"
  - "off-chain actions recorded as CONFIRMED immediately (no PENDING/SUBMITTED states)"
  - "DB migration v56 (after wallet_credentials v55)"

patterns-established:
  - "kind-based switch routing: contractCall→6-stage, signedData→5-stage, signedHttp→6-stage"
  - "policy evaluation always at resolve()-after, sign-before for all kinds"

requirements-completed: [PIPE-01, PIPE-02, PIPE-03]

duration: 5min
completed: 2026-03-12
---

# Phase 383 Plan 01: Pipeline Routing Design Summary

**kind별 3-way 파이프라인 라우팅 + transactions v56 마이그레이션 + 정책 평가 시점 보장 설계**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T15:15:03Z
- **Completed:** 2026-03-11T15:20:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- kind 기반 3-way 파이프라인 분기 설계 (contractCall→기존 6-stage, signedData→신규 5-stage, signedHttp→신규 6-stage)
- transactions 테이블 txHash nullable 전수 조사 완료 — 이미 nullable, wallets.ts 1곳만 수정 필요
- DB 마이그레이션 v56 설계 (action_kind, venue, operation, external_id 컬럼)
- 정책 평가 시점을 모든 kind에서 resolve() 후 서명 전으로 보장하는 설계
- signedHttp는 서명만 반환, fetch는 ActionProvider 책임으로 분리

## Task Commits

1. **Task 1: 3-way pipeline routing + DB schema + policy evaluation design** - `456a9e5b` (docs)

## Files Created/Modified
- `.planning/phases/383-pipeline-routing/design/pipeline-routing-design.md` — 863줄, 9개 섹션 (개요, 3-way 라우팅, signedData pipeline, signedHttp pipeline, DB 스키마, 정책 평가, 에러 처리, 설계 결정, pitfall 체크리스트)

## Decisions Made
- signedHttp 파이프라인은 서명만 반환, HTTP 발송(fetch)은 수행하지 않음 (관심사 분리)
- txHash는 이미 nullable — Drizzle 스키마 확인 완료, wallets.ts 1곳만 action_kind 기반 수정 필요
- action_kind DEFAULT 'contractCall'로 기존 레코드 자동 호환
- off-chain action은 즉시 CONFIRMED 상태로 기록 (비동기 추적은 Phase 384)
- DB 마이그레이션 v56 (wallet_credentials v55 다음)
- venue를 toAddress에도 저장하여 기존 검색 쿼리 호환

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Pipeline routing design complete, ready for 383-02 (REST/MCP/SDK interfaces)
- txHash nullable blocker resolved (STATE.md에 기록된 blocker 해결됨)

---
*Phase: 383-pipeline-routing*
*Completed: 2026-03-12*
