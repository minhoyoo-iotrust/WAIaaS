# Domain Pitfalls: ERC-8128 Signed HTTP Requests

**Domain:** HTTP 메시지 서명 (RFC 9421 + EIP-191) 을 기존 지갑 시스템에 통합
**Researched:** 2026-03-05
**Overall confidence:** MEDIUM (ERC-8128 Draft 상태, RFC 9421/9530은 Final)

---

## Critical Pitfalls

실수 시 서명 검증 실패 또는 보안 취약점을 유발하는 문제들.

### Pitfall 1: RFC 9421 Signature Base 줄바꿈 — LF only, CRLF 사용 시 검증 실패

**What goes wrong:** Signature Base 구성 시 줄 구분자로 `\r\n` (CRLF) 를 사용하면, 검증자가 `\n` (LF) 로 재구성할 때 서명이 불일치하여 100% 검증 실패.

**Why it happens:** HTTP 프로토콜 자체는 CRLF를 사용하지만, RFC 9421 Section 2.5는 Signature Base의 줄 구분자로 LF만 사용하도록 명시. Node.js에서 `\n`이 기본이라 문제 없어 보이지만, HTTP 헤더 파싱 라이브러리가 CRLF를 포함한 raw 값을 반환할 경우 오염.

**Consequences:** 생성한 서명이 어떤 검증자에서도 통과하지 못함. 디버깅이 어려운 이유: 눈으로 보면 Signature Base가 동일해 보이지만 바이트 수준에서 다름.

**Prevention:**
- Signature Base 빌더에서 최종 출력 시 `.replace(/\r\n/g, '\n')` 강제 정규화
- 테스트에서 `Buffer.from(signatureBase).includes(0x0d)` 로 CR 바이트 부재 검증
- 마지막 컴포넌트 뒤에 trailing newline 없음을 검증 (`@signature-params` 줄 뒤에 `\n` 없음)

**Detection:** 단위 테스트에서 Signature Base를 hex dump하여 `0x0d` 바이트 검색

**Phase:** SIG-01 (서명 엔진 구현) 에서 반드시 해결

---

### Pitfall 2: Signature Base 컴포넌트 값에 newline 주입 허용

**What goes wrong:** HTTP 헤더 값이나 derived component 값에 `\n` 문자가 포함되면 Signature Base 파싱이 깨지고, 공격자가 서명 대상을 조작할 수 있음 (Signature Wrapping Attack).

**Why it happens:** RFC 9421은 "Component values MUST NOT contain newline characters"라고 명시하지만, 입력 검증 없이 헤더 값을 그대로 Signature Base에 삽입하면 이 규칙이 위반됨.

**Consequences:** 서명 검증 우회. 공격자가 악의적 헤더 값으로 Signature Base를 조작하여 원래 서명되지 않은 내용을 서명된 것처럼 위조 가능.

**Prevention:**
- 모든 컴포넌트 값에서 `\n`, `\r` 문자를 검증 후 reject (에러 반환)
- `buildComponentValue()` 함수에서 입력 sanitization guard 적용
- 절대로 newline을 strip하고 계속 진행하지 말 것 — 에러를 던져야 함 (silent strip은 서명 내용이 실제 요청과 달라짐)

**Detection:** 퍼즈 테스트 또는 헤더 값에 `\n` 포함한 악의적 입력 테스트

**Phase:** SIG-01 (서명 엔진)

---

### Pitfall 3: Structured Fields 직렬화를 수동 구현하여 미묘한 인코딩 오류 발생

**What goes wrong:** RFC 9421의 Signature-Input 헤더는 RFC 8941/9651 Structured Fields Dictionary 형식. 직접 문자열 조합으로 구성하면 quoting, escaping, 공백 규칙을 위반하여 파싱 실패.

**Why it happens:**
- Inner List의 괄호 안 문자열은 반드시 `"` 로 감싸야 함: `("@method" "@target-uri")` (O) vs `(@method @target-uri)` (X)
- Parameter 값의 타입별 직렬화 규칙이 다름: Integer는 따옴표 없이, String은 `"` 로, Byte Sequence는 `:base64:` 형식
- 공백 규칙: Inner List 아이템 사이 단일 공백, 파라미터 앞 `;` 뒤 공백 없음

