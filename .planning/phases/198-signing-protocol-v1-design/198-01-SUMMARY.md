---
phase: 198-signing-protocol-v1-design
plan: 01
subsystem: design
tags: [signing-protocol, zod, eip-191, ed25519, universal-link, base64url, ntfy]

# Dependency graph
requires:
  - phase: none
    provides: first phase in v2.6
provides:
  - "doc 73: Signing Protocol v1 설계서 (Sections 1-6)"
  - "SignRequestSchema + SignResponseSchema Zod 스키마 확정"
  - "서명 메시지 포맷 (EIP-191/Ed25519) 확정"
  - "유니버셜 링크 URL 구조 + AASA/assetlinks.json 가이드"
affects: [198-02, 199, 200, 201]

# Tech tracking
tech-stack:
  added: []
  patterns: ["SignRequest/SignResponse Zod SSoT 스키마 패턴", "base64url 인코딩 유니버셜 링크 전달 패턴"]

key-files:
  created:
    - "internal/design/73-signing-protocol-v1.md"
  modified: []

key-decisions:
  - "message 필드에 UTF-8 원문 텍스트 저장, 인코딩은 서명/검증 시 체인 라이브러리가 처리"
  - "Nonce는 requestId(UUID v7) 재사용하여 별도 생성 불필요"
  - "2KB 초과 시 requestId 기반 ntfy 조회 fallback 전략"
  - "signature 인코딩: EVM hex(0x 접두어), Solana base64"

patterns-established:
  - "SignRequest/SignResponse: Zod 정의 -> TypeScript 타입 derive -> 구현 입력"
  - "유니버셜 링크: 지갑 도메인 활용, WAIaaS 도메인 불필요"

requirements-completed: [PROTO-01, PROTO-02]

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 198 Plan 01: Signing Protocol v1 스키마 + 유니버셜 링크 설계 Summary

**SignRequest/SignResponse Zod 스키마(version/requestId/chain/message/metadata/responseChannel 전 필드) + EIP-191/Ed25519 체인별 서명 포맷 + 유니버셜 링크 URL 구조(AASA/assetlinks.json 가이드 포함) 확정**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-19T14:57:10Z
- **Completed:** 2026-02-19T15:01:24Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- doc 73(Signing Protocol v1) 설계 문서 생성 - 12개 섹션 목차 + Sections 1-6 완성
- SignRequest Zod 스키마: version, requestId, chain, network, message, displayMessage, metadata(5-type), responseChannel(ntfy/telegram discriminatedUnion), expiresAt
- SignResponse Zod 스키마: version, requestId, action(approve/reject), signature(조건부 필수), signerAddress, signedAt + action별 검증 규칙
- 서명 메시지 텍스트 템플릿 + EVM(EIP-191 personal_sign) / Solana(Ed25519 detached sign) 체인별 서명/검증 코드
- 유니버셜 링크 URL 패턴 + D'CENT 구체 예시 + AASA/assetlinks.json/AndroidManifest.xml 설정 가이드
- URL 길이 제한 대응: 일반 800-1200자(2KB 이내) + 2KB 초과 시 requestId 기반 ntfy 조회 fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: 설계 문서 골격 + 프로토콜 개요 + 설계 원칙 작성** - `9818e45` (docs)
2. **Task 2: SignRequest/SignResponse 스키마 + 서명 메시지 포맷 + 유니버셜 링크 섹션 작성** - `0ecd820` (docs)

## Files Created/Modified
- `internal/design/73-signing-protocol-v1.md` - Signing Protocol v1 설계서 (722줄, Sections 1-6 완성 + 7-12 Plan 02 placeholder)

## Decisions Made
- message 필드에 UTF-8 원문 텍스트를 저장하고, hex/base64 인코딩은 서명/검증 시 각 체인 라이브러리가 처리하도록 결정. displayMessage와 message가 동일한 텍스트 기반이 되어 가독성과 검증 가능성 확보
- Nonce는 requestId(UUID v7)를 재사용하여 별도 생성 로직 불필요. requestId + 응답 토픽 + 만료로 1회성 보장
- signature 인코딩: EVM은 hex(0x 접두어, 65 bytes r+s+v), Solana는 base64(64 bytes Ed25519)
- 2KB 초과 시 URL에는 requestId만 포함하고 전체 SignRequest는 ntfy 토픽에서 조회하는 fallback 전략

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 198-02에서 Sections 7-12(ntfy 채널 프로토콜, Telegram 채널 프로토콜, 만료 정책, 보안 모델, 에러 코드, 기술 결정 요약) 작성 가능
- SignRequest/SignResponse 스키마가 확정되어 채널 프로토콜 설계의 입력으로 사용 가능

## Self-Check: PASSED

- FOUND: internal/design/73-signing-protocol-v1.md
- FOUND: .planning/phases/198-signing-protocol-v1-design/198-01-SUMMARY.md
- FOUND: 9818e45 (Task 1 commit)
- FOUND: 0ecd820 (Task 2 commit)

---
*Phase: 198-signing-protocol-v1-design*
*Completed: 2026-02-19*
