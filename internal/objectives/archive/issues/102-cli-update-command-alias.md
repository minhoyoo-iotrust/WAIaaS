# 102 — CLI `upgrade` 명령어를 `update`로 변경 + `upgrade` 별칭 유지

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** v2.6
- **상태:** FIXED
- **등록일:** 2026-02-19

## 현상

CLI의 버전 업그레이드 명령어가 `waiaas upgrade`로 되어 있으나, 일반적인 패키지 매니저(npm, apt, brew 등)와 도구들은 `update`를 주 명령어로 사용한다. 사용자가 습관적으로 `waiaas update`를 입력하면 "unknown command" 에러가 발생한다.

## 수정 범위

### 1. `update`를 주 명령어, `upgrade`를 별칭으로 등록

Commander의 `.alias()` 메서드를 사용하여 두 명령어 모두 동작하도록 한다:

```typescript
program
  .command('update')           // 주 명령어
  .alias('upgrade')            // 하위 호환 별칭
  .description('Update WAIaaS to the latest version')
```

### 2. 사용자 메시지 내 `upgrade` → `update` 변경

| 파일 | 위치 | 현재 | 변경 |
|------|------|------|------|
| `packages/cli/src/commands/upgrade.ts` | checkMode 출력 | `Run: waiaas upgrade` | `Run: waiaas update` |
| `packages/cli/src/commands/upgrade.ts` | rollback 안내 | `Run: waiaas upgrade --rollback` | `Run: waiaas update --rollback` |
| `packages/cli/src/commands/upgrade.ts` | 완료 메시지 | `Upgrade complete:` | `Update complete:` |
| `packages/cli/src/utils/update-notify.ts` | 알림 박스 | `Run: waiaas upgrade` | `Run: waiaas update` |

### 3. 파일명 변경 (선택)

`packages/cli/src/commands/upgrade.ts` → `update.ts` (내부 함수명 `upgradeCommand` → `updateCommand`)

### 영향 범위

- `packages/cli/src/index.ts` — 명령어 등록
- `packages/cli/src/commands/upgrade.ts` — 출력 메시지
- `packages/cli/src/utils/update-notify.ts` — 알림 박스 메시지
- `packages/cli/src/__tests__/upgrade.test.ts` — 테스트 설명 텍스트
- `packages/cli/src/__tests__/update-notify.test.ts` — 테스트 assert 문자열

## 테스트 항목

### 단위 테스트
1. `waiaas update --check`가 정상 동작하는지 확인
2. `waiaas upgrade --check`가 별칭으로 정상 동작하는지 확인
3. 알림 박스에 `waiaas update` 안내가 표시되는지 확인
4. `--rollback` 에러 메시지에 `waiaas update --rollback`이 표시되는지 확인
