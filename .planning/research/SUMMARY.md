# Project Research Summary

**Project:** WAIaaS v1.4.7 -- 임의 트랜잭션 서명 API (Sign-Only Transaction Signing)
**Domain:** Self-hosted AI agent wallet daemon -- sign-only pipeline + DX enhancements
**Researched:** 2026-02-14
**Confidence:** HIGH

## Executive Summary

v1.4.7의 핵심 발견: **새로운 의존성 추가 없이 기존 스택만으로 모든 기능 구현이 가능하다.** viem 2.45.3, @solana/kit 6.0.1, @modelcontextprotocol/sdk 1.26.0이 이미 unsigned tx 파싱, EVM calldata 인코딩, MCP 리소스 템플릿 기능을 모두 내장하고 있다. 이 마일스톤은 기존 라이브러리의 미사용 API를 활용하여 sign-only 파이프라인을 구축하는 것이 핵심이다.

sign-only 파이프라인의 본질은 **외부 dApp이 만든 unsigned transaction을 정책 평가 후 서명만 반환**하는 것으로, 기존 6-stage 파이프라인(build->simulate->sign->submit->confirm)과 근본적으로 다른 신뢰 경계를 갖는다. WAIaaS가 트랜잭션을 직접 빌드하는 기존 흐름과 달리, 외부에서 구성한 트랜잭션 내용을 파싱하여 검증해야 하므로 **파싱 불완전 시 정책 우회 가능성(C-01)**과 **DELAY/APPROVAL 티어와의 근본적 비호환(C-03)**이 가장 큰 위험이다.

권장 접근: (1) sign-only는 INSTANT/NOTIFY 티어만 허용하고 DELAY/APPROVAL은 즉시 거부, (2) unsigned tx 파싱 실패 시 무조건 deny (파싱 성공한 알려진 패턴만 통과), (3) TTL 기반 reservation 자동 해제로 SPENDING_LIMIT 소진 방지, (4) SIGNED 상태 추가 및 sign-only 전용 파이프라인 분기를 통해 기존 파이프라인과 격리. 이 전략으로 보안 구멍 없이 Jupiter, Agentra 등 외부 dApp과의 통합이 가능하다.

## Key Findings

### Recommended Stack

**신규 의존성: 없음.** 모든 필요 기능이 기존 의존성에 내장되어 있다.

**기존 라이브러리의 미사용 API 활성화:**
- **viem 2.45.3**: `decodeFunctionData` (EVM calldata 디코딩 -- 신규 활용), `parseTransaction` (이미 사용 중), `encodeFunctionData` (이미 사용 중)
- **@solana/kit 6.0.1**: `getCompiledTransactionMessageDecoder` (Solana tx 메시지 디코딩 -- 신규 활용), `decompileTransactionMessageFetchingLookupTables` (ALT 해석 -- 신규 활용), `getTransactionDecoder` (이미 사용 중)
- **@modelcontextprotocol/sdk 1.26.0**: `ResourceTemplate` 클래스 (MCP 리소스 템플릿 -- 신규 활용), `server.resource()` template overload

**신뢰도: HIGH** -- 모든 함수가 타입 선언 파일에서 확인되었으며, 일부는 기존 코드에서 이미 실사용 중이다.

**Anti-Dependencies (명시적으로 추가하지 않음):**
- `@solana/web3.js` (legacy) -- @solana/kit가 모든 기능 제공
- `ethers.js` -- viem이 모든 기능 제공
- `@project-serum/borsh` -- 8바이트 discriminator는 단순 슬라이싱으로 충분
- `@4byte/directory` / 4byte API -- selector 추출만으로 정책 평가 가능

### Expected Features

**Must have (table stakes):**
- **TS-01: Sign-only endpoint** (`POST /v1/transactions/sign`) -- dApp 통합의 핵심, Jupiter/NFT 마켓플레이스 등 모든 외부 프로토콜과의 상호작용에 필수
- **TS-03: Unsigned tx parsing/validation** -- 보안 필수, 서명 전 내용 파싱으로 destination/amount/calldata 검증
- **TS-04: Policy evaluation for sign-only** -- 서명도 정책 적용 필수, sign-only가 정책 우회 경로가 되면 안 됨
- **TS-05: Return signed tx bytes** -- sign-only의 기본 응답, 제출은 호출자 책임
- **TS-02: SIGN_ONLY transaction type** -- 파이프라인 분리, DB 구분, 감사 추적 구분

