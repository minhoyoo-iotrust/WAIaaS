# 마일스톤 m15-04: Admin UI 설정 관리 + WalletConnect 설정 설계 + API 스킬 파일

## 목표

운영 중 자주 변경되는 설정 항목을 config.toml 대신 Admin UI에서 관리할 수 있는 상태. 알림 채널(Telegram/Discord/Ntfy), RPC 엔드포인트, 보안 파라미터, WalletConnect 설정을 Admin UI에서 추가/수정/조회하고, 변경 사항이 데몬 재시작 없이 즉시 반영된다. 또한 프롬프트 기반 AI 에이전트가 WAIaaS API를 즉시 사용할 수 있도록 용도별 스킬 파일을 제공한다.

---

## 배경

### config.toml 직접 편집의 문제

현재 모든 데몬 설정은 `config.toml` 파일에서 관리된다. 운영 중 설정을 변경하려면:

1. SSH 또는 터미널로 서버 접속
2. config.toml 파일 직접 편집
3. 데몬 재시작 (설정 반영)

이 워크플로우는 다음 문제를 가진다:

| 문제 | 설명 |
|------|------|
| DX | 비개발자가 설정을 변경하기 어려움 |
| 재시작 필요 | config.toml은 데몬 시작 시 한 번만 읽으므로 변경 시 재시작 필수 |
| 오류 위험 | TOML 문법 오류 시 데몬 시작 실패 |
| 접근성 | Admin UI에서 에이전트·정책·트랜잭션을 관리하면서 설정만 터미널로 변경해야 하는 불일치 |

### 설정 분류 기준

| 분류 | 기준 | 관리 위치 |
|------|------|----------|
| 인프라 설정 | 데몬 시작 시 필요, 변경 시 재시작 필수 | config.toml 유지 |
| 운영 설정 | 런타임 변경 가능, 자주 조정 | Admin UI (DB 저장) |
| 시크릿 | 핵심 암호화 키 | config.toml 유지 (DB 저장 부적합) |

---

## Admin UI로 이동하는 설정

### 1. 알림 (notifications)

| 설정 | 현재 | 변경 후 | 비고 |
|------|------|---------|------|
| `enabled` | config.toml | Admin UI | 알림 전체 활성화/비활성화 |
| `telegram_bot_token` | config.toml | Admin UI (DB 암호화 저장) | credential |
| `telegram_chat_id` | config.toml | Admin UI | |
| `discord_webhook_url` | config.toml | Admin UI (DB 암호화 저장) | credential |
| `ntfy_server` | config.toml | Admin UI | |
| `ntfy_topic` | config.toml | Admin UI | |
| `locale` | config.toml | Admin UI | en/ko 선택 |
| `rate_limit_rpm` | config.toml | Admin UI | 분당 알림 제한 |

이동하지 않는 항목: `min_channels`, `health_check_interval`, `log_retention_days`, `dedup_ttl` — 고급 설정, 기본값 유지가 일반적.

### 2. RPC 엔드포인트 (rpc)

| 설정 | 현재 | 변경 후 | 비고 |
|------|------|---------|------|
| `solana_mainnet` | config.toml | Admin UI | |
| `solana_devnet` | config.toml | Admin UI | |
| `solana_testnet` | config.toml | Admin UI | |
| `evm_ethereum_mainnet` | config.toml | Admin UI | |
| `evm_ethereum_sepolia` | config.toml | Admin UI | |
| `evm_polygon_*` (2) | config.toml | Admin UI | |
| `evm_arbitrum_*` (2) | config.toml | Admin UI | |
| `evm_optimism_*` (2) | config.toml | Admin UI | |
| `evm_base_*` (2) | config.toml | Admin UI | |
| `evm_default_network` | config.toml | Admin UI | EVM 기본 네트워크 |

### 3. 보안 운영 파라미터 (security)

| 설정 | 현재 | 변경 후 | 비고 |
|------|------|---------|------|
| `session_ttl` | config.toml | Admin UI | 세션 만료 시간 |
| `max_sessions_per_wallet` | config.toml | Admin UI | 지갑당 최대 세션 |
| `rate_limit_global_ip_rpm` | config.toml | Admin UI | IP당 분당 요청 제한 |
| `rate_limit_session_rpm` | config.toml | Admin UI | 세션당 분당 요청 제한 |
| `rate_limit_tx_rpm` | config.toml | Admin UI | 트랜잭션 분당 제한 |
| `policy_defaults_delay_seconds` | config.toml | Admin UI | 시간지연 기본값 |
| `policy_defaults_approval_timeout` | config.toml | Admin UI | 승인 타임아웃 기본값 |

이동하지 않는 항목: `jwt_secret` (핵심 시크릿), `nonce_*` (인프라), `cors_origins` (인프라), `kill_switch_*` / `auto_stop_*` (미구현 기능 — v1.6).

