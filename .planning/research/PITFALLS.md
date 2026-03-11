# Domain Pitfalls

**Domain:** External Action Framework -- WAIaaS ActionProvider 확장 (on-chain tx-centric -> action-centric)
**Researched:** 2026-03-11
**Overall confidence:** HIGH (코드베이스 직접 분석 기반)

---

## Critical Pitfalls

리팩토링/재작성을 유발하는 심각한 실수들.

---

### Pitfall 1: resolve() 반환 타입 확장 시 기존 13개 Provider 하위 호환성 파괴

**What goes wrong:** `IActionProvider.resolve()`의 반환 타입을 `ContractCallRequest | ContractCallRequest[] | ApiDirectResult`에서 `ResolvedAction`으로 변경할 때, 기존 13개 프로바이더의 resolve() 구현이 컴파일 에러를 내거나, `ActionProviderRegistry.executeResolve()`의 re-validation 로직(`ContractCallRequestSchema.parse()`)이 새 타입을 거부한다.

**Why it happens:**
- 현재 `executeResolve()`는 `isApiDirectResult()` 체크 후 나머지를 모두 `ContractCallRequestSchema.parse()`로 검증한다 (line 202-228, action-provider-registry.ts). 새 `SignedDataAction`이나 `SignedHttpAction`이 이 경로에 들어가면 Zod parse 에러.
- `ContractCallRequest`에 `kind?: 'contractCall'` optional 필드를 추가하면, 기존 Zod 스키마가 unknown key를 strip하는 `.strict()` 모드가 아닌지에 따라 동작이 달라진다.
- 기존 프로바이더 13개 + ESM 플러그인 로더(`loadPlugins()`)를 통해 로드되는 외부 플러그인도 있을 수 있다.

**Consequences:**
- 13개 프로바이더 전체 컴파일 실패 또는 런타임 Zod validation 에러
- 7,400+ 테스트 중 ActionProvider 관련 수백 건이 일제히 실패
- ESM 플러그인 호환성 파괴 (사용자 플러그인까지 영향)

**Prevention:**
1. `resolve()` 반환 타입을 `ContractCallRequest | ContractCallRequest[] | ApiDirectResult | SignedDataAction | SignedHttpAction`로 union 확장 (기존 타입 그대로 유지)
2. `executeResolve()`에서 `kind` 기반 분기를 `isApiDirectResult()` 체크 앞에 배치하지 말고, **기존 분기 순서를 유지**하면서 새 kind 체크를 추가: `isApiDirectResult()` -> `isSignedDataAction()` -> `isSignedHttpAction()` -> 기존 ContractCallRequest 경로
3. `kind` 필드 정규화는 registry 내부에서만 수행, 기존 프로바이더는 kind 없이 반환해도 `contractCall`로 자동 태깅
4. 기존 13개 프로바이더 파일을 **한 줄도 수정하지 않고** 전체 테스트가 통과하는 것을 첫 번째 검증 게이트로 설정

**Detection:** CI에서 기존 프로바이더 테스트가 한 건이라도 실패하면 타입 확장이 잘못된 것.

**Phase recommendation:** 타입 시스템 설계 (R1) 단계에서 반드시 하위 호환 전략을 먼저 확정.

---

### Pitfall 2: CredentialVault와 SettingsService의 암호화 키 파생 충돌

**What goes wrong:** CredentialVault가 기존 `settings-crypto.ts`의 `deriveSettingsKey()` (HKDF SHA-256)를 "재사용"한다고 하면서, 동일한 마스터 패스워드에서 동일한 키를 파생하면 **SettingsService와 CredentialVault의 암호화된 값이 같은 키로 보호**되어, 한쪽 키가 유출되면 다른 쪽도 자동 노출된다. 반대로, 다른 context/salt를 사용하면 "재사용"이 아니라 "새 파생"이므로 re-encrypt 경로(`re-encrypt.ts`)와의 정합성이 깨진다.

