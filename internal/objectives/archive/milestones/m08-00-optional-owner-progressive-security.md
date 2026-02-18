# 마일스톤 m08: Owner 선택적 등록 + 점진적 보안 모델

## 목표

Owner 지갑 등록을 필수에서 선택으로 전환하고, 등록 여부에 따라 보안 기능이 점진적으로 해금되는 모델을 설계한다. Owner 없는 에이전트는 DELAY 티어까지 자율 운영하고, Owner를 등록하면 APPROVAL 티어, 자금 회수, 갱신 거부 등 강화된 보안이 해금된다.

## 배경

### objectives/v0.5와의 관계

objectives/v0.5는 masterAuth/ownerAuth/sessionAuth 3-tier 인증 모델을 재설계하면서, `agents.owner_address`를 NOT NULL(필수)로 설정했다. 이로 인해:

1. **에이전트 생성 시 Owner 주소 준비가 필수** — 첫 사용까지 추가 마찰
2. **Owner 없이 동작하는 에이전트 불가** — 자율 에이전트 시나리오 미지원
3. **보안 수준이 이분법** — 3계층 보안 전체 적용 또는 미적용

### 시장 포지셔닝

현재 에이전트 지갑 시장은 두 극단으로 나뉘어 있다:

| 진영 | 대표 솔루션 | 보안 | 자율성 |
|------|-----------|:----:|:-----:|
| 자율 우선 | ElizaOS, GOAT SDK, Tether WDK | 없음 | 완전 |
| 통제 우선 | Coinbase AgentKit, Crossmint, Privy | 항상 적용 | 제한적 |

WAIaaS가 본 마일스톤을 적용하면 **하나의 시스템에서 양쪽 스펙트럼을 커버**한다:

```
자율 우선 (ElizaOS)        WAIaaS              통제 우선 (Coinbase)
    ████████████       ░░░░░░████████           ░░░░░░░░░░░░
    보호 없음          Owner 없음→있음           항상 통제
                       점진적 해금
```

### OpenClaw 통합 시나리오

OpenClaw(구 Moltbot) 유저의 전형적 여정:

1. OpenClaw + WAIaaS 연결 (Owner 없이) → 즉시 사용, 빠른 온보딩
2. 거래 규모 커짐 → 대액 거래 알림에서 Owner 등록 안내 확인
3. Owner 등록 → APPROVAL 해금, 자금 회수 가능, 보안 강화
4. 프로덕션 운영 → 3계층 보안 완전 가동

---

## 핵심 원칙

### 1. Owner 등록은 선택이다
- 에이전트는 Owner 없이 생성하고 운영할 수 있다
- Owner가 없어도 세션 발급, 거래 실행, 알림 수신이 가능하다
- Owner 등록은 보안 기능의 "업그레이드"이지 "전제 조건"이 아니다

### 2. Owner가 있으면 기능이 확장된다
- APPROVAL 티어 해금, 자금 회수, 갱신 거부 등 Owner 전용 기능이 활성화된다
- 기존 기능은 그대로 유지하면서 추가 기능만 해금된다
- 보안 수준의 향상이 기존 동작을 깨뜨리지 않는다

### 3. 최초 등록에 서명은 불필요하다
- 지갑 주소는 공개 정보이므로 등록에 서명이 필요 없다
- masterAuth(마스터 패스워드)만으로 Owner 주소를 등록할 수 있다
- 서명 검증은 ownerAuth가 필요한 시점(거래 승인, 회수 등)에 수행한다

### 4. 주소 변경은 기존 Owner 서명이 필요하다
- 한 번 등록된 Owner 주소의 변경은 해당 주소의 SIWS/SIWE 서명이 필요하다
- 이는 Owner 주소 탈취를 통한 자금 방향 전환 공격을 차단한다
- ownerAuth 최초 사용 전 유예 구간에서는 masterAuth만으로 변경 가능하다

---

## 설계 변경 사항

### 1. agents 테이블 변경

```sql
CREATE TABLE agents (
  id              TEXT PRIMARY KEY,                                            -- UUID v7
  name            TEXT NOT NULL UNIQUE,
  chain           TEXT NOT NULL CHECK (chain IN ('solana', 'ethereum')),       -- [v0.7] ChainType SSoT
  network         TEXT NOT NULL CHECK (network IN ('mainnet', 'devnet', 'testnet')), -- [v0.7] NetworkType SSoT
  public_key      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'CREATING'
    CHECK (status IN ('CREATING', 'ACTIVE', 'SUSPENDED', 'TERMINATING', 'TERMINATED')),
  owner_address   TEXT,                                                        -- [v0.8] NOT NULL → nullable
  owner_verified  INTEGER NOT NULL DEFAULT 0,                                  -- [v0.8] 신규: ownerAuth 사용 이력 (0/1)
  created_at      INTEGER NOT NULL,                                            -- Unix epoch 초 단위
  updated_at      INTEGER NOT NULL,                                            -- Unix epoch 초 단위
  suspended_at    INTEGER,
  suspension_reason TEXT
);

CREATE UNIQUE INDEX idx_agents_public_key ON agents(public_key);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_chain_network ON agents(chain, network);
CREATE INDEX idx_agents_owner_address ON agents(owner_address);
```

> **v0.7 스키마와의 정합:** DDL은 25-sqlite-schema (v0.7 확정)의 현재 agents 테이블을 기준으로 하며, v0.8에서 변경하는 컬럼만 `[v0.8]` 태그로 표시한다.

