# Domain Pitfalls: Contract Name Resolution

**Domain:** Contract name resolution for multi-chain wallet notification system
**Researched:** 2026-03-15

## Critical Pitfalls

### Pitfall 1: EVM Address Case Sensitivity in Registry Lookup

**What goes wrong:** Well-known 컨트랙트 레지스트리에 EIP-55 checksum 주소(`0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`)로 저장했는데, 파이프라인에서 전달되는 `to` 주소가 lowercase(`0xc02aaa39...`)이면 매칭 실패. 기존 CONTRACT_WHITELIST 정책 엔진은 `c.address.toLowerCase() === contractAddress.toLowerCase()` 패턴으로 비교하지만, 신규 레지스트리 조회 코드에서 이 패턴을 누락하면 이름 해석이 실패한다.

**Why it happens:** EVM 주소는 3가지 형태가 공존한다: (1) EIP-55 checksum mixed-case, (2) all-lowercase, (3) all-uppercase. viem은 기본적으로 getAddress()로 checksum 변환하지만, 파이프라인 내부의 `req.to`는 사용자 입력 그대로 전달될 수 있다. Solana 주소는 Base58로 case-sensitive이므로 EVM과 동일한 정규화 로직을 적용하면 오히려 매칭이 깨진다.

**Consequences:** CONTRACT_CALL 알림에서 Uniswap Router 같은 well-known 컨트랙트가 raw 주소로 표시됨. 사용자 경험 손상. 간헐적이라 테스트에서 놓치기 쉬움 (테스트가 항상 동일 형태 주소를 사용하므로).

**Prevention:**
- 레지스트리 키를 **항상 lowercase**로 저장하고, 조회 시 EVM 주소는 `.toLowerCase()` 적용
- Solana 주소는 Base58 그대로 exact match (대소문자 구분 필수)
- 체인 타입 판별 후 정규화 함수를 분기: `normalizeForLookup(address, chain)`
- 테스트에 checksum/lowercase/uppercase 3가지 변형 포함

**Detection:** `to_display` 변수가 raw 주소로 채워지는 비율 모니터링. Well-known 주소인데 이름이 해석되지 않으면 경고.

---

### Pitfall 2: Notification Template Backward Compatibility 파괴

**What goes wrong:** 기존 알림 템플릿 `{to}` 변수에 raw 주소가 들어가던 것을 `to_display` 변수로 교체하면서, 기존 템플릿을 업데이트하지 않거나 i18n 양쪽(en/ko) 중 하나만 수정하면 한쪽 언어에서 변수가 미치환 상태로 남는다.

**Why it happens:** 현재 `getNotificationMessage()`는 미치환 placeholder를 빈 문자열로 대체하는 safety net이 있지만, 허용 리스트가 `['{display_amount}', '{type}', '{amount}', '{to}']` 로 하드코딩되어 있다. `{to_display}` 같은 신규 변수를 이 리스트에 추가하지 않으면, 미치환 시 `{to_display}`가 알림 본문에 그대로 노출된다.

**Consequences:** 사용자에게 `{to_display}`라는 raw placeholder 텍스트가 알림으로 전송됨. 프로페셔널하지 못한 인상. 특히 Telegram/Discord 등 외부 채널에 노출되면 즉시 사용자 불만.

**Prevention:**
- 신규 변수 `to_display`를 message-templates.ts의 fallback placeholder 리스트에 반드시 추가
- en.ts, ko.ts 양쪽 모두 동일한 변수 업데이트 (TypeScript `Messages` 인터페이스가 키 parity를 강제하므로 title/body 내부 변수까지는 검증 불가)
- 변수 치환 후 `{...}` 패턴이 남아있으면 경고 로그를 남기는 방어 코드 추가
- 알림 관련 4개 이벤트(TX_REQUESTED, TX_APPROVAL_REQUIRED, TX_SUBMITTED, TX_CONFIRMED) 모두에 대해 테스트에서 `to_display` 포함 여부 검증

**Detection:** 알림 본문에 `{` 문자가 포함된 채로 전송되면 notification_logs에서 감지 가능.

---

### Pitfall 3: Action Provider Metadata 매핑 누락으로 1순위 해석 실패

**What goes wrong:** Action Provider의 `metadata.name`은 `jupiter_swap`, `aave_v3_lending` 같은 snake_case 내부 식별자인데, 이것을 사용자에게 보여줄 `displayName`(예: "Jupiter", "Aave V3")으로 변환하는 매핑이 불완전하면 1순위(비용 0) 해석이 대부분의 프로바이더에서 실패하고 Well-known 레지스트리로 fallback된다.

