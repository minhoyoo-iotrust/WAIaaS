---
phase: 09-integration-client-interface-design
plan: 03
subsystem: desktop-app
tags: [tauri, desktop, sidecar, system-tray, walletconnect, cross-platform]
requires:
  - "09-01 (API-SPEC: REST API 전체 스펙 -- Owner API 17개 엔드포인트)"
  - "08-02 (OWNR-CONN: WalletConnect v2 QR 연결 플로우)"
  - "08-04 (KILL-AUTO-EVM: Kill Switch 상태 머신 + UI)"
  - "06-04 (CORE-05: 데몬 라이프사이클 + Sidecar 대상)"
  - "06-01 (CORE-01: 모노레포 packages/desktop 위치)"
provides:
  - "TAURI-DESK: Tauri 2 Desktop 앱 전체 아키텍처 (Sidecar + IPC + 8 UI screens)"
  - "Phase 9 Success Criteria #4: Tauri Desktop 앱 아키텍처가 설계됨"
affects:
  - "09-04 (Telegram Bot + Docker: Desktop과 병행 관리 인터페이스)"
  - "v0.3 구현: SEA 바이너리 빌드, native addon 크로스 컴파일 검증"
tech-stack:
  added:
    - "@tauri-apps/api ^2.0.0"
    - "@tauri-apps/plugin-shell ^2.0.0"
    - "@tauri-apps/plugin-notification ^2.0.0"
    - "@tauri-apps/plugin-updater ^2.0.0"
    - "@tauri-apps/plugin-process ^2.0.0"
    - "react ^18.3.0"
    - "react-router-dom ^7.0.0"
    - "tailwindcss ^4.0.0"
    - "tauri 2.x (Rust)"
    - "reqwest 0.12 (Rust)"
  patterns:
    - "Sidecar 하이브리드 통신 (IPC for lifecycle, HTTP localhost for API)"
    - "시스템 트레이 3색 상태 아이콘 + 동적 메뉴"
    - "Node.js SEA 단일 바이너리 번들링"
    - "5초 주기 health check + 크래시 자동 재시작 (최대 3회)"
    - "Tauri capabilities 최소 권한 원칙"
    - "GitHub Actions 매트릭스 빌드 (4 targets)"
key-files:
  created:
    - ".planning/deliverables/39-tauri-desktop-architecture.md"
  modified: []
key-decisions:
  - "Tauri IPC는 데몬 라이프사이클 전용, API 호출은 HTTP localhost (@waiaas/sdk 재사용)"
  - "Sidecar 바이너리: Node.js SEA (Single Executable Application), target_triple별 빌드"
  - "시스템 트레이 3색: 초록(NORMAL) / 노랑(WARNING) / 빨강(CRITICAL)"
  - "React 18 + TailwindCSS 4 + react-router-dom 7 프론트엔드 스택"
  - "WalletConnect projectId는 데몬 설정 API로 조회 (하드코딩 금지)"
  - "자동 업데이트: GitHub Releases (v0.2), CrabNebula Cloud (v0.3 이후)"
  - "Sidecar 크래시 감지: 2회 연속 health check 실패 시 Crashed 판정"
  - "Setup Wizard 5-step: 패스워드 -> 체인/에이전트 -> Owner 연결 -> 알림 -> 완료"
  - "CSP: connect-src에 127.0.0.1:3100 + wss://relay.walletconnect.com 허용"
  - "마스터 패스워드: WebView 메모리에만 존재, 전송 후 즉시 null 처리"
duration: "~8min"
completed: "2026-02-05"
---

# Phase 9 Plan 03: Tauri Desktop 앱 아키텍처 설계 Summary

**One-liner:** Tauri 2 + Sidecar 하이브리드 통신 아키텍처, 시스템 트레이 3색 상태, 8개 UI 화면, WalletConnect QR 서명 플로우, OS 알림/자동 업데이트/4-target 크로스 플랫폼 빌드를 구현 가능 수준으로 설계

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~8 minutes |
| Started | 2026-02-05T12:56:34Z |
| Completed | 2026-02-05T13:04:21Z |
| Tasks | 2/2 |
| Files created | 1 |
| Lines written | 1856 |

## Accomplishments

### Task 1: Tauri 2 앱 아키텍처 + Sidecar + 시스템 트레이 설계
- Rust Backend + WebView Frontend + Sidecar Daemon 3계층 아키텍처 다이어그램
- 하이브리드 통신 모델: Tauri IPC (라이프사이클 6 커맨드) + HTTP localhost (API, SDK 재사용)
- Sidecar Manager: DaemonState 6-state 상태 머신 (Stopped/Starting/Running/Stopping/Crashed/Error)
- Sidecar 라이프사이클: 자동 시작, graceful shutdown (POST /v1/admin/shutdown -> SIGTERM -> SIGKILL)
- 크래시 감지: 5초 주기 health check, 2회 연속 실패 시 Crashed, 자동 재시작 최대 3회
- 시스템 트레이 3색 아이콘 (초록/노랑/빨강) + 7개 메뉴 항목 (동적 업데이트)
- 프로젝트 구조 packages/desktop/ 파일 수준 정의 (Rust 4파일 + React 20+ 파일)
- package.json + Cargo.toml 의존성 정의

