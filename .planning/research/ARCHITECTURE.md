# Architecture Patterns

**Domain:** Desktop App Distribution Channels (Download Page + Homebrew Cask Tap + CI Automation)
**Researched:** 2026-04-01

## Recommended Architecture

3개 신규 컴포넌트가 기존 아키텍처에 통합된다:

1. **Download Page** -- `site/download/index.html` (정적 HTML + 클라이언트 사이드 JS)
2. **Homebrew Cask Tap** -- `minhoyoo-iotrust/homebrew-waiaas` 별도 GitHub 리포지토리
3. **CI Formula Automation** -- `desktop-release.yml` 워크플로우에 formula 업데이트 job 추가

```
기존 아키텍처:
  docs/*.md --> site/build.mjs --> site/{blog,docs}/*/index.html --> GitHub Pages
  desktop-v* tag --> desktop-release.yml --> GitHub Releases (.dmg, .msi, .AppImage, .deb)

신규 추가:
  site/download/index.html (수동 관리, build.mjs 파이프라인 외부)
    +-- 클라이언트 JS --> GitHub Releases API --> OS별 다운로드 링크 동적 생성

  desktop-release.yml publish-release job 이후:
    +-- update-homebrew job --> homebrew-waiaas repo Casks/w/waiaas.rb 자동 업데이트

  docs/admin-manual/desktop-installation.md --> site/build.mjs --> site/docs/desktop-installation/
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `site/download/index.html` | OS 감지 + GitHub Releases API 호출 + 다운로드 링크 렌더링 | GitHub Releases API (read-only, public, CORS 지원) |
| `site/build.mjs` | 기존 마크다운 to HTML 빌드 (수정 최소: sitemap에 /download/ 추가만) | `docs/**/*.md` 소스 파일 |
| `desktop-release.yml` | 3-platform 빌드 + Release 발행 + Homebrew formula 자동 업데이트 | GitHub Releases API, homebrew-waiaas repo |
| `homebrew-waiaas` repo | Cask formula 호스팅 | GitHub Releases (asset URL 참조) |
| `docs/admin-manual/desktop-installation.md` | Desktop 설치 가이드 (10번째 admin-manual 파일) | build.mjs 파이프라인으로 HTML 변환 |
| `site/template.html` | nav에 Download 링크 추가 | download/index.html 으로 연결 |

### Data Flow

```
[사용자] --> waiaas.ai/download/
  --> 브라우저 JS: navigator.userAgent --> OS 감지 (macOS/Windows/Linux)
  --> fetch('https://api.github.com/repos/minhoyoo-iotrust/WAIaaS/releases')
     --> tag_name이 'desktop-v*' 패턴인 최신 릴리스 필터링
     --> assets[].name 매칭으로 OS별 바이너리 URL 추출
  --> 기본 다운로드 버튼: 감지된 OS에 맞는 바이너리
  --> "Other platforms" 섹션: 전체 바이너리 목록

[CI: desktop-v* tag push]
  --> desktop-release.yml: create-release --> build-tauri (3 platform) --> publish-release
  --> update-homebrew job:
     --> GitHub Releases에서 macOS .dmg SHA256 계산
     --> homebrew-waiaas repo의 Casks/w/waiaas.rb 업데이트 (version, url, sha256)
     --> 자동 커밋 + 푸시
