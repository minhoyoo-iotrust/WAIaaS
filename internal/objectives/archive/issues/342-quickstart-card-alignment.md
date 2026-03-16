# #342 — Quick Start 카드 코드 블록 정렬 불일치

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** FIXED
- **수정일:** 2026-03-14
- **등록일:** 2026-03-14

## 설명

`site/index.html` Quick Start 섹션의 3개 카드(Install, Start, Connect)에서 설명 텍스트 길이 차이로 인해 코드 블록(`$ npm install ...`, `$ waiaas quickset`, `$ open ...`)의 수직 위치가 카드마다 다르다. 카드 높이는 같지만 코드 블록이 텍스트 바로 아래에 붙어있어 들쭉날쭉한 느낌.

## 수정 방향

- `.step` 카드에 `display: flex; flex-direction: column` 적용
- `.step code`에 `margin-top: auto` 적용하여 코드 블록을 카드 하단에 고정
- 3개 카드의 코드 블록이 수평으로 일직선 정렬되도록 함

## 테스트 항목

- [ ] 3개 카드의 코드 블록이 동일 수직 위치에 정렬되는지 확인
- [ ] 모바일 반응형(1열 레이아웃)에서 깨지지 않는지 확인
