# 484 — XRPL 서명 시 지갑 주소 불일치 (fromEntropy vs sodium-native)

- **유형:** BUG
- **심각도:** CRITICAL
- **상태:** FIXED
- **발견일:** 2026-04-07
- **발견 경위:** XRPL DEX 스왑 UAT 중 Trust Line/Swap TX가 `WALLET_NOT_SIGNER` 에러로 실패

## 증상

- XRPL 트랜잭션 서명 시 `Wallet address rp96rR... does not match transaction Account rMQFq...` 에러
- DB의 지갑 주소(rMQFq...)와 서명 시 생성된 주소(rp96r...)가 다름
- 모든 XRPL 온체인 트랜잭션(전송, DEX, Trust Line 등) 서명 불가

## 원인

지갑 생성과 서명에서 **서로 다른 키 파생 방식** 사용:

### 지갑 생성 (`keystore.ts:343-362`)
```
1. sodium-native: Ed25519 keypair 생성 → (publicKey, secretKey)
2. seed = secretKey.subarray(0, 32) → 암호화 저장
3. ripple-keypairs.deriveAddress("ED" + publicKey.hex) → r-address (DB 저장)
```

### 서명 시 (`adapter.ts:260`)
```
1. seed = 복호화된 32-byte seed
2. Wallet.fromEntropy(seed, { algorithm: ed25519 }) → 내부적으로 entropy → deriveKeypair
3. wallet.address → 다른 r-address!
```

**근본 원인**: `Wallet.fromEntropy()`는 입력을 entropy로 해석하여 XRPL 표준 키 파생(HMAC-SHA512 기반)을 수행합니다. 이것은 sodium-native의 Ed25519 seed를 직접 사용하는 것과 다른 키를 생성합니다.

## 수정 방향

`signTransaction`에서 `Wallet.fromEntropy()` 대신, 저장된 seed로부터 원래의 Ed25519 키를 복원하여 서명해야 합니다:

**방법 A**: sodium-native로 seed → keypair 복원 후, xrpl.js `Wallet`을 public/private key hex로 직접 생성
```ts
const keypair = nacl.sign.keyPair.fromSeed(seed);
const publicKeyHex = 'ED' + Buffer.from(keypair.publicKey).toString('hex').toUpperCase();
const privateKeyHex = Buffer.from(keypair.secretKey).toString('hex').toUpperCase();
const wallet = new Wallet(publicKeyHex, '00' + privateKeyHex.slice(0, 64));
```

**방법 B**: `Wallet.fromEntropy()` 방식으로 통일 — 지갑 생성 시에도 `fromEntropy`로 r-address 파생

## 테스트 항목

- [ ] 서명 시 생성된 지갑 주소가 DB의 공개키 주소와 일치
- [ ] XRPL 네이티브 전송 서명 + 제출 성공
- [ ] XRPL DEX Trust Line 설정 서명 + 제출 성공
- [ ] XRPL DEX 스왑 서명 + 제출 성공
- [ ] 기존 XRPL 지갑의 키가 새 서명 로직에서도 동일 주소 생성 확인
