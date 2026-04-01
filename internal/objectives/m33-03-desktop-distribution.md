# 마일스톤 m33-03: Desktop App 배포 채널 확장

- **Status:** SHIPPED
- **Milestone:** v33.3
- **Completed:** 2026-04-01

## 목표

m33-02에서 빌드된 Tauri Desktop App의 배포 접근성을 높인다. waiaas.ai 웹사이트에 OS 감지 다운로드 페이지를 추가하고, macOS 사용자를 위한 Homebrew Cask tap을 제공한다. GitHub Releases(m33-02)를 바이너리 소스로 활용하여 추가 호스팅 인프라 없이 배포한다.

---

## 배경

m33-02에서 GitHub Releases CI가 3 플랫폼 바이너리를 자동 빌드+업로드하지만, 사용자가 바이너리를 발견하고 설치하는 경로가 부족하다:

| 현황 | 문제 |
|------|------|
| GitHub Releases만 존재 | GitHub에 익숙하지 않은 사용자는 다운로드 경로를 찾기 어려움 |
| waiaas.ai에 다운로드 페이지 없음 | 웹사이트 방문자가 Desktop App 존재를 모를 수 있음 |
| macOS 설치가 수동 | `.dmg` 다운로드 → 마운트 → 드래그 설치. Homebrew 사용자에게는 불편 |

---

## 산출물

### 1. waiaas.ai 다운로드 페이지

| 항목 | 내용 |
|------|------|
| 경로 | `site/pages/download.md` → `/download` |
| OS 감지 | `navigator.platform` / `navigator.userAgentData`로 macOS/Windows/Linux 자동 감지 → 해당 OS 다운로드 버튼을 주요 CTA로 표시 |
| 다운로드 소스 | GitHub Releases API(`https://api.github.com/repos/{owner}/{repo}/releases/latest`) → 최신 버전 바이너리 URL 동적 로드 |
| 대체 설치법 | npm(`npx @waiaas/cli init`), Docker(`docker run waiaas/daemon`), Homebrew(`brew install --cask waiaas`) 안내 |
| 버전 표시 | 최신 버전 번호 + 릴리스 날짜 표시 |
| 정적 사이트 호환 | 클라이언트 사이드 JS로 GitHub API 호출. 빌드 타임 의존성 없음 |

### 2. Homebrew Cask Tap

| 항목 | 내용 |
|------|------|
| 저장소 | `homebrew-waiaas` (별도 GitHub repo) |
| 설치 명령 | `brew tap waiaas/waiaas && brew install --cask waiaas` 또는 `brew install --cask waiaas/waiaas/waiaas` |
| Cask formula | GitHub Releases에서 `.dmg` URL 참조. `sha256` 해시 검증. `appcast` 또는 `livecheck` 블록으로 자동 업데이트 감지 |
| CI 자동화 | Desktop 릴리스 시 `homebrew-waiaas` repo에 PR 자동 생성 (GitHub Actions에서 formula 업데이트) |
| 지원 아키텍처 | arm64(Apple Silicon) + x64(Intel) universal binary |

### 3. Desktop 설치 가이드

| 항목 | 내용 |
|------|------|
| 경로 | `docs/admin-manual/desktop-installation.md` |
| OS별 설치 | macOS(`.dmg` + Homebrew), Windows(`.msi`), Linux(`.AppImage` / `.deb`) 각각의 설치 절차 |
| 초기 설정 | Setup Wizard 5단계 안내 (마스터 비밀번호 → 네트워크 → 지갑 → Owner → 완료) |
| 트러블슈팅 | macOS Gatekeeper 경고 해제, Windows SmartScreen 허용, Linux 권한 설정 등 OS별 일반적 문제 대응 |
| 업그레이드 | 자동 업데이트(Ed25519 서명 검증) 동작 설명 + 수동 업그레이드 방법 |
| 기존 매뉴얼 연계 | `docs/admin-manual/` 9파일 체계에 10번째 파일로 추가. 목차(README) 업데이트 |

### 4. SUBMISSION_KIT.md 업데이트

기존 `site/distribution/SUBMISSION_KIT.md`의 체크리스트에 Desktop App 배포 채널 항목 추가.

---

## 파일/모듈 구조

