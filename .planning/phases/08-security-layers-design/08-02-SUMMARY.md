---
phase: 08-security-layers-design
plan: 02
subsystem: security
tags: [walletconnect, reown, ownerAuth, siws, siwe, owner-wallet, qr-code, kill-switch, approval-api]

# Dependency graph
requires:
  - phase: 08-security-layers-design
    plan: 01
    provides: DatabasePolicyEngine, APPROVAL 플로우, policies 스키마, approve/reject API 스펙
  - phase: 07-session-transaction-protocol-design
    provides: SIWS/SIWE owner-verifier 유틸리티, nonce LRU 캐시, sessionAuth 미들웨어 패턴
  - phase: 06-core-architecture-design
    provides: CORE-06 ownerAuth stub, config.toml 구조, Hono 미들웨어 체계
provides:
  - ownerAuth 미들웨어 8단계 검증 로직 (SIWS/SIWE 서명 기반)
  - WalletConnect v2 연결 프로토콜 (Tauri Desktop + CLI)
  - Owner 전용 API 8개 엔드포인트 Zod 스키마
  - owner_wallets 테이블 스키마
  - ownerSignaturePayload 구조 (요청별 서명 인증)
  - config.toml [walletconnect] 섹션
  - Relay 장애 대응 + CLI 직접 서명 대안
affects: [08-03-notification, 08-04-kill-switch, 09-01-api-spec, 09-03-tauri-desktop]

# Tech tracking
tech-stack:
  added: ["@reown/appkit", "@walletconnect/sign-client", "qrcode-terminal"]
  patterns: [ownerAuth per-request SIWS/SIWE signature, WalletConnect v2 QR dApp flow, ownerSignaturePayload base64url encoding, CLI QR ASCII fallback, master-password Kill Switch auth]

key-files:
  created: [.planning/deliverables/34-owner-wallet-connection.md]
  modified: []

key-decisions:
  - "WalletConnect v2 QR이 Tauri WebView에서 유일한 실용적 Owner 연결 경로 (브라우저 익스텐션 미지원)"
  - "ownerAuth는 요청별 서명(per-request signature) -- JWT 세션이 아닌 매 요청마다 SIWS/SIWE 서명"
  - "ownerSignaturePayload: base64url JSON (chain, address, action, nonce, timestamp, message, signature)"
  - "Owner 서명 유효 기간: 5분 (timestamp + nonce 일회성 + action 바인딩 3중 방어)"
  - "owner_wallets 단일 레코드 (v0.2 다중 Owner 미지원)"
  - "POST /v1/owner/connect는 ownerAuth 제외 (초기 연결 -- localhost 보안으로 보호)"
  - "Kill Switch CLI 발동: WalletConnect 불필요, 마스터 패스워드 인증"
  - "Relay 장애 시 fail-safe: APPROVAL -> EXPIRED (안전 방향), DELAY -> 자동 실행 (정책 허가 완료)"
  - "CLI waiaas owner connect: @walletconnect/sign-client + qrcode-terminal (AppKit 불필요)"
  - "config.toml [walletconnect].project_id: 사용자 직접 발급, 기본값 없음"

patterns-established:
  - "ownerAuth 8단계 검증: 헤더 -> timestamp -> nonce -> SIWS/SIWE -> owner_wallets -> action -> context -> next"
  - "요청별 서명 인증: sessionAuth(JWT 상태 기반) vs ownerAuth(서명 무상태) 이원 체계"
  - "WalletConnect v2 dApp 패턴: AppKit(Tauri) / SignClient(CLI) -> Relay -> Mobile Wallet"
  - "Relay 장애 CLI 대안: nonce 발급 -> 오프라인 서명 -> ownerSignaturePayload 수동 구성"

# Metrics
duration: 7min
completed: 2026-02-05
---

# Phase 8 Plan 02: Owner 지갑 연결 프로토콜 설계 Summary

**WalletConnect v2 QR 연결 + ownerAuth 8단계 미들웨어 + Owner API 8개 엔드포인트 + owner_wallets 스키마 + Relay 장애 CLI 대안 전체 설계**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-05T11:36:23Z
- **Completed:** 2026-02-05T11:43:02Z
- **Tasks:** 2
- **Files created:** 1

