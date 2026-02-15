# Project Research Summary

**Project:** WAIaaS v1.5.1 -- x402 프로토콜 클라이언트 지원
**Domain:** Self-hosted AI agent wallet daemon -- x402 HTTP payment protocol client, EIP-3009 authorization, Solana partial signing, SSRF-protected HTTP proxy
**Researched:** 2026-02-15
**Confidence:** HIGH

## Executive Summary

x402는 HTTP 402 "Payment Required" 상태 코드를 활용한 오픈 결제 프로토콜로, AI 에이전트가 유료 API를 자동으로 결제하며 사용할 수 있게 한다. WAIaaS v1.5.1은 x402 **클라이언트(결제자)** 역할을 추가하여, 에이전트가 외부 유료 리소스에 접근할 때 데몬이 402 응답을 감지하고, 정책 평가 후 자동으로 결제 서명을 생성하여 리소스를 가져오는 투명한 프록시 기능을 제공한다.

핵심 기술적 발견: **신규 npm 의존성은 `@x402/core` 1개만 필요**하다. @x402/core v2.3.1은 Zod ^3.24.2 기반으로 PaymentRequired/PaymentPayload Zod 스키마를 공식 제공하며, WAIaaS의 "Zod SSoT" 원칙과 완벽 호환된다. EVM 결제 서명(EIP-3009)은 이미 설치된 viem 2.x의 `signTypedData` API로 구현 가능하고, Solana 부분 서명은 @solana/kit 6.x의 기존 패턴(noopSigner feePayer + signBytes)을 그대로 활용한다. SSRF 보호는 외부 라이브러리가 native fetch와 호환되지 않거나 CVE 이슈가 있어, Node.js 내장 `dns/promises` + `net` 모듈로 직접 구현한다.

아키텍처적으로, x402 결제 흐름은 **sign-only 패턴과 유사한 독립 파이프라인**으로 구현한다. 기존 6-stage 트랜잭션 파이프라인을 확장하지 않고, 별도 `x402-handler.ts` 모듈이 10단계 흐름(URL 검증 → 외부 preflight 요청 → 402 파싱 → 정책 평가 → 결제 서명 → 재요청 → 감사 로그)을 오케스트레이션한다. 기존 정책 엔진(`evaluateAndReserve`)을 재사용하여 SPENDING_LIMIT 평가와 TOCTOU 방지를 동일하게 적용한다. 가장 큰 보안 위험은 **SSRF**(WAIaaS 최초로 사용자 지정 URL로 outbound HTTP를 보냄)이며, 이는 DNS 리바인딩, IPv4-mapped IPv6, 옥탈 인코딩 등 다양한 우회 기법에 대한 포괄적 방어가 필수적이다.

## Key Findings

### Recommended Stack

**신규 의존성:** `@x402/core ^2.3.1` 1개만 추가. 이 패키지는 Zod ^3.24.2를 유일한 런타임 의존성으로 사용하며, x402 v2 프로토콜의 PaymentRequired, PaymentPayload, PaymentRequirements 타입에 대한 공식 Zod 스키마를 제공한다. WAIaaS의 Zod SSoT 원칙과 완벽 호환되므로, 자체 스키마 정의 대신 import하여 사용한다.

**기존 스택 활용:**
- **viem 2.x**: EVM EIP-3009 서명에 `account.signTypedData()` API 사용. privateKeyToAccount 패턴은 EvmAdapter에서 이미 검증됨. 추가 설치 불필요.
- **@solana/kit 6.x**: Solana SPL TransferChecked 부분 서명에 `createNoopSigner` + `signBytes` 패턴 활용. SolanaAdapter에서 동일 패턴 사용 중. 추가 설치 불필요.
- **Node.js 내장 모듈**: SSRF 방어에 `node:dns/promises` + `node:net` 사용. 외부 SSRF 라이브러리(`private-ip`, `request-filtering-agent`)는 native fetch와 호환 불가하거나 CVE 존재로 직접 구현.
- **native fetch**: HTTP 클라이언트로 Node.js 22 내장 fetch 사용. WAIaaS zero-dep 철학 일치. axios/got 불필요.

