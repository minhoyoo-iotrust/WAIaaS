# #218 SDK auto-connect — 데몬 자동 탐색 + 옵트인 자동 기동

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **상태:** FIXED
- **패키지:** @waiaas/sdk

---

## 배경

다른 에이전트 프레임워크(GOAT SDK, Coinbase AgentKit, Conway 등)에 WAIaaS Wallet Provider PR을 넣으려면, 통합 패키지의 DX가 좋아야 한다. 현재 WAIaaS를 사용하려면 CLI에서 4개 명령을 순서대로 실행해야 하는데, 이는 PR 리뷰어와 최종 사용자 모두에게 마찰이 된다.

SDK에 `connect()` 메서드를 추가하여 데몬 자동 탐색과 옵트인 자동 기동을 지원한다.

---

## 현재 문제

```bash
# 사용자가 수동으로 4단계를 실행해야 함
npm install -g @waiaas/cli
waiaas init --auto-provision
waiaas start &
waiaas quickset
```

이후 SDK에서 baseUrl과 token을 수동 지정:

```typescript
const client = new WAIaaSClient('http://localhost:3100', 'wai_sess_...');
```

---

## 목표

```typescript
// 데몬이 이미 떠 있으면 — 자동 탐색 + 연결
const client = await WAIaaSClient.connect();

// 데몬이 안 떠 있으면 — 자동 기동 (옵트인)
const client = await WAIaaSClient.connect({ autoStart: true });
```

---

## 설계

### connect() 동작 흐름

```
connect() 호출
│
├─ token이 명시되어 있으면 → 해당 baseUrl + token으로 즉시 연결
│
├─ 1. GET baseUrl/health
│     └─ 성공 → ~/.waiaas/mcp-token 읽기 → 연결 완료
│
├─ 2. 데몬 미실행 + autoStart: false (기본값)
│     └─ Error + 정확한 설치 명령어 안내:
│        "WAIaaS daemon is not running.
│         Setup: npx @waiaas/cli init --auto-provision
│                npx @waiaas/cli start &
│                npx @waiaas/cli quickset
│         Docs: https://github.com/minhoyoo-iotrust/WAIaaS"
│
└─ 3. 데몬 미실행 + autoStart: true (옵트인)
      ├─ ~/.waiaas/ 없으면 → CLI로 init --auto-provision
      ├─ CLI로 start (detached child process)
      ├─ GET /health 폴링 (readiness 대기, 타임아웃 30초)
      ├─ mcp-token 없으면 → CLI로 quickset
      └─ 토큰 읽기 → 연결 완료
```

### 인터페이스

```typescript
interface ConnectOptions {
  baseUrl?: string;           // 기본: 'http://localhost:3100'
  token?: string;             // 직접 지정 시 auto-discovery 스킵
  dataDir?: string;           // 기본: '~/.waiaas'
  autoStart?: boolean;        // 기본: false — 옵트인 시 자동 기동
  startTimeoutMs?: number;    // 기본: 30_000 — readiness 대기 타임아웃
}
```

### CLI 탐색 순서 (autoStart 시)

글로벌 설치된 CLI를 우선 사용하고, 없으면 npx로 폴백한다.

- `npx`는 글로벌 설치하지 않음. `~/.npm/_npx/` 캐시에 임시 다운로드하며, 캐시가 날아가면 재다운로드
- 데몬처럼 지속 실행되는 프로세스는 글로벌 설치가 안정적

```
1. which waiaas → 글로벌 설치 있으면 → waiaas start
2. 없으면 → npx @waiaas/cli start (폴백, 런타임 다운로드)
```

```typescript
import { spawn, execSync } from 'node:child_process';

function resolveCliCommand(): { command: string; args: string[] } {
  try {
    execSync('which waiaas', { stdio: 'ignore' });
    return { command: 'waiaas', args: ['start'] };
  } catch {
    return { command: 'npx', args: ['@waiaas/cli', 'start'] };
  }
}
```

### 설계 원칙

1. **SDK는 가벼운 HTTP 클라이언트를 유지한다** — 데몬/CLI를 의존성으로 포함하지 않음
2. **기본 동작은 안전하다** — 데몬이 없으면 명확한 에러 + 설치 안내 (autoStart: false)
3. **자동 기동은 옵트인이다** — autoStart: true를 명시한 사용자만 자동 기동
4. **기존 코드를 재사용한다** — init, start, quickset 등 새 CLI 명령 불필요

