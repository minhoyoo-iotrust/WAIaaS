# 마일스톤 m28: 기본 DeFi 프로토콜 설계 (Swap/Bridge/Staking)

- **Status:** PLANNED
- **Milestone:** v28.0

## 목표

v1.5에서 구축된 Action Provider 프레임워크 위에 4개 기본 DeFi 프로토콜(DEX Swap, EVM Swap, 크로스체인 브릿지, Liquid Staking)을 구현하기 위한 공통 설계를 확정한다. packages/actions/ 패키지 구조, REST API → calldata 변환 공통 패턴, 정책 연동 설계, 비동기 상태 추적 패턴, 테스트 전략을 정의하여 m28-01~m28-04 구현 마일스톤의 입력을 생산한다.

---

## 배경

v1.5에서 IActionProvider 인터페이스, ActionProviderRegistry, MCP Tool 자동 변환, POST /v1/actions/:provider/:action 엔드포인트가 구현되었다. 그러나 이 프레임워크의 **실 구현체**는 아직 없다. m28은 4개 프로토콜의 공통 설계를 확정하고, m28-01~m28-04에서 각각 구현한다.

### 4개 프로토콜 개요

| 마일스톤 | 프로토콜 | 체인 | 패턴 |
|---------|----------|------|------|
| m28-01 | Jupiter Swap | Solana | REST → instruction → ContractCallRequest |
| m28-02 | 0x Swap API | EVM (19+ 체인) | REST → calldata → ContractCallRequest |
| m28-03 | LI.FI Bridge | Solana↔EVM | REST → calldata + 비동기 상태 추적 |
| m28-04 | Lido + Jito Staking | EVM + Solana | ABI/프로그램 직접 호출 + 포지션 조회 |

---

## 설계 대상

### 1. packages/actions/ 패키지 구조

내장 ActionProvider 구현체를 코어/데몬과 분리하여 선택적 설치가 가능한 독립 패키지로 설계한다.

#### 1.1 설계 범위

| 항목 | 내용 |
|------|------|
| 패키지 이름 | @waiaas/actions (모노레포 packages/actions/) |
| 프로바이더 디렉토리 | providers/{name}/ — index.ts, schemas.ts, config.ts, api-client.ts |
| 내장 프로바이더 로딩 | 데몬 시작 시 enabled 프로바이더만 ActionProviderRegistry에 등록 |
| config.toml 패턴 | [actions.{provider_name}] 섹션 — enabled, 프로바이더별 설정 |
| 의존성 정책 | 프로바이더별 외부 SDK는 선택적 의존성. REST API 직접 호출 우선 |

#### 1.2 설계 산출물

- packages/actions/ 디렉토리 구조 확정 + 패키지 스캐폴딩 (package.json, tsconfig.json, turbo 연동은 m28-01 첫 페이즈에서 구현)
- 내장 프로바이더 등록/해제 라이프사이클
- config.toml [actions.*] 섹션 스키마 공통 패턴
- Admin Settings 노출 항목 (API 키, 슬리피지 등 런타임 변경 가능 설정)

---

### 2. REST API → calldata 변환 공통 패턴

4개 프로토콜 모두 **외부 REST API 호출 → calldata/instruction 획득 → ContractCallRequest 변환**이라는 동일 패턴을 따른다. 이 공통 패턴을 설계한다.

#### 2.1 공통 플로우

```
resolve(actionName, params)
  1. 입력 파라미터 Zod 검증
  2. 외부 API 호출 (Quote/견적 조회)
  3. 견적 검증 (슬리피지, priceImpact 등)
  4. 외부 API 호출 (calldata/instruction 획득)
  5. ContractCallRequest 변환 (체인별 매핑)
  6. 반환 → 기존 파이프라인 Stage 1~6 실행
```

#### 2.2 설계 범위

| 항목 | 내용 |
|------|------|
| API Client 공통 패턴 | native fetch + AbortController 타임아웃 + 응답 Zod 검증 |
| 타임아웃 기본값 | 10초 (크로스체인은 15초) |
| 에러 처리 | ACTION_API_ERROR, ACTION_RATE_LIMITED, PRICE_IMPACT_TOO_HIGH 에러 코드 |
| 슬리피지 제어 | 프로바이더별 기본값/상한 config, 사용자 입력 → 상한 클램핑. 단위는 외부 API 네이티브 단위 사용: Jupiter=bps(정수), 0x/LI.FI=pct(소수). config 키도 API 단위에 맞춤 (_bps / _pct) |
| 견적 캐시 | 프로바이더별 선택적 캐시 (30초 TTL) |

