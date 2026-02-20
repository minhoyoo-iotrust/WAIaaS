# 111 — OpenClaw 연동 퀵 가이드 + 스킬 설치 명령어

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** TBD
- **상태:** RESOLVED
- **등록일:** 2026-02-20

## 배경

OpenClaw은 Agent Skills 오픈 표준(agentskills.io)을 따르는 오픈소스 AI 에이전트 봇이다. WAIaaS는 이미 7개의 `.skill.md` 파일을 제공하지만, OpenClaw은 `디렉토리/SKILL.md` 구조와 다른 frontmatter 형식을 사용한다. 사용자가 `npx @waiaas/skills openclaw` 한 줄로 WAIaaS 스킬을 OpenClaw에 설치할 수 있어야 한다.

## 구현 범위

### 1. `docs/openclaw-integration.md` — 퀵 가이드 (영문)

기존 `docs/deployment.md` 스타일 준수. 섹션 구성:

- Prerequisites (WAIaaS daemon + OpenClaw 설치)
- Quick Setup 3단계:
  1. `waiaas quickset --mode mainnet` (지갑/세션 생성, **메인넷 기본**)
  2. `npx @waiaas/skills openclaw` (스킬 설치)
  3. `openclaw.json`에 세션 토큰 환경변수 설정
- Verification (OpenClaw에서 잔액 조회 등 테스트)
- Available Skills 테이블 (7개)
- Troubleshooting

### 2. `packages/skills/src/openclaw.ts` — OpenClaw 설치 로직 (신규)

핵심 함수: `installOpenClawSkills(opts: { force: boolean }): void`

**동작:**
1. `~/.openclaw/skills/` 경로 resolve (존재하지 않으면 mkdir -p)
2. 각 스킬별 디렉토리 생성: `~/.openclaw/skills/waiaas-{name}/`
3. 소스 `.skill.md` 읽기 → frontmatter 변환 → `SKILL.md`로 쓰기
4. 설치 결과 출력 + `openclaw.json` 설정 스니펫 안내

**Frontmatter 변환 규칙:**

| WAIaaS 필드 | OpenClaw 변환 |
|------------|--------------|
| `name: "WAIaaS Quickset"` | `name: waiaas-quickstart` (레지스트리명 기반, lowercase hyphenated) |
| `description` | 그대로 유지 |
| `category`, `tags`, `version`, `dispatch` | 제거 (OpenClaw 불필요 필드) |
| 본문 (마크다운) | 그대로 보존 |

**설치 후 출력 예시:**

```
Installed 7 WAIaaS skills to ~/.openclaw/skills/

  waiaas-quickstart/SKILL.md
  waiaas-wallet/SKILL.md
  waiaas-transactions/SKILL.md
  waiaas-policies/SKILL.md
  waiaas-admin/SKILL.md
  waiaas-actions/SKILL.md
  waiaas-x402/SKILL.md

Add to ~/.openclaw/openclaw.json:

  {
    "skills": {
      "entries": {
        "waiaas-quickstart": {
          "env": {
            "WAIAAS_BASE_URL": "http://localhost:3100",
            "WAIAAS_MASTER_PASSWORD": "<your-master-password>",
            "WAIAAS_SESSION_TOKEN": "<your-session-token>"
          }
        }
      }
    }
  }
```

### 3. `packages/skills/src/cli.ts` — 커맨드 추가

- `main()` switch문에 `openclaw` 케이스 추가
- `printHelp()`에 `openclaw` 설명 한 줄 추가

## 수정/생성 파일

| 파일 | 변경 |
|------|------|
| `docs/openclaw-integration.md` | 신규 — 퀵 가이드 |
| `packages/skills/src/openclaw.ts` | 신규 — OpenClaw 설치 로직 |
| `packages/skills/src/cli.ts` | 수정 — `openclaw` 커맨드 + help 텍스트 추가 |

## 선행 의존

- 이슈 112 (기본 모드 mainnet 전환)와 함께 적용하면 가이드의 일관성 확보

## 테스트 항목

### 단위 테스트
1. frontmatter 변환 함수가 WAIaaS 형식을 OpenClaw 형식으로 정확히 변환하는지 확인
2. 디렉토리명이 `waiaas-{registryName}` 패턴을 따르는지 확인
3. `--force` 플래그가 기존 파일 덮어쓰기를 허용하는지 확인
4. `~/.openclaw/skills/` 미존재 시 자동 생성되는지 확인

### 통합 테스트
5. `node dist/cli.js openclaw` 실행 → `~/.openclaw/skills/waiaas-*/SKILL.md` 7개 생성 확인
6. 생성된 SKILL.md frontmatter에 `name: waiaas-*`, `description:` 만 포함되는지 확인
