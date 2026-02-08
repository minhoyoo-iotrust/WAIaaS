# Phase 28: 의존성 빌드 환경 해소 - Research

**Researched:** 2026-02-08
**Domain:** SIWE viem 전환 + Sidecar 크로스 컴파일 전략 (설계 문서 수정)
**Confidence:** HIGH

## Summary

Phase 28은 모노레포 첫 빌드에서 의존성 충돌이나 네이티브 바이너리 문제 없이 빌드가 성공하는 설계 상태를 만드는 것을 목표로 한다. 두 가지 핵심 영역을 조사했다:

1. **SIWE viem 전환 (DEPS-01)**: 현재 설계에서 SIWE 검증에 `siwe` npm 패키지 + `ethers` v6을 사용하고 있으나, EVM adapter는 `viem`을 사용한다. viem v2.x에 내장된 `viem/siwe` 모듈이 `parseSiweMessage`, `validateSiweMessage`, `verifySiweMessage`, `createSiweMessage` 4개 함수를 제공하여 별도 `siwe`/`ethers` 의존성 없이 SIWE 검증이 가능하다. 이를 통해 ethers(130KB+)와 siwe 패키지를 모노레포에서 완전히 제거할 수 있다.

2. **Sidecar 크로스 컴파일 전략 (DEPS-02)**: Node.js SEA(Single Executable Application)로 데몬을 패키징할 때 native addon(sodium-native, better-sqlite3, argon2)의 크로스 플랫폼 바이너리 번들 전략이 필요하다. prebuildify/node-gyp-build 기반으로 prebuilt binaries를 번들하고, SEA assets 메커니즘(Node.js 22+)으로 `.node` 파일을 포함하는 전략을 정의한다. 6개 타겟 플랫폼(ARM64 Windows 제외)을 확정한다.

**Primary recommendation:** viem/siwe 전환은 30-session-token-protocol.md 섹션 3.3의 코드 패턴 교체가 핵심이며, Sidecar 전략은 39-tauri-desktop-architecture.md 섹션 4.1과 11.6의 보완이 핵심이다.

## Standard Stack

### Core (변경 대상)

| Library | 현재 | 전환 후 | Purpose | Why Standard |
|---------|------|--------|---------|--------------|
| `viem` | v2.x (EVM adapter only) | v2.x (EVM adapter + SIWE 검증) | EVM 체인 어댑터 + SIWE 검증 통합 | 이미 모노레포에 존재, `viem/siwe` 내장 |
| `siwe` | v3.x | **제거** | SIWE 검증 (EIP-4361) | viem/siwe로 대체 |
| `ethers` | v6 (siwe peer dep) | **제거** | siwe 내부 의존성 | viem으로 완전 대체 |

### Core (유지)

| Library | Version | Purpose | 비고 |
|---------|---------|---------|------|
| `@solana/kit` | latest | SIWS 검증 (Ed25519) + Solana adapter | 변경 없음 |
| `tweetnacl` | latest | Ed25519 서명 검증 | SIWS 검증에 사용, 변경 없음 |
| `@web3auth/sign-in-with-solana` | latest | SIWS 메시지 파싱 | 변경 없음 |
| `sodium-native` | v5.x | 암호화 키스토어 (libsodium) | native addon, prebuild 대상 |
| `better-sqlite3` | v12.x | SQLite ORM 하위 레이어 | native addon, prebuild 대상 |
| `argon2` | v0.43+ | Argon2id 해싱 (마스터 패스워드) | native addon, prebuild 대상 |

### Build Tools

| Tool | Version | Purpose | 비고 |
|------|---------|---------|------|
| `prebuildify` | latest | native addon prebuilt binary 생성 | CI에서 플랫폼별 빌드 |
| `node-gyp-build` | latest | prebuilt binary 로딩 (런타임) | sodium-native, better-sqlite3 사용 |
| `@mapbox/node-pre-gyp` | latest | prebuilt binary 관리 | argon2 사용 |
| Node.js SEA | Node.js 22+ | Single Executable Application 생성 | `--experimental-sea-config` (22), `--build-sea` (25.5+) |

## Architecture Patterns

### Pattern 1: SIWE viem 전환 -- 코드 패턴 교체

