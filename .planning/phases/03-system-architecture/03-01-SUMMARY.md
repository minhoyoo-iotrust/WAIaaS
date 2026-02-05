---
phase: 03-system-architecture
plan: 01
subsystem: architecture
tags: [dual-key, aws-kms, nitro-enclaves, squads, monolith, interface-abstraction]

# Dependency graph
requires:
  - phase: 02-custody-model
    provides: "AWS KMS + Nitro Enclaves + Squads Protocol 하이브리드 아키텍처 결정"
provides:
  - "Dual Key 아키텍처 상세 설계 (ARCH-01)"
  - "시스템 컴포넌트 다이어그램 및 책임 정의 (ARCH-02)"
  - "Owner Key / Agent Key 역할, 권한, 저장 방식 정의"
  - "IKeyManagementService 인터페이스 추상화"
  - "모노레포 패키지 구조 (core, cloud, selfhost, api)"
  - "클라우드/셀프호스트 환경별 구현 차이 문서화"
affects: [03-02, 03-03, 04-api-design, 05-implementation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual Key Architecture (Owner Key + Agent Key)"
    - "IKeyManagementService interface abstraction"
    - "Monorepo with packages/core, packages/cloud, packages/selfhost, packages/api"
    - "vsock communication protocol for Enclave"
    - "C4 Model diagrams for architecture documentation"

key-files:
  created:
    - ".planning/deliverables/08-dual-key-architecture.md"
    - ".planning/deliverables/09-system-components.md"
  modified: []

key-decisions:
  - "Owner Key: AWS KMS ECC_NIST_EDWARDS25519 (클라우드), libsodium sealed box (셀프호스트)"
  - "Agent Key: Nitro Enclaves (클라우드), 암호화 키스토어 + Argon2id (셀프호스트)"
  - "IAM Role 기반 Instance Profile로 Owner Key 접근 (장기 자격 증명 노출 방지)"
  - "vsock 통신 프로토콜로 Enclave와 호스트 간 서명 요청/응답"
  - "Squads 2-of-2 멀티시그 + 동적 threshold (소액 1-of-2, 고액 2-of-2)"
  - "키 로테이션: Agent Key 90일, Owner Key 연 1회"
  - "모놀리식 구조 + 인터페이스 추상화 (향후 분리 가능)"
  - "클라우드/셀프호스트 동일 기능, 인프라만 다름"

patterns-established:
  - "IKeyManagementService: signWithOwnerKey, signWithAgentKey, rotateAgentKey"
  - "IPolicyEngine: evaluate, validate, determineEscalation"
  - "IBlockchainAdapter: createSmartWallet, buildTransaction, submitTransaction"
  - "Fail-safe: 장애 시 모든 트랜잭션 거부"
  - "이중 검증: 서버 정책 + Enclave 정책 + 온체인 정책"

# Metrics
duration: 8min 22s
completed: 2026-02-04
---

# Phase 3 Plan 01: Dual Key 아키텍처 및 시스템 컴포넌트 설계 Summary

**Owner Key(KMS/로컬) + Agent Key(Enclave/암호화 키스토어) Dual Key 아키텍처와 IKeyManagementService 인터페이스 추상화 기반 모놀리식 시스템 컴포넌트 설계 완료**

## Performance

- **Duration:** 8min 22s
- **Started:** 2026-02-04T14:07:22Z
- **Completed:** 2026-02-04T14:15:44Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- Owner Key와 Agent Key의 역할, 권한, 저장 방식을 환경별(클라우드/셀프호스트)로 상세 정의
- KMS 키 정책 예시(MFA 필수, Enclave attestation 조건) 작성
- vsock 통신 프로토콜 정의 (메시지 타입, 서명 요청/응답, Rust/TypeScript 구현)
- Squads 2-of-2 멀티시그 통합 및 동적 threshold 정책 설계
- 키 라이프사이클 관리 (생성 -> 활성 -> 로테이션 -> 폐기) 상태 전이도 작성
- 모노레포 패키지 구조 정의 (packages/core, cloud, selfhost, api)
- IKeyManagementService, IPolicyEngine, IBlockchainAdapter 인터페이스 정의
- 컴포넌트별 책임 테이블 및 서비스 구현 예시 작성
- PostgreSQL 스키마 (Prisma) 및 Redis 캐시 전략 정의
- 클라우드(EC2+Enclave) / 셀프호스트(Docker Compose) 배포 환경 문서화
- 총 9개 Mermaid 다이어그램 작성 (ARCH-01: 5개, ARCH-02: 4개)

## Task Commits

Each task was committed atomically:

1. **Task 1: Dual Key 아키텍처 상세 설계 문서 (ARCH-01)** - `49a2b47` (feat)
2. **Task 2: 시스템 컴포넌트 다이어그램 문서 (ARCH-02)** - `67e60c6` (feat)

## Files Created/Modified

- `.planning/deliverables/08-dual-key-architecture.md` - Dual Key 아키텍처 상세 설계 (1,665줄)
  - Owner Key 상세 설계 (KMS, libsodium, IAM Role, 로테이션)
  - Agent Key 상세 설계 (Enclave, 암호화 키스토어, vsock)
  - Squads 멀티시그 통합 (2-of-2, 동적 threshold, configAuthority)
  - 키 라이프사이클 관리 (상태 전이, 로테이션, 비상 폐기)
  - 환경별 구현 차이 비교 테이블

- `.planning/deliverables/09-system-components.md` - 시스템 컴포넌트 다이어그램 (1,679줄)
  - 고수준 아키텍처 다이어그램 (C4 Level 1, 2)
  - 모노레포 패키지 구조 및 의존성 그래프
  - 핵심 인터페이스 정의 (TypeScript)
  - 컴포넌트별 책임 및 서비스 구현
  - 데이터 저장소 (PostgreSQL 스키마, Redis)
  - 배포 환경 (클라우드, Docker Compose)

## Decisions Made

### 1. Owner Key 접근 방식: IAM Role 기반 Instance Profile
- **근거:** 장기 자격 증명 노출 위험 없음, 자동 자격 증명 로테이션, CloudTrail 완전 감사

### 2. Agent Key 생성 위치
- **클라우드:** Enclave 내부에서 생성, KMS로 시드 암호화 백업
- **셀프호스트:** 서버 메모리에서 생성, 암호화 후 즉시 디스크 저장

### 3. 키 로테이션 정책
- **Agent Key:** 90일 정기 + 이상 징후 시 즉시
- **Owner Key:** 연 1회 (또는 침해 의심 시)

### 4. 모놀리식 + 인터페이스 추상화 구조 확정
- 단일 배포 단위로 운영 복잡도 최소화
- IKeyManagementService 인터페이스로 키 관리 로직 격리 (향후 분리 가능)

### 5. 환경별 보안 수준 명시
- 클라우드: 기관급 (FIPS 140-2 Level 3, 하드웨어 TEE)
- 셀프호스트: 중소규모 (소프트웨어 암호화, 프로세스 격리)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - 본 Plan은 설계 문서 작성으로, 외부 서비스 설정이 필요하지 않음.

## Next Phase Readiness

### Phase 3 Plan 02 준비 완료

**ARCH-01, ARCH-02 완료로 다음 설계 문서 작성 가능:**
- ARCH-03: 트랜잭션 승인 흐름 설계 (ARCH-01의 Dual Key, ARCH-02의 PolicyEngine 기반)
- ARCH-04: 보안 위협 모델 및 대응 방안 (ARCH-01의 키 보안 설계 기반)
- ARCH-05: 멀티체인 확장 경로 (ARCH-02의 IBlockchainAdapter 기반)

**구현 Phase로 연결되는 핵심 산출물:**
- IKeyManagementService 인터페이스 정의 (구현 시 참조)
- 모노레포 패키지 구조 (packages/ 디렉토리 생성 시 참조)
- Docker Compose 구조 (셀프호스트 배포 시 참조)
- PostgreSQL 스키마 (Prisma 마이그레이션 시 참조)

**잠재적 고려사항:**
- Squads v4의 동적 threshold는 서버 레벨 금액 기반 라우팅으로 구현 (트랜잭션별 자동 적용 미지원)
- 다중 리전 배포 시 PCR 관리 자동화 필요

---

*Phase: 03-system-architecture*
*Plan: 01*
*Completed: 2026-02-04*
