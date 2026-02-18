# 마일스톤 m17-01: WalletConnect Owner 승인

## 목표

WalletConnect v2를 통해 Owner가 Phantom/MetaMask 등 모바일 지갑 앱에서 APPROVAL/DELAY 트랜잭션을 직접 승인/거부할 수 있는 상태. Admin UI에서 QR 코드 스캔 1회로 연결하면 이후 자동 유지.

---

## 배경

### 현재 Owner 승인의 한계

v1.2에서 구현된 Owner 승인은 REST API 직접 호출 방식이다:

```
POST /v1/transactions/{id}/approve
Headers:
  X-Owner-Signature: <Ed25519 서명 또는 SIWE 서명>
  X-Owner-Message: <서명 메시지>
  X-Owner-Address: <Owner 주소>
```

Owner가 서명을 직접 생성해서 HTTP 헤더로 전달해야 하므로 **UX가 매우 불편**하다. v1.6 Telegram Bot의 `/approve` 명령어가 텍스트 기반 승인을 제공하지만, **지갑 서명이 아닌 chatId 기반 인증**이므로 보안 수준이 다르다.

### WalletConnect 도입 효과

| 비교 | REST API 직접 호출 | Telegram Bot | WalletConnect |
|------|-------------------|-------------|---------------|
| 인증 방식 | 지갑 서명 (Ed25519/SIWE) | chatId 기반 | 지갑 서명 (네이티브) |
| UX | 서명 직접 생성 필요 | `/approve` 명령어 | 지갑 앱 팝업에서 탭 |
| 보안 수준 | 높음 (암호학적 서명) | 중간 (chatId) | 높음 (암호학적 서명) |
| 설정 | 없음 | Bot Token + chatId | QR 스캔 1회 |

WalletConnect는 Telegram Bot의 편의성과 REST API의 보안 수준을 동시에 달성한다.

---

## 구현 대상

### 컴포넌트

| 컴포넌트 | 내용 |
|----------|------|
| WalletConnectService | @walletconnect/sign-client 기반 서비스. 세션 관리(페어링/연결/해제), 서명 요청 전송, 세션 자동 연장(만료 24시간 전 extend), 이벤트 처리(session_delete/session_expire). 데몬 시작 시 기존 세션 복구 |
| WalletConnectSessionStore | WC 세션 메타데이터 DB 저장. wc_sessions 테이블(wallet_id, topic, peer_metadata, namespaces, expiry, connected_at). 데몬 재시작 시 세션 복원용 |
| ApprovalRequestBridge | PENDING_APPROVAL/DELAYED 트랜잭션 발생 시 WalletConnect로 서명 요청을 자동 전송하는 브릿지. 트랜잭션 상태 변경 이벤트 구독 → WC signClient.request() 호출 → 서명 수신 → 기존 ownerAuth 검증 로직에 주입 |
| Admin WalletConnect UI | Admin > Settings > WalletConnect 섹션 확장. QR 코드 표시(pairing URI), 연결 상태 표시(연결됨/미연결/만료), 연결 해제 버튼, 연결된 지갑 정보(주소, 지갑 앱 이름, 체인) |
| Admin Pending Approvals UI | Admin > Dashboard 또는 별도 Approvals 페이지. PENDING_APPROVAL 트랜잭션 목록, WC 서명 요청 상태(전송됨/응답 대기/승인됨/거부됨), 수동 승인 fallback 버튼 |

### 세션 플로우

```
1. Admin > Settings > WalletConnect > [Connect Wallet] 클릭
2. 서버: signClient.connect() → pairing URI 생성 → QR 코드 표시
3. Owner: Phantom/MetaMask로 QR 스캔 → 세션 승인
4. 서버: session 저장 → 연결 상태 표시 → 자동 extend 스케줄링

--- 이후 승인 플로우 ---

5. AI 에이전트가 고액 트랜잭션 요청 → 정책 평가 → PENDING_APPROVAL
6. 서버: signClient.request({ method: "personal_sign", params: [승인 메시지] })
7. Owner: 지갑 앱에 서명 요청 팝업 → 승인/거부 탭
8. 서버: 서명 수신 → ownerAuth 검증 → 트랜잭션 실행/취소
```

### Namespace 구성

Owner 월렛의 체인에 따라 동적으로 구성:

