# Phase 146: WC 인프라 세팅 - Research

**Researched:** 2026-02-16
**Domain:** WalletConnect v2 SignClient + SQLite 통합, 데몬 라이프사이클 확장, DB v16 마이그레이션
**Confidence:** HIGH

## Summary

Phase 146은 WalletConnect SignClient를 WAIaaS 데몬 라이프사이클에 통합하는 인프라 기반을 구축한다. 핵심은 3가지: (1) `@walletconnect/sign-client` 2.23.5 초기화/종료를 기존 DaemonLifecycle 6-step 시퀀스에 fail-soft로 삽입, (2) DB v16 마이그레이션으로 `wc_sessions`, `wc_store` 테이블과 `pending_approvals.approval_channel` 컬럼 추가, (3) WC SDK의 IKeyValueStorage 인터페이스를 SQLite로 구현하여 데몬 재시작 시 세션 복구를 보장.

기존 코드베이스 분석 결과, DaemonLifecycle은 Step 4c-5 (TelegramBotService) 이후에 WC 서비스를 Step 4c-6으로 추가하는 것이 자연스럽다. fail-soft 패턴은 TelegramBotService, BalanceMonitorService와 동일. `walletconnect.project_id`가 이미 `setting-keys.ts`에 정의되어 있으므로 SettingsService 통합은 최소 변경. DB 마이그레이션은 LATEST_SCHEMA_VERSION을 15에서 16으로 올리고, v16 migration을 MIGRATIONS 배열에 추가하면 된다.

**Primary recommendation:** WcSessionService + SqliteKeyValueStorage를 먼저 구현하고, DaemonLifecycle 통합은 나중에 진행. DB 마이그레이션은 단순 ALTER TABLE + CREATE TABLE로 충분 (12-step 재생성 불필요).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@walletconnect/sign-client` | ^2.23.5 | WC v2 Sign Protocol dApp 클라이언트 | 공식 dApp SDK, Node.js 호환 명시, 2026-02-11 릴리스. Node.js heartbeat 크래시 수정 포함 |
| `qrcode` | ^1.5.4 | WC pairing URI -> QR 코드 (base64 PNG) | Node.js 서버사이드 QR 생성 표준. toDataURL() -> base64 PNG |
| `@types/qrcode` | ^1.5.6 | qrcode TypeScript 타입 (dev) | DefinitelyTyped 공식 타입 |

### Supporting (기존 스택, 설치 불필요)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `better-sqlite3` | ^12.6.0 | SqliteKeyValueStorage, wc_sessions 직접 쿼리 | WC SDK 스토리지 + 세션 비즈니스 메타데이터 |
| `drizzle-orm` | 기존 | pending_approvals Drizzle 스키마 확장 | approval_channel 컬럼 추가 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SqliteKeyValueStorage (커스텀) | WC 기본 FileSystemStorage | 파일시스템 경로가 WAIaaS data/ 디렉토리와 분리되어 Docker 볼륨 마운트 누락 시 세션 유실. SQLite 통합이 안전 |
| SQLite wc_store 테이블 | 기존 key_value_store 테이블 재활용 | key_value_store는 KillSwitch 등 다른 서비스가 사용. WC 전용 테이블로 격리가 안전 |

**Installation:**
```bash
cd packages/daemon
pnpm add @walletconnect/sign-client@^2.23.5 qrcode@^1.5.4
pnpm add -D @types/qrcode@^1.5.6
```

## Architecture Patterns

### Recommended Project Structure
```
packages/daemon/src/
├── services/
│   ├── wc-session-service.ts       # [NEW] SignClient 래퍼, 세션 관리, 초기화/종료
│   └── wc-storage.ts               # [NEW] SqliteKeyValueStorage (IKeyValueStorage 구현)
├── infrastructure/
│   ├── database/
│   │   └── migrate.ts              # [MODIFY] v16 마이그레이션 추가
│   ├── settings/
│   │   ├── setting-keys.ts         # [MODIFY] walletconnect.relay_url 등 추가
│   │   └── hot-reload.ts           # [MODIFY] walletconnect 키 변경 감지
│   └── config/
│       └── loader.ts               # [MODIFY] walletconnect 섹션 확장
├── lifecycle/
│   └── daemon.ts                   # [MODIFY] Step 4c-6 WC 초기화, shutdown 추가
└── api/
    └── server.ts                   # [MODIFY] CreateAppDeps에 wcService 옵셔널 추가
