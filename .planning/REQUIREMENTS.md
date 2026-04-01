# Requirements: WAIaaS v33.3 Desktop App 배포 채널 확장

**Defined:** 2026-04-01
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Download Page

- [x] **DL-01**: 사용자가 waiaas.ai/download 페이지에서 자신의 OS에 맞는 다운로드 버튼을 주요 CTA로 볼 수 있다
- [x] **DL-02**: `navigator.userAgentData.platform` + `navigator.userAgent` 폴백으로 macOS/Windows/Linux를 자동 감지한다
- [x] **DL-03**: GitHub Releases API에서 `desktop-v*` 태그를 필터링하여 최신 Desktop 릴리스 바이너리 URL을 동적으로 로드한다
- [x] **DL-04**: 다운로드 페이지에 최신 버전 번호와 릴리스 날짜가 표시된다
- [x] **DL-05**: GitHub API 실패 시 "GitHub Releases에서 직접 다운로드" 폴백 링크가 표시된다
- [x] **DL-06**: GitHub API 응답에 5분 TTL 클라이언트 캐시가 적용된다
- [x] **DL-07**: 다운로드 페이지에 npm, Docker 대체 설치법이 명시된다
- [x] **DL-08**: 사이트 네비게이션에 Download 링크가 추가되고 sitemap.xml에 /download/ URL이 포함된다

### Installation Guide

- [x] **IG-01**: `docs/admin-manual/desktop-installation.md`에 macOS `.dmg` 설치 절차가 문서화된다
- [x] **IG-02**: Windows `.msi` 설치 절차가 문서화된다
- [x] **IG-03**: Linux `.AppImage` / `.deb` 설치 절차가 문서화된다
- [x] **IG-04**: Setup Wizard 5단계(마스터 비밀번호 → 네트워크 → 지갑 → Owner → 완료) 안내가 포함된다
- [x] **IG-05**: macOS Gatekeeper 경고 해제(Sequoia Privacy & Security 방식), Windows SmartScreen 허용, Linux 권한 설정 트러블슈팅이 포함된다
- [x] **IG-06**: 자동 업데이트(Ed25519 서명 검증) 동작 설명과 수동 업그레이드 방법이 포함된다
- [x] **IG-07**: `docs/admin-manual/` README 목차에 desktop-installation.md가 추가된다

### Distribution

- [x] **DIST-01**: `site/distribution/SUBMISSION_KIT.md`에 Desktop App 배포 채널(다운로드 페이지, GitHub Releases) 항목이 추가된다

## Future Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Homebrew Cask

- **HB-01**: `homebrew-waiaas` 별도 GitHub repo에 Homebrew Cask formula가 존재한다
- **HB-02**: Cask formula가 `on_arm`/`on_intel` 블록으로 Apple Silicon과 Intel 아키텍처를 모두 지원한다
- **HB-03**: `brew tap waiaas/waiaas && brew install --cask waiaas`로 Desktop App이 설치된다
- **HB-04**: Cask formula에 SHA256 해시 검증이 포함된다
- **HB-05**: Cask formula에 `auto_updates true`가 선언되어 Tauri 자체 업데이트를 존중한다

### CI Automation

- **CI-01**: Desktop 릴리스 완료 시 `homebrew-waiaas` repo에 formula 업데이트 PR이 자동 생성된다
- **CI-02**: CI가 릴리스 아티팩트에서 SHA256 해시를 계산하여 formula에 반영한다
- **CI-03**: CI가 `repository_dispatch` 또는 동등한 메커니즘으로 cross-repo 자동화를 수행한다
- **CI-04**: 아티팩트 게시 완료 후 SHA256 계산이 실행되어 race condition이 방지된다

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Homebrew Cask Tap | 현재 규모에서 우선순위 낮음, 향후 별도 마일스톤에서 추가 가능 |
| CI Formula 자동 업데이트 | Homebrew Cask에 종속, 함께 제외 |
| Apple Developer ID 코드 사이닝 | 비용($99/yr)과 복잡도 대비 현재 규모에서 불필요. Gatekeeper 우회 가이드로 대체 |
| Windows 코드 사이닝 인증서 | 비용($200-500/yr)과 복잡도. SmartScreen 우회 가이드로 대체 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DL-01 | Phase 465 | Complete |
| DL-02 | Phase 465 | Complete |
| DL-03 | Phase 465 | Complete |
| DL-04 | Phase 465 | Complete |
| DL-05 | Phase 465 | Complete |
| DL-06 | Phase 465 | Complete |
| DL-07 | Phase 465 | Complete |
| DL-08 | Phase 466 | Complete |
| IG-01 | Phase 464 | Complete |
| IG-02 | Phase 464 | Complete |
| IG-03 | Phase 464 | Complete |
| IG-04 | Phase 464 | Complete |
| IG-05 | Phase 464 | Complete |
| IG-06 | Phase 464 | Complete |
| IG-07 | Phase 464 | Complete |
| DIST-01 | Phase 466 | Complete |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after roadmap creation*
