# Requirements: WAIaaS v31.18

**Defined:** 2026-03-15
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for milestone v31.18. Each maps to roadmap phases.

### Sidebar

- [x] **SIDE-01**: 사이드바가 5개 섹션 헤더(Wallets/Trading/Security/Channels/System)로 시각적 그룹핑된다
- [x] **SIDE-02**: Dashboard는 섹션 밖 독립 항목으로 최상단에 위치한다
- [x] **SIDE-03**: NAV_ITEMS가 섹션 그룹 구조(`{ section, items }[]`)로 변환된다
- [x] **SIDE-04**: DeFi 메뉴가 "Providers"로 리네이밍되고 `/providers` 경로를 사용한다
- [x] **SIDE-05**: Security 메뉴가 "Protection"으로 리네이밍되고 `/protection` 경로를 사용한다
- [x] **SIDE-06**: System 메뉴가 "Settings"로 리네이밍되고 `/settings` 경로를 사용한다
- [x] **SIDE-07**: Human Wallet Apps 메뉴가 "Wallet Apps"로 리네이밍된다
- [x] **SIDE-08**: PAGE_TITLES, PAGE_SUBTITLES가 변경된 이름에 맞게 업데이트된다

### Merge

- [x] **MERG-01**: Tokens 독립 페이지가 Wallets 페이지의 "Tokens" 탭으로 병합된다
- [x] **MERG-02**: Wallets 페이지가 Wallets/Tokens/RPC Endpoints/WalletConnect 4개 탭을 갖는다
- [x] **MERG-03**: RPC Proxy 독립 페이지가 Settings 페이지의 "RPC Proxy" 탭으로 병합된다
- [x] **MERG-04**: Settings 페이지가 General/API Keys/RPC Proxy 3개 탭을 갖는다
- [x] **MERG-05**: 병합된 tokens.tsx 파일이 삭제되고 콘텐츠가 Wallets 탭 컴포넌트로 이동된다
- [x] **MERG-06**: 병합된 rpc-proxy.tsx 파일이 삭제되고 콘텐츠가 Settings 탭 컴포넌트로 이동된다

### Trading

- [x] **TRAD-01**: Hyperliquid Settings 탭이 제거되고 4개 탭만 유지된다 (Overview/Orders/Spot/Sub-accounts)
- [x] **TRAD-02**: Polymarket Settings 탭이 제거되고 4개 탭만 유지된다 (Overview/Markets/Orders/Positions)
- [x] **TRAD-03**: Hyperliquid 페이지 상단에 "Configure in Trading > Providers" 링크가 배치된다
- [x] **TRAD-04**: Polymarket 페이지 상단에 "Configure in Trading > Providers" 링크가 배치된다
- [x] **TRAD-05**: Providers 페이지에 Hyperliquid/Polymarket Settings 탭에 있던 모든 설정이 존재한다

### Route

- [x] **ROUT-01**: `#/tokens` 접근 시 `#/wallets` (Tokens 탭 활성)로 리다이렉트된다
- [x] **ROUT-02**: `#/rpc-proxy` 접근 시 `#/settings` (RPC Proxy 탭 활성)로 리다이렉트된다
- [x] **ROUT-03**: `#/defi`, `#/actions` 접근 시 `#/providers`로 리다이렉트된다
- [x] **ROUT-04**: `#/security` 접근 시 `#/protection`으로 리다이렉트된다
- [x] **ROUT-05**: `#/system` 접근 시 `#/settings`로 리다이렉트된다
- [x] **ROUT-06**: 기존 리다이렉트(erc8004→agent-identity 등)가 유지된다
- [x] **ROUT-07**: Ctrl+K 설정 검색에 변경된 페이지명/경로가 반영된다

### TabNav

- [x] **TNAV-01**: Hyperliquid 커스텀 탭이 TabNav 컴포넌트로 전환된다
- [x] **TNAV-02**: Polymarket 커스텀 탭이 TabNav 컴포넌트로 전환된다
- [x] **TNAV-03**: Transactions "All Transactions" 탭 라벨이 "History"로 변경된다
- [x] **TNAV-04**: Policies "Policies" 탭 라벨이 "Rules"로 변경된다

### Detail