**Why it happens:** 현재 `ActionProviderMetadataSchema`에 `displayName` 필드가 없다. `name` 필드만 존재하고, 이는 regex `/^[a-z][a-z0-9_]*$/`로 제한되어 사람이 읽기 어려운 형태다. displayName 추가는 스키마 변경이므로 모든 기존 프로바이더(20+개) 메타데이터를 업데이트해야 한다.

**Consequences:** displayName이 없는 프로바이더는 `jupiter_swap` 같은 내부 이름이 그대로 노출되거나, 무조건 Well-known 레지스트리로 fallback. Action Provider 메타데이터 활용이라는 핵심 가치 훼손.

**Prevention:**
- `displayName`을 optional 필드로 추가 (`.optional().default(undefined)`)하여 기존 프로바이더 호환성 유지
- displayName이 없으면 `name`에서 자동 변환하는 유틸리티: `jupiter_swap` -> `Jupiter Swap`
- 기존 20+개 프로바이더에 displayName을 일괄 추가하는 것을 별도 phase로 분리하지 말 것 -- 같은 phase에서 처리해야 누락 방지
- 프로바이더 등록 시 displayName 누락 경고 로그

**Detection:** Action Provider 경유 CONTRACT_CALL인데 `to_display`가 Well-known 또는 Whitelist 레벨에서 해석되면, Action Provider 매핑 누락 신호.

---

### Pitfall 4: ContractNameResolver에서 동기/비동기 혼합으로 알림 지연

**What goes wrong:** 알림 파이프라인(`notify()`)은 fire-and-forget 패턴으로 동작하지만, 변수 준비(`vars`)는 Stage 1(TX_REQUESTED) 시점에서 동기적으로 수행된다. ContractNameResolver가 RPC 호출이나 비동기 레지스트리 조회를 포함하면 파이프라인 전체가 블로킹된다.

**Why it happens:** 현재 `stages.ts`에서 TX_REQUESTED 알림의 vars는 `formatNotificationAmount()` 등 동기 함수로 즉시 구성된다. 4단계 우선순위 해석 중 Action Provider/Well-known/Whitelist는 모두 인메모리이므로 동기 가능하지만, Fallback 단계에서 on-chain 조회를 추가하면 비동기가 된다.

**Consequences:** 파이프라인 Stage 1에서 예상치 못한 지연 발생. 특히 RPC 호출이 실패하거나 타임아웃되면 전체 트랜잭션 처리가 블로킹됨. 현재 설계에서 `void ctx.notificationService?.notify(...)` 패턴은 fire-and-forget이므로 알림 자체는 블로킹하지 않지만, **변수 준비가 동기적으로 파이프라인 내에서 수행**된다면 문제.

**Prevention:**
- ContractNameResolver는 순수 인메모리 조회만 수행 (RPC 호출 절대 금지)
- 4단계 우선순위 중 Action Provider/Well-known/Whitelist 3단계만 구현, Fallback은 축약 주소
- 해석 함수 시그니처를 `resolve(address, chain): string` 동기 함수로 강제
- 미래에 on-chain 해석이 필요하면 background job으로 캐시 선행 적재

**Detection:** Stage 1 소요 시간 모니터링. 1ms 이상이면 비동기 호출 혼입 가능성.

## Moderate Pitfalls

### Pitfall 5: Well-known 레지스트리 체인별 주소 중복/불일치

**What goes wrong:** 동일 프로토콜(예: USDC)이 5개 EVM 체인에서 서로 다른 컨트랙트 주소를 가진다. 레지스트리 키를 `address`만으로 하면, 체인 A의 Uniswap Router 주소가 체인 B에서는 전혀 다른 컨트랙트일 수 있다. 잘못된 이름 표시는 raw 주소보다 더 위험하다.

**Why it happens:** 프로토콜 배포 주소는 체인마다 다르다 (CREATE2로 동일 주소를 달성하는 프로토콜도 있지만 소수). 단순한 `Map<address, name>` 구조로는 체인 구분 불가.

**Consequences:** Polygon의 SushiSwap Router 주소가 Ethereum에서는 전혀 다른 컨트랙트인데, "SushiSwap" 으로 표시됨. 잘못된 정보 제공은 미표시보다 심각.

**Prevention:**
- 레지스트리 키를 `{chain}:{lowercaseAddress}` 복합 키로 설계
- 체인 파라미터 없이 조회 불가능하도록 API 강제
- CREATE2 동일 주소 프로토콜은 별도 `universalContracts` 섹션으로 분리하되, 체인별 검증 후에만 사용
- 테스트에서 각 체인별 독립 조회 검증

