# 481 — xrpl ECDSA named export ESM import 실패

- **유형:** BUG
- **심각도:** CRITICAL
- **마일스톤:** v33.6
- **상태:** OPEN
- **발견일:** 2026-04-07
- **발견 경로:** v33.6 안정화 검증 — XRP 테스트넷 지갑 잔액 조회 시 런타임 에러

## 증상

XRP 지갑 잔액 조회(`GET /v1/admin/wallets/:id/balance`) 시 다음 에러 발생:

```
Named export 'ECDSA' not found. The requested module 'xrpl' is a CommonJS module,
which may not support all module.exports as named exports.
```

모든 XRPL RPC 호출(잔액, 전송, Trust Line, NFT, DEX)이 실패함.

## 원인

`@waiaas/adapter-ripple`의 `adapter.ts:12`에서 ESM named import 사용:

```typescript
import { Client, Wallet, ECDSA } from 'xrpl';
```

`xrpl` 패키지는 CJS 모듈(`"use strict"`, `type` 미지정)이므로 Node.js ESM 런타임에서 named export를 지원하지 않음. TypeScript `esModuleInterop`은 컴파일 시점에만 적용되고, 런타임 Node.js ESM 로더에서는 CJS interop 제한으로 named export 추출 실패.

## 영향 범위

- `RippleAdapter` 전체 — 인스턴스 생성 시점이 아닌 메서드 호출(서명 시 `Wallet.fromEntropy`) 시 실패
- 잔액 조회, 전송, Trust Line, NFT, DEX 등 모든 XRPL 기능 불가
- 지갑 생성은 `ripple-keypairs` 사용이므로 영향 없음

## 수정 방안

default import로 전환 후 destructuring:

```typescript
import xrpl from 'xrpl';
import type { Payment, TrustSet, Transaction, NFTokenCreateOffer, OfferCreate, OfferCancel } from 'xrpl';

const { Client, Wallet, ECDSA } = xrpl;
```

## 테스트 항목

1. `GET /v1/admin/wallets/:id/balance` — XRP 테스트넷 지갑 잔액 조회 성공
2. `POST /v1/transactions` — XRP 네이티브 전송 트랜잭션 서명 성공
3. Trust Line / NFT / DEX 관련 API 호출 에러 없음
4. 기존 adapter-ripple 단위 테스트 통과
