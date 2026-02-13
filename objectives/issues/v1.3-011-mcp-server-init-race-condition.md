# BUG-011: MCP 서버 초기화 순서로 인한 Claude Desktop 타임아웃

## 심각도

**MEDIUM** — MCP 서버 프로세스 기동 시 Claude Desktop이 간헐적으로 타임아웃하여 재시작 사이클 발생. 도구 호출 자체는 재시작 후 정상 동작하나, 사용자에게 "평소보다 오래 걸리고 있습니다 (2/10번째 시도)" 메시지가 노출됨.

## 증상

Claude Desktop에서 WAIaaS MCP 도구(get_address, get_balance 등) 호출 시:
- "평소보다 오래 걸리고 있습니다. 곧 다시 시도합니다 (2/10번째 시도)" 메시지 표시
- 데몬 로그에서는 `GET /v1/wallet/address 200 4ms`로 정상 응답
- get_address(DB 조회, RPC 불필요)에서도 동일 증상 발생

## 원인 가설: `sessionManager.start()` → `server.connect()` 순서

### 현재 코드 (`packages/mcp/src/index.ts` 27-47행)

```typescript
async function main(): Promise<void> {
  const sessionManager = new SessionManager({...});

  await sessionManager.start();          // ← (1) 토큰 파일 읽기 + JWT 파싱 (disk I/O)

  const apiClient = new ApiClient(...);
  const server = createMcpServer(...);
  const transport = new StdioServerTransport();

  await server.connect(transport);        // ← (2) 여기서 비로소 stdio JSON-RPC 응답 가능
}
```

### 레이스 컨디션 시퀀스

```
T+0ms    Claude Desktop이 MCP 서버 프로세스 시작 (node index.js)
T+2ms    "Server started and connected successfully" (프로세스 spawn 완료)
T+200ms  Claude Desktop이 stdin으로 {"method":"initialize"} 전송
         ↑ 이 시점에 main()은 아직 await sessionManager.start() 중
         ↑ server.connect(transport) 미호출 → stdin 메시지에 응답 불가
T+420ms  Claude Desktop 타임아웃 → Client transport closed
T+~10s   Claude Desktop이 프로세스를 재시작
```

### 로그 증거

**사례 1: 실패 (`2026-02-12T04:54:50`) — macOS 슬립 복귀 후**
```
04:54:50.232Z  Server started and connected successfully    ← 프로세스 spawn
04:54:50.435Z  Message from client: initialize              ← 200ms 후
04:54:50.655Z  Client transport closed                      ← 220ms 후 타임아웃
04:54:50.657Z  Server transport closed (intentional shutdown)
               (Token loaded 로그 없음!)                     ← sessionManager.start() 미완료
```

**사례 2: 성공 (`2026-02-12T04:55:12`) — 재시작 후**
```
04:55:12.394Z  Message from client: initialize
               [waiaas-mcp:session] Token loaded, expires in 30095s    ← start() 완료
               [waiaas-mcp] Server started on stdio transport          ← connect() 완료
04:55:12.691Z  Message from server: initialize result                  ← 정상 응답 (297ms)
```

**사례 3: 실패 (`2026-02-12T11:12:35`) — Claude Desktop 재시작 직후**
```
11:12:35.775Z  Message from client: initialize
11:12:36.258Z  Client transport closed                      ← ~480ms 후 타임아웃
               (Token loaded 로그 없음!)
```

### 패턴 분석: 성공/실패 사례 비교

| 시각 | Token loaded 로그 | initialize 응답 | 결과 | 상황 |
|------|:---:|:---:|------|------|
| 02-11 13:20:09 | O | O | 정상 | 최초 기동 |
| 02-11 16:47:44 | O | O | 정상 | 정상 재시작 |
| 02-12 00:04:45 | O | O | 정상 | 정상 재시작 |
| 02-12 04:54:50 | **X** | **X** | **타임아웃** | macOS 슬립 복귀 |
| 02-12 04:55:12 | O | O | 정상 | 위 실패 후 재시작 |
| 02-12 11:12:35 | **X** | **X** | **타임아웃** | Claude Desktop 재시작 |
| 02-12 11:31:38 | O | O | 정상 | 재시작 후 |
| 02-12 11:33:49 | O | O | 정상 | 빠른 재시작 |
| 02-12 11:34:30 | O | O | 정상 | 빠른 재시작 |

## 이전 버전에서 발생하지 않은 이유

이 레이스 컨디션은 **v1.3(Phase 62, MCP 서버 구현) 이후 항상 존재하던 잠재 버그**이다. 이전에 문제가 없었던 것은 다음 조건이 충족되었기 때문:

### 1. 레이스 윈도우가 극히 좁음 (~200ms)

`sessionManager.start()` = 토큰 파일 읽기(`readFile`) + JWT base64url 디코딩. 일반적으로 **1-5ms**면 완료된다. 정상 상태에서는 `start()` → `connect()` → `initialize` 응답이 Claude Desktop 타임아웃 이내에 모두 완료.

### 2. 디스크 I/O 지연이 트리거

실패가 발생하는 시점:
- **macOS 슬립 복귀** (`04:54:50`): 디스크 캐시 무효화로 파일 읽기 지연
- **Claude Desktop 재시작** (`11:12:35`): 2개 MCP 서버 동시 spawn + 모듈 로딩 경합

이전 테스트에서는:
- 단일 MCP 서버만 사용 (v1.3.3 이전에는 다중 에이전트 미지원)
- 짧은 테스트 세션 (슬립 복귀 시나리오 미발생)
- 빌드 직후가 아닌 워밍된 상태에서 테스트