### Task 2: UI 화면별 플로우 + WalletConnect QR + OS 알림 + 자동 업데이트 + 크로스 플랫폼 빌드
- UI 8개 화면 상세 설계 (레이아웃, 데이터 소스, 사용자 동작, API 호출)
  - Dashboard: 3카드 + 최근 거래 + 시스템 상태 (5초 폴링)
  - Approvals: TxCard + Approve/Reject 서명 시퀀스 다이어그램
  - Sessions: CRUD + Create Session 모달 (4-step)
  - Agents: 목록 + 상세 (거래/세션/정책)
  - Settings: 알림/자동정지/정책 편집
  - Setup Wizard: 5-step 초기 설정 (패스워드 -> 체인 -> QR -> 알림 -> 완료)
  - Owner Connect: QR 코드 + 연결 상태 + 시퀀스 다이어그램
  - Kill Switch: NORMAL/ACTIVATED 상태별 UI + 이중 인증 복구
- WalletConnect QR: @reown/appkit 초기화 + projectId API 조회 + per-request signature 패턴
- OS 알림: 6개 트리거 (새 승인, Kill Switch, 에이전트 정지, 세션 만료, 데몬 크래시) + 변경 감지 로직
- 자동 업데이트: GitHub Releases + Tauri updater pubkey 서명 검증 + 24시간 주기 확인
- 크로스 플랫폼: 4 targets (macOS arm64/x64, Windows x64, Linux x64) + GitHub Actions 매트릭스 CI/CD
- 코드 서명: macOS (Apple Developer + Notarization), Windows (Authenticode), Linux (AppImage)
- 보안: CSP, Tauri capabilities (최소 권한), 마스터 패스워드 메모리 관리, Sidecar 무결성

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Tauri 2 앱 아키텍처 + Sidecar + 시스템 트레이 | 498bdee | 39-tauri-desktop-architecture.md (sections 1-6, 739 lines) |
| 2 | UI 플로우 + WalletConnect + 알림 + 업데이트 + 빌드 | 05046d0 | 39-tauri-desktop-architecture.md (sections 7-13, +1117 lines) |

## Files Created

| File | Lines | Description |
|------|-------|-------------|
| `.planning/deliverables/39-tauri-desktop-architecture.md` | 1856 | Tauri Desktop 앱 전체 아키텍처 설계 (TAURI-DESK) |

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Tauri IPC는 데몬 라이프사이클 전용 | HTTP localhost로는 데몬 사망 시 상태 파악 불가. 프로세스 관리는 Rust에서 직접 |
| 2 | API 호출은 HTTP localhost (@waiaas/sdk 재사용) | IPC 프록시 구현 회피, SDK 타입/인증 로직 중복 방지 |
| 3 | Node.js SEA (Single Executable Application) 바이너리 | Node.js 22 내장, 별도 패키지 불필요. native addon 호환성은 v0.3 구현 시 검증 |
| 4 | 시스템 트레이 3색 (초록/노랑/빨강) | Kill Switch 상태를 즉시 인지, 데몬 건강 상태 시각화 |
| 5 | React 18 + TailwindCSS 4 프론트엔드 스택 | Tauri 2 + React 조합이 커뮤니티 지원 최대, TailwindCSS 유틸리티 우선 |
| 6 | WalletConnect projectId는 데몬 설정 API로 조회 | 하드코딩 금지 원칙, config.toml 단일 소스 |
| 7 | GitHub Releases 기반 자동 업데이트 (v0.2) | CrabNebula는 v0.3 이후 검토, GitHub Releases가 최소 설정 |
| 8 | Sidecar 크래시: 2회 연속 health fail -> Crashed | 네트워크 일시 오류에 대한 관대한 판정, 3회 자동 재시작 상한 |
| 9 | Setup Wizard 5-step 설계 | 첫 실행 사용자 경험, CLI waiaas init 동등 기능을 GUI로 제공 |
| 10 | CSP connect-src에 WalletConnect Relay 허용 | E2E 암호화 연결이므로 보안 위험 없음, QR 연결에 필수 |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- **09-04 (Telegram Bot + Docker):** Desktop과 Telegram Bot은 병행 관리 인터페이스. Dashboard API, Approval API 동일 참조
- **v0.3 구현:** SEA 바이너리 빌드, sodium-native/better-sqlite3 크로스 컴파일 검증 필요
- **v0.3 구현:** CrabNebula Cloud 자동 업데이트 마이그레이션 검토

**Blockers:** None
**Concerns:** native addon (sodium-native, better-sqlite3)의 Node.js SEA 호환성은 v0.3 구현 시 검증 필요