**Should have (differentiators):**
- **DF-02: EVM calldata encoding helper** (`POST /v1/utils/encode-calldata`) -- AI 에이전트가 ABI 인코딩 직접 처리 불필요
- **DF-03: Default deny policy toggles** -- 운영 유연성, 신뢰 환경에서 기본 거부→기본 허용 전환 가능
- **DF-04: MCP skill resources** -- AI 에이전트가 in-context로 API 문서 학습 가능
- **DF-07: Enhanced policy denial notifications** -- 정책 거부 시 어떤 정책이 왜 거부했는지 + 해결 힌트 제공

**Defer (v2+):**
- **DF-01: Deep parsing with human-readable summaries** -- HIGH complexity, ABI 추론 휴리스틱 필요, 점진적 개선 항목
- **DF-08: Optional broadcast on sign endpoint** -- sign-only/execute 분리를 흐리는 요소, 기본 흐름 검증 후 추가

**Anti-features (명시적으로 구현하지 않음):**
- WalletConnect 세션 관리 -- 별도 마일스톤으로 분리
- 전체 ABI 레지스트리/DB -- 유지보수 부담, 인라인 ABI 제공으로 대체
- Sign-only에서 자동 broadcast -- 2-step 흐름 존중
- 모든 instruction type 파싱 -- top-level만 파싱, 중첩/CPI는 deny

### Architecture Approach

**핵심 설계 결정: Fork, Don't Duplicate.** sign-only 파이프라인은 기존 TransactionPipeline에 `executeSignOnly()` 메서드를 추가하고 Stage 5의 변형(`stage5SignOnly`)을 만드는 방식. 별도 클래스 생성 금지 (코드 중복, 행동 분기 위험).

**Major components:**

1. **Sign-Only Pipeline (daemon)** -- 4단계 동기적 실행: (1) Parse & Validate (unsigned tx → ParsedTransaction), (2) Auth (sessionAuth), (3) Policy (parsed → TransactionParam → 기존 11개 정책 평가), (4) Sign (build→simulate→sign, NO submit). 기존 Stage 4 (DELAY/APPROVAL 대기) 스킵하고 즉시 거부.

2. **Unsigned Transaction Parser (adapters)** -- IChainAdapter에 `parseUnsignedTransaction()` 메서드 추가 (21번째 메서드). EVM: viem `parseTransaction` + `decodeFunctionData`로 calldata 4-byte selector 기반 분류. Solana: `getCompiledTransactionMessageDecoder` + ALT resolve로 instruction 분석. **파싱 실패 = DENY** 원칙.

3. **Default Deny Toggles (settings)** -- 3개 설정 추가 (`security.token_transfer_default_allow`, `security.contract_call_default_allow`, `security.approve_default_allow`). DatabasePolicyEngine에서 정책 없을 때 설정값 확인하여 default-allow/deny 분기. 기존 SettingsService + hot-reload 재사용.

4. **MCP Skill Resources (mcp)** -- `waiaas://skills/{name}` 리소스 템플릿으로 5개 skill 파일 (quickstart, wallet, transactions, policies, admin) 노출. `ResourceTemplate` 클래스 활용. daemon이 `GET /v1/skills/:name` 엔드포인트로 파일 서빙, MCP는 ApiClient 경유.

5. **SIGNED Transaction Status (core)** -- `TRANSACTION_STATUSES` enum에 'SIGNED' 추가. DB migration v9로 CHECK 제약 업데이트. sign-only tx는 SIGNED 상태에서 TTL 후 EXPIRED 전이.

6. **TTL-Based Reservation Release (daemon)** -- sign-only tx의 `reserved_amount`는 별도 만료 시간 설정 (Solana: 90초, EVM: 10분). `processExpired()` 패턴 재사용하여 주기적 해제. 외부 제출 후 온체인 확인은 옵션.

### Critical Pitfalls

