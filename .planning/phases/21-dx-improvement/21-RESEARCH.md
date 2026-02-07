# Phase 21: DX 개선 + 설계 문서 통합 - Research

**Researched:** 2026-02-07
**Domain:** CLI Developer Experience, API Error Design, MCP Architecture, Remote Access, Design Document Integration
**Confidence:** HIGH

## Summary

Phase 21은 8개 요구사항(DX-01~DX-08)을 다루며, 크게 3개 축으로 분류된다:

1. **CLI 플로우 재설계 (DX-01~DX-05)**: `waiaas init`에서 Owner 관련 단계를 제거하고 순수 인프라 초기화로 한정, `waiaas agent create --owner`로 Owner 등록 분리, `waiaas session create`가 masterAuth만으로 동작, `--quickstart` 단일 커맨드 플로우, `--dev` 모드 정의
2. **API/DX 개선 (DX-06~DX-08)**: 에러 응답에 `hint` 필드 추가, MCP 데몬 내장 옵션 검토, 원격 에이전트 접근 가이드
3. **설계 문서 통합 검증**: Phase 19-20 변경사항이 기존 11개 설계 문서(24~40번)에 일관되게 반영되도록 업데이트

이 Phase는 DESIGN 마일스톤이며, 코드가 아닌 설계 문서를 산출한다.

**Primary recommendation:** 3개 Plan으로 분할 -- (1) CLI 플로우 재설계 + DX 개선 스펙 신규 문서 작성, (2) 기존 문서 중규모 수정 3건 (28, 29/37, 40), (3) 기존 문서 소규모 수정 + 통합 일관성 검증

---

## Standard Stack

이 Phase는 코드 구현이 아닌 설계 문서 작성이므로, "standard stack"은 기존 프로젝트에서 확정된 기술 스택을 그대로 참조한다.

### Core (기존 확정)

| Library | Version | Purpose | 관련 DX 요구사항 |
|---------|---------|---------|-----------------|
| Node.js `parseArgs` | 22 builtin | CLI 인자 파싱 (commander/yargs 대체) | DX-01~05 (CLI 재설계) |
| Hono 4.x + @hono/zod-openapi | latest | API 서버 + 에러 응답 | DX-06 (hint 필드) |
| @modelcontextprotocol/sdk | ^1.0.0 | MCP Server stdio transport | DX-07 (내장 옵션 검토) |
| jose v6 | latest | JWT HS256 세션 토큰 | DX-03 (session create) |
| argon2 npm | latest | 마스터 패스워드 검증 | DX-05 (--dev 모드) |

### 신규 도입 불필요

Phase 21은 기존 스택에 새로운 라이브러리를 추가하지 않는다. 모든 DX 개선은 기존 도구의 설정/플로우 변경으로 달성 가능하다.

---

## Architecture Patterns

### Pattern 1: CLI 커맨드 분리 (DX-01, DX-02)

**현재 상태 (v0.2):**
```
waiaas init
  Step 1: 마스터 패스워드 설정
  Step 2: 첫 에이전트 생성 (선택)
  Step 3: 알림 채널 설정 (선택)
  Step 4: Owner 지갑 등록 (선택)
```
28-daemon-lifecycle-cli.md 섹션 6.1에 정의. init이 에이전트 생성과 Owner 등록까지 포함.

**v0.5 재설계 (DX-01~02):**
```
waiaas init                          # 순수 인프라 초기화만
  Step 1: 마스터 패스워드 설정
  Step 2: 디렉토리/DB/키스토어 초기화
  (에이전트 생성, Owner 등록 제거)

waiaas agent create --owner <addr>   # 에이전트 생성 + Owner 등록
  에이전트 키 생성
  agents.owner_address = <addr>       # NOT NULL, 서명 불필요
```

**핵심 변경:**
- `waiaas init`에서 Step 2 (에이전트 생성), Step 4 (Owner 등록)을 제거
- `waiaas agent create --owner` 서브커맨드가 에이전트 생성과 Owner 주소 등록을 결합
- Owner 주소는 agents.owner_address NOT NULL (52-auth-model-redesign.md)이므로 에이전트 생성 시 필수
- `--owner`에 주소만 지정, SIWS/SIWE 서명 불필요 (masterAuth implicit 범위)

