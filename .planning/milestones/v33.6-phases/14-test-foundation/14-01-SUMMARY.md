---
phase: 14-test-foundation
plan: 01
subsystem: test-strategy
tags: [test-levels, coverage, matrix, jest, ci-gate]

dependency_graph:
  requires: []
  provides:
    - "6개 테스트 레벨 정의 (Unit/Integration/E2E/Chain Integration/Security/Platform)"
    - "9개 모듈 x 6개 레벨 테스트 매트릭스"
    - "패키지별 커버리지 목표 (4-tier: Critical/High/Normal/Low)"
    - "@waiaas/daemon 9개 서브모듈 세분화 커버리지"
    - "CI 게이트 전략 (soft -> hard)"
  affects:
    - "14-02 (Mock 경계 매트릭스에서 레벨별 Mock 범위 참조)"
    - "15-01 (보안 시나리오에서 Security 레벨 정의 참조)"
    - "16-01 (블록체인 테스트에서 Chain Integration 레벨 정의 참조)"
    - "17-01 (CI/CD 파이프라인에서 실행 빈도 피라미드 참조)"
    - "18-01 (배포 타겟에서 Platform 레벨 정의 참조)"

tech_stack:
  added: []
  patterns:
    - "보안 위험도 기반 4-tier 커버리지 (Critical 90%+ / High 80%+ / Normal 70%+ / Low 50%+)"
    - "실행 빈도 피라미드 (매 커밋 -> 매 PR -> nightly/릴리스)"
    - "Jest coverageThreshold glob 패턴으로 모듈별 임계값 관리"

key_files:
  created:
    - docs/v0.4/41-test-levels-matrix-coverage.md
  modified: []

decisions:
  - id: "TLVL-01"
    decision: "6개 테스트 레벨: Unit(매커밋), Integration/E2E/Security(매PR), Chain Integration/Platform(nightly/릴리스)"
    rationale: "피라미드 구조로 빈번한 실행일수록 빠르고 가벼운 테스트 배치"
  - id: "TLVL-02"
    decision: "9개 모듈 x 6개 레벨 O/X 매트릭스에서 각 셀별 검증 대상 명시"
    rationale: "모듈마다 적용 레벨이 다르므로 매트릭스로 한눈에 파악"
  - id: "TLVL-03"
    decision: "패키지별 커버리지를 보안 위험도 기반 4-tier로 차등 적용, daemon은 9개 서브모듈 세분화"
    rationale: "보안 critical 모듈(keystore 95%+)과 일반 모듈(lifecycle 75%+)의 위험도 차이 반영"
  - id: "CI-GATE"
    decision: "Soft gate(초기 경고만) -> Hard gate(안정화 후 PR 차단), 패키지별 독립 전환"
    rationale: "프로젝트 초기 유연성 확보 후 점진적 엄격화"

metrics:
  duration: "~4min"
  completed: "2026-02-06"
---

# Phase 14 Plan 01: 테스트 레벨 정의, 모듈 매트릭스, 커버리지 목표 Summary

Jest 30 + @swc/jest 기반 6개 테스트 레벨(Unit~Platform)의 범위/환경/빈도/속도를 정의하고, 9개 모듈별 적용 매트릭스 O/X와 보안 위험도 기반 4-tier 커버리지 목표(keystore 95%+ ~ EVM stub 50%+)를 확정했다.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | 6개 테스트 레벨 정의 및 실행 전략 | c171fae | docs/v0.4/41-test-levels-matrix-coverage.md (created) |
| 2 | 모듈별 테스트 매트릭스 및 커버리지 목표 | 99c3e45 | docs/v0.4/41-test-levels-matrix-coverage.md (updated) |

## What Was Built

### 섹션 1: 테스트 레벨 정의

6개 테스트 레벨을 각각 Scope, Environment, Frequency, Mock 범위, 속도 목표로 정의했다:

- **Unit**: 단일 함수/클래스, 모든 외부 의존성 mock, 패키지당 <10s, 매 커밋
- **Integration**: 모듈 간 연동 + 실제 SQLite(tmpdir), 외부 서비스만 mock, 패키지당 <30s, 매 PR
- **E2E**: Hono test client 전체 흐름, 블록체인만 mock, 전체 <2min, 매 PR
- **Chain Integration**: 실제 Devnet/Testnet, mock 없음, 전체 <10min, nightly/릴리스
- **Security**: 공격 시나리오 재현, Unit 환경, 전체 <1min, 매 PR
- **Platform**: CLI/Docker/Desktop 플랫폼별, 릴리스 시

레벨별 속도 vs 충실도 최적화 전략(Jest 설정), 실행 빈도 피라미드, 테스트 인프라 참조를 포함했다.

### 섹션 2: 모듈별 테스트 레벨 매트릭스

9개 모듈 x 6개 레벨 O/X 매트릭스를 작성하고, 각 O 셀에 "이 모듈에서 이 레벨로 무엇을 검증하는지" 1줄 설명을 추가했다.

### 섹션 3: 패키지별 커버리지 목표

- 패키지 수준 9개 항목: @waiaas/core 90%+(Critical) ~ @waiaas/adapter-evm 50%+(Low)
- @waiaas/daemon 서브모듈 9개: keystore 95%+ ~ lifecycle 75%+
- Jest coverageThreshold glob 패턴 설정 예시
- CI 게이트 2단계 전략: soft gate -> hard gate, 패키지별 독립 전환

## Decisions Made

1. **TLVL-01**: 실행 빈도 피라미드 -- 매 커밋(Unit), 매 PR(Integration/E2E/Security), nightly/릴리스(Chain Integration/Platform)
2. **TLVL-02**: 9개 모듈별 테스트 레벨 적용 매트릭스 확정 -- @waiaas/daemon만 E2E 포함, Desktop App은 Platform만
3. **TLVL-03**: 보안 위험도 기반 4-tier 커버리지 -- Critical(90%+), High(80%+), Normal(70%+), Low(50%+)
4. **CI-GATE**: Soft gate(초기)->Hard gate(안정화후), 목표의 80% 이상 10회 연속 달성 시 전환, 패키지별 독립

## Deviations from Plan

None -- plan executed exactly as written.

## Next Phase Readiness

**14-02 준비 상태:** 이 문서에서 정의한 6개 테스트 레벨의 Mock 범위 열을 기반으로, 14-02에서 5개 외부 의존성별 Mock 방식 매트릭스와 IClock/ISigner 인터페이스 스펙을 작성할 수 있다.

**Blockers:** 없음
**Concerns:** 없음

## Self-Check: PASSED
