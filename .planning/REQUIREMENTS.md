# Requirements: WAIaaS v0.8

**Defined:** 2026-02-08
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- Owner 등록 없이도 기본 보안을 제공하고, Owner 등록 시 강화된 보안이 점진적으로 해금된다.

## v0.8 Requirements

### Owner 등록/생명주기 (OWNER)

- [ ] **OWNER-01**: 에이전트를 Owner 주소 없이 생성할 수 있다 (agents.owner_address nullable)
- [ ] **OWNER-02**: 에이전트 생성 시 `--owner` 옵션으로 Owner 주소를 함께 등록할 수 있다
- [ ] **OWNER-03**: 생성 후 `waiaas agent set-owner <agent> <address>`로 Owner 주소를 사후 등록할 수 있다 (masterAuth, 서명 불필요)
- [ ] **OWNER-04**: ownerAuth 미사용 유예 구간에서 masterAuth만으로 Owner 주소를 변경/해제할 수 있다
- [ ] **OWNER-05**: ownerAuth 사용 후 잠금 구간에서 ownerAuth + masterAuth로만 Owner 주소를 변경할 수 있다
- [ ] **OWNER-06**: 잠금 구간에서 Owner를 해제(제거)할 수 없다 (보안 다운그레이드 방지)
- [ ] **OWNER-07**: owner_verified 컬럼이 ownerAuth 최초 사용 시 자동으로 1로 전환된다 (유예->잠금 전이)
- [ ] **OWNER-08**: Grace->Locked 전이가 BEGIN IMMEDIATE 트랜잭션으로 원자화되어 레이스 컨디션이 방지된다

### 정책 엔진 (POLICY)

- [ ] **POLICY-01**: Owner 없는 에이전트의 APPROVAL 평가 결과가 DELAY로 다운그레이드되어 실행된다 (차단 아님)
- [ ] **POLICY-02**: 다운그레이드 결과에 downgraded: true 플래그가 포함되어 알림에서 Owner 등록 안내를 표시한다
- [ ] **POLICY-03**: Owner 등록 후 동일 금액 거래가 정상적으로 APPROVAL 티어로 처리된다 (ownerAuth 서명 대기)

### 자금 회수 (WITHDRAW)

- [ ] **WITHDRAW-01**: Owner 등록된 에이전트에서 `POST /v1/owner/agents/:agentId/withdraw` API로 자금을 회수할 수 있다
- [ ] **WITHDRAW-02**: 수신 주소가 agents.owner_address로 고정되며 변경할 수 없다
- [ ] **WITHDRAW-03**: scope: "all"로 네이티브 + SPL 토큰 + rent를 전량 회수할 수 있다
- [ ] **WITHDRAW-04**: scope: "native"로 네이티브 자산만 회수할 수 있다
- [ ] **WITHDRAW-05**: 부분 실패 시 HTTP 207 + failed 배열로 응답한다 (토큰별 개별 fallback)
- [ ] **WITHDRAW-06**: IChainAdapter에 sweepAll 메서드가 추가된다 (19->20개)
- [ ] **WITHDRAW-07**: sweepAll이 SOL을 마지막에 전송하여 tx fee 부족을 방지한다
- [ ] **WITHDRAW-08**: 유예 구간(owner_verified = 0)에서는 withdraw가 비활성화된다 (주소 변경->즉시 회수 공격 차단)

### Kill Switch / 세션 보안 (SECURITY)

- [ ] **SECURITY-01**: Owner 없는 에이전트의 Kill Switch 복구에 masterAuth + 24시간 강제 대기가 적용된다
- [ ] **SECURITY-02**: Owner 있는 에이전트의 Kill Switch 복구에 ownerAuth + masterAuth + 30분 대기가 적용된다
- [ ] **SECURITY-03**: Owner 없는 에이전트의 세션 갱신이 거부 윈도우 없이 즉시 확정된다
- [ ] **SECURITY-04**: Owner 있는 에이전트의 세션 갱신 알림에 [거부하기] 버튼이 표시된다

### DX / CLI (DX)

