# 494 — SEA shim의 sodium-native intercept가 createRequire 경유 호출을 잡지 못함

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** FIXED
- **발견일:** 2026-04-10
- **발견 경위:** v2.14.1-rc.3 DMG에서 여전히 "Cannot find module 'sodium-native'" 에러. 이슈 493 수정(natives['sodium-native'] 추가)이 main에 반영되었으나 실제 DMG에서 동작하지 않음.

## 원인

이슈 493에서 추가한 intercept:
```js
natives['sodium-native'] = addons['sodium-native.node'];
```

이 값은 `globalThis.__waiaasSeaRequire` 함수의 lookup 맵에 들어가고, shim이 번들 CJS wrapper의 `require` 파라미터를 shadow:
```js
var require = globalThis.__waiaasSeaRequire || require;
```

하지만 daemon 소스 4곳은 `createRequire(import.meta.url)` 로 **독립적인 require 함수를 생성**:
```ts
const require = createRequire(import.meta.url);
sodium = require('sodium-native') as SodiumNative;
```

`createRequire()`는 `Module.createRequire()`의 결과로, Node.js 내부의 `Module._load` 를 거치는 별도 CJS 로더입니다. 이 로더는 우리 shim의 `__waiaasSeaRequire`와 **완전히 분리**된 코드 경로이므로 `natives` 맵 lookup에 도달하지 않습니다.

결과: `createRequire(process.execPath)('sodium-native')` → `Module._resolveFilename` → 디스크에서 `sodium-native` 패키지 검색 → SEA 바이너리 옆에 없음 → MODULE_NOT_FOUND.

## 수정 방향

`Module._load` 를 전역으로 패치하여 **모든 require 코드 경로** (외부 파라미터 shadow + createRequire + 기타)에서 네이티브 모듈 이름을 intercept:

```js
var origLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(natives, request)) return natives[request];
  return origLoad.call(this, request, parent, isMain);
};
```

이렇게 하면:
- esbuild 번들 내부의 `require('sodium-native')` → shim shadow require → natives lookup ✓ (기존)
- esbuild 번들 내부의 `require('require-addon')` → shim shadow require → natives lookup ✓ (기존)
- `createRequire(...)('sodium-native')` → Module._load → natives lookup ✓ (**신규**)
- 기타 동적 require 경로 → Module._load → natives lookup ✓ (**신규**)

기존 `globalThis.__waiaasSeaRequire` 와 `var require = ...` shadow는 유지 (esbuild embedderRequire fallback 대응).

## 테스트 항목

- [ ] **로컬 SEA 바이너리**: `POST /v1/wallets` 3개 체인 모두 성공
- [ ] **로컬 Tauri .app 빌드**: 실행 → Step 2 Create Wallets 에러 없이 완료
- [ ] `.app`의 사이드카 데몬에서 실제 `/v1/wallets` POST 호출이 200 반환
- [ ] CI stage1 + stage2 통과
- [ ] RC DMG clean-install 검증 후 릴리스

## 관련 이슈

- **493** — 이전 수정 시도. natives 맵에 추가했으나 createRequire 경로는 미해결.
- **486** — SEA bootstrap shim 원본 설계.
