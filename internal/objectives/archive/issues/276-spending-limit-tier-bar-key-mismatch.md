# #276 — Spending Limit 정책 목록 티어 바 키 불일치로 항상 빈 바 표시

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-03-07

## 현상

Admin UI 정책 목록(Policies 페이지)의 Rules 컬럼에 표시되는 Spending Limit 티어 바(Instant / Notify / Delay / Approval)가 USD 기반 한도를 설정해도 항상 빈 바로 표시된다.

- Instant Max USD = 1, Notify Max USD = 10, Delay Max USD = 100을 설정해도 바가 모두 0 너비로 렌더링됨
- Approval 바만 항상 100% 빨간색으로 표시되어, 모든 정책이 "전부 승인 필요"처럼 보임

## 원인

`policy-rules-summary.tsx`의 `TierVisualization` 컴포넌트가 `rules.instant_max`, `rules.notify_max`, `rules.delay_max` 키를 읽지만, 실제 USD 기반 설정은 `rules.instant_max_usd`, `rules.notify_max_usd`, `rules.delay_max_usd` 키에 저장된다.

```tsx
// policy-rules-summary.tsx:45-47 — 현재 코드
const instantMax = Number(rules.instant_max ?? 0);   // ← USD 값을 못 읽음
const notifyMax = Number(rules.notify_max ?? 0);
const delayMax = Number(rules.delay_max ?? 0);
```

```tsx
// spending-limit-form.tsx:143-161 — 실제 저장 키
name="instant_max_usd"   // ← _usd 접미사
name="notify_max_usd"
name="delay_max_usd"
```

토큰별 한도(`instant_max`, `notify_max`, `delay_max`)는 `token_limits` 하위에 중첩되어 있어 직접 참조로는 접근 불가. 결과적으로 `TierVisualization`은 항상 0 값을 읽게 된다.

## 수정 방향

`TierVisualization`에서 USD 키(`instant_max_usd` 등)를 우선 참조하고, 없을 경우 기존 키(`instant_max` 등)를 폴백으로 사용:

```tsx
const instantMax = Number(rules.instant_max_usd ?? rules.instant_max ?? 0);
const notifyMax = Number(rules.notify_max_usd ?? rules.notify_max ?? 0);
const delayMax = Number(rules.delay_max_usd ?? rules.delay_max ?? 0);
```

## 영향 범위

- `packages/admin/src/components/policy-rules-summary.tsx` — `TierVisualization` 컴포넌트
- 정책 목록 페이지 Spending Limit 행의 Rules 시각화

## 테스트 항목

- [ ] `instant_max_usd=1, notify_max_usd=10, delay_max_usd=100` 설정 시 바 너비가 1:10:100 비율로 표시되는지 확인
- [ ] USD 키만 설정된 경우 (토큰별 한도 없음) 올바르게 시각화되는지 확인
- [ ] 토큰별 한도만 설정된 경우 (USD 없음) 기존 동작 유지되는지 확인
- [ ] USD + 토큰별 한도 모두 설정된 경우 USD 값이 우선 표시되는지 확인
- [ ] `policy-rules-summary.test.tsx` 유닛 테스트 추가/갱신
