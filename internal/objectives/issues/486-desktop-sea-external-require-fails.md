# 486 — SEA 번들의 외부 네이티브 모듈 require가 embedderRequire로 가서 ERR_UNKNOWN_BUILTIN_MODULE

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** OPEN
- **발견일:** 2026-04-08
- **발견 경위:** 이슈 485 (JIT 엔타이틀먼트) 수정 검증 중, 프로덕션 `waiaas-daemon` 바이너리에 JIT 엔타이틀먼트만 붙여 재서명하여 실행했을 때 V8 초기화는 통과하지만 곧바로 `ERR_UNKNOWN_BUILTIN_MODULE: better-sqlite3`로 즉사

## 증상

```
node:internal/main/embedding:113
    throw new ERR_UNKNOWN_BUILTIN_MODULE(id);
    ^

Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: better-sqlite3
    at embedderRequire (node:internal/main/embedding:113:11)
    at dist/infrastructure/database/connection.js (dist/daemon-bundle.cjs:55068:38)
    ...
Node.js v22.22.2
```

- 이슈 485 수정 후 `waiaas-daemon`이 V8 초기화 통과 → bundle 실행 → 첫 `require('better-sqlite3')` 호출 시점에 즉시 종료
- `~/Library/Application Support/dev.waiaas.desktop/`에 `daemon.port` 미생성
- Desktop 앱 입장에서는 485 수정 후에도 `PortDiscoveryFailed`가 재발

## 원인

Node.js v22의 `lib/internal/main/embedding.js`:

```js
function embedderRequire(id) {
  const normalizedId = normalizeRequirableId(id);
  if (!normalizedId) {
    // ...emit warning about SEA-only builtin require...
    throw new ERR_UNKNOWN_BUILTIN_MODULE(id);
  }
  return require(normalizedId);
}
```

**SEA 메인 스크립트의 `require`는 `embedderRequire`로, Node 빌트인 모듈(`node:*` / 정규 빌트인)만 resolve합니다.** 외부 모듈·네이티브 애드온은 `require()` 체인에서 즉시 실패합니다.

### 현재 SEA 빌드 파이프라인의 문제

`packages/daemon/scripts/build-sea.mjs`:
- esbuild가 `better-sqlite3`, `sodium-native`, `argon2`를 `external`로 externalize
- 결과 번들(`dist/daemon-bundle.cjs`)에 `require("better-sqlite3")`가 문자열 그대로 남음
- SEA에서 이 `require`는 `embedderRequire` → ERR_UNKNOWN_BUILTIN_MODULE

### 기존 `native-loader.ts`가 해결책이 아니었던 이유

`packages/daemon/src/infrastructure/native-loader.ts`에 `loadBetterSqlite3()` / `process.dlopen()` 기반 SEA 로더가 있지만, 주석에 "migration to native-loader is optional and will be done incrementally"로 기록되어 있고, 실제로 `infrastructure/database/connection.ts`는 여전히 `import Database from 'better-sqlite3'`를 사용합니다. 번들 최종 산출물에는 `require("better-sqlite3")`가 그대로 존재합니다.

### 버그 1(485)이 버그 2를 가렸던 이유

프로덕션 v2.14.0은 JIT 엔타이틀먼트 부재로 V8 초기화 단계(`pthread_jit_write_protect_np`)에서 SIGTRAP 되어 bundle JS 실행에 아예 도달하지 못했습니다. 이슈 485 수정으로 V8 init이 통과되자 그 뒤 첫 `require('better-sqlite3')`에서 바로 이 버그가 발현됩니다.

## 수정 방향

**SEA 부트스트랩 shim**을 번들 상단에 주입해 외부 네이티브 모듈을 `process.dlopen()`으로 사전 로드하고, 번들 내부의 `require()`가 이들을 intercept하도록 만듭니다.

### 핵심 아이디어

SEA가 번들을 실행할 때 `compiledWrapper(exports, embedderRequire, module, __filename, __dirname)` 형태로 `require`가 파라미터로 들어옵니다. 함수 본문 최상단에서 이 파라미터를 **재할당(shadow)**하면 이후 번들 코드 전체가 shadow된 `require`를 사용하게 됩니다:

```js
// SEA bootstrap shim (prepended to daemon-bundle.cjs)
(function () {
  // embedderRequire로 빌트인만 로드
  const sea = require('node:sea');
  if (!sea.isSea()) return; // dev 모드는 건드리지 않음

  const { writeFileSync, mkdtempSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');
  const Module = require('node:module');

  function dlopenAsset(assetName) {
    const buf = Buffer.from(sea.getRawAsset(assetName));
    const dir = mkdtempSync(join(tmpdir(), 'waiaas-sea-'));
    const p = join(dir, assetName);
    writeFileSync(p, buf);
    const m = { exports: {} };
    process.dlopen(m, p);
    return m.exports;
  }

  const natives = {
    'better-sqlite3': dlopenAsset('better_sqlite3.node'),
    'sodium-native': dlopenAsset('sodium-native.node'),
    'argon2': dlopenAsset('argon2.node'),
  };

  // 디스크 상 다른 외부 모듈 fallback용
  const diskRequire = Module.createRequire(process.execPath);

  // 이 함수 밖 스코프에서 require를 shadow하기 위해 globalThis에 저장
  globalThis.__waiaasSeaRequire = function (id) {
    if (id in natives) return natives[id];
    try { return diskRequire(id); }
    catch { throw new Error(`SEA require failed for '${id}'`); }
  };
})();

// 번들 전체가 같은 CJS wrapper 안에 있으므로
// require 파라미터를 shadow
var require = globalThis.__waiaasSeaRequire || require;

// ...이 아래 원본 번들 코드...
```

주입은 `build-sea.mjs`의 esbuild `banner.js` 옵션으로 수행합니다 — 소스 코드 수정 0, 빌드 스크립트 수정만으로 해결.

### dev 모드 보호

`sea.isSea()`가 false면 shim은 아무것도 하지 않고 `globalThis.__waiaasSeaRequire`도 설정하지 않습니다. 번들 본문의 `var require = globalThis.__waiaasSeaRequire || require`는 undefined → 원래 require 유지. 단, dev 모드에서는 그냥 `node dist/daemon-bundle.cjs`를 돌릴 일이 없으므로 실질적으로는 SEA 전용 shim이지만 방어적으로 dev 경로도 안전하게 유지.

## 테스트 항목

- [ ] 로컬 `node packages/daemon/scripts/build-sea.mjs` 후 생성된 SEA 바이너리를 직접 실행하여 `WAIAAS_PORT=...`가 stdout에 출력되고 `daemon.port` 파일이 생성됨
- [ ] 이슈 485 수정(entitlements.plist)과 함께 `pnpm tauri build`로 만든 `.app` 직접 실행 시 Setup Wizard 화면 도달 (크래시 없음)
- [ ] `sodium-native`, `argon2`도 `loadNativeAddon`이 아닌 직접 import 경로로 호출했을 때 번들에서 작동 확인 (keystore, passwordHash 코드 경로)
- [ ] `native-loader.ts`의 기존 SEA 경로(`loadBetterSqlite3` 등)는 그대로 두고, 이 shim은 "직접 import" 경로를 **중복 처리 없이** intercept
- [ ] Intel(x86_64) 빌드에서도 동일 확인 (CI matrix)

## 관련 이슈

- **485** (JIT 엔타이틀먼트) — 동일 픽스 브랜치에서 함께 수정. 둘 다 고쳐야 v2.14.0 desktop 앱이 실제로 뜸.
