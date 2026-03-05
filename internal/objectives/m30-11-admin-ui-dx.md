# 마일스톤 m30-11: Admin UI DX 개선 — 메뉴 재구성 + 액션 Tier 오버라이드

- **Status:** PLANNED
- **Milestone:** v30.11

## 목표

Admin UI의 액션 관리 경험을 개선하여, (1) 메뉴 이름이 사용자 관점에서 직관적이고,
(2) ERC-8004 Agent Identity 기능을 한 페이지에서 완결적으로 관리할 수 있으며,
(3) 운영자가 액션별 기본 보안 Tier를 Admin UI에서 직접 조정할 수 있고,
(4) 모든 액션 프로바이더가 기본 활성화되어 별도 설정 없이 즉시 사용 가능한 상태.

---

## 배경

### 현재 문제점

1. **메뉴 이름이 개발자 용어** — "Actions"는 내부 프레임워크 용어이고, 실제 내용은 DeFi 프로토콜
   토글이다. "ERC-8004"는 EIP 번호로 일반 사용자가 의미를 알 수 없다.

2. **ERC-8004 설정/관리 동선 분리** — 기능 활성화 토글은 Actions 페이지에 있고, 에이전트 등록·
   평판·레지스트레이션 파일 관리는 별도 ERC-8004 페이지에 있다. 유저가 두 페이지를 오가야 한다.

3. **Feature gate 버그** — Actions 페이지에서 ERC-8004을 활성화해도, ERC-8004 전용 페이지에서
   "disabled"로 표시된다. 원인: Actions 페이지는 settings를 카테고리별 중첩 객체로 파싱하고
   (`settings['actions']['erc8004_agent_enabled']`), ERC-8004 페이지는 flat key로 파싱
   (`settings['actions.erc8004_agent_enabled']?.value`)하여 데이터 접근 방식이 불일치.

4. **모든 프로바이더 기본 비활성** — 모든 액션 프로바이더가 기본 비활성이라 운영자가 하나씩
   켜야 한다. 미사용 시 리소스 소비가 없고, 실행은 정책+승인으로 게이트되므로 기본 활성화해도 안전.

5. **Registered Actions 설명 없음** — 액션 테이블에 이름·체인·리스크·tier만 표시되고,
   각 액션이 무엇을 하는지 설명이 없어 운영자가 의미를 파악하기 어렵다.

6. **액션별 기본 Tier 수정 불가** — 각 액션의 보안 Tier(INSTANT/NOTIFY/DELAY/APPROVAL)가
   코드에 하드코딩되어 있어, 운영자가 정책에 맞게 조정할 수 없다. 예: `revoke_feedback`을
   INSTANT에서 DELAY로 올리거나, `set_metadata`를 NOTIFY에서 INSTANT으로 내리는 것이 불가능.

7. **메뉴 순서** — Agent Identity 메뉴는 DeFi(구 Actions) 메뉴 바로 다음에 위치해야 한다.
   두 메뉴 모두 액션 프로바이더 기반 기능이므로 인접 배치가 자연스럽다.

### 적용 범위

메뉴 재구성과 액션 설명은 Admin UI 변경. Tier 오버라이드는 전 액션 프로바이더 공통 프레임워크
기능으로, ERC-8004뿐 아니라 DeFi 프로바이더(Jupiter, 0x, Aave 등) 액션에도 동일하게 적용된다.

---

## 요구사항

### R1. 메뉴 이름 변경

- **R1-1.** `Actions` 메뉴를 `DeFi`로 변경 — 페이지 타이틀, 네비게이션 라벨, 서브타이틀 모두 반영
- **R1-2.** `ERC-8004` 메뉴를 `Agent Identity`로 변경 — 페이지 타이틀, 네비게이션 라벨, 서브타이틀 모두 반영
- **R1-3.** URL 해시 라우트 변경: `#/actions` → `#/defi`, `#/erc8004` → `#/agent-identity`
- **R1-4.** 메뉴 순서: Agent Identity는 DeFi 바로 다음에 배치 — 두 메뉴 모두 액션 프로바이더 기반 기능이므로 인접 배치

### R2. ERC-8004 토글 통합 + DeFi 페이지에서 분리

