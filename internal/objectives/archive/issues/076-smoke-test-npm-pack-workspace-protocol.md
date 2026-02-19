# 076 — Smoke Test가 workspace:* 프로토콜을 해석하지 못해 ESM import 실패

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** m21
- **상태:** FIXED
- **발견일:** 2026-02-18
- **발생 위치:** `scripts/smoke-test-published.sh`, release.yml `publish-check` job

## 현상

v2.1.0-rc.1 릴리스 액션 ([run #22122090357](https://github.com/minhoyoo-iotrust/WAIaaS/actions/runs/22122090357))에서 `publish-check` job의 Smoke Test 단계가 실패.

8개 패키지 중 4개가 ESM import 검증에 실패하고, CLI binary 검증도 실패:

| 패키지 | 결과 |
|--------|------|
| @waiaas/core | PASS |
| @waiaas/sdk | PASS |
| @waiaas/mcp | PASS |
| @waiaas/skills | PASS |
| @waiaas/cli | **FAIL** |
| @waiaas/daemon | **FAIL** |
| @waiaas/adapter-solana | **FAIL** |
| @waiaas/adapter-evm | **FAIL** |
| waiaas CLI binary | **FAIL** |

## 원인 분석

### 근본 원인

`scripts/smoke-test-published.sh`에서 **`npm pack`**을 사용하여 tarball을 생성하는데, `npm pack`은 pnpm의 `workspace:*` 프로토콜을 해석하지 못하고 그대로 tarball에 포함시킨다.

외부 temp 디렉토리에서 이 tarball을 `npm install`하면 npm이 `workspace:*`를 인식하지 못해 `EUNSUPPORTEDPROTOCOL` 에러가 발생하여 설치가 실패한다.

### 실패 패턴

실패하는 4개 패키지는 모두 `workspace:*`로 내부 의존성을 참조:

```json
// packages/daemon/package.json
"@waiaas/adapter-evm": "workspace:*",
"@waiaas/adapter-solana": "workspace:*",
"@waiaas/core": "workspace:*"

// packages/cli/package.json
"@waiaas/core": "workspace:*",
"@waiaas/daemon": "workspace:*"

// packages/adapters/solana/package.json
"@waiaas/core": "workspace:*"

// packages/adapters/evm/package.json
"@waiaas/core": "workspace:*"
```

통과하는 4개 패키지(core, sdk, mcp, skills)는 내부 `@waiaas/*` 의존성이 없다.

### 실제 publish와의 차이

실제 `pnpm publish`는 `workspace:*`를 자동으로 실제 버전(예: `2.1.0-rc.1`)으로 치환하므로 npm registry에 올라가는 패키지는 정상 동작한다. smoke test만 `npm pack`을 사용하여 이 치환이 누락된 것이다.

## 수정 방안

`scripts/smoke-test-published.sh`의 47행에서 `npm pack`을 `pnpm pack`으로 변경:

```diff
- tarball=$(npm pack --pack-destination "$SMOKE_DIR" 2>/dev/null | tail -1)
+ tarball=$(pnpm pack --pack-destination "$SMOKE_DIR" 2>/dev/null | tail -1)
```

`pnpm pack`은 tarball 생성 시 `workspace:*`를 실제 버전으로 자동 치환한다.

## 영향 범위

- CI/CD: release.yml의 publish-check job이 항상 실패하여 deploy job 도달 불가
- 실제 publish 동작에는 영향 없음 (pnpm publish 사용)
