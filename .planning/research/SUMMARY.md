# Project Research Summary

**Project:** m33-04 서명 앱 명시적 선택 (Signing App Explicit Selection)
**Domain:** Wallet-as-a-Service signing target resolution
**Researched:** 2026-04-02
**Confidence:** HIGH

## Executive Summary

이 마일스톤은 신규 기술 도입 없이 기존 WAIaaS 인프라를 정밀하게 수정하는 작업이다. 핵심 문제는 `SignRequestBuilder`가 wallet_type 대신 앱 name을 기반으로 서명 대상을 조회하는 반면, `ApprovalChannelRouter`는 이미 `wallet_type + signing_enabled = 1` 패턴을 사용하고 있어 두 컴포넌트 간 의미론적 불일치가 존재한다는 것이다. 같은 wallet_type에 앱이 여러 개 등록된 환경에서는 어떤 앱이 서명 대상인지 명확하지 않으며 DB 레벨 무결성 보장도 없다. 해결책은 SQLite partial unique index로 wallet_type 당 signing primary를 하나로 제한하고, WalletAppService에 트랜잭션 기반 자동 비활성화 로직을 추가하며, Admin UI를 라디오 버튼 그룹으로 전환하는 것이다.

권장 접근법은 DB 마이그레이션 우선 전략이다. v61 마이그레이션에서 기존 데이터 정규화와 partial unique index 생성을 원자적으로 처리한 후, 서비스 레이어(WalletAppService + SignRequestBuilder + PresetAutoSetupService)를 수정하고, 마지막으로 Admin UI를 갱신한다. 전체 scope는 신규 API 엔드포인트나 라이브러리 없이 기존 패턴(sqlite.transaction(), Preact radio, raw SQL migration)의 조합으로 완성할 수 있다.

가장 큰 위험은 v61 마이그레이션 실패다. 기존 `register()`가 `signing_enabled = 1`을 무조건 삽입하므로 같은 wallet_type에 복수의 primary가 존재할 수 있다. 인덱스 생성 전에 데이터 정규화가 반드시 선행되어야 하며, SQLite의 per-statement 제약 검사 특성 때문에 트랜잭션 내 UPDATE 순서(비활성화 먼저, 활성화 나중)를 엄수해야 한다.

## Key Findings

### Recommended Stack

신규 라이브러리 추가 없음. 기존 스택만으로 구현 가능하며, 동일 패턴이 코드베이스에 이미 광범위하게 존재한다.

**Core technologies:**
- **better-sqlite3 ^12.6.0**: SQLite 드라이버 — `sqlite.transaction()` 패턴이 15곳 이상 검증됨. partial unique index는 raw SQL `exec()`으로 처리하므로 드라이버 제한 없음
- **SQLite Partial Unique Index**: DB 무결성 보장 — `CREATE UNIQUE INDEX ... WHERE signing_enabled = 1` (SQLite 3.8.0+ 표준 기능, 프로젝트에 9개 이상 partial index 이미 사용 중)
- **Preact 10.x + @preact/signals**: Admin UI 라디오 그룹 — `wallets.tsx:1378`에서 동일 `<input type="radio">` 패턴 이미 검증됨
- **drizzle-orm ^0.45.0**: Schema 타입 정의만 사용, 마이그레이션은 raw SQL 유지

### Expected Features

**Must have (table stakes):**
- DB v61 partial unique index (`wallet_type` 당 `signing_enabled=1` 최대 1개 DB 보장) — DB 무결성 없이는 모든 애플리케이션 레벨 보장이 무의미
- 기존 데이터 정규화 마이그레이션 (created_at 기준 최초 앱만 primary 유지) — 인덱스 생성 전 필수
- WalletAppService 트랜잭션 토글 (`update()`: 같은 그룹 자동 비활성화) — 핵심 백엔드 로직
- WalletAppService `register()` 조건부 signing_enabled (기존 primary 있으면 0으로 삽입) — 미래 중복 방지
- SignRequestBuilder wallet_type 기반 단일 쿼리 전환 (`WHERE wallet_type = ? AND signing_enabled = 1`) — 서명 라우팅 정확성
- Admin UI wallet_type 그룹 레이아웃 + 서명 라디오 버튼 + "None" 옵션 — 운영자 UX 핵심
- `signing_sdk.preferred_wallet` deprecated (SignRequestBuilder에서 읽기 중단, 주석 처리) — 설정 혼란 제거
- `ApprovalChannelRouter` SIGNING_DISABLED를 WAIaaSError로 변환 — 구조화된 에러 응답