**Why it happens:**
- 현재 `deriveSettingsKey()`는 HKDF에 고정 info 문자열을 사용한다. CredentialVault가 같은 함수를 호출하면 동일 키.
- `re-encrypt.ts`는 마스터 패스워드 변경 시 모든 암호화된 설정을 재암호화한다. CredentialVault 테이블이 여기에 포함되지 않으면 패스워드 변경 후 credential 복호화 불가.
- `BackupService`도 encrypted backup/restore 시 settings 테이블만 고려할 수 있다.

**Consequences:**
- 마스터 패스워드 변경 후 CredentialVault의 모든 credential 복호화 불가 (데이터 손실)
- 또는 보안 분리 실패 (같은 키로 두 저장소 보호)
- backup/restore 시 credential 누락

**Prevention:**
1. `deriveSettingsKey()`에 **context 파라미터**를 추가하여 HKDF info를 `'waiaas-settings'` / `'waiaas-credentials'`로 분리 (같은 마스터 패스워드, 다른 파생 키)
2. `re-encrypt.ts`에 CredentialVault 테이블 재암호화 로직을 **반드시** 추가
3. `BackupService`에 `wallet_credentials` 테이블 포함 확인
4. 마스터 패스워드 변경 -> CredentialVault 재암호화 통합 테스트 작성

**Detection:** 마스터 패스워드 변경 후 credential 조회 테스트가 실패하면 즉시 발견 가능.

**Phase recommendation:** CredentialVault 설계 (R3) 단계에서 키 파생 전략을 명확히 정의, 구현 시 re-encrypt 통합을 첫 번째 작업으로.

---

### Pitfall 3: 파이프라인 라우팅에서 정책 평가 누락 (off-chain action이 정책 우회)

**What goes wrong:** `SignedDataAction`과 `SignedHttpAction`이 기존 6-stage pipeline을 우회하는 새 경로로 라우팅되면서, Stage 3 정책 평가(DatabasePolicyEngine)를 거치지 않는다. 에이전트가 off-chain order (CEX 출금 등)를 정책 검증 없이 실행하게 된다.

**Why it happens:**
- 기존 pipeline은 `stage3EvaluatePolicy()`에서 `TransactionParam`을 구성하여 `DatabasePolicyEngine.evaluate()`를 호출한다. `TransactionParam`은 `type`, `amount`, `toAddress`, `chain` 등 **on-chain tx 전용 필드**로 구성되어 있다.
- `SignedDataAction`은 `toAddress`가 없을 수 있고 (EIP-712 order는 컨트랙트가 아닌 API에 제출), `amount`도 token amount가 아닌 notional USD일 수 있다.
- 새 라우팅 경로를 만들면서 "정책은 나중에 연결하자"라고 생각하면 그 "나중"이 오지 않는다.

**Consequences:**
- off-chain action이 SPENDING_LIMIT, RATE_LIMIT, APPROVAL 정책을 모두 우회
- 에이전트가 정책 없이 CEX 출금, 대량 주문 실행 가능
- 보안 모델의 근본적 무효화

**Prevention:**
1. 새 파이프라인 경로에도 **반드시 정책 평가 단계를 포함** (기존 stage3와 별도 함수라도 같은 DatabasePolicyEngine 호출)
2. `TransactionParam`을 확장하되, off-chain 전용 필드를 optional로 추가 (`venue?`, `actionCategory?`, `notionalUsd?`)
3. **정책 평가 없이 서명에 도달하는 경로가 있으면 테스트가 실패하도록** 통합 테스트 설계
4. 기존 `provider-trust` 정책 우회 패턴도 off-chain action에 동일하게 적용

**Detection:** off-chain action 실행 경로에서 `policyEngine.evaluate()` 호출이 없으면 코드 리뷰에서 즉시 차단.

