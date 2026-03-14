# 마일스톤 m31-17: OpenAPI 기반 프론트엔드 타입 자동 생성

- **Status:** PLANNED
- **Milestone:** v31.17

## 목표

Admin UI와 백엔드 간 인터페이스 불일치를 **구조적으로 제거**한다. OpenAPI spec에서 TypeScript 클라이언트 타입을 자동 생성하고, Admin UI의 수동 interface 정의를 생성 타입으로 전환하며, 프로바이더/설정 키 등 동적 메타데이터의 하드코딩을 API 기반 디스커버리로 교체한다.

> **선행**: 없음 (OpenAPIHono + Zod SSoT 인프라 완비)
> **참조**: `@hono/zod-openapi`, `packages/admin/src/api/client.ts`, `packages/daemon/src/api/routes/`
> **관련 이슈**: #034(미완 구조 대책), #349(응답 래퍼 불일치), #350(설정 키 불일치), #257, #307, #319(프로바이더 키 불일치)

---

## 배경

### 반복되는 불일치 버그

프로젝트 역사상 **백엔드-프론트엔드 인터페이스 불일치**로 인한 버그가 30건 이상 발생했다:

| 불일치 유형 | 대표 이슈 | 발생 횟수 |
|------------|-----------|-----------|
| API 응답 필드명 불일치 | #006, #033, #249, #259, #288, #349 | 6+ |
| 설정 키 불일치 | #257, #307, #319, #350 | 4+ |
| 열거값/네트워크 ID 불일치 | #010, #296, #305 | 3+ |
| 프로바이더 하드코딩 누락 | #170, #178, #262, #330 | 4+ |
| API 응답 래퍼 형식 불일치 | #007, #259, #349 | 3+ |

모두 동일한 근본 원인: **프론트엔드가 백엔드 스키마와 독립적으로 타입을 수동 정의**하여 빌드 타임에 불일치를 감지할 수 없음.

### 현재 구조의 단절

```
Zod Schema (SSoT, @waiaas/core)
    ↓ (OpenAPIHono, 자동)
OpenAPI Spec (런타임 생성)
    ↓ ← ❌ 여기가 끊김
Admin UI (수동 interface 62개, 하드코딩 배열 5개)
```

- 백엔드: Zod 스키마 → OpenAPI spec 자동 생성 (완비)
- 프론트엔드: 개발자가 API 문서를 보고 수동으로 interface 작성
- 빌드/린트 시점에 불일치를 감지할 수단 없음

### 이전 시도 (#034)

v1.5.1에서 이슈 #034로 openapi-typescript 도입을 설계했으나, 실제 적용은 포인트 픽스에 그쳤다. 이후 100회 이상의 마일스톤 동안 수동 interface가 계속 추가되어 현재 **62개 수동 interface + 28개 수동 타입 단언** (`apiGet<수동타입>`)이 존재한다.

---

## 현황 분석

### Admin UI 수동 interface (62개, 17 파일)

| 파일 | 수동 interface 수 | 주요 타입 |
|------|-------------------|-----------|
| wallets.tsx | 17 | Wallet, WalletDetail, NetworkInfo, CredentialMetadata, ExternalActionItem 등 |
| dashboard.tsx | 5 | AdminStatus, AdminStats, RecentTransaction, DefiPositionSummary |
| transactions.tsx | 7 | TransactionItem, IncomingTxItem, UnifiedTxRow |
| sessions.tsx | 4 | Session, SessionWallet, CreatedSession |
| notifications.tsx | 5 | ChannelStatus, NotificationStatus, NotificationLogEntry |
| erc8004.tsx | 4 | AgentEntry, ReputationData, ProviderAction |
| walletconnect.tsx | 5 | WcSession, WcPairingResult, WcPairingStatus |
| actions.tsx | 3 | BuiltinProvider, ProviderAction, ProviderInfo |
| policies.tsx | 2 | Wallet, Policy |
| 기타 10 파일 | 8 | AuditLogItem, TokenItem, TelegramUser 등 |

### 하드코딩 배열 (프론트엔드)

| 배열 | 위치 | 항목 수 | 동기화 대상 |
|------|------|---------|-------------|
| BUILTIN_PROVIDERS | actions.tsx | 14 | registerBuiltInProviders (@waiaas/actions) |
| CRED_TYPES | wallets.tsx | 5 | CredentialTypeEnum (@waiaas/core) |
| 네트워크 목록 | 여러 파일 | ~20 | NETWORK_TYPES (@waiaas/shared) |
| 정책 타입 | policies.tsx | ~10 | PolicyTypeSchema (@waiaas/core) |
| 에러 코드 매핑 | error-messages.ts | ~40 | WAIaaSErrorCode (@waiaas/core) |

### API 호출 수동 타입 단언 (28개, 16파일)

