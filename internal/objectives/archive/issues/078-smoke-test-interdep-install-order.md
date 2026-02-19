# 078 — Smoke Test 워크스페이스 상호 의존 패키지 설치 순서 오류 + CLI ESM import 부적절

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v2.2
- **상태:** FIXED
- **발견일:** 2026-02-18
- **발생 위치:** `scripts/smoke-test-published.sh:66-77, 101`, release.yml `publish-check` job
- **관련 이슈:** #076, #077 수정 이후 노출된 후속 결함

## 현상

v2.1.1-rc.1 릴리스 액션 ([run #22124419085](https://github.com/minhoyoo-iotrust/WAIaaS/actions/runs/22124419085))에서 `publish-check` job Smoke Test가 3건 실패 (Passed: 6, Failed: 3):

| 테스트 | 결과 |
|--------|------|
| `@waiaas/core` ESM import | PASS |
| `@waiaas/sdk` ESM import | PASS |
| `@waiaas/cli` ESM import | **FAIL** |
| `@waiaas/mcp` ESM import | PASS |
| `@waiaas/daemon` ESM import | **FAIL** |
| `@waiaas/adapter-solana` ESM import | PASS |
| `@waiaas/adapter-evm` ESM import | PASS |
| `waiaas` CLI binary | **FAIL** |
| `@waiaas/skills` CLI | PASS |

## 원인 분석

### 근본 원인 1: 설치 순서 불일치 (주요)

Smoke test가 tarball을 **개별 `npm install`** 호출로 한 건씩 설치하는데, 패키지 간 workspace 상호 의존성 해소 순서를 무시함.

`pnpm pack` 시 `workspace:*`가 정확한 버전(예: `2.1.1-rc.1`)으로 치환됨. npm이 tarball을 설치할 때 해당 버전의 의존성을 **npm 레지스트리에서** 해소하려고 시도하지만, 아직 publish 전이므로 레지스트리에 해당 버전이 존재하지 않음.

**패키지별 workspace 의존성 구조:**

```
@waiaas/core         → (없음)             ← PASS
@waiaas/sdk          → (없음)             ← PASS
@waiaas/mcp          → (없음)             ← PASS
@waiaas/skills       → (없음)             ← PASS
@waiaas/adapter-solana → @waiaas/core     ← PASS (core 선설치)
@waiaas/adapter-evm  → @waiaas/core       ← PASS (core 선설치)
@waiaas/daemon       → @waiaas/core, @waiaas/adapter-evm, @waiaas/adapter-solana  ← FAIL
@waiaas/cli          → @waiaas/core, @waiaas/daemon                                ← FAIL
```

현재 설치 순서 (스크립트 66-77행):

```
1. @waiaas/core          ← OK
2. @waiaas/sdk           ← OK
3. @waiaas/cli           ← FAIL: @waiaas/daemon 미설치
4. @waiaas/mcp           ← OK
5. @waiaas/daemon        ← FAIL: adapter-evm, adapter-solana 미설치
6. @waiaas/skills        ← OK
7. @waiaas/adapter-solana ← OK (but too late for daemon)
8. @waiaas/adapter-evm   ← OK (but too late for daemon)
```

`|| true`로 에러가 무시되므로 설치 실패가 로그에 나타나지 않음.

### 근본 원인 2: CLI ESM import 테스트 부적절

`packages/cli/src/index.ts`는 모듈 레벨에서 즉시 실행되는 부수효과(side effect)가 있음:

```typescript
// line 252: fire-and-forget 업데이트 체크
checkAndNotifyUpdate({ dataDir: effectiveDataDir, quiet: hasQuiet }).catch(() => {});

// line 254: CLI 파싱 즉시 실행
program.parseAsync(process.argv).catch((err: Error) => { ... });
```

따라서 `import '@waiaas/cli'`는 CLI 프로그램을 즉시 실행하므로, 라이브러리 import 테스트로 부적절. 의존성 문제가 해결되어도 이 테스트는 여전히 실패함.

### 파생 원인: CLI binary 테스트 실패

`npx waiaas --version`은 `@waiaas/cli` 패키지가 정상 설치되어야 동작. 근본 원인 1로 인해 `@waiaas/daemon` 의존성이 누락되어 실행 불가.

## 수정 방안

### 방안 A: 전체 tarball 일괄 설치 (권장)

모든 tarball을 **단일 `npm install` 호출**로 설치하면, npm이 로컬 tarball 간 상호 의존성을 자동 해소함.

```bash
# Before: 개별 설치 (순서 의존 + 레지스트리 폴백 실패)
npm install "${TARBALLS[@waiaas/core]}" --save --silent
npm install "${TARBALLS[@waiaas/sdk]}" --save --silent
for pkg_name in ...; do npm install "${TARBALLS[$pkg_name]}" --save --silent || true; done

# After: 일괄 설치 (상호 의존성 자동 해소)
npm install \
  "${TARBALLS[@waiaas/core]}" \
  "${TARBALLS[@waiaas/sdk]}" \
  "${TARBALLS[@waiaas/cli]}" \
  "${TARBALLS[@waiaas/mcp]}" \
  "${TARBALLS[@waiaas/daemon]}" \
  "${TARBALLS[@waiaas/skills]}" \
  "${TARBALLS[@waiaas/adapter-solana]}" \
  "${TARBALLS[@waiaas/adapter-evm]}" \
  --save
```

### 방안 B: CLI ESM import 제외

CLI 패키지는 실행 파일이므로 ESM import 테스트 대상에서 제외. CLI binary 테스트(`npx waiaas --version`)로 대체.

```diff
- verify_import "@waiaas/cli" "import '@waiaas/cli';" || true
+ # CLI 패키지는 실행 파일 — ESM import가 아닌 binary 테스트로 검증
```

### 방안 C: 에러 출력 가시화

디버깅을 위해 `2>/dev/null` 제거 또는 실패 시 stderr 출력:

```bash
verify_import() {
  local pkg_name="$1"
  local import_expr="$2"
  local err
  if err=$(node --input-type=module -e "$import_expr" 2>&1); then
    echo "  ✓ $pkg_name"
    PASSED=$((PASSED + 1))
  else
    echo "  ✗ $pkg_name FAILED"
    echo "    $err" | head -3
    FAILED=$((FAILED + 1))
  fi
}
```

### 적용 우선순위

1. **방안 A** (일괄 설치) — 근본 원인 해결, 필수
2. **방안 B** (CLI import 제외) — CLI 구조적 문제 회피, 필수
3. **방안 C** (에러 가시화) — 향후 디버깅 용이, 권장

## 영향 범위

- CI/CD: release.yml `publish-check` job 실패 → `docker-publish`, `deploy` job 미실행
- 릴리스 배포 차단 (v2.1.1-rc.1 배포 불가)
