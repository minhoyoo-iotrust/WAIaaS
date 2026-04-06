---
phase: 15-security-test-scenarios
plan: 03
status: complete
started: 2026-02-06T12:44:19Z
completed: 2026-02-06T12:52:53Z
duration: ~8min
subsystem: security-test-scenarios
tags: [keystore, external-threats, boundary-values, e2e-chain, TOCTOU, lamport, BigInt]
dependency-graph:
  requires:
    - "Phase 14 (테스트 기반 정의) -- Mock 경계, FakeClock, MockKeyStore"
    - "Phase 15 Plan 01-02 (Layer 1-2-3 개별 공격 시나리오)"
    - "v0.2 deliverables (26-keystore, 33-time-lock, 30-session, 36-killswitch)"
  provides:
    - "SEC-04: 키스토어 보안 6건 + 외부 위협 4건 = 10건"
    - "SEC-05: 경계값 19건 + E2E 연쇄 체인 5건"
    - "Phase 15 전체 통계: 개별 47건 + 경계값 19건 + 체인 5건 = 71건"
  affects:
    - "v0.5 구현 -- Security 테스트 코드 직접 변환"
    - "Phase 16+ -- 구현 우선순위 결정 (Critical 12건 최우선)"
tech-stack:
  added: []
  patterns:
    - "경계값 +/-1 패턴 (lamport BigInt, 초 단위 FakeClock)"
    - "E2E 연쇄 공격 체인 (공격자 관점 스토리, Layer 1-2-3 관통)"
    - "TOCTOU Integration 테스트 (실제 SQLite + BEGIN IMMEDIATE + Promise.allSettled)"
key-files:
  created:
    - docs/v0.4/46-keystore-external-security-scenarios.md
    - docs/v0.4/47-boundary-value-chain-scenarios.md
  modified: []
decisions:
  - id: SEC04-INTEGRATION-LEVEL
    description: "authTag 변조(SEC-04-02)와 마스터 패스워드(SEC-04-03)는 Integration 레벨 필수 -- sodium-native/argon2 바인딩 없이 검증 불가"
  - id: SEC05-DUAL-THRESHOLD
    description: "금액 경계를 기본 정책(1/10/50 SOL)과 커스텀 정책(0.1/1/10 SOL) 양쪽 모두 검증 -- 설계 문서 SSoT와 CONTEXT.md 차이 명시"
  - id: SEC05-CHAIN-SELECTION
    description: "5개 E2E 체인을 현실적 공격 시나리오 기준으로 선택: 한도 소진(가장 흔한), TOCTOU(동시성), 에스컬레이션(3계층 관통), 탈취+복구(완전 E2E), 시간 기반(타이밍)"
metrics:
  duration: ~8min
  completed: 2026-02-06
  sec04-scenarios: 10
  sec05-boundary: 19
  sec05-chains: 5
  total-phase15: 71
---

# Phase 15 Plan 03: 키스토어 보안, 경계값, E2E 연쇄 공격 체인 Summary

키스토어 보안 6건 + 외부 위협 4건 + 금액/시간/동시성 경계값 19건 + E2E 연쇄 공격 체인 5건을 정의하여 Phase 15 보안 테스트 시나리오를 완성

## What Was Built

키스토어 보안 및 외부 위협 시나리오 문서(46-keystore-external-security-scenarios.md)를 작성하여 SEC-04 요구사항을 충족했다. AES-256-GCM authTag 변조 탐지, Argon2id 잘못된 패스워드, 경로 순회 방지, sodium_memzero 메모리 클리어 등 키스토어 핵심 보안 6건과 Host 헤더 변조, 파일 권한, JWT Secret 노출 방지, Rate Limit 글로벌 한도 등 외부 위협 4건을 포함했다.

경계값 테스트 및 E2E 연쇄 공격 체인 문서(47-boundary-value-chain-scenarios.md)를 작성하여 SEC-05 요구사항을 충족했다. 4-tier 금액 경계(기본 1/10/50 + 커스텀 0.1/1/10 SOL, +/-1 lamport BigInt), 시간 경계 8건(JWT exp, DELAY 쿨다운, APPROVAL 타임아웃, 세션 수명, blockhash, nonce TTL, ownerAuth timestamp), TOCTOU 동시성 경계 3건(reserved_amount, usageStats, BEGIN IMMEDIATE), 세션 한도 +/-1 패턴 3종을 표 형태로 정리했다. E2E 연쇄 공격 체인 5건은 Layer 1-2-3을 관통하는 공격자 관점 스토리로 서술하며, Chain 3(금액 에스컬레이션)은 3계층 전체를 관통하고, Chain 4(세션 탈취+복구)는 공격-방어-복구 완전 E2E를 포함한다.

