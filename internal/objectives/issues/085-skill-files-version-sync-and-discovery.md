# 085 — 스킬 파일 버전 자동 동기화 + 연결 디스커버리 가이드 추가

| 필드 | 값 |
|------|-----|
| **유형** | ENHANCEMENT |
| **심각도** | MEDIUM |
| **마일스톤** | v2.3 |
| **상태** | FIXED |
| **발견일** | 2026-02-18 |

## 증상

1. **버전 불일치**: 스킬 파일 frontmatter `version`이 수동 관리되어 실제 배포 버전과 불일치

| 파일 | 표기 버전 | 현재 패키지 버전 |
|------|-----------|------------------|
| quickstart.skill.md | 1.8.0 | 2.1.4-rc.1 |
| admin.skill.md | 1.8.0 | 2.1.4-rc.1 |
| wallet.skill.md | 1.6.1 | 2.1.4-rc.1 |
| transactions.skill.md | 1.5.3 | 2.1.4-rc.1 |
| policies.skill.md | 1.5.3 | 2.1.4-rc.1 |
| actions.skill.md | 1.5.0 | 2.1.4-rc.1 |
| x402.skill.md | 1.5.1 | 2.1.4-rc.1 |

2. **디스커버리 부재**: 스킬 파일은 API 레퍼런스 문서로만 기능하여 AI 에이전트가 실제 데몬에 연결하는 방법을 알 수 없음. Claude Code에서 스킬 파일 설치 후 조회 시 "실제 연결된 지갑 주소나 잔액 정보는 포함되어 있지 않습니다"로 응답.

## 근본 원인

### 1. 버전 수동 관리

스킬 파일의 frontmatter `version` 필드가 하드코딩되어 있어 release-please가 `package.json` 버전을 올려도 `.skill.md` 파일은 갱신되지 않음.

### 2. 연결 컨텍스트 부재

MCP는 `WAIAAS_BASE_URL`, `WAIAAS_WALLET_ID` 등이 설정에 내장되어 런타임 컨텍스트를 자동 제공하지만, 스킬 파일은 정적 마크다운이라 실제 데몬 접속 정보를 포함할 수 없음. quickstart.skill.md가 `http://localhost:3100` placeholder만 사용하고, 실행 중인 데몬 탐색이나 기존 월렛 조회 흐름이 없음.

## 수정 방안

### A. 빌드 시점 버전 자동 주입

`packages/skills/package.json`에 prebuild 스크립트 추가하여 빌드마다 `package.json` 버전을 모든 `.skill.md` frontmatter에 주입:

```json
"scripts": {
  "prebuild": "node scripts/sync-version.mjs",
  "build": "tsc -p tsconfig.build.json"
}
```

`packages/skills/scripts/sync-version.mjs`:

```js
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const skillsDir = join(root, 'skills');

for (const file of readdirSync(skillsDir)) {
  if (!file.endsWith('.skill.md')) continue;
  const filePath = join(skillsDir, file);
  const content = readFileSync(filePath, 'utf-8');
  const updated = content.replace(/^version:\s*".*"$/m, `version: "${version}"`);
  if (content !== updated) {
    writeFileSync(filePath, updated);
    console.log(`  SYNC  ${file} → v${version}`);
  }
}
```

release-please가 `package.json` 버전을 올리면 → 다음 빌드 시 prebuild가 자동 주입 → 스킬 파일 버전이 항상 패키지 버전과 동기화.

### B. quickstart.skill.md에 디스커버리 섹션 추가

스킬 파일만으로도 AI 에이전트가 실행 중인 데몬을 탐색할 수 있도록 quickstart.skill.md 상단에 "연결 확인" 흐름 추가:

```markdown
## 0. 연결 확인 (Connection Discovery)

데몬이 실행 중인지 확인하고 기존 월렛을 조회합니다.

### 데몬 상태 확인
curl http://localhost:3100/health

### 기존 월렛 조회 (마스터 비밀번호 필요)
curl http://localhost:3100/v1/wallets \
  -H "X-Master-Password: <master-password>"

> **참고**: 마스터 비밀번호는 `waiaas init` 시 설정한 값입니다.
> 데몬이 실행 중이지 않으면 `waiaas start`로 시작하세요.
>
> 스킬 파일은 API 레퍼런스입니다. 실제 데몬과 상호작용하려면
> MCP 서버를 함께 설정하거나, 사용자가 데몬 URL과 인증 정보를 제공해야 합니다.
```

### C. 스킬 파일 내용 최신화 검토

v1.5~v1.8 이후 추가/변경된 API를 확인하여 스킬 파일에 반영:

- 멀티체인 월렛 관련 엔드포인트 (v1.4.6+)
- sign-only API 확장 (v1.4.7+)
- Admin Settings 관련 변경 (v1.4.4+)
- 기타 v2.0까지의 API 변경사항

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `packages/skills/package.json` | prebuild 스크립트 추가 |
| `packages/skills/scripts/sync-version.mjs` | 신규 — 버전 주입 스크립트 |
| `packages/skills/skills/quickstart.skill.md` | 디스커버리 섹션 추가 + 버전 갱신 |
| `packages/skills/skills/*.skill.md` (7개) | v1.5~v1.8 → 현재 버전 갱신 + 내용 최신화 |
| `turbo.json` | skills#build outputs에 `skills/**` 추가 (prebuild 변경분 캐싱) |

## 우선순위

1. **높음**: 버전 자동 동기화 (A) — 한번 설정하면 이후 자동
2. **중간**: 디스커버리 섹션 (B) — 스킬 파일 단독 사용 시 UX 개선
3. **낮음**: 내용 최신화 (C) — API diff 확인 후 반영
