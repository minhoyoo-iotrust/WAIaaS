# v1.6-046: Admin UI Settings 페이지 재구조화 — 관련 메뉴로 설정 재배치

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** v1.6
- **상태:** OPEN
- **등록일:** 2026-02-17

## 현상

Settings 페이지에 10개 섹션이 집중되어 있어 사용자가 원하는 설정을 찾기 어렵고, 이미 전용 페이지가 있는 기능의 설정이 Settings에 별도로 존재하여 혼란 유발.

또한 Telegram Users 페이지가 Notifications와 분리되어 있어 알림 관련 기능이 3곳(Settings, Notifications, Telegram)에 분산.

### 현재 구조

**Nav 메뉴**: Dashboard / Wallets / Sessions / Policies / Notifications / Telegram / WalletConnect / Settings

**Settings 페이지 (10개 섹션)**:
1. Notifications — 채널 자격증명, enabled, locale, rate_limit
2. RPC Endpoints — Solana/EVM 네트워크 RPC URL
3. Security Parameters — 세션 TTL, rate limit, 정책 기본값
4. WalletConnect — Project ID, relay URL
5. Daemon — log_level
6. Display — currency
7. API Keys — Action Provider 키 관리
8. AutoStop Rules — 자동 보호 규칙
9. Balance Monitoring — 잔액 모니터링 주기/임계값
10. Kill Switch — 긴급 정지

## 수정 방안

### 1. Notifications 설정 → Notifications 페이지로 이동

Notifications 페이지를 탭 구조로 개편:

| 탭 | 내용 | 출처 |
|----|------|------|
| **Channels** | 채널 상태 + 테스트 발송 + 채널 설정 (bot token, webhook URL 등) | 기존 Notifications 상단 + Settings > Notifications |
| **Logs** | 발송 로그 테이블 | 기존 Notifications 하단 |
| **Telegram Users** | Bot 사용자 승인/역할 관리 | 기존 Telegram Users 페이지 |

### 2. WalletConnect 설정 → WalletConnect 페이지로 이동

WalletConnect 페이지 상단에 설정 섹션 추가:
- Project ID, Relay URL 설정
- 기존 세션 테이블은 하단에 유지

### 3. Telegram 메뉴 제거

Notifications 페이지에 통합되므로 Nav에서 제거.

### 4. Settings 페이지에 남는 섹션 (7개)

| 섹션 | 이유 |
|------|------|
| RPC Endpoints | 전용 페이지 없음, 인프라 설정 |
| Security Parameters | 전용 페이지 없음, 범용 보안 |
| Daemon | 전용 페이지 없음, 시스템 설정 |
| Display | 전용 페이지 없음, UI 설정 |
| API Keys | 전용 페이지 없음, 서비스 키 |
| AutoStop Rules | 전용 페이지 없음, 보호 규칙 |
| Balance Monitoring | 전용 페이지 없음, 모니터링 |
| Kill Switch | 긴급 정지 (Settings 유지) |

## 변경 전후 비교

### Nav 메뉴

| Before (8개) | After (7개) |
|-------------|-------------|
| Dashboard | Dashboard |
| Wallets | Wallets |
| Sessions | Sessions |
| Policies | Policies |
| Notifications | Notifications (탭 3개) |
| ~~Telegram~~ | *(제거 — Notifications에 통합)* |
| WalletConnect | WalletConnect (설정 + 세션) |
| Settings | Settings (7개 섹션) |

### 사용자 시나리오 개선

| 시나리오 | Before | After |
|----------|--------|-------|
| Telegram bot token 설정 | Settings > Notifications | Notifications > Channels |
| Telegram 사용자 승인 | Telegram 페이지 | Notifications > Telegram Users |
| WC Project ID 설정 | Settings > WalletConnect | WalletConnect 페이지 상단 |
| 알림 로그 확인 | Notifications 페이지 | Notifications > Logs |

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `packages/admin/src/pages/notifications.tsx` | 탭 구조 추가 (Channels/Logs/Telegram Users), 설정 폼 통합 |
| `packages/admin/src/pages/telegram-users.tsx` | Notifications에 통합 후 제거 (또는 export로 임베드) |
| `packages/admin/src/pages/walletconnect.tsx` | 상단에 설정 섹션 추가 |
| `packages/admin/src/pages/settings.tsx` | Notifications, WalletConnect 섹션 제거 |
| `packages/admin/src/components/layout.tsx` | Nav에서 Telegram 항목 제거 |

## 테스트

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| T-046-01 | Notifications 페이지에 Channels/Logs/Telegram Users 탭 렌더링 | 3개 탭 전환 정상 동작 |
| T-046-02 | Channels 탭에서 bot token 설정 변경 + Save | 설정 저장 성공, hot-reload 반영 |
| T-046-03 | Channels 탭에서 Test Notification 클릭 | 테스트 결과 정상 표시 |
| T-046-04 | Telegram Users 탭에서 사용자 승인/역할변경/삭제 | 기존 기능 동일 동작 |
| T-046-05 | WalletConnect 페이지 상단에 Project ID 설정 폼 렌더링 | 설정 입력 + Save 정상 |
| T-046-06 | Settings 페이지에 Notifications/WalletConnect 섹션 없음 | 7개 섹션만 렌더링 |
| T-046-07 | Nav 메뉴에 Telegram 항목 없음 | 7개 메뉴 항목 |
| T-046-08 | `/telegram-users` 직접 접근 시 | Notifications 페이지로 리다이렉트 또는 404 |

## 관련 이슈

- #041: Admin UI Owner 주소 설정 폼 미구현
- #043: WalletConnect 미설정 시 404 + "알 수 없는 에러"
- #044: 알림 자격증명 config.toml/Admin Settings 중복
- #045: WalletConnect hot-reload 미지원

→ 향후 Admin DX 마일스톤에서 #041~#046을 일괄 처리 가능.
