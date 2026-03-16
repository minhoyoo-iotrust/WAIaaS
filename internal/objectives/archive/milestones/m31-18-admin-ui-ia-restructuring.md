# 마일스톤 m31-18: Admin UI IA 재구조화

- **Status:** SHIPPED
- **Milestone:** v31.18
- **Completed:** 2026-03-15

## 목표

Admin UI 사이드바의 17개 플랫 메뉴를 **5개 섹션 헤더**로 그룹화하고, 추상화 수준이 불일치하는 페이지를 병합·분리하며, 지갑 상세의 8개 탭을 4개로 재구성하고(Owner를 Overview에 통합하여 핵심 기능 강조), 레거시 파일을 정리하여 **일관된 정보 구조(IA)**를 확보한다.

> **선행**: 없음 (Admin UI 자체 리팩터, 백엔드 변경 없음)
> **참조**: `packages/admin/src/components/layout.tsx`, `packages/admin/src/pages/`
> **선례**: v2.3 "Admin UI 기능별 메뉴 재구성" (Phases 182-187)

---

## 배경

### 현재 사이드바 (17개 플랫)

```
Dashboard / Wallets / Transactions / Sessions / Tokens / DeFi / Hyperliquid
/ Polymarket / Agent Identity / Credentials / RPC Proxy / Policies
/ Notifications / Human Wallet Apps / Security / Audit Logs / System
```

### 문제점

| 문제 | 구체 사례 |
|------|-----------|
| **추상화 불일치** | DeFi(카테고리) vs Hyperliquid·Polymarket(특정 프로토콜)이 같은 레벨 |
| **설정 이중화** | Hyperliquid enable/disable이 DeFi 페이지 + Hyperliquid Settings 탭에 모두 존재 |
| **섹션 구분 없음** | 17개 항목이 그룹 없이 나열, 인지 부하 큼 |
| **고아 항목** | Tokens, Credentials, RPC Proxy가 맥락 없이 독립 |
| **그룹핑 근거 부재** | Agent Identity(지갑 온체인 신원)와 Credentials(시크릿 저장소)는 도메인이 다름 |
| **네이밍** | "Human Wallet Apps" 어색, "DeFi" 페이지는 실제로 프로바이더 설정 페이지 |
| **탭 구현 불일치** | Hyperliquid/Polymarket만 커스텀 탭, 나머지는 TabNav 컴포넌트 사용 |
| **지갑 상세 탭 과다** | 8개 탭(Overview/Transactions/Owner/Staking/NFTs/Credentials/External Actions/MCP) — Owner가 핵심 기능인데 별도 탭에 숨겨져 발견성 낮음 |
| **레거시 파일 잔류** | `telegram-users.tsx`, `walletconnect.tsx`가 독립 페이지로 남아있으나 라우터에서 미사용 |

---

## 설계: 목표 IA

### 사이드바 구조

섹션 헤더(소문자 라벨 + 구분선)로 시각적 그룹핑. 모든 항목이 항상 노출되어 원클릭 접근 가능.

```
Dashboard

── WALLETS ──────────────────────────────────────────────
  Wallets                  탭: Wallets / Tokens / RPC Endpoints / WalletConnect
    └ Detail               탭: Overview / Activity / Assets / Setup
  Transactions             탭: History / Incoming Monitor
  Sessions                 탭: Active / Settings
  Agent Identity           탭: Identity / Registration / Reputation

── TRADING ──────────────────────────────────────────────
  Providers                단일 — 모든 프로바이더 설정의 SSoT
  Hyperliquid              탭: Overview / Orders / Spot / Sub-accounts
  Polymarket               탭: Overview / Markets / Orders / Positions

── SECURITY ─────────────────────────────────────────────
  Policies                 탭: Rules / Defaults
  Protection               탭: Kill Switch / AutoStop / Session Invalidation
                                / Master Password
  Audit Logs               단일

── CHANNELS ─────────────────────────────────────────────
  Notifications            탭: Channels & Logs / Telegram / Settings
                                / Balance Monitor
  Wallet Apps              단일

── SYSTEM ───────────────────────────────────────────────
  Credentials              단일
  Settings                 탭: General / API Keys / RPC Proxy
```

### 지갑 상세 탭 재구성 (8 → 4)

Owner 등록은 WAIaaS의 핵심 보안 기능이지만, 현재는 8개 탭 중 하나에 숨겨져 발견성이 낮다. Owner를 Overview에 통합하여 지갑을 열면 **항상** 오너 상태가 보이도록 하고, 나머지 탭을 역할별로 병합한다.

```
AS-IS (8 tabs):
  Overview | Transactions | Owner | Staking | NFTs | Credentials | External Actions | MCP

TO-BE (4 tabs):
  Overview | Activity | Assets | Setup
```

