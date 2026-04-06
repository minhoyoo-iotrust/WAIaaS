---
phase: 02-custody-model
plan: 03
subsystem: security
tags: [aws-kms, nitro-enclaves, squads-protocol, dual-key, custody]

# Dependency graph
requires:
  - phase: 02-01
    provides: "커스터디 모델 비교 분석 (CUST-01, CUST-03)"
  - phase: 02-02
    provides: "AI 에이전트 특화 커스터디 고려사항 (CUST-02)"
provides:
  - "WAIaaS 권장 커스터디 모델 제안서 (CUST-04)"
  - "AWS KMS + Nitro Enclaves + Squads Protocol 하이브리드 아키텍처 결정"
  - "Phase 1 Turnkey 결정 철회 및 직접 구축 방향 확정"
  - "구성 요소별 상세 구현 가이드"
  - "위험 매트릭스 및 완화 전략"
  - "비용 분석 (직접 구축 vs 외부 프로바이더)"
affects: ["03-system-architecture", "04-api-design", "05-implementation"]

# Tech tracking
tech-stack:
  added: [aws-kms, nitro-enclaves, squads-protocol-v4, solana-kms-signer]
  patterns: [dual-key-architecture, tee-based-key-management, onchain-policy-enforcement]

key-files:
  created:
    - .planning/deliverables/07-recommended-custody-model.md
  modified:
    - .planning/deliverables/01-tech-stack-decision.md

key-decisions:
  - "CUST-04: AWS KMS + Nitro Enclaves + Squads Protocol 하이브리드 아키텍처 권장"
  - "CUST-04: 외부 WaaS 프로바이더 배제, 직접 구축 방향 확정"
  - "CUST-04: Owner Key는 KMS (FIPS 140-2 Level 3), Agent Key는 TEE (빠른 서명)"
  - "CUST-04: Squads 2-of-2 멀티시그로 온체인 정책 강제"
  - "TECH-01 수정: Turnkey 프로바이더 결정 철회"

patterns-established:
  - "Dual Key Architecture: Owner Key (관리) + Agent Key (운영) 분리"
  - "3중 정책 검증: Server -> Enclave -> Squads 온체인"
  - "동적 Threshold: 소액 1-of-2, 고액 2-of-2"

# Metrics
duration: 7min
completed: 2026-02-04
---

# Phase 2 Plan 3: 권장 커스터디 모델 제안 및 Turnkey 결정 철회 Summary

**AWS KMS + Nitro Enclaves + Squads Protocol 하이브리드 아키텍처 권장, Phase 1 Turnkey 결정 철회 및 직접 구축 방향 확정**

## Performance

- **Duration:** 7분
- **Started:** 2026-02-04T22:10:00Z
- **Completed:** 2026-02-04T22:17:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- WAIaaS 권장 커스터디 모델 제안서 (CUST-04) 작성 완료 (1,118줄)
- CUST-01~03 분석 결과를 종합한 최종 아키텍처 결정
- Phase 1 Turnkey 결정을 철회하고 직접 구축 방향으로 기술 스택 업데이트
- 6개 위험 요소와 상세 완화 전략 문서화
- 직접 구축 vs 외부 프로바이더 비용 분석 (5년 기준 36% 절감)
- Phase 3 구현 로드맵 제시

## Task Commits

Each task was committed atomically:

1. **Task 1: WAIaaS 권장 커스터디 모델 제안서 작성 (CUST-04)** - `dbc0587` (feat)
2. **Task 2: Phase 1 Turnkey 결정 철회 반영** - `811e186` (fix)

## Files Created/Modified

- `.planning/deliverables/07-recommended-custody-model.md` - WAIaaS 권장 커스터디 모델 제안서 (CUST-04)
  - Executive Summary
  - 권장 아키텍처 개요 (Dual Key Architecture 다이어그램)
  - 구성 요소별 상세 분석 (Owner Key, Agent Key, Squads)
  - 선택 근거 종합 (배제된 옵션과 이유)
  - AI 에이전트 요구사항 충족 매핑
  - 구현 로드맵
  - 위험 요소 및 완화 방안
  - 비용 분석
  - 대안 검토

- `.planning/deliverables/01-tech-stack-decision.md` - Turnkey 결정 철회 반영
  - 수정 이력 섹션 추가
  - 키 관리 섹션 업데이트 (Turnkey -> AWS KMS + Nitro + Squads)
  - 클라우드 인프라 섹션 근거 업데이트
  - 패키지 의존성 업데이트
  - 환경 변수 템플릿 업데이트
  - 버전 참조 테이블 업데이트

## Decisions Made

### 1. AWS KMS + Nitro Enclaves + Squads Protocol 하이브리드 아키텍처 권장

**근거:**
- Owner Key는 KMS (FIPS 140-2 Level 3 검증, 감사 로그, IAM 제어)
- Agent Key는 TEE (밀리초 응답, 하드웨어 격리, Attestation 검증)
- Squads로 온체인 정책 강제 (서버 침해 시에도 정책 우회 불가)

### 2. 외부 WaaS 프로바이더 배제, 직접 구축 확정

**근거:**
- 벤더 락인 방지 (서비스 중단, 가격 인상 리스크)
- 데이터 주권 (키가 자사 AWS 계정에만 존재)
- 장기 비용 효율 (5년 기준 36% 절감)
- 커스터마이징 (AI 에이전트 특화 정책 자유 구현)

### 3. Phase 1 Turnkey 결정 철회

**근거:**
- Phase 2 커스터디 모델 분석 결과, 직접 구축이 WAIaaS 요구사항에 더 적합
- CUST-04에 상세 분석 및 대안 검토 포함

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - 모든 선행 조건(Plan 02-01, 02-02 결과물)이 정상적으로 존재하여 원활하게 진행됨.

## User Setup Required

None - 본 Plan은 설계 문서 작성으로, 외부 서비스 설정이 필요하지 않음.

## Next Phase Readiness

### Phase 3 (시스템 아키텍처) 준비 완료

1. **권장 아키텍처 확정:** AWS KMS + Nitro Enclaves + Squads Protocol
2. **구현 로드맵 제시:** 5단계 구현 순서 (KMS -> Enclave -> Squads -> 정책 -> 복구)
3. **구성 요소별 상세:** 코드 예시, 정책 구조, 비용 분석 포함

### Phase 3에서 참조할 섹션

| Phase 3 작업 | CUST-04 참조 섹션 |
|-------------|------------------|
| AWS KMS 키 생성 | 3.1 Owner Key 관리 |
| Nitro Enclave 구축 | 3.2 Agent Key 런타임 |
| Squads 통합 | 3.3 온체인 권한 제어 |
| 정책 엔진 | 5.2.5 자율성 제한 |
| 장애 복구 | 7.2 상세 완화 전략 |

### 남은 우려 사항

- Squads v4의 동적 threshold 기능이 AI 에이전트 정책에 충분한지 Phase 3에서 검증 필요
- 다중 리전 배포 시 Enclave attestation 일관성 추후 설계 필요

---

*Phase: 02-custody-model*
*Plan: 03*
*Completed: 2026-02-04*
