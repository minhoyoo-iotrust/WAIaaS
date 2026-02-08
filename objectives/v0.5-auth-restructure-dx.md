# 마일스톤 5: 인증 모델 재설계 + 개발자 경험 개선

## 목표
Owner 지갑 주소 등록과 서명 검증을 분리하여 인증 모델을 재설계한다. masterAuth(로컬 관리)와 ownerAuth(자금 인가)의 책임을 명확히 나누고, 에이전트 개발자가 지갑 서명 없이 첫 거래까지 3분 내에 도달할 수 있는 개발자 경험을 설계한다.

## 배경

### 현재 설계의 문제
v0.2 설계에서 Owner 지갑(SIWS/SIWE 서명)은 에이전트 생성, 세션 발급, 거래 승인, 설정 변경 등 거의 모든 관리 작업의 전제 조건이다. 이로 인해:

1. **초기 설정 마찰**: `waiaas init` 후 첫 거래까지 7단계, 15분 이상 소요
2. **Owner 서명 과잉 요구**: 자금과 무관한 작업(에이전트 생성, 대시보드 조회)에도 SIWS 서명 필요
3. **WalletConnect 필수 의존**: 초기 설정부터 Reown projectId 발급 + QR 스캔이 필요
4. **개발/테스트 마찰**: 매번 모바일 지갑을 열어 서명해야 함

### 핵심 인사이트
Owner 지갑의 두 가지 역할이 뒤섞여 있다:

| 역할 | 의미 | 서명이 필요한가? |
|------|------|:---:|
| **신원 등록** — "이 주소가 나의 Owner 지갑이다" | 공개 정보(주소) 저장 | No |
| **인가 증명** — "이 작업을 내가 승인한다" | 지갑 소유권의 암호학적 증명 | Yes |

주소는 공개 정보이므로 등록에 서명이 필요 없다. **서명은 자금에 영향을 주는 행위에서만 요구하면 된다.**

### 경쟁 분석 결과
- Coinbase AgentKit: 3줄 코드로 첫 거래 가능 (보안은 약함)
- ElizaOS: 환경변수에 개인키 직접 입력 (보안 거의 없음)
- WAIaaS는 보안과 DX 모두를 확보해야 차별화됨

---

## 핵심 원칙

### 1. 인증 수단의 책임을 분리한다
- masterAuth = "이 데몬을 설치한 사람이다" → 로컬 설정/관리 작업
- ownerAuth = "이 지갑의 소유자가 맞다" → 자금 영향 작업
- 동일 작업에 두 인증을 중복 요구하지 않는다

### 2. Owner 주소는 에이전트의 속성이다
- Owner 지갑 주소는 시스템 전역 설정이 아닌 에이전트별 속성
- 에이전트 생성 시 체인과 함께 Owner 주소를 등록한다
- 멀티체인/멀티Owner 시나리오를 자연스럽게 지원한다

### 3. 보안 다운그레이드 없이 마찰을 줄인다
- SIWS/SIWE 서명 검증 자체는 현재 설계 그대로 유지
- 서명이 필요한 시점만 변경 (에이전트 생성 → 거래 승인으로 지연)
- 프로덕션 보안 수준은 동일하게 유지

### 4. 첫 거래까지 3분을 목표로 한다
- init → start → agent create → session create → SDK 코드: 5단계
- 지갑 서명 0회, WalletConnect 불필요
- 개발 환경과 프로덕션 환경을 분리하여 각각 최적화

---

## 설계 변경 사항

### 1. 인증 체계 재배치

#### 1.1 인증 수단 정의

| 인증 | 검증 대상 | 수단 | 용도 |
|------|----------|------|------|
| **masterAuth** | 데몬 운영자 | `X-Master-Password` 헤더 → Argon2id 검증 | 로컬 설정/관리 |
| **ownerAuth** | 특정 에이전트의 자금 통제 권한자 | SIWS/SIWE 서명 → 서명자 == agents.owner_address | 자금 집행 승인 |
| **sessionAuth** | 에이전트 사용 권한자 | JWT 세션 토큰 → 2-stage 검증 | 에이전트 API 호출 |

#### 1.2 엔드포인트별 인증 맵 (변경)

