# 330 — Admin UI Jupiter Swap requiresApiKey 동기화 누락 — API 키 입력 필드 미표시

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v31.9
- **상태:** OPEN

## 현상

Admin UI Actions 페이지에서 Jupiter Swap 프로바이더가 API 키 불필요로 표시되어 API 키 입력 필드가 나타나지 않는다. 실제로는 Jupiter API가 인증 필수로 전환되어 키 없이 사용 시 401 에러 발생.

## 원인

#318에서 프로바이더 메타데이터(`packages/actions/src/providers/jupiter-swap/index.ts:52`)를 `requiresApiKey: true`로 수정했으나, Admin UI의 하드코딩 배열(`packages/admin/src/pages/actions.tsx:28`)은 `requiresApiKey: false`로 동기화하지 않음.

## 해결 방안

`packages/admin/src/pages/actions.tsx:28`의 Jupiter 항목에서 `requiresApiKey: false` → `requiresApiKey: true` 변경.

## 영향 범위

- `packages/admin/src/pages/actions.tsx` — BUILTIN_PROVIDERS 배열

## 테스트 항목

1. Admin UI Actions 페이지에서 Jupiter Swap에 API 키 입력 필드가 표시되는지 확인
2. API 키 저장 후 Jupiter Swap 활성화 정상 동작 확인
3. BUILTIN_PROVIDERS와 실제 프로바이더 메타데이터 requiresApiKey 일치 여부 검증 테스트
