# Phase 147: QR 페어링 + REST API - Research

**Researched:** 2026-02-16
**Domain:** WalletConnect v2 SignClient pairing, QR code generation, REST API, Admin UI, CLI
**Confidence:** HIGH

## Summary

Phase 147은 Phase 146에서 구축한 WcSessionService 위에 실제 페어링/세션 관리 기능을 구현한다. WalletConnect v2 SignClient의 `connect()` 메서드로 pairing URI를 생성하고, `qrcode` 패키지(이미 daemon 의존성에 있음)로 서버사이드 QR 코드를 base64 data URL로 변환하여 REST API로 반환한다. Admin UI에서는 CSP `img-src 'self' data:` 정책 덕분에 변경 없이 base64 이미지를 렌더링할 수 있다. CLI에서는 `qrcode.toString({type:'terminal'})` 로 터미널에 QR을 출력한다.

핵심 흐름: REST API 호출 -> SignClient.connect(requiredNamespaces) -> { uri, approval } -> QRCode.toDataURL(uri) -> base64 반환. 외부 지갑이 QR을 스캔하면 approval() Promise가 resolve되어 SessionTypes.Struct을 반환하고, 이를 wc_sessions 테이블에 저장한다.

**Primary recommendation:** WcSessionService에 `createPairing(walletId)`, `getSession(walletId)`, `disconnectSession(walletId)` 메서드를 추가하고, REST 라우트 파일 `wc.ts`를 신규 생성하여 `/v1/wallets/:id/wc/*` 경로로 노출한다.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @walletconnect/sign-client | ^2.23.5 | WC v2 SignClient (pairing, session, disconnect) | 이미 daemon 의존성에 있음 |
| qrcode | ^1.5.4 | 서버사이드 QR 코드 생성 (toDataURL, toString) | 이미 daemon 의존성에 있음 |
| @types/qrcode | ^1.5.6 | TypeScript 타입 | 이미 daemon devDependencies에 있음 |
| @hono/zod-openapi | ^0.19.10 | OpenAPI 라우트 정의 | 기존 API 라우트 패턴 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| commander | ^13.0.0 | CLI 명령어 (owner connect) | CLI 패키지에서 사용 |

### Alternatives Considered
없음. 모든 라이브러리가 이미 프로젝트에 설치되어 있으므로 추가 패키지 설치 불필요.

**Installation:**
```bash
# 추가 설치 불필요 -- 모든 패키지가 이미 존재함
# CLI에서 qrcode를 사용하려면 cli/package.json에 qrcode 의존성 추가 필요
# 또는 REST API를 호출하여 QR data를 받아 터미널에 출력
```

## Architecture Patterns

### Recommended Project Structure
```
packages/daemon/src/
├── services/
│   └── wc-session-service.ts    # 기존 파일에 createPairing/getSession/disconnect 추가
├── api/routes/
│   └── wc.ts                     # NEW: /v1/wallets/:id/wc/* 라우트
├── api/routes/openapi-schemas.ts # WC 관련 스키마 추가
└── api/server.ts                 # wcRoutes 등록

packages/admin/src/
├── pages/wallets.tsx             # QR 모달 섹션 추가 (WalletDetailView)
└── api/endpoints.ts              # WC 엔드포인트 상수 추가

packages/cli/src/
├── commands/owner.ts             # NEW: owner connect 명령
└── index.ts                      # owner 서브커맨드 그룹 등록
```

