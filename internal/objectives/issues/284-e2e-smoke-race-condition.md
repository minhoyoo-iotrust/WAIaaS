# #284 E2E Smoke 워크플로우가 npm publish 전에 실행되어 실패

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v31.7
- **상태:** FIXED
- **수정일:** 2026-03-09
- **발견일:** 2026-03-09

## 증상

`e2e-smoke.yml` 워크플로우가 `on: release: [published]` 이벤트로 트리거되어 `release.yml`과 동시에 시작됨. `release.yml`의 `deploy` job(수동 승인 게이트 포함)이 npm publish를 완료하기 전에 `npm install -g @waiaas/daemon@2.10.0-rc.18`이 실행되어 `ETARGET` 에러로 실패.

## 원인

`release` 이벤트 발생 시 두 워크플로우가 동시에 트리거됨:
1. `release.yml` — test → platform → deploy(수동 승인) → npm publish
2. `e2e-smoke.yml` — npm install (아직 publish 안 됨) → 실패

## 수정 방안

`e2e-smoke.yml`의 트리거를 `on: release` → `on: workflow_run`으로 변경하여 `release.yml` 완료 후에만 실행되도록 함:

```yaml
on:
  workflow_run:
    workflows: ["Release"]
    types: [completed]
```

- `release.yml`의 deploy job에 `environment: production` 수동 승인 게이트가 있으므로, 승인하지 않으면 워크플로우가 미종료 → E2E 미트리거
- 승인 → npm publish 완료 → Release 워크플로우 종료 → E2E 트리거 (정상 순서)
- npm propagation 지연 대비 retry 로직 추가

## 실패 로그

```
npm error code ETARGET
npm error notarget No matching version found for @waiaas/daemon@2.10.0-rc.18.
```

- Run: https://github.com/minhoyoo-iotrust/WAIaaS/actions/runs/22847805611

## 테스트 항목

- [ ] `release.yml` 완료 전에 `e2e-smoke.yml`이 트리거되지 않음 확인
- [ ] `release.yml` deploy job 미승인 시 E2E 미트리거 확인
- [ ] `release.yml` deploy 완료 후 E2E 정상 트리거 + npm install 성공 확인
- [ ] `workflow_dispatch`로 수동 실행 시 버전 지정 정상 동작 확인
