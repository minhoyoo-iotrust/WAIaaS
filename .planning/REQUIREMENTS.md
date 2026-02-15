# Requirements: WAIaaS v1.5.1

**Defined:** 2026-02-15
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다

## v1 Requirements

Requirements for x402 클라이언트 지원. Each maps to roadmap phases.

### Core Infrastructure (X4CORE)

- [ ] **X4CORE-01**: @x402/core 의존성 추가 + PaymentRequirements/PaymentPayload Zod 스키마 import로 x402 v2 타입 시스템 구축
- [ ] **X4CORE-02**: TransactionType에 X402_PAYMENT 6번째 타입 추가 (기존 discriminatedUnion과 별도, DB 기록용)
- [ ] **X4CORE-03**: PolicyType에 X402_ALLOWED_DOMAINS 12번째 타입 추가
- [ ] **X4CORE-04**: CAIP-2 → WAIaaS NetworkType 매핑 테이블 정의 (eip155:1 → ethereum-mainnet 등 8개)
- [ ] **X4CORE-05**: X402FetchRequest/Response Zod 스키마 정의 (url, method, headers, body → status, headers, body, payment)
- [ ] **X4CORE-06**: DB 마이그레이션 v12 — transactions CHECK 제약에 X402_PAYMENT 추가, policies type에 X402_ALLOWED_DOMAINS 추가
- [ ] **X4CORE-07**: x402 전용 에러 코드 8개 정의 (X402_DISABLED, X402_DOMAIN_NOT_ALLOWED, X402_SSRF_BLOCKED, X402_UNSUPPORTED_SCHEME, X402_PAYMENT_REJECTED, X402_DELAY_TIMEOUT, X402_APPROVAL_REQUIRED, X402_SERVER_ERROR)

### Security (X4SEC)

- [ ] **X4SEC-01**: SSRF 가드 — DNS 사전 해석 + 사설 IP(10.x, 172.16-31.x, 192.168.x, 127.x)/localhost/링크 로컬(169.254.x)/loopback(::1) 차단
- [ ] **X4SEC-02**: SSRF 가드 — IPv4-mapped IPv6(::ffff:127.0.0.1), 옥탈(0177.0.0.1), 16진수(0x7f000001) 등 우회 벡터 차단
- [ ] **X4SEC-03**: SSRF 가드 — 리다이렉트 매 hop에서 대상 IP 재검증 (최대 3회 리다이렉트)
- [ ] **X4SEC-04**: SSRF 가드 — HTTPS 강제, HTTP URL 거부
- [ ] **X4SEC-05**: 도메인 검증 — URL 정규화 (hostname lowercase, trailing dot 제거, userinfo@ 포함 URL 거부, 포트 검증)

### x402 Handler (X4HAND)

- [ ] **X4HAND-01**: HTTP 402 응답 파싱 — PAYMENT-REQUIRED 헤더에서 PaymentRequirements 추출 + Zod 검증
- [ ] **X4HAND-02**: (scheme, network) 쌍 자동 선택 — accepts 배열에서 WAIaaS가 지원하는 조합 선택
- [ ] **X4HAND-03**: 비-402 응답 패스스루 — 200/4xx/5xx 등 비-402 응답을 그대로 프록시
- [ ] **X4HAND-04**: 결제 서명 재요청 — PAYMENT-SIGNATURE 헤더 + 원본 요청 바디로 재전송
- [ ] **X4HAND-05**: 재시도 제한 — 결제 후 다시 402 수신 시 X402_PAYMENT_REJECTED 에러 (1회만 재시도)
- [ ] **X4HAND-06**: 결제 실패 에러 처리 — 5xx 서버 에러, 지원 안 되는 scheme, 타임아웃 각각 구분된 에러

### Payment Signing (X4SIGN)

- [ ] **X4SIGN-01**: EVM EIP-3009 transferWithAuthorization 서명 — viem signTypedData로 EIP-712 typed data 서명 생성
- [ ] **X4SIGN-02**: Solana SPL TransferChecked 부분 서명 — @solana/kit signBytes + noopSigner feePayer 패턴
- [ ] **X4SIGN-03**: 키 관리 패턴 — 키스토어 복호화 → 서명 → sodium_memzero 해제 (finally 블록)
- [ ] **X4SIGN-04**: EIP-3009 validBefore 5분 설정 + nonce crypto.randomBytes(32) 랜덤 생성

### Policy Integration (X4POL)

- [x] **X4POL-01**: X402_ALLOWED_DOMAINS 정책 평가 — 기본 거부, 도메인 화이트리스트 매칭
- [x] **X4POL-02**: 와일드카드 도메인 매칭 — *.example.com → sub.example.com 허용, dot-boundary 엄격 검증
- [x] **X4POL-03**: 기존 SPENDING_LIMIT 4-tier 평가 통합 — evaluateAndReserve() 재사용
- [x] **X4POL-04**: USDC $1 직접 환산 + 기타 토큰 IPriceOracle USD 환산
- [x] **X4POL-05**: DELAY 티어 — request_timeout(기본 30초) 내 대기, 초과 시 X402_DELAY_TIMEOUT 거부
- [x] **X4POL-06**: APPROVAL 티어 — 즉시 X402_APPROVAL_REQUIRED 거부 (동기 HTTP에서 Owner 승인 대기 불가)
- [x] **X4POL-07**: reserved_amount 누적에 x402 결제 포함 — 세션 지출 한도 TOCTOU 방지
- [x] **X4POL-08**: Kill Switch 활성 시 x402 결제 포함 모든 거래 차단