### Pattern 1: SignClient.connect() -> URI -> QR 변환 패턴
**What:** WalletConnect pairing URI 생성 후 서버사이드 QR 코드 변환
**When to use:** POST /v1/wallets/:id/wc/pair 호출 시
**Example:**
```typescript
// Source: @walletconnect/types engine.d.ts + qrcode npm docs
import QRCode from 'qrcode';
import type SignClient from '@walletconnect/sign-client';
import type { SessionTypes } from '@walletconnect/types';

async function createPairing(
  signClient: SignClient,
  requiredNamespaces: Record<string, { chains: string[]; methods: string[]; events: string[] }>,
): Promise<{ uri: string; qrDataUrl: string; approval: () => Promise<SessionTypes.Struct> }> {
  const { uri, approval } = await signClient.connect({ requiredNamespaces });

  if (!uri) {
    throw new Error('Failed to generate pairing URI');
  }

  // Server-side QR generation (CSP-safe: returns data:image/png;base64,...)
  const qrDataUrl = await QRCode.toDataURL(uri, {
    width: 300,
    margin: 2,
    errorCorrectionLevel: 'M',
  });

  return { uri, qrDataUrl, approval };
}
```

### Pattern 2: 세션 이벤트 핸들링 패턴
**What:** session_proposal 자동 수락 + session_delete 정리
**When to use:** WcSessionService.initialize() 내에서 이벤트 리스너 등록
**Example:**
```typescript
// Source: @walletconnect/types client.d.ts SignClientTypes.EventArguments
// WAIaaS는 dApp 측(session 제안자)이므로 session_proposal 이벤트는 받지 않음
// approval() Promise가 resolve되면 세션이 성립된 것

// session_connect 이벤트: 새 세션이 성립되었을 때
signClient.on('session_connect', ({ session }) => {
  // session: SessionTypes.Struct
  // session.peer.metadata: { name, description, url, icons }
  // session.namespaces: Record<string, { accounts: string[], methods: string[], events: string[] }>
  // session.topic: string (unique session identifier)
  // session.expiry: number (unix timestamp)
});

// session_delete 이벤트: 상대방이 세션을 끊었을 때
signClient.on('session_delete', ({ topic }) => {
  // topic으로 wc_sessions에서 삭제
});

// session_expire 이벤트: 세션 만료
signClient.on('session_expire', ({ topic }) => {
  // topic으로 wc_sessions에서 삭제
});
```

### Pattern 3: REST 라우트 패턴 (기존 프로젝트 컨벤션)
**What:** OpenAPIHono + createRoute + Zod 스키마 기반 라우트
**When to use:** 모든 REST API 엔드포인트
**Example:**
```typescript
// Source: 기존 코드베이스 packages/daemon/src/api/routes/wallets.ts 패턴
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

const createPairingRoute = createRoute({
  method: 'post',
  path: '/wallets/{id}/wc/pair',
  tags: ['WalletConnect'],
  summary: 'Create WC pairing and generate QR code',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Pairing URI and QR code generated',
      content: {
        'application/json': {
          schema: z.object({
            uri: z.string(),
            qrCode: z.string(), // data:image/png;base64,...
            expiresAt: z.number().int(),
          }),
        },
      },
    },
    // ... error responses
  },
});
```

### Pattern 4: CLI 명령어 패턴
**What:** commander 기반 서브커맨드 + REST API 호출 + 터미널 QR 출력
**When to use:** `waiaas owner connect` 명령
**Example:**
```typescript
// Source: 기존 CLI 패턴 (packages/cli/src/commands/wallet.ts)
// qrcode.toString({ type: 'terminal', small: true }) 로 터미널에 QR 출력

// CLI에서 REST API를 호출하여 uri를 받고, 직접 qrcode로 터미널 출력하거나
// 또는 REST API 응답의 base64를 터미널에서는 사용 불가하므로
// URI만 받아서 CLI 측에서 qrcode.toString()으로 터미널 렌더링

// 방법 1: CLI에 qrcode 의존성 추가
import QRCode from 'qrcode';
const terminalQR = await QRCode.toString(uri, { type: 'terminal', small: true });
console.log(terminalQR);

// 방법 2: REST API에서 terminal 포맷도 반환 (덜 깔끔)
```

