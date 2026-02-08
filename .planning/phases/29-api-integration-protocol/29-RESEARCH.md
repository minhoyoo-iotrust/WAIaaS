# Phase 29: API 통합 프로토콜 완성 - Research

**Researched:** 2026-02-08
**Domain:** REST API, SDK, Tauri Desktop, CLI 통합 프로토콜 완성
**Confidence:** HIGH

## Summary

Phase 29는 v0.7 목표 중 "Phase D: API & 통합 프로토콜 완성"에 해당하는 7개 구현 장애 요소(D-1~D-7)를 해소한다. Phase 27(Rate Limiter/killSwitch 변경)과 Phase 28(SIWE viem 전환)의 결과를 반영하면서, Tauri sidecar 종료 타임아웃, CORS Origin, Owner disconnect cascade, TransactionType 응답 status, Setup Wizard CLI 위임, Python SDK snake_case SSoT, Zod 스키마 export 패턴을 확정한다.

기존 설계 문서 9개(24, 28, 29, 32, 34, 37, 38, 39, 54)를 직접 수정하는 방식이며, 새로운 문서는 생성하지 않는다. 모든 변경에 `[v0.7 보완]` 태그를 부착하여 추적 가능하게 한다.

**Primary recommendation:** 3개 plan으로 분리하여 진행. Plan 29-01(Tauri 관련 3개 요구사항), Plan 29-02(Owner disconnect + Transaction status 2개), Plan 29-03(Python SDK + Zod export 2개).

---

## Standard Stack

이 Phase는 기존 설계 문서를 보완하는 작업이므로 새로운 라이브러리를 도입하지 않는다. 아래는 참조하는 기존 기술 스택이다.

### Core (기존 확정)

| Library | Version | Purpose | 관련 Req |
|---------|---------|---------|----------|
| Tauri 2.x | 2.1.0+ | Desktop 앱 프레임워크, sidecar 관리 | API-01, API-02, API-05 |
| better-sqlite3 | 12.x | SQLite 바인딩 (integrity_check) | API-01 |
| Hono 4.x | 4.x | HTTP API 프레임워크, CORS 미들웨어 | API-02 |
| Pydantic | 2.x | Python SDK 모델 정의 | API-06 |
| Zod | 3.x | TypeScript SSoT 스키마 | API-07 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pydantic.alias_generators` | 2.x 내장 | `to_camel` alias generator | Python SDK snake_case SSoT (API-06) |
| `@waiaas/core` | workspace | Zod 스키마 export 패키지 | TS SDK 사전 검증 (API-07) |

---

## Architecture Patterns

### Pattern 1: Tauri Sidecar Graceful Shutdown (API-01)

**What:** Tauri sidecar 종료 시 충분한 타임아웃을 부여하고, 비정상 종료 시 다음 시작에서 SQLite integrity_check를 수행한다.

**현재 문제:** 39-tauri-desktop-architecture.md 섹션 4.2에서 `POST /v1/admin/shutdown -> 5초 대기 -> SIGTERM`으로 설계되어 있다. 데몬의 graceful shutdown이 최대 30초 소요되므로 5초 내 강제 종료 시 SQLite WAL 파일 손상 위험이 있다.

**해결 패턴:**

```
POST /v1/admin/shutdown -> 35초 대기 -> SIGTERM -> 5초 대기 -> SIGKILL
```

**Confidence:** HIGH -- 28-daemon-lifecycle-cli.md에서 `shutdown_timeout = 30`이 명확히 정의되어 있고, Tauri의 sidecar 종료는 Rust에서 수동 구현하므로 타임아웃 조정이 자유롭다.

**SQLite integrity_check 패턴:**

```typescript
// better-sqlite3 사용
const result = db.pragma('integrity_check')
// result[0].integrity_check === 'ok' 이면 정상
// 비정상이면 WAL 체크포인트 강제 실행
if (result[0].integrity_check !== 'ok') {
  db.pragma('wal_checkpoint(TRUNCATE)')
}
```

**Confidence:** HIGH -- SQLite 공식 문서에서 `PRAGMA integrity_check`는 데이터베이스 전체 무결성을 확인한다고 명시. `PRAGMA quick_check`는 O(N)으로 빠르지만 인덱스 검증이 없으므로, 비정상 종료 후에는 `integrity_check`가 적절하다.

**주의사항:**
- `integrity_check`는 대형 DB에서 O(NlogN) 시간이 소요된다. WAIaaS의 SQLite DB는 로컬 에이전트용으로 소규모이므로 문제없다.
- Tauri `RunEvent::Exit`는 child process kill 전에 발생하므로, 이 이벤트에서 graceful shutdown HTTP 요청을 보내고 타임아웃을 기다리는 구현이 가능하다.

---

### Pattern 2: Tauri 2.x CORS Origin 플랫폼 차이 (API-02)

**What:** Tauri 2.x WebView는 플랫폼별로 서로 다른 Origin 헤더를 사용한다.

**플랫폼별 Origin:**

| 플랫폼 | Origin | 근거 |
|--------|--------|------|
| macOS (WKWebView) | `tauri://localhost` | macOS는 커스텀 프로토콜(`tauri://`) 사용 |
| Windows (WebView2) | `http://tauri.localhost` | Windows는 `http://<scheme>.localhost` 패턴 사용 (Tauri 2.1.0+) |
| Linux (WebKitGTK) | `tauri://localhost` | macOS와 동일 커스텀 프로토콜 |

