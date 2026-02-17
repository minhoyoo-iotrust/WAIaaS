# Solana 개발 환경 및 도구 선정 문서 (TECH-02)

**작성일:** 2026-02-04
**버전:** 1.0
**상태:** 확정
**선행 문서:** 01-tech-stack-decision.md (TECH-01)

---

## 1. 개요

### 1.1 문서 목적

본 문서는 WAIaaS 프로젝트의 Solana 블록체인 개발 환경을 확정한다. Solana SDK 버전, 테스트넷 전략, RPC 프로바이더, 에이전트 통합 방식을 정의하여 Phase 2부터 일관된 개발 환경을 보장한다.

### 1.2 선택 배경

Solana가 AI 에이전트 지갑 서비스의 첫 번째 타겟 체인으로 선정된 이유:
1. **AI 에이전트 생태계 성숙도**: Solana Agent Kit, sendAI 프레임워크 등 활발한 개발
2. **거래 속도 및 비용**: 400ms 블록 타임, $0.00025 평균 거래 비용
3. **키 관리 통합**: Turnkey, Crossmint 등 주요 프로바이더의 Solana 우선 지원
4. **개발자 도구**: @solana/kit 3.x로 TypeScript 개발 경험 대폭 개선

---

## 2. Solana SDK

### 2.1 권장 SDK 구성

| SDK | 버전 | 용도 | 설치 명령 |
|-----|------|------|----------|
| @solana/kit | 3.0.x | 신규 개발 (권장) | `pnpm add @solana/kit` |
| @solana/web3.js | 1.98.x | 레거시 호환 (Anchor 연동) | `pnpm add @solana/web3.js@^1.98` |

### 2.2 @solana/kit 3.x (권장)

**이전 명칭:** @solana/web3.js 2.0 (Anza에서 @solana/kit으로 리브랜딩)

**주요 특징:**
- 트리 셰이킹 지원으로 번들 크기 30% 감소
- 암호화 연산 10배 성능 향상 (Web Crypto API 활용)
- 트랜잭션 확인 200ms 단축
- 제로 의존성 설계

**코드 예시:**
```typescript
// packages/solana/rpc/client.ts
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const HELIUS_WS_URL = `wss://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

export const rpc = createSolanaRpc(HELIUS_RPC_URL);
export const rpcSubscriptions = createSolanaRpcSubscriptions(HELIUS_WS_URL);

// 잔액 조회
async function getBalance(address: string) {
  const balance = await rpc.getBalance(address).send();
  return balance.value; // lamports
}

// 트랜잭션 전송
async function sendTransaction(signedTx: SignedTransaction) {
  const signature = await rpc.sendTransaction(signedTx).send();
  return signature;
}
```

### 2.3 @solana/web3.js 1.98.x (레거시 호환)

**사용 시점:**
- Anchor 프로그램 연동 (Anchor가 아직 @solana/kit 미지원)
- 기존 라이브러리 중 v2 미지원 패키지 사용 시

**코드 예시:**
```typescript
// packages/solana/legacy/anchor-client.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';

const connection = new Connection(process.env.SOLANA_RPC_URL!);
const provider = new AnchorProvider(connection, wallet, {});
const program = new Program(idl, programId, provider);
```

### 2.4 버전 공존 전략

**원칙:**
1. 신규 코드는 반드시 @solana/kit 사용
2. Anchor 연동 코드만 별도 모듈로 @solana/web3.js 1.x 사용
3. 동일 트랜잭션 컨텍스트에서 두 버전 혼용 금지

**package.json 버전 고정:**
```json
{
  "dependencies": {
    "@solana/kit": "^3.0.0",
    "@solana/web3.js": "1.98.x"
  }
}
```

**주의사항:**
- `Keypair` (v1) vs `CryptoKeyPair` (v2) 타입 호환 안됨
- `Transaction` (v1) vs `TransactionMessage` (v2) 직렬화 방식 다름
- 브릿지 함수 작성 시 명시적 변환 필요

---

## 3. 에이전트 통합

### 3.1 Solana Agent Kit v2

**개요:**
Solana Agent Kit v2는 AI 에이전트가 온체인 작업을 수행할 수 있도록 100개 이상의 사전 구축된 액션을 제공하는 플러그인 기반 프레임워크이다.

**버전:** 2.x (플러그인 시스템)
**설치:**
```bash
pnpm add solana-agent-kit
pnpm add @solana-agent-kit/plugin-token
pnpm add @solana-agent-kit/plugin-defi
```

### 3.2 플러그인 목록

| 플러그인 | 용도 | 포함 액션 |
|---------|------|----------|
| `@solana-agent-kit/plugin-token` | SPL 토큰 작업 | 전송, 민팅, 소각, ATA 관리 |
| `@solana-agent-kit/plugin-defi` | DeFi 통합 | Jupiter 스왑, Raydium LP |
| `@solana-agent-kit/plugin-nft` | NFT 작업 | 민팅, 전송, 메타데이터 |
| `@solana-agent-kit/plugin-staking` | 스테이킹 | 스테이크/언스테이크, 리워드 |

### 3.3 통합 패턴 예시

```typescript
// packages/core/agent/solana-agent.ts
import { SolanaAgentKit, createVercelAITools } from 'solana-agent-kit';
import TokenPlugin from '@solana-agent-kit/plugin-token';
import DefiPlugin from '@solana-agent-kit/plugin-defi';
import { TurnkeySigner } from '@packages/key-management';

