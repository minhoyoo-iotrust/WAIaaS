# v1.6-039: 마일스톤 감사 전 빌드+테스트 자동 실행 훅 추가

## 유형: ENHANCEMENT

## 심각도: MEDIUM

## 현상

`/gsd:audit-milestone`과 `/gsd:complete-milestone` 모두 빌드나 테스트를 실행하지 않는다. 두 스킬은 기존 VERIFICATION.md 파일을 읽는 문서 기반 워크플로우이므로, 여러 phase가 merge된 후 발생하는 cross-phase 빌드 에러를 감지하지 못한다.

실제로 마일스톤 완료 후 `pnpm test` 실행 시 빌드 에러가 발견되는 사례가 반복되고 있다 (v1.6-038 등).

## 기대 동작

마일스톤 감사(`/gsd:audit-milestone`) 실행 전에 `pnpm build && pnpm test`가 자동으로 실행되어, 빌드/테스트 실패 시 감사 진행을 차단한다.

## 제안 방안

프로젝트 범위 Claude Code 훅(`.claude/settings.json`의 `hooks` 키)으로 `PreToolUse` 이벤트에 Skill 호출을 감지하여 audit-milestone 실행 전 빌드+테스트를 트리거한다.

### 고려사항

- `PreToolUse` 훅에서 `Skill` 도구의 인자(audit-milestone)를 정확히 매칭할 수 있는지 확인 필요
- 매칭이 어려운 경우, audit-milestone 실행 시 수동으로 빌드+테스트를 먼저 수행하는 체크리스트 방식도 대안
- complete-milestone에도 동일 훅 적용 여부 결정 필요

## 발견

- v1.6 마일스톤 완료 후 빌드 에러 발견 경험에서 도출
