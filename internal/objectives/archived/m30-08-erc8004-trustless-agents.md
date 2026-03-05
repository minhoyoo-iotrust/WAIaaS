# 마일스톤 m30-08: ERC-8004 Trustless Agents 지원

- **Status:** SHIPPED
- **Milestone:** v30.8
- **Completed:** 2026-03-04

## 목표

ERC-8004 (Trustless Agents) 표준의 3개 온체인 레지스트리(Identity, Reputation, Validation)를 WAIaaS에 통합하여, WAIaaS 관리 지갑이 ERC-8004 에이전트 생태계에서 신뢰 가능한 참여자로 동작할 수 있는 상태.

---

## 배경

### ERC-8004 개요

ERC-8004은 2026년 1월 이더리움 메인넷에 레퍼런스 구현이 배포된 Draft 표준으로, AI 에이전트 간 사전 신뢰 없이 발견·상호작용·평가할 수 있는 최소 신뢰 레이어를 정의한다. (EIP 상태: Draft — 컨트랙트는 메인넷에 배포되었으나 EIP 프로세스상 Final이 아님) MetaMask(Marco De Rossi), Ethereum Foundation(Davide Crapis), Google(Jordan Ellis), Coinbase(Erik Reppel) 공동 저작.

3개 레지스트리로 구성:

| 레지스트리 | 역할 | 컨트랙트 기반 |
|---|---|---|
| **Identity Registry** | ERC-721 기반 에이전트 ID, agentWallet 연결, 등록 파일(서비스 endpoint) | ERC-721 + URIStorage |
| **Reputation Registry** | 에이전트에 대한 피드백/평판 점수 게시·조회 | 커스텀 |
| **Validation Registry** | 독립적 검증 요청/응답 (zkML, TEE, 재실행 등) | 커스텀 |

에이전트 식별자 형식: `{namespace}:{chainId}:{identityRegistry}:{agentId}` (예: `eip155:1:0xAbC...Def:42`)

### WAIaaS와의 정합성

ERC-8004의 핵심 설계 — 에이전트 ID(NFT 소유)와 에이전트 지갑(연결된 주소)의 분리 — 는 WAIaaS의 "사용은 하되 소유는 못한다" 원칙과 정확히 일치한다.

| ERC-8004 개념 | WAIaaS 대응 | 매핑 |
|---|---|---|
| NFT 보유자 (에이전트 관리자) | Owner (사람) | NFT = 에이전트 신분증, Owner가 보유 |
| agentWallet (운영 지갑) | WAIaaS 관리 지갑 | 에이전트가 트랜잭션 실행에 사용 |
| `setAgentWallet` 지갑 소유자 서명 | SIWE Owner 승인 | EIP-712 서명 → SIWE 승인 플로우 |
| 등록 파일 서비스 endpoint | MCP/REST API endpoint | connect-info의 capabilities 확장 |
| Reputation 점수 | 정책 엔진 입력 | 저평판 → APPROVAL 티어 강제 |
| Validation 요청 | 고액 트랜잭션 보안 티어 | DELAY/APPROVAL 티어 연동 |
| 위험 비례 신뢰 모델 | 4-tier 보안 모델 | reputation→low risk, crypto-economic→high risk |

### 기술적 기반

WAIaaS는 ERC-8004 통합에 필요한 인프라를 모두 갖추고 있다:

- **viem 2.x**: EVM 컨트랙트 호출 (`buildContractCall({ from, to, calldata, abi, value })`)
- **IActionProvider**: 액션 → ContractCallRequest 변환 프레임워크 (v1.5)
- **6-stage pipeline**: 정책 평가 → 서명 → 제출 → 확인
- **Owner 승인 (SIWE)**: EIP-4361 메시지 + EIP-191 서명 검증
- **ApprovalWorkflow**: APPROVAL 티어 대기 → 승인/만료 상태 머신
- **CONTRACT_CALL**: 임의 컨트랙트 호출 트랜잭션 타입 (v1.4.7)
- **provider-trust**: ActionProvider의 CONTRACT_WHITELIST 자동 바이패스 (v28.2)

---

## 범위

### 포함

1. **Identity Registry 연동** → ERC8004-02
2. **Reputation Registry 연동 + 정책 엔진 확장** → ERC8004-03
3. **Validation Registry 연동** → ERC8004-04
4. **REST API / MCP / SDK 확장** → ERC8004-05
5. **Admin UI 에이전트 ID 관리** → ERC8004-06
6. **DB 스키마 확장** → ERC8004-07
7. **Skill 파일 생성/업데이트** → ERC8004-09
8. **NotificationEventType 확장** → ERC8004-10

### 제외

- ERC-8004 레지스트리 컨트랙트 자체 배포 (기존 메인넷 배포본 사용)
- Validator 노드 운영 (검증 요청자로만 참여)
- Solana 체인 대응 (EVM 전용 표준)
- 에이전트 간 자동 발견/협상 프로토콜 (등록 파일 기반 수동 발견만)

---

## 선행 조건

- m28-00 DeFi 프로토콜 설계 완료 (SHIPPED)
- EVM CONTRACT_CALL 파이프라인 안정화 (v1.4.7 구현 완료)
- Owner 승인 플로우 (SIWE) 안정화 (v1.4.1 구현 완료)
- provider-trust CONTRACT_WHITELIST 바이패스 (v28.2 구현 완료)

## 리서치 필수 사항

> **이 마일스톤은 구현 전 리서치 페이즈가 필수이다.** ERC-8004는 외부 표준이며, 문서 작성 시점의 ABI/스펙이 실제 온체인 배포본과 일치하는지 검증되지 않았다.

1. **ERC-8004 EIP 상태 검증** — EIP가 Final/Draft/Review 중 어느 상태인지, 실제 메인넷에 배포되었는지 확인
2. **온체인 컨트랙트 ABI 검증** — Identity/Reputation/Validation Registry의 실제 배포 주소와 ABI가 본 문서의 기술과 일치하는지 Etherscan/소스코드 대조
3. **에이전트 식별자 형식** — `{namespace}:{chainId}:{identityRegistry}:{agentId}` 형식이 최종 스펙과 일치하는지 확인
4. **EIP-712 Typed Data** — `setAgentWallet`의 서명 스키마(domain separator, typehash)가 배포된 컨트랙트와 일치하는지 확인
5. **등록 파일 스키마** — Registration File JSON 형식이 공식 스펙/참조 구현과 일치하는지 확인
6. **생태계 현황** — 실제 등록된 에이전트 수, 활성 검증자, SDK/라이브러리 존재 여부 파악

리서치 결과에 따라 본 문서의 ABI, 스키마, 플로우가 수정될 수 있다.

---

## 설계 대상

### 1. ERC8004-01: packages/actions/ 확장 (ActionProvider 구조)

ERC-8004 3개 레지스트리 연동을 위한 ActionProvider를 packages/actions/에 추가한다. 기존 JupiterSwapActionProvider 패턴을 그대로 따른다.

> **요구사항:** PKG-01, PKG-02, PKG-03, PKG-04

#### 1.1 PKG-01: 디렉토리 구조

```
packages/actions/src/providers/erc8004/
  index.ts                  # Erc8004ActionProvider : IActionProvider
  erc8004-registry-client.ts  # viem 기반 3개 레지스트리 온체인 클라이언트
  identity-abi.ts           # Identity Registry ABI 상수
  reputation-abi.ts         # Reputation Registry ABI 상수
  validation-abi.ts         # Validation Registry ABI 상수
  registration-file.ts      # 등록 파일(JSON) 생성 유틸리티
  schemas.ts                # Zod 입력/출력 스키마
  config.ts                 # Erc8004Config 타입 + 기본값
  constants.ts              # 메인넷/테스트넷 컨트랙트 주소
```

**확인된 메인넷 컨트랙트 주소:**

| 레지스트리 | 주소 | 출처 |
|---|---|---|
| Identity Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | [erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts) |
| Reputation Registry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | [erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts) |
| Validation Registry | **리서치 페이즈에서 확인 필요** | — |