Phase 15 전체 통계: 개별 시나리오 47건(Critical 12, High 25, Medium 10) + 경계값 19건 + E2E 체인 5건 = 총 71건.

## Task Results

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | 키스토어 보안 + 외부 위협 시나리오 정의 (SEC-04) | done | 6af5e4e |
| 2 | 경계값 테스트 + E2E 연쇄 공격 체인 정의 (SEC-05) | done | 9a6c489 |

## Key Artifacts

### SEC-04 (키스토어 보안 + 외부 위협) -- 10건

| ID | 공격명 | 우선순위 | 테스트 레벨 |
|----|--------|---------|-----------|
| SEC-04-01 | 잠금 상태에서 서명 시도 | Critical | Unit |
| SEC-04-02 | authTag 변조 탐지 | Critical | Integration |
| SEC-04-03 | 잘못된 마스터 패스워드 | High | Integration |
| SEC-04-04 | 파일 경로 순회 | High | Unit |
| SEC-04-05 | 메모리 클리어 검증 | High | Unit |
| SEC-04-06 | 존재하지 않는 에이전트 키 | Medium | Unit |
| SEC-04-EX-01 | Host 헤더 변조 | High | Integration |
| SEC-04-EX-02 | 키스토어 디렉토리 권한 | High | Unit |
| SEC-04-EX-03 | JWT Secret 노출 방지 | High | Unit |
| SEC-04-EX-04 | Rate Limit 글로벌 한도 | Medium | Integration |

### SEC-05 경계값 + 연쇄 체인

**금액 경계:** 기본(1/10/50 SOL) 3행 + 커스텀(0.1/1/10 SOL) 3행
**시간 경계:** 8건 (T01-T08)
**TOCTOU:** 3건 (C01-C03)
**세션 한도:** 3종 (+/-1 패턴)
**E2E 체인:** 5건 (Chain 1-5, Layer 1-2-3 관통)

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

| Decision | Context | Outcome |
|----------|---------|---------|
| Integration 레벨 필수 | authTag/패스워드 시나리오는 실제 암호화 라이브러리 필요 | SEC-04-02, 03은 Integration 레벨에서만 검증 가능 |
| 이중 금액 경계 검증 | 설계 문서 SSoT(1/10/50)와 CONTEXT.md(0.1/1/10) 차이 | 양쪽 표 모두 제공, SSoT 기준 명시 |
| E2E 체인 5건 선택 | 25건+ 개별 시나리오에서 현실적 체인 엄선 | 한도 소진/TOCTOU/3계층 관통/탈취+복구/시간 기반 |

## Verification

- [x] SEC-04-01~06 키스토어 시나리오 6건 존재
- [x] SEC-04-EX-01~04 외부 위협 시나리오 4건 존재
- [x] 파일 변조(02), 틀린 패스워드(03), 파일 권한(EX-02), 메모리 잔존(05) 포함
- [x] 각 시나리오에 Given-When-Then + Mock 참조 + 우선순위 포함
- [x] 금액 경계 표 (기본 1/10/50 + 커스텀 0.1/1/10) 존재
- [x] 시간 경계 표 8행 존재
- [x] TOCTOU 동시성 경계 표 3행 존재
- [x] 세션 한도 +/-1 패턴 3종 포함
- [x] E2E 연쇄 체인 5건, 각각 Given-When-Then + 참조 시나리오 포함
- [x] Chain 4에 복구 흐름 포함 (dual-auth -> NORMAL)
- [x] Chain 3에 3계층 관통 포함 (L1->L2->L3)
- [x] 전체 통계 요약 표 존재 (47 + 19 + 5 = 71건)
- [x] 46 문서 611줄 >= 100줄
- [x] 47 문서 1023줄 >= 150줄
- [x] lamport BigInt 문자열 사용 확인

## Self-Check: PASSED
