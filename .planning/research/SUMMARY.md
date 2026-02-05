# WAIaaS v0.2 연구 요약

**프로젝트:** WAIaaS v0.2 - Self-Hosted Secure Wallet for AI Agents
**도메인:** 로컬 자가 호스팅 지갑 데몬, 세션 기반 인증, 멀티 레이어 보안
**연구 완료일:** 2026-02-05
**전체 신뢰도:** HIGH

---

## Executive Summary (개요)

WAIaaS v0.2는 클라우드 기반 WaaS(v0.1)에서 자가 호스팅 로컬 데몬으로 전환한다. AWS KMS, Nitro Enclave, PostgreSQL/Redis 등 모든 클라우드 의존성을 제거하고, 사용자 로컬 머신에서 단일 프로세스로 실행되는 경량 지갑 데몬을 구축한다. 핵심 보안 원칙은 "데몬 자체가 보안 경계"라는 점이다.

전문가들은 자가 호스팅 지갑 데몬을 다음과 같이 구축한다: (1) Tauri 2.x 데스크톱 앱이 Node.js 사이드카 데몬을 래핑한다. (2) 에이전트 키는 AES-256-GCM + Argon2id로 암호화되어 로컬에 저장된다. (3) Hono 경량 HTTP 서버가 `127.0.0.1`에 바인딩되어 에이전트 API를 제공한다. (4) SQLite(WAL 모드)가 트랜잭션 큐와 세션 상태를 관리한다. (5) 3-레이어 보안 모델(Session Auth → Time-Lock → Monitoring + Kill Switch)이 에이전트의 자율성과 소유자 통제를 균형잡는다.

핵심 위험은 키 관리(AES-256-GCM nonce 재사용, Argon2id 약한 파라미터), 로컬 서버 공격(0.0.0.0 Day, DNS rebinding), TOCTOU 경쟁 조건(pending queue 예산 차감 원자성), 알림 실패(단일 채널, rate limit)이다. 이를 완화하기 위해: (1) `sodium-native`로 guarded memory 사용, (2) localhost 바인딩 + Host header 검증, (3) SQLite 트랜잭션으로 원자적 예산 차감, (4) 최소 2개 알림 채널 요구 및 delivery confirmation 추적, (5) 모든 엔드포인트에 세션 토큰 인증 필수화.

---

## Key Findings (핵심 발견 사항)

### Recommended Tech Stack (권장 기술 스택)

v0.2는 클라우드 서버급 인프라(PostgreSQL, Redis, AWS KMS)를 임베디드 경량 대안으로 교체한다. 7개 기술 결정이 이루어졌다: 데스크톱 프레임워크, 로컬 API 서버, 임베디드 DB, 키 암호화, 알림 SDK, 지갑 연결 라이브러리, 세션 토큰 구현.

**핵심 기술:**

- **Tauri 2.x** (Desktop App) — Electron 대비 95% 작은 번들 크기(3-10 MB vs 85-120 MB), 85% 낮은 메모리(30-40 MB vs 200-300 MB idle). 기본 deny 보안 모델(capability-based). Node.js sidecar 공식 지원. 24/7 상주 데몬에 적합.

- **Hono 4.x** (Local API Server) — Fastify 대비 더 가벼움(14 KB vs 2 MB+), Node/Bun 멀티 런타임 지원. `@hono/zod-openapi`로 v0.1의 Zod SSoT 패턴 유지. 로컬 데몬은 76K req/s가 필요없음(Hono의 25K req/s on Node로도 충분).

- **Drizzle ORM 0.45.1 + better-sqlite3 12.x** (Embedded DB) — Prisma의 Rust 엔진 없이 타입 안전성 확보. 7.4 KB 번들. SQL 투명성("If you know SQL, you know Drizzle"). WAL 모드로 동시 읽기 지원. 단일 사용자 데몬에 최적.

- **node:crypto (AES-256-GCM) + argon2 (Argon2id)** (Key Encryption) — 하드웨어 가속 AES-GCM(OpenSSL 소프트웨어 폴백 있음). libsodium의 AES-GCM은 AES-NI 하드웨어 필수인 반면, node:crypto는 모든 환경에서 작동. Argon2id는 메모리 하드 KDF. 설치된 환경에 다양성을 고려해 WASM 오버헤드 없는 네이티브 선택.

- **grammY (Telegram) + native fetch (Discord) + ntfy.sh (Push)** (Notifications) — grammY는 TypeScript-first 봇 프레임워크(1.2M weekly downloads). Discord는 단순 HTTP POST(라이브러리 불필요). ntfy.sh는 완전 자가 호스팅 가능한 오픈소스 푸시 알림 서비스. 벤더 종속성 제거.

- **@solana/wallet-adapter + @walletconnect/web3wallet + @ledgerhq/hw-transport-webhid** (Wallet Connection) — 브라우저 확장(Phantom, Backpack), 모바일 QR(WalletConnect v2), 하드웨어 지갑(Ledger via WebHID/Node HID) 모두 지원. Tauri WebView + React에서 wallet-adapter 통합.

- **jose (JWT HS256/ES256)** (Session Tokens) — 표준 JWT 사용으로 에이전트 SDK 상호운용성 확보. 제로 의존성, 크로스 런타임(Node, Bun, Deno). HS256으로 데몬 발행 세션 토큰, ES256으로 소유자 서명 승인.

**v0.1에서 유지:**
- TypeScript 5.x, Node.js 22.x LTS, @solana/kit 3.x, Zod 3.x, pnpm 9.x, Turborepo 2.x, Vitest, ESLint 9.x + Prettier 3.x

**무엇을 추가하지 않을까:**
- Electron (85+ MB, 250 MB RAM)
- Fastify (Node 전용, Hono가 Bun 호환성 제공)
- Prisma (Rust 엔진 Cold start 지연)
- libsodium-wrappers-sumo (AES-GCM 하드웨어 전용 제약)
- discord.js (풀 봇 프레임워크 불필요, 웹훅만 사용)
- jsonwebtoken (레거시, 알려진 취약점. jose가 현대적 대안)
- ioredis (Redis 서버 없음, lru-cache로 대체)

---

### Must-Have Features (필수 기능)

자가 호스팅 지갑 데몬의 표준 기대 기능. 누락 시 제품 불완전.

