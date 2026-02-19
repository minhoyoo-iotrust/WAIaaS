# 092 — npm 패키지 homepage + repository URL 잘못 설정 — 패키지 페이지에서 리포지토리 접근 불가

| 필드 | 값 |
|------|-----|
| **유형** | BUG |
| **심각도** | MEDIUM |
| **마일스톤** | v2.3 |
| **상태** | OPEN |
| **발견일** | 2026-02-19 |

## 증상

npmjs.com 패키지 페이지에서 Homepage와 Repository 링크가 잘못된 URL을 가리킴:
- **Homepage**: `https://github.com/minho-yoo/waiaas#readme` — 존재하지 않는 경로
- **Repository**: npm에 발행된 버전의 repository URL이 실제 리포지토리와 불일치

사용자가 npm 패키지 페이지에서 소스 코드나 문서에 접근할 수 없음.

## 근본 원인

### 1. homepage URL 오류 (전 패키지 공통)

모든 9개 package.json의 `homepage` 필드가 잘못된 GitHub 사용자명/경로를 사용:

```json
"homepage": "https://github.com/minho-yoo/waiaas#readme"
```

올바른 URL: `https://github.com/minhoyoo-iotrust/WAIaaS#readme`

### 2. repository URL npm 반영 불일치

현재 코드의 `repository.url`은 git remote과 일치하지만, npm에 발행된 버전에는 이전 값이 반영되어 있을 수 있음. 재발행으로 해결 필요.

```json
// 현재 코드 (올바름)
"repository": {
  "type": "git",
  "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git"
}
```

## 수정 방안

### 1. homepage URL 수정 (9개 패키지)

모든 package.json의 `homepage` 필드를 올바른 URL로 변경:

```json
"homepage": "https://github.com/minhoyoo-iotrust/WAIaaS#readme"
```

대상 파일 (9개):
- `package.json` (루트)
- `packages/core/package.json`
- `packages/daemon/package.json`
- `packages/cli/package.json`
- `packages/sdk/package.json`
- `packages/mcp/package.json`
- `packages/admin/package.json`
- `packages/skills/package.json`
- `packages/adapters/solana/package.json`
- `packages/adapters/evm/package.json`

### 2. repository URL 확인 + 재발행

현재 코드의 repository URL이 올바른지 확인하고, 다음 릴리스에서 올바른 메타데이터가 npm에 반영되도록 보장.

### 3. bugs URL도 함께 확인

`bugs.url` 필드가 있다면 동일하게 올바른 경로를 가리키는지 확인.

## 테스트 항목

| # | 테스트 | 검증 내용 |
|---|--------|-----------|
| 1 | homepage URL 형식 검증 | 모든 package.json의 homepage가 올바른 GitHub 리포 URL인지 확인 |
| 2 | repository URL 일관성 | 모든 package.json의 repository.url이 git remote과 일치하는지 확인 |
| 3 | bugs URL 일관성 | bugs.url이 존재하면 올바른 리포 URL인지 확인 |
| 4 | npm publish 후 메타데이터 확인 | 발행 후 `npm view @waiaas/core homepage repository.url`로 올바른 URL 반영 확인 |

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `packages/*/package.json` (9개) | `homepage` URL 수정 |
| `package.json` (루트) | `homepage` URL 수정 (npm 미발행이지만 일관성 유지) |
