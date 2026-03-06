# 마일스톤 m31-08: Polymarket 예측 시장 통합

- **Status:** PLANNED
- **Milestone:** v31.8

## 목표

Polymarket 예측 시장을 WAIaaS에 통합하여 AI 에이전트가 예측 시장에서 포지션을 취하고 관리할 수 있도록 한다. EIP-712 서명 기반 CLOB 주문과 CTF(Conditional Token Framework) 온체인 정산을 결합하여, 기존 EVM 파이프라인과 API 서명 패턴을 활용한다.

> **리서치 필수**: Polymarket은 CLOB(오프체인 주문) + CTF(온체인 조건부 토큰)의 이중 구조로 동작한다. 구현 착수 전에 반드시 Polymarket CLOB API 사양, EIP-712 주문 서명 구조(Order struct, salt, nonce), CTF 컨트랙트 인터페이스(splitPosition/mergePositions/redeemPositions), Neg Risk 어댑터, 마켓 해결 메커니즘, API rate limit, 수수료 구조 등을 충분히 리서치하여 설계 문서에 반영해야 한다.

---

## 배경

### Polymarket 개요

Polymarket은 Polygon 위에 구축된 최대 규모의 온체인 예측 시장이다. 특징:
- **CLOB**: Central Limit Order Book — EIP-712 서명 기반 오프체인 주문 매칭
- **CTF**: Gnosis Conditional Token Framework — ERC-1155 기반 조건부 토큰 (Yes/No 아웃컴)
- **Neg Risk**: 다중 아웃컴 시장에서 보완 토큰 자동 처리
- **USDC 기반**: 모든 거래가 USDC로 결제 (Polygon USDC)
- **마켓 해결**: Oracle이 아웃컴 결정 → winning 토큰 1 USDC로 리딤

### 기존 인프라 활용

- **Polygon 체인**: polygon-mainnet / polygon-amoy 이미 지원
- **EIP-712 서명**: EvmAdapter signTypedData 지원 + m31-04(Hyperliquid)에서 동일 패턴 설계
- **ERC-1155**: NFT 인프라(v31.0)에서 ERC-1155 지원
- **APPROVE + CONTRACT_CALL**: USDC approve, CTF 컨트랙트 호출 파이프라인 존재
- **DeFi Action Provider 패턴**: Jupiter/0x/Aave/Drift 등 다수 선례

### Polymarket 거래 플로우

```
1. 마켓 조회 (REST API) → 시장 목록, 가격, 유동성
2. USDC approve → CTF Exchange 컨트랙트에 allowance 설정
3. 주문 생성 (EIP-712 서명) → CLOB API에 제출
4. 주문 매칭 → 조건부 토큰(Yes/No) 수령
5. (시장 해결 후) 리딤 → winning 토큰을 USDC로 교환
```

---

## 범위

### Phase 1: Polymarket 리서치 및 설계

Polymarket API, CLOB, CTF 컨트랙트를 심층 리서치하고 WAIaaS 통합 설계 문서를 작성한다.

**리서치 항목:**
- Polymarket CLOB API 전체 사양 (주문 생성/취소/조회, 오더북, 거래 내역)
- EIP-712 주문 서명 구조 (Order struct 필드, domain separator, salt/nonce 관리)
- CTF 컨트랙트 인터페이스 (splitPosition, mergePositions, redeemPositions)
- Neg Risk 어댑터 동작 방식 (다중 아웃컴 시장)
- 마켓 해결 메커니즘 (Oracle, 해결 시점, 분쟁 프로세스)
- API Key 발급 및 인증 방식
- Rate Limit 정책 및 수수료 구조 (maker/taker fee)
- Polymarket Gamma API (마켓 메타데이터, 이벤트 정보)
- Testnet/Staging 환경 존재 여부

