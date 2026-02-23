# Phase 247: Daemon Integration + DX

## Goal
Jupiter Swap이 데몬 시작 시 자동 등록되어 MCP/SDK/REST를 통해 정책 평가를 거쳐 실행 가능하다

## Plans

### 247-01: Config + Daemon Registration
- DaemonConfigSchema에 `[actions]` 섹션 추가 (jupiter_swap_* 8개 flat key)
- KNOWN_SECTIONS에 'actions' 추가
- daemon package.json에 @waiaas/actions 의존성 추가
- daemon.ts Step 4f에서 registerBuiltInProviders() 호출
- config-loader.test.ts에 [actions] 섹션 테스트 추가

### 247-02: Skill File Update + Verification
- actions.skill.md에 Jupiter Swap 상세 정보 추가 (config, 파라미터, 안전 장치)
- PLCY-01/02 정책 통합이 기존 파이프라인에서 자동 동작함을 확인
- 최종 빌드 + 테스트 검증
- STATE.md, ROADMAP.md 업데이트

## Requirements Coverage
| Req | Plan | Mechanism |
|-----|------|-----------|
| PLCY-01 | 247-02 | 기존 6-stage pipeline Stage 3 CONTRACT_WHITELIST 검증 (코드 변경 불필요) |
| PLCY-02 | 247-02 | 기존 6-stage pipeline Stage 3 IPriceOracle USD 환산 + SPENDING_LIMIT (코드 변경 불필요) |
| DX-01 | 247-01 | mcpExpose=true → 기존 MCP action-provider.ts 자동 노출 (코드 변경 불필요) |
| DX-02 | 247-01 | DaemonConfigSchema [actions] 섹션 + config → JupiterSwapConfig 변환 |
| DX-03 | 247-01 | daemon.ts Step 4f registerBuiltInProviders() 호출 |
| DX-04 | 247-02 | actions.skill.md Jupiter Swap 상세 추가 |