**Consequences:** 생성한 Signature-Input 헤더를 검증자가 파싱할 수 없거나, 파싱 결과가 달라 서명 검증 실패.

**Prevention:**
- `structured-headers` npm 패키지 (RFC 9651 구현체) 사용하여 직렬화를 라이브러리에 위임
- 수동 문자열 조합 절대 금지
- Signature 헤더의 값도 Byte Sequence 형식 (`:base64:`) 이므로 반드시 Structured Fields 라이브러리로 생성

**Detection:** RFC 9421 Appendix B의 테스트 벡터와 비교 검증

**Phase:** SIG-01 (서명 엔진)

---

### Pitfall 4: EIP-191 서명의 메시지 길이 인코딩 — 바이트 길이 vs 문자 길이

**What goes wrong:** EIP-191 personal_sign은 `"\x19Ethereum Signed Message:\n" + len(message) + message` 형식으로 프리픽스를 붙임. 여기서 `len`은 **바이트 길이**이지 문자 길이가 아님. Signature Base에 non-ASCII 문자가 포함될 경우 (URL에 인코딩된 유니코드 등) 길이가 달라져 검증 실패.

**Why it happens:** viem의 `signMessage()`는 string 입력 시 UTF-8 바이트 길이를 자동 계산하므로 일반적으로 문제없음. 그러나 검증자가 다른 언어/라이브러리를 사용할 경우 동일한 바이트 길이 계산을 해야 하며, 이 부분에서 불일치 발생.

**Consequences:** WAIaaS에서 생성한 서명을 외부 검증자가 검증 실패. 특히 Python/Go/Rust 검증자에서 문자 길이를 사용하면 불일치.

**Prevention:**
- viem `signMessage()`를 사용하면 내부적으로 올바른 바이트 길이 계산 — 직접 프리픽스 조합 금지
- 검증 유틸리티 (SIG-04)에서도 동일하게 viem `verifyMessage()` 사용
- 테스트에서 non-ASCII URL을 포함한 Signature Base로 sign → verify 왕복 검증
- 문서에 검증자를 위한 바이트 길이 계산 가이드 포함

**Detection:** non-ASCII 문자 포함 URL에 대한 크로스 라이브러리 서명/검증 테스트

**Phase:** SIG-01 + SIG-04 (서명 엔진 + 검증 유틸리티)

---

### Pitfall 5: Content-Digest를 body 직렬화 전에 계산하여 불일치

**What goes wrong:** Content-Digest는 HTTP 메시지의 **content** (즉, 전송되는 바이트 그대로)의 SHA-256 해시. 에이전트가 보내는 `body` 문자열과 실제 전송 바이트가 다르면 검증자 측에서 Content-Digest 불일치.

**Why it happens:**
- JSON body를 `JSON.stringify()`로 직렬화할 때 키 순서, 공백, 유니코드 이스케이프가 달라질 수 있음
- 에이전트가 body를 문자열로 전달하지만 실제 HTTP 전송 시 Content-Encoding (gzip 등) 이 적용되면 다른 바이트가 전송됨
- RFC 9530에 따르면 Content-Digest는 **content coding 적용 후** 바이트에 대해 계산

**Consequences:** 검증자가 수신한 body의 해시와 Content-Digest가 불일치하여 요청 거부.

**Prevention:**
- WAIaaS는 body를 **이미 직렬화된 문자열**로 받으므로 (`body: string`), 그 문자열의 UTF-8 바이트에 대해 Content-Digest 계산
- SDK `fetchWithErc8128()` 헬퍼에서 body 직렬화 → Content-Digest 계산 → fetch 전송 순서를 보장
- Content-Encoding (gzip) 사용 시 Content-Digest는 인코딩 후 바이트 기준임을 문서화
- 빈 body (GET 요청)에도 Content-Digest 계산 가능: SHA-256 of empty string. 단, covered components에서 `content-digest`를 빼는 것이 권장

**Detection:** gzip 전송, JSON key 순서 변경 시나리오 테스트

**Phase:** SIG-01 (서명 엔진) + SIG-02 (SDK fetchWithErc8128 헬퍼)

---

### Pitfall 6: "See What Is Signed" 원칙 무시 — 서명 확인 없이 데이터 신뢰