export async function createAgentKit(walletId: string, signer: TurnkeySigner) {
  const agent = new SolanaAgentKit(
    signer.getPrivateKeyForWallet(walletId), // Turnkey에서 서명자 획득
    process.env.HELIUS_RPC_URL!,
    {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
    }
  );

  // 플러그인 등록
  agent.use(TokenPlugin);
  agent.use(DefiPlugin);

  return agent;
}

// Vercel AI SDK 도구로 변환
export async function getAgentTools(agent: SolanaAgentKit) {
  const tools = createVercelAITools(agent, agent.actions);
  return tools;
}
```

### 3.4 WAIaaS 통합 고려사항

**정책 연동:**
- Agent Kit 액션 실행 전 WAIaaS 정책 검증 레이어 삽입
- 화이트리스트 기반 액션 필터링
- 금액 한도 검사

**코드 예시:**
```typescript
// packages/core/agent/policy-wrapper.ts
import { SolanaAgentKit } from 'solana-agent-kit';
import { PolicyEngine } from '@packages/core/policy';

export class PolicyEnforcedAgent {
  constructor(
    private agent: SolanaAgentKit,
    private policyEngine: PolicyEngine
  ) {}

  async executeAction(actionName: string, params: unknown) {
    // 1. 정책 검증
    const allowed = await this.policyEngine.validateAction(actionName, params);
    if (!allowed.permitted) {
      throw new PolicyViolationError(allowed.reason);
    }

    // 2. 액션 실행
    const result = await this.agent.execute(actionName, params);

    // 3. 감사 로그
    await this.policyEngine.logAction(actionName, params, result);

    return result;
  }
}
```

---

## 4. 테스트넷 전략

### 4.1 환경별 네트워크

| 환경 | 네트워크 | 용도 | RPC Endpoint |
|------|---------|------|-------------|
| 로컬 개발 | localhost | 단위 테스트, 빠른 반복 | `http://127.0.0.1:8899` |
| 개발 | Devnet | 통합 테스트, 기능 검증 | `https://api.devnet.solana.com` |
| 스테이징 | Testnet | 성능 테스트 (선택적) | `https://api.testnet.solana.com` |
| 프로덕션 | Mainnet-beta | 실제 서비스 | `https://api.mainnet-beta.solana.com` |

### 4.2 환경별 특성 및 제약사항

**로컬 (solana-test-validator):**
- 장점: 무료, 무제한 SOL, 즉시 확인
- 제약: 프로그램 직접 배포 필요, 외부 프로그램 미포함
- 사용 시점: 단위 테스트, TDD 사이클

**Devnet:**
- 장점: 실제 네트워크 환경, 에어드랍으로 무료 SOL
- 제약: 속도 제한 있음, 가끔 불안정
- 사용 시점: 통합 테스트, PR 검증, 데모

**Testnet:**
- 장점: Mainnet과 유사한 성능 특성
- 제약: 검증자 참여 적음, 불안정할 수 있음
- 사용 시점: 부하 테스트, 성능 벤치마크 (선택적)

**Mainnet-beta:**
- 장점: 실제 서비스 환경
- 제약: 실제 SOL 필요, 거래 비용 발생
- 사용 시점: 프로덕션 배포

### 4.3 환경 변수 설정

```bash
# .env.development
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com

# .env.staging (선택적)
SOLANA_NETWORK=testnet
SOLANA_RPC_URL=https://api.testnet.solana.com

# .env.production
SOLANA_NETWORK=mainnet-beta
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}
```

### 4.4 네트워크 전환 유틸리티