### Pattern 5: Admin UI QR 모달 패턴 (Preact + signals)
**What:** WalletDetailView에 WC Connect 섹션 + QR 모달 추가
**When to use:** Admin UI 월렛 상세 페이지
**Example:**
```tsx
// Source: 기존 Admin UI 패턴 (packages/admin/src/pages/wallets.tsx)
// CSP img-src 'self' data: -> base64 이미지 직접 렌더링 가능

const qrModal = useSignal(false);
const qrData = useSignal<{ uri: string; qrCode: string } | null>(null);
const pairingLoading = useSignal(false);

const handleConnect = async () => {
  pairingLoading.value = true;
  try {
    const result = await apiPost<{ uri: string; qrCode: string }>(
      API.WALLET_WC_PAIR(walletId)
    );
    qrData.value = result;
    qrModal.value = true;
  } finally {
    pairingLoading.value = false;
  }
};

// 모달 내부:
// <img src={qrData.value.qrCode} alt="WalletConnect QR" />
// CSP data: 허용이므로 별도 CSP 변경 불필요
```

### Anti-Patterns to Avoid
- **클라이언트 사이드 QR 생성 금지:** CSP `script-src 'self'` 위반 가능, 서버에서 생성하여 data URL 반환
- **approval() Promise를 REST 응답에서 대기하지 말 것:** HTTP 요청 타임아웃 발생. URI/QR만 즉시 반환하고, 폴링 또는 별도 엔드포인트로 세션 상태 확인
- **복수 WC 세션 허용하지 말 것:** 단일 WC 세션 정책 결정 있음. 기존 세션이 있으면 새 페어링 전에 경고/거부
- **SignClient를 라우트에서 직접 생성하지 말 것:** WcSessionService를 통해 접근, getSignClient()로 인스턴스 획득

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| QR 코드 생성 | Canvas/SVG 직접 렌더링 | `qrcode.toDataURL()` / `qrcode.toString()` | 에러 보정 레벨, 크기 조정, 포맷 자동 처리 |
| WC 세션 암호화 | 자체 암호화 | SignClient 내장 Storage | WC SDK가 세션 키 관리 자동 처리 |
| CAIP-2 체인 ID 파싱 | 문자열 직접 파싱 | 상수 맵 정의 | `eip155:1`, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` 등 고정 값 |
| WebSocket relay 연결 | 자체 WS 구현 | SignClient relay 자동 연결 | SignClient.init()에서 자동으로 relay 연결 관리 |

**Key insight:** WalletConnect SDK가 relay 통신, 세션 암호화, 만료 관리를 모두 처리하므로, WAIaaS는 SDK 위에 REST API 래퍼만 제공하면 된다.

## Common Pitfalls

### Pitfall 1: approval() Promise 장기 대기
**What goes wrong:** SignClient.connect() 반환값의 approval() Promise를 REST 핸들러에서 await하면 HTTP 요청이 무한 대기
**Why it happens:** 사용자가 QR을 스캔하지 않거나 거부할 수 있음. 5분 타임아웃 기본값이지만 HTTP 요청은 보통 10초 내에 응답해야 함
**How to avoid:** URI/QR만 즉시 반환 (동기 응답). approval()은 백그라운드에서 await하고, 결과를 DB에 저장. 클라이언트는 GET으로 세션 상태 폴링
**Warning signs:** REST 응답 시간이 수십 초 이상

### Pitfall 2: SignClient null 체크 누락
**What goes wrong:** WC project_id 미설정 시 SignClient가 null인 상태에서 라우트 호출
**Why it happens:** WcSessionService.initialize()는 project_id 없으면 no-op, getSignClient() returns null
**How to avoid:** 라우트 핸들러에서 signClient null 체크 후 적절한 에러 응답 (503 또는 WAIaaSError('WC_NOT_CONFIGURED'))
**Warning signs:** `TypeError: Cannot read properties of null`

### Pitfall 3: 중복 페어링 시도
**What goes wrong:** 진행 중인 페어링이 있는 상태에서 새 페어링 요청 시 relay 충돌
**Why it happens:** approval() Promise가 아직 pending인 상태에서 다시 connect() 호출
**How to avoid:** WcSessionService에 pending pairing 상태 추적. 이미 pending이면 기존 URI 반환하거나 에러
**Warning signs:** 여러 QR 코드가 동시에 생성되지만 하나만 유효

### Pitfall 4: session_delete 이벤트에서 disconnect() 호출
**What goes wrong:** 상대방이 세션을 끊은 후 우리 측에서도 disconnect() 호출하면 "No matching key" 에러
**Why it happens:** session_delete 이벤트는 이미 세션이 정리된 후 발생. 이 시점에 disconnect()는 중복
**How to avoid:** session_delete/session_expire 핸들러에서는 DB/메모리 정리만 수행, signClient.disconnect() 호출하지 않음
**Warning signs:** GitHub issue #1639, "No matching key. session topic doesn't exist"

### Pitfall 5: CAIP-2 체인 ID 매핑 오류
**What goes wrong:** 잘못된 체인 ID로 requiredNamespaces 구성하면 지갑이 세션 거부
**Why it happens:** Solana는 genesis hash 기반, EVM은 정수 기반 -- 혼동 가능
**How to avoid:** 상수 맵으로 정의하고 테스트로 검증. 아래 "CAIP-2 상수 맵" 참조
**Warning signs:** 지갑에서 "Unsupported chains" 에러

## Code Examples

### CAIP-2 체인 ID 상수 맵
```typescript
// Source: Chain Agnostic Namespaces + EVM_CHAIN_MAP (adapters/evm/src/evm-chain-map.ts)
// 기존 EVM_CHAIN_MAP의 chainId 숫자를 활용