- [x] **DETL-01**: 지갑 상세 탭이 4개(Overview/Activity/Assets/Setup)로 재구성된다
- [x] **DETL-02**: Overview 탭에 Owner Protection 카드가 Wallet Info 아래에 항상 노출된다
- [x] **DETL-03**: Owner 미등록 시 경고 배너 + "Register Owner" CTA 버튼이 표시된다
- [x] **DETL-04**: Owner 등록 완료 시 상태 요약(상태/승인방식/주소) + "Manage" 버튼이 표시된다
- [x] **DETL-05**: "Register Owner"/"Manage" 클릭 시 기존 Owner 탭의 등록/관리 플로우가 인라인 또는 모달로 표시된다
- [x] **DETL-06**: Activity 탭이 Transactions + External Actions를 통합하고 필터로 구분한다
- [x] **DETL-07**: Assets 탭이 Staking Positions + NFT Gallery를 섹션별로 통합한다
- [x] **DETL-08**: Setup 탭이 Credentials + MCP Setup을 섹션별로 통합한다
- [x] **DETL-09**: DETAIL_TABS 배열이 4개(`overview`, `activity`, `assets`, `setup`)로 업데이트된다

### Legacy

- [x] **LGCY-01**: telegram-users.tsx default export가 제거되고 TelegramUsersContent가 적절한 위치로 이동된다
- [x] **LGCY-02**: walletconnect.tsx default export가 제거되고 WalletConnect 컴포넌트가 적절한 위치로 이동된다
- [x] **LGCY-03**: 삭제된 페이지의 import가 layout.tsx에서 제거된다
- [x] **LGCY-04**: skills/admin.skill.md가 새 메뉴 구조에 맞게 업데이트된다

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

(None — all scoped features included in v1)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 백엔드 API 변경 | 순수 프론트엔드 IA 재구조화, 백엔드 불변 |
| 사이드바 접기/펼치기 | IA 재구조화 범위 초과, 별도 UX 개선 |
| 모바일 반응형 사이드바 | 현재 데스크탑 전용, 별도 마일스톤 |
| 새 페이지 추가 | 기존 페이지의 재구조화만 수행 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SIDE-01 | Phase 417 | Complete |
| SIDE-02 | Phase 417 | Complete |
| SIDE-03 | Phase 417 | Complete |
| SIDE-04 | Phase 417 | Complete |
| SIDE-05 | Phase 417 | Complete |
| SIDE-06 | Phase 417 | Complete |
| SIDE-07 | Phase 417 | Complete |
| SIDE-08 | Phase 417 | Complete |
| ROUT-01 | Phase 418 | Complete |
| ROUT-02 | Phase 418 | Complete |
| ROUT-03 | Phase 417 | Complete |
| ROUT-04 | Phase 417 | Complete |
| ROUT-05 | Phase 417 | Complete |
| ROUT-06 | Phase 417 | Complete |
| ROUT-07 | Phase 417 | Complete |
| TNAV-01 | Phase 417 | Complete |
| TNAV-02 | Phase 417 | Complete |
| TNAV-03 | Phase 417 | Complete |
| TNAV-04 | Phase 417 | Complete |
| MERG-01 | Phase 418 | Complete |
| MERG-02 | Phase 418 | Complete |
| MERG-03 | Phase 418 | Complete |
| MERG-04 | Phase 418 | Complete |
| MERG-05 | Phase 418 | Complete |
| MERG-06 | Phase 418 | Complete |
| LGCY-01 | Phase 418 | Complete |
| LGCY-02 | Phase 418 | Complete |
| LGCY-03 | Phase 418 | Complete |
| LGCY-04 | Phase 418 | Complete |
| TRAD-01 | Phase 419 | Complete |
| TRAD-02 | Phase 419 | Complete |
| TRAD-03 | Phase 419 | Complete |
| TRAD-04 | Phase 419 | Complete |
| TRAD-05 | Phase 419 | Complete |
| DETL-01 | Phase 420 | Complete |
| DETL-02 | Phase 420 | Complete |
| DETL-03 | Phase 420 | Complete |
| DETL-04 | Phase 420 | Complete |
| DETL-05 | Phase 420 | Complete |
| DETL-06 | Phase 420 | Complete |
| DETL-07 | Phase 420 | Complete |
| DETL-08 | Phase 420 | Complete |
| DETL-09 | Phase 420 | Complete |

**Coverage:**
- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after roadmap creation*