```typescript
// packages/solana/config/network.ts
import { clusterApiUrl } from '@solana/kit';

type Network = 'devnet' | 'testnet' | 'mainnet-beta' | 'localhost';

export function getRpcUrl(network: Network): string {
  if (network === 'localhost') {
    return 'http://127.0.0.1:8899';
  }

  if (network === 'mainnet-beta' && process.env.HELIUS_API_KEY) {
    return `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  }

  return clusterApiUrl(network);
}

export function getCurrentNetwork(): Network {
  return (process.env.SOLANA_NETWORK as Network) || 'devnet';
}
```

---

## 5. RPC 프로바이더

### 5.1 권장 프로바이더: Helius

**선택 이유:**
1. **DAS API 지원**: 디지털 자산(NFT, 압축 NFT) 조회 API 내장
2. **성능**: 낮은 지연시간, 높은 가동률
3. **가격 대비 성능**: 무료 티어에서 100,000 크레딧/월 제공
4. **Solana 전문**: Solana 전용 프로바이더로 최적화됨

### 5.2 요금제 비교

| 플랜 | 월 비용 | 크레딧/월 | RPS | 용도 |
|------|--------|----------|-----|------|
| Free | $0 | 100,000 | 10 | 개발/테스트 |
| Developer | $49 | 1,000,000 | 50 | 초기 프로덕션 |
| Business | $199 | 5,000,000 | 200 | 중규모 서비스 |
| Enterprise | 협의 | 무제한 | 무제한 | 대규모 서비스 |

**RPC 호출당 크레딧:**
- 기본 RPC (getBalance 등): 1 크레딧
- DAS API (getAssetsByOwner 등): 10 크레딧
- Enhanced API (parseTransactions 등): 5 크레딧

### 5.3 대안 프로바이더

| 프로바이더 | 장점 | 단점 | 권장 시나리오 |
|-----------|------|------|-------------|
| QuickNode | 멀티체인 지원 | DAS API 별도 | 멀티체인 서비스 |
| Triton | 지리적 분산 | 문서 부족 | 글로벌 서비스 |
| 공식 RPC | 무료 | 속도 제한 엄격 | 개발 전용 |
| Alchemy | 안정적 | Solana 기능 제한적 | EVM 우선 서비스 |

### 5.4 Helius 설정 가이드

**1. 계정 생성:**
- https://dashboard.helius.dev 접속
- GitHub 또는 이메일로 가입

**2. API 키 발급:**
- Dashboard > API Keys > Create New Key
- 키 이름 설정 (예: waiaas-dev)
- 네트워크 선택 (Devnet 또는 Mainnet)

**3. 환경 변수 설정:**
```bash
HELIUS_API_KEY=your-api-key-here
```

**4. RPC URL 구성:**
```
# Devnet
https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}

# Mainnet
https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}

# WebSocket
wss://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}
```

### 5.5 RPC 클라이언트 구현

```typescript
// packages/solana/rpc/helius-client.ts
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';

export function createHeliusClient(network: 'devnet' | 'mainnet-beta') {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    throw new Error('HELIUS_API_KEY environment variable is required');
  }

  const subdomain = network === 'devnet' ? 'devnet' : 'mainnet';
  const httpUrl = `https://${subdomain}.helius-rpc.com/?api-key=${apiKey}`;
  const wsUrl = `wss://${subdomain}.helius-rpc.com/?api-key=${apiKey}`;

  return {
    rpc: createSolanaRpc(httpUrl),
    subscriptions: createSolanaRpcSubscriptions(wsUrl),
  };
}

