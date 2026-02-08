---
phase: 22-token-extension
plan: 02
subsystem: api
tags: [getAssets, AssetInfo, estimateFee, FeeEstimate, SPL, ERC-20, multicall, REST API]

# Dependency graph
requires:
  - phase: 06-core-architecture-design
    provides: IChainAdapter 13 메서드, TransferRequest, BalanceInfo 타입
  - phase: 07-session-transaction-protocol-design
    provides: SolanaAdapter 상세 설계, estimateFee 기본 구현
  - phase: 09-integration-client-interface
    provides: REST API 전체 스펙 (37-rest-api-complete-spec.md)
provides:
  - "getAssets() IChainAdapter 14번째 메서드 + AssetInfo 스키마"
  - "Solana getAssets(): getTokenAccountsByOwner (Token Program + Token-2022) 구현 설계"
  - "EVM getAssets(): ALLOWED_TOKENS 기반 보수적 조회 + multicall 최적화"
  - "FeeEstimate 구조체: baseFee, priorityFee, ataCreationCost, feeCurrency"
  - "GET /v1/wallet/assets REST API 엔드포인트"
  - "토큰 전송 테스트 시나리오 (4레벨 + 8보안 + 3Mock)"
affects: [phase-23-transaction-type-extension, phase-24-higher-abstraction, phase-25-test-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ITokenDiscovery 인터페이스: 토큰 발견 전략 추상화 (AllowedTokensDiscovery 기본 구현)"
    - "known_tokens 로컬 레지스트리: config.toml 기반 토큰 메타데이터 사전 등록"
    - "3단계 메타데이터 fallback: known_tokens -> Metaplex -> UNKNOWN 기본값"
    - "FeeEstimate 구조체: bigint 반환에서 세부 항목 분리 (baseFee, priorityFee, ataCreationCost)"

key-files:
  created:
    - "docs/57-asset-query-fee-estimation-spec.md"
  modified: []

key-decisions:
  - "getAssets() 반환 순서: 네이티브 토큰 첫 번째, 이후 잔액 내림차순"
  - "EVM 토큰 조회: ALLOWED_TOKENS 기반 보수적 조회 (외부 인덱서 의존 없음)"
  - "Token-2022 토큰도 type='spl'로 통합 (프로그램 구분은 어댑터 내부)"
  - "ATA 생성 비용: getMinimumBalanceForRentExemption(165) 동적 조회 (하드코딩 금지)"
  - "estimateFee() 반환 타입: bigint -> FeeEstimate 구조체 (하위 호환 필요)"
  - "REST API 명칭: GET /v1/wallet/tokens -> GET /v1/wallet/assets 확정"
  - "ITokenDiscovery 확장 포인트: 향후 AlchemyDiscovery, MoralisDiscovery 플러그인 가능"

patterns-established:
  - "AssetInfo flat 구조: v0.2 BalanceInfo 패턴에 맞춘 토큰 정보 통합 타입"
  - "토큰 메타데이터 3단계 fallback: 로컬 레지스트리 -> on-chain 조회 -> 기본값"
  - "config.toml [tokens] 섹션: 체인별 known_tokens 레지스트리"

# Metrics
duration: 9min
completed: 2026-02-07
---

# Phase 22 Plan 02: 자산 조회 + 수수료 추정 스펙 Summary

**getAssets() 14번째 메서드 복원 + Solana Token Program/Token-2022 조회 + EVM ALLOWED_TOKENS 기반 multicall 조회 + FeeEstimate ATA 동적 비용 + 테스트 시나리오 44개**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-07T14:22:39Z
- **Completed:** 2026-02-07T14:31:18Z
- **Tasks:** 2/2
- **Files created:** 1

## Accomplishments
- IChainAdapter에 getAssets() 14번째 메서드 복원, AssetInfo 스키마로 네이티브/SPL/ERC-20 통합 표현
- Solana 구현: getTokenAccountsByOwner (Token Program + Token-2022) + 3단계 메타데이터 fallback
- EVM 구현: ALLOWED_TOKENS 기반 보수적 조회 + viem multicall 최적화, ITokenDiscovery 확장 포인트
- FeeEstimate 구조체로 estimateFee() 확장: ATA 동적 비용, ERC-20 gas 추정, feeCurrency 분리
- REST API GET /v1/wallet/assets 엔드포인트 (Zod 스키마 + Hono 라우터 스케치)
- 토큰 전송 테스트: 4레벨(Unit/Integration/Validator/Anvil) + 8보안 시나리오 + 3 Mock 경계

## Task Commits

Each task was committed atomically:

1. **Task 1: getAssets() 인터페이스 + 체인별 구현 + REST API 설계** - `fb7136a` (feat)
2. **Task 2: 수수료 추정 확장 + 테스트 시나리오 정의** - `dd23892` (feat)

## Files Created/Modified
- `docs/57-asset-query-fee-estimation-spec.md` - CHAIN-EXT-02 산출물: getAssets 인터페이스, Solana/EVM 구현, REST API, 수수료 추정 확장, 테스트 시나리오 (1476줄, 9섹션)

## Decisions Made
- getAssets() 반환에서 네이티브 토큰을 항상 첫 번째 항목으로 고정 (API 소비자 편의)
- EVM 토큰 조회는 ALLOWED_TOKENS 정책 + known_tokens 레지스트리 기반. 외부 인덱서(Alchemy, Moralis) 의존 없음 (Self-Hosted 원칙)
- Token-2022 토큰도 AssetInfo.type='spl'로 통합. Token Program vs Token-2022 구분은 어댑터 내부에서만 처리
- ATA 생성 비용은 getMinimumBalanceForRentExemption(165) RPC로 동적 조회. ~2,039,280 lamports 하드코딩 금지
- estimateFee() 반환 타입을 bigint에서 FeeEstimate 구조체로 변경. 기존 코드는 fee.total로 마이그레이션 필요
- REST API 경로명: 기존 예약 GET /v1/wallet/tokens를 GET /v1/wallet/assets로 확정 (네이티브+토큰 포괄)
- ITokenDiscovery 인터페이스를 설계하여 향후 외부 인덱서 플러그인 확장 가능

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CHAIN-EXT-02 산출물 완성. Phase 22 Plan 01 (CHAIN-EXT-01)과 함께 Phase 22 성공 기준 충족 가능
- Phase 25에서 반영할 기존 문서 변경 목록 7개가 섹션 9에 정리됨
- 테스트 시나리오 44개(UT 14 + IT 10 + VT 8 + ET 8 + SEC 8 - 중복 4)가 Phase 25 통합 테스트의 기초
- 기존 문서 수정 대상: 27, 31, 36, 37, 41(v0.4), 42(v0.4), 48(v0.4)

## Self-Check: PASSED

---
*Phase: 22-token-extension*
*Completed: 2026-02-07*