**Should have (competitive):**
- "None" 선택 시 확인 다이얼로그 + 경고 배너 (서명 비활성화 시 운영자 인지 보장)
- 단일 앱 그룹 자동 선택 + disabled 라디오 표시 (불필요한 조작 제거)
- `CHECK (signing_enabled IN (0, 1))` 제약 추가 (SQLite boolean 타입 안전성)
- wallet_type = '' 빈 문자열 정규화 (name으로 대체, v34 마이그레이션 패턴 재사용)

**Defer (v2+):**
- 그룹 축소/확장 UI (wallet_type 그룹이 3+ 이상 될 때 필요, 현재 불필요)
- per-wallet signing app 선택 (스키마 변경 규모 큼, 현재 사용 사례 없음)
- MCP wallet app 관리 도구 (운영 자동화 요구 발생 시)

### Architecture Approach

이 변경은 신규 서비스나 컴포넌트 없이 기존 4개 컴포넌트를 정밀 수정하고 1개의 DB 마이그레이션을 추가하는 방식이다. ApprovalChannelRouter는 이미 올바른 패턴(`wallet_type + signing_enabled = 1`)을 사용 중이므로 변경이 없다. 핵심은 SignRequestBuilder가 "name 기반 조회"에서 "wallet_type 기반 단일 조회"로 전환하는 것이며, 이를 통해 3개의 개별 DB 조회가 1개로 통합된다.

**Major components:**
1. **DB Migration v61** — partial unique index 생성 + 기존 데이터 정규화 + CHECK 제약 추가 (기반 레이어, 모든 변경의 선행 조건)
2. **WalletAppService** — `update()` 트랜잭션 토글 + `register()` 조건부 primary 설정 (백엔드 자동화 핵심)
3. **SignRequestBuilder** — walletName 기반 3-쿼리를 wallet_type + signing_enabled 단일 쿼리로 대체 (서명 라우팅 정확성)
4. **PresetAutoSetupService** — preferred_wallet 설정 Step 3 제거, 명시적 `update({ signingEnabled: true })` 호출로 대체
5. **Admin UI HumanWalletAppsPage** — flat list에서 wallet_type 그룹 레이아웃으로 전환, 서명 체크박스를 라디오 그룹으로 교체

### Critical Pitfalls

1. **Migration data integrity violation** — `register()`가 현재 `signing_enabled = 1`을 무조건 삽입하므로 기존 DB에 같은 wallet_type의 복수 primary가 존재할 수 있다. 인덱스 생성 전 반드시 `UPDATE ... WHERE id NOT IN (oldest per wallet_type)` 데이터 정규화를 선행 실행해야 한다.

2. **SQLite per-statement constraint enforcement** — PostgreSQL/MySQL과 달리 SQLite는 트랜잭션 커밋 시점이 아니라 각 DML statement 실행 즉시 제약을 검사한다. 트랜잭션 내에서 반드시 "sibling disable → target enable" 순서를 지켜야 한다. 순서가 역전되면 partial unique index가 즉시 위반 오류를 발생시킨다.

3. **walletName/walletType semantic mismatch** — `BuildRequestParams.walletName`은 실제로 wallet_type 값을 담고 있다. `walletName` -> `walletType`으로 파라미터를 리네임하면 TypeScript 컴파일러가 모든 호출 지점을 강제 수정해 런타임 오류를 사전에 차단할 수 있다.

4. **PresetAutoSetupService silent misconfiguration** — preferred_wallet 설정을 제거하면서 register()에 "기존 primary 있으면 0으로 삽입" 로직이 추가되면, preset 자동 설정이 등록 후 signing primary가 되지 않는 무음 실패가 발생한다. 명시적 `walletAppService.update(app.id, { signingEnabled: true })` 호출로 보완해야 한다.

5. **"None" 옵션 시 APPROVAL 트랜잭션 무음 실패** — Admin UI에서 "None" 선택 시 즉각적인 피드백이 없으면, 며칠 후 고액 트랜잭션이 PENDING_APPROVAL에서 타임아웃되고 나서야 문제를 인지하게 된다. 선택 시 확인 다이얼로그와 페이지 상단 경고 배너가 필수다.

