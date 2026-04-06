---
phase: 14
plan: 02
subsystem: test-infrastructure
tags: [mock, contract-test, IClock, IOwnerSigner, DI, interface]
dependency_graph:
  requires: []
  provides: [mock-boundary-matrix, IClock-spec, IOwnerSigner-spec, contract-test-strategy]
  affects: [15-domain-test-scenarios, 16-blockchain-test-environment, phase-15-implementation]
tech_stack:
  added: []
  patterns: [factory-function-contract-test, DI-interface-injection, fake-object-pattern, canned-response-mock]
key_files:
  created:
    - docs/v0.4/42-mock-boundaries-interfaces-contracts.md
  modified: []
decisions:
  - id: MOCK-OWNER-ONLY
    description: "IOwnerSigner는 Owner 서명만 추상화. Agent 서명은 기존 ILocalKeyStore.sign()으로 충족"
    rationale: "Owner/Agent 서명은 용도, 키 위치, 호출 주체가 완전히 다름"
  - id: MOCK-ICLOCK-MINIMAL
    description: "IClock은 now(): Date만 제공. setTimeout/setInterval은 Jest useFakeTimers() 사용"
    rationale: "시간 조회와 타이머 스케줄링은 별도 관심사"
  - id: MOCK-ALL-LEVELS-NOTIFICATION
    description: "알림 채널은 모든 테스트 레벨에서 Mock (실제 채널 호출 절대 없음)"
    rationale: "외부 서비스 상태에 의존하면 테스트 안정성 저해"
  - id: MOCK-KEYSTORE-MEDIUM
    description: "ILocalKeyStore Mock 가능성은 MEDIUM (sodium-native C++ 바인딩 의존)"
    rationale: "MockKeyStore는 tweetnacl로 대체하고 Integration에서만 실제 sodium-native 사용"
  - id: CONTRACT-TEST-FACTORY-PATTERN
    description: "5개 인터페이스 전체에 팩토리 함수 기반 Contract Test 적용"
    rationale: "Mock과 실제 구현이 동일 테스트를 통과해야 Mock을 신뢰 가능"
metrics:
  duration: 6m 14s
  completed: 2026-02-06
---

# Phase 14 Plan 02: Mock 경계, 인터페이스 스펙, Contract Test 전략 Summary

Mock-first 테스트 전략의 경계 정의, IClock/IOwnerSigner 신규 인터페이스 TypeScript 스펙, 5개 인터페이스 팩토리 함수 기반 Contract Test 전략 확정

## Task Commits

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Mock 경계 매트릭스 및 기존 인터페이스 Mock 가능성 검증 | 4fc60d8 | 5x6 Mock 매트릭스, 4개 인터페이스(IChainAdapter/IPolicyEngine/INotificationChannel/ILocalKeyStore) Mock 분석 |
| 2 | IClock/IOwnerSigner 인터페이스 스펙 및 Contract Test 전략 | b4491ff | IClock/FakeClock/RealClock 스펙, IOwnerSigner/FakeOwnerSigner 스펙, 5개 인터페이스 Contract Test describe/test 구조 |

## What Was Built

### Mock 경계 매트릭스 (MOCK-01)
5개 외부 의존성(블록체인 RPC, 알림 채널, 파일시스템, 시간, Owner 서명)에 대해 6개 테스트 레벨(Unit, Integration, E2E, Chain Integration, Security, Platform)별 Mock 방식을 매트릭스로 정의했다. 각 셀에 대한 근거를 상세히 문서화했다.

### 기존 인터페이스 Mock 가능성 검증 (MOCK-02)
4개 기존 인터페이스의 Mock 가능성을 메소드 수준으로 분석했다:
- **IChainAdapter** (HIGH): 13개 메소드 전체의 Mock 반환값 및 MockChainAdapter 클래스 설계
- **IPolicyEngine** (HIGH): 단일 메소드, MockPolicyEngine 큐 방식 제어
- **INotificationChannel** (HIGH): 전송 기록 + 실패 시뮬레이션 MockNotificationChannel
- **ILocalKeyStore** (MEDIUM): tweetnacl 기반 MockKeyStore, sodium-native는 Integration에서만

### IClock 인터페이스 스펙 (MOCK-03)
- `IClock { now(): Date }` -- 단일 메소드, 시간 조회만 담당
- `FakeClock` -- advance(ms), setTime(date), 참조 독립 반환, 음수 advance 방지
- `RealClock` -- `new Date()` 반환
- DI 패턴: 6개 서비스(SessionService, PolicyEngine, TransactionService, DelayQueueWorker, ApprovalTimeoutWorker, AuditLogger)에 생성자 주입
- Jest Fake Timers와 병행 사용 패턴 문서화

### IOwnerSigner 인터페이스 스펙 (MOCK-03)
- `IOwnerSigner { address, chain, signMessage(message): Promise<string> }` -- Owner 서명만 추상화
- `FakeOwnerSigner` -- 고정 시드(0x42 * 32B)에서 결정적 Ed25519 키쌍, verify() 유틸리티 메소드 포함
- Owner-only 범위 결정 근거: Agent 서명은 ILocalKeyStore.sign()으로 이미 충족

### Contract Test 전략 (MOCK-04)
5개 인터페이스 전체에 팩토리 함수 기반 공유 스위트 패턴을 적용:
- `chainAdapterContractTests(factory, options)` -- 13개 메소드 전체 describe/test 구조
- `policyEngineContractTests(factory)` -- evaluate 계약 검증
- `notificationChannelContractTests(factory)` -- send/healthCheck/props 검증
- `clockContractTests(factory)` -- Date 반환, 단조 증가, 참조 독립
- `ownerSignerContractTests(factory, options)` -- 결정적 서명, 서명-검증 쌍

실행 전략: Unit(매 커밋, Mock 대상), Integration(매 PR, 실제 구현 대상), Chain Integration(nightly, 실제 네트워크)

## Decisions Made

1. **IOwnerSigner는 Owner 전용** -- Agent 서명은 ILocalKeyStore.sign()으로 이미 추상화됨. 용도/키 위치/호출 주체가 다르므로 통합 불필요
2. **IClock은 now(): Date만** -- setTimeout/setInterval은 Jest의 useFakeTimers()로 제어. 시간 조회와 타이머 스케줄링은 별도 관심사
3. **알림 채널 완전 Mock** -- 모든 테스트 레벨에서 MockNotificationChannel 사용. 외부 서비스 안정성에 의존하지 않음
4. **ILocalKeyStore Mock 가능성 MEDIUM** -- sodium-native C++ 바인딩 때문에 Unit에서는 tweetnacl 기반 MockKeyStore 필수
5. **Contract Test 팩토리 함수 패턴** -- 공유 스위트를 Mock/실제 구현 모두에 실행하여 동작 일치 보장

## Deviations from Plan

None -- 플랜이 정확히 실행되었다.

## Next Phase Readiness

### Phase 15 (도메인 테스트 시나리오) 준비 상태
- Mock 경계가 확정되어 시나리오별 어떤 Mock을 사용할지 명확
- IClock/IOwnerSigner 스펙이 확정되어 보안 시나리오에서 시간/서명 제어 방법이 결정됨
- Contract Test 전략이 확정되어 구현 시 Mock 클래스와 계약 테스트를 바로 작성 가능

### 블로커
- 없음

## Self-Check: PASSED
