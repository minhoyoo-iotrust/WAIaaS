# 마일스톤 m34-06: Hyperliquid 고급 기능

- **Status:** PLANNED
- **Milestone:** v34.6

## 목표

m31-04에서 구축한 Hyperliquid 기본 통합 위에 Vault, TWAP 주문, HYPE Staking 등 Hyperliquid 고유의 고급 기능을 추가한다.

> **리서치 필수**: 각 기능은 Hyperliquid 고유 메커니즘에 의존하므로, 구현 착수 전에 반드시 Vault 운용 구조(수익 분배, 락업, 리스크), TWAP 실행 엔진의 상세 사양, HYPE 스테이킹의 unbonding 기간 및 validator 선택 전략 등을 리서치해야 한다. m31-04 구현 경험을 바탕으로 API 패턴이 확립된 상태에서 진행하되, 각 기능의 고유 제약 사항을 별도로 조사한다.

---

## 배경

### 선행 마일스톤

- **m31-04** (Hyperliquid 생태계 통합): HyperEVM 체인, Perp/Spot 거래, Sub-accounts 구현 완료 전제

### 고급 기능 개요

- **Vault**: 전략 Vault 입출금, 온체인 카피 트레이딩 인프라
- **TWAP**: 대량 주문 시간 분할 실행
- **HYPE Staking**: Validator delegation 기반 네이티브 스테이킹

---

## 범위

### Phase 1: Vault 입출금

Hyperliquid Vault 시스템과 통합한다.

**리서치 필요 항목:**
- Vault 생성 조건 및 운용자 권한 구조
- 입출금 시 락업 기간 및 출금 제한
- 수익 분배 메커니즘 (수수료 구조, 정산 주기)
- Vault 리스크 지표 (drawdown, 운용 기록)
- 정책 엔진에서 Vault 입금을 어떤 카테고리로 분류할지

**기능:**
- Vault 목록 조회 (리더보드, 수익률, AUM)
- Vault 입금 (deposit)
- Vault 출금 (withdrawal)
- 내 Vault 포지션 조회 (입금액, 수익, 지분율)
- MCP 도구 + SDK 메서드

### Phase 2: TWAP 주문

Time-Weighted Average Price 주문을 지원한다.

**리서치 필요 항목:**
- TWAP 실행 엔진 사양 (최소/최대 기간, 간격 옵션)
- 부분 체결 시 상태 관리 및 이벤트 구조
- TWAP 주문과 일반 주문의 API 차이
- 진행 중인 TWAP 주문의 수정 가능 여부

**기능:**
- TWAP 주문 생성 (총 수량, 실행 기간, 간격)
- TWAP 주문 상태 조회 (진행률, 체결량)
- TWAP 주문 취소
- MCP 도구 + SDK 메서드

### Phase 3: HYPE Staking

HYPE 토큰 네이티브 스테이킹을 지원한다.

**리서치 필요 항목:**
- Validator 선택 기준 및 슬래싱 조건
- Unbonding 기간 (대기 일수, 중간 취소 가능 여부)
- 보상 수령 방식 (자동 복리 vs 수동 클레임)
- 최소 스테이킹 금액 및 validator별 용량 제한
- HyperEVM L1 vs EVM 레이어에서의 스테이킹 차이

**기능:**
- Validator 목록 조회 (APR, 위임량, 상태)
- HYPE 스테이킹 (delegate)
- HYPE 언스테이킹 (undelegate)
- 스테이킹 보상 조회
- 기존 스테이킹 프레임워크(Lido/Jito/Marinade) 인터페이스 패턴 활용
- MCP 도구 + SDK 메서드

---

## 기술적 고려사항

1. **Vault 리스크**: Vault 입금은 전략 운용자에게 자금을 위임하는 것이므로 정책 엔진에서 별도 승인 플로우 고려.
2. **TWAP 상태 관리**: 장기 실행 주문이므로 WebSocket 기반 상태 추적 또는 폴링 필요.
3. **Staking 락업**: 언스테이킹 대기 기간(unbonding period) 처리.
4. **m31-04 의존성**: HyperliquidExchangeClient, EIP-712 서명 인프라, Sub-account 모델 재활용.

---

## 테스트 항목

- Vault 입출금 플로우 (mock API) 테스트
- TWAP 주문 생성/취소/상태 조회 테스트
- HYPE Staking delegate/undelegate 테스트
- 정책 엔진 연동 (Vault 입금 한도 등) 테스트
- MCP 도구 + SDK 메서드 통합 테스트
