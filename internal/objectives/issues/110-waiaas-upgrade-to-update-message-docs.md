# 110 — 소스코드 메시지 및 문서에서 `waiaas upgrade` → `waiaas update` 일괄 변경

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** TBD
- **상태:** FIXED
- **등록일:** 2026-02-20

## 현상

이슈 102에서 CLI 명령어는 `update`(주) / `upgrade`(별칭)으로 변경 완료되었으나, 데몬 소스코드 내 사용자 출력 메시지와 배포 문서에 `waiaas upgrade`가 잔존한다. 사용자가 에러 메시지나 문서를 보고 `waiaas upgrade`를 주 명령어로 오인할 수 있다.

## 수정 범위

### 1. 소스코드 (사용자에게 출력되는 메시지)

| 파일 | 위치 | 현재 | 변경 |
|------|------|------|------|
| `packages/daemon/src/infrastructure/database/compatibility.ts` | L66 | `waiaas upgrade` | `waiaas update` |
| `packages/daemon/src/infrastructure/database/compatibility.ts` | L78 | `waiaas upgrade` | `waiaas update` |

### 2. 테스트 (assert 문자열)

| 파일 | 위치 | 변경 |
|------|------|------|
| `packages/daemon/src/__tests__/schema-compatibility.test.ts` | L65, L77, L152 | `waiaas upgrade` → `waiaas update` |
| `packages/daemon/src/__tests__/upgrade-flow-e2e.test.ts` | L231, L343 | `waiaas upgrade` → `waiaas update` |

### 3. 사용자 문서

| 파일 | 위치 | 변경 |
|------|------|------|
| `docs/deployment.md` | L74 | 섹션 제목 `Upgrade` → `Update` |
| `docs/deployment.md` | L78 | `waiaas upgrade` → `waiaas update` |
| `docs/deployment.md` | L84 | `waiaas upgrade` → `waiaas update` |
| `docs/deployment.md` | L432 | `waiaas upgrade` → `waiaas update` |

### 4. 이슈 파일 (미래 구현 설명)

| 파일 | 위치 | 변경 |
|------|------|------|
| `internal/objectives/issues/105-notification-channel-update-alert.md` | L36 | `waiaas upgrade` → `waiaas update` |
| `internal/objectives/issues/103-admin-ui-update-available-banner.md` | L24 | `waiaas upgrade` → `waiaas update` |

### 5. 변경 제외 대상

- `.planning/milestones/` 아카이브 문서 — 작성 시점 사실 기록이므로 변경하지 않음
- `.planning/MILESTONES.md`, `PROJECT.md` — 이력 기록이므로 변경하지 않음
- `internal/objectives/archive/` — 완료된 마일스톤 목표 문서이므로 변경하지 않음

## 테스트 항목

### 단위 테스트
1. `schema-compatibility.test.ts` — assert 문자열 변경 후 테스트 통과 확인
2. `upgrade-flow-e2e.test.ts` — assert 문자열 변경 후 테스트 통과 확인

### 검증
3. `grep -r "waiaas upgrade" packages/ docs/` 실행 시 매칭 0건 확인