### Pitfall 6: Well-known 레지스트리 300+ 엔트리 유지보수 부담

**What goes wrong:** 정적 TS 데이터로 300+ 컨트랙트를 관리하면, 프로토콜 업그레이드(새 Router 주소 배포) 시 레지스트리가 outdated 되지만 데몬 업데이트 전까지 반영 불가.

**Why it happens:** DeFi 프로토콜은 주기적으로 새 버전을 배포한다 (Uniswap V2 -> V3 -> V4, Aave V2 -> V3). 정적 데이터는 코드 릴리스 주기에 묶인다.

**Consequences:** 사용자가 최신 프로토콜 버전을 사용하는데 이름이 해석되지 않음. 또는 deprecated 버전 주소에 현재 이름 표시.

**Prevention:**
- 레지스트리 엔트리에 `version` 필드 포함 (예: "Uniswap V3 Router")
- 기존 Action Provider가 이미 지원하는 프로토콜은 Action Provider 메타데이터가 1순위이므로, Well-known은 Action Provider가 커버하지 않는 외부 프로토콜만 포함
- deprecated 프로토콜 주소도 유지 (이전 버전 트랜잭션에도 이름 표시)
- 실제 WAIaaS가 지원하는 프로토콜 위주로 초기 데이터 축소 (300+ -> 필수 ~100)

### Pitfall 7: Solana Program ID 특수 처리 누락

**What goes wrong:** Solana의 "컨트랙트 주소"는 Program ID(Base58 인코딩)이며, EVM의 `to` 필드와는 의미가 다르다. Solana 트랜잭션의 `to` 필드에 들어가는 값은 수신 주소이지 Program ID가 아닐 수 있다. Program ID를 어디서 추출할지 정의하지 않으면 Solana에서 이름 해석이 전혀 동작하지 않는다.

**Why it happens:** EVM에서 CONTRACT_CALL의 `to`는 컨트랙트 주소이지만, Solana에서 "컨트랙트" 개념은 Program Account이며, 트랜잭션 구조가 다르다. 현재 `extractTransactionParam()`에서 CONTRACT_CALL은 `req.to`를 사용하는데, Solana Action Provider 트랜잭션에서 이 값이 Program ID와 일치하는지 검증이 필요하다.

**Consequences:** Solana 체인에서 Well-known 프로그램(Jupiter, Raydium, Marinade 등)의 이름이 해석되지 않음.

**Prevention:**
- Solana Action Provider 경유 트랜잭션은 이미 `actionProvider` 필드가 설정되므로 1순위(Action Provider displayName)에서 해석 가능
- Well-known 레지스트리에 Solana System Program, Token Program, Associated Token Program 등 핵심 프로그램만 포함
- 알림 변수에서 Solana CONTRACT_CALL의 `to`가 Program ID인지 수신 주소인지 구분하는 로직 추가

### Pitfall 8: Admin UI 트랜잭션 목록 성능 저하

**What goes wrong:** Admin UI 트랜잭션 목록에서 각 행마다 ContractNameResolver를 호출하면, 대량 트랜잭션(100+건 페이지)에서 렌더링 지연. 특히 같은 컨트랙트에 대해 반복 조회하는 비효율.

**Why it happens:** 트랜잭션 목록은 페이지네이션으로 20-50건씩 로드하지만, 각 행의 `to` 필드에 대해 개별적으로 이름 해석을 수행하면 불필요한 반복 연산.

**Consequences:** Admin UI 트랜잭션 페이지 로딩 시간 증가. 사용자 체감 성능 저하.

**Prevention:**
- 서버 측에서 트랜잭션 목록 API 응답에 `toDisplay` 필드를 포함하여 반환 (클라이언트 해석 불필요)
- 또는 클라이언트에서 해석하려면, 페이지 내 고유 주소 목록을 추출하여 일괄 해석 후 Map으로 캐싱
- DB에 해석 결과를 저장하지 않음 (레지스트리 업데이트 시 stale 데이터 문제)

### Pitfall 9: `to_display`와 `to` 변수의 혼용

**What goes wrong:** 알림 템플릿에서 `{to}`(raw 주소)와 `{to_display}`(해석된 이름)를 동시에 사용할 때, 어떤 이벤트에는 `to`만, 어떤 이벤트에는 `to_display`만, 어떤 이벤트에는 둘 다 넣어야 하는 규칙이 불명확해져 일관성이 깨진다.

**Why it happens:** TX_REQUESTED/TX_APPROVAL_REQUIRED는 `{to}` 변수를 이미 사용 중이다. `{to_display}`를 추가하면 `{to}`를 제거할지, 둘 다 유지할지 결정이 필요하다.

