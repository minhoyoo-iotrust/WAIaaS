# Feature Research: Signing App Explicit Selection

**Domain:** Wallet App Signing Primary 선택 (Radio-Group Exclusive Selection)
**Researched:** 2026-04-02
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

같은 wallet_type에 앱이 여러 개 등록된 환경에서 서명 대상 명확화를 위해 반드시 필요한 기능들.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **wallet_type 그룹별 서명 라디오 선택** | 같은 wallet_type에 앱 2+개일 때 어떤 앱이 서명 대상인지 불투명 -- 라디오 버튼으로 그룹 내 하나만 선택 가능해야 함 | MEDIUM | Admin UI `<input type="radio" name={walletType}>` 그룹. 현재 체크박스를 라디오로 전환 |
| **auto-exclusive 토글 (자동 비활성화)** | 같은 그룹 내 다른 앱 선택 시 기존 signing primary 자동 해제 -- 수동 해제 불필요 | LOW | `WalletAppService.update()` 트랜잭션 내에서 같은 wallet_type의 다른 앱 `signing_enabled = 0` 처리. 단일 SQL UPDATE |
| **"None" 옵션 (서명 비활성화)** | wallet_type 전체에 대해 서명을 끌 수 있어야 함 -- 디바이스 분실/교체 시 즉시 비활성화 필요 | LOW | 라디오 그룹에 "None" 옵션 추가. 전체 앱 `signing_enabled = 0`. 기존 SIGNING_DISABLED 에러코드 재사용 |
| **partial unique index (DB 무결성)** | 코드 버그로 같은 wallet_type에 signing_enabled=1이 2개 이상 생기면 안 됨 -- DB 레벨 보장 필수 | LOW | `CREATE UNIQUE INDEX ... ON wallet_apps(wallet_type) WHERE signing_enabled = 1`. SQLite partial index 지원 확인됨 |
| **SignRequestBuilder wallet_type 기반 조회** | 현재 walletName 기반 조회를 wallet_type + signing_enabled 기반으로 전환 -- ApprovalChannelRouter와 동일 패턴 통일 | MEDIUM | `WHERE wallet_type = ? AND signing_enabled = 1` 쿼리. push_relay_url, subscription_token 모두 선택된 앱에서 가져옴 |
| **signing_sdk.preferred_wallet deprecated** | wallet_type signing primary가 이 설정을 완전 대체 -- 설정 남아 있으면 혼란 유발 | LOW | 설정 키 읽기 시 무시 + Admin UI에서 제거. 기존 값이 있으면 마이그레이션 중 warning 로그 |
| **wallet_type 그룹 시각적 표시** | 같은 wallet_type의 앱들이 그룹으로 묶여 보여야 어떤 앱이 같은 디바이스 그룹인지 파악 가능 | MEDIUM | 앱 목록을 wallet_type으로 groupBy 후 섹션 헤더 표시. 현재 flat list에서 grouped layout으로 전환 |

### Differentiators (Competitive Advantage)