**What goes wrong:** 검증자가 Signature를 검증하지만 covered components에 포함되지 않은 헤더/URI 부분을 신뢰하여 보안 우회. WAIaaS 측에서는 서명 생성 시 중요한 컴포넌트를 빠뜨리는 것이 해당.

**Why it happens:** RFC 9421 Section 7.2.1이 경고하는 핵심 보안 원칙. 에이전트가 `coveredComponents`를 `['@method']`만 지정하면 URL이나 body가 서명에 포함되지 않아, 중간자가 URL을 바꿔도 서명이 유효.

**Consequences:** 서명이 유효하지만 실제로는 변조된 요청. 인증은 되지만 무결성이 보장되지 않음.

**Prevention:**
- `standard` 프리셋을 기본값으로 유지 (`@method`, `@target-uri`, `content-digest`, `content-type`)
- `minimal` 프리셋 사용 시 경고 로그 출력
- 에이전트가 빈 `coveredComponents: []`를 지정하면 에러 반환 (최소 `@method` + `@target-uri` 필수)
- 검증 유틸리티에서 covered components 목록을 응답에 포함하여 검증자가 확인 가능하도록

**Detection:** 최소 covered components 제약 조건에 대한 단위 테스트

**Phase:** SIG-01 (서명 엔진) + SIG-02 (API 입력 검증)

---

## Moderate Pitfalls

### Pitfall 7: ERC-8128 Draft 상태 — keyid 형식 변경 위험

**What goes wrong:** ERC-8128은 2026년 1월 제안된 Draft EIP. keyid 형식이 `erc8128:<chainId>:<address>` 에서 `erc8128;eip155:<chainId>:<address>` 로 변경될 수 있음. alg 식별자, nonce 필수/선택 여부도 미확정.

**Why it happens:** Draft EIP는 커뮤니티 피드백에 의해 변경 가능. Ethereum Magicians 포럼에서 keyid 네임스페이스 형식, 알고리즘 확장성, replay protection 수준에 대한 논의가 진행 중.

**Prevention:**
- keyid 생성/파싱을 `keyid.ts` 단일 모듈로 격리 — 형식 변경 시 한 곳만 수정
- alg 식별자를 상수로 정의하고 레지스트리 패턴 적용 (ERC8128_ALGORITHMS 맵)
- 테스트에서 keyid 형식을 하드코딩하지 말고 `buildKeyId()` / `parseKeyId()` 함수를 통해서만 참조
- 스펙 변경 추적을 위해 ERC-8128 EIP 페이지 + Ethereum Magicians 스레드 주기적 확인
- 변경 시 영향 범위: keyid.ts, constants.ts, Signature-Input 빌더, 검증 유틸리티

**Detection:** CI에서 ERC-8128 스펙 변경 감지는 불가능 — 수동 추적 필요. CHANGELOG에 "ERC-8128 Draft alignment" 항목 유지.

**Phase:** SIG-01 설계 시 격리 구조 확보, 전체 마일스톤에서 인식

---

### Pitfall 8: Structured Fields 라이브러리 선택 실수 — RFC 8941 vs 9651

**What goes wrong:** RFC 9421은 RFC 8941 (Structured Field Values) 을 참조하지만, RFC 9651이 8941을 obsolete 처리. npm에서 구버전 라이브러리를 선택하면 Date 타입 등 9651 추가 기능이 누락되거나, 향후 검증자가 9651 기준으로 파싱할 때 호환성 문제.

**Why it happens:** npm 패키지명이 `structured-headers` (RFC 8941 시절 이름)로 되어 있어 혼동. `structured-field-values` 등 여러 패키지가 존재하며 활성 유지보수 상태가 다름.

**Prevention:**
- `structured-headers` npm 패키지 사용 (RFC 9651 업데이트 반영 확인)
- 또는 `@shogo82148/sfv` (TypeScript 네이티브, RFC 8941 구현)
- 패키지 선택 시 최신 커밋 날짜, 다운로드 수, RFC 9651 지원 여부 확인
- ERC-8128에서 사용하는 Structured Fields 기능은 Dictionary + Inner List + Parameters로, 8941과 9651 차이가 크지 않음 (Date 타입 미사용)

**Phase:** SIG-01 (의존성 선택)

---

### Pitfall 9: Content-Digest 빈 body 처리 불일치

