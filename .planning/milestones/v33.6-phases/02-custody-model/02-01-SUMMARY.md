---
phase: 02-custody-model
plan: 01
subsystem: security
tags: [custody, mpc, tee, kms, hsm, solana, wallet, waas]

# Dependency graph
requires:
  - phase: 01-tech-stack
    provides: 기술 스택 결정 (TypeScript, AWS 인프라)
provides:
  - 커스터디 모델 비교 분석 (CUST-01)
  - 프로바이더 기능 비교표 (CUST-03)
  - 직접 구축 방향 근거
affects: [02-02, 02-03, 03-architecture]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "KMS + TEE + 온체인 멀티시그 하이브리드 아키텍처"
    - "Dual Key (Owner + Agent) 권한 분리"

key-files:
  created:
    - .planning/deliverables/04-custody-model-comparison.md
    - .planning/deliverables/05-provider-comparison.md
  modified: []

key-decisions:
  - "CUST-01: KMS + TEE + Squads 하이브리드 접근법 권장"
  - "CUST-03: 외부 프로바이더 의존 없이 직접 구축"
  - "보안 최우선: HSM 대신 KMS ED25519 활용 (비용 효율)"

patterns-established:
  - "커스터디 모델 분석: 키 소유권, 단일 장애점, AI 적합성 기준"
  - "프로바이더 벤치마킹: 참고 자료로만 활용, 직접 구축 방향"

# Metrics
duration: 5min
completed: 2026-02-04
---

# Phase 2 Plan 1: 커스터디 모델 비교 분석 Summary

**Custodial/Non-custodial/MPC-TSS 모델 비교 및 KMS+TEE+Squads 하이브리드 아키텍처 권장안 도출**

## Performance

- **Duration:** 5분
- **Started:** 2026-02-04T12:58:33Z
- **Completed:** 2026-02-04T13:04:17Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- Custodial, Non-custodial, MPC-TSS 세 가지 커스터디 모델의 장단점을 AI 에이전트 관점에서 상세 분석
- HSM, KMS, 자체 MPC, TEE 네 가지 직접 구축 옵션을 비용, 보안, Solana 적합성 기준으로 비교
- Turnkey, Dfns, Crossmint 등 6개 WaaS 프로바이더 기능을 벤치마킹 (참고 자료)
- KMS + Nitro Enclaves + Squads Protocol 하이브리드 아키텍처를 WAIaaS 권장 스택으로 결정

## Task Commits

Each task was committed atomically:

1. **Task 1: 커스터디 모델 비교 분석 문서 작성 (CUST-01)** - `5fb05dd` (docs)
2. **Task 2: 외부 프로바이더 기능 비교표 작성 (CUST-03)** - `116c5e2` (docs)

## Files Created

- `.planning/deliverables/04-custody-model-comparison.md` - 커스터디 모델 비교 분석 (754줄)
  - Custodial, Non-custodial, MPC-TSS 모델 상세 분석
  - HSM, KMS, TEE 직접 구축 옵션 비교
  - 비교 매트릭스 및 하이브리드 접근법 권장

- `.planning/deliverables/05-provider-comparison.md` - 외부 프로바이더 기능 비교표 (676줄)
  - 6개 WaaS 프로바이더 개별 분석
  - 보안 모델, Solana 지원, AI 특화 기능 비교
  - 직접 구축 vs 프로바이더 비용/벤더락인 분석

## Decisions Made

### CUST-01: 권장 아키텍처 결정

| 구성 요소 | 기술 | 역할 |
|----------|------|------|
| Owner Key | AWS KMS (ED25519) | 마스터 권한, 긴급 대응 |
| Agent Key | AWS Nitro Enclaves | 자율 운영, 정책 강제 |
| 온체인 정책 | Squads Protocol v4 | 권한 분리, 지출 한도 |

**근거:**
- KMS: ED25519 공식 지원 (2025-11), FIPS 140-2 Level 2, 저비용 ($1/10K 요청)
- Nitro Enclaves: Coinbase/Fireblocks 검증, 하드웨어 격리, 추가 비용 없음
- Squads: $10B+ 자산 보호 실적, formal verification 완료

### CUST-03: 직접 구축 결정

- **외부 프로바이더 의존 배제**: 벤더 락인 위험, 데이터 주권, 장기 비용 효율
- **5년 비용 절감**: 직접 구축 $57,600 vs 프로바이더 $90,000 (36% 절감)
- **프로바이더 활용**: 벤치마킹 목적으로만 참고

### HSM 제외 결정

- AWS CloudHSM은 ED25519 미지원으로 Solana 부적합
- 월 $1,168+ 비용 대비 KMS ($10/월)의 비용 효율성
- KMS가 FIPS 140-2 Level 2로 충분한 보안 수준 제공

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - 문서 작성 기반 태스크로 기술적 이슈 없음.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

### 준비 완료 사항
- 커스터디 모델 비교 분석 완료 (CUST-01)
- 권장 아키텍처 결정: KMS + TEE + Squads
- 프로바이더 벤치마킹 완료 (CUST-03)

### 다음 단계 (Plan 02-02)
- Dual Key 아키텍처 상세 설계 (CUST-02)
- Owner Key + Agent Key 역할 정의
- 정책 엔진 요구사항 도출

### 블로커/우려 사항
- 없음

---
*Phase: 02-custody-model*
*Plan: 01*
*Completed: 2026-02-04*
