# 마일스톤 m32-02: 보안 패치

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

운영 환경 노출 시 악용될 수 있는 보안 취약점 5건을 패치한다. SSRF, Rate Limit 미적용, Host Guard 우회, CORS 미들웨어 부재, 리소스 누수(알림 채널 timeout + EventBus 리스너)를 수정하여 API 보안 기반을 확보한다.

---

## 배경

코드베이스 보안 분석에서 다음 취약점이 확인되었다:

| ID | 심각도 | 이슈 | 현재 상태 |
|----|--------|------|----------|
| S-1 | **High** | Admin RPC Test 엔드포인트 SSRF | `validateUrlSafety()` 미적용 — 내부 네트워크 프로빙 가능 |
| S-2 | **High** | Rate Limit 설정만 존재, 미들웨어 없음 | `rate_limit_global_ip_rpm` 등 3개 설정이 무효 — 무제한 요청 수용 |
| S-3 | **Medium** | `hostGuard` `startsWith` 체크 우회 | `localhost.evil.com` 통과 가능 |
| S-4 | **Medium** | CORS origins 설정 존재, 미들웨어 미등록 | `cors_origins` 설정이 무효 — `Access-Control-Allow-Origin` 헤더 미전송 |
| S-5 | **Medium** | 알림 채널 fetch timeout 없음 + EventBus 리스너 누적 | Kill Switch 알림 지연 가능, `start()` 재호출 시 이벤트 중복 처리 |

### S-1: SSRF — Admin RPC Test 엔드포인트

`POST /v1/admin/settings/test-rpc`가 관리자 입력 URL을 검증 없이 `fetch()`한다. 기존 `validateUrlSafety()` (x402 SSRF 가드)가 존재하나 이 엔드포인트에는 적용되지 않았다.

```typescript
// admin.ts:1634 — 현재
const response = await fetch(url, {  // NO validateUrlSafety() call
  method: 'POST',
  body: rpcBody,
  signal: AbortSignal.timeout(5000),
});
```

내부 네트워크 프로빙 가능: `http://169.254.169.254/latest/meta-data/` (AWS IMDS), `http://10.0.0.x` 등.

### S-2: Rate Limit 미들웨어 부재

`DaemonConfigSchema`에 3개 rate limit 설정이 정의되어 있으나, `createApp()`에 rate limiting 미들웨어가 등록되지 않았다:

- `rate_limit_global_ip_rpm`: 1000 (기본값)
- `rate_limit_session_rpm`: 300 (기본값)
- `rate_limit_tx_rpm`: 10 (기본값)

Admin UI에서 설정 변경 가능하지만 실제 적용되지 않아 사용자에게 잘못된 보안 기대를 심어준다.

### S-3: hostGuard `startsWith` 우회

```typescript
// host-guard.ts:21
const isLocalhost = LOCALHOST_PATTERNS.some(
  (pattern) => hostname === pattern || hostname.startsWith(pattern),
);
```

`'localhost.evil.com'.startsWith('localhost')` → `true`. 리버스 프록시/Docker 환경에서 Host 헤더 조작 시 우회 가능.

### S-4: CORS 미들웨어 부재

`cors_origins` 설정이 Admin Settings에 등록되어 있고 hot-reload도 지원하지만, `hono/cors` 미들웨어가 `createApp()`에 없다. `Access-Control-Allow-Origin` 헤더가 전혀 전송되지 않는다.

### S-5: 리소스 관리 취약점

**알림 채널 timeout 없음:** Ntfy, Discord, Slack 채널의 `send()` 메서드가 `fetch()`에 timeout 없이 호출. 비응답 웹훅 엔드포인트가 알림 큐 전체를 블로킹. 반면 TelegramApi와 NtfySigningChannel은 timeout을 올바르게 적용 중.

