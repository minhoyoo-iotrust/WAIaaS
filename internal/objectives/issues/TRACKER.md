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

## Type Legend

| 유형 | 설명 |
|------|------|
| BUG | 의도와 다르게 동작하는 결함 |
| ENHANCEMENT | 기능은 정상이나 개선이 필요한 사항 |
| MISSING | 설계에 포함되었으나 구현이 누락된 기능 |

## Summary

- **OPEN:** 0
- **FIXED:** 442
- **WONTFIX:** 1
- **Total:** 443
- **Archived:** 428 (001–428)