**Phase recommendation:** R5 (정책 컨텍스트 확장) 설계 완료 전에 R6 (파이프라인 라우팅) 설계를 시작하지 말 것.

---

### Pitfall 4: ISignerCapability가 기존 서명 경로를 "대체"하려다 이중 경로 발생

**What goes wrong:** ISignerCapability 통합 인터페이스를 만들면서, 기존 `IChainAdapter.signTransaction()`, `sign-message.ts`, `http-message-signer.ts` 경로를 ISignerCapability 호출로 전환하려고 시도한다. 기존 경로가 20+ 곳에서 직접 참조되고 있어 전면 교체는 불가능하고, 결국 두 가지 서명 경로가 공존하면서 어느 쪽으로 호출해야 하는지 혼란이 발생한다.

**Why it happens:**
- 현재 서명 호출이 분산되어 있다: `stage5Execute()`에서 `adapter.signTransaction()`, sign-message API에서 직접 서명, ERC-8128 모듈에서 독립 서명
- 이들을 ISignerCapability로 래핑하면 어댑터 패턴이 되지만, 기존 호출 사이트가 ISignerCapability를 알지 못한다
- objective 문서 R2-6이 명확히 "기존 경로는 변경하지 않음"이라고 했지만, 구현 시 DRY 유혹에 빠져 기존 경로를 교체하려는 시도가 발생

**Consequences:**
- 기존 6-stage pipeline, sign-only, sign-message API가 깨짐
- 서명 실패 시 어느 경로에서 실패했는지 디버깅 불가
- WalletConnect, Telegram Bot 등 approval workflow와의 연동 장애

**Prevention:**
1. **R2-6 원칙을 엄격히 준수**: ISignerCapability는 **새 ActionProvider 경로에서만** 사용
2. 기존 4종 signer를 ISignerCapability로 래핑하되, 래핑은 **delegation** (기존 모듈을 내부적으로 호출), 기존 모듈의 코드는 변경하지 않음
3. 기존 서명 호출 사이트를 grep으로 모두 찾아서 "이 파일은 수정 금지" 목록에 등록
4. 코드 리뷰 체크리스트에 "기존 sign-message.ts / stages.ts의 서명 호출이 변경되지 않았는가?" 항목 추가

**Detection:** 기존 sign-message, sign-only, ERC-8128 테스트가 한 건이라도 실패하면 경로 침범.

**Phase recommendation:** R2 (ISignerCapability) 설계 시 "기존 경로와의 경계"를 아키텍처 다이어그램으로 명시.

---

### Pitfall 5: transactions 테이블 확장 vs 별도 테이블 결정 지연

**What goes wrong:** off-chain action의 DB 기록을 어디에 저장할지 (기존 `transactions` 테이블 확장 vs 별도 `external_actions` 테이블) 결정을 미루다가, 파이프라인 라우팅과 정책 평가가 `transactions` 테이블을 전제로 구현되어 나중에 변경이 불가능해진다.

**Why it happens:**
- 기존 시스템에서 `transactions` 테이블은 모든 곳에서 참조된다: 정책의 SPENDING_LIMIT (rolling window query), Audit Log, Admin UI, SDK/MCP 응답, AsyncPollingService의 `bridge_status` 컬럼
- 새 off-chain action을 `transactions`에 넣으면 `txHash`가 null인 행이 생기고, 기존 쿼리(`WHERE txHash IS NOT NULL` 등)가 오동작
- 별도 테이블로 만들면 SPENDING_LIMIT 누적 계산에 두 테이블을 JOIN해야 하고, Admin UI 트랜잭션 목록에 off-chain action이 안 보인다

**Consequences:**
- 결정 지연 시 양쪽 모두에 대한 코드가 혼재되어 마이그레이션 불가
- `txHash NOT NULL` 가정이 있는 기존 코드에서 null reference 에러
- SPENDING_LIMIT 정책이 off-chain 지출을 누락하여 한도 우회

