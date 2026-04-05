# Phase 24 Plan 02: Action Provider + Swap Action 설계 Summary

---
phase: 24
plan: 02
subsystem: action-provider
tags: [action-provider, mcp-tool, plugin, jupiter, swap, defi]

dependency-graph:
  requires: [CHAIN-EXT-03, SDK-MCP, TX-PIPE, LOCK-MECH, CORE-04, CORE-01]
  provides: [CHAIN-EXT-07, CHAIN-EXT-08]
  affects: [Phase-25-INTEG]

tech-stack:
  added: []
  patterns: [resolve-then-execute, validate-then-trust, ActionDefinition-to-MCP-Tool]

key-files:
  created:
    - docs/62-action-provider-architecture.md
    - docs/63-swap-action-spec.md
  modified: []

decisions:
  - id: ACTION-D01
    description: "resolve()는 ContractCallRequest만 반환 (UnsignedTransaction, TransactionRequest 대안 미채택)"
    rationale: "정책 엔진 우회 원천 차단"
  - id: ACTION-D02
    description: "validate-then-trust 보안 경계 (vm.Module 샌드박스 미채택)"
    rationale: "핵심 위협(정책 우회, 자금 탈취) 방어 충분. vm.Module 실험적 API 불안정"
  - id: ACTION-D03
    description: "MCP Tool 16개 상한 (기존 6 + Action 최대 10)"
    rationale: "AI 에이전트 컨텍스트 윈도우에서 Tool 설명 토큰 비율 제한"
  - id: ACTION-D04
    description: "/swap-instructions 사용 (/swap 미사용)"
    rationale: "개별 instruction 수준 데이터 필요. /swap은 직렬화 전체 트랜잭션 반환"
  - id: ACTION-D05
    description: "priceImpactPct 1% 상한"
    rationale: "유동성 부족/MEV 공격 사전 차단. config.toml에서 조정 가능"
  - id: ACTION-D06
    description: "Jito MEV 보호 기본 활성화 (1000 lamports)"
    rationale: "비용 대비 보안 이점 압도적 (~$0.0002로 프론트러닝 방지)"

metrics:
  duration: "~22분"
  completed: "2026-02-08"
---

## One-liner

IActionProvider resolve-then-execute 패턴으로 DeFi 프로토콜 지식을 IChainAdapter에서 분리, ActionDefinition -> MCP Tool 자동 변환 + ~/.waiaas/actions/ ESM 플러그인, Jupiter Swap Quote -> /swap-instructions -> ContractCallRequest 변환 + 슬리피지 3단계 + Jito MEV 보호

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | IActionProvider 아키텍처 + MCP 변환 + 플러그인 로드 설계 | f8867d1 | docs/62-action-provider-architecture.md |
| 2 | Jupiter Swap Action Provider 상세 설계 | f360a03 | docs/63-swap-action-spec.md |

## Deliverables

| 산출물 | ID | 설명 | 줄 수 |
|--------|-----|------|------|
| docs/62-action-provider-architecture.md | CHAIN-EXT-07 | IActionProvider, Registry, MCP 변환, 플러그인 로드, 보안/테스트 | 2339 |
| docs/63-swap-action-spec.md | CHAIN-EXT-08 | JupiterSwapActionProvider, Quote->Instructions->CCR, 슬리피지, MEV | 1417 |
| **합계** | | | **3756** |

## Requirements Coverage

| 요구사항 | 산출물 | 상태 |
|---------|--------|------|
| ACTION-01 | CHAIN-EXT-07 섹션 2-4 | Complete |
| ACTION-02 | CHAIN-EXT-07 섹션 5 | Complete |
| ACTION-03 | CHAIN-EXT-07 섹션 6 | Complete |
| ACTION-04 | CHAIN-EXT-08 섹션 2-3 | Complete |
| ACTION-05 | CHAIN-EXT-07 섹션 9 + CHAIN-EXT-08 섹션 9 | Complete |

## Decisions Made

1. **resolve() 반환 타입 = ContractCallRequest** (ACTION-D01): UnsignedTransaction이나 TransactionRequest 유니온 대신 ContractCallRequest만 반환하도록 강제. 정책 엔진(Stage 3)이 항상 개입하는 것을 보장.

2. **validate-then-trust 보안 경계** (ACTION-D02): Node.js vm.Module 기반 완전 샌드박스 대신, IActionProvider 인터페이스 준수 검증 + resolve() 반환값 Zod 검증으로 핵심 보안 보장. vm.Module 실험적 API 불안정.

3. **MCP Tool 16개 상한** (ACTION-D03): 기존 6개 도구 + Action 최대 10개. mcpExpose 플래그로 MCP 노출 범위 제어.

4. **/swap-instructions 사용** (ACTION-D04): Jupiter /swap은 직렬화된 전체 트랜잭션 반환하므로 ContractCallRequest로 분해 불가. /swap-instructions가 개별 instruction 데이터를 제공.

5. **priceImpact 1% 상한** (ACTION-D05): 유동성 부족/MEV 공격 사전 차단. config.toml의 max_price_impact_pct로 조정 가능.

6. **Jito MEV 보호 기본 활성화** (ACTION-D06): 1000 lamports (~$0.0002) 팁으로 프론트러닝/샌드위치 공격 방지. 비용 대비 보안 이점 압도적.

## Deviations from Plan

None -- plan executed exactly as written.

## Cross-cutting Changes

| 영역 | 변경 | 문서 |
|------|------|------|
| REST API | /v1/actions/ 4개 엔드포인트 추가 | CHAIN-EXT-07 섹션 8 |
| MCP Tool | Action -> Tool 자동 변환 + 16개 상한 | CHAIN-EXT-07 섹션 5 |
| 에러 코드 | 7개 ACTION 에러 + 5개 JUPITER 에러 | CHAIN-EXT-07 섹션 7, CHAIN-EXT-08 섹션 7 |
| 감사 로그 | transactions.metadata.actionSource 필드 | CHAIN-EXT-07 섹션 3.4 |
| 보안 시나리오 | 12 + 10 = 22개 시나리오 | CHAIN-EXT-07 섹션 9, CHAIN-EXT-08 섹션 9 |

## Verification Results

| # | 검증 항목 | 결과 |
|---|----------|------|
| 1 | CHAIN-EXT-07 문서 ID, ACTION-01/02/03/05 커버 | PASS |
| 2 | CHAIN-EXT-08 문서 ID, ACTION-04/05 커버 | PASS |
| 3 | resolve() -> ContractCallRequest 일관성 (양 문서) | PASS |
| 4 | ActionDefinition -> MCP Tool 변환 (38-sdk-mcp 패턴 일치) | PASS |
| 5 | 플러그인 로드 (~/.waiaas/ 구조 일치) | PASS |
| 6 | Jupiter ContractCallRequest (58-contract-call-spec Solana 구조 일치) | PASS |

## Next Phase Readiness

Phase 25에서 다음 항목을 수행해야 한다:
- 기존 문서 8개에 Action Provider 관련 변경 반영 (CHAIN-EXT-07 섹션 10 참조)
- ActionErrorCode 7개 + JupiterErrorCode 5개를 45-enum-unified-mapping.md에 추가
- @waiaas/actions 패키지 구조를 24-monorepo에 추가

## Self-Check: PASSED
