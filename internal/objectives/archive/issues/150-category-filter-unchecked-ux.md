# #150 — 알림 카테고리 필터 전체 언체크 시 UX 혼동

- **Type:** ENHANCEMENT
- **Severity:** LOW
- **Found in:** v27.3
- **Status:** FIXED

## 현상

Admin UI → Notifications → Category Filter에서 "전체 수신" 상태가 **모든 체크박스 언체크**로 표시된다.
설명 텍스트("Leave all unchecked to receive all")가 있지만, 시각적으로 "아무것도 활성화되지 않음"처럼 보여 직관적이지 않다.

## 원인

백엔드 규칙이 `빈 배열([]) = 전체 허용`이고, UI가 이를 그대로 빈 체크박스로 매핑한다.

## 기대 동작

- 빈 배열(전체 허용)일 때 **모든 체크박스가 체크된 상태**로 표시
- 전부 체크 상태에서 저장 시 백엔드에는 `[]`(빈 배열)로 전송 (기존 백엔드 로직 변경 없음)
- 설명 텍스트: "All checked = receive all."로 변경

## 수정 범위

- `packages/admin/src/pages/notifications.tsx` — Category Filter 섹션
  - `rawCategories.length === 0`일 때 `displayCategories`를 전체 값 배열로 설정
  - 토글 시 전부 체크 → `[]`로 변환하여 저장

## 테스트 항목

1. 초기 상태(`notify_categories = []`): 6개 체크박스 전부 체크 확인
2. 1개 언체크 후 저장: 해당 카테고리 제외한 5개 배열 저장 확인
3. 다시 전부 체크 후 저장: `[]` 저장 확인 (백엔드 "전체 허용" 규칙 유지)
4. 백엔드 알림 필터 동작 변경 없음 확인