1. **Session Token System (TS-1)** — 소유자 지갑 서명으로 임시, 범위 제한된 세션 토큰 발급. 만료 시간, 누적 지출 한도, 거래당 한도, 허용 작업 목록이 토큰에 내장. 즉각 취소 가능. v0.1의 영구 API Key와 달리 세션은 단기(24시간 기본값). Safe/Argent의 ERC-7579/7710 세션 키 패턴을 체인 무관하게 데몬 레벨에서 구현.

2. **Time-Lock + Approval Tiers (TS-2)** — 4단계 거래 처리: Instant(< 0.1 SOL, 즉시 실행), Notify(0.1-1 SOL, 실행 후 알림), Delay(1-5 SOL, 10분 대기 후 자동 실행, 소유자 취소 가능), Approval(> 5 SOL, 소유자 서명 필수). Zodiac Delay Modifier의 3단계 프로세스(propose → cooldown → execute/expire)를 로컬 큐로 복제. SQLite 기반 pending queue에서 시간 잠금 관리.

3. **Multi-Channel Notification System (TS-3)** — 실시간 알림을 다중 채널로 전송(Telegram Bot, Discord Webhook, ntfy.sh Push, 데스크톱 네이티브 알림). 단일 채널 실패 시 폴백. 알림 우선순위(info/warning/critical). 속도 제한 회피(배치 처리, 재시도). 전달 확인 추적. 킬 스위치 발동 시 모든 채널에 반복 알림.

4. **Owner Wallet Connection (TS-4)** — 소유자 지갑(Phantom, MetaMask, Ledger)을 로컬 데몬에 연결. Tauri 데스크톱 앱에서 Solana Wallet Adapter + React로 브라우저 확장 연결. WalletConnect v2로 모바일 QR 연결. WebHID/Node HID로 Ledger USB 연결. CLI 오프라인 서명 폴백. SIWS/SIWE 메시지 서명으로 세션 승인 + 거래 승인 + 설정 변경 인증.

5. **CLI Daemon Management (TS-5)** — `waiaas init/start/stop/status` 커맨드로 데몬 라이프사이클 관리. Bitcoin Core(`bitcoind`, `bitcoin-cli`)와 PM2 패턴 참조. 대화형 초기화 마법사, PID 파일 관리, 신호 처리(SIGTERM 우아한 종료, SIGHUP 설정 리로드), 로그 로테이션, 헬스 체크 엔드포인트.

6. **REST API for Agent Access (TS-6)** — 에이전트가 데몬과 통신하는 HTTP API. v0.1의 OpenAPI 설계 재사용, 클라우드 호스팅을 localhost로 변경. 세션 토큰 인증 미들웨어, Zod 스키마 검증, 속도 제한(per-session), CORS 설정(`localhost` 전용), `/v1/transactions/send`, `/v1/wallets/balance`, `/v1/sessions`, `/v1/owner/approve/:txId` 등.

7. **Encrypted Local Storage (TS-7)** — 에이전트 키를 AES-256-GCM으로 암호화하여 `~/.waiaas/keystore/<agent-id>.json`에 저장. Ethereum Keystore V3 포맷 참조(Argon2id + GCM auth tag). SQLite(better-sqlite3 + WAL)로 트랜잭션 기록, 세션 상태, 정책 설정 저장. 키는 메모리에만 보관(디스크에 평문 저장 절대 금지). `sodium-native`로 guarded memory 할당(swap 방지, core dump 방지).

---

### Differentiators (차별화 기능)

표준 기대를 넘어선 WAIaaS 고유 가치.

1. **MCP Server Integration (D-1)** — Model Context Protocol 서버로 Claude, GPT 등 LLM이 표준 MCP 도구 인터페이스로 직접 지갑 사용. stdio 전송(Claude Desktop 통합), SSE 전송(원격 에이전트). v0.1의 MCP 설계(API-06) 재사용. 세션 토큰으로 인증. 7-9개 핵심 도구, 4개 리소스. 대부분 암호화폐 MCP는 SaaS인 반면, WAIaaS는 완전 자가 호스팅(custody + privacy).

2. **Interactive Telegram Approval Bot (D-2)** — 알림 발송뿐 아니라 Telegram 인라인 키보드로 거래 승인/거부 가능. 소유자가 데스크톱 앱 열 필요 없이 모바일에서 즉시 관리. 고액 거래는 추가 확인("CONFIRM 입력") 요구. 세션 관리 명령(`/sessions`, `/revoke`), 킬 스위치 명령(`/killswitch`), 상태 조회(`/status`).

3. **Desktop App with System Tray (D-3)** — Tauri 기반 데스크톱 GUI. 시스템 트레이에 상주(상태 아이콘: 초록=실행 중, 노랑=승인 대기, 빨강=정지). 대시보드(잔액, 오늘 거래, 활성 세션, 가동 시간), 보류 승인 화면(Rabby 스타일 잔액 변화 미리보기), 거래 기록, 세션 관리, 설정, 지갑 연결 통합. 네이티브 OS 알림, 자동 업데이트. macOS/Windows/Linux 빌드.

4. **Docker Deployment (D-4)** — Docker 이미지 + docker-compose 템플릿. 서버 배포 시 네이티브 설치 불필요. 볼륨 매핑으로 데이터 영속성, 헬스 체크 엔드포인트, 환경 변수 설정.

5. **Auto-Stop Rules Engine (D-5)** — 설정 가능한 규칙으로 자동 긴급 정지 발동. 연속 거래 실패(5회/10분), 비정상 시간 활동(설정 시간 외), 세션 한도 90% 소진, 빠른 거래 속도(10개/분), 비화이트리스트 주소. 규칙 위반 시 자동 SUSPENDED 상태 전환, 소유자 알림. YAML/JSON 규칙 정의. 커스텀 규칙 생성 지원(고급 사용자).

6. **SDK Libraries (D-6)** — TypeScript SDK(`@waiaas/sdk`), Python SDK(`waiaas`). 완전 타입 정의, 자동 재시도, 세션 토큰 관리(자동 갱신 프롬프트), 에러 타입 정의. 에이전트 통합 간소화.

---

### Architecture Approach (아키텍처 접근)