**What goes wrong:** GET 요청처럼 body가 없을 때 Content-Digest를 어떻게 처리할지 일관성 없이 구현하면 검증 실패.

**Why it happens:** RFC 9530에 따르면 빈 content에 대해서도 다이제스트 계산 가능 (SHA-256 of empty string = `47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=`). 하지만 대부분의 실무에서 GET 요청에 Content-Digest 헤더를 포함하지 않음.

**Prevention:**
- `minimal` 프리셋 (GET용)에서는 `content-digest`를 covered components에서 제외
- `standard`/`strict` 프리셋에서 body가 없으면 에러 반환 (`BODY_REQUIRED_FOR_DIGEST`)
- body가 빈 문자열(`""`)인 경우와 body가 없는 경우(`undefined`)를 구분: 빈 문자열은 유효한 body이므로 Content-Digest 생성
- 자동 프리셋 선택 로직: method가 GET/HEAD/DELETE이면 `minimal`, POST/PUT/PATCH이면 `standard`

**Phase:** SIG-01 (Content-Digest 모듈) + SIG-02 (API 요청 검증)

---

### Pitfall 10: Rate Limit 카운터 인메모리 관리 — 재시작 시 리셋

**What goes wrong:** `rate_limit_per_minute` 카운터를 인메모리 Map으로 관리하면 데몬 재시작 시 카운터가 0으로 리셋되어 rate limit이 무력화.

**Why it happens:** 설계 결정 D13에서 의도적으로 인메모리를 선택 (금전 리스크 없는 인증 서명이므로 DB 영속화 불필요). 하지만 공격자가 이를 알고 반복 재시작을 유도하면 rate limit 우회 가능.

**Prevention:**
- 이 동작이 **의도된 것**임을 문서화
- Rate limit은 보안 방어가 아닌 DX 편의 기능으로 포지셔닝
- 실질적 보안은 `ERC8128_ALLOWED_DOMAINS` default-deny 정책으로 보장
- 데몬 재시작은 masterAuth 필요하므로 공격자의 재시작 유도는 별도 보안 위협

**Phase:** SIG-03 (정책 구현)

---

### Pitfall 11: URL 파싱 불일치 — `@target-uri` 정규화

**What goes wrong:** 에이전트가 보내는 URL과 Signature Base에 포함되는 `@target-uri` 값이 다르면 검증 실패. 예: trailing slash 유무 (`https://api.com/v1` vs `https://api.com/v1/`), query string 순서, fragment 포함 여부.

**Why it happens:** RFC 9421에서 `@target-uri`는 "the target URI of the request message"로 정의하지만, URL 정규화 규칙이 구현마다 다를 수 있음. `new URL(input).toString()`이 자동으로 정규화하면서 원본과 달라질 수 있음.

**Prevention:**
- `@target-uri` 값은 에이전트가 전달한 URL **원본 그대로** 사용 — `new URL()` 파싱 후 `toString()` 금지
- 도메인 추출 (정책 평가용)에만 `new URL()` 사용하고, Signature Base에는 원본 문자열 삽입
- 테스트: trailing slash, query string, fragment, 포트 번호 포함/생략 케이스

**Phase:** SIG-01 (서명 엔진)

---

### Pitfall 12: 기존 6-stage 파이프라인에 ERC-8128을 끼워넣으려는 유혹

**What goes wrong:** ERC-8128 서명을 기존 SIGN 타입 discriminatedUnion에 추가하거나 6-stage 파이프라인을 통과시키면, Stage 1 파싱부터 Stage 6 제출까지 불필요한 로직을 거치고, ERC-8128 전용 로직 (RFC 9421 Signature Base 구성)을 파이프라인에 억지로 맞추게 됨.

**Why it happens:** 기존 코드 재사용 욕구. SIGN 타입이 이미 있으니 재사용하면 될 것 같은 착각. 하지만 SIGN은 `signMessage(arbitrary_data)` 용도이며, ERC-8128은 Signature-Input 빌드 → Signature Base 구성 → 서명 → 3개 헤더 반환이라는 전혀 다른 처리 흐름.

