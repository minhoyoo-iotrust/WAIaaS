# Requirements: WAIaaS v0.2 Self-Hosted Secure Wallet

**Defined:** 2026-02-05
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 중앙 서버 없이 사용자가 완전한 통제권을 보유하면서.

## v0.2 Requirements

이 마일스톤의 요구사항. 각 항목은 로드맵 페이즈에 매핑됨.

### Core Keystore (암호화 키 저장)

- [ ] **KEYS-01**: 에이전트 지갑 키를 AES-256-GCM + Argon2id로 암호화하여 로컬 파일에 저장 (`~/.waiaas/keystore/<agent-id>.json`)
- [ ] **KEYS-02**: 트랜잭션 서명 시 키를 sodium-native guarded memory에서만 복호화하고 서명 후 즉시 제로화
- [ ] **KEYS-03**: 지갑 잔액 및 주소 조회 가능
- [ ] **KEYS-04**: 암호화된 키스토어 백업 및 복원 기능

### Session Auth (세션 기반 인증 — Layer 1)

- [ ] **SESS-01**: Owner가 개인 지갑 서명(SIWS/SIWE)으로 세션 생성 승인
- [ ] **SESS-02**: 세션 토큰에 만료 시간, 누적 지출 한도, 단건 한도, 허용 작업 목록 내장
- [ ] **SESS-03**: 세션별 사용량(거래 수, 누적 금액) 실시간 추적
- [ ] **SESS-04**: Owner가 활성 세션을 즉시 폐기 가능
- [ ] **SESS-05**: 활성 세션 목록 조회 가능

### Time-Lock + Approval (시간 지연 + 승인 — Layer 2)

- [ ] **LOCK-01**: 거래를 금액 기준 4단계로 분류 (즉시/알림/대기/승인), 기준 금액 설정 가능
- [ ] **LOCK-02**: 대기(Delay) 등급: 거래 큐잉 → 쿨다운 대기 → 미취소 시 자동 실행, Owner 취소 가능
- [ ] **LOCK-03**: 승인(Approval) 등급: Owner 지갑 서명으로 명시적 승인 필요
- [ ] **LOCK-04**: 미승인 거래는 타임아웃 후 자동 만료/취소

### Monitoring + Kill Switch (모니터링 + 긴급 정지 — Layer 3)

- [ ] **NOTI-01**: 멀티 채널 알림 발송 (Telegram Bot, Discord Webhook, ntfy.sh Push)
- [ ] **NOTI-02**: 알림 채널 최소 2개 설정 필수, 전달 실패 시 폴백 채널로 재시도
- [ ] **NOTI-03**: Kill Switch 발동 시 모든 세션 취소 + 모든 대기 거래 취소 + 에이전트 정지
- [ ] **NOTI-04**: 자동 정지 규칙 엔진 (연속 실패, 비정상 시간, 한도 임계 등 설정 가능)
- [ ] **NOTI-05**: Kill Switch 복구 절차 (Owner 인증 후 재활성화)

### Owner Wallet Connection (소유자 지갑 연결)

- [ ] **OWNR-01**: 브라우저 익스텐션 지갑 연결 (Solana Wallet Adapter — Phantom, Backpack 등)
- [ ] **OWNR-02**: WalletConnect v2로 모바일 지갑 QR 연결
- [ ] **OWNR-03**: Owner 지갑 서명으로 세션 승인, 거래 승인, 설정 변경 인증

### Chain Abstraction (체인 추상화)

- [ ] **CHAIN-01**: ChainAdapter 인터페이스 정의 (buildTx, simulateTx, submitTx, getBalance, isValidAddress 등)
- [ ] **CHAIN-02**: Solana Adapter 완전 구현 (@solana/kit 3.x)
- [ ] **CHAIN-03**: EVM Adapter 인터페이스 준수 스텁 (향후 구현 준비)

### REST API (에이전트 접근 API)

- [ ] **API-01**: Hono 기반 로컬 HTTP 서버, 127.0.0.1 바인딩, 세션 토큰 + Owner 서명 인증 미들웨어
- [ ] **API-02**: 지갑 엔드포인트 (GET /v1/wallet/balance, /v1/wallet/address)
- [ ] **API-03**: 세션 엔드포인트 (POST/GET/DELETE /v1/sessions)
- [ ] **API-04**: 거래 엔드포인트 (POST /v1/transactions/send, GET /v1/transactions, GET /v1/transactions/pending)
- [ ] **API-05**: Owner 전용 엔드포인트 (POST /v1/owner/approve/:txId, /v1/owner/reject/:txId, /v1/owner/kill-switch)
- [ ] **API-06**: Zod 스키마 기반 OpenAPI 3.0 스펙 자동 생성

### CLI Daemon (CLI 데몬)

- [ ] **CLI-01**: `waiaas init` 대화형 초기 설정 (마스터 비밀번호, 알림 채널, Owner 주소)
- [ ] **CLI-02**: `waiaas start` 백그라운드 데몬 실행 + `waiaas stop` 우아한 종료
- [ ] **CLI-03**: `waiaas status` 데몬 상태 (가동 시간, 활성 세션, 최근 거래)
- [ ] **CLI-04**: npm 글로벌 패키지로 설치 가능 (`npm install -g @waiaas/daemon`)