> **주의:** 위 주소는 리서치 페이즈에서 Etherscan 소스코드 대조를 통해 ABI 일치 여부를 반드시 검증해야 한다.

#### 1.2 PKG-02: ActionProvider 메타데이터

```typescript
export const ERC8004_METADATA: ActionProviderMetadata = {
  name: 'erc8004_agent',
  description: 'ERC-8004 Trustless Agents — identity registration, reputation management, and on-chain validation',
  version: '1.0.0',
  chains: ['evm'],
  mcpExpose: true,
  requiresApiKey: false,
  requiredApis: [],
};
```

#### 1.3 PKG-03: 액션 정의

| 이름 | 설명 | riskLevel | defaultTier | 읽기전용 | 레지스트리 |
|------|------|-----------|-------------|----------|-----------|
| `register_agent` | 에이전트 ID 등록 (NFT 민팅) | high | APPROVAL | X | Identity |
| `set_agent_wallet` | agentWallet 연결 (Owner 서명 필요) | high | APPROVAL | X | Identity |
| `unset_agent_wallet` | agentWallet 해제 | high | APPROVAL | X | Identity |
| `set_agent_uri` | 에이전트 등록 파일 URI 변경 | medium | DELAY | X | Identity |
| `set_metadata` | 에이전트 메타데이터 설정 | low | NOTIFY | X | Identity |
| `give_feedback` | 상대 에이전트에 대한 피드백 게시 | low | NOTIFY | X | Reputation |
| `revoke_feedback` | 게시한 피드백 철회 | low | INSTANT | X | Reputation |
| `request_validation` | 에이전트에 대한 온체인 검증 요청 | medium | DELAY | X | Validation |

**범위 밖 액션 (의도적 제외):**

| 이름 | 제외 사유 |
|------|----------|
| `append_response` (Reputation) | `appendResponse`는 피드백을 **받은** 에이전트가 응답하는 함수. WAIaaS 에이전트가 외부에서 받은 피드백에 응답하려면 별도 UI/UX 설계가 필요하며, 핵심 플로우(등록/평판/검증)와 독립적이므로 후속 마일스톤으로 분리. |

**읽기 전용 조회 (resolve 불필요, 별도 라우트로 제공):**

| 이름 | 설명 | 레지스트리 |
|------|------|-----------|
| `get_agent_info` | agentId → 에이전트 정보 + 메타데이터 조회 | Identity |
| `get_reputation` | agentId → 평판 점수 요약 조회 | Reputation |
| `get_validation_status` | requestHash → 검증 상태 조회 | Validation |

**설계 결정 — 읽기 전용 액션 처리:**
읽기 전용 조회는 ContractCallRequest를 생성하지 않으므로 resolve() 패턴에 맞지 않는다. viem `readContract()`를 직접 호출하여 결과를 반환하는 별도 REST 라우트(`/v1/erc8004/...`)로 제공한다. MCP에서는 동일 이름의 read-only 툴로 노출한다.

**설계 결정 — agentId 타입 변환:**
온체인 agentId는 `uint256` (bigint)이지만, REST API/MCP/SDK에서는 `string`으로 주고받는다. 변환 전략:
- **입력**: Zod 스키마에서 `z.string().min(1)` → resolve() 내부에서 `BigInt(params.agentId)` 변환. 유효하지 않은 문자열은 BigInt 변환 시 예외 → `INVALID_INPUT` 에러 반환.
- **출력**: 온체인 조회 결과의 `uint256`은 `.toString()`으로 변환하여 JSON 응답에 포함.
- **DB 저장**: `agent_identities.chain_agent_id`는 `TEXT` 타입으로 저장 (SQLite에 bigint 네이티브 지원 없음).

#### 1.4 PKG-04: registerBuiltInProviders 등록

```typescript
// packages/actions/src/index.ts providers 배열에 추가
{
  key: 'erc8004_agent',
  enabledKey: 'actions.erc8004_agent_enabled',
  factory: () => {
    const config: Erc8004Config = {
      enabled: true,
      identityRegistryAddress: settingsReader.get('actions.erc8004_identity_registry_address'),
      reputationRegistryAddress: settingsReader.get('actions.erc8004_reputation_registry_address'),
      validationRegistryAddress: settingsReader.get('actions.erc8004_validation_registry_address'),
      registrationFileBaseUrl: settingsReader.get('actions.erc8004_registration_file_base_url'),
      autoPublishRegistration: settingsReader.get('actions.erc8004_auto_publish_registration') === 'true',
      reputationCacheTtlSec: Number(settingsReader.get('actions.erc8004_reputation_cache_ttl_sec')),
    };
    return new Erc8004ActionProvider(config);
  },
},
```

#### 1.5 PKG-05: Admin Settings 키

| 설정 키 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `actions.erc8004_agent_enabled` | boolean | `false` | 프로바이더 활성화 |
| `actions.erc8004_identity_registry_address` | string | 메인넷 주소 | Identity Registry 컨트랙트 |
| `actions.erc8004_reputation_registry_address` | string | 메인넷 주소 | Reputation Registry 컨트랙트 |
| `actions.erc8004_validation_registry_address` | string | 메인넷 주소 | Validation Registry 컨트랙트 |
| `actions.erc8004_registration_file_base_url` | string | `""` | 등록 파일 호스팅 base URL |
| `actions.erc8004_auto_publish_registration` | boolean | `true` | 등록 파일 자동 생성/게시 |
| `actions.erc8004_reputation_cache_ttl_sec` | number | `300` | 평판 점수 캐시 TTL (초) |
| `actions.erc8004_min_reputation_score` | number | `0` | 최소 평판 점수 (정책 연동 기본값) |
| `actions.erc8004_reputation_rpc_timeout_ms` | number | `3000` | 평판 조회 RPC 타임아웃 (ms) |

---

### 2. ERC8004-02: Identity Registry 연동 설계

에이전트 등록, 지갑 연결, 등록 파일 관리를 위한 Identity Registry 온체인 연동.

> **요구사항:** IDEN-01, IDEN-02, IDEN-03, IDEN-04

#### 2.1 IDEN-01: Identity Registry ABI

ERC-8004 Identity Registry 핵심 함수:

```solidity
// 에이전트 등록 (NFT 민팅)
function register(string calldata agentURI) external returns (uint256 agentId);

function register(
  string calldata agentURI,
  MetadataEntry[] calldata metadata
) external returns (uint256 agentId);
// MetadataEntry = { string key, bytes value }

// 지갑 연결/해제
function setAgentWallet(
  uint256 agentId,
  address newWallet,
  uint256 deadline,
  bytes calldata signature    // newWallet 소유자의 EIP-712 서명
) external;

function unsetAgentWallet(uint256 agentId) external;

function getAgentWallet(uint256 agentId) external view returns (address);

// URI/메타데이터
function setAgentURI(uint256 agentId, string calldata newURI) external;

function getMetadata(uint256 agentId, string memory metadataKey)
  external view returns (bytes memory);

function setMetadata(
  uint256 agentId,
  string memory metadataKey,
  bytes memory metadataValue
) external;
```

**이벤트:**

```solidity
event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
event MetadataSet(uint256 indexed agentId, string indexed metadataKey, bytes metadataValue);
```

#### 2.2 IDEN-02: viem 클라이언트 패턴

```typescript
// erc8004-registry-client.ts
import { getContract, type PublicClient, type WalletClient } from 'viem';
import { IDENTITY_REGISTRY_ABI } from './identity-abi.js';

export class Erc8004RegistryClient {
  private readonly identity;
  private readonly reputation;
  private readonly validation;

  constructor(
    private readonly publicClient: PublicClient,
    config: Erc8004Config,
  ) {
    this.identity = getContract({
      address: config.identityRegistryAddress as `0x${string}`,
      abi: IDENTITY_REGISTRY_ABI,
      client: publicClient,
    });
    // reputation, validation 동일 패턴
  }

  // 읽기 전용 — viem readContract 직접 호출
  async getAgentWallet(agentId: bigint): Promise<string> {
    return this.identity.read.getAgentWallet([agentId]);
  }

  async getAgentMetadata(agentId: bigint, key: string): Promise<string> {
    return this.identity.read.getMetadata([agentId, key]);
  }

  // 쓰기 — calldata 인코딩만 (서명/제출은 파이프라인이 담당)
  encodeRegister(agentURI: string): `0x${string}` {
    return encodeFunctionData({
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [agentURI],
    });
  }

  encodeSetAgentWallet(
    agentId: bigint,
    newWallet: `0x${string}`,
    deadline: bigint,
    signature: `0x${string}`,
  ): `0x${string}` {
    return encodeFunctionData({
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'setAgentWallet',
      args: [agentId, newWallet, deadline, signature],
    });
  }
}
```