1. **C-01: Unsigned TX 파싱 불완전 → 정책 우회 (Parser Bypass)** -- EVM multicall/batch에 감싸진 호출, Solana ALT 미해석 시 실제 프로그램 ID/금액 누락 → CONTRACT_WHITELIST/SPENDING_LIMIT 우회. **방지:** 파싱 실패 = DENY, ALT resolve 필수, multicall은 1단계까지만 파싱, 알려진 프로토콜 화이트리스트.

2. **C-02: SPENDING_LIMIT reserved_amount 영원히 해제되지 않는 문제** -- sign-only 서명 후 dApp이 제출 안 하면 reservation이 해제 안 되어 SPENDING_LIMIT 점점 소진. **방지:** TTL 기반 자동 해제 (Solana 90초, EVM 10분), `sign_only_reservations` 테이블 분리, 주기적 만료 처리.

3. **C-03: DELAY/APPROVAL 티어와 동기적 Sign-Only 흐름의 근본적 비호환** -- DELAY(15분 대기) 또는 APPROVAL(무기한 대기) 시 blockhash 만료 (Solana) 또는 HTTP 요청 타임아웃. **방지:** **방안 A (권장): sign-only는 INSTANT/NOTIFY만 허용, DELAY/APPROVAL이면 즉시 거부** + 명확한 에러 메시지. 방안 B(2-phase sign)와 C(별도 정책)는 복잡도 증가.

4. **H-01: Default Deny 토글의 기존 정책 의미 역전** -- "정책 없음 = 전부 허용" 기본 동작이 토글로 역전되면 기존 wallet 트랜잭션 갑자기 거부. **방지:** 정책 타입별 개별 토글, 전환 시 영향도 미리보기, 기존 wallet은 opt-in.

5. **H-02: Solana VersionedTransaction Legacy vs V0 분기 누락** -- Legacy만 지원 시 ALT 사용 DeFi 트랜잭션 파싱 실패, V0만 지원 시 간단한 SOL 전송 실패. **방지:** 양쪽 format 모두 지원, ALT resolve를 필수 단계로 포함, format 메타데이터 감사 로그 기록.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Core Types + DB Migration (foundation)
**Rationale:** 모든 downstream 컴포넌트가 의존하는 타입/스키마/마이그레이션을 먼저 완료해야 parallel 작업 가능.
**Delivers:** `@waiaas/core`에 SIGNED 상태 + ParsedTransaction 타입 + IChainAdapter.parseUnsignedTransaction() 메서드 추가, DB migration v9 (SIGNED CHECK 제약), EvmAdapter/SolanaAdapter에 parseUnsignedTransaction() 구현.
**Addresses:** H-05 (상태 모델 충돌) 해결, C-01/H-02/H-03 (파싱) 기반 마련.
**Avoids:** 타입 불일치로 인한 재작업, DB 마이그레이션 지연으로 인한 병목.

### Phase 2: Default Deny Toggles (quick DX win, independent)
**Rationale:** Phase 1과 독립적이며 빠르게 완료 가능. 운영 편의성을 즉시 개선.
**Delivers:** SettingsService에 3개 설정 추가 (security.*_default_allow), DatabasePolicyEngine 수정, Admin UI에 자동 노출.
**Uses:** 기존 SettingsService + hot-reload 메커니즘.
**Addresses:** H-01 (정책 의미 역전) 방지, DF-03 (DX 개선).
**Avoids:** Phase 3 블로킹 없이 병렬 진행 가능.

### Phase 3: Sign-Only Pipeline (depends on Phase 1)
**Rationale:** Phase 1의 SIGNED 상태와 parseUnsignedTransaction() 필요. 핵심 기능.
**Delivers:** `stage5SignOnly` + `executeSignOnly` + `POST /v1/transactions/sign` 라우트, MCP sign_transaction 도구, SDK signTransaction() 메서드.
**Implements:** 4단계 동기적 파이프라인 (Parse→Auth→Policy→Sign), DELAY/APPROVAL 즉시 거부, TTL 기반 reservation.
**Addresses:** TS-01/03/04/05 (table stakes), C-03 (DELAY/APPROVAL 비호환) 해결, C-02 (reservation 해제) 해결.
**Avoids:** C-01 (파싱 불완전)은 Phase 1의 파서 구현 품질에 의존.

