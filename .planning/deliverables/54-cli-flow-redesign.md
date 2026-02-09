# CLI 플로우 재설계 (CLI-REDESIGN)

**문서 ID:** CLI-REDESIGN
**작성일:** 2026-02-07
**v0.8 업데이트:** 2026-02-09
**상태:** v0.8 갱신
**참조:** CORE-05 (28-daemon-lifecycle-cli.md), AUTH-REDESIGN (52-auth-model-redesign.md), SESS-RENEW (53-session-renewal-protocol.md), CORE-01 (24-monorepo-data-directory.md), API-SPEC (37-rest-api-complete-spec.md), OWNR-CONN (34-owner-wallet-connection.md), KILL-AUTO-EVM (36-killswitch-autostop-evm.md)
**요구사항:** DX-01, DX-02, DX-03, DX-04, DX-05

---

## 1. 개요

### 1.1 목적

WAIaaS CLI 플로우 재설계를 정의한다. v0.2의 `waiaas init` 4단계를 v0.5의 2단계로 간소화하고, `waiaas agent create`, `waiaas session create`, `--quickstart`, `--dev` 모드를 신규 정의한다. [v0.8] v0.8에서는 `--owner`를 선택 옵션으로 전환하고, `set-owner`, `remove-owner`, `owner withdraw` 3개 CLI 명령어를 추가하며, agent info에 Owner 미등록 안내 메시지를 신규 정의한다. 이 문서는 DX-01~DX-05 5개 요구사항을 단일 SSoT에서 해결한다.

### 1.2 요구사항 매핑

| 요구사항 | 설명 | 충족 섹션 |
|---------|------|-----------|
| DX-01 | `waiaas init` 순수 인프라 초기화 (에이전트/Owner 제거) | 섹션 2 |
| DX-02 | [v0.8] `waiaas agent create` (Owner 주소 선택, 서명 불필요) + `set-owner`/`remove-owner` 사후 등록/해제 | 섹션 3, 5 |
| DX-03 | `waiaas session create` masterAuth(implicit) 기반 | 섹션 4 |
| DX-04 | `--quickstart` 4단계 오케스트레이션 | 섹션 6 |
| DX-05 | `--dev` 모드 고정 패스워드 + 보안 경고; [v0.8] Owner 미등록 시 agent info 안내 메시지 | 섹션 5, 7 |

### 1.3 참조 문서

| 문서 ID | 파일 | 핵심 내용 |
|---------|------|-----------|
| CORE-05 | 28-daemon-lifecycle-cli.md | v0.2 CLI 플로우 (init 4단계, start/stop/status), parseArgs 패턴, Exit Code |
| AUTH-REDESIGN | 52-auth-model-redesign.md | masterAuth implicit/explicit, [v0.8] agents.owner_address nullable, authRouter |
| SESS-RENEW | 53-session-renewal-protocol.md | 세션 갱신 API, 토큰 회전, 5종 안전 장치 |
| CORE-01 | 24-monorepo-data-directory.md | config.toml 스펙, 데이터 디렉토리 구조 (~/.waiaas/) |
| API-SPEC | 37-rest-api-complete-spec.md | 31 엔드포인트 스펙, 에러 코드 체계, 인증 맵 |

### 1.4 v0.2 -> v0.5 -> v0.8 변경 요약

| 영역 | v0.2 (CORE-05) | v0.5 (이 문서) | v0.8 변경 | 변경 근거 |
|------|----------------|---------------|-----------|-----------|
| init | 4단계 (PW + Agent + Noti + Owner) | 2단계 (PW + Infra) | 유지 | DX-01: 관심사 분리. init은 인프라만 담당 |
| 에이전트 생성 | init 내 선택적 (Step 2) | `agent create --owner <addr>` 별도 커맨드 | [v0.8] `--owner` 필수 -> **선택** | DX-02: agents.owner_address nullable 전환 (v0.8 Owner 선택적 모델) |
| 세션 생성 | CLI에서 직접 커맨드 없음 (API 호출만) | `session create` CLI 커맨드 신규 | 유지 | DX-03: masterAuth(implicit)로 간소화 |
| 빠른 시작 | 없음 | `init --quickstart` 4단계 오케스트레이션 | [v0.8] `--owner` 필수 -> **선택** (`--chain`만 필수) | DX-04: 단일 커맨드로 토큰 발급까지 완료 |
| 개발 모드 | 없음 | `start --dev` 고정 패스워드 | 유지 | DX-05: 프롬프트 없이 즉시 시작 |
| Owner 관리 | 없음 | 없음 | [v0.8] `set-owner`, `remove-owner`, `owner withdraw` **신규** | DX-02: Owner 사후 등록/변경/해제/자금 회수 |
| agent info | 기본 정보 표시 | 유지 | [v0.8] Owner 미등록 시 **등록 안내 메시지** | DX-05: 사용자를 자발적 보안 강화로 유도 |

### 1.5 v0.2 CLI와의 관계

이 문서는 28-daemon-lifecycle-cli.md(CORE-05)의 v0.2 CLI 플로우를 **대체(supersede)** 한다. v0.2의 `init`, `start`, `stop`, `status`, `agent`, `backup` 커맨드 중 `init`의 플로우가 근본적으로 변경되고, `start`에 `--dev` 플래그가 추가되며, `agent create`, `session create` 커맨드가 신규 정의된다. `stop`, `status`, `backup`은 v0.2와 동일하다.

**공존 규칙:**
- 28-daemon-lifecycle-cli.md의 섹션 1~5 (데몬 아키텍처, 시작/종료 시퀀스, 시그널 처리, PID 관리)는 v0.5에서도 유효
- 28-daemon-lifecycle-cli.md의 섹션 6 (CLI 커맨드 상세)는 이 문서가 대체
- 충돌 시 이 문서(54)가 우선

---

## 2. waiaas init 재설계 (DX-01)

### 2.1 설계 원칙

`waiaas init`은 **순수 인프라 초기화**만 수행한다. 에이전트 생성, 알림 채널 설정, Owner 지갑 등록은 init의 책임이 아니다.

**v0.2 init 4단계 (제거 대상):**

| 단계 | v0.2 | v0.5 | 변경 |
|------|------|------|------|
| Step 1 | 마스터 패스워드 설정 | 마스터 패스워드 설정 | 유지 |
| Step 2 | 첫 에이전트 생성 (선택) | **제거** | `agent create`로 분리 |
| Step 3 | 알림 채널 설정 (선택) | **제거** | API/config.toml으로 설정 |
| Step 4 | Owner 지갑 등록 (선택) | **제거** | `agent create --owner`에 통합 |

**근거:** init과 에이전트 생성의 관심사를 분리하면 각 커맨드의 책임이 명확해진다. [v0.8] v0.8에서 agents.owner_address가 nullable로 전환되어, Owner 주소 없이도 에이전트를 생성할 수 있다. init은 순수 인프라만 담당한다.

### 2.2 v0.5 init 플로우 (2단계)

```mermaid
flowchart TD
    Start([waiaas init]) --> CheckJson{--json<br/>모드?}

    CheckJson -->|Yes| CheckExistJson{~/.waiaas/<br/>존재?}
    CheckJson -->|No| CheckExist{~/.waiaas/<br/>존재?}

    CheckExistJson -->|Yes| IdempotentReturn["JSON: { success: true,<br/>alreadyInitialized: true }"]
    CheckExistJson -->|No| Step1

    CheckExist -->|Yes, --force 없음| AlreadyInit["Error: Already initialized.<br/>Use --force to reinitialize"]
    CheckExist -->|Yes, --force 있음| ForceClean["기존 데이터 삭제"]
    CheckExist -->|No| Step1
    ForceClean --> Step1

    Step1[Step 1: 마스터 패스워드 설정]
    Step1 --> ResolvePassword{패스워드 해석}
    ResolvePassword -->|대화형| PWPrompt["stdin 프롬프트<br/>(입력 + 확인, 마스킹)"]
    ResolvePassword -->|비대화형| PWEnvOrFile["WAIAAS_MASTER_PASSWORD env<br/>또는 --password-file"]
    PWPrompt --> ValidatePW[최소 12자 검증]
    PWEnvOrFile --> ValidatePW

    ValidatePW --> Step2[Step 2: 인프라 초기화]
    Step2 --> Dir["~/.waiaas/ 디렉토리 생성 (chmod 700)<br/>data/, keystore/, logs/, backups/"]
    Dir --> Config["config.toml 기본 파일 생성"]
    Config --> DBInit["SQLite DB 초기화 + 마이그레이션"]
    DBInit --> KSInit["키스토어 초기화 (Argon2id 키 파생)"]
    KSInit --> Done([초기화 완료])
    Done --> NextStep["'Next: waiaas agent create'"]
```

**핵심:** init 완료 후 에이전트는 0개 상태. 다음 단계로 `waiaas agent create`를 안내한다. [v0.8] `--owner` 옵션은 선택이므로 안내 메시지에서 필수로 표기하지 않는다.

### 2.3 대화형 모드 출력 예시

```
$ waiaas init

  WAIaaS v0.5.0 - Initial Setup
  -----------------------------

  Step 1/2: Master Password
  Set a master password to protect your agent keys.
  This password will be required every time the daemon starts.

  Master password (min 12 chars): ****************
  Confirm password: ****************

  Step 2/2: Infrastructure Setup
  Creating data directory... OK
  Generating config.toml... OK
  Initializing database... OK (7 tables, migration v5)
  Setting up keystore... OK (Argon2id, ~2s)

  -----------------------------
  WAIaaS initialized successfully!

  Data directory: ~/.waiaas/
  Config file:    ~/.waiaas/config.toml
  Database:       ~/.waiaas/data/waiaas.db
  Keystore:       ~/.waiaas/keystore/

  Next steps:
    waiaas agent create                           Create your first agent
    waiaas start                                  Start the daemon

  [v0.8] Tip: Owner 지갑을 함께 등록하려면:
    waiaas agent create --owner <owner-address>
```

### 2.4 비대화형 모드 예시

```bash
# 환경변수로 패스워드 전달
export WAIAAS_MASTER_PASSWORD="my-secure-password-123"
waiaas init --non-interactive

# 파일로 패스워드 전달
waiaas init --non-interactive --password-file /secrets/master.pwd

# 커스텀 데이터 디렉토리
waiaas init --non-interactive --data-dir /opt/waiaas/data
```

### 2.5 init 옵션 테이블

| 옵션 | Short | 타입 | 필수 | 기본값 | 설명 |
|------|-------|------|------|--------|------|
| `--data-dir <path>` | - | string | X | `~/.waiaas` | 데이터 디렉토리 경로 |
| `--non-interactive` | - | boolean | X | `false` | 비대화형 모드 (CI/자동화) |
| `--password-env <var>` | - | string | X | `WAIAAS_MASTER_PASSWORD` | 패스워드 환경변수 이름 |
| `--password-file <path>` | - | string | X | - | 패스워드 파일 경로 (파일 첫 줄, mode 0o600 권장) |
| `--master-password <pw>` | - | string | X | - | **(v0.7 추가)** 마스터 패스워드 직접 전달 (Tauri sidecar 호출용). localhost 전용 |
| `--json` | - | boolean | X | `false` | **(v0.7 추가)** JSON 출력 + idempotent 동작: 이미 초기화된 경우 에러 없이 `{ success: true, alreadyInitialized: true }` 반환. Tauri Setup Wizard에서 sidecar로 호출 시 사용 |
| `--force` | - | boolean | X | `false` | 기존 초기화 덮어쓰기 (데이터 삭제!). idempotent 동작과 상호 배타적 |
| `--quickstart` | - | boolean | X | `false` | 4단계 통합 플로우 (섹션 6 참조) |
| `-h, --help` | `-h` | boolean | X | - | 도움말 |