**Prevention:**
- 설계 결정 D12 엄격 준수: 전용 라우트 + 파이프라인 바이패스
- discriminatedUnion에 새 타입 추가 금지
- 정책 평가는 라우트 핸들러에서 직접 호출 (X402_ALLOWED_DOMAINS 패턴)
- 코드 리뷰 시 `PipelineContext`, `stage` import가 ERC-8128 모듈에 없는지 확인

**Phase:** SIG-02 (API 라우트 구현)

---

## Minor Pitfalls

### Pitfall 13: Signature 헤더의 Base64 인코딩 형식 — standard vs URL-safe

**What goes wrong:** RFC 9421의 Signature 헤더 값은 Structured Fields Byte Sequence 형식 (`:base64:`)으로 인코딩. 이때 Base64는 **standard** (RFC 4648 Section 4) 이지, URL-safe (Section 5) 가 아님. `+`, `/`, `=` 문자가 포함됨.

**Prevention:**
- `Buffer.from(signature).toString('base64')` 사용 (standard Base64)
- `base64url` 인코딩 사용 금지
- Structured Fields 라이브러리를 사용하면 자동으로 올바른 인코딩 적용

**Phase:** SIG-01

---

### Pitfall 14: `@authority` derived component의 포트 번호 처리

**What goes wrong:** `@authority`는 host + optional port. 기본 포트 (443 for HTTPS, 80 for HTTP) 를 포함하면 일부 검증자와 불일치.

**Prevention:**
- 기본 포트는 생략하는 것이 표준: `api.example.com` (O), `api.example.com:443` (X)
- `new URL(url).host`가 기본 포트를 자동 생략하므로 이를 활용

**Phase:** SIG-01

---

### Pitfall 15: Admin Settings `erc8128.enabled` 기본값 false — 활성화 누락

**What goes wrong:** `erc8128.enabled` 기본값이 `false`이므로 에이전트가 ERC-8128 서명을 요청하면 "feature not enabled" 에러를 받지만, 에러 메시지가 불친절하면 디버깅에 시간 소모.

**Prevention:**
- 에러 코드 `ERC8128_NOT_ENABLED` + 명확한 메시지: "ERC-8128 signing is disabled. Enable via Admin Settings (erc8128.enabled=true)"
- connect-info의 `capabilities.erc8128Support`로 사전 확인 가능하도록
- MCP 도구 설명에 활성화 필요 안내 포함

**Phase:** SIG-02 (API) + SIG-05 (Admin UI)

---

### Pitfall 16: 시간 동기화 — `created`/`expires` 타임스탬프 클럭 스큐

**What goes wrong:** 서명의 `created` 타임스탬프가 검증자 시계와 크게 다르면 TTL 검증에서 거부. 특히 로컬 데몬의 시스템 시계가 동기화되지 않은 경우.

**Prevention:**
- `created`는 `Math.floor(Date.now() / 1000)` 사용 (Unix 초)
- TTL 기본 300초 (5분)는 합리적인 클럭 스큐 허용 범위 포함
- 검증 유틸리티에서 5초 정도의 클럭 스큐 허용 (`created - 5 <= now` 체크)
- NTP 동기화 권장 사항 문서화

**Phase:** SIG-01 + SIG-04

---

## Integration Pitfalls (WAIaaS 특화)

### Pitfall 17: ERC8128_ALLOWED_DOMAINS vs X402_ALLOWED_DOMAINS 혼동

**What goes wrong:** 두 정책이 동일한 패턴 (도메인 허용 목록, default-deny, 와일드카드)이므로 코드 복사-붙이기로 구현 시 버그 전파. 특히 와일드카드 매칭 로직에서 `*.example.com`이 `example.com` 자체를 매칭하는지 여부가 x402와 ERC-8128에서 다르면 혼란.

**Prevention:**
- 도메인 매칭 유틸리티를 공통 함수로 추출 (x402 + ERC-8128 공유)
- 와일드카드 매칭 규칙을 한 곳에 정의하고 양쪽에서 import
- `isDomainAllowed()` 함수를 `packages/core/src/utils/` 에 배치
- 기존 `x402-domain-policy.ts`의 매칭 로직을 리팩터링하여 재사용

**Phase:** SIG-03 (정책 구현)

---

### Pitfall 18: Solana 지갑에 대한 ERC-8128 서명 요청 — EVM 전용 명확화