**명시적으로 추가하지 않는 것:**
- `@x402/evm`, `@x402/svm`: x402 공식 SDK이나 WAIaaS는 viem/solana-kit을 직접 사용하여 더 정밀한 키 관리 및 정책 통합 가능. 추가하면 중복 의존성.
- `@x402/fetch`: wrapFetchWithPayment() 함수는 정책 평가 삽입 지점이 없어 사용 불가. 타입만 @x402/core에서 import.
- `caip` npm 패키지: CAIP-2 파싱은 `string.split(':')` 수준으로 단순. 상수 매핑 테이블로 충분.

### Expected Features

**Table Stakes (필수):**
- HTTP 402 응답 파싱 + PaymentRequirements 해석
- EVM EIP-3009 결제 서명 생성 (USDC transferWithAuthorization)
- Solana SPL TransferChecked 부분 서명 생성
- PAYMENT-SIGNATURE 헤더 인코딩 + 재요청
- X402_ALLOWED_DOMAINS 정책 (기본 거부, 허용 도메인만 결제)
- SPENDING_LIMIT 통합 (기존 4-tier 평가)
- SSRF 보호 (DNS 사전 해석 + 사설 IP 차단)
- POST /v1/x402/fetch 엔드포인트
- 감사 로그 (transactions 테이블에 type=X402_PAYMENT)
- CAIP-2 → NetworkType 매핑

**Differentiators (차별화):**
- **정책 기반 자동 결제 제어**: Coinbase x402 클라이언트는 정책 없이 무조건 결제. WAIaaS는 4-tier 정책 엔진(AUTO/NOTIFY/DELAY/APPROVAL)으로 금액별 제어. USD 환산 금액으로 tier 결정.
- **멀티 월렛 결제 라우팅**: EVM/SVM 둘 다 accepts에 제시되면 잔고 충분한 지갑 자동 선택. 선택 기준: 체인 지원, 토큰 잔고, USD 최저 비용.
- **결제 내역 Admin UI**: x402 결제 내역 조회, 도메인별 결제 통계. 기존 트랜잭션 목록 확장.
- **MCP 도구 x402_fetch**: AI 에이전트가 MCP로 x402 결제 URL 접근. 에이전트는 "URL 가져와줘"만 하면 자동 결제.
- **알림 연동**: 기존 4채널 알림에 X402_PAYMENT 이벤트 추가. 고액 결제 시 별도 경고.
- **도메인 허용/차단 목록**: URL 패턴 매칭으로 에이전트가 임의 URL 결제 방지. 화이트리스트/블랙리스트 모드.

**Anti-Features (명시적으로 구현 안 함):**
- Facilitator 서버 운영: WAIaaS는 클라이언트 역할만. facilitator는 Coinbase 등 외부 사용.
- x402 서버(Resource Server): WAIaaS는 지갑이지 결제 받는 서비스가 아님.
- Permit2 지원: EIP-3009가 x402 기본. Permit2는 복잡도 높고 현재 생태계에서 사용 사례 적음. v1에서 제외.
- V1 프로토콜 우선 지원: v2만 지원. v1은 파싱 fallback만.
- 자동 ATA 생성 (Solana): facilitator가 처리. ATA 미존재 시 에러 반환.

### Architecture Approach