| 엔드포인트 | v0.2 현재 | 변경 후 | 변경 근거 |
|-----------|----------|---------|----------|
| `POST /v1/agents` | ownerAuth | **masterAuth** | 에이전트 생성은 로컬 설정 |
| `DELETE /v1/agents/:id` | ownerAuth | **masterAuth** | 로컬 설정 |
| `POST /v1/sessions` | ownerAuth (SIWS) | **masterAuth** | 세션 발급은 데몬 운영 |
| `GET /v1/sessions` | ownerAuth | **masterAuth** | 조회는 자금 무관 |
| `DELETE /v1/sessions/:id` | ownerAuth | **masterAuth** | 세션 폐기는 방어적 |
| `POST /v1/transactions/:id/approve` | ownerAuth | **ownerAuth (유지)** | 자금 집행 승인 |
| `POST /v1/transactions/:id/reject` | ownerAuth | **masterAuth** | 거부는 방어적 |
| `POST /v1/admin/kill-switch` | ownerAuth | **masterAuth** | 긴급 정지 (마스터 패스워드 충분) |
| `POST /v1/admin/recover` | ownerAuth + masterAuth | **ownerAuth + masterAuth (유지)** | 최고 보안 필요 |
| `PUT /v1/admin/settings` | ownerAuth | **masterAuth** | 로컬 설정 |
| `GET /v1/admin/dashboard` | ownerAuth | **masterAuth** | 조회는 자금 무관 |
| `PUT /v1/sessions/:id/renew` | (없음 — 신규) | **sessionAuth** | 에이전트 자체 세션 갱신 |

**원칙: ownerAuth(SIWS/SIWE 서명)가 필요한 곳은 딱 2곳 — 거래 승인, Kill Switch 복구.**

### 2. Owner 주소를 에이전트 레벨로 이동

#### 2.1 agents 테이블 변경

```sql
CREATE TABLE agents (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  chain         TEXT NOT NULL CHECK (chain IN ('solana', 'ethereum')),
  status        TEXT NOT NULL DEFAULT 'active',
  owner_address TEXT NOT NULL,    -- 해당 체인의 Owner 지갑 주소
  keystore_path TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
```

Owner 주소는 에이전트의 체인에 대응하는 주소여야 한다:
- Solana 에이전트 → Solana 주소 (Base58, 32 bytes)
- Ethereum 에이전트 → Ethereum 주소 (0x + 40 hex, EIP-55 체크섬)

#### 2.2 config.toml에서 [owner] 섹션 제거

```toml
# 변경 전: [owner] 섹션이 전역 Owner 주소를 보유
# 변경 후: Owner 개념은 에이전트별로 DB에 저장, config.toml에서 제거

[daemon]
hostname = "127.0.0.1"
port = 3100

[security]
jwt_secret = "auto-generated..."
```

#### 2.3 owner_wallets 테이블 → wallet_connections (선택적)

```sql
-- Owner 신원 등록 역할 제거 (agents.owner_address로 이동)
-- WalletConnect push 서명 전용 테이블로 전환
CREATE TABLE wallet_connections (
  address         TEXT PRIMARY KEY,
  chain           TEXT NOT NULL,
  wc_session_topic TEXT,
  connected_at    TEXT,
  last_active_at  TEXT
);
```

이 테이블은 WalletConnect push 서명을 위한 선택적 테이블이다. 없어도 CLI에서 수동 서명으로 모든 기능을 사용할 수 있다.

#### 2.4 멀티 에이전트 + 멀티 Owner 지원

```bash
# 같은 Owner, 같은 체인
waiaas agent create --name trader-1 --chain solana --owner 7xKXtg...
waiaas agent create --name trader-2 --chain solana --owner 7xKXtg...

# 같은 Owner, 다른 체인
waiaas agent create --name eth-bot --chain ethereum --owner 0xAbCd...

# 다른 Owner (위임 시나리오, 향후 확장)
waiaas agent create --name alice-bot --chain solana --owner Alice주소
waiaas agent create --name bob-bot   --chain solana --owner Bob주소
```

ownerAuth 검증 시 해당 거래의 에이전트에 등록된 owner_address와 대조하므로, 에이전트 간 Owner 격리가 자연스럽게 보장된다.

### 3. WalletConnect를 선택적 편의 기능으로 전환

```
변경 전: WalletConnect 연결 = Owner 등록 (필수)
변경 후: WalletConnect 연결 = push 서명 알림 활성화 (선택)
```

| WalletConnect 상태 | 거래 승인 방식 | 동작 |
|-------------------|-------------|------|
| 미연결 | CLI에서 수동 서명 | `waiaas tx approve <id>` → 1회성 QR 또는 로컬 서명 |
| 연결됨 | 모바일 push 서명 | Telegram 알림 → Phantom에서 바로 서명 |

