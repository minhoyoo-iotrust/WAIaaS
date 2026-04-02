# Feature Landscape

**Domain:** 서명 앱 명시적 선택
**Researched:** 2026-04-02

## Table Stakes

이 마일스톤의 핵심 기능. 누락 시 목적 미달성.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Partial unique index (v61) | wallet_type당 signing primary 1개 DB 레벨 보장 | Low | `CREATE UNIQUE INDEX ... WHERE signing_enabled = 1` |
| 기존 데이터 정규화 | 다수 활성화 시 가장 오래된 앱만 유지 | Low | 마이그레이션 내 UPDATE 1회 |
| WalletAppService 트랜잭션 토글 | signing_enabled 변경 시 같은 그룹 자동 비활성화 | Low | `sqlite.transaction()` 패턴 |
| register() 자동 비활성화 | 기존 primary 있으면 새 앱 signing_enabled=0 | Low | SELECT 후 조건부 INSERT |
| SignRequestBuilder wallet_type 기반 조회 | walletName 대신 wallet_type+signing_enabled로 조회 | Low | SQL WHERE 변경 1줄 |
| Admin UI wallet_type 그룹 표시 | 같은 wallet_type 앱을 시각적 그룹으로 묶기 | Med | `Map<walletType, WalletApp[]>` 그룹핑 |
| 서명 라디오 버튼 | 그룹 내 하나만 선택, "없음" 옵션 포함 | Med | name=`signing_primary_{walletType}` |
| signing_sdk.preferred_wallet deprecated | 설정 의존 제거, wallet_type primary로 대체 | Low | 설정 읽기 제거 + 주석 |

## Differentiators

부가 가치. 없어도 동작하지만 있으면 UX 향상.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| 앱 1개 그룹 자동 선택 UI | 혼란 방지 (라디오 자동 체크, disabled 표시) | Low | `groupApps.length === 1` 조건 |
| 그룹별 접힘/펼침 | 앱이 많을 때 가독성 | Low | 현재 스코프에서는 불필요 |

## Anti-Features

명시적으로 구현하지 않을 기능.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Per-wallet signing app 선택 | wallet_apps는 전역 테이블, walletId 스코프 없음. 과도한 복잡성 | wallet_type 그룹 레벨에서 1회 설정 |
| MCP wallet app 관리 도구 | 에이전트가 서명 앱을 제어할 이유 없음. Admin 전용 | Admin UI + REST API만 |
| 다중 signing primary | "동시에 여러 앱에 서명 요청" 시나리오 없음 | 라디오(1개 선택) 유지 |
| signing_sdk.preferred_wallet 호환 유지 | deprecated 설정을 fallback으로 유지하면 혼란 가중 | 제거 후 wallet_type primary만 사용 |

## Feature Dependencies

```
DB v61 마이그레이션 -> WalletAppService 트랜잭션 토글
DB v61 마이그레이션 -> register() 자동 비활성화
WalletAppService 트랜잭션 토글 -> Admin UI 라디오 버튼
SignRequestBuilder 조회 변경 -> signing_sdk.preferred_wallet deprecated
```

## MVP Recommendation

전체 scope가 이미 MVP 수준. 6개 table stakes 전부 구현, differentiator 중 "앱 1개 자동 선택"만 포함.

Defer: 그룹별 접힘/펼침 UI (앱 수가 적으므로 현재 불필요)

## Sources

- `internal/objectives/m33-04-signing-app-explicit-selection.md` (마일스톤 목표 문서)
- `packages/daemon/src/services/signing-sdk/sign-request-builder.ts` (현재 walletName 조회 로직)
- `packages/daemon/src/services/signing-sdk/approval-channel-router.ts` (기존 wallet_type+signing_enabled 패턴)
