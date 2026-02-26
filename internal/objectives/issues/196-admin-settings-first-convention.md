# #196 CLAUDE.md에 Admin Settings 우선 사용 컨벤션 추가

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** OPEN

## 현상

현재 `CLAUDE.md`의 Configuration 섹션은 `config.toml`과 Admin Settings의 역할을 설명하지만, 어느 쪽을 우선해야 하는지 명시하지 않는다. 가이드 문서 작성이나 사용자 안내 시 `config.toml` 직접 편집을 먼저 제안하게 되는 경향이 있다.

Admin Settings(Admin UI, CLI 명령어, Admin Settings API)는 핫 리로드를 지원하고, 자격증명을 암호화 저장하며, 데몬 재시작이 불필요하다. 따라서 런타임 설정은 Admin Settings를 우선 사용하고, `config.toml`은 초기 부트스트랩 및 인프라 설정에만 사용하도록 컨벤션을 명확히 해야 한다.

## 개선 방안

`CLAUDE.md`의 `## Configuration` 섹션에 다음 규칙 추가:

```markdown
- **Prefer Admin Settings over config.toml.** For runtime configuration, use Admin UI, CLI commands (`waiaas notification setup`, etc.), or the Admin Settings API (`PUT /v1/admin/settings`). Direct config.toml editing should only be used for initial bootstrap and infrastructure settings (port, hostname, database path). When writing documentation and guides, present Admin Settings methods first.
```

## 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `CLAUDE.md` | Configuration 섹션에 Admin Settings 우선 컨벤션 1줄 추가 |

## 테스트 항목

- 비기능 변경이므로 테스트 항목 없음
