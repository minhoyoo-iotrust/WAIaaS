# 418 — 데몬 기본 로그 레벨이 debug로 동작하여 불필요한 디버그 로그 출력

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-03-23
- **마일스톤:** —

## 증상

데몬 실행 시 startup/shutdown/hot-reload 과정의 디버그 로그가 항상 출력된다.
`daemon.log_level` 설정이 `info`(기본값)여도 `console.debug()` 직접 호출이 ConsoleLogger 레벨 필터링을 우회하기 때문이다.

## 원인

`daemon-startup.ts`에서 ~35곳, `daemon-shutdown.ts`에서 ~12곳, `hot-reload.ts`에서 ~15곳, `request-logger.ts`에서 1곳이 `console.debug()` 또는 `console.log()`를 직접 호출한다. 이들은 ConsoleLogger 인스턴스를 거치지 않으므로 `daemon.log_level` 설정과 무관하게 항상 출력된다.

ConsoleLogger는 이미 `setLevel()` 핫리로드를 지원하고, Admin Settings에 `daemon.log_level` 키도 정의되어 있으나, 실제 데몬 코어 로그에 적용되지 않고 있다.

## 기대 동작

1. **기본 로그 레벨 `info`**: debug 로그는 출력되지 않음
2. **Admin UI/Settings로 `debug` 전환 시**: 디버그 로그 실시간 출력 (핫리로드)
3. **`config.toml`의 `[daemon] log_level = "debug"`**: 시작 시부터 디버그 로그 출력

## 수정 방안

### 1. DaemonState에 logger 필드 추가

```typescript
// daemon.ts - DaemonState interface + DaemonLifecycle class
import { ConsoleLogger } from '@waiaas/core';

// DaemonState interface에 추가
logger: ConsoleLogger;

// DaemonLifecycle class에 추가
logger: ConsoleLogger = new ConsoleLogger('daemon', 'info');
```

### 2. daemon-startup.ts — ConsoleLogger 생성 및 교체

Step 1에서 config 로드 직후 logger를 생성하고, 이후 모든 `console.debug()` → `state.logger.debug()`, `console.log()` → `state.logger.info()` 교체:

```typescript
// Step 1 config 로드 직후
const configLogLevel = state._config!.daemon.log_level as LogLevel;
state.logger = new ConsoleLogger('daemon', configLogLevel);
state.logger.debug('Step 1: Config loaded, daemon lock acquired');
```

actionLogger도 동일 레벨 사용:

```typescript
// Step 4f에서 기존 actionLogger 생성 로직을 state.logger.level 활용으로 변경
const actionLogLevel = actionDebugEnv ? 'debug' : state.logger.level;
```

### 3. daemon-shutdown.ts — logger 교체

```typescript
state.logger.info(`Shutdown initiated by ${signal}`);
// console.log → state.logger.info, console.warn → console.warn (유지)
```

### 4. hot-reload.ts — daemon.log_level 핫리로드 핸들러 추가

```typescript
// HotReloadDeps에 추가
daemonLogger?: ConsoleLogger | null;

// DAEMON_KEYS 추가
const DAEMON_KEYS = new Set(['daemon.log_level']);

// handleChangedKeys에 추가
if (hasDaemonChanges) {
  const newLevel = ss.get('daemon.log_level') as LogLevel;
  if (this.deps.daemonLogger) {
    this.deps.daemonLogger.setLevel(newLevel);
  }
  console.info(`Hot-reload: Log level changed to '${newLevel}'`);
}
```

console.log/console.warn → deps.daemonLogger 사용으로 교체.

### 5. request-logger.ts — ILogger 주입

```typescript
// console.log → logger.info
```

### 6. HotReloadOrchestrator 초기화 시 logger 전달

```typescript
// daemon-startup.ts Step 5
const hotReloader = new HotReloadOrchestrator({
  ...existing deps,
  daemonLogger: state.logger,
});
```

## 영향 범위

| 파일 | console.debug | console.log | 총 교체 |
|------|:---:|:---:|:---:|
| daemon-startup.ts | ~35 | ~8 | ~43 |
| daemon-shutdown.ts | 0 | ~12 | ~12 |
| hot-reload.ts | 0 | ~15 | ~15 |
| request-logger.ts | 0 | 1 | 1 |
| daemon.ts | 0 | 0 | 2 (필드 추가) |
| **합계** | | | **~73** |

## 테스트 항목

1. **기본 동작**: `log_level = 'info'`(기본)로 데몬 시작 시 startup debug 메시지 미출력 확인
2. **debug 모드**: `config.toml`에서 `log_level = "debug"` 설정 후 시작 시 Step 1~6 debug 메시지 출력 확인
3. **핫리로드**: `PUT /v1/admin/settings`로 `daemon.log_level`을 `debug`로 변경 → 이후 로그에 debug 메시지 출력 시작 확인
4. **핫리로드 역방향**: `debug` → `info` 전환 후 debug 메시지 미출력 확인
5. **shutdown 로그**: `info` 레벨에서 shutdown 시 주요 단계(server closed, DB closed, complete) 출력 확인
6. **WAIAAS_ACTION_DEBUG**: 환경변수로 action logger만 별도 debug 가능 확인
7. **console.warn/error 유지**: fail-soft 경고와 에러 메시지는 레벨 무관하게 항상 출력 확인