```typescript
// 현재: 컴파일러가 검증하지 않는 수동 캐스팅
const result = await apiGet<{ credentials: CredentialMetadata[] }>(API.WALLET_CREDENTIALS(id));
// 백엔드가 배열을 직접 반환해도 타입 에러 없음 → #349 발생
```

---

## 설계

### 목표 구조

```
Zod Schema (SSoT, @waiaas/core)
    ↓ (OpenAPIHono, 자동)
OpenAPI Spec (JSON, 빌드 시 추출)
    ↓ (openapi-typescript, 빌드 시)
Generated Types (packages/admin/src/api/types.generated.ts)
    ↓ (import, 컴파일 타임 검증)
Admin UI 코드 (수동 interface 제거, 생성 타입 사용)
```

### Phase 구성

#### Phase 1: OpenAPI 타입 생성 파이프라인 구축

1. **OpenAPI spec 빌드 타임 추출 스크립트**
   - 데몬의 OpenAPI document를 JSON 파일로 추출
   - `createApp()`에 **stub deps 주입**하여 전체 라우트 등록 (빈 deps는 4개 퍼블릭 라우트만 등록됨)
   - 라우트 등록 조건(`deps.db`, `deps.sqlite`, `deps.keyStore`, `deps.config`, `deps.jwtSecretManager`, `deps.settingsService` 등)을 통과하는 최소 stub 객체 구성 — OpenAPI 메타데이터는 `createRoute()` 정의에서 추출되므로 실제 DB/RPC 호출 없음
   - 기존 `scripts/validate-openapi.ts` 패턴 확장
   - `scripts/extract-openapi.ts` → `packages/admin/openapi.json`

2. **openapi-typescript 도입**
   - `openapi.json` → `packages/admin/src/api/types.generated.ts` 자동 생성
   - `pnpm run generate:api-types` 빌드 명령 추가
   - `.gitignore`에 생성 파일 추가하지 않음 (CI에서 freshness 검증)

3. **타입 안전 API 클라이언트 래퍼**
   - 기존 `apiGet<T>()` 수동 캐스팅을 타입 안전 래퍼로 교체
   - openapi-fetch 또는 경량 자체 래퍼 (번들 크기 고려)
   ```typescript
   // 목표: 경로와 응답 타입이 자동으로 연결
   const { credentials } = await api.get('/v1/wallets/{walletId}/credentials', {
     params: { walletId: id }
   });
   // credentials 타입이 자동으로 CredentialMetadata[]
   // 백엔드가 래핑 형식을 변경하면 빌드 에러
   ```

4. **CI freshness 검증 스텝**
   ```yaml
   - name: Check API types freshness
     run: |
       pnpm run generate:api-types
       git diff --exit-code packages/admin/src/api/types.generated.ts
   ```

#### Phase 2: Admin UI 수동 타입 전환

1. **수동 interface → 생성 타입 매핑 및 교체**
   - 62개 수동 interface를 생성 타입의 type alias로 전환
   - 페이지별 순차 교체 (wallets.tsx → sessions.tsx → ... 순)
   - 교체 시 불일치 발견되면 즉시 백엔드 수정 (또는 반대)

