# 499. Pushwoosh Notification Extra Fields 지원

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **발견일:** 2026-04-20
- **상태:** FIXED
- **관련 패키지:** @waiaas/push-relay

## 현상

디센트팀 요청: Pushwoosh 푸시 알림 payload에 `link: '/waiaas'` 딥링크 필드가 필요.
현재 PushwooshProvider는 notification object에 고정 필드만 포함하며, 추가 필드를 주입할 방법이 없음.

## 원인

PushwooshProvider가 notification payload를 하드코딩된 필드만으로 구성하고 있어 Pushwoosh API가 지원하는 추가 필드(link, campaign, minimize_link 등)를 활용할 수 없음.

## 해결 방안

PushwooshConfig에 `extra_fields` (Record<string, unknown>) 옵션을 추가하여 config.toml에서 임의의 key-value를 설정하면 notification payload에 spread되도록 구현.

```toml
[pushwoosh.extra_fields]
link = "/waiaas"
```

## 영향 범위

- `packages/push-relay/src/config.ts` — PushwooshConfig 스키마에 extra_fields 추가
- `packages/push-relay/src/providers/pushwoosh-provider.ts` — notification에 extraFields spread
- `packages/push-relay/src/__tests__/pushwoosh-provider.test.ts` — 테스트 추가

## 테스트 항목

- [ ] extra_fields 설정 시 notification payload에 해당 필드가 포함되는지 확인
- [ ] extra_fields 미설정 시 기존 동작과 동일한지 확인
- [ ] 다수의 extra_fields가 올바르게 spread되는지 확인