#### 2.3 IDEN-03: register_agent resolve() 플로우

```
resolve('register_agent', params, context)
  1. RegisterAgentInputSchema.parse(params)
     - name: string (필수)
     - description: string (선택)
     - services: ServiceEntry[] (선택)
  2. 등록 파일 JSON 생성 (registration-file.ts)
     - WAIaaS MCP/REST endpoint 자동 포함
     - x402Support 설정 반영
  3. 등록 파일 호스팅 URL 결정
     - config.registrationFileBaseUrl + walletId 기반
  4. encodeFunctionData('register', [agentURI, metadata[]])
  5. ContractCallRequest 반환:
     {
       type: 'CONTRACT_CALL',
       to: config.identityRegistryAddress,
       calldata: encodedData,
     }
  6. → 파이프라인 Stage 1~6 (APPROVAL 티어 → Owner 승인 필요)
```

**Zod 입력 스키마:**

```typescript
const RegisterAgentInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  services: z.array(z.object({
    name: z.string().min(1),
    endpoint: z.string().url(),
    version: z.string().optional(),
  })).optional(),
  metadata: z.record(z.string()).optional(),
});
```

#### 2.4 IDEN-04: setAgentWallet Owner 서명 시퀀스

`setAgentWallet`은 연결할 지갑(newWallet)의 소유자 서명이 필요하다. WAIaaS에서 이 서명은 Owner가 제공한다.

```
시퀀스:

  AI 에이전트                    WAIaaS 데몬                    Owner (사람)
      |                              |                              |
      |-- POST /v1/actions/          |                              |
      |   erc8004/set_agent_wallet   |                              |
      |   { agentId, deadline }      |                              |
      |                              |                              |
      |                   Stage 1: DB INSERT (PENDING)              |
      |                   Stage 2: sessionAuth 검증                 |
      |                   Stage 3: APPROVAL 티어 (high risk)        |
      |                              |                              |
      |                   Stage 4: pending_approvals 생성           |
      |                              |-- 승인 요청 알림 ------------>|
      |                              |                              |
      |                              |<--- EIP-712 서명 제출 -------|
      |                              |     (agentId, wallet, deadline)
      |                              |                              |
      |                   서명 → setAgentWallet calldata에 포함     |
      |                   Stage 5: buildContractCall + submit       |
      |                   Stage 6: 트랜잭션 확인                    |
      |                              |                              |
      |<-- { id, status: CONFIRMED } |                              |
```

**EIP-712 Typed Data (ERC-8004 스펙):**

```typescript
const SET_AGENT_WALLET_TYPEHASH = {
  SetAgentWallet: [
    { name: 'agentId', type: 'uint256' },
    { name: 'newWallet', type: 'address' },
    { name: 'deadline', type: 'uint256' },
  ],
};
```

**설계 결정 — Owner 서명 수집 방식:**

기존 ApprovalWorkflow의 SIWE 서명과 ERC-8004의 EIP-712 서명은 다른 형식이다. 선택지:

| 옵션 | 설명 | 장단점 |
|------|------|--------|
| **A) 기존 ApprovalWorkflow 확장** | approve() 시 EIP-712 typed data를 함께 서명하도록 확장 | 기존 알림 채널(Ntfy/Telegram/WalletConnect) 재사용 가능, 단 approval payload 포맷 변경 필요 |
| **B) 별도 서명 채널 추가** | ERC-8004 전용 서명 요청 endpoint | 깔끔한 분리, 단 새 UI 필요 |
| **C) Admin UI에서 직접 서명** | Admin UI에서 WalletConnect로 EIP-712 서명 수집 후 트랜잭션에 포함 | 가장 단순, Admin-only 플로우 |

**권장: 옵션 A** — 기존 ApprovalWorkflow를 확장하여 approval 타입에 따라 SIWE 또는 EIP-712 서명을 요구하도록 한다. pending_approvals 테이블의 `approval_type` 컬럼 추가.

**채널 제약:** EIP-712 typed data 서명은 **WalletConnect 채널 또는 Admin UI 직접 서명만 지원**한다. Ntfy/Telegram은 텍스트 기반 알림 채널이므로 EIP-712 서명 payload를 전달·수집할 수 없다. `approval_type = 'EIP712'`인 승인 건은 알림만 발송하고, 실제 서명 제출은 WalletConnect 또는 Admin UI(`/erc8004` 페이지)에서만 수행한다.

#### 2.5 IDEN-05: 등록 파일 (Registration File)

ERC-8004 등록 파일은 에이전트의 서비스 endpoint를 선언하는 JSON이다. WAIaaS는 이를 자동 생성하여 호스팅한다.

**등록 파일 템플릿:**

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "{wallet.name}",
  "description": "WAIaaS-managed AI agent wallet",
  "services": [
    {
      "name": "mcp",
      "endpoint": "{daemon_base_url}/mcp",
      "version": "1.0.0"
    },
    {
      "name": "rest-api",
      "endpoint": "{daemon_base_url}/v1",
      "version": "1.0.0"
    }
  ],
  "x402Support": true,
  "active": true,
  "registrations": [
    {
      "agentId": "{on_chain_agent_id}",
      "agentRegistry": "eip155:{chainId}:{identityRegistryAddress}"
    }
  ],
  "supportedTrust": ["reputation"]
}
```

**호스팅 전략:**

| 옵션 | 설명 | 장단점 |
|------|------|--------|
| **A) 데몬 endpoint** | `GET /v1/erc8004/registration-file/:walletId` (public, no auth) | 가장 단순, 데몬이 온라인이어야 함 |
| **B) IPFS** | ipfs:// URI, 불변성 보장 | 데몬 오프라인에서도 접근 가능, 업데이트 시 새 CID 필요 |
| **C) 외부 URL** | Admin이 직접 설정 | 유연하지만 수동 관리 |

**권장: 옵션 A (기본) + C (override)**
기본적으로 데몬 endpoint에서 제공하고, `registration_file_base_url` 설정으로 외부 URL override 가능.

**connect-info 연동:**
등록 파일의 endpoint가 connect-info의 baseUrl과 일치하도록 자동 동기화. `buildConnectInfoPrompt()`에 ERC-8004 에이전트 ID 정보를 포함한다.

구체적 확장:
- `ConnectInfoResponse`에 `erc8004` 필드 추가:
  ```typescript
  erc8004?: {
    agentId: string;              // 온체인 agentId (string)
    identityRegistry: string;     // Identity Registry 주소
    chainId: number;              // EVM chain ID
    registrationFileUrl: string;  // 등록 파일 URL
    status: 'PENDING' | 'REGISTERED' | 'WALLET_LINKED' | 'DEREGISTERED';
  };
  ```
- `buildConnectInfoPrompt()`가 ERC-8004 등록 정보를 포함하여 AI 에이전트에게 자신의 온체인 ID를 알려줌
- 지갑이 ERC-8004에 등록되지 않은 경우 `erc8004` 필드 생략 (optional)

---

### 3. ERC8004-03: Reputation Registry 연동 + 정책 엔진 확장

에이전트 평판 조회, 피드백 게시, 평판 기반 정책 평가를 위한 Reputation Registry 연동.

> **요구사항:** REPU-01, REPU-02, REPU-03, REPU-04, REPU-05

#### 3.1 REPU-01: Reputation Registry ABI

```solidity
// 피드백 게시
function giveFeedback(
  uint256 agentId,
  int128 value,              // 피드백 점수 (고정소수점)
  uint8 valueDecimals,       // 소수점 자릿수 (0-18)
  string calldata tag1,      // 카테고리 태그 1 (예: "swap")
  string calldata tag2,      // 카테고리 태그 2 (예: "speed")
  string calldata endpoint,  // 평가 대상 서비스 URI
  string calldata feedbackURI,  // 상세 피드백 파일 링크
  bytes32 feedbackHash       // 피드백 파일 KECCAK-256 해시
) external;

