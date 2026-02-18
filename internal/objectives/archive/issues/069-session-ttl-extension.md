# Issue #069: 세션 기본 TTL 대폭 연장 + 하드코딩 설정 Admin Settings 이관

- **유형**: ENHANCEMENT
- **심각도**: MEDIUM
- **마일스톤**: v2.0.1
- **상태**: FIXED
- **수정일**: 2026-02-18

## 현황

현재 세션 설정이 AI 에이전트 사용 패턴에 비해 지나치게 짧고, 일부 핵심 값이 하드코딩되어 운영자가 조정할 수 없음:

| 설정 | 현재 값 | 위치 | 문제 |
|------|--------|------|------|
| `session_ttl` | 86,400초 (24시간) | config + Admin Settings | 에이전트를 매일 재설정해야 함 |
| `session_ttl` max 검증 | 604,800초 (7일) | config loader (`.max(604800)`) | 7일 이상 설정 불가 |
| `absoluteExpiresAt` | 30일 | 하드코딩 3곳 | 변경 불가 |
| `maxRenewals` | 30회 | 하드코딩 3곳 + schema default | 변경 불가 |

### 하드코딩 위치

- `sessions.ts:197` — `nowSec + 30 * 86400` (absolute lifetime)
- `sessions.ts:220` — `maxRenewals: 30`
- `mcp.ts:137` — `nowSec + 30 * 86400` (absolute lifetime)
- `mcp.ts:159` — `maxRenewals: 30`
- `telegram-bot-service.ts:683` — `nowSec + 30 * 86400` (absolute lifetime)
- `schema.ts:106` — `.default(30)` (maxRenewals column default)

### 보안 근거

세션 TTL을 대폭 연장해도 다층 보안 체계가 자금을 보호:

1. **4-tier 정책** — 금액별 INSTANT/NOTIFY/DELAY/APPROVAL 분류
2. **Kill Switch** — 즉시 전체 정지 가능
3. **AutoStop** — 이상 패턴 자동 감지 및 정지
4. **누적 지출 한도** — 일/월 롤링 윈도우 상한
5. **Owner 승인** — 고액 거래 서명 필수
6. **세션 즉시 revoke** — masterAuth로 언제든 취소 가능

세션은 "이 에이전트가 누구인지" 식별하는 역할이며, 실질적 보안은 정책 엔진과 모니터링이 담당.

## 변경 사항

### 1. 기본값 변경

| 설정 | 현재 | 변경 |
|------|------|------|
| `session_ttl` 기본값 | 86,400초 (24시간) | **2,592,000초 (30일)** |
| `session_ttl` max 검증 | 604,800초 (7일) | **31,536,000초 (365일)** |
| `absolute_lifetime` 기본값 | 30일 (하드코딩) | **31,536,000초 (365일)** |
| `max_renewals` 기본값 | 30회 (하드코딩) | **12회** |

30일 TTL + 12회 갱신 = 약 1년 유지 가능.

### 2. 하드코딩 제거 → Admin Settings 이관

모든 세션 관련 설정을 Admin Settings에서 조정 가능하도록 변경:

**신규 Admin Settings 키:**

| 키 | 카테고리 | 기본값 | 설명 |
|----|----------|--------|------|
| `security.session_absolute_lifetime` | security | `31536000` (365일) | 세션 절대 수명 (갱신 포함 최대 유효 기간) |
| `security.session_max_renewals` | security | `12` | 세션 최대 갱신 횟수 |

**기존 Admin Settings 키 기본값 변경:**

| 키 | 현재 기본값 | 변경 기본값 |
|----|------------|------------|
| `security.session_ttl` | `86400` | `2592000` |

### 3. 코드 변경

#### config loader (`loader.ts`)
- `session_ttl` max 검증값을 `604800` → `31536000`으로 변경
- `session_ttl` default를 `86400` → `2592000`으로 변경
- `session_absolute_lifetime`, `session_max_renewals` 신규 필드 추가

#### setting-keys.ts
- `security.session_absolute_lifetime` 키 추가
- `security.session_max_renewals` 키 추가
- `security.session_ttl` 기본값 변경

#### sessions.ts
- `30 * 86400` 하드코딩 → `deps.config.security.session_absolute_lifetime` 참조
- `maxRenewals: 30` → `deps.config.security.session_max_renewals` 참조
- hot-reload 시 새 세션부터 적용 (기존 세션은 생성 시점 값 유지)

#### mcp.ts
- 동일하게 하드코딩 제거, config 참조로 변경