- **R2-1.** DeFi 페이지(구 Actions)에서 ERC-8004 프로바이더 카드를 제거
- **R2-2.** Agent Identity 페이지(구 ERC-8004) 상단에 활성화/비활성화 토글 배치
- **R2-3.** 토글 변경 시 `PUT /v1/admin/settings` 호출하여 `actions.erc8004_agent_enabled` 값 변경
- **R2-4.** 비활성 상태에서도 EmptyState 대신 토글은 항상 표시 — 토글 아래에 비활성 안내 메시지
- **R2-5.** 비활성 시 하위 UI 동작: 토글 아래의 탭(Identity/Registration File/Reputation)과 관련 UI는 **완전 숨김** (렌더링 안 함). 토글 + 비활성 안내 메시지만 표시. 활성화 시 전체 UI 렌더링 + 데이터 로드.

### R3. Feature gate 버그 수정 + 전 프로바이더 기본 활성화

- **R3-1.** Agent Identity 페이지의 settings 파싱을 Actions 페이지와 동일한 방식으로 통일
- **R3-2.** 전체 액션 프로바이더 기본값을 `true`로 변경 (10개):
  - `actions.jupiter_swap_enabled` → `true`
  - `actions.zerox_swap_enabled` → `true`
  - `actions.lifi_enabled` → `true`
  - `actions.lido_staking_enabled` → `true`
  - `actions.jito_staking_enabled` → `true`
  - `actions.aave_v3_enabled` → `true`
  - `actions.kamino_enabled` → `true`
  - `actions.pendle_yield_enabled` → `true`
  - `actions.drift_perp_enabled` → `true`
  - `actions.erc8004_agent_enabled` → `true`
- **R3-3.** API 키가 필요한 프로바이더(0x Swap)는 기본 활성화되어도 API 키 미설정 시
  액션 실행 단계에서 기존 에러로 차단 — 추가 가드 불필요
- **R3-4.** 기존 테스트 수정 — 기본값 변경에 따른 feature gate 및 등록 테스트 업데이트
- **R3-5.** DB 마이그레이션(v42) — 기존 사용자의 DB에 `false`로 저장된 10개 `_enabled` 설정을 `true`로 업데이트. SettingsService는 DB 값 > config.toml > 코드 기본값 순으로 조회하므로, 코드 기본값만 변경하면 기존 사용자에게 적용되지 않음. 신규 설치는 코드 기본값으로 동작.

### R4. Registered Actions 설명 추가

- **R4-1.** 액션 프로바이더 메타데이터에 `description` 필드 추가 (각 액션의 한 줄 설명)
- **R4-2.** DeFi 페이지와 Agent Identity 페이지의 Registered Actions 테이블에 Description 컬럼 추가
- **R4-3.** 액션 설명은 영어 (코드 내 상수, 국제화 불필요)

### R5. 액션별 Tier 오버라이드 프레임워크

운영자가 Admin UI에서 액션별 기본 보안 Tier를 변경할 수 있는 프레임워크.
전 액션 프로바이더 공통 적용 (ERC-8004 + DeFi 모두).

- **R5-1.** Settings 키 패턴: `actions.{provider_key}_{action_name}_tier` (예: `actions.erc8004_agent_register_agent_tier`)
  - ⚠️ 점(`.`) 3단계 이상은 config.toml `detectNestedSections()` 차단 + 환경변수 파싱 불가. 기존 패턴(`actions.{key}_{field}`)과 일관되게 밑줄 구분 사용.
- **R5-2.** 허용 값: `INSTANT` / `NOTIFY` / `DELAY` / `APPROVAL` — Zod enum으로 검증
- **R5-3.** 미설정 시 프로바이더 코드의 하드코딩 기본값 유지 (fallback)
- **R5-4.** 파이프라인 Stage에서 tier 결정 시 Settings override → 프로바이더 기본값 순으로 조회
- **R5-5.** Admin UI의 Registered Actions 테이블에서 Default Tier 셀을 드롭다운으로 변경
- **R5-6.** 드롭다운 변경 시 `PUT /v1/admin/settings`로 즉시 반영 (hot-reload)
- **R5-7.** 오버라이드된 tier는 시각적으로 구분 표시 (예: 뱃지 색상 변경 또는 "customized" 라벨)
- **R5-8.** "Reset to default" 기능 — 오버라이드 제거 시 프로바이더 기본값으로 복원

### R6. 스킬 파일 동기화

- **R6-1.** `skills/admin.skill.md` — 메뉴 이름 변경, tier 오버라이드 설정 방법 추가
- **R6-2.** `skills/erc8004.skill.md` — 메뉴 경로 변경, 기본 활성화 반영
- **R6-3.** `skills/actions.skill.md` — 메뉴 이름 변경, tier 오버라이드 기능 문서화, 전 프로바이더 기본 활성화 반영
- **R6-4.** `skills/policies.skill.md` — tier 오버라이드와 정책 tier 에스컬레이션의 관계 명시