// 피드백 철회
function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external;

// 에이전트가 피드백에 응답
function appendResponse(
  uint256 agentId,
  address clientAddress,
  uint64 feedbackIndex,
  string calldata responseURI,
  bytes32 responseHash
) external;

// 평판 요약 조회 (읽기 전용)
function getSummary(
  uint256 agentId,
  address[] calldata clientAddresses,  // 빈 배열 = 전체
  string calldata tag1,
  string calldata tag2
) external view returns (
  uint64 count,
  int128 summaryValue,
  uint8 summaryValueDecimals
);

// 개별 피드백 조회 (읽기 전용)
function readFeedback(
  uint256 agentId,
  address clientAddress,
  uint64 feedbackIndex
) external view returns (
  int128 value,
  uint8 valueDecimals,
  string memory tag1,
  string memory tag2,
  bool isRevoked
);

// 전체 피드백 조회 (읽기 전용)
function readAllFeedback(
  uint256 agentId,
  address[] calldata clientAddresses,
  string calldata tag1,
  string calldata tag2,
  bool includeRevoked
) external view returns (
  address[] memory clients,
  uint64[] memory feedbackIndexes,
  int128[] memory values,
  uint8[] memory valueDecimals,
  string[] memory tag1s,
  string[] memory tag2s,
  bool[] memory revokedStatuses
);

// 클라이언트 목록 조회
function getClients(uint256 agentId) external view returns (address[] memory);

// 마지막 피드백 인덱스
function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64);
```

**이벤트:**

```solidity
event NewFeedback(
  uint256 indexed agentId,
  address indexed clientAddress,
  uint64 feedbackIndex,
  int128 value,
  uint8 valueDecimals,
  string indexed indexedTag1,
  string tag2,
  string endpoint,
  string feedbackURI,
  bytes32 feedbackHash
);

event FeedbackRevoked(
  uint256 indexed agentId,
  address indexed clientAddress,
  uint64 indexed feedbackIndex
);
```

#### 3.2 REPU-02: give_feedback resolve() 플로우

```
resolve('give_feedback', params, context)
  1. GiveFeedbackInputSchema.parse(params)
  2. 대상 에이전트 agentId 검증 (Identity Registry 조회)
  3. encodeFunctionData('giveFeedback', [agentId, value, ...])
  4. ContractCallRequest 반환 → NOTIFY 티어
```

**Zod 입력 스키마:**

```typescript
const GiveFeedbackInputSchema = z.object({
  agentId: z.string().min(1, 'target agentId is required'),
  value: z.number().int().min(-100).max(100),
  valueDecimals: z.number().int().min(0).max(8).default(0),
  tag1: z.string().max(32).optional().default(''),
  tag2: z.string().max(32).optional().default(''),
  endpoint: z.string().url().optional().default(''),
  feedbackURI: z.string().url().optional().default(''),
});

const RevokeFeedbackInputSchema = z.object({
  agentId: z.string().min(1),
  feedbackIndex: z.number().int().min(0),
});
```

**설계 결정 — 피드백 자동 게시:**
트랜잭션 완료 후 자동으로 피드백을 게시하는 것은 범위에서 제외한다. 에이전트가 `give_feedback` 액션을 명시적으로 호출해야 한다. 이유: (1) 피드백은 에이전트의 판단이 필요, (2) 자동 게시는 스팸 위험.

#### 3.3 REPU-03: REPUTATION_THRESHOLD 정책 타입

기존 17개 PolicyType에 18번째 타입을 추가한다.

**policy.ts 변경:**

```typescript
export const POLICY_TYPES = [
  'SPENDING_LIMIT',
  'WHITELIST',
  'TIME_RESTRICTION',
  'RATE_LIMIT',
  'ALLOWED_TOKENS',
  'CONTRACT_WHITELIST',
  'METHOD_WHITELIST',
  'APPROVED_SPENDERS',
  'APPROVE_AMOUNT_LIMIT',
  'APPROVE_TIER_OVERRIDE',
  'ALLOWED_NETWORKS',
  'X402_ALLOWED_DOMAINS',
  'LENDING_LTV_LIMIT',
  'LENDING_ASSET_WHITELIST',
  'PERP_MAX_LEVERAGE',
  'PERP_MAX_POSITION_USD',
  'PERP_ALLOWED_MARKETS',
  'REPUTATION_THRESHOLD',     // 신규 추가 (18번째)
] as const;
```

**규칙 스키마:**

```typescript
const ReputationThresholdRulesSchema = z.object({
  // 최소 평판 점수 (0-100 정규화). 이 점수 미만이면 below_threshold_tier 적용
  min_score: z.number().min(0).max(100),

  // 점수 미달 시 적용할 보안 티어
  below_threshold_tier: PolicyTierEnum.default('APPROVAL'),

  // 평판 미확인(새 에이전트) 시 적용할 보안 티어
  unrated_tier: PolicyTierEnum.default('APPROVAL'),

  // 평판 조회 시 필터링할 태그 (선택)
  tag1: z.string().max(32).optional(),
  tag2: z.string().max(32).optional(),

  // 상대방(to 주소) 에이전트의 평판도 확인할지 여부
  check_counterparty: z.boolean().default(false),
});
```

**POLICY_RULES_SCHEMAS 추가:**

```typescript
// policy.schema.ts POLICY_RULES_SCHEMAS에 추가
REPUTATION_THRESHOLD: ReputationThresholdRulesSchema,
```

#### 3.4 REPU-04: Stage 3 정책 평가 위치

REPUTATION_THRESHOLD는 Stage 3 정책 평가에서 다음 순서로 실행된다:

```
Stage 3 Policy 평가 순서:
  1. ALLOWED_NETWORKS        — 네트워크 허용 여부
  2. CONTRACT_WHITELIST      — 컨트랙트 허용 여부
  3. METHOD_WHITELIST        — 함수 셀렉터 허용 여부
  4. ALLOWED_TOKENS          — 토큰 허용 여부
  5. APPROVED_SPENDERS       — 승인 대상 허용 여부
  6. REPUTATION_THRESHOLD    — ★ 평판 점수 기반 티어 오버라이드
  7. SPENDING_LIMIT          — 지출 한도 + 티어 결정
  8. RATE_LIMIT              — 빈도 제한
  9. TIME_RESTRICTION        — 시간대 제한
  10. LENDING_LTV_LIMIT      — 대출 LTV 한도
  11. LENDING_ASSET_WHITELIST — 대출 자산 화이트리스트
  12. PERP_MAX_LEVERAGE      — 무기한 선물 최대 레버리지
  13. PERP_MAX_POSITION_USD  — 무기한 선물 최대 포지션 규모
  14. PERP_ALLOWED_MARKETS   — 무기한 선물 허용 마켓
  15. APPROVE_TIER_OVERRIDE  — 관리자 수동 티어 오버라이드
