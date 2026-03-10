# 303: agent-uat 스킬을 .claude/skills/로 이동

- **Type:** ENHANCEMENT
- **Priority:** LOW
- **Status:** FIXED
- **Created:** 2026-03-10

## 설명

`skills/agent-uat.skill.md`는 개발/검증용 스킬인데, 에이전트가 WAIaaS API를 사용할 때 참조하는 런타임 스킬 파일들(`skills/*.skill.md`)과 같은 디렉토리에 위치해 있다.

- `skills/` 폴더: 에이전트가 WAIaaS API를 사용할 때 참조하는 레퍼런스 문서 (quickstart, wallet, transactions 등)
- `agent-uat`: 개발자가 UAT 검증 시 사용하는 Claude Code 스킬

성격이 다르므로 분리가 필요하다.

## 변경 사항

1. `skills/agent-uat.skill.md` 삭제
2. `.claude/skills/agent-uat/SKILL.md` 생성 (frontmatter에서 `dispatch` 필드 제거, `name: agent-uat` 형식으로 변환)
3. `/agent-uat` slash command로 Claude Code에서 직접 호출 가능하게 함

## 테스트 항목

- `/agent-uat` 명령이 Claude Code에서 인식되는지 확인
- `/agent-uat run testnet` 등 서브커맨드 동작 확인
- 기존 `skills/` 폴더의 다른 스킬 파일에 영향 없는지 확인
- `verify:agent-uat` 스크립트가 새 경로를 참조하도록 업데이트 (또는 제거 여부 판단)
