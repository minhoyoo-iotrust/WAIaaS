# 118. 에이전트 연동 가이드를 docs/guides/ 폴더로 이동 + README 링크 추가

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** v26.3
- **상태:** FIXED

## 현황

에이전트 연동 가이드 3개가 `docs/` 루트에 흩어져 있어 발견이 어렵다. `docs/guides/`로 모아 가시성을 높이고 README에서 쉽게 찾아갈 수 있도록 링크를 추가한다.

`wallet-sdk-integration.md`는 지갑 앱 개발자 대상 문서로 에이전트 연동과 성격이 다르므로 `docs/` 루트에 그대로 유지한다.

## 대상 파일

| 현재 경로 | 이동 경로 | 설명 |
|-----------|-----------|------|
| `docs/openclaw-integration.md` | `docs/guides/openclaw-integration.md` | OpenClaw 봇 연동 |
| `docs/claude-code-integration.md` | `docs/guides/claude-code-integration.md` | Claude Code CLI 연동 |
| `docs/agent-skills-integration.md` | `docs/guides/agent-skills-integration.md` | 범용 27+ 에이전트 플랫폼 연동 |

유지:
| 경로 | 이유 |
|------|------|
| `docs/wallet-sdk-integration.md` | 지갑 앱 개발자 대상 — 에이전트 연동과 독자 분리 |

## 수정 사항

### 1. 폴더 생성 + 파일 이동

`docs/guides/` 디렉토리 생성 후 3개 파일 이동 (`git mv`).

### 2. README.md — Documentation 테이블에 가이드 링크 추가

에이전트 연동 가이드 3개 행 추가:

```markdown
## Documentation

| Document | Description |
|----------|-------------|
| [Security Model](docs/security-model.md) | Authentication, policy engine, Kill Switch, AutoStop |
| [Deployment Guide](docs/deployment.md) | Docker, npm, configuration reference |
| [API Reference](docs/api-reference.md) | REST API endpoints and authentication |
| [Agent Skills Integration](docs/guides/agent-skills-integration.md) | Universal guide for 27+ AI agent platforms |
| [Claude Code Integration](docs/guides/claude-code-integration.md) | Skill files + MCP server setup for Claude Code |
| [OpenClaw Integration](docs/guides/openclaw-integration.md) | Quick setup for OpenClaw bot |
| [Wallet SDK Integration](docs/wallet-sdk-integration.md) | Integration guide for wallet developers |
| [Why WAIaaS?](docs/why-waiaas/) | Background on AI agent wallet security |
| [Contributing](CONTRIBUTING.md) | Development setup, code style, testing, PR guidelines |
```

### 3. 내부 참조 업데이트

| 파일 | 변경 내용 |
|------|-----------|
| `docs/guides/agent-skills-integration.md` | 상대 경로 유지 (같은 디렉토리 내 이동이므로 변경 불필요) |

> `internal/objectives/issues/` 내 이슈 파일은 과거 기록이므로 수정하지 않는다.

## 테스트 항목

- [ ] `docs/guides/` 하위에 에이전트 연동 가이드 3개 파일 존재 확인
- [ ] `docs/wallet-sdk-integration.md`는 기존 위치에 유지됨을 확인
- [ ] `docs/` 루트에 이동 대상 3개 파일이 남아있지 않음 확인
- [ ] README.md Documentation 테이블에 에이전트 가이드 3개 + Wallet SDK 1개 링크가 모두 존재하고 경로가 올바른지 확인
- [ ] `docs/guides/agent-skills-integration.md` 내 상대 링크(Claude Code, OpenClaw)가 정상 작동하는지 확인