#### 2.3 설계 산출물

- ActionApiClient 베이스 패턴 (fetch 래퍼, 타임아웃, Zod 검증)
- ContractCallRequest 변환 매핑 (Solana: programId/instructionData/accounts, EVM: to/data/value)
- 에러 코드 추가 (ACTION_API_ERROR, ACTION_RATE_LIMITED, PRICE_IMPACT_TOO_HIGH)
- 슬리피지 제어 공통 로직 (기본값/상한/클램핑) + 프로바이더별 단위 규칙 (API 네이티브 단위: bps/pct)

---

### 3. 정책 연동 설계 (DEFI-03 확정)

기존 정책 엔진이 ActionProvider 실행에 어떻게 적용되는지 확정한다.

#### PLCY-01: ActionProvider -> 정책 평가 연동 플로우

```
AI Agent / MCP / SDK
        |
        v
POST /v1/actions/:provider/:action { params, walletId }
        |
        v
ActionProviderRegistry.executeResolve(actionKey, params, context)
  1. inputSchema.parse(params) -- 입력 검증
  2. provider.resolve(actionName, params, context)
     - 외부 API 호출 또는 ABI 인코딩
     - Settings snapshot 획득 (resolve 시작 시점)
     -> 반환: ContractCallRequest
  3. ContractCallRequestSchema.parse(result) -- 반환값 재검증
        |
        v
executeSend(walletId, contractCallRequest) -- 기존 파이프라인 진입
        |
        v
Stage 1: Validate + DB INSERT (PENDING)
  - ContractCallRequest 필드 검증
  - transactions 테이블에 INSERT
        |
        v
Stage 2: Auth (sessionId 검증)
        |
        v
Stage 3: Policy Evaluation  <-- 정책 평가 핵심 지점
  3a. CONTRACT_WHITELIST 검사
      - contractCallRequest.to 주소가 화이트리스트에 등록되었는지 확인
      - 미등록 시: POLICY_VIOLATION (CONTRACT_WHITELIST) 에러 -> 즉시 거부
  3b. SPENDING_LIMIT 평가
      - 금액 추출: value (native) 또는 amount (token)
      - IPriceOracle로 USD 환산
      - 기존 4-tier 평가: ALLOW / DELAY / APPROVAL / DENY
  3c. APPROVED_SPENDERS 검사 (0x AllowanceHolder approve 시)
      - approve 대상이 APPROVED_SPENDERS에 등록되었는지 확인
        |
        v
[Stage 3.5: Gas Condition -- m28-05에서 추가]
        |
        v
Stage 4: Wait (DELAY/APPROVAL tier에 따라 대기/승인)
        |
        v
Stage 5: Execute (build -> simulate -> sign -> submit)
        |
        v
Stage 6: Confirm (waitForConfirmation)
```

**핵심 원칙:**

1. **resolve()는 순수 함수** -- 정책 평가는 파이프라인 Stage 3에서만 수행. resolve()에서 정책 검사를 하지 않는다.
2. **CONTRACT_WHITELIST 필수** -- 정책 평가 시점에서 ContractCallRequest의 `to` 주소가 CONTRACT_WHITELIST에 등록되어야 한다.
3. **SPENDING_LIMIT 금액 기준** -- resolve()가 반환한 금액(value/amount)을 기준으로 평가한다.
4. **approve 트랜잭션은 $0 지출로 평가** -- 승인(approval)은 지출이 아니다. APPROVE 타입 트랜잭션의 SPENDING_LIMIT 평가 금액은 $0이다.
5. **Settings snapshot** -- resolve() 진입 시 Settings snapshot을 획득하고, 파이프라인 완료까지 해당 snapshot을 유지한다. 중간에 Admin Settings가 변경되어도 진행 중인 트랜잭션에는 영향 없다.

#### PLCY-02: 4개 프로토콜의 CONTRACT_WHITELIST 등록 대상