```

### Pattern 1: DaemonLifecycle fail-soft 서비스 초기화
**What:** 데몬 시작 시 WC 서비스를 try/catch로 초기화, 실패해도 데몬 계속 동작
**When to use:** WC projectId 미설정이거나 relay 연결 실패 시
**Example:**
```typescript
// Source: 기존 daemon.ts Step 4c-5 (TelegramBotService) 패턴 동일
// Step 4c-6: WalletConnect service initialization (fail-soft)
try {
  const wcProjectId = this._settingsService?.get('walletconnect.project_id');
  if (wcProjectId) {
    const { WcSessionService } = await import('../services/wc-session-service.js');
    this.wcSessionService = new WcSessionService({
      sqlite: this.sqlite!,
      settingsService: this._settingsService!,
    });
    await this.wcSessionService.initialize();
    console.log('Step 4c-6: WalletConnect service initialized');
  } else {
    console.log('Step 4c-6: WalletConnect disabled (no project_id)');
  }
} catch (err) {
  console.warn('Step 4c-6 (fail-soft): WalletConnect init warning:', err);
  this.wcSessionService = null;
}
```

### Pattern 2: DB 마이그레이션 (ALTER TABLE + CREATE TABLE)
**What:** LATEST_SCHEMA_VERSION을 16으로 올리고, v16 migration 추가
**When to use:** 신규 테이블 추가 + 기존 테이블에 컬럼 추가
**Example:**
```typescript
// Source: 기존 migrate.ts v10 (ALTER TABLE ADD COLUMN) + v4 (CREATE TABLE) 패턴 조합

// DDL: pending_approvals에 approval_channel 추가
// DDL에서도 pending_approvals 테이블 정의에 추가 필요

MIGRATIONS.push({
  version: 16,
  description: 'Add WC tables (wc_sessions, wc_store) and pending_approvals.approval_channel',
  up: (sqlite) => {
    // 1. pending_approvals에 approval_channel 컬럼 추가
    sqlite.exec(
      "ALTER TABLE pending_approvals ADD COLUMN approval_channel TEXT DEFAULT 'rest_api'"
    );

    // 2. wc_sessions 테이블 생성
    sqlite.exec(`CREATE TABLE IF NOT EXISTS wc_sessions (
  wallet_id TEXT PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  topic TEXT NOT NULL UNIQUE,
  peer_meta TEXT,
  chain_id TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  namespaces TEXT,
  expiry INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)`);
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_wc_sessions_topic ON wc_sessions(topic)');

    // 3. wc_store 테이블 생성 (IKeyValueStorage용)
    sqlite.exec(`CREATE TABLE IF NOT EXISTS wc_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`);
  },
});
```

### Pattern 3: IKeyValueStorage SQLite 구현
**What:** WC SDK의 세션/페어링 데이터를 SQLite wc_store 테이블에 영속화
**When to use:** SignClient 초기화 시 storage 옵션으로 주입
**Example:**
```typescript
// Source: WalletConnect Specs - Storage API
// https://specs.walletconnect.com/2.0/specs/clients/core/storage/storage-api

import type { IKeyValueStorage } from '@walletconnect/keyvaluestorage';
import type { Database } from 'better-sqlite3';

export class SqliteKeyValueStorage implements IKeyValueStorage {
  constructor(private readonly sqlite: Database) {}

  async getKeys(): Promise<string[]> {
    const rows = this.sqlite
      .prepare('SELECT key FROM wc_store')
      .all() as Array<{ key: string }>;
    return rows.map((r) => r.key);
  }

  async getEntries<T = any>(): Promise<[string, T][]> {
    const rows = this.sqlite
      .prepare('SELECT key, value FROM wc_store')
      .all() as Array<{ key: string; value: string }>;
    return rows.map((r) => [r.key, JSON.parse(r.value) as T]);
  }