**What:** 30-session-token-protocol.md 섹션 3.3의 `verifySIWE` 함수를 `siwe` + `ethers` 대신 `viem/siwe` + `viem` 내장 함수로 교체한다.

**현재 패턴 (제거 대상):**
```typescript
// 30-session-token-protocol.md §3.3.3 -- 현재 설계
import { SiweMessage } from 'siwe'     // siwe v3.x -> ethers v6 peer dep

async function verifySIWE(input: SIWEVerifyInput): Promise<{ valid: boolean; address?: string; nonce?: string }> {
  const siweMessage = new SiweMessage(input.message)
  const { data: fields } = await siweMessage.verify({
    signature: input.signature,
  })
  if (fields.address.toLowerCase() !== input.ownerAddress.toLowerCase()) {
    return { valid: false }
  }
  return { valid: true, address: fields.address, nonce: fields.nonce }
}
```

**전환 후 패턴 (교체 대상):**
```typescript
// viem/siwe 기반 -- ethers 의존성 없음
import { createPublicClient, http, type Hex } from 'viem'
import { mainnet } from 'viem/chains'
import { parseSiweMessage, validateSiweMessage } from 'viem/siwe'

// PublicClient는 verifySiweMessage에 필요 (서명 검증에 사용)
// localhost 데몬에서는 EVM RPC가 필요하지만, 서명 검증 자체는
// ecRecover만 필요하므로 RPC 없이도 verifyMessage로 대체 가능
import { verifyMessage } from 'viem'

interface SIWEVerifyInput {
  message: string       // SIWE 포맷 메시지 원문
  signature: string     // Hex 인코딩된 EIP-191 서명
  ownerAddress: string  // Ethereum 주소 (0x...)
}

async function verifySIWE(input: SIWEVerifyInput): Promise<{
  valid: boolean
  address?: string
  nonce?: string
}> {
  try {
    // 1. SIWE 메시지 파싱 (순수 함수, RPC 불필요)
    const parsed = parseSiweMessage(input.message)
    if (!parsed.address) return { valid: false }

    // 2. 메시지 필드 검증 (domain, nonce, expiration 등)
    const isValid = validateSiweMessage({
      message: parsed,
      domain: 'localhost:3100',
      // nonce, scheme 등 추가 검증은 ownerAuth 미들웨어에서 수행
    })
    if (!isValid) return { valid: false }

    // 3. EIP-191 서명 검증 (ecRecover, RPC 불필요)
    const verified = await verifyMessage({
      address: parsed.address,
      message: input.message,
      signature: input.signature as Hex,
    })
    if (!verified) return { valid: false }

    // 4. recovered address == ownerAddress 확인
    if (parsed.address.toLowerCase() !== input.ownerAddress.toLowerCase()) {
      return { valid: false }
    }

    return {
      valid: true,
      address: parsed.address,
      nonce: parsed.nonce,
    }
  } catch {
    return { valid: false }
  }
}
```

