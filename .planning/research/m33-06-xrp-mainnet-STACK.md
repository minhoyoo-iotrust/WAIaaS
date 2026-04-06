# Technology Stack: XRP Ledger Integration

**Project:** WAIaaS - XRP Mainnet Support (m33-06)
**Researched:** 2026-04-03
**Overall confidence:** HIGH

## Recommended Stack

### Core SDK

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `xrpl` | ^4.6.0 | XRPL client, Wallet, transaction building, signing | 공식 XRPLF SDK. TypeScript 네이티브. WebSocket client + Wallet class + 트랜잭션 직렬화/서명 all-in-one. Node 18+ 지원 (프로젝트는 Node 22). v4.x는 rippled API v2 기본 사용. |

**xrpl 패키지 하나로 충분한 이유:**

`xrpl` npm 패키지는 모노레포 구조이며, 내부적으로 다음 하위 패키지를 포함:

- `ripple-keypairs` (v2.0.0) -- Ed25519/secp256k1 키 생성, `deriveAddress()` (r-address 도출)
- `ripple-address-codec` (v5.0.0) -- Base58Check 인코딩/디코딩 (r-address, X-address)
- `ripple-binary-codec` (v2.7.0) -- 트랜잭션 바이너리 직렬화 (signing에 필수)

별도 설치 불필요. `xrpl` 패키지가 모두 re-export.

### 추가 라이브러리: 없음

| Category | 추가 필요? | 이유 |
|----------|-----------|------|
| WebSocket client | NO | `xrpl.Client`가 내장 WebSocket 클라이언트 제공 (reconnect, failover 내장) |
| 암호화 라이브러리 | NO | Ed25519 키 생성은 기존 `sodium-native` 사용. r-address 도출만 `ripple-keypairs.deriveAddress()` 사용 |
| Base58 인코딩 | NO | `ripple-address-codec`가 `xrpl`에 포함 |
| 트랜잭션 직렬화 | NO | `ripple-binary-codec`가 `xrpl`에 포함 |

## Ed25519 키 생성 + r-address 도출 전략

### 핵심 결정: sodium-native로 키 생성, xrpl로 주소 도출

**기존 방식 유지 (sodium-native Ed25519 키 생성):**

```typescript
// 1. sodium-native으로 Ed25519 키쌍 생성 (기존 Solana 경로와 동일)
const sodium = loadSodium();
const publicKeyBuf = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES); // 32 bytes
const secretKeyBuf = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES); // 64 bytes
sodium.crypto_sign_keypair(publicKeyBuf, secretKeyBuf);
```

**r-address 도출 (xrpl 패키지 사용):**

XRPL Ed25519 공개키 형식: 32바이트 raw 공개키 앞에 `0xED` 바이트를 붙여 33바이트로 만듦.

```typescript
import { deriveAddress } from 'ripple-keypairs';

// 2. 32-byte raw Ed25519 public key → 33-byte XRPL format (ED prefix)
const xrplPublicKeyHex = 'ED' + publicKeyBuf.toString('hex').toUpperCase();

// 3. r-address 도출 (SHA-256 → RIPEMD-160 → Base58Check)
const rAddress = deriveAddress(xrplPublicKeyHex);
// → "rN7n3473SaZBCG4dFL83w7p1W9cgZB6XMf" (예시)
```

**Wallet 객체 생성 (서명 시):**

```typescript
import { Wallet } from 'xrpl';

// 64-byte sodium secret에서 32-byte seed 추출 (Ed25519: 앞 32바이트가 seed)
const seedBytes = secretKeyBuf.subarray(0, 32);
const privateKeyHex = 'ED' + seedBytes.toString('hex').toUpperCase();
const publicKeyHex = 'ED' + publicKeyBuf.toString('hex').toUpperCase();

// xrpl Wallet 생성자는 raw hex keypair 직접 수용 (seed 불필요)
const wallet = new Wallet(publicKeyHex, privateKeyHex);
// wallet.classicAddress → r-address
```

**왜 이 방식인가:**

1. **중복 암호화 라이브러리 회피**: `xrpl`이 내부적으로 `@noble/ed25519`나 `elliptic`을 사용하지만, 키 생성은 기존 `sodium-native`(libsodium C 바인딩)을 그대로 사용. sodium-native의 guarded memory 보호를 활용.
2. **KeystoreFileV1 호환**: `curve: 'ed25519'` 필드가 이미 존재. Ripple 지갑도 동일한 curve 값 사용.
3. **64-byte secret key 저장**: Solana와 동일하게 sodium의 64-byte secret key (seed 32 + public 32) 전체를 암호화 저장. 서명 시 앞 32바이트를 ED prefix와 함께 xrpl Wallet에 전달.

### KeyStore 확장 범위

