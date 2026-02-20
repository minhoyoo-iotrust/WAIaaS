# 마일스톤 m26: Wallet SDK 설계

## 목표

지갑 개발사(D'CENT 등)가 WAIaaS와 통합하기 위한 Wallet Signing SDK와 개방형 서명 프로토콜, 지갑 앱 알림 채널, Push Relay Server의 공통 설계를 확정한다. m26-01(Signing SDK 구현), m26-02(알림 채널 구현), m26-03(Push Relay Server)의 입력을 생산한다.

---

## 배경

### 현재 승인 채널의 한계

WAIaaS의 트랜잭션 승인은 현재 Telegram Bot `/approve` 명령(v1.6)과 REST API 직접 호출(v1.2)로 제한된다. 지갑 앱에서 직접 승인/거부할 수 있는 네이티브 경험이 없으며, 일반 알림도 메신저에 의존한다.

### m26 설계가 다루는 3가지 축

| 축 | 마일스톤 | 내용 |
|----|---------|------|
| 서명/승인 | m26-01 | Signing Protocol v1 + WAIaaS Wallet SDK + ntfy/Telegram 채널 |
| 알림 수신 | m26-02 | 지갑 앱으로 모든 알림 수신 + 승인/거부 완결 UX |
| 푸시 중계 | m26-03 | Push Relay Server — ntfy → 지갑사 푸시 서비스(Pushwoosh/FCM/APNs) 변환 |

---

## 설계 대상

### 1. WAIaaS Signing Protocol v1

세션 관리 없는 1회성 서명 프로토콜을 설계한다.

#### 1.1 설계 범위

| 항목 | 내용 |
|------|------|
| 프로토콜 | SignRequest / SignResponse JSON 스키마 (Zod) |
| 전송 방식 | 유니버셜 링크 + base64url 인코딩 |
| 응답 채널 | ntfy 직접 푸시 (메신저 불필요) + Telegram 메신저 중계 |
| 서명 검증 | 기존 ownerAuth (Ed25519/SIWE) 재사용 |
| 만료 | 요청별 expiresAt (기본 30분) |

#### 1.2 설계 산출물

- SignRequest, SignResponse Zod 스키마 정의
- 유니버셜 링크 URL 구조 (지갑 도메인 활용, WAIaaS 도메인 불필요)
- ntfy 요청/응답 토픽 네이밍 규칙
- Telegram 인라인 버튼 + 공유 인텐트 플로우
- 요청 만료 + 재시도 정책

---

### 2. @waiaas/wallet-sdk 패키지

지갑 개발사가 npm으로 설치하여 통합하는 SDK 패키지를 설계한다.

#### 2.1 설계 범위

| 항목 | 내용 |
|------|------|
| 패키지 | @waiaas/wallet-sdk (모노레포 packages/wallet-sdk/) |
| 공개 API | parseSignRequest, buildSignResponse, formatDisplayMessage, sendViaNtfy, sendViaTelegram, subscribeToRequests |
| 대상 환경 | React Native, Electron, Node.js |
| 지갑 등록 | WalletLinkConfig (유니버셜 링크, 딥링크 스키마) |

#### 2.2 설계 산출물

- SDK 공개 API 인터페이스 정의
- WalletLinkConfig 스키마
- 지갑 개발사 통합 가이드 구조
- 패키지 빌드/배포 설정

---

### 3. 데몬 측 컴포넌트

WAIaaS 데몬에서 서명 요청을 생성하고 응답을 처리하는 컴포넌트를 설계한다.

#### 3.1 설계 범위

| 컴포넌트 | 역할 |
|----------|------|
| SignRequestBuilder | PENDING_APPROVAL → SignRequest 생성 + 유니버셜 링크 URL |
| SignResponseHandler | SignResponse 파싱 + 검증 + 트랜잭션 실행 |
| NtfySigningChannel | ntfy publish/subscribe 서명 채널 |
| TelegramSigningChannel | Telegram 서명 채널 (기존 Bot 확장) |
| WalletLinkRegistry | 지갑별 링크 패턴 관리 |
| ApprovalChannelRouter | 승인 채널 우선순위 라우팅 |

#### 3.2 설계 산출물

- 각 컴포넌트 인터페이스 + 책임 정의
- ApprovalChannelRouter 라우팅 로직 (지갑별 설정 > 글로벌 fallback)
- Admin Settings signing_sdk 설정 항목 (SettingsService 기반, config.toml 불필요)
- wallets 테이블 owner_approval_method 컬럼 추가 설계

---

### 4. 지갑 앱 알림 채널

서명 요청뿐 아니라 **모든 알림**을 지갑 앱으로 수신하는 채널을 설계한다.

#### 4.1 설계 범위

| 항목 | 내용 |
|------|------|
| 대상 | 기존 25개 NotificationEventType 전체 |
| 토픽 분리 | 서명 요청 토픽 (m26-01) + 일반 알림 토픽 (m26-02) |
| SDK 확장 | subscribeToNotifications() — 알림 구독 API |
| Admin UI | 알림 채널 설정에 "Wallet App" 옵션 추가 |

#### 4.2 설계 산출물

- 알림 토픽 네이밍 규칙 (waiaas-notify-{walletId})
- 알림 페이로드 스키마 (WalletNotification)
- SDK subscribeToNotifications() 인터페이스
- 기존 INotificationChannel과의 통합 지점

---

### 5. Push Relay Server

ntfy 토픽을 구독하여 지갑 개발사의 기존 푸시 인프라(Pushwoosh, FCM, APNs 등)로 변환·전달하는 경량 서버를 설계한다. ntfy SDK를 앱에 직접 내장할 수 없는 지갑 개발사를 위한 중계 계층이다.

#### 5.1 배경

지갑 앱에 ntfy SSE 구독을 직접 내장하면 iOS 백그라운드 제약, 앱 아키텍처 변경 등 통합 부담이 크다. 대부분의 지갑 개발사는 이미 자체 푸시 인프라를 운영하고 있다 (예: D'CENT → Pushwoosh). Push Relay Server는 ntfy와 기존 푸시 서비스 사이의 브릿지 역할을 한다.

```
WAIaaS ──→ ntfy 토픽 ──→ Push Relay Server ──→ Pushwoosh/FCM/APNs ──→ 지갑 앱
                         (지갑사가 자체 운영)
```

#### 5.2 설계 범위

| 항목 | 내용 |
|------|------|
| 패키지 | @waiaas/push-relay (독립 배포 가능) |
| 코어 로직 | ntfy SSE 구독 → 메시지 파싱 → IPushProvider 전달 |
| 프로바이더 인터페이스 | IPushProvider — send(deviceToken, payload) 추상화 |
| 내장 프로바이더 | PushwooshProvider (D'CENT 기본), FcmProvider (범용) |
| 설정 | TOML config (ntfy 서버, 토픽 접두어, 푸시 프로바이더 인증) |
| 배포 | Dockerfile + docker-compose.yml + Railway/Fly.io 가이드 |
| 운영 주체 | 지갑 개발사 (WAIaaS 운영자가 아닌 지갑사 인프라) |

#### 5.3 IPushProvider 인터페이스

```
IPushProvider
  send(deviceTokens: string[], payload: PushPayload): Promise<void>
  validateConfig(): Promise<boolean>

내장 구현체:
  ├── PushwooshProvider  — POST /json/1.3/createMessage (D'CENT)
  ├── FcmProvider        — POST /v1/projects/{id}/messages:send (Firebase)
  └── (확장 가능: ApnsProvider, OneSignalProvider 등)
```

#### 5.4 설계 산출물

- IPushProvider 인터페이스 정의
- PushwooshProvider 구현 설계 (API Token + Application Code 인증)
- FcmProvider 구현 설계 (Service Account Key 인증)
- ntfy SSE 구독 → PushPayload 변환 매핑
- 디바이스 토큰 등록/관리 API (지갑 앱 → Relay Server)
- config.toml 스키마 ([relay], [relay.push], [relay.push.pushwoosh])
- Docker 배포 설정

---

## 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 35 (notification) | 지갑 앱 알림 채널 추가, 토픽 구조 |
| 37 (rest-api) | PUT /wallets/:id/owner 필드 확장 (approvalMethod) |
| 25 (sqlite) | wallets.owner_approval_method 컬럼 추가 |
| 67 (admin-ui) | Owner Settings > Approval Method 설정 UI |

---

## 성공 기준

1. Signing Protocol v1 스키마가 확정되어 m26-01에서 바로 구현 가능
2. @waiaas/wallet-sdk 패키지 구조와 공개 API가 확정됨
3. ntfy/Telegram 2가지 응답 채널의 E2E 플로우가 명확히 정의됨
4. 알림 채널 설계가 서명 채널과 일관된 토픽 구조를 공유
5. Push Relay Server의 IPushProvider 인터페이스가 확정되어 Pushwoosh/FCM 프로바이더를 바로 구현 가능
6. 지갑 개발사 통합에 필요한 작업 목록이 명확히 정의됨 (ntfy 직접 / Push Relay / 자체 구현 3가지 옵션)

---

*생성일: 2026-02-15*
*최종 수정: 2026-02-19 — 코드베이스 실측 반영 (config.toml → Admin Settings, 선행 마일스톤 현행화)*
*범위: 설계 마일스톤 — 코드 구현은 m26-01~m26-03에서 수행*
*선행: v2.0 (릴리스), m25-00 (DX 품질 개선) 완료*
*관련: WAIaaS Signing Protocol v1, ntfy, 유니버셜 링크*
