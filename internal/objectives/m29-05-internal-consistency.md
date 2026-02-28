# 마일스톤 m29-05: 내부 일관성 정리

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

API 키 이중 저장소 버그(#214)를 수정하고, Solana 네트워크 ID를 EVM과 동일한 `{chain}-{network}` 패턴으로 통일(#211)하여 코드베이스의 내부 일관성을 확보한다.

---

## 배경

### #214 — API 키 이중 저장소 비동기화 (CRITICAL)

Admin UI에서 DeFi 프로바이더 API 키를 설정하면 `ApiKeyStore`(`api_keys` 테이블)에만 저장되지만, 프로바이더는 `SettingsService`(`settings` 테이블)에서 API 키를 읽는다. 두 저장소가 동기화되지 않아 프로바이더가 빈 키로 외부 API를 호출하여 401 인증 에러가 발생한다.

| 저장소 | 테이블 | 쓰기 경로 | 읽기 경로 |
|--------|--------|-----------|-----------|
| `ApiKeyStore` | `api_keys` | Admin UI → `PUT /admin/api-keys/:provider` | action route 가드 (`apiKeyStore.has()`) |
| `SettingsService` | `settings` | `PUT /admin/settings` | `registerBuiltInProviders()` → 프로바이더 config |

**부수 버그:** `hot-reload.ts`의 `BUILTIN_NAMES`에 `aave_v3`, `kamino`가 누락되어 hot-reload 시 중복 등록 가능.

### #211 — Solana 네트워크 ID 프리픽스 불일치 (LOW)

Solana 네트워크 ID가 `mainnet`, `devnet`, `testnet`으로 정의되어 EVM(`ethereum-mainnet`, `base-mainnet` 등)과 네이밍 패턴이 불일치. Admin UI에서 `mainnet`이 어떤 체인인지 구분 불가.

---

## 구현 대상

### Phase 1: API 키 저장소 통합 (#214)

`ApiKeyStore`를 제거하고 `SettingsService`를 유일한 SSoT로 통합한다.

| 대상 | 내용 |
|------|------|
| `ApiKeyStore` 제거 | `api-key-store.ts` 삭제, `api_keys` 테이블 DROP 마이그레이션 |
| 기존 키 마이그레이션 | `api_keys` → `settings` 테이블로 1회 데이터 이전 (데몬 시작 시) |
| Admin API 변경 | `PUT/DELETE /admin/api-keys/:provider` → 내부적으로 `settingsService.set/get` 위임 (API 경로 유지, 하위 호환) |
| Action route 가드 | `apiKeyStore.has()` → `settingsService.get('actions.{name}_api_key') !== ''` 로 교체 |
| Admin UI | `actions.tsx`가 `PUT /admin/api-keys/:provider` 대신 `PUT /admin/settings` 사용, 또는 기존 엔드포인트 유지 (내부 위임) |
| hot-reload 수정 | `BUILTIN_NAMES`에 `aave_v3`, `kamino` 추가 |
| hot-reload rpcCaller | `reloadActionProviders()`에서 `registerBuiltInProviders` 호출 시 `options.rpcCaller` 전달 |
| 이슈 트래커 | `TRACKER.md` #214 상태를 FIXED로 갱신, 마일스톤 필드에 `v29.5` 기입 |

### Phase 2: Solana 네트워크 ID 통일 (#211)

Solana 네트워크 ID에 `solana-` 프리픽스를 추가하여 `{chain}-{network}` 패턴으로 통일한다.

| 대상 | 내용 |
|------|------|
| core 상수 변경 | `SOLANA_NETWORK_TYPES`: `mainnet` → `solana-mainnet`, `devnet` → `solana-devnet`, `testnet` → `solana-testnet` |
| RPC 기본값 키 | `built-in-defaults.ts` 키 변경 |
| config 파싱 | `config.toml` 파서 — `solana_mainnet` → `solana-mainnet` 매핑, 레거시 키 호환 |
| adapter-pool | `rpcConfigKey()`, `configKeyToNetwork()` 매핑 로직 |
| hot-reload | `networkToConfigKey()`, `reloadRpc()`, `reloadRpcPool()` 매핑 |
| DB 마이그레이션 | `wallets.network`, `transactions.network`, `incoming_transactions.network` 등 `mainnet` → `solana-mainnet` UPDATE |
| Admin UI | 네트워크 드롭다운, 필터, 표시 레이블 |
| CLI | 네트워크 파라미터 파싱, 레거시 입력 호환 |
| MCP | 네트워크 파라미터 스키마 |
| SDK | `NetworkType` 타입 정의 |
| DeFi providers | Jupiter, Jito, Kamino 등 Solana 전용 프로바이더의 네트워크 참조 |
| skills 파일 | 네트워크 예시 갱신 |
| 이슈 트래커 | `TRACKER.md` #211 상태를 FIXED로 갱신, 마일스톤 필드에 `v29.5` 기입 |

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | #214 해결 방식 | A(dual write) vs B(ApiKeyStore 제거) vs D(내부 위임) | **B** — `actions.{name}_api_key` 설정 키가 이미 존재하므로 `ApiKeyStore`는 완전 중복. 단일 SSoT가 향후 유지보수 비용 최소화 |
| 2 | `/admin/api-keys/*` API 유지 여부 | 삭제 vs 유지(내부 위임) | **유지(내부 위임)** — 하위 호환성. 내부적으로 `settingsService`에 위임하고 hot-reload 트리거 |
| 3 | `api_keys` 테이블 마이그레이션 | DROP 즉시 vs 비활성화 후 추후 DROP | **마이그레이션 후 DROP** — 기존 키를 `settings`로 이전 후 테이블 제거. 롤백 안전성 위해 마이그레이션 스크립트에서 이전 → DROP 순서 |
| 4 | #211 레거시 호환 | 구버전 입력 즉시 거부 vs 자동 변환 | **자동 변환 + 경고** — CLI/API에서 `mainnet` 입력 시 `solana-mainnet`으로 자동 변환하되 deprecation 경고. DB는 마이그레이션으로 일괄 변환 |
| 5 | config.toml 키 호환 | `solana_mainnet` 즉시 제거 vs 레거시 키 허용 | **레거시 키 허용** — `solana_mainnet`과 `solana_solana_mainnet` 모두 인식. 향후 major 버전에서 레거시 제거 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

### #214 API 키 통합 검증

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | Admin UI에서 API 키 저장 후 프로바이더에 전달 | 키 설정 → 스왑 요청 → 401 미발생 | [L0] |
| 2 | API 키 삭제 시 프로바이더에서 제거 | 키 삭제 → 스왑 요청 → `API_KEY_REQUIRED` 에러 | [L0] |
| 3 | hot-reload로 프로바이더 재생성 | 키 변경 → 기존 프로바이더 unregister + 새 키로 재생성 | [L0] |
| 4 | 기존 `api_keys` 데이터 마이그레이션 | 업그레이드 시 `api_keys` → `settings` 자동 이전 | [L0] |
| 5 | `BUILTIN_NAMES` 전체 프로바이더 포함 | aave_v3, kamino 포함 → hot-reload 시 중복 등록 없음 | [L0] |
| 6 | `/admin/api-keys/*` 하위 호환 | 기존 API 경로로 키 설정 → 정상 동작 | [L1] |

### #211 네트워크 ID 통일 검증

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 7 | `solana-mainnet` 지갑 생성 | `POST /v1/wallets` with `environment: mainnet` → `network: solana-mainnet` | [L0] |
| 8 | 레거시 `mainnet` 입력 자동 변환 | API/CLI에 `mainnet` 전달 → `solana-mainnet`으로 변환 + 경고 | [L0] |
| 9 | DB 마이그레이션 정합성 | 기존 `mainnet` 레코드 → `solana-mainnet`으로 UPDATE | [L0] |
| 10 | config.toml 레거시 키 호환 | `solana_mainnet` RPC 설정 → 정상 인식 | [L0] |
| 11 | Admin UI 네트워크 필터 | 드롭다운에 `solana-mainnet` 표시, `mainnet` 미표시 | [L0] |
| 12 | RPC Pool 키 매핑 | `rpc_pool.solana-mainnet` 설정 → 정상 라우팅 | [L0] |
| 13 | DeFi 프로바이더 네트워크 참조 | Jupiter/Jito/Kamino가 `solana-mainnet` 정상 인식 | [L0] |
| 14 | 전 패키지 기존 테스트 통과 | `pnpm turbo run test:unit` 전체 통과 | [L0] |

---

## 선행 조건

없음 — 독립적으로 실행 가능.

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | #211 전 패키지 변경으로 regression 발생 | 네트워크 ID 참조 누락 시 지갑 생성/트랜잭션 실패 | Grep 기반 전수 조사 + 기존 테스트 전체 통과 확인 |
| 2 | DB 마이그레이션 실패 시 기존 데이터 손상 | 지갑/트랜잭션 네트워크 필드 불일치 | 트랜잭션 내 UPDATE → 실패 시 롤백. 마이그레이션 전 백업 권장 |
| 3 | config.toml 레거시 키 인식 실패 | 기존 사용자 RPC 설정 무효화 | 레거시 → 신규 키 양방향 매핑 + 시작 시 경고 로그 |
| 4 | `ApiKeyStore` 제거 시 SDK/MCP 호환성 | 외부에서 `api_keys` 테이블 직접 참조하는 경우 | `ApiKeyStore`는 daemon 내부 전용 — 외부 노출 API 경로는 유지 |

---

## 완료 시 업데이트 대상

| 대상 | 내용 |
|------|------|
| `TRACKER.md` | #211, #214 상태를 FIXED로 갱신, 마일스톤 필드에 버전 기입 |
| 이슈 파일 | `211-solana-network-id-prefix.md`, `214-api-key-dual-store-desync.md` 상태를 FIXED로 갱신 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 2개 |
| 수정 패키지 | 10개 (core, daemon, admin, cli, mcp, sdk, actions, solana, evm, skills) |
| DB 마이그레이션 | 2건 (#214 api_keys→settings 이전, #211 network 값 변환) |
| 삭제 파일 | 1개 (`api-key-store.ts`) |
| 예상 수정 파일 | 40-60개 |
| 예상 LOC 변경 | +500/-800 (net 삭제 — 중복 코드 제거) |

---

*생성일: 2026-02-28*
*관련 이슈: #211 (Solana 네트워크 ID 프리픽스), #214 (API 키 이중 저장소 비동기화)*