**Confidence:** HIGH -- 28-daemon-lifecycle-cli.md의 현재 init 플로우와 52-auth-model-redesign.md의 agents.owner_address NOT NULL 정책에서 직접 도출.

### Pattern 2: --quickstart 단일 커맨드 (DX-04)

**설계 패턴:**
```bash
waiaas init --quickstart \
  --agent-name my-bot \
  --chain solana \
  --network devnet \
  --owner <owner_address>

# 단일 커맨드로:
# 1. waiaas init (인프라 초기화 + 마스터 패스워드 자동 생성)
# 2. waiaas start (데몬 시작)
# 3. waiaas agent create --owner <addr> (에이전트 생성)
# 4. waiaas session create (세션 토큰 발급)
# => 세션 토큰 출력
```

**핵심 결정사항:**
- `--quickstart`는 `init` 서브커맨드의 플래그로 구현 (별도 커맨드 아님)
- 마스터 패스워드는 자동 생성 후 표시 (또는 `WAIAAS_MASTER_PASSWORD` 환경변수 사용)
- 데몬을 foreground로 시작하고 세션 토큰 발급까지 완료
- 결과: 세션 토큰이 stdout에 출력되어 환경변수로 바로 설정 가능

**Confidence:** HIGH -- DX-04 요구사항과 28-daemon-lifecycle-cli.md의 기존 init/start 플로우에서 도출.

### Pattern 3: --dev 모드 (DX-05)

**설계 패턴:**
```bash
waiaas start --dev

# 동작:
# 1. 고정 마스터 패스워드 ("waiaas-dev") 사용 -- 프롬프트 없음
# 2. 키스토어가 dev 모드 패스워드로 잠금 해제
# 3. 로그 레벨 debug 자동 설정
# 4. 시작 배너에 "DEV MODE - NOT FOR PRODUCTION" 경고 출력
```

**핵심 결정사항:**
- `--dev`는 `start` 서브커맨드의 플래그
- 내부적으로 `WAIAAS_MASTER_PASSWORD=waiaas-dev` 설정과 동등
- 기존 `--daemon` 플래그와 조합 가능: `waiaas start --dev --daemon`
- config.toml `[daemon].dev_mode = true`로도 설정 가능 (영구 dev 환경)
- **보안 경고**: --dev 모드에서는 시작 시 경고 배너 출력, 감사 로그에 `dev_mode=true` 기록

**Confidence:** HIGH -- 28-daemon-lifecycle-cli.md의 마스터 패스워드 해석 우선순위(env > file > stdin)와 호환.

### Pattern 4: waiaas session create (DX-03)

**현재 상태 (v0.2):**
- `POST /v1/sessions`는 ownerAuth(body 내 SIWS/SIWE 서명) 필요
- CLI에서 세션 생성 시 Owner 지갑 서명이 필요

**v0.5 변경 (이미 완료):**
- 52-auth-model-redesign.md에서 `POST /v1/sessions`의 인증을 masterAuth(implicit)로 변경 완료
- DX-03은 이 변경을 CLI 커맨드 레벨에 반영하는 것

**CLI 인터페이스:**
```bash
waiaas session create [options]

Options:
  --agent <name|id>       대상 에이전트 (필수)
  --expires-in <seconds>  만료 시간 (기본: 86400 = 24시간)
  --max-amount <amount>   최대 거래 금액
  --output <format>       출력 형식: token (기본), json, env
```

**핵심:** masterAuth implicit이므로 데몬이 실행 중이면 추가 인증 없이 세션 생성 가능. CLI는 `http://127.0.0.1:3100/v1/sessions`에 POST 요청만 전송하면 됨.

**Confidence:** HIGH -- 52-auth-model-redesign.md 섹션 4.2 #9에서 이미 ownerAuth -> masterAuth(implicit) 변경 확정.