  async getItem<T = any>(key: string): Promise<T | undefined> {
    const row = this.sqlite
      .prepare('SELECT value FROM wc_store WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : undefined;
  }

  async setItem<T = any>(key: string, value: T): Promise<void> {
    this.sqlite
      .prepare('INSERT OR REPLACE INTO wc_store (key, value) VALUES (?, ?)')
      .run(key, JSON.stringify(value));
  }

  async removeItem(key: string): Promise<void> {
    this.sqlite
      .prepare('DELETE FROM wc_store WHERE key = ?')
      .run(key);
  }
}
```

### Pattern 4: SettingsService 키 확장
**What:** walletconnect 카테고리에 relay_url 등 추가
**When to use:** Admin Settings에서 WC 설정을 런타임으로 변경할 수 있게
**Example:**
```typescript
// Source: 기존 setting-keys.ts 패턴
// 기존: { key: 'walletconnect.project_id', category: 'walletconnect', ... } (line 99)

// 추가할 키:
{ key: 'walletconnect.relay_url', category: 'walletconnect',
  configPath: 'walletconnect.relay_url',
  defaultValue: 'wss://relay.walletconnect.com', isCredential: false },
```

### Pattern 5: Graceful Shutdown 추가
**What:** 데몬 종료 시 WC SignClient 정리
**When to use:** daemon.ts shutdown() 메서드에서 TelegramBotService.stop() 직후
**Example:**
```typescript
// Source: 기존 daemon.ts shutdown() - TelegramBotService 패턴 동일

// Stop WcSessionService (before EventBus cleanup)
if (this.wcSessionService) {
  try {
    await this.wcSessionService.shutdown();
  } catch (err) {
    console.warn('WcSessionService shutdown warning:', err);
  }
  this.wcSessionService = null;
}
```

### Anti-Patterns to Avoid
- **WC 기본 FileSystemStorage 사용:** WAIaaS data/ 디렉토리와 분리된 경로에 저장되어 Docker 볼륨 마운트 누락 시 세션 유실. SqliteKeyValueStorage로 통합 필수.
- **SignClient 다중 인스턴스:** walletId마다 SignClient 생성하면 WebSocket 연결 폭증. 단일 SignClient로 모든 세션을 topic 기반 관리.
- **SignClient를 hot-reload 시 재생성:** EventEmitter 리스너 누적으로 메모리 누수. hot-reload는 설정만 업데이트하고, projectId 변경 시에만 재초기화 (이전 인스턴스 완전 정리 후).
- **WC 실패가 데몬 시작을 차단:** fail-soft 패턴 필수. projectId 미설정이면 비활성화, relay 연결 실패해도 데몬 정상 시작.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WC 세션 암호화/핸드셰이크 | 커스텀 P2P 프로토콜 | `@walletconnect/sign-client` SignClient.init() | X25519 DH, HKDF, AES-256-GCM 체인이 SDK 내부에서 관리됨. 재구현은 보안 리스크 |
| QR 코드 생성 | 커스텀 QR 인코더 | `qrcode` npm 패키지 | Reed-Solomon ECC, masking 등 QR 스펙 구현 복잡도. qrcode는 검증된 라이브러리 |
| WC Relay 프로토콜 | WebSocket 메시지 핸들링 | SignClient 이벤트 (session_delete, session_expire) | Relay 프로토콜은 IRN 기반 pub/sub. SDK가 자동 핸들링 |
| CAIP-2 체인 ID 파싱 | 커스텀 파서 | 정적 매핑 테이블 (toCAIP2 유틸) | WAIaaS가 지원하는 13개 네트워크는 고정. 동적 파싱보다 매핑이 안전 |

**Key insight:** WalletConnect SDK는 브라우저/모바일 앱 대상으로 설계되어 Node.js 서버사이드 패턴이 부족하다. 그러나 커스텀 IKeyValueStorage + fail-soft 초기화로 서버 환경에 적응시킬 수 있다.

## Common Pitfalls

### Pitfall 1: 데몬 재시작 시 WC 세션 유실 (C-01)
**What goes wrong:** WC SDK 기본 FileSystemStorage가 프로세스 CWD 상대 경로에 저장. Docker 컨테이너 재생성 시 파일 소실 -> 모든 WC 세션 무효화.
**Why it happens:** WC SDK는 브라우저 localStorage 또는 파일시스템 기본 사용. WAIaaS의 SQLite 기반 데이터 관리와 분리.
**How to avoid:** SqliteKeyValueStorage를 SignClient.init()의 storage 옵션으로 주입. WAIaaS DB 파일(data/waiaas.db)에 통합되어 백업/Docker 볼륨 마운트가 일원화.
**Warning signs:** 개발 중 "데몬 재시작 없이" 테스트하므로 세션 유실 시나리오 누락.

### Pitfall 2: LATEST_SCHEMA_VERSION 갱신 누락
**What goes wrong:** migrate.ts에 v16 migration을 추가하지만 LATEST_SCHEMA_VERSION을 15에서 16으로 올리지 않으면, 신규 DB에서 DDL이 최신 스키마를 반영하지 못함.
**Why it happens:** pushSchema()가 DDL 실행 후 LATEST_SCHEMA_VERSION까지의 모든 migration을 "이미 적용됨"으로 기록. 버전 불일치 시 migration이 신규 DB에서도 실행됨.
**How to avoid:** 3가지를 동시에 수정: (1) LATEST_SCHEMA_VERSION = 16, (2) DDL에 신규 테이블 추가, (3) MIGRATIONS에 v16 추가.
**Warning signs:** 신규 DB 생성 테스트에서 migration이 실행되는 로그가 출력됨.

### Pitfall 3: pending_approvals DDL과 migration 불일치
**What goes wrong:** DDL의 pending_approvals 테이블 정의에는 approval_channel이 없고, v16 migration만 ALTER TABLE로 추가하면, 기존 DB에서는 migration으로 추가되지만 DDL에는 반영 안 됨.
**Why it happens:** pushSchema()가 DDL과 migration을 분리 관리. DDL은 최신 스키마여야 함.
**How to avoid:** DDL의 pending_approvals 정의에도 `approval_channel TEXT DEFAULT 'rest_api'` 추가.
**Warning signs:** Drizzle 스키마(schema.ts)의 pendingApprovals 테이블에 approvalChannel 필드가 없으면 타입 에러.

### Pitfall 4: IKeyValueStorage 이벤트 미구현
**What goes wrong:** WC SDK IKeyValueStorage 스펙에는 `create`, `update`, `delete`, `sync` 이벤트가 있으나, WAIaaS 구현에서 이벤트 emit을 빠뜨리면 SDK 내부 로직이 오동작할 수 있음.
**Why it happens:** IKeyValueStorage의 코어 메서드(getItem/setItem/removeItem)만 구현하고 이벤트를 무시.
**How to avoid:** 실제로 WC SDK 2.23.x 소스를 확인하면 이벤트를 사용하는 곳이 거의 없다 (내부적으로 이벤트 없이 동작). 하지만 안전을 위해 최소한 EventEmitter를 상속하거나, 이벤트 미발생으로 인한 문제가 없는지 테스트로 검증.
**Warning signs:** SignClient 초기화 후 세션 저장/복원에서 예기치 않은 에러.

### Pitfall 5: Node.js EventEmitter MaxListeners 경고
**What goes wrong:** SignClient.init()이 내부적으로 10개 이상의 이벤트 리스너를 등록하여 Node.js 기본 제한(10)을 초과.
**Why it happens:** WC SDK가 Core, Relayer, Pairing, Session 등 여러 서브모듈에 리스너를 등록.
**How to avoid:** 경고 자체는 무해하지만 로그를 오염시킴. `signClient.core.events.setMaxListeners(20)` 설정 또는, 리스너 등록을 WcSessionService에서 중앙 관리.
**Warning signs:** 데몬 시작 시 `MaxListenersExceededWarning` 경고 출력.

## Code Examples

### WcSessionService 핵심 구조
```typescript
// Source: 기존 코드베이스 KillSwitchService, TelegramBotService 패턴 참조

import SignClient from '@walletconnect/sign-client';
import type { Database } from 'better-sqlite3';
import type { SettingsService } from '../infrastructure/settings/settings-service.js';
import { SqliteKeyValueStorage } from './wc-storage.js';

interface WcSessionServiceDeps {
  sqlite: Database;
  settingsService: SettingsService;
}

export class WcSessionService {
  private signClient: SignClient | null = null;
  private readonly sqlite: Database;
  private readonly settingsService: SettingsService;
  // walletId -> session topic 매핑 (메모리 캐시)
  private readonly sessionMap = new Map<string, string>();

