# 077 — Smoke Test pnpm pack 출력 경로 이중화로 install 실패

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** m21
- **상태:** OPEN
- **발견일:** 2026-02-18
- **발생 위치:** `scripts/smoke-test-published.sh:48`, release.yml `publish-check` job
- **관련 이슈:** #076 수정의 후속 결함

## 현상

v2.1.1-rc.1 릴리스 액션 ([run #22124138937](https://github.com/minhoyoo-iotrust/WAIaaS/actions/runs/22124138937))에서 `publish-check` job Smoke Test가 exit code 254로 실패.

`@waiaas/core` 설치 시점에서 즉시 크래시하여 이후 단계에 도달하지 못함.

## 원인 분석

### 근본 원인

이슈 #076 수정 시 `npm pack` → `pnpm pack`으로 변경했으나, 두 명령어의 출력 형식 차이를 반영하지 않음.

| 명령어 | 출력 형식 |
|--------|-----------|
| `npm pack --pack-destination /tmp/dir` | `waiaas-core-2.1.1-rc.1.tgz` (파일명만) |
| `pnpm pack --pack-destination /tmp/dir` | `/tmp/dir/waiaas-core-2.1.1-rc.1.tgz` (전체 경로) |

현재 스크립트 48행:

```bash
TARBALLS["$pkg_name"]="$SMOKE_DIR/$tarball"
```

`$tarball`이 이미 전체 경로이므로 `$SMOKE_DIR/`을 앞에 붙이면 경로가 이중화됨:

```
/tmp/tmp.nb4LhkmbFm//tmp/tmp.nb4LhkmbFm/waiaas-core-2.1.1-rc.1.tgz
```

이 존재하지 않는 경로로 `npm install`을 시도하여 exit code 254 발생.

### CI 로그 근거

```
Packed: @waiaas/core → /tmp/tmp.nb4LhkmbFm/waiaas-core-2.1.1-rc.1.tgz   ← 전체 경로
  Installing @waiaas/core...
##[error]Process completed with exit code 254.                             ← 즉시 크래시
```

## 수정 방안

`scripts/smoke-test-published.sh` 48행에서 `$SMOKE_DIR/` 접두사 제거:

```diff
- TARBALLS["$pkg_name"]="$SMOKE_DIR/$tarball"
+ TARBALLS["$pkg_name"]="$tarball"
```

## 영향 범위

- CI/CD: release.yml publish-check job 실패 → deploy job 도달 불가
- #076 수정과 동일한 영향 범위