### 4. WalletConnect

| 설정 | 현재 | 변경 후 | 비고 |
|------|------|---------|------|
| `project_id` | config.toml | Admin UI | v1.6 Desktop App에서 사용 |

### 5. 데몬 운영 (daemon)

| 설정 | 현재 | 변경 후 | 비고 |
|------|------|---------|------|
| `log_level` | config.toml | Admin UI | 디버깅 시 실시간 변경 |

---

## config.toml에 유지하는 설정

| 섹션 | 설정 | 이유 |
|------|------|------|
| daemon | port, hostname, pid_file, shutdown_timeout | 데몬 시작 시 필요, 재시작 필수 |
| daemon | log_file, log_max_size, log_max_files | 파일 시스템 설정, 인프라 |
| daemon | dev_mode, admin_ui, admin_timeout | 데몬 시작 시 결정 |
| keystore | argon2_memory, argon2_time, argon2_parallelism, backup_on_rotate | 보안 파라미터, 변경 시 기존 키 영향 |
| database | path, wal_checkpoint_interval, busy_timeout, cache_size, mmap_size | 인프라 설정, 재시작 필수 |
| security | jwt_secret | 핵심 시크릿, DB 저장 부적합 |
| security | nonce_storage, nonce_cache_max, nonce_cache_ttl | 인프라 |
| security | cors_origins | 데몬 시작 시 미들웨어 등록 |
| security | auto_stop_*, kill_switch_* | v1.6 구현 시점에 결정 |
| notifications | min_channels, health_check_interval, log_retention_days, dedup_ttl | 고급 설정, 기본값 충분 |

---

## 리서치 대상

### 1. DB 설정 저장 아키텍처

| 결정 항목 | 선택지 |
|-----------|--------|
| 테이블 구조 | A) key-value 단일 테이블 (`settings`) B) 섹션별 테이블 |
| 데이터 타입 | JSON 문자열 vs 타입별 컬럼 |
| credential 보호 | AES-GCM 암호화 (master password 파생 키) vs 평문 |
| 기본값 처리 | DB에 없으면 config.toml → 환경변수 → Zod 기본값 순 fallback |
| 마이그레이션 | 기존 config.toml 값을 DB로 자동 import 여부 |

### 2. Hot-reload 메커니즘

| 결정 항목 | 선택지 |
|-----------|--------|
| 알림 채널 | 채널 인스턴스 재생성 (disconnect → 새 credential → reconnect) |
| RPC 엔드포인트 | adapter 재연결 (disconnect → 새 URL → connect) |
| Rate limiter | 기존 카운터 리셋 vs 새 임계값만 교체 |
| 반영 시점 | API 호출 즉시 vs 주기적 폴링 |

### 3. Admin UI 설정 페이지

| 결정 항목 | 선택지 |
|-----------|--------|
| 페이지 구조 | 단일 Settings 페이지 vs 섹션별 탭 |
| credential 표시 | 마스킹(`****`) + 수정 시 입력 vs 완전 숨김 |
| 유효성 검사 | 클라이언트 사이드 vs API 사이드 Zod 검증 |
| RPC 테스트 | URL 입력 후 "테스트 연결" 버튼 |
| 알림 테스트 | credential 저장 후 "테스트 발송" 버튼 (기존 기능 연동) |

### 4. config.toml과의 공존 전략

| 결정 항목 | 선택지 |
|-----------|--------|
| 우선순위 | A) DB > config.toml > 환경변수 > 기본값 B) 환경변수 > DB > config.toml > 기본값 |
| 마이그레이션 | 최초 기동 시 config.toml → DB 자동 import |
| 하위호환 | config.toml만 사용하는 기존 사용자도 변경 없이 동작 |
| config.toml 유지 | DB에 값이 있으면 config.toml 해당 키 무시 |

### 5. WalletConnect 설정 설계