v0.2는 "클라우드 서비스가 보안 경계를 제공"에서 "데몬 프로세스 자체가 보안 경계"로 아키텍처 전환. v0.1의 3-레이어 정책 엔진(Server + Enclave + Squads)을 단일 레이어 로컬 정책 엔진으로 단순화. Squads 온체인 스마트 지갑 의존성 제거(체인 무관 원칙 유지).

**주요 컴포넌트:**

1. **LocalKeyStore (sodium-native)** — AES-256-GCM + Argon2id로 에이전트 키 암호화. Ethereum Keystore V3 포맷 확장(GCM auth tag, Argon2id). `sodium_malloc()` guarded memory로 키 자료 보호(mlock, MADV_DONTDUMP). 복호화 → 서명 → 즉시 제로화, 단일 동기 호출 경로에서 완료. 마스터 비밀번호에서 MEK(Master Encryption Key) 파생, MEK로 에이전트 키 암호화. 소유자 개인 키는 절대 저장/생성하지 않음(외부 지갑 서명 사용).

2. **SessionManager** — JWT 발급(HS256, 데몬 비밀로 서명). 소유자 지갑 서명(SIWS/SIWE 메시지)으로 세션 승인 검증. Nonce 기반 재생 방지. 세션 제약(만료, 한도) JWT claims에 내장. 취소 블록리스트를 LRU 캐시 + SQLite에 관리. 요청당 검증 흐름: JWT 디코딩 → HMAC 검증 → 만료 확인 → 취소 확인 → 범위 확인 → 한도 확인(세션 누적 지출) → 정책 엔진 진입.

3. **TimeLockQueue** — SQLite 기반 pending_transactions 테이블. 상태(PENDING/APPROVED/REJECTED/EXPIRED/CANCELLED). TIME_LOCK 티어는 `unlock_at` 시각 저장, APPROVAL 티어는 `expires_at` 시각 저장. 1초마다 백그라운드 워커가 큐 스캔: `unlock_at <= now`면 서명 파이프라인으로 이동, `expires_at <= now`면 EXPIRED 처리. 소유자 승인 엔드포인트(`POST /v1/owner/approve/:txId`)가 상태를 APPROVED로 업데이트 → 즉시 실행. 킬 스위치는 모든 pending tx를 CANCELLED 처리.

4. **PolicyEngine (Local)** — 규칙 기반 정책 평가. Amount limit(per-tx, session cumulative, daily), 주소 화이트리스트, 시간 제약, 작업 타입 제약, 회로 차단기(5회 연속 실패). 규칙 위반 시 티어 상향(Instant → Notify → Delay → Approval) 또는 거부. 모든 규칙 평가는 동기 메모리 내 연산(빠른 응답). SQLite에서 규칙 로드 → 메모리 캐시 → 요청마다 평가.

5. **TransactionService (Coordinator)** — Adapter + KeyStore + PolicyEngine + TimeLockQueue 조정. 6단계 흐름: Receive → Validate session → Policy check → Determine tier → [Queue or Execute] → Sign(KeyStore) → Submit(Adapter). 블록체인 시뮬레이션 필수(서명 전). 모든 거래는 audit_log 테이블에 불변 기록.

6. **IBlockchainAdapter (Chain Abstraction)** — v0.1의 IBlockchainAdapter 인터페이스 재사용. Squads 전용 메서드(`createSmartWallet`, `addMember`) 제거. 남은 것: `buildTransaction`, `simulateTransaction`, `submitTransaction`, `getBalance`, `getAssets`, `isValidAddress`, `estimateFee`, `healthCheck`. SolanaAdapter(v0.2 우선 구현), EVMAdapter(스텁). AdapterRegistry에 등록. 키 자료는 어댑터에 노출되지 않음(KeyStore만 키 접근).

7. **NotificationDispatcher** — 멀티 채널 파이프라인. 이벤트 → 우선순위 결정 → 포맷팅 → 병렬 발송. TelegramChannel(grammY), DiscordChannel(fetch), WebhookChannel, ntfy.shChannel. 전달 확인 추적. 폴백 체인(primary 실패 시 secondary 시도). 채널 헬스 모니터링(30초마다 ping). 속도 제한 회피(30초 윈도우 배치, 재시도 with Retry-After). 최소 2개 채널 필수(프로덕션).

8. **DaemonLifecycle** — 시작 시퀀스: 설정 로드 → SQLite 초기화(WAL 모드, 마이그레이션) → KeyStore 잠금 해제(마스터 비밀번호 프롬프트) → 체인 어댑터 등록 → 서비스 초기화 → HTTP 서버 시작(127.0.0.1:3000) → 백그라운드 워커 시작(QueueProcessor, SessionCleaner, HealthChecker, WalCheckpointer) → 신호 핸들러 등록. 우아한 종료: 새 연결 차단 → 진행 중 요청 대기(30초 타임아웃) → pending 상태 SQLite 저장 → WAL 체크포인트(TRUNCATE) → KeyStore 잠금(키 제로화) → SQLite 닫기 → 프로세스 종료.

**모노레포 구조:**
```
packages/
  core/       — 도메인, 인터페이스, Zod SSoT, 서비스 로직
  daemon/     — 인프라(keystore, database, server, lifecycle)
  adapters/   — 체인별 구현(solana/, evm/)
  cli/        — waiaas 커맨드 구현
  sdk/        — 타입스크립트 SDK
  mcp/        — MCP 서버(독립 실행 가능)
```

**데이터 디렉토리:**
```
~/.waiaas/
  config.toml             — 데몬 설정
  data/
    waiaas.db             — SQLite 데이터베이스
    waiaas.db-wal         — WAL 파일
  keystore/
    <agent-id>.json       — 암호화된 에이전트 키
  logs/
    daemon.log            — 애플리케이션 로그
    audit.log             — 보안 감사 로그
  backups/
    <timestamp>.backup    — 암호화된 키스토어 백업
```

---

### Critical Pitfalls (치명적 함정)

펀드 손실, 키 유출, 전면 재작성을 초래하는 실수.

1. **AES-256-GCM Nonce 재사용 → 기밀성 및 인증 파괴 (C-01)** — 매 암호화마다 새 96비트 랜덤 nonce 생성(`crypto.randomBytes(12)`). Nonce를 암호문에 프리펜드: `[12-byte nonce][ciphertext][16-byte auth tag]`. 키 순환: N회 재암호화 또는 비밀번호 변경 시 새 salt로 MEK 재파생. 충돌 저항을 위해 XChaCha20-Poly1305(192비트 nonce) 고려. **Phase 1: Core key management.**

