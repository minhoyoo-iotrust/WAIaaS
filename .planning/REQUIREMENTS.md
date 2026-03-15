# Requirements: WAIaaS v32.2 보안 패치

**Defined:** 2026-03-15
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.
**Objective:** internal/objectives/m32-02-security-patch.md

## v1 Requirements

### SSRF + Host Guard

- [ ] **SSRF-01**: Admin RPC Test 엔드포인트(`POST /v1/admin/settings/test-rpc`)가 로컬 IP(169.254.x.x) 및 내부 네트워크 IP(10.x.x.x, 172.16-31.x.x, 192.168.x.x)를 차단한다
- [ ] **SSRF-02**: `ssrf-guard.ts`를 `services/x402/` → `infrastructure/security/`로 이동하여 범용 SSRF 가드로 사용한다
- [ ] **SSRF-03**: hostGuard가 `startsWith` 대신 정확 매칭(`===`)만 사용하여 `localhost.evil.com` 같은 prefix 우회를 차단한다
- [ ] **SSRF-04**: SSRF 차단(로컬 IP, 메타데이터 URL) + hostGuard 우회 방지 테스트를 추가한다

### Rate Limit

- [ ] **RATE-01**: 인메모리 sliding-window rate limiter를 구현한다 (만료 윈도우 TTL 자동 정리로 메모리 누수 방지)
- [ ] **RATE-02**: IP별(`rate_limit_global_ip_rpm`), 세션별(`rate_limit_session_rpm`), 트랜잭션별(`rate_limit_tx_rpm`) 3계층 미들웨어를 `createApp()`에 등록한다
- [ ] **RATE-03**: SettingsService `rate_limit_*` 3개 설정값 hot-reload를 지원한다 (Admin Settings 변경 즉시 반영)
- [ ] **RATE-04**: 한도 초과 시 HTTP 429 + `Retry-After` 헤더를 반환하고 `RATE_LIMITED` 에러 코드를 WAIaaSError에 추가한다
- [ ] **RATE-05**: Rate limit 한도 초과 429 반환, 한도 내 정상 통과, 설정 변경 반영 테스트를 추가한다

### CORS + Resource Management

- [ ] **CORS-01**: `hono/cors` 미들웨어를 `cors_origins` 설정값 기반 origin 배열로 `createApp()`에 등록한다 (hot-reload 지원)
- [ ] **CORS-02**: CORS preflight `OPTIONS` 요청에 200 + `Access-Control-Allow-Origin/Methods/Headers` 헤더로 응답한다
- [ ] **RSRC-01**: Ntfy, Discord, Slack 알림 채널의 `send()` 메서드 `fetch()`에 `AbortSignal.timeout(10_000)` 10초 타임아웃을 적용한다
- [ ] **RSRC-02**: AutoStopService `stop()`에서 `eventBus.off()` 호출로 3건 리스너를 제거한다 (재시작 시 중복 방지)
- [ ] **RSRC-03**: CORS preflight/허용/차단 origin 테스트, 알림 채널 timeout 테스트, AutoStop start/stop 사이클 리스너 중복 방지 테스트를 추가한다

## Out of Scope

| Feature | Reason |
|---------|--------|
| 외부 Rate Limiter (Redis) | Self-Hosted 데몬이므로 인메모리로 충분. 의존성 최소화 원칙 |
| SSRF 가드 예외 설정 (내부 IP RPC 허용) | 프라이빗 RPC는 일반적으로 public endpoint 사용. 필요 시 향후 추가 |
| CORS credentials 모드 | Admin UI는 same-origin 서빙이므로 CORS 불필요. 외부 클라이언트용 기본 CORS만 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SSRF-01 | Phase 424 | Pending |
| SSRF-02 | Phase 424 | Pending |
| SSRF-03 | Phase 424 | Pending |
| SSRF-04 | Phase 424 | Pending |
| RATE-01 | Phase 425 | Pending |
| RATE-02 | Phase 425 | Pending |
| RATE-03 | Phase 425 | Pending |
| RATE-04 | Phase 425 | Pending |
| RATE-05 | Phase 425 | Pending |
| CORS-01 | Phase 426 | Pending |
| CORS-02 | Phase 426 | Pending |
| RSRC-01 | Phase 426 | Pending |
| RSRC-02 | Phase 426 | Pending |
| RSRC-03 | Phase 426 | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after initial definition*
