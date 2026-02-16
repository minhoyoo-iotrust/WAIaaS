# v1.6-049: WalletConnect SignClient ESM/CJS 호환성 오류로 초기화 실패

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v1.6
- **상태:** OPEN
- **등록일:** 2026-02-17

## 증상

데몬 시작 시 WalletConnect 서비스 초기화가 실패하여 모든 WC 엔드포인트가 404를 반환한다.

```
Step 4c-6 (fail-soft): WalletConnect init warning: TypeError: SignClient.init is not a function
    at WcSessionService.initialize (wc-session-service.js:71:44)
```

Project ID가 올바르게 설정되어 있고 데몬을 재시작해도 동일하게 실패한다.

## 원인 분석

### `@walletconnect/sign-client@2.23.5` 패키지의 exports map 문제

`package.json`:
```json
{
  "exports": {
    ".": {
      "types": "./dist/types/index.d.ts",
      "module": "./dist/index.js",
      "default": "./dist/index.cjs"
    }
  }
}
```

- `"import"` 조건이 없으므로 Node.js ESM에서 `"default"` 조건(`dist/index.cjs`)으로 fallback
- CJS 모듈을 ESM `import`로 불러오면 `module.exports` 전체 객체가 default import가 됨
- 실제 `SignClient` 클래스는 `.default` 프로퍼티에 위치

### 현재 코드 (wc-session-service.ts:20)

```typescript
import SignClient from '@walletconnect/sign-client';
// SignClient = { AUTH_CONTEXT: ..., ENGINE_CONTEXT: ..., default: [Function SignClient] }
// SignClient.init → undefined ❌
```

### 실제 모듈 구조 (런타임 검증)

```
type: object
keys: [AUTH_CONTEXT, ENGINE_CONTEXT, ..., default]
default type: function
default.init type: function  ✅
SC.init type: undefined       ❌
```

## 수정 방안

`packages/daemon/src/services/wc-session-service.ts` import 수정:

```typescript
import SignClientModule from '@walletconnect/sign-client';

// ESM/CJS interop: Node.js loads the CJS bundle (no "import" condition in exports map),
// so the actual SignClient class lives at .default when imported via ESM.
const SignClient: typeof SignClientModule =
  (SignClientModule as any).default ?? SignClientModule;
```

`(SignClientModule as any).default ?? SignClientModule` 패턴으로:
- CJS fallback 시 `.default`에서 클래스를 가져오고
- 향후 패키지가 ESM exports를 추가하면 직접 import도 동작

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `packages/daemon/src/services/wc-session-service.ts` | import 문 ESM/CJS interop 적용 |

## 테스트

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| T-049-01 | 데몬 시작 시 WC 초기화 로그 | `Step 4c-6: WalletConnect service initialized` |
| T-049-02 | `POST /v1/wallets/{id}/wc/pair` 호출 | 200 + QR 코드 반환 (기존: 404) |
| T-049-03 | `GET /v1/wallets/{id}/wc/session` 호출 (세션 없음) | 404 + `WC_SESSION_NOT_FOUND` (기존: 404 라우트 미등록) |
| T-049-04 | 기존 WC 페어링/세션 단위 테스트 통과 | 모든 wc-pairing.test.ts 통과 |

## 재현 방법

1. Admin Settings에서 WalletConnect Project ID 설정
2. 데몬 재시작
3. 시작 로그에서 `Step 4c-6 (fail-soft): WalletConnect init warning: TypeError: SignClient.init is not a function` 확인
4. Admin UI → Wallets → 월렛 상세 진입 → 콘솔에 404 에러 다수
5. "Connect Wallet" 클릭 → 404 실패
