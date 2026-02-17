# v1.7-056: WalletConnect 페어링 시 Owner 주소 검증 누락

## 유형: BUG
## 상태: FIXED

## 심각도: HIGH

## 현상

1. **Owner 미등록 상태에서 WC 페어링 허용**: `POST /v1/wallets/:id/wc/pair` 핸들러가 월렛의 `ownerAddress` 존재 여부를 체크하지 않아, ownerState=NONE인 월렛에서도 WalletConnect 페어링이 가능함. Owner가 없으면 APPROVAL 승인 대상이 없으므로 WC 연결 자체가 무의미.

2. **WC 연결 주소와 Owner 주소 불일치 미검증**: `WcSessionService`의 `session_proposal` 승인 시 연결된 계정 주소(CAIP-10에서 추출)를 DB에 등록된 `owner_address`와 비교하지 않고 그대로 저장함. 등록된 Owner와 다른 지갑이 연결될 수 있어 보안 위험.

## 영향

- Owner가 없는 월렛에 제3자 지갑이 WC로 연결되면, 향후 Owner 등록 시 혼란 발생
- 등록된 Owner와 다른 주소의 지갑이 연결되면 APPROVAL 서명 검증이 실패하거나, 의도하지 않은 주체가 트랜잭션을 승인할 수 있음

## 수정 방안

### 1. 페어링 API에 Owner 등록 여부 가드 추가

`wc.ts` `createPairingRoute` 핸들러에서 월렛의 `owner_address`를 조회하여 미등록 시 거부:

```typescript
// SELECT에 owner_address 추가
const wallet = sqlite
  .prepare('SELECT id, chain, default_network, environment, status, owner_address FROM wallets WHERE id = ?')
  .get(id);

if (!wallet.owner_address) {
  throw new WAIaaSError('OWNER_NOT_SET', {
    message: 'Owner address must be set before connecting WalletConnect',
  });
}
```

- 에러 코드 `OWNER_NOT_SET` 신규 추가 (HTTP 400)
- sessionAuth 경로(`POST /v1/wallet/wc/pair`)에도 동일 가드 적용

### 2. 세션 승인 시 연결 주소와 Owner 주소 일치 검증

`WcSessionService`의 `session_proposal` 이벤트 핸들러에서 연결된 계정 주소와 DB의 `owner_address`를 비교:

```typescript
// CAIP-10에서 추출한 주소
const connectedAddress = parts.slice(2).join(':');

// DB에서 owner_address 조회
const wallet = this.sqlite
  .prepare('SELECT owner_address FROM wallets WHERE id = ?')
  .get(walletId);

// 대소문자 무시 비교 (EVM은 checksum 차이 가능)
if (wallet.owner_address.toLowerCase() !== connectedAddress.toLowerCase()) {
  // 세션 거부
  await this.signClient.reject({ id: proposal.id, reason: { code: 4001, message: 'Connected wallet address does not match registered owner' } });
  return;
}
```

- EVM: 대소문자 무시 비교 (EIP-55 checksum 차이)
- Solana: 정확 일치 비교 (Base58 대소문자 구분)

### 변경 대상 파일

**백엔드:**
- `packages/daemon/src/api/routes/wc.ts` — 페어링 핸들러에 owner_address 가드 추가 (masterAuth, sessionAuth 양쪽)
- `packages/daemon/src/services/wc-session-service.ts` — session_proposal 핸들러에 주소 일치 검증 추가
- `packages/core/src/errors.ts` — `OWNER_NOT_SET` 에러 코드 추가

**Admin UI:**
- `packages/admin/src/utils/error-messages.ts` — `OWNER_NOT_SET` 에러 메시지 추가
- `packages/admin/src/pages/wallets.tsx` — Owner 미등록 시 Connect Wallet 버튼 비활성화 또는 숨김 (#055와 연계)

**테스트:**
- `packages/daemon/src/__tests__/wc-pairing.test.ts` — Owner 미등록 시 페어링 거부 테스트
- `packages/daemon/src/__tests__/wc-session-service.test.ts` — 주소 불일치 시 세션 거부 테스트

### 테스트 시나리오

| # | 시나리오 | 검증 방법 |
|---|---------|----------|
| 1 | Owner 미등록 월렛에서 페어링 시도 | POST /wc/pair → 400 OWNER_NOT_SET assert |
| 2 | Owner 등록 월렛에서 페어링 성공 | POST /wc/pair → 200 + uri 반환 assert |
| 3 | WC 연결 주소와 Owner 주소 일치 | session_proposal → 세션 승인 + DB 저장 assert |
| 4 | WC 연결 주소와 Owner 주소 불일치 | session_proposal → 세션 거부 + DB 미저장 assert |
| 5 | EVM 주소 대소문자 차이 허용 | checksum 주소 vs lowercase → 일치로 판정 assert |
| 6 | sessionAuth 경로에도 가드 적용 | POST /wallet/wc/pair (Owner 없음) → 400 assert |

## 발견

- WalletConnect 수동 테스트 중 Owner 미등록 월렛에서 Connect Wallet 버튼 활성화 확인
