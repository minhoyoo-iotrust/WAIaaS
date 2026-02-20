# 106 — 매직워드 대시보드 전용 카드 승격 + REST API 추가 + skills 반영

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** TBD
- **상태:** OPEN
- **등록일:** 2026-02-20

## 현상

### 1. 매직워드 가시성 부족

대시보드의 매직워드 복사 버튼(`dashboard.tsx:274-283`)이 stat-grid 아래 작은 "Copy Agent Prompt" 버튼으로만 존재한다. WAIaaS의 핵심 워크플로(에이전트에게 프롬프트를 전달하여 지갑 연결)에 비해 눈에 띄지 않는다.

### 2. 프롬프트 내용 미리보기 불가

복사 버튼만 있고, 생성될 프롬프트 텍스트를 Admin UI에서 확인할 방법이 없다. 관리자는 클립보드에 복사한 후 다른 곳에 붙여넣어야만 내용을 확인할 수 있다.

### 3. 지갑 상세와 기능 중복

대시보드에 전체 지갑 멀티 프롬프트(`buildAgentPrompt`)가 있고, 지갑 상세에 단일 지갑 프롬프트(`buildSingleWalletPrompt`)가 별도로 있다. 에이전트는 일반적으로 여러 지갑을 동시에 사용하므로 대시보드의 멀티 프롬프트가 주 경로여야 한다.

### 4. 프롬프트 안내 텍스트 한국어 하드코딩

`agent-prompt.ts`의 안내 텍스트가 한국어로 하드코딩되어 있다. 프롬프트는 AI 에이전트가 파싱하는 텍스트이므로 영어로 통일해야 한다.

### 5. REST API 부재

매직워드 생성이 Admin UI 프론트엔드(`agent-prompt.ts`)에서만 처리된다. 데몬 측에 관련 엔드포인트가 없어 CLI, SDK, 외부 자동화에서 매직워드를 얻을 수 없다.

### 6. Skills 파일에 매직워드 설명 없음

7개 skills 파일(`quickstart`, `wallet`, `transactions`, `policies`, `admin`, `actions`, `x402`) 어디에도 매직워드(연결 프롬프트)에 대한 설명이 없다. AI 에이전트가 매직워드의 구조와 사용법을 이해할 수 없다.

## 수정 범위

### 1. 매직워드 생성 REST API 추가

`POST /v1/admin/agent-prompt` (masterAuth):

- 모든 ACTIVE 지갑에 대해 세션을 자동 생성하고 매직워드 텍스트를 반환
- 특정 지갑만 선택하는 `walletIds` 옵션 파라미터 지원

요청:
```json
{
  "walletIds": ["uuid-1", "uuid-2"],
  "ttl": 86400
}
```
- `walletIds` (optional): 지정하지 않으면 모든 ACTIVE 지갑
- `ttl` (optional): 세션 TTL (기본 86400)

응답 (201):
```json
{
  "prompt": "[WAIaaS Connection]\n- URL: ...\n\nWallets:\n1. ...",
  "walletCount": 2,
  "sessionsCreated": 2,
  "expiresAt": 1707086400
}
```

### 2. 프롬프트 텍스트 영문 통일

프롬프트 안내 텍스트를 영어로 통일한다. AI 에이전트가 파싱하는 텍스트이므로 locale 분기 없이 항상 영어로 생성:

```
[WAIaaS Connection]
- URL: http://localhost:3100

Wallets:
1. MyWallet (uuid-1) — solana-devnet
   Session: eyJ...
2. EthWallet (uuid-2) — ethereum-sepolia
   Session: eyJ...

When the session expires (401 Unauthorized),
renew with POST /v1/wallets/{walletId}/sessions/{sessionId}/renew.

Connect to WAIaaS wallets using the above information to check balances and manage assets.
```

### 3. 대시보드에 매직워드 전용 카드 추가

stat-grid 아래에 전용 섹션을 추가한다:

```
┌─ Agent Connection Prompt ─────────────────────────────┐
│                                                        │
│  ⓘ Generate a connection prompt for AI agents.         │
│    Creates sessions for all active wallets.             │
│                                                        │
│  [Generate]                                            │
│                                                        │
│  ─ ─ ─ ─ ─ (생성 후) ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│                                                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │ [WAIaaS Connection]                             │  │
│  │ - URL: http://localhost:3100                    │  │
│  │                                                 │  │
│  │ Wallets:                                        │  │
│  │ 1. MyWallet (uuid-1) — solana-devnet            │  │
│  │    Session: eyJ...                              │  │
│  │ 2. EthWallet (uuid-2) — ethereum-sepolia        │  │
│  │    Session: eyJ...                              │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  [Copy to Clipboard]                                   │
└────────────────────────────────────────────────────────┘
```

- 초기 상태: 설명 텍스트 + "Generate" 버튼
- 생성 후: 프롬프트 전문을 읽기 전용 코드 블록으로 표시 + "Copy to Clipboard" 버튼
- ACTIVE 지갑이 없으면 "No active wallets" 안내
- 대시보드의 새 API `POST /v1/admin/agent-prompt` 호출
- 기존 소형 버튼(`dashboard.tsx:274-283`) 및 프론트엔드 세션 생성 로직 제거

### 4. 지갑 상세에서 매직워드 복사 버튼 제거

- `wallets.tsx:543-550`의 "Copy Agent Prompt" 버튼 제거
- `wallets.tsx:453-490`의 `handleCopyAgentPrompt` 핸들러 제거
- `wallets.tsx:232`의 `promptLoading` signal 제거
- `wallets.tsx:27`의 `buildSingleWalletPrompt` import 제거

### 5. `buildSingleWalletPrompt` 함수 삭제

`agent-prompt.ts`에서 `buildSingleWalletPrompt` 함수를 삭제한다. 프롬프트 생성 로직은 데몬 서버 측으로 이동하고, Admin UI는 서버 응답의 `prompt` 필드를 그대로 표시한다. `agent-prompt.ts` 파일 자체를 삭제할 수 있다.

### 6. Skills 파일에 매직워드 섹션 추가

**`quickstart.skill.md`**: 매직워드 섹션을 추가하여 AI 에이전트가 연결 프롬프트의 구조와 사용법을 이해할 수 있도록 한다:

- `[WAIaaS Connection]` 블록 구조 설명
- 각 필드(URL, Wallets, Session)의 의미
- 매직워드를 받았을 때 파싱하여 연결하는 방법

**`admin.skill.md`**: `POST /v1/admin/agent-prompt` API 레퍼런스 추가

### 영향 범위

- `packages/daemon/src/api/routes/admin.ts` — 새 엔드포인트 추가
- `packages/daemon/src/api/routes/openapi-schemas.ts` — 요청/응답 스키마
- `packages/admin/src/pages/dashboard.tsx` — 기존 버튼 제거, 전용 카드 섹션 추가
- `packages/admin/src/pages/wallets.tsx` — 매직워드 버튼/핸들러/signal/import 제거
- `packages/admin/src/utils/agent-prompt.ts` — 삭제 (서버 측으로 이동)
- `packages/admin/src/__tests__/wallets-coverage.test.tsx` — 관련 테스트 제거/수정
- `skills/quickstart.skill.md` — 매직워드 섹션 추가
- `skills/admin.skill.md` — `POST /v1/admin/agent-prompt` API 추가

## 테스트 항목

### 단위 테스트
1. `POST /v1/admin/agent-prompt` — 전체 ACTIVE 지갑 프롬프트 생성 확인
2. `POST /v1/admin/agent-prompt` — `walletIds` 지정 시 해당 지갑만 포함 확인
3. `POST /v1/admin/agent-prompt` — ACTIVE 지갑이 없을 때 빈 프롬프트 또는 에러 응답 확인
4. `POST /v1/admin/agent-prompt` — masterAuth 없이 호출 시 401 확인
5. 프롬프트 텍스트가 영문으로 생성되는지 확인 (한국어 텍스트 없음)
6. 대시보드 매직워드 카드가 렌더링되는지 확인
7. "Generate" 클릭 시 프롬프트 텍스트가 코드 블록에 표시되는지 확인
8. "Copy to Clipboard" 클릭 시 클립보드에 복사되는지 확인
9. 지갑 상세 페이지에 "Copy Agent Prompt" 버튼이 없는지 확인