  constructor(deps: WcSessionServiceDeps) {
    this.sqlite = deps.sqlite;
    this.settingsService = deps.settingsService;
  }

  async initialize(): Promise<void> {
    const projectId = this.settingsService.get('walletconnect.project_id');
    if (!projectId) return;

    const relayUrl = this.settingsService.get('walletconnect.relay_url')
      || 'wss://relay.walletconnect.com';

    const storage = new SqliteKeyValueStorage(this.sqlite);

    this.signClient = await SignClient.init({
      projectId,
      relayUrl,
      storage,  // IKeyValueStorage -> SQLite
      metadata: {
        name: 'WAIaaS Daemon',
        description: 'AI Agent Wallet-as-a-Service',
        url: 'http://localhost',
        icons: [],
      },
    });

    // 이벤트 리스너 등록
    this.signClient.on('session_delete', ({ topic }) => {
      this.handleSessionDelete(topic);
    });
    this.signClient.on('session_expire', ({ topic }) => {
      this.handleSessionDelete(topic);
    });

    // 기존 세션 복원 (wc_sessions 테이블 -> sessionMap)
    this.restoreSessions();
  }

  private restoreSessions(): void {
    const rows = this.sqlite
      .prepare('SELECT wallet_id, topic FROM wc_sessions')
      .all() as Array<{ wallet_id: string; topic: string }>;
    for (const row of rows) {
      this.sessionMap.set(row.wallet_id, row.topic);
    }
  }