// DAS API (NFT/압축 NFT 조회)
export async function getAssetsByOwner(ownerAddress: string) {
  const apiKey = process.env.HELIUS_API_KEY;
  const response = await fetch(
    `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'waiaas',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress,
          page: 1,
          limit: 100,
        },
      }),
    }
  );
  return response.json();
}
```

---

## 6. 로컬 개발 환경

### 6.1 solana-test-validator

**용도:** 로컬 Solana 노드 실행, 단위 테스트, 빠른 개발 반복

**설치 (Solana CLI):**
```bash
# macOS
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# 또는 brew
brew install solana
```

**실행:**
```bash
# 기본 실행
solana-test-validator

# 특정 프로그램과 함께 실행
solana-test-validator \
  --bpf-program <PROGRAM_ID> <PROGRAM.so> \
  --reset
```

**주요 옵션:**
| 옵션 | 설명 |
|------|------|
| `--reset` | 기존 장부 삭제 후 새로 시작 |
| `--bpf-program` | 로컬 프로그램 배포 |
| `--clone` | Mainnet 계정 복제 |
| `--url devnet` | Devnet 계정 복제 |

### 6.2 로컬 테스트 설정

```typescript
// packages/solana/test/setup.ts
import { spawn, ChildProcess } from 'child_process';

let validator: ChildProcess | null = null;

export async function startLocalValidator(): Promise<void> {
  return new Promise((resolve, reject) => {
    validator = spawn('solana-test-validator', ['--reset'], {
      stdio: 'pipe',
    });

    validator.stdout?.on('data', (data) => {
      if (data.toString().includes('Ledger location')) {
        // 검증자 준비 완료
        setTimeout(resolve, 1000); // 안정화 대기
      }
    });

    validator.on('error', reject);
  });
}

export function stopLocalValidator(): void {
  if (validator) {
    validator.kill();
    validator = null;
  }
}

// Vitest global setup
beforeAll(async () => {
  await startLocalValidator();
});

afterAll(() => {
  stopLocalValidator();
});
```

### 6.3 Anchor 테스트 환경 (선택적)

**용도:** 커스텀 온체인 프로그램 개발 시 (Phase 4 이후)

**설치:**
```bash
# Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked

# 또는 avm (Anchor Version Manager)
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install latest
avm use latest
```

**Anchor 프로젝트 테스트:**
```bash
# anchor.toml이 있는 디렉토리에서
anchor test
```

**주의:** WAIaaS Phase 1-3에서는 Anchor 불필요. 기존 프로그램(Jupiter, Raydium 등)만 호출하므로 Agent Kit 플러그인으로 충분.

---

## 7. 개발 워크플로우

### 7.1 권장 테스트 순서

```
1. 단위 테스트 (solana-test-validator)
   └── 빠른 반복, 모킹 최소화

2. 통합 테스트 (Devnet)
   └── 실제 네트워크 동작 검증

3. E2E 테스트 (Devnet)
   └── 전체 플로우 검증

4. 스테이징 배포 (Testnet 또는 Devnet)
   └── 성능/부하 테스트

5. 프로덕션 배포 (Mainnet-beta)
   └── 실제 서비스
```

### 7.2 CI/CD 파이프라인

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Solana CLI
        run: |
          sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
          echo "$HOME/.local/share/solana/install/active_release/bin" >> $GITHUB_PATH

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Run tests
        run: pnpm test
        env:
          SOLANA_NETWORK: localhost
```

---

## 8. 보안 고려사항

### 8.1 RPC API 키 관리

- API 키를 코드에 하드코딩 금지
- 환경 변수 또는 시크릿 매니저 사용
- 프로덕션 키와 개발 키 분리
- 키 로테이션 정책 수립 (90일 권장)

### 8.2 네트워크 격리

- 프로덕션 환경에서 Devnet/Testnet 접근 차단
- 환경별 별도 API 키 사용
- 실수로 Mainnet에 테스트 트랜잭션 전송 방지

### 8.3 트랜잭션 검증

- 서명 전 시뮬레이션 필수 (`simulateTransaction`)
- 예상 SOL 비용 확인
- 정책 엔진 통과 후에만 서명

---

## 9. 다음 단계

본 문서의 Solana 개발 환경을 기반으로:

1. **Phase 2**: Helius 계정 생성, API 키 발급, RPC 클라이언트 구현
2. **Phase 3**: @solana/kit 기반 지갑 잔액 조회, 토큰 전송 구현
3. **Phase 4**: Solana Agent Kit 플러그인 통합, 정책 래퍼 구현
4. **Phase 5**: MCP 서버에서 Solana 도구 노출

---

## 부록: 참고 자료

### 공식 문서

- [@solana/kit npm](https://www.npmjs.com/package/@solana/kit)
- [Solana Cookbook](https://solanacookbook.com/)
- [Helius Documentation](https://docs.helius.dev/)
- [Solana Agent Kit v2](https://docs.sendai.fun/docs/v2/introduction)
- [Anchor Book](https://book.anchor-lang.com/)

### 버전 히스토리

| 항목 | 현재 버전 | 확인일 | 비고 |
|------|----------|--------|------|
| @solana/kit | 3.0.x | 2026-02-04 | web3.js 2.0 후속 |
| @solana/web3.js | 1.98.x | 2026-02-04 | 레거시 호환용 |
| Solana Agent Kit | 2.x | 2026-02-04 | 플러그인 시스템 |
| Solana CLI | 2.x | 2026-02-04 | 로컬 검증자 포함 |

*Solana 생태계 변화가 빠르므로 30일마다 버전 검토 권장*
