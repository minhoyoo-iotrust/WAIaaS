# 087 — AI 에이전트용 연결 프롬프트(매직워드) 복사 기능

| 필드 | 값 |
|------|-----|
| **유형** | ENHANCEMENT |
| **심각도** | MEDIUM |
| **마일스톤** | v2.3 |
| **상태** | FIXED |
| **발견일** | 2026-02-18 |

## 배경

스킬 파일은 API 레퍼런스로 동작하지만, 실제 데몬 URL·월렛 ID·세션 토큰 같은 런타임 컨텍스트를 포함하지 않음. MCP는 설정에 연결 정보가 내장되어 자동 제공되지만, 스킬 파일만 설치한 AI 에이전트는 데몬에 접근할 방법을 모름.

**해결 아이디어**: 퀵스타트 완료 시 또는 Admin UI에서, AI 에이전트에 붙여넣기만 하면 즉시 연결 가능한 "매직워드"(연결 프롬프트)를 복사할 수 있도록 제공.

## 매직워드 형식

모든 월렛의 연결 정보 + 세션 갱신 안내를 포함하는 구조화된 텍스트:

```
[WAIaaS Connection]
- URL: http://localhost:3100

Wallets:
1. solana-testnet (019c6fb6-2751-7111-b3d3-2c3a3816cf64) — solana-devnet
   Session: eyJhbGciOiJIUzI1NiIs...
2. evm-testnet (019c6fb6-2b2d-72a8-8515-235255be884d) — ethereum-sepolia
   Session: eyJhbGciOiJIUzI1NiIs...

세션이 만료되면(401 Unauthorized)
POST /v1/wallets/{walletId}/sessions/{sessionId}/renew 으로 갱신하세요.

위 정보로 WAIaaS 지갑에 연결하여 잔액을 확인하고 관리해주세요.
```

### 설계 포인트

- **전체 월렛 나열**: 단일 월렛이 아닌 생성된 모든 월렛과 각 세션 토큰을 포함. 에이전트가 멀티체인 자산을 한번에 관리 가능.
- **세션 토큰 사용**: 마스터 비밀번호 대신 세션 토큰을 포함. 스코프 제한(해당 월렛만) + 만료 시간 있으므로 안전.
- **세션 갱신 안내**: 세션 만료 시 401 에러 대응 방법과 갱신 엔드포인트를 포함하여 에이전트가 자율적으로 세션을 연장할 수 있도록 함.
- **AI 파싱 친화적**: `[WAIaaS Connection]` 블록 형식 + 번호 리스트로 AI가 구조를 쉽게 파악.

## 생성 지점

### 1. CLI quickstart 출력

`waiaas quickstart` 완료 시 생성된 모든 월렛의 매직워드 블록을 터미널에 출력:

```
✅ Quickstart complete!

📋 Copy the prompt below and paste it to your AI agent:
────────────────────────────────────────
[WAIaaS Connection]
- URL: http://localhost:3100

Wallets:
1. solana-testnet (019c6fb6-...) — solana-devnet
   Session: eyJhbG...
2. evm-testnet (019c6fb6-...) — ethereum-sepolia
   Session: eyJhbG...

세션이 만료되면(401 Unauthorized)
POST /v1/wallets/{walletId}/sessions/{sessionId}/renew 으로 갱신하세요.

위 정보로 WAIaaS 지갑에 연결하여 잔액을 확인하고 관리해주세요.
────────────────────────────────────────
```

quickstart가 생성한 월렛 목록 + 각 월렛에 대해 자동 생성된 세션 토큰을 조합하여 출력.

### 2. Admin UI 월렛 목록/상세 페이지

두 가지 진입점 제공:

#### a. 대시보드 또는 월렛 목록 — "Copy All Wallets Prompt"
- 전체 월렛의 연결 정보를 한 번에 복사
- 각 월렛별 활성 세션 토큰 포함
- 활성 세션이 없는 월렛은 새 세션 자동 생성

#### b. 월렛 상세 — "Copy Wallet Prompt"
- 해당 월렛 단일 정보만 복사
- 단일 에이전트에 특정 월렛만 연결할 때 사용

**공통 동작**:
- 클릭 시 매직워드 생성 → 클립보드 복사
- 복사 완료 시 토스트 알림 ("Agent prompt copied!")
- 세션 만료 임박 시 자동 갱신 후 최신 토큰 포함

## quickstart.skill.md 연동

quickstart.skill.md에 매직워드 인식 가이드 추가:

```markdown
## 0. 연결 정보 확인

사용자가 `[WAIaaS Connection]` 형식의 연결 정보를 제공하면,
해당 정보로 즉시 API 호출을 시작합니다:

- `URL` → API 베이스 URL
- `Wallets` → 번호 리스트에서 월렛 이름, ID, 네트워크, 세션 토큰 추출
- `Session` → Authorization: Bearer 헤더에 사용

### 세션 갱신
401 Unauthorized 응답 시:
1. 세션 토큰에서 sessionId 추출 (JWT payload의 sub 클레임)
2. POST /v1/wallets/{walletId}/sessions/{sessionId}/renew 호출
3. 응답의 새 토큰으로 이후 요청에 사용

### 연결 정보가 없는 경우
사용자에게 요청하세요:
"WAIaaS 연결 정보가 필요합니다. Admin UI 대시보드 또는
`waiaas quickstart` 완료 화면에서 'Copy Agent Prompt'로
연결 정보를 복사해서 알려주세요."
```

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/commands/quickstart.ts` | 완료 시 전체 월렛 매직워드 블록 출력 |
| `packages/admin/src/pages/Dashboard.tsx` | "Copy All Wallets Prompt" 버튼 |
| `packages/admin/src/pages/WalletDetail.tsx` | "Copy Wallet Prompt" 버튼 |
| `packages/admin/src/utils/agent-prompt.ts` | 신규 — 매직워드 텍스트 생성 유틸리티 |
| `packages/skills/skills/quickstart.skill.md` | 매직워드 인식 가이드 섹션 추가 |

## 관련 이슈

- #085 — 스킬 파일 버전 자동 동기화 + 연결 디스커버리 가이드 (디스커버리 섹션을 매직워드 인식으로 대체)
