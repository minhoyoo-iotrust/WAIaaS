---
phase: 22-token-extension
plan: 01
subsystem: blockchain
tags: [spl-token, erc20, token-transfer, allowed-tokens, policy-engine, solana, evm, viem, token-2022]

# Dependency graph
requires:
  - phase: 06-core-architecture-design
    provides: IChainAdapter 인터페이스, TransferRequest 타입, AdapterRegistry
  - phase: 07-session-transaction-protocol-design
    provides: SolanaAdapter SPL 예비 설계, 6단계 파이프라인, IPolicyEngine
  - phase: 08-security-layers-design
    provides: DatabasePolicyEngine, PolicyType 4개, 4-tier SPENDING_LIMIT
  - phase: 09-integration-client-interface-design
    provides: REST API TransferRequestSchema (type/tokenMint), 에러 코드 체계
provides:
  - "CHAIN-EXT-01: 토큰 전송 확장 스펙 (docs/56-token-transfer-extension-spec.md)"
  - "TransferRequest.token 필드 확장 (하위 호환)"
  - "buildSplTokenTransfer 정식 스펙 (Token Program + Token-2022 분기)"
  - "buildErc20Transfer 설계 스펙 (simulateContract + encodeFunctionData)"
  - "ALLOWED_TOKENS PolicyType + AllowedTokensRuleSchema"
  - "TOKEN_TRANSFER 기본 NOTIFY 티어 과도기 전략"
  - "TOKEN 도메인 에러 코드 8개 (TOKEN-001~008)"
  - "기존 문서 8개 변경 요약 (Phase 25용)"
affects:
  - 22-02 (getAssets, estimateFee 확장)
  - 23-transaction-type-extension (ContractCallRequest, 파이프라인 확장)
  - 24-upper-abstraction (IPriceOracle USD 정책, TOKEN_TRANSFER NOTIFY→동적 분류)
  - 25-test-documentation (기존 문서 8개 v0.6 반영, 테스트 전략)

# Tech tracking
tech-stack:
  added: ["@solana-program/token-2022 (설계 참조)"]
  patterns:
    - "token 필드 기반 분기: request.token 존재 여부로 네이티브/토큰 분기"
    - "기본 거부 정책: ALLOWED_TOKENS 미설정 시 토큰 전송 거부"
    - "과도기 안전 마진: USD 변환 불가 시 NOTIFY 티어 기본 적용"

key-files:
  created:
    - "docs/56-token-transfer-extension-spec.md"
  modified: []

key-decisions:
  - "TransferRequest에 type 대신 token? 필드로 분기 (타입 안전성 향상)"
  - "getTransferCheckedInstruction 사용 (decimals 온체인 검증, getTransferInstruction보다 안전)"
  - "Token-2022 기본 transfer 지원, 위험 확장(TransferFee, ConfidentialTransfer 등) 감지 시 거부"
  - "ALLOWED_TOKENS 미설정 시 토큰 전송 기본 거부 (네이티브만 허용)"
  - "TOKEN_TRANSFER 기본 NOTIFY 티어 (Phase 24 USD 통합 전 과도기)"
  - "SPENDING_LIMIT은 토큰 전송에 미적용 (금액 단위 비교 불가)"
  - "PolicyType 5개로 확장 (ALLOWED_TOKENS 추가)"

patterns-established:
  - "token 필드 분기 패턴: request.token !== undefined → 토큰 빌드, else → 네이티브 빌드"
  - "체인별 빌드 추상화: Solana(ATA+transferChecked) vs EVM(simulateContract+encodeFunctionData)"
  - "TLV 파싱 패턴: Token-2022 확장 데이터 감지/거부"
  - "서비스 레이어 변환: REST API type/tokenMint → TransferRequest.token 객체"

# Metrics
duration: 10min
completed: 2026-02-07
---

# Phase 22 Plan 01: 토큰 전송 확장 스펙 Summary

**TransferRequest.token 확장 + SPL/ERC-20 빌드 로직 + ALLOWED_TOKENS 정책 + TOKEN_TRANSFER NOTIFY 과도기 전략을 1824줄 설계 문서로 완성**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-07T14:19:49Z
- **Completed:** 2026-02-07T14:29:57Z
- **Tasks:** 2/2
- **Files created:** 1

