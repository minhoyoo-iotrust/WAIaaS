# v2.0-059: Contract Test Suite 크로스 패키지 Import 구조 개선

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v2.0
- **상태:** FIXED
- **발견일:** 2026-02-17

## 현상

adapter 패키지(solana, evm)의 contract test가 core 패키지의 내부 소스 파일을 상대 경로로 직접 참조:

```typescript
// packages/adapters/solana/src/__tests__/contracts/chain-adapter-solana.contract.test.ts
import { chainAdapterContractTests } from '../../../../../core/src/__tests__/contracts/chain-adapter.contract.js';
```

이로 인해 발생하는 문제:
1. **TS6305**: `tsc --noEmit`(project references)가 `core/dist/__tests__/contracts/` 빌드 출력을 요구하나, `tsconfig.build.json`이 `__tests__/`를 제외하므로 해당 출력이 없음
2. **커버리지 오염**: 임시 해결로 `src/testing/`에 파일을 복사하면 커버리지 계산 대상에 포함되어 branches threshold(85%) 미달(74.65%)
3. **취약한 경로**: 5단계 상대 경로(`../../../../../`)가 디렉토리 구조 변경에 취약

## 근본 원인

`chainAdapterContractTests`는 **공유 테스트 유틸리티**이나, core 패키지의 `__tests__/` 내부에 위치하여 빌드 출력에 포함되지 않음. adapter에서 이를 사용하려면 빌드된 경로가 아닌 소스 경로를 직접 참조해야 하는 구조적 모순 발생.

## PR #2 임시 수정 — 원복 필요

PR #2(`gsd/v2.0-milestone`)에 다음 임시 수정이 포함되어 있으며, **이 이슈 해결 시 원복해야 함**:

| 임시 수정 | 문제점 | 원복 방법 |
|-----------|--------|-----------|
| `src/testing/chain-adapter-contract.ts` 파일 복사 생성 | 원본과 복사본 이중 관리, 커버리지 오염 | 삭제 후 canonical 위치에서 re-export로 대체 |
| `src/testing/index.ts` 복사본 참조 | 복사본 의존 | canonical 소스 참조로 변경 |
| `src/__tests__/contracts/chain-adapter.contract.ts`를 re-export로 축소 | 원본 코드 제거됨 | 원본 코드 복원 또는 canonical 이동 확정 |
| `package.json` exports `"./testing"` 추가 | 이것 자체는 유지 (올바른 방향) | 경로만 정식 위치로 수정 |
| `vitest.config.ts` 커버리지 제외 미적용 | CI threshold 미달 | 정식 해결 후 `src/testing/**` 제외 추가 |

## 해결 방안

### 방법 A — canonical 위치를 `src/testing/`으로 이동 (권장)

1. `src/__tests__/contracts/chain-adapter.contract.ts`의 **원본 코드**를 `src/testing/chain-adapter-contract.ts`로 이동 (복사가 아닌 이동)
2. `src/__tests__/contracts/chain-adapter.contract.ts`는 `../../testing/chain-adapter-contract.js` re-export (mock contract test 하위 호환)
3. `src/testing/index.ts`에서 local re-export
4. `tsconfig.build.json`: `testing/`은 `src/` 하위이므로 자동 포함 (변경 불필요)
5. `vitest.config.ts`: `src/testing/**` 커버리지 제외 추가
6. `package.json` exports `"./testing"` 유지 (이미 추가됨)

### 방법 B — `__tests__/contracts/`를 빌드 대상에 선택적 포함

```json
// tsconfig.build.json
{
  "exclude": ["src/__tests__/**", "!src/__tests__/contracts/chain-adapter.contract.ts"]
}
```

- 기존 파일 위치 유지, tsconfig만 조정
- 단점: `__tests__/` 안에 빌드 대상 파일이 섞여 혼란 가능

### 공통: adapter import 경로 변경

```typescript
// Before (상대 소스 경로 — 5단계)
import { chainAdapterContractTests } from '../../../../../core/src/__tests__/contracts/chain-adapter.contract.js';

// After (패키지 경로)
import { chainAdapterContractTests } from '@waiaas/core/testing';
```

이 변경은 PR #2에 이미 적용됨 (유지).

## 수정 대상 파일

| 파일 | 변경 내용 |
|------|-----------|
| `packages/core/src/testing/chain-adapter-contract.ts` | PR #2 복사본 삭제 → 원본 이동 (방법 A) |
| `packages/core/src/testing/index.ts` | local import 경로 확인 |
| `packages/core/src/__tests__/contracts/chain-adapter.contract.ts` | 원본 복원 → re-export로 전환 (방법 A) |
| `packages/core/package.json` | `exports["./testing"]` 유지 |
| `packages/core/tsconfig.build.json` | 변경 불필요 (방법 A) |
| `packages/core/vitest.config.ts` | `src/testing/**` 커버리지 제외 추가 |
| `packages/adapters/solana/src/__tests__/contracts/...` | import 경로 유지 (`@waiaas/core/testing`) |
| `packages/adapters/evm/src/__tests__/contracts/...` | import 경로 유지 (`@waiaas/core/testing`) |

## 재발 방지 테스트

1. `pnpm turbo run typecheck` — 전체 패키지 타입체크 통과 확인
2. `pnpm turbo run test:unit -- --coverage` — core 커버리지 threshold(branches 85%) 충족 확인
3. contract test suite 실행 확인 — mock/solana/evm 3개 adapter 모두 통과

## 관련

- PR #2: `gsd/v2.0-milestone` → `main`
- 이슈 #058: WalletConnect 셧다운 시 DB 에러 (동일 PR)
