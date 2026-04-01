# 474: Desktop 앱 아이콘을 사이트 파비콘 기반으로 교체

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** —
- **상태:** OPEN

## 설명

Desktop 앱 아이콘(icon.ico/icon.icns/PNG)이 placeholder 이미지로 생성되어 있다. 사이트 파비콘(site/favicon.svg)을 소스로 고해상도 PNG(1024x1024)를 렌더링한 후 `tauri icon`으로 전체 아이콘 세트를 재생성해야 한다.

## 수정 범위

- site/favicon.svg → 1024x1024 PNG 변환 (librsvg/sharp/Inkscape)
- `npx --prefix apps/desktop tauri icon <source.png>` 실행
- apps/desktop/src-tauri/icons/ 교체

## 테스트 항목

- [ ] 생성된 아이콘이 macOS/Windows/Linux에서 정상 표시되는지 확인
