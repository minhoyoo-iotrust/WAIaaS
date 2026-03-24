# 433 — Admin UI: Wallet App 등록 시 wallet_type을 combobox로 변경

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** OPEN
- **등록일:** 2026-03-24
- **관련 파일:** `packages/admin/src/pages/human-wallet-apps.tsx`

## 현상

Register Wallet App 폼에서 `wallet_type` 필드가 자유 텍스트 입력으로만 되어 있어, 알려진 프리셋 값을 사용자가 직접 타이핑해야 한다. placeholder에 "dcent, ledger, or custom"이라고 표시되어 있으나, `ledger`는 실제 프리셋이 아니므로 오해의 소지가 있다.

## 원인

- `wallet_type`은 설계상 free-form 문자열이지만, 알려진 프리셋(`dcent`)에 대한 선택 UI가 없음
- placeholder 텍스트에 프리셋이 아닌 `ledger`가 예시로 포함됨

## 개선 방안

1. **텍스트 입력 → combobox (datalist) 패턴으로 변경**
   - 알려진 프리셋(`dcent`)을 드롭다운 옵션으로 제안
   - 커스텀 값도 자유 입력 가능하도록 유지
   - `dcent` 선택 시 기존 `PRESET_PUSH_RELAY_URLS` 매핑을 통해 Push Relay URL 자동 채움 (기존 로직 유지)

2. **placeholder 텍스트 수정**
   - "dcent, ledger, or custom" → "dcent or custom" 또는 적절한 안내 문구로 변경

3. **프리셋 옵션은 `dcent`만** 포함 (현재 `WALLET_PRESET_TYPES = ['dcent']`과 일치)

## 테스트 항목

- [ ] combobox에서 `dcent` 선택 시 Push Relay URL 자동 채움 확인
- [ ] 커스텀 값 자유 입력 가능 확인
- [ ] 빈 값(미입력) 시 기존 동작 유지 (앱 이름으로 기본 설정)
- [ ] 정규식 검증 (`/^[a-z0-9][a-z0-9-]*$/`) 동작 확인
