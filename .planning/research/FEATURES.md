# Feature Landscape: Jupiter Swap Action Provider (m28-01)

**Domain:** Solana DEX token swap via Jupiter Aggregator
**Researched:** 2026-02-23
**Confidence:** HIGH (Jupiter API v1 공식 문서 + 설계 문서 63 + 코드베이스 분석)

## Table Stakes (필수 — 없으면 사용 불가)

| Feature | Description | Complexity | Dependencies |
|---------|-------------|-----------|--------------|
| Quote API 호출 | GET /swap/v1/quote — 최적 경로 계산, outAmount, priceImpactPct 반환 | Low | native fetch |
| /swap-instructions 호출 | POST /swap/v1/swap-instructions — 개별 instruction 분해 | Medium | Quote 응답 필요 |
| ContractCallRequest 변환 | swapInstruction → programId/instructionData/accounts 매핑 | Medium | Solana instruction format |
| 슬리피지 보호 | 기본 50bps, 상한 500bps, inputSchema 검증 | Low | config.toml |
| priceImpact 검증 | 1% 초과 시 PRICE_IMPACT_TOO_HIGH 거부 | Low | Quote 응답 |
| Zod 응답 스키마 | Jupiter API 응답 런타임 검증 — API drift 조기 감지 | Medium | Zod |
| MCP 도구 노출 | mcpExpose=true → AI 에이전트 MCP 접근 | Low | ActionProviderRegistry |
| SDK 지원 | executeAction('jupiter_swap', params) TS/Python | Low | 기존 SDK 인프라 |
| config.toml 설정 | [actions.jupiter_swap] 섹션 — 모든 파라미터 오버라이드 | Low | config loader |

## Differentiators (차별화 — 있으면 우수)

| Feature | Description | Complexity | Dependencies |
|---------|-------------|-----------|--------------|
| Jito MEV 보호 | tip lamports로 블록 엔진 직접 전송, 프론트러닝/샌드위치 방지 | Low | Jupiter API 내장 |
| programId 검증 | Jupiter 프로그램 주소(JUP6L...) 일치 확인 — MITM 방어 | Low | 상수 비교 |
| restrictIntermediateTokens | 안전한 중간 토큰만 라우팅 — 조작된 토큰 경유 방지 | Low | Quote API 파라미터 |
| inputMint === outputMint 방지 | 동일 토큰 스왑 요청 사전 차단 | Low | 입력 검증 |
| CONTRACT_WHITELIST 연동 | Jupiter 프로그램 주소 화이트리스트 필수 — 기본 거부 정책 일관성 | Low | 기존 정책 엔진 |
| SPENDING_LIMIT USD 환산 | 스왑 입력 금액 USD 기준 정책 평가 | Low | 기존 오라클 |

## Anti-Features (하지 말 것)

| Feature | Reason |
|---------|--------|
| Jupiter SDK 사용 | 불필요한 의존성 증가. native fetch로 2개 엔드포인트 충분 |
| /swap 엔드포인트 사용 | 직렬화된 전체 트랜잭션 반환 — ContractCallRequest 변환 불가 |
| dynamicSlippage | Jupiter 서버 측 슬리피지 조절 — 정책 엔진 우회 가능성 |
| Token symbol 입력 | 동명 토큰 충돌 위험. Mint address(Base58)만 허용 |
| DCA (Dollar Cost Averaging) | 별도 마일스톤에서 다루는 기능 |
| Limit Order | 별도 마일스톤에서 다루는 기능 |
| Route visualization | Admin UI 확장 범위. m28-01 스코프 외 |
| Multi-hop 커스터마이징 | Jupiter가 자동 최적화. 수동 개입 불필요 |

## Feature Categories

### 1. Core Swap (Table Stakes)
- Quote API 호출 + 응답 Zod 검증
- /swap-instructions 호출 + 응답 Zod 검증
- swapInstruction → ContractCallRequest 변환
- 6-stage 파이프라인 실행 (기존 인프라)

### 2. Safety & Protection
- 3-layer 슬리피지 보호 (inputSchema → priceImpact → onchain)
- Jito MEV 보호 (tip → block engine)
- programId 검증 (MITM 방어)
- restrictIntermediateTokens (독성 토큰 경유 방지)

### 3. Policy Integration
- CONTRACT_WHITELIST 연동
- SPENDING_LIMIT USD 환산
- APPROVAL defaultTier (Owner 승인 기본)

### 4. Developer Experience
- MCP 도구 자동 노출
- SDK executeAction() 지원
- config.toml 오버라이드
- 상세 에러 메시지 (한국어 + 영어)
