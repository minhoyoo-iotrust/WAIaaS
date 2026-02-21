# 119. wallet-sdk 연동 가이드에 Push Relay 시나리오 누락

- **유형:** MISSING
- **심각도:** MEDIUM
- **마일스톤:** v26.4
- **상태:** FIXED

## 현황

`docs/wallet-sdk-integration.md`에 ntfy 직접 연동(Scenario 1)과 Telegram 릴레이(Scenario 2)만 기술되어 있고, m26-03에서 설계된 **Push Relay Server 경유 연동(Scenario 3)**이 누락되어 있다.

D'CENT 등 기존 푸시 인프라(Pushwoosh, FCM)를 사용하는 지갑 개발사가 Push Relay를 통해 서명 요청을 수신하는 방법이 문서화되지 않았다.

## 누락 항목

### 1. Scenario 3: Push Relay Server 섹션

ntfy 직접 구독 대신 Push Relay → Pushwoosh/FCM → 네이티브 푸시로 서명 요청을 수신하는 패턴 설명 필요.

### 2. 아키텍처 다이어그램 업데이트

현재 ntfy/Telegram 2경로만 표시. Push Relay 경로 추가:

```
Daemon --ntfy--> Push Relay --Pushwoosh/FCM--> Wallet App (네이티브 푸시)
```

### 3. 네이티브 푸시 수신 코드 예시

Push `data` 필드에서 SignRequest를 파싱하는 모바일 앱 측 코드 예시:

```typescript
// 네이티브 푸시 수신 핸들러
onPushReceived((push) => {
  const request = parseSignRequest(push.data.signRequest);
  // 서명 UI 표시...
});
```

### 4. 통합 옵션 비교 가이드

| 옵션 | 서버 필요 | 장점 | 대상 |
|------|----------|------|------|
| A. ntfy 직접 | 불필요 | 가장 단순 | ntfy SDK 내장 가능한 앱 |
| B. Push Relay | 지갑사 서버 | 기존 푸시 인프라 재사용 | D'CENT 등 기존 앱 |
| C. 자체 구현 | 지갑사 서버 | 완전 커스텀 | 독자 프로토콜 원하는 앱 |

### 5. @waiaas/push-relay 패키지 참조

패키지 설치, config.toml 설정, Docker 배포 링크 추가.

## 테스트 항목

- [ ] Scenario 3 (Push Relay) 섹션이 문서에 존재하고 코드 예시가 포함되어 있는지 확인
- [ ] 아키텍처 다이어그램에 Push Relay 경로가 표시되는지 확인
- [ ] 통합 옵션 비교 테이블이 3가지 옵션을 모두 포함하는지 확인
- [ ] @waiaas/push-relay 패키지 링크가 유효한지 확인
