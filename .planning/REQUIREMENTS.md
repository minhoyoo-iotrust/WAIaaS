# Requirements: WAIaaS

**Defined:** 2026-02-18
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v2.3 Requirements

Requirements for v2.3 Admin UI 기능별 메뉴 재구성. Each maps to roadmap phases.

### 메뉴 구조

- [ ] **MENU-01**: 사이드바 네비게이션이 7개 메뉴(Dashboard/Wallets/Sessions/Policies/Notifications/Security/System)를 표시한다
- [ ] **MENU-02**: Settings 메뉴가 사이드바에서 제거되고 #/settings 접근 시 #/dashboard로 리다이렉트된다
- [ ] **MENU-03**: WalletConnect 메뉴가 사이드바에서 제거되고 #/walletconnect 접근 시 #/wallets로 리다이렉트된다

### 탭 네비게이션

- [ ] **TAB-01**: 재사용 가능한 TabNav 공용 컴포넌트가 생성되고 5개 페이지에서 사용된다
- [ ] **TAB-02**: Wallets 페이지가 4개 탭(Wallets/RPC Endpoints/Balance Monitoring/WalletConnect)을 표시한다
- [ ] **TAB-03**: Sessions 페이지가 2개 탭(Sessions/Settings)을 표시한다
- [ ] **TAB-04**: Policies 페이지가 2개 탭(Policies/Defaults)을 표시한다
- [ ] **TAB-05**: Notifications 페이지가 3개 탭(Channels & Logs/Telegram Users/Settings)으로 확장된다
- [ ] **TAB-06**: 각 Settings 탭이 독립적인 dirty signal과 save bar를 보유한다

### Security 페이지

- [ ] **SEC-01**: Security 페이지가 #/security 라우트에서 3개 탭(Kill Switch/AutoStop Rules/JWT Rotation)을 렌더링한다
- [ ] **SEC-02**: Kill Switch 탭이 기존 Settings의 Kill Switch 기능을 그대로 제공한다 (상태 표시/활성화/복구/에스컬레이션)
- [ ] **SEC-03**: AutoStop Rules 탭이 기존 Settings의 AutoStop 설정을 그대로 제공한다 (활성화/실패횟수/비정상활동/유휴타임아웃)
- [ ] **SEC-04**: JWT Rotation 탭이 기존 Settings의 JWT Rotation 기능을 그대로 제공한다

### System 페이지

- [ ] **SYS-01**: System 페이지가 #/system 라우트에서 API Keys, Oracle, Display Currency, Global IP Rate Limit, Log Level, Danger Zone을 렌더링한다
- [ ] **SYS-02**: 기존 Settings의 API Keys/Display Currency/Log Level/Danger Zone이 System 페이지에서 동일하게 동작한다

### Settings 분산

- [ ] **DIST-01**: RPC Endpoints 설정이 Wallets > RPC Endpoints 탭에서 변경/저장 가능하다
- [ ] **DIST-02**: Balance Monitoring 설정이 Wallets > Balance Monitoring 탭에서 변경/저장 가능하다
- [ ] **DIST-03**: WalletConnect 설정(Project ID/Relay URL)이 Wallets > WalletConnect 탭에서 변경/저장 가능하다
- [ ] **DIST-04**: 세션 관련 설정(TTL/Max Sessions/Rate Limits/Max Pending/Absolute Lifetime/Max Renewals)이 Sessions > Settings 탭에서 변경/저장 가능하다
- [ ] **DIST-05**: 정책 기본값(Delay/Approval Timeout/Default Deny 3개 토글)이 Policies > Defaults 탭에서 변경/저장 가능하다
- [ ] **DIST-06**: 알림 설정(Enabled/Rate Limit/Telegram/Discord/ntfy/Slack)이 Notifications > Settings 탭에서 변경/저장 가능하고 기존 중복 렌더링이 제거된다

### 신규 설정 노출

- [ ] **NEW-01**: session_absolute_lifetime과 session_max_renewals가 Sessions > Settings 탭에 신규 노출된다
- [ ] **NEW-02**: WalletConnect Relay URL이 Wallets > WalletConnect 탭에 신규 노출된다
- [ ] **NEW-03**: Oracle cross_validation_threshold가 System 페이지에 신규 노출된다

### 설정 검색

- [ ] **SRCH-01**: 헤더에 설정 검색 아이콘이 표시되고 Ctrl+K/Cmd+K 단축키로 검색 팝오버가 열린다
- [ ] **SRCH-02**: 모든 설정 항목의 label+description을 정적 인덱스로 검색하여 결과를 표시한다
- [ ] **SRCH-03**: 검색 결과 클릭 시 해당 페이지+탭으로 이동하고 해당 필드가 하이라이트된다