**Prevention:**
1. **설계 단계에서 확정**: `transactions` 테이블에 `kind` 컬럼 추가 (default `'on-chain'`), off-chain action도 같은 테이블에 저장하되 `txHash` nullable 허용
2. `txHash IS NOT NULL` 가정이 있는 기존 쿼리를 모두 찾아서 (`grep txHash`) 영향 범위 산정
3. SPENDING_LIMIT rolling window가 `kind` 무관하게 합산되도록 설계
4. Admin UI 트랜잭션 목록에 `kind` 필터 추가
5. DB migration v55에서 `kind` 컬럼 + CHECK constraint 추가

**Detection:** `txHash` null인 행이 삽입될 때 기존 코드의 NOT NULL 가정이 깨지는지 테스트.

**Phase recommendation:** R6 (파이프라인 라우팅) 설계에서 DB 기록 전략을 첫 번째 설계 결정으로 확정.

---

## Moderate Pitfalls

실수하면 상당한 수정 작업이 필요하지만 재작성까지는 아닌 것들.

---

### Pitfall 6: CredentialVault의 인증 모델 혼란 (sessionAuth vs masterAuth 스코프)

**What goes wrong:** CredentialVault는 per-wallet credential이므로 sessionAuth로 CRUD가 가능해야 하지만, 같은 wallet에 대해 Admin(masterAuth)도 credential을 관리할 수 있어야 한다. 두 인증 경로가 같은 데이터를 수정할 때 race condition이 발생하거나, sessionAuth 사용자가 Admin이 설정한 credential을 삭제할 수 있다.

**What goes wrong (detail):**
- 현재 SettingsService는 masterAuth 전용이므로 인증 충돌이 없다
- CredentialVault는 sessionAuth + masterAuth 모두 허용 (R3-7)
- "에이전트가 자신의 CEX API key를 등록"하면서 "Admin이 같은 wallet의 credential을 override"하는 시나리오

**Prevention:**
1. credential에 `createdBy` 필드 추가 (`session:{sessionId}` / `admin`)
2. sessionAuth는 자신이 생성한 credential만 삭제/수정 가능, Admin은 전체 가능
3. 동시 수정 방지를 위해 `updatedAt` 기반 optimistic locking 또는 `BEGIN IMMEDIATE` 사용

**Phase recommendation:** R3 설계 시 인증 매트릭스를 명시적으로 정의.

---

### Pitfall 7: AsyncPollingService의 off-chain 상태 확장이 기존 bridge_status 폴링을 방해

**What goes wrong:** `AsyncPollingService`가 30초 주기로 `bridge_status = 'PENDING'`인 트랜잭션을 조회하여 폴링한다. off-chain action 상태(PARTIALLY_FILLED, FILLED 등)를 같은 메커니즘에 추가하면 폴링 쿼리가 복잡해지고, 상태 전이 로직이 꼬인다.

**Why it happens:**
- 현재 `AsyncPollingService`는 `trackers` Map에서 tracker 이름으로 분기한다
- off-chain action의 상태 전이 (`PARTIALLY_FILLED -> FILLED -> SETTLED`)는 bridge와 다른 state machine
- 같은 `bridge_status` 컬럼에 off-chain 상태를 넣으면 의미가 혼재

**Prevention:**
1. `transactions` 테이블에 `async_status` 컬럼을 `bridge_status`와 **별도로** 추가하거나, 기존 `bridge_status`를 `async_status`로 rename하고 마이그레이션
2. `AsyncPollingService`의 쿼리를 tracker별로 분리 (각 tracker가 자신의 pending 목록을 쿼리)
3. state machine을 tracker 구현체 내부에 캡슐화, `AsyncPollingService`는 `checkStatus()` 결과만 소비

**Phase recommendation:** R4 설계에서 상태 저장 전략을 bridge_status 재사용 vs 새 컬럼으로 확정.