### Pattern 5: hint 필드 에러 응답 (DX-06)

**현재 에러 응답 (29-api-framework-design.md):**
```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "잔액이 부족합니다",
    "details": { "required": "1000000000", "available": "500000000" },
    "requestId": "req_...",
    "retryable": false
  }
}
```

**v0.5 확장 (DX-06):**
```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "잔액이 부족합니다",
    "details": { "required": "1000000000", "available": "500000000" },
    "requestId": "req_...",
    "retryable": false,
    "hint": "에이전트 지갑에 SOL을 입금하세요. 주소: 7xKXtg2..."
  }
}
```

**hint 필드 설계 원칙:**
- `hint`는 optional string 필드 (모든 에러에 존재하는 것은 아님)
- "다음에 무엇을 해야 하는가"를 안내하는 문구 (actionable guidance)
- SDK/MCP에서 LLM에 전달하여 에이전트가 자율 판단할 수 있도록 지원
- 주요 에러 코드별 hint 맵을 ErrorResponseSchema 확장으로 정의

**Confidence:** HIGH -- 29-api-framework-design.md ErrorResponseSchema에 `hint` 필드 추가는 backward-compatible (optional).

### Pattern 6: MCP 데몬 내장 옵션 (DX-07)

**현재 상태:**
- MCP Server는 별도 `@waiaas/mcp` 패키지 (38-sdk-mcp-interface.md 섹션 5)
- stdio transport, Claude Desktop에서 별도 프로세스로 실행
- `WAIAAS_SESSION_TOKEN` 환경변수로 세션 토큰 전달

**검토 옵션 A: 데몬 내장 MCP (Streamable HTTP)**
```
waiaas start --mcp

# 데몬이 HTTP API(3100) + MCP Streamable HTTP(3101) 동시 서빙
# 별도 MCP 프로세스 불필요
```
- 장점: 세션 토큰 전달 불필요 (데몬 내부에서 직접 서비스 호출), 프로세스 1개 관리
- 단점: Streamable HTTP transport가 MCP spec 2025-03-26에서 도입, @modelcontextprotocol/sdk 1.10.0+ 필요. 데몬 프로세스 비대화. Claude Desktop은 stdio를 선호.

**검토 옵션 B: 현행 유지 (별도 stdio 프로세스)**
```
# Claude Desktop config
{
  "mcpServers": {
    "waiaas": {
      "command": "npx",
      "args": ["waiaas-mcp"],
      "env": { "WAIAAS_SESSION_TOKEN": "wai_sess_..." }
    }
  }
}
```
- 장점: MCP 호스트(Claude Desktop, Cursor)의 표준 배포 패턴. 이미 설계 완료.
- 단점: 세션 토큰 수동 전달 필요. 토큰 만료 시 재설정 필요.

**검토 옵션 C: 하이브리드 (데몬 내장 + stdio 호환)**
```
waiaas start --mcp-stdio

# 데몬이 내부적으로 MCP Server를 생성하고 stdio로 연결
# stdin/stdout으로 MCP 프로토콜 통신
# 세션 토큰 불필요 (데몬 내부 직접 호출)
```
- 장점: Claude Desktop에서 데몬을 직접 MCP Server로 사용 가능. 세션 토큰 불필요.
- 단점: foreground 전용 (stdout이 MCP 프로토콜에 점유), 로그 출력 방식 변경 필요

**추천:** 옵션 B 유지 + 옵션 C 플래그를 미래 확장으로 정의. 현재 stdio transport가 MCP 호스트의 표준이며, 데몬 내장은 Streamable HTTP 안정화(v2 SDK Q1 2026 예상) 이후 검토가 적합.

**Confidence:** MEDIUM -- MCP SDK는 빠르게 진화 중. v1.x stdio가 현재 안정적이나, Streamable HTTP 전환은 2026 Q1 이후 재평가 필요.

### Pattern 7: 원격 에이전트 접근 (DX-08)

**현재 제약:** 데몬이 `127.0.0.1`에만 바인딩 (`z.literal('127.0.0.1')`, CORE-01).