| 새 탭 | 병합 대상 | 내용 |
|--------|-----------|------|
| **Overview** | Overview + **Owner** | 지갑 메타데이터 + **Owner Protection 카드(항상 노출)** + 잔액 + 네트워크 |
| **Activity** | Transactions + External Actions | Onchain 트랜잭션과 External Action 이력 통합, 필터로 구분 |
| **Assets** | Staking + NFTs | 스테이킹 포지션 섹션 + NFT 갤러리 섹션 |
| **Setup** | Credentials + MCP | 일회성 설정 항목 통합 |

#### Owner Protection 카드 (Overview 내 배치)

Overview 탭의 Wallet Info 바로 아래에 Owner Protection 카드를 배치하여, 지갑을 열면 즉시 오너 상태를 확인할 수 있도록 한다.

**오너 미등록 시** — 경고 배너 + CTA:
```
┌─ ⚠ Owner Protection: Not Registered ──────────────────┐
│ Transactions execute without human approval.           │
│ Register an owner to enable secure approval            │
│ via SIWE/SIWS.                                         │
│                                   [ Register Owner → ] │
└────────────────────────────────────────────────────────┘
```

**오너 등록 완료 시** — 상태 요약 + 관리 링크:
```
┌─ ✓ Owner Protection: LOCKED ──────────────────────────┐
│ Approval: SIWE    Address: 0x1234…5678                │
│ Grace Period: expired                                  │
│                                         [ Manage → ]   │
└────────────────────────────────────────────────────────┘
```

"Register Owner" / "Manage" 클릭 시 인라인 확장 또는 모달로 기존 Owner 탭의 전체 등록/관리 플로우를 표시한다.

### 그룹핑 근거

| 섹션 | 원칙 | 포함 항목과 이유 |
|------|------|-----------------|
| **Wallets** | "지갑과 관련된 모든 것" | Wallets(지갑 자체), Transactions(지갑 활동), Sessions(지갑 접근), Agent Identity(지갑 온체인 신원) |
| **Trading** | "DeFi 설정과 포지션 모니터링" | Providers(프로바이더 설정 SSoT), Hyperliquid(포지션 대시보드), Polymarket(포지션 대시보드) |
| **Security** | "접근 제어, 보호, 감사" | Policies(규칙), Protection(긴급 대응), Audit Logs(감사 기록) |
| **Channels** | "외부 알림과 서명 채널" | Notifications(알림 채널), Wallet Apps(서명/알림 앱) |
| **System** | "데몬 인프라 설정" | Credentials(시크릿 저장소), Settings(데몬 설정+API Keys+RPC Proxy) |

### 변경 매핑

| AS-IS | TO-BE | 변경 내용 |
|-------|-------|-----------|
| Dashboard | Dashboard | 변경 없음 |
| Wallets (탭: Wallets/RPC Endpoints/WalletConnect) | Wallets (탭: Wallets/**Tokens**/RPC Endpoints/WalletConnect) | **Tokens 페이지 탭으로 병합** |
| Transactions (탭: All Transactions/Monitor) | Transactions (탭: History/Incoming Monitor) | 탭 라벨 정리 |
| Sessions | Sessions | Wallets 섹션으로 이동 |
| Tokens | ~~삭제~~ → Wallets 탭으로 병합 | 독립 페이지 제거 |
| DeFi | **Providers** (리네이밍) | 실제 역할에 맞는 이름 |
| Hyperliquid (탭 5개) | Hyperliquid (탭 4개, **Settings 제거**) | 설정은 Providers에서만, TabNav 통일 |
| Polymarket (탭 5개) | Polymarket (탭 4개, **Settings 제거**) | 설정은 Providers에서만, TabNav 통일 |
| Agent Identity | Agent Identity | **Wallets 섹션으로 이동** |
| Credentials | Credentials | **System 섹션으로 이동** |
| RPC Proxy | ~~삭제~~ → System Settings 탭으로 병합 | 독립 페이지 제거 |
| Policies (탭: Policies/Settings) | Policies (탭: **Rules/Defaults**) | 탭 라벨 정리 |
| Notifications | Notifications | Channels 섹션으로 이동 |
| Human Wallet Apps | **Wallet Apps** (리네이밍) | Channels 섹션으로 이동 |
| Security (탭 4개) | **Protection** (리네이밍) | Security 섹션 이름과 구분 |
| Audit Logs | Audit Logs | Security 섹션으로 이동 |
| System | System > **Settings** (탭: General/API Keys/RPC Proxy) | RPC Proxy 탭 추가, 리네이밍 |

### 레거시 라우트 리다이렉트

