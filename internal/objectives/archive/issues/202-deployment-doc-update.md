# 202 — deployment.md 현행화: Admin Settings 우선 + #200 Auto-Provision 반영

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v29.2
- **상태:** FIXED
- **수정일:** 2026-02-27
- **선행:** #200 (Auto-Provision 모드)

## 현황

`docs/deployment.md`가 v1.8 시점 기준으로 작성되어, 이후 마일스톤에서 변경된 설정 모델(Admin Settings 우선)과 세션 모델(1:N 멀티월렛) 등이 반영되지 않았다. CLAUDE.md 컨벤션("Prefer Admin Settings over config.toml")과도 불일치한다.

#200 Auto-Provision이 구현되면 Docker 셋업 흐름이 크게 바뀌므로, 해당 이슈 완료 후 deployment.md를 일괄 현행화한다.

## 수정 항목

### 1. Docker Compose `.env` 파일 (144-162행)

**현재 (잘못됨):**
```bash
WAIAAS_DAEMON_MASTER_PASSWORD_HASH=$argon2id$v=19$...
WAIAAS_NOTIFICATIONS_ENABLED=true
WAIAAS_NOTIFICATIONS_TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
WAIAAS_NOTIFICATIONS_TELEGRAM_CHAT_ID=987654321
```

**수정 방향:**
- `WAIAAS_DAEMON_MASTER_PASSWORD_HASH` 제거 — 이 환경변수명은 존재하지 않음. `WAIAAS_MASTER_PASSWORD`(평문)가 올바른 이름이나, #200 이후에는 `WAIAAS_AUTO_PROVISION=true`가 표준 경로
- `WAIAAS_NOTIFICATIONS_*` 환경변수 제거 — Admin Settings 또는 `waiaas notification setup` CLI로 설정하도록 안내
- `.env`에는 인프라 설정(`WAIAAS_AUTO_PROVISION`, `WAIAAS_DAEMON_PORT`, `WAIAAS_RPC_*`)만 남김

### 2. Docker Compose 셋업 흐름

**현재:** `docker compose up` → 수동 API 호출로 지갑/세션 생성

**수정 방향 (#200 이후):**
```bash
# 1. .env 생성
echo "WAIAAS_AUTO_PROVISION=true" > .env

# 2. 기동 (init --auto-provision + start 자동 실행)
docker compose up -d

# 3. quickset (헬스체크 통과 후)
docker exec waiaas-daemon \
  node /app/packages/cli/dist/index.js quickset --data-dir /data

# 4. (선택) 오퍼레이터 인계
docker exec -it waiaas-daemon \
  node /app/packages/cli/dist/index.js set-master --data-dir /data
```

또는 docker-compose setup 컨테이너 패턴도 함께 안내.

### 3. config.toml 예시 (237-278행)

Admin Settings로 이관된 항목을 config.toml 예시에서 제거하거나 주석으로 "Admin Settings에서 관리" 표기.

**제거 대상 (Admin Settings 관리):**
- `[security]` 섹션: `session_ttl`, `max_sessions_per_wallet`, `policy_defaults_delay_seconds`, `policy_defaults_approval_timeout`
- `[notifications]` 섹션 전체: `enabled`, `telegram_bot_token`, `telegram_chat_id`, `discord_webhook_url`, `ntfy_topic`, `ntfy_server`, `slack_webhook_url`

**config.toml에 유지 (인프라/부트스트랩 설정):**
- `[daemon]`: `port`, `hostname`, `log_level`, `admin_ui`, `admin_timeout`
- `[rpc]`: RPC 엔드포인트
- `[keystore]`: Argon2id 파라미터
- `[database]`: SQLite 경로
- `[walletconnect]`: `project_id`

### 4. Post-Installation 섹션 (311-393행)

**현재:**
- 수동 `curl` API 호출로 지갑 생성 → 세션 생성 → MCP setup
- `waiaas mcp setup --wallet <id>` / `--all` (구버전 per-wallet 모델)

**수정 방향:**
- `waiaas quickset` 안내를 1순위로 배치 (지갑 + 세션 + MCP 토큰 일괄 생성)
- 수동 API 호출은 "개별 설정이 필요한 경우"로 후순위 배치
- `waiaas mcp setup --all` → 현재 1:N 세션 모델 반영

### 5. Notifications 섹션 (396-417행)

**현재:** config.toml 키 기반 안내

**수정 방향:**
- Admin Settings / Admin UI를 1순위 안내
- `waiaas notification setup` CLI를 2순위 안내
- config.toml 직접 편집은 "초기 부트스트랩 시" 한정으로 3순위

### 6. 기타 수정

| 위치 | 현재 | 수정 |
|------|------|------|
| 147행 | `npx @waiaas/cli hash-password` | 존재 여부 확인 후 제거 또는 수정 |
| 213행 | `docker compose logs waiaas` | `docker compose logs daemon` (서비스명 일치) |
| 217행 | "Upgrade" 섹션 제목 | "Update"로 변경 (#102 반영) |
| 471행 | `schema version: 16` | 실제 현재 스키마 버전으로 갱신 |
| 64행 | `"version": "1.8.0"` | 실제 현재 버전으로 갱신 (또는 placeholder) |
| 481행 | `WAIAAS_DAEMON_MASTER_PASSWORD_HASH` | `WAIAAS_MASTER_PASSWORD` 또는 `WAIAAS_AUTO_PROVISION` |

### 7. Docker Auto-Provision 섹션 신규 추가

#200 완료 후 Docker 배포의 표준 경로로 Auto-Provision 흐름을 추가한다.

- `WAIAAS_AUTO_PROVISION=true` 환경변수 설명
- recovery.key 기반 자동 패스워드 해석
- 오퍼레이터 인계 (`set-master`) 안내
- Docker Secrets와의 공존 설명 (auto-provision 시에는 시크릿 불필요)

## 문서 구조 변경 제안

현재 "Option B: Docker Compose" 내부 흐름을 다음과 같이 재구성:

```
Option B: Docker Compose
├── 1. Create Project Directory
├── 2. Create docker-compose.yml
├── 3. Configure Environment
│   ├── Auto-Provision (권장) — WAIAAS_AUTO_PROVISION=true
│   └── Manual Password — WAIAAS_MASTER_PASSWORD 또는 Docker Secrets
├── 4. Start
├── 5. Quick Setup (quickset)
├── 6. (선택) Operator Handover — set-master
├── 7. View Logs
└── 8. Update
```

## 테스트 항목

- [ ] deployment.md의 Docker Compose 예시가 클린 환경에서 실제 동작 확인
- [ ] `.env` 예시의 환경변수명이 실제 코드와 일치 확인
- [ ] config.toml 예시의 키가 실제 파싱 코드와 일치 확인
- [ ] Post-Installation의 API 호출 예시가 현재 엔드포인트/스키마와 일치 확인
- [ ] Admin Settings 안내가 CLAUDE.md 컨벤션과 일치 확인
- [ ] 서비스명(`daemon`)이 docker-compose.yml과 일치 확인
