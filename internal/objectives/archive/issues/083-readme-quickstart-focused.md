# 083 — README를 npm quickstart 중심으로 재구성

| 필드 | 값 |
|------|-----|
| **유형** | ENHANCEMENT |
| **심각도** | MEDIUM |
| **마일스톤** | v2.3 |
| **상태** | FIXED |
| **발견일** | 2026-02-18 |

## 현재 문제

- Quick Start 섹션에 `init` → `start` → `quickstart` 3단계가 나열되어 있으나, Docker와 SDK 코드 블록이 동일 레벨로 바로 아래에 위치하여 초보자의 시선이 분산됨
- `quickstart` 명령어가 지갑 생성 + MCP 토큰 발급 + Claude Desktop 설정 출력을 한 번에 해준다는 핵심 가치가 잘 드러나지 않음
- 처음 접하는 사용자에게 npm 설치가 가장 간단한 경로인데, Docker/SDK가 같은 위치에서 경쟁함
- mainnet 모드 가이드가 별도로 없음
- 데몬 시작 후 AI 에이전트 연동 방법(Skill 파일 vs MCP)이 명확하게 안내되지 않음

## 변경 방향

### 1. Quick Start를 최상단 핵심 섹션으로 — npm 설치 흐름만 표시

```bash
npm install -g @waiaas/cli
waiaas init                        # 데이터 디렉토리 + config.toml 생성
waiaas start                       # 데몬 시작 (마스터 비밀번호 설정)
waiaas quickstart --mode testnet   # 지갑 + MCP 세션 + Claude Desktop 설정 일괄 생성
```

quickstart는 데몬이 실행 중인 상태에서 동작하며, 한 명령으로 다음을 완료:
- Solana Devnet + EVM Sepolia 지갑 자동 생성
- 각 지갑에 MCP 세션 토큰 자동 발급 + 토큰 파일 기록
- Claude Desktop MCP 설정 JSON 출력 (복사 → 붙여넣기)

### 2. Mainnet 전환 안내

testnet으로 시작하더라도 나중에 Admin UI(`http://127.0.0.1:3100/admin`)에서 mainnet 지갑을 추가할 수 있음을 안내. 처음부터 mainnet으로 시작하고 싶은 경우:

```bash
waiaas quickstart --mode mainnet
```

- Solana Mainnet + EVM Ethereum Mainnet 지갑 생성
- mainnet에서는 정책 설정(Spending Limit 등)과 Owner 등록을 권장하는 안내 포함

### 3. AI 에이전트 연동 가이드 — 두 가지 경로 제시

quickstart 완료 후 에이전트 연동 방법을 두 가지로 안내:

#### 경로 A: MCP 연동 (Claude Desktop / Claude Code)

```bash
# quickstart가 출력한 JSON을 claude_desktop_config.json에 추가
# 또는 자동 등록:
waiaas mcp setup --all
```

- Claude Desktop, Claude Code 등 MCP 지원 에이전트에 적합
- 데몬이 MCP 서버로 동작하여 에이전트가 도구로 직접 호출

#### 경로 B: Skill 파일 연동 (범용 AI 에이전트)

```bash
npx @waiaas/skills add all
```

- MCP를 지원하지 않는 에이전트나, REST API 기반으로 직접 연동하는 경우
- .skill.md 파일을 에이전트 컨텍스트에 포함시키면 API 사용법을 자동 학습
- quickstart, wallet, transactions, policies, admin, actions, x402 스킬 제공

### 4. Docker / SDK를 하위 섹션으로 이동

- Docker: "Alternative: Docker" 섹션으로 이동
- SDK 코드 예시: "Using the SDK" 별도 섹션으로 분리
- 첫 화면에서는 npm → quickstart → 에이전트 연동 흐름만 보이도록 구성

### 5. 변경하지 않는 섹션

- The Problem / How It Works (프로젝트 소개)
- Admin UI
- Supported Networks
- Features
- Documentation / License

## 영향 범위

- `README.md` — 섹션 순서 재배치 + Quick Start 보강 + 에이전트 연동 가이드 추가