`keystore.ts`의 `generateKeyPair()` 메서드에 `chain === 'ripple'` 분기 추가:

```typescript
// generateKeyPair 내부
if (chain === 'ripple') {
  return this.generateRippleEd25519KeyPair(walletId, network, masterPassword);
}
```

`generateRippleEd25519KeyPair`는 `generateEd25519KeyPair`과 거의 동일하되:
- `publicKey` 반환값이 r-address (base58이 아닌 Base58Check)
- `chain` 필드가 `'ripple'`
- curve는 동일하게 `'ed25519'`

## xrpl.Client WebSocket 연결

### 기본 엔드포인트

| Network | Default WebSocket URL | CAIP-2 |
|---------|----------------------|--------|
| Mainnet | `wss://xrplcluster.com` | `xrpl:0` |
| Testnet | `wss://s.altnet.rippletest.net:51233` | `xrpl:1` |
| Devnet  | `wss://s.devnet.rippletest.net:51233` | `xrpl:2` |

**대안 메인넷 엔드포인트:**
- `wss://s1.ripple.com` (Ripple 운영)
- `wss://s2.ripple.com` (Ripple 운영, full history)

### 연결 관리

```typescript
import { Client } from 'xrpl';

const client = new Client('wss://xrplcluster.com');
await client.connect();

// 자동 재연결 내장
// client.on('disconnected') 이벤트로 모니터링 가능
```

**기존 RPC Pool과의 관계:** XRPL은 HTTP JSON-RPC도 지원하지만, WebSocket이 표준. 초기 구현에서는 단일 WebSocket 연결 사용. RPC Pool 멀티엔드포인트는 후속 마일스톤에서 적용 (목표 문서에서 명시적 제외).

## Drizzle/SQLite 고려사항

### DB 마이그레이션 (v62)

현재 DB 스키마 v61. XRPL 통합으로 v62 필요:

1. **CHECK 제약조건 업데이트**: `wallets.chain` 컬럼의 CHECK에 `'ripple'` 추가
2. **ENVIRONMENT_NETWORK_MAP 확장**: `ripple:mainnet`, `ripple:testnet` 매핑
3. **NETWORK_TYPES 확장**: `'xrpl-mainnet'`, `'xrpl-testnet'`, `'xrpl-devnet'` 추가
4. **Trust Line 데이터 저장**: 기존 토큰 테이블 구조로 충분 (currency + issuer를 CAIP-19 형식으로 저장)

### CAIP 표준 통합

| Item | Format | Example |
|------|--------|---------|
| CAIP-2 Chain ID | `xrpl:{network_id}` | `xrpl:0` (mainnet) |
| CAIP-19 Native | `xrpl:{nid}/slip44:144` | `xrpl:0/slip44:144` |
| CAIP-19 Trust Line | `xrpl:{nid}/token:{currency}.{issuer}` | `xrpl:0/token:USD.rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B` |

**주의:** 기존 프로젝트의 CAIP-19 네이티브 형식이 `slip44` namespace를 사용하는지 확인 필요. XRPL의 SLIP-44 coin type은 144.

### Reserve 관련 DB 고려사항

XRPL 계정은 base reserve (현재 1 XRP) + owner reserve (Trust Line당 0.2 XRP)가 필요. 잔액 조회 시 `available_balance = balance - total_reserve`를 계산해야 하므로, getBalance 응답에 `reserve` 필드 추가 또는 별도 메서드 필요. DB 저장은 불필요 (실시간 조회).

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| XRPL SDK | `xrpl` ^4.6.0 | `xrpl-client` + `xrpl-accountlib` | 비공식, 커뮤니티 유지보수. `xrpl`이 XRPLF 공식이며 TypeScript 네이티브 |
| Ed25519 키 생성 | `sodium-native` (기존) | `xrpl` 내장 `Wallet.generate()` | sodium-native의 guarded memory 보호 포기해야 함. 기존 보안 아키텍처 유지가 중요 |
| 주소 도출 | `ripple-keypairs` (xrpl 포함) | 자체 구현 (SHA-256 + RIPEMD-160 + Base58Check) | 바퀴 재발명. ripple-keypairs가 검증된 구현 |
| WebSocket | `xrpl.Client` 내장 | `ws` 패키지 직접 사용 | xrpl.Client가 XRPL 프로토콜 메시지 파싱, 자동 재연결, 요청/응답 매칭 등 모두 처리 |
| 트랜잭션 직렬화 | `ripple-binary-codec` (xrpl 포함) | 자체 구현 | XRPL 바이너리 형식은 복잡. 공식 코덱 사용 필수 |

## Installation

```bash
# 유일한 신규 패키지
pnpm add xrpl@^4.6.0 --filter @waiaas/adapter-ripple
```

