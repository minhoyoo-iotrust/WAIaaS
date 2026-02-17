# v1.7-057: Owner 수동 검증 API + Admin UI Verify 버튼

## 유형: MISSING
## 상태: FIXED

## 심각도: MEDIUM

## 현상

Owner 상태를 GRACE → LOCKED로 전환하려면 APPROVAL 티어 트랜잭션이 발생해야만 함. Owner 등록 직후 검증할 수 있는 직접적인 방법이 없어서:

1. Owner 설정이 올바른지 (주소가 맞는지, 서명이 통하는지) 사전 확인 불가
2. GRACE 상태가 장기간 유지 — masterAuth만으로 Owner 변경/제거 가능한 보안 취약 구간이 지속
3. WalletConnect 연결 후에도 "정상 설정 완료"를 확인할 수 없는 UX 단절

## 수정 방안

### 1. 전용 검증 API 추가

`POST /v1/wallets/:id/owner/verify` — ownerAuth 서명 검증만 수행하고 LOCKED 전환.

```
POST /v1/wallets/:id/owner/verify
Headers:
  X-Master-Password: <masterAuth>
  X-Owner-Signature: <서명>
  X-Owner-Message: <서명 메시지>
  X-Owner-Address: <Owner 주소>

Response 200:
{
  "ownerState": "LOCKED",
  "ownerAddress": "0x...",
  "ownerVerified": true
}
```

- ownerAuth 미들웨어로 서명 검증 → `markOwnerVerified()` 호출 → LOCKED 전환
- NONE 상태: 400 에러 (Owner 미등록)
- LOCKED 상태: 200 반환 (이미 검증됨, no-op)
- GRACE 상태: 서명 검증 통과 시 LOCKED 전환

### 2. Admin UI에 Verify Owner 버튼 추가

Owner 섹션(#055)에서 GRACE 상태일 때 "Verify Owner" 버튼 표시:

- **WalletConnect 연결됨**: 버튼 클릭 → WC로 서명 메시지 전송 → Owner 지갑에서 서명 → API 호출 → LOCKED
- **WalletConnect 미연결**: 버튼 클릭 → 서명 방법 안내 (WC 연결 유도 또는 수동 서명 입력 폼)
- **LOCKED 상태**: 버튼 숨김 (이미 검증 완료)
- **NONE 상태**: 버튼 숨김 (Owner 미등록)

### 3. WalletConnect 통한 검증 플로우

Admin UI에서 Verify 버튼 클릭 시 전체 플로우:

```
[Verify Owner 클릭]
  → 데몬이 검증용 메시지 생성 (nonce + timestamp)
  → WcSigningBridge를 통해 Owner 지갑에 서명 요청
  → Owner가 지갑 앱에서 서명 승인
  → 데몬이 서명 검증 (verifySIWE / Ed25519)
  → markOwnerVerified() → LOCKED
  → Admin UI에 "Owner verified" 토스트 + 상태 갱신
```

### 변경 대상 파일

**API (백엔드):**
- `packages/daemon/src/api/routes/wallets.ts` — `POST /wallets/:id/owner/verify` 라우트 추가
- `packages/daemon/src/api/routes/openapi-schemas.ts` — OwnerVerifyResponseSchema 추가
- `packages/daemon/src/api/server.ts` — verify 경로에 ownerAuth 미들웨어 등록

**Admin UI (프론트엔드):**
- `packages/admin/src/pages/wallets.tsx` — Owner 섹션에 Verify Owner 버튼 + WC 서명 요청 플로우
- `packages/admin/src/api/endpoints.ts` — WALLET_OWNER_VERIFY 엔드포인트 추가

**SDK/MCP:**
- `packages/sdk/src/client.ts` — `verifyOwner()` 메서드 추가
- `packages/mcp/src/tools/` — `owner_verify` MCP 도구 추가 (선택)

**Skill 파일:**
- `skills/wallet.skill.md` — verify-owner 엔드포인트 문서화

**테스트:**
- `packages/daemon/src/__tests__/owner-verify.test.ts` — 검증 API 단위 테스트
- `packages/admin/src/__tests__/wallets.test.tsx` — Verify 버튼 렌더/상태 전환 테스트

### 테스트 시나리오

| # | 시나리오 | 검증 방법 |
|---|---------|----------|
| 1 | GRACE 상태에서 유효한 서명으로 검증 | POST /owner/verify → 200 + ownerState=LOCKED assert |
| 2 | NONE 상태에서 검증 시도 | POST /owner/verify → 400 OWNER_NOT_CONNECTED assert |
| 3 | LOCKED 상태에서 검증 시도 (no-op) | POST /owner/verify → 200 + ownerState=LOCKED assert |
| 4 | 잘못된 서명으로 검증 시도 | POST /owner/verify → 401 INVALID_SIGNATURE assert |
| 5 | Admin UI GRACE에서 Verify 버튼 표시 | ownerState=GRACE 렌더 → Verify 버튼 존재 assert |
| 6 | Admin UI LOCKED에서 Verify 버튼 미표시 | ownerState=LOCKED 렌더 → Verify 버튼 미존재 assert |

## 발견

- WalletConnect 수동 테스트 중 Owner 설정 플로우에서 LOCKED 전환 방법이 없음을 확인