### 2.6 패스워드 해석 우선순위

28-daemon-lifecycle-cli.md 섹션 2.2 Step 3에서 정의한 우선순위를 그대로 따른다:

```
1. 환경변수: process.env[passwordEnvName] (기본: WAIAAS_MASTER_PASSWORD)
2. 파일: --password-file로 지정된 경로의 첫 줄
3. stdin: 대화형 프롬프트 (--non-interactive가 아닌 경우)
```

| 우선순위 | 소스 | 적용 상황 | 보안 고려사항 |
|---------|------|----------|-------------|
| 1 (최우선) | 환경변수 | CI/CD, Docker, 스크립트 | 프로세스 환경에 노출. docker secrets와 함께 사용 권장. |
| 2 | 파일 | 자동화, systemd, --daemon | mode 0o600 필수. tmpfs 또는 암호화 디스크 권장. |
| 3 (기본) | stdin | 대화형 CLI 사용 | 가장 안전. 터미널 히스토리에 기록되지 않음. |

### 2.7 에러 처리

| 상황 | 에러 메시지 | Exit Code |
|------|-----------|-----------|
| 이미 초기화됨 (비-JSON) | `Error: Already initialized at ~/.waiaas/. Use --force to reinitialize.` | 1 |
| 이미 초기화됨 (--json) | `{ "success": true, "alreadyInitialized": true, ... }` [v0.7 보완: idempotent] | 0 |
| 비대화형 + 패스워드 미제공 | `Error: Master password not provided. Set WAIAAS_MASTER_PASSWORD or use --password-file.` | 1 |
| 패스워드 12자 미만 | `Error: Master password too short (minimum 12 characters, got N).` | 1 |
| 패스워드 불일치 (대화형) | `Error: Passwords do not match.` | 1 |
| 디스크 공간 부족 | `Error: Not enough disk space to initialize data directory.` | 1 |
| 디렉토리 권한 오류 | `Error: Cannot create data directory at <path>. Permission denied.` | 1 |

### 2.8 v0.2 대비 제거된 단계 명시

다음 기능은 v0.5 init에서 **의도적으로 제거**되었다:

| v0.2 기능 | v0.5 대안 | v0.8 갱신 | 제거 근거 |
|----------|----------|----------|----------|
| Step 2: 첫 에이전트 생성 (선택) | `waiaas agent create` | [v0.8] `--owner` 선택 옵션 (nullable) | init과 에이전트 생성의 관심사 분리. v0.8에서 Owner 없이도 에이전트 생성 가능. |
| Step 3: 알림 채널 설정 (선택) | `PUT /v1/owner/settings` API 또는 config.toml 직접 편집 | 유지 | 알림 설정은 데몬 시작 후 언제든 가능. init에서 강제할 필요 없음. |
| Step 4: Owner 지갑 등록 (선택) | `waiaas agent create --owner <addr>` | [v0.8] `agent set-owner`로 사후 등록 가능 | Owner 주소는 에이전트별 속성(agents.owner_address)으로 이동. v0.8에서 nullable 전환. |

### 2.9 구현 수도코드

```typescript
// packages/cli/src/commands/init.ts (v0.5 + v0.7 보완)
async function runInit(args: string[]): Promise<void> {
  const options = parseInitOptions(args)

  // --quickstart 플래그 처리 (섹션 6)
  if (options.quickstart) {
    return runQuickstart(options)
  }

  const dataDir = resolveDataDir(options.dataDir)

  // [v0.7 보완] --json 모드: idempotent 동작 (이미 초기화된 경우 에러 없이 성공 반환)
  if (options.json && existsSync(dataDir) && !options.force) {
    const steps = detectExistingSteps(dataDir)
    const allExist = Object.values(steps).every(s => s === 'exists')
    console.log(JSON.stringify({
      success: true,
      alreadyInitialized: allExist,
      dataDir,
      version: VERSION,
      steps,
    }))
    return  // exit 0 (에러 아님)
  }

  // 기존 초기화 확인 (비-JSON 모드: 기존 동작 유지)
  if (existsSync(dataDir) && !options.force) {
    console.error(`Error: Already initialized at ${dataDir}`)
    console.error("Use 'waiaas init --force' to reinitialize (WARNING: all data will be deleted)")
    process.exit(1)
  }

  // --force 시 기존 데이터 삭제
  if (options.force && existsSync(dataDir)) {
    rmSync(dataDir, { recursive: true })
    if (!options.json) console.log(`Removed existing data directory: ${dataDir}`)
  }

  // === Step 1: 마스터 패스워드 설정 ===
  const password = await resolveInitPassword(options)
  validatePasswordStrength(password) // 최소 12자

  // === Step 2: 인프라 초기화 (각 단계 개별 idempotent) [v0.7 보완] ===
  const steps: Record<string, string> = {}

  // 2-1. 디렉토리 생성 (idempotent: recursive)
  mkdirSync(dataDir, { mode: 0o700, recursive: true })
  mkdirSync(join(dataDir, 'data'), { mode: 0o700, recursive: true })
  mkdirSync(join(dataDir, 'keystore'), { mode: 0o700, recursive: true })
  mkdirSync(join(dataDir, 'logs'), { mode: 0o700, recursive: true })
  mkdirSync(join(dataDir, 'backups'), { mode: 0o700, recursive: true })
  steps.directory = 'created'

  // 2-2. config.toml 기본 파일 생성 (idempotent: 존재하면 skip)
  const configPath = join(dataDir, 'config.toml')
  if (!existsSync(configPath)) {
    writeFileSync(configPath, DEFAULT_CONFIG_TOML, { mode: 0o600 })
    steps.config = 'created'
  } else {
    steps.config = 'exists'
  }

  // 2-3. SQLite DB 초기화 + 마이그레이션 (idempotent: migration은 이미 적용된 것을 skip)
  const dbPath = join(dataDir, 'data', 'waiaas.db')
  const dbExisted = existsSync(dbPath)
  const sqlite = new Database(dbPath)
  applyPragmas(sqlite)
  const db = drizzle({ client: sqlite })
  await migrate(db, { migrationsFolder: getMigrationsPath() })
  steps.database = dbExisted ? 'migrated' : 'created'

  // 2-4. 키스토어 초기화 (idempotent: 이미 존재하면 skip)
  const keyStore = new LocalKeyStore(dataDir, db)
  if (!keyStore.isInitialized()) {
    await keyStore.initialize(password)
    steps.keystore = 'created'
  } else {
    steps.keystore = 'exists'
  }

  // 에이전트 생성 없음 -- DX-01: init은 순수 인프라만
  sqlite.close()

  // [v0.7 보완] --json 모드 출력
  if (options.json) {
    const alreadyInitialized = Object.values(steps).every(s => s === 'exists')
    console.log(JSON.stringify({
      success: true,
      alreadyInitialized,
      dataDir,
      version: VERSION,
      steps,
    }))
    return
  }

  // 안내 메시지 (비-JSON 모드)
  console.log('WAIaaS initialized successfully!')
  console.log('')
  console.log('Next steps:')
  console.log('  waiaas agent create                           Create your first agent')
  console.log('  waiaas start                                  Start the daemon')
  // [v0.8] --owner는 선택이므로 Tip으로 안내
  console.log('')
  console.log('  Tip: Owner 지갑을 함께 등록하려면:')
  console.log('    waiaas agent create --owner <owner-address>')
}
```

---

## 3. waiaas agent create (DX-02) [v0.8]

### 3.1 설계 원칙

에이전트 생성은 **데몬이 실행 중인 상태**에서 API를 호출하여 수행한다. [v0.8] `--owner` 옵션은 **선택적**이며, SIWS/SIWE 서명은 불필요하다 (masterAuth implicit 범위). Owner 없이 생성된 에이전트는 Base 보안 수준(INSTANT/NOTIFY/DELAY)으로 동작하며, 이후 `agent set-owner`로 Owner를 사후 등록할 수 있다.

**핵심 변경:**
- v0.2: init 내 선택적 에이전트 생성 (Owner 주소 선택)
- v0.5: `agent create --owner` 별도 커맨드 (Owner 주소 필수)
- [v0.8] `agent create` 별도 커맨드 (Owner 주소 **선택**, agents.owner_address nullable)

### 3.2 커맨드 인터페이스 [v0.8]

```
waiaas agent create [options]

Options:
  --owner <address>        [v0.8] Owner 지갑 주소 (선택, Solana base58 또는 EVM 0x)
  --name <string>          에이전트 이름 (기본: 자동 생성, e.g. "agent-01")
  --chain <string>         블록체인 (solana / ethereum, 기본: solana)
  --network <string>       네트워크 (mainnet-beta / devnet / testnet / sepolia 등, 기본: devnet)
  --data-dir <path>        데이터 디렉토리
  -h, --help               도움말
```

> [v0.8] `--owner`가 Required에서 Options로 이동. Owner 없이 에이전트를 생성하면 OwnerState = NONE (Base 보안 수준). 이후 `agent set-owner`로 사후 등록 가능.

### 3.3 동작 설명 [v0.8]

```
waiaas agent create [--owner <addr>]
  1. 데몬 실행 확인 (http://127.0.0.1:3100/health)
  2. POST /v1/agents 호출 (masterAuth implicit -- 추가 헤더 불필요)
     Body: { name, chain, network, ownerAddress? }    // [v0.8] ownerAddress 선택적
  3. 데몬 내부: 에이전트 키 쌍 생성 -> 키스토어 암호화 저장 -> agents 테이블 INSERT
     - --owner 제공 시: owner_address = <addr>, OwnerState = GRACE
     - --owner 미제공 시: owner_address = NULL, OwnerState = NONE
  4. 응답 출력
```

**인증:** masterAuth(implicit). 데몬이 실행 중 = 마스터 패스워드 인증 완료 상태이므로 추가 인증이 불필요하다. 52-auth-model-redesign.md 섹션 3.1 참조.

**서명 불필요:** Owner 주소는 단순 문자열로 전달된다. SIWS/SIWE 서명으로 소유권을 증명할 필요가 없는 이유는 Self-Hosted 환경에서 `agent create` 커맨드를 실행하는 사람 = 데몬 운영자 = 시스템 관리자이기 때문이다. 운영자가 자신이 관리하는 Owner 주소를 입력하는 것이므로 소유권 증명의 필요성이 없다. [v0.8] Owner 없이 생성하면 Base 보안 수준으로 동작하며, 이후 `agent set-owner`로 사후 등록 가능하다 (34-owner-wallet-connection.md 섹션 10 참조).

### 3.4 출력 예시 [v0.8]

**Owner 없이 생성 (OwnerState = NONE):**

```
$ waiaas agent create --name trading-bot --chain solana

Agent created successfully!

  ID:       019502a8-7b3c-7d4e-8f5a-1234567890ab
  Name:     trading-bot
  Chain:    solana
  Network:  devnet
  Address:  9wB3Lz8n...AgentPublicKey...
  Owner:    (미등록)

Next steps:
  waiaas session create --agent trading-bot   Create a session token

  [v0.8] Owner 지갑을 등록하면 대액 거래 승인, 자금 회수 등
  추가 보안 기능을 사용할 수 있습니다:
    waiaas agent set-owner trading-bot <owner-address>
```

**Owner와 함께 생성 (OwnerState = GRACE):**