**3가지 접근 방법 가이드:**

**1. SSH 터널 (추천)**
```bash
# 원격 서버에서:
waiaas start

# 로컬 머신에서:
ssh -L 3100:127.0.0.1:3100 user@remote-server
# 이후 http://127.0.0.1:3100 으로 접근 가능
```
- 장점: 추가 인프라 불필요, 기존 SSH 인증 재사용, 암호화 보장
- 적합: 1:1 관계의 개발자-서버 접근

**2. VPN (WireGuard)**
```bash
# WireGuard VPN 설정 후 VPN 네트워크 내에서 접근
# 데몬은 여전히 127.0.0.1에 바인딩
# SSH 터널과 유사하게 로컬 포워딩 사용
```
- 장점: 다중 서비스 접근, 상시 연결
- 적합: 팀 환경, 여러 서비스를 VPN 내에서 운영

**3. --expose 플래그 (향후 검토)**
```bash
waiaas start --expose 0.0.0.0
# 또는
waiaas start --expose 10.0.0.0/24

# 데몬이 지정된 인터페이스에 바인딩
# 이 경우 masterAuth explicit 강제 적용 (implicit 비활성화)
```
- 장점: SSH/VPN 없이 직접 접근 가능
- 단점: localhost 보안 모델 붕괴, masterAuth implicit 사용 불가
- **보안 요구사항**: --expose 시 masterAuth implicit을 비활성화하고 모든 엔드포인트에 explicit 인증 필요. 또는 mTLS 도입 필요 (Out of Scope으로 명시됨).
- 추천: Phase 21에서는 스펙만 정의하고 "SSH 터널/VPN 가이드"를 기본 제공. --expose는 위험성을 문서화하되 구현은 미래 Phase로 위임.

**Confidence:** HIGH -- SSH 터널은 표준 패턴이며, 프로젝트의 localhost 바인딩 정책과 완전히 호환.

---

## Don't Hand-Roll

Phase 21은 설계 문서 작성 Phase이므로, "hand-roll 하지 말 것" 항목은 설계 패턴 관점에서 정의한다.

| 문제 | 하지 말 것 | 대신 사용 | 이유 |
|------|-----------|-----------|------|
| CLI 커맨드 확장 | 새 CLI 프레임워크 도입 | `util.parseArgs` 확장 (기존 패턴) | CORE-05 결정: 제로 의존성 CLI |
| hint 필드 | 새 에러 응답 포맷 | ErrorResponseSchema에 hint 추가 | backward-compatible 확장 |
| MCP 내장 | 커스텀 프로토콜 | @modelcontextprotocol/sdk stdio | 표준 MCP 프로토콜 사용 |
| 원격 접근 | mTLS/커스텀 프록시 | SSH 터널 가이드 | Out of Scope 명시, 가장 안전한 표준 패턴 |

---

## Common Pitfalls

### Pitfall 1: init에 너무 많은 것을 넣는 함정

**What goes wrong:** init이 인프라 초기화 + 에이전트 생성 + Owner 등록을 모두 포함하면, 단계가 실패했을 때 부분 초기화 상태가 발생.
**Why it happens:** "원스텝 설정" 편의성을 추구하다가 책임이 혼합됨.
**How to avoid:** init = 순수 인프라 (디렉토리 + DB + 키스토어). 에이전트 생성은 별도 커맨드. --quickstart가 이 두 단계를 오케스트레이션.
**Warning signs:** init 실패 후 "waiaas init --force" 없이 재시도 불가능한 상황.

### Pitfall 2: --dev 모드의 보안 경계 불명확

**What goes wrong:** --dev 모드가 프로덕션에서 실수로 사용됨.
**Why it happens:** 환경변수나 config.toml에 dev_mode가 남아있는 채로 배포.
**How to avoid:** (1) --dev 모드 시작 시 매 요청 응답에 `X-WAIaaS-Dev-Mode: true` 헤더 추가. (2) 시작 배너에 대형 경고. (3) 감사 로그에 dev_mode 기록.
**Warning signs:** 프로덕션 로그에서 dev_mode=true 감지.