```typescript
// EVM Owner
requiredNamespaces: {
  eip155: {
    methods: ["personal_sign"],
    chains: ["eip155:1", "eip155:11155111"],  // mainnet + sepolia
    events: ["accountsChanged"],
  }
}

// Solana Owner
requiredNamespaces: {
  solana: {
    methods: ["solana_signMessage"],
    chains: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],  // mainnet
    events: [],
  }
}
```

### 서명 요청 메시지 포맷

```
WAIaaS Transaction Approval

Transaction: {txId}
Type: {TRANSFER | TOKEN_TRANSFER | CONTRACT_CALL | ...}
From: {fromAddress}
To: {toAddress}
Amount: {amount} {symbol}
Network: {network}
Policy Tier: {APPROVAL | DELAY}

Approve this transaction by signing this message.
Timestamp: {ISO 8601}
Nonce: {nonce}
```

### config.toml

```toml
# WalletConnect 설정 (flat key — CLAUDE.md 중첩 금지 규칙 준수)
walletconnect_project_id = ""                          # Reown Cloud Project ID (필수)
walletconnect_auto_extend = true                       # 세션 자동 연장 (기본: true)
walletconnect_extend_before_expiry_hours = 24          # 만료 N시간 전에 extend (기본: 24)
walletconnect_request_timeout_sec = 300                # 서명 요청 타임아웃 (기본: 5분)
```

### 파일/모듈 구조

```
packages/daemon/src/services/
  walletconnect/
    sign-client.ts              # WalletConnectService (세션 관리 + 서명 요청)
    session-store.ts            # WalletConnectSessionStore (DB 저장/복원)
    approval-bridge.ts          # ApprovalRequestBridge (TX → WC 서명 요청)
    namespace-builder.ts        # Owner 체인 기반 동적 namespace 생성

packages/daemon/src/api/routes/
  walletconnect.ts              # WC 전용 REST 엔드포인트

packages/admin/src/components/
  walletconnect-connect.tsx     # QR 코드 + 연결 상태 UI
  pending-approvals.tsx         # 승인 대기 트랜잭션 목록 + WC 상태
```