**Confidence:** MEDIUM -- Tauri 2.1.0 릴리스 노트에서 `useHttpsScheme` 옵션이 추가되었고, 기본값은 `http://tauri.localhost` (Windows)이다. 그러나 macOS/Linux에서의 정확한 Origin은 `tauri://localhost`가 문서/이슈에서 일관되게 언급되지만, 공식 문서에서 명시적 표로 정리되어 있지 않다.

**핵심 발견:**
1. 기존 39-tauri-desktop-architecture.md 섹션 3.4에서는 `tauri://localhost`만 CORS 허용에 포함되어 있다.
2. v0.7 objectives에서는 Windows용 `https://tauri.localhost` 추가를 명시한다.
3. 실제 Tauri 2.1.0+ 기본값은 `http://tauri.localhost` (Windows). `useHttpsScheme: true` 설정 시 `https://tauri.localhost`.
4. 따라서 CORS 허용 목록에는 `http://tauri.localhost`와 `https://tauri.localhost` 모두를 추가하는 것이 안전하다.

**권장 CORS 설정:**

```typescript
const corsOrigins = [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
  'tauri://localhost',            // macOS, Linux
  'http://tauri.localhost',       // Windows (Tauri 2.x 기본)
  'https://tauri.localhost',      // Windows (useHttpsScheme: true)
]
```

**개발 모드 Origin 로깅:**

```typescript
// 개발 모드에서 수신된 Origin 헤더 로깅 (디버그용)
if (config.daemon.log_level === 'debug') {
  app.use('*', async (c, next) => {
    const origin = c.req.header('Origin')
    if (origin) {
      logger.debug(`[CORS] Request Origin: ${origin}`)
    }
    await next()
  })
}
```

---

### Pattern 3: Owner Disconnect Cascade (API-03)

**What:** `DELETE /v1/owner/disconnect` 엔드포인트의 cascade 동작을 에이전트별 owner_address 기준으로 정의한다.

**현재 상태:** 34-owner-wallet-connection.md에서 `DELETE /v1/owner/disconnect`가 존재하지만, cascade 동작이 상세 정의되어 있지 않다. v0.5에서 owner_address가 agents 테이블의 에이전트별 컬럼으로 변경되었으므로, disconnect는 해당 주소를 가진 에이전트들에 대해 cascade를 수행해야 한다.

**v0.7 objectives에서 확정된 5단계 cascade:**

| 순서 | 동작 | 근거 |
|------|------|------|
| 1 | 해당 Owner의 에이전트들의 APPROVAL 대기 트랜잭션 -> EXPIRED 처리 | 승인자 부재 |
| 2 | 해당 Owner의 에이전트들의 DELAY 대기 트랜잭션 -> 유지 (타이머 계속) | DELAY는 Owner 개입 불필요 |
| 3 | wallet_connections에서 해당 주소의 WalletConnect 세션 정리 | push 서명 비활성화 |
| 4 | agents.owner_address는 유지 | 주소는 에이전트 속성, 변경은 `PUT /v1/agents/:id/owner` |
| 5 | audit_log에 OWNER_DISCONNECTED 이벤트 기록 | 감사 추적 |

