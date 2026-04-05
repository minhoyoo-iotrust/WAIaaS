---
phase: "05-api-및-통합-설계"
plan: "02"
subsystem: "api-error-specification"
tags: ["rfc-9457", "error-codes", "problem-details", "stripe-pattern", "webhook-events", "error-handling"]

dependency_graph:
  requires:
    - "03-system-architecture (ARCH-03 트랜잭션 흐름, ARCH-04 보안 위협 모델)"
    - "04-owner-agent-relationship (REL-01~REL-05 자금/에이전트/비상 프로세스)"
    - "05-01 (API 엔드포인트 설계 - 에러 응답 스키마 기반)"
  provides:
    - "RFC 9457 기반 WalletApiError 인터페이스 (표준 + 확장 필드)"
    - "46개 에러 코드 레지스트리 (9개 도메인)"
    - "4-Layer 에러 코드 계층 구조"
    - "에러 처리 가이드 (재시도 전략, 에스컬레이션 대응)"
    - "Webhook 에러 이벤트 매핑"
    - "에러 코드 거버넌스 (추가/폐기 절차)"
  affects:
    - "05-03 (SDK 인터페이스 - 에러 타입 계층 구현)"
    - "05-01 (OpenAPI 스펙 - 에러 응답 스키마 참조)"
    - "구현 단계 (Fastify 에러 미들웨어, Zod 에러 스키마)"

tech_stack:
  added: []
  patterns:
    - "RFC 9457 Problem Details + Stripe 계층적 에러 코드"
    - "application/problem+json Content-Type"
    - "4-Layer Error Code Hierarchy (HTTP → Type → Code → Detail)"
    - "에스컬레이션 수준별 Webhook 전달 우선순위"

key_files:
  created:
    - ".planning/deliverables/20-error-codes.md"
  modified: []

key_decisions:
  - decision: "RFC 9457 + Stripe 패턴 결합 에러 응답 표준 확정"
    reasoning: "RFC 9457은 IETF 표준, Stripe 패턴은 핀테크 업계 검증. AI 에이전트의 프로그래밍적 에러 분기를 code 필드로 지원"
  - decision: "9개 에러 도메인 분류 (auth, validation, policy, agent, transaction, funding, emergency, system, webhook)"
    reasoning: "Phase 3-4에서 정의된 모든 실패 시나리오를 포괄하면서도 SDK 에러 타입 계층과 1:1 매핑 가능"
  - decision: "에스컬레이션 수준별 Webhook 전달 우선순위 차등화"
    reasoning: "CRITICAL 에러는 큐 우회 즉시 전달, HIGH는 우선 큐로 분리하여 비상 이벤트 전달 지연 최소화"
  - decision: "docUrl 패턴 https://docs.waiass.io/errors/{ERROR_CODE} 확정"
    reasoning: "에러 코드별 개별 문서 페이지로 개발자가 즉시 해결 방법 참조 가능"

metrics:
  duration: "4.3분"
  completed: "2026-02-05"
---

# Phase 5 Plan 02: 에러 코드 및 처리 규격 설계 Summary

RFC 9457 Problem Details + Stripe 계층적 에러 코드를 결합하여 46개 에러 코드를 9개 도메인으로 분류한 WalletApiError 표준 에러 응답 체계 구축

## Accomplishments

### Task 1: 에러 코드 및 처리 규격 설계 문서 작성 (API-04)
- **Commit:** `d54a928`
- **File:** `.planning/deliverables/20-error-codes.md`
- RFC 9457 표준 필드(type, title, status, detail, instance)와 확장 필드(code, param, requestId, docUrl, retryable, escalation)를 포함한 WalletApiError TypeScript 인터페이스 정의
- 4-Layer 에러 코드 계층 구조(HTTP Status -> Error Type -> Error Code -> Detail) 설계 및 Mermaid 다이어그램
- 9개 도메인(auth, validation, policy, agent, transaction, funding, emergency, system, webhook)에 걸쳐 46개 에러 코드 레지스트리 구축
- 각 에러 코드에 code, HTTP status, type, title, retryable, escalation, 설명 완전 명세
- 에러 처리 플로우차트(Mermaid)와 재시도 전략(exponential backoff 1s/2s/4s, 최대 3회)
- 에스컬레이션별 대응 가이드(LOW~CRITICAL 4단계)
- SDK 에러 처리 패턴(TypeScript/Python 코드 예시)
- Webhook 에러 이벤트 매핑 테이블 (에러 코드 -> Webhook 이벤트)
- 에스컬레이션 수준별 Webhook 전달 우선순위 (CRITICAL: 즉시 전달, HIGH: 우선 큐)
- 에러 코드 거버넌스(추가/폐기 절차, 명명 규칙, docUrl 패턴)
- ARCH-03 8단계 트랜잭션 흐름의 각 단계별 에러 코드 매핑
- REL-03 에이전트 5단계 상태별 에러 응답 매핑

## Verification Results

| 검증 항목 | 기준 | 결과 | 상태 |
|----------|------|------|------|
| RFC 9457 참조 | >= 2 | 13 | PASS |
| WalletApiError 인터페이스 | >= 2 | 11 | PASS |
| 에러 코드 수 (도메인 접두사) | >= 30 | 66 | PASS |
| 에러 타입 도메인 | >= 8 | 81 | PASS |
| Mermaid 다이어그램 | >= 2 | 2 | PASS |
| 재시도 가이드 | >= 3 | 27 | PASS |
| docUrl 패턴 | >= 2 | 11 | PASS |

## Decisions Made

1. **RFC 9457 + Stripe 패턴 결합:** IETF 표준 에러 응답 구조에 Stripe의 code, retryable, docUrl 확장 필드를 결합. AI 에이전트가 code 필드로 프로그래밍적 분기 가능.
2. **9개 에러 도메인 분류:** Phase 3-4의 모든 실패 시나리오를 auth, validation, policy, agent, transaction, funding, emergency, system, webhook으로 분류. SDK 에러 타입 계층과 직접 매핑.
3. **에스컬레이션 수준별 Webhook 우선순위:** CRITICAL 에러는 큐 우회 즉시 전달, HIGH는 우선 큐, LOW/MEDIUM은 일반 큐. 비상 이벤트 전달 지연 최소화.
4. **docUrl 패턴 확정:** `https://docs.waiass.io/errors/{ERROR_CODE}` 패턴으로 에러 코드별 개별 문서 페이지 제공.

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

- **05-03 (SDK 인터페이스 설계):** WalletApiError 인터페이스와 에러 타입 계층(PolicyError, AuthError, TransactionError 등)을 SDK에 직접 반영 가능. 에러 코드별 switch/case 예시 코드 포함됨.
- **05-01 (OpenAPI 스펙):** WalletApiError 스키마를 OpenAPI 3.0 components/schemas에 등록하고, 각 엔드포인트의 에러 응답을 $ref로 참조 가능.
- **구현 단계:** Fastify 에러 미들웨어에서 WalletApiError 포맷팅, Zod 스키마로 에러 응답 검증 가능.