**Source:** [viem verifySiweMessage](https://viem.sh/docs/siwe/actions/verifySiweMessage), [viem parseSiweMessage](https://github.com/wevm/viem/blob/main/src/utils/siwe/parseSiweMessage.ts), [viem validateSiweMessage](https://github.com/wevm/viem/blob/main/src/utils/siwe/validateSiweMessage.ts)

**Confidence:** HIGH -- viem 공식 소스 코드 확인 완료. parseSiweMessage는 순수 regex 파싱, validateSiweMessage는 필드 유효성 검사, verifyMessage는 ecRecover 기반 서명 검증.

### Pattern 2: viem/siwe 사용 시 주의점

**verifyMessage vs verifySiweMessage 선택:**

| 함수 | RPC 필요 | 용도 |
|------|----------|------|
| `verifyMessage` | 불필요 (로컬 ecRecover) | EOA 서명 검증. WAIaaS에 적합. |
| `verifySiweMessage` | 필요 (PublicClient) | EIP-1271 스마트 계정 지원 포함. 컨트랙트 지갑 검증 시. |

WAIaaS의 ownerAuth는 **EOA(Externally Owned Account) 서명만** 대상이므로 `verifyMessage`로 충분하다. EIP-1271 스마트 계정 지원은 향후 확장 시 `verifySiweMessage`로 전환 가능.

**Confidence:** HIGH -- viem 소스 코드에서 verifySiweMessage가 내부적으로 parseSiweMessage + validateSiweMessage + verifyHash(=verifyMessage와 동일 로직)를 순차 호출하는 것을 확인.

### Pattern 3: SIWE 메시지 생성 (createSiweMessage)

현재 CLI 수동 서명 플로우(52-auth-model-redesign.md 섹션 5.2)에서 SIWE 메시지를 수동으로 문자열 구성하는 패턴을 viem의 `createSiweMessage`로 표준화할 수 있다.

```typescript
import { createSiweMessage } from 'viem/siwe'

const message = createSiweMessage({
  address: ownerAddress as `0x${string}`,
  chainId: 1,
  domain: 'localhost:3100',
  nonce,
  uri: 'http://localhost:3100',
  version: '1',
  statement: `WAIaaS Owner Action: ${action}`,
  issuedAt: new Date(),
  expirationTime: new Date(Date.now() + 5 * 60 * 1000),
})
```

**주의:** createSiweMessage는 EIP-4361 검증을 자체 수행한다 (nonce 최소 8자, version='1' 필수, domain RFC 3986 등). 현재 설계의 nonce 포맷(32자 hex)은 이 요건을 충족.

**Confidence:** HIGH -- createSiweMessage 소스 코드에서 validation 로직 확인 완료.

### Pattern 4: SEA + Native Addon 번들 전략

**What:** Node.js SEA의 assets 메커니즘으로 `.node` 파일을 번들하고, 런타임에 임시 파일로 추출하여 process.dlopen()으로 로딩한다.

```json
// sea-config.json
{
  "main": "dist/daemon-bundle.js",
  "output": "dist/waiaas-daemon",
  "assets": {
    "sodium-native.node": "node_modules/sodium-native/prebuilds/{platform}-{arch}/sodium-native.node",
    "better_sqlite3.node": "node_modules/better-sqlite3/prebuilds/{platform}-{arch}/better_sqlite3.node",
    "argon2.node": "node_modules/argon2/prebuilds/{platform}-{arch}/argon2.node"
  }
}
```

```typescript
// native-loader.ts -- SEA 런타임 로더
import { getRawAsset } from 'node:sea'
import { writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function loadNativeAddon(name: string): any {
  const addonPath = join(tmpdir(), `waiaas-${name}`)
  writeFileSync(addonPath, new Uint8Array(getRawAsset(name)))
  const mod = { exports: {} }
  process.dlopen(mod, addonPath)
  return mod.exports
}
```

**Source:** [Node.js SEA Documentation](https://nodejs.org/api/single-executable-applications.html)

**Confidence:** MEDIUM -- SEA assets 메커니즘은 Node.js 공식 문서에 기재되어 있으나, sodium-native/better-sqlite3/argon2의 실제 SEA 번들링 호환성은 구현 시 검증 필요. 특히 Linux ARM64 Docker 환경에서 postject가 생성하는 ELF 바이너리에 알려진 hash table 이슈 존재.

### Pattern 5: 대안 전략 -- Sidecar = SEA + 동반 .node 파일

SEA assets 번들링이 native addon과 호환성 문제를 보일 경우의 대안:

```
src-tauri/binaries/
  waiaas-daemon-aarch64-apple-darwin       # SEA 바이너리 (JS only)
  waiaas-daemon-aarch64-apple-darwin.d/    # 동반 native addon 디렉토리
    sodium-native.node
    better_sqlite3.node
    argon2.node
```

이 방식은 Node.js single-executable 논의에서 "main executable + binary resources"도 SEA로 인정한다는 공식 입장과 일치한다.

**Confidence:** HIGH -- Tauri의 externalBin + 추가 리소스 번들링이 가능한 것은 확인됨.

### Anti-Patterns to Avoid

- **ethers + viem 공존 유지**: 번들 사이즈 불필요 증가 (ethers ~130KB, viem이 이미 동일 기능 제공)
- **native addon 크로스 컴파일 시도**: SEA는 호스트 OS에서만 빌드 가능. 반드시 CI matrix에서 각 OS별 빌드.
- **sodium-native를 pure JS 대안으로 교체**: `sodium-javascript`는 sodium-native 대비 10-100x 느림. 키스토어 보안에 부적합.
- **node-gyp 직접 컴파일 의존**: CI 환경에 빌드 도구(GCC, Python, Visual Studio) 설치 필요. prebuild 바이너리 우선.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SIWE 메시지 파싱 | 수동 regex 파서 | `parseSiweMessage` (viem/siwe) | EIP-4361 포맷의 모든 edge case 처리, 공식 구현 |
| SIWE 메시지 생성 | 문자열 템플릿 조합 | `createSiweMessage` (viem/siwe) | 필수 필드 검증 내장, RFC 준수 자동 보장 |
| SIWE 필드 검증 | 수동 expiration/nonce 체크 | `validateSiweMessage` (viem/siwe) | 시간 비교, 주소 검증 등 edge case 처리 |
| EIP-191 서명 검증 | 수동 ecRecover | `verifyMessage` (viem) | secp256k1 복구 + EIP-191 prefix 처리 |
| native addon 로딩 (SEA) | 수동 path resolution | `getRawAsset` + `process.dlopen` | Node.js SEA 공식 메커니즘 |
| prebuilt binary 탐색 | 수동 platform/arch 분기 | `node-gyp-build` | 자동 prebuild 탐색 + fallback to source build |

## Common Pitfalls

### Pitfall 1: verifyMessage의 EIP-1271 미지원

**What goes wrong:** `verifyMessage`는 EOA 서명만 검증한다. 스마트 계정(EIP-1271) 지갑으로 서명하면 검증 실패.
**Why it happens:** `verifyMessage`는 ecRecover만 수행하고 on-chain `isValidSignature()` 호출을 하지 않음.
**How to avoid:** WAIaaS v1.0에서는 EOA만 지원으로 명시. 향후 스마트 계정 지원 시 `verifySiweMessage` (PublicClient 필요)로 전환.
**Warning signs:** MetaMask Smart Account, Safe{Wallet} 등으로 서명 시 ownerAuth 실패.

### Pitfall 2: parseSiweMessage의 Ethereum 전용 주소 형식

**What goes wrong:** `parseSiweMessage`는 `0x[a-fA-F0-9]{40}` 형식만 파싱한다. Solana 주소(base58)는 파싱 실패.
**Why it happens:** EIP-4361은 Ethereum 전용 표준. Solana의 SIWS는 별도 표준.
**How to avoid:** SIWE(EVM)와 SIWS(Solana) 검증 경로를 명확히 분리. chain 분기에서 SIWE는 viem/siwe, SIWS는 기존 tweetnacl/sign-in-with-solana 유지. 이 분리는 이미 설계에 반영되어 있음 (34-owner-wallet-connection.md 섹션 5.5 Step 4).
**Warning signs:** SIWS 메시지를 parseSiweMessage에 전달하면 `{ address: undefined }` 반환.

### Pitfall 3: SEA에서 Native Addon 로딩 시 Linux ARM64 Docker 이슈

**What goes wrong:** Linux ARM64 Docker 컨테이너에서 postject로 생성한 SEA 바이너리가 `process.dlopen()` 시 크래시.
**Why it happens:** postject가 생성하는 ELF 바이너리의 hash table이 올바르지 않음 ([postject#105](https://github.com/nodejs/postject/issues/105)).
**How to avoid:** Linux ARM64 빌드는 non-container 환경에서 수행하거나, Node.js 25.5+의 `--build-sea` 플래그 사용 (이 이슈가 해결된 버전인지 확인 필요).
**Warning signs:** SEA 바이너리가 native addon 로딩 시 SIGSEGV로 크래시.

### Pitfall 4: argon2 패키지의 node-pre-gyp (prebuildify 아님)

**What goes wrong:** argon2는 `@mapbox/node-pre-gyp`를 사용하며 prebuildify가 아니다. 바이너리 로딩 경로가 다르다.
**Why it happens:** argon2는 prebuildify 대신 node-pre-gyp로 prebuilt binary를 관리.
**How to avoid:** SEA 번들 시 argon2의 `.node` 파일 경로가 `prebuilds/` 가 아닌 `lib/binding/` 하위일 수 있음. 각 패키지의 바이너리 위치를 정확히 확인.
**Warning signs:** SEA config에서 assets 경로를 잘못 지정하면 런타임 모듈 로딩 실패.

### Pitfall 5: SIWE 전환 시 영향받는 문서 누락

**What goes wrong:** SIWE 검증 패턴이 여러 설계 문서에 분산되어 있어 일부 문서만 업데이트하면 불일치 발생.
**Why it happens:** verifySIWE 참조가 30, 34, 37, 38, 52번 문서에 걸쳐 있음.
**How to avoid:** 영향받는 모든 문서를 식별하고 일괄 업데이트. 아래 "영향 범위 분석" 참조.
**Warning signs:** 한 문서에서 `import { SiweMessage } from 'siwe'`가 남아 있으면 불일치.

## Code Examples

### SIWE 검증 전환: 전체 verifySIWE 교체 패턴

```typescript
// packages/daemon/src/services/owner-verifier.ts [v0.7 보완]
// Source: viem v2.x 공식 소스 코드 (github.com/wevm/viem)
import { verifyMessage, type Hex } from 'viem'
import { parseSiweMessage, validateSiweMessage } from 'viem/siwe'

interface SIWEVerifyInput {
  message: string       // SIWE 포맷 메시지 원문
  signature: string     // Hex 인코딩된 EIP-191 서명
  ownerAddress: string  // Ethereum 주소 (0x...)
}

/**
 * SIWE 서명 검증 [v0.7 보완: siwe+ethers -> viem/siwe 전환]
 *
 * 기존: import { SiweMessage } from 'siwe' (ethers v6 peer dep 필수)
 * 전환: viem/siwe 내장 함수 사용 (ethers 의존성 완전 제거)
 */
async function verifySIWE(input: SIWEVerifyInput): Promise<{
  valid: boolean
  address?: string
  nonce?: string
}> {
  try {
    // 1. SIWE 메시지 파싱 (viem/siwe -- 순수 함수, 외부 의존성 없음)
    const parsed = parseSiweMessage(input.message)
    if (!parsed.address) return { valid: false }

    // 2. 메시지 필드 검증 (domain 바인딩, 만료 시간 등)
    const isValid = validateSiweMessage({
      message: parsed,
      domain: 'localhost:3100',
    })
    if (!isValid) return { valid: false }

    // 3. EIP-191 서명 검증 (viem verifyMessage -- ecRecover, RPC 불필요)
    const verified = await verifyMessage({
      address: parsed.address,
      message: input.message,
      signature: input.signature as Hex,
    })
    if (!verified) return { valid: false }

    // 4. recovered address == ownerAddress 확인
    if (parsed.address.toLowerCase() !== input.ownerAddress.toLowerCase()) {
      return { valid: false }
    }

    return {
      valid: true,
      address: parsed.address,
      nonce: parsed.nonce,
    }
  } catch {
    return { valid: false }
  }
}
```

### SEA 네이티브 모듈 로더 패턴

```typescript
// packages/daemon/src/infrastructure/native-loader.ts [v0.7 보완]
// Source: Node.js SEA Documentation (nodejs.org/api/single-executable-applications.html)
import sea from 'node:sea'
import { writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * SEA 환경에서 native addon을 로딩한다.
 * 비-SEA 환경에서는 일반 require()로 폴백한다.
 */
function loadNativeAddon(assetName: string, fallbackRequire: () => any): any {
  if (!sea.isSea()) {
    return fallbackRequire()
  }

  const addonPath = join(tmpdir(), `waiaas-${assetName}`)
  try {
    writeFileSync(addonPath, new Uint8Array(sea.getRawAsset(assetName)))
    const mod = { exports: {} as any }
    process.dlopen(mod, addonPath)
    return mod.exports
  } finally {
    // 로딩 후 임시 파일 정리
    if (existsSync(addonPath)) {
      try { rmSync(addonPath) } catch { /* ignore cleanup errors */ }
    }
  }
}

// 사용 예시
const sodiumNative = loadNativeAddon('sodium-native.node', () => require('sodium-native'))
const betterSqlite3 = loadNativeAddon('better_sqlite3.node', () => require('better-sqlite3'))
const argon2Native = loadNativeAddon('argon2.node', () => require('argon2'))
```

## 영향 범위 분석

### DEPS-01 (SIWE viem 전환) 영향받는 문서

| 문서 | 파일 | 영향 범위 | 수정 내용 |
|------|------|-----------|-----------|
| SESS-PROTO | 30-session-token-protocol.md | **핵심** (§3.3.3~3.3.4) | verifySIWE 코드 패턴 교체, 의존성 설명 변경, 시퀀스 다이어그램 내 `SiweMessage.verify()` 참조 |
| OWNR-CONN | 34-owner-wallet-connection.md | 중간 (§5.5 Step 4) | verifySIWE import 경로 변경 |
| API-SPEC | 37-rest-api-complete-spec.md | 소 (§3.2) | 서명 알고리즘 설명에서 `siwe + ethers` -> `viem/siwe` |
| SDK-MCP | 38-sdk-mcp-interface.md | 소 | 서버 사이드 의존성 변경 반영 |
| AUTH-REDESIGN | 52-auth-model-redesign.md | 소 (§3.2) | SIWE 검증 참조 갱신 |

### DEPS-02 (Sidecar 크로스 컴파일) 영향받는 문서

| 문서 | 파일 | 영향 범위 | 수정 내용 |
|------|------|-----------|-----------|
| TAURI-DESK | 39-tauri-desktop-architecture.md | **핵심** (§4.1, §11.6) | SEA 빌드 전략 구체화, 6개 플랫폼 확정, native addon 번들 방법 |
| MONOREPO | 24-monorepo-data-directory.md | 소 | 의존성 정리 (siwe, ethers 제거) 반영 |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `siwe` npm + `ethers` v6 | `viem/siwe` 내장 모듈 | viem v2.0+ (2024) | ethers 의존성 제거, 번들 사이즈 ~130KB 절감 |
| Node.js SEA multi-step (postject) | `node --build-sea` 단일 명령 | Node.js 25.5 (2026-01) | 빌드 과정 단순화 (설계 문서는 Node.js 22 기준 유지) |
| pkg (Vercel) | Node.js SEA (내장) | Node.js 20+ | pkg는 deprecated, SEA는 공식 지원 |

**Deprecated/outdated:**
- `siwe` npm 패키지: viem v2.x에 기능이 통합되어 별도 패키지 불필요
- `ethers` v6 (SIWE 용도): siwe 패키지의 peer dependency로만 사용되었으며, viem 전환으로 불필요
- `pkg` (Vercel): 2024년 deprecated. Node.js SEA가 공식 대안.

## 타겟 플랫폼 매트릭스 (DEPS-02)

| # | Target Triple | OS | Arch | CI Runner | Priority | Native Prebuild |
|---|--------------|-----|------|-----------|:--------:|:---------------:|
| 1 | aarch64-apple-darwin | macOS | ARM64 | macos-14 (M1) | P0 | O |
| 2 | x86_64-apple-darwin | macOS | x64 | macos-13 | P0 | O |
| 3 | x86_64-pc-windows-msvc | Windows | x64 | windows-2022 | P1 | O |
| 4 | x86_64-unknown-linux-gnu | Linux | x64 | ubuntu-22.04 | P1 | O |
| 5 | aarch64-unknown-linux-gnu | Linux | ARM64 | ubuntu-22.04 ARM64 | P2 | O |
| 6 | aarch64-pc-windows-msvc | Windows | ARM64 | - | **제외** | X (미제공) |

**제외 근거 (ARM64 Windows):**
- sodium-native: ARM64 Windows prebuild 미제공
- argon2: ARM64 Windows prebuild 미제공 (Windows Server 2022 x86-64만)
- Tauri: ARM64 Windows 빌드 지원은 실험적
- 시장 점유율 미미 (2026년 기준)

### Native Addon별 Prebuild 현황

| Package | Build Tool | Prebuild 제공 플랫폼 |
|---------|------------|---------------------|
| `sodium-native` v5.x | prebuildify + node-gyp-build | darwin-x64, darwin-arm64, linux-x64, linux-arm64, win32-x64 |
| `better-sqlite3` v12.x | prebuild-install | darwin-x64, darwin-arm64, linux-x64, linux-arm64, win32-x64, linux-musl |
| `argon2` v0.43+ | @mapbox/node-pre-gyp | ubuntu x64/arm64, macOS x64/arm64, windows x64, alpine x64/arm64 |

**Confidence:** MEDIUM -- sodium-native의 정확한 prebuild 목록은 npm 패키지 내부 확인이 필요. argon2의 prebuild 목록은 GitHub README에서 확인.

## Open Questions

1. **sodium-native SEA 호환성**
   - What we know: sodium-native은 prebuildify + node-gyp-build 사용. prebuilds/ 디렉토리에 플랫폼별 .node 파일 존재.
   - What's unclear: SEA assets로 .node 파일을 번들한 후 process.dlopen()으로 로딩 시 libsodium의 동적 링크 의존성이 문제될 수 있음.
   - Recommendation: 설계 문서에 "구현 시 SEA 번들링 검증 필요, 실패 시 동반 파일 전략으로 전환" 주석 포함.

2. **Node.js 22 vs 25.5 SEA 빌드**
   - What we know: 현재 설계는 Node.js 22 기준. Node.js 25.5부터 `--build-sea` 단일 명령 지원.
   - What's unclear: 프로젝트의 Node.js 버전 정책. 22 LTS 유지 vs 25.x 도입.
   - Recommendation: 설계 문서는 Node.js 22 기준으로 작성하되, 25.5+ 환경에서의 개선 사항을 주석으로 기록.

3. **Linux ARM64 Docker postject 이슈**
   - What we know: postject가 생성하는 ELF에 hash table 문제가 있어 process.dlopen() 시 크래시 가능 (postject#105).
   - What's unclear: 이 이슈가 해결되었는지, Node.js 25.5+의 `--build-sea`에서도 동일 문제인지.
   - Recommendation: Linux ARM64 빌드는 P2 우선순위이므로, non-container 환경 빌드를 기본 전략으로. Docker 빌드는 구현 시 검증.

## Sources

### Primary (HIGH confidence)
- [viem verifySiweMessage source](https://github.com/wevm/viem/blob/main/src/actions/siwe/verifySiweMessage.ts) -- 함수 시그니처, 내부 로직 확인
- [viem parseSiweMessage source](https://github.com/wevm/viem/blob/main/src/utils/siwe/parseSiweMessage.ts) -- regex 기반 파싱 로직 확인
- [viem validateSiweMessage source](https://github.com/wevm/viem/blob/main/src/utils/siwe/validateSiweMessage.ts) -- 검증 체크리스트 확인
- [viem createSiweMessage source](https://github.com/wevm/viem/blob/main/src/utils/siwe/createSiweMessage.ts) -- 메시지 생성 + 필드 검증
- [Node.js SEA Documentation](https://nodejs.org/api/single-executable-applications.html) -- assets, process.dlopen, --build-sea
- 기존 설계 문서 (30, 34, 37, 38, 39, 52번) -- 현재 SIWE/Sidecar 설계 확인

### Secondary (MEDIUM confidence)
- [Node.js 25.5 --build-sea announcement](https://progosling.com/en/dev-digest/2026-01/nodejs-25-5-build-sea-single-executable) -- SEA 빌드 개선
- [node-argon2 README](https://github.com/ranisalt/node-argon2) -- prebuild 플랫폼 목록
- [Tauri v2 Sidecar docs](https://v2.tauri.app/develop/sidecar/) -- externalBin 명명 규칙
- [prebuildify npm](https://www.npmjs.com/package/prebuildify) -- prebuild 바이너리 번들링

### Tertiary (LOW confidence)
- sodium-native prebuild 목록 -- npm 패키지 내부 구조 직접 확인 필요
- Linux ARM64 Docker postject 이슈 현황 -- 해결 여부 미확인

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - viem/siwe API는 소스 코드로 검증, native addon 목록은 공식 문서 기반
- Architecture: HIGH (SIWE 전환) / MEDIUM (SEA 번들링) - SIWE는 확정적, SEA+native addon은 구현 시 검증 필요
- Pitfalls: HIGH - 알려진 이슈(postject#105, argon2 경로)를 문서화

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (30일 -- viem/Node.js SEA 모두 안정적)
