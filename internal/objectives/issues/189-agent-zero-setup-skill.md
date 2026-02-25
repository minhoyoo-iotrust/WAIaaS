# 189 — 에이전트 Zero-State 셋업 스킬 + 가이드 경량화

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **마일스톤:** v28.7

## 현황

현재 `docs/guides/` 가이드 문서 3개(agent-skills, claude-code, openclaw)는 WAIaaS 데몬이 이미 설치·실행 중임을 전제한다. 최신 AI 에이전트는 패키지 설치부터 초기 설정까지 자율적으로 수행할 수 있으므로, zero-state(아무것도 설치되지 않은 상태)에서 에이전트가 스스로 셋업을 완료할 수 있는 경로가 필요하다.

## 요구사항

### 1. `setup.skill.md` 신규 생성

CLI 기반 zero-state 셋업 스킬. 에이전트가 이 스킬을 읽고 따라하면 초기 설정이 완료되는 구조.

**흐름:**
```
1. CLI 설치 확인: which waiaas || npm install -g @waiaas/cli
2. 데몬 초기화: waiaas init
3. 데몬 시작: waiaas start        ← master password 프롬프트 → 사용자 입력 대기
4. 지갑+세션 생성: waiaas quickset  ← master password 프롬프트 → 사용자 입력 대기
5. 세션 토큰 캡처 → 환경변수 설정
6. 스킬 설치: npx @waiaas/skills <platform>
```

**핵심 안내 사항:**
- `waiaas start` (첫 실행)과 `waiaas quickset` 실행 시 master password 입력 프롬프트가 표시됨
- master password는 사람만 알아야 하는 값 — 에이전트는 프롬프트가 뜨면 사용자 입력을 기다려야 함
- 에이전트는 master password를 절대 요청하거나 저장하지 않음
- 출력된 세션 토큰만 캡처하여 이후 작업에 사용

**포함할 내용:**
- Node.js 22+ 사전 요구사항
- CLI 설치 (`npm install -g @waiaas/cli`)
- `waiaas init` → `waiaas start` → `waiaas quickset` 순서
- 환경변수 설정 (WAIAAS_BASE_URL, WAIAAS_SESSION_TOKEN)
- connect-info 자기 발견 호출
- 다음 단계 안내 (다른 스킬 참조)

### 2. 가이드 문서 3개 경량화

기존 가이드에서 공통 설정 로직을 제거하고 setup 스킬로 위임. 플랫폼 고유 사항만 유지.

**변경 패턴:**
```markdown
## Quick Setup

### 1. Install WAIaaS Skills
npx @waiaas/skills <platform>

### 2. Initial Setup
Follow `waiaas-setup/SKILL.md` for daemon installation,
wallet creation, and session configuration.

### 3. (Platform-specific features)
```

**대상 파일:**
- `docs/guides/agent-skills-integration.md` — Prerequisites 경량화, 공통 설정을 setup 스킬로 위임
- `docs/guides/claude-code-integration.md` — 위와 동일 + MCP 고유 내용만 유지
- `docs/guides/openclaw-integration.md` — 위와 동일 + openclaw.json 고유 내용만 유지

### 3. README 업데이트

"Connect Your AI Agent" 섹션에 setup 스킬 참조 추가. 에이전트가 README를 읽었을 때 "스킬을 보고 초기화하면 된다"는 진입점을 제공.

**추가할 내용 (예시):**
```markdown
### Agent Self-Setup

AI agents can set up WAIaaS from scratch by following the setup skill:

1. Install skills: `npx @waiaas/skills add all`
2. Read and follow `waiaas-setup/SKILL.md`

The setup skill guides through CLI installation, daemon startup, wallet creation,
and session configuration. Master password prompts require human input.
```

### 4. skills 패키지에 setup 스킬 등록

- `skills/setup.skill.md` 생성 (루트)
- `packages/skills/skills/setup.skill.md` 동기 (npm 배포용)
- skills installer가 setup 스킬을 포함하도록 확인

## 설계 결정

| ID | 결정 | 근거 |
|----|------|------|
| D1 | CLI 패키지 기반 셋업 (데몬 직접 실행 X) | 에이전트가 CLI를 통해 데몬을 제어할 수 있어 이후 운영에도 활용 가능 |
| D2 | master password는 인터랙티브 프롬프트로만 입력 | 보안 경계 유지 — 에이전트 컨텍스트에 패스워드가 남지 않음 |
| D3 | 가이드 → 스킬 위임 구조 | 스킬이 SSoT — 내용 중복 제거, 스킬 업데이트 시 가이드 자동 반영 |
| D4 | 스킬 설치를 셋업 흐름 마지막에 배치 | 데몬이 먼저 실행되어야 스킬의 curl/CLI 명령이 동작함 |

## 테스트 항목

- [ ] `setup.skill.md` frontmatter 유효성 (name, description, category, tags, version, dispatch)
- [ ] 가이드 문서 3개에서 setup 스킬 참조 링크가 올바른지 확인
- [ ] README "Agent Self-Setup" 섹션이 정확한 명령어를 포함하는지 확인
- [ ] `skills/setup.skill.md`와 `packages/skills/skills/setup.skill.md` 내용 동기화
- [ ] 기존 스킬 목록(Available Skills 테이블)에 setup 스킬 추가 여부 확인