---

## 구현 범위

### 신규

| 항목 | 위치 | 설명 |
|------|------|------|
| `connect()` 정적 메서드 | `@waiaas/sdk` | health check + 토큰 파일 auto-discovery + 에러 안내 |
| `resolveCliCommand()` | `@waiaas/sdk` | which → npx 폴백 |
| `autoStart` spawn 로직 | `@waiaas/sdk` | detached child process + readiness 폴링 + quickset 호출 |

### 기존 재사용 (변경 없음)

- `waiaas init --auto-provision` — 디렉토리 생성, recovery.key 생성
- `waiaas start` — 데몬 실행
- `waiaas quickset` — 지갑 + 세션 생성, mcp-token 저장
- `GET /health` — 데몬 readiness 확인
- `~/.waiaas/mcp-token` — 토큰 파일

---

## 통합 PR에서의 사용 예시

통합 패키지에서 `autoStart: true`를 기본값으로 설정하면, 최종 사용자는 수동 설정 없이 사용 가능.

```typescript
// GOAT SDK Wallet Provider
export async function createWAIaaSWallet(options?: Partial<ConnectOptions>) {
  const client = await WAIaaSClient.connect({ autoStart: true, ...options });
  return new WAIaaSWalletClient(client);
}

// 최종 사용자 코드
import { createWAIaaSWallet } from '@goat-sdk/wallet-waiaas';
const wallet = await createWAIaaSWallet(); // 수동 설정 0단계
```

통합 PR의 Getting Started에는 글로벌 설치를 권장:

```bash
# 권장: 글로벌 설치 (안정적, 빠름)
npm install -g @waiaas/cli
```

---

## 고려 사항

| 항목 | 결정 |
|------|------|
| 데몬 종료 타이밍 | SDK가 시작한 데몬은 SDK 종료 시에도 유지 (detached). 명시적 종료는 `client.stopDaemon()` 제공 |
| 다중 SDK 인스턴스 | 같은 데몬에 여러 SDK가 연결 가능 (세션 공유 또는 별도 세션) |
| 포트 충돌 | 이미 3100 포트 사용 중이면 에러 + 안내 메시지 |
| 보안 | auto-provision은 랜덤 패스워드 + recovery.key 패턴 (기존과 동일) |
| Python SDK | 동일 패턴으로 Python SDK에도 `WAIaaSClient.connect()` 추가 |

---

## 검토한 대안

| 방식 | 채택 여부 | 이유 |
|------|----------|------|
| 글로벌 CLI 우선 + npx 폴백 | 채택 (옵트인) | SDK 가볍게 유지, 글로벌 설치 안정성 + npx 편의성 |
| Docker auto-pull | 미채택 | Docker 필수는 제약이 큼 |
| Pre-built 바이너리 다운로드 | 미채택 | 플랫폼별 빌드 파이프라인 비용 과다. 장기적으로 재검토 가능 |
| Smart error only | 채택 (기본값) | 안전, 예측 가능, 디버깅 용이 |
| SDK에 CLI를 의존성으로 포함 | 미채택 | native 모듈(sodium-native, better-sqlite3, argon2) 포함으로 설치 시간 급증 + 플랫폼 호환성 문제. SDK만 쓰는 사용자(원격 데몬 연결)에게 불필요한 무게 |

---

## 테스트 항목

- connect() health check 성공 시 토큰 파일 읽어 연결
- connect() health check 실패 + autoStart: false → 설치 안내 에러 메시지
- connect() health check 실패 + autoStart: true → CLI spawn + readiness 폴링 + quickset + 연결
- connect({ token, baseUrl }) → auto-discovery 스킵, 직접 연결
- resolveCliCommand() — 글로벌 waiaas 존재 시 우선 사용
- resolveCliCommand() — 글로벌 없을 시 npx 폴백
- autoStart 타임아웃 시 에러
- 데몬이 이미 떠 있는 상태에서 autoStart: true → 중복 spawn 방지

---

*생성일: 2026-03-01*