### 3. v1.3.3(다중 에이전트) 이후 악화

v1.3.3에서 다중 에이전트 MCP 지원을 추가하면서:
- Claude Desktop이 **2개의 MCP 서버 프로세스를 동시에** spawn
- 2개 Node.js 프로세스가 동시에 모듈 로딩 + 파일 I/O → 디스크 경합 증가
- 개별 프로세스의 `sessionManager.start()` 지연 확률 증가

### 4. `pnpm build` 이후 OS 디스크 캐시 갱신

`pnpm build`로 `dist/` 파일 재생성 시:
- Node.js `import()` 체인에서 참조하는 `.js` 파일이 모두 새로 써짐
- OS 파일 시스템 캐시가 갱신되어 첫 로딩 시 디스크 I/O 증가
- `@modelcontextprotocol/sdk` 등 의존성 모듈 로딩도 영향

### 요약

```
 v1.3   MCP 서버 구현        → 레이스 컨디션 잠재 (단일 서버, 짧은 세션에서 미발현)
 v1.3.3 다중 에이전트 추가    → 2개 서버 동시 spawn으로 발현 확률 증가
 v1.4.1 빌드 후 수동 테스트   → 디스크 캐시 갱신 + 슬립 복귀로 실제 발현
```

## 가설 검증 방법

### 방법 1: 로그 타이밍 확인 (비침습적)

`sessionManager.start()` 시작/종료 시점에 타임스탬프를 출력하여, `initialize` 메시지 수신 시점과 비교:

```typescript
// packages/mcp/src/index.ts에 임시 로그 추가
console.error(`[waiaas-mcp] sessionManager.start() BEGIN ${Date.now()}`);
await sessionManager.start();
console.error(`[waiaas-mcp] sessionManager.start() END ${Date.now()}`);
// ...
await server.connect(transport);
console.error(`[waiaas-mcp] server.connect() END ${Date.now()}`);
```

예상 결과:
- 타임아웃 사례에서 `start() END` 타임스탬프가 `Client transport closed` 이후
- 정상 사례에서 `start() END`가 `initialize` 메시지 이전

### 방법 2: 순서 변경으로 확인 (수정 적용)

`server.connect(transport)`를 `sessionManager.start()` 이전으로 이동. 타임아웃이 사라지면 가설 확인.

### 방법 3: 인위적 지연으로 재현

```typescript
// main() 시작 부분에 추가
await new Promise(r => setTimeout(r, 500));  // 500ms 지연 강제
await sessionManager.start();
```

이 상태로 Claude Desktop 재시작 시 **100% 타임아웃 재현** 예상.

## 수정안

### `packages/mcp/src/index.ts` main() 함수

```typescript
// Before — sessionManager.start()가 transport 연결을 차단
await sessionManager.start();          // (1) disk I/O — 수백 ms 소요 가능
const apiClient = new ApiClient(...);
const server = createMcpServer(...);
const transport = new StdioServerTransport();
await server.connect(transport);       // (2) 여기서야 initialize 응답 가능

// After — transport를 먼저 연결하여 initialize 즉시 응답
const apiClient = new ApiClient(sessionManager, BASE_URL);
const server = createMcpServer(apiClient, { agentName: AGENT_NAME });
const transport = new StdioServerTransport();
await server.connect(transport);       // (1) 즉시 stdio 연결 — initialize 응답 가능
await sessionManager.start();          // (2) 이후 토큰 로드 — 도구 호출 전까지 완료
```

**안전성**: `sessionManager.start()` 완료 전 도구 호출이 오면 `getToken()` → `null` (SessionManager 초기 state='error') → ApiClient가 `{ ok: false, expired: true }` 반환 → 기존 degraded mode 동작 (SMGI-03). 설계 문서에서 이미 정의된 정상 경로.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 파일 | `packages/mcp/src/index.ts` (27-47행) |
| 기능 영향 | MCP 서버 초기화 시 간헐적 타임아웃 → Claude Desktop 재시작 사이클 |
| 빈도 | macOS 슬립 복귀, Claude Desktop 재시작, 다중 MCP 서버 동시 기동 시 |
| 도구 호출 | 재시작 후 정상 동작 (get_address ~6-54ms, get_balance ~118-2216ms) |
| 우회 방법 | Claude Desktop 재시작 또는 대기하면 자동 복구 |

## 재발 방지 테스트

### 1. 초기화 순서 테스트 (필수)

```typescript
it('server.connect()가 sessionManager.start()보다 먼저 호출된다', async () => {
  const callOrder: string[] = [];
  const mockTransport = { /* ... */ };

  // server.connect()를 모니터링
  const origConnect = server.connect.bind(server);
  server.connect = async (t) => { callOrder.push('connect'); return origConnect(t); };

  // sessionManager.start()를 모니터링
  const origStart = sessionManager.start.bind(sessionManager);
  sessionManager.start = async () => { callOrder.push('start'); return origStart(); };

  await main();

  expect(callOrder[0]).toBe('connect');
  expect(callOrder[1]).toBe('start');
});
```

### 2. 지연된 세션 초기화에서도 initialize 응답 확인 (권장)

```typescript
it('sessionManager.start()가 500ms 걸려도 initialize 응답은 즉시 반환된다', async () => {
  // sessionManager.start()에 500ms 지연 주입
  // server.connect() 후 즉시 initialize 메시지 전송
  // 100ms 이내에 initialize 응답 수신 확인
});
```

---

*발견일: 2026-02-12*
*마일스톤: v1.3 (MCP 서버 구현), v1.3.3에서 악화 (다중 에이전트)*
*상태: FIXED*
*관련: 없음 (신규 발견)*