### Phase 4: Calldata Encoding Utility (independent, parallel with Phase 3)
**Rationale:** Phase 3 sign-only와 독립적. 공유 의존성은 Phase 1뿐.
**Delivers:** `POST /v1/utils/encode-calldata` + `POST /v1/utils/decode-calldata` 라우트, MCP encode_calldata 도구, SDK encodeCalldata() 메서드.
**Uses:** viem `encodeFunctionData` (daemon이 이미 직접 의존).
**Addresses:** DF-02 (calldata 인코딩 도구).
**Avoids:** M-03 (역할 혼동) -- sign-only와 명확히 분리된 유틸리티로 설계.

### Phase 5: MCP Skill Resources + Enhanced Notifications (depends on Phases 2, 3)
**Rationale:** Skill 리소스는 default deny toggles(Phase 2)와 sign-only(Phase 3)를 문서화해야 하므로 나중에.
**Delivers:** `waiaas://skills/{name}` 리소스 템플릿 (5개 skill 파일), `GET /v1/skills/:name` 라우트, enhanced policy denial notifications (DF-07).
**Implements:** ResourceTemplate + daemon skill 서빙, notification 메시지에 policyType/hint 추가.
**Addresses:** DF-04 (MCP skill 리소스), DF-07 (enhanced notifications), M-01/M-05 (skill 리소스 설계).
**Avoids:** Phase 3/4 완료 전 문서화로 인한 수정 부담.

### Phase 6: Integration Testing + Skill Files Update
**Rationale:** 모든 기능 완료 후 E2E 검증 + 문서화.
**Delivers:** E2E 테스트 (Jupiter 통합, Raydium 통합, multicall 시나리오), skills/transactions.skill.md 업데이트 (sign-only + calldata encoding 문서화), Admin UI sign-only tx 표시.
**Addresses:** C-01/H-02/H-03 검증 (파싱 edge case), M-02/M-06 (API 인터페이스 검증).

### Phase Ordering Rationale

- **Phase 1 필수 선행:** 타입/스키마/마이그레이션 없이 downstream 작업 불가능.
- **Phase 2 독립 병렬:** 정책 토글은 Phase 1만 필요, Phase 3와 독립.
- **Phase 3/4 병렬 가능:** sign-only 파이프라인과 calldata 도구는 서로 의존하지 않음.
- **Phase 5는 Phase 2/3 후:** 문서화 대상(toggles + sign-only)이 구현되어야 정확한 문서 작성 가능.
- **Phase 6 마지막:** 모든 기능 통합 후 검증.

이 순서는 **dependency graph 최적화** (병목 최소화) + **위험 조기 발견** (파서 품질 검증을 Phase 1에서) + **점진적 가치 제공** (Phase 2에서 DX 즉시 개선)을 동시 달성.

### Research Flags

**Needs deeper research during planning:**
- **Phase 3 (Sign-Only Pipeline):** DELAY/APPROVAL 거부 메시지 정확한 wording, TTL 값 조정 (Solana 90초/EVM 10분이 최적인지), reservation 충돌 시나리오 추가 검증.
- **Phase 5 (MCP Skill Resources):** MCP SDK ResourceTemplate API의 list callback 동작 검증 (현재 문서만 확인, 실제 테스트 미수행).

**Standard patterns (skip research-phase):**
- **Phase 1:** parseTransaction/encodeFunctionData는 viem 공식 문서 + 기존 코드 실사용 패턴 확립.
- **Phase 2:** SettingsService 패턴은 v1.4.4에서 이미 구현 완료, hot-reload 검증 완료.
- **Phase 4:** calldata encoding은 viem API 래핑만이므로 추가 연구 불필요.
- **Phase 6:** E2E 테스트 패턴은 기존 1,580개 테스트에서 확립.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | 모든 필요 함수가 기존 의존성에서 타입 선언 확인 완료. viem/Solana/MCP SDK의 일부는 이미 코드베이스에서 실사용 중. |
| Features | HIGH | Table stakes 6개는 WaaS 표준 (Fireblocks/Circle 사례 교차 검증), Differentiators는 WAIaaS 특유 강점과 정렬. |
| Architecture | HIGH | 기존 코드베이스 직접 분석으로 파이프라인 구조/정책 엔진/MCP 패턴 확인. Fork-not-duplicate 패턴 검증. |
| Pitfalls | MEDIUM-HIGH | Critical pitfall 3개는 논리적 추론 + 외부 사례 (Fireblocks raw signing, Jupiter unsigned tx flow), 나머지는 코드 분석 기반. ALT resolve 동작은 실제 테스트 미수행. |

