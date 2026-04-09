# 493 — SEA 데몬에서 sodium-native 직접 require가 지갑 생성 시 MODULE_NOT_FOUND

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** FIXED
- **발견일:** 2026-04-09
- **발견 경위:** v2.14.1-rc.2 DMG 설치 후 Setup Wizard Step 2(Create Wallet)에서 **"Cannot find module 'sodium-native'"** 에러. chain 선택·auth 자체는 정상 통과, 실제 key pair 생성 단계에서 실패.

## 증상

```
Cannot find module 'sodium-native'
Require stack:
- /Applications/WAIaaS Desktop.app/Contents/MacOS/waiaas-daemon
```

- Step 1 (Select Chain) 정상 통과
- Step 2 (Create Wallet) → `POST /v1/wallets` 호출 시 데몬이 500 반환
- 에러 원인: keystore 키 생성에서 `sodium-native` 모듈을 require 하는데 SEA 환경에서 resolve 실패

## 원인

이슈 486 에서 SEA bootstrap shim은 네이티브 애드온 **로더 패키지** (`require-addon`, `bindings`, `node-gyp-build`)를 intercept하여 dlopened export를 반환합니다. `sodium-native` 의 JS wrapper(`node_modules/sodium-native/index.js`)는 esbuild bundle에 포함되어 있고, wrapper가 호출하는 `require('require-addon')` 은 shim이 처리합니다.

그러나 daemon 코드 4곳에서 `sodium-native` 를 **직접 require** 합니다:

```
packages/daemon/src/infrastructure/keystore/memory.ts:29
    sodium = require('sodium-native') as SodiumNative;

packages/daemon/src/infrastructure/keystore/keystore.ts:30
    return require('sodium-native') as SodiumNative;

packages/daemon/src/api/middleware/owner-auth.ts:40
    return require('sodium-native') as SodiumNative;

packages/daemon/src/services/wc-signing-bridge.ts:40
    return require('sodium-native') as SodiumNative;
```

이 `require` 호출은 `createRequire(import.meta.url)` 로 생성된 로컬 require이고, esbuild define으로 `import.meta.url → globalThis.__waiaasImportMetaUrl` 로 매핑됩니다. SEA에서 이 값은 `pathToFileURL(process.execPath).href` 이므로 `Module.createRequire`가 `.app/Contents/MacOS/` 기준으로 `sodium-native` 을 resolve 시도 → 해당 디렉터리에 `node_modules/sodium-native` 없음 → **MODULE_NOT_FOUND**.

esbuild 가 이 4곳의 `require('sodium-native')` 를 그대로 bundle에 남기는 이유: `require` 가 파라미터로 들어온 원본 require 가 아니라, `createRequire()` 로 만든 **로컬 변수** `require`이므로 esbuild 가 이를 외부 모듈 참조로 인식하지 않고 문자열 그대로 출력.

## 수정 방향

### SEA shim에 `sodium-native` 직접 intercept 추가

`packages/daemon/scripts/build-sea.mjs` 의 SEA bootstrap shim `natives` 맵에 `sodium-native` 키를 추가:

```js
// sodium-native 래퍼 export를 시뮬레이션 — createRequire 경유 직접 require 대응
// 래퍼의 index.js는: module.exports = require.addon('.', __filename)
// 즉 실제 export는 dlopened native binding 자체와 동일
natives['sodium-native'] = addons['sodium-native.node'];
```

이렇게 하면 shim의 `globalThis.__waiaasSeaRequire` 가 `sodium-native` 이름을 intercept하여 dlopened export를 반환합니다. 기존 `require-addon` intercept는 esbuild-bundled wrapper 경로를 커버하고, 이 새 항목은 `createRequire` 경유 직접 require 경로를 커버합니다.

`argon2`와 `better-sqlite3` 도 동일 패턴으로 예방적 추가 권장 (현재는 직접 require 호출이 없지만 향후 방어):

```js
natives['sodium-native'] = addons['sodium-native.node'];
natives['better-sqlite3'] = addons['better_sqlite3.node'];  // 향후 방어
natives['argon2'] = addons['argon2.node'];                   // 향후 방어
```

단, `better-sqlite3` 의 경우 dlopened export 는 raw bindings이고 JS wrapper(`lib/database.js`)가 Database constructor를 정의하므로, 직접 require 시 Database constructor가 없을 수 있음. 현재 직접 require 호출이 없으므로 우선 sodium-native 만 확실히 커버하고, better-sqlite3/argon2 는 주석으로 경고만 추가.

## 테스트 항목

- [ ] 로컬 SEA 바이너리 빌드 후 `POST /v1/wallets` 호출 시 지갑 생성 성공 (sodium-native 로드 OK)
- [ ] owner-auth 미들웨어 경로 (SIWE/SIWS 서명 검증) 에서도 sodium-native 로드 OK
- [ ] WalletConnect signing bridge 경로에서도 sodium-native 로드 OK
- [ ] 기존 `/health`, `/admin/` 경로 정상
- [ ] `pnpm vitest run src/__tests__/desktop` 통과
- [ ] CI stage1 + stage2 통과

## 관련 이슈

- **486** (SEA 부트스트랩 shim) — 이 이슈는 486의 누락 항목. shim이 로더 패키지만 커버하고 모듈 이름 자체를 커버하지 않았음.
- **492** (wizard auth + chain) — 492 수정으로 auth 헤더가 전달되어 `POST /v1/wallets` 호출 자체는 성공하지만, 데몬 내부에서 sodium-native require 실패로 500 반환.
