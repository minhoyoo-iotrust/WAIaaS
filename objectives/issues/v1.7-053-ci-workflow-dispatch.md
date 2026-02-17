# v1.7-053: CI workflow에 workflow_dispatch 미지원 — 수동 전체 테스트 실행 불가

- **유형**: ENHANCEMENT
- **심각도**: LOW
- **마일스톤**: v1.7
- **상태**: FIXED
- **발견일**: 2026-02-17

## 설명

`.github/workflows/ci.yml`에 `workflow_dispatch` 트리거가 없어서 GitHub Actions UI에서 수동으로 CI를 실행할 수 없다. 현재 Stage 2(전체 테스트 suite + 커버리지 리포트)는 `pull_request` 이벤트에서만 실행되므로, 수동 트리거 시에도 Stage 2가 실행되도록 조건을 함께 수정해야 한다.

## 현재 동작

- `push → main`: Stage 1만 실행 (affected 패키지, lint+typecheck+unit)
- `pull_request → main`: Stage 1 + Stage 2 (전체 suite + 커버리지)
- 수동 실행: **불가**

## 수정 방안

### 1. `on:` 섹션에 `workflow_dispatch` 추가

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:  # ← 추가
```

### 2. Stage 2 조건 변경

```yaml
# Before:
if: github.event_name == 'pull_request'

# After:
if: github.event_name != 'push'
```

이렇게 하면 push일 때만 Stage 1만 실행되고, PR과 수동 실행 시 Stage 2까지 실행된다.

## 영향 범위

- `.github/workflows/ci.yml` 1곳, 2줄 수정