| 레거시 경로 | 리다이렉트 대상 |
|-------------|-----------------|
| `#/tokens` | `#/wallets` (Tokens 탭 활성) |
| `#/rpc-proxy` | `#/settings` (RPC Proxy 탭 활성) |
| `#/defi`, `#/actions` | `#/providers` |
| `#/security` | `#/protection` |
| `#/system` | `#/settings` |
| `#/wallet-apps` | 경로 유지 (라벨만 변경) |
| 기존 리다이렉트 | 유지 (`#/erc8004`→agent-identity 등) |

### 레거시 파일 정리

| 파일 | 현황 | 처리 |
|------|------|------|
| `pages/telegram-users.tsx` | default export 미사용, `TelegramUsersContent` export만 Notifications에서 사용 | default export 제거, 파일을 `components/` 또는 Notifications 탭 인라인으로 이동 |
| `pages/walletconnect.tsx` | default export 미사용, Wallets WalletConnect 탭에서 임베드 사용 | default export 제거, 파일을 `components/` 또는 Wallets 탭 인라인으로 이동 |
| `pages/tokens.tsx` | Wallets 탭으로 병합 후 불필요 | 콘텐츠를 Wallets 탭 컴포넌트로 이동, 파일 삭제 |
| `pages/rpc-proxy.tsx` | System Settings 탭으로 병합 후 불필요 | 콘텐츠를 Settings 탭 컴포넌트로 이동, 파일 삭제 |

---

## Phase 구성

### Phase 1: 섹션 사이드바 + 리네이밍 + 라우트 정리 + TabNav 통일

1. **섹션 사이드바 구현**
   - `NAV_ITEMS` 플랫 배열 → 섹션 그룹 구조 (`{ section: string | null, items: NavItem[] }[]`)
   - 섹션 헤더 라벨 렌더링 (소문자 라벨 + 상단 구분선)
   - Dashboard는 섹션 밖 독립 항목
   - 사이드바 CSS 업데이트 (섹션 헤더 스타일, 서브항목 들여쓰기)

2. **리네이밍**
   - DeFi → Providers (`/providers` 경로)
   - Human Wallet Apps → Wallet Apps (경로 유지 `/wallet-apps`)
   - Security → Protection (`/protection` 경로)
   - System → Settings (`/settings` 경로)
   - `PAGE_TITLES`, `PAGE_SUBTITLES` 일괄 업데이트

3. **라우트 정리**
   - 변경 경로에 레거시 리다이렉트 추가
   - 기존 리다이렉트(`#/settings`→dashboard) 수정

4. **TabNav 통일**
   - Hyperliquid 커스텀 탭 → TabNav 컴포넌트 전환
   - Polymarket 커스텀 탭 → TabNav 컴포넌트 전환

5. **탭 라벨 정리**
   - Transactions: "All Transactions" → "History"
   - Policies: "Policies" → "Rules"

### Phase 2: 페이지 병합 + 레거시 파일 정리

1. **Tokens → Wallets 탭 병합**
   - Wallets 페이지에 "Tokens" 탭 추가 (Wallets / **Tokens** / RPC Endpoints / WalletConnect)
   - `tokens.tsx` 콘텐츠를 Wallets 탭 컴포넌트로 이동
   - `#/tokens` → `#/wallets` 리다이렉트 (Tokens 탭 활성)
   - `pages/tokens.tsx` 삭제

2. **RPC Proxy → Settings 탭 병합**
   - Settings(구 System) 페이지를 탭 구조로 전환: **General / API Keys / RPC Proxy**
   - 기존 System 단일 콘텐츠 중 API Keys 섹션을 별도 탭으로 분리
   - `rpc-proxy.tsx` 콘텐츠를 RPC Proxy 탭으로 이동
   - `#/rpc-proxy` → `#/settings` 리다이렉트 (RPC Proxy 탭 활성)
   - `pages/rpc-proxy.tsx` 삭제

3. **레거시 페이지 파일 정리**
   - `pages/telegram-users.tsx`: default export 제거, `TelegramUsersContent` 컴포넌트를 Notifications 페이지 내부 또는 `components/`로 이동
   - `pages/walletconnect.tsx`: default export 제거, WalletConnect 컴포넌트를 Wallets 페이지 내부 또는 `components/`로 이동
   - layout.tsx에서 삭제된 페이지 import 제거

4. **Settings Search 업데이트**
   - 변경된 페이지명/경로를 Ctrl+K 검색에 반영

### Phase 3: Hyperliquid/Polymarket Settings 탭 제거 + 검증

1. **Hyperliquid Settings 탭 제거**
   - Settings 탭 제거 → 4개 탭만 유지 (Overview / Orders / Spot / Sub-accounts)
   - 페이지 상단에 "Configure in Trading > Providers" 링크 배치

2. **Polymarket Settings 탭 제거**
   - Settings 탭 제거 → 4개 탭만 유지 (Overview / Markets / Orders / Positions)
   - 페이지 상단에 "Configure in Trading > Providers" 링크 배치

