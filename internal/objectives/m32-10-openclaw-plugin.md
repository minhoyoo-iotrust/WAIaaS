# 마일스톤 m32-10: 에이전트 스킬 정리 + OpenClaw 플러그인

- **Status:** PLANNED
- **Milestone:** v32.10

## 목표

`skills/` 디렉토리를 에이전트 전용으로 정리하고, 관리자 전용 내용은 `docs/admin-manual/`로 이동하여 관리자 매뉴얼로 제공한다. 기존 `docs/guides/`는 `docs/agent-guides/`로 이름을 변경하여 에이전트용 가이드임을 명확히 한다. 관리자 매뉴얼과 OpenClaw 플러그인 페이지를 SEO 빌드에 포함한다. 정리된 에이전트 스킬을 기반으로 OpenClaw 플러그인(`@waiaas/openclaw-plugin`)을 제작하여 npm 배포하고, 기존 OpenClaw 통합 가이드를 플러그인 방식으로 업데이트한다.

---

## 배경

### 핵심 문제

`skills/`는 AI 에이전트가 WAIaaS 사용법을 학습하기 위해 참조하는 디렉토리다. 그런데 현재 15개 스킬 중 7개가 masterAuth(관리자) 엔드포인트와 sessionAuth(에이전트) 엔드포인트를 혼합하고 있다.

**에이전트에게 미치는 영향**:
1. **호출 불가 API 시도**: masterAuth 전용 엔드포인트(지갑 생성, 정책 CRUD 등)를 세션 토큰으로 호출 → 401 실패
2. **개념 혼동**: Provider 설정, API 키 등록 등 관리자 절차를 에이전트 동선으로 오해
3. **컨텍스트 낭비**: LLM 컨텍스트에 에이전트와 무관한 관리자 정보가 로드되어 정확도 저하

### 현황

| 분류 | 파일 | 처리 |
|------|------|------|
| **순수 Admin** | `admin.skill.md`, `setup.skill.md` | `docs/admin-manual/`로 이동 |
| **순수 Agent** | `quickstart`, `nft`, `polymarket`, `rpc-proxy`, `x402`, `session-recovery` | 변경 불필요 |
| **혼합 (7개)** | `wallet`, `transactions`, `policies`, `actions`, `external-actions`, `erc8004`, `erc8128` | 관리자 내용을 `docs/admin-manual/`로 추출 |

### 문서 디렉토리 정리

기존 `docs/guides/`에는 에이전트 관련 가이드 5개가 있으나 디렉토리명에 대상이 불명확하다. 이번에 에이전트/관리자 문서 경계를 명확히 한다.

| 변경 전 | 변경 후 | 용도 |
|---------|---------|------|
| `docs/guides/` | `docs/agent-guides/` | 에이전트용 가이드 |
| (없음) | `docs/admin-manual/` | 관리자 매뉴얼 |
| `skills/` | `skills/` (정리) | 에이전트 전용 스킬 참조 |

### OpenClaw 기존 통합 가이드 현황

현재 `docs/guides/openclaw-integration.md`는 스킬 파일 기반 설정만 안내하고 있으며, Available Skills 테이블에 admin/setup 스킬이 포함되어 있다. 플러그인 제작 후 **플러그인 방식(권장)** 으로 업데이트하고, admin 스킬 참조를 제거해야 한다.

---

## 변경 범위

### 1단계: 문서 구조 정리

**`docs/guides/` → `docs/agent-guides/` 이름 변경**:
- 기존 5개 가이드 이동 (agent-self-setup, agent-skills-integration, claude-code-integration, docker-sidecar-install, openclaw-integration)
- 경로 참조 업데이트:
  - `site/index.html` — GitHub `docs/guides` 링크 → `docs/agent-guides`
  - `README.md` — 가이드 링크 4개 경로 업데이트
  - 기타 코드베이스 내 참조 확인 및 수정

