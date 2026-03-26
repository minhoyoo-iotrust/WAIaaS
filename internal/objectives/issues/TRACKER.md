# Issue Tracker

> 이슈 추적 현황. 새 이슈는 `{NNN}-{slug}.md`로 추가하고 이 표를 갱신한다.

## Status Legend

| 상태 | 설명 |
|------|------|
| OPEN | 미처리 — 수정 필요 |
| FIXED | 수정 완료 — 코드 반영됨 |
| WONTFIX | 수정하지 않음 (의도된 동작 또는 해당 없음) |

## Active Issues

| ID | 유형 | 심각도 | 제목 | 마일스톤 | 상태 | 수정일 |
|----|------|--------|------|----------|------|--------|
| 429 | BUG | MEDIUM | IncomingTxMonitor 구독 시 RPC Rate Limit 에러 | — | FIXED | 2026-03-23 |
| 430 | ENHANCEMENT | LOW | IncomingTx 서비스에서 console.* 직접 호출 (ILogger 미사용) | — | FIXED | 2026-03-23 |
| 431 | BUG | MEDIUM | 데몬 시작 시 서비스 간 RPC 경합으로 429 Rate Limit 발생 | — | FIXED | 2026-03-23 |
| 432 | MISSING | LOW | Admin UI: 등록된 지갑 앱의 Push Relay URL 수정 불가 | — | FIXED | 2026-03-24 |
| 433 | ENHANCEMENT | LOW | Admin UI: Wallet App 등록 시 wallet_type combobox 변경 | — | FIXED | 2026-03-24 |
| 434 | ENHANCEMENT | LOW | Admin UI: 테스트 알림 실패 시 에러 메시지가 눈에 띄지 않음 | — | FIXED | 2026-03-24 |
| 435 | ENHANCEMENT | LOW | Admin UI: Subscription Token 미설정 시 Test 버튼 사전 안내 부재 | — | FIXED | 2026-03-24 |
| 436 | ENHANCEMENT | MEDIUM | Push Relay API Key 인증 정책 재설계 | — | FIXED | 2026-03-24 |
| 437 | BUG | MEDIUM | IncomingTxMonitor 시작 시 RPC Rate Limit 재발 (optimism-mainnet) | — | FIXED | 2026-03-24 |
| 438 | BUG | MEDIUM | 테스트 알림 "fetch failed" 에러에 실제 원인(err.cause)이 표시되지 않음 | — | FIXED | 2026-03-24 |
| 439 | BUG | LOW | Admin UI: 토스트 메시지 배경이 투명하여 뒤 요소가 비침 | — | FIXED | 2026-03-24 |
| 440 | MISSING | MEDIUM | connect-info에 ownerState 필드 누락 — 세션 토큰으로 오너 상태 조회 불가 | — | FIXED | 2026-03-24 |
| 441 | BUG | LOW | UAT 오너 승인 시나리오(advanced-05)가 실제 구현과 불일치 (PENDING_APPROVAL → QUEUED) | — | FIXED | 2026-03-24 |
| 442 | BUG | LOW | 서명 요청 유효기간이 approval timeout을 초과할 수 있음 (clamp 미적용) | — | FIXED | 2026-03-24 |
| 443 | BUG | MEDIUM | APPROVAL 생성 시 정책별 approval_timeout이 전달되지 않음 | — | FIXED | 2026-03-24 |
| 444 | BUG | LOW | ApprovalWorkflow의 configTimeout이 hot-reload 되지 않음 | — | FIXED | 2026-03-24 |
| 445 | ENHANCEMENT | MEDIUM | 서명 요청 대상 지갑 앱을 명시적으로 선택할 수 없음 (wallet_type 그룹별 서명용 앱 선택) | m33-04 | PLANNED | 2026-03-24 |
| 446 | BUG | MEDIUM | DELAY 티어 TX_QUEUED 알림에 Cancel 인라인 키보드가 포함되지 않음 | — | FIXED | 2026-03-24 |
| 447 | BUG | LOW | DELAY Cancel 키보드 버튼 레이블이 locale 미반영 + 불필요한 TX ID 포함 | — | FIXED | 2026-03-24 |
| 448 | ENHANCEMENT | MEDIUM | DELAY TX_QUEUED 알림에 트랜잭션 상세 정보 부족 (금액, USD, 수신 주소, 딜레이 시간) | — | FIXED | 2026-03-24 |
| 449 | BUG | HIGH | Push Relay subscriptionToken 불일치로 푸시가 디바이스에 도달하지 않음 | — | FIXED | 2026-03-24 |
| 450 | ENHANCEMENT | MEDIUM | Admin UI: 지갑 앱 테스트 서명 요청 기능 (서명 응답 검증) | — | FIXED | 2026-03-24 |
| 451 | BUG | MEDIUM | 서명 요청 Push payload에 title/body 누락으로 자체 호스팅 Push Relay Pushwoosh 에러 | — | FIXED | 2026-03-24 |
| 452 | BUG | LOW | Human Wallet Apps 페이지에서 showToast 인자 순서가 반대 (18곳) | — | FIXED | 2026-03-24 |
| 453 | BUG | MEDIUM | Dev.to 공개 API CDN 캐시로 신규 블로그 글이 사이트에 반영되지 않음 | — | FIXED | 2026-03-25 |
| 454 | BUG | HIGH | Solana WebSocket 429 로그 폭주 — Adaptive Polling Fallback | — | FIXED | 2026-03-25 |
| 455 | ENHANCEMENT | HIGH | PositionTracker 주기적 동기화로 Solana RPC 429 폭주 — Startup-Once + Action-Triggered Sync | — | FIXED | 2026-03-25 |
| 456 | BUG | HIGH | Push Relay 서명 요청 payload가 D'CENT 기대 포맷과 불일치 (base64 래핑 → 플랫 필드) | — | FIXED | 2026-03-25 |
| 457 | BUG | HIGH | E2E 스모크 테스트 버전 감지 오류 — GitHub Releases API 정렬 비결정성 | — | FIXED | 2026-03-25 |
| 458 | ENHANCEMENT | MEDIUM | Push Relay 디버그 모드에서 푸시 payload 및 서명 응답 내용 미로그 | — | FIXED | 2026-03-25 |
| 459 | ENHANCEMENT | MEDIUM | 세션 토큰으로 GET /v1/wallets, GET /v1/wallets/:id 조회 불가 (masterAuth only) | — | FIXED | 2026-03-25 |
| 460 | BUG | HIGH | Push Relay config.toml static_fields가 푸시 payload에 반영되지 않음 | — | FIXED | 2026-03-25 |
| 461 | BUG | HIGH | Admin UI 테스트 서명 요청이 여전히 base64 래핑 포맷으로 전송됨 (#456 수정 누락) | — | FIXED | 2026-03-26 |
| 462 | ENHANCEMENT | MEDIUM | Admin 테스트 서명 요청에 오너 주소 지정 불가 (signerAddress 하드코딩) | — | FIXED | 2026-03-26 |
| 463 | ENHANCEMENT | LOW | wallet-sdk 및 데몬에 ntfy.sh 잔재 코드 잔존 (responseTopic, ntfy 채널 함수) | — | FIXED | 2026-03-26 |

## Type Legend

| 유형 | 설명 |
|------|------|
| BUG | 의도와 다르게 동작하는 결함 |
| ENHANCEMENT | 기능은 정상이나 개선이 필요한 사항 |
| MISSING | 설계에 포함되었으나 구현이 누락된 기능 |

## Summary

- **OPEN:** 0
- **PLANNED:** 1
- **FIXED:** 462
- **WONTFIX:** 1
- **Total:** 464
- **Archived:** 428 (001–428)