2. **Argon2id 약한 파라미터 → 오프라인 브루트포스 (C-02)** — 단일 사용자 로컬 데몬은 **1-3초** 파생 시간 목표. 권장 최소값: `m=256 MiB, t=3, p=4`. 타겟 하드웨어에서 벤치마크 후 상향 조정. 16바이트 CSPRNG salt. PHC 인코딩 문자열 저장(`$argon2id$v=19$m=262144,t=3,p=4$[salt]$[hash]`). 비밀번호 변경 시 새 salt로 재파생. **Phase 1: Core key management.**

3. **개인 키가 Node.js 프로세스 메모리에 잔존 → Swap/Core Dump 노출 (C-03)** — `sodium-native` 사용: `sodium_malloc()`으로 guarded memory 할당(mlock 스왑 방지, MADV_DONTDUMP 코어 덤프 방지, guard page). 복호화 → 서명 → `sodium_memzero()` 제로화, 모두 단일 동기 호출 경로에서. 키는 절대 JS 변수에 저장하지 않음. 호스트에서 swap 비활성화(`swapoff -a`), 코어 덤프 비활성화(`ulimit -c 0`). **Phase 1: Signing service.**

4. **Localhost 데몬이 0.0.0.0 Day / DNS Rebinding 공격으로 악용 (C-04)** — `127.0.0.1`에만 바인딩, 절대 `0.0.0.0` 사용 금지. 모든 엔드포인트에 세션 토큰 인증 필수(무인증 엔드포인트 없음). Host 헤더 검증(localhost/127.0.0.1만 허용). CORS: `Access-Control-Allow-Origin: *` 금지. CSRF 토큰 구현. PNA 헤더 추가(`Access-Control-Allow-Private-Network: true`). **Phase 1: HTTP server configuration.**

5. **불충분한 엔트로피 세션 토큰 → 예측 공격 (C-05)** — 최소 256비트 암호학적 랜덤(`crypto.randomBytes(32).toString('base64url')`). 서버 사이드에 SHA-256 해시 저장. 토큰 메타데이터(만료, 한도)는 서버 저장소, 토큰 자체에 인코딩 금지. 속도 제한: 소스당 분당 5회 실패 제한. **Phase 1: Session token design.**

---

## Implications for Roadmap (로드맵 시사점)

연구 결과를 바탕으로 3-페이즈 구조 제안. 스택 의존성, 아키텍처 컴포넌트, 기능 우선순위, 함정 회피 전략을 고려한 순서.

### Phase 1: Core Daemon (핵심 데몬)

**근거:** 모든 것이 의존하는 기반. 키 관리, 스토리지, 세션 인증은 최우선. 잘못 설계하면 전면 재작성 불가피. 암호화(AES-GCM nonce, Argon2id 파라미터), localhost 보안(0.0.0.0 Day), SQLite WAL은 1일차부터 필수(나중 추가 불가).

**전달:** 실행 가능한 데몬 프로세스(`waiaas start`), 에이전트 API(잔액 조회, 거래 전송), 세션 토큰 시스템, 암호화된 키 저장소.

**구현 기능:**
- TS-7: Encrypted Local Storage — AES-256-GCM + Argon2id 키 암호화, SQLite(WAL 모드), `~/.waiaas/` 디렉토리 구조
- TS-5: CLI Daemon Management — `init`, `start`, `stop`, `status` 커맨드, PID 관리, 신호 처리
- TS-6: REST API for Agent Access — Hono HTTP 서버(`127.0.0.1` 바인딩), 핵심 엔드포인트, Zod 검증
- TS-1: Session Token System — JWT 발급, 제약 내장(만료, 한도), 취소 블록리스트

**회피 함정:**
- C-01: AES-GCM nonce 재사용 → 매 암호화 새 랜덤 nonce
- C-02: Argon2id 약한 파라미터 → 1-3초 파생 시간 벤치마크
- C-03: 키 메모리 잔존 → `sodium-native` guarded memory
- C-04: Localhost 악용 → 127.0.0.1 바인딩, Host 검증, 모든 엔드포인트 인증
- C-05: 예측 가능한 토큰 → 256비트 CSPRNG
- H-02: SQLite 손상 → WAL 모드, busy_timeout, 로컬 FS만
- H-05: 메타데이터 누출 → 불투명 파일명, 로그 sanitizer

**스택 사용:**
- Hono 4.x + @hono/node-server
- Drizzle ORM 0.45.1 + better-sqlite3 12.x
- node:crypto (AES-256-GCM) + argon2 0.44.0
- jose (JWT HS256)
- lru-cache 11.x
- sodium-native (guarded memory)

**Phase 1 종료 조건:** 에이전트가 세션 토큰으로 `/v1/transactions/send` 호출 → 즉시 실행 → 서명 → 온체인 제출 성공. 데몬 재시작 시 암호화된 키와 세션 상태 복원.

---

### Phase 2: Security Layers (보안 레이어)

**근거:** 에이전트 자율성과 소유자 통제 균형. Time-lock은 에이전트 고액 거래 악용 방지, 소유자 지갑 연결은 승인 흐름 활성화, 알림은 Layer 3 모니터링 + 킬 스위치 기반. Notification 실패는 킬 스위치 무력화하므로 Phase 2에서 해결 필수.

**전달:** 4-티어 거래 처리, 소유자 승인 흐름, 멀티 채널 알림, 킬 스위치.

**구현 기능:**
- TS-4: Owner Wallet Connection — Solana Wallet Adapter(Tauri WebView + React), WalletConnect v2(QR), CLI 서명 폴백
- TS-2: Time-Lock + Approval Tiers — 4-티어 시스템, SQLite pending queue, 쿨다운 타이머, 자동 만료
- TS-3: Multi-Channel Notification System — Telegram Bot(grammY), Discord(fetch), ntfy.sh(push), 전달 확인, 폴백 체인, 헬스 체크