---

### Pitfall 8: Zod discriminatedUnion 스키마 확장 시 기존 8-type union과 충돌

**What goes wrong:** 기존 `TransactionRequestSchema`는 `type` 필드로 8종 discriminatedUnion을 구성한다 (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH, SIGN, X402_PAYMENT, NFT_TRANSFER). 새로운 `ResolvedAction` union은 `kind` 필드로 분기한다. 두 union이 파이프라인에서 교차할 때 타입 추론이 실패한다.

**Why it happens:**
- `type` (transaction 종류)과 `kind` (action resolution 종류)가 다른 차원의 분류인데, 같은 객체에 공존
- ContractCallRequest가 `type: 'CONTRACT_CALL'`이면서 `kind: 'contractCall'`을 가지면 이중 분류
- TypeScript의 discriminatedUnion은 하나의 discriminant만 잘 처리한다

**Prevention:**
1. **`kind`는 ResolvedAction 레벨에서만 사용**, ContractCallRequest 내부에서는 기존 `type` 유지
2. `kind` 정규화는 ActionProviderRegistry 내부에서만 수행, 파이프라인에 전달할 때는 이미 분기 완료
3. `PipelineContext`에 `resolvedActionKind` 필드를 추가하여 kind 정보를 전달하되, request 객체 자체는 변경하지 않음
4. Zod 스키마 테스트에서 기존 8-type 모두가 여전히 parse 성공하는지 검증

**Phase recommendation:** R1 설계의 핵심 결정 -- `kind`와 `type`의 관계를 명확히 분리.

---

### Pitfall 9: requiresSigningKey 패턴 확장 시 private key 노출 범위 증가

**What goes wrong:** 현재 `requiresSigningKey: true`인 프로바이더 (Hyperliquid)에만 `ActionContext.privateKey`가 전달된다. 새 off-chain signing (HMAC, RSA 등)을 위해 더 많은 프로바이더에 `requiresSigningKey: true`를 설정하면, private key 노출 범위가 넓어진다.

**Why it happens:**
- HMAC signing에는 wallet의 private key가 아니라 **credential의 HMAC secret**이 필요하다
- 하지만 `requiresSigningKey`라는 이름이 "private key 필요"를 암시하여, HMAC provider도 같은 플래그를 사용하려는 유혹
- credential-based signing과 wallet key signing의 구분이 모호해진다

**Prevention:**
1. **ISignerCapability가 필요한 키를 결정**: `Eip712SignerCapability`는 wallet private key, `HmacSignerCapability`는 CredentialVault에서 HMAC secret을 조회
2. `requiresSigningKey`는 wallet private key 전용으로 유지, credential 기반 서명은 `credentialRef` 경로로 분리
3. 새 `requiresCredential: true` 메타데이터 플래그를 별도 추가 (CredentialVault 조회 트리거)
4. private key는 기존처럼 resolve() 직후 즉시 clear

**Phase recommendation:** R2 + R3 설계를 함께 진행하여 키/credential 조회 경로를 한 번에 정리.

---

### Pitfall 10: connect-info 자기 발견 엔드포인트의 capability 확장 누락

**What goes wrong:** 새 SignedDataAction, SignedHttpAction capability가 `GET /v1/connect-info` 응답에 반영되지 않아, 에이전트가 off-chain action 가능 여부를 사전에 파악할 수 없다.

**Why it happens:**
- connect-info는 각 기능 추가 시 수동으로 capability를 추가해야 한다
- off-chain action이 "기존 action 경로의 확장"이라서 별도 capability가 필요 없다고 착각

**Prevention:**
1. connect-info에 `externalActions: { signingSchemes: [...], credentialTypes: [...] }` capability 추가
2. CredentialVault에 credential이 있는 venue 목록도 포함
3. skill file 업데이트 (CLAUDE.md 규칙: "REST API 변경 시 skills/ 파일 업데이트 필수")