| 컬럼 | 변경 | 설명 |
|------|------|------|
| `owner_address` | NOT NULL → **nullable** | Owner 없이 에이전트 생성 가능 |
| `owner_verified` | **신규** | ownerAuth로 서명한 적 있으면 1, 유예/잠금 구간 판단용 |
| `idx_agents_owner_address` | **인덱스 유지** | nullable이지만 Owner 기반 조회에 필요 |

### 2. 점진적 보안 해금 모델

```
┌──────────────────────────────────────────────────────────┐
│  Base (Owner 없음)                                        │
│                                                          │
│  masterAuth ✓    sessionAuth ✓                           │
│  정책: INSTANT / NOTIFY / DELAY                          │
│  알림: 전 채널 수신 ✓ (정보성 + DELAY 취소)                │
│  Kill Switch: 발동 masterAuth / 복구 masterAuth + 24h    │
│  세션 갱신: 자동 확정 (거부자 없음)                        │
│  자금 회수: 불가                                          │
├──────────────────────────────────────────────────────────┤
│  Enhanced (Owner 등록)                  ← 해금            │
│                                                          │
│  + ownerAuth ✓                                           │
│  + 정책: APPROVAL 티어 해금                               │
│  + 알림: 승인/거부 액션 버튼                               │
│  + 자금 회수: owner_address로 전량 회수                    │
│  + 세션 갱신: Owner 거부 윈도우 활성화                     │
│  + Kill Switch 복구: ownerAuth + masterAuth + 30min      │
└──────────────────────────────────────────────────────────┘
```

### 3. 정책 엔진 동작: APPROVAL 다운그레이드

OwnerState가 LOCKED가 아닌 에이전트(NONE 또는 GRACE)에서 `evaluate()` 11단계(33-time-lock §4) 결과가 APPROVAL 티어인 거래는 차단하지 않고 **DELAY로 다운그레이드**한다. 다운그레이드는 evaluate() §9의 `maxTier(nativeTier, usdTier)` 산출 직후(Step 9.5)에 적용된다. GRACE에서도 ownerAuth 미사용 상태이므로 Owner 서명을 받을 수 없어 다운그레이드된다 (부록 매트릭스 행 5 참조).

> **v0.6 변경 반영:** 정책 평가는 네이티브 금액과 USD 환산 금액(`resolveEffectiveAmountUsd()`, 61-price-oracle)을 모두 평가하여 보수적(높은 쪽) 티어를 채택한다. 아래 표의 티어는 이 dual 평가의 최종 결과를 기준으로 한다.

| 평가 결과 티어 | NONE / GRACE (LOCKED 아님) | LOCKED |
|--------------|---------------------------|--------|
| INSTANT | 즉시 실행 | 즉시 실행 |
| NOTIFY | 즉시 실행 + 알림 | 즉시 실행 + 알림 |
| DELAY | 쿨다운 + 알림 | 쿨다운 + 알림 |
| APPROVAL | **DELAY로 다운그레이드 (쿨다운 + 알림 + 등록/검증 안내)** | **Owner 서명 대기** |

> **[v0.8-SSoT] GRACE 다운그레이드 근거:** GRACE에서 ownerAuth가 한 번도 사용되지 않았으므로 Owner의 서명 능력이 미검증이다. APPROVAL 승인 대기를 걸면 영원히 만료될 수 있다. GRACE에서 Owner가 ownerAuth를 처음 사용하면(approve/recover) 자동으로 LOCKED로 전이된다 (Step 8.5). 상세: 부록 매트릭스 + 33-time-lock §11.6 참조.

다운그레이드 삽입 지점 (evaluate 11단계 기준):

```typescript
// evaluate() §9: maxTier(nativeTier, usdTier) 산출 직후
// [v0.8-SSoT] 33-time-lock §11.6 Step 9.5 확정 코드와 일관
const finalTier = maxTier(nativeTier, usdTier)
if (finalTier === 'APPROVAL') {
  const ownerState = resolveOwnerState(agent)  // NONE | GRACE | LOCKED
  if (ownerState !== 'LOCKED') {
    // NONE 또는 GRACE: Owner 승인 불가 -> DELAY로 다운그레이드
    return { tier: 'DELAY', downgraded: true, originalTier: 'APPROVAL' }
  }
}
```

> `downgraded: true` 플래그는 알림 시스템에서 Owner 등록 안내 메시지 포함 여부를 결정하는 데 사용된다.

다운그레이드 시 알림에 Owner 등록 안내를 포함한다:

```
⏳ 대액 거래 대기 중 (APPROVAL → DELAY 다운그레이드)
에이전트: trading-bot
금액: 15 SOL (≈ $2,250) → 9bKrTD...
실행 예정: 15분 후 (14:45 UTC)
[취소하기]

💡 Owner 지갑을 등록하면 대액 거래에
   승인 정책을 적용할 수 있습니다.
   waiaas agent set-owner trading-bot <address>
```

Owner 등록 후 동일 거래:

```
🔐 거래 승인 요청
에이전트: trading-bot
금액: 15 SOL → 9bKrTD...
만료: 1시간 후
[승인하기] [거부하기]
```

### 4. Owner 주소 등록/변경/해제 정책

#### 4.1 생명주기