**x402 요청 흐름 (10단계):**
1. URL 검증 (X402_ALLOWED_DOMAINS)
2. SSRF 가드 (DNS 해석 + IP 검증)
3. 외부 HTTP 요청 (preflight)
4. 비-402 응답 → 패스스루 종료 / 402 → PaymentRequired 파싱
5. (scheme, network) 선택 + CAIP-2 → NetworkType 변환
6. 금액 USD 환산 (USDC: $1 직접, 기타: IPriceOracle)
7. 정책 평가 (SPENDING_LIMIT 4-tier + evaluateAndReserve)
8. 결제 서명 생성 (EVM: EIP-3009 signTypedData / Solana: TransferChecked 부분 서명)
9. X-PAYMENT 헤더 인코딩 + 재요청
10. PAYMENT-RESPONSE 파싱 + DB 업데이트 (CONFIRMED) + 응답 반환

**Major components:**
1. **x402-handler.ts** — 전체 x402 흐름 오케스트레이션. 402 파싱, 정책 평가, 재요청, 에러 처리. payment-signer, ssrf-guard, PolicyEngine, TransactionService, PriceOracle와 통신.
2. **payment-signer.ts** — 체인별 결제 서명 생성. EVM EIP-3009 / Solana TransferChecked. viem signTypedData, @solana/kit signBytes + compileTransaction, KeyStore와 통신.
3. **ssrf-guard.ts** — URL 안전성 검증. DNS 해석 + 사설 IP 차단 + 리다이렉트 검증. node:dns, node:net만 사용 (외부 의존성 없음).
4. **routes/x402.ts** — REST API 라우트. 요청 파싱, 인증, 응답 매핑. x402-handler, sessionAuth middleware와 통신.
5. **x402.types.ts** — Zod 스키마, CAIP-2 매핑 테이블, x402 전용 타입. @x402/core types/schemas import.

**핵심 패턴:**
- **독립 파이프라인 모듈** (sign-only 패턴): 기존 6-stage 파이프라인을 확장하지 않고 별도 모듈. evaluateAndReserve() 재사용.
- **기본 거부 (default deny)**: X402_ALLOWED_DOMAINS 미설정 시 x402 결제 차단. CONTRACT_WHITELIST 패턴과 동일.
- **TOCTOU 방지**: evaluateAndReserve() + BEGIN IMMEDIATE로 동시 요청 직렬화. reserved_amount로 이중 결제 방지.
- **키 관리 패턴**: decrypt → use → release (finally). sign-only.ts, stage5Execute와 동일.
- **DELAY/APPROVAL 티어 즉시 거부**: x402는 동기 HTTP 흐름. 분 단위 대기 불가. INSTANT/NOTIFY만 지원.

### Critical Pitfalls

1. **SSRF -- DNS Rebinding으로 TOCTOU 공격하여 내부 네트워크 접근**
   - 위험: 에이전트가 URL 검증 통과 후 DNS가 127.0.0.1로 변경 → 내부 서비스 접근 → 메타데이터 탈취
   - 방어: DNS resolve + IP 검증 + 연결을 원자적으로 수행. IPv4-mapped IPv6(::ffff:127.0.0.1), 옥탈(0177.0.0.1), 16진수(0x7f000001) 모두 차단. 리다이렉트 매 hop 재검증.

2. **결제 서명 후 리소스 서버 실패 -- 자금 손실 위험 (Signed-But-Not-Delivered)**
   - 위험: 서명 전달 후 facilitator 정산 완료했으나 네트워크 타임아웃으로 리소스 미수신. 서명은 재사용 불가(nonce 소진).
   - 방어: validBefore 최소화(5분), 재시도 제한(1회), 감사 로그 즉시 기록, 미확인 결제 추적 UI.

3. **동시 x402 요청의 Race Condition -- SPENDING_LIMIT reserved_amount 우회**
   - 위험: 외부 HTTP 요청 중(수백 ms~수 초) 결제 금액 불명으로 reservation 불가. 이 구간에 다른 요청이 SPENDING_LIMIT 통과.
   - 방어: x402 전용 pre-reservation (config 기본값 $10), 외부 요청 완료 후 실제 금액으로 갱신. wallet별 x402 동시 요청 제한(기본 1).