```

REPUTATION_THRESHOLD가 APPROVED_SPENDERS 이후, SPENDING_LIMIT 이전(6번)에 위치하는 이유: 허용되지 않은 컨트랙트/토큰은 평판과 무관하게 차단해야 하고, 평판 기반 티어 결정은 지출 한도 평가 전에 이뤄져야 한다. DeFi 정책(LENDING/PERP)은 도메인 특화이므로 SPENDING_LIMIT 이후에 평가된다.

> **참고:** 위 순서는 주요 정책 타입의 평가 위치를 나타낸다. WHITELIST, X402_ALLOWED_DOMAINS, APPROVE_AMOUNT_LIMIT은 각각 기존 평가 순서에서 처리되며, 여기서는 REPUTATION_THRESHOLD의 상대적 위치만 명시한다.

**평판 점수 → 티어 매핑:**

| 조건 | 결과 | 설명 |
|------|------|------|
| score >= min_score | 오버라이드 없음 | 정상 처리, 다음 정책으로 진행 |
| score < min_score | below_threshold_tier 적용 | 저평판 → 상위 보안 티어로 상향 |
| 평판 미확인 (조회 실패/미등록) | unrated_tier 적용 | 새 에이전트 → 보수적 처리 |

**티어 상향 규칙:** REPUTATION_THRESHOLD는 티어를 **상향**만 할 수 있다. 이미 APPROVAL인 트랜잭션을 INSTANT으로 내리지 않는다. `maxTier(currentTier, reputationTier)` 로직.

#### 3.5 REPU-05: 평판 점수 캐시

온체인 readContract() 호출을 매 트랜잭션마다 하면 latency와 RPC 비용이 증가한다. 인메모리 캐시 + DB 백업 전략을 사용한다.

```
캐시 아키텍처:

  트랜잭션 수신 → 인메모리 캐시 조회 (Map<cacheKey, CachedScore>)
                    |
                    ├─ HIT (TTL 내) → 캐시된 점수 사용
                    |
                    └─ MISS → viem readContract(getSummary) 호출
                                |
                                ├─ 성공 → 인메모리 캐시 저장 + DB reputation_cache 저장
                                |
                                └─ 실패 (RPC 에러) → DB reputation_cache fallback 조회
                                                      |
                                                      ├─ DB HIT → stale 점수 사용 + 경고 로깅
                                                      └─ DB MISS → unrated_tier 적용
```

**캐시 키:** `{agentId}:{registryAddress}:{tag1}:{tag2}`
**TTL:** `reputation_cache_ttl_sec` (기본 300초 = 5분)
**무효화:** TTL 기반 자동 만료. 수동 무효화 API 없음 (캐시 TTL이 충분히 짧음).

**RPC 타임아웃 전략:** Stage 3 정책 평가 중 평판 조회 `readContract(getSummary)` 호출에는 **3초 타임아웃**을 적용한다. 타임아웃 또는 RPC 오류 발생 시 DB fallback → DB에도 없으면 `unrated_tier` 적용. 파이프라인 전체가 RPC 장애로 지연되는 것을 방지한다. 타임아웃 값은 `actions.erc8004_reputation_rpc_timeout_ms` 설정으로 조정 가능 (기본 3000ms).

---

### 4. ERC8004-04: Validation Registry 연동

고액 트랜잭션에 대한 온체인 제3자 검증 요청/응답 플로우.

> **요구사항:** VALD-01, VALD-02, VALD-03, VALD-04

#### 4.1 VALD-01: Validation Registry ABI

```solidity
// 검증 요청
function validationRequest(
  address validatorAddress,    // 검증자 주소
  uint256 agentId,             // 검증 대상 에이전트
  string calldata requestURI,  // 검증 요청 상세 (off-chain)
  bytes32 requestHash          // requestURI 파일 해시
) external;

// 검증 응답 (검증자가 호출)
function validationResponse(
  bytes32 requestHash,
  uint8 response,              // 0-100 (0=거부, 100=완전승인)
  string calldata responseURI,
  bytes32 responseHash,
  string calldata tag          // 검증 방법 태그 (예: "zkml", "tee", "re-execution")
) external;

// 검증 상태 조회
function getValidationStatus(bytes32 requestHash) external view returns (
  address validatorAddress,
  uint256 agentId,
  uint8 response,
  bytes32 responseHash,
  string memory tag,
  uint256 lastUpdate
);

// 에이전트별 검증 요약
function getSummary(
  uint256 agentId,
  address[] calldata validatorAddresses,
  string calldata tag
) external view returns (
  uint64 count,
  uint8 averageResponse
);

// 에이전트의 전체 검증 목록
function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory requestHashes);

// 검증자의 전체 요청 목록
function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory requestHashes);
```

**이벤트:**

```solidity
event ValidationRequest(
  address indexed validatorAddress,
  uint256 indexed agentId,
  string requestURI,
  bytes32 indexed requestHash
);

event ValidationResponse(
  address indexed validatorAddress,
  uint256 indexed agentId,
  bytes32 indexed requestHash,
  uint8 response,
  string responseURI,
  bytes32 responseHash,
  string tag
);
```

#### 4.2 VALD-02: request_validation resolve() 플로우

```
resolve('request_validation', params, context)
  1. RequestValidationInputSchema.parse(params)
  2. 검증 대상 에이전트 존재 확인
  3. requestURI 생성 (트랜잭션 상세 + 검증 요청 사유)
  4. requestHash = keccak256(requestURI 파일)
  5. encodeFunctionData('validationRequest', [validatorAddress, agentId, requestURI, requestHash])
  6. ContractCallRequest 반환 → DELAY 티어
```

**Zod 입력 스키마:**

```typescript
const RequestValidationInputSchema = z.object({
  agentId: z.string().min(1, 'target agentId is required'),
  validatorAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'valid EVM address required'),
  requestDescription: z.string().min(1).max(1000),
  tag: z.string().max(32).optional().default(''),
});
```

#### 4.3 VALD-03: 고액 트랜잭션 사전 검증 통합 (선택적)

Validation Registry를 정책 엔진과 통합하여 고액 트랜잭션에 자동 검증을 요청하는 패턴. 이는 **별도 구현 마일스톤**으로 분리 가능하며, 기본 m30-08에서는 수동 `request_validation` 액션만 제공한다.

**향후 통합 시 플로우:**

```
Stage 3 (Policy) → 금액이 validation_threshold 초과
  → VALIDATION_REQUIRED 이벤트 발행
  → Stage 3.5: validationRequest 온체인 제출
  → 폴링 (15초 간격, 최대 40회 = 10분)
    → 응답 수신:
      ├─ response >= 50  → 파이프라인 계속 (Stage 4)
      ├─ response < 50   → FAILED (검증 거부)
      └─ 타임아웃        → CANCELLED
```

**설계 결정 — 자동 검증은 m30-08 범위 밖:**
자동 검증은 파이프라인 Stage 3과 Stage 4 사이에 새 단계를 삽입해야 하므로 복잡도가 높다. m30-08에서는 에이전트가 명시적으로 `request_validation` 액션을 호출하는 수동 방식만 구현하고, 자동 검증은 후속 마일스톤에서 다룬다.

#### 4.4 VALD-04: 검증 결과 의사결정 매트릭스

| 검증 응답 (response) | 의미 | 에이전트 측 행동 | 알림 우선순위 |
|---------------------|------|-----------------|-------------|
| 80-100 | 강한 승인 | 정상 진행 | normal |
| 50-79 | 조건부 승인 | 주의하며 진행 | high |
| 1-49 | 의심스러움 | 사용자 판단 요청 (APPROVAL) | high |
| 0 | 명시적 거부 | 중단 권고 | critical |
| 미응답 (타임아웃) | 검증자 무응답 | 사용자 판단 요청 (APPROVAL) | critical |

---

### 5. ERC8004-05: REST API / MCP / SDK 확장 엔드포인트

#### 5.1 API-01: 신규 REST API 엔드포인트

**쓰기 액션 (기존 ActionProvider 라우트 활용):**

쓰기 액션은 기존 `POST /v1/actions/:provider/:action` 패턴을 그대로 사용한다. 새 라우트 파일 불필요.

```
POST /v1/actions/erc8004_agent/register_agent      sessionAuth
POST /v1/actions/erc8004_agent/set_agent_wallet     sessionAuth → APPROVAL
POST /v1/actions/erc8004_agent/unset_agent_wallet   sessionAuth → APPROVAL
POST /v1/actions/erc8004_agent/set_agent_uri        sessionAuth
POST /v1/actions/erc8004_agent/set_metadata         sessionAuth
POST /v1/actions/erc8004_agent/give_feedback        sessionAuth
POST /v1/actions/erc8004_agent/revoke_feedback      sessionAuth
POST /v1/actions/erc8004_agent/request_validation   sessionAuth
```

**읽기 전용 (신규 라우트 파일: `erc8004.ts`):**

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| GET | `/v1/erc8004/agent/:agentId` | sessionAuth | 에이전트 정보 조회 (Identity) |
| GET | `/v1/erc8004/agent/:agentId/reputation` | sessionAuth | 평판 점수 요약 (Reputation) |
| GET | `/v1/erc8004/agent/:agentId/feedback` | sessionAuth | 피드백 목록 (Reputation) |
| GET | `/v1/erc8004/validation/:requestHash` | sessionAuth | 검증 상태 (Validation) |
| GET | `/v1/erc8004/registration-file/:walletId` | public | 등록 파일 JSON (no auth) |

**에러 응답:**

| 상태 코드 | 에러 코드 | 설명 |
|----------|----------|------|
| 404 | `AGENT_NOT_REGISTERED` | agentId에 해당하는 에이전트 없음 |
| 409 | `AGENT_WALLET_ALREADY_SET` | 이미 지갑이 연결됨 |
| 403 | `WALLET_SIGNATURE_REQUIRED` | setAgentWallet Owner 서명 필요 |
| 502 | `REPUTATION_QUERY_FAILED` | Reputation Registry RPC 호출 실패 |
| 408 | `VALIDATION_TIMEOUT` | 검증 응답 타임아웃 |
| 403 | `VALIDATION_REJECTED` | 검증자가 거부함 |
| 422 | `REGISTRATION_FILE_INVALID` | 등록 파일 형식 오류 |

#### 5.2 API-02: MCP Tool 자동 노출

`mcpExpose: true`로 설정되어 있으므로 8개 쓰기 액션은 MCP 툴로 자동 노출된다.

읽기 전용 엔드포인트는 별도 MCP 툴로 수동 등록:

| MCP Tool 이름 | 설명 | 매핑 |
|---|---|---|
| `erc8004_get_agent_info` | 에이전트 ID/메타데이터/지갑 조회 | GET /v1/erc8004/agent/:agentId |
| `erc8004_get_reputation` | 에이전트 평판 점수 요약 | GET /v1/erc8004/agent/:agentId/reputation |
| `erc8004_get_validation_status` | 검증 요청 상태 조회 | GET /v1/erc8004/validation/:requestHash |

#### 5.3 API-03: TypeScript SDK 확장

```typescript
// packages/sdk/src/client.ts에 추가할 메서드