구현 시 아래 목록을 참조하여 프로바이더별 화이트리스트 번들을 자동 생성한다.

| 프로토콜 | 체인 | 주소 | 설명 | 화이트리스트 번들 |
|---------|------|------|------|-----------------|
| Jupiter | Solana | JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 | Jupiter Aggregator v6 | jupiter_swap |
| 0x | All EVM | (quote.to에서 동적 획득) | 0x Settlement / ExchangeProxy | 0x_swap |
| 0x | All EVM | AllowanceHolder 주소 (0x API response에서 획득) | AllowanceHolder approve 대상 | 0x_swap |
| LI.FI | EVM | (quote.transactionRequest.to에서 동적 획득) | LI.FI diamond proxy | lifi |
| LI.FI | Solana | (quote response에서 동적 획득) | Bridge program | lifi |
| Lido | Ethereum | 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84 | stETH / Lido contract | lido |
| Lido | Ethereum | 0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1 | WithdrawalQueueERC721 | lido |
| Jito | Solana | SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy | SPL Stake Pool program | jito |

**정적 주소 (Lido, Jito, Jupiter):** 프로바이더의 config.ts에 하드코딩한다. 프로바이더 등록 시 화이트리스트 번들로 제공한다.

**동적 주소 (0x, LI.FI):** quote response의 `to` 필드에서 획득한다. 프로바이더가 resolve()에서 반환한 ContractCallRequest.to가 화이트리스트에 등록되어야 한다. 동적 주소의 경우 프로바이더가 resolve() 시 획득한 주소를 반환하고, Stage 3에서 해당 주소의 화이트리스트 등록 여부를 검사한다.

**프로바이더 화이트리스트 번들 설계:**

각 ActionProvider에 `getRequiredContracts(chain): ContractAddress[]` 메서드를 추가한다.
- 정적 주소를 가진 프로바이더(Jupiter, Lido, Jito)는 하드코딩된 주소 배열을 반환한다.
- 동적 주소를 가진 프로바이더(0x, LI.FI)는 빈 배열을 반환하되, 문서에 "동적 주소이므로 첫 사용 시 자동 등록 안내 필요"를 명시한다.

프로바이더 활성화 시 Admin UI에서 안내:
- "이 프로바이더가 필요한 컨트랙트 주소를 화이트리스트에 추가하시겠습니까?"
- 정적 주소는 자동 추가 제안, 동적 주소는 첫 트랜잭션 시 안내.

에러 메시지 개선:
- 기존: `"CONTRACT_WHITELIST violation for 0xae75..."`
- 개선: `"Lido stETH contract가 화이트리스트에 미등록. Admin > Policies에서 Lido 번들을 활성화하세요"`
- 프로바이더 컨텍스트를 포함하여 운영자가 바로 조치할 수 있도록 안내한다.

Pitfall P13 (CONTRACT_WHITELIST 파편화) 방지: 프로바이더별 번들로 묶어 한 번에 등록/해제한다.

---

### 4. 비동기 상태 추적 패턴

크로스체인 브릿지(m28-03)와 unstake(m28-04)는 비동기 완료를 추적해야 한다. 공통 폴링 패턴을 설계한다.

#### 4.1 설계 범위

| 항목 | 내용 |
|------|------|
| 추적 대상 | 브릿지 전송 (수 분~수십 분), unstake 대기 (수 시간~수 일) |
| 추적 방식 | 폴링 기반 (외부 API /status 호출) |
| 폴링 간격 | 브릿지 30초, unstake 5분 (config.toml 오버라이드) |
| 최대 폴링 | 브릿지 60회 (30분), unstake 288회 (24시간) |
| 상태 전이 | PENDING → COMPLETED / FAILED / TIMEOUT |
| 알림 | 완료/실패/타임아웃 시 알림 발송 |
| DB 마이그레이션 | bridge_status(m28-03) + GAS_WAITING 상태(m28-05)를 단일 마이그레이션으로 통합 설계. **실행 시점: m28-03** (브릿지가 먼저 필요하므로 m28-03에서 통합 마이그레이션 적용, m28-05는 이미 추가된 GAS_WAITING 상태를 사용) |

#### 4.2 설계 산출물

