# 마일스톤 m28-03: LI.FI 크로스체인 브릿지

- **Status:** SHIPPED
- **Milestone:** v28.3
- **Completed:** 2026-02-24

## 목표

v1.5 Action Provider 프레임워크 위에 LI.FI를 ActionProvider로 구현하여, AI 에이전트가 Solana↔EVM 또는 EVM↔EVM 체인 간 자산을 정책 평가 하에 브릿지/스왑할 수 있는 상태. m28-00(DEFI-04) 확정 설계에 따른 비동기 상태 추적 공통 인프라(IAsyncStatusTracker, AsyncPollingService)를 구축하여 m28-04/m28-05가 재사용할 기반을 제공한다.

---

## 배경

m28-01(Jupiter)와 m28-02(0x)이 각각 Solana/EVM 내 스왑을 지원하지만, **체인 간 자산 이동**은 불가능하다. WAIaaS는 멀티체인 월렛(v1.4.6)을 지원하므로, 같은 Owner의 Solana 월렛과 EVM 월렛 간 자산을 이동하거나 체인을 넘어 스왑하는 기능이 필요하다.

LI.FI는 100+ 브릿지와 DEX를 단일 REST API로 집계하는 메타 애그리게이터로, 40+ 체인을 지원한다. "SOL을 Base USDC로 교환해줘" 같은 크로스체인 요청을 한 번의 API 호출로 처리할 수 있다.

### 사용 시나리오

```
AI 에이전트: "Solana에 있는 5 SOL을 Base의 USDC로 교환해줘"

1. LI.FI API: /quote (fromChain=solana, toChain=base, fromToken=SOL, toToken=USDC)
2. 최적 경로 계산: SOL → (Wormhole 브릿지) → Base ETH → (Uniswap) → USDC
3. ContractCallRequest 반환 → 정책 평가 → 서명/전송
4. 출발 체인 TX 확인 → bridge_status=PENDING → 비동기 폴링 시작 → 완료 시 알림
```

---

## 구현 대상

### 컴포넌트

| 컴포넌트 | 내용 |
|----------|------|
| LiFiActionProvider | IActionProvider 구현체. LI.FI REST API v1 호출. resolve() -> ContractCallRequest. 3가지 액션: bridge(브릿지만), swap(단일 체인 스왑), crossSwap(브릿지+스왑). 40+ 체인 지원 |
| LiFiApiClient | LI.FI REST API 래퍼 (extends ActionApiClient). `/quote`(경로 조회+calldata), `/status`(트랜잭션 상태 추적). API 키 기반 인증. 요청 타임아웃 15초(크로스체인 경로 계산은 시간 소요). 응답 Zod 스키마 검증 |
| IAsyncStatusTracker | DEFI-04 확정 설계에 따른 공통 인터페이스. checkStatus(), name, maxAttempts, pollIntervalMs, timeoutTransition 정의. m28-04(unstake), m28-05(gas-condition)에서 재사용 |
| BridgeStatusTracker | IAsyncStatusTracker 구현체. LI.FI `/status` API 폴링. 2단계 모니터링: 활성(30초×240회=2시간) → 축소(5분×264회=22시간). 총 24시간 모니터링 |
| AsyncPollingService | DEFI-04 확정 설계에 따른 폴링 스케줄러. tracker 등록, DB 기반 추적 대상 조회, per-tracker 타이밍 관리, 타임아웃 전이 처리 |
| DB 마이그레이션 v23 | DEFI-04 통합 마이그레이션: bridge_status(6-value CHECK) + bridge_metadata + GAS_WAITING 상태 + partial index 2개 |
| 알림 이벤트 확장 | BRIDGE_COMPLETED, BRIDGE_FAILED, BRIDGE_MONITORING_STARTED, BRIDGE_TIMEOUT, BRIDGE_REFUNDED 5개 추가 (31→36) |
| MCP 도구 | waiaas_lifi_bridge, waiaas_lifi_cross_swap — 브릿지와 크로스체인 스왑을 별도 도구로 노출 |
| SDK 지원 | TS SDK executeAction('lifi_bridge', params) + Python SDK execute_action('lifi_bridge', params) |

### 입력 스키마

```typescript
// 크로스체인 브릿지/스왑
const LiFiCrossSwapInputSchema = z.object({
  fromChain: z.string(),        // 출발 체인 (solana, ethereum, base, ...)
  toChain: z.string(),          // 도착 체인
  fromToken: z.string(),        // 출발 토큰 주소 또는 심볼
  toToken: z.string(),          // 도착 토큰 주소 또는 심볼
  fromAmount: z.string(),       // 전송 수량 (smallest unit)
  slippage: z.number().optional(), // 슬리피지 (0.03 = 3%)
});
```