**Phase recommendation:** R6 설계 시 connect-info 확장을 명시적 요구사항으로 포함.

---

### Pitfall 11: ESM 플러그인 로더가 새 ResolvedAction 타입을 모르는 외부 플러그인과 충돌

**What goes wrong:** `ActionProviderRegistry.loadPlugins()`는 `~/.waiaas/actions/`에서 ESM 플러그인을 로드한다. 외부 플러그인이 기존 `ContractCallRequest`만 반환하도록 작성되어 있는데, `executeResolve()`의 분기 로직이 변경되면 예기치 않은 동작이 발생한다.

**Prevention:**
1. `executeResolve()`의 기존 분기 순서를 유지: `isApiDirectResult()` -> 새 kind 체크 -> 기존 ContractCallRequest 경로
2. kind가 없는 반환값은 항상 ContractCallRequest로 취급 (현재 동작 유지)
3. 플러그인 개발 가이드에 새 ResolvedAction 타입 사용법 문서화

**Phase recommendation:** R1 구현 완료 후 ESM 플러그인 호환성 테스트 추가.

---

## Minor Pitfalls

주의하면 쉽게 피할 수 있지만 빠뜨리기 쉬운 것들.

---

### Pitfall 12: Admin UI에 off-chain action 표시 누락

**What goes wrong:** Admin UI의 Transactions 페이지가 on-chain tx만 표시하도록 설계되어 있어, off-chain action이 관리자에게 보이지 않는다. Credentials 탭도 추가해야 하는데 잊어버린다.

**Prevention:**
1. Transactions 목록에 `kind` 필터 + off-chain action 전용 표시 (txHash 대신 externalId)
2. Wallet 상세에 Credentials 탭 추가 (R3-8)
3. Admin UI 변경 체크리스트에 포함

---

### Pitfall 13: MCP 도구 / SDK 메서드 확장 누락

**What goes wrong:** off-chain action이 REST API로만 접근 가능하고 MCP/SDK에서 사용할 수 없다.

**Prevention:**
1. 기존 action 실행 도구(`execute_action`)가 off-chain action도 처리하도록 확장
2. credential 관리 MCP 도구 추가 (create/list/delete)
3. SDK에 credential CRUD 메서드 추가
4. skill file 업데이트

---

### Pitfall 14: HMAC/RSA signer에서 타이밍 공격 취약

**What goes wrong:** HMAC-SHA256 서명 검증 시 일반 문자열 비교를 사용하면 타이밍 공격에 취약하다. RSA-PSS 서명 생성 시 잘못된 padding 모드를 사용하면 보안이 약화된다.

