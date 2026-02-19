---
phase: quick-4
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/daemon/src/lifecycle/daemon.ts
  - internal/objectives/issues/088-notification-service-always-init.md
  - internal/objectives/issues/TRACKER.md
autonomous: true
requirements: [ISSUE-088]

must_haves:
  truths:
    - "NotificationService 인스턴스가 config.toml enabled=false일 때도 항상 생성된다"
    - "enabled=false이면 채널 0개로 시작하여 알림이 전송되지 않는다 (기존 동작 유지)"
    - "Admin UI에서 enabled=true로 변경하면 hot-reload가 채널을 추가하여 알림이 동작한다"
    - "KillSwitchService, 기타 서비스에 notificationService가 항상 전달된다"
  artifacts:
    - path: "packages/daemon/src/lifecycle/daemon.ts"
      provides: "Always-init NotificationService in Step 4d"
      contains: "new NotificationService"
  key_links:
    - from: "packages/daemon/src/lifecycle/daemon.ts"
      to: "packages/daemon/src/infrastructure/settings/hot-reload.ts"
      via: "notificationService instance always passed"
      pattern: "notificationService"
---

<objective>
Issue 088 수정: NotificationService를 config.toml enabled 값과 무관하게 항상 초기화하여, Admin UI에서 런타임 알림 활성화가 가능하도록 변경.

Purpose: config.toml에 notifications.enabled=false(기본값)로 시작해도 Admin UI에서 알림을 동적으로 활성화할 수 있어야 한다.
Output: daemon.ts Step 4d 수정, 이슈 파일 상태 FIXED
</objective>

<execution_context>
@/Users/minho.yoo/.claude/get-shit-done/workflows/execute-plan.md
@/Users/minho.yoo/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@internal/objectives/issues/088-notification-service-always-init.md
@packages/daemon/src/lifecycle/daemon.ts
@packages/daemon/src/infrastructure/settings/hot-reload.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: NotificationService를 항상 초기화하도록 daemon.ts Step 4d 수정</name>
  <files>packages/daemon/src/lifecycle/daemon.ts</files>
  <action>
`packages/daemon/src/lifecycle/daemon.ts`의 Step 4d 블록(약 416-479행)을 수정한다.

**변경 전** 구조:
```
if (this._config!.notifications.enabled) {
  // import + NotificationService 생성 + 채널 초기화
} else {
  console.log('Step 4d: Notifications disabled');
}
```

**변경 후** 구조:
```
// 1. NotificationService를 항상 생성 (enabled 여부 무관)
const { NotificationService, TelegramChannel, DiscordChannel, NtfyChannel, SlackChannel } =
  await import('../notifications/index.js');

this.notificationService = new NotificationService({
  db: this._db ?? undefined,
  config: {
    locale: (this._config!.notifications.locale ?? 'en') as 'en' | 'ko',
    rateLimitRpm: this._config!.notifications.rate_limit_rpm ?? 20,
  },
});

// 2. 채널은 enabled일 때만 추가 (기존 로직 그대로 유지)
if (this._config!.notifications.enabled) {
  const notifConfig = this._config!.notifications;
  // ... 기존 Telegram/Discord/Ntfy/Slack 채널 초기화 로직 동일 ...
}

// 3. 로그 메시지 조정
const channelNames = this.notificationService.getChannelNames();
console.log(
  `Step 4d: NotificationService initialized (${channelNames.length} channels: ${channelNames.join(', ') || 'none'})`,
);
```

핵심 변경:
- `import` 및 `new NotificationService(...)` 호출을 `if (enabled)` 블록 바깥으로 이동
- 채널 초기화 (`addChannel` 호출들)는 `if (enabled)` 내부에 그대로 유지
- `else` 브랜치의 "Notifications disabled" 로그 삭제 (항상 초기화되므로)
- 로그 메시지를 `if` 블록 바깥으로 이동하여 항상 출력
- `catch` 블록은 그대로 유지 (fail-soft)

**주의:** Step 4d 이후의 KillSwitchService 연결 블록 (481-489행)은 `if (this.killSwitchService && this.notificationService)` 조건이지만, 이제 notificationService가 항상 존재하므로 killSwitchService만 있으면 연결됨. 이는 의도된 동작이며 올바르다 -- KillSwitchService가 kill switch 활성화 시 알림을 보내는 것은 항상 가능해야 한다.
  </action>
  <verify>
`pnpm turbo run typecheck --filter=@waiaas/daemon` 통과 확인.
`pnpm turbo run lint --filter=@waiaas/daemon` 통과 확인.
`pnpm vitest run --project daemon` 기존 테스트 전수 통과 확인 (특히 admin-notification-api.test.ts, lifecycle.test.ts).
  </verify>
  <done>
daemon.ts Step 4d에서 NotificationService가 config.toml enabled 값과 무관하게 항상 생성된다. enabled=false이면 채널 0개, enabled=true이면 config의 채널이 초기화된다. 기존 테스트 전수 통과.
  </done>
</task>

<task type="auto">
  <name>Task 2: 이슈 파일 상태 업데이트 및 TRACKER 반영</name>
  <files>internal/objectives/issues/088-notification-service-always-init.md, internal/objectives/issues/TRACKER.md</files>
  <action>
1. `internal/objectives/issues/088-notification-service-always-init.md` 상단 테이블의 `**상태**`를 `OPEN` -> `FIXED`로 변경.
2. `internal/objectives/issues/TRACKER.md`에서 088 항목의 상태를 FIXED로 업데이트.
  </action>
  <verify>이슈 파일과 TRACKER에서 088 상태가 FIXED로 표시됨.</verify>
  <done>이슈 088이 FIXED 상태로 기록됨.</done>
</task>

</tasks>

<verification>
1. `pnpm turbo run typecheck --filter=@waiaas/daemon` -- 타입 오류 없음
2. `pnpm turbo run lint --filter=@waiaas/daemon` -- 린트 오류 없음
3. `pnpm vitest run --project daemon` -- 기존 테스트 전수 통과
4. daemon.ts에서 `new NotificationService`가 `if (enabled)` 블록 바깥에 위치함을 grep으로 확인
</verification>

<success_criteria>
- NotificationService가 config.toml enabled=false일 때도 항상 생성된다
- 기존 채널 초기화 로직은 enabled=true일 때만 실행된다 (동작 변경 없음)
- hot-reload의 reloadNotifications()가 svc 존재로 정상 동작한다
- 기존 테스트 전수 통과
- 이슈 088 상태 FIXED
</success_criteria>

<output>
After completion, create `.planning/quick/4-issue-088-notificationservice-enabled-fa/4-SUMMARY.md`
</output>
