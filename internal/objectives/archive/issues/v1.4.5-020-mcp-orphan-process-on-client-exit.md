# 020: MCP 서버 프로세스가 Claude Desktop 종료 후 고아로 잔류

## 심각도

**MEDIUM** — 기능에는 영향 없으나, Claude Desktop을 종료/재시작할 때마다 고아 Node.js 프로세스가 누적되어 메모리를 점유한다.

## 증상

- Claude Desktop 종료 후에도 `node packages/mcp/dist/index.js` 프로세스가 계속 살아 있음
- `disclaimer` 래퍼 프로세스의 PPID가 `1`(launchd)로, 원래 부모 프로세스가 이미 종료된 상태
- Claude Desktop을 여러 번 재시작하면 MCP 프로세스가 누적

## 재현

```
1. Claude Desktop 실행 (WAIaaS MCP 서버 연결 상태)
2. Claude Desktop 종료 (Cmd+Q)
3. ps aux | grep mcp/dist → Node.js 프로세스 잔존 확인
4. ps -o pid,ppid,comm -p <PID> → PPID = 1 (고아 프로세스)
```

## 원인

### Claude Desktop 측 (외부)

Claude Desktop이 MCP 서버를 spawn할 때 `disclaimer` 래퍼를 통해 실행한다:

```
Claude Desktop → disclaimer → node mcp/dist/index.js
```

Claude Desktop 종료 시 `disclaimer` 프로세스에 SIGTERM을 보내지 않거나, `disclaimer`가 자식 프로세스에 시그널을 전달하지 않아 Node.js 프로세스가 고아로 남는다.

### WAIaaS MCP 서버 측 (내부)

`packages/mcp/src/index.ts:51-60`에서 SIGTERM/SIGINT만 처리하고, **stdin 종료 감지**가 없다:

```typescript
// 현재 코드 — SIGTERM/SIGINT만 처리
process.on('SIGTERM', () => { ... });
process.on('SIGINT', () => { ... });
// stdin 종료 시 자체 종료하는 로직 없음
```

MCP 프로토콜은 stdio 기반이므로, 클라이언트(Claude Desktop)가 종료되면 stdin pipe가 닫힌다. 이를 감지하면 자체 종료할 수 있다.

## 수정안

### 1. SIGTERM 핸들러 개선 — 강제 종료 타임아웃 추가

현재 SIGTERM 핸들러는 `server.close()`를 호출하지만, stdio transport가 이미 끊어진 상태에서 close가 완료되지 않아 프로세스가 걸린다. 타임아웃 후 `process.exit()`로 강제 종료한다:

```typescript
// packages/mcp/src/index.ts — 변경
function shutdown() {
  console.error('[waiaas-mcp] shutting down');
  sessionManager.dispose();
  void server.close();
  // server.close()가 완료되지 않는 경우를 대비한 강제 종료
  setTimeout(() => {
    console.error('[waiaas-mcp] force exit after timeout');
    process.exit(0);
  }, 3_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

### 2. stdin 종료 감지 — 클라이언트 연결 해제 시 자체 종료

`process.stdin`의 `end` 또는 `close` 이벤트를 감지하여 자체 종료한다:

```typescript
// packages/mcp/src/index.ts — 추가
process.stdin.on('end', () => {
  console.error('[waiaas-mcp] stdin closed (client disconnected), shutting down');
  shutdown();
});

process.stdin.on('close', () => {
  console.error('[waiaas-mcp] stdin closed, shutting down');
  shutdown();
});
```

### 3. 대안: 부모 프로세스 감시

stdin 이벤트가 발생하지 않는 환경을 대비하여, 주기적으로 부모 프로세스 존재 여부를 확인하는 방법도 있다:

```typescript
const parentPid = process.ppid;
setInterval(() => {
  try {
    process.kill(parentPid, 0); // 프로세스 존재 확인 (시그널 미전송)
  } catch {
    console.error('[waiaas-mcp] parent process gone, shutting down');
    process.exit(0);
  }
}, 10_000);
```

단, PPID가 이미 `1`(launchd)로 reparent된 경우에는 부모가 항상 살아있으므로 이 방법은 `disclaimer` → `node` 관계에서만 유효하다. **수정안 1+2가 필수, 3은 보조**이다.

## 재발 방지 테스트

### T-1: stdin 종료 시 프로세스 자체 종료

MCP 서버를 spawn한 뒤 stdin을 닫으면, 프로세스가 지정 시간 내에 종료되는지 검증.

```
spawn('node', ['mcp/dist/index.js'], { stdio: ['pipe', ...] })
→ child.stdin.end()
→ child가 5초 내 exit assert
```

### T-2: SIGTERM 시 타임아웃 내 종료

MCP 서버에 SIGTERM을 보내면, stdio transport 상태와 무관하게 3초 타임아웃 내에 프로세스가 종료되는지 검증.

```
spawn → kill(child.pid, 'SIGTERM') → child가 3초 내 exit assert
```

### T-3: shutdown 중복 호출 안전성

stdin 종료와 SIGTERM이 동시에 발생해도 에러 없이 한 번만 종료되는지 검증.

## 영향 범위

| 항목 | 내용 |
|------|------|
| 수정 파일 | `packages/mcp/src/index.ts` — stdin close 핸들러 추가 |
| 테스트 파일 | `packages/mcp/src/__tests__/` — T-1, T-2 추가 |
| 영향 기능 | MCP 서버 라이프사이클 |
| Claude Desktop 측 | 별도 수정 필요 (Anthropic 이슈로 보고 권장) |

---

*발견일: 2026-02-14*
*마일스톤: v1.4.5*
*상태: RESOLVED (v1.4.8, Phase 121-01)*
*유형: BUG*
*관련: `packages/mcp/src/index.ts` graceful shutdown*