// 쓰기 (ActionProvider 경유)
async registerAgent(params: RegisterAgentInput): Promise<ActionResult>;
async setAgentWallet(params: SetAgentWalletInput): Promise<ActionResult>;
async unsetAgentWallet(params: { agentId: string }): Promise<ActionResult>;
async setAgentUri(params: { agentId: string; uri: string }): Promise<ActionResult>;
async setAgentMetadata(params: { agentId: string; key: string; value: string }): Promise<ActionResult>;
async giveFeedback(params: GiveFeedbackInput): Promise<ActionResult>;
async revokeFeedback(params: { agentId: string; feedbackIndex: number }): Promise<ActionResult>;
async requestValidation(params: RequestValidationInput): Promise<ActionResult>;

// 읽기 (직접 GET)
async getAgentInfo(agentId: string): Promise<AgentInfo>;
async getAgentReputation(agentId: string, options?: { tag1?: string; tag2?: string }): Promise<ReputationSummary>;
async getValidationStatus(requestHash: string): Promise<ValidationStatus>;
```

---

### 6. ERC8004-06: Admin UI 컴포넌트 설계

#### 6.1 UI-01: ERC-8004 Identity 관리 페이지

신규 페이지: `/erc8004` (사이드바 메뉴에 추가)

**섹션 구성:**

```
ERC-8004 Identity 페이지
├── 1. 에이전트 등록 현황
│   ├─ 지갑별 등록 상태 테이블
│   │   (walletId, agentId, status, registryAddress, agentURI)
│   └─ 상태 뱃지: PENDING / REGISTERED / WALLET_LINKED / DEREGISTERED
│
├── 2. 에이전트 등록 폼
│   ├─ 지갑 선택 (EVM 지갑만)
│   ├─ 에이전트 이름 + 설명 입력
│   ├─ 서비스 endpoint 자동 감지 (MCP/REST)
│   └─ "등록" 버튼 → POST /v1/actions/erc8004_agent/register_agent
│
├── 3. 지갑 연결 관리
│   ├─ setAgentWallet 호출 (Owner 서명 필요 → WalletConnect)
│   └─ unsetAgentWallet 호출
│
├── 4. 등록 파일 미리보기
│   ├─ JSON 트리 뷰어
│   └─ 호스팅 URL 표시 + 복사 버튼
│
└── 5. 메타데이터 편집기
    ├─ Key-Value 편집 테이블
    └─ setMetadata 호출
```

#### 6.2 UI-02: ERC-8004 Reputation 대시보드

에이전트 등록 현황 페이지의 하위 탭 또는 별도 섹션.

```
Reputation 대시보드
├── 1. 내 에이전트 평판 요약
│   ├─ 에이전트별 점수 카드 (count, averageScore)
│   └─ 태그별 점수 분류
│
├── 2. 받은 피드백 목록
│   ├─ 피드백 테이블 (clientAddress, value, tag1, tag2, timestamp)
│   ├─ 필터: tag1, tag2, isRevoked
│   └─ 피드백 응답 기능 (appendResponse)
│
└── 3. 외부 에이전트 평판 조회
    ├─ agentId 입력 → 평판 조회
    └─ 결과 표시 (count, summaryValue)
```

#### 6.3 UI-03: Actions 페이지 확장

기존 `BUILTIN_PROVIDERS` 배열에 추가:

```typescript
{
  name: 'erc8004_agent',
  displayName: 'ERC-8004 Trustless Agents',
  description: 'On-chain identity, reputation, and validation for AI agents',
  chain: 'evm',
  requiresApiKey: false,
  actions: [
    'register_agent', 'set_agent_wallet', 'unset_agent_wallet',
    'set_agent_uri', 'set_metadata',
    'give_feedback', 'revoke_feedback',
    'request_validation',
  ],
}
```

#### 6.4 UI-04: Policies 페이지 REPUTATION_THRESHOLD 폼

기존 정책 생성 폼에 REPUTATION_THRESHOLD 타입 추가:

```
REPUTATION_THRESHOLD 정책 폼
├── min_score: 슬라이더 (0-100, 기본 50)
├── below_threshold_tier: 드롭다운 (INSTANT/NOTIFY/DELAY/APPROVAL, 기본 APPROVAL)
├── unrated_tier: 드롭다운 (기본 APPROVAL)
├── tag1: 텍스트 입력 (선택, 예: "swap")
├── tag2: 텍스트 입력 (선택)
└── check_counterparty: 체크박스 (기본 false)
```

---

### 7. ERC8004-07: DB 스키마 확장

> **요구사항:** DB-01, DB-02, DB-03

#### 7.1 DB-01: 마이그레이션 SQL

```sql
-- Migration v39: ERC-8004 agent identity tracking + approval_type 확장
-- LATEST_SCHEMA_VERSION: 38 → 39

-- 1. agent_identities: WAIaaS 월렛 ↔ ERC-8004 에이전트 ID 매핑
CREATE TABLE IF NOT EXISTS agent_identities (
  id TEXT PRIMARY KEY,                      -- UUID v7
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  chain_agent_id TEXT NOT NULL,             -- 온체인 agentId (uint256 as string)
  registry_address TEXT NOT NULL,           -- Identity Registry 컨트랙트 주소
  chain_id INTEGER NOT NULL,               -- EVM chain ID (1=mainnet, 11155111=sepolia)
  agent_uri TEXT,                           -- agentURI (등록 파일 URL)
  registration_file_url TEXT,               -- 호스팅된 등록 파일 URL
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'REGISTERED', 'WALLET_LINKED', 'DEREGISTERED')),
  created_at INTEGER NOT NULL,              -- 초 단위 Unix timestamp
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_agent_identities_wallet ON agent_identities(wallet_id);
CREATE UNIQUE INDEX idx_agent_identities_chain ON agent_identities(registry_address, chain_agent_id);

