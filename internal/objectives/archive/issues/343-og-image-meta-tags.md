# #343 — OG 미리보기 이미지 생성 및 메타 태그 추가

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** FIXED
- **수정일:** 2026-03-14
- **등록일:** 2026-03-14

## 설명

현재 `site/index.html`에 `og:type`, `og:title`, `og:description` 메타 태그는 있지만 `og:image`와 `twitter:image`가 없어서 링크 공유 시 미리보기 이미지가 표시되지 않는다.

## 구현 방법: HTML→이미지 변환

### Step 1: OG 템플릿 HTML 생성
- `site/og-template.html` — 1200x630px 고정 크기 HTML
- 기존 터미널 테마 스타일 (JetBrains Mono, #0c0c0c 배경, 녹색 텍스트)
- 내용: 터미널 윈도우 바(빨강/노랑/초록 dot) + WAIaaS 로고 + 태그라인 + 피처 태그 4개 + install 명령어 + waiaas.ai URL
- scanline 오버레이 효과 포함

### Step 2: Puppeteer로 PNG 스크린샷
```bash
npx puppeteer screenshot site/og-template.html site/og-image.png \
  --viewport 1200x630 --full-page
```
또는 간단한 Node 스크립트로 캡처:
```js
const puppeteer = require('puppeteer');
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630 });
await page.goto(`file://${__dirname}/site/og-template.html`);
await page.screenshot({ path: 'site/og-image.png' });
await browser.close();
```

### Step 3: 메타 태그 추가
`site/index.html`에 추가:
```html
<meta property="og:image" content="https://waiaas.ai/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:image" content="https://waiaas.ai/og-image.png">
```

## OG 이미지 디자인 요소

- 배경: #0c0c0c (기존 터미널 테마)
- 상단: 터미널 윈도우 바 (빨/노/초 dot + "waiaas — daemon" 타이틀)
- 중앙: WAIaaS 로고 (녹색, 72px bold) + 태그라인
- 피처 태그: Multi-Chain / 13+ DeFi / 3-Layer Security / MCP Built-in
- 하단: `$ npm install -g @waiaas/cli` 명령어 박스
- 우하단: waiaas.ai URL

## 테스트 항목

- [ ] og-template.html이 브라우저에서 1200x630으로 정확히 렌더링되는지 확인
- [ ] Puppeteer 스크린샷이 폰트(JetBrains Mono) 포함하여 정상 캡처되는지 확인
- [ ] og-image.png 파일 크기가 적절한지 확인 (< 1MB 권장)
- [ ] Facebook Sharing Debugger / Twitter Card Validator에서 미리보기 정상 표시
- [ ] og-template.html은 배포에 포함하지 않거나 별도 관리 (빌드 아티팩트)