import type { NetworkType, ChainType } from '@waiaas/core';

/** CAIP-2 chain identifiers for WalletConnect v2 */
export const CAIP2_CHAIN_IDS: Record<string, string> = {
  // Solana (genesis hash 첫 32자)
  'mainnet': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'devnet': 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  'testnet': 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
  // EVM (eip155:{chainId})
  'ethereum-mainnet': 'eip155:1',
  'ethereum-sepolia': 'eip155:11155111',
  'polygon-mainnet': 'eip155:137',
  'polygon-amoy': 'eip155:80002',
  'arbitrum-mainnet': 'eip155:42161',
  'arbitrum-sepolia': 'eip155:421614',
  'optimism-mainnet': 'eip155:10',
  'optimism-sepolia': 'eip155:11155420',
  'base-mainnet': 'eip155:8453',
  'base-sepolia': 'eip155:84532',
};

/** Get CAIP-2 namespace (eip155 or solana) from chain type */
export function getWcNamespace(chain: ChainType): string {
  return chain === 'solana' ? 'solana' : 'eip155';
}
```

### WcSessionService 확장 메서드
```typescript
// Source: @walletconnect/types engine.d.ts (ConnectParams, DisconnectParams, SessionTypes.Struct)
import QRCode from 'qrcode';

interface PairingResult {
  uri: string;
  qrDataUrl: string;
  expiresAt: number;
}

// WcSessionService에 추가할 메서드들:

/**
 * Create a new WC pairing for a wallet.
 * Returns URI + QR code immediately. Session settlement happens asynchronously.
 */
