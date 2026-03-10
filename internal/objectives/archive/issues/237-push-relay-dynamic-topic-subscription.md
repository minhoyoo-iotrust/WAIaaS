# #237 Push Relay 디바이스 등록 시 subscription token 기반 토픽 동적 구독 미구현

- **유형:** MISSING
- **심각도:** HIGH
- **발견일:** 2026-03-02
- **마일스톤:** —
- **상태:** FIXED
- **수정일:** 2026-03-02

## 현상

`POST /devices`로 디바이스 등록 시 `subscription_token`이 생성·리턴되지만, 해당 토큰 기반 토픽을 `NtfySubscriber`가 동적으로 구독하지 않았다.

## 수정 내용

### 1. NtfySubscriber에 동적 구독 메서드 추가
- `addTopics(walletName, signTopic, notifyTopic)`: 토픽 동적 추가 (중복 방지)
- `removeTopics(signTopic, notifyTopic)`: 토픽 동적 제거

### 2. DeviceRegistry에 조회 메서드 추가
- `getByPushToken(pushToken)`: 삭제 전 디바이스 정보 조회용
- `listAll()`: 서버 기동 시 DB 기반 토픽 복원용

### 3. device-routes.ts에서 등록/해제 시 구독 연동
- `POST /devices`: `registry.register()` 후 `subscriber.addTopics()` 호출
- `DELETE /devices/:token`: 삭제 전 디바이스 조회 → `subscriber.removeTopics()` 호출

### 4. server.ts에 topic prefix 전달
- `ServerOpts`에 `signTopicPrefix`, `notifyTopicPrefix` 추가
- `createDeviceRoutes()`에 prefix 전달

### 5. bin.ts에서 기동 시 DB 기반 토픽 복원
- `subscriber.start()` 후 `registry.listAll()`로 기존 디바이스 토픽 복원

## 테스트 항목

- [x] 디바이스 등록 시 subscription token 기반 토픽이 즉시 구독되는지 확인
- [x] 디바이스 해제 시 해당 토픽 구독이 해제되는지 확인
- [x] config.toml 기본 토픽과 동적 토픽이 공존하는지 확인
- [x] 동일 토픽 중복 구독 방지 확인
- [x] 존재하지 않는 토픽 제거 시 안전 동작 확인
- [x] getByPushToken / listAll 메서드 정상 동작 확인