| 결정 항목 | 내용 |
|-----------|------|
| project_id 저장 | DB settings 테이블에 저장 |
| Admin UI | WalletConnect 섹션에 project_id 입력 필드 |
| 획득 방법 안내 | [WalletConnect Cloud](https://cloud.walletconnect.com/) 가입 안내 텍스트 |
| v1.6 연동 | Desktop App 구현 시 DB에서 project_id를 읽도록 설계 |

---

## 산출물

### 컴포넌트

| 컴포넌트 | 패키지 | 유형 | 내용 |
|----------|--------|------|------|
| settings 테이블 | `@waiaas/daemon` | 신규 | key-value 설정 저장 (DB 마이그레이션) |
| Settings API | `@waiaas/daemon` | 신규 | `GET/PUT /v1/admin/settings` — 설정 조회/수정 |
| SettingsService | `@waiaas/daemon` | 신규 | DB 설정 로드, hot-reload, config.toml fallback |
| Admin Settings 페이지 | `@waiaas/admin` | 신규 | 알림/RPC/보안/WalletConnect 설정 UI |
| credential 암호화 | `@waiaas/daemon` | 신규 | bot token, webhook URL 등 AES-GCM 암호화 저장 |

### API 변경

| 엔드포인트 | 유형 | 인증 | 내용 |
|-----------|------|------|------|
| `GET /v1/admin/settings` | 신규 | masterAuth | 전체 설정 조회 (credential 마스킹) |
| `PUT /v1/admin/settings` | 신규 | masterAuth | 설정 수정 + hot-reload 트리거 |
| `POST /v1/admin/settings/test-rpc` | 신규 | masterAuth | RPC 엔드포인트 연결 테스트 |

### DB 마이그레이션

| 테이블 | 구조 | 비고 |
|--------|------|------|
| `settings` | `key TEXT PK, value TEXT, encrypted INTEGER DEFAULT 0, updated_at INTEGER` | key-value 저장 |

---

## API 스킬 파일

### 배경

프롬프트 기반 AI 에이전트(OpenAI, Claude, Gemini, 로컬 LLM 등)가 WAIaaS API를 사용하려면 API 구조를 컨텍스트에 로드해야 한다. 현재 `how-to-test/waiass-api.skill.md`에 테스트용 API 레퍼런스가 있으나, 전체 API를 단일 파일에 나열하여 컨텍스트 낭비가 크고 v1.4 기능(토큰 전송, 컨트랙트, 배치)이 누락되어 있다.

마크다운 기반 스킬 파일을 용도별로 분리하여 제공하면, **코드 설치 없이 어떤 LLM이든** 파일을 로드하는 것만으로 WAIaaS를 사용할 수 있다.

### 스킬 파일 목록

| 파일 | 내용 | 대상 API |
|------|------|---------|
| `quickstart.skill.md` | 첫 사용: 월렛 생성 → 세션 → 잔액 확인 → 첫 전송 | wallets, sessions, wallet, transactions |
| `wallet.skill.md` | 월렛 생성·조회·잔액·자산·멀티체인 주소 | wallets, wallet |
| `transactions.skill.md` | 네이티브 전송, 토큰 전송, 컨트랙트 호출, Approve, 배치, 상태 조회 | transactions |
| `policies.skill.md` | 10가지 정책 타입 CRUD, 글로벌/월렛별 적용, 우선순위 | policies |
| `admin.skill.md` | 관리자: 상태 조회, 알림 설정, 설정 관리 | admin |

### 스킬 파일 구조

```yaml
---
name: "WAIaaS Wallet"
description: "월렛 생성, 잔액 조회, 토큰 자산 조회"
version: "1.4"
dispatch:
  kind: "tool"
  allowedCommands: ["curl"]
---
```

각 파일은 다음을 포함:
- **YAML 프론트매터**: 이름, 설명, 버전, 실행 권한
- **기능 요약**: 에이전트가 이 스킬로 할 수 있는 것
- **워크플로우**: 단계별 사용 흐름
- **API 레퍼런스**: 엔드포인트별 curl 예시 + 파라미터 + 응답
- **주의사항**: 단위 변환, 에러 핸들링, 체인별 차이

### 기존 파일 처리

| 파일 | 처리 |
|------|------|
| `how-to-test/waiass-api.skill.md` | `skills/` 디렉토리로 이동 후 용도별 분리 |

### 향후 배포

스킬 파일은 마크다운이므로 즉시 사용 가능하며, 사용자 규모 확대 시 npm 패키지(`@waiaas/skills`)로 배포하여 `npx @waiaas/skills add wallet transactions` 형태로 설치할 수 있다. 패키징은 CLI 스크립트(파일 복사)만 추가하면 되므로 별도 마일스톤 없이 처리 가능.

---

## 순서 의존성

| 선행 | 내용 |
|------|------|
| v1.4.3 | EVM 토큰 레지스트리 + MCP/Admin DX — Admin UI 기반 확장 |
| v1.4.4 → v1.5 | RPC 설정 hot-reload가 v1.5 가격 오라클에서도 활용 가능 |
| v1.4.4 → v1.6 | WalletConnect project_id가 DB에 준비되어 Desktop App 구현 시 바로 사용 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 리서치 | DB 설정 아키텍처, hot-reload, credential 암호화, 공존 전략 |
| 페이즈 | 5~7개 (리서치 1 + 설계 1 + DB/API 1 + Admin UI 1 + hot-reload 1~2 + 스킬 파일 1) |
| 신규/수정 파일 | 20~25개 (설정 관리 15~20 + 스킬 파일 5) |
| 테스트 | settings CRUD + hot-reload + credential 암호화 + Admin UI |

---

*생성일: 2026-02-13*
*선행: v1.4.3 (EVM 토큰 레지스트리 + MCP/Admin DX)*
*관련: v1.6 (Desktop App — WalletConnect 활용)*