---

## 설계 결정

### D1. Tier 오버라이드 vs 정책 Tier 에스컬레이션

Tier 오버라이드는 액션의 **기본 tier**를 변경한다. 정책(REPUTATION_THRESHOLD 등)에 의한
tier 에스컬레이션은 오버라이드된 tier 위에서 동작한다. 즉:

```
최종 tier = max(오버라이드된 기본 tier, 정책 에스컬레이션 tier)
```

Tier 순서: INSTANT < NOTIFY < DELAY < APPROVAL

### D2. Tier 하향 허용

운영자가 high-risk 액션의 tier를 APPROVAL에서 INSTANT으로 낮추는 것도 허용한다.
이는 운영자의 자율 결정이며, 경고 메시지를 표시하되 차단하지 않는다.
high → INSTANT 변경 시 "This action has high risk. Lowering the tier removes approval requirements." 경고.

### D3. Settings 키 네이밍

기존 패턴(`actions.{provider}_enabled`, `actions.{provider}_{config}`)과 일관되게
`actions.{provider}_{action}_tier` 형태를 사용한다. 밑줄(`_`)로 프로바이더와 액션을 구분.

> **결정 근거:** 점(`.`) 3단계 이상 키는 (1) config.toml의 `detectNestedSections()`가
> 중첩 섹션으로 감지하여 차단, (2) 환경변수 `WAIAAS_ACTIONS_*` 파싱에서 점/밑줄 구분 불가,
> (3) `getConfigValue()`가 점 이후를 밑줄로 rejoin하여 config.toml 매핑 불일치 발생.
> 밑줄 구분은 기존 80+ 설정 키와 일관되며 모든 설정 경로(DB/config.toml/env)에서 정상 동작.

### D4. ERC-8004 카드를 DeFi 페이지에서 완전 제거

ERC-8004은 DeFi가 아니라 Identity/Trust 도메인이므로 DeFi 페이지에 남겨두지 않는다.
Agent Identity 페이지에서 토글 + 액션 테이블 + 관리 UI를 모두 제공한다.

### D5. 전 프로바이더 기본 활성화 안전성

모든 프로바이더를 기본 활성화해도 안전한 이유:
- 미사용 시 리소스 소비 없음 (폴링·백그라운드 작업 없음)
- 실행은 6-stage 파이프라인 + 정책 평가 + 승인 tier로 게이트
- API 키 필요 프로바이더(0x)는 키 미설정 시 액션 실행 단계에서 에러 반환
- 운영자가 필요 시 비활성화 가능 (토글 off)

---

## 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `packages/admin/src/components/layout.tsx` | 메뉴 라벨·순서 변경 (Actions→DeFi, ERC-8004→Agent Identity, 인접 배치), 라우트 변경 |
| `packages/admin/src/pages/actions.tsx` | 페이지 타이틀 변경, ERC-8004 프로바이더 카드 제거, 액션 테이블에 description 컬럼 + tier 드롭다운 |
| `packages/admin/src/pages/erc8004.tsx` | 페이지 타이틀 변경, 토글 통합, settings 파싱 수정, 액션 테이블에 description + tier 드롭다운 |
| `packages/daemon/src/infrastructure/settings/setting-keys.ts` | 전 프로바이더 `_enabled` 기본값 `true` (10개), tier 오버라이드 키 정의 |
| `packages/daemon/src/pipeline/` | tier 결정 로직에 Settings override 조회 추가 |
| `packages/actions/src/` | 각 액션 메타데이터에 `description` 필드 추가 |
| `packages/core/src/schemas/` | tier 오버라이드 설정 스키마 |
| `packages/daemon/src/infrastructure/db/migrate.ts` | v42: 기존 사용자 10개 `_enabled` 설정 `true`로 업데이트 마이그레이션 |
| `skills/admin.skill.md` | 메뉴 변경, tier 오버라이드 문서화 |
| `skills/erc8004.skill.md` | 메뉴 경로 변경, 기본 활성화 |
| `skills/actions.skill.md` | 메뉴 변경, tier 오버라이드 문서화, 전 프로바이더 기본 활성화 |
| `skills/policies.skill.md` | tier 오버라이드와 정책 관계 명시 |
