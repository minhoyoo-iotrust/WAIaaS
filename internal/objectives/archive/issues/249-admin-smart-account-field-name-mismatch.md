# #249 Admin UI Smart Account 생성 시 필드명 불일치로 validation 실패

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **수정일:** 2026-03-05
- **발견일:** 2026-03-05
- **관련 마일스톤:** v30.9 (Smart Account DX 개선)

## 증상

Admin UI에서 Smart Account (ERC-4337) 지갑 생성 시 "Action input validation failed." 에러 발생.
Provider(Pimlico), API Key, Chain(Ethereum), Environment(Testnet) 등 모든 필드를 올바르게 입력해도 실패.

## 원인

Admin UI `wallets.tsx`의 `handleCreate`에서 API에 보내는 필드명이 Zod 스키마(`CreateWalletRequestSchema`)와 불일치:

| Admin UI 전송 필드 | API 스키마 기대 필드 |
|---|---|
| `provider` | `aaProvider` |
| `apiKey` | `aaProviderApiKey` |
| `bundlerUrl` | `aaBundlerUrl` |
| `paymasterUrl` | `aaPaymasterUrl` |

OpenAPIHono가 Zod validation (superRefine)을 수행할 때 `aaProvider`가 없으므로 validation 실패.

## 영향 범위

- Admin UI에서 Smart Account 지갑 생성 불가
- REST API 직접 호출 시에는 정상 동작 (올바른 필드명 사용 시)

## 수정 방법

`packages/admin/src/pages/wallets.tsx`의 `handleCreate` 함수에서 필드명 수정:

```typescript
// Before (잘못된 필드명)
createBody.provider = 'custom';
createBody.bundlerUrl = formBundlerUrl.value;
createBody.paymasterUrl = formPaymasterUrl.value;
createBody.provider = formProvider.value;
createBody.apiKey = formApiKey.value;

// After (API 스키마에 맞는 필드명)
createBody.aaProvider = 'custom';
createBody.aaBundlerUrl = formBundlerUrl.value;
createBody.aaPaymasterUrl = formPaymasterUrl.value;
createBody.aaProvider = formProvider.value;
createBody.aaProviderApiKey = formApiKey.value;
```

## 테스트 항목

- [ ] Pimlico provider + API key로 Smart Account 지갑 생성 성공
- [ ] Alchemy provider + API key로 Smart Account 지갑 생성 성공
- [ ] Custom provider + bundlerUrl로 Smart Account 지갑 생성 성공
- [ ] Custom provider + bundlerUrl + paymasterUrl로 생성 성공
- [ ] EOA 지갑 생성은 영향 없이 정상 동작
- [ ] wallets-provider.test.tsx에서 API 호출 payload 필드명 검증 추가