```
$ waiaas agent create --name trading-bot --chain solana \
    --owner 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

Agent created successfully!

  ID:       019502a8-7b3c-7d4e-8f5a-1234567890ab
  Name:     trading-bot
  Chain:    solana
  Network:  devnet
  Address:  9wB3Lz8n...AgentPublicKey...
  Owner:    7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU (GRACE)

Next steps:
  waiaas session create --agent trading-bot   Create a session token
```

> [v0.8] Owner와 함께 생성하면 즉시 GRACE 상태. ownerAuth 첫 사용 시 자동으로 LOCKED 전환 (34-owner-wallet-connection.md 섹션 10.2 전이 #3).

**JSON 출력 (--output json):**

```
$ waiaas agent create --name trading-bot --output json
{
  "id": "019502a8-7b3c-7d4e-8f5a-1234567890ab",
  "name": "trading-bot",
  "chain": "solana",
  "network": "devnet",
  "address": "9wB3Lz8n...AgentPublicKey...",
  "ownerAddress": null,
  "ownerState": "NONE",
  "createdAt": "2026-02-07T10:30:00.000Z"
}
```

### 3.5 에러 처리 [v0.8]

| 상황 | 에러 메시지 | Exit Code |
|------|-----------|-----------|
| 데몬 미실행 | `Error: Cannot connect to WAIaaS daemon at 127.0.0.1:3100. Run 'waiaas start' first.` | 1 |
| 유효하지 않은 Owner 주소 | `Error: Invalid owner address format. Expected Solana base58 or EVM 0x address.` | 1 |
| 에이전트 이름 중복 | `Error: Agent name 'trading-bot' already exists. Choose a different name.` | 1 |
| 지원하지 않는 체인 | `Error: Unsupported chain 'bitcoin'. Supported: solana, ethereum.` | 1 |
| Kill Switch 활성화 | `Error: System is locked (Kill Switch active). Cannot create agent.` | 1 |

> [v0.8] `--owner` 미지정 에러가 **제거**되었다. Owner 없이 에이전트를 생성할 수 있다 (OwnerState = NONE).

### 3.6 parseArgs 구현 [v0.8]

```typescript
// packages/cli/src/commands/agent.ts
function parseAgentCreateOptions(args: string[]): AgentCreateOptions {
  const { values } = parseArgs({
    args,
    options: {
      owner: { type: 'string' },  // [v0.8] optional (required 검증 제거)
      name: { type: 'string' },
      chain: { type: 'string' },
      network: { type: 'string' },
      'data-dir': { type: 'string' },
      output: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  })

  // [v0.8] --owner 필수 검증 제거. undefined 허용.

  return {
    owner: values.owner,           // [v0.8] string | undefined
    name: values.name,
    chain: values.chain ?? 'solana',
    network: values.network ?? 'devnet',
    dataDir: values['data-dir'],
    output: values.output ?? 'text',
  }
}
```

### 3.7 API 호출 구현 [v0.8]

```typescript
async function runAgentCreate(args: string[]): Promise<void> {
  const options = parseAgentCreateOptions(args)
  const config = loadCliConfig(options.dataDir)

  // 데몬 연결 확인
  const baseUrl = `http://127.0.0.1:${config.port}`
  try {
    await fetch(`${baseUrl}/health`)
  } catch {
    console.error(`Error: Cannot connect to WAIaaS daemon at 127.0.0.1:${config.port}.`)
    console.error("Run 'waiaas start' first.")
    process.exit(1)
  }

  // POST /v1/agents (masterAuth implicit -- 헤더 불필요)
  // [v0.8] ownerAddress는 선택적 -- undefined일 때 body에 포함하지 않음
  const body: Record<string, unknown> = {
    name: options.name,
    chain: options.chain,
    network: options.network,
  }
  if (options.owner) {
    body.ownerAddress = options.owner  // [v0.8] 제공 시에만 전달
  }

  const response = await fetch(`${baseUrl}/v1/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error(`Error: ${error.error?.message ?? 'Unknown error'}`)
    process.exit(1)
  }

  const agent = await response.json()

  if (options.output === 'json') {
    console.log(JSON.stringify(agent, null, 2))
  } else {
    console.log('Agent created successfully!')
    console.log('')
    console.log(`  ID:       ${agent.id}`)
    console.log(`  Name:     ${agent.name}`)
    console.log(`  Chain:    ${agent.chain}`)
    console.log(`  Network:  ${agent.network}`)
    console.log(`  Address:  ${agent.address}`)
    // [v0.8] Owner 유무에 따른 출력 분기
    if (agent.ownerAddress) {
      console.log(`  Owner:    ${agent.ownerAddress} (GRACE)`)
    } else {
      console.log(`  Owner:    (미등록)`)
    }
    console.log('')
    console.log('Next steps:')
    console.log(`  waiaas session create --agent ${agent.name}   Create a session token`)
    // [v0.8] Owner 미등록 시 안내 메시지
    if (!agent.ownerAddress) {
      console.log('')
      console.log('  [v0.8] Owner 지갑을 등록하면 대액 거래 승인, 자금 회수 등')
      console.log('  추가 보안 기능을 사용할 수 있습니다:')
      console.log(`    waiaas agent set-owner ${agent.name} <owner-address>`)
    }
  }
}
```

### 3.8 createAgent() 데몬 핸들러 수도코드 [v0.8]

```typescript
// packages/daemon/src/handlers/agent.ts (v0.8)
async function handleCreateAgent(c: Context): Promise<Response> {
  const body = await c.req.json()
  const { name, chain, network } = body
  const ownerAddress: string | undefined = body.ownerAddress  // [v0.8] 선택적

  // 에이전트 키 쌍 생성
  const keyPair = await keyStore.generateKeyPair(chain)

  // agents 테이블 INSERT
  const agent = await db.insert(agents).values({
    id: generateUUIDv7(),
    name: name ?? generateAgentName(),
    chain,
    network: network ?? 'devnet',
    publicKey: keyPair.publicKey,
    status: 'ACTIVE',
    ownerAddress: ownerAddress ?? null,  // [v0.8] nullable -- undefined -> NULL
    ownerVerified: 0,                    // [v0.8] 항상 0 (GRACE 상태 시작)
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  }).returning()

  // [v0.8] Owner 제공 시 감사 로그
  if (ownerAddress) {
    await auditLog.record('OWNER_REGISTERED', agent[0].id, {
      ownerAddress,
      source: 'agent_create',
    })
  }

  return c.json({
    id: agent[0].id,
    name: agent[0].name,
    chain: agent[0].chain,
    network: agent[0].network,
    address: agent[0].publicKey,
    ownerAddress: agent[0].ownerAddress,  // [v0.8] null | string
    ownerState: resolveOwnerState(agent[0]),  // [v0.8] 'NONE' | 'GRACE'
    createdAt: new Date(agent[0].createdAt * 1000).toISOString(),
  }, 201)
}
```

---

## 4. waiaas session create (DX-03)

### 4.1 설계 원칙

세션 생성은 **masterAuth(implicit)**만으로 동작한다. v0.2에서 ownerAuth(SIWS/SIWE 서명)가 필요했던 `POST /v1/sessions`가 v0.5에서 masterAuth(implicit)로 변경되었으므로(52-auth-model-redesign.md 섹션 4.2 #9), CLI에서 추가 인증 없이 세션을 생성할 수 있다.

### 4.2 커맨드 인터페이스

```
waiaas session create [options]

Required:
  --agent <name|id>        대상 에이전트 (이름 또는 UUID)

Options:
  --expires-in <seconds>   만료 시간 (기본: 86400 = 24시간, 최소: 300, 최대: 604800)
  --max-amount <amount>    최대 거래 금액 (e.g., "10.0")
  --max-txs <number>       최대 거래 횟수
  --allowed-ops <ops>      허용 작업 (쉼표 구분, e.g., "transfer,balance")
  --output <format>        출력 형식: token (기본), json, env
  --data-dir <path>        데이터 디렉토리
  -h, --help               도움말
```

### 4.3 동작 설명

```
waiaas session create --agent <name>
  1. 데몬 실행 확인 (http://127.0.0.1:3100/health)
  2. POST /v1/sessions 호출 (masterAuth implicit -- 추가 헤더 불필요)
     Body: { agentId/agentName, expiresIn, constraints }
  3. 데몬 내부: JWT 발급(jose HS256), sessions 테이블 INSERT, token_hash 저장
  4. 응답에서 세션 토큰 추출 -> 지정된 포맷으로 출력
```

**인증:** masterAuth(implicit). 데몬이 실행 중이면 추가 인증 없이 세션 생성이 가능하다. 보안은 세션 제약(constraints)과 정책 엔진(Layer 2)이 담당한다.

### 4.4 출력 포맷

**token (기본) -- 토큰만 출력:**

```
$ waiaas session create --agent my-bot
wai_sess_eyJhbGciOiJIUzI1NiIs...
```

토큰만 stdout에 출력되므로 셸 변수로 직접 캡처 가능:

```bash
TOKEN=$(waiaas session create --agent my-bot)
```

**json -- JSON 객체 출력:**

```
$ waiaas session create --agent my-bot --output json
{
  "sessionId": "019502a8-7b3c-7d4e-8f5a-1234567890ab",
  "token": "wai_sess_eyJhbGciOiJIUzI1NiIs...",
  "agentId": "019502a8-0000-7d4e-8f5a-1234567890ab",
  "agentName": "my-bot",
  "expiresAt": "2026-02-08T10:30:00.000Z",
  "maxRenewals": 30,
  "absoluteExpiresAt": "2026-03-09T10:30:00.000Z",
  "constraints": {
    "maxAmount": null,
    "maxTransactions": null,
    "allowedOperations": ["transfer", "balance"],
    "expiresIn": 86400,
    "maxRenewals": 30,
    "renewalRejectWindow": 3600
  }
}
```

**env -- 환경변수 export 형식:**

```
$ waiaas session create --agent my-bot --output env
export WAIAAS_SESSION_TOKEN="wai_sess_eyJhbGciOiJIUzI1NiIs..."
export WAIAAS_AGENT_ID="019502a8-0000-7d4e-8f5a-1234567890ab"
export WAIAAS_AGENT_NAME="my-bot"
export WAIAAS_SESSION_EXPIRES_AT="2026-02-08T10:30:00.000Z"
```

eval과 함께 사용:

```bash
eval $(waiaas session create --agent my-bot --output env)
echo $WAIAAS_SESSION_TOKEN
```

### 4.5 사용 패턴

**기본 사용:**

```bash
# 세션 생성 + 토큰을 환경변수로 설정
export WAIAAS_SESSION_TOKEN=$(waiaas session create --agent my-bot)

# SDK/MCP에서 사용
npx waiaas-mcp  # WAIAAS_SESSION_TOKEN 환경변수를 자동 인식
```

**제약 조건과 함께:**

```bash
# 최대 10 SOL, 100건 거래, 1시간 만료
waiaas session create \
  --agent my-bot \
  --max-amount 10.0 \
  --max-txs 100 \
  --expires-in 3600 \
  --output token
```

**MCP Claude Desktop 설정용:**

```bash
# JSON 출력으로 상세 정보 확인 후 토큰만 추출
TOKEN=$(waiaas session create --agent my-bot --output token)
echo "Claude Desktop MCP config에 이 토큰을 설정하세요: $TOKEN"
```

**갱신 정보 참조:**

세션 갱신 프로토콜(53-session-renewal-protocol.md)에 따라, 생성된 세션은 에이전트가 `PUT /v1/sessions/:id/renew`로 자율 갱신할 수 있다. `--output json`으로 `maxRenewals`와 `absoluteExpiresAt`를 확인할 수 있다.

### 4.6 에러 처리

| 상황 | 에러 메시지 | Exit Code |
|------|-----------|-----------|
| `--agent` 미지정 | `Error: --agent <name\|id> is required.` | 1 |
| 데몬 미실행 | `Error: Cannot connect to WAIaaS daemon. Run 'waiaas start' first.` | 1 |
| 에이전트 미존재 | `Error: Agent 'my-bot' not found.` | 1 |
| 만료 시간 범위 초과 | `Error: --expires-in must be between 300 (5min) and 604800 (7 days).` | 1 |

### 4.7 parseArgs 구현

```typescript
// packages/cli/src/commands/session.ts
function parseSessionCreateOptions(args: string[]): SessionCreateOptions {
  const { values } = parseArgs({
    args,
    options: {
      agent: { type: 'string' },
      'expires-in': { type: 'string' },
      'max-amount': { type: 'string' },
      'max-txs': { type: 'string' },
      'allowed-ops': { type: 'string' },
      output: { type: 'string' },
      'data-dir': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  })

  if (!values.agent) {
    console.error('Error: --agent <name|id> is required.')
    process.exit(1)
  }

  return {
    agent: values.agent,
    expiresIn: values['expires-in'] ? parseInt(values['expires-in'], 10) : undefined,
    maxAmount: values['max-amount'],
    maxTxs: values['max-txs'] ? parseInt(values['max-txs'], 10) : undefined,
    allowedOps: values['allowed-ops']?.split(',').map(s => s.trim()),
    output: (values.output ?? 'token') as 'token' | 'json' | 'env',
    dataDir: values['data-dir'],
  }
}
```

---

## 5. CLI 커맨드 전체 요약표 (v0.8) [v0.8]

### 5.1 전체 커맨드 목록

| 커맨드 | 인증 수준 | 데몬 필요 | v0.8 변경 | 설명 |
|--------|----------|----------|----------|------|
| `waiaas init` | 없음 (로컬) | X | 유지 (v0.5 변경) | 데이터 디렉토리 + 키스토어 초기화 |
| `waiaas init --quickstart` | 없음 (로컬) | X | [v0.8] `--owner` 선택 | init -> start -> agent -> session 통합 |
| `waiaas start` | 마스터 패스워드 (1회) | X | 유지 | 데몬 시작 (foreground/background) |
| `waiaas start --dev` | 없음 (고정 PW) | X | 유지 (v0.5 신규) | 개발 모드 (고정 패스워드 + 보안 경고) |
| `waiaas stop` | 없음 (PID 기반) | O (간접) | 유지 | 데몬 정지 (SIGTERM) |
| `waiaas status` | 없음 (API 호출) | O | 유지 | 데몬 상태 조회 |
| `waiaas agent create` | masterAuth (implicit) | O | [v0.8] `--owner` **선택** | 에이전트 생성 (Owner 선택적 등록) |
| `waiaas agent list` | masterAuth (implicit) | O | 유지 | 에이전트 목록 조회 |
| `waiaas agent info <name\|id>` | masterAuth (implicit) | O | [v0.8] Owner 미등록 시 **안내 메시지** | 에이전트 상세 정보 |
| `waiaas agent set-owner <name\|id> <addr>` | masterAuth (implicit) | O | [v0.8] **신규** | Owner 등록/변경 (LOCKED 시 ownerAuth 추가 필요) |
| `waiaas agent remove-owner <name\|id>` | masterAuth (implicit) | O | [v0.8] **신규** | Owner 해제 (GRACE에서만 동작) |
| `waiaas session create` | masterAuth (implicit) | O | 유지 (v0.5 신규) | 세션 토큰 발급 |
| `waiaas session list` | masterAuth (implicit) | O | 유지 | 세션 목록 조회 |
| `waiaas session revoke <id>` | masterAuth (implicit) | O | 유지 (v0.5 변경) | 세션 폐기 |
| `waiaas owner approve <txId>` | ownerAuth (SIWS/SIWE) | O | 유지 | APPROVAL 거래 승인 |
| `waiaas owner reject <txId>` | masterAuth (implicit) | O | 유지 (v0.5 변경) | 거래 거절 |
| `waiaas owner withdraw --agent <name\|id>` | masterAuth (implicit) | O | [v0.8] **신규** | 에이전트 자금 회수 (LOCKED에서만 동작) |
| `waiaas owner recover` | dualAuth (owner + master) | O | 유지 | Kill Switch 복구 |
| `waiaas backup create` | 없음 (파일 시스템) | X | 유지 | 데이터 백업 생성 |
| `waiaas backup restore <path>` | 없음 (파일 시스템) | X | 유지 | 백업 복원 |

### 5.2 v0.8 변경 요약 [v0.8]

| 변경 유형 | 수 | 커맨드 |
|----------|---|--------|
| [v0.8] **신규** | 3 | `agent set-owner`, `agent remove-owner`, `owner withdraw` |
| [v0.8] **변경** (옵션 전환) | 2 | `agent create` (--owner 필수 -> 선택), `init --quickstart` (--owner 필수 -> 선택) |
| [v0.8] **변경** (출력 확장) | 1 | `agent info` (Owner 미등록 안내 메시지 추가) |
| v0.5 **신규** | 4 | `init --quickstart`, `start --dev`, `agent create`, `session create` |
| v0.5 **변경** | 3 | `init` (4단계 -> 2단계), `session revoke` (ownerAuth -> masterAuth), `owner reject` (ownerAuth -> masterAuth) |
| **유지** | 7 | `start`, `stop`, `status`, `agent list`, `session list`, `owner approve`, `backup create/restore` |

### 5.3 인증 수준별 분류 [v0.8]

| 인증 수준 | 커맨드 | 보안 근거 |
|----------|--------|----------|
| 없음 | `init`, `start`, `stop`, `status`, `backup` | 로컬 파일 시스템/PID 기반 동작. 데몬 API 미사용 또는 공개 엔드포인트만 사용. |
| masterAuth (implicit) | `agent create/list/info/set-owner/remove-owner`, `session create/list/revoke`, `owner reject/withdraw` | 데몬 실행 중 = 마스터 패스워드 인증 완료. localhost 바인딩으로 보호. [v0.8] set-owner/remove-owner/withdraw 추가. |
| masterAuth + ownerAuth (조건부) | `agent set-owner` (LOCKED 상태) | [v0.8] LOCKED 상태에서 Owner 주소 변경 시 기존 Owner 서명 필요. NONE/GRACE에서는 masterAuth만. |
| ownerAuth (SIWS/SIWE) | `owner approve` | 자금 이동 승인. Owner 지갑의 암호학적 서명 필요. 52-auth-model-redesign.md 참조. |
| dualAuth (owner + master) | `owner recover` | Kill Switch 복구. 동결 해제는 가장 높은 인증 수준 요구. |

### 5.4 CLI 진입점 구조 (v0.5 갱신)

```typescript
// packages/cli/src/index.ts (v0.5)
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
  allowPositionals: true,
  strict: false,
})

const subcommand = positionals[0]
const subAction = positionals[1] // agent create, session create, etc.

switch (subcommand) {
  case 'init':    return runInit(process.argv.slice(3))
  case 'start':   return runStart(process.argv.slice(3))
  case 'stop':    return runStop(process.argv.slice(3))
  case 'status':  return runStatus(process.argv.slice(3))
  case 'agent':   return runAgent(subAction, process.argv.slice(4))
  case 'session': return runSession(subAction, process.argv.slice(4))
  case 'owner':   return runOwner(subAction, process.argv.slice(4))
  case 'backup':  return runBackup(subAction, process.argv.slice(4))
  default:
    if (values.version) return printVersion()
    if (values.help || !subcommand) return printUsage()
    console.error(`Unknown command: ${subcommand}`)
    process.exit(1)
}
```

**v0.2 대비 변경:**
- `session` 서브커맨드 그룹 신규 추가 (`session create`, `session list`, `session revoke`)
- `owner` 서브커맨드 그룹 신규 추가 (`owner approve`, `owner reject`, `owner recover`, [v0.8] `owner withdraw`)
- `agent` 서브커맨드에 `create` 액션 추가 (기존 `list`, `info`에 더하여)
- [v0.8] `agent` 서브커맨드에 `set-owner`, `remove-owner` 액션 추가

### 5.5 agent info 출력 확장 [v0.8] (DX-05)

Owner 미등록 에이전트의 `agent info` 출력에 Owner 등록 안내 메시지를 포함한다.

**Owner 미등록 (OwnerState = NONE):**

```
$ waiaas agent info trading-bot

Agent: trading-bot
  ID:       01950288-7b3c-7d4e-8f5a-1234567890ab
  Chain:    solana
  Network:  devnet
  Address:  9bKrTD...AgentPublicKey...
  Status:   ACTIVE
  Owner:    (미등록)

  [v0.8] Owner 지갑을 등록하면 대액 거래 승인, 자금 회수 등
  추가 보안 기능을 사용할 수 있습니다:
    waiaas agent set-owner trading-bot <owner-address>
```

**Owner 등록 완료 -- GRACE (OwnerState = GRACE):**

```
$ waiaas agent info trading-bot

Agent: trading-bot
  ID:       01950288-7b3c-7d4e-8f5a-1234567890ab
  Chain:    solana
  Network:  devnet
  Address:  9bKrTD...AgentPublicKey...
  Status:   ACTIVE
  Owner:    9wB3Lz... (pending)    # GRACE -- ownerAuth 미사용

  보안 수준: Enhanced (APPROVAL 해금)
  Owner 상태: GRACE (ownerAuth 첫 사용 시 LOCKED 자동 전환)
```

**Owner 등록 완료 -- LOCKED (OwnerState = LOCKED):**

```
$ waiaas agent info trading-bot

Agent: trading-bot
  ID:       01950288-7b3c-7d4e-8f5a-1234567890ab
  Chain:    solana
  Network:  devnet
  Address:  9bKrTD...AgentPublicKey...
  Status:   ACTIVE
  Owner:    9wB3Lz... (verified)   # LOCKED -- ownerAuth 사용 완료

  보안 수준: Enhanced (APPROVAL 해금, 자금 회수 가능)
  Owner 상태: LOCKED (변경 시 기존 Owner 서명 필요)
```

> [v0.8] Owner 미등록 시 안내 메시지는 `--output json` 모드에서는 `ownerState: "NONE"` 필드로 대체된다. 안내 메시지는 텍스트 출력에서만 표시.

### 5.6 waiaas agent set-owner [v0.8] (DX-02, OWNER-03)

Owner 주소를 사후에 등록하거나 변경한다. 34-owner-wallet-connection.md 섹션 10.3 인증 맵과 1:1 대응.

**커맨드 인터페이스:**

```
waiaas agent set-owner <agent-name|id> <address>

Arguments:
  <agent-name|id>          대상 에이전트 (이름 또는 UUID)
  <address>                Owner 지갑 주소 (Solana base58 또는 EVM 0x)

Options:
  --data-dir <path>        데이터 디렉토리
  -h, --help               도움말
```

**인증:** masterAuth(implicit). 단, LOCKED 상태에서는 기존 Owner의 ownerAuth 서명이 추가로 필요하다 (34-owner-wallet-connection.md 섹션 10.2 전이 #5).

**동작:**

```
waiaas agent set-owner <agent> <addr>
  1. 데몬 실행 확인 (http://127.0.0.1:3100/health)
  2. GET /v1/agents/:id로 현재 에이전트 상태 조회
  3. OwnerState 확인:
     - NONE: PATCH /v1/agents/:id { owner: "<addr>" } -- masterAuth만
     - GRACE: PATCH /v1/agents/:id { owner: "<addr>" } -- masterAuth만
     - LOCKED: CLI 수동 서명 플로우 시작:
       a) GET /v1/auth/nonce로 nonce 획득
       b) SIWS/SIWE 메시지 구성 + 서명 안내 출력
       c) 사용자 서명 입력 대기 (또는 WalletConnect)
       d) PATCH /v1/agents/:id + Authorization: Bearer <ownerSignaturePayload>
  4. 응답 출력
```

**출력 예시 (NONE/GRACE -> 성공):**

```
$ waiaas agent set-owner trading-bot 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

Owner registered successfully!

  Agent:  trading-bot
  Owner:  7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU (GRACE)

  ownerAuth를 처음 사용하면 자동으로 LOCKED 상태로 전환됩니다.
```

**출력 예시 (LOCKED -> ownerAuth 필요):**

```
$ waiaas agent set-owner trading-bot NewAddr...

  현재 에이전트가 LOCKED 상태입니다. 기존 Owner 서명이 필요합니다.

  서명할 메시지:
  ---
  WAIaaS wants you to sign in with your Solana account:
  7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

  Change owner address for agent trading-bot

  Nonce: abc123...
  Issued At: 2026-02-09T12:00:00.000Z
  ---

  서명을 Base58로 입력하세요: <사용자 입력>

Owner address changed successfully!

  Agent:  trading-bot
  Owner:  NewAddr... (LOCKED)
```

**에러 처리:**

| 상황 | 에러 메시지 | Exit Code |
|------|-----------|-----------|
| 에이전트 미존재 | `Error: Agent 'trading-bot' not found. (AGENT_NOT_FOUND)` | 1 |
| 유효하지 않은 주소 | `Error: Invalid owner address format. (INVALID_OWNER_ADDRESS)` | 1 |
| LOCKED + ownerAuth 없음 | `Error: Owner change requires current owner signature. (OWNER_CHANGE_REQUIRES_CURRENT_OWNER)` | 1 |
| Kill Switch 활성화 | `Error: System is locked. (503 SYSTEM_LOCKED)` | 1 |

### 5.7 waiaas agent remove-owner [v0.8] (DX-03, OWNER-06)

Owner 등록을 해제한다. **GRACE 상태에서만 동작**하며, LOCKED 상태에서는 보안 다운그레이드 방지를 위해 거부된다.

**커맨드 인터페이스:**

```
waiaas agent remove-owner <agent-name|id>

Arguments:
  <agent-name|id>          대상 에이전트 (이름 또는 UUID)

Options:
  --force                  확인 프롬프트 건너뛰기 (비대화형 모드)
  --data-dir <path>        데이터 디렉토리
  -h, --help               도움말
```

**인증:** masterAuth(implicit).

**동작:**

```
waiaas agent remove-owner <agent>
  1. 데몬 실행 확인
  2. GET /v1/agents/:id로 현재 에이전트 상태 조회
  3. OwnerState 확인:
     - NONE: 에러 (NO_OWNER)
     - GRACE: 확인 프롬프트 -> PATCH /v1/agents/:id { owner: null }
     - LOCKED: 에러 (OWNER_REMOVAL_BLOCKED)
  4. 응답 출력
```

**출력 예시 (GRACE -> 성공):**

```
$ waiaas agent remove-owner trading-bot

  WARNING: Owner를 해제하면 보안 수준이 Enhanced에서 Base로 다운그레이드됩니다.
  - APPROVAL 티어가 DELAY로 다운그레이드됩니다.
  - 자금 회수(withdraw)가 비활성화됩니다.
  - Kill Switch 복구 대기 시간이 30분에서 24시간으로 증가합니다.

  계속하시겠습니까? (y/N): y

Owner removed successfully.

  Agent:  trading-bot
  Owner:  (미등록)
  보안 수준: Base
```

**에러 처리:**

| 상황 | 에러 메시지 | Exit Code |
|------|-----------|-----------|
| 에이전트 미존재 | `Error: Agent 'trading-bot' not found. (AGENT_NOT_FOUND)` | 1 |
| Owner 미등록 | `Error: No owner registered for agent 'trading-bot'. (OWNER_NOT_FOUND)` | 1 |
| LOCKED 상태 | `Error: Cannot remove owner in LOCKED state. Owner has been verified via ownerAuth. (OWNER_REMOVAL_BLOCKED)` | 1 |
| Kill Switch 활성화 | `Error: System is locked. (503 SYSTEM_LOCKED)` | 1 |

### 5.8 waiaas owner withdraw [v0.8] (WITHDRAW-01~08)

에이전트 자금을 Owner 지갑으로 전량 회수한다. **LOCKED 상태(owner_verified=1)에서만 동작**한다.

**커맨드 인터페이스:**

```
waiaas owner withdraw [options]

Required:
  --agent <agent-name|id>  대상 에이전트

Options:
  --scope <all|native>     회수 범위 (기본: "all")
                           all: 네이티브 + SPL 토큰 + rent
                           native: 네이티브만
  --output <format>        출력 형식: text (기본), json
  --data-dir <path>        데이터 디렉토리
  -h, --help               도움말
```

**인증:** masterAuth(implicit). 수신 주소가 agents.owner_address로 고정되므로 ownerAuth는 불필요하다 (34-01 결정, v0.8 §5.2 근거).

**동작:**

```
waiaas owner withdraw --agent <agent>
  1. 데몬 실행 확인
  2. POST /v1/owner/agents/:agentId/withdraw 호출 (masterAuth implicit)
     Body: { scope: "all" | "native" }
  3. 데몬 내부: OwnerState LOCKED 검증 -> WithdrawService -> IChainAdapter.sweepAll()
     - sweepAll 4단계: getAssets -> SPL 배치(transfer+closeAccount) -> SOL 마지막 전송
  4. 응답 출력 (HTTP 200 전량 성공 / HTTP 207 부분 성공)
```

**Kill Switch 상태 동작: [v0.8] 허용 (방안 A 채택)**

> [v0.8] Kill Switch withdraw: **방안 A 채택** -- killSwitchGuard 허용 경로에 `POST /v1/owner/agents/:agentId/withdraw` 추가.
> 근거: 자금 회수는 Kill Switch 발동 시 **가장 시급한 보안 조치**이며, 기존 API 인프라(masterAuth, 감사 로그, WithdrawService)를 재사용한다. 방안 B(CLI 직접 실행)는 데몬 API를 우회하므로 일관성이 저하된다.
> 36-killswitch-autostop-evm.md에 반영 필요: killSwitchGuard 5번째 허용 경로 `POST /v1/owner/agents/:agentId/withdraw` 추가.

**출력 예시 (scope: all, 성공 -- HTTP 200):**

```
$ waiaas owner withdraw --agent trading-bot

Withdrawal complete!

  Agent:        trading-bot
  Destination:  7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU (owner)

  Native:       2.458 SOL
  Tokens:
    USDC:       150.00 (EPjFW...)
    BONK:       5,000,000 (DezXA...)
  Rent:         0.012 SOL
  Transactions: 3

  Total recovered: 2.470 SOL + 2 tokens
```

**출력 예시 (scope: all, 부분 실패 -- HTTP 207):**

```
$ waiaas owner withdraw --agent trading-bot

Withdrawal partially complete (some tokens failed).

  Agent:        trading-bot
  Destination:  7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU (owner)

  Native:       2.458 SOL
  Tokens recovered:
    USDC:       150.00 (EPjFW...)
  Tokens failed:
    BONK:       DezXA... -- TransactionError: insufficient funds for fee
  Rent:         0.006 SOL
  Transactions: 2 (1 failed)

  WARNING: Some tokens could not be recovered. Retry with:
    waiaas owner withdraw --agent trading-bot
```

**JSON 출력 (--output json):**

```json
{
  "totalTransactions": 3,
  "nativeRecovered": "2.458",
  "tokensRecovered": [
    { "symbol": "USDC", "amount": "150.00", "mint": "EPjFW..." }
  ],
  "rentRecovered": "0.012",
  "failed": [
    { "mint": "DezXA...", "error": "insufficient funds for fee" }
  ]
}
```

**에러 처리:**

| 상황 | 에러 메시지 | Exit Code |
|------|-----------|-----------|
| `--agent` 미지정 | `Error: --agent <name\|id> is required.` | 1 |
| 에이전트 미존재 | `Error: Agent 'trading-bot' not found. (AGENT_NOT_FOUND)` | 1 |
| Owner 미등록 | `Error: No owner registered. Cannot withdraw. (NO_OWNER)` | 1 |
| GRACE 상태 (LOCKED만 허용) | `Error: Withdrawal requires LOCKED state (owner must be verified via ownerAuth). (WITHDRAW_LOCKED_ONLY)` | 1 |
| 전체 실패 | `Error: All withdrawal transactions failed. (SWEEP_TOTAL_FAILURE)` | 1 |
| 수수료 부족 | `Error: Insufficient balance for transaction fee. (INSUFFICIENT_FOR_FEE)` | 1 |

**감사 로그:**

| 이벤트 | Severity | 조건 |
|--------|----------|------|
| `FUND_WITHDRAWN` | info | 전량 회수 성공 (HTTP 200) |
| `FUND_PARTIALLY_WITHDRAWN` | warning | 부분 회수 (HTTP 207) |
| `FUND_WITHDRAWAL_FAILED` | error | 전체 실패 (HTTP 500) |

---

## 6. waiaas init --quickstart (DX-04) [v0.8]

### 6.1 설계 원칙

`--quickstart` 플래그는 `init`부터 세션 토큰 발급까지 **4단계를 단일 커맨드로 오케스트레이션**한다. 개발자가 처음 WAIaaS를 시작할 때 최소 명령어로 동작하는 환경을 얻을 수 있도록 한다.

**4단계 오케스트레이션:**

```
[1/4] init       -- 인프라 초기화 (디렉토리 + DB + 키스토어)
[2/4] start      -- 데몬 시작 (foreground)
[3/4] agent      -- 에이전트 생성 (+ Owner 등록 선택)    // [v0.8] Owner 선택
[4/4] session    -- 세션 토큰 발급
```

### 6.2 커맨드 인터페이스 [v0.8]

```
waiaas init --quickstart [options]

Required (quickstart 모드):
  --chain <string>         [v0.8] 블록체인 (solana / ethereum) -- 유일한 필수 옵션

Options:
  --owner <address>        [v0.8] Owner 지갑 주소 (선택)
  --agent-name <string>    에이전트 이름 (기본: "agent-01")
  --network <string>       네트워크 (기본: devnet)
  --expires-in <seconds>   세션 만료 시간 (기본: 86400)
  --data-dir <path>        데이터 디렉토리
  --password <string>      마스터 패스워드 (미지정 시 자동 생성)
  --password-file <path>   패스워드 파일 경로
  -h, --help               도움말
```

> [v0.8] `--owner`가 Required에서 Options로 이동. `--chain`만 필수 옵션. Owner 없이도 quickstart 가능.

### 6.3 --quickstart 옵션 [v0.8]

| 옵션 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `--chain <string>` | **필수** | - | [v0.8] 블록체인. quickstart의 유일한 필수 옵션. |
| `--owner <address>` | [v0.8] 선택 | - | Owner 지갑 주소. 제공 시 GRACE 상태로 시작, 미제공 시 NONE. |
| `--agent-name <string>` | 선택 | `agent-01` | 에이전트 이름 |
| `--network <string>` | 선택 | `devnet` | 네트워크 |
| `--expires-in <seconds>` | 선택 | `86400` | 세션 만료 시간 (24시간) |

### 6.4 마스터 패스워드 자동 생성

`--quickstart`에서 패스워드를 명시적으로 지정하지 않으면 자동 생성한다.

```typescript
import { randomBytes } from 'node:crypto'

function generateMasterPassword(): string {
  // 24바이트 = 192비트 엔트로피 -> base64url 32자
  return randomBytes(24).toString('base64url')
  // 예: "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1x"
}
```

**패스워드 저장:**

자동 생성된 패스워드는 `~/.waiaas/.master-password` 파일에 저장한다.

```typescript
const passwordPath = join(dataDir, '.master-password')
writeFileSync(passwordPath, password, { mode: 0o600 })
// 파일 권한: 소유자만 읽기/쓰기 (rw-------)
```

| 항목 | 값 |
|------|-----|
| 파일 경로 | `~/.waiaas/.master-password` |
| 파일 권한 | `0o600` (rw-------) |
| 내용 | 패스워드 평문 (1줄) |
| 생성 시점 | `--quickstart` 자동 생성 시에만 |
| 이후 사용 | `waiaas start`에서 `--password-file ~/.waiaas/.master-password`로 참조 |

**보안 고려사항:**
- `.master-password` 파일은 `~/.waiaas/` 디렉토리(mode 0o700) 내에 위치하여 소유자만 접근 가능
- 터미널 히스토리에 패스워드가 남지 않음 (파일 기반)
- 프로덕션에서는 `--quickstart`를 사용하지 않고 대화형 init + 수동 패스워드 설정을 권장

### 6.5 출력 예시 [v0.8]

**Owner 없이 quickstart (OwnerState = NONE):**

```
$ waiaas init --quickstart --chain solana

  WAIaaS Quickstart
  -----------------

  [1/4] Initializing...
        Data directory: ~/.waiaas/
        Master password: auto-generated
        Saved to: ~/.waiaas/.master-password (chmod 600)
        Database: 8 tables, migration v8
        Keystore: initialized

  [2/4] Starting daemon...
        WAIaaS daemon v0.8.0 ready on 127.0.0.1:3100 (PID: 12345)

  [3/4] Creating agent...
        Name:    agent-01
        Chain:   solana (devnet)
        Address: 9wB3Lz8n...AgentPublicKey...
        Owner:   (미등록)

  [4/4] Creating session...
        Expires: 2026-02-10T10:30:00.000Z (24h)

  -----------------
  Quickstart complete!

  Session token:
  wai_sess_eyJhbGciOiJIUzI1NiIs...

  Quick copy:
    export WAIAAS_SESSION_TOKEN="wai_sess_eyJhbGciOiJIUzI1NiIs..."

  Master password saved to:
    ~/.waiaas/.master-password

  Next time, start the daemon with:
    waiaas start --password-file ~/.waiaas/.master-password

  [v0.8] Owner 지갑을 등록하면 대액 거래 승인, 자금 회수 등
  추가 보안 기능을 사용할 수 있습니다:
    waiaas agent set-owner agent-01 <owner-address>
```

**Owner와 함께 quickstart (OwnerState = GRACE):**

```
$ waiaas init --quickstart --chain solana \
    --owner 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU \
    --agent-name my-bot

  WAIaaS Quickstart
  -----------------

  [1/4] Initializing...
        Data directory: ~/.waiaas/
        Master password: auto-generated
        Saved to: ~/.waiaas/.master-password (chmod 600)
        Database: 8 tables, migration v8
        Keystore: initialized

  [2/4] Starting daemon...
        WAIaaS daemon v0.8.0 ready on 127.0.0.1:3100 (PID: 12345)

  [3/4] Creating agent...
        Name:    my-bot
        Chain:   solana (devnet)
        Address: 9wB3Lz8n...AgentPublicKey...
        Owner:   7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU (GRACE)

  [4/4] Creating session...
        Expires: 2026-02-10T10:30:00.000Z (24h)

  -----------------
  Quickstart complete!

  Session token:
  wai_sess_eyJhbGciOiJIUzI1NiIs...

  Quick copy:
    export WAIAAS_SESSION_TOKEN="wai_sess_eyJhbGciOiJIUzI1NiIs..."

  Master password saved to:
    ~/.waiaas/.master-password

  Next time, start the daemon with:
    waiaas start --password-file ~/.waiaas/.master-password
```

### 6.6 에러 롤백

각 Stage에서 실패 시 이전 Stage에서 생성한 리소스를 정리한다.

```
Stage 1 (init) 실패:
  -> 생성된 디렉토리 삭제 (rmSync recursive)
  -> Exit 1

Stage 2 (start) 실패:
  -> 데몬 프로세스 정리 (이미 종료됨)
  -> 데이터 디렉토리는 유지 (init 성공이므로)
  -> "init succeeded, but daemon failed to start. Run 'waiaas start' manually."
  -> Exit 1

Stage 3 (agent create) 실패:
  -> 데몬 정지 (SIGTERM 전송)
  -> 데이터 디렉토리 유지
  -> "init + start succeeded, but agent creation failed: {error}"
  -> Exit 1

Stage 4 (session create) 실패:
  -> 데몬 정지 (SIGTERM 전송)
  -> 에이전트는 유지 (이미 생성됨)
  -> "Agent created, but session creation failed: {error}"
  -> Exit 1
```

**롤백 원칙:**
- init 실패: 전부 삭제 (아무것도 남기지 않음)
- init 이후 실패: 데이터 디렉토리는 유지 (init은 성공했으므로 수동으로 재시도 가능)
- 부분 성공 상태를 명확히 안내하여 사용자가 수동 복구 가능

### 6.7 비대화형 통합 예시 [v0.8]

```bash
# [v0.8] CI/CD에서 완전 비대화형 quickstart (--owner 선택)
export WAIAAS_MASTER_PASSWORD="test-password-12345"
waiaas init --quickstart \
  --chain solana \
  --agent-name ci-bot \
  --network devnet

# Owner 포함 quickstart
waiaas init --quickstart \
  --chain solana \
  --owner 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU \
  --agent-name ci-bot

# Docker 환경에서 (--owner 선택)
docker run -d waiaas:latest init --quickstart \
  --chain solana \
  --non-interactive
```

### 6.8 구현 수도코드 [v0.8]

```typescript
async function runQuickstart(options: InitOptions): Promise<void> {
  const dataDir = resolveDataDir(options.dataDir)

  // [v0.8] --chain 필수 검증 (유일한 필수 옵션)
  if (!options.chain) {
    console.error('Error: --chain is required for quickstart mode.')
    console.error('  Example: waiaas init --quickstart --chain solana')
    process.exit(1)
  }

  // === Stage 1: init ===
  console.log('  [1/4] Initializing...')
  try {
    // 패스워드 해석: 명시적 > 환경변수 > 자동 생성
    let password: string
    let passwordAutoGenerated = false
    if (options.password) {
      password = options.password
    } else if (process.env.WAIAAS_MASTER_PASSWORD) {
      password = process.env.WAIAAS_MASTER_PASSWORD
    } else {
      password = generateMasterPassword()
      passwordAutoGenerated = true
    }

    validatePasswordStrength(password)

    // 인프라 초기화
    await initializeInfrastructure(dataDir, password)

    // 자동 생성된 패스워드 저장
    if (passwordAutoGenerated) {
      const passwordPath = join(dataDir, '.master-password')
      writeFileSync(passwordPath, password, { mode: 0o600 })
      console.log(`        Master password: auto-generated`)
      console.log(`        Saved to: ${passwordPath} (chmod 600)`)
    }
  } catch (err) {
    // Stage 1 실패: 전체 롤백
    if (existsSync(dataDir)) rmSync(dataDir, { recursive: true })
    console.error(`  [1/4] Failed: ${err.message}`)
    process.exit(1)
  }

  // === Stage 2: start ===
  console.log('  [2/4] Starting daemon...')
  let daemonProcess: ChildProcess
  try {
    daemonProcess = await startDaemonForQuickstart(dataDir, password)
    await waitForDaemonReady(daemonProcess, 15_000) // Argon2id 포함 15초 대기
    console.log(`        WAIaaS daemon ready on 127.0.0.1:${config.port}`)
  } catch (err) {
    console.error(`  [2/4] Failed: ${err.message}`)
    console.error("  Init succeeded. Run 'waiaas start' manually.")
    process.exit(1)
  }

  // === Stage 3: agent create ===
  console.log('  [3/4] Creating agent...')
  let agent: AgentResponse
  try {
    // [v0.8] ownerAddress는 선택적 -- undefined일 때 미전달
    const agentBody: Record<string, unknown> = {
      name: options.agentName ?? 'agent-01',
      chain: options.chain,
      network: options.network ?? 'devnet',
    }
    if (options.owner) {
      agentBody.ownerAddress = options.owner  // [v0.8] 제공 시에만 전달
    }
    agent = await createAgentViaApi(agentBody)
    console.log(`        Name:    ${agent.name}`)
    console.log(`        Chain:   ${agent.chain} (${agent.network})`)
    console.log(`        Address: ${agent.address}`)
    // [v0.8] Owner 유무에 따른 출력 분기
    if (agent.ownerAddress) {
      console.log(`        Owner:   ${agent.ownerAddress} (GRACE)`)
    } else {
      console.log(`        Owner:   (미등록)`)
    }
  } catch (err) {
    await stopDaemonProcess(daemonProcess)
    console.error(`  [3/4] Failed: ${err.message}`)
    process.exit(1)
  }

  // === Stage 4: session create ===
  console.log('  [4/4] Creating session...')
  try {
    const session = await createSessionViaApi({
      agentId: agent.id,
      expiresIn: options.expiresIn ?? 86400,
    })
    console.log(`        Expires: ${session.expiresAt}`)
    console.log('')
    console.log('  Quickstart complete!')
    console.log('')
    console.log('  Session token:')
    console.log(`  ${session.token}`)
    console.log('')
    console.log('  Quick copy:')
    console.log(`    export WAIAAS_SESSION_TOKEN="${session.token}"`)

    // [v0.8] Owner 미등록 시 안내 메시지
    if (!agent.ownerAddress) {
      console.log('')
      console.log('  [v0.8] Owner 지갑을 등록하면 대액 거래 승인, 자금 회수 등')
      console.log('  추가 보안 기능을 사용할 수 있습니다:')
      console.log(`    waiaas agent set-owner ${agent.name} <owner-address>`)
    }
  } catch (err) {
    await stopDaemonProcess(daemonProcess)
    console.error(`  [4/4] Failed: ${err.message}`)
    console.error('  Agent created. Create session manually after starting daemon.')
    process.exit(1)
  }

  // 데몬은 foreground로 계속 실행됨
}
```

---

## 7. waiaas start --dev (DX-05)

### 7.1 설계 원칙

`--dev` 모드는 **개발/테스트 환경에서 프롬프트 없이 즉시 데몬을 시작**할 수 있도록 한다. 고정 마스터 패스워드를 사용하여 대화형 입력을 제거하고, debug 로그를 자동 활성화한다.

### 7.2 동작 정의

| 항목 | 값 |
|------|-----|
| 고정 패스워드 | `waiaas-dev` (하드코딩) |
| 로그 레벨 | `debug` (자동) |
| 프롬프트 | 없음 (패스워드 입력 건너뜀) |
| 보안 경고 | 3가지 메커니즘 활성화 |

```bash
# 기본 사용
waiaas start --dev

# 커스텀 포트와 함께
waiaas start --dev --port 3200

# 백그라운드 모드와 함께
waiaas start --dev --daemon
```

**내부 동작:** `--dev` 플래그는 다음과 동등하다:

```bash
WAIAAS_MASTER_PASSWORD=waiaas-dev waiaas start --log-level debug
```

단, `--dev`는 추가로 보안 경고 메커니즘 3가지를 활성화한다.

### 7.3 보안 경고 메커니즘 (3가지)

#### 메커니즘 1: 시작 배너

```
$ waiaas start --dev

  ╔══════════════════════════════════════════════════════════╗
  ║  WARNING: DEV MODE - NOT FOR PRODUCTION                 ║
  ║  Master password: "waiaas-dev" (fixed, publicly known)  ║
  ║  All keys are protected with a weak password.           ║
  ╚══════════════════════════════════════════════════════════╝

  WAIaaS daemon v0.5.0 (DEV MODE)
  Validating environment... OK
  Database ready (7 tables, migration v5)
  Unlocking keystore... (Argon2id, ~2s)
  KeyStore unlocked (2 keys loaded)
  solana/devnet adapter ready (latency: 45ms)
  HTTP server listening on 127.0.0.1:3100
  WAIaaS daemon v0.5.0 ready on 127.0.0.1:3100 (PID: 12345) [DEV MODE]
```

Ready 메시지에도 `[DEV MODE]` 접미사를 추가하여 로그 파일에서도 식별 가능하게 한다.

#### 메커니즘 2: X-WAIaaS-Dev-Mode 응답 헤더

`--dev` 모드에서 모든 HTTP 응답에 다음 헤더를 추가한다:

```
X-WAIaaS-Dev-Mode: true
```

```typescript
// dev 모드 미들웨어
if (config.devMode) {
  app.use('*', async (c, next) => {
    await next()
    c.header('X-WAIaaS-Dev-Mode', 'true')
  })
}
```

**용도:**
- SDK/클라이언트가 dev 모드를 감지하여 경고 표시 가능
- 프록시/모니터링 도구에서 dev 모드 트래픽 식별

#### 메커니즘 3: 감사 로그 dev_mode 필드

`--dev` 모드에서 모든 감사 로그 레코드에 `dev_mode: true` 필드를 추가한다.

```typescript
auditLog({
  eventType: 'daemon.started',
  actor: 'system',
  details: {
    version,
    port: config.daemon.port,
    pid: process.pid,
    dev_mode: true,  // --dev 모드 표시
  },
  severity: 'info',
})
```

**용도:**
- 감사 로그 분석 시 dev 모드에서 발생한 이벤트를 필터링
- 프로덕션 로그에 `dev_mode: true`가 발견되면 즉시 경고

### 7.4 config.toml 영구 설정

`--dev` 플래그 외에 config.toml에서도 dev 모드를 영구 설정할 수 있다.

```toml
# config.toml
[daemon]
port = 3100
hostname = "127.0.0.1"
log_level = "info"          # --dev 시 자동으로 "debug" 오버라이드
dev_mode = false             # true로 설정 시 --dev와 동일 효과
```

**우선순위:**

```
--dev 플래그 (최우선) > config.toml [daemon].dev_mode > 기본값 (false)
```

**Zod 스키마:**

```typescript
// packages/core/src/schemas/config.schema.ts (v0.5 추가)
const DaemonConfigSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(3100),
  hostname: z.literal('127.0.0.1'),
  log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  dev_mode: z.boolean().default(false),  // v0.5 추가
  shutdown_timeout: z.number().int().min(5).max(300).default(30),
})
```

### 7.5 --dev와 --quickstart 조합

`--dev`와 `--quickstart`를 함께 사용하면 가장 빠른 개발 환경 구축이 가능하다:

```bash
# [v0.8] --owner 선택. --chain만 필수.
waiaas init --quickstart --dev --chain solana

# Owner 포함
waiaas init --quickstart --dev --chain solana \
  --owner 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

동작:
1. init: 고정 패스워드 `waiaas-dev`로 인프라 초기화 (자동 생성 대신 고정값)
2. start: `--dev` 모드로 데몬 시작 (보안 경고 3종 활성화)
3. agent create: 에이전트 생성 [v0.8] (--owner 미제공 시 Owner 없이 생성)
4. session create: 세션 토큰 발급

`--dev`와 `--quickstart` 조합 시 마스터 패스워드는 항상 `waiaas-dev`이며, `.master-password` 파일은 생성하지 않는다 (고정값이므로 파일 저장 불필요).

### 7.6 --dev 모드 제약

#### --expose와 조합 금지

`--dev`와 `--expose`(향후 구현, 원격 접근 플래그)는 함께 사용할 수 없다:

```
$ waiaas start --dev --expose 0.0.0.0
Error: --dev and --expose cannot be used together.
Dev mode uses a fixed, publicly known password. Exposing the daemon
to non-localhost interfaces would be a critical security vulnerability.

Remove --dev for production/remote use, or remove --expose for local development.
```

**근거:** `--dev`는 공개적으로 알려진 고정 패스워드(`waiaas-dev`)를 사용하므로, 외부 네트워크에 노출하면 누구나 키스토어를 해제할 수 있다.

#### init --force와의 관계

`--dev` 모드에서 init --force를 실행하면 기존 dev 환경을 재초기화한다:

```bash
# [v0.8] --owner 선택
waiaas init --quickstart --dev --force --chain solana
```

### 7.7 구현 수도코드

```typescript
// packages/cli/src/commands/start.ts (v0.5 --dev 추가)
function parseStartOptions(args: string[]): StartOptions {
  const { values } = parseArgs({
    args,
    options: {
      daemon: { type: 'boolean', short: 'd', default: false },
      dev: { type: 'boolean', default: false },  // v0.5 추가
      port: { type: 'string' },
      'data-dir': { type: 'string' },
      'log-level': { type: 'string' },
      'password-env': { type: 'string' },
      'password-file': { type: 'string' },
      expose: { type: 'string' },  // 향후 구현
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  })

  // --dev + --expose 조합 금지
  if (values.dev && values.expose) {
    console.error('Error: --dev and --expose cannot be used together.')
    console.error('Dev mode uses a fixed, publicly known password.')
    console.error('Exposing the daemon would be a critical security vulnerability.')
    process.exit(1)
  }

  return {
    daemon: values.daemon ?? false,
    dev: values.dev ?? false,
    port: values.port ? parseInt(values.port, 10) : undefined,
    dataDir: values['data-dir'],
    logLevel: values.dev ? 'debug' : values['log-level'] as LogLevel | undefined,
    passwordEnv: values['password-env'],
    passwordFile: values['password-file'],
  }
}

async function runStart(args: string[]): Promise<void> {
  const options = parseStartOptions(args)

  // --dev 모드: 고정 패스워드 주입
  if (options.dev) {
    process.env.WAIAAS_MASTER_PASSWORD = 'waiaas-dev'

    // 보안 경고 배너
    console.log('')
    console.log('  +------------------------------------------------------+')
    console.log('  |  WARNING: DEV MODE - NOT FOR PRODUCTION              |')
    console.log('  |  Master password: "waiaas-dev" (fixed, public)       |')
    console.log('  |  All keys are protected with a weak password.        |')
    console.log('  +------------------------------------------------------+')
    console.log('')
  }

  // 기존 start 로직 실행
  await startDaemon({
    ...options,
    devMode: options.dev,
  })
}
```

---

## 8. v0.2 -> v0.5 -> v0.8 마이그레이션 가이드

### 8.1 변경 영향

| 영역 | 변경 사항 | 영향도 | 조치 필요 |
|------|----------|--------|----------|
| `waiaas init` | 4단계 -> 2단계 (v0.5) | **HIGH** | 기존 init 스크립트 업데이트 |
| 에이전트 생성 | init 내 -> `agent create` | **HIGH** | 에이전트 생성 워크플로우 변경 |
| [v0.8] `--owner` 옵션 | 필수 -> **선택** | **HIGH** | `--owner` 필수 의존 스크립트 업데이트 |
| [v0.8] Owner 관리 | 없음 -> `set-owner`/`remove-owner`/`withdraw` | **MEDIUM** | 신규 CLI 명령어 학습 |
| 세션 생성 | ownerAuth -> masterAuth (v0.5) | **MEDIUM** | CLI에서 서명 프로세스 제거 |
| CLI 커맨드 | v0.5: 4개 신규, v0.8: 3개 신규 | **MEDIUM** | 스크립트/자동화 업데이트 |
| config.toml | `dev_mode` 추가 | **LOW** | 기존 설정 파일 호환 (기본값 false) |

### 8.2 마이그레이션 절차

기존 v0.2 환경에서 v0.5로 전환하는 절차를 안내한다.

#### 기존 v0.5 사용자 -> v0.8

```bash
# v0.5에서 이미 init + agent 생성이 완료된 경우:

# 1. 데몬 정지
waiaas stop

# 2. v0.8 바이너리로 업데이트
npm install -g @waiaas/cli@0.8.0

# 3. 데몬 재시작 (v0.8)
# [v0.8] DB 마이그레이션: agents.owner_address nullable 전환
# 31-01에서 정의된 테이블 재생성 패턴 (PRAGMA foreign_keys OFF/ON)
waiaas start

# 4. 기존 에이전트는 그대로 동작 (Owner 있으면 GRACE/LOCKED)
# [v0.8] Owner 없는 에이전트도 정상 동작 (Base 보안 수준)

# 5. 신규 CLI 명령어 사용 가능
waiaas agent set-owner my-bot <owner-address>   # Owner 사후 등록
waiaas owner withdraw --agent my-bot             # 자금 회수 (LOCKED만)
```

#### 신규 v0.8 사용자

```bash
# [v0.8] 가장 빠른 시작 (개발용, Owner 없이)
waiaas init --quickstart --dev --chain solana

# Owner 포함 시작 (개발용)
waiaas init --quickstart --dev --chain solana \
  --owner 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

# 프로덕션용 (Owner 없이 시작, 이후 사후 등록)
waiaas init
waiaas start
waiaas agent create --chain solana
export WAIAAS_SESSION_TOKEN=$(waiaas session create --agent agent-01)
# ... 필요 시 사후 등록 ...
waiaas agent set-owner agent-01 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

# 프로덕션용 (Owner 포함)
waiaas init
waiaas start
waiaas agent create --chain solana --owner 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
export WAIAAS_SESSION_TOKEN=$(waiaas session create --agent agent-01)
```

### 8.3 DB 마이그레이션 [v0.8]

v0.8 데몬 시작 시 Drizzle ORM의 자동 마이그레이션이 실행된다. [v0.8] agents.owner_address가 nullable로 전환되고 owner_verified 컬럼이 추가된다. 31-01에서 정의된 **테이블 재생성 패턴**(PRAGMA foreign_keys OFF -> CREATE TABLE new -> INSERT INTO new SELECT -> DROP TABLE old -> ALTER TABLE new RENAME -> PRAGMA foreign_keys ON)이 적용된다.

**주의사항:**
- [v0.8] owner_address nullable 전환: 기존 Owner 있는 에이전트는 자동으로 GRACE 상태 (owner_verified = 0)
- 마이그레이션 전 `waiaas backup create`로 백업 권장
- 마이그레이션은 역방향 불가. 백업 필수.

### 8.4 주요 삭제 항목

| 삭제된 기능 | v0.8 대안 | 비고 |
|-----------|----------|------|
| `init` Step 2 (에이전트 생성) | `waiaas agent create` | 별도 커맨드로 분리 |
| `init` Step 3 (알림 설정) | API/config.toml | 데몬 시작 후 설정 |
| `init` Step 4 (Owner 등록) | [v0.8] `--owner` 선택 옵션 또는 `agent set-owner` 사후 등록 | 에이전트별 속성으로 변경. v0.8에서 선택적. |
| 세션 생성 시 ownerAuth | masterAuth (implicit) | 서명 불필요 |
| [v0.8] `--owner` 필수 의존 | `--owner` 선택, `agent set-owner` 사후 등록 | Owner 없이 에이전트 운영 가능 |

---

## 9. 요구사항 매핑 총괄 [v0.8]

| 요구사항 | 설명 | 충족 섹션 | 충족 상태 |
|---------|------|-----------|----------|
| DX-01 | `waiaas init` 순수 인프라 초기화 (에이전트/Owner 제거) | 섹션 2 (2단계 플로우, 제거된 단계 명시, 구현 수도코드) | 완료 |
| DX-02 | [v0.8] `waiaas agent create` (Owner **선택**, 서명 불필요) + `set-owner`/`remove-owner` 사후 등록/해제 | 섹션 3 (커맨드 인터페이스, 동작 설명, API 호출 구현), 섹션 5 (신규 CLI 명령어) | 완료 |
| DX-03 | `waiaas session create` masterAuth(implicit) 기반 | 섹션 4 (3가지 출력 포맷, 사용 패턴, parseArgs 구현) | 완료 |
| DX-04 | [v0.8] `--quickstart` 4단계 오케스트레이션 (`--chain`만 필수, `--owner` 선택) | 섹션 6 (init->start->agent->session, 에러 롤백, 패스워드 자동 생성) | 완료 |
| DX-05 | `--dev` 모드 (고정 패스워드 + 보안 경고); [v0.8] Owner 미등록 시 agent info 안내 메시지 | 섹션 5.5 (agent info 출력 확장), 섹션 7 (3가지 경고 메커니즘) | 완료 |

**5/5 요구사항 완료.**

---

---

## 부록 A: v0.8 설계 문서 통합 검증 체크리스트 [v0.8]

Phase 35 완료 후 전체 설계 문서의 v0.8 용어 일관성을 검증하기 위한 체크리스트이다. 6개 핵심 용어별로 관련 문서와 확인 항목을 정리한다.

### A.1 masterAuth (implicit/explicit)

| 상태 | 문서 | 확인 항목 |
|------|------|----------|
| [ ] | 52-auth-model-redesign.md | 정의 SSoT (섹션 3.1): implicit=데몬 구동, explicit=X-Master-Password |
| [ ] | 37-rest-api-complete-spec.md | 31+1 엔드포인트 인증 맵에서 masterAuth 대상 일치 |
| [ ] | 28-daemon-lifecycle-cli.md | CLI 커맨드 인증 수준이 masterAuth(implicit)와 일치 |
| [ ] | 29-api-framework-design.md | authRouter 통합 디스패처 참조 존재 |
| [ ] | 40-telegram-bot-docker.md | Tier 2 인증이 v0.5 모델과 일치 |
| [ ] | 54-cli-flow-redesign.md | session create가 masterAuth(implicit) 전용 |

### A.2 ownerAuth (2곳 한정)

| 상태 | 문서 | 확인 항목 |
|------|------|----------|
| [ ] | 52-auth-model-redesign.md | approve_tx + recover만 ownerAuth 필요 (섹션 4.2) |
| [ ] | 37-rest-api-complete-spec.md | ownerAuth가 정확히 2개 엔드포인트에만 적용 |
| [ ] | 34-owner-wallet-connection.md | WalletConnect가 선택적 편의 기능으로 기술 |
| [ ] | 33-time-lock-approval-mechanism.md | approve는 ownerAuth 유지, reject는 masterAuth 변경 참조 노트 |
| [ ] | 36-killswitch-autostop-evm.md | recover는 ownerAuth 유지, activate는 masterAuth 변경 참조 노트 |

### A.3 agents.owner_address nullable [v0.8]

| 상태 | 문서 | 확인 항목 |
|------|------|----------|
| [ ] | 52-auth-model-redesign.md | [v0.8] agents 테이블 owner_address nullable 변경 정의 |
| [ ] | 25-sqlite-schema.md | [v0.8] owner_address nullable + owner_verified 추가 |
| [ ] | 54-cli-flow-redesign.md | [v0.8] agent create --owner **선택** 옵션으로 기술 |
| [ ] | 37-rest-api-complete-spec.md | [v0.8] POST /v1/agents에 ownerAddress **선택** 필드 |
| [ ] | 34-owner-wallet-connection.md | [v0.8] Owner 생명주기 3-State (NONE/GRACE/LOCKED) |

### A.4 세션 갱신 프로토콜

| 상태 | 문서 | 확인 항목 |
|------|------|----------|
| [ ] | 53-session-renewal-protocol.md | SSoT (8개 섹션): 갱신 플로우, 안전 장치, API 스펙 |
| [ ] | 30-session-token-protocol.md | SessionConstraints 8필드 확장 (Phase 20 완료) |
| [ ] | 25-sqlite-schema.md | sessions 테이블 갱신 컬럼 +4 (Phase 20 완료) |
| [ ] | 37-rest-api-complete-spec.md | PUT /v1/sessions/:id/renew 엔드포인트 (Phase 20 완료) |
| [ ] | 35-notification-architecture.md | SESSION_RENEWED/SESSION_RENEWAL_REJECTED 이벤트 (Phase 20 완료) |
| [ ] | 38-sdk-mcp-interface.md | sessions.renew() (renewSession) 메서드 추가 |

### A.5 hint 필드

| 상태 | 문서 | 확인 항목 |
|------|------|----------|
| [ ] | 55-dx-improvement-spec.md | 정의 SSoT (섹션 2): 40개 에러 중 31개 hint 매핑 |
| [ ] | 29-api-framework-design.md | ErrorResponseSchema에 hint: z.string().optional() 추가 |
| [ ] | 37-rest-api-complete-spec.md | 에러 응답 포맷에 hint 필드 존재 |

### A.6 CLI 플로우 (init / agent create / set-owner / remove-owner / withdraw / session create / --quickstart / --dev) [v0.8]

| 상태 | 문서 | 확인 항목 |
|------|------|----------|
| [ ] | 54-cli-flow-redesign.md | SSoT (9개 섹션 + v0.8 확장): init 2단계, agent create (--owner 선택), set-owner, remove-owner, owner withdraw, session create, --quickstart, --dev |
| [ ] | 28-daemon-lifecycle-cli.md | v0.5/v0.8 변경 반영 (섹션 6 CLI 커맨드를 54로 대체) |
| [ ] | 24-monorepo-data-directory.md | dev_mode config + .master-password 파일 설명 |
| [ ] | 39-tauri-desktop-architecture.md | Setup Wizard v0.8 재구성 반영 |
| [ ] | 34-owner-wallet-connection.md | [v0.8] 섹션 10.7 CLI 명령어 스펙이 54와 1:1 대응 |

---

**총 검증 대상:** 6개 핵심 용어, 17개 문서 참조 (일부 문서 중복 카운트), 29개 확인 항목.

Phase 35 Plan 03 (35-03) 검증 단계에서 이 체크리스트를 사용하여 문서 간 일관성을 최종 확인한다.

---

## 부록 B: v0.8 변경 이력 [v0.8]

### B.1 Kill Switch withdraw 결정 [v0.8]

> [v0.8] Kill Switch withdraw: **방안 A 채택** -- killSwitchGuard 허용 경로에 withdraw 추가.
> 근거: 자금 회수는 Kill Switch 발동 시 가장 시급한 보안 조치이며, 기존 API 인프라를 재사용한다.

| 항목 | 방안 A (채택) | 방안 B (기각) |
|------|-------------|-------------|
| 방식 | killSwitchGuard 허용 목록 4->5개 | CLI에서 데몬 API 우회하여 직접 실행 |
| 허용 경로 | `POST /v1/owner/agents/:agentId/withdraw` 추가 | 허용 경로 변경 없음 |
| 일관성 | API 인프라 재사용 (masterAuth, 감사 로그, WithdrawService) | API 우회로 감사 로그/인증 일관성 저하 |
| 보안 | 기존 인증 체계 적용 | 별도 인증 로직 필요 |
| 구현 복잡도 | 낮음 (허용 목록 1줄 추가) | 높음 (CLI에 sweepAll 직접 구현) |

**반영 대상:**
- 36-killswitch-autostop-evm.md: killSwitchGuard 허용 경로 5번째 추가
- 37-rest-api-complete-spec.md: withdraw 엔드포인트 Kill Switch 상태 동작 명시
- 이 문서 섹션 5.8: `owner withdraw` CLI 명령어에 Kill Switch 허용 기록

### B.2 v0.8 변경 위치 요약

| # | 섹션 | 변경 규모 | 변경 내용 |
|---|------|----------|----------|
| 1 | 1.2 | 소 | DX-02 Owner Optional |
| 2 | 1.4 | 중 | 변경 요약표에 v0.8 열 추가 |
| 3 | 2.2 | 소 | init 안내 메시지 갱신 |
| 4 | 2.3 | 소 | 출력 예시 갱신 |
| 5 | 2.8 | 소 | 제거 단계 nullable 근거 |
| 6 | 3.1 | 중 | 설계 원칙 v0.8 갱신 |
| 7 | 3.2 | 중 | --owner Required -> Options |
| 8 | 3.3 | 소 | ownerAddress 선택적 Body |
| 9 | 3.4 | 중 | Owner 없음/있음 두 가지 출력 |
| 10 | 3.5 | 중 | --owner 미지정 에러 제거 |
| 11 | 3.6 | 소 | parseArgs owner optional |
| 12 | 3.7 | 중 | API 호출 ownerAddress 선택적 |
| 13 | 3.8 | 대 | createAgent() 데몬 핸들러 수도코드 **신규** |
| 14 | 5.1 | 중 | 커맨드 표 v0.8 갱신 (3개 신규) |
| 15 | 5.2 | 중 | 변경 요약 v0.8 |
| 16 | 5.3 | 중 | 인증 분류 v0.8 갱신 |
| 17 | 5.5 | 대 | agent info Owner 안내 메시지 **신규** (DX-05) |
| 18 | 5.6 | 대 | set-owner CLI 명령 **신규** (DX-02) |
| 19 | 5.7 | 대 | remove-owner CLI 명령 **신규** (DX-03) |
| 20 | 5.8 | 대 | owner withdraw CLI 명령 **신규** (WITHDRAW-01~08) |
| 21 | 6.2 | 중 | --quickstart --owner Optional |
| 22 | 6.3 | 중 | --chain 필수, --owner 선택 |
| 23 | 6.5 | 대 | Owner 없음/있음 두 가지 출력 |
| 24 | 6.7 | 소 | 비대화형 예시 --owner 선택 |
| 25 | 6.8 | 중 | 수도코드 ownerAddress 선택적 |
| 26 | 8.1-8.4 | 중 | 마이그레이션 가이드 v0.8 |
| 27 | 9 | 소 | 요구사항 매핑 v0.8 |
| 28 | A.3, A.6 | 소 | 체크리스트 nullable 갱신 |

**총 28개 위치 변경 (계획 22개 + 추가 6개).**

---

*문서 작성: 2026-02-07*
*Phase: 21-dx-improvement, Plan: 01*
*CLI-REDESIGN v1.0*
*부록 A 추가: 2026-02-07 (Plan: 04)*
*v0.8 전면 갱신: 2026-02-09 (Phase 35-01) -- --owner 선택, set-owner/remove-owner/withdraw 신규, agent info 안내, --quickstart 간소화, Kill Switch withdraw 방안 A 채택*