  hasActiveSession(walletId: string): boolean {
    return this.sessionMap.has(walletId);
  }

  async shutdown(): Promise<void> {
    if (this.signClient) {
      // SignClient 내부 WebSocket 연결 정리
      // disconnect는 세션을 삭제하므로, 단순히 리소스만 해제
      this.signClient = null;
      this.sessionMap.clear();
    }
  }

  private handleSessionDelete(topic: string): void {
    // wc_sessions 테이블에서 삭제
    this.sqlite
      .prepare('DELETE FROM wc_sessions WHERE topic = ?')
      .run(topic);
    // sessionMap에서도 삭제
    for (const [walletId, t] of this.sessionMap) {
      if (t === topic) {
        this.sessionMap.delete(walletId);
        break;
      }
    }
  }
}
```

### DB v16 마이그레이션 전체
```typescript
// Source: 기존 migrate.ts v10 + v15 패턴

MIGRATIONS.push({
  version: 16,
  description: 'Add WC infra: wc_sessions table, wc_store table, pending_approvals.approval_channel',
  up: (sqlite) => {
    // 1. pending_approvals.approval_channel 추가
    sqlite.exec(
      "ALTER TABLE pending_approvals ADD COLUMN approval_channel TEXT DEFAULT 'rest_api'"
    );

    // 2. wc_sessions 테이블 (비즈니스 메타데이터)
    sqlite.exec(`CREATE TABLE IF NOT EXISTS wc_sessions (
  wallet_id TEXT PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  topic TEXT NOT NULL UNIQUE,
  peer_meta TEXT,
  chain_id TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  namespaces TEXT,
  expiry INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)`);
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_wc_sessions_topic ON wc_sessions(topic)');

    // 3. wc_store 테이블 (IKeyValueStorage용)
    sqlite.exec(`CREATE TABLE IF NOT EXISTS wc_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`);
  },
});
```

### config.toml 섹션 확장
```toml
# Source: 기존 config.toml walletconnect 섹션

[walletconnect]
project_id = ""                              # WalletConnect Cloud에서 발급 (필수)
relay_url = "wss://relay.walletconnect.com"  # 기본 relay 서버
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WC v1 (deprecated) | WC v2 SignClient | 2023 | v1은 완전 EOL. v2만 사용 |
| `@walletconnect/client` | `@walletconnect/sign-client` | 2023 | 패키지명 변경 |
| WalletConnect 브랜딩 | Reown 리브랜딩 | 2024-09 | 문서 URL 변경 (docs.reown.com). `@walletconnect/*` 패키지는 유지 |
| 브라우저 FileSystemStorage 기본 | 커스텀 IKeyValueStorage 지원 | 2.x 초기 | Node.js 서버에서 SQLite 어댑터 가능 |

**Deprecated/outdated:**
- `@walletconnect/modal`: Deprecated (2024). `@reown/appkit`으로 대체. 서버 데몬에서 불필요.
- `@walletconnect/qrcode-modal`: Deprecated. 브라우저 모달 전용.
- `@walletconnect/client` (v1): 완전 EOL.

## Open Questions

1. **SignClient.init()의 storage 파라미터 정확한 위치**
   - What we know: Reown 문서에서 `storage` 옵션 존재 확인. @walletconnect/core의 CoreTypes.Options에 `storage?: IKeyValueStorage` 필드가 있음.
   - What's unclear: SignClient.init()에 직접 전달하는지, Core 생성 시 전달하는지. 2.23.5 소스에서 정확한 시그니처 미확인.
   - Recommendation: 두 가지 모두 시도. (1) `SignClient.init({ projectId, storage })` 직접 전달, (2) 안 되면 `new Core({ projectId, storage })` 후 `SignClient.init({ core })` 패턴. ARCHITECTURE.md에서 두 번째 패턴을 사용.

2. **SignClient 종료 시 WebSocket 정리**
   - What we know: `signClient.core.relayer.provider.disconnect()` 호출로 WebSocket 정리 가능. 하지만 이는 내부 API이므로 버전 변경 시 깨질 수 있음.
   - What's unclear: 공식적인 SignClient 종료 API가 있는지.
   - Recommendation: `signClient.core.relayer.provider.disconnect()` 사용하되, try/catch로 감싸고, 안 되면 `this.signClient = null`로 GC에 맡기기.

3. **qrcode 패키지 ESM 호환성**
   - What we know: qrcode는 CommonJS. daemon은 ESM (`type: "module"`). 기존에 sodium-native, better-sqlite3도 CJS -> createRequire 패턴 사용 중.
   - What's unclear: qrcode의 toDataURL이 createRequire 없이 dynamic import로 동작하는지.
   - Recommendation: `createRequire(import.meta.url)` 패턴 사용. 기존 daemon에서 이미 검증된 패턴.

## Sources

### Primary (HIGH confidence)
- WAIaaS 코드베이스 직접 분석: `daemon.ts`, `migrate.ts`, `schema.ts`, `setting-keys.ts`, `hot-reload.ts`, `approval-workflow.ts`, `server.ts` (현재 v1.6)
- [WalletConnect Specs - Storage API](https://specs.walletconnect.com/2.0/specs/clients/core/storage/storage-api) -- IKeyValueStorage 인터페이스 정의
- [Reown Docs - Dapp Usage](https://docs.reown.com/advanced/api/sign/dapp-usage) -- SignClient.init(), connect(), request() API
- [npm @walletconnect/sign-client](https://www.npmjs.com/package/@walletconnect/sign-client) -- v2.23.5 확인
- [npm qrcode](https://www.npmjs.com/package/qrcode) -- v1.5.4 확인

### Secondary (MEDIUM confidence)
- [GitHub pedrouid/keyvaluestorage-interface](https://github.com/pedrouid/keyvaluestorage-interface) -- IKeyValueStorage 원본 인터페이스 정의
- [WC Issue #5588 - Node.js heartbeat crash](https://github.com/WalletConnect/walletconnect-monorepo/issues/5588) -- 2.23.x에서 수정됨
- [WC Issue #4125 - Storage accumulation](https://github.com/WalletConnect/walletconnect-monorepo/issues/4125) -- wc_store 메시지 누적 이슈
- `.planning/research/STACK.md` -- 마일스톤 레벨 스택 리서치 (2026-02-16)
- `.planning/research/ARCHITECTURE.md` -- 마일스톤 레벨 아키텍처 리서치 (2026-02-16)
- `.planning/research/PITFALLS.md` -- 마일스톤 레벨 함정 리서치 (2026-02-16)

### Tertiary (LOW confidence)
- SignClient.init() storage 파라미터 정확한 위치 -- 공식 문서에서 Core 옵션으로 문서화되나, SignClient 직접 전달도 가능한지 미검증
- SignClient 종료 시 WebSocket 정리 공식 API -- 내부 API(`core.relayer.provider.disconnect()`) 사용은 버전 변경에 취약

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - npm registry 직접 확인, 기존 마일스톤 리서치에서 검증
- Architecture: HIGH - 기존 daemon.ts, migrate.ts, setting-keys.ts 패턴을 직접 분석하여 동일 패턴 적용
- Pitfalls: MEDIUM - WC SDK의 Node.js 서버사이드 장기 운영 이슈는 커뮤니티 보고 기반
- DB migration: HIGH - 기존 v2~v15 마이그레이션 패턴 직접 분석, v16은 단순 ALTER TABLE + CREATE TABLE

**Research date:** 2026-02-16
**Valid until:** 30 days (WC SDK 2.23.x는 안정 릴리스, 단기 breaking change 가능성 낮음)
