# 마일스톤 m31-09: Polymarket 예측 시장 통합

- **Status:** SHIPPED
- **Milestone:** v31.9
- **Completed:** 2026-03-11

## 목표

Polymarket 예측 시장을 WAIaaS에 통합하여 AI 에이전트가 예측 시장에서 포지션을 취하고 관리할 수 있도록 한다. EIP-712 서명 기반 CLOB 주문과 CTF(Conditional Token Framework) 온체인 정산을 결합하여, 기존 EVM 파이프라인과 API 서명 패턴을 활용한다.

> **리서치 필수**: Phase 1에서 Polymarket CLOB API, CTF 컨트랙트, Proxy Wallet, Neg Risk 등을 충분히 리서치한 후 설계를 확정한다.

---

## 배경

### Polymarket 개요

Polymarket은 Polygon 위에 구축된 최대 규모의 온체인 예측 시장이다. 특징:
- **CLOB**: Central Limit Order Book — EIP-712 서명 기반 오프체인 주문 매칭
- **CTF**: Gnosis Conditional Token Framework — ERC-1155 기반 조건부 토큰 (Yes/No 아웃컴)
- **Neg Risk**: 다중 아웃컴 시장에서 보완 토큰 자동 처리
- **USDC 기반**: 모든 거래가 USDC로 결제 (Polygon USDC)
- **마켓 해결**: Oracle이 아웃컴 결정 → winning 토큰 1 USDC로 리딤
- **Polygon 전용**: 모든 거래가 Polygon 네트워크에서만 동작 — 네트워크 검증 필수

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
- **Proxy Wallet 구조** (EOA → Proxy 매핑, 첫 거래 시 자동 생성, WAIaaS 지갑과의 관계)
- **Allowance 모델** (USDC → CTF Exchange vs Neg Risk CTF Exchange 각각의 approve 요구사항)
- 마켓 해결 메커니즘 (Oracle, 해결 시점, 분쟁 프로세스)
- API Key 발급 및 인증 방식 (CLOB API Key 생성 = EIP-712 서명 기반)
- Rate Limit 정책 및 수수료 구조 (maker/taker fee)
- Polymarket Gamma API (마켓 메타데이터, 이벤트 정보)
- **WebSocket 피드** 존재 여부 (실시간 가격/주문 업데이트) — 리서치 결과에 따라 Phase 2~4 범위 포함 여부 결정
- Testnet/Staging 환경 존재 여부
- **DB 마이그레이션 설계** (주문/포지션 추적 테이블 — Hyperliquid의 hyperliquid_orders 패턴 참고, Phase 2에서 구현)

**설계 항목:**
- PolymarketProvider 인터페이스 설계 (예측 시장 전용 인터페이스)
- EIP-712 주문 서명 → WAIaaS 서명 파이프라인 매핑
- CLOB 주문(오프체인) + CTF 정산(온체인) 이중 플로우 설계
- 마켓 조회/필터링 API 설계 (카테고리, 상태, 유동성 등)
- 포지션 관리 (보유 조건부 토큰, 미실현 PnL, 해결 대기)
- 정책 엔진 통합 (예측 시장 거래 한도, 허용 마켓 카테고리)
- **API Key 관리**: Admin Settings에 Polymarket API Key/Secret 저장 (런타임 변경 가능)
- **Polygon 네트워크 검증**: 모든 Polymarket 액션에서 polygon-mainnet/polygon-amoy 네트워크 강제
- **Hyperliquid EIP-712 패턴과의 공통화 범위** 결정 (리서치 결과에 따라 공통 추상화 여부 확정)
- **ApiDirectResult 패턴 적용 여부** 결정 (CLOB 주문은 오프체인 API 응답 — Hyperliquid v31.4에서 확립한 ApiDirectResult 패턴 적용 검토)
- **정책 엔진 매핑 설계**: 기존 정책 프레임워크(ALLOWED_TOKENS/CONTRACT_WHITELIST/지출 한도)와 예측 시장 거래의 매핑 관계 정의 — 마켓 카테고리 제한, 포지션 사이즈 한도, USDC 지출 한도 적용 방식
- **수수료 표시/추적 설계**: maker/taker fee를 WAIaaS 파이프라인에서 어떻게 표시하고 추적할지 결정 (가스비 조건부 실행 v28.5 패턴 참고)
- **Admin UI 예측 시장 탭** 설계 (포지션 표시, 마켓 조회, 주문 내역)
- MCP 도구 / SDK 메서드 설계
- **설계 문서 번호**: doc 80 (Polymarket 예측 시장 통합 설계)

### Phase 2: CLOB 주문 구현

Phase 1 설계 문서에서 확정된 테이블 스키마와 인터페이스를 기반으로 Polymarket CLOB 주문 시스템을 구현한다. Polygon 네트워크에서만 동작하도록 검증한다.

**기능:**
- **Proxy Wallet 생성/등록** (EOA → Proxy 매핑, 첫 거래 시 자동 생성 또는 명시적 생성)
- USDC approve (CTF Exchange / Neg Risk CTF Exchange 컨트랙트)
- **시장 타입별 라우팅** (바이너리 시장 → CTF Exchange, Neg Risk 시장 → Neg Risk CTF Exchange)
- Limit 주문 생성 (EIP-712 서명 → CLOB API 제출)
- Market 주문 생성
- 주문 취소 / 주문 상태 조회
- 오더북 조회 (bid/ask, 스프레드, 깊이)
- 거래 내역 조회
- Action Provider 패턴 구현 (PolymarketActionProvider)
- Admin Settings: Polymarket API Key/Secret 설정 항목
- **DB 마이그레이션**: 주문/포지션 추적 테이블 (Hyperliquid hyperliquid_orders 패턴 참고)
- MCP 도구 + SDK 메서드

