---
phase: 19-auth-owner-redesign
plan: 03
subsystem: auth-docs
tags: [auth, ownerAuth, masterAuth, v0.5, doc-integration]

dependency-graph:
  requires: ["19-01", "19-02"]
  provides: ["v0.5 반영된 34-owner-wallet-connection.md", "v0.5 반영된 37-rest-api-complete-spec.md"]
  affects: ["Phase 21 (DX 통합)", "37-rest-api-complete-spec.md 섹션 5-9 (Phase 21)"]

tech-stack:
  added: []
  patterns: ["3-tier auth model integration", "authRouter dispatcher pattern"]

key-files:
  created: []
  modified:
    - ".planning/deliverables/34-owner-wallet-connection.md"
    - ".planning/deliverables/37-rest-api-complete-spec.md"

decisions:
  - id: "19-03-D1"
    title: "34-owner-wallet-connection.md 기존 구조 유지 + v0.5 인라인 변경"
    rationale: "문서 재작성보다 기존 구조 유지 + (v0.5 변경) 표시가 변경 추적에 유리"
  - id: "19-03-D2"
    title: "37-rest-api-complete-spec.md 섹션 1-4만 수정, 5-9는 Phase 21 위임"
    rationale: "엔드포인트 상세(섹션 5-9)는 Phase 21 DX 통합에서 일괄 반영하여 중복 작업 방지"
  - id: "19-03-D3"
    title: "audit_log actor 값 ownerAuth->masterAuth 전환 반영"
    rationale: "ownerAuth에서 masterAuth로 전환된 엔드포인트의 actor를 'owner:address'에서 'master'로 일관되게 변경"

metrics:
  duration: "~9분"
  completed: "2026-02-07"
---

# Phase 19 Plan 03: 기존 설계 문서 v0.5 인증 모델 반영 Summary

v0.5 인증 모델 재설계(52-auth-model-redesign.md)와 스키마 변경(agents.owner_address, wallet_connections)을 기존 설계 문서 2개에 일관되게 반영. ownerAuth 2곳 한정, masterAuth implicit/explicit 이중 모드, authRouter 디스패처, agents.owner_address 검증을 문서 전체에 관통 적용.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | 34-owner-wallet-connection.md v0.5 대규모 수정 | 55806a5 | .planning/deliverables/34-owner-wallet-connection.md |
| 2 | 37-rest-api-complete-spec.md 인증 체계 + 미들웨어 업데이트 | 987eb7d | .planning/deliverables/37-rest-api-complete-spec.md |

## Task Details

### Task 1: 34-owner-wallet-connection.md v0.5 대규모 수정

**변경 범위:** 전 9개 섹션에 걸친 v0.5 인증 모델 반영

**핵심 변경 사항:**
- **섹션 1 (문서 개요):** 목적 재정의 ("유일한 인가 주체" -> "자금 관련 인가 주체"), v0.2->v0.5 변경 요약 테이블 추가
- **섹션 2 (WC 아키텍처):** WalletConnect를 "유일한 경로"에서 "선택적 편의 기능"으로 재정의, projectId를 선택적 톤으로 변경
- **섹션 3-4 (연결 플로우):** `owner_wallets` -> `wallet_connections` 테이블명 변경, CLI 수동 서명 대안 노트 추가
- **섹션 5 (ownerAuth 미들웨어):**
  - action enum 7개 -> 2개 (`approve_tx`, `recover`)
  - ROUTE_ACTION_MAP 6개 -> 2개
  - Step 5: `owner_wallets.address` -> `agents.owner_address` (resolveAgentIdFromContext 함수 추가)
  - 적용 범위: `/v1/owner/*` 전체 -> 2개 특정 라우트
- **섹션 6 (Owner API):** 8개 엔드포인트 중 ownerAuth 유지 2개(approve, recover), 나머지 6개 masterAuth(implicit)로 전환
- **섹션 7 (WC 세션 관리):** `owner_wallets` -> `wallet_connections`, Owner 주소 변경을 masterAuth 단일 트랙으로 간소화
- **섹션 8 (Relay 장애):** WC를 "유일한 외부 의존성"에서 "선택적 외부 의존성"으로, Kill Switch 로컬 발동을 masterAuth(implicit)로 변경
- **섹션 9 (보안):** Owner 사칭 방지에서 `owner_wallets.address` -> `agents.owner_address`, 다중 디바이스 정책에서 wallet_connections 반영

### Task 2: 37-rest-api-complete-spec.md 인증 체계 + 미들웨어 업데이트

**변경 범위:** 섹션 1-4 (개요, 서버 설정, 인증 체계, 미들웨어). 섹션 5-9 (엔드포인트 상세)는 Phase 21에서 일괄 반영.

**핵심 변경 사항:**
- **섹션 1.2:** AUTH-REDESIGN (52-auth-model-redesign.md) 참조 추가
- **섹션 1.4:** 엔드포인트 카테고리 재분류 (Session Management + Owner -> System Management + Owner Auth + Dual Auth)
- **섹션 2.3:** X-Master-Password 헤더 설명 확장 (implicit 대부분, explicit Admin + KS 복구)
- **섹션 3.1:** sessionAuth 적용 범위에 `GET /v1/sessions` 추가
- **섹션 3.2:** ownerAuth 적용 범위 2곳 한정, action enum 2개, Step 5 agents.owner_address
- **섹션 3.3:** masterAuth implicit/explicit 이중 모드 전면 재작성
- **섹션 3.4:** 인증 맵 전면 교체 (v0.5 3-tier 반영)
- **섹션 4.1:** 미들웨어 순서 9를 authRouter 단일 디스패처로 업데이트

## Decisions Made

1. **34 문서 기존 구조 유지**: 문서 재작성 대신 기존 9개 섹션 구조를 유지하면서 v0.5 변경점만 인라인 수정. "(v0.5 변경)" 표시로 변경 지점 명확화.
2. **37 문서 섹션 1-4만 수정**: 엔드포인트 상세(섹션 5-9)는 Phase 21 DX 통합에서 일괄 반영. 이 플랜에서는 인증 체계 프레임워크(섹션 1-4)만 v0.5로 전환.
3. **audit_log actor 일관성**: ownerAuth에서 masterAuth로 전환된 엔드포인트(reject, kill-switch, policies 등)의 actor를 `owner:address`에서 `master`로 변경하여 3-tier 모델과 일관성 유지.

## Deviations from Plan

None -- plan executed exactly as written.

## Success Criteria Verification

| Criteria | Status | Evidence |
|----------|--------|----------|
| 34-owner-wallet-connection.md가 v0.5를 완전히 반영 | PASS | ownerAuth 2곳, agents.owner_address, wallet_connections, WC 선택적 |
| 37-rest-api-complete-spec.md 섹션 1-4가 v0.5 3-tier 반영 | PASS | implicit/explicit masterAuth, ownerAuth 2곳, authRouter |
| 두 문서 모두 52-auth-model-redesign.md 참조 | PASS | 34: 11곳, 37: 5곳 참조 |
| 문서 간 비일관성 없음 | PASS | 동일한 테이블명(wallet_connections), 동일한 인증 맵, 동일한 ownerAuth 범위 |

## Next Phase Readiness

- Phase 21 (DX 통합)에서 37-rest-api-complete-spec.md 섹션 5-9의 개별 엔드포인트 인증 표기를 v0.5로 일괄 업데이트 필요
- Phase 19 완료: 3/3 plans complete. Phase 20 (세션 갱신 프로토콜) 진행 가능.

## Self-Check: PASSED