4. **EIP-3009 Nonce 관리 실패 -- 이중 결제 또는 Frontrunning**
   - 위험: transferWithAuthorization은 누구나 제출 가능. 리소스 서버가 악의적이면 서명을 facilitator에 전달하지 않고 직접 정산. 또는 validBefore 만료 직전 정산하여 reservation 해제된 상태에서 결제 실행.
   - 방어: validBefore = now + 5분(최소), nonce DB 기록, reservation TTL을 validBefore와 동기화, nonce는 `crypto.randomBytes(32)` 랜덤 생성.

5. **도메인 검증 우회 -- URL 파싱 공격으로 X402_ALLOWED_DOMAINS 정책 무효화**
   - 위험: `https://api.example.com@evil.com`, `https://api.example.com.evil.com`, 백슬래시 혼동, URL encoding 등으로 정책 우회.
   - 방어: `new URL()` 한 번만 파싱 후 `url.hostname` 사용. hostname 정규화(lowercase, trailing dot 제거, punycode). userinfo(@) 포함 URL 거부. 와일드카드 dot-boundary 엄격 검증. 포트 80/443만 허용.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Core 타입 + CAIP-2 매핑 + DB 마이그레이션
**Rationale:** 타입/스키마가 모든 후속 phase의 기반. DB 마이그레이션 선행 필수.
**Delivers:** X402FetchRequest/Response Zod 스키마, TransactionType.X402_PAYMENT, PolicyType.X402_ALLOWED_DOMAINS, CAIP-2 매핑 테이블, DB 마이그레이션 v12 (CHECK 제약 + policies 타입)
**Addresses:** @x402/core 의존성 추가, 타입 불일치로 인한 후속 재작업 방지
**Avoids:** 타입 시스템 불완전한 상태에서 구현 시작
**Estimated:** ~10-12 requirements

### Phase 2: SSRF 가드 + x402 핸들러 + 결제 서명
**Rationale:** 핵심 로직 구현. SSRF는 보안 전제조건이므로 핸들러와 함께 구현.
**Delivers:** ssrf-guard.ts (DNS resolve + IP 검증), x402-handler.ts (10단계 흐름), payment-signer.ts (EVM EIP-3009 + Solana TransferChecked)
**Uses:** viem signTypedData, @solana/kit signBytes + noopSigner, node:dns, node:net
**Implements:** 독립 파이프라인 모듈 (sign-only 패턴)
**Addresses:** SSRF 취약점을 나중에 패치하는 것보다 처음부터 방어 구현
**Avoids:** Pitfall C-01 (DNS rebinding), C-02 (Signed-But-Not-Delivered), C-04 (nonce frontrunning), C-05 (URL 파싱 공격)
**Estimated:** ~18-22 requirements

### Phase 3: REST API + 정책 통합 + 감사 로그
**Rationale:** 핸들러 로직 완성 후 정책 통합 및 API 노출. 정책 없이 결제 기능 노출하지 않음.
**Delivers:** POST /v1/x402/fetch 엔드포인트, X402_ALLOWED_DOMAINS 정책 평가, SPENDING_LIMIT 통합 (evaluateAndReserve), transactions 테이블 기록, 알림 연동 (X402_PAYMENT 이벤트)
**Addresses:** 정책 기반 자동 결제 제어 (differentiator), 기본 거부 보안 원칙
**Avoids:** Pitfall C-03 (race condition reserved_amount), H-01 (타임아웃 캐스케이드)
**Estimated:** ~12-15 requirements

### Phase 4: SDK/MCP + E2E 테스트
**Rationale:** API 안정화 후 SDK/MCP 래핑은 기계적. E2E 테스트로 전체 흐름 검증.
**Delivers:** TS SDK x402Fetch(), Python SDK x402_fetch(), MCP x402_fetch 도구, skill files 업데이트, E2E 테스트 23개 시나리오
**Addresses:** MCP 도구 differentiator, SDK 통합 differentiator
**Avoids:** 인터페이스 불일치
**Estimated:** ~10-12 requirements

