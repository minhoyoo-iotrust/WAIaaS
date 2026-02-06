---
phase: 19-auth-owner-redesign
plan: 02
subsystem: schema, config
tags: [owner_address, wallet_connections, agents, config.toml, walletconnect, migration]

# Dependency graph
requires:
  - phase: 06-core-architecture
    provides: SQLite 스키마 (25-sqlite-schema.md), monorepo config (24-monorepo-data-directory.md)
  - plan: 19-01
    provides: 3-tier 인증 모델 정의 (ownerAuth Step 5 → agents.owner_address 대조)
provides:
  - "agents.owner_address NOT NULL + idx_agents_owner_address 인덱스"
  - "wallet_connections 테이블 (owner_wallets 대체, WC 세션 캐시 전용)"
  - "config.toml walletconnect 선택적 편의 기능 전환"
  - "v0.5 스키마 마이그레이션 6단계 전략"
  - "Owner 주소 변경 정책 (masterAuth 단일 트랙)"
affects:
  - 19-03 (기존 설계 문서 반영 -- 34-owner-wallet-connection.md wallet_connections 참조)
  - Phase 20 (세션 갱신 -- agents.owner_address 기반 세션 Owner 검증)
  - Phase 21 (DX 개선 -- agent create --owner 플로우)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "에이전트별 Owner 귀속 (agents.owner_address NOT NULL)"
    - "WC 세션 캐시 전용 테이블 (wallet_connections, 인증 소스 아님)"
    - "마이그레이션 중 DEFAULT '' + 애플리케이션 강제 패턴"

key-files:
  created: []
  modified:
    - ".planning/deliverables/25-sqlite-schema.md"
    - ".planning/deliverables/24-monorepo-data-directory.md"

key-decisions:
  - "agents.owner_address NOT NULL: 에이전트 생성 시 Owner 주소 필수 지정"
  - "wallet_connections: owner_wallets 대체, 인증 역할 제거, WC 세션 캐시 전용"
  - "idx_agents_owner_address: 1:N 조회 + ownerAuth 검증 + 일괄 변경 인덱스"
  - "v0.5 마이그레이션 6단계: ALTER ADD → UPDATE copy → CREATE INDEX → RENAME → DROP INDEX → CREATE INDEX"
  - "Owner 주소 변경: masterAuth(implicit) 단일 트랙, APPROVAL 대기 거래 자동 CANCELLED"
  - "config.toml [walletconnect] 선택적 편의 기능: project_id 미설정 시 WC 비활성, CLI 수동 서명 항상 가능"

patterns-established:
  - "에이전트별 Owner 격리: 동일 Owner가 N개 에이전트 소유 가능, 에이전트간 Owner 독립"
  - "FK 없는 참조 관계: wallet_connections.owner_address ↔ agents.owner_address (애플리케이션 레벨)"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 19 Plan 02: Owner 주소 에이전트 귀속 + DB 스키마/Config 변경 Summary

**agents.owner_address NOT NULL 전환, wallet_connections 테이블 신규(owner_wallets 대체), config.toml walletconnect 선택적 편의 기능, v0.5 마이그레이션 6단계 전략**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T16:41:40Z
- **Completed:** 2026-02-07T16:48:36Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- agents 테이블에 owner_address NOT NULL 컬럼 변경 및 idx_agents_owner_address 인덱스 추가 완료
- wallet_connections 테이블을 신규 정의하여 owner_wallets를 대체 (인증 역할 제거, WC 세션 캐시 전용)
- v0.5 스키마 마이그레이션 6단계 전략 작성 (ALTER ADD → UPDATE copy → CREATE INDEX → RENAME → DROP INDEX → CREATE INDEX)
- Owner 주소 변경 정책을 masterAuth 단일 트랙으로 명세 (APPROVAL 대기 거래 자동 CANCELLED 포함)
- config.toml [walletconnect] 섹션을 선택적 편의 기능으로 재정의, CLI 수동 서명 대안 명시
- waiaas init 안내 메시지 변경 (CLI 수동 서명 대안 포함)
- v0.5 Owner 모델 변경 노트 추가

## Task Commits

Each task was committed atomically:

1. **Task 1: agents 테이블 스키마 변경 + wallet_connections 테이블 전환** - `b0d4661` (feat)
2. **Task 2: config.toml walletconnect 섹션 선택적 전환 + Owner 모델 변경 노트** - `41b866c` (feat)

## Files Created/Modified

- `.planning/deliverables/25-sqlite-schema.md` - agents.owner_address NOT NULL, wallet_connections 테이블, 마이그레이션 전략, Owner 변경 정책 (+239줄)
- `.planning/deliverables/24-monorepo-data-directory.md` - [walletconnect] 선택적 편의 기능, Zod 스키마, init 안내 메시지, Owner 모델 변경 노트 (+67줄)

## Decisions Made

1. **agents.owner_address NOT NULL 채택**: 에이전트 생성 시 Owner 주소 필수 지정. 멀티 에이전트 환경에서 에이전트별 Owner 격리 지원. 근거: 19-01의 ownerAuth Step 5 → agents.owner_address 대조 설계와 일관.
2. **wallet_connections 테이블 신설**: owner_wallets를 대체. 핵심 차이: 인증 소스가 아님. ownerAuth는 agents.owner_address로 검증. 테이블 부재가 ownerAuth를 차단하지 않음.
3. **마이그레이션 중 DEFAULT '' 패턴**: NOT NULL + DEFAULT '' 은 마이그레이션 전용. 신규 에이전트는 애플리케이션에서 유효 주소 강제.
4. **Owner 주소 변경 시 APPROVAL 거래 자동 취소**: 기존 Owner 서명이 새 Owner에 유효하지 않으므로, 대기 중 QUEUED 거래를 CANCELLED 처리.
5. **WalletConnect 선택적 전환**: project_id 미설정 시 WC 비활성이지만 CLI 수동 서명으로 모든 ownerAuth 가능. 초기 설정 마찰 제거.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Executor 인터럽트로 SUMMARY.md 생성이 누락되었으나, Task 커밋(b0d4661, 41b866c)은 모두 정상 완료. 수동 복구로 SUMMARY 생성.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- agents.owner_address NOT NULL 정의 완료 -> 19-03에서 34-owner-wallet-connection.md의 owner_wallets → wallet_connections 참조 업데이트 가능
- config.toml walletconnect 선택적 전환 완료 -> 19-03에서 34 문서의 WC 필수 → 선택적 편의로 변경 가능
- OWNR-01~04, AUTH-04 커버리지 완료
- 차단 요소 없음

## Self-Check: PASSED

---
*Phase: 19-auth-owner-redesign*
*Completed: 2026-02-07*