### 파일/모듈 구조

```
packages/actions/src/
  common/
    async-status-tracker.ts      # IAsyncStatusTracker 인터페이스 + AsyncTrackingResult 타입
  providers/
    lifi/
      index.ts                   # LiFiActionProvider
      lifi-api-client.ts         # LI.FI REST API 래퍼 (extends ActionApiClient)
      schemas.ts                 # 입력/응답 Zod 스키마
      config.ts                  # LiFiConfig 타입 + 기본값
      bridge-status-tracker.ts   # BridgeStatusTracker : IAsyncStatusTracker
  index.ts                       # 내장 프로바이더 export 업데이트

packages/daemon/src/
  services/
    async-polling-service.ts     # AsyncPollingService (tracker 등록 + pollAll + DB 연동)
  infrastructure/database/
    migrate.ts                   # v23 마이그레이션 추가
```

### Admin Settings (Actions 페이지)

빌트인 프로바이더는 기본 활성화 상태. Admin UI > Actions 페이지에서 런타임 설정 변경 가능 (#158).

| 설정 키 | 기본값 | 설명 |
|---------|--------|------|
| `lifi.enabled` | `true` | 프로바이더 활성화 |
| `lifi.api_key` | `""` | LI.FI API 키 (선택, rate limit 완화) |
| `lifi.api_base_url` | `"https://li.quest/v1"` | API base URL |
| `lifi.default_slippage_pct` | `0.03` | 기본 슬리피지 (3%, 크로스체인) |
| `lifi.max_slippage_pct` | `0.05` | 최대 슬리피지 (5%) |

> **참고:** 폴링 간격/횟수는 DEFI-04 확정 설계에 따라 BridgeStatusTracker 내부에 하드코딩된다 (30초×240회 활성 + 5분×264회 축소). Admin Settings로 노출하지 않는다 — 안전성 파라미터이므로 런타임 변경을 허용하지 않음.

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 크로스체인 프로토콜 | LI.FI (메타 애그리게이터) | 단일 API로 100+ 브릿지(Wormhole, Stargate, Across, deBridge 등) + DEX를 집계. 개별 브릿지 통합 대비 유지보수 비용 최소화. 40+ 체인 커버리지 |
| 2 | API 키 정책 | 선택 (Admin Settings) | LI.FI는 API 키 없이도 기본 사용 가능. Admin Settings > Actions 페이지에서 설정. 키 설정 시 rate limit 완화 + 프리미엄 기능 접근 |
| 3 | 브릿지 상태 추적 | DEFI-04 IAsyncStatusTracker 패턴 | LI.FI webhooks 대신 폴링 (self-hosted 환경 방화벽 이슈 없음). 2단계: 활성 폴링(30초×240회=2시간) + 축소 폴링(5분×264회=22시간) = 총 24시간. Research Pitfall P4(Limbo State) 대응 |
| 4 | 슬리피지 기본값 | 3% (크로스체인) | 단일 체인 스왑(1%) 대비 크로스체인은 브릿지 수수료 + 가격 변동 폭이 커서 높은 슬리피지 필요. LI.FI 공식 권장값 |
| 5 | 정책 평가 시점 | 출발 체인 기준 (DEFI-03 확정) | 크로스체인 브릿지의 정책 평가는 출발 체인 월렛의 정책으로 수행. 도착 체인의 정책은 수신이므로 평가 대상 아님 |
| 6 | 자동 취소 금지 | DEFI-04 ASNC-05 확정 | TIMEOUT은 CANCELLED가 아님. 자금이 브릿지 프로토콜 내 "limbo" 상태일 수 있으므로, 타임아웃 시에도 SPENDING_LIMIT 예약 유지. 예약 해제: COMPLETED 또는 REFUNDED만. FAILED 시에도 해제 (출발 체인 미차감) |
| 7 | 공통 인프라 선행 구축 | m28-03에서 IAsyncStatusTracker + AsyncPollingService 구축 | m28-03이 비동기 추적의 첫 소비자. 공통 인터페이스를 여기서 구축하여 m28-04(unstake)/m28-05(gas-condition)가 구현체만 추가하면 되도록 설계 |

---

## SPENDING_LIMIT 예약 해제 규칙 (DEFI-04 ASNC-05 확정)

크로스체인 브릿지는 출발 체인에서 자금이 나가는 시점에 SPENDING_LIMIT 예약이 발생한다. 예약 해제 조건:

| bridge_status 전이 | 예약 해제 | 근거 |
|-------------------|----------|------|
| PENDING → COMPLETED | 해제 | 정상 완료, 도착 체인에서 자금 수신 확인 |
| PENDING → FAILED | 해제 | 출발 체인 TX 실패 = 자금 미차감 |
| PENDING → REFUNDED | 해제 | 브릿지 프로토콜이 출발 체인으로 환불 완료 |
| PENDING → BRIDGE_MONITORING | **유지** | 자금 소재 미확정, 폴링 계속 |
| BRIDGE_MONITORING → TIMEOUT | **유지** | 자금이 "limbo" 상태일 수 있음, 운영자 수동 확인 필요 |

**자동 취소 절대 금지 원칙:** TIMEOUT 전환 시에도 트랜잭션을 CANCELLED로 변경하지 않는다. bridge_status는 transactions.status와 독립적이다 (status=CONFIRMED + bridge_status=PENDING 가능).

---

## E2E 검증 시나리오

**자동화 비율: 95%+ -- `[HUMAN]` 1건**

### 크로스체인 브릿지/스왑

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | lifi cross_swap resolve -> ContractCallRequest 반환 | mock LI.FI /quote 응답 -> LiFiActionProvider.resolve('cross_swap') -> ContractCallRequest 반환 assert | [L0] |
| 2 | Solana -> EVM 크로스체인 스왑 | mock LI.FI API(SOL->Base USDC 경로) + mock adapters -> resolve() -> 파이프라인 실행 assert | [L0] |
| 3 | EVM -> EVM 크로스체인 브릿지 | mock LI.FI API(Ethereum ETH -> Arbitrum ETH) -> resolve() -> ContractCallRequest assert | [L0] |
| 4 | EVM -> Solana 크로스체인 스왑 | mock LI.FI API(Base USDC -> SOL) -> resolve() -> ContractCallRequest assert | [L0] |

### 브릿지 상태 추적 (DEFI-04 6-state 전체 커버)

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 5 | 브릿지 전송 후 활성 폴링 -> COMPLETED | mock /status 응답(PENDING → DONE) -> BridgeStatusTracker.checkStatus() -> COMPLETED 상태 + BRIDGE_COMPLETED 알림 + SPENDING_LIMIT 예약 해제 assert | [L0] |
| 6 | 브릿지 실패 -> FAILED + 알림 | mock /status 응답(FAILED) -> FAILED 상태 + BRIDGE_FAILED 알림 + SPENDING_LIMIT 예약 해제 assert | [L0] |
| 7 | 활성 폴링 240회 초과 -> BRIDGE_MONITORING 전환 | 240회 폴링 후 미완료 -> bridge_status=BRIDGE_MONITORING + BRIDGE_MONITORING_STARTED 알림 + 예약 유지 assert | [L0] |
| 8 | 축소 폴링 중 완료 -> COMPLETED | BRIDGE_MONITORING 상태에서 /status=DONE -> COMPLETED + BRIDGE_COMPLETED 알림 assert | [L0] |
| 9 | 축소 폴링 24시간 초과 -> TIMEOUT | BRIDGE_MONITORING 264회 후 미완료 -> TIMEOUT + BRIDGE_TIMEOUT 알림(critical) + 예약 유지 assert | [L0] |
| 10 | 브릿지 환불 -> REFUNDED | mock /status 응답(REFUNDED) -> REFUNDED 상태 + BRIDGE_REFUNDED 알림 + 예약 해제 assert | [L0] |

### AsyncPollingService 공통 인프라

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 11 | tracker 등록 + pollAll() 정상 동작 | BridgeStatusTracker 등록 -> DB에 bridge_status=PENDING TX 삽입 -> pollAll() -> checkStatus 호출 assert | [L0] |
| 12 | per-tracker 타이밍: lastPolledAt 미경과 시 skip | lastPolledAt=현재-10초 (30초 미경과) -> pollAll() -> checkStatus 미호출 assert | [L0] |
| 13 | pollAll() 에러 격리: 1개 TX 에러 시 나머지 계속 | 2개 TX 중 첫 번째 checkStatus 에러 -> 두 번째 정상 처리 assert | [L0] |

### 슬리피지 + 에러

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 14 | 슬리피지: 기본 3% 적용 확인 | 기본 설정 -> LI.FI /quote 호출 시 slippage=0.03 assert | [L0] |
| 15 | LI.FI API 에러 -> ACTION_API_ERROR | mock LI.FI API 에러 -> resolve() ACTION_API_ERROR 반환 assert | [L0] |
| 16 | 미지원 체인 조합 -> 명확한 에러 | 존재하지 않는 체인 조합 -> "지원하지 않는 경로" 에러 assert | [L0] |

### 정책 연동

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 17 | 크로스체인 금액 USD 환산 -> SPENDING_LIMIT 평가 | mock oracle + 5 SOL($750) 크로스체인 -> 출발 체인 SPENDING_LIMIT 평가 assert | [L0] |
| 18 | 출발 체인 정책 거부 -> 브릿지 미실행 | 출발 체인 CONTRACT_WHITELIST 미등록 -> 정책 거부 assert | [L0] |

### DB 마이그레이션

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 19 | 마이그레이션 v23 적용 -> bridge_status + bridge_metadata 컬럼 존재 | v22 DB -> v23 마이그레이션 -> PRAGMA table_info 검증 + CHECK constraint 검증 | [L0] |
| 20 | 마이그레이션 v23 -> partial index 2개 생성 확인 | v23 적용 후 sqlite_master에서 idx_transactions_bridge_status, idx_transactions_gas_waiting 존재 assert | [L0] |
| 21 | GAS_WAITING 상태 추가 확인 | TRANSACTION_STATUSES 11개 + TransactionStatusEnum 검증 | [L0] |

### MCP

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 22 | MCP: waiaas_lifi_cross_swap 도구 노출 | lifi 프로바이더 등록 -> MCP tool 목록에 waiaas_lifi_cross_swap 포함 assert | [L0] |

### 외부 API 실 호출

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 23 | LI.FI API 실 호출 테스트넷 검증 | Sepolia->Base Sepolia 경로로 LI.FI /quote 실 호출 -> 견적 응답 성공 확인 | [HUMAN] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m28-00 (기본 DeFi 프로토콜 설계) | DEFI-02(REST→calldata 공통 패턴), DEFI-03(정책 연동), DEFI-04(비동기 상태 추적 — IAsyncStatusTracker 인터페이스, AsyncPollingService, 폴링 정책, DB 통합 마이그레이션 v23), DEFI-05(테스트 전략) 설계 산출물을 입력으로 사용 |
| v1.5 (Action Provider 프레임워크) | IActionProvider, ActionProviderRegistry, MCP Tool 자동 변환, POST /v1/actions/:provider/:action |
| m28-01/m28-02 (Jupiter/0x) | 내장 프로바이더 패턴, packages/actions/ 구조 재사용 |
| v1.4.6 (멀티체인 월렛) | Solana/EVM 양쪽 월렛 지원. 크로스체인 브릿지의 출발/도착 월렛 해석에 필요 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 브릿지 완료 시간 불확실성 | 브릿지에 따라 수 초(Across) ~ 수십 분(Wormhole) 소요. 사용자 경험 저하 | 2단계 폴링(활성 2시간 + 축소 22시간)으로 최대 24시간 추적. 알림으로 완료/실패 통보. 예상 소요시간을 견적 응답에서 추출하여 사전 안내 |
| 2 | 브릿지 실패 시 자금 "limbo" | 브릿지 중간에 실패하면 자금이 출발/도착 체인 어느 쪽에도 없을 수 있음 | DEFI-04 자동 취소 금지 원칙 적용. TIMEOUT 시에도 예약 유지. LI.FI 자체 실패 복구 메커니즘 + /status API 추적. TIMEOUT 시 Admin UI에서 운영자 수동 확인 안내 (LI.FI support 링크) |
| 3 | 크로스체인 정책 평가 복잡도 | 출발/도착 체인이 다르므로 어느 체인의 정책을 적용할지 모호 | DEFI-03 확정: 출발 체인 월렛의 정책으로 평가(자금이 나가는 쪽). 도착은 수신이므로 정책 대상 아님 |
| 4 | LI.FI API 가용성 | LI.FI 서비스 장애 시 크로스체인 기능 전체 불가 | 크로스체인은 선택 기능이므로 장애 시 에러 반환. 단일 체인 스왑(Jupiter/0x)은 독립 동작 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 3개 (공통 인프라(IAsyncStatusTracker+AsyncPollingService+DB v23+알림이벤트) 1 / LiFiActionProvider+ApiClient+BridgeStatusTracker 1 / MCP+SDK+스킬+정책연동 1) |
| 신규/수정 파일 | 18-24개 |
| 테스트 | 23-30개 |
| DB 마이그레이션 | 1건 — DEFI-04 통합 마이그레이션 v23: bridge_status(6-value CHECK) + bridge_metadata + GAS_WAITING 상태(11-state) + partial index 2개 (m28-04/m28-05 추가 마이그레이션 없음) |

---

*생성일: 2026-02-15*
*갱신일: 2026-02-24 — DEFI-04 확정 설계 반영 (불일치 7건 수정)*
*선행: m28-02 (0x EVM DEX Swap)*
*관련: LI.FI API (https://docs.li.fi/), v1.4.6 (멀티체인 월렛), DEFI-04 (비동기 상태 추적 확정 설계)*
