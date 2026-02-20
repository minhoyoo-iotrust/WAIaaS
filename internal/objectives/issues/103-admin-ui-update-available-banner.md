# 103 — Admin UI 대시보드에 업데이트 가능 배너 추가

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** TBD
- **상태:** OPEN
- **등록일:** 2026-02-19

## 현상

Admin UI 대시보드에서 현재 데몬 버전은 StatCard로 표시하지만(`dashboard.tsx:240`), 새 버전이 출시되었는지 여부는 전혀 알 수 없다. 데몬은 이미 `GET /health` 엔드포인트에서 `latestVersion`과 `updateAvailable` 필드를 제공하고 있으나, Admin UI는 이 정보를 사용하지 않는다.

Admin UI는 `GET /v1/admin/status`만 호출하며 (`AdminStatusResponseSchema`에 `latestVersion`/`updateAvailable` 필드 없음), `GET /health`의 버전 체크 데이터를 활용하지 않는다.

## 수정 범위

### 1. 대시보드에 업데이트 배너 추가

대시보드 상단(에러 배너 아래, stat-grid 위)에 업데이트 가능 배너를 조건부 렌더링한다:

```
┌──────────────────────────────────────────────────────────┐
│  ⬆ Update available: 1.7.0 → 2.0.0                      │
│  Run `waiaas update` or see the release notes.            │
└──────────────────────────────────────────────────────────┘
```

- `updateAvailable === true`일 때만 표시
- 현재 버전(`version`)과 최신 버전(`latestVersion`) 함께 표시
- 업그레이드 CLI 명령어 안내 포함

### 2. 버전 정보 데이터 소스

두 가지 접근 중 택 1:

**방안 A:** `GET /health` 별도 호출 (인증 불필요, 가벼움)
- 대시보드 초기 로드 시 `/health` 추가 fetch
- 기존 `/v1/admin/status` 호출과 병렬 실행

**방안 B:** `AdminStatusResponseSchema`에 `latestVersion`/`updateAvailable` 필드 추가
- `/v1/admin/status` 응답에 버전 체크 정보 포함
- VersionCheckService를 admin 라우트에도 주입
- 한 번의 API 호출로 모든 정보 취득

### 3. Version StatCard 개선

기존 Version StatCard에 업데이트 상태 badge 표시:
- `updateAvailable === false` → badge: `success` ("Latest")
- `updateAvailable === true` → badge: `warning` ("Update available")

### 영향 범위

- `packages/admin/src/pages/dashboard.tsx` — 배너 컴포넌트 + Version StatCard badge
- `packages/daemon/src/api/routes/admin.ts` — (방안 B 선택 시) VersionCheckService 주입
- `packages/daemon/src/api/routes/openapi-schemas.ts` — (방안 B 선택 시) AdminStatusResponseSchema 확장
- `packages/admin/src/styles/` — 배너 스타일

## 테스트 항목

### 단위 테스트
1. `updateAvailable === true`일 때 배너가 렌더링되는지 확인
2. `updateAvailable === false`일 때 배너가 렌더링되지 않는지 확인
3. 배너에 현재 버전과 최신 버전이 올바르게 표시되는지 확인
4. Version StatCard에 업데이트 상태 badge가 표시되는지 확인
5. Health API 호출 실패 시 배너 없이 정상 렌더링되는지 확인 (fail-soft)
