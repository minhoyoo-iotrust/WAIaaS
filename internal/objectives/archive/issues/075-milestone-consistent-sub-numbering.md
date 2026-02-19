# Issue #075: 마일스톤 파일명에 -00 서브순번 통일

- **유형**: ENHANCEMENT
- **심각도**: LOW
- **마일스톤**: m20
- **상태**: FIXED

## 현황

Issue #074에서 `m{seq}-{slug}.md` 명명 규칙을 도입했으나, 메이저 마일스톤과 서브 마일스톤의 형식이 불일치:

```
m14-sdk-mcp-notifications.md        ← 서브순번 없음
m14-01-admin-ui-design.md           ← 서브순번 있음
```

파일명 정렬 시 `m14-sdk...`가 `m14-01-admin...`보다 앞에 오지만, 패턴이 불일치.

## 변경 사항

### 모든 마일스톤에 서브순번 부여

메이저 마일스톤은 `-00`, 서브는 `-01`~`-99`:

```
m14-00-sdk-mcp-notifications.md
m14-01-admin-ui-design.md
m14-02-admin-ui-impl.md
m14-03-mcp-multi-agent.md
m14-04-notification-trigger-integration.md
```

독립 마일스톤도 동일:

```
m18-00-quality-cicd.md
m19-00-upgrade-distribution.md
m20-00-release.md
```

### 통일 패턴

```
m{seq}-{sub}-{slug}.md
```

모든 파일이 이 형식을 따르므로 glob 패턴 `m[0-9][0-9]-[0-9][0-9]-*.md`로 일괄 매칭 가능.

### CLAUDE.md 규칙 (영문)

```
Milestone objective files are placed in `internal/objectives/` with the format `m{seq}-{sub}-{slug}.md`.
  - `{seq}`: two-digit sequence number (01-99)
  - `{sub}`: two-digit sub-sequence (00 for main, 01-99 for sub-milestones or insertions)
  - `{slug}`: kebab-case topic name
Issue files are placed in `internal/objectives/issues/` with the format `{NNN}-{slug}.md`.
```

## 완료 기준

- [x] 아카이브 + 활성 목표 문서 전체에 `-00` 서브순번 적용
- [x] CLAUDE.md 명명 규칙 영문으로 갱신
- [x] TRACKER.md 및 문서 내부 상호 참조 링크 수정