### Pitfall 3: --quickstart의 마스터 패스워드 노출

**What goes wrong:** quickstart가 자동 생성한 패스워드가 터미널 히스토리나 로그에 남음.
**Why it happens:** 패스워드를 stdout에 출력하면 파이프나 로그에 캡처됨.
**How to avoid:** (1) 패스워드를 파일로 저장 (`~/.waiaas/.master-password`). (2) 화면에는 마스킹 후 일부만 표시. (3) 클립보드 복사 옵션. (4) 환경변수 설정 안내.
**Warning signs:** 터미널 히스토리에서 패스워드 검색 가능.

### Pitfall 4: 설계 문서 통합 시 불일치 잔존

**What goes wrong:** 11개 문서 중 일부만 업데이트되어 v0.2 / v0.5 용어 혼재.
**Why it happens:** 문서 간 교차 참조가 많아 전수 검사가 누락됨.
**How to avoid:** (1) 변경 대상 문서 전체 목록을 체크리스트로 관리. (2) 핵심 용어(ownerAuth 적용 범위, agents.owner_address, masterAuth implicit/explicit, 세션 갱신 API)별 전수 검색.
**Warning signs:** 같은 엔드포인트의 인증이 문서마다 다르게 기술됨.

### Pitfall 5: MCP 데몬 내장 시 stdout 충돌

**What goes wrong:** MCP stdio는 stdout을 JSON-RPC 메시지 전용으로 사용하는데, 데몬 로그도 stdout에 출력되면 프로토콜 깨짐.
**Why it happens:** Node.js console.log가 stdout으로 출력됨.
**How to avoid:** MCP 내장 옵션 검토 시 로그를 stderr로 리다이렉트하는 방안 명시. 현재 Phase에서는 별도 프로세스(옵션 B) 유지로 이 문제를 회피.
**Warning signs:** MCP 클라이언트에서 JSON 파싱 에러 발생.

---

## Code Examples

Phase 21은 설계 문서 Phase이므로, 코드 예시는 설계 스펙에 포함될 패턴을 보여준다.

### waiaas init (v0.5 재설계)

```typescript
// v0.5: init은 순수 인프라 초기화만
async function runInit(args: string[]): Promise<void> {
  const options = parseInitOptions(args)

  if (options.quickstart) {
    return runQuickstart(options)  // DX-04: 통합 플로우
  }

  // Step 1: 디렉토리 생성
  createDataDirectories(dataDir)

  // Step 2: 마스터 패스워드 설정
  const password = await resolveInitPassword(options)
  validatePasswordStrength(password)

  // Step 3: config.toml + DB + 키스토어 초기화
  writeDefaultConfig(dataDir)
  await initializeDatabase(dataDir)
  await initializeKeyStore(dataDir, password)

  // 에이전트 생성, Owner 등록 없음 -- DX-01
  console.log('WAIaaS initialized. Next: waiaas agent create --owner <addr>')
}
```

### waiaas agent create --owner