**Confidence:** HIGH -- v0.7 objectives에서 이미 상세히 정의되어 있으며, v0.5의 에이전트별 owner_address 구조와 정합된다.

**인증:** masterAuth (implicit) -- v0.5 변경에 의해 disconnect는 시스템 관리 작업으로 분류

**요청/응답:**

```
DELETE /v1/owner/disconnect
Auth: masterAuth (implicit)
Body: { address: string, chain: 'solana' | 'ethereum' }
Response: 200 { disconnectedAt, affectedAgents: number, expiredTransactions: number }
```

---

### Pattern 4: TransactionType x Tier HTTP Status 매트릭스 (API-04)

**What:** 5개 TransactionType(TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH) x 4 Tier(INSTANT, NOTIFY, DELAY, APPROVAL)의 HTTP 응답 status 값을 확정한다.

**v0.7 objectives에서 확정된 매트릭스:**

| 티어 | HTTP Status | 응답 body의 status | 설명 |
|------|------------|-------------------|------|
| INSTANT (성공) | 200 | `CONFIRMED` | 동기 완료 |
| INSTANT (타임아웃) | 200 | `SUBMITTED` | 30초 내 미확정, 클라이언트 폴링 필요 |
| NOTIFY | 200 | `CONFIRMED` or `SUBMITTED` | INSTANT과 동일 동작 + Owner 알림 |
| DELAY | 202 | `QUEUED` | 대기열 진입, 쿨다운 후 자동 실행 |
| APPROVAL | 202 | `QUEUED` | 대기열 진입, Owner 승인 대기 |

**핵심 원칙:** 모든 TransactionType에 동일한 응답 규칙 적용. 타입별 차이는 응답의 `type` 필드로 구분.

**Confidence:** HIGH -- v0.7 objectives에서 이미 상세 확정. 32-transaction-pipeline-api.md의 8-state 머신, 37-rest-api-complete-spec.md의 에러 코드 체계와 정합.

**수정 대상:** 37-rest-api-complete-spec.md 섹션 7 (POST /v1/transactions/send 응답), 32-transaction-pipeline-api.md 섹션 3.7

---

### Pattern 5: Setup Wizard CLI 위임 + waiaas init idempotent (API-05)

**What:** Tauri Setup Wizard는 직접 초기화하지 않고, CLI 커맨드(`waiaas init`)를 sidecar로 실행하여 초기화한다. `waiaas init`은 idempotent하게 동작한다.

**현재 상태:**
- 39-tauri-desktop-architecture.md 섹션 7.7(Setup Wizard)에서 CLI 위임 구조가 언급되어 있지만 상세가 불충분
- 54-cli-flow-redesign.md에서 `waiaas init` 2단계(PW + Infra)가 확정됨
- 39-tauri-desktop-architecture.md 섹션 13.2에서 "Setup Wizard = CLI init + 데몬 시작 + API 호출의 조합"이 언급됨

**idempotent 보장:**
- `~/.waiaas/` 이미 존재하면 에러가 아닌 skip (기존: `--force` 없으면 에러)
- 각 단계가 개별적으로 idempotent: 디렉토리 존재하면 skip, DB 존재하면 migration만, config 존재하면 skip

```typescript
// waiaas init --json 모드 (Tauri sidecar 호출용)
// 이미 초기화된 경우에도 에러 없이 현재 상태 반환
{
  "success": true,
  "alreadyInitialized": true, // 또는 false
  "dataDir": "~/.waiaas/",
  "version": "0.2.0"
}
```

**Confidence:** HIGH -- 54-cli-flow-redesign.md에서 init 플로우가 상세 확정되어 있고, idempotent 보장은 v0.7 objectives에서 명시적으로 요구됨.

---

### Pattern 6: Python SDK snake_case SSoT (API-06)

