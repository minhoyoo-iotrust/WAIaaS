# 468. Desktop 릴리즈를 메인 릴리즈 파이프라인에 통합

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-04-01
- **관련 파일:** `.github/workflows/release.yml`, `.github/workflows/desktop-release.yml`, `release-please-config.json`

## 현황

Desktop App 빌드(`desktop-release.yml`)가 `desktop-v*` 태그 수동 push로만 트리거된다. 패키지 릴리즈(npm + Docker)와 별도로 운영되므로 버전이 분리되고, 릴리즈 시점이 어긋날 수 있다.

## 개선 내용

release.yml의 Gate 2(manual approval) 승인 후 npm deploy와 Desktop 빌드가 **병렬로** 실행되도록 통합한다.

### 목표 흐름

```
Release PR 머지
  → release published
    → test + docker + publish-check (병렬)
      → Gate 2 manual approval
        ├─ deploy (npm publish)
        └─ trigger-desktop (3-platform 바이너리 → GitHub Releases)
```

### 작업 항목

1. **`release.yml`**: `trigger-desktop` job 추가 — `deploy`와 동일한 `environment: production` 의존, `desktop-release.yml`을 `workflow_call`로 호출
2. **`desktop-release.yml`**: `workflow_call` 트리거 추가 (기존 `push: tags` + `workflow_dispatch` 유지)
3. **`release-please-config.json`**: `apps/desktop/src-tauri/tauri.conf.json`의 `version` 필드를 release-please 범핑 대상에 추가하여 패키지와 Desktop 버전 동기화

### 제약 조건

- Desktop 빌드 실패가 npm deploy를 블로킹하면 안 됨 (병렬 실행으로 해결)
- 기존 `desktop-v*` 태그 수동 트리거와 `workflow_dispatch`는 유지 (핫픽스용)

## 테스트 항목

- [ ] Release PR 머지 → Gate 2 승인 후 npm publish와 Desktop 빌드가 동시에 시작되는지 확인
- [ ] Desktop 빌드 실패 시 npm publish가 정상 완료되는지 확인
- [ ] release-please가 `tauri.conf.json` version을 정상 범핑하는지 확인
- [ ] 기존 `desktop-v*` 태그 push로도 Desktop 빌드가 정상 동작하는지 확인 (호환성)