```typescript
// v0.5: 에이전트 생성 시 Owner 주소 필수
async function runAgentCreate(args: string[]): Promise<void> {
  const options = parseAgentCreateOptions(args)

  if (!options.owner) {
    console.error('Error: --owner <address> is required.')
    console.error('Hint: Provide the Owner wallet address (e.g., Solana base58)')
    process.exit(1)
  }

  // 데몬 API 호출 (masterAuth implicit)
  const response = await fetch(`http://127.0.0.1:${port}/v1/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: options.name,
      chain: options.chain,
      network: options.network,
      ownerAddress: options.owner,  // DX-02: 서명 불필요
    }),
  })

  const agent = await response.json()
  console.log(`Agent '${agent.name}' created (address: ${agent.address})`)
}
```

### ErrorResponseSchema 확장 (hint 필드)

```typescript
// DX-06: hint 필드 추가
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().openapi({ description: '에러 코드' }),
    message: z.string().openapi({ description: '에러 메시지' }),
    details: z.record(z.unknown()).optional(),
    requestId: z.string(),
    retryable: z.boolean().optional(),
    hint: z.string().optional().openapi({   // v0.5 추가
      description: '다음 행동을 안내하는 actionable 메시지',
      example: '에이전트 지갑에 SOL을 입금하세요. 주소: 7xKXtg2...',
    }),
  }),
}).openapi('ErrorResponse')
```

---

## State of the Art

| 영역 | Phase 19-20 이전 | Phase 19-20 이후 | Phase 21 목표 |
|------|------------------|------------------|--------------|
| init 플로우 | 4단계 (PW + Agent + Noti + Owner) | 변경 없음 (문서 미반영) | 2단계 (PW + Infra) -- DX-01 |
| 에이전트 생성 | init 내 선택적 | agents.owner_address NOT NULL 확정 | `agent create --owner` 분리 -- DX-02 |
| 세션 생성 | ownerAuth (SIWS/SIWE) | masterAuth(implicit) 확정 | CLI `session create` 반영 -- DX-03 |
| 에러 응답 | code/message/details/requestId/retryable | 변경 없음 | hint 필드 추가 -- DX-06 |
| MCP | 별도 stdio 프로세스 | 변경 없음 | 내장 옵션 검토 -- DX-07 |
| 원격 접근 | 미정의 (localhost 전용) | 변경 없음 | SSH/VPN/--expose 가이드 -- DX-08 |

---

## 설계 문서 통합 현황 분석

### Phase 19-20에서 이미 업데이트된 문서 (6건)

| # | 문서 | v0.5 반영 수준 | Phase 21 추가 작업 |
|---|------|---------------|-------------------|
| 1 | 24-monorepo-data-directory.md | 13건 v0.5 마킹 | 소규모: --dev mode config, --quickstart 언급 |
| 2 | 25-sqlite-schema.md | 43건 v0.5 마킹 | 없음 (Phase 19-20에서 완료) |
| 3 | 30-session-token-protocol.md | 10건 v0.5 마킹 | 없음 (Phase 20에서 갱신 확장 완료) |
| 4 | 34-owner-wallet-connection.md | 78건 v0.5 마킹 | 없음 (Phase 19에서 전면 업데이트) |
| 5 | 35-notification-architecture.md | 8건 Phase 20 마킹 | 없음 (Phase 20에서 갱신 알림 추가 완료) |
| 6 | 37-rest-api-complete-spec.md | 36건 v0.5 마킹 | 중규모: 섹션 5-9 업데이트 (Phase 19 위임 항목), hint 필드 반영 |

### Phase 21에서 반드시 업데이트해야 하는 문서 (5건)

| # | 문서 | v0.5 반영 수준 | 필요 변경 |
|---|------|---------------|----------|
| 7 | 28-daemon-lifecycle-cli.md | **0건** (미반영) | **중규모**: init 플로우 재설계, agent create 커맨드 추가, session create 커맨드 추가, --quickstart, --dev 플래그, 에러 출력 hint |
| 8 | 29-api-framework-design.md | **0건** (미반영) | 소-중규모: ErrorResponseSchema hint 필드, authRouter 참조 추가 (이미 52에서 정의되었으므로 참조 링크) |
| 9 | 38-sdk-mcp-interface.md | **0건** (미반영) | 소규모: MCP 내장 옵션 검토 결과 기록, v0.5 인증 모델 변경에 따른 Owner SDK 업데이트, 세션 갱신 API 추가 |
| 10 | 39-tauri-desktop-architecture.md | **0건** (미반영) | 소규모: v0.5 인증 모델 참조 업데이트, Setup Wizard에서 init 플로우 반영 |
| 11 | 40-telegram-bot-docker.md | **0건** (미반영) | 중규모: v0.5 인증 모델 반영 (2-Tier auth -> 3-tier 참조), Docker 환경에서 --dev mode 주의사항 |

### 반영 불필요한 문서 (5건)

| # | 문서 | 근거 |
|---|------|------|
| 26-keystore-spec.md | 키스토어 스펙은 v0.5에서 변경 없음 (Argon2id + AES-256-GCM 동일) |
| 27-chain-adapter-interface.md | 체인 어댑터 인터페이스는 v0.5에서 변경 없음 |
| 31-solana-adapter-detail.md | Solana 어댑터 상세는 v0.5에서 변경 없음 |
| 32-transaction-pipeline-api.md | 거래 파이프라인은 v0.5에서 변경 없음 (정책 엔진 동일) |
| 33-time-lock-approval-mechanism.md | 시간 잠금 메커니즘은 v0.5에서 approval_timeout 설정만 추가 (이미 52에서 정의) |
| 36-killswitch-autostop-evm.md | Kill Switch 스펙은 v0.5에서 발동 인증만 변경 (이미 52에서 정의) |

**참고:** 33, 36 문서는 v0.5에서 인증 모델이 변경되었으나(ownerAuth -> masterAuth), 52-auth-model-redesign.md가 SSoT로 기능하므로 해당 문서에는 참조 노트만 추가하면 충분하다.

---

## 신규 문서 구조 (제안)

### CLI 플로우 재설계 문서 (54-cli-flow-redesign.md)

DX-01~DX-05 요구사항을 충족하는 단일 설계 문서.

```
1. 문서 개요 (목적, 요구사항 매핑)
2. v0.2 → v0.5 CLI 플로우 변경 요약
3. waiaas init 재설계 (DX-01)
   3.1 순수 인프라 초기화 (2단계)
   3.2 대화형/비대화형 모드
   3.3 에러 처리