-- 2. reputation_cache: 평판 점수 로컬 캐시 (RPC 장애 시 fallback)
CREATE TABLE IF NOT EXISTS reputation_cache (
  agent_id TEXT NOT NULL,                   -- 온체인 agentId (string)
  registry_address TEXT NOT NULL,           -- Reputation Registry 주소
  tag1 TEXT NOT NULL DEFAULT '',
  tag2 TEXT NOT NULL DEFAULT '',
  score INTEGER NOT NULL,                   -- summaryValue (정규화된 정수)
  score_decimals INTEGER NOT NULL DEFAULT 0,
  feedback_count INTEGER NOT NULL DEFAULT 0,
  cached_at INTEGER NOT NULL,               -- 초 단위 Unix timestamp
  PRIMARY KEY (agent_id, registry_address, tag1, tag2)
);

-- 3. pending_approvals: approval_type 컬럼 추가 (D3: SIWE vs EIP-712 구분)
ALTER TABLE pending_approvals ADD COLUMN approval_type TEXT NOT NULL DEFAULT 'SIWE'
  CHECK (approval_type IN ('SIWE', 'EIP712'));

-- 4. schema_version 기록
-- 5. policies 테이블 재생성 (REPUTATION_THRESHOLD CHECK 제약 반영)
-- SQLite는 ALTER TABLE로 CHECK 변경 불가 → CREATE → INSERT → DROP → RENAME 패턴
-- 실제 구현에서는 inList(POLICY_TYPES) 동적 생성 사용
CREATE TABLE policies_new (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (${inList(POLICY_TYPES)})),
  rules TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  network TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO policies_new SELECT * FROM policies;
DROP TABLE policies;
ALTER TABLE policies_new RENAME TO policies;

-- 6. schema_version 기록
INSERT INTO schema_version (version, applied_at) VALUES (39, unixepoch());
```

#### 7.2 DB-02: Drizzle 스키마

```typescript
// schema.ts — pendingApprovals 테이블에 컬럼 추가
approvalType: text('approval_type').notNull().default('SIWE'),
// 'SIWE' = 기존 Owner SIWE 서명, 'EIP712' = ERC-8004 setAgentWallet EIP-712 서명
```

```typescript
// schema.ts에 신규 테이블 추가

export const agentIdentities = sqliteTable('agent_identities', {
  id: text('id').primaryKey(),
  walletId: text('wallet_id').notNull().references(() => wallets.id, { onDelete: 'cascade' }),
  chainAgentId: text('chain_agent_id').notNull(),
  registryAddress: text('registry_address').notNull(),
  chainId: integer('chain_id').notNull(),
  agentUri: text('agent_uri'),
  registrationFileUrl: text('registration_file_url'),
  status: text('status').notNull().default('PENDING'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const reputationCache = sqliteTable('reputation_cache', {
  agentId: text('agent_id').notNull(),
  registryAddress: text('registry_address').notNull(),
  tag1: text('tag1').notNull().default(''),
  tag2: text('tag2').notNull().default(''),
  score: integer('score').notNull(),
  scoreDecimals: integer('score_decimals').notNull().default(0),
  feedbackCount: integer('feedback_count').notNull().default(0),
  cachedAt: integer('cached_at').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.agentId, table.registryAddress, table.tag1, table.tag2] }),
}));
```

#### 7.3 DB-03: 마이그레이션 순서

| 버전 | 내용 | 의존 |
|------|------|------|
| v39 | agent_identities + reputation_cache 테이블 생성 + pending_approvals.approval_type 추가 + policies 테이블 재생성 (REPUTATION_THRESHOLD CHECK) | v38 (현재 최신: ERC-4337 Smart Account) |

LATEST_SCHEMA_VERSION을 38 → 39로 변경. REPUTATION_THRESHOLD PolicyType은 Zod SSoT(`PolicyTypeEnum`)에서 관리된다. **policies 테이블의 `type` 컬럼에 DB-level CHECK 제약이 존재하므로(`CHECK (type IN (${inList(POLICY_TYPES)}))`), v39 마이그레이션에서 policies 테이블 재생성(CREATE → INSERT → DROP → RENAME) 패턴이 필수이다.** 이 패턴은 기존 마이그레이션(v6b, v8, v11, v20, v27, v33 등)에서 이미 검증된 방식이다.

---

### 8. ERC8004-08: 테스트 전략

> **요구사항:** TEST-01, TEST-02, TEST-03, TEST-04

#### 8.1 TEST-01: Mock 픽스처 구조

```
packages/actions/src/__tests__/
  providers/erc8004/
    erc8004-action-provider.test.ts    # resolve() 단위 테스트
    erc8004-registry-client.test.ts    # viem 클라이언트 테스트
    registration-file.test.ts          # 등록 파일 생성 테스트

packages/daemon/src/__tests__/
  pipeline/
    reputation-policy.test.ts          # REPUTATION_THRESHOLD 정책 테스트
  api/routes/
    erc8004.test.ts                    # 읽기 전용 엔드포인트 테스트
  infrastructure/database/
    migration-v39.test.ts              # DB 마이그레이션 테스트

fixtures/erc8004/
  identity-register-response.json
  identity-get-wallet-response.json
  reputation-summary-response.json
  reputation-feedback-response.json
  validation-status-response.json
```

#### 8.2 TEST-02: 테스트 시나리오 매트릭스

| # | 시나리오 | 레지스트리 | 레벨 | 자동화 |
|---|---------|-----------|------|--------|
| E1 | register_agent resolve() → ContractCallRequest 생성 | Identity | L0 | O |
| E2 | set_agent_wallet → APPROVAL 티어 강제 | Identity | L0 | O |
| E3 | unset_agent_wallet → ContractCallRequest 생성 | Identity | L0 | O |
| E4 | set_agent_uri → ContractCallRequest + URI 검증 | Identity | L0 | O |
| E5 | get_agent_info → viem readContract 호출 + 응답 매핑 | Identity | L0 | O |
| E6 | 등록 파일 JSON 자동 생성 + 스키마 검증 | Identity | L0 | O |
| E7 | 등록 파일 endpoint 서빙 (public, no auth) | Identity | L1 | O |
| E8 | give_feedback → ContractCallRequest 생성 | Reputation | L0 | O |
| E9 | revoke_feedback → ContractCallRequest 생성 | Reputation | L0 | O |
| E10 | get_reputation → 캐시 HIT 시 RPC 미호출 | Reputation | L0 | O |
| E11 | get_reputation → 캐시 MISS 시 RPC 호출 + 캐시 저장 | Reputation | L0 | O |
| E12 | REPUTATION_THRESHOLD 정책 → 저평판 시 APPROVAL 상향 | Reputation | L0 | O |
| E13 | REPUTATION_THRESHOLD 정책 → 미평가 시 unrated_tier 적용 | Reputation | L0 | O |
| E14 | request_validation → ContractCallRequest 생성 | Validation | L0 | O |
| E15 | get_validation_status → 응답 매핑 | Validation | L0 | O |
| E16 | provider-trust CONTRACT_WHITELIST 바이패스 동작 | All | L1 | O |
| E17 | erc8004_agent_enabled=false → 프로바이더 미등록 | All | L1 | O |
| E18 | DB 마이그레이션 v38 → v39 무손실 (policies 재생성 포함) | DB | L0 | O |
| E19 | Agent Identity CRUD (생성/조회/상태변경/삭제) | DB | L0 | O |
| E20 | Admin UI ERC-8004 페이지 렌더링 | UI | L1 | O |

#### 8.3 TEST-03: 테스트 레벨 분류

| 레벨 | 설명 | 대상 | 예상 수 |
|------|------|------|---------|
| L0 | 단위 테스트 (mocked deps) | resolve(), 정책 평가, 캐시, DB | ~40 |
| L1 | 통합 테스트 (in-process) | API 라우트, 파이프라인, Admin UI | ~15 |
| L2 | E2E (testnet) | 실제 온체인 호출 (수동) | ~5 |

**커버리지 목표:** L0+L1 ≥ 55 테스트, 신규 코드 statement coverage ≥ 80%

#### 8.4 TEST-04: viem Mock 전략

온체인 호출을 모킹하기 위해 viem의 `publicClient`를 주입 가능하게 설계한다.

```typescript
// 테스트에서:
const mockPublicClient = {
  readContract: vi.fn().mockResolvedValue(/* mock response */),
} as unknown as PublicClient;