**`docs/admin-manual/` 생성 — 관리자 매뉴얼**:
```
docs/admin-manual/
├── README.md                  # 관리자 매뉴얼 인덱스
├── setup-guide.md             # 설치, 초기화, 첫 시작 (← setup.skill.md)
├── daemon-operations.md       # 데몬 운영, Kill Switch, 설정, 백업 (← admin.skill.md)
├── wallet-management.md       # 지갑 CRUD, 세션 관리, Owner 설정 (← wallet.skill.md)
├── policy-management.md       # 정책 CRUD, 16 정책 타입 (← policies.skill.md)
├── defi-providers.md          # DeFi Provider 설정, API 키 (← actions.skill.md)
├── credentials.md             # Credential 관리 (← external-actions.skill.md)
├── erc8004-setup.md           # ERC-8004 Provider/레지스트리 설정 (← erc8004.skill.md)
└── erc8128-setup.md           # ERC-8128 기능 활성화, 도메인 정책 (← erc8128.skill.md)
```

### 2단계: `skills/` 에이전트 전용 정리

**관리자 전용 파일 → `docs/admin-manual/`로 이동**:
- `skills/admin.skill.md` → `docs/admin-manual/daemon-operations.md`
- `skills/setup.skill.md` → `docs/admin-manual/setup-guide.md`

**혼합 파일 7개에서 관리자 내용 추출**:

| 스킬 파일 | `docs/admin-manual/`로 추출 (masterAuth) | `skills/` 잔존 (sessionAuth) |
|-----------|------------------------------------------|------------------------------|
| `wallet.skill.md` | 지갑 CRUD, 세션 관리, MCP 토큰, Owner 관리, WalletConnect, 토큰 레지스트리 CRUD | 잔액/자산/주소/NFT 조회, connect-info, 토큰 레지스트리 조회 |
| `transactions.skill.md` | 정책 사전 설정 안내 | 전송(6 type), 서명, 트랜잭션 조회/목록, 세션 갱신 |
| `policies.skill.md` | 정책 CRUD (POST/PUT/DELETE) | 자기 정책 조회 (GET) |
| `actions.skill.md` | Provider 설정, API 키 등록, 환경변수 | DeFi 액션 실행, 포지션 조회, 프로바이더 목록 |
| `external-actions.skill.md` | Credential CRUD, 글로벌 Credential | 오프체인 액션 실행, 이력/상세 조회 |
| `erc8004.skill.md` | Provider 활성화, 레지스트리 설정, 정책 생성 | 에이전트 등록/평판/검증 실행 |
| `erc8128.skill.md` | 기능 활성화, 도메인 정책 설정 | HTTP 요청 서명/검증 |

### 사전 리서치 (3단계 선행 필수)

- **OpenClaw 플러그인 인터페이스 스펙**: 매니페스트 형식(`openclaw.plugin.json`), `register()` 함수 시그니처, 도구 등록 방식, configSchema 처리 등 실제 플러그인 시스템이 요구하는 인터페이스를 확인한 뒤 3단계 구조를 확정한다.
- **sessionAuth 도구 목록 확정**: 현행 MCP 42개 도구와 스킬 파일을 대조하여 에이전트 전용 도구 목록(~22개)의 누락/과잉 여부를 검증한다.

### 3단계: OpenClaw 플러그인 제작

**패키지 구조**:
```
packages/openclaw-plugin/
├── openclaw.plugin.json       # 매니페스트
├── package.json               # @waiaas/openclaw-plugin
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts               # register() 진입점
│   ├── tools/                 # 도구 등록 (도메인별)
│   │   ├── wallet.ts          # 잔액/자산/지갑 정보 조회
│   │   ├── transfer.ts        # 전송 (6 type)
│   │   ├── defi.ts            # DeFi 액션
│   │   ├── nft.ts             # NFT 조회/전송
│   │   └── utility.ts         # 서명, 가격, 컨트랙트 호출
│   ├── config.ts              # 설정 스키마
│   └── client.ts              # SDK 클라이언트 팩토리
└── test/
    ├── register.test.ts
    └── tools/
```