4. waiaas agent create --owner (DX-02)
   4.1 인터페이스
   4.2 Owner 주소 등록 (서명 불필요)
   4.3 에이전트 키 생성 + 암호화 저장
5. waiaas session create (DX-03)
   5.1 masterAuth implicit 기반
   5.2 출력 포맷 (token/json/env)
6. waiaas init --quickstart (DX-04)
   6.1 통합 플로우 (init→start→agent→session)
   6.2 마스터 패스워드 자동 생성
   6.3 비대화형 통합 예시
7. waiaas start --dev (DX-05)
   7.1 고정 패스워드
   7.2 보안 경고 메커니즘
   7.3 config.toml dev_mode 설정
8. CLI 커맨드 전체 요약표 (v0.5)
```

### DX 개선 스펙 문서 (55-dx-improvement-spec.md)

DX-06~DX-08 요구사항을 충족하는 단일 설계 문서.

```
1. 문서 개요 (목적, 요구사항 매핑)
2. hint 필드 에러 응답 (DX-06)
   2.1 ErrorResponseSchema 확장
   2.2 주요 에러 코드별 hint 맵
   2.3 SDK/MCP 통합 패턴
3. MCP 데몬 내장 옵션 검토 (DX-07)
   3.1 옵션 A: 데몬 내장 (Streamable HTTP) -- 기각 + 근거
   3.2 옵션 B: 현행 유지 (별도 stdio) -- 채택 + 근거
   3.3 옵션 C: 하이브리드 (--mcp-stdio) -- 미래 확장 정의
   3.4 결론 및 마이그레이션 경로
4. 원격 에이전트 접근 가이드 (DX-08)
   4.1 SSH 터널 (추천)
   4.2 VPN (WireGuard)
   4.3 --expose 플래그 (위험성 문서화)
   4.4 보안 고려사항