```

## Patterns to Follow

### Pattern 1: Download Page as Static HTML (build.mjs 파이프라인 외부)

**What:** `site/download/index.html`을 수동 관리하는 정적 HTML 파일로 생성. `site/build.mjs` 마크다운 파이프라인에 포함하지 않는다.

**When:** 다운로드 페이지는 마크다운 콘텐츠가 아니라 인터랙티브 UI(OS 감지, API 호출, 동적 링크)이므로 별도 관리가 적합하다.

**Why:** `build.mjs`는 `docs/**/*.md` to front-matter to template 파이프라인이다. 다운로드 페이지는 front-matter 없는 커스텀 HTML+JS이므로 이 파이프라인에 강제로 넣으면 복잡해진다. `site/index.html`도 이미 build.mjs 외부의 수동 관리 파일이다 -- 동일 패턴을 따른다.

**Rationale:**
- `site/index.html` (홈페이지)이 이미 build.mjs 외부의 수동 HTML 파일 -- 선례가 있다
- GitHub Pages 배포는 `site/` 디렉토리 전체를 업로드하므로 `site/download/index.html`은 자동으로 배포된다
- `pages.yml` 워크플로우가 `site/**` 경로 변경을 감지하므로 download 페이지 변경 시에도 자동 배포된다

**Example:**
```html
<!-- site/download/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- 기존 template.html의 head 구조 복사 (CRT 테마, 폰트, favicon) -->
  <title>Download WAIaaS Desktop - WAIaaS</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "WAIaaS Desktop",
    "operatingSystem": "macOS, Windows, Linux",
    "downloadUrl": "https://waiaas.ai/download/"
  }
  </script>
</head>
<body>
  <!-- nav: template.html과 동일 구조, Download 링크 active -->
  <main class="container">
    <div id="download-hero">
      <h1>Download WAIaaS Desktop</h1>
      <p id="detected-os">Detecting your operating system...</p>
      <a id="primary-download" class="download-btn" href="#">
        Download for <span id="os-name">your OS</span>
      </a>
      <p id="version-info"></p>
    </div>
    <div id="all-downloads">
      <h2>All Downloads</h2>
      <div id="download-grid"><!-- JS로 채움 --></div>
    </div>
    <div id="alternative-install">
      <h2>Alternative Installation Methods</h2>
      <!-- Homebrew, npm, Docker 안내 -->
    </div>
  </main>
  <script>
    // OS 감지 + GitHub Releases API 호출 (인라인, 외부 JS 없음)
  </script>
</body>
</html>
```

### Pattern 2: GitHub Releases API 클라이언트 사이드 호출

**What:** `https://api.github.com/repos/OWNER/REPO/releases` 엔드포인트를 브라우저에서 직접 호출하여 최신 desktop 릴리스의 asset URL을 동적으로 추출한다.

**When:** 다운로드 페이지 로드 시.

**Why:** GitHub Releases API는 CORS를 지원하고, public repo의 경우 인증 없이 시간당 60회 요청 가능. 빌드 타임에 URL을 하드코딩하면 릴리스마다 사이트 재빌드가 필요하다 -- 클라이언트 사이드 호출이면 릴리스 후 즉시 반영된다.

**Key implementation details:**
- `desktop-v*` 태그 패턴으로 필터링 (release-please의 npm `v*` 릴리스와 구분)
- Asset name 패턴 매칭: `.dmg` (macOS), `.msi` (Windows), `.AppImage`/`.deb` (Linux)
- macOS는 `aarch64` (Apple Silicon)과 `x64` (Intel) 두 아키텍처 구분 필요
- Rate limit 초과 시 fallback: GitHub Releases 페이지 직접 링크 표시
- 에러/로딩 상태 UI 표시 (API 응답 대기 중 스켈레톤)

**Example:**
```javascript
const REPO = 'minhoyoo-iotrust/WAIaaS';
const TAG_PREFIX = 'desktop-v';

async function loadDownloads() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases`);
  const releases = await res.json();

  // desktop-v* 태그인 릴리스만 필터 (release-please 릴리스 제외)
  const desktopReleases = releases.filter(r =>
    r.tag_name.startsWith(TAG_PREFIX) && !r.draft
  );
  if (desktopReleases.length === 0) return;

  const latest = desktopReleases[0];
  const version = latest.tag_name.replace(TAG_PREFIX, '');

  // OS 감지
  const ua = navigator.userAgent;
  let detectedOS = 'unknown';
  if (ua.includes('Mac')) detectedOS = 'macOS';
  else if (ua.includes('Win')) detectedOS = 'Windows';
  else if (ua.includes('Linux')) detectedOS = 'Linux';

  // Asset 매칭 + 렌더링
  for (const asset of latest.assets) {
    // .dmg -> macOS, .msi -> Windows, .AppImage/.deb -> Linux
  }
}
```

### Pattern 3: Homebrew Cask Tap 별도 리포지토리

**What:** `minhoyoo-iotrust/homebrew-waiaas` GitHub 리포지토리에 macOS Cask formula를 호스팅한다.

**When:** macOS 사용자가 `brew install --cask minhoyoo-iotrust/waiaas/waiaas` 또는 `brew tap minhoyoo-iotrust/waiaas && brew install --cask waiaas`로 설치.

**Why:** Homebrew 공식 문서가 tap 리포지토리를 `homebrew-` 접두사로 시작하도록 권장. Cask는 `Casks/` 디렉토리에 배치. 별도 리포지토리여야 `brew tap` 명령이 동작한다.

**Repository structure:**
```
homebrew-waiaas/
  README.md
  Casks/
    w/
      waiaas.rb
```

**Cask formula:**
```ruby
# Casks/w/waiaas.rb
cask "waiaas" do
  arch arm: "aarch64", intel: "x64"

  version "0.1.0"
  sha256 arm:   "PLACEHOLDER_ARM64_SHA256",
         intel: "PLACEHOLDER_X64_SHA256"

  url "https://github.com/minhoyoo-iotrust/WAIaaS/releases/download/desktop-v#{version}/WAIaaS-Desktop_#{version}_#{arch}.dmg"
  name "WAIaaS Desktop"
  desc "Self-hosted wallet daemon for AI agents - desktop app"
  homepage "https://waiaas.ai/"

  depends_on macos: ">= :catalina"

  app "WAIaaS Desktop.app"

  zap trash: [
    "~/Library/Application Support/dev.waiaas.desktop",
    "~/Library/Caches/dev.waiaas.desktop",
    "~/Library/Preferences/dev.waiaas.desktop.plist",
  ]
end
```

**Key decisions:**
- Cask name: `waiaas` (글로벌 고유해야 함, 충돌 가능성 낮음)
- `Casks/w/` 서브디렉토리: Homebrew 공식 컨벤션 (첫 글자 디렉토리)
- `arch arm:, intel:` 듀얼 아키텍처: Homebrew가 자동으로 현재 아키텍처에 맞는 값 선택
- `depends_on macos: ">= :catalina"`: tauri.conf.json의 `minimumSystemVersion: "10.15"`와 일치
- `zap trash`: Tauri 앱의 identifier `dev.waiaas.desktop` 기반 경로

### Pattern 4: CI Formula 자동 업데이트 (desktop-release.yml 확장)

**What:** `desktop-release.yml`의 `publish-release` job 이후에 `update-homebrew` job을 추가하여 homebrew-waiaas 리포지토리의 Cask formula를 자동 업데이트한다.

**When:** desktop-v* 릴리스가 발행될 때마다 자동 실행.

**Why:** 수동 업데이트는 잊기 쉽고 지연이 발생한다. `HOMEBREW_TAP_TOKEN` secret(homebrew-waiaas repo 쓰기 권한 가진 PAT)으로 인증하여 자동 커밋+푸시한다.

**Required secrets:**
- `HOMEBREW_TAP_TOKEN`: `minhoyoo-iotrust/homebrew-waiaas` repo에 대한 `contents: write` 권한의 Fine-grained PAT

**Example (desktop-release.yml에 추가할 job):**
```yaml
  update-homebrew:
    needs: publish-release
    runs-on: ubuntu-latest
    steps:
      - name: Extract version
        id: version
        run: |
          TAG="${{ github.event.inputs.tag || github.ref_name }}"
          VERSION="${TAG#desktop-v}"
          echo "version=${VERSION}" >> $GITHUB_OUTPUT

      - name: Download macOS DMGs and compute SHA256
        id: sha
        run: |
          VERSION="${{ steps.version.outputs.version }}"
          BASE="https://github.com/minhoyoo-iotrust/WAIaaS/releases/download/desktop-v${VERSION}"
          curl -sL "${BASE}/WAIaaS-Desktop_${VERSION}_aarch64.dmg" -o arm64.dmg
          curl -sL "${BASE}/WAIaaS-Desktop_${VERSION}_x64.dmg" -o x64.dmg
          echo "arm64=$(sha256sum arm64.dmg | cut -d' ' -f1)" >> $GITHUB_OUTPUT
          echo "x64=$(sha256sum x64.dmg | cut -d' ' -f1)" >> $GITHUB_OUTPUT

      - name: Checkout homebrew-waiaas
        uses: actions/checkout@v4
        with:
          repository: minhoyoo-iotrust/homebrew-waiaas
          token: ${{ secrets.HOMEBREW_TAP_TOKEN }}

      - name: Update Cask formula
        run: |
          sed -i "s/version \".*\"/version \"${{ steps.version.outputs.version }}\"/" Casks/w/waiaas.rb
          sed -i "s/arm:   \".*\"/arm:   \"${{ steps.sha.outputs.arm64 }}\"/" Casks/w/waiaas.rb
          sed -i "s/intel: \".*\"/intel: \"${{ steps.sha.outputs.x64 }}\"/" Casks/w/waiaas.rb

      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add Casks/w/waiaas.rb
          git commit -m "Update WAIaaS Desktop to ${{ steps.version.outputs.version }}"
          git push
```

**DMG 파일명 패턴 주의:** 실제 tauri-action이 생성하는 asset 이름을 확인 필요. 현재 추정: `WAIaaS-Desktop_{version}_{arch}.dmg`. tauri.conf.json의 `productName: "WAIaaS Desktop"`과 빌드 매트릭스 target에 따라 달라질 수 있다. 구현 시 첫 릴리스의 실제 asset 이름을 확인하고 패턴을 맞춰야 한다.

### Pattern 5: 설치 가이드를 기존 docs/admin-manual/ 파이프라인에 통합

**What:** `docs/admin-manual/desktop-installation.md`를 10번째 admin-manual 파일로 추가. 기존 `build.mjs` 파이프라인이 자동으로 HTML 변환한다.

**When:** 항상. 설치 가이드는 마크다운 콘텐츠이므로 기존 파이프라인에 정확히 맞는다.

**Why:** `build.mjs`가 `docs/**/*.md`를 glob하므로 파일 추가만으로 자동 빌드된다. front-matter에 `section: docs`, `category: Admin Manual`을 넣으면 docs 인덱스 페이지에도 자동 등록된다.

**Example front-matter:**
```yaml
---
title: "Desktop App Installation Guide"
description: "Install WAIaaS Desktop on macOS, Windows, and Linux. Setup wizard, Homebrew Cask, troubleshooting, and upgrade instructions."
date: 2026-04-01
section: docs
category: Admin Manual
slug: desktop-installation
---
```

### Pattern 6: 네비게이션에 Download 링크 추가

**What:** `site/template.html`의 nav-links에 Download 링크를 추가한다. `site/download/index.html`에도 동일한 nav 구조를 수동으로 포함한다.

**When:** 다운로드 페이지 완성 후.

**Impact:** template.html 수정은 `build.mjs`가 생성하는 모든 blog/docs 페이지에 반영된다. `site/index.html`(홈페이지)과 `site/download/index.html`은 수동이므로 별도 수정 필요.

**Example (template.html 수정):**
```html
<div class="nav-links">
  <a href="https://github.com/minhoyoo-iotrust/WAIaaS">GitHub</a>
  <a href="/download/">Download</a>
  <a href="https://www.npmjs.com/package/@waiaas/cli">npm</a>
  <a href="https://hub.docker.com/u/waiaas">Docker</a>
  <a href="/blog/" class="{{ACTIVE_BLOG}}">Blog</a>
  <a href="/docs/" class="{{ACTIVE_DOCS}}">Docs</a>
