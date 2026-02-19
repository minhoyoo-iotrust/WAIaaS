# 084 — @waiaas/daemon npm 패키지에 Admin UI 정적 파일 누락 — turbo 캐시 히트 시 postbuild 건너뜀

| 필드 | 값 |
|------|-----|
| **유형** | BUG |
| **심각도** | HIGH |
| **마일스톤** | v2.3 |
| **상태** | FIXED |
| **발견일** | 2026-02-18 |

## 증상

npm으로 설치한 `@waiaas/daemon`에서 `http://127.0.0.1:3100/admin` 접속 시 404 에러. 패키지에 `public/admin/` 디렉토리가 누락되어 Admin UI 정적 파일(index.html, JS, CSS)이 없다.

```bash
npm pack @waiaas/daemon@2.1.4-rc.1 --dry-run 2>&1 | grep "public"
# → 출력 없음 (public/ 디렉토리 자체가 패키지에 포함되지 않음)
```

Docker 이미지에서는 Admin UI가 정상 동작. npm 패키지에서만 발생.

## 근본 원인 (3단계 체인)

### 1. PRIMARY — turbo.json outputs 선언 누락

`turbo.json`의 `@waiaas/admin#build` 태스크:

```json
"@waiaas/admin#build": {
  "dependsOn": [],
  "outputs": ["dist/**"]   // ← packages/daemon/public/admin/** 누락
}
```

admin의 `postbuild` 스크립트가 `packages/admin/dist/*` → `packages/daemon/public/admin/`으로 복사하는 구조인데, turbo의 `outputs`에는 `dist/**`만 선언됨. turbo v2는 패키지 디렉토리 기준 상대 경로만 지원하므로 `../daemon/public/admin/**` 같은 크로스 패키지 사이드 이펙트를 선언할 수 없다.

**결과:** turbo 캐시가 warm할 때 `postbuild` 스크립트 재실행이 건너뛰어지고, `daemon/public/admin/`이 비어있는 채로 남음.

### 2. CI 잡 실행 순서와 캐시 공유

```
test job          → pnpm turbo run build
                    COLD CACHE → postbuild 실행 → admin copy ✓
                    turbo가 admin#build 결과를 SHA 키로 캐싱
                    (admin/dist/**만 캐싱, daemon/public/admin/은 캐싱 안 됨)

publish-check job → needs: test → 동일 SHA 캐시 복원
                    pnpm turbo run build
                    WARM CACHE HIT → postbuild 건너뜀
                    daemon/public/admin/ 비어있음 → dry-run에 포함 안 됨

deploy job        → needs: [test, publish-check, ...]
                    pnpm turbo run build
                    WARM CACHE HIT → postbuild 건너뜀
                    pnpm publish → public/ 없이 배포됨
```

Docker가 정상인 이유: Dockerfile은 독립 환경(turbo 캐시 없음)에서 빌드되므로 항상 COLD CACHE → postbuild 정상 실행.

### 3. SECONDARY — 검증 부재

- `publish-check` dry-run이 패키지 파일 목록을 출력하지만 `public/admin/index.html` 존재 여부를 검증하는 assertion이 없음
- `scripts/smoke-test-published.sh`가 ESM import만 검증하고 admin 정적 파일 포함 여부는 검증하지 않음

## 수정 방안

### A. daemon prebuild에서 admin 복사 (권장)

admin의 `postbuild`에서 복사하는 대신, daemon의 빌드 과정에서 직접 복사:

1. `packages/admin/package.json`에서 `postbuild` 스크립트 제거
2. `packages/daemon/package.json`에 `prebuild` 스크립트 추가:

```json
"prebuild": "cp -r ../admin/dist/* public/admin/ 2>/dev/null || true"
```

3. `turbo.json`의 `@waiaas/daemon#build` dependsOn에 `@waiaas/admin#build` 확인 (이미 있음)
4. `turbo.json`의 `@waiaas/daemon#build` outputs에 `public/**` 추가:

```json
"@waiaas/daemon#build": {
  "dependsOn": ["@waiaas/admin#build", "@waiaas/core#build"],
  "outputs": ["dist/**", "public/**"]
}
```

이 방법으로 turbo 캐시가 `daemon/public/**`도 포함하게 되어 warm cache에서도 정상 복원.

### B. release.yml에 명시적 복사 스텝 (대안)

deploy/publish-check job에서 turbo build 후 명시적 복사:

```yaml
- name: Copy admin UI to daemon
  run: cp -r packages/admin/dist/* packages/daemon/public/admin/
```

## 재발 방지

### 1. publish-check dry-run에 admin 파일 검증 추가

```bash
# release.yml publish-check job
if [ ! -f packages/daemon/public/admin/index.html ]; then
  echo "ERROR: Admin UI files missing from daemon/public/admin/"
  exit 1
fi
```

### 2. smoke-test-published.sh에 admin 검증 추가

```bash
# daemon 패키지 내 public/admin/index.html 존재 확인
DAEMON_DIR=$(node -e "console.log(require.resolve('@waiaas/daemon/package.json').replace('/package.json',''))")
if [ ! -f "$DAEMON_DIR/public/admin/index.html" ]; then
  echo "FAIL: Admin UI not included in @waiaas/daemon package"
  exit 1
fi
```

## 영향 범위

- `packages/admin/package.json` — postbuild 스크립트 제거
- `packages/daemon/package.json` — prebuild 스크립트 추가
- `turbo.json` — daemon outputs에 `public/**` 추가
- `.github/workflows/release.yml` — publish-check에 admin 파일 검증 추가
- `scripts/smoke-test-published.sh` — admin 파일 검증 추가

## 관련 파일

| 파일 | 역할 |
|------|------|
| `packages/admin/vite.config.ts` | `outDir: 'dist'` — admin 빌드 결과물 위치 |
| `packages/daemon/package.json` | `files: ["dist", "public"]` — publish 대상 |
| `.gitignore` | `packages/daemon/public/` — git 추적 제외 (빌드 아티팩트) |
| `turbo.json` | 빌드 의존성 + outputs 캐시 선언 |