```

---

## Open Questions

1. **--quickstart의 마스터 패스워드 처리 방식**
   - What we know: 자동 생성이 필요하며, 보안적으로 노출되면 안 됨
   - What's unclear: 파일 저장 vs 환경변수 vs 클립보드 중 최적 방안
   - Recommendation: 파일 저장 (`~/.waiaas/.master-password`, mode 0o600) + 화면 출력. 플래너가 구체적 UX 결정.

2. **33, 36 문서의 참조 노트 추가 범위**
   - What we know: 인증 모델 변경이 있으나, 52-auth-model-redesign.md가 SSoT
   - What's unclear: 참조 노트만으로 충분한지, 인라인 수정이 필요한지
   - Recommendation: 참조 노트만 추가 ("v0.5 인증 모델 변경: 52-auth-model-redesign.md 참조"). 인라인 코드 수정은 구현 Phase에서.

3. **--expose 플래그의 Phase 21 포함 범위**
   - What we know: Out of Scope에 mTLS가 명시됨
   - What's unclear: --expose 스펙 자체를 Phase 21에서 정의할지, 가이드 문서에서 "향후 검토"로만 언급할지
   - Recommendation: 가이드에 "SSH 터널/VPN 우선, --expose는 보안 위험을 수반하며 향후 Phase에서 mTLS와 함께 검토" 수준으로 정의.

---

## Sources

### Primary (HIGH confidence)

- `.planning/deliverables/52-auth-model-redesign.md` -- 3-tier 인증 모델, 31 엔드포인트 인증 맵, CLI 수동 서명, 보안 검증 (987줄)
- `.planning/deliverables/53-session-renewal-protocol.md` -- 세션 갱신 API, 5종 안전 장치, 토큰 회전, config.toml 확장 (997줄)
- `.planning/deliverables/28-daemon-lifecycle-cli.md` -- 현재 CLI 플로우 (init 4단계, start/stop/status), parseArgs 패턴
- `.planning/deliverables/29-api-framework-design.md` -- ErrorResponseSchema, 에러 응답 포맷, 미들웨어 체인
- `.planning/deliverables/37-rest-api-complete-spec.md` -- 31 엔드포인트 스펙, 인증 맵 v0.5 업데이트, 에러 코드 체계
- `.planning/deliverables/38-sdk-mcp-interface.md` -- MCP Server 6 tools, stdio transport, @modelcontextprotocol/sdk
- `.planning/deliverables/24-monorepo-data-directory.md` -- config.toml 스펙, 데이터 디렉토리 구조
- `.planning/deliverables/39-tauri-desktop-architecture.md` -- Sidecar 관리, Setup Wizard, IPC/HTTP 하이브리드
- `.planning/deliverables/40-telegram-bot-docker.md` -- 2-Tier auth, Docker 배포, Long Polling
- `.planning/phases/19-auth-owner-redesign/19-VERIFICATION.md` -- Phase 19 검증 보고서 (5/5 pass)
- `.planning/phases/20-session-renewal-protocol/20-VERIFICATION.md` -- Phase 20 검증 보고서 (8/8 pass)

### Secondary (MEDIUM confidence)

- [MCP Transports Specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) -- MCP stdio/Streamable HTTP 공식 스펙
- [Why MCP Deprecated SSE](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/) -- SSE -> Streamable HTTP 전환 배경
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) -- v1.10.0+ Streamable HTTP 지원
- [SSH Tunneling Explained](https://goteleport.com/blog/ssh-tunneling-explained/) -- SSH 터널 패턴 가이드
- [CLI DX Design Guidelines (Thoughtworks)](https://www.thoughtworks.com/insights/blog/engineering-effectiveness/elevate-developer-experiences-cli-design-guidelines) -- CLI DX 설계 원칙

### Tertiary (LOW confidence)

- MCP SDK v2 stable release는 Q1 2026 예상 (WebSearch 결과, 공식 확인 필요)

---

## Metadata

**Confidence breakdown:**
- CLI 플로우 재설계 (DX-01~05): HIGH -- 기존 28 문서의 구체적 CLI 코드와 52 문서의 인증 모델 변경에서 직접 도출
- hint 필드 (DX-06): HIGH -- 기존 ErrorResponseSchema 확장, backward-compatible
- MCP 내장 옵션 (DX-07): MEDIUM -- MCP SDK 생태계가 빠르게 진화 중, Streamable HTTP 안정성 미확인
- 원격 접근 (DX-08): HIGH -- SSH 터널은 표준 패턴, 프로젝트 아키텍처와 호환
- 설계 문서 통합: HIGH -- Phase 19-20 verification report에서 변경 범위가 명확히 문서화됨

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (설계 문서 통합이므로 30일 내 유효)
