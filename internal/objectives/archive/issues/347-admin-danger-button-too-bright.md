# 347 — Admin UI Danger 버튼이 다크 테마에서 과도하게 눈에 띔

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** —
- **상태:** FIXED
- **수정일:** 2026-03-14

## 설명

다크 테마 전환 후 `.btn-danger` 버튼(Terminate Wallet, Permanently Delete 등)이 솔리드 빨간색 배경(`#ff4444`)에 어두운 텍스트(`#0c0c0c`)로 렌더링되어 다크 UI에서 과도하게 튀고 눈이 아픔.

## 영향 범위

- `packages/admin/src/styles/global.css:398-405` — `.btn-danger` / `.btn-danger:hover` 클래스
- 사용처: Terminate Wallet, Permanently Delete, 모달 확인 버튼(`confirmVariant="danger"`), Kill Switch, 기타 삭제/위험 동작 버튼

## 수정 방안

솔리드 배경 대신 아웃라인 스타일로 변경하여 다크 테마와 조화:

```css
.btn-danger {
  background: transparent;
  color: var(--color-danger);
  border: 1px solid var(--color-danger);
}

.btn-danger:hover:not(:disabled) {
  background: var(--color-danger-bg);
}
```

## 테스트 항목

- Terminate Wallet/Permanently Delete 버튼이 아웃라인 스타일로 표시되어 가독성 유지
- hover 시 배경 하이라이트 동작 확인
- 모달 내 danger 확인 버튼 스타일 일관성 확인
- 기존 `.btn-danger` 사용 테스트 (`telegram-users.test.tsx`, `system.test.tsx`, `wallets-coverage.test.tsx`) 통과
