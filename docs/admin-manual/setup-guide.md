---
title: "Setup Guide"
description: "WAIaaS CLI 설치, 데몬 초기화, 첫 시작, 지갑 및 세션 생성 가이드"
keywords: ["setup", "install", "init", "quickset", "daemon", "waiaas"]
date: "2026-03-18"
section: "docs"
category: "Admin Manual"
---

# WAIaaS Setup Guide

> 이 문서는 Operator(관리자)를 위한 문서입니다. AI 에이전트 접근은 sessionAuth로 제한됩니다.

WAIaaS를 처음부터 설치하고 구성하는 완전한 가이드입니다. 빈 머신에서 완전히 구성된 지갑 데몬과 세션 자격 증명까지의 과정을 안내합니다.

## 사전 요구 사항

- **Node.js 22 LTS** 이상 (`node --version`)
- **npm** 패키지 매니저 (Node.js에 포함)

## 설치 방법

WAIaaS는 두 가지 설정 모드를 지원합니다: **auto-provision**(완전 자율, AI 에이전트 권장)과 **manual**(관리자 직접 패스워드 설정).

---

## Option A: Auto-Provision (AI 에이전트 권장)

사람의 개입 없이 자동으로 설정됩니다. 데몬이 랜덤 마스터 패스워드를 생성하고 `recovery.key`에 저장합니다.

### Step 1: CLI 설치

```bash
which waiaas || npm install -g @waiaas/cli
```

### Step 2: Auto-Provision으로 초기화

```bash
waiaas init --auto-provision
```

`~/.waiaas/` 디렉토리에 다음이 생성됩니다:
- `config.toml` -- 기본 설정 파일
- `recovery.key` -- 생성된 마스터 패스워드 (한 번 읽고 안전하게 보관)

### Step 3: 데몬 시작

```bash
waiaas start
```

auto-provision된 패스워드를 사용하여 즉시 시작됩니다. 패스워드 프롬프트 없음.

데몬 실행 확인:

```bash
curl -s http://localhost:3100/health
```

기대 응답: `{"status":"ok", ...}`

### Step 4: 지갑 및 세션 생성

```bash
waiaas quickset
```

`recovery.key`에서 마스터 패스워드를 자동으로 읽습니다. 패스워드 프롬프트 없음.

출력 내용:
1. 지갑 ID 및 공개 키 (Solana + EVM)
2. **세션 토큰** (`wai_sess_...`) -- 캡처 필수
3. MCP 설정 JSON

### Step 5: 환경변수 설정

```bash
export WAIAAS_BASE_URL=http://localhost:3100
export WAIAAS_SESSION_TOKEN=<session-token-from-step-4>
```

### Step 6: 연결 검증

```bash
curl -s http://localhost:3100/v1/connect-info \
  -H "Authorization: Bearer $WAIAAS_SESSION_TOKEN"
```

### Step 7: 마스터 패스워드 강화 (설정 후)

초기 설정 후, auto-생성된 패스워드를 강력한 사람이 선택한 패스워드로 교체해야 합니다:

```bash
waiaas set-master
```

현재 패스워드(`recovery.key`에서)와 새 패스워드를 입력합니다. 변경 후 `recovery.key`를 삭제하세요.

---

## Option B: Manual Setup (관리자 직접 설정)

관리자가 직접 패스워드를 입력하는 모드입니다.

### Step 1: CLI 설치

```bash
which waiaas || npm install -g @waiaas/cli
```

### Step 2: 데이터 디렉토리 초기화

```bash
waiaas init
```

`~/.waiaas/`에 `config.toml`과 필요한 하위 디렉토리를 생성합니다. 여러 번 실행해도 안전합니다.

### Step 3: 데몬 시작

```bash
waiaas start
```

**중요: 첫 실행 시 마스터 패스워드를 묻는 프롬프트가 표시됩니다.**

- 마스터 패스워드는 모든 개인 키를 저장 시 암호화합니다
- 데몬은 패스워드 설정 후 시작됩니다

데몬 실행 확인:

```bash
curl -s http://localhost:3100/health
```

기대 응답: `{"status":"ok", ...}`

### Step 4: 지갑 및 세션 생성

```bash
waiaas quickset
```

**중요: 마스터 패스워드를 묻는 프롬프트가 표시됩니다.**

출력 내용:
1. 지갑 ID 및 공개 키 (Solana + EVM)
2. **세션 토큰** (`wai_sess_...`) -- 캡처 필수
3. MCP 설정 JSON

### Step 5: 환경변수 설정

```bash
export WAIAAS_BASE_URL=http://localhost:3100
export WAIAAS_SESSION_TOKEN=<session-token-from-step-4>
```

### Step 6: 연결 검증

```bash
curl -s http://localhost:3100/v1/connect-info \
  -H "Authorization: Bearer $WAIAAS_SESSION_TOKEN"
```

---

## 스킬 파일 설치 (양쪽 옵션 공통)

AI 에이전트 플랫폼에 맞는 WAIaaS 스킬 파일을 설치합니다:

**Agent Skills 표준 (Codex, Gemini CLI, Goose, Amp, Roo Code, Cursor, GitHub Copilot):**

```bash
npx @waiaas/skills agent-skills
```

**Claude Code:**

```bash
npx @waiaas/skills claude-code
```

**OpenClaw:**

```bash
npx @waiaas/skills openclaw
```

**Generic (현재 디렉토리에 복사):**

```bash
npx @waiaas/skills add all
```

---

## Troubleshooting

### `waiaas: command not found`

npm 글로벌 bin 디렉토리가 PATH에 없을 수 있습니다:

```bash
npm config get prefix
# <prefix>/bin 을 PATH에 추가
```

### 데몬 시작 실패

포트 3100이 이미 사용 중인지 확인:

```bash
lsof -i :3100
```

또는 `~/.waiaas/config.toml`에서 포트 변경:

```toml
[server]
port = 3200
```

### `quickset` 인증 오류

마스터 패스워드가 잘못되었을 수 있습니다. v2.4부터 데몬은 시작 시 패스워드를 검증합니다. 올바른 패스워드로 데몬을 재시작하세요:

```bash
waiaas stop
waiaas start
```
