# 489 — SEA 데몬이 Admin UI 정적 파일을 찾지 못함 (ADMIN_STATIC_ROOT 경로 불일치)

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** OPEN
- **발견일:** 2026-04-08
- **발견 경위:** 이슈 485-488 수정 후 SEA 데몬이 모든 startup 단계를 통과하고 HTTP 서버가 기동되었으나, 다음 경고 발생: `serveStatic: root path '/Users/.../packages/public/admin' is not found`

## 증상

- 데몬 기동 시 경고: `serveStatic: root path '<workspace>/packages/public/admin' is not found`
- WebView가 `http://127.0.0.1:<port>/admin`에 접근하면 정적 파일 미존재로 404 또는 빈 응답
- Setup Wizard 표시 불가 → Desktop 앱의 첫 실행 완료 불가

## 원인

`packages/daemon/src/api/server.ts:38`:

```ts
const ADMIN_STATIC_ROOT = join(__dirname, '..', '..', 'public', 'admin');
```

이 경로는 모노레포 개발 모드에서만 유효합니다:
- 개발 시: `__dirname = packages/daemon/dist/api`, `../../public/admin` = `packages/daemon/public/admin` (워크스페이스 빌드 산출물 심볼릭 링크가 있을 때만 동작)
- SEA 실행 시: `__dirname`이 `process.execPath`의 부모 디렉터리로 resolve → 잘못된 경로
- Desktop 앱에서는 Admin UI 정적 파일(`packages/admin/dist/*`)이 사이드카 바이너리와 함께 번들되어야 하지만 **번들되지 않음**

## 수정 방향

Admin UI 정적 파일을 **SEA 에셋으로 번들**하고 runtime에 추출합니다. 자기완결성 유지.

### 1. `build-sea.mjs` — admin/dist 파일을 SEA asset으로 추가

```js
// packages/admin/dist/ 재귀 순회
// 각 파일을 sea-config.json의 assets에 `admin/<relpath>`로 등록
```

`sea-config.json`을 빌드 시 동적으로 작성 (8개 정도의 파일만):
```json
{
  "assets": {
    "admin/index.html": "packages/admin/dist/index.html",
    "admin/assets/setup-wizard-CvUtCl2u.js": "...",
    ...
  }
}
```

### 2. SEA bootstrap shim — 런타임 추출

```js
// 모든 admin/* asset을 stable cache 디렉터리로 추출
var adminRoot = path.join(os.tmpdir(), 'waiaas-sea-admin');
fs.mkdirSync(adminRoot, { recursive: true });
for (const assetKey of adminAssetKeys) {
  var buf = Buffer.from(sea.getRawAsset(assetKey));
  var rel = assetKey.slice('admin/'.length);
  var dest = path.join(adminRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}
process.env.WAIAAS_ADMIN_STATIC_ROOT = adminRoot;
```

### 3. `server.ts` — env 오버라이드 지원

```ts
const ADMIN_STATIC_ROOT =
  process.env.WAIAAS_ADMIN_STATIC_ROOT ??
  join(__dirname, '..', '..', 'public', 'admin');
```

이렇게 하면:
- **개발 모드**: env 없음 → 기존 경로 사용 (모노레포 dist 복사 기반)
- **SEA 모드**: shim이 env 설정 → 추출된 tmp 디렉터리 사용
- **Docker/CLI 배포**: env로 외부 지정 가능

### 4. Shim에서 파일 재사용 최적화 (선택)

매 실행마다 tmp 디렉터리에 재추출하면 비용이 있지만, 파일이 8개(460KB)로 작아서 성능 문제 없음. 추출 전 파일 mtime 비교로 skip 가능하지만 1.0 범위 밖.

## 테스트 항목

- [ ] 빌드된 SEA 바이너리 실행 시 `serveStatic: root path ... is not found` 경고가 사라짐
- [ ] `curl http://127.0.0.1:<port>/admin/` 가 `index.html` 내용 반환
- [ ] `/admin/assets/index-*.js` 등 정적 에셋도 정상 반환
- [ ] Setup Wizard가 Desktop 앱 WebView에서 정상 렌더링
- [ ] 개발 모드(`pnpm --filter @waiaas/cli dev`)에서는 기존 경로 사용 (regression 없음)
- [ ] 매 빌드마다 `build-sea.mjs`가 `packages/admin/dist/`의 실제 파일 목록을 스캔 (해시가 바뀌는 파일명 대응)

## 관련 이슈

- **485/486/487/488** — 선행 수정, 이 이슈까지 고쳐야 Desktop 앱 첫 실행 완성