## Implications for Roadmap

Based on research, the dependency graph dictates a strict 4-phase ordering. Phase 1 is the only blocker for all subsequent phases.

### Phase 1: DB Migration v61

**Rationale:** 모든 변경의 기반. partial unique index가 없으면 WalletAppService 트랜잭션 토글도, SignRequestBuilder 단일 쿼리도 의미 없다. 마이그레이션 실패는 daemon 시작을 차단하므로 데이터 정규화를 마이그레이션 함수 내에서 인덱스 생성 전에 원자적으로 처리해야 한다.
**Delivers:** DB 레벨 무결성 보장 — wallet_type당 signing primary 최대 1개, CHECK 제약, 빈 wallet_type 정규화
**Addresses:** table stakes "partial unique index", "기존 데이터 정규화", "CHECK 제약"
**Avoids:** Pitfall 1 (migration data integrity), Pitfall 7 (no CHECK on signing_enabled), Pitfall 10 (empty wallet_type)

### Phase 2: WalletAppService + PresetAutoSetupService 백엔드 변경

**Rationale:** Admin UI의 라디오 UX는 서버 사이드 자동 토글이 정확히 동작해야 의미가 있다. Phase 1의 index 존재를 전제로 트랜잭션 내 올바른 UPDATE 순서를 구현한다. PresetAutoSetupService를 이 단계에서 함께 수정해 preferred_wallet 의존성을 완전히 제거한다.
**Delivers:** auto-exclusive 토글 동작, register() 조건부 primary 설정, SIGNING_DISABLED WAIaaSError 변환
**Uses:** `sqlite.transaction()` 기존 패턴, Phase 1 partial unique index
**Avoids:** Pitfall 2 (UPDATE order), Pitfall 5 (PresetAutoSetupService silent misconfiguration), Pitfall 11 (SIGNING_DISABLED plain Error), Pitfall 12 (register hardcodes signing_enabled=1)

### Phase 3: SignRequestBuilder 쿼리 전환

**Rationale:** Phase 2와 독립적으로 진행 가능하나 Phase 1(index) 완료 후 시작한다. walletName 파라미터를 walletType으로 리네임하면 TypeScript 컴파일러가 모든 호출 지점을 강제 수정해 런타임 오류를 차단한다. 3개 개별 DB 쿼리를 1개로 통합한다.
**Delivers:** 올바른 signing primary 조회, preferred_wallet fallback 제거, 타입 안전한 BuildRequestParams
**Avoids:** Pitfall 3 (walletName/walletType semantic mismatch), Pitfall 13 (test coverage gap)

### Phase 4: Admin UI 라디오 그룹 레이아웃

**Rationale:** 백엔드(Phase 2, 3)가 완성된 후 UI를 수정한다. flat list에서 wallet_type 그룹 레이아웃으로 전환하고 서명 체크박스를 라디오 버튼으로 교체한다. "None" 옵션 확인 다이얼로그와 경고 배너를 포함해 운영자 인지 보장.
**Delivers:** wallet_type 그룹별 서명 라디오 선택 UI, "None" 옵션, 경고 배너
**Avoids:** Pitfall 4 ("None" silent failure), Pitfall 6 (stale state after server-side toggle), Pitfall 8 ("None" missing for single-app groups), Pitfall 9 ("None" multi-PUT race)

### Phase Ordering Rationale

- **DB first:** SQLite partial unique index는 애플리케이션 레이어보다 먼저 배치해야 한다. 코드 레벨 제약(트랜잭션 토글)이 실패해도 DB 제약이 최후 방어선 역할을 한다.
- **Backend before UI:** Admin UI의 라디오 선택 후 단순 리패치 패턴은 서버 사이드 자동 토글이 정확해야 올바르게 동작한다.
- **SignRequestBuilder parallel with Phase 2:** 읽기 전용 쿼리 변경이므로 Phase 2와 병행 개발 가능. 단, Phase 1 완료 후 시작.
- **전체 4단계 scope:** 각 phase는 독립적으로 테스트 가능하며 total LOC 변경 규모가 작다 (DB 15줄, 서비스 20-30줄, UI 50-80줄).

