---
phase: 32
plan: 01
subsystem: owner-lifecycle
tags: [owner, state-machine, lifecycle, rest-api, cli, zod, anti-patterns]
dependency-graph:
  requires:
    - phase-31 (OwnerState 타입, resolveOwnerState(), markOwnerVerified(), agents 테이블 v0.8 DDL)
  provides:
    - 34-owner-wallet-connection.md v0.8 Owner 생명주기 섹션 (10.1-10.9)
    - 3-State 상태 머신 (NONE/GRACE/LOCKED) 공식 설계
    - OwnerLifecycleService 클래스 (setOwner/removeOwner/markOwnerVerified)
    - REST API/CLI 스펙 변경 (POST /v1/agents body.owner, PATCH owner)
    - 감사 이벤트 4개, 에러 코드 3개
    - OWNER-02~06 요구사항 매핑
  affects:
    - phase-32-02 (ownerAuth 미들웨어 통합 설계)
    - phase-34 (자금 회수/보안 분기)
    - phase-35 (DX -- CLI set-owner LOCKED 서명 플로우)
tech-stack:
  added: []
  patterns:
    - 3-State 상태 머신 (NONE/GRACE/LOCKED) 런타임 파생
    - OwnerLifecycleService 도메인 서비스 패턴
    - 비즈니스 로직 내 인증 분기 (미들웨어 아닌 서비스 계층)
    - 체인별 주소 형식 Zod 검증
key-files:
  created: []
  modified:
    - .planning/deliverables/34-owner-wallet-connection.md
decisions:
  - "[32-01] 인증 분기를 비즈니스 로직(OwnerLifecycleService)에서 처리 -- 미들웨어 정적 결정 불가"
  - "[32-01] LOCKED 주소 변경 시 owner_verified 리셋 금지 -- 보안 다운그레이드 방지"
  - "[32-01] Kill Switch ACTIVATED에서 Owner 변경 자동 차단 -- killSwitchGuard 4개 허용 경로 외 503"
  - "[32-01] OWNER_REMOVED severity = warning -- 보안 수준 다운그레이드 동반"
metrics:
  duration: 4m 26s
  completed: 2026-02-09
---

# Phase 32 Plan 01: Owner 생명주기 상태 머신 + OwnerLifecycleService 설계 Summary

**One-liner:** 34-owner-wallet-connection.md에 3-State 상태 머신(NONE/GRACE/LOCKED), 6가지 전이 조건표, OwnerLifecycleService, REST API/CLI 스펙, Zod 주소 검증, 5개 Anti-Pattern 설계 완료

## Task Commits

| Task | Name | Commit | Key Files |
|:----:|------|--------|-----------|
| 1 | Owner 생명주기 상태 머신 + OwnerLifecycleService 설계 | `4a97390` | .planning/deliverables/34-owner-wallet-connection.md |
| 2 | 주소 형식 검증 Zod 스키마 + Anti-Pattern 정리 | `f9940ae` | .planning/deliverables/34-owner-wallet-connection.md |

## What Was Done

### Task 1: Owner 생명주기 상태 머신 + OwnerLifecycleService 설계
34-owner-wallet-connection.md에 섹션 10 "Owner 생명주기 상태 머신 [v0.8]"를 추가했다:

- **10.1** 3-State 상태 머신 ASCII 다이어그램 (NONE/GRACE/LOCKED)
- **10.2** 6가지 상태 전이 조건표 (트리거/인증/DB변경/부작용)
- **10.3** OwnerLifecycleService 클래스 (setOwner/removeOwner/markOwnerVerified) TypeScript 의사코드
- **10.4** 감사 로그 이벤트 4개 (OWNER_REGISTERED, OWNER_ADDRESS_CHANGED, OWNER_REMOVED, OWNER_VERIFIED)
- **10.5** 에러 코드 3개 (OWNER_AUTH_REQUIRED, OWNER_LOCKED, NO_OWNER)
- **10.6** REST API 스펙 (POST /v1/agents body.owner optional, PATCH /v1/agents/:id owner 변경/해제)
- **10.7** CLI 명령어 (agent create --owner, agent set-owner, agent remove-owner)
- OWNER-02~06 요구사항 매핑 추가 (섹션 1.2)
- v0.7 -> v0.8 변경 요약 (섹션 1.5)
- 문서 헤더 v0.8 업데이트

### Task 2: 주소 형식 검증 Zod 스키마 + Anti-Pattern 정리
- **10.8** Solana/EVM 체인별 주소 형식 검증 Zod 스키마 (solanaAddressSchema, evmAddressSchema, validateOwnerAddress())
- **10.9** 5개 Anti-Pattern 및 설계 결정 근거 (위험/올바른 접근 표 + 상세 시나리오)

## Decisions Made

1. **인증 분기를 비즈니스 로직에서 처리:** PATCH /v1/agents/:id의 미들웨어는 masterAuth(implicit)로 고정. LOCKED 상태에서 Owner 변경 시 OwnerLifecycleService.setOwner() 내부에서 auth.ownerVerified를 검증. 미들웨어에서 요청 바디 파싱은 책임 위반.

2. **LOCKED 주소 변경 시 owner_verified 리셋 금지:** 리셋하면 새 Owner가 GRACE로 전환되어 masterAuth만으로 재변경 가능. 기존 Owner 서명 승인 = 새 주소 신뢰.

3. **Kill Switch ACTIVATED에서 Owner 변경 자동 차단:** killSwitchGuard 4개 허용 경로 외 503 차단. 별도 로직 불필요.

4. **OWNER_REMOVED severity = warning:** Owner 해제는 Enhanced -> Base 보안 다운그레이드를 동반하므로 운영자 주의 필요.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

1. [x] 34-owner-wallet-connection.md에 "Owner 생명주기 상태 머신" 섹션이 존재한다
2. [x] 3-State 상태 다이어그램(NONE/GRACE/LOCKED)이 ASCII art로 그려져 있다
3. [x] 6가지 상태 전이 조건표에 트리거/인증/DB변경/부작용이 명세되어 있다
4. [x] OwnerLifecycleService.setOwner()가 NONE/GRACE -> masterAuth, LOCKED -> ownerAuth+masterAuth 분기를 포함한다
5. [x] OwnerLifecycleService.removeOwner()가 LOCKED시 거부, GRACE시 허용을 포함한다
6. [x] POST /v1/agents에 body.owner optional이 명세되어 있다
7. [x] PATCH /v1/agents/:id에 owner 변경이 명세되어 있다
8. [x] agent create --owner, set-owner, remove-owner CLI가 명세되어 있다
9. [x] 감사 이벤트 4개가 명세되어 있다
10. [x] 에러 코드 3개가 명세되어 있다
11. [x] OWNER-02~06 요구사항 매핑이 추가되어 있다
12. [x] Zod 주소 검증 스키마(Solana/EVM)가 명세되어 있다
13. [x] Anti-Pattern 5개가 위험/올바른 접근과 함께 명세되어 있다

## Next Phase Readiness

Phase 32-02(ownerAuth 미들웨어 통합 설계)에서 참조할 기반이 완성되었다:
- OwnerLifecycleService 클래스와 상태 전이 규칙
- ownerAuth 미들웨어 Step 8.5 markOwnerVerified() 자동 호출 설계
- REST API 인증 분기 원칙 (비즈니스 로직에서 처리)

## Self-Check: PASSED