### Phase Ordering Rationale

- **Phase 1 우선**: 타입/스키마가 모든 후속 phase의 컴파일 타임 안전성 제공. DB 마이그레이션 선행하지 않으면 transactions INSERT 실패.
- **Phase 2에서 SSRF와 핸들러 함께**: 핸들러의 첫 번째 단계가 URL 검증. 분리하면 불완전한 핸들러 노출 위험.
- **Phase 3에서 정책 분리**: 핸들러 로직과 정책 통합은 관심사가 다름. 핸들러가 먼저 단위 테스트 가능해야 정책 통합 테스트 가능.
- **Phase 4 마지막**: REST API가 완성된 후 SDK/MCP 래핑은 직선적. 핸들러/정책 변경이 API 스펙에 영향.

### Research Flags

**Phases needing deeper research:**
- **Phase 2 (핸들러/서명)**: EIP-3009 도메인 파라미터(USDC name/version)가 체인별로 다를 수 있음. Base/Ethereum/Polygon USDC 컨트랙트의 `DOMAIN_SEPARATOR()` view function 호출하여 확인 필요. Confidence: MEDIUM.
- **Phase 2 (Solana 서명)**: Solana 부분 서명에서 noopSigner feePayer 슬롯이 빈 서명으로 올바르게 처리되는지 검증 필요. @solana/kit 6.x 문서 확인. Confidence: MEDIUM.
- **Phase 3 (타임아웃)**: DELAY 티어의 x402 타임아웃 처리 세부 로직 (request_timeout vs 정책 대기시간 budget). 동시성 시나리오 테스트 필요. Confidence: MEDIUM.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (타입/마이그레이션)**: Zod SSoT 패턴, DB 마이그레이션 v6b/v11 패턴 재사용. 표준 프로세스.
- **Phase 4 (SDK/MCP)**: 기존 SDK/MCP 패턴 재사용. 신규 연구 불필요.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | @x402/core npm 확인 (v2.3.1, zod ^3.24.2, Apache-2.0). viem/solana-kit 기존 사용 패턴 검증. SSRF 자체 구현 OWASP 가이드라인 기반. |
| Features | HIGH | x402 v2 스펙 + WAIaaS 기존 기능(정책, 알림, Kill Switch) 재사용. Table stakes 10개, Differentiators 6개, Anti-features 5개 모두 근거 명확. |
| Architecture | HIGH | x402-handler + payment-signer + ssrf-guard 분리. sign-only 패턴 재사용. evaluateAndReserve 통합 검증됨. 컴포넌트 경계 5개, 10단계 흐름 명확. |
| Pitfalls | HIGH | OWASP SSRF Cheat Sheet, EIP-3009 스펙, DNS rebinding 연구, URL 파싱 공격 케이스 교차 검증. Critical 5개, High 5개, Moderate 5개 모두 근거 기반. |

**Overall confidence:** HIGH

### Gaps to Address

- **EIP-3009 도메인 파라미터**: USDC 컨트랙트의 EIP-712 domain separator(name, version)가 체인별로 다를 가능성. 구현 시 Base/Ethereum/Polygon USDC의 `name()`, `version()` view function 또는 `DOMAIN_SEPARATOR()` 조회하여 상수 테이블 확인 필요. Coinbase 문서에서 확인 가능할 수도 있음.
- **@x402/svm 버전 차이**: @x402/svm v2.3.0이 @solana/kit ^5.1.0 사용 (WAIaaS는 6.x). x402 SVM 참조 구현 확인 시 API 차이 주의. WAIaaS는 @x402/svm을 직접 사용하지 않으므로 블로커는 아니나, 참조 구현 참고 시 버전 차이 인지 필요.
- **Permit2 지원**: v1.5.1에서는 EIP-3009만 지원. Permit2는 사전 approve 트랜잭션 필요, 복잡도 높음. 향후 마일스톤에서 Permit2 필요성 재평가 + 추가 연구 필요.
- **x402 v1 호환**: v2만 우선 지원. v1 서버가 여전히 존재하면 파싱 fallback 추가 필요. v1과 v2의 헤더 차이(`X-PAYMENT` vs `PAYMENT-SIGNATURE`) 처리 전략.
- **Facilitator 정산 실패 시 재시도 프로토콜**: x402 스펙에 facilitator 정산 실패 시 클라이언트 재시도 프로토콜 명시 없음. 구현 시 방어적 설계 필요 (재시도 금지, 서명 1회만 사용).