### Breadcrumb

- [x] **BCMB-01**: 탭이 있는 5개 페이지에서 PageHeader 상단에 breadcrumb(페이지명 > 탭명)이 표시된다
- [x] **BCMB-02**: Dashboard와 System 페이지에서는 breadcrumb이 표시되지 않는다
- [x] **BCMB-03**: breadcrumb의 페이지명 클릭 시 첫 번째 탭으로 이동한다

### FieldGroup

- [ ] **FGRP-01**: FieldGroup 컴포넌트가 fieldset+legend 시맨틱 래퍼로 생성된다
- [ ] **FGRP-02**: Sessions > Settings 탭에서 Lifetime/Rate Limits 2개 그룹으로 필드가 그룹화된다
- [ ] **FGRP-03**: Notifications > Settings 탭에서 Telegram/Other Channels 그룹으로 필드가 그룹화된다
- [ ] **FGRP-04**: Security > AutoStop Rules 탭에서 Activity Detection/Idle Detection 그룹으로 필드가 그룹화된다

### 페이지/항목 설명

- [x] **DESC-01**: PageHeader에 subtitle 영역이 추가되고 모든 7개 페이지에 설명 텍스트가 표시된다
- [ ] **DESC-02**: FormField 컴포넌트에 description prop이 추가되고 Settings 탭의 각 필드 아래에 help text가 렌더링된다

### 미저장 경고

- [ ] **DIRTY-01**: dirty 상태에서 탭 전환 시 3버튼 확인 다이얼로그(저장 후 이동/저장 없이 이동/취소)가 표시된다
- [ ] **DIRTY-02**: dirty 상태에서 사이드바 메뉴 전환 시에도 동일한 경고 다이얼로그가 표시된다

### 문서

- [ ] **DOC-01**: README.md Admin UI 섹션이 새 7-메뉴 구조로 갱신된다

## Future Requirements

None for this milestone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| 설정 항목 검색 API | 설정 항목이 정적(수십 개)이므로 클라이언트 사이드 정적 인덱스로 충분 |
| 다크 모드 | 별도 마일스톤, 현재 CSS Variables 기반으로 향후 확장 가능 |
| 설정 가져오기/내보내기 | 현재 config.toml + DB 백업으로 충분 |
| 멀티 언어 Admin UI | 현재 영어 전용, i18n은 별도 마일스톤 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MENU-01 | Phase 183 | Pending |
| MENU-02 | Phase 183 | Pending |
| MENU-03 | Phase 183 | Pending |
| TAB-01 | Phase 182 | Pending |
| TAB-02 | Phase 183 | Pending |
| TAB-03 | Phase 183 | Pending |
| TAB-04 | Phase 183 | Pending |
| TAB-05 | Phase 183 | Pending |
| TAB-06 | Phase 184 | Pending |
| SEC-01 | Phase 183 | Pending |
| SEC-02 | Phase 183 | Pending |
| SEC-03 | Phase 183 | Pending |
| SEC-04 | Phase 183 | Pending |
| SYS-01 | Phase 183 | Pending |
| SYS-02 | Phase 183 | Pending |
| DIST-01 | Phase 184 | Pending |
| DIST-02 | Phase 184 | Pending |
| DIST-03 | Phase 184 | Pending |
| DIST-04 | Phase 184 | Pending |
| DIST-05 | Phase 184 | Pending |
| DIST-06 | Phase 184 | Pending |
| NEW-01 | Phase 184 | Pending |
| NEW-02 | Phase 184 | Pending |
| NEW-03 | Phase 184 | Pending |
| SRCH-01 | Phase 185 | Pending |
| SRCH-02 | Phase 185 | Pending |
| SRCH-03 | Phase 185 | Pending |
| BCMB-01 | Phase 182 | Complete |
| BCMB-02 | Phase 182 | Complete |
| BCMB-03 | Phase 182 | Complete |
| FGRP-01 | Phase 182 | Pending |
| FGRP-02 | Phase 184 | Pending |
| FGRP-03 | Phase 184 | Pending |
| FGRP-04 | Phase 184 | Pending |
| DESC-01 | Phase 182 | Complete |
| DESC-02 | Phase 182 | Pending |
| DIRTY-01 | Phase 185 | Pending |
| DIRTY-02 | Phase 185 | Pending |
| DOC-01 | Phase 186 | Pending |

**Coverage:**
- v2.3 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0

---
*Requirements defined: 2026-02-18*
*Last updated: 2026-02-18 after roadmap creation*
