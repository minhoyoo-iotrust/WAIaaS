# v2.0-065: CI coverage report 경로 이중화 — working-directory + 절대 경로 충돌

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **발견일:** 2026-02-17
- **마일스톤:** v2.0

## 현상

CI stage2의 `vitest-coverage-report-action` 4개 step이 모두 ENOENT 에러로 실패.

```
Error: ENOENT: no such file or directory, open
  '/home/runner/.../packages/core/packages/core/coverage/coverage-summary.json'
```

## 원인

`working-directory`와 `json-summary-path`가 동시에 설정되면 경로가 이중으로 결합됨.

```yaml
# 현재 (잘못된 설정)
working-directory: packages/core
json-summary-path: packages/core/coverage/coverage-summary.json
# → packages/core + packages/core/coverage/... = 이중 경로
```

## 해결 방안

`json-summary-path`와 `json-final-path`를 `working-directory` 기준 상대 경로로 변경:

```yaml
working-directory: packages/core
json-summary-path: coverage/coverage-summary.json
json-final-path: coverage/coverage-final.json
```

4개 패키지(core, daemon, adapter-solana, sdk) 모두 동일하게 수정.

## 영향 범위

- CI stage2: 커버리지 리포트 4건 전체 실패
- PR #2 머지 차단