WalletConnect 없이도 Owner 서명은 가능하다. ownerAuth 미들웨어는 어떤 경로로든 올바른 SIWS/SIWE 서명이 오면 통과한다.

### 4. ownerAuth 미들웨어: 에이전트별 검증

```typescript
async function ownerAuth(c: Context, next: Next) {
  // 1. Authorization 헤더에서 SIWS/SIWE 서명 추출 (기존 동일)
  const payload = parseOwnerSignaturePayload(c.req.header('Authorization'))

  // 2. 서명 암호학적 검증 (기존 동일)
  await verifySignature(payload)

  // 3. 해당 거래의 에이전트 Owner 주소와 대조 (변경)
  const txId = c.req.param('id')
  const tx = await db.select().from(transactions).where(eq(transactions.id, txId)).get()
  const agent = await db.select().from(agents).where(eq(agents.id, tx.agent_id)).get()

  if (payload.address !== agent.owner_address) {
    throw new WAIaaSError('OWNER_MISMATCH',
      'Signer address does not match agent owner address')
  }

  return next()
}
```

서명 검증 로직은 기존 8단계 그대로. 변경점은 `owner_wallets.address` 대신 `agents.owner_address`를 참조하는 것뿐이다.

### 5. Owner 주소 변경 정책

| 상황 | 변경 방법 | 근거 |
|------|----------|------|
| 해당 주소로 서명한 이력 없음 | masterAuth만으로 변경 가능 | 주소 진위가 검증된 적 없으므로 교정 허용 |
| 해당 주소로 서명한 이력 있음 | ownerAuth(기존 주소) + masterAuth | 소유권이 증명된 주소의 변경에는 기존 Owner 동의 필요 |

### 6. Kill Switch 복구 시 Owner 검증

Kill Switch 복구는 시스템 전체에 영향을 주는 작업이다. 에이전트가 여러 개일 때:

- 등록된 Owner 주소(agents.owner_address DISTINCT) 중 아무나 1명의 서명 + masterAuth
- 근거: 복구 지연이 더 위험. masterAuth가 이미 필요하므로 마스터 패스워드를 아는 사람만 시도 가능

### 7. 세션 갱신: 낙관적 갱신 패턴 (Optimistic Renewal)

현재 v0.2 설계에는 세션 갱신 메커니즘이 없다. 세션이 만료되면 masterAuth로 새 세션을 발급받아야 하는데, 이는 자율 에이전트 운영에 치명적이다 — 에이전트가 장기 작업 중 세션 만료로 중단될 수 있다.

#### 7.1 핵심 아이디어

**낙관적 갱신**: 에이전트가 스스로 세션을 갱신하고, Owner가 사후에 거부할 수 있는 패턴.

```
에이전트: PUT /v1/sessions/:id/renew (sessionAuth)
    ↓ 즉시 갱신 성공 (새 만료 시간 적용)
    ↓ Owner에게 알림 전송
Owner: 1시간 이내 거부 가능
    ├─ 거부 안 함 → 갱신 유지
    └─ 거부함 → 세션 즉시 폐기
```

자금을 직접 이동하는 행위가 아니므로 사전 승인 없이 갱신을 허용하되, Owner에게 통제권을 부여한다.

#### 7.2 안전 장치

| 제한 | 기본값 | 설정 가능 | 근거 |
|------|--------|:---------:|------|
| 최대 갱신 횟수 (maxRenewals) | 30회 | ✓ (0=갱신 비활성화) | 무한 갱신 방지 |
| 총 세션 수명 상한 | 30일 | ✗ (하드코딩) | 장기 세션 리스크 제한 |
| 갱신 허용 시점 | 잔여 시간 50% 이하 | ✗ (하드코딩) | 불필요한 조기 갱신 방지 |
| Owner 거부 윈도우 (renewalRejectWindow) | 3600초 (1시간) | ✓ | Owner 검토 시간 보장 |
| 갱신 단위 | 원래 세션의 expiresIn | ✗ | 갱신 시 만료 시간 확대 불가 |

#### 7.3 sessions 테이블 변경

```sql
CREATE TABLE sessions (
  -- 기존 컬럼 유지 ...
  renewal_count   INTEGER NOT NULL DEFAULT 0,     -- 현재 갱신 횟수
  max_renewals    INTEGER NOT NULL DEFAULT 30,    -- 최대 갱신 허용 횟수
  last_renewed_at TEXT                            -- 마지막 갱신 시각 (ISO 8601)
);
```