**Prevention:**
1. HMAC 비교는 `crypto.timingSafeEqual()` 사용
2. RSA는 PSS padding만 허용 (PKCS#1 v1.5 금지)
3. 기존 `sodium-native` 라이브러리의 constant-time 비교 함수 활용

---

### Pitfall 15: credential 만료 시 진행 중인 action이 실패

**What goes wrong:** CredentialVault의 credential에 `expiresAt`이 있는데, action resolve() 시점에는 유효하지만 실제 서명/제출 시점에는 만료되어 실패한다.

**Prevention:**
1. credential 조회 시 TTL 여유분 체크 (만료 5분 전이면 경고)
2. action 실행 전 credential 유효성 사전 검증
3. 만료 임박 credential에 대한 알림 (NotificationService 연동)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| R1 (ResolvedAction 타입) | 기존 13개 프로바이더 하위 호환 파괴 (Pitfall 1) | kind 정규화를 registry 내부에서만 수행, 기존 프로바이더 코드 무변경 |
| R1 (Zod 스키마) | kind-type 이중 discriminant 충돌 (Pitfall 8) | kind는 ResolvedAction 레벨, type은 TransactionRequest 레벨로 분리 |
| R2 (ISignerCapability) | 기존 서명 경로 침범 (Pitfall 4) | R2-6 원칙 엄수 -- 새 경로에서만 사용, 기존 모듈은 delegation만 |
| R2 + R3 | requiresSigningKey와 credential 혼동 (Pitfall 9) | requiresSigningKey는 wallet key 전용, credential은 별도 플래그 |
| R3 (CredentialVault) | 암호화 키 파생 충돌 + re-encrypt 누락 (Pitfall 2) | HKDF context 분리 + re-encrypt 통합 + backup 포함 |
| R3 (인증 모델) | sessionAuth/masterAuth 스코프 충돌 (Pitfall 6) | createdBy 필드 + 권한 매트릭스 |
| R4 (AsyncStatusTracker) | bridge_status 폴링 방해 (Pitfall 7) | tracker별 쿼리 분리, state machine 캡슐화 |
| R5 (정책 확장) | off-chain action이 정책 우회 (Pitfall 3) | 새 경로에도 정책 평가 단계 필수, TransactionParam 확장 |
| R6 (파이프라인 라우팅) | DB 기록 전략 미확정 (Pitfall 5) | 설계 첫 번째 결정으로 확정, txHash nullable 허용 |
| R6 (connect-info) | capability 확장 누락 (Pitfall 10) | externalActions capability 추가 + skill file 업데이트 |
| R6 (Admin/MCP/SDK) | 인터페이스 확장 누락 (Pitfall 12, 13) | 체크리스트 기반 확인 |

---

## Integration Risk Matrix

기존 시스템과의 통합 시 특히 주의해야 할 교차점.

| 기존 시스템 | 영향받는 새 기능 | 위험도 | 핵심 주의사항 |
|------------|----------------|--------|-------------|
| 6-stage pipeline (stages.ts) | ResolvedAction 라우팅 | **HIGH** | Stage 3 정책, Stage 5 서명 분기 -- 기존 경로 무변경 |
| DatabasePolicyEngine | venue-aware 정책 | **HIGH** | TransactionParam 확장 시 기존 필드 optional 유지 |
| ActionProviderRegistry | resolve() 반환 타입 | **HIGH** | executeResolve() 분기 순서 유지 |
| SettingsService + settings-crypto | CredentialVault 암호화 | **HIGH** | HKDF context 분리, re-encrypt/backup 통합 |
| AsyncPollingService | off-chain 상태 추적 | **MEDIUM** | tracker 분리, bridge_status 호환 |
| sign-message.ts | ISignerCapability | **MEDIUM** | delegation만, 기존 코드 수정 금지 |
| http-message-signer.ts (ERC-8128) | SignedHttpAction | **MEDIUM** | 기존 ERC-8128 경로 유지, 새 경로만 통합 |
| connect-info | capability 확장 | **LOW** | 수동 추가 필요 |
| Admin UI | off-chain 표시 + Credentials | **LOW** | 신규 탭/필터 추가 |
| ESM Plugin Loader | ResolvedAction 호환 | **LOW** | kind 없는 반환 = contractCall |

---

## Sources

- 코드베이스 직접 분석 (HIGH confidence):
  - `packages/core/src/interfaces/action-provider.types.ts` -- IActionProvider, ApiDirectResult, ActionContext
  - `packages/daemon/src/infrastructure/action/action-provider-registry.ts` -- executeResolve() 분기 로직
  - `packages/daemon/src/pipeline/stages.ts` -- PipelineContext, stage5Execute ApiDirectResult 분기
  - `packages/daemon/src/pipeline/database-policy-engine.ts` -- TransactionParam, evaluate()
  - `packages/daemon/src/services/async-polling-service.ts` -- tracker 등록/폴링
  - `packages/daemon/src/infrastructure/settings/settings-crypto.ts` -- 암호화 키 파생
- Objective 문서: `internal/objectives/m31-11-external-action-design.md` -- R1~R6 요구사항
