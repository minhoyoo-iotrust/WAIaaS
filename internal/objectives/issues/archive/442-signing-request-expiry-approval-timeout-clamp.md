# 442 — 서명 요청 유효기간이 approval timeout을 초과할 수 있음

- **유형:** BUG
- **심각도:** LOW
- **등록일:** 2026-03-24

## 현상

서명 요청 유효기간(`signing_sdk.request_expiry_min`, 기본 30분)과 approval timeout(정책별 `approval_timeout`, 기본 3600초)이 독립적으로 관리된다. 두 값의 의미가 다르므로 독립 관리가 맞지만, `signing_request_expiry <= approval_timeout` 불변식이 보장되지 않는다.

signing request expiry가 approval timeout보다 긴 경우, 이미 EXPIRED된 approval에 대해 Push Relay long-polling이 계속 대기하는 낭비가 발생한다.

## 수정 방안

`sign-request-builder.ts`에서 서명 요청 생성 시, 남은 approval 시간과 `request_expiry_min`을 비교하여 `min(남은 approval 시간, request_expiry_min)`으로 clamp한다.

```typescript
// 현재: request_expiry_min만 사용
const expiresAt = new Date(now.getTime() + expiryMin * 60 * 1000);

// 수정: approval 남은 시간과 비교하여 clamp
const approvalRemainingMs = approvalExpiresAt - now.getTime();
const requestExpiryMs = expiryMin * 60 * 1000;
const effectiveExpiryMs = Math.min(requestExpiryMs, approvalRemainingMs);
const expiresAt = new Date(now.getTime() + effectiveExpiryMs);
```

### 설정 시점 검증이 부적합한 이유

- 두 값의 출처가 다름 (정책 rules vs Admin Settings)
- 정책별로 approval_timeout이 다를 수 있어 설정 시점에는 어떤 정책이 적용될지 알 수 없음
- 서명 요청 생성 시점에는 `pending_approvals.expires_at`이 이미 확정되어 있으므로 정확한 비교 가능

## 수정 파일

- `packages/daemon/src/services/signing-sdk/sign-request-builder.ts` — expiresAt 계산에 approval 남은 시간 clamp 적용

## 테스트 항목

### 단위 테스트 (sign-request-builder)

1. **clamp 동작:** approval timeout 10분, request_expiry_min 30분 → 서명 요청 유효기간이 10분으로 clamp되는지 확인
2. **clamp 불필요:** approval timeout 60분, request_expiry_min 30분 → 기존대로 30분이 적용되는지 확인
3. **approval 임박 만료:** approval 남은 시간이 1분 미만일 때 서명 요청 유효기간이 해당 잔여 시간으로 설정되는지 확인
4. **approval 이미 만료:** approval 남은 시간이 0 이하일 때 서명 요청이 즉시 만료 또는 생성 거부되는지 확인

### 통합 테스트

5. **Push Relay long-polling 종료:** clamp된 유효기간 이후 long-polling이 종료되는지 확인
6. **기존 테스트 회귀:** approval timeout > request_expiry_min인 기본 설정에서 기존 동작이 변하지 않는지 확인