```
(없음) ──등록──→ 유예 구간 ──ownerAuth 첫 사용──→ 잠금 구간
                  │                                  │
                  │ masterAuth로 변경/해제 가능       │ ownerAuth + masterAuth로만 변경
                  │                                  │ 해제 불가 (Owner 동의 없이)
```

#### 4.2 등록

```bash
# 에이전트 생성 시 (선택)
waiaas agent create --name bot --chain solana --owner 7xKXtg...

# 이후 별도 등록
waiaas agent set-owner bot 7xKXtg...
```

- **인증**: masterAuth
- **검증**: 주소 형식만 확인 (Solana: Base58 32bytes, Ethereum: 0x + EIP-55)
- **서명**: 불필요

#### 4.3 변경

| 구간 | 조건 | 인증 |
|------|------|------|
| 유예 (owner_verified = 0) | ownerAuth 사용 전 | masterAuth만 |
| 잠금 (owner_verified = 1) | ownerAuth 사용 후 | **ownerAuth(기존 주소) + masterAuth** |

유예 구간은 오타 교정을 위한 것이다. ownerAuth를 한 번이라도 사용하면 해당 주소의 진위가 증명된 것이므로, 이후 변경에는 기존 Owner의 동의가 필요하다.

#### 4.4 해제 (Owner 제거)

| 구간 | 가능 여부 | 인증 |
|------|:---------:|------|
| 유예 | 가능 | masterAuth만 |
| 잠금 | **불가** | — (Owner 동의 없이 보안 다운그레이드 방지) |

잠금 구간에서 Owner를 제거하려면 Owner 주소를 변경한 후 새 Owner가 해제를 승인하는 것은 논리적으로 동치이므로, 별도 해제 경로를 두지 않는다.

### 5. 자금 회수 (Owner 전용)

Owner가 등록된 에이전트에서만 자금 회수가 가능하다.

#### 5.1 API 엔드포인트

```
POST /v1/owner/agents/:agentId/withdraw
인증: masterAuth만
제약: 수신 주소 = agents.owner_address (고정)
HTTP: 200 (전량 회수 완료) / 207 (부분 회수, failed 배열 비어있지 않음) / 404 (에이전트 또는 Owner 미등록)
```

```json
// 요청
{
  "scope": "all"     // "native" = 네이티브만, "all" = 토큰 포함 전량
}

// 응답
{
  "totalTransactions": 3,
  "nativeRecovered": "2.458",
  "tokensRecovered": [
    { "symbol": "USDC", "amount": "150.00", "mint": "EPjFW..." },
    { "symbol": "BONK", "amount": "5000000", "mint": "DezXA..." }
  ],
  "rentRecovered": "0.012",
  "failed": []
}
```

#### 5.2 ownerAuth 없이 masterAuth만인 이유

수신 주소가 `agents.owner_address`로 고정되어 있으므로:

| 공격 시나리오 | 결과 |
|-------------|------|
| masterAuth 유출 → withdraw 호출 | 자금 → Owner 지갑 (공격자 이득 없음) |
| masterAuth 유출 → 주소 변경 → withdraw | 잠금 구간이면 ownerAuth 필요 → **차단** |
| masterAuth 유출 → 유예 구간에서 주소 변경 → withdraw | 가능하지만, ownerAuth 미사용 = 아직 Owner 검증 전 (등록 직후) |

**자금이 항상 등록된 Owner 주소로만 이동하므로, masterAuth만으로 안전하다.**

#### 5.3 IChainAdapter 확장

> **v0.6/v0.7 반영:** IChainAdapter는 현재 19개 메서드 (v0.6: 17개, v0.7: +2 nonce = 19개). 토큰 잔액 조회는 v0.6에서 추가된 `getAssets(address): Promise<AssetInfo[]>` (57-asset-query-fee-estimation)로 이미 가능하므로, 별도 `getTokenBalances`를 추가하지 않는다. v0.8에서는 **sweepAll 1개만 추가** (19→20개).

```typescript
interface IChainAdapter {
  // 기존 19개 메서드 유지 (v0.6: 17개, v0.7: +2 nonce = 19개)
  // getAssets()로 토큰 잔액 조회 가능 (v0.6 추가, AssetInfo[] 반환)

  // 신규: 전량 회수 (19→20개)
  sweepAll(from: string, to: string): Promise<SweepResult>
}

interface SweepResult {
  transactions: Array<{
    txHash: string
    assets: Array<{ mint: string; amount: string }>
  }>
  nativeRecovered: string
  tokensRecovered: AssetInfo[]       // v0.6 AssetInfo 재사용 (57-asset-query)
  rentRecovered?: string             // Solana 토큰 계정 rent 회수분
  failed: Array<{ mint: string; error: string }>
}
```

#### 5.4 Solana sweep 실행 순서

```
1. getAssets(address) → 보유 자산 전수 조사 (v0.6 AssetInfo[])
2. 토큰별 transfer + closeAccount → BatchRequest로 원자적 배치 (v0.6, 60-batch-transaction)
   └─ Solana: min 2 / max 20 instruction per batch (tx 크기 제한)
   └─ 배치 실패 시 개별 토큰 fallback (partial sweep 허용)
3. 네이티브 SOL 전량 전송 (잔액 - tx fee)
   └─ 마지막 tx이므로 fee를 정확히 계산
```