**What:** Python SDK의 camelCase -> snake_case 변환 규칙을 SSoT로 정의하고, Pydantic v2 `ConfigDict` + `alias_generator` 패턴을 확정한다.

**현재 상태:**
- 38-sdk-mcp-interface.md 섹션 4.2에서 Pydantic 모델이 정의되어 있음
- 섹션 11.3(NOTE-10)에서 17개 필드의 snake_case 변환이 검증됨
- 그러나 `alias_generator`가 아닌 개별 `Field(alias=...)` 방식을 사용 중

**문제점:**
1. 모든 필드에 `Field(alias="camelCase")`를 수동 지정하는 것은 유지보수가 어려움
2. `model_config = {"populate_by_name": True}`만 설정되어 있고 `alias_generator`가 없음
3. v0.6에서 추가된 타입들(ContractCallRequest, ApproveRequest, BatchRequest, Action 관련)에 대한 Python 모델이 아직 없음

**권장 패턴 (Pydantic v2):**

```python
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

class WAIaaSBaseModel(BaseModel):
    """WAIaaS Python SDK 공통 베이스 모델.

    모든 모델은 이 클래스를 상속하여 일관된 snake_case <-> camelCase 변환을 보장한다.
    - Python 코드에서는 snake_case 필드명 사용
    - API 통신 시에는 camelCase alias 사용
    - 양방향 모두 허용 (populate_by_name=True)
    """
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )
```

**Confidence:** HIGH -- Pydantic v2 공식 문서에서 `alias_generator`와 `to_camel`이 명확히 지원됨. `populate_by_name=True`는 v2에서의 표준 설정.

**변환 규칙 (SSoT):**

| 규칙 | 예시 | 비고 |
|------|------|------|
| 기본: camelCase -> snake_case | `agentId` -> `agent_id` | `to_camel` 역변환 |
| 약어 분리 | `maxAmountPerTx` -> `max_amount_per_tx` | 자동 처리 |
| 2글자 약어 | `txId` -> `tx_id` | `to_camel`이 `txId`로 올바르게 생성 |
| 대문자 약어 | `usdValue` -> `usd_value` | 자동 처리 |
| Enum 값 | `PENDING`, `CONFIRMED` | 무변환 (UPPER_SNAKE_CASE 유지) |

**특별 주의:** `to_camel`은 snake_case -> camelCase 변환 함수이다. Pydantic에서 `alias_generator=to_camel`로 설정하면, snake_case 필드명에서 camelCase alias를 자동 생성한다. 이는 API 직렬화 시 `model_dump(by_alias=True)`로 camelCase 출력을 보장한다.

기존 `Field(alias="camelCase")` 방식과 `alias_generator=to_camel` 방식의 혼용 시 주의: `Field`에 명시적 alias가 있으면 `alias_generator`보다 우선한다. 전환 시 기존 `alias=` 지정을 제거하고 `alias_generator`에 통합하는 것이 깔끔하다. 다만 `to_camel`이 생성하는 alias가 API의 실제 camelCase 필드명과 일치하는지 전수 검증이 필요하다.

---

### Pattern 7: Zod 스키마 @waiaas/core Export (API-07)

**What:** `@waiaas/core` 패키지에서 Zod 스키마를 export하여 `@waiaas/sdk`에서 클라이언트 사전 검증에 사용한다.

**현재 상태:**
- 38-sdk-mcp-interface.md 섹션 2.1~2.2에서 Zod SSoT 파이프라인이 정의됨
- `@waiaas/core`의 `schemas/` 디렉토리에 스키마가 정의됨
- `@waiaas/sdk`는 이미 `@waiaas/core`를 workspace dependency로 참조
- 그러나 `@waiaas/core`의 `index.ts`에서 어떤 스키마를 export하는지가 명확히 정의되지 않음

**Export 패턴:**