**매니페스트**:
```json
{
  "id": "waiaas",
  "name": "WAIaaS Wallet",
  "description": "AI Agent Wallet-as-a-Service — check balances, transfer tokens, execute DeFi, and more",
  "configSchema": {
    "type": "object",
    "properties": {
      "daemonUrl": {
        "type": "string",
        "description": "WAIaaS daemon URL",
        "default": "http://localhost:3000"
      },
      "sessionToken": {
        "type": "string",
        "description": "WAIaaS session token (JWT)"
      }
    },
    "required": ["daemonUrl", "sessionToken"]
  }
}
```

**노출 도구** — sessionAuth 전용 (~22개):

| 그룹 | 도구 |
|------|------|
| **Wallet** | get_wallet_info, get_balance, connect_info |
| **Transfer** | transfer, token_transfer, get_transaction, list_transactions |
| **DeFi** | swap, bridge, stake, unstake, lend, borrow, repay, withdraw_lending, get_defi_positions |
| **NFT** | list_nfts, transfer_nft |
| **Utility** | sign_message, get_price, contract_call, approve, batch |

### 4단계: CI/CD 통합 및 문서

**CI/CD**:
- `release-please-config.json`에 `packages/openclaw-plugin` 추가
- 기존 npm trusted publishing 파이프라인 재활용
- `turbo.json`에 빌드/테스트/린트 태스크 추가

**OpenClaw 통합 가이드 업데이트** (`docs/agent-guides/openclaw-integration.md`):
- **플러그인 방식 (권장)** 섹션 추가: `openclaw plugins install @waiaas/openclaw-plugin` → configSchema 설정 → 사용
- 기존 스킬 방식은 레거시로 유지하되 플러그인 방식을 상단에 배치
- Available Skills 테이블에서 admin/setup 스킬 제거, 에이전트 전용 스킬만 표시

**추가 문서**:
- `packages/openclaw-plugin/README.md`: 패키지 README
- `skills/integrations.skill.md`: OpenClaw 플러그인 사용 스킬 (에이전트용)

**SEO 페이지**:
- `docs/admin-manual/` 8개 파일을 `site/build.mjs` 빌드 대상에 추가
- 각 페이지에 frontmatter (title, description, keywords) 작성
- `docs/seo/openclaw-plugin.md`: OpenClaw 플러그인 SEO 랜딩 페이지
- `sitemap.xml`에 관리자 매뉴얼 + OpenClaw 페이지 추가
- `llms-full.txt`에 관리자 매뉴얼 내용 포함

---

## 비목표 (Non-Goals)

- OpenClaw 채널/백그라운드 서비스 플러그인
- 기존 MCP 서버 변경
- 도구 이름/스키마 커스터마이징

---

## 성공 기준

1. `skills/` 디렉토리에 masterAuth 엔드포인트가 0건 — 에이전트 전용 내용만 존재
2. `admin.skill.md`, `setup.skill.md`가 `docs/admin-manual/`로 이동됨
3. 혼합 파일 7개에서 관리자 내용이 `docs/admin-manual/`로 추출되고, 스킬에는 에이전트 내용만 잔존
4. `docs/admin-manual/` 관리자 매뉴얼 8개 파일 + 인덱스 README 작성
5. `docs/guides/`가 `docs/agent-guides/`로 이름 변경되고, `site/index.html`, `README.md` 등 참조 경로 업데이트 완료
6. `docs/agent-guides/openclaw-integration.md`에 플러그인 방식(권장) + 스킬 방식(레거시) 구조로 업데이트, admin 스킬 참조 제거
7. 관리자 매뉴얼 8개 + OpenClaw 랜딩 1개가 site 빌드 대상에 포함되어 HTML 페이지 생성
8. `sitemap.xml`, `llms-full.txt`에 신규 페이지 반영
9. `packages/openclaw-plugin` 패키지 빌드 성공, 매니페스트 유효
10. `register()` 호출 시 에이전트용 도구(~22개)만 등록
11. 플러그인이 `sessionToken`으로만 동작
12. 각 도구가 `@waiaas/sdk`를 통해 올바르게 동작
13. release-please + npm trusted publishing 자동 퍼블리시 설정 완료
14. 도구 등록 테스트 + 관리자 도구 미등록 검증 테스트 작성