## Accomplishments
- WalletConnect v2 아키텍처 설계 (dApp 역할, Relay 중계, E2E 암호화, 네임스페이스/메서드)
- Tauri Desktop 연결 플로우 Mermaid 시퀀스 다이어그램 (QR 생성 -> 스캔 -> 페어링 -> 세션 수립 -> Owner 등록)
- Reown AppKit 초기화 코드 패턴 (Tauri WebView 내)
- CLI `waiaas owner connect` 대안 경로 (@walletconnect/sign-client + qrcode-terminal)
- ownerAuth 미들웨어 8단계 검증 로직 코드 수준 설계 (SESS-PROTO verifySIWS/verifySIWE 재사용)
- ownerSignaturePayload 구조 + Zod 스키마 + Owner 서명 메시지 포맷 정의
- Owner 전용 API 8개 엔드포인트 Zod 스키마 (connect, disconnect, approve, reject, kill-switch, pending-approvals, policies PUT/POST)
- owner_wallets 테이블 Drizzle ORM + SQL DDL + 단일 Owner 강제 로직
- WalletConnect 세션 수명주기 상태 다이어그램 (Mermaid stateDiagram)
- Relay 장애 대응 설계 (CLI 직접 서명 대안, Kill Switch 마스터 패스워드 인증)
- 보안 고려사항 5개 항목 (projectId 유출, 재생 공격 방지, Owner 사칭, 다중 디바이스, Tauri CSP)
- config.toml [walletconnect] 섹션 정의 + Zod ConfigSchema 확장

## Task Commits

Each task was committed atomically:

1. **Task 1: WalletConnect v2 연결 프로토콜 + ownerAuth 미들웨어 설계** - `ef9b034` (feat)
2. **Task 2: Owner 전용 API 엔드포인트 + 세션 관리 + 보안 설계** - `2f07b77` (feat)

## Files Created/Modified
- `.planning/deliverables/34-owner-wallet-connection.md` - Owner 지갑 연결 프로토콜 전체 설계 (9개 섹션, 1501 lines, OWNR-CONN)

## Decisions Made
1. **WalletConnect v2 QR 유일 경로**: Tauri WebView가 브라우저 익스텐션을 지원하지 않으므로 QR 방식만 실용적
2. **요청별 서명 인증**: ownerAuth는 JWT 세션이 아닌 매 요청마다 SIWS/SIWE 서명 검증 (무상태, 탈취 불가)
3. **ownerSignaturePayload base64url**: chain, address, action, nonce, timestamp, message, signature를 단일 토큰으로 인코딩
4. **Owner 서명 3중 방어**: nonce 일회성 + timestamp 5분 + action 바인딩
5. **단일 Owner 강제**: v0.2는 owner_wallets에 최대 1개 레코드 (409 OWNER_ALREADY_CONNECTED)
6. **초기 연결 인증 제외**: POST /v1/owner/connect는 ownerAuth 미적용 (아직 서명 불가). localhost 보안으로 보호
7. **Kill Switch CLI 대안**: WalletConnect 불필요한 마스터 패스워드 인증 경로 (/v1/admin/kill-switch)
8. **Relay fail-safe**: APPROVAL은 EXPIRED, DELAY는 정책 승인 완료이므로 자동 실행 (안전 방향)
9. **projectId 사용자 발급**: config.toml 기본값 없음. waiaas init 시 Reown Cloud 안내 메시지
10. **CLI SignClient 직접 사용**: CLI에서는 AppKit 불필요, @walletconnect/sign-client로 경량 연결

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required for design docs.

## Next Phase Readiness
- ownerAuth 미들웨어 -> 08-03 (알림 아키텍처) Owner 알림 채널 관리 API 인증에 재사용
- Kill Switch API 스펙 -> 08-04 (Kill Switch 프로토콜)에서 캐스케이드 로직 상세화
- owner_wallets 스키마 -> 09-01 (REST API 전체 스펙)에서 OpenAPI 정의 포함
- Tauri AppKit 통합 -> 09-03 (Tauri Desktop 앱)에서 WebView CSP + 라우팅 설계

---
*Phase: 08-security-layers-design*
*Completed: 2026-02-05*