```typescript
// packages/core/src/index.ts
// === 타입 (z.infer) ===
export type { TransferRequest, TransactionResponse, ... } from './schemas/transaction.schema.js'
export type { SessionConstraints, SessionCreateRequest, ... } from './schemas/session.schema.js'
export type { AgentCreateRequest, AgentSummary, ... } from './schemas/agent.schema.js'

// === Zod 스키마 (런타임 검증용) ===
export {
  TransferRequestSchema,
  TokenTransferRequestSchema,
  ContractCallRequestSchema,
  ApproveRequestSchema,
  BatchRequestSchema,
  TransactionRequestSchema,  // discriminatedUnion 5-type
} from './schemas/transaction.schema.js'

export {
  SessionConstraintsSchema,
  SessionCreateRequestSchema,
} from './schemas/session.schema.js'

export {
  AgentCreateRequestSchema,
} from './schemas/agent.schema.js'
```

**@waiaas/sdk에서 사전 검증:**

```typescript
// packages/sdk/src/client.ts
import { TransferRequestSchema } from '@waiaas/core'

async sendNativeToken(request: TransferRequest): Promise<TransactionResponse> {
  // 서버 전송 전 클라이언트 사전 검증
  TransferRequestSchema.parse(request)
  return this.post('/v1/transactions/send', { ...request, type: 'TRANSFER' })
}
```

**Python SDK:** OpenAPI 스키마의 `format`/`pattern`을 참조하여 Pydantic `field_validator`로 수동 매핑. 자동 생성 아님.

**Confidence:** HIGH -- 이미 38-sdk-mcp-interface.md에서 파이프라인 구조가 확정되어 있으며, 모노레포 workspace 참조 방식도 package.json에 정의됨.

---

## Don't Hand-Roll

이 Phase는 설계 문서 보완 작업이므로, 라이브러리 선택보다 기존 결정의 정합성이 중요하다.

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| camelCase <-> snake_case | 커스텀 변환 로직 | `pydantic.alias_generators.to_camel` | Pydantic v2 내장, 엣지 케이스 처리 완료 |
| SQLite 비정상 종료 감지 | 커스텀 WAL 파싱 | `PRAGMA integrity_check` + `PRAGMA wal_checkpoint(TRUNCATE)` | SQLite 공식 메커니즘 |
| Sidecar 종료 관리 | 커스텀 프로세스 관리 | Tauri CommandChild + 수동 shutdown HTTP + timeout | Tauri 2.x 표준 패턴 |
| Zod 스키마 공유 | SDK용 별도 스키마 정의 | `@waiaas/core` workspace import | 모노레포 workspace, 타입 drift 0% |

---

## Common Pitfalls

### Pitfall 1: Tauri Origin 플랫폼 차이 무시

**What goes wrong:** macOS에서 테스트한 CORS 설정이 Windows에서 실패. Windows WebView2는 `http://tauri.localhost`(또는 `https://tauri.localhost`)를 Origin으로 보내지만, macOS는 `tauri://localhost`를 보낸다.
**Why it happens:** Tauri 2.x는 플랫폼별 WebView 엔진(WKWebView, WebView2, WebKitGTK)에 따라 Origin 형식이 다르다.
**How to avoid:** CORS 허용 목록에 3가지 Origin 모두 포함: `tauri://localhost`, `http://tauri.localhost`, `https://tauri.localhost`.
**Warning signs:** Windows 빌드에서 API 호출 실패, CORS preflight 에러.

### Pitfall 2: Sidecar 종료 타임아웃 불일치

**What goes wrong:** Tauri가 데몬보다 먼저 SIGKILL을 보내서 SQLite WAL 파일이 손상된다.
**Why it happens:** 데몬 graceful shutdown(최대 30초)보다 Tauri sidecar 종료 대기(5초)가 짧다.
**How to avoid:** Tauri sidecar 종료 타임아웃을 35초(데몬 30초 + 5초 마진)로 설정. 비정상 종료 시 다음 시작에서 `PRAGMA integrity_check` 실행.
**Warning signs:** 앱 종료 후 재시작 시 `database disk image is malformed` 에러.

### Pitfall 3: Owner Disconnect에서 DELAY 트랜잭션 잘못 처리