**AutoStopService EventBus 리스너 누적:** `start()`에서 `eventBus.on()` 3건 등록, `stop()`에서 `clearInterval()`만 수행하고 리스너 미제거. 재시작 시 동일 이벤트에 대해 중복 처리.

---

## 구현 대상

### Phase 1: SSRF 가드 + hostGuard 수정

| 대상 | 내용 |
|------|------|
| `admin.ts` test-rpc | `validateUrlSafety(url)` 호출 추가. 실패 시 `WAIaaSError('SSRF_BLOCKED')` 반환 |
| `ssrf-guard.ts` 이동 | `services/x402/ssrf-guard.ts` → `infrastructure/security/ssrf-guard.ts`로 이동 (범용화) |
| `host-guard.ts` 수정 | `startsWith` 제거 → 정확 매칭(`hostname === pattern`)만 사용 |
| 테스트 | SSRF 차단 테스트 (로컬 IP, 메타데이터 URL), hostGuard 우회 시도 테스트 |

### Phase 2: Rate Limit 미들웨어 구현

| 대상 | 내용 |
|------|------|
| `rate-limiter.ts` 신규 | 인메모리 sliding-window rate limiter 구현. IP별, 세션별, 트랜잭션별 3계층 |
| `server.ts` 등록 | `createApp()`에 rate limit 미들웨어 추가 |
| SettingsService 연동 | `rate_limit_*` 설정값 읽기 + hot-reload 지원 |
| 429 응답 | `Retry-After` 헤더 포함, `WAIaaSError('RATE_LIMITED')` 코드 추가 |
| 테스트 | 한도 초과 시 429 반환, 한도 내 정상 통과, 설정 변경 반영 테스트 |

### Phase 3: CORS 미들웨어 + 알림 채널 timeout + EventBus 리스너 정리

| 대상 | 내용 |
|------|------|
| `server.ts` CORS | `hono/cors` 미들웨어 등록. `cors_origins` 설정 기반 `origin` 배열. hot-reload 지원 |
| `ntfy.ts` | `fetch()`에 `signal: AbortSignal.timeout(10_000)` 추가 |
| `discord.ts` | `fetch()`에 `signal: AbortSignal.timeout(10_000)` 추가 |
| `slack.ts` | `fetch()`에 `signal: AbortSignal.timeout(10_000)` 추가 |
| `autostop-service.ts` | `stop()`에서 `eventBus.off()` 호출. 리스너 참조를 인스턴스 필드로 저장 |
| 테스트 | CORS preflight 테스트, 허용/차단 origin 테스트, 알림 timeout 테스트, AutoStop start/stop 사이클 테스트 |

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | Rate Limiter 구현 | 외부 라이브러리 vs 인메모리 직접 구현 | **인메모리 직접 구현** — Self-Hosted 데몬이므로 Redis 불필요. 의존성 최소화 원칙. sliding-window 카운터로 충분 |
| 2 | Rate Limit 키 | IP only vs IP+세션 | **3계층** — Global IP RPM(DDoS), Session RPM(세션 남용), TX RPM(트랜잭션 스팸) 분리. 기존 설정 키와 일치 |
| 3 | SSRF 가드 위치 | x402 전용 유지 vs 범용 이동 | **범용 이동** — `infrastructure/security/`로 이동하여 admin, x402, 향후 webhook 등 공용 |
| 4 | hostGuard 수정 범위 | `startsWith` 제거만 vs 전체 재작성 | **`startsWith` 제거만** — 최소 변경으로 우회 차단. 기존 exact match 로직은 정상 |
| 5 | 알림 채널 timeout 값 | 5초 vs 10초 vs 30초 | **10초** — Kill Switch 알림은 긴급하지만 외부 서비스 지연도 고려. TelegramApi 기준과 유사 |
| 6 | EventBus 리스너 정리 | `off()` 호출 vs `AbortController` 패턴 | **`off()` 호출** — EventEmitter 표준 패턴. 리스너 참조를 바인딩된 메서드로 저장 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