> **BatchRequest 활용:** sweepAll의 토큰 배치는 내부적으로 `buildBatch()` (v0.6, IChainAdapter 17번째 메서드)를 사용한다. 정책 평가는 sweepAll 전체에 대해 1회만 수행하며, 개별 배치의 2단계 정책(개별+합산)은 적용하지 않는다 (회수는 정책 엔진 우회 — §5.2 참조).

#### 5.5 Kill Switch 상태에서의 회수

Kill Switch ACTIVATED 상태에서도 회수가 가능해야 한다. 키스토어를 일시적으로 열어 회수 트랜잭션에 서명하고, 즉시 다시 잠근다.

> **[v0.8-SSoT] 35-01 결정 (방안 A 채택):** killSwitchGuard(미들웨어 #7)의 허용 목록에 `POST /v1/owner/agents/:agentId/withdraw`를 5번째 경로로 추가한다. 기존 4개 허용 경로(`GET /v1/health`, `GET /v1/admin/status`, `POST /v1/admin/recover`, `GET /v1/admin/kill-switch`) + 1개 = 총 5개. 자금 회수는 Kill Switch 발동 시 가장 시급한 조치이며, 기존 API 인프라(masterAuth, 감사 로그, WithdrawService)를 재사용한다. LOCKED 상태에서만 활성화되므로 Kill Switch + withdraw 모두 보안 가드를 통과한다 (부록 매트릭스 행 11 참조).

### 6. Kill Switch 동작 변경

> **v0.7 반영:** Kill Switch는 3-state(NORMAL→ACTIVATED→RECOVERING), 503 SYSTEM_LOCKED 응답, `POST /v1/admin/recover`로 복구 (36-killswitch §2.1). v0.8은 Owner 유무에 따라 **복구 인증 요건과 대기 시간**을 분기한다.

| 동작 | Owner 없음 | Owner 있음 |
|------|-----------|-----------|
| 발동 | masterAuth | masterAuth 또는 ownerAuth |
| 복구 엔드포인트 | `POST /v1/admin/recover` | `POST /v1/admin/recover` |
| 복구 인증 | masterAuth + **강제 대기 24h** | ownerAuth + masterAuth + 30min |
| 복구 대기 근거 | 이중 인증 부재를 시간으로 보상 | Owner 서명이 이중 인증 역할 |

Owner 없는 에이전트의 복구 대기 시간을 24h로 길게 잡아, 이중 인증 부재를 시간으로 보상한다.

### 7. 세션 갱신 동작 변경

| 동작 | NONE / GRACE | LOCKED |
|------|-------------|--------|
| 갱신 실행 | 즉시 확정 | 갱신 후 알림 |
| 거부 윈도우 | 없음 (거부자 없음 또는 미검증) | Owner 거부 가능 (기본 1시간) |
| 알림 | "세션 갱신됨 (3/30)" 정보성 | "세션 갱신됨 (3/30)" + `[거부하기]` |

> **[v0.8-SSoT]** GRACE에서도 ownerAuth 미사용이므로 거부 기능이 비활성이다 (53-session-renewal §6.6.1). LOCKED에서만 [거부하기] 버튼이 활성화된다. 부록 매트릭스 행 12-13 참조.

maxRenewals, 총 세션 수명 30일 상한 등 안전 장치는 OwnerState와 무관하게 동일 적용된다.

### 8. 알림 체계 변경

알림 채널(Telegram/Discord/ntfy.sh)은 데몬 레벨 설정이므로 Owner 등록과 무관하게 동작한다.

| 이벤트 | NONE / GRACE (LOCKED 아님) | LOCKED |
|--------|---------------------------|--------|
| INSTANT 거래 | "0.05 SOL 전송 완료" | 동일 |
| NOTIFY 거래 | "0.5 SOL 전송 완료" | 동일 |
| DELAY 거래 대기 | "5 SOL 대기 중" + `[취소하기]` | 동일 |
| APPROVAL 대기 | TX_DOWNGRADED_DELAY (DELAY로 다운그레이드 + 등록/검증 안내) | "15 SOL 승인 대기" + `[승인]` `[거부]` |
| 세션 갱신 | "세션 갱신됨 (3/30)" 정보성 | + `[거부하기]` |
| Kill Switch | "Kill Switch 발동됨" | 동일 |
| 이상 패턴 | "에이전트 정지됨" | 동일 |

> **[v0.8-SSoT]** 위 표의 열 구분을 "Owner 없음 / Owner 있음" 에서 "NONE/GRACE / LOCKED"으로 변경. GRACE에서도 APPROVAL은 다운그레이드되고 세션 갱신 거부는 비활성이므로, 3-State 기준이 정확하다. 부록 매트릭스 참조.

DELAY 다운그레이드 알림에는 Owner 등록 안내를 포함한다.

---

## DX 변화

### 1. 초기 셋업 플로우 단축

**objectives/v0.5 (Owner 필수):**
```
init → start → agent create --name X --chain solana --owner 7xKXtg...
                                                     ^^^^^^^^^^^^^^^^
                                                     필수 (주소 준비 필요)
→ session create → SDK 코드
소요: 3분, 필수 정보: 마스터 패스워드 + Owner 주소
```

**objectives/v0.8 (Owner 선택):**
```
init → start → agent create --name X --chain solana → session create → SDK 코드
소요: 1분, 필수 정보: 마스터 패스워드만
```

Owner 주소 준비 단계가 완전히 제거된다.

### 2. --quickstart 간소화

```bash
# objectives/v0.5
waiaas init --quickstart --chain solana --owner 7xKXtg...

# objectives/v0.8
waiaas init --quickstart --chain solana
```

필수 인자가 `--chain` 하나로 줄어든다.

### 3. CLI 명령어 변경

| 명령어 | 변경 |
|--------|------|
| `agent create --owner` | 필수 → **선택** |
| `agent set-owner <agent> <address>` | **신규** — 사후 Owner 등록 |
| `agent remove-owner <agent>` | **신규** — 유예 구간에서만 동작 |
| `agent info <agent>` | Owner 없으면 등록 안내 메시지 표시 |
| `owner withdraw --agent <agent>` | **[v0.8-SSoT] 신규** — LOCKED 상태에서만 활성 (35-01 확정, 부록 매트릭스 행 8) |

### 4. 출력 메시지 변화

**agent create (Owner 없음):**
```
$ waiaas agent create --name trading-bot --chain solana

Agent "trading-bot" created
  ID:      01950288-...
  Chain:   solana
  Address: 9bKrTD...  (에이전트 지갑)
  Owner:   (미등록)

  에이전트에 자금을 충전하세요:
  → 9bKrTD... 주소로 SOL 전송

  💡 Owner 지갑을 등록하면 대액 거래 승인, 자금 회수 등
     추가 보안 기능을 사용할 수 있습니다:
     waiaas agent set-owner trading-bot <owner-address>
```

**agent create (Owner 포함):**
```
$ waiaas agent create --name trading-bot --chain solana \
    --owner 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

Agent "trading-bot" created
  ID:      01950288-...
  Chain:   solana
  Address: 9bKrTD...  (에이전트 지갑)
  Owner:   7xKXtg...  (승인 권한)

  에이전트에 자금을 충전하세요:
  Owner(7xKXtg...) → Agent(9bKrTD...) SOL 전송
```

### 5. 사용자 여정

**처음 써보는 개발자:**
```
1. waiaas init && waiaas start          ← 인프라 초기화
2. waiaas agent create --name bot       ← Owner 없이 즉시 생성
   --chain solana
3. waiaas session create --agent bot    ← 세션 발급
4. export WAIAAS_SESSION_TOKEN=wai_...  ← SDK 연결
5. (개발/테스트 진행...)

   ... 거래 규모가 커짐 ...

6. Telegram 알림: "15 SOL 대기 중
   💡 Owner 등록하면 승인 정책 적용 가능"
7. waiaas agent set-owner bot 7xKXtg... ← 자발적 보안 강화
8. 이제 APPROVAL 티어, 회수, 거부 해금
```

**프로덕션 운영자:**
```
1. waiaas init
2. waiaas start
3. waiaas agent create --name prod-bot  ← 처음부터 Owner 포함
   --chain solana --owner 7xKXtg...
4. 3계층 보안 완전 가동 상태로 시작
```

두 경로 모두 자연스럽고, 전환 비용이 없다.

---

## objectives/v0.5 수정 사항

본 마일스톤으로 인해 objectives/v0.5에서 변경되는 항목:

| 항목 | 현재 (v0.5 + v0.7 반영) | v0.8 변경 |
|------|------------------------|----------|
| 원칙 2 "Owner 주소는 에이전트의 속성" | NOT NULL 필수 | **nullable 선택** |
| 25-sqlite-schema agents 테이블 | `owner_address TEXT NOT NULL` | `owner_address TEXT` (nullable) + `owner_verified INTEGER` |
| 52-auth-model §5 Owner 주소 변경 정책 | 서명 이력 분기 | **v0.8로 이관** (유예/잠금 2단계) |
| 54-cli-flow CLI 에이전트 생성 | `--owner` 필수 | `--owner` 선택 |
| 54-cli-flow --quickstart | `--owner` 필수 인자 | `--owner` 선택 인자 |
| v0.5 성공 기준 2 | "agent create --owner로 등록" | "agent create로 생성, --owner 선택" |

---

## 영향받는 설계 문서

| 문서 | 변경 규모 | 변경 내용 |
|------|:--------:|----------|
| **CORE-02** (25-sqlite-schema) | 중 | agents.owner_address nullable, owner_verified 추가 |
| **CORE-04** (27-chain-adapter-interface) | 소 | sweepAll 메서드 1개 추가 (19→20개) |
| **CORE-05** (28-daemon-lifecycle-cli) | 중 | agent set-owner/remove-owner CLI 명령, 출력 메시지 |
| **SESS-PROTO** (30-session-token-protocol) | 소 | 세션 갱신 시 Owner 유무 분기 |
| **CHAIN-SOL** (31-solana-adapter-detail) | 중 | sweepAll Solana 구현, getAssets() 활용, BatchRequest 연계 |
| **LOCK-MECH** (33-time-lock-approval-mechanism) | 중 | APPROVAL 다운그레이드 로직 (evaluate §9 이후), Owner 유무 분기 |
| **OWNR-CONN** (34-owner-wallet-connection) | 대 | Owner 등록/변경/해제 생명주기 전면 재설계 |
| **NOTI-ARCH** (35-notification-architecture) | 소 | 다운그레이드 알림 템플릿, 등록 안내 메시지 (USD 환산 포함) |
| **KILL-AUTO-EVM** (36-killswitch-autostop-evm) | 중 | Owner 유무별 복구 정책 분기 (30min vs 24h), POST /v1/admin/recover 분기 |
| **API-SPEC** (37-rest-api-complete-spec) | 중 | withdraw 엔드포인트 추가 (200/207/404), 인증 맵 Owner 유무 분기 |
| **TGBOT-DOCKER** (40-telegram-bot-docker) | 소 | 다운그레이드 알림 + 등록 안내 인라인 메시지 |
| **ASSET-QUERY** (57-asset-query-fee-estimation) | 소 | sweepAll이 getAssets() 결과 활용 (참조) |
| **BATCH-TX** (60-batch-transaction-spec) | 소 | sweepAll 배치가 buildBatch() 활용 (참조) |
| **PRICE-ORACLE** (61-price-oracle-spec) | 소 | 다운그레이드 판단 시 resolveEffectiveAmountUsd() 참조 |

---

## 산출물

| 산출물 | 설명 |
|--------|------|
| Owner 선택적 등록 스펙 | 등록/변경/해제 생명주기, 유예/잠금 구간 정의 |
| 점진적 보안 해금 모델 | Base(Owner 없음) / Enhanced(Owner 있음) 기능 분리표 |
| APPROVAL 다운그레이드 정책 | Owner 없을 때 DELAY 대체 + USD dual 평가 연동 + 알림 안내 설계 |
| 자금 회수 프로토콜 | withdraw API (200/207/404), sweepAll 메서드 (getAssets() + buildBatch() 활용) |
| DX 변경 스펙 | CLI 명령어 변경, 출력 메시지, --quickstart 간소화 |
| 수정된 설계 문서 (14개) | Owner 선택적 모델 반영 (기존 11개 + v0.6 문서 3개 참조 추가) |

---

## 성공 기준

1. `waiaas agent create`가 `--owner` 없이 에이전트를 생성할 수 있다
2. Owner 없는 에이전트가 INSTANT/NOTIFY/DELAY 티어에서 정상 거래를 수행한다
3. Owner 없는 에이전트의 APPROVAL 티어 거래가 DELAY로 다운그레이드되어 실행된다 (차단 아님, dual 평가 기준)
4. 다운그레이드 알림에 Owner 등록 안내 메시지가 포함된다
5. `waiaas agent set-owner`로 사후에 Owner를 등록할 수 있다
6. Owner 등록 후 APPROVAL 티어가 해금되어 ownerAuth 승인이 동작한다
7. Owner 등록 후 `withdraw` API로 에이전트 자금을 owner_address로 회수할 수 있다
8. 전량 회수(scope: all) 시 네이티브 + SPL 토큰 + rent가 모두 회수된다
9. ownerAuth 사용 전(유예 구간)에는 masterAuth만으로 Owner 주소를 변경/해제할 수 있다
10. ownerAuth 사용 후(잠금 구간)에는 ownerAuth + masterAuth 없이 Owner 주소를 변경할 수 없다
11. Owner 없는 에이전트의 Kill Switch 복구에 24시간 강제 대기가 적용된다
12. Owner 없는 에이전트의 세션 갱신이 거부 윈도우 없이 즉시 확정된다
13. Owner 있는 에이전트의 세션 갱신 알림에 `[거부하기]` 버튼이 표시된다
14. `--quickstart`가 `--owner` 없이 동작한다

---

*작성: 2026-02-07*
*갱신: 2026-02-08 — v0.6(블록체인 확장)/v0.7(구현 장애 해소) 정합 반영*
*기반 분석: objectives/v0.5 인증 모델 + 에이전트 지갑 시장 조사 + OpenClaw 통합 시나리오*

### 갱신 이력 (2026-02-08)

| 변경 | 근거 | 영향 섹션 |
|------|------|----------|
| agents DDL → v0.7 스키마 정합 (INTEGER 타임스탬프, network 컬럼, public_key, status CHECK) | v0.7 E-2, E-3 확정 | §1 |
| getTokenBalances 제거 → getAssets() 재사용 | v0.6에서 getAssets()(57-asset-query) 이미 추가됨, 중복 | §5.3 |
| IChainAdapter 메서드 수 13→19 정정, sweepAll만 추가 = 20개 | v0.6: 17개, v0.7: +2 nonce = 19개 | §5.3 |
| 정책 동작표 SOL → dual 평가(native + USD) 반영 | v0.6 evaluate() 11단계, resolveEffectiveAmountUsd() | §3 |
| 다운그레이드 삽입 지점 명시 (evaluate §9 이후) | v0.6 정책 확장과의 정합 | §3 |
| sweep 배치에 buildBatch() 활용 명시 | v0.6 BatchRequest(60-batch-transaction) 재사용 | §5.4 |
| Kill Switch 복구 엔드포인트 v0.7 반영 | v0.7 B-4: POST /v1/admin/recover, 503 SYSTEM_LOCKED | §5.5, §6 |
| withdraw API HTTP status 추가 (200/207/404) | v0.7 Phase 29 HTTP status 매트릭스와 일관 | §5.1 |
| 영향 문서 11→14개 (v0.6 문서 57, 60, 61 참조 추가) | sweepAll/다운그레이드가 v0.6 설계와 직접 연관 | 영향 문서 표 |
| 알림 메시지에 USD 환산 표기 추가 | v0.6 IPriceOracle 도입으로 USD 환산 가능 | §3 알림 예시 |

---

## 부록: Owner 상태 분기 매트릭스 (SSoT)

> 이 매트릭스는 v0.8 Owner 선택적 모델의 전체 동작 분기를 정의하는 **SSoT(Single Source of Truth)** 이다.
> 14개 설계 문서의 v0.8 변경 사항은 이 매트릭스와 일관되어야 한다.
> Phase 31-34 산출물에서 확정된 동작을 통합하였다.

### Owner 상태 정의

| 상태 | DB 조건 | 설명 |
|------|---------|------|
| **NONE** | `owner_address IS NULL` | Owner 미등록. Base 보안 (DELAY까지) |
| **GRACE** (유예) | `owner_address IS NOT NULL AND owner_verified = 0` | Owner 등록됨, ownerAuth 미사용. masterAuth만으로 변경/해제 가능 |
| **LOCKED** (잠금) | `owner_address IS NOT NULL AND owner_verified = 1` | Owner 검증 완료. ownerAuth+masterAuth로만 변경. 해제 불가 |

> 상태는 DB 컬럼이 아닌 `resolveOwnerState()` 순수 함수로 런타임 산출한다 (Phase 31 결정).

### 전체 동작 분기 매트릭스

| # | 기능 / API | NONE (Owner 없음) | GRACE (유예) | LOCKED (잠금) | 근거 문서 |
|---|-----------|-------------------|--------------|---------------|-----------|
| 1 | 에이전트 생성 `POST /v1/agents` | ownerAddress 선택적 | - | - | 34-owner-wallet-connection §10, 37-rest-api §8.3 |
| 2 | INSTANT 거래 | 즉시 실행 | 즉시 실행 | 즉시 실행 | 33-time-lock §4 |
| 3 | NOTIFY 거래 | 즉시 실행 + 알림 | 즉시 실행 + 알림 | 즉시 실행 + 알림 | 33-time-lock §4 |
| 4 | DELAY 거래 | 쿨다운 + 알림 | 쿨다운 + 알림 | 쿨다운 + 알림 | 33-time-lock §4, §6 |
| 5 | APPROVAL 거래 | **DELAY 다운그레이드** [1] | **DELAY 다운그레이드** [1] | ownerAuth 승인 대기 | 33-time-lock §11.6 Step 9.5 |
| 6 | 다운그레이드 알림 | TX_DOWNGRADED_DELAY + Owner 등록 안내 | TX_DOWNGRADED_DELAY + Owner 검증 안내 | 해당 없음 (정상 APPROVAL) | 33-time-lock §11.8, 35-notification |
| 7 | APPROVAL 승인 알림 | 해당 없음 (다운그레이드) | 해당 없음 (다운그레이드) | [승인]/[거부] 버튼 | 33-time-lock §11.7, 35-notification |
| 8 | 자금 회수 `withdraw` | **불가** (Owner 없음) | **불가** (LOCKED만) [4] | masterAuth | 37-rest-api §8.18, 34-01 WithdrawService |
| 9 | Kill Switch 발동 | masterAuth | masterAuth | masterAuth 또는 ownerAuth | 36-killswitch §1.2 |
| 10 | Kill Switch 복구 대기 | masterAuth + **24h** | masterAuth + **24h** | ownerAuth + masterAuth + **30min** | 36-killswitch §4.7 |
| 11 | Kill Switch withdraw | **불가** | **불가** | masterAuth (killSwitchGuard 허용) [3] | 35-01 방안 A 결정 |
| 12 | 세션 갱신 | 즉시 확정 | 즉시 확정 | [거부하기] 활성 (기본 1시간) | 53-session-renewal §6.6 |
| 13 | 세션 갱신 알림 | 정보성 "세션 갱신됨" | 정보성 "세션 갱신됨" | "세션 갱신됨" + **[거부하기]** 버튼 | 53-session-renewal §6.6, 34-02 |
| 14 | Owner 등록 `set-owner` | masterAuth | - (이미 등록) | - (이미 등록) | 34-owner-wallet-connection §10.2 전이 #1 |
| 15 | Owner 변경 `set-owner` | - (Owner 없음) | masterAuth | ownerAuth(기존 주소) + masterAuth | 34-owner-wallet-connection §10.2 전이 #4, #5 |
| 16 | Owner 해제 `remove-owner` | - (Owner 없음) | masterAuth | **불가** (OWNER-06) [4] | 34-owner-wallet-connection §10.2 전이 #6 |
| 17 | `agent info` 출력 | 등록 안내 메시지 (`set-owner` 가이드) | Owner 주소 + "(pending)" | Owner 주소 + "(verified)" | 54-cli-flow §5.5, 35-01 DX-05 |
| 18 | `--quickstart` | `--chain`만 필수 (Owner 미등록으로 시작) | - | - | 54-cli-flow §6.2, 35-01 DX-04 |

### 각주

- **[1] DELAY 다운그레이드:** APPROVAL -> DELAY 전환. `delaySeconds = SPENDING_LIMIT.delay_seconds || 300초` (최소 60초). Step 9.5에서 `resolveOwnerState() !== 'LOCKED'`이면 다운그레이드 적용 후 `return`으로 Step 10(APPROVE_TIER_OVERRIDE) 스킵. NONE과 GRACE 모두 동일하게 다운그레이드된다 -- GRACE에서 ownerAuth 미사용 상태이므로 Owner 서명을 받을 수 없다 (33-time-lock §11.6 안티패턴 참조).
- **[2] ownerAuth 첫 사용 시 LOCKED 전이:** ownerAuth 미들웨어 Step 8.5에서 `markOwnerVerified()` 자동 호출. `BEGIN IMMEDIATE + WHERE owner_verified = 0` 원자화. GRACE -> LOCKED 자동 전이는 Owner가 approve 또는 recover를 처음 사용하는 시점에 발생한다 (34-owner-wallet-connection §10.2 전이 #3).
- **[3] Kill Switch withdraw 허용:** killSwitchGuard 5번째 허용 경로 -- `POST /v1/owner/agents/:agentId/withdraw` 추가 (35-01 방안 A 결정). 기존 4개 허용 경로: `GET /v1/health`, `GET /v1/admin/status`, `POST /v1/admin/recover`, `GET /v1/admin/kill-switch`.
- **[4] 보안 다운그레이드 방지:** LOCKED에서 Owner 해제 불가 (OWNER-06). GRACE에서 withdraw 불가 -- `resolveOwnerState() !== 'LOCKED'`이면 WITHDRAW_LOCKED_ONLY 에러 (H-02 방어, 37-rest-api §8.18).

### 상태 전이와 매트릭스의 관계

```
(없음) NONE ──등록(#1)──→ GRACE ──ownerAuth 첫 사용(#3) [2]──→ LOCKED
                            │                                      │
                            │ masterAuth로 변경/해제 가능(#2,#4)   │ ownerAuth+masterAuth로만 변경(#5)
                            │                                      │ 해제 불가(#6)
```

- 전이 #1 (NONE->GRACE): `set-owner` 또는 `agent create --owner`. 매트릭스 행 14.
- 전이 #2 (GRACE->NONE): `remove-owner`. 매트릭스 행 16.
- 전이 #3 (GRACE->LOCKED): ownerAuth 첫 사용 시 자동. LOCKED 전이 후 행 5의 APPROVAL이 정상 동작.
- 전이 #4 (GRACE->GRACE 주소변경): `set-owner <new>`. 매트릭스 행 15.
- 전이 #5 (LOCKED->LOCKED 주소변경): `set-owner <new>`. 매트릭스 행 15. `owner_verified = 1` 유지(리셋 금지).
- 전이 #6 (LOCKED->NONE): **불가**. 매트릭스 행 16. 보안 다운그레이드 방지.

### GRACE APPROVAL 동작 상세 (Open Question 3 결론)

33-time-lock §11.6의 Step 9.5 코드에서 `resolveOwnerState() !== 'LOCKED'` 조건으로 판단하므로, **GRACE 상태에서도 APPROVAL 거래는 DELAY로 다운그레이드된다**. GRACE에서 ownerAuth가 한 번도 사용되지 않은 상태이므로 Owner의 서명 능력이 검증되지 않았고, APPROVAL 승인 대기를 걸면 영원히 만료될 수 있다 (33-time-lock §11.6 안티패턴 참조).

GRACE에서 Owner가 LOCKED로 전이하려면 approve 또는 recover 엔드포인트에서 ownerAuth를 사용해야 한다 (Step 8.5 markOwnerVerified 자동 호출). LOCKED 전이 이후 동일 금액 거래는 정상 APPROVAL로 처리된다 (33-time-lock §11.7).

### 교차 검증 결과

| 검증 항목 | 매트릭스 | 근거 문서 | 일치 |
|-----------|---------|-----------|:----:|
| NONE APPROVAL = DELAY 다운그레이드 | 행 5 | 33-time-lock §11.6 (ownerState !== 'LOCKED') | O |
| GRACE APPROVAL = DELAY 다운그레이드 | 행 5 | 33-time-lock §11.6, §11.8 (GRACE 흐름) | O |
| LOCKED APPROVAL = ownerAuth 승인 대기 | 행 5 | 33-time-lock §11.7 (LOCKED 복원 흐름) | O |
| GRACE withdraw 불가 | 행 8 | 37-rest-api §8.18 WITHDRAW_LOCKED_ONLY (H-02) | O |
| LOCKED remove-owner 불가 | 행 16 | 34-owner-wallet-connection §10.2 전이 #6 (OWNER-06) | O |
| Kill Switch 복구 24h vs 30min | 행 10 | 36-killswitch §4.7 | O |
| Kill Switch withdraw = killSwitchGuard 허용 | 행 11 | 35-01 방안 A | O |
| 세션 갱신 LOCKED만 [거부하기] | 행 12-13 | 53-session-renewal §6.6.1 | O |
| GRACE 세션 갱신 즉시 확정 | 행 12 | 53-session-renewal §6.6.1 | O |
| LOCKED 주소변경 owner_verified 유지 | 행 15 | 34-owner-wallet-connection §10.2 전이 #5 | O |

---

### 갱신 이력 (2026-02-09)

| 변경 | 근거 | 영향 섹션 |
|------|------|----------|
| Owner 상태 분기 매트릭스 SSoT 추가 (18행 x 3열) | Phase 31-34 산출물 통합, INTEG-02 | 부록 |
| GRACE APPROVAL = DELAY 다운그레이드 확정 | 33-time-lock §11.6 Step 9.5 코드 (`ownerState !== 'LOCKED'`) | 부록 행 5, GRACE 상세 |
| Kill Switch withdraw 방안 A 반영 | 35-01 결정 (killSwitchGuard 5번째 허용 경로) | 부록 행 11, 각주 [3] |
| 교차 검증 10건 수행 | 6개 설계 문서 대조 | 부록 교차 검증 결과 표 |