**What goes wrong:** DELAY 대기 중인 트랜잭션을 EXPIRED로 처리하면, Owner 개입 불필요한 거래가 무의미하게 취소된다.
**Why it happens:** APPROVAL과 DELAY의 차이를 무시하고 모든 대기 트랜잭션을 일괄 처리.
**How to avoid:** Cascade 5단계에서 APPROVAL만 EXPIRED 처리, DELAY는 유지(타이머 계속 진행).
**Warning signs:** disconnect 후 시간 경과 거래가 실행되지 않는다는 사용자 보고.

### Pitfall 4: Pydantic alias_generator와 기존 Field(alias=) 충돌

**What goes wrong:** `alias_generator=to_camel`과 `Field(alias="customAlias")`가 혼용될 때, `alias_generator`가 기존 alias를 덮어쓰는 것으로 착각.
**Why it happens:** Pydantic v2에서 `Field`에 명시적 alias가 있으면 `alias_generator`보다 우선한다. 그러나 `alias_priority` 설정에 따라 동작이 달라질 수 있다.
**How to avoid:** 전환 시 `alias_generator`로 통합하고, `to_camel`이 생성하는 alias가 실제 API 필드명과 일치하는지 전수 검증. 불일치 시(예: `txHash` vs `tx_hash` -> `to_camel` 결과 확인) 명시적 alias 유지.
**Warning signs:** API 응답 파싱 실패, `ValidationError: field required`.

### Pitfall 5: waiaas init idempotent 전환 시 기존 로직 파괴

**What goes wrong:** init idempotent 보장을 위해 "이미 존재하면 skip"을 추가했지만, `--force` 플래그와의 상호작용이 깨진다.
**Why it happens:** 54-cli-flow-redesign.md에서 `--force` 시 기존 데이터 삭제 후 재초기화하는 로직이 있는데, idempotent 추가 시 이 분기를 놓침.
**How to avoid:** idempotent = `~/.waiaas/` 존재하면 성공 반환 (에러 아님). `--force` = 삭제 후 재초기화. 두 플래그의 동작을 명확히 분리.
**Warning signs:** `waiaas init --force` 후에도 이전 설정이 남아있음.

---

## Code Examples

### Example 1: Tauri Sidecar Stop with Extended Timeout

```rust
// src-tauri/src/sidecar.rs [v0.7 보완]
impl SidecarManager {
    // [v0.7 보완] 5초 -> 35초로 변경 (데몬 30초 + 5초 마진)
    const SHUTDOWN_TIMEOUT_SECS: u64 = 35;
    const SIGTERM_GRACE_SECS: u64 = 5;

    pub async fn stop(&self) -> Result<(), String> {
        // 1. POST /v1/admin/shutdown 전송
        let _ = reqwest::Client::new()
            .post(format!("http://127.0.0.1:{}/v1/admin/shutdown", self.port))
            .header("X-Master-Password", &self.master_password)
            .send()
            .await;

        // 2. 35초 대기 (데몬 graceful shutdown)
        tokio::time::sleep(Duration::from_secs(Self::SHUTDOWN_TIMEOUT_SECS)).await;

        // 3. 프로세스 여전히 살아있으면 SIGTERM
        if self.is_alive() {
            self.send_signal(Signal::SIGTERM);
            tokio::time::sleep(Duration::from_secs(Self::SIGTERM_GRACE_SECS)).await;
        }

        // 4. 그래도 살아있으면 SIGKILL
        if self.is_alive() {
            self.send_signal(Signal::SIGKILL);
        }

        // 5. 상태 업데이트
        *self.status.lock().unwrap() = DaemonStatus { state: DaemonState::Stopped, .. };
        Ok(())
    }
}
```

### Example 2: SQLite Integrity Check on Startup

```typescript
// packages/daemon/src/infrastructure/database/connection.ts [v0.7 보완]
function checkDatabaseIntegrity(db: Database): void {
  const result = db.pragma('integrity_check') as Array<{ integrity_check: string }>

  if (result[0]?.integrity_check !== 'ok') {
    logger.warn('[v0.7] Database integrity check failed, attempting recovery...')
    logger.warn(`[v0.7] Issues found: ${JSON.stringify(result)}`)

    // WAL 체크포인트 강제 실행으로 복구 시도
    db.pragma('wal_checkpoint(TRUNCATE)')

    // 재검증
    const recheck = db.pragma('integrity_check') as Array<{ integrity_check: string }>
    if (recheck[0]?.integrity_check !== 'ok') {
      logger.error('[v0.7] Database recovery failed. Manual intervention required.')
      throw new Error('DATABASE_CORRUPT: integrity_check failed after recovery attempt')
    }

    logger.info('[v0.7] Database recovery successful after WAL checkpoint')
  } else {
    logger.debug('[v0.7] Database integrity check passed')
  }
}
```