### REST API

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | /v1/admin/walletconnect/pair | masterAuth | 페어링 URI 생성 (QR 코드용) |
| GET | /v1/admin/walletconnect/session | masterAuth | 현재 WC 세션 상태 조회 |
| DELETE | /v1/admin/walletconnect/session | masterAuth | WC 세션 연결 해제 |
| POST | /v1/admin/walletconnect/ping | masterAuth | 상대방 온라인 상태 확인 |

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | SDK 선택 | @walletconnect/sign-client | Node.js 서버에 최적. 브라우저 의존성 없음. WebSocket relay 직접 연결. universal-provider는 ethers/viem Provider 래핑이 불필요한 추상화 |
| 2 | 서명 메서드 | personal_sign (EVM) / solana_signMessage (Solana) | 트랜잭션 승인은 메시지 서명으로 충분. eth_sendTransaction은 불필요 (WAIaaS가 트랜잭션을 직접 빌드/제출) |
| 3 | 세션 자동 연장 | 만료 24시간 전 extend() | 7일 TTL 기본값. Owner가 QR 스캔 1회 후 영구 유지. extend() 실패 시 알림 발송 + Admin에서 재연결 안내 |
| 4 | Project ID 관리 | Admin Settings에서 설정 (config.toml `walletconnect_project_id` flat key + Admin Settings 런타임 오버라이드) | Reown Cloud에서 무료 생성. config.toml flat key로 초기값 설정, Admin Settings에서 런타임 변경 가능 |
| 5 | Telegram Bot fallback | WC 세션 미연결 시 Telegram 승인으로 자동 fallback | WC가 주 승인 채널, Telegram은 보조. 두 채널 모두 미설정 시 REST API 직접 호출만 가능 |
| 6 | 멀티체인 세션 | Owner 체인 기반 동적 requiredNamespaces | EVM Owner면 eip155만, Solana Owner면 solana만. 양쪽 Owner가 있으면 optionalNamespaces 활용. MetaMask(EVM 전용)도 연결 가능 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 페어링 URI 생성 -> QR 코드 데이터 반환 | POST /admin/walletconnect/pair -> uri 문자열 + QR data URL 반환 assert | [L0] |
| 2 | 세션 연결 -> DB 저장 + 상태 변경 | mock signClient approval() -> wc_sessions 테이블 기록 + GET session 상태 'connected' assert | [L0] |
| 3 | PENDING_APPROVAL 트랜잭션 -> WC 서명 요청 자동 전송 | mock 고액 TX → PENDING_APPROVAL → ApprovalRequestBridge → signClient.request() 호출 assert | [L0] |
| 4 | WC 서명 수신 -> ownerAuth 검증 -> 트랜잭션 승인 | mock signClient.request() resolve(signature) -> ownerAuth 검증 통과 -> TX 상태 EXECUTING assert | [L0] |
| 5 | WC 서명 거부 -> 트랜잭션 취소 | mock signClient.request() reject -> TX 상태 CANCELLED assert | [L0] |
| 6 | 세션 자동 연장 -> 만료 전 extend 호출 | mock 만료 24시간 전 → WalletConnectService.autoExtend() → signClient.extend() 호출 assert | [L0] |
| 7 | 세션 만료/삭제 -> 상태 정리 + 알림 | mock session_delete 이벤트 → wc_sessions 삭제 + 알림 발송 assert | [L0] |
| 8 | 데몬 재시작 -> 기존 세션 복원 | wc_sessions에 세션 존재 → 데몬 재시작 → signClient.session 복원 assert | [L0] |
| 9 | WC 미연결 + Telegram 설정 -> Telegram fallback | WC 세션 없음 + Telegram 설정 완료 → PENDING_APPROVAL → Telegram /approve 전송 assert | [L0] |
| 10 | WC 미연결 + Telegram 미설정 -> REST API only | 두 채널 모두 미설정 → PENDING_APPROVAL → 알림에 "REST API로 승인하세요" 안내 assert | [L0] |
| 11 | ping -> 온라인/오프라인 상태 확인 | POST /admin/walletconnect/ping → mock signClient.ping() 성공/실패 → 상태 반환 assert | [L0] |
| 12 | 연결 해제 -> 세션 삭제 + DB 정리 | DELETE /admin/walletconnect/session → signClient.disconnect() + wc_sessions 삭제 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| v1.6 (Telegram Bot) | Telegram Bot `/approve` 명령어가 fallback 채널로 동작. PENDING_APPROVAL 이벤트 구독 패턴 재사용 |
| v1.2 (인증 + 정책 엔진) | ownerAuth 미들웨어(Ed25519/SIWE 검증), APPROVAL/DELAY 정책 티어, 트랜잭션 승인/거부 API |
| v1.4.6 (멀티체인 월렛) | Owner 체인(Solana/EVM)에 따른 동적 namespace 구성 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | WalletConnect relay 서버 장애 | relay 서버(wss://relay.walletconnect.com) 다운 시 서명 요청 전달 불가 | Telegram Bot fallback. relay 장애 감지 시 자동으로 Telegram 채널로 전환 + 알림 |
| 2 | Project ID 필수 (외부 서비스 의존) | Reown Cloud 계정 생성 필요. 무료 티어 월 250만 요청 제한 | 승인 서명 요청만 사용하므로 요청량이 매우 적음 (하루 수십 건 수준). 무료 티어로 충분 |
| 3 | 지갑 앱 호환성 | 모든 지갑이 WalletConnect v2를 완벽히 지원하지 않을 수 있음 | Phantom(Solana+EVM), MetaMask(EVM) 등 주요 지갑 우선 지원. 미호환 지갑은 Telegram/REST fallback |
| 4 | 서명 요청 타임아웃 | Owner가 5분 내 응답하지 않으면 요청 만료 | 타임아웃 시 알림(Telegram/Discord) 재발송. config에서 타임아웃 조정 가능 (기본 5분, 최대 7일) |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 2개 (WalletConnectService + SessionStore + API 1 / Admin UI + ApprovalBridge + Telegram fallback 1) |
| 신규 파일 | 8-10개 |
| 수정 파일 | 4-6개 (Admin settings.tsx, 트랜잭션 이벤트 구독, config loader, DB 마이그레이션) |
| 테스트 | 12-16개 |
| DB 마이그레이션 | wc_sessions 테이블 추가 |

---

*생성일: 2026-02-15*
*선행: v1.6 (Telegram Bot + Kill Switch + Docker)*
*관련: WalletConnect v2 (@walletconnect/sign-client), Reown Cloud (https://cloud.reown.com)*