### Phase 3: 마켓 조회 및 포지션 관리 (온체인 정산 포함)

마켓 탐색과 포지션 관리 기능을 구현한다. Phase 2의 CLOB 주문이 오프체인 API 플로우인 반면, 이 Phase의 리딤은 온체인 CTF 컨트랙트 호출 플로우이다.

**기능:**
- 마켓 목록 조회 (활성/해결됨/카테고리별 필터)
- 마켓 상세 조회 (설명, 아웃컴, 가격, 거래량, 해결 기한)
- 내 포지션 조회 (보유 토큰, 평균 진입가, 현재 가치, PnL)
- 마켓 해결 상태 추적
- 리딤 실행 (winning 토큰 → USDC 정산, 온체인 CTF 컨트랙트 호출)
- Admin UI 예측 시장 탭 (포지션 목록, 마켓 상세, 주문 내역)
- MCP 도구 + SDK 메서드

### Phase 4: 테스트 및 통합

통합 테스트와 기존 시스템 연동을 검증한다. Testnet이 없을 경우 mock-only 전략으로 진행한다 (Phase 1 리서치에서 확정).

**기능:**
- EIP-712 주문 서명 생성/검증 테스트 (mock)
- CLOB 주문 CRUD 테스트 (mock API)
- CTF 리딤 calldata 인코딩 검증
- Polygon 네트워크 검증 로직 테스트 (비-Polygon 네트워크 거부 확인)
- 정책 엔진 연동 (예측 시장 한도, 마켓 카테고리 제한)
- 에러 핸들링 (insufficient USDC, market closed, order rejected 등)
- Admin UI 예측 시장 탭 동작 검증
- **E2E 스모크 시나리오 등록** (@waiaas/e2e-tests에 오프체인 스모크 시나리오 추가, v31.7 체계 준수)
- **Agent UAT 시나리오 작성** (agent-uat/defi/ 하위에 polymarket-prediction.md 시나리오 추가, v31.8 6-section 포맷 준수)
- **Skill 파일 업데이트** (MCP/SDK/REST API 변경에 따라 skills/ 파일 동기화 — CLAUDE.md 인터페이스 동기 규칙 준수)

---

## 기술적 고려사항

1. **이중 플로우**: CLOB 주문은 오프체인 API(ApiDirectResult), CTF 리딤은 온체인 TX — 두 경로를 하나의 Action Provider에서 관리. Phase 2는 오프체인, Phase 3는 온체인 플로우에 집중.
2. **EIP-712 서명 패턴**: m31-04(Hyperliquid)에서 확립한 API 서명 패턴과 유사. Phase 1 리서치에서 공통 추상화 범위를 결정한다.
3. **ApiDirectResult 패턴**: CLOB 주문 제출/취소/조회는 온체인 TX 없이 API 응답을 직접 반환 — Hyperliquid(v31.4)의 ApiDirectResult 오프체인 DEX 패턴과 동일 구조.
4. **ERC-1155 조건부 토큰**: 기존 NFT 인프라(v31.0)의 ERC-1155 지원을 활용하되, CTF 토큰은 fungible한 ERC-1155라는 차이점 인지.
5. **Neg Risk 어댑터**: 다중 아웃컴 시장(예: 선거 후보 5명)에서는 Neg Risk 컨트랙트를 통해 거래 — 바이너리 시장과 플로우가 다를 수 있음.
6. **Proxy Wallet**: Polymarket은 EOA와 별도의 Proxy Wallet을 사용 — WAIaaS 지갑과의 매핑 관계를 Phase 1에서 명확히 한다.
7. **Polygon 전용**: 모든 Polymarket 액션에서 Polygon 네트워크를 검증하고, 비-Polygon 네트워크 요청은 명확한 에러로 거부한다.
8. **API Key 관리**: Admin Settings에 Polymarket API 자격증명을 저장하여 런타임 변경 가능하게 한다. 기존 Admin Settings 패턴(Hyperliquid 등) 활용.
9. **마켓 해결 대기**: 시장이 해결될 때까지 포지션이 락인됨 — 상태 추적/알림 통합 고려.
10. **규제 고려**: 일부 지역에서 Polymarket 접근이 제한될 수 있음 — 사용자 책임 고지.

---

## 테스트 항목

- EIP-712 Order 서명 생성/검증 테스트
- CLOB 주문 생성/취소/조회 (mock API) 테스트
- 마켓 조회/필터링 테스트
- CTF redeemPositions calldata 인코딩 검증
- USDC approve + 주문 실행 플로우 테스트
- 포지션 PnL 계산 로직 테스트
- Neg Risk 시장 vs 바이너리 시장 분기 테스트
- Polygon 네트워크 검증 (비-Polygon 거부) 테스트
- Proxy Wallet 매핑/생성 테스트
- Admin Settings API Key 저장/로드 테스트
- 정책 엔진 연동 (한도, 카테고리 제한) 테스트
- MCP 도구 + SDK 메서드 통합 테스트
- Admin UI 예측 시장 탭 렌더링/인터랙션 테스트
- 에러 케이스 (insufficient balance, market resolved, order expired)
- E2E 스모크 시나리오 (오프체인 CLOB 주문 플로우 검증)
- Agent UAT 시나리오 (6-section 포맷, DeFi 카테고리)
