# #344 GitHub Pages 모바일 반응형 콘텐츠 오버플로우

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v31.15
- **상태:** FIXED

## 설명

GitHub Pages 랜딩 사이트(`site/index.html`)가 모바일 화면(~500px 이하)에서 일부 콘텐츠가 오른쪽으로 잘리는 현상 발생.

## 재현 환경

- 기기: Android (SKT, 약 500px 폭)
- 브라우저: Chrome
- 페이지: https://waiaas.ai

## 증상

### 1. 테이블 오른쪽 잘림
- **Settings File 테이블** (`client-table`): `~/Library/Application Support/Claude/claude_desktop_config.json` 등 긴 경로가 화면 밖으로 넘침
- **Skills vs MCP 비교 테이블** (`compare-table`): 3열 테이블이 화면 폭 초과
- **Available Skills 테이블** (`info-table`): Description 컬럼이 잘림

### 2. 코드 블록 잘림
- Quick Start 3번 카드의 `open http://localhost:3100/admin`이 `white-space: pre`로 인해 줄바꿈 없이 잘림

### 3. 탭 콘텐츠 내부 오버플로우
- MCP 탭의 JSON 코드 블록과 테이블이 컨테이너 밖으로 넘침

## 원인

`@media (max-width: 768px)` 반응형 규칙에 테이블/코드 블록 모바일 처리가 누락:

1. `.step code`에 `white-space: pre` 고정 — 모바일에서 `pre-wrap` 필요
2. `info-table`, `client-table`, `compare-table`에 `overflow-x: auto` 없음
3. `.tab-content .cmd-block`, `.json-block`에 모바일 줄바꿈 처리 없음

## 수정 방안

`site/index.html`의 `@media (max-width: 768px)` 섹션에 추가:

```css
/* 코드 블록 줄바꿈 */
.step code { white-space: pre-wrap; word-break: break-all; }
.tab-content .cmd-block,
.tab-content .json-block { white-space: pre-wrap; word-break: break-all; }

/* 테이블 가로 스크롤 */
.tab-content .info-table,
.tab-content .client-table,
.tab-content .compare-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }

/* 탭 콘텐츠 패딩 축소 */
.tab-content { padding: 16px; }

/* 탭 버튼 스크롤 */
.tab-buttons { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.tab-btn { padding: 8px 16px; font-size: 0.8rem; white-space: nowrap; }
```

## 테스트 항목

- [ ] Chrome DevTools 모바일 에뮬레이터(375px, 414px)에서 Quick Start 코드 블록 줄바꿈 확인
- [ ] MCP 탭 Settings File 테이블 가로 스크롤 동작 확인
- [ ] Skills vs MCP 비교 테이블 가로 스크롤 동작 확인
- [ ] Available Skills 테이블 가로 스크롤 동작 확인
- [ ] JSON 코드 블록 줄바꿈 확인
- [ ] 데스크톱(960px+) 레이아웃에 영향 없음 확인