### Research Flags

Phases with standard patterns (skip research-phase — patterns fully documented):
- **Phase 1 (DB Migration):** SQLite partial unique index는 공식 문서 확인 + 프로젝트 내 9개 기존 사례 검증. 완전히 표준 패턴.
- **Phase 2 (WalletAppService):** `sqlite.transaction()` 패턴이 프로젝트 15곳에서 검증됨. 신규 패턴 없음.
- **Phase 3 (SignRequestBuilder):** 기존 코드 리팩토링 + TypeScript 리네임. 표준 패턴.
- **Phase 4 (Admin UI):** Preact radio 패턴이 `wallets.tsx:1378`에서 검증됨. 신규 컴포넌트 없음.

이 마일스톤은 전 phase에서 research-phase가 필요 없다. 모든 기술적 결정이 이미 검증된 기존 코드 패턴을 따르며, 연구 결과 confidence가 HIGH다.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | 신규 라이브러리 없음. 모든 기술이 프로젝트에서 이미 광범위하게 사용 중. |
| Features | HIGH | 마일스톤 목표 문서(m33-04-signing-app-explicit-selection.md)와 기존 코드 분석으로 완전히 검증됨. |
| Architecture | HIGH | ApprovalChannelRouter가 이미 올바른 패턴을 사용 중이라는 핵심 인사이트 코드 직접 확인. 데이터 플로우 변경 범위 명확. |
| Pitfalls | HIGH | SQLite 공식 문서 + 코드베이스 직접 분석으로 13개 pitfall 식별. 특히 per-statement constraint enforcement와 UPDATE 순서 이슈는 높은 재현 가능성. |

**Overall confidence:** HIGH

### Gaps to Address

- **signing_sdk.preferred_wallet 설정 키 보존 여부:** 기존 `config.toml`에 이 설정이 있는 사용자를 위해 키는 유지하되 무시(deprecated)로 처리. SettingsService에서 경고 로그 출력 여부는 구현 시 결정.
- **단일 앱 그룹 auto-select 동작:** Phase 4 구현 시 "1개 그룹의 라디오 disabled 표시 vs. 항상 enabled 표시" 선택. Pitfall 8에 따르면 "None" 옵션은 항상 표시해야 함.
- **migration 파일 배치:** v61을 기존 `v51-v59.ts`에 추가할지 신규 파일(`v61-v70.ts`)로 생성할지는 프로젝트 관례 확인 필요 (현재 파일명이 버전 범위로 명명됨).

## Sources

### Primary (HIGH confidence)

- `internal/objectives/m33-04-signing-app-explicit-selection.md` — 마일스톤 목표 문서, 요구사항, 변경 범위
- `packages/daemon/src/services/signing-sdk/wallet-app-service.ts` — WalletApp 인터페이스, register/update 로직 직접 분석
- `packages/daemon/src/services/signing-sdk/sign-request-builder.ts` — walletName 기반 조회, preferred_wallet 참조 직접 분석
- `packages/daemon/src/services/signing-sdk/approval-channel-router.ts` — wallet_type + signing_enabled 조회 패턴 (라인 93-106) 직접 확인
- `packages/admin/src/pages/human-wallet-apps.tsx` — 현재 체크박스 UI 패턴 분석
- `packages/daemon/src/infrastructure/database/schema.ts` — wallet_apps 테이블 정의 (라인 551-564) 직접 확인
- `packages/daemon/src/infrastructure/database/migrations/v21-v30.ts`, `v31-v40.ts`, `v51-v59.ts` — 기존 partial index 패턴 9개 확인
- SQLite 공식 문서: Partial Indexes (https://www.sqlite.org/partialindex.html) — SQLite 3.8.0+ partial unique index 지원 확인
- better-sqlite3 API 문서 (https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) — `transaction()` API 동기 실행 특성 확인

### Secondary (MEDIUM confidence)

- `packages/admin/src/pages/wallets.tsx:1378` — Preact radio 버튼 기존 구현 패턴 참조
- `packages/daemon/src/services/signing-sdk/preset-auto-setup.ts` — preferred_wallet Step 3 설정 코드 확인

---
*Research completed: 2026-04-02*
*Ready for roadmap: yes*
