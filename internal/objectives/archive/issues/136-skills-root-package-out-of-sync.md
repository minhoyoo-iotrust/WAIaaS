# 136 — 루트 skills/와 packages/skills/skills/ 내용 불일치로 npm 패키지에 오래된 스킬 파일 배포

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v27.0
- **상태:** FIXED
- **등록일:** 2026-02-21

## 현상

마일스톤 작업 시 CLAUDE.md 규칙에 따라 루트 `skills/` 디렉토리의 스킬 파일을 업데이트하지만, npm 패키지 배포에 사용되는 `packages/skills/skills/`는 별도 수동 업데이트가 필요하여 내용이 불일치한다.

### 현재 차이

| 파일 | `skills/` (루트) | `packages/skills/skills/` | 차이 |
|------|-----------------|--------------------------|------|
| actions.skill.md | 7,269 B | 6,946 B | +323 B |
| admin.skill.md | 27,944 B | 26,218 B | +1,726 B |
| policies.skill.md | 25,096 B | 24,231 B | +865 B |
| quickstart.skill.md | 10,393 B | 11,327 B | -934 B |
| transactions.skill.md | 25,447 B | 24,845 B | +602 B |
| wallet.skill.md | 34,271 B | 29,573 B | +4,698 B |
| x402.skill.md | 6,969 B | 6,699 B | +270 B |

7개 파일 전부 내용이 다르다. npm 사용자(`npx @waiaas/skills install`)가 받는 스킬 파일이 최신 API와 불일치.

### 원인

`packages/skills/scripts/sync-version.mjs`는 **version 문자열만 동기화**하고 파일 내용은 복사하지 않는다:

```javascript
// sync-version.mjs — 현재
const updated = content.replace(/^version:\s*".*"$/m, `version: "${version}"`);
```

두 디렉토리가 독립적으로 편집되므로, 마일스톤에서 루트 `skills/`를 업데이트해도 `packages/skills/skills/`에 반영되지 않는다.

## 수정 범위

### 1. 루트 `skills/`를 SSoT로 지정하고 빌드 시 자동 복사

`packages/skills/package.json`의 `prebuild` 스크립트에서 루트 `skills/` → `packages/skills/skills/`로 파일을 복사한 후 버전을 동기화:

```json
{
  "scripts": {
    "prebuild": "node scripts/sync-skills.mjs",
    "build": "tsc"
  }
}
```

`sync-skills.mjs` (sync-version.mjs 대체):
```javascript
// 1. 루트 skills/ → packages/skills/skills/ 전체 복사
// 2. 복사된 파일의 version 문자열을 package.json 버전으로 치환
```

### 2. `packages/skills/skills/` 디렉토리를 .gitignore에 추가

빌드 시 자동 생성되므로 git에서 추적할 필요 없음. 루트 `skills/`만 git으로 관리:

```gitignore
# packages/skills/.gitignore
skills/
```

또는 루트 `.gitignore`에 추가:
```gitignore
packages/skills/skills/
```

### 3. CI/릴리스 파이프라인에서 빌드 보장

`release.yml`의 publish 단계에서 `pnpm turbo run build`가 이미 실행되므로, prebuild 훅이 자동으로 파일을 동기화. 추가 변경 불필요.

### 4. 현재 불일치 즉시 해소

루트 `skills/` 내용을 `packages/skills/skills/`에 복사하여 현재 불일치를 해소하고 커밋.

### 영향 범위

- `packages/skills/scripts/sync-version.mjs` → `sync-skills.mjs`로 교체 (복사 + 버전 동기화)
- `packages/skills/package.json` — prebuild 스크립트 변경
- `.gitignore` 또는 `packages/skills/.gitignore` — `skills/` 디렉토리 무시 추가
- `packages/skills/skills/*.skill.md` — git 추적 제거 (루트만 추적)

## 테스트 항목

### 단위 테스트

1. `pnpm -F @waiaas/skills run build` 실행 후 `packages/skills/skills/`의 내용이 루트 `skills/`와 동일한지 확인
2. 빌드 후 `packages/skills/skills/*.skill.md`의 version 필드가 `package.json` 버전과 일치하는지 확인
3. 루트 `skills/` 파일을 수정하고 빌드하면 `packages/skills/skills/`에 반영되는지 확인

### 배포 테스트

4. `pnpm -F @waiaas/skills pack` 후 tarball에 최신 스킬 파일이 포함되는지 확인
5. `npx @waiaas/skills install` 실행 시 설치되는 스킬 파일이 루트 `skills/`와 동일한지 확인

### 회귀 테스트

6. `pnpm turbo run build`에서 skills 패키지 빌드가 정상 완료되는지 확인
7. release.yml 릴리스 파이프라인에서 skills 패키지 배포가 정상 동작하는지 확인