#### 7.4 SessionConstraints 확장

```typescript
interface SessionConstraints {
  // 기존 6개 필드 유지
  maxAmountPerTx: string
  maxTotalAmount: string
  maxTransactions: number
  allowedOperations: OperationType[]
  allowedDestinations: string[]
  expiresIn: number           // 초 단위

  // 갱신 관련 추가
  maxRenewals: number         // 기본 30, 0=갱신 비활성화
  renewalRejectWindow: number // 기본 3600초 (1시간)
}
```

#### 7.5 API 엔드포인트

```
PUT /v1/sessions/:id/renew
```

- **인증**: sessionAuth (에이전트 자체 토큰으로 호출)
- **제약**: 자신의 세션만 갱신 가능 (JWT의 sid == :id)
- **응답 200**:

```json
{
  "sessionId": "01950288-...",
  "renewalCount": 3,
  "maxRenewals": 30,
  "newExpiresAt": "2026-02-08T15:30:00Z",
  "rejectWindowEndsAt": "2026-02-07T16:30:00Z"
}
```

- **에러 조건**:

| 코드 | 조건 |
|------|------|
| `SESSION_RENEWAL_DISABLED` | maxRenewals == 0 |
| `SESSION_RENEWAL_LIMIT_REACHED` | renewal_count >= max_renewals |
| `SESSION_RENEWAL_TOO_EARLY` | 잔여 시간 > 50% |
| `SESSION_LIFETIME_EXCEEDED` | 총 수명이 30일 상한 초과 |

#### 7.6 갱신 처리 로직

```typescript
async function renewSession(sessionId: string): Promise<RenewalResult> {
  const session = await getSession(sessionId)

  // 1. 갱신 가능 여부 검증
  if (session.constraints.maxRenewals === 0)
    throw new WAIaaSError('SESSION_RENEWAL_DISABLED')
  if (session.renewal_count >= session.max_renewals)
    throw new WAIaaSError('SESSION_RENEWAL_LIMIT_REACHED')

  const remaining = new Date(session.expires_at).getTime() - Date.now()
  const original = session.constraints.expiresIn * 1000
  if (remaining > original * 0.5)
    throw new WAIaaSError('SESSION_RENEWAL_TOO_EARLY')

  // 2. 30일 총 수명 상한 검증
  const totalLifetime = Date.now() - new Date(session.created_at).getTime()
    + session.constraints.expiresIn * 1000
  if (totalLifetime > 30 * 24 * 60 * 60 * 1000)
    throw new WAIaaSError('SESSION_LIFETIME_EXCEEDED')

  // 3. 갱신 적용 (원래 expiresIn만큼 연장)
  const newExpiresAt = new Date(Date.now() + original)
  await db.update(sessions).set({
    expires_at: newExpiresAt.toISOString(),
    renewal_count: session.renewal_count + 1,
    last_renewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).where(eq(sessions.id, sessionId))

  // 4. Owner 알림 (비동기)
  await notificationService.send('SESSION_RENEWED', {
    sessionId, agentName: session.agentName,
    renewalCount: session.renewal_count + 1,
    maxRenewals: session.max_renewals,
    newExpiresAt, rejectWindowEndsAt: new Date(
      Date.now() + session.constraints.renewalRejectWindow * 1000
    )
  })

  return { sessionId, renewalCount: session.renewal_count + 1, newExpiresAt }
}
```

#### 7.7 Owner 거부 플로우

Owner는 거부 윈도우(기본 1시간) 내에 세션 갱신을 거부할 수 있다.

- **Telegram 알림 예시**:
```
🔄 세션 갱신됨
에이전트: trading-bot
갱신: 3/30회
새 만료: 2026-02-08 15:30 UTC
[거부하기]  ← 인라인 키보드 버튼
```

- **거부 시 동작**: 해당 세션 즉시 revoke (DELETE /v1/sessions/:id, masterAuth)
- **거부 윈도우 경과 후**: 거부 버튼 비활성화, 갱신 확정

#### 7.8 알림 이벤트 추가

기존 13개 NotificationEventType에 2개 추가:

| 이벤트 | 트리거 | 우선순위 | 액션 |
|--------|--------|---------|------|
| `SESSION_RENEWED` | 에이전트가 세션을 갱신할 때 | MEDIUM | 거부하기 버튼 |
| `SESSION_RENEWAL_REJECTED` | Owner가 갱신을 거부할 때 | HIGH | 에이전트에 세션 폐기 알림 |