- AsyncStatusTracker 공통 인터페이스
- 폴링 스케줄러 설계 (setInterval vs setTimeout 체인)
- transactions 테이블 bridge_status 컬럼 추가 + GAS_WAITING 상태 확장 통합 마이그레이션 설계
- 상태 전이 다이어그램

---

### 5. 테스트 전략

4개 프로토콜 공통의 테스트 패턴을 설계한다.

#### 5.1 설계 범위

| 항목 | 내용 |
|------|------|
| 단위 테스트 | mock 외부 API 응답 → resolve() → ContractCallRequest 검증 |
| 통합 테스트 | mock API + mock ChainAdapter → 파이프라인 실행 → 상태 전이 |
| 정책 테스트 | CONTRACT_WHITELIST / SPENDING_LIMIT 연동 검증 |
| MCP 테스트 | 프로바이더 등록 → MCP tool 목록 자동 노출 |
| 외부 API 실 호출 | [HUMAN] 태그 — Devnet/Testnet에서 수동 검증 |

#### 5.2 설계 산출물

- mock API 응답 픽스처 공통 구조
- 프로바이더 테스트 헬퍼 (createMockApiResponse, assertContractCallRequest)
- 4개 프로토콜 × 공통 시나리오 매트릭스

---

## 신규 산출물

| ID | 산출물 | 설명 |
|----|--------|------|
| DEFI-01 | packages/actions/ 구조 설계 | 디렉토리, config 패턴, 프로바이더 로딩 |
| DEFI-02 | REST → calldata 공통 패턴 | API Client, 슬리피지, 에러 코드 |
| DEFI-03 | 정책 연동 설계 | CONTRACT_WHITELIST, SPENDING_LIMIT, 크로스체인 |
| DEFI-04 | 비동기 상태 추적 설계 | AsyncStatusTracker, 폴링, 상태 전이, DB 마이그레이션 통합 계획 |
| DEFI-05 | 테스트 전략 | mock 패턴, 테스트 매트릭스 |

### 산출물 → 구현 마일스톤 매핑

| 산출물 | 소비 마일스톤 | 설명 |
|--------|-------------|------|
| DEFI-01 | m28-01 | packages/actions/ 패키지 스캐폴딩, 내장 프로바이더 로딩 구현 |
| DEFI-02 | m28-01, m28-02, m28-03 | ActionApiClient 베이스 패턴을 각 프로바이더에서 구현 |
| DEFI-03 | m28-01, m28-02, m28-03, m28-04 | CONTRACT_WHITELIST/SPENDING_LIMIT 연동을 각 프로바이더에서 구현 |
| DEFI-04 | m28-03, m28-04, m28-05 | AsyncStatusTracker 공통 인터페이스를 브릿지/unstake/가스대기에서 구현. DB 통합 마이그레이션은 m28-03에서 실행 |
| DEFI-05 | m28-01, m28-02, m28-03, m28-04 | mock API 패턴, 테스트 헬퍼를 각 프로바이더 테스트에서 활용 |

---

## 영향받는 설계 문서

| 문서 | 변경 |
|------|------|
| 62 (action-provider-architecture) | 내장 프로바이더 패키지 구조, config 패턴 추가 |
| 63 (swap-action-spec) | 공통 패턴으로 리팩터링 |
| 37 (rest-api) | ACTION_API_ERROR 등 에러 코드 추가 |
| 33 (policy) | ActionProvider 정책 연동 플로우 |
| 35 (notification) | 비동기 완료/실패 알림 이벤트 |

---

## 성공 기준

1. 4개 프로토콜의 공통 설계 요소가 일관된 패턴으로 정의됨
2. packages/actions/ 구조가 확정되어 m28-01에서 바로 구현 가능
3. 정책 연동 규칙이 명확하여 구현 시 모호함 없음
4. 비동기 상태 추적 패턴이 브릿지/unstake 양쪽에 재사용 가능
5. 테스트 전략이 4개 프로토콜에 일관되게 적용 가능

---

*생성일: 2026-02-15*
*범위: 설계 마일스톤 — 코드 구현은 m28-01~m28-04에서 수행*
*선행: v1.5 (Action Provider 프레임워크 + 가격 오라클)*
*관련: 설계 문서 62 (action-provider-architecture), 63 (swap-action-spec)*
