---
phase: 01-tech-stack
plan: 01
subsystem: tech-decisions
tags: [typescript, fastify, prisma, postgresql, turnkey, solana, helius, pnpm, turborepo]

# Dependency graph
requires: []
provides:
  - 권장 기술 스택 최종 확정 문서 (TECH-01)
  - Solana 개발 환경 및 도구 선정 문서 (TECH-02)
  - TypeScript + Fastify + PostgreSQL 기술 스택 결정
  - @solana/kit 3.x + Helius RPC 환경 결정
affects:
  - 02-core-infra
  - 03-wallet-api
  - 04-agent-integration
  - 05-mcp-integration

# Tech tracking
tech-stack:
  added:
    - TypeScript 5.x
    - Node.js 22 LTS
    - Fastify 5.x
    - Prisma 6.x
    - PostgreSQL 16.x
    - Redis 7.x
    - ioredis 5.x
    - "@solana/kit 3.0.x"
    - "@solana/web3.js 1.98.x (레거시)"
    - "@turnkey/sdk-server"
    - solana-agent-kit 2.x
    - pnpm 9.x
    - Turborepo 2.x
    - Vitest
    - Helius (RPC 프로바이더)
  patterns:
    - 모노레포 구조 (apps/api, packages/core, packages/solana, packages/key-management, packages/database, packages/shared)
    - Layered Service Architecture
    - Plugin-Based Fastify Routes
    - Policy-First Transaction Signing

key-files:
  created:
    - .planning/deliverables/01-tech-stack-decision.md
    - .planning/deliverables/02-solana-environment.md
  modified: []

key-decisions:
  - "TypeScript 5.x 선택: Solana 생태계 호환, 타입 안전성"
  - "Fastify 5.x 선택: Express 대비 2.7배 성능"
  - "Turnkey 선택: TEE 기반 보안, Solana Policy Engine"
  - "AWS 선택: Turnkey와 동일 인프라"
  - "@solana/kit 3.x 권장, @solana/web3.js 1.98.x 레거시 호환"
  - "Helius RPC 선택: DAS API 지원, 가격 대비 성능"
  - "Devnet(개발) -> Testnet(스테이징) -> Mainnet(프로덕션) 테스트넷 전략"

patterns-established:
  - "Monorepo Structure: apps/api, packages/{core,solana,key-management,database,shared}"
  - "SDK Version Coexistence: @solana/kit for new code, @solana/web3.js for Anchor integration"
  - "Policy-First Transaction: All transactions pass through policy engine before signing"
  - "Plugin-Based Agent Integration: Solana Agent Kit v2 with modular plugins"

# Metrics
duration: 5min
completed: 2026-02-04
---

# Phase 1 Plan 1: 기술 스택 및 Solana 환경 설계 Summary

**TypeScript + Fastify + Turnkey 기술 스택 확정, @solana/kit 3.x + Helius RPC로 Solana 개발 환경 선정**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-04T12:09:35Z
- **Completed:** 2026-02-04T12:14:16Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- TECH-01 권장 기술 스택 문서 완성 (478줄): 언어/런타임, 프레임워크, DB, 모노레포, 키 관리, 클라우드 인프라 확정
- TECH-02 Solana 개발 환경 문서 완성 (606줄): SDK 버전, 에이전트 통합, 테스트넷 전략, RPC 프로바이더 확정
- 각 기술 선택에 대해 비교 대상과 "왜 이것인가" 근거 명시
- 모노레포 구조 및 초기 설정 명령어 정리

## Task Commits

Each task was committed atomically:

1. **Task 1: 권장 기술 스택 최종 확정 문서 작성 (TECH-01)** - `c6c850e` (docs)
2. **Task 2: Solana 개발 환경 및 도구 선정 문서 작성 (TECH-02)** - `1e47d76` (docs, included in 01-02 plan metadata commit)

**Note:** Task 2 file (02-solana-environment.md) was created during this execution but was committed as part of a concurrent plan execution (01-02). Content is correct and verified.

## Files Created/Modified

- `.planning/deliverables/01-tech-stack-decision.md` - 권장 기술 스택 최종 확정 문서 (TECH-01)
  - 언어: TypeScript 5.x + Node.js 22 LTS
  - 프레임워크: Fastify 5.x
  - DB: PostgreSQL 16.x + Prisma 6.x + Redis 7.x
  - 모노레포: pnpm 9.x + Turborepo 2.x
  - 키 관리: Turnkey SDK
  - 인프라: AWS

- `.planning/deliverables/02-solana-environment.md` - Solana 개발 환경 문서 (TECH-02)
  - SDK: @solana/kit 3.0.x (권장), @solana/web3.js 1.98.x (레거시)
  - 에이전트: Solana Agent Kit v2 플러그인 시스템
  - 테스트넷: Devnet -> Testnet -> Mainnet-beta
  - RPC: Helius (DAS API 지원)

## Decisions Made

### 프레임워크 선택
- **Fastify 5.x**: Express 대비 2.7배 처리량, 5배 낮은 지연시간. JSON 스키마 검증 내장.

### 키 관리 프로바이더
- **Turnkey**: TEE 기반 보안, 50-100ms 서명 지연, Solana Policy Engine 제공. Crossmint은 Phase 2 PoC에서 비교 평가 예정.

### Solana SDK 버전 전략
- **@solana/kit 3.x 권장**: 신규 코드는 모두 @solana/kit 사용.
- **@solana/web3.js 1.98.x 유지**: Anchor 등 v2 미지원 라이브러리 연동용. 동일 트랜잭션에서 혼용 금지.

### RPC 프로바이더
- **Helius**: DAS API 내장, 무료 티어 100,000 크레딧/월. QuickNode(멀티체인), Triton(지리분산)은 대안으로 보류.

### 클라우드 인프라
- **AWS**: Turnkey가 AWS Nitro Enclaves 사용, 동일 인프라에서 지연시간 최소화.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Concurrent Plan Execution:**
- Task 2 파일(02-solana-environment.md)이 plan 01-02 실행 중 commit 1e47d76에 함께 포함됨
- 파일 내용은 정확하며 검증 완료
- 별도 Task 2 commit이 필요하지 않음 (이미 git에 tracked 상태)

## User Setup Required

None - 설계 문서 단계이므로 외부 서비스 설정 불필요.

Phase 2에서 필요한 설정:
- Turnkey 계정 생성 및 API 키 발급
- Helius 계정 생성 및 API 키 발급
- AWS 계정 및 인프라 프로비저닝

## Next Phase Readiness

**준비 완료:**
- 기술 스택 결정으로 Phase 2부터 즉시 개발 착수 가능
- 모노레포 구조 및 패키지 의존 관계 정의 완료
- 개발 환경 설정 명령어 문서화 완료

**다음 단계:**
- Phase 1 Plan 2: 데이터베이스 및 캐싱 전략 (TECH-03) - 이미 완료됨 (01-02)
- Phase 1 Plan 3: 보안 및 인증 전략 (TECH-04)

**블로커/우려사항:**
- 없음. 모든 요구사항 충족.

---
*Phase: 01-tech-stack*
*Plan: 01*
*Completed: 2026-02-04*
