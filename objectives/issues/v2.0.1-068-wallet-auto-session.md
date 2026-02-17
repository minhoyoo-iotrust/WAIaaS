# Issue #068: 지갑 생성 시 기본 세션 자동 생성

- **유형**: ENHANCEMENT
- **심각도**: MEDIUM
- **마일스톤**: v2.0.1
- **상태**: FIXED
- **수정일**: 2026-02-18

## 현황

현재 지갑과 세션 생성이 분리되어 있어 2단계 API 호출이 필요:

1. `POST /v1/wallets` → 지갑 생성 (세션 없음)
2. `POST /v1/sessions` → 세션 별도 생성 (walletId 필요)

AI 에이전트 지갑의 특성상 세션 없는 지갑은 사실상 사용할 수 없으므로, 지갑 생성 시 기본 세션을 자동 생성하여 DX를 개선한다.

## 설계

### API 변경

`POST /v1/wallets` 요청에 `createSession` 옵션 파라미터 추가:

```json
{
  "name": "my-wallet",
  "chain": "solana",
  "environment": "testnet",
  "createSession": true
}
```

- **기본값**: `true` (대부분의 사용 패턴에 맞춤)
- `false`: 세션 없이 지갑만 생성 (벌크 프로비저닝, Admin 관리 목적)

### 응답 변경

`createSession: true`일 때 응답에 `session` 필드 추가:

```json
{
  "id": "wallet-id",
  "name": "my-wallet",
  "chain": "solana",
  "network": "devnet",
  "environment": "testnet",
  "publicKey": "...",
  "status": "ACTIVE",
  "ownerAddress": null,
  "ownerState": "NONE",
  "createdAt": 1739900000,
  "session": {
    "id": "session-id",
    "token": "wai_sess_eyJ...",
    "expiresAt": 1739986400
  }
}
```

`createSession: false`일 때는 `session` 필드가 `null` 또는 생략.

### 세션 TTL

자동 생성 세션은 `config.security.session_ttl` (기본 86400초 = 24시간) 적용.

## 작업 범위

### 1. @waiaas/core — Zod 스키마 변경

- `CreateWalletRequestSchema`에 `createSession` 필드 추가 (`z.boolean().default(true)`)
- 응답 스키마에 `session` 옵셔널 필드 추가

### 2. daemon — 지갑 라우트 변경

- `POST /v1/wallets` 핸들러에서 `createSession === true`일 때 세션 생성 로직 인라인 추가
- 기존 `sessionRoutes`의 세션 생성 로직을 공유 함수로 추출하여 재사용
- OpenAPI 스키마 업데이트

### 3. Admin UI — 지갑 생성 폼 변경

- `wallets.tsx`의 `handleCreate`에서 응답의 `session` 필드 처리
- 지갑 생성 성공 시 세션 토큰 표시 (복사 버튼 포함)
- "Create without session" 체크박스/토글 옵션 추가 (기본 해제 = 세션 자동 생성)

### 4. SDK 변경

- TypeScript SDK: `createWallet` 옵션에 `createSession` 추가, 응답 타입에 `session` 필드 추가
- Python SDK: 동일 변경
- MCP: `create_wallet` 도구 파라미터 + 응답 업데이트

### 5. CLI quickstart 단순화

- `quickstartCommand`에서 별도 세션 생성 호출 제거 (API가 자동 처리)

### 6. 스킬 파일 동기화

- `skills/wallet.skill.md`, `skills/quickstart.skill.md` 업데이트

## 영향 범위

| 패키지 | 변경 |
|--------|------|
| @waiaas/core | Zod 스키마 (CreateWalletRequest, 응답) |
| daemon | wallets.ts 라우트, openapi-schemas.ts |
| admin | wallets.tsx (생성 폼 + 세션 토큰 표시) |
| sdk | TypeScript SDK 타입 + 메서드 |
| python-sdk | 타입 + 메서드 |
| mcp | create_wallet 도구 |
| cli | quickstart.ts 단순화 |
| skills/ | wallet.skill.md, quickstart.skill.md |

## 호환성

- **비파괴적 변경**: 기존 클라이언트는 응답에 `session` 필드가 추가되는 것을 무시 가능
- 기존 `POST /v1/sessions` API는 그대로 유지 (세션 추가 발급, 갱신 등)
- `createSession` 파라미터 미전송 시 기본값 `true`로 동작

## 완료 기준

- [ ] `POST /v1/wallets`에 `createSession` 파라미터 지원
- [ ] `createSession: true` (기본값)일 때 세션이 자동 생성되고 응답에 포함됨
- [ ] `createSession: false`일 때 기존과 동일하게 지갑만 생성됨
- [ ] Admin UI 지갑 생성 후 세션 토큰 표시 + 복사 기능
- [ ] Admin UI에 "Create without session" 옵션 존재
- [ ] SDK, MCP, Python SDK에 변경 반영
- [ ] CLI quickstart에서 불필요한 세션 생성 호출 제거
- [ ] 스킬 파일 동기화 완료
- [ ] 기존 테스트 통과 + 신규 테스트 추가
