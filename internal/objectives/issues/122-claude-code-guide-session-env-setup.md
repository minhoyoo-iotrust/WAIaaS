# 122. Claude Code 연동 가이드에 세션 토큰 설정 방법 누락

- **유형:** MISSING
- **심각도:** MEDIUM
- **마일스톤:** -
- **상태:** OPEN

## 현황

`docs/guides/claude-code-integration.md`에 스킬 설치 및 MCP 연동 방법은 기술되어 있으나, Skills 방식 사용 시 **세션 토큰을 어디에 설정하는지** 안내가 없다. OpenClaw 가이드는 `openclaw.json`에 환경 변수를 넣는 방법이 명시되어 있는 반면, Claude Code 가이드는 이 단계가 빠져 있어 사용자가 설정 방법을 모른다.

## 추가할 내용

### 1. `.claude/settings.json`에 환경 변수 설정

Skills 방식 사용 시 프로젝트 `.claude/settings.json`에 세션 정보를 추가하는 단계:

```json
{
  "env": {
    "WAIAAS_BASE_URL": "http://localhost:3100",
    "WAIAAS_SESSION_TOKEN": "<your-session-token>"
  }
}
```

- `waiaas quickset` 출력에서 세션 토큰을 복사
- 마스터 패스워드는 넣지 않음 (세션 토큰만으로 충분)
- 글로벌 적용 (스킬별 분리 불가하나 프로젝트 단위 하나면 충분)

### 2. MCP 방식과의 비교 보완

MCP 방식은 `waiaas mcp setup`이 토큰을 자동 관리하므로 별도 설정 불필요하다는 점을 명시.

### 3. 스킬 파일 내 curl 예시 업데이트

스킬 문서의 curl 예시에서 환경 변수를 참조하도록 안내:

```bash
curl -s $WAIAAS_BASE_URL/v1/connect-info \
  -H "Authorization: Bearer $WAIAAS_SESSION_TOKEN"
```

## 수정 대상

| 파일 | 변경 |
|------|------|
| `docs/guides/claude-code-integration.md` | Quick Setup에 settings.json 환경 변수 설정 단계 추가 |

## 테스트 항목

- [ ] Quick Setup 섹션에 `.claude/settings.json` 환경 변수 설정 단계가 포함되어 있는지 확인
- [ ] 마스터 패스워드 없이 세션 토큰만 설정하도록 안내하는지 확인
- [ ] MCP 방식은 별도 설정 불필요하다는 안내가 있는지 확인