2. **하드코딩 배열 → @waiaas/shared import 또는 OpenAPI 생성 타입으로 전환**
   - **제약**: Admin UI는 `@waiaas/core`를 import할 수 없음 (viem, zod 등 네이티브 의존성이 브라우저 미지원). `@waiaas/shared`만 import 가능 (이미 4곳에서 사용 중).
   - 네트워크 목록 → `@waiaas/shared` NETWORK_TYPES (이미 #306에서 도입)
   - `CRED_TYPES` → `@waiaas/shared`로 re-export 추가 또는 OpenAPI 생성 타입의 enum literal 사용
   - 정책 타입 → `@waiaas/shared`로 re-export 추가 또는 OpenAPI 생성 타입의 enum literal 사용
   - 에러 코드 매핑 → `@waiaas/shared`로 re-export 추가 (순수 상수이므로 shared 이동 가능)

3. **API 호출 28곳 타입 단언 교체**
   - `apiGet<수동타입>()` → 타입 안전 래퍼 호출
   - 컴파일 타임에 요청/응답 형식 검증 보장

#### Phase 3: 프로바이더 동적 디스커버리 + 설정 키 API 확장

1. **GET /v1/actions/providers 응답 확장**
   - 현재: `{ name, description, version, chains, requiresApiKey, hasApiKey, actions }`
   - 추가: `enabledKey`, `category`, `docsUrl`, `keyPortalUrl`, `isEnabled`
   - Admin UI `BUILTIN_PROVIDERS` 하드코딩 완전 제거 → API 응답만으로 렌더링

2. **GET /v1/admin/settings/schema 신규 엔드포인트** (또는 기존 확장)
   - 등록된 설정 키 목록 + 메타데이터(카테고리, 기본값, 타입) 반환
   - Admin UI가 유효한 설정 키만 사용하도록 컴파일 타임 검증

3. **Contract Test 보완**
   - 백엔드 OpenAPI spec의 응답 스키마 키와 프론트엔드 사용 키를 비교하는 자동 검증 테스트
   - 새 엔드포인트 추가 시 프론트엔드 타입 동기화 누락을 CI에서 차단

---

## 기대 효과

### 제거되는 버그 유형

| 유형 | 현재 | 적용 후 |
|------|------|---------|
| API 응답 필드명 불일치 | 런타임 발견 | **컴파일 에러** |
| API 응답 래퍼 형식 불일치 | 런타임 발견 | **컴파일 에러** |
| 설정 키 불일치 | 런타임 에러 토스트 | **컴파일 에러** (또는 API 디스커버리) |
| 프로바이더 하드코딩 누락 | 수동 동기화 | **API 디스커버리** (하드코딩 자체 제거) |
| 열거값 불일치 | 런타임 발견 | **@waiaas/shared re-export 또는 생성 타입** |

### 수치 목표

- 수동 interface 62개 → 0개 (생성 타입으로 100% 전환)
- 수동 타입 단언 28개 → 0개 (타입 안전 래퍼)
- 하드코딩 배열 5개 → 0개 (import 또는 API 디스커버리)
- 인터페이스 불일치 관련 이슈 재발률: **0건/마일스톤** 목표

---

## 기술 선택

### openapi-typescript (타입 생성)

- 런타임 의존성 없음 (devDependency만)
- OpenAPI 3.0/3.1 완전 지원
- `@hono/zod-openapi`가 생성하는 spec과 호환성 검증됨
- 프로젝트에서 이미 #034에서 검토 완료

### openapi-fetch vs 자체 래퍼 (API 클라이언트)

| 기준 | openapi-fetch | 자체 래퍼 |
|------|---------------|-----------|
| 번들 크기 | ~2KB gzip | ~0.5KB |
| 타입 안전성 | 완전 (경로 파라미터, 쿼리, 응답) | 응답만 |
| 기존 코드 호환 | 전면 교체 필요 | 점진 전환 가능 |
| 유지보수 | 커뮤니티 | 직접 |

→ Phase 1에서 두 옵션 모두 프로토타입 후 결정. 번들 크기 제약이 있으므로 자체 래퍼 가능성 높음.

### 프로바이더 메타데이터 소스

| 접근 | 장점 | 단점 |
|------|------|------|
| API 디스커버리 (Phase 3) | 하드코딩 완전 제거, 핫리로드 반영 | 초기 로딩 API 호출 1회 추가 |
| @waiaas/shared import | 빌드 타임 검증 | 런타임 상태(활성/비활성) 반영 불가 |

→ 두 가지 조합: 정적 메타데이터는 shared import, 런타임 상태는 API 디스커버리.

---

## 제약 조건

1. **Admin UI 번들 크기**: CSP `default-src 'none'` 환경이므로 외부 CDN 불가. 새 런타임 의존성은 최소화.
2. **점진적 전환**: 한 번에 62개 interface를 교체하면 리뷰 불가. 페이지 단위 점진 전환.
3. **OpenAPI spec 추출**: `createApp()`에 stub deps를 주입하여 전체 라우트를 등록해야 함. 빈 deps로는 4개 퍼블릭 라우트만 등록되므로, 라우트 등록 조건을 통과하는 최소 stub 객체 구성이 필요. 기존 `scripts/validate-openapi.ts`가 패턴을 제공.
4. **기존 테스트 호환**: 기존 Admin UI 테스트의 mock 타입도 생성 타입 기반으로 전환 필요.

---

## 성공 기준

1. Admin UI에 수동 API interface가 0개
2. 백엔드 응답 스키마 변경 시 Admin UI 빌드가 실패하여 불일치를 사전 감지
3. 새 프로바이더 추가 시 Admin UI 하드코딩 변경 없이 자동 표시
4. CI에서 OpenAPI 타입 freshness 검증 통과
5. #349, #350 수정이 이 마일스톤 과정에서 자연스럽게 해소

---

## 관련 이슈 (이 마일스톤에서 해소)

| 이슈 | 제목 | 관계 |
|------|------|------|
| #034 | OpenAPI → 클라이언트 타입 자동 생성 도입 | 미완 구조 대책 — 이번에 완결 |
| #349 | Credential List API 응답 형식 불일치 | Phase 2에서 타입 전환 시 감지/수정 |
| #350 | Hyperliquid 토글 설정 키 불일치 | Phase 3에서 디스커버리 전환 시 해소 |
