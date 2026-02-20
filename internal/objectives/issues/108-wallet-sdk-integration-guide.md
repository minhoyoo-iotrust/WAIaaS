# 108 — wallet-sdk 연동 가이드 문서 작성

- **유형:** MISSING
- **심각도:** HIGH
- **마일스톤:** v2.6
- **상태:** FIXED
- **등록일:** 2026-02-20

## 현상

`@waiaas/wallet-sdk`는 외부 지갑 개발팀(D'CENT 등)이 WAIaaS Signing Protocol을 통합하기 위한 SDK이다. 패키지 소스코드(`packages/wallet-sdk/src/`)는 구현되어 있으나, 연동 가이드 문서가 전혀 없다:

- `packages/wallet-sdk/README.md` — 없음 (npm 패키지 페이지에 아무 내용도 표시되지 않음)
- `docs/` 디렉토리에 wallet-sdk 관련 문서 — 없음

외부 개발팀은 소스코드를 직접 읽거나 내부 설계 문서(`internal/design/73-signing-protocol-v1.md`, `74-wallet-sdk-daemon-components.md`)를 참조해야만 연동할 수 있다. 내부 설계 문서는 npm 배포 범위에 포함되지 않으므로 외부에서 접근 불가하다.

### 현재 SDK Public API

```typescript
// 코어 함수
parseSignRequest(url: string): SignRequest       // 유니버셜 링크 URL에서 SignRequest 추출
buildSignResponse(requestId, action, signature?, signerAddress): SignResponse  // 서명 응답 생성
formatDisplayMessage(request: SignRequest): string  // 사용자에게 보여줄 트랜잭션 요약

// 채널 함수
sendViaNtfy(response, topic, serverUrl?): Promise<void>   // ntfy로 응답 전송
sendViaTelegram(response, botUsername): string              // Telegram 딥링크 URL 생성
subscribeToRequests(topic, callback, serverUrl?): void      // SSE로 승인 요청 구독

// 타입 (from @waiaas/core)
SignRequest, SignResponse, WalletLinkConfig
```

## 수정 범위

### 1. packages/wallet-sdk/README.md

npm 패키지 페이지에 표시될 기본 가이드. 다음 내용 포함:

- **Overview**: WAIaaS Signing Protocol 개요 — 지갑 앱이 Owner 트랜잭션 승인/거부를 처리하는 SDK
- **Installation**: `npm install @waiaas/wallet-sdk`
- **Quick Start**: 최소 연동 코드 예제 (ntfy 채널 기준)
  ```typescript
  import { subscribeToRequests, parseSignRequest, buildSignResponse, sendViaNtfy } from '@waiaas/wallet-sdk';
  ```
- **API Reference**: 각 함수의 시그니처, 파라미터, 반환값, 예제
- **Channels**: ntfy 직접 푸시 vs Telegram 중계 모델 비교 및 각 설정 방법
- **Universal Link Format**: 지갑 앱이 처리해야 하는 URL 구조
- **Error Handling**: InvalidSignRequestUrlError, SignRequestExpiredError, SignRequestValidationError

### 2. docs/wallet-sdk-integration.md

심층 연동 가이드. 다음 내용 포함:

- **아키텍처 개요**: WAIaaS 데몬 → ntfy/Telegram → 지갑 앱 → 서명 → 응답 전체 플로우 다이어그램
- **사전 요구사항**: WAIaaS 데몬 설정 (Owner 주소 등록, ntfy/Telegram 채널 설정)
- **연동 시나리오**:
  - 시나리오 1: ntfy 직접 푸시 (메신저 불필요)
  - 시나리오 2: Telegram 메신저 중계
- **SignRequest 구조**: 각 필드(requestId, walletId, chain, type, amount, to, expiry 등) 상세 설명
- **서명 플로우**: 요청 수신 → 사용자에게 표시 → 서명/거부 → 응답 전송 전체 단계
- **보안 고려사항**: 요청 만료 검증, 서명 데이터 검증, 재전송 방지
- **테스트 가이드**: WAIaaS testnet 환경에서 연동 테스트하는 방법
- **FAQ / 트러블슈팅**: 일반적인 연동 문제와 해결 방법

### 3. README.md (루트) 업데이트

Documentation 테이블에 wallet-sdk 연동 가이드 링크 추가:

```markdown
| [Wallet SDK Integration](docs/wallet-sdk-integration.md) | Integration guide for wallet developers |
```

### 영향 범위

- `packages/wallet-sdk/README.md` — 신규 생성
- `docs/wallet-sdk-integration.md` — 신규 생성
- `README.md` (루트) — Documentation 테이블에 1줄 추가

## 테스트 항목

1. `packages/wallet-sdk/README.md`가 존재하고, 모든 Public API 함수에 대한 설명이 포함되어 있는지 확인
2. `docs/wallet-sdk-integration.md`가 존재하고, ntfy/Telegram 두 채널 시나리오가 포함되어 있는지 확인
3. 루트 `README.md` Documentation 테이블에 wallet-sdk 연동 가이드 링크가 있는지 확인
4. README.md의 코드 예제가 실제 SDK API와 일치하는지 확인 (함수명, 파라미터)