## Accomplishments

- TransferRequest.token 필드로 네이티브/토큰 전송을 통합 (token=undefined → 하위 호환)
- Solana SPL buildSplTokenTransfer 정식 스펙: transferChecked + Token-2022 TLV 확장 감지/거부
- EVM ERC-20 buildErc20Transfer 설계 스펙: simulateContract + encodeFunctionData + prepareTransactionRequest
- ALLOWED_TOKENS PolicyType 추가 (5번째): AllowedTokensRuleSchema + DatabasePolicyEngine evaluateAllowedTokens
- TOKEN_TRANSFER 기본 NOTIFY 티어 과도기 전략 + Phase 24 USD 통합 로드맵
- TOKEN 도메인 에러 코드 8개 (TOKEN-001~008) + DX hint 매핑
- 기존 문서 8개에 대한 32건 변경 요약 (Phase 25 실행자용)

## Task Commits

Each task was committed atomically:

1. **Task 1: TransferRequest 타입 확장 + 체인별 빌드 로직 명세** - `77783e7` (feat)
   - 전체 9섹션 문서 생성 (Tasks 1+2 내용이 단일 파일로 통합 작성됨)

**Note:** Task 2 (ALLOWED_TOKENS 정책 + 보안 티어) 내용은 같은 파일의 섹션 6-9로 Task 1 커밋에 포함됨. 두 Task가 동일 파일을 생성/확장하므로 단일 atomic 커밋으로 완성.

## Files Created/Modified

- `docs/56-token-transfer-extension-spec.md` (CHAIN-EXT-01) -- 1824줄, 9섹션 토큰 전송 확장 설계 스펙

## Decisions Made

1. **token 필드 vs type 필드 분기:** REST API의 type/tokenMint 대신 IChainAdapter 수준에서는 `token?: TokenInfo` 객체로 분기. 이유: 타입 안전성 향상 + decimals/symbol을 함께 전달
2. **transferChecked 사용:** getTransferInstruction 대신 getTransferCheckedInstruction 채택. 이유: decimals를 온체인에서 검증하여 UI 금액 오류 방지
3. **Token-2022 기본 transfer 지원 + 위험 확장 거부:** TransferFee, ConfidentialTransfer, TransferHook, PermanentDelegate, NonTransferable 감지 시 UNSUPPORTED_TOKEN_EXTENSION 에러. 이유: 정책 엔진의 금액 검증을 무효화하거나 예측 불가 부작용
4. **ALLOWED_TOKENS 기본 거부:** 정책 미설정 시 토큰 전송 거부 (네이티브만 허용). 이유: 보안 우선 원칙
5. **TOKEN_TRANSFER 기본 NOTIFY 티어:** INSTANT 아닌 NOTIFY로 설정. 이유: USD 변환 없이 금액 검증 불가한 과도기 안전 마진
6. **SPENDING_LIMIT 토큰 미적용:** 토큰/네이티브 금액 단위가 달라 비교 불가. Phase 24 IPriceOracle 이후 USD 기준 적용
7. **PolicyType 5개 확장:** ALLOWED_TOKENS 추가. WHITELIST(주소)와 직교하는 토큰 화이트리스트

## Deviations from Plan

None -- plan executed exactly as written. 두 Task가 동일 파일을 대상으로 하여 단일 커밋으로 통합 작성되었으나, 모든 요구 내용이 포함됨.

## Issues Encountered

None

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- **22-02-PLAN.md 준비:** getAssets() 인터페이스 복원, estimateFee 확장, 토큰 테스트 시나리오 설계 준비 완료
- **Phase 23 토대:** TransferRequest.token 필드와 파이프라인 token 분기가 ContractCallRequest 설계의 기반
- **Phase 24 통합점:** 섹션 7의 과도기→USD 통합 로드맵이 IPriceOracle 설계 시 참조 가능
- **Phase 25 변경 목록:** 섹션 9의 32건 변경 요약이 기존 문서 업데이트 바로 실행 가능

## Self-Check: PASSED

---
*Phase: 22-token-extension*
*Completed: 2026-02-07*