---

## 개발자 경험(DX) 개선

### 1. 간소화된 플로우

#### 변경 전 (현재 v0.2 설계)
```
init → start → WalletConnect QR → Phantom 승인 → 에이전트 생성(SIWS)
→ 자금 충전 → 세션 발급(SIWS) → SDK 코드
```
- 소요: 15분+
- 지갑 서명: 2회 이상
- WalletConnect projectId 발급 필수

#### 변경 후
```
init → start → agent create(주소 입력) → session create → SDK 코드
```
- 소요: 3분
- 지갑 서명: 0회
- WalletConnect 불필요

### 2. waiaas init 순수 인프라 초기화

```
$ waiaas init

[1/3] 데이터 디렉토리 생성: ~/.waiaas/
[2/3] config.toml 생성 (포트: 3100)
[3/3] 마스터 패스워드 설정
  Enter master password: ********
  Confirm: ********

✓ 초기화 완료. 'waiaas start'로 시작하세요.
```

Owner 관련 내용 없음. JWT Secret은 자동 생성.

### 3. 에이전트 생성 시 Owner 주소 등록

```
$ waiaas agent create --name trading-bot --chain solana \
    --owner 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
Enter master password: ********

[1/3] Owner 주소 검증... ✓ Solana (Ed25519, 32 bytes)
[2/3] 에이전트 키페어 생성... ✓ AES-256-GCM 암호화 저장
[3/3] 에이전트 등록... ✓

Agent "trading-bot" created
  ID:      01950288-...
  Chain:   solana
  Address: 9bKrTDWN...  (에이전트 지갑)
  Owner:   7xKXtg2C...  (승인 권한)

💰 에이전트에 자금을 충전하세요:
   Owner(7xKXtg...) → Agent(9bKrTD...) SOL 전송
```

### 4. --quickstart 원커맨드 (개발 환경)

```bash
# init + start + agent create + session create 한 번에
waiaas init --quickstart --chain solana --owner 7xKXtg...

# 출력:
# ✓ Data directory: ~/.waiaas/
# ✓ Master password: (auto-generated for dev: "waiaas-dev")
# ✓ Daemon started on 127.0.0.1:3100
# ✓ Agent "default" created (solana)
# ✓ Session token: wai_sess_eyJ...
# export WAIAAS_SESSION_TOKEN=wai_sess_eyJ...
```

### 5. --dev 모드

```bash
waiaas start --dev
```

| 항목 | 일반 모드 | --dev 모드 |
|------|----------|-----------|
| 마스터 패스워드 | 대화형 입력 | 고정값 "waiaas-dev" |
| 정책 엔진 | 4-tier 정상 동작 | 모든 거래 INSTANT |
| 네트워크 | config.toml RPC | devnet 자동 |
| 세션 만료 | config 설정 | 7일 (최대) |

### 6. Actionable 에러 메시지

```json
{
  "error": "POLICY_APPROVAL_REQUIRED",
  "message": "Transaction requires owner approval (amount >= 10 SOL)",
  "hint": "Approve with: waiaas tx approve <tx-id>, or connect WalletConnect for push signing",
  "retryable": false,
  "txId": "01950299-..."
}
```

### 7. MCP 데몬 내장 옵션

별도 프로세스 대신 데몬 자체가 MCP stdio 엔드포인트를 제공하는 옵션을 검토한다.
세션 토큰 관리가 내부적으로 해결되어 환경변수 의존이 사라진다.

### 8. 원격 에이전트 접근 가이드

localhost 전용 바인딩을 유지하면서 원격 접근을 지원하는 가이드:
- SSH 터널: `ssh -L 3100:127.0.0.1:3100 user@host`
- Tailscale/WireGuard VPN 내부 IP 바인딩
- `--expose` 플래그 (명시적 옵트인 + TLS 경고)

---

## 영향받는 설계 문서