async createPairing(walletId: string, chainId: string): Promise<PairingResult> {
  const signClient = this.getSignClient();
  if (!signClient) throw new Error('WalletConnect not initialized');

  // 단일 세션 정책: 기존 세션이 있으면 에러
  if (this.hasActiveSession(walletId)) {
    throw new Error('Wallet already has an active WC session');
  }

  const namespace = chainId.split(':')[0]; // 'eip155' or 'solana'
  const methods = namespace === 'solana'
    ? ['solana_signTransaction', 'solana_signMessage']
    : ['eth_sendTransaction', 'eth_signTransaction', 'personal_sign', 'eth_signTypedData_v4'];
  const events = namespace === 'solana'
    ? []
    : ['chainChanged', 'accountsChanged'];

  const { uri, approval } = await signClient.connect({
    requiredNamespaces: {
      [namespace]: {
        chains: [chainId],
        methods,
        events,
      },
    },
  });

  if (!uri) throw new Error('Failed to generate pairing URI');

  const qrDataUrl = await QRCode.toDataURL(uri, {
    width: 300,
    margin: 2,
    errorCorrectionLevel: 'M',
  });

  // 백그라운드에서 approval 대기 (HTTP 응답은 즉시 반환)
  this.waitForApproval(walletId, chainId, approval);

  return {
    uri,
    qrDataUrl,
    expiresAt: Math.floor(Date.now() / 1000) + 300, // 5분 기본 만료
  };
}

/**
 * Disconnect a wallet's WC session.
 */
async disconnectSession(walletId: string): Promise<void> {
  const signClient = this.getSignClient();
  if (!signClient) throw new Error('WalletConnect not initialized');

  const topic = this.getSessionTopic(walletId);
  if (!topic) throw new Error('No active session for this wallet');

  await signClient.disconnect({
    topic,
    reason: { code: 6000, message: 'User disconnected' },
  });

  // DB + 메모리 정리
  this.handleSessionDelete(topic);
}
```

### QR 코드 터미널 출력 (CLI)
```typescript
// Source: qrcode npm docs - toString({ type: 'terminal' })
import QRCode from 'qrcode';

async function printQRToTerminal(uri: string): Promise<void> {
  const terminalQR = await QRCode.toString(uri, {
    type: 'terminal',
    small: true,
  });
  console.log('\nScan this QR code with your wallet app:\n');
  console.log(terminalQR);
  console.log(`\nOr paste this URI manually:\n${uri}\n`);
}
```

### REST API 엔드포인트 구성
```typescript
// Source: 기존 REST API 패턴 (server.ts, wallets.ts)
// 4개 엔드포인트:

// POST /v1/wallets/:id/wc/pair   - pairing URI 생성 + QR base64 반환 (masterAuth)
// GET  /v1/wallets/:id/wc/session - 현재 WC 세션 상태 조회 (masterAuth)
// DELETE /v1/wallets/:id/wc/session - WC 세션 해제 (masterAuth)
// GET  /v1/wallets/:id/wc/pair/status - 페어링 진행 상태 (polling용, masterAuth)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WC v1 Bridge | WC v2 Relay (wss://relay.walletconnect.com) | 2023 | v1 종료됨. v2만 사용 |
| FileSystemStorage | SqliteKeyValueStorage (Phase 146) | v1.6.1 | 세션 영속성 보장 |
| Client-side QR | Server-side QR (data URL) | 설계 결정 | CSP 호환, 보안 강화 |
| signClient.core.pairing.pair() 직접 호출 | signClient.connect() | v2 stable | connect()가 pairing + session proposal 통합 |

**Deprecated/outdated:**
- WalletConnect v1: 2023년 완전 종료. v2만 사용
- signClient.core.pairing.pair() 직접 호출: deprecated, signClient.connect() 사용 권장

## Key Technical Details

### WAIaaS는 Dapp 측 (Session Proposer)
WAIaaS daemon은 dApp 역할이다. 즉 session을 제안(propose)하고, 외부 지갑(MetaMask, Phantom 등)이 수락(approve)한다.

- `signClient.connect()`: dApp 측에서 호출. `{ uri, approval }` 반환
- `uri`: QR 코드로 표시할 WC pairing URI (wc:... 형식)
- `approval()`: 지갑이 session proposal을 수락할 때까지 대기하는 Promise
- 지갑이 수락하면 `SessionTypes.Struct` 반환 (topic, namespaces, peer.metadata 포함)

