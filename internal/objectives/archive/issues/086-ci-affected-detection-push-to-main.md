# 086 — CI --affected가 push to main에서 변경 감지 실패 + 알림 테스트 텍스트 불일치

| 필드 | 값 |
|------|-----|
| **유형** | BUG |
| **심각도** | HIGH |
| **마일스톤** | v2.3 |
| **상태** | FIXED |
| **발견일** | 2026-02-18 |
| **수정일** | 2026-02-18 |

## 증상

1. release-please PR에서 CI Stage 1이 실패:
   ```
   FAIL src/__tests__/notifications.test.tsx > NotificationsPage > should show configuration guidance section
   TestingLibraryElementError: Unable to find an element with the text: /Configure notification channels in Settings/
   ```

2. Push to main에서는 테스트가 실행되지 않아 문제가 감지되지 않음.

## 근본 원인

### 1. --affected 베이스 동일 문제

CI Stage 1에서 `TURBO_SCM_BASE: origin/main`을 사용하는데, push 이벤트에서는 HEAD가 이미 main이므로 origin/main과 동일한 커밋을 가리킴. 결과적으로 `--affected`가 diff를 0으로 계산하여 어떤 패키지의 테스트도 실행하지 않음.

### 2. 테스트 텍스트 미갱신

v2.3에서 Settings → 기능별 메뉴 재구성 시 `notifications.tsx`의 안내 텍스트가 "Configure notification channels in Settings"에서 "Configure notification channels in the Settings tab above"로 변경되었으나, `notifications.test.tsx`의 정규식이 갱신되지 않음.

## 수정 내용

### A. CI affected base 동적 결정

`ci.yml`에 `Determine affected base` 스텝 추가:
- push 이벤트: `HEAD~1` (직전 커밋 대비 비교)
- PR 이벤트: `origin/main` (기존과 동일)

### B. 테스트 텍스트 갱신

`notifications.test.tsx:242`의 정규식을 현재 컴포넌트 텍스트와 일치하도록 수정.

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `.github/workflows/ci.yml` | `Determine affected base` 스텝 추가, TURBO_SCM_BASE 동적 할당 |
| `packages/admin/src/__tests__/notifications.test.tsx` | 정규식 텍스트 갱신 |

## PR

- https://github.com/minhoyoo-iotrust/WAIaaS/pull/15