| 문서 | 변경 규모 | 변경 내용 |
|------|:--------:|----------|
| **CORE-01** (24-monorepo-data-directory) | 소 | config.toml에서 [owner] 섹션 제거 |
| **CORE-02** (25-sqlite-schema) | 중 | agents.owner_address 역할 강화, owner_wallets → wallet_connections 전환, audit_log.auth_method 추가, sessions 테이블에 renewal_count/max_renewals/last_renewed_at 추가 |
| **CORE-05** (28-daemon-lifecycle-cli) | 중 | `waiaas init` 간소화, `waiaas agent create --owner` 추가, --quickstart/--dev 모드 |
| **SESS-PROTO** (30-session-token-protocol) | **대** | 세션 발급 인증을 ownerAuth → masterAuth로 변경, 낙관적 갱신 패턴 추가 (PUT /renew, 안전 장치, DB 스키마) |
| **OWNR-CONN** (34-owner-wallet-connection) | **대** | 전면 재설계 — 주소 등록은 agent create로 이동, WalletConnect는 선택적 편의 기능, ownerAuth 적용 범위 축소 |
| **API-SPEC** (37-rest-api-complete-spec) | 중 | 인증 체계 적용 맵 재배치, 에러 응답에 hint 필드 추가 |
| **SDK-MCP** (38-sdk-mcp-interface) | 소 | MCP 데몬 내장 옵션 검토, 에러 hint 노출 |
| **TAURI-DESK** (39-tauri-desktop-architecture) | 소 | Setup Wizard에서 Owner QR 단계 제거 → 에이전트 생성 시 주소 입력 |
| **NOTI-ARCH** (35-notification-architecture) | 중 | SESSION_RENEWED / SESSION_RENEWAL_REJECTED 이벤트 2건 추가, 거부 윈도우 타이머 |
| **TGBOT-DOCKER** (40-telegram-bot-docker) | 중 | 알림 메시지에 인증 방식 컨텍스트 추가, 세션 갱신 거부 인라인 키보드 버튼 |

---

## 산출물

| 산출물 | 설명 |
|--------|------|
| 인증 모델 재설계 문서 | masterAuth/ownerAuth/sessionAuth 3-tier 책임 분리 스펙 |
| 세션 갱신 프로토콜 | 낙관적 갱신 패턴 스펙 — API, 안전 장치, DB 스키마, 알림 이벤트 |
| 수정된 설계 문서 (11개) | 인증 맵 재배치, Owner 주소 에이전트 귀속, WalletConnect 선택적 전환, 세션 갱신 반영 |
| CLI 플로우 재설계 | waiaas init 간소화, agent create --owner, --quickstart, --dev 모드 |
| DX 개선 스펙 | actionable 에러, MCP 내장 옵션, 원격 접근 가이드 |

---

## 성공 기준

1. `waiaas init`에서 Owner 지갑 관련 단계가 제거됨 — 순수 인프라 초기화만 수행
2. `waiaas agent create --owner <address>`로 에이전트 생성 시 Owner 주소가 등록됨 — 서명 불필요
3. `waiaas session create`가 masterAuth(마스터 패스워드)만으로 동작함 — SIWS 서명 불필요
4. ownerAuth(SIWS/SIWE 서명)가 필요한 엔드포인트가 거래 승인과 Kill Switch 복구 2곳으로 한정됨
5. 멀티 에이전트 시나리오에서 에이전트별 owner_address로 Owner가 격리됨
6. WalletConnect 미연결 상태에서도 CLI를 통한 거래 승인이 가능함
7. `--quickstart` 플래그로 init부터 세션 토큰 발급까지 단일 커맨드로 완료됨
8. `--dev` 모드에서 마스터 패스워드 프롬프트 없이 데몬이 시작됨
9. 에러 응답에 hint 필드가 포함되어 다음 행동을 안내함
10. 인증 모델 변경이 보안 수준을 다운그레이드하지 않음 — APPROVAL 티어와 Kill Switch 복구의 ownerAuth는 그대로 유지
11. 에이전트가 `PUT /v1/sessions/:id/renew`로 세션을 자체 갱신할 수 있음 (sessionAuth)
12. 세션 갱신 시 Owner에게 알림이 전송되고, 기본 1시간 이내에 거부할 수 있음
13. 최대 갱신 횟수(기본 30회)와 총 세션 수명 상한(30일)이 적용됨
14. 갱신은 잔여 시간 50% 이하일 때만 허용되어 불필요한 조기 갱신이 방지됨
15. maxRenewals=0으로 설정하면 세션 갱신이 완전히 비활성화됨

---

*작성: 2026-02-06, 갱신: 2026-02-07*
*기반 분석: v0.2 설계 문서(24~40) 인증 체계 리뷰 + 경쟁 솔루션 DX 비교 + 세션 갱신 패턴 설계*