**Consequences:** 템플릿 변수가 과도하게 많아지고, 채널별(Telegram/Slack/Discord/ntfy) 포맷에서 레이아웃 깨짐.

**Prevention:**
- `{to}` 변수를 유지하되, 값 자체를 "해석된 이름 (축약 주소)" 형태로 교체: `"Uniswap V3 (0xE592...a085)"`
- 신규 `{to_display}` 변수 추가 대신 기존 `{to}` 변수의 값 생성 로직만 변경
- 이름 해석 실패 시 기존 동작 유지 (축약 주소 또는 raw 주소)
- 이 접근이 기존 템플릿 변경을 최소화하고 backward compatibility를 자연스럽게 유지

## Minor Pitfalls

### Pitfall 10: Well-known 레지스트리 데이터 정확성

**What goes wrong:** 수동으로 300+ 주소-이름 매핑을 입력하면서 오타, 잘못된 주소, 잘못된 체인 매핑이 포함됨.

**Prevention:**
- 신뢰할 수 있는 소스(Etherscan verified contracts, DeFiLlama protocol list)에서 데이터 추출
- 각 주소에 대해 checksum 검증 (viem `getAddress()` 호출 후 원본과 비교)
- CI 테스트에서 주소 형식 유효성 + 중복 검사

### Pitfall 11: BATCH 트랜잭션의 `to` 필드 다중 대상

**What goes wrong:** BATCH 트랜잭션은 여러 `to` 주소를 가진다. 단일 `to_display` 변수로는 표현 불가.

**Prevention:**
- BATCH의 경우 첫 번째 대상만 해석하거나, "N contracts" 형태로 요약
- 또는 `to_display`에 "Uniswap V3 + 2 others" 패턴 적용
- BATCH는 별도 알림 포맷이므로 `{to}` 변수 자체를 사용하지 않을 수 있음 (현재 템플릿 확인 필요)

### Pitfall 12: HyperEVM Chain ID 매핑

**What goes wrong:** HyperEVM (Chain ID 999/998)은 최근 추가된 체인이라 Well-known 컨트랙트 데이터가 부족. 레지스트리에 빈 엔트리로 남으면 HyperEVM CONTRACT_CALL은 항상 fallback 표시.

**Prevention:**
- HyperEVM은 Hyperliquid L1 DEX 전용이므로 Action Provider 매핑으로 충분 (Perp/Spot/SubAccount 프로바이더가 커버)
- Well-known 레지스트리에 HyperEVM 전용 엔트리를 무리하게 추가하지 않음
- Action Provider 1순위 해석이 HyperEVM에서 특히 중요함을 테스트로 검증

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| ContractNameResolver 설계 | 동기/비동기 혼합 (Pitfall 4) | 인메모리 전용 동기 함수로 강제 |
| Well-known 레지스트리 구축 | 체인별 주소 중복 (Pitfall 5) + 데이터 정확성 (Pitfall 10) | 복합 키 + CI 검증 |
| 알림 파이프라인 연동 | Template backward compat (Pitfall 2) + 변수 혼용 (Pitfall 9) | `{to}` 값 교체 방식 채택, en/ko 동시 업데이트 |
| Action Provider displayName | 매핑 누락 (Pitfall 3) | optional + 자동 변환 fallback |
| Admin UI 트랜잭션 목록 | 성능 (Pitfall 8) | 서버 측 toDisplay 포함 |
| 주소 정규화 | EVM/Solana 혼합 (Pitfall 1, 7) | 체인별 분기 정규화 함수 |

## Sources

- 프로젝트 코드 분석: `packages/daemon/src/pipeline/stages.ts` (알림 변수 준비 패턴)
- 프로젝트 코드 분석: `packages/daemon/src/notifications/templates/message-templates.ts` (placeholder fallback)
- 프로젝트 코드 분석: `packages/core/src/i18n/en.ts` (TX_REQUESTED/TX_APPROVAL_REQUIRED 등 변수 사용)
- 프로젝트 코드 분석: `packages/daemon/src/pipeline/database-policy-engine.ts` (CONTRACT_WHITELIST lowercase 비교 패턴)
- 프로젝트 코드 분석: `packages/core/src/interfaces/action-provider.types.ts` (ActionProviderMetadataSchema, displayName 부재)
- 프로젝트 코드 분석: `packages/core/src/schemas/policy.schema.ts` (ContractWhitelistRulesSchema name 필드)
- EIP-55 checksum address specification (HIGH confidence -- well-established standard)
- Solana Base58 address format (HIGH confidence -- well-established standard)