#### telegram-bot-service.ts
- 동일하게 하드코딩 제거, config 참조로 변경

#### schema.ts
- `maxRenewals` column default 변경: `.default(30)` → `.default(12)`
- DB 마이그레이션 불필요 (column default는 INSERT 시 적용, 기존 데이터 영향 없음)

### 4. Admin UI

- Settings 페이지 security 카테고리에 신규 필드 2개 자동 노출
- 입력 검증: `session_absolute_lifetime` ≥ `session_ttl`, `session_max_renewals` ≥ 0

### 5. hot-reload 지원

- `security.session_absolute_lifetime`, `security.session_max_renewals`를 hot-reload 대상에 추가
- 변경 즉시 반영 (새로 생성되는 세션부터 적용, 기존 세션은 생성 시점 값 유지)

## 테스트 계획

### 단위 테스트

1. **config loader 테스트** (`config-loader.test.ts`)
   - 신규 기본값 검증: `session_ttl` = 2,592,000, `session_absolute_lifetime` = 31,536,000, `session_max_renewals` = 12
   - `session_ttl` max 검증: 365일(31,536,000) 이하 허용, 초과 시 reject
   - 환경변수 오버라이드: `WAIAAS_SECURITY_SESSION_ABSOLUTE_LIFETIME`, `WAIAAS_SECURITY_SESSION_MAX_RENEWALS`

2. **세션 생성 테스트** (`api-sessions.test.ts`)
   - `absoluteExpiresAt`가 config의 `session_absolute_lifetime` 값 기반으로 계산되는지 검증
   - `maxRenewals`가 config의 `session_max_renewals` 값으로 설정되는지 검증
   - config 변경 시 새 세션에 반영되는지 검증

3. **세션 갱신 테스트** (`api-session-renewal.test.ts`)
   - 변경된 `maxRenewals` (12회) 기준으로 갱신 제한 동작 검증
   - 변경된 `absoluteExpiresAt` (365일) 기준으로 절대 수명 제한 검증
   - `maxRenewals = 0`일 때 갱신 즉시 거부 검증

4. **MCP 세션 테스트** (`mcp-tokens.test.ts`)
   - MCP 세션 생성 시 config 값 참조 검증

5. **Admin Settings 테스트** (`admin-settings-api.test.ts`)
   - 신규 키 `security.session_absolute_lifetime` 읽기/쓰기 검증
   - 신규 키 `security.session_max_renewals` 읽기/쓰기 검증

6. **hot-reload 테스트** (`settings-hot-reload.test.ts`)
   - `session_absolute_lifetime` 변경 시 hot-reload 트리거 검증
   - `session_max_renewals` 변경 시 hot-reload 트리거 검증

### 통합 테스트

7. **E2E 세션 라이프사이클** (`session-lifecycle-e2e.test.ts`)
   - 30일 TTL 세션 생성 → 갱신 12회 → 13회째 거부 전체 흐름
   - Admin Settings에서 값 변경 후 새 세션이 변경된 값으로 생성되는지 검증

### 보안 테스트

8. **세션 보안 테스트** (`security/`)
   - 변경된 기본값으로 기존 보안 테스트 통과 확인
   - `session_absolute_lifetime`을 극단값(0, 음수, 매우 큰 값)으로 설정 시 방어 검증
   - `session_max_renewals`을 0으로 설정 시 갱신 완전 비활성화 검증

## 영향 범위

| 패키지 | 변경 |
|--------|------|
| daemon | sessions.ts, mcp.ts, telegram-bot-service.ts, loader.ts, setting-keys.ts, hot-reload.ts, schema.ts |
| admin | Settings 페이지에 신규 키 자동 노출 (기존 동적 렌더링 구조 활용) |
| skills/ | admin.skill.md 동기화 (신규 설정 키 안내) |

## 완료 기준

- [ ] `session_ttl` 기본값이 30일로 변경됨
- [ ] `session_ttl` config max 검증이 365일로 변경됨
- [ ] `absoluteExpiresAt` 하드코딩 3곳이 모두 config 참조로 변경됨
- [ ] `maxRenewals` 하드코딩 3곳이 모두 config 참조로 변경됨
- [ ] Admin Settings에서 `session_absolute_lifetime`, `session_max_renewals` 조정 가능
- [ ] hot-reload 지원 (데몬 재시작 없이 변경)
- [ ] 단위 테스트 6종 추가/수정
- [ ] 통합 테스트 1종 추가/수정
- [ ] 보안 테스트 1종 추가/수정
- [ ] 기존 테스트 전체 통과