const client = new Erc8004RegistryClient(mockPublicClient, testConfig);
const result = await client.getAgentWallet(42n);
expect(mockPublicClient.readContract).toHaveBeenCalledWith({
  address: testConfig.identityRegistryAddress,
  abi: IDENTITY_REGISTRY_ABI,
  functionName: 'getAgentWallet',
  args: [42n],
});
```

encodeFunctionData는 viem의 순수 함수이므로 모킹 불필요 — 실제 calldata 인코딩을 검증한다.

---

### 9. ERC8004-09: Skill 파일 업데이트

CLAUDE.md 규칙: API/MCP 변경 시 skill 파일 동기화 필수.

> **요구사항:** SKILL-01, SKILL-02

#### 9.1 SKILL-01: 신규 skill 파일 생성

ERC-8004은 독립된 도메인이므로 신규 skill 파일을 생성한다:

- **`skills/erc8004.skill.md`** — ERC-8004 Trustless Agents 도메인
  - 쓰기 액션 8개 (register_agent, set_agent_wallet, ...)
  - 읽기 엔드포인트 5개 (GET /v1/erc8004/...)
  - MCP 툴 11개 (쓰기 8 + 읽기 3)
  - SDK 메서드 11개
  - 보안 공지: `> AI agents must NEVER request the master password. Use only your session token.`

#### 9.2 SKILL-02: 기존 skill 파일 업데이트

- **`skills/policies.skill.md`** — REPUTATION_THRESHOLD 정책 타입 추가
- **`skills/admin.skill.md`** — ERC-8004 설정 키 9개 + Admin UI 페이지 추가

---

### 10. ERC8004-10: NotificationEventType 확장

ERC-8004 주요 이벤트에 대한 알림을 위해 NotificationEventType을 확장한다.

> **요구사항:** NOTIF-01

#### 10.1 NOTIF-01: 신규 이벤트 타입

| 이벤트 | 설명 | 카테고리 | 기본 우선순위 |
|--------|------|---------|-------------|
| `AGENT_REGISTERED` | ERC-8004 에이전트 ID 등록 완료 | security | normal |
| `AGENT_WALLET_LINKED` | agentWallet 연결 완료 | security | high |
| `AGENT_WALLET_UNLINKED` | agentWallet 해제 | security | high |
| `REPUTATION_FEEDBACK_RECEIVED` | 외부에서 내 에이전트에 피드백 수신 | info | normal |
| `REPUTATION_THRESHOLD_TRIGGERED` | 평판 부족으로 보안 티어 상향 적용 | security | high |

현재 49개 → **54개**로 확장. `@waiaas/core` enums의 `NOTIFICATION_EVENT_TYPES` 배열에 추가.

---

## 핵심 설계 결정 요약

| # | 결정 | 선택 | 근거 |
|---|------|------|------|
| D1 | 읽기 전용 액션 | 별도 REST 라우트 | resolve()는 ContractCallRequest 전용, 읽기는 viem readContract 직접 호출 |
| D2 | 등록 파일 호스팅 | 데몬 endpoint (기본) + 외부 URL override | 가장 단순, 데몬 오프라인 시 외부 URL로 전환 가능 |
| D3 | setAgentWallet 서명 | 기존 ApprovalWorkflow 확장 (WalletConnect/Admin UI only) | EIP-712 서명은 WalletConnect 또는 Admin UI에서만 수집. Ntfy/Telegram은 알림만 발송, 서명 수집 불가 |
| D4 | 정책 타입 추가 | 18번째 REPUTATION_THRESHOLD | 기존 17-type 구조에 최소 침습 추가 |
| D5 | 평판 캐시 | 인메모리(TTL) + DB fallback | RPC latency 최소화, 장애 시 stale 데이터 활용 |
| D6 | 자동 검증 | m30-08 범위 밖 (수동만) | Stage 3.5 파이프라인 삽입은 복잡도 높음, 후속 마일스톤으로 분리 |
| D7 | 피드백 자동 게시 | 수동만 (에이전트 명시 호출) | 자동 게시는 스팸 위험, 에이전트 판단 필요 |
| D8 | EVM 전용 | Solana 미지원 | ERC-8004은 이더리움 표준, Solana 대응 불가 |
| D9 | PolicyType CHECK 제약 | policies 테이블 재생성 필수 | DB CHECK 제약이 `inList(POLICY_TYPES)`로 동적 생성되나, 기존 DB는 이전 CHECK를 보유. 마이그레이션 v39에서 CREATE→INSERT→DROP→RENAME 패턴으로 갱신 |
| D10 | 마이그레이션 버전 | v39 (v38은 ERC-4337 Smart Account에 사용됨) | LATEST_SCHEMA_VERSION=38 → 39 |
| D11 | 리서치 필수 | 구현 전 ERC-8004 스펙/ABI 온체인 검증 | 외부 표준 의존, ABI 불일치 시 전체 재설계 위험 |
| D12 | 평판 RPC 타임아웃 | 3초 타임아웃 + unrated_tier fallback | Stage 3 지연 방지, 설정 키로 조정 가능 |

---

## 산출물 → 구현 마일스톤 매핑

| 설계 섹션 | 산출물 | 구현 대상 |
|----------|--------|----------|
| ERC8004-01 | ActionProvider 구조, 설정 키 | packages/actions/, 데몬 초기화 |
| ERC8004-02 | Identity ABI, resolve(), 등록 파일 | providers/erc8004/ |
| ERC8004-03 | Reputation ABI, REPUTATION_THRESHOLD 정책 | providers/erc8004/, policy engine |
| ERC8004-04 | Validation ABI, resolve() | providers/erc8004/ |
| ERC8004-05 | REST/MCP/SDK 엔드포인트 | daemon routes, MCP server, SDK |
| ERC8004-06 | Admin UI 컴포넌트 | packages/admin/ |
| ERC8004-07 | DB 마이그레이션 v39 | migrate.ts, schema.ts |
| ERC8004-08 | 테스트 전략, 시나리오 매트릭스 | __tests__/ |
| ERC8004-09 | Skill 파일 생성/업데이트 | skills/ |
| ERC8004-10 | NotificationEventType 확장 | @waiaas/core enums |

---

## 영향받는 설계 문서

| 문서 | 영향 |
|------|------|
| doc 62 (action-provider-architecture) | 신규 프로바이더 추가 |
| doc 33 (보안 모델) | REPUTATION_THRESHOLD 정책 타입 추가 |
| doc 35 (정책 엔진) | 18번째 PolicyType + 캐시 전략 |
| doc 37 (API 설계) | /v1/erc8004/ 신규 라우트 |
| doc 67 (Admin UI) | ERC-8004 관리 페이지 추가 |
| skills/*.skill.md | 신규 erc8004.skill.md + policies/admin 업데이트 |
| @waiaas/core enums | NotificationEventType 49→54, PolicyType 17→18 |

---

## 성공 기준

1. WAIaaS 관리 EVM 지갑이 Identity Registry에 에이전트로 등록되고, `getAgentWallet(agentId)`이 해당 지갑 주소를 반환함
2. 등록 파일에서 WAIaaS MCP/REST endpoint가 서비스로 확인됨
3. 외부 에이전트가 등록 파일을 통해 WAIaaS endpoint를 발견하고 API 호출 가능
4. Reputation Registry에서 피드백 게시·조회가 동작함
5. REPUTATION_THRESHOLD 정책이 저평판 에이전트의 트랜잭션을 APPROVAL 티어로 상향함
6. Validation Registry에 검증 요청을 제출하고 상태를 조회할 수 있음
7. Admin UI에서 에이전트 ID 등록·조회·관리가 가능함
8. 20개 테스트 시나리오 (E1~E20) 중 L0+L1 ≥ 55 테스트 PASS

---

## 참고 자료

- [ERC-8004: Trustless Agents (EIP)](https://eips.ethereum.org/EIPS/eip-8004)
- [Ethereum Magicians Discussion](https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098)
- [awesome-erc8004](https://github.com/sudeepb02/awesome-erc8004)