**설계 항목:**
- PolymarketProvider 인터페이스 설계 (예측 시장 전용 인터페이스)
- EIP-712 주문 서명 → WAIaaS 서명 파이프라인 매핑
- CLOB 주문(오프체인) + CTF 정산(온체인) 이중 플로우 설계
- 마켓 조회/필터링 API 설계 (카테고리, 상태, 유동성 등)
- 포지션 관리 (보유 조건부 토큰, 미실현 PnL, 해결 대기)
- 정책 엔진 통합 (예측 시장 거래 한도, 허용 마켓 카테고리)
- MCP 도구 / SDK 메서드 설계

### Phase 2: CLOB 주문 구현

Polymarket CLOB 주문 시스템을 구현한다.

**기능:**
- USDC approve (CTF Exchange 컨트랙트)
- Limit 주문 생성 (EIP-712 서명 → CLOB API 제출)
- Market 주문 생성
- 주문 취소 / 주문 상태 조회
- 오더북 조회 (bid/ask, 스프레드, 깊이)
- 거래 내역 조회
- Action Provider 패턴 구현 (PolymarketActionProvider)
- MCP 도구 + SDK 메서드

### Phase 3: 마켓 조회 및 포지션 관리

마켓 탐색과 포지션 관리 기능을 구현한다.

**기능:**
- 마켓 목록 조회 (활성/해결됨/카테고리별 필터)
- 마켓 상세 조회 (설명, 아웃컴, 가격, 거래량, 해결 기한)
- 내 포지션 조회 (보유 토큰, 평균 진입가, 현재 가치, PnL)
- 마켓 해결 상태 추적
- 리딤 실행 (winning 토큰 → USDC 정산, 온체인 CTF 컨트랙트 호출)
- MCP 도구 + SDK 메서드

### Phase 4: 테스트 및 통합

통합 테스트와 기존 시스템 연동을 검증한다.

**기능:**
- EIP-712 주문 서명 생성/검증 테스트 (mock)
- CLOB 주문 CRUD 테스트 (mock API)
- CTF 리딤 calldata 인코딩 검증
- 정책 엔진 연동 (예측 시장 한도, 마켓 카테고리 제한)
- 에러 핸들링 (insufficient USDC, market closed, order rejected 등)
- Admin UI 예측 시장 포지션 표시 (선택)

---

## 기술적 고려사항

1. **이중 플로우**: CLOB 주문은 오프체인 API, CTF 리딤은 온체인 TX — 두 경로를 하나의 Action Provider에서 관리.
2. **EIP-712 서명 재활용**: m31-04(Hyperliquid)에서 확립한 API 서명 패턴과 공통 추상화 가능.
3. **ERC-1155 조건부 토큰**: 기존 NFT 인프라(v31.0)의 ERC-1155 지원을 활용하되, CTF 토큰은 fungible한 ERC-1155라는 차이점 인지.
4. **Neg Risk 어댑터**: 다중 아웃컴 시장(예: 선거 후보 5명)에서는 Neg Risk 컨트랙트를 통해 거래 — 바이너리 시장과 플로우가 다를 수 있음.
5. **마켓 해결 대기**: 시장이 해결될 때까지 포지션이 락인됨 — 상태 추적/알림 통합 고려.
6. **규제 고려**: 일부 지역에서 Polymarket 접근이 제한될 수 있음 — 사용자 책임 고지.

---

## 테스트 항목

- EIP-712 Order 서명 생성/검증 테스트
- CLOB 주문 생성/취소/조회 (mock API) 테스트
- 마켓 조회/필터링 테스트
- CTF redeemPositions calldata 인코딩 검증
- USDC approve + 주문 실행 플로우 테스트
- 포지션 PnL 계산 로직 테스트
- Neg Risk 시장 vs 바이너리 시장 분기 테스트
- 정책 엔진 연동 (한도, 카테고리 제한) 테스트
- MCP 도구 + SDK 메서드 통합 테스트
- 에러 케이스 (insufficient balance, market resolved, order expired)