### SDK (개발자 SDK)

- [ ] **SDK-01**: TypeScript SDK (@waiaas/sdk) — 완전한 타입 정의, 세션 토큰 관리, 자동 재시도
- [ ] **SDK-02**: Python SDK (waiaas) — async/await 지원, 동일 기능

### MCP Server (LLM 에이전트 통합)

- [ ] **MCP-01**: MCP Server 패키지 (@waiaas/mcp) — get_balance, send_token, get_address, list_transactions 도구
- [ ] **MCP-02**: Claude Desktop에서 MCP 연동 후 자연어 거래 가능

### Desktop App (데스크톱 애플리케이션)

- [ ] **DESK-01**: Tauri 기반 데스크톱 앱, 시스템 트레이 상주 (상태 아이콘: 초록/노랑/빨강)
- [ ] **DESK-02**: 대시보드 (잔액, 오늘 거래, 활성 세션) + 대기 중 거래 승인/거부 인터페이스
- [ ] **DESK-03**: macOS, Windows, Linux 빌드 배포
- [ ] **DESK-04**: 네이티브 OS 알림 + 자동 업데이트

### Docker (컨테이너 배포)

- [ ] **DOCK-01**: Docker 이미지 + docker-compose 템플릿 제공

### Interactive Telegram Bot (인터랙티브 텔레그램 봇)

- [ ] **TGBOT-01**: Telegram 인라인 키보드로 거래 승인/거부 (모바일에서 즉시 관리)
- [ ] **TGBOT-02**: 봇 명령어 (/sessions, /revoke, /killswitch, /status)

## Future Requirements (v0.3+)

이 마일스톤 이후로 연기. 추적만 하고 현재 로드맵에 미포함.

### Hardware Wallet Direct

- **HW-01**: Ledger USB 직접 연결 (WebHID/Node HID)
- **HW-02**: D'CENT SDK 연동

### Advanced Features

- **ADV-01**: Kubernetes Helm Chart
- **ADV-02**: ML 기반 이상 탐지
- **ADV-03**: EVM Adapter 완전 구현
- **ADV-04**: 자동 업데이트 서명 검증 (Tauri 코드 사인)

## Out of Scope

명시적으로 제외. 범위 확장 방지.

| Feature | Reason |
|---------|--------|
| SaaS 버전 (클라우드 호스팅) | Self-Hosted 우선, 클라우드는 추후 확장 |
| 온체인 스마트 컨트랙트 정책 (Squads 등) | 체인 무관 로컬 정책 엔진 우선 |
| 특정 체인 프로토콜 의존 기능 | Chain-Agnostic 원칙 |
| 모바일 앱 | Desktop/CLI 우선 |
| ML 기반 이상 탐지 | 규칙 기반으로 시작, ML은 v0.3+ |
| 하드웨어 지갑 직접 연결 | WalletConnect로 간접 연결, 직접 연결은 v0.3+ |
| 비즈니스 모델/가격 | 기술 구현 완료 후 별도 검토 |

## Traceability

로드맵 생성 시 채워짐.

| Requirement | Phase | Status |
|-------------|-------|--------|
| KEYS-01 | — | Pending |
| KEYS-02 | — | Pending |
| KEYS-03 | — | Pending |
| KEYS-04 | — | Pending |
| SESS-01 | — | Pending |
| SESS-02 | — | Pending |
| SESS-03 | — | Pending |
| SESS-04 | — | Pending |
| SESS-05 | — | Pending |
| LOCK-01 | — | Pending |
| LOCK-02 | — | Pending |
| LOCK-03 | — | Pending |
| LOCK-04 | — | Pending |
| NOTI-01 | — | Pending |
| NOTI-02 | — | Pending |
| NOTI-03 | — | Pending |
| NOTI-04 | — | Pending |
| NOTI-05 | — | Pending |
| OWNR-01 | — | Pending |
| OWNR-02 | — | Pending |
| OWNR-03 | — | Pending |
| CHAIN-01 | — | Pending |
| CHAIN-02 | — | Pending |
| CHAIN-03 | — | Pending |
| API-01 | — | Pending |
| API-02 | — | Pending |
| API-03 | — | Pending |
| API-04 | — | Pending |
| API-05 | — | Pending |
| API-06 | — | Pending |
| CLI-01 | — | Pending |
| CLI-02 | — | Pending |
| CLI-03 | — | Pending |
| CLI-04 | — | Pending |
| SDK-01 | — | Pending |
| SDK-02 | — | Pending |
| MCP-01 | — | Pending |
| MCP-02 | — | Pending |
| DESK-01 | — | Pending |
| DESK-02 | — | Pending |
| DESK-03 | — | Pending |
| DESK-04 | — | Pending |
| DOCK-01 | — | Pending |
| TGBOT-01 | — | Pending |
| TGBOT-02 | — | Pending |

**Coverage:**
- v0.2 requirements: 45 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 45

---
*Requirements defined: 2026-02-05*
*Last updated: 2026-02-05 after initial definition*