```
site/
  pages/
    download.md                          # 다운로드 페이지 콘텐츠
  assets/
    download.js                          # OS 감지 + GitHub Releases API 클라이언트
    download.css                         # 다운로드 버튼 스타일

docs/
  admin-manual/
    desktop-installation.md              # Desktop App 설치 + 초기 설정 + 트러블슈팅 가이드

homebrew-waiaas/                         # 별도 GitHub repo
  Casks/
    waiaas.rb                            # Homebrew Cask formula

.github/workflows/
  homebrew-bump.yml                      # Desktop 릴리스 → homebrew-waiaas PR 자동 생성
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 다운로드 페이지 구현 | 클라이언트 사이드 JS + GitHub Releases API | 정적 사이트(site/build.mjs)에 서버 사이드 로직 추가 불필요. GitHub API rate limit(60 req/h unauthenticated)은 다운로드 페이지 트래픽에 충분. 캐시(5분 TTL) 적용 |
| 2 | Homebrew 배포 방식 | 별도 tap repo (`homebrew-waiaas`) | Homebrew Core에 등록하려면 인기도 기준 충족 필요. 자체 tap은 즉시 배포 가능하고 업데이트 주기를 직접 관리 |
| 3 | Formula 자동 업데이트 | GitHub Actions workflow_dispatch | Desktop 릴리스 워크플로우가 완료되면 `homebrew-waiaas` repo에 `repository_dispatch` 이벤트 전송 → formula PR 자동 생성. `sha256` 해시를 릴리스 아티팩트에서 계산 |

---

## E2E 검증 시나리오

**자동화 비율: 70%+ — `[HUMAN]` 3건, `[L1]` 8건**

### 다운로드 페이지

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | OS 자동 감지 | macOS UA로 접속 → macOS 다운로드 버튼이 주요 CTA assert. Windows/Linux도 동일하게 검증 | [L1] |
| 2 | GitHub Releases API 연동 | `/download` 로드 → 최신 버전 번호 + 바이너리 URL이 GitHub Releases와 일치 assert | [L1] |
| 3 | API 실패 시 폴백 | GitHub API 응답 실패(rate limit 등) → "GitHub Releases에서 직접 다운로드" 링크 표시 assert | [L1] |
| 4 | 대체 설치법 표시 | 페이지에 npm, Docker, Homebrew 설치 명령이 모두 표시 assert | [L1] |

### Homebrew Cask

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 5 | Cask formula 유효성 | `brew audit --cask waiaas` 통과 assert | [L1] |
| 6 | Cask 설치 → 앱 실행 | `brew install --cask waiaas` → `/Applications/WAIaaS.app` 존재 → 앱 실행 → health check 성공 assert | [HUMAN] |
| 7 | Formula 자동 업데이트 PR | Desktop 릴리스 → `homebrew-waiaas` repo에 PR 자동 생성 → 새 버전 + sha256 반영 assert | [HUMAN] |

### 설치 가이드

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 8 | OS별 설치 절차 완전성 | macOS/Windows/Linux 각 섹션에 설치 명령 또는 단계가 존재 assert | [L1] |
| 9 | Setup Wizard 안내 일치 | 가이드의 5단계 설명이 실제 Setup Wizard 컴포넌트 흐름과 일치 assert | [L1] |
| 10 | 트러블슈팅 항목 | Gatekeeper / SmartScreen / Linux 권한 최소 3개 트러블슈팅 항목 존재 assert | [L1] |

### 사용자 경험 (HUMAN)

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 11 | 다운로드 페이지 UX | 다운로드 페이지 방문 → 3초 이내에 자신의 OS용 다운로드 버튼을 식별할 수 있는지 확인. 대체 설치법이 명확하게 제시되는지 확인 | [HUMAN] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m33-02 (Tauri Desktop App) | GitHub Releases에 바이너리가 존재해야 다운로드 페이지와 Homebrew formula가 동작 |
| site/ (정적 사이트) | 다운로드 페이지를 기존 사이트 빌드 파이프라인에 추가 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | GitHub API rate limit | 비인증 요청 60 req/h. 트래픽 급증 시 다운로드 페이지 버전 표시 실패 | 클라이언트 캐시(5분 TTL) + API 실패 시 GitHub Releases 직접 링크 폴백 |
| 2 | macOS Gatekeeper 경고 | 코드 사이닝 누락 시 Homebrew 설치 후에도 "개발자를 확인할 수 없습니다" 표시 | m33-02에서 Apple Developer ID 사이닝 + notarize 적용. Homebrew Cask는 사이닝된 `.dmg` 참조 |
| 3 | Homebrew Core 등록 거부 | Core에 등록하려면 일정 수준의 인기도(GitHub stars, 다운로드 수) 필요 | 초기에는 자체 tap으로 배포. 인기도 달성 후 Core 등록 시도 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 3개 (다운로드 페이지 1 / Homebrew Cask + CI 자동화 1 / 설치 가이드 1) |
| 신규 파일 | 6-9개 (사이트 페이지 2-3개, 설치 가이드 1개, Homebrew formula 1개, CI 워크플로우 1-2개) |
| 테스트 | 11-15개 |

---

*생성일: 2026-03-28*
*선행: m33-02 (Tauri Desktop App — GitHub Releases CI 포함)*