**의존성 크기:** `xrpl` 패키지 자체 ~7.4MB (하위 패키지 포함). 프로덕션에서는 tree-shaking 대상이 아닌 서버 사이드 전용이므로 크기 이슈 없음.

**기존 패키지 변경 없음:**
- `sodium-native` -- 그대로 사용 (Ed25519 키 생성)
- `viem` -- 변경 없음 (EVM 전용)
- `@solana/kit` -- 변경 없음 (Solana 전용)

## 신규 패키지 구조

```
packages/
  adapter-ripple/           # 신규 패키지
    src/
      ripple-adapter.ts     # IChainAdapter 구현 (RippleAdapter)
      types.ts              # XRPL 고유 타입 (TrustLine, Reserve 등)
      caip.ts               # XRPL CAIP-2/CAIP-19 매핑
      errors.ts             # XRPL 에러 → ChainError 변환
    package.json            # dependency: xrpl ^4.6.0
    tsconfig.json
    vitest.config.ts
```

## xrpl.js 주요 API 사용 포인트

| IChainAdapter Method | xrpl.js API | Notes |
|---------------------|-------------|-------|
| `connect()` | `client.connect()` | WebSocket 연결 |
| `disconnect()` | `client.disconnect()` | |
| `isConnected()` | `client.isConnected()` | |
| `getBalance()` | `client.getXrpBalance(address)` | drops 단위 → XRP 변환 (1 XRP = 1,000,000 drops) |
| `estimateFee()` | `client.request({ command: 'fee' })` | |
| `build()` | `client.autofill(tx)` | Sequence, Fee, LastLedgerSequence 자동 채움 |
| `simulate()` | `client.request({ command: 'simulate' })` or `client.submit(tx, { fail_hard: false })` | Dry-run: submit with `fail_hard: false` on testnet, or use fee estimation |
| `sign()` | `wallet.sign(tx)` | xrpl Wallet 객체의 sign 메서드 |
| `submit()` | `client.submitAndWait(tx_blob)` 또는 `client.submit(tx_blob)` | |
| `waitForConfirmation()` | `client.request({ command: 'tx', transaction: hash })` | XRPL은 3-5초 합의. `submitAndWait`가 확인까지 대기 |
| `getCurrentNonce()` | `client.request({ command: 'account_info' })` → `result.account_data.Sequence` | |
| `getAssets()` | `client.request({ command: 'account_lines' })` | Trust Line 목록 조회 |
| `buildTokenTransfer()` | Payment TX with `Amount: { currency, issuer, value }` | IOU 형식 |
| `buildApprove()` | TrustSet TX: `{ TransactionType: 'TrustSet', LimitAmount: { currency, issuer, value } }` | Trust Line 설정 |

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| xrpl ^4.6.0 | HIGH | npm에서 직접 확인. 2025-02-12 릴리스. XRPLF 공식 |
| Ed25519 → r-address | HIGH | 공식 문서 + ripple-keypairs 소스 확인. ED prefix + deriveAddress 패턴 명확 |
| Wallet 생성자 raw keypair | HIGH | 공식 TypeDoc 확인. `new Wallet(publicKey, privateKey)` seed 불필요 |
| CAIP-2/19 표준 | HIGH | chainagnostic.org 공식 namespace 등록 확인 |
| sodium-native 재활용 | HIGH | 동일한 Ed25519 알고리즘. 32-byte seed → 64-byte secret key 호환 |
| DB 마이그레이션 범위 | MEDIUM | CHECK 제약조건 + 네트워크 타입 추가는 기존 패턴과 동일하나, Trust Line 관련 추가 테이블 필요 여부는 구현 시 확인 필요 |

## Sources

- [xrpl npm package](https://www.npmjs.com/package/xrpl) - v4.6.0 확인
- [xrpl.js Wallet class API](https://js.xrpl.org/classes/Wallet.html) - 생성자 시그니처 확인
- [ripple-keypairs (GitHub)](https://github.com/XRPLF/xrpl.js/tree/main/packages/ripple-keypairs) - deriveAddress 확인
- [XRPL Cryptographic Keys](https://xrpl.org/docs/concepts/accounts/cryptographic-keys) - Ed25519 키 형식 (ED prefix)
- [XRPL CAIP-2 Namespace](https://namespaces.chainagnostic.org/xrpl/caip2) - xrpl:0/1/2 확인
- [XRPL CAIP-19 Assets](https://namespaces.chainagnostic.org/xrpl/caip19) - slip44:144, token:{currency}.{issuer}
- [XRPL Addresses](https://xrpl.org/docs/concepts/accounts/addresses) - r-address 도출 알고리즘
- [xrpl.js GitHub Releases](https://github.com/XRPLF/xrpl.js/releases) - v4.6.0 (2025-02-12)