### SignClient.connect() 타입 시그니처 (검증됨)
```typescript
// Source: @walletconnect/types@2.23.5 engine.d.ts (line 307-310)
abstract connect(params: EngineTypes.ConnectParams): Promise<{
  uri?: string;  // string | undefined
  approval: () => Promise<SessionTypes.Struct>;
}>;

// ConnectParams (line 75-84):
interface ConnectParams {
  requiredNamespaces?: ProposalTypes.RequiredNamespaces;
  optionalNamespaces?: ProposalTypes.OptionalNamespaces;
  sessionProperties?: ProposalTypes.SessionProperties;
  pairingTopic?: string;
  relays?: RelayerTypes.ProtocolOptions[];
}
```

### SignClient.disconnect() 타입 시그니처 (검증됨)
```typescript
// Source: @walletconnect/types@2.23.5 engine.d.ts (line 136-139, 323)
interface DisconnectParams {
  topic: string;
  reason: ErrorResponse; // { code: number; message: string }
}
abstract disconnect(params: EngineTypes.DisconnectParams): Promise<void>;
```

### SignClient 이벤트 타입 (검증됨)
```typescript
// Source: @walletconnect/types@2.23.5 sign-client/client.d.ts (line 12, 18-69)
type Event = "session_proposal" | "session_update" | "session_extend" |
  "session_ping" | "session_delete" | "session_expire" | "session_request" |
  "session_request_sent" | "session_event" | "session_authenticate" |
  "proposal_expire" | "session_request_expire" | "session_connect";

// session_delete: { id: number; topic: string }
// session_expire: { topic: string }
// session_connect: { session: SessionTypes.Struct }
```

### SessionTypes.Struct 구조 (검증됨)
```typescript
// Source: @walletconnect/types@2.23.5 sign-client/session.d.ts
interface Struct {
  topic: string;
  pairingTopic: string;
  expiry: number;  // unix timestamp
  acknowledged: boolean;
  namespaces: Record<string, {
    chains?: string[];
    accounts: string[];  // CAIP-10 format: "eip155:1:0xabc..."
    methods: string[];
    events: string[];
  }>;
  peer: {
    publicKey: string;
    metadata: { name: string; description: string; url: string; icons: string[] };
  };
  self: {
    publicKey: string;
    metadata: { name: string; description: string; url: string; icons: string[] };
  };
}
```

### CSP 호환성 확인 (검증됨)
```typescript
// Source: packages/daemon/src/api/middleware/csp.ts (line 24)
// "img-src 'self' data:" -> base64 data URL 이미지 허용됨
// QRCode.toDataURL()가 반환하는 "data:image/png;base64,..." 형식은 CSP 위반 없음
```

### wc_sessions 테이블 스키마 (검증됨)
```sql
-- Source: packages/daemon/src/infrastructure/database/schema.ts + migrate.ts v16
CREATE TABLE wc_sessions (
  wallet_id TEXT PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  topic TEXT NOT NULL UNIQUE,
  peer_meta TEXT,
  chain_id TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  namespaces TEXT,
  expiry INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
-- wallet_id PK -> 단일 WC 세션 정책을 DB 수준에서 보장
```

### QR 코드 생성 API (검증됨)
```typescript
// Source: qrcode npm, @types/qrcode@1.5.6

// Server-side (data URL for Admin UI):
import QRCode from 'qrcode';
const dataUrl: string = await QRCode.toDataURL(text, {
  width: 300,           // px
  margin: 2,            // modules
  errorCorrectionLevel: 'M',  // 'L' | 'M' | 'Q' | 'H'
  color: {
    dark: '#000000',
    light: '#ffffff',
  },
});
// Returns: "data:image/png;base64,iVBOR..."

// Terminal output (CLI):
const terminalStr: string = await QRCode.toString(text, {
  type: 'terminal',
  small: true,  // compact output
});
```

## Open Questions

