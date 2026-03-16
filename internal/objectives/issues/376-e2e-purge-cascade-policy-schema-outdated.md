# #376 — E2E wallet-purge-cascades-data 테스트 정책 생성 스키마 불일치

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v32.5
- **상태:** FIXED

## 설명

E2E 스모크 테스트 `wallet-purge-cascades-data > purge removes related sessions, policies, and transactions`가 정책 생성 단계에서 400 에러로 실패한다. 테스트가 구버전 정책 생성 스키마를 사용하고 있어 Zod 검증에서 거부된다.

## 근본 원인

테스트 코드가 두 가지 구버전 필드를 사용:

1. **`params` → `rules`**: 현재 `CreatePolicyRequestSchema`는 `rules` 필드를 기대하지만 테스트는 `params`를 전송
2. **`{ maxAmount, period }` → `{ instant_max, notify_max, delay_max }`**: 현재 `SpendingLimitRulesSchema`는 3-tier 한도 구조(`instant_max`/`notify_max`/`delay_max`) 또는 USD 한도(`instant_max_usd` 등)를 기대하지만 테스트는 `maxAmount`/`period`라는 존재하지 않는 필드를 전송

```typescript
// 현재 테스트 (구버전 스키마)
{
  walletId,
  type: 'SPENDING_LIMIT',
  params: { maxAmount: '1000000000', period: 'daily' },
}

// 올바른 스키마
{
  walletId,
  type: 'SPENDING_LIMIT',
  rules: { instant_max: '1000000000', notify_max: '5000000000', delay_max: '10000000000' },
}
```

## 영향

- CI E2E 스모크 테스트 1건 실패 (69/70 통과)
- 정책 생성 API 자체는 정상 동작 — 테스트 코드만 구버전

## 관련 코드

- `packages/e2e-tests/src/__tests__/core-wallet-lifecycle.e2e.test.ts:261-269` — 구버전 정책 생성 호출
- `packages/core/src/schemas/policy.schema.ts:310-372` — CreatePolicyRequestSchema (`rules` 필드)
- `packages/core/src/schemas/policy.schema.ts:117-164` — SpendingLimitRulesSchema (3-tier 한도)
- `packages/daemon/src/api/routes/policies.ts:132-280` — POST /v1/policies 핸들러

## 수정 방안

`core-wallet-lifecycle.e2e.test.ts` 270행 부근의 정책 생성 페이로드를 현재 API 스키마에 맞게 수정:
- `params` → `rules`
- `{ maxAmount: '1000000000', period: 'daily' }` → `{ instant_max: '1000000000', notify_max: '5000000000', delay_max: '10000000000' }`

## 테스트 항목

- [ ] `wallet-purge-cascades-data` 테스트 통과 확인 (정책 201 응답)
- [ ] purge 후 정책/세션/트랜잭션 cascade 삭제 검증 로직 정상 동작
- [ ] 전체 E2E offchain 테스트 70/70 통과