</div>
```

`site/index.html` 홈페이지에도 "Download Desktop App" CTA 섹션을 추가한다.

## Anti-Patterns to Avoid

### Anti-Pattern 1: build.mjs에 다운로드 페이지 로직 추가

**What:** 다운로드 페이지를 마크다운 파일로 만들어 build.mjs 파이프라인에 넣으려는 시도.

**Why bad:** 다운로드 페이지는 인터랙티브 JS가 필수(OS 감지, API 호출, 동적 렌더링). 마크다운 파이프라인은 정적 콘텐츠용이다. `build.mjs`에 특수 케이스 분기를 추가하면 파이프라인 복잡도가 불필요하게 증가한다.

**Instead:** `site/download/index.html`을 `site/index.html`과 동일하게 수동 관리 정적 파일로 둔다.

### Anti-Pattern 2: 빌드 타임에 GitHub Releases URL 하드코딩

**What:** `build.mjs`에서 GitHub API를 호출하여 다운로드 URL을 빌드 타임에 주입.

**Why bad:** 릴리스마다 사이트 재빌드+재배포가 필요. `pages.yml`과 `desktop-release.yml`이 별도 워크플로우이므로 동기화가 복잡해진다. 데스크탑 릴리스 후 pages 재빌드 트리거가 없으면 구버전 URL이 표시된다.

**Instead:** 클라이언트 사이드에서 GitHub Releases API를 호출하여 항상 최신 데이터를 표시한다.

### Anti-Pattern 3: WAIaaS 메인 리포지토리에 Homebrew formula 내장

**What:** WAIaaS 리포지토리 내부에 `homebrew/` 디렉토리를 만들어 formula를 관리.

**Why bad:** `brew tap`은 `homebrew-` 접두사를 가진 별도 리포지토리를 요구한다. 메인 리포지토리에 formula를 넣으면 tap 기능이 동작하지 않는다.

**Instead:** `minhoyoo-iotrust/homebrew-waiaas` 별도 리포지토리를 생성한다.

### Anti-Pattern 4: Homebrew Releaser 등 범용 Action 사용

**What:** `homebrew-releaser` GitHub Action을 사용하여 formula 관리.

**Why bad:** 이 Action은 formula(소스 빌드) 전용이다. WAIaaS Desktop은 prebuilt binary Cask이므로 formula 생성 로직이 맞지 않는다. Cask의 `arch arm:, intel:` 듀얼 아키텍처 패턴을 지원하지 않는다.

**Instead:** `sed` 기반 간단한 스크립트로 version/sha256만 교체한다. Cask formula 구조가 단순하므로 범용 도구 없이도 충분하다.

## New vs Modified Components

### New Files (신규 생성)

| File | Type | Purpose |
|------|------|---------|
| `site/download/index.html` | Static HTML+JS | OS 감지 다운로드 페이지 |
| `docs/admin-manual/desktop-installation.md` | Markdown | Desktop 설치 가이드 (build.mjs 자동 빌드) |
| `minhoyoo-iotrust/homebrew-waiaas` (별도 repo) | GitHub repo | Homebrew Cask tap |
| `homebrew-waiaas/Casks/w/waiaas.rb` | Ruby | Cask formula |
| `homebrew-waiaas/README.md` | Markdown | Tap 설치 안내 |

### Modified Files (기존 수정)

| File | Change | Impact |
|------|--------|--------|
| `site/template.html` | nav-links에 Download 링크 추가 | 전체 빌드 페이지에 반영 (blog/docs 모든 페이지) |
| `site/index.html` | Download Desktop CTA 섹션 추가 | 홈페이지 |
| `.github/workflows/desktop-release.yml` | `update-homebrew` job 추가 | CI 파이프라인 확장 |
| `site/distribution/SUBMISSION_KIT.md` | Desktop 배포 채널 항목 추가 | 문서 |
| `site/build.mjs` | `generateSitemap()`에 `/download/` 정적 URL 1줄 추가 | SEO sitemap |

### Unchanged Files (수정 불필요)

| File | Why No Change |
|------|---------------|
| `.github/workflows/pages.yml` | `site/**` 경로 감지이므로 download 페이지 변경도 자동 배포 |
| `site/article.css` | download 페이지는 자체 인라인 스타일 사용 (CRT 테마 변수는 template에서 복사) |
| `apps/desktop/` | Desktop 앱 자체는 변경 없음, 배포 채널만 추가 |

**Sitemap 처리:** `site/download/index.html`은 build.mjs가 생성하지 않으므로 sitemap.xml에 자동 포함되지 않는다. `build.mjs`의 `generateSitemap()` 함수에서 homepage를 정적으로 추가하는 코드가 이미 있으므로(L636-L652), 동일 패턴으로 `/download/` URL을 1줄 추가하면 된다.

## Integration Points Summary

```
                    +--------------------------------------+
                    |  desktop-v* tag push                 |
                    |  (기존: desktop-release.yml)          |
                    +------+------------------+------------+
                           |                  |
                    +------v------+     +-----v-------------------+
                    | publish-    |     | update-homebrew          |
                    | release     |     | (신규 job)               |
                    | (기존)      |     |                          |
                    +------+------+     | 1. DMG SHA256 계산       |
                           |           | 2. homebrew-waiaas       |
                    +------v------+     |    Cask formula 업데이트  |
                    | GitHub      |     | 3. 자동 커밋+푸시         |
                    | Releases    |     +--------------------------+
                    | (기존)      |
                    +------+------+
                           |
              +------------+------------------+
              |            |                  |
      +-------v-------+ +-v----------+ +-----v-----------+
      | Download Page | | Homebrew   | | Tauri Auto-     |
      | (클라이언트 JS) | | Cask       | | Updater         |
      | API 호출       | | (URL 참조)  | | (latest.json)   |
      | (신규)         | | (신규)      | | (기존)           |
      +---------------+ +------------+ +-----------------+
```

## Build Order (의존성 기반 추천 순서)

### Phase 1: Homebrew Cask Tap 리포지토리 생성

**의존성:** 없음 (독립적)
**산출물:** `homebrew-waiaas` repo + `Casks/w/waiaas.rb` + README

이유: 별도 리포지토리이므로 메인 코드베이스와 독립적. 가장 먼저 만들어 두면 Phase 3의 CI 연동에서 즉시 사용 가능.

### Phase 2: Desktop 설치 가이드

**의존성:** 없음 (독립적, 단 Phase 1의 Homebrew 설치 방법을 포함하려면 Phase 1 이후)
**산출물:** `docs/admin-manual/desktop-installation.md`

이유: 기존 build.mjs 파이프라인에 파일 추가만으로 동작. 다운로드 페이지에서 가이드로 링크하므로 Phase 4보다 먼저.

### Phase 3: CI Formula 자동 업데이트

**의존성:** Phase 1 (homebrew-waiaas repo 존재 필요)
**산출물:** `desktop-release.yml` 수정 + `HOMEBREW_TAP_TOKEN` secret 설정

이유: Phase 1의 리포지토리가 있어야 CI에서 push할 수 있다.

### Phase 4: Download 페이지 + 네비게이션 업데이트

**의존성:** Phase 2 (설치 가이드 링크 포함)
**산출물:** `site/download/index.html`, `site/template.html` 수정, `site/index.html` CTA 추가, `site/build.mjs` sitemap 1줄 추가

이유: 모든 배포 채널이 준비된 후 다운로드 페이지에서 통합 안내. template.html 수정은 전체 사이트 nav에 영향이므로 마지막에.

### Phase 5: SUBMISSION_KIT 업데이트 + 마무리

**의존성:** Phase 1-4 전체
**산출물:** `SUBMISSION_KIT.md` Desktop 배포 채널 항목 추가

## Scalability Considerations

| Concern | 현재 (v0.1.0) | 향후 (v1.0+) | Notes |
|---------|--------------|-------------|-------|
| GitHub API Rate Limit | 60 req/hr (비인증) | 충분 | 일반 트래픽에서 문제 없음. 폭주 시 fallback 링크 표시 |
| Homebrew Formula 업데이트 | CI 자동 sed 교체 | 동일 | Cask 구조가 단순하므로 스케일 문제 없음 |
| 다운로드 바이너리 호스팅 | GitHub Releases (무료) | 동일 | GitHub LFS 불필요, 릴리스 asset으로 충분 |
| macOS 아키텍처 | arm64 + x64 | Universal binary 가능 | 현재 2개 분리 빌드, Universal은 tauri-action 설정으로 전환 가능 |

## Sources

- [Homebrew: How to Create and Maintain a Tap](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap) -- HIGH confidence
- [Homebrew Cask Cookbook](https://docs.brew.sh/Cask-Cookbook) -- HIGH confidence
- [GitHub REST API: Releases](https://docs.github.com/en/rest/releases/releases) -- HIGH confidence
- [Simon Willison: Auto-maintaining Homebrew formulas with GitHub Actions](https://til.simonwillison.net/homebrew/auto-formulas-github-actions) -- MEDIUM confidence
- [josh.fail: Automate Homebrew formulae with GitHub Actions](https://josh.fail/2023/automate-updating-custom-homebrew-formulae-with-github-actions/) -- MEDIUM confidence
- 기존 코드베이스 분석: `site/build.mjs`, `site/template.html`, `site/index.html`, `.github/workflows/desktop-release.yml`, `.github/workflows/pages.yml` -- HIGH confidence