### Example 3: Owner Disconnect Cascade

```typescript
// packages/daemon/src/services/owner-service.ts [v0.7 보완]
async function disconnectOwner(
  db: DrizzleInstance,
  address: string,
  chain: string,
): Promise<DisconnectResult> {
  return db.transaction(() => {
    // Step 1: APPROVAL 대기 트랜잭션 -> EXPIRED
    const affectedAgentIds = db.select({ id: agents.id })
      .from(agents)
      .where(and(
        eq(agents.ownerAddress, address),
        eq(agents.chain, chain),
      ))
      .all()
      .map(a => a.id)

    let expiredCount = 0
    if (affectedAgentIds.length > 0) {
      const result = db.update(transactions)
        .set({ status: 'EXPIRED', error: 'OWNER_DISCONNECTED' })
        .where(and(
          inArray(transactions.agentId, affectedAgentIds),
          eq(transactions.status, 'QUEUED'),
          eq(transactions.tier, 'APPROVAL'),
        ))
        .run()
      expiredCount = result.changes
    }

    // Step 2: DELAY 대기 트랜잭션 -> 유지 (no-op)

    // Step 3: wallet_connections에서 WC 세션 정리
    db.delete(walletConnections)
      .where(and(
        eq(walletConnections.address, address),
        eq(walletConnections.chain, chain),
      ))
      .run()

    // Step 4: agents.owner_address는 유지 (no-op)

    // Step 5: audit_log 기록
    insertAuditLog(db, {
      eventType: 'OWNER_DISCONNECTED',
      actor: 'system',
      details: {
        address,
        chain,
        affectedAgents: affectedAgentIds.length,
        expiredTransactions: expiredCount,
      },
      severity: 'info',
    })

    return {
      disconnectedAt: new Date().toISOString(),
      affectedAgents: affectedAgentIds.length,
      expiredTransactions: expiredCount,
    }
  })()
}
```

### Example 4: Python SDK WAIaaSBaseModel with alias_generator

```python
# waiaas/models.py [v0.7 보완]
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class WAIaaSBaseModel(BaseModel):
    """WAIaaS Python SDK 공통 베이스 모델.

    - alias_generator=to_camel: snake_case 필드명 -> camelCase alias 자동 생성
    - populate_by_name=True: snake_case와 camelCase 양방향 입력 허용
    """
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class TransactionResponse(WAIaaSBaseModel):
    transaction_id: str        # alias: "transactionId" (자동)
    status: TransactionStatus
    tier: Tier | None = None
    tx_hash: str | None = None  # alias: "txHash" (자동)
    estimated_fee: str | None = None  # alias: "estimatedFee" (자동)
    created_at: datetime       # alias: "createdAt" (자동)


# 직렬화 예시:
# response.model_dump(by_alias=True) -> {"transactionId": "...", "txHash": "...", ...}
# TransactionResponse(transaction_id="abc", status="CONFIRMED") -> OK (populate_by_name)
# TransactionResponse(**{"transactionId": "abc", "status": "CONFIRMED"}) -> OK (alias)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Field(alias="camelCase")` 수동 지정 | `ConfigDict(alias_generator=to_camel)` 자동 | Pydantic v2 | 유지보수 부담 감소, SSoT |
| Tauri sidecar 5초 타임아웃 | 35초 타임아웃 + integrity_check | v0.7 Phase 29 | DB 손상 방지 |
| CORS `tauri://localhost`만 | 3가지 Origin 모두 허용 | v0.7 Phase 29 | Windows 호환성 |
| Owner disconnect 미정의 | 5단계 cascade 확정 | v0.7 Phase 29 | 클라이언트 구현 가능 |

---

## Open Questions

### 1. Tauri 2.x Windows Origin 정확한 값

