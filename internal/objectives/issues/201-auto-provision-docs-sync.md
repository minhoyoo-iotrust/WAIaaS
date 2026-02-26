# 201 — Auto-Provision 문서 동기화

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** 미정
- **선행:** #200 (Auto-Provision 모드 구현 완료 후)

## 현황

이슈 #200에서 `--auto-provision` 모드와 `set-master` 명령이 구현되면, 기존 문서와 스킬 파일이 "마스터 패스워드 수동 입력" 전제로만 작성되어 있어 업데이트가 필요하다.

문서는 사람이 읽고, 스킬 파일은 에이전트가 읽는다. 이 원칙에 따라 대상별로 내용을 분리한다.

## 요구사항

### 1. `setup.skill.md` 업데이트 (에이전트용)

에이전트가 읽는 셋업 스킬을 `--auto-provision` 흐름으로 전환한다.

**변경 내용:**
- 기존 "master password 프롬프트가 뜨면 사용자 입력을 기다려야 함" 안내 제거
- `waiaas init --auto-provision` → `start` → `quickset` → `mcp-token` 읽기 흐름으로 교체
- 패스워드 관련 주의사항 제거 (에이전트가 패스워드를 다룰 필요 없음)

### 2. `agent-self-setup.md` 신규 생성 (사람이 읽는 셀프 셋업 가이드)

사람이 읽는 문서로, 에이전트에게 셀프 셋업을 시키는 방법을 안내한다.

**위치:** `docs/guides/agent-self-setup.md`

**포함 내용:**
- `--auto-provision` 모드 개요 및 동작 설명
- 에이전트에게 스킬 파일 제공 방법 (`npx @waiaas/skills add all`)
- 전체 셀프 셋업 흐름 (`init --auto-provision` → `start` → `quickset`)
- recovery.key 보안 고려사항 및 프로세스 유저 분리 안내 (systemd, Docker)
- 오퍼레이터 인계 절차 (`waiaas set-master`)

### 3. 기존 사람용 가이드에 셀프 셋업 가이드 링크 추가

각 가이드에서 직접 셋업 안내는 유지하되, 에이전트 셀프 셋업 경로를 연결한다.

| 파일 | 변경 내용 |
|------|----------|
| `docs/guides/agent-skills-integration.md` | "Agent Self-Setup" 섹션 추가 → `agent-self-setup.md` 링크 |
| `docs/guides/claude-code-integration.md` | 위와 동일 |
| `docs/guides/openclaw-integration.md` | 위와 동일 |

### 4. README.md 업데이트

- "Agent Self-Setup" 섹션에 `--auto-provision` 경로 추가
- `agent-self-setup.md` 가이드 링크 연결

### 5. 나머지 스킬 파일 업데이트

| 파일 | 변경 내용 |
|------|----------|
| `quickstart.skill.md` | auto-provision 상태에서 패스워드 입력 불필요 안내 |
| `admin.skill.md` | `set-master` 명령어 + 패스워드 변경 API 문서화 |
| `session-recovery.skill.md` | auto-provision 환경에서의 세션 복구 흐름 반영 |

### 6. packages/skills/ 동기

`skills/` 루트 파일 변경 시 `packages/skills/skills/` 동기 필수 (npm 배포용).

## 테스트 항목

- [ ] `setup.skill.md`에서 패스워드 수동 입력 관련 안내가 제거되었는지 확인
- [ ] `setup.skill.md`에 `--auto-provision` 흐름이 기술되어 있는지 확인
- [ ] `docs/guides/agent-self-setup.md` 신규 파일 존재 확인
- [ ] `agent-self-setup.md`에 recovery.key 보안, set-master 인계 내용 포함 확인
- [ ] 가이드 문서 3개에 `agent-self-setup.md` 링크 존재 확인
- [ ] README.md "Agent Self-Setup" 섹션에 `--auto-provision` 경로 포함 확인
- [ ] `admin.skill.md`에 `set-master` + 패스워드 변경 API 안내 확인
- [ ] `skills/` 루트와 `packages/skills/skills/` 내용 동기화 확인
