# Requirements: WAIaaS

**Defined:** 2026-02-14
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1.4.7 Requirements

Requirements for v1.4.7: 임의 트랜잭션 서명 API. Each maps to roadmap phases.

### Sign-Only 파이프라인

- [ ] **SIGN-01**: 사용자가 unsigned 트랜잭션을 `POST /v1/transactions/sign`에 제출하면 정책 평가 후 서명된 트랜잭션을 동기 응답으로 받을 수 있다
- [ ] **SIGN-02**: IChainAdapter에 `parseTransaction(rawTx)` 메서드가 추가되어 unsigned tx를 ParsedTransaction(operations 목록)으로 변환한다
- [ ] **SIGN-03**: IChainAdapter에 `signExternalTransaction(rawTx, walletId)` 메서드가 추가되어 unsigned tx에 월렛 키로 서명하여 SignedTransaction을 반환한다
- [ ] **SIGN-04**: SolanaAdapter가 base64 unsigned tx를 파싱하여 SystemProgram.transfer(NATIVE_TRANSFER), SPL Token transfer(TOKEN_TRANSFER), Anchor program(CONTRACT_CALL)을 식별한다
- [ ] **SIGN-05**: EvmAdapter가 hex unsigned tx를 파싱하여 ETH transfer(NATIVE_TRANSFER), ERC-20 transfer/approve(TOKEN_TRANSFER/APPROVE), 임의 contract call(CONTRACT_CALL)을 식별한다
- [ ] **SIGN-06**: 파싱된 operations가 기존 정책 엔진(SPENDING_LIMIT, ALLOWED_TOKENS, CONTRACT_WHITELIST, APPROVED_SPENDERS 등)으로 평가되어 모든 operation이 통과해야 서명이 수행된다
- [ ] **SIGN-07**: DELAY/APPROVAL 티어에 해당하는 sign-only 요청은 즉시 거부된다 (동기 API 비호환)
- [ ] **SIGN-08**: 서명 결과가 transactions 테이블에 type='SIGN', status='SIGNED'로 기록된다
- [ ] **SIGN-09**: TransactionStatus에 SIGNED 상태가 추가되고, TransactionType에 SIGN 타입이 추가된다 (DB CHECK 제약 마이그레이션 포함)
- [ ] **SIGN-10**: 서명 시 reserved_amount에 누적되어 SPENDING_LIMIT 이중 지출을 방지한다
- [ ] **SIGN-11**: TS SDK에 `signTransaction()` 메서드가 추가된다
- [ ] **SIGN-12**: Python SDK에 `sign_transaction()` 메서드가 추가된다
- [ ] **SIGN-13**: MCP에 `sign_transaction` 도구가 추가된다
- [ ] **SIGN-14**: 잘못된 rawTx, 월렛 미포함 서명자, 지원하지 않는 체인 등 에러가 명확한 코드로 반환된다
- [ ] **SIGN-15**: 스킬 파일(transactions.skill.md)이 sign-only API를 포함하도록 업데이트된다

### EVM Calldata 인코딩

- [ ] **ENCODE-01**: `POST /v1/utils/encode-calldata`에 ABI + 함수명 + 인자를 보내면 인코딩된 calldata hex가 반환된다
- [ ] **ENCODE-02**: TS SDK에 `encodeCalldata()` 메서드가 추가된다
- [ ] **ENCODE-03**: Python SDK에 `encode_calldata()` 메서드가 추가된다
- [ ] **ENCODE-04**: MCP에 `encode_calldata` 도구가 추가된다
- [ ] **ENCODE-05**: 존재하지 않는 함수명이나 타입 불일치 시 ABI_ENCODING_FAILED 에러가 반환된다

### 기본 거부 정책 토글

- [ ] **TOGGLE-01**: Admin UI/API에서 `default_deny_tokens` 설정을 OFF로 전환하면 ALLOWED_TOKENS 미설정 시에도 토큰 전송이 허용된다
- [ ] **TOGGLE-02**: Admin UI/API에서 `default_deny_contracts` 설정을 OFF로 전환하면 CONTRACT_WHITELIST 미설정 시에도 컨트랙트 호출이 허용된다
- [ ] **TOGGLE-03**: Admin UI/API에서 `default_deny_spenders` 설정을 OFF로 전환하면 APPROVED_SPENDERS 미설정 시에도 토큰 승인이 허용된다
- [ ] **TOGGLE-04**: 화이트리스트 정책이 설정되어 있으면 토글과 무관하게 정상 화이트리스트 평가가 수행된다
- [ ] **TOGGLE-05**: 3개 토글의 기본값은 모두 ON(기본 거부 유지)이며 hot-reload를 지원한다

### MCP 스킬 리소스

- [ ] **MCPRES-01**: MCP `resources/list`에 `waiaas://skills/{name}` URI로 5개 스킬 파일이 포함된다
- [ ] **MCPRES-02**: MCP `resources/read`로 스킬 파일 내용(마크다운)을 조회할 수 있다
- [ ] **MCPRES-03**: 존재하지 않는 스킬 리소스 요청 시 ResourceNotFound 에러가 반환된다

### 알림 보강

- [ ] **NOTIF-01**: POLICY_VIOLATION 알림에 contractAddress, tokenAddress, policyType 필드가 포함된다
- [ ] **NOTIF-02**: POLICY_VIOLATION 알림에 Admin UI 딥링크(/admin/policies)가 포함된다

## Future Requirements

### v1.4.8

- **ISSUE-020**: MCP 서버 프로세스가 Claude Desktop 종료 후 고아로 잔류 — stdin 종료 감지
- **ISSUE-021**: 멀티체인 전체 네트워크 잔액 일괄 조회 (network=all)
- **ISSUE-022**: 기본 네트워크 변경 MCP 도구 및 CLI 명령어
- **ISSUE-024**: Admin UI 월렛 상세 페이지에 잔액 및 트랜잭션 내역
- **ISSUE-025**: 알림 로그에 실제 발송 메시지 내용 저장
- **ISSUE-026**: Admin UI 세션 페이지에서 전체 세션 조회
- **ISSUE-027**: Admin UI 대시보드 핵심 정보 + StatCard 링크
- **ISSUE-028**: Admin UI 알림 테스트 SYSTEM_LOCKED 에러
- **ISSUE-029**: Admin UI 알림 테스트 채널 선택 UI
- **ISSUE-030**: Slack 알림 채널 추가

## Out of Scope

| Feature | Reason |
|---------|--------|
| 서명 후 트랜잭션 제출 | 2-Step 패턴에서 제출은 dApp 측 책임 |
| DELAY/APPROVAL 티어 비동기 서명 | 동기 API에서 blockhash/nonce 만료 위험, v1.5+ 검토 |
| Solana Address Lookup Table 재귀 파싱 | 1단계 resolve만 수행, 깊은 중첩은 UNKNOWN으로 처리 |
| EVM multicall 재귀 파싱 | 1단계 call만 파싱, 중첩 multicall은 CONTRACT_CALL로 처리 |
| reservation 수동 해제 API | 세션 TTL 만료 시 자동 해제로 충분 |
| EIP-4844 blob transaction | Type 3 blob tx는 현재 사용 사례 제한적 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (To be filled by roadmapper) | | |

**Coverage:**
- v1.4.7 requirements: 30 total
- Mapped to phases: 0
- Unmapped: 30

---
*Requirements defined: 2026-02-14*
*Last updated: 2026-02-14 after initial definition*
