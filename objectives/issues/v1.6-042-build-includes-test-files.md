# v1.6-042: 빌드에 테스트 파일 포함으로 반복적 빌드 실패 발생

## 유형: BUG

## 심각도: HIGH

## 현상

`pnpm build` 시 `@waiaas/core` 패키지 빌드 실패. `tsc -p tsconfig.json`이 `src/__tests__/` 디렉토리를 포함하여 테스트 전용 코드(vitest globals, 테스트 유틸리티)까지 컴파일하기 때문.

### 현재 에러 (7건)

```
src/__tests__/contracts/action-provider.contract.ts(11,56): error TS6196: 'ActionDefinition' is declared but never used.
src/__tests__/contracts/action-provider.contract.ts(58,5): error TS2304: Cannot find name 'beforeEach'.
src/__tests__/contracts/chain-adapter.contract.ts(15,43): error TS6133: 'afterAll' is declared but its value is never read.
src/__tests__/contracts/clock.contract.ts(71,5): error TS2304: Cannot find name 'beforeEach'.
src/__tests__/contracts/notification-channel.contract.ts(44,5): error TS2304: Cannot find name 'beforeEach'.
src/__tests__/contracts/policy-engine.contract.ts(44,5): error TS2304: Cannot find name 'beforeEach'.
src/__tests__/contracts/price-oracle.contract.ts(82,5): error TS2304: Cannot find name 'beforeEach'.
```

### 반복 발생 패턴

이 유형의 빌드 에러는 v1.5 (#032), v1.6 (#038) 등 여러 마일스톤에서 반복 발생. 원인이 동일:

1. 새 테스트 파일 추가 또는 수정 시 vitest import 누락/미사용
2. `tsc build`가 `__tests__/`를 포함하므로 런타임에서는 문제없는 코드가 빌드를 차단
3. 테스트 작성 시점에는 vitest가 글로벌로 주입하므로 에러를 인지하지 못함
4. 다음 빌드 시 발견 → 수동 수정 → 또 다음 마일스톤에서 반복

## 근본 원인

`packages/core/tsconfig.json`:
```json
{
  "include": ["src"]   // ← src/__tests__/ 포함
}
```

`tsconfig.base.json`의 strict 옵션:
```json
{
  "noUnusedLocals": true,       // 미사용 import → 에러
  "noUnusedParameters": true    // 미사용 파라미터 → 에러
}
```

`tsc build`는 vitest 런타임 글로벌(`beforeEach`, `afterEach` 등)을 모르므로 TS2304 발생.

## 수정 방안

### 즉시 수정 (현재 에러 해결)

| 파일 | 수정 |
|------|------|
| `action-provider.contract.ts` | `import { describe, it, expect }` → `import { describe, it, expect, beforeEach }` 추가, 미사용 `ActionDefinition` 제거 |
| `chain-adapter.contract.ts` | 미사용 `afterAll` import 제거 |
| `clock.contract.ts` | `import { describe, it, expect }` → `import { describe, it, expect, beforeEach }` 추가 |
| `notification-channel.contract.ts` | `import { describe, it, expect }` → `import { describe, it, expect, beforeEach }` 추가 |
| `policy-engine.contract.ts` | `import { describe, it, expect }` → `import { describe, it, expect, beforeEach }` 추가 |
| `price-oracle.contract.ts` | `import { describe, it, expect }` → `import { describe, it, expect, beforeEach }` 추가 |

### 구조적 수정 (재발 방지)

빌드와 타입체크를 분리하여, 테스트 파일이 빌드를 차단하지 않도록 한다:

**방법: `tsconfig.build.json` 도입**

각 패키지에 빌드 전용 tsconfig 추가:

```json
// packages/core/tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "exclude": ["src/__tests__"]
}
```

`package.json` 빌드 스크립트 변경:
```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit"
  }
}
```

이렇게 하면:
- `pnpm build` → `tsconfig.build.json` 사용 → `__tests__/` 제외 → 빌드 안정
- `pnpm typecheck` (또는 CI) → `tsconfig.json` 사용 → `__tests__/` 포함 → 타입 검증
- 테스트 파일의 vitest import 누락이 빌드를 차단하지 않음
- CI의 `tsc --noEmit`에서만 타입 에러 감지 → 수정 후 커밋

**적용 대상 패키지:**
- `@waiaas/core` (현재 에러 발생)
- `@waiaas/daemon` (테스트 파일 다수)
- `@waiaas/adapter-solana`
- `@waiaas/adapter-evm`
- `@waiaas/sdk`
- `@waiaas/mcp`
- `@waiaas/cli`

### 추가 방어 (선택)

- pre-commit 훅에 `turbo build` 추가하여 빌드 실패를 커밋 전에 감지
- CI에서 `tsc --noEmit` (전체 타입체크)과 `tsc -p tsconfig.build.json` (빌드)를 분리 실행

## 발견

- Owner + WalletConnect 테스트 준비 시 빌드 실패로 발견
- 동일 패턴이 v1.5 (#032), v1.6 (#038)에서도 발생하여 구조적 해결 필요