### API + Config (X4API)

- [x] **X4API-01**: POST /v1/x402/fetch 엔드포인트 — sessionAuth 보호, OpenAPIHono createRoute
- [x] **X4API-02**: x402 결제 내역 transactions 테이블 기록 — type=X402_PAYMENT, metadata에 target_url/payment_amount/network 저장
- [x] **X4API-03**: config.toml [x402] 섹션 — enabled(기본 true), request_timeout(기본 30초)
- [x] **X4API-04**: 기존 알림 트리거 연동 — x402 결제 시 TX_REQUESTED/TX_CONFIRMED/TX_FAILED 이벤트

### DX Integration (X4DX)

- [ ] **X4DX-01**: TS SDK WAIaaSClient.x402Fetch(url, options?) 메서드 — POST /v1/x402/fetch 호출 래퍼
- [ ] **X4DX-02**: Python SDK WAIaaSClient.x402_fetch(url, options?) 메서드 — 동일 인터페이스
- [ ] **X4DX-03**: MCP x402_fetch 도구 — AI 에이전트가 유료 API 자율 호출
- [ ] **X4DX-04**: x402.skill.md 스킬 파일 신규 생성 + MCP 스킬 리소스 등록
- [ ] **X4DX-05**: transactions.skill.md x402 결제 내역 조회 반영

## v2 Requirements

### 확장 기능

- **X4EXT-01**: x402 v1 프로토콜 fallback 파싱 (X-PAYMENT 헤더 호환)
- **X4EXT-02**: Permit2 결제 스킴 지원 (EIP-2612 사전 approve 필요)
- **X4EXT-03**: 멀티 월렛 결제 라우팅 — EVM/SVM 동시 지원 시 잔고 기반 자동 선택
- **X4EXT-04**: Admin UI x402 결제 대시보드 — 도메인별 결제 통계, 결제 내역 조회
- **X4EXT-05**: x402 결제 알림 전용 이벤트 — X402_PAYMENT_HIGH_AMOUNT 고액 결제 경고

## Out of Scope

| Feature | Reason |
|---------|--------|
| Facilitator 서버 운영 | WAIaaS는 클라이언트(결제자) 역할만. 결제 수취/정산은 외부 facilitator |
| x402 서버(Resource Server) | WAIaaS는 지갑이지 결제 받는 서비스가 아님 |
| 크로스체인 결제 라우팅 | 단일 요청에서 체인 간 자금 이동 필요. 별도 마일스톤 |
| 환불/분쟁 해결 | x402 스펙 범위 외. facilitator와 리소스 서버 간 문제 |
| 자동 ATA 생성 (Solana) | facilitator가 처리. 클라이언트 책임 아님 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| X4CORE-01 | Phase 130 | ✓ Done |
| X4CORE-02 | Phase 130 | ✓ Done |
| X4CORE-03 | Phase 130 | ✓ Done |
| X4CORE-04 | Phase 130 | ✓ Done |
| X4CORE-05 | Phase 130 | ✓ Done |
| X4CORE-06 | Phase 130 | ✓ Done |
| X4CORE-07 | Phase 130 | ✓ Done |
| X4SEC-01 | Phase 131 | ✓ Done |
| X4SEC-02 | Phase 131 | ✓ Done |
| X4SEC-03 | Phase 131 | ✓ Done |
| X4SEC-04 | Phase 131 | ✓ Done |
| X4SEC-05 | Phase 131 | ✓ Done |
| X4HAND-01 | Phase 131 | ✓ Done |
| X4HAND-02 | Phase 131 | ✓ Done |
| X4HAND-03 | Phase 131 | ✓ Done |
| X4HAND-04 | Phase 131 | ✓ Done |
| X4HAND-05 | Phase 131 | ✓ Done |
| X4HAND-06 | Phase 131 | ✓ Done |
| X4SIGN-01 | Phase 131 | ✓ Done |
| X4SIGN-02 | Phase 131 | ✓ Done |
| X4SIGN-03 | Phase 131 | ✓ Done |
| X4SIGN-04 | Phase 131 | ✓ Done |
| X4POL-01 | Phase 132 | ✓ Done |
| X4POL-02 | Phase 132 | ✓ Done |
| X4POL-03 | Phase 132 | ✓ Done |
| X4POL-04 | Phase 132 | ✓ Done |
| X4POL-05 | Phase 132 | ✓ Done |
| X4POL-06 | Phase 132 | ✓ Done |
| X4POL-07 | Phase 132 | ✓ Done |
| X4POL-08 | Phase 132 | ✓ Done |
| X4API-01 | Phase 132 | ✓ Done |
| X4API-02 | Phase 132 | ✓ Done |
| X4API-03 | Phase 132 | ✓ Done |
| X4API-04 | Phase 132 | ✓ Done |
| X4DX-01 | Phase 133 | Pending |
| X4DX-02 | Phase 133 | Pending |
| X4DX-03 | Phase 133 | Pending |
| X4DX-04 | Phase 133 | Pending |
| X4DX-05 | Phase 133 | Pending |

**Coverage:**
- v1 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0

---
*Requirements defined: 2026-02-15*
*Last updated: 2026-02-15 after roadmap creation*