**회피 함정:**
- H-01: Time-lock TOCTOU → 제출 시 예산 예약, 실행 시 재검증, Instant 티어 집계 속도 제한, SQLite 트랜잭션 원자성
- H-03: 서명 재생 → nonce 기반 메시지, 사용 nonce 추적, 5분 만료
- M-01: 알림 실패 → 최소 2개 채널 필수, 전달 확인 추적, 재시도 with backoff, 30초 배치
- M-02: Chain abstraction 누출 → 확정성 인식 인터페이스, 체인별 에러 타입, 시뮬레이션 필수, Solana 먼저 완성 후 인터페이스 추출

**스택 사용:**
- grammY 1.39.x (Telegram Bot)
- Discord Webhook (native fetch)
- ntfy.sh (self-hosted push)
- @solana/wallet-adapter-react 0.15.39
- @walletconnect/web3wallet 1.16.1

**Phase 2 종료 조건:** 에이전트가 2 SOL 거래 제출 → TIME_LOCK 티어 진입 → 10분 대기 → 소유자에게 Telegram + Discord 알림 → 소유자가 취소 안 함 → 자동 실행. 10 SOL 거래 제출 → APPROVAL 티어 진입 → 소유자가 Phantom 지갑으로 승인 서명 → 실행.

---

### Phase 3: Integration & Polish (통합 및 완성도)

**근거:** 에이전트 통합 간소화(MCP + SDK), 소유자 UX 개선(Telegram 인터랙티브, Desktop App), 방어 심층(Auto-Stop Rules). Phase 1/2 완성 후 Phase 3는 병렬 개발 가능.

**전달:** MCP 서버, 인터랙티브 Telegram Bot, Tauri 데스크톱 앱, 자동 정지 규칙 엔진.

**구현 기능:**
- D-1: MCP Server — stdio + SSE 전송, 7-9개 도구, 4개 리소스, 세션 토큰 인증
- D-2: Interactive Telegram Approval Bot — 인라인 키보드(Approve/Reject/Details), 세션 관리 명령, 킬 스위치 명령
- D-3: Desktop App with System Tray — Tauri 2.x + React + Tailwind, 시스템 트레이 상태 아이콘, 대시보드(Overview, Pending Approvals, Tx History, Sessions, Settings), 네이티브 알림, 자동 업데이트
- D-5: Auto-Stop Rules Engine — YAML/JSON 규칙 정의, 이벤트 기반 평가, 자동 SUSPENDED 전환, 규칙 enable/disable, 커스텀 규칙 생성

**회피 함정:**
- H-04: 클립보드 하이재킹 → 주소록 검증, 주소 확인 UI(시각적 그룹화), 붙여넣기 후 클립보드 제거, QR 선호
- M-03: 브라우저-데몬 통신 → Tauri IPC(Rust backend) 선호, 브라우저 경로는 CSRF 토큰, 메시지 바인딩(daemon instance ID + nonce)
- M-04: 킬 스위치 프로세스 훼손 → 온체인 검증(에이전트 주소 실시간 모니터), 외부 watchdog 프로세스, 핵 옵션(키 파일 덮어쓰기)
- M-05: 데몬 자동 시작 무감시 윈도우 → 부팅 후 locked 모드, 소유자 존재 확인 필수, 재시작 시 세션 무효화, pending tx 퍼지, 시작 무결성 체크

**스택 사용:**
- @tauri-apps/cli 2.x + @tauri-apps/api 2.x
- @tauri-apps/plugin-shell, plugin-notification, plugin-autostart
- @tauri-apps/plugin-updater, plugin-store
- @modelcontextprotocol/sdk (stdio/SSE)
- React + Tailwind CSS

**Phase 3 종료 조건:** Claude Desktop이 MCP로 데몬에 연결 → `execute_transaction` 도구 호출 → 거래 성공. Tauri 앱 시스템 트레이에서 실행 → 에이전트가 3 SOL 거래 제출 → Tauri 앱 알림 + Pending Approvals 화면에 표시 → 소유자가 앱에서 Approve 클릭 → 실행. Telegram에서 `/killswitch` 명령 → 모든 세션 취소 + 모든 pending tx 취소 + 모든 에이전트 SUSPENDED.

---

### Phase Ordering Rationale (페이즈 순서 근거)

1. **Foundation First (Phase 1)**: 암호화, 키 관리, localhost 보안, 세션 토큰은 나중에 수정 불가능. 잘못 설계하면 전면 재작성. C-01~C-05 함정이 모두 Phase 1에 집중됨. SQLite WAL, AES-GCM nonce, Argon2id 파라미터, Host 검증은 1일차부터 필수.

2. **Security Before UX (Phase 2)**: Time-lock과 알림은 에이전트 악용 방지의 핵심. 소유자 UX(Desktop App)보다 먼저 보안 레이어 완성. Phase 1의 즉시 실행 경로만으로는 에이전트가 펀드 모두 소진 가능. Phase 2의 4-티어 + 알림 + 킬 스위치가 Layer 2~3 보안 제공.

3. **Integration Layer After Core (Phase 3)**: MCP, Desktop App, Telegram 인터랙티브는 Phase 1/2 API를 소비하는 통합 레이어. Phase 2 완성 후 병렬 개발 가능. Desktop App과 MCP는 독립적(Desktop은 Tauri IPC, MCP는 stdio/SSE).

4. **Dependency-Driven**: Phase 1(Storage + Session) → Phase 2(Time-lock는 Session + Storage 필요, Notification은 Time-lock 이벤트 필요) → Phase 3(MCP/Desktop은 Phase 2 API 소비). Phase 2와 Phase 3의 일부는 병렬 가능(Notification + Desktop App은 독립적).

5. **Pitfall Avoidance**: Critical pitfalls(C-01~C-05)는 모두 Phase 1 설계 결정. High pitfalls(H-01~H-05)는 Phase 2 실행 흐름. Moderate pitfalls(M-01~M-05)는 Phase 3 통합 이슈. 페이즈 순서가 pitfall 심각도 순서와 정렬됨.

---

### Research Flags (연구 플래그)

