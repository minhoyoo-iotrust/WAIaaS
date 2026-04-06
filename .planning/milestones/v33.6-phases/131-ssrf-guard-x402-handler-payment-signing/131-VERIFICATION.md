---
phase: 131-ssrf-guard-x402-handler-payment-signing
verified: 2026-02-15T21:25:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 131: SSRF Guard + x402 Handler + Payment Signing Verification Report

**Phase Goal:** 외부 URL에 대한 안전한 HTTP 요청, 402 응답 파싱, 체인별 결제 서명 생성이 단위 테스트 수준에서 동작하는 상태
**Verified:** 2026-02-15T21:25:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 사설 IP/localhost/링크 로컬/IPv4-mapped IPv6/옥탈/16진수 등 SSRF 우회 벡터가 모두 차단되고, HTTPS만 허용되며, 리다이렉트 매 hop에서 IP가 재검증된다 | VERIFIED | ssrf-guard.ts: 22개 IPv4 사설 범위(RFC 5735/6890), 6개 IPv6 범위, 4개 IPv4-mapped IPv6 바이패스 벡터, HTTPS 강제, 최대 3회 리다이렉트 hop별 validateUrlSafety 재호출. 54개 테스트 전부 통과. |
| 2 | HTTP 402 응답의 PAYMENT-REQUIRED 헤더에서 PaymentRequirements가 파싱되고, 비-402 응답은 그대로 패스스루된다 | VERIFIED | x402-handler.ts: parse402Response()가 base64 PAYMENT-REQUIRED 헤더 디코딩 + JSON body fallback + PaymentRequiredV2Schema.parse() Zod 검증 수행. 비-402 응답은 buildPassthroughResponse()로 status/headers/body 그대로 반환. 25개 테스트 통과. |
| 3 | accepts 배열에서 WAIaaS가 지원하는 (scheme, network) 쌍이 자동 선택되고, 지원 불가 시 X402_UNSUPPORTED_SCHEME 에러가 반환된다 | VERIFIED | x402-handler.ts: selectPaymentRequirement()가 scheme==='exact' + supportedNetworks.has() + resolveX402Network() 필터 후 BigInt 최저 amount 선택. 미지원 시 WAIaaSError('X402_UNSUPPORTED_SCHEME') throw. 테스트 5개 커버. |
| 4 | EVM EIP-3009 transferWithAuthorization 서명(viem signTypedData)과 Solana SPL TransferChecked 부분 서명(@solana/kit signBytes)이 각각 생성되고, 키스토어 복호화/해제가 finally 블록으로 안전하게 처리된다 | VERIFIED | payment-signer.ts: signEip3009()에서 account.signTypedData() 호출 (line 240), signSolanaTransferChecked()에서 signBytes() 호출 (line 373). signPayment()에서 try/finally 블록 내 keyStore.releaseKey() 호출 (lines 175-193). 테스트에서 에러 시에도 releaseKey 호출 확인. recoverTypedDataAddress로 서명 검증까지 완료. 23개 테스트 통과. |
| 5 | 결제 서명 재요청 후 다시 402를 받으면 1회만 재시도하고 X402_PAYMENT_REJECTED 에러로 종료된다 | VERIFIED | x402-handler.ts: handleX402Fetch() line 141-144에서 retryResponse.status === 402 시 WAIaaSError('X402_PAYMENT_REJECTED') throw. safeFetchWithRedirects 정확히 2번 호출됨(원본 + 재요청) 테스트로 확인. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/daemon/src/services/x402/ssrf-guard.ts` | SSRF guard module (validateUrlSafety, safeFetchWithRedirects, assertPublicIP) | VERIFIED | 258 lines, substantive implementation. exports: validateUrlSafety, safeFetchWithRedirects. Uses dns.lookup({all:true}), isIP, WAIaaSError. |
| `packages/daemon/src/__tests__/ssrf-guard.test.ts` | SSRF guard tests (54 tests) | VERIFIED | 397 lines, 54 test cases covering IPv4/IPv6/bypass vectors/redirects/protocol/URL normalization. All pass. |
| `packages/daemon/src/services/x402/payment-signer.ts` | Payment signer module (signPayment, signEip3009, signSolanaTransferChecked) | VERIFIED | 397 lines, substantive implementation. EIP-3009 EIP-712 signing with viem, Solana TransferChecked partial signing with @solana/kit, USDC_DOMAINS for 7 chains. |
| `packages/daemon/src/__tests__/payment-signer.test.ts` | Payment signer tests (23 tests) | VERIFIED | 448 lines, 23 test cases. Real crypto (viem signTypedData + recoverTypedDataAddress, @solana/kit signBytes). |
| `packages/daemon/src/services/x402/x402-handler.ts` | x402 handler orchestration (handleX402Fetch, parse402Response, selectPaymentRequirement) | VERIFIED | 293 lines, substantive implementation. Full pipeline: SSRF guard -> fetch -> 402 parse -> scheme select -> sign -> retry. |
| `packages/daemon/src/__tests__/x402-handler.test.ts` | x402 handler tests (25 tests) | VERIFIED | 636 lines, 25 test cases in 7 groups. Mocks ssrf-guard and payment-signer, tests full orchestration. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| ssrf-guard.ts | node:dns/promises | `lookup(hostname, { all: true })` DNS pre-resolution | WIRED | Line 68: `const addresses = await lookup(hostname, { all: true });` |
| ssrf-guard.ts | @waiaas/core WAIaaSError | `X402_SSRF_BLOCKED` error throw | WIRED | 7 throw sites with WAIaaSError('X402_SSRF_BLOCKED', ...) |
| x402-handler.ts | ssrf-guard.ts | `import { validateUrlSafety, safeFetchWithRedirects }` | WIRED | Line 28: import + used in handleX402Fetch lines 90, 93, 133 |
| x402-handler.ts | payment-signer.ts | `import { signPayment }` | WIRED | Line 29: import + used in handleX402Fetch line 115 |
| x402-handler.ts | @waiaas/core | X402FetchRequest, resolveX402Network, WAIaaSError, PaymentRequiredV2Schema | WIRED | Lines 17-27: imports. resolveX402Network used line 226, PaymentRequiredV2Schema used line 192 |
| payment-signer.ts | viem/accounts | `privateKeyToAccount` + `signTypedData` | WIRED | Line 19: import. Lines 237, 240: account creation and signTypedData call |
| payment-signer.ts | @solana/kit | `signBytes` for Solana partial signing | WIRED | Line 30: import. Line 373: `await signBytes(keyPair.privateKey, compiled.messageBytes)` |
| payment-signer.ts | keystore | `decryptPrivateKey -> sign -> finally releaseKey` | WIRED | Lines 175-193: try { decryptPrivateKey ... } finally { releaseKey } pattern |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| X4SEC-01 | SATISFIED | 22 private IPv4 ranges + 6 IPv6 ranges blocked in isPrivateIPv4/isPrivateIPv6 |
| X4SEC-02 | SATISFIED | normalizeIPv6Mapped handles ::ffff:A.B.C.D and ::ffff:HHHH:HHHH. 4 bypass vector tests. |
| X4SEC-03 | SATISFIED | safeFetchWithRedirects: validateUrlSafety called per hop, max 3 redirects |
| X4SEC-04 | SATISFIED | Protocol check: `url.protocol !== 'https:'` -> X402_SSRF_BLOCKED |
| X4SEC-05 | SATISFIED | normalizeUrl: trailing dot removal, lowercase, userinfo rejection, port 443 only |
| X4HAND-01 | SATISFIED | parse402Response: PAYMENT-REQUIRED header base64 decode + JSON body fallback + PaymentRequiredV2Schema.parse() |
| X4HAND-02 | SATISFIED | selectPaymentRequirement: scheme=exact filter + supportedNetworks + resolveX402Network + lowest amount |
| X4HAND-03 | SATISFIED | handleX402Fetch: response.status !== 402 -> buildPassthroughResponse() |
| X4HAND-04 | SATISFIED | PAYMENT-SIGNATURE header encoding + safeFetchWithRedirects retry call |
| X4HAND-05 | SATISFIED | retryResponse.status === 402 -> throw WAIaaSError('X402_PAYMENT_REJECTED'). Test confirms exactly 2 fetch calls. |
| X4HAND-06 | SATISFIED | Network error propagation, AbortError propagation, X402_SERVER_ERROR for non-ok retry |
| X4SIGN-01 | SATISFIED | signEip3009: account.signTypedData with TransferWithAuthorization types. recoverTypedDataAddress verification in test. |
| X4SIGN-02 | SATISFIED | signSolanaTransferChecked: createNoopSigner for feePayer, signBytes for wallet, base64 serialization |
| X4SIGN-03 | SATISFIED | signPayment: try { decryptPrivateKey -> sign } finally { releaseKey }. Test verifies releaseKey called on error. |
| X4SIGN-04 | SATISFIED | validBefore = Date.now()/1000 + 300 (5min). nonce = randomBytes(32).toString('hex'). Tests verify +-10s tolerance and 0x+64hex format. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No TODO/FIXME/PLACEHOLDER/console.log/empty returns found |

### Human Verification Required

### 1. Real SSRF Defense Against DNS Rebinding

**Test:** Send a request through the SSRF guard where DNS first resolves to a public IP, then on the same connection rebinds to a private IP.
**Expected:** The request should be blocked because DNS is resolved before fetch.
**Why human:** DNS rebinding is a timing attack that cannot be verified with static analysis. The implementation uses DNS pre-resolution which mitigates this, but real-world behavior depends on fetch() implementation honoring the pre-resolved addresses.

### 2. @solana/kit signBytes Compatibility

**Test:** Run Solana payment signing against a real Solana devnet facilitator endpoint.
**Expected:** The base64-encoded partially-signed transaction should be accepted by the facilitator for fee payment and submission.
**Why human:** The Solana transaction format compatibility with x402 facilitators requires end-to-end testing with real infrastructure.

### 3. EIP-3009 Signature Acceptance by USDC Contract

**Test:** Submit the generated EIP-3009 transferWithAuthorization signature to a real Base Sepolia USDC contract.
**Expected:** The signature should be accepted as valid authorization for USDC transfer.
**Why human:** EIP-712 domain separator correctness (name, version, chainId, verifyingContract) must match the actual deployed contract. Static analysis verifies structure but not contract-level acceptance.

### Gaps Summary

No gaps found. All 5 observable truths are verified with supporting evidence from code inspection and 102 passing tests (54 + 23 + 25). All 15 requirements (X4SEC-01~05, X4HAND-01~06, X4SIGN-01~04) are satisfied. All key links are wired. No anti-patterns detected. 6 commits verified.

---

_Verified: 2026-02-15T21:25:00Z_
_Verifier: Claude (gsd-verifier)_