**Overall confidence:** HIGH

### Gaps to Address

**Gap 1: Solana Address Lookup Table resolve 동작 검증 미완료**
- 현재: `decompileTransactionMessageFetchingLookupTables` 타입 선언만 확인, 실제 RPC 호출 동작 미검증.
- 처리: Phase 1 파서 구현 시 ALT 포함 tx로 실제 테스트. RPC 실패 시 fallback 동작 명확히 정의.

**Gap 2: SPENDING_LIMIT reservation TTL 최적값 경험적 검증 필요**
- 현재: Solana 90초 (blockhash lifetime 60초 + 여유 30초), EVM 10분은 논리적 추론.
- 처리: Phase 3 구현 시 실제 dApp 통합 패턴 관찰하여 TTL 조정. 설정으로 노출 검토.

**Gap 3: MCP ResourceTemplate의 list callback 실제 동작 미검증**
- 현재: MCP SDK 문서와 타입 선언만 확인, 실제 list 호출 시 동작 미테스트.
- 처리: Phase 5 구현 시 MCP 클라이언트 통합 테스트로 검증. list callback이 예상대로 작동하지 않으면 정적 리소스로 fallback.

**Gap 4: multicall/batch 중첩 패턴의 실제 발생 빈도 불확실**
- 현재: 1단계 중첩까지만 파싱하는 전략이지만, 실제 Jupiter/Raydium이 2단계 이상 중첩을 사용하는지 미확인.
- 처리: Phase 6 E2E 테스트에서 실제 프로토콜 tx 샘플로 검증. 필요 시 파서 확장.

## Sources

### Primary (HIGH confidence)
- WAIaaS 코드베이스 직접 분석: `pipeline.ts`, `stages.ts`, `database-policy-engine.ts`, IChainAdapter (v1.4.6)
- viem 2.45.3 타입 선언 (`_types/index.d.ts`) -- `decodeFunctionData`, `encodeFunctionData`, `parseTransaction` export 확인
- @solana/kit 6.0.1 타입 선언 (`dist/types/index.d.ts`) -- `getCompiledTransactionMessageDecoder`, `decompileTransactionMessageFetchingLookupTables` export 확인
- @modelcontextprotocol/sdk 1.26.0 타입 선언 (`dist/esm/server/mcp.d.ts`) -- `ResourceTemplate` 클래스 확인
- [viem encodeFunctionData 문서](https://viem.sh/docs/contract/encodeFunctionData) -- ABI 인코딩 API
- [viem decodeFunctionData 문서](https://viem.sh/docs/contract/decodeFunctionData) -- calldata 디코딩 API
- [MCP Resources Specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/server/resources) -- ResourceTemplate, list callback

### Secondary (MEDIUM confidence)
- [Jupiter Ultra Swap API](https://dev.jup.ag/docs/ultra) -- unsigned tx flow: order → sign → execute
- [Fireblocks Raw Signing](https://developers.fireblocks.com/docs/raw-signing) -- "policies reject all raw transactions by default"
- [Solana Versioned Transactions Guide](https://solana.com/developers/guides/advanced/versions) -- Legacy vs V0, ALT 구조
- [QuickNode: Transaction Calldata Demystified](https://www.quicknode.com/guides/ethereum-development/transactions/ethereum-transaction-calldata) -- 4-byte selector, ABI encoding
- [SPL Token Program](https://spl.solana.com/token) -- instruction discriminators (Transfer=12, Approve=13)

### Tertiary (LOW confidence, needs validation)
- SPENDING_LIMIT reservation TTL 전략 -- 기존 WaaS 사례 미발견, 논리적 추론 기반
- MCP ResourceTemplate list callback 동작 -- 타입 선언만 확인, 실제 테스트 미수행
- multicall 중첩 깊이 실제 발생 빈도 -- 추론 기반, Jupiter/Raydium 실제 tx 샘플 검증 필요

---
*Research completed: 2026-02-14*
*Ready for roadmap: yes*