**심층 연구 필요한 페이즈:**
- **Phase 2 - Owner Wallet Connection:** WalletConnect v2는 2025 말 Reown으로 리브랜딩 진행 중. 패키지명 변경 가능성(`@walletconnect/web3wallet` → `@reown/walletkit`). Phase 2 시작 전 최신 문서 재확인 필요. Ledger WebHID는 Tauri WebView에서 WebHID API 지원 여부가 OS별로 다름. Phase 2 초기에 macOS WKWebView + Windows Edge WebView2 WebHID 호환성 테스트 필수. 실패 시 Rust backend `hidapi` 폴백 경로 준비.

- **Phase 3 - MCP Server:** MCP 스펙은 2025-11-25 버전. stdio + SSE 전송은 검증됨. 하지만 WAIaaS 특화(세션 토큰 인증, 금융 거래 도구)는 사례가 희소. Phase 3 시작 전 MCP 최신 변경사항 확인. 특히 보안 권장사항(도구 호출 인증, 리소스 접근 제어).

**표준 패턴(연구 건너뛰기):**
- **Phase 1 - Encrypted Keystore:** Ethereum Keystore V3 포맷은 업계 표준. AES-256-GCM + Argon2id는 검증된 암호화. OWASP Password Storage Cheat Sheet + RFC 9106 지침 준수. 추가 연구 불필요.

- **Phase 1 - SQLite WAL:** WAL 모드는 수십 년 검증된 SQLite 기능. better-sqlite3는 35M weekly downloads. 문서 완전함. 추가 연구 불필요.

- **Phase 2 - Telegram Bot:** grammY는 성숙한 봇 프레임워크(1.2M weekly downloads). 인라인 키보드, 명령 핸들러는 문서 완전. 표준 패턴.

- **Phase 3 - Tauri Desktop App:** Tauri 2.x는 2024년 10월 릴리스 후 16개 마이너 업데이트(v2.10.2). 프로덕션 검증됨. React + Wallet Adapter 통합은 Tauri 공식 가이드 존재. 표준 패턴.

---

## Confidence Assessment (신뢰도 평가)