1. **페어링 타임아웃 정책**
   - What we know: WC v2 pairing은 기본 5분 만료. approval() Promise도 타임아웃됨
   - What's unclear: approval() 타임아웃 시 어떤 에러가 발생하는지, reject인지 timeout인지
   - Recommendation: 백그라운드 approval()에 자체 타임아웃(5분) 설정. 만료 시 pending 상태를 EXPIRED로 변경

2. **폴링 vs SSE**
   - What we know: Admin UI에서 세션 성립 여부를 실시간으로 확인해야 함
   - What's unclear: SSE를 사용할지, 단순 GET 폴링으로 충분한지
   - Recommendation: GET 폴링으로 시작 (3초 간격). SSE는 Phase 147 범위를 넘어감. Admin UI에서 setInterval로 GET /v1/wallets/:id/wc/session 호출

3. **CLI에서 qrcode 의존성 위치**
   - What we know: daemon에 qrcode가 이미 있고, CLI는 daemon을 workspace 의존성으로 참조
   - What's unclear: CLI에서 직접 qrcode를 import할 수 있는지 (pnpm strict mode)
   - Recommendation: REST API에서 terminal 포맷도 함께 반환하거나, CLI package.json에 qrcode 추가

## Sources

### Primary (HIGH confidence)
- @walletconnect/types@2.23.5 (node_modules 직접 검사) - SignClient, EngineTypes, SessionTypes 타입 시그니처
- @walletconnect/sign-client@2.23.5 (node_modules 직접 검사) - SignClient.init, connect, disconnect 클래스 구조
- packages/daemon/package.json - qrcode@^1.5.4, @types/qrcode@^1.5.6 이미 설치 확인
- packages/daemon/src/services/wc-session-service.ts - Phase 146 산출물 (기존 코드 구조)
- packages/daemon/src/services/wc-storage.ts - SqliteKeyValueStorage 구현
- packages/daemon/src/infrastructure/database/schema.ts - wc_sessions 테이블 스키마
- packages/daemon/src/infrastructure/database/migrate.ts - v16 마이그레이션 (wc_sessions, wc_store)
- packages/daemon/src/api/middleware/csp.ts - CSP `img-src 'self' data:` 확인
- packages/daemon/src/api/server.ts - createApp 라우트 등록 패턴
- packages/daemon/src/api/routes/wallets.ts - OpenAPIHono 라우트 구현 패턴
- packages/admin/src/pages/wallets.tsx - Admin UI 월렛 상세 페이지 구조
- packages/admin/src/components/modal.tsx - Modal 컴포넌트 API
- packages/cli/src/commands/wallet.ts - CLI 명령어 패턴
- packages/adapters/evm/src/evm-chain-map.ts - EVM chainId 매핑

### Secondary (MEDIUM confidence)
- [WalletConnect Docs - Wallet Usage](https://docs.walletconnect.com/api/sign/wallet-usage) - connect/pair/disconnect 흐름
- [WalletConnect Specs - Namespaces](https://specs.walletconnect.com/2.0/specs/clients/sign/namespaces) - CAIP-2 namespace 구조
- [qrcode npm](https://www.npmjs.com/package/qrcode) - toDataURL/toString API 문서
- [Solana CAIP-2 Namespaces](https://namespaces.chainagnostic.org/solana/caip2) - Solana genesis hash chain IDs
- [EIP155 CAIP-2 Namespaces](https://namespaces.chainagnostic.org/eip155/caip2) - EVM chain ID 형식

### Tertiary (LOW confidence)
- 없음

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 모든 패키지가 이미 프로젝트에 설치되어 있고, node_modules에서 타입을 직접 검증함
- Architecture: HIGH - 기존 코드베이스 패턴(라우트, 미들웨어, Admin UI, CLI)을 그대로 따름
- Pitfalls: HIGH - WC v2 공식 이슈 트래커와 타입 시그니처에서 검증됨
- CAIP-2 chain IDs: MEDIUM - 공식 Chain Agnostic 문서 기반이나, 기존 코드 테스트에서도 확인됨

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (WC v2 stable, qrcode stable - 30일 유효)
