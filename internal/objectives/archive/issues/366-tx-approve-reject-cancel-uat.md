# 366 — TX approve/reject/cancel 승인 워크플로우 UAT 시나리오 추가

- **유형:** MISSING
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-03-16

## 현상

트랜잭션 approve/reject/cancel 기능에 단위/통합 테스트(32개)는 있으나, Owner 지갑이 설정된 실환경에서 다단계 승인 워크플로우를 검증하는 UAT 시나리오 부재.

## 수정 방안

agent-uat/advanced/ 에 트랜잭션 승인 워크플로우 UAT 시나리오 추가:

### 전제 조건
- Owner 주소가 등록된 지갑
- APPROVAL 티어가 설정된 SPENDING_LIMIT 정책

### 시나리오 스텝
1. APPROVAL 티어 초과 금액 전송 요청 → PENDING_APPROVAL 상태 확인
2. GET /v1/transactions → pending TX 목록에 표시 확인
3. Owner가 approve → TX 실행 재개 → CONFIRMED 확인
4. 두 번째 APPROVAL 요청 → reject → TX CANCELLED 확인
5. 세 번째 APPROVAL 요청 → 에이전트가 cancel → TX CANCELLED 확인
6. timeout 시나리오 → approval_timeout 초과 후 자동 만료 확인

## 대상 파일

- `agent-uat/advanced/tx-approval-workflow.md` — 신규 시나리오 파일

## 테스트 항목

- APPROVAL 티어 도달 시 TX가 PENDING_APPROVAL 상태로 전환되는지 확인
- approve 후 TX가 정상 실행되는지 확인
- reject 후 TX가 CANCELLED 상태로 전환되는지 확인
- cancel 후 TX가 CANCELLED 상태로 전환되는지 확인
- approval_timeout 초과 시 자동 만료되는지 확인