| 영역 | 신뢰도 | 근거 |
|------|--------|------|
| **Stack** | HIGH | Tauri, Hono, Drizzle, argon2, jose, grammY 모두 npm registry에서 검증. Tauri 2.10.2(최신), Hono 4.11.4(6일 전), Drizzle 0.45.1(1개월 전), better-sqlite3 12.6.2(2일 전). 공식 문서 완전. 비교 분석(Tauri vs Electron, Hono vs Fastify, Drizzle vs Prisma)은 복수 신뢰할 수 있는 출처(Better Stack, RaftLabs, Bytebase)에서 교차 검증. |
| **Features** | MEDIUM-HIGH | Safe/Zodiac(온체인 time-lock), Frame.sh(데스크톱 데몬), Argent/MetaMask(세션 키), Bitcoin Core(데몬 RPC 인증) 등 기존 제품에서 기능 패턴 추출. 하지만 "자가 호스팅 에이전트 지갑 데몬"은 신생 카테고리. Safe는 EVM 온체인, Frame는 일반 지갑(에이전트 특화 아님). 유사 제품 패턴을 조합했지만, WAIaaS v0.2 특정 조합(로컬 데몬 + 세션 토큰 + time-lock + MCP)은 선례 부족. 커뮤니티 합의 있지만 v0.2 특정 유즈케이스 검증 미흡. |
| **Architecture** | MEDIUM-HIGH | v0.1 설계 문서(ARCH-01~05, REL-03~04, API-02~03)에서 인터페이스 재사용. IBlockchainAdapter, IPolicyEngine, Agent lifecycle 5-state는 검증된 v0.1 설계. Ethereum Keystore V3(공식 이더리움 문서), SIWE/SIWS(EIP-4361, Phantom 공식), SQLite WAL(SQLite 공식)은 HIGH 신뢰도. 하지만 "단일 프로세스로 모든 보안 레이어 통합"은 v0.1의 3-레이어 분리(Server + Enclave + Squads)와 다른 접근. 아키텍처 단순화가 보안 저하 없이 작동하는지는 구현 후 검증 필요. |
| **Pitfalls** | HIGH | Critical pitfalls(C-01~C-05)는 공식 문서(RFC 5116, NIST, OWASP, libsodium docs, Node.js Issue #18896/#30956) 및 보안 연구(Oligo Security 0.0.0.0 Day, elttam GCM key recovery, Halborn clipper malware)에서 확인. High pitfalls(H-01~H-05)는 일반 TOCTOU 문헌, SQLite 공식 문서, 실제 사고(oByte wallet, LastPass 침해, DEXX 사건)에서 추출. 알려진 사건(0.0.0.0 Day, ShadowRay, CVE-2025-59956, Laplas Clipper)이 WAIaaS와 직접 관련. |

**전체 신뢰도:** HIGH

---

### Gaps to Address (해결할 격차)

1. **WalletConnect v2 리브랜딩 불확실성** — `@walletconnect/web3wallet` 패키지가 `@reown/walletkit`으로 변경될 가능성. Phase 2 시작 전 최신 Reown 문서 확인. 버전 핀 고정 + 모니터링. 패키지명 변경 시 마이그레이션 경로 사전 확인.

2. **Tauri WebView WebHID 호환성** — Ledger 하드웨어 지갑 연결을 위한 WebHID API가 시스템 WebView(macOS WKWebView, Windows Edge WebView2)에서 지원 여부 OS별로 다름. Phase 3 초기에 타겟 OS에서 WebHID 테스트. 실패 시 Rust backend에서 `@ledgerhq/hw-transport-node-hid`로 폴백 경로 구현.

3. **MCP 도구 인증 모델** — MCP 스펙은 일반 도구 호출 정의. 하지만 금융 거래 도구의 인증(세션 토큰 전달 메커니즘)은 WAIaaS 특정 설계. MCP 컨텍스트에서 세션 토큰을 어떻게 안전하게 전달할지(stdio 표준 입력, 환경 변수, SSE Authorization header) Phase 3 초기 설계 결정 필요. MCP 커뮤니티 최신 보안 권장사항 확인.

4. **Multi-Chain Feature Parity** — IBlockchainAdapter는 체인 무관하게 설계. 하지만 연구는 Solana 중심. EVM 어댑터 구현 시 Solana와 의미론 차이(finality, nonce 모델, 토큰 모델)가 인터페이스 확장 필요할 수 있음. Phase 2 Solana 어댑터 완성 후 인터페이스를 추출하되, EVM 어댑터 스텁 구현(Phase 2 후반) 시 인터페이스 개선 필요성 검증.

5. **키 메모리 보호 폴백** — `sodium-native` 컴파일 실패 환경(일부 ARM 플랫폼, 특정 Docker 베이스 이미지)에서 `libsodium-wrappers`로 폴백 시 guarded memory 보장 손실. Phase 1 개발 중 타겟 플랫폼별 `sodium-native` 컴파일 테스트. 실패 플랫폼 리스트업 + 문서화. 폴백 시 보안 저하 명시적 경고.

6. **알림 전달 확인 메커니즘 구현 복잡도** — Telegram/Discord/ntfy.sh 모두 HTTP 응답 코드로 전달 성공 표시. 하지만 "소유자가 실제로 읽었는지" 확인 불가. Phase 2 알림 시스템 구현 시 "전달 성공 != 읽음"을 명확히 하고, 중요 알림(킬 스위치 발동)은 반복 전송 + 멀티 채널 병렬 전송으로 읽음 확률 높이기. 하지만 100% 보장 불가능. 문서에 명시.

---

## Sources (출처)

### PRIMARY (HIGH Confidence - 공식 문서)

**Stack:**
- [Tauri 2.0 Official](https://v2.tauri.app/) — v2.10.2 릴리스 노트, 시스템 트레이, 알림 플러그인
- [Tauri Node.js Sidecar Guide](https://v2.tauri.app/learn/sidecar-nodejs/) — Node.js 바이너리 패키징
- [Hono Official Docs](https://hono.dev/) — v4.11.4
- [Hono npm](https://www.npmjs.com/package/hono) — 4.11.4 (6일 전 게시)
- [Drizzle ORM Official](https://orm.drizzle.team/) — SQLite 가이드, 마이그레이션 툴킷
- [Drizzle npm](https://www.npmjs.com/package/drizzle-orm) — 0.45.1
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3) — 12.6.2 (2일 전 게시)
- [argon2 npm](https://www.npmjs.com/package/argon2) — 0.44.0, 354K weekly downloads
- [jose npm/GitHub](https://github.com/panva/jose) — JWA, JWS, JWE, JWT, JWK 표준 구현
- [grammY Official](https://grammy.dev/) — Telegram 봇 프레임워크
- [grammY npm](https://www.npmjs.com/package/grammy) — 1.39.x, ~1.2M weekly downloads
- [ntfy.sh Official](https://ntfy.sh/) — 자가 호스팅 푸시 알림, Apache2/GPLv2

**Features:**
- [Safe Docs: ERC-4337 Integration](https://docs.safe.global/advanced/erc-4337/4337-safe) — 세션 키 모듈 아키텍처
- [Zodiac Delay Modifier GitHub](https://github.com/gnosisguild/zodiac-modifier-delay) — Time-lock 구현 세부사항, cooldown/expiration 기본값
- [Tauri 2.0 System Tray](https://v2.tauri.app/learn/system-tray/) — 데스크톱 트레이 구현
- [Tauri Notification Plugin](https://v2.tauri.app/plugin/notification/) — 네이티브 OS 알림
- [Solana Wallet Adapter Cookbook](https://solana.com/developers/cookbook/wallets/connect-wallet-react) — 지갑 연결 패턴
- [Solana Wallet Adapter GitHub](https://github.com/anza-xyz/wallet-adapter) — anza-xyz 공식 저장소
- [PM2 Official](https://pm2.keymetrics.io/) — Node.js 데몬 관리 패턴
- [Bitcoin Core RPC Auth](https://markaicode.com/bitcoin-core-rpc-authentication-secure-api-access-2025/) — Cookie 기반 데몬 인증
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25) — Protocol 표준

**Architecture:**
- [Ethereum Web3 Secret Storage Definition](https://ethereum.org/developers/docs/data-structures-and-encoding/web3-secret-storage) — Keystore V3 포맷 스펙
- [EIP-4361: Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361) — SIWE 표준
- [Phantom Sign In With Solana](https://phantom.com/learn/developers/sign-in-with-solana) — SIWS 스펙
- [Sign In With Solana Docs](https://siws.web3auth.io) — 구현 가이드
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3) — SQLite 드라이버 문서
- [Hono Framework Docs](https://hono.dev/docs/) — HTTP 프레임워크
- [sodium-native GitHub](https://github.com/LiskHQ/sodium-native) — Low-level libsodium 바인딩
- [Libsodium Secure Memory](https://libsodium.gitbook.io/doc/memory_management) — Guarded memory 사용법

**Pitfalls:**
- [SQLite WAL Documentation](https://sqlite.org/wal.html) — WAL 모드 공식 문서
- [SQLite File Locking](https://sqlite.org/lockingv3.html) — 파일 잠금 메커니즘
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) — Argon2id 권장 파라미터
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — 세션 토큰 엔트로피 권장
- [RFC 9106 - Argon2](https://www.rfc-editor.org/rfc/rfc9106.html) — Argon2 공식 스펙
- [RFC 8452 - AES-GCM-SIV](https://www.rfc-editor.org/rfc/rfc8452.html) — Nonce 오용 저항
- [Node.js Issue #18896 - crypto.alloc()](https://github.com/nodejs/node/issues/18896) — Secure memory 미지원
- [Node.js Issue #30956 - Secure Memory](https://github.com/nodejs/node/issues/30956) — Guarded memory 제안(미해결)
- [better-sqlite3 Performance](https://wchargin.com/better-sqlite3/performance.html) — 성능 가이드
- [Frame Security Audit FRM-01](https://medium.com/@framehq/frame-security-audit-frm-01-7a90975992af) — 데스크톱 지갑 보안 감사 긍정 사례

### SECONDARY (MEDIUM Confidence - 교차 검증된 커뮤니티 소스)

**Stack:**
- [Tauri vs Electron (Hopp App)](https://www.gethopp.app/blog/tauri-vs-electron) — 번들 크기, 메모리 비교
- [Tauri vs Electron (RaftLabs)](https://www.raftlabs.com/blog/tauri-vs-electron-pros-cons/) — 보안 모델 비교
- [Hono vs Fastify (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/hono-vs-fastify/) — 성능, 런타임 지원 비교
- [Drizzle vs Prisma (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/drizzle-vs-prisma/) — ORM 비교
- [Drizzle vs Prisma (Bytebase)](https://www.bytebase.com/blog/drizzle-vs-prisma/) — 마이그레이션, 번들 크기
- [Drizzle Benchmarks](https://orm.drizzle.team/benchmarks) — 성능 벤치마크
- [Discord Webhooks Guide 2025](https://inventivehq.com/blog/discord-webhooks-guide) — 웹훅 사용법
- [grammY Comparison](https://grammy.dev/resources/comparison) — Telegraf, node-telegram-bot-api 비교
- [WalletConnect Sign API Specs](https://specs.walletconnect.com/2.0/specs/clients/sign) — v2 pairing/session 프로토콜
- [Reown (WalletConnect) Docs](https://docs.walletconnect.com/2.0/web3wallet/resources) — 리브랜딩 후 문서

**Features:**
- [ERC-4337 Session Keys Documentation](https://docs.erc4337.io/smart-accounts/session-keys-and-delegation.html) — 세션 키 위임 패턴
- [MetaMask Delegation Toolkit](https://metamask.io/developer/delegation-toolkit) — ERC-7710 위임 프레임워크
- [Argent Session Keys Blog](https://www.ready.co/blog/session-keys-with-argent-technical) — dApp-to-wallet 세션 플로우
- [thirdweb Session Keys Guide](https://blog.thirdweb.com/what-are-session-keys-the-complete-guide-to-building-invisible-blockchain-experiences-with-account-abstraction/) — 완전한 세션 키 패턴
- [Frame.sh Official](https://frame.sh/) — 데스크톱 지갑 데몬 패턴
- [Rabby Wallet Security](https://support.rabby.io/hc/en-us/articles/11495710873359-Is-Rabby-Wallet-safe) — 트랜잭션 미리보기/승인 UX
- [Zodiac Wiki](https://www.zodiac.wiki/documentation/delay-modifier) — Delay modifier 문서
- [Web3 UX Design Handbook: Transaction Flows](https://web3ux.design/transaction-flows) — 승인 UX 패턴
- [Pento: A Year of MCP](https://www.pento.ai/blog/a-year-of-mcp-2025-review) — MCP 생태계 현황 2025

**Architecture:**
- [SIWE TypeScript Library](https://github.com/spruceid/siwe) — 참조 구현
- [Drizzle vs Prisma 2026 Deep Dive](https://medium.com/@codabu/drizzle-vs-prisma-choosing-the-right-typescript-orm-in-2026-deep-dive-63abb6aa882b) — ORM 비교
- [SQLite is All You Need: One-Person Stack 2026](https://dev.to/zilton7/sqlite-is-all-you-need-the-one-person-stack-for-2026-23kg) — SQLite 프로덕션 트렌드
- [PM2 Guide (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/pm2-guide/) — 프로세스 관리
- [Hono Graceful Shutdown Discussion](https://github.com/orgs/honojs/discussions/3731) — 프로덕션 종료 패턴

**Pitfalls:**
- [Oligo Security - 0.0.0.0 Day](https://www.oligo.security/blog/0-0-0-0-day-exploiting-localhost-apis-from-the-browser) — Localhost 악용 취약점
- [GitHub Blog - Localhost CORS and DNS Rebinding](https://github.blog/security/application-security/localhost-dangers-cors-and-dns-rebinding/) — CORS 설정 가이드
- [GitHub Blog - DNS Rebinding Attacks Explained](https://github.blog/security/application-security/dns-rebinding-attacks-explained-the-lookup-is-coming-from-inside-the-house/) — DNS Rebinding 공격
- [elttam - Key Recovery Attacks on GCM](https://www.elttam.com/blog/key-recovery-attacks-on-gcm/) — AES-GCM nonce 재사용 공격
- [Halborn - Clipper Malware](https://www.halborn.com/blog/post/clipper-malware-how-hackers-steal-crypto-with-clipboard-hijacking) — 클립보드 하이재킹
- [Trust Wallet - Clipboard Hijacking](https://trustwallet.com/blog/security/clipboard-hijacking-attacks-how-to-prevent-them) — 예방 방법
- [arXiv - Evaluating Argon2 Adoption (2025)](https://arxiv.org/html/2504.17121v1) — Argon2 채택 평가
- [CVE-2025-59956 - Coder AgentAPI DNS Rebinding](https://www.miggo.io/vulnerability-database/cve/CVE-2025-59956) — 에이전트 API DNS rebinding
- [Blaze InfoSec - Crypto Wallet Vulnerabilities](https://www.blazeinfosec.com/post/vulnerabilities-crypto-wallets/) — oByte wallet 사례
- [CWE-331 - Insufficient Entropy](https://cwe.mitre.org/data/definitions/331.html) — 불충분한 엔트로피
- [Discord Webhook Rate Limits](https://birdie0.github.io/discord-webhooks-guide/other/rate_limits.html) — 속도 제한
- [Cryptographic Best Practices (atoponce)](https://gist.github.com/atoponce/07d8d4c833873be2f68c34f9afc5a78a) — 암호/KDF 권장
- [Key Management Best Practices (Ubiq)](https://dev.ubiqsecurity.com/docs/key-mgmt-best-practices) — 키 래핑 패턴

### Internal (WAIaaS v0.1 설계 문서)

- v0.1 ARCH-01 (08-dual-key-architecture.md) — Dual Key 설계, selfhost 키 파생 코드
- v0.1 ARCH-02 (09-system-components.md) — 모노레포 구조, IKeyManagementService
- v0.1 ARCH-03 (10-transaction-flow.md) — 트랜잭션 파이프라인, 4-level escalation
- v0.1 ARCH-05 (12-multichain-extension.md) — IBlockchainAdapter 인터페이스
- v0.1 REL-03 (15-agent-lifecycle-management.md) — Agent 5-state 상태 머신
- v0.1 REL-04 (16-emergency-recovery.md) — Emergency triggers
- v0.1 API-02 (18-authentication-model.md) — Auth 모델
- v0.1 API-03 (19-permission-policy-model.md) — RBAC + ABAC
- v0.1 API-06 (MCP spec) — MCP 서버 설계

---

*연구 완료: 2026-02-05*
*로드맵 준비 완료: Yes*