- [ ] **DX-01**: `waiaas agent create`에서 `--owner`가 선택 옵션이다
- [ ] **DX-02**: `waiaas agent set-owner <agent> <address>` CLI 명령이 동작한다
- [ ] **DX-03**: `waiaas agent remove-owner <agent>` CLI 명령이 유예 구간에서만 동작한다
- [ ] **DX-04**: `--quickstart`가 `--owner` 없이 동작한다
- [ ] **DX-05**: Owner 미등록 에이전트의 `agent info` 출력에 Owner 등록 안내 메시지가 표시된다

### 알림 (NOTIF)

- [ ] **NOTIF-01**: APPROVAL->DELAY 다운그레이드 알림에 Owner 등록 안내 메시지가 포함된다
- [ ] **NOTIF-02**: Owner 있는 에이전트의 APPROVAL 대기 알림에 [승인] [거부] 버튼이 표시된다
- [ ] **NOTIF-03**: Owner 있는 에이전트의 세션 갱신 알림에 [거부하기] 버튼이 표시된다

### 설계 문서 통합 (INTEG)

- [ ] **INTEG-01**: 14개 기존 설계 문서에 v0.8 Owner 선택적 모델이 반영된다
- [ ] **INTEG-02**: Owner 상태 분기 매트릭스가 SSoT로 작성되어 문서 간 일관성이 보장된다

## Future Requirements (v0.9+)

- **MCP-01**: MCP SessionManager 자동 갱신 프로토콜 설계
- **MCP-02**: MCP 세션 만료 -> 자동 갱신 -> 중단 없이 계속 동작
- **IMPL-01**: v1.0 구현 계획 확정 (v1.1~v2.0 로드맵)
- **IMPL-02**: 마일스톤별 objective 문서 8개 작성

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-Owner (다수 Owner 등록) | 복잡도 증가, 단일 Owner로 충분 |
| APPROVAL 차단 (Owner 없을 때) | 에이전트 자율성 훼손, DELAY 다운그레이드가 올바른 접근 |
| 등록 시 Owner 서명 요구 | 주소는 공개 정보, 서명은 사용 시점에 검증 |
| 잠금 구간 Owner 해제 | Owner 동의 없이 보안 다운그레이드 방지 |
| 시간 기반 유예->잠금 전이 | ownerAuth 사용 기반이 더 단순하고 의미적으로 정확 |
| Kill Switch 상태 보안 수준 변경 | ACTIVATED 상태에서 owner_address 변경은 차단 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| OWNER-01 | Phase 31 | Complete |
| OWNER-02 | Phase 32 | Complete |
| OWNER-03 | Phase 32 | Complete |
| OWNER-04 | Phase 32 | Complete |
| OWNER-05 | Phase 32 | Complete |
| OWNER-06 | Phase 32 | Complete |
| OWNER-07 | Phase 31 | Complete |
| OWNER-08 | Phase 31 | Complete |
| POLICY-01 | Phase 33 | Complete |
| POLICY-02 | Phase 33 | Complete |
| POLICY-03 | Phase 33 | Complete |
| WITHDRAW-01 | Phase 34 | Pending |
| WITHDRAW-02 | Phase 34 | Pending |
| WITHDRAW-03 | Phase 34 | Pending |
| WITHDRAW-04 | Phase 34 | Pending |
| WITHDRAW-05 | Phase 34 | Pending |
| WITHDRAW-06 | Phase 31 | Complete |
| WITHDRAW-07 | Phase 34 | Pending |
| WITHDRAW-08 | Phase 34 | Pending |
| SECURITY-01 | Phase 34 | Pending |
| SECURITY-02 | Phase 34 | Pending |
| SECURITY-03 | Phase 34 | Pending |
| SECURITY-04 | Phase 34 | Pending |
| DX-01 | Phase 35 | Pending |
| DX-02 | Phase 35 | Pending |
| DX-03 | Phase 35 | Pending |
| DX-04 | Phase 35 | Pending |
| DX-05 | Phase 35 | Pending |
| NOTIF-01 | Phase 33 | Complete |
| NOTIF-02 | Phase 33 | Complete |
| NOTIF-03 | Phase 34 | Pending |
| INTEG-01 | Phase 35 | Pending |
| INTEG-02 | Phase 35 | Pending |

**Coverage:**
- v0.8 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0

---
*Requirements defined: 2026-02-08*
*Last updated: 2026-02-09 after Phase 33 execution complete*
