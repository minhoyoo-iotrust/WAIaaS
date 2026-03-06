# #255 Pushwoosh API base URL 설정 가능하도록 개선

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** —
- **상태:** OPEN

## 현상

Push Relay 서버의 Pushwoosh 프로바이더가 API base URL을 하드코딩(`cp.pushwoosh.com`)하고 있어, 계정별로 다른 데이터센터(예: `api.pushwoosh.com`, Private Cloud 커스텀 도메인)를 사용하는 경우 "Access denied or application not found" 에러가 발생할 수 있다.

Pushwoosh 공식 문서 기준 엔드포인트는 `https://api.pushwoosh.com/json/1.3/createMessage`이며, 현재 코드의 `https://cp.pushwoosh.com/json/1.3/createMessage`와 불일치한다.

## 원인

- `pushwoosh-provider.ts`에서 `PUSHWOOSH_API_URL`이 상수로 하드코딩
- `config.toml`의 `[relay.push.pushwoosh]` 섹션에 `api_url` 설정 항목 없음

## 수정 방안

1. **기본 URL 변경**: `cp.pushwoosh.com` → `api.pushwoosh.com` (공식 문서 기준)
2. **config.toml에 `api_url` 옵션 추가**: `[relay.push.pushwoosh]` 섹션에 선택적 `api_url` 필드 추가, 미설정 시 기본값 `https://api.pushwoosh.com/json/1.3/createMessage` 사용
3. **Zod 스키마 갱신**: `PushwooshConfigSchema`에 `api_url` 필드 추가 (`.url().default(...)`)
4. **PushwooshProvider 수정**: 생성자에서 `config.api_url`을 읽어 `this.apiUrl`로 사용
5. **config.example.toml 갱신**: `api_url` 옵션 및 설명 추가
6. **가이드 문서 갱신**: Wallet SDK 연동 가이드의 Push Relay 섹션에 커스텀 API URL 설정 방법 안내

## 영향 범위

- `packages/push-relay/src/config.ts` — PushwooshConfigSchema
- `packages/push-relay/src/providers/pushwoosh-provider.ts` — API URL 참조
- `packages/push-relay/config.example.toml` — 예시 설정
- `docs/guides/wallet-sdk-guide.md` — Push Relay 설정 안내

## 테스트 항목

- [ ] `api_url` 미설정 시 기본값 `https://api.pushwoosh.com/json/1.3/createMessage` 적용 확인
- [ ] `api_url` 설정 시 해당 URL로 요청 전송 확인
- [ ] 기존 config.toml(`api_url` 없는 설정)과 역호환 확인
- [ ] PushwooshProvider 단위 테스트에서 커스텀 URL 전달 검증