- **What we know:** Tauri 2.1.0+에서 Windows 기본값은 `http://tauri.localhost`. `useHttpsScheme: true` 설정 시 `https://tauri.localhost`.
- **What's unclear:** 프로젝트에서 `useHttpsScheme`를 설정할 것인지 여부. Tauri 2.0과 2.1+의 차이.
- **Recommendation:** CORS 허용 목록에 `http://tauri.localhost`와 `https://tauri.localhost` 모두 추가하여 안전하게 대응. 개발 모드 Origin 로깅으로 실제 값 확인.

### 2. PRAGMA integrity_check 성능 영향

- **What we know:** integrity_check는 O(NlogN), quick_check는 O(N). WAIaaS DB는 소규모.
- **What's unclear:** 에이전트가 장기 운영되어 audit_log가 수만 건 축적된 경우의 실제 소요 시간.
- **Recommendation:** 비정상 종료 후에만 실행하므로 성능 영향 미미. 필요시 `PRAGMA quick_check`로 대체 가능하나, 인덱스 검증이 없으므로 `integrity_check` 권장 유지.

### 3. Pydantic to_camel과 기존 필드명 호환성

- **What we know:** `to_camel("tx_hash")` = `"txHash"`, `to_camel("usd_value")` = `"usdValue"` -- 대부분 API 필드명과 일치.
- **What's unclear:** 모든 v0.6 확장 필드(CONTRACT_CALL, APPROVE, BATCH 관련)에 대한 `to_camel` 결과 검증이 필요.
- **Recommendation:** Plan 29-03에서 v0.6 확장 필드 전체를 `to_camel` 변환 결과와 API 필드명 대조표로 검증.

---

## Sources

### Primary (HIGH confidence)
- v0.7 objectives (`objectives/v0.7-implementation-blockers-resolution.md`) -- Phase D 전체 스펙
- 39-tauri-desktop-architecture.md -- Sidecar 관리, CORS 설정, Setup Wizard
- 37-rest-api-complete-spec.md -- REST API 전체 스펙, 미들웨어, CORS
- 38-sdk-mcp-interface.md -- TS/Python SDK, Pydantic 모델, snake_case 변환
- 34-owner-wallet-connection.md -- Owner disconnect, WC 연결
- 32-transaction-pipeline-api.md -- Transaction 파이프라인, 상태 머신
- 29-api-framework-design.md -- Hono 미들웨어 스택, CORS
- 54-cli-flow-redesign.md -- CLI init 재설계
- 24-monorepo-data-directory.md -- 모노레포 구조, @waiaas/core

### Secondary (MEDIUM confidence)
- [Tauri 2.1.0 릴리스 노트](https://v2.tauri.app/release/tauri/v2.1.0/) -- `useHttpsScheme` 설정
- [Pydantic v2 Alias 문서](https://docs.pydantic.dev/latest/concepts/alias/) -- alias_generator, populate_by_name
- [SQLite PRAGMA 문서](https://www.sqlite.org/pragma.html) -- integrity_check, wal_checkpoint
- [Tauri Sidecar Lifecycle Discussion](https://github.com/tauri-apps/plugins-workspace/issues/3062) -- graceful shutdown 패턴

### Tertiary (LOW confidence)
- [Tauri Origin Discussion #4912](https://github.com/tauri-apps/tauri/discussions/4912) -- 플랫폼별 Origin 차이 (공식 문서에 명시적 표 없음)
- [Tauri Issue #3007](https://github.com/tauri-apps/tauri/issues/3007) -- https://tauri.localhost vs http://tauri.localhost

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- 기존 확정 스택, 새 라이브러리 없음
- Architecture patterns: HIGH -- v0.7 objectives에서 대부분 상세 확정
- Pitfalls: HIGH -- 기존 설계 문서 분석 + Tauri/Pydantic 공식 자료 기반
- Tauri CORS Origin: MEDIUM -- Tauri 2.1.0 릴리스 노트 기반이나 플랫폼별 정확한 Origin 공식 표 부재

**Research date:** 2026-02-08
**Valid until:** 30 days (안정적인 설계 문서 보완 작업)
