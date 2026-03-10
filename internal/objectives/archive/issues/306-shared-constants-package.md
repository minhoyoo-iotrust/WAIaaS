# #306 — 공유 상수 패키지(@waiaas/shared) 분리 — Admin UI 하드코딩 제거

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-03-10

## 설명

Admin UI(Preact SPA)가 `@waiaas/core`를 직접 import할 수 없어(sodium-native, better-sqlite3 등 네이티브 의존성)
네트워크 목록, 표시명 매핑 등을 수동으로 복사("mirrored" 패턴)하고 있다.
이로 인해 새 네트워크 추가 시 Admin UI 동기화가 반복적으로 누락된다(#280, #305 등).

순수 TypeScript 내부 패키지 `@waiaas/shared`를 분리하여 서버(core)와 클라이언트(admin) 양쪽에서
동일한 상수/타입을 import하도록 구조를 개선한다.

## 현재 구조

```
core(Node.js 네이티브 포함) ←✗— admin(브라우저 SPA)
→ admin이 상수를 수동 복사(mirrored)하여 동기화 누락 반복
```

## 목표 구조

```
shared(순수 TS, private: true) ←— core (re-export)
                                ←— admin (직접 import)
```

## 구현 범위

### 1. `@waiaas/shared` 패키지 생성

- `packages/shared/` 디렉토리 생성
- `package.json`: `"private": true` (npm 배포 안 됨, 내부 워크스페이스 전용)
- 네이티브 의존성 없는 순수 TypeScript 패키지
- tsconfig, 빌드 설정

### 2. core → shared로 이동할 상수/타입

- `CHAIN_TYPES`, `ChainType`
- `NETWORK_TYPES`, `NetworkType`, `NetworkTypeEnum`
- `SOLANA_NETWORK_TYPES`, `SolanaNetworkType`
- `EVM_NETWORK_TYPES`, `EvmNetworkType`, `EvmNetworkTypeEnum`
- `ENVIRONMENT_NETWORK_MAP`
- `validateChainNetwork()`
- 네트워크 표시명 매핑 (현재 admin에만 존재 → shared로 승격)

### 3. core 패키지 수정

- `@waiaas/shared`를 의존성에 추가
- 이동한 상수/타입을 `@waiaas/shared`에서 re-export
- 외부 사용자(SDK 등)는 기존대로 `@waiaas/core`에서 import 가능 (호환성 유지)

### 4. admin 패키지 수정 — 하드코딩 제거 (6개 파일)

`@waiaas/shared`를 직접 import하여 하드코딩 배열 제거:

- `pages/wallets.tsx`: `evmNetworkOptions`, `NETWORK_DISPLAY_NAMES`, `EVM_NETWORKS`
- `pages/settings.tsx`: `evmRpcKeys`, `evmNetworkOptions`
- `pages/tokens.tsx`: `EVM_NETWORKS`
- `components/policy-forms/spending-limit-form.tsx`: `EVM_NETWORKS`
- `utils/settings-helpers.ts`: `keyToLabel` 네트워크 매핑
- `utils/settings-search-index.ts`: RPC 네트워크 항목

### 5. pnpm-workspace.yaml 업데이트

- `packages/shared` 워크스페이스 등록

## 관련 이슈

- #280: HyperEVM RPC 설정 키 미등록 (동기화 누락 사례)
- #305: Admin UI 네트워크 목록에 HyperEVM 누락 (동기화 누락 사례)
- 이 이슈가 해결되면 #305도 함께 해결됨

## 테스트 항목

1. `@waiaas/shared` 패키지 빌드 성공 확인 (순수 TS, 네이티브 의존성 없음)
2. Admin UI Vite 빌드 성공 확인 (`@waiaas/shared` import 정상)
3. `@waiaas/core` 빌드 성공 + re-export 정상 확인
4. Admin UI에 전체 EVM 네트워크(HyperEVM 포함) 표시 확인
5. 기존 외부 패키지(`@waiaas/sdk` 등)의 core import 호환성 확인
6. `pnpm turbo run lint && pnpm turbo run typecheck` 전체 통과