직접적으로 요구되지 않지만 구현하면 운영 DX가 크게 향상되는 기능들.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **단일 앱 그룹 자동 선택 + disabled 라디오** | wallet_type에 앱이 1개만 있으면 자동으로 signing primary 설정, 라디오 disabled 표시 -- 불필요한 조작 제거 | LOW | 프론트엔드 전용 로직. 1개일 때 checked+disabled, 서버는 register 시 기본 signing_enabled=1 유지 |
| **그룹 축소/확장 (collapsible)** | 앱이 많아질 때 화면 정리. 각 wallet_type 그룹을 접을 수 있음 | LOW | `<details>` 또는 토글 state. 그룹이 3+ 있을 때만 유용 |
| **마이그레이션 시 기존 데이터 자동 정리** | v61 마이그레이션에서 같은 wallet_type에 signing_enabled=1이 여러 개인 경우 created_at 기준 최초 앱만 유지 | LOW | 마이그레이션 SQL에서 자동 처리. 수동 개입 불필요 |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **per-wallet signing app 선택** | 지갑마다 다른 서명 앱 쓰고 싶을 수 있음 | wallet_apps는 전역 테이블(walletId 스코프 없음). wallet_type은 wallets.wallet_type과 조인 -- per-wallet 선택은 스키마 변경 규모가 큼. 현재 사용 사례에 불필요 | wallet_type 그룹 단위 선택으로 충분. 다른 디바이스 그룹이면 다른 wallet_type 사용 |
| **signing primary 히스토리/로그** | 누가 언제 signing primary를 변경했는지 추적 | 이 수준의 감사는 over-engineering. 기존 audit_logs에 wallet app update는 이미 기록됨 | 기존 audit_logs 테이블의 WALLET_APP_UPDATED 이벤트로 충분 |
| **다수 signing primary (multi-sign)** | 여러 앱에 동시 서명 요청 후 먼저 응답한 것 사용 | 서명 요청이 동시에 여러 디바이스에 가면 UX 혼란. 두 디바이스에서 동시 응답 시 race condition | 라디오 단일 선택이 의도적 설계. 알림은 체크박스 다중 발송 유지 |
| **API/MCP로 signing primary 변경** | 프로그래밍 방식으로 서명 앱 전환 | MCP에 wallet app 관리 도구 없음. API 추가는 범위 확대. 이 설정은 운영자 Admin UI 작업 | Admin UI + REST API PUT /admin/wallet-apps/{id} 기존 엔드포인트로 충분 |

## Feature Dependencies

```
[DB v61 partial unique index]
    +-- requires --> [마이그레이션: 기존 데이터 중복 정리]
    +-- enables  --> [WalletAppService auto-exclusive 토글]
                         +-- enables --> [Admin UI 라디오 선택]
                         +-- enables --> [SignRequestBuilder wallet_type 기반 조회]

[Admin UI wallet_type 그룹 표시]
    +-- independent (기존 wallet_type 필드 활용)

[signing_sdk.preferred_wallet deprecated]
    +-- requires --> [SignRequestBuilder wallet_type 기반 조회] (대체 경로 동작 확인 후)

[ApprovalChannelRouter]
    +-- no changes needed (이미 wallet_type + signing_enabled 패턴 사용 중)
```

### Dependency Notes

- **DB v61 partial unique index requires 기존 데이터 정리:** 인덱스 생성 전에 같은 wallet_type에 signing_enabled=1이 여러 개인 행을 정리해야 함. created_at ASC 기준 첫 번째만 유지.
- **WalletAppService auto-exclusive enables Admin UI 라디오:** 서버가 자동 토글을 보장해야 프론트엔드에서 라디오 선택 후 단순히 목록 리패치만 하면 됨. 프론트엔드에서 다른 앱의 상태를 개별 업데이트할 필요 없음.
- **SignRequestBuilder 전환 enables preferred_wallet deprecated:** SignRequestBuilder가 wallet_type 기반으로 동작해야 preferred_wallet 설정이 불필요해짐.
- **ApprovalChannelRouter는 이미 준비됨:** `approval-channel-router.ts:93-106`에서 `wallet_type + signing_enabled = 1` 조회 패턴이 이미 존재. 변경 불필요.

## MVP Definition

### Launch With (v33.4 -- 이번 마일스톤)

- [x] DB v61 마이그레이션 (partial unique index + 기존 데이터 정리) -- DB 무결성 보장 필수
- [x] WalletAppService auto-exclusive 토글 (update + register) -- 핵심 백엔드 로직
- [x] SignRequestBuilder wallet_type 기반 조회 전환 -- 서명 라우팅 정확성
- [x] Admin UI wallet_type 그룹 표시 + 서명 라디오 + 알림 체크박스 -- 운영자 UX
- [x] "None" 옵션 -- 서명 비활성화 필수 시나리오
- [x] signing_sdk.preferred_wallet deprecated -- 혼란 제거

### Add After Validation (v33.x)

- [ ] 그룹 축소/확장 UI -- wallet_type 그룹이 3+ 이상 생기면 필요
- [ ] 단일 앱 그룹의 라디오 disabled 표시 -- 미세 DX 개선

### Future Consideration (v34+)