### SSRF + hostGuard

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | test-rpc에 로컬 IP 전달 시 차단 | `POST /admin/settings/test-rpc` + `http://169.254.169.254` → 403 | [L0] |
| 2 | test-rpc에 내부 네트워크 IP 전달 시 차단 | `POST /admin/settings/test-rpc` + `http://10.0.0.1` → 403 | [L0] |
| 3 | test-rpc에 정상 RPC URL 전달 시 통과 | `POST /admin/settings/test-rpc` + `https://mainnet.infura.io/...` → 정상 | [L0] |
| 4 | hostGuard `localhost.evil.com` 차단 | `Host: localhost.evil.com` 요청 → 403 | [L0] |
| 5 | hostGuard `localhost` 통과 | `Host: localhost` 요청 → 정상 | [L0] |

### Rate Limit

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 6 | IP RPM 초과 시 429 | 설정값 초과 요청 → 429 + `Retry-After` 헤더 | [L0] |
| 7 | 세션 RPM 초과 시 429 | 동일 세션 토큰으로 설정값 초과 → 429 | [L0] |
| 8 | TX RPM 초과 시 429 | 동일 세션에서 트랜잭션 설정값 초과 → 429 | [L0] |
| 9 | 한도 내 정상 통과 | 한도 미만 요청 → 200 | [L0] |
| 10 | 설정 변경 반영 | Admin Settings에서 한도 변경 → 즉시 반영 | [L1] |

### CORS

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 11 | 허용 origin → CORS 헤더 포함 | `Origin: http://localhost:3100` → `Access-Control-Allow-Origin` 반환 | [L0] |
| 12 | 비허용 origin → CORS 헤더 미포함 | `Origin: http://evil.com` → `Access-Control-Allow-Origin` 없음 | [L0] |
| 13 | Preflight OPTIONS → 정상 응답 | `OPTIONS` 요청 → 200 + CORS 헤더 | [L0] |

### 리소스 관리

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 14 | 알림 채널 timeout 적용 | 비응답 웹훅 → 10초 후 타임아웃 에러 | [L0] |
| 15 | AutoStop start/stop 사이클 | start() 2회 호출 후 이벤트 발생 → 핸들러 1회만 실행 assert | [L0] |

---

## 선행 조건

없음 — 독립적으로 실행 가능. 기존 코드베이스에 대한 순수 패치.

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | Rate Limiter 메모리 누수 | IP별 카운터가 무한 증가 | TTL 기반 자동 정리 (만료된 윈도우 제거) |
| 2 | Rate Limit이 정상 트래픽 차단 | 기본값이 너무 낮으면 AI 에이전트 사용 패턴에서 429 빈발 | 기본값을 관대하게 설정 (IP: 1000, Session: 300, TX: 10). Admin Settings에서 조절 가능 |
| 3 | CORS 미들웨어가 기존 Admin UI 통신 차단 | Admin UI origin이 허용 목록에 없으면 API 호출 실패 | Admin UI는 same-origin 서빙 (CSP `default-src 'none'`)이므로 CORS 불필요. `cors_origins` 기본값에 `localhost:3100` 포함 |
| 4 | SSRF 가드 오탐 | 정상 프라이빗 RPC URL 차단 | 프라이빗 RPC는 일반적으로 public endpoint 사용. 내부 IP RPC가 필요하면 SSRF 가드 예외 설정 옵션 추가 고려 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 3개 |
| 신규 파일 | 2개 (`rate-limiter.ts`, `RATE_LIMITED` 에러 코드) |
| 수정 파일 | 10-12개 |
| 이동 파일 | 1개 (`ssrf-guard.ts`) |
| 테스트 | 15-20개 |
| 예상 LOC 변경 | +600/-50 |

---

*생성일: 2026-03-01*
*관련 분석: 코드베이스 보안 감사 (2026-03-01)*