## Sources

### Primary (HIGH confidence)
- [@x402/core npm v2.3.1](https://www.npmjs.com/package/@x402/core) -- package.json, 의존성, 라이선스 확인
- [Coinbase x402 GitHub](https://github.com/coinbase/x402) -- 모노레포, 스펙, 스키마, 참조 구현
- [x402 Protocol Specification v2](https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md) -- 프로토콜 흐름, 헤더, PaymentRequired/Payload 구조
- [x402 EVM Exact Scheme](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md) -- EIP-3009 TransferWithAuthorization 구조
- [x402 SVM Exact Scheme](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_svm.md) -- SPL TransferChecked 부분 서명
- [EIP-3009 Specification](https://eips.ethereum.org/EIPS/eip-3009) -- TransferWithAuthorization, nonce, validBefore 표준
- [viem signTypedData (Local Account)](https://viem.sh/docs/accounts/local/signTypedData) -- EIP-712 서명 API
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) -- SSRF 방어 전략
- [OWASP SSRF Prevention in Node.js](https://owasp.org/www-community/pages/controls/SSRF_Prevention_in_Nodejs) -- Node.js 전용 가이드
- [CAIP-2 Specification](https://standards.chainagnostic.org/CAIPs/caip-2) -- 블록체인 식별자 표준
- [Solana CAIP-2 Namespace](https://namespaces.chainagnostic.org/solana/caip2) -- genesis hash 기반 식별자
- WAIaaS 코드베이스 직접 분석: `stages.ts`, `database-policy-engine.ts`, `sign-only.ts`, `objectives/v1.5.1-x402-client.md` (v1.5)

### Secondary (MEDIUM confidence)
- [x402 Network Support](https://docs.cdp.coinbase.com/x402/network-support) -- CAIP-2 매핑 목록
- [x402 v2 Launch](https://www.x402.org/writing/x402-v2-launch) -- v2 변경 사항, 헤더 표준화
- [Base x402 Agents Guide](https://docs.base.org/base-app/agents/x402-agents) -- Base 생태계 x402 통합
- [Solana x402 Guide](https://solana.com/developers/guides/getstarted/intro-to-x402) -- Solana x402 구현
- [PortSwigger URL Validation Bypass Cheat Sheet](https://portswigger.net/research/introducing-the-url-validation-bypass-cheat-sheet) -- URL 파싱 모호성 연구
- [Bypassing SSRF Protection in nossrf](https://www.nodejs-security.com/blog/bypassing-ssrf-protection-nossrf) -- Node.js SSRF 라이브러리 우회 사례
- [private-ip multicast bypass](https://www.nodejs-security.com/blog/dont-be-fooled-multicast-ssrf-bypass-private-ip) -- private-ip CVE

### Tertiary (LOW confidence)
- [x402 InfoQ Major Upgrade (2026-01)](https://www.infoq.com/news/2026/01/x402-agentic-http-payments/) -- 생태계 동향 (검증 필요)
- [EIP-3009 Forwarder for x402](https://github.com/TheGreatAxios/eip3009-forwarder) -- wrapper contracts (참조용, 미검증)

---
*Research completed: 2026-02-15*
*Ready for roadmap: yes*