**What goes wrong:** ERC-8128은 이더리움 표준이므로 Solana 지갑에 대해 서명 요청이 오면 거부해야 함. 하지만 WAIaaS의 멀티체인 모델에서 지갑의 chain 타입 확인을 누락하면 Solana 키로 secp256k1 서명을 시도하여 실패하거나, 더 나쁜 경우 ed25519 서명이 생성되어 EIP-191 호환이 깨짐.

**Prevention:**
- 라우트 핸들러에서 `wallet.chain === 'evm'` 검증 필수
- 에러 코드 `EVM_NETWORK_REQUIRED` + 메시지: "ERC-8128 signing requires an EVM wallet"
- MCP 도구에서도 EVM 지갑만 목록에 표시하거나, Solana 지갑 선택 시 사전 경고

**Phase:** SIG-02 (API 라우트)

---

### Pitfall 19: fetchWithErc8128 헬퍼에서 Content-Digest 중복 생성

**What goes wrong:** SDK `fetchWithErc8128()` 헬퍼가 body를 `signHttpRequest()`에 전달하여 Content-Digest를 생성받고, 동시에 fetch 시 body를 다시 전송. 만약 `init.body`가 ReadableStream이나 FormData인 경우, 첫 번째 읽기에서 소진되어 두 번째 전송 시 빈 body가 됨.

**Prevention:**
- `fetchWithErc8128()`의 body를 반드시 `string`으로 제한 (ReadableStream/FormData 미지원)
- 또는 body를 한 번 읽어 string으로 변환한 후 서명 + 전송 양쪽에 사용
- TypeScript 타입으로 `body: string | undefined` 제한 강제

**Phase:** SIG-02 (SDK 구현)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| SIG-01 서명 엔진 | LF/CRLF, Structured Fields, newline injection, Base64 형식 | RFC 9421 테스트 벡터 기반 검증, structured-headers 라이브러리 사용 |
| SIG-01 Content-Digest | 빈 body, encoding, JSON 직렬화 순서 | body를 이미 직렬화된 string으로 받아 그대로 해시 |
| SIG-02 API 라우트 | 파이프라인에 끼워넣기 유혹, EVM 체인 검증 누락 | 전용 라우트 패턴 고수, chain 검증 guard |
| SIG-02 SDK 헬퍼 | body 스트림 소진, Content-Digest 불일치 | string-only body, 단일 읽기 |
| SIG-03 정책 | x402 코드 복사 버그, rate limit 재시작 리셋 | 공통 유틸리티 추출, 의도된 동작 문서화 |
| SIG-04 검증 유틸 | EIP-191 바이트 길이, 클럭 스큐 | viem verifyMessage 사용, 스큐 허용 |
| 전체 | Draft EIP 스펙 변경 | keyid/alg 모듈 격리, 변경 추적 |

---

## Sources

- [RFC 9421: HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421) — Signature Base 구성 규칙, 보안 고려사항 (HIGH confidence)
- [RFC 9421 Errata](https://www.rfc-editor.org/errata/rfc9421) — @signature-params vs @signature-input 용어 혼동 수정 (HIGH confidence)
- [RFC 9530: Digest Fields](https://www.rfc-editor.org/rfc/rfc9530.html) — Content-Digest 빈 body 처리 (HIGH confidence)
- [RFC 8941/9651: Structured Field Values](https://www.rfc-editor.org/rfc/rfc8941.html) — 직렬화 규칙 (HIGH confidence)
- [ERC-8128 Ethereum Magicians Discussion](https://ethereum-magicians.org/t/erc-8128-signed-http-requests-with-ethereum/27515) — keyid 형식 논의, 알고리즘 확장성 (MEDIUM confidence, ongoing)
- [EIP-191: Signed Data Standard](https://eips.ethereum.org/EIPS/eip-191) — 메시지 길이 인코딩 규칙 (HIGH confidence)
- [Understanding HTTP Message Signatures](https://victoronsoftware.com/posts/http-message-signatures/) — 구현 가이드 (MEDIUM confidence)
- [structured-headers npm](https://www.npmjs.com/package/structured-headers) — JavaScript Structured Fields 구현체 (MEDIUM confidence)
- [A Review of ERC-8128 — Four Pillars](https://4pillars.io/en/comments/a-review-of-erc-8128) — ERC-8128 분석 (MEDIUM confidence)
