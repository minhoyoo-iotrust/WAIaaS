# #181 Admin UI 네비게이션 불가 — dirty-guard isDirty 크래시

- **유형:** BUG
- **심각도:** CRITICAL
- **마일스톤:** v28.5
- **상태:** FIXED

---

## 증상

Admin UI에서 사이드바 메뉴 클릭, 페이지 내 탭 전환 모두 동작하지 않음.
브라우저 콘솔에 반복적으로:

```
Uncaught TypeError: t.isDirty is not a function
    at index-DEnx1daw.js:1:44391
    at Array.some (<anonymous>)
```

모든 `onClick` 핸들러에서 `hasDirty` computed signal 평가 시 크래시 발생.

추가 에러:
- `v1/actions/providers` — 401 Unauthorized (반복)
- `v1/wallets/.../wc/session` — 404 Not Found

---

## 근본 원인

`dirty-guard.ts:13`의 `hasDirty` computed signal:

```typescript
export const hasDirty = computed(() => registry.value.some(r => r.isDirty()));
```

`registry`에 등록된 항목 중 `isDirty`가 함수가 아닌 것이 존재.
`registerDirty()` 호출 시 TypeScript 인터페이스를 만족하지 않는 객체가 전달된 것으로 추정.

---

## 조사 필요

- `registerDirty` 호출하는 모든 페이지 점검 (특히 최근 추가/수정된 페이지)
- actions.tsx, policies.tsx(#173 수정), notifications.tsx 등에서 isDirty 누락 여부 확인
- v2.6.0-rc.12 빌드 시점 코드 기준으로 조사

---

## 수정 방안

1. 원인 페이지의 `registerDirty()` 호출에서 `isDirty` 함수 누락/오타 수정
2. 방어 코드 추가: `hasDirty` computed에서 `typeof r.isDirty === 'function'` 가드

---

## 관련 파일

- `packages/admin/src/utils/dirty-guard.ts` — hasDirty computed, registerDirty
- `packages/admin/src/components/layout.tsx` — onClick에서 hasDirty 참조
- `registerDirty` 호출하는 모든 페이지 (policies, security, system, settings, notifications 등)

---

## 테스트 항목

- [ ] 모든 사이드바 메뉴 이동 정상 확인
- [ ] 페이지 내 탭 전환 정상 확인
- [ ] 설정 변경 후 dirty 상태에서 네비게이션 시 unsaved 다이얼로그 표시 확인
- [ ] 브라우저 콘솔에 isDirty 에러 미발생 확인