3. **Providers 페이지 설정 완결성 검증**
   - Hyperliquid/Polymarket Settings 탭에만 있던 설정이 Providers 페이지에 빠짐없이 존재하는지 확인
   - 누락 설정이 있으면 Providers 페이지에 추가

4. **Skill Files 동기화**
   - `skills/admin.skill.md` 메뉴 구조 업데이트

### Phase 4: 지갑 상세 탭 재구성 (8 → 4)

1. **Overview에 Owner Protection 카드 통합**
   - Overview 탭의 Wallet Info 아래에 Owner Protection 카드 배치
   - 오너 미등록: 경고 배너 + "Register Owner" CTA 버튼
   - 오너 등록 완료: 상태 요약 (상태, 승인 방식, 주소) + "Manage" 버튼
   - 버튼 클릭 시 인라인 확장 또는 모달로 기존 Owner 탭의 등록/관리 플로우 표시
   - 기존 Owner 독립 탭 제거

2. **Activity 탭 신설 (Transactions + External Actions 병합)**
   - 기존 Transactions 탭과 External Actions 탭을 하나의 Activity 탭으로 통합
   - 탭 내 필터로 구분: Onchain / External (또는 전체 보기)
   - 기존 필터 (status, type)는 유지

3. **Assets 탭 신설 (Staking + NFTs 병합)**
   - Staking Positions 섹션 + NFT Gallery 섹션을 하나의 Assets 탭으로 통합
   - 각 섹션은 기존 UI를 그대로 유지하되, 하나의 탭 안에 순차 배치

4. **Setup 탭 신설 (Credentials + MCP 병합)**
   - Credentials 섹션 + MCP Setup 섹션을 하나의 Setup 탭으로 통합
   - 각 섹션은 기존 UI를 그대로 유지

5. **DETAIL_TABS 업데이트 및 테스트**
   - `DETAIL_TABS` 배열: 8개 → 4개 (`overview`, `activity`, `assets`, `setup`)
   - 기존 탭별 컴포넌트를 새 탭 구조에 맞게 조합
   - 관련 테스트 업데이트

---

## 수치 비교

|  | AS-IS | TO-BE |
|--|-------|-------|
| 사이드바 항목 | 17개 플랫 | 14개 (5개 섹션 그룹) |
| 섹션 | 없음 | 5개 |
| 섹션당 항목 | — | 2~4개 |
| 독립 페이지 수 | 17 (+2 레거시) | 13 |
| 지갑 상세 탭 | 8개 | 4개 |
| Owner 발견성 | 별도 탭 (클릭해야 보임) | Overview 카드 (항상 노출) |
| 설정 이중화 | Hyperliquid/Polymarket 각 2곳 | Providers 1곳 (SSoT) |
| 커스텀 탭 사용 | 2개 (Hyperliquid, Polymarket) | 0 (TabNav 통일) |
| 레거시 페이지 파일 | 2개 (telegram-users, walletconnect) | 0 |

---

## 제약 조건

1. **백엔드 변경 없음**: 순수 프론트엔드 IA 재구조화. API 엔드포인트, 데이터 모델 변경 없음.
2. **레거시 URL 호환**: 기존 북마크/링크가 깨지지 않도록 모든 변경 경로에 리다이렉트 추가.
3. **Settings Search 호환**: Ctrl+K 설정 검색에 변경된 페이지명/경로가 반영되어야 함.
4. **테스트 업데이트**: 사이드바/라우팅 관련 기존 테스트가 새 구조에 맞게 업데이트.
5. **Skill Files 동기화**: 메뉴 구조 변경 시 `skills/admin.skill.md` 업데이트 필요.

---

## 성공 기준

1. 사이드바가 5개 섹션 헤더로 시각적 그룹핑되며, 모든 항목이 원클릭 접근 가능
2. Tokens, RPC Proxy 독립 페이지가 제거되고 각각 Wallets 탭, Settings 탭으로 접근 가능
3. Hyperliquid/Polymarket에서 Settings 탭이 제거되고, 설정은 Providers 페이지에서만 관리
4. 모든 레거시 URL이 올바른 대상으로 리다이렉트
5. Hyperliquid/Polymarket이 TabNav 컴포넌트를 사용
6. 레거시 페이지 파일(`telegram-users.tsx`, `walletconnect.tsx`, `tokens.tsx`, `rpc-proxy.tsx`)이 삭제되고 콘텐츠가 적절한 위치로 이동
7. 지갑 상세 탭이 4개(Overview/Activity/Assets/Setup)로 재구성
8. Owner Protection 카드가 Overview에 항상 노출되며, 미등록 시 경고 + CTA 표시
9. 기존 기능의 누락/손실 없이 모든 관리 기능이 새 IA에서 접근 가능