- [ ] per-wallet signing app 선택 -- 현재 사용 사례에 불필요, 스키마 변경 규모 큼
- [ ] MCP wallet app 관리 도구 -- 운영 자동화 필요 시

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| DB v61 partial unique index | HIGH | LOW | P1 |
| WalletAppService auto-exclusive 토글 | HIGH | LOW | P1 |
| SignRequestBuilder wallet_type 조회 | HIGH | MEDIUM | P1 |
| Admin UI 라디오 + 그룹 표시 | HIGH | MEDIUM | P1 |
| "None" 옵션 | MEDIUM | LOW | P1 |
| preferred_wallet deprecated | MEDIUM | LOW | P1 |
| 단일 앱 자동 선택 + disabled | LOW | LOW | P2 |
| 그룹 collapsible | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for v33.4
- P2: Should have, add if time permits
- P3: Nice to have, future consideration

## Radio-Group Selection 행동 패턴 분석

### Standard UX Pattern: Exclusive Radio with "None"

라디오 그룹의 auto-exclusive 행동은 HTML `<input type="radio">` 기본 동작과 일치. 핵심 행동 규칙:

1. **같은 name 속성의 라디오는 하나만 선택 가능** -- `name={wallet_type}` 으로 그룹화
2. **"None" 옵션은 별도 value=""인 라디오** -- 선택 시 모든 앱 signing_enabled=0
3. **서버 사이드 auto-exclusive가 핵심** -- 프론트엔드 라디오는 단순 UI, 실제 무결성은 DB partial unique index + WalletAppService 트랜잭션
4. **낙관적 업데이트 불필요** -- PUT 호출 후 목록 리패치(현재 패턴 유지)

### 서명 vs 알림 컨트롤 분리 근거

| 속성 | 서명 (signing_enabled) | 알림 (alerts_enabled) |
|------|------------------------|----------------------|
| 선택 모델 | 라디오 (하나만) | 체크박스 (다수 가능) |
| 근거 | 서명 요청은 정확히 하나의 디바이스에만 가야 함 -- 다수에 보내면 race condition | 알림은 정보 전달 -- 여러 디바이스에 동시 발송해도 무해 |
| 스코프 | wallet_type 그룹 내 | 앱별 독립 |
| "없음" 필요 | 필수 (서명 비활성화 시나리오) | 불필요 (개별 해제면 충분) |

### 기존 코드 변경 범위 요약

| 컴포넌트 | 변경 유형 | 영향도 |
|----------|----------|--------|
| WalletAppService.update() | auto-exclusive 로직 추가 (5-10줄) | LOW |
| WalletAppService.register() | 기존 primary 체크 추가 (3-5줄) | LOW |
| SignRequestBuilder.buildRequest() | walletName -> wallet_type 쿼리 변경 (10줄) | MEDIUM |
| human-wallet-apps.tsx | 그룹 레이아웃 + 라디오 전환 (50-80줄 변경) | MEDIUM |
| DB v61 migration | partial unique index + 데이터 정리 (15줄) | LOW |
| Admin Settings | preferred_wallet 키 제거/무시 | LOW |

## Sources

- 기존 코드 분석: `packages/daemon/src/services/signing-sdk/wallet-app-service.ts` (WalletApp 인터페이스, register/update 로직)
- 기존 코드 분석: `packages/daemon/src/services/signing-sdk/sign-request-builder.ts` (walletName 기반 조회, preferred_wallet 참조)
- 기존 코드 분석: `packages/daemon/src/services/signing-sdk/approval-channel-router.ts` (wallet_type + signing_enabled 조회 패턴 라인 93-106)
- 기존 코드 분석: `packages/admin/src/pages/human-wallet-apps.tsx` (현재 체크박스 UI, handleToggle 패턴)
- 설계 문서: `internal/objectives/m33-04-signing-app-explicit-selection.md` (요구사항, 변경 범위, 테스트 항목)
- HTML Radio Button spec: HTML5 `<input type="radio">` same-name exclusive behavior (HIGH confidence -- web standard)
- SQLite partial index: `CREATE UNIQUE INDEX ... WHERE condition` (HIGH confidence -- SQLite 3.8.0+ 지원)

---
*Feature research for: Signing App Explicit Selection (m33-04)*
*Researched: 2026-04-02*
