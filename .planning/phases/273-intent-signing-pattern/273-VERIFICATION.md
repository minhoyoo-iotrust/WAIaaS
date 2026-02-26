---
phase: 273
name: intent-signing-pattern
status: passed
verified: 2026-02-26
---

# Phase 273: Intent 서명 패턴 설계 — Verification

## Goal
Intent 기반 트레이딩(EIP-712 서명 + 솔버 실행)의 파이프라인이 설계되어, CoW Protocol 구현이 기존 ContractCallRequest 파이프라인과 충돌 없이 공존한다

## Success Criteria Verification

### 1. SignableOrder Zod 타입이 EIP-712 도메인 파라미터를 포함하며, ActionProviderRegistry가 intent 타입을 지원
- **PASSED**: SignableOrderSchema Zod 정의에 domain(name, version, chainId, verifyingContract), types, primaryType, message, intentMetadata 포함 (section 24.1)
- **PASSED**: ActionProviderRegistry.executeResolve() union 반환 타입 설계 (section 24.3, Option A 권장)
- **PASSED**: TRANSACTION_TYPES 8th value 'INTENT' 추가 (section 24.3)

### 2. EIP-712 서명 파이프라인이 IChainAdapter/EvmAdapter 확장으로 설계
- **PASSED**: IChainAdapter.signTypedData() method 23 설계 (TypedDataParams/TypedDataSignature) (section 25.1)
- **PASSED**: EvmAdapter 구현 설계 (viem privateKeyToAccount.signTypedData + recoverTypedDataAddress) (section 25.1)
- **PASSED**: SolanaAdapter NOT_SUPPORTED throw (section 25.1)
- **PASSED**: sign-only 파이프라인과의 관계 명확화 (비교 테이블) (section 25.1)

### 3. 주문 상태 추적 폴링 설계 + 분기점 정의
- **PASSED**: IntentOrderTracker (IAsyncStatusTracker, 10s polling, 180 max attempts) (section 25.3)
- **PASSED**: CoW Protocol 5-state → WAIaaS 매핑 (presignaturePending/open → PENDING, fulfilled → COMPLETED, cancelled/expired → FAILED) (section 25.3)
- **PASSED**: 분기점: actions.ts에서 result.type === 'INTENT' 기반 분기 (section 25.4)
- **PASSED**: 동질성 제약 (homogeneous results only) (section 25.4)

### 4. Intent 보안 설계가 리플레이/크로스체인 공격을 방지
- **PASSED**: 4중 바인딩 (chainId + verifyingContract + nonce + deadline) 시각화 + 상세 설명 (section 26.1)
- **PASSED**: IntentSecurityValidator 4 ordered rules (deadline → chainId → whitelist → duplicate) (section 26.2)
- **PASSED**: INTENT_VERIFYING_CONTRACT_WHITELIST default-deny (section 26.2)
- **PASSED**: MAX_DEADLINE_SECONDS=300 (section 26.2)
- **PASSED**: 공격 벡터 분석 7개 + 잔여 위험 3개 (section 26.3)

## Requirements Traceability

| Requirement | Plan | Status | Verification |
|-------------|------|--------|-------------|
| INTENT-01 | 273-01 | DONE | SignableOrderSchema Zod 정의 with type='INTENT', EIP-712 domain, intentMetadata |
| INTENT-02 | 273-01 | DONE | ActionProviderRegistry union return type (Option A), TRANSACTION_TYPES 8th value |
| INTENT-03 | 273-02 | DONE | IChainAdapter.signTypedData() method 23, TypedDataParams/TypedDataSignature |
| INTENT-04 | 273-02 | DONE | IntentOrderTracker (IAsyncStatusTracker, 10s/180), 5-state mapping |
| INTENT-05 | 273-02 | DONE | Bifurcation at actions.ts, homogeneous result constraint |
| INTENT-06 | 273-02 | DONE | 4-layer security, IntentSecurityValidator, attack vector analysis |

## Design Decisions Summary

21 design decisions: DEC-INTENT-01 through DEC-INTENT-21
- Section 24: DEC-INTENT-01~07 (7 decisions)
- Section 25: DEC-INTENT-08~14 (7 decisions)
- Section 26: DEC-INTENT-15~21 (7 decisions)

## Artifacts

| Artifact | Location | Sections Added |
|----------|----------|---------------|
| m29-00 design document | internal/objectives/m29-00-defi-advanced-protocol-design.md | 24 (24.1-24.4), 25 (25.1-25.5), 26 (26.1-26.4) |

## Result: PASSED

All 4 success criteria verified. All 6 requirements (INTENT-01 through INTENT-06) completed. 21 design decisions documented. Intent signing pattern design is complete and ready for m29-14 (CoW Protocol) implementation.
