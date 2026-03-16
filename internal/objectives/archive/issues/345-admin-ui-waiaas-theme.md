# #345 — Admin UI WAIaaS 브랜드 테마 적용

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** RESOLVED
- **등록일:** 2026-03-14

## 설명

현재 Admin UI는 커스텀 라이트 테마(파란색 primary, 흰색 배경)만 지원한다. waiaas.ai 랜딩 사이트와 동일한 터미널 다크 테마를 적용하여 브랜드 일관성을 확보하고 다크 모드를 기본으로 전환한다.

## 현재 상태

- Admin UI: `global.css` 1,734줄, CSS Custom Properties 기반 디자인 토큰, 라이트 전용
- 랜딩 사이트(waiaas.ai): 터미널 다크 테마 (`--bg: #0c0c0c`, `--green: #00ff41`, `--cyan: #00d4ff`)

## 목표 팔레트 (waiaas.ai 기준)

```css
--bg: #0c0c0c;
--surface: #111111;
--border: #2a2a2a;
--text: #b0b0b0;
--text-bright: #d4d4d4;
--text-dim: #666666;
--green: #00ff41;       /* primary accent */
--green-dim: #00cc33;
--cyan: #00d4ff;        /* links */
--yellow: #ffcc00;
--magenta: #ff44cc;
--red: #ff4444;         /* danger */
--amber: #ff9500;       /* warning */
--blue: #4488ff;
```

## 구현 범위

1. **CSS 변수 매핑** — `:root` 토큰을 WAIaaS 팔레트로 교체
   - `--color-primary` → `--green` 계열
   - `--color-bg` → `--bg` (#0c0c0c)
   - `--color-bg-secondary` → `--surface` (#111111)
   - `--color-border` → #2a2a2a
   - `--color-text` → `--text-bright` (#d4d4d4)
   - `--color-danger` → `--red` (#ff4444)
   - `--color-warning` → `--amber` (#ff9500)
   - `--color-success` → `--green` (#00ff41)
2. **컴포넌트 세부 조정** — 다크 배경에서 배지, 폼 input, 모달, 토스트 가독성 확인
3. **테마 토글 (선택)** — System/Light/Dark 전환, localStorage 저장

## 변경 대상

- `packages/admin/src/styles/global.css` — CSS 변수 값 교체

## 테스트 항목

- [ ] 다크 테마에서 전 페이지 시각 정상 확인 (텍스트 대비, 배지 색상, 폼 포커스 등)
- [ ] 테이블 행 호버/선택 상태 가독성
- [ ] 모달 오버레이 + 카드 배경 구분
- [ ] 토스트 알림 4종(success/error/info/warning) 색상 대비
- [ ] 차트/스탯 카드 다크 배경 정상 표시
- [ ] 모바일 반응형(768px 이하) 정상 표시
