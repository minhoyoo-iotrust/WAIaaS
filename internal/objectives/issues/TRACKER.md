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
| 367 | ENHANCEMENT | LOW | mainnet-06 NFT 전송 시나리오 L2 체인 전환 — 가스비 절감 ($2.00→$0.01) | v32.5 | FIXED | 2026-03-16 |
| 368 | ENHANCEMENT | LOW | Admin UI 프로바이더 API Key 발급 링크 누락 — Jupiter/0x 키 발급 페이지 안내 없음 | v32.5 | FIXED | 2026-03-16 |
| 369 | BUG | HIGH | Jupiter Swap routePlan feeAmount/feeMint 필드 누락으로 스왑 전체 실패 | v32.5 | FIXED | 2026-03-16 |
| 370 | BUG | HIGH | Jito Staking reserve stake 주소 불일치로 DepositSol 실패 | v32.5 | FIXED | 2026-03-16 |
| 371 | BUG | HIGH | DCent Swap amount 단위 불일치로 스왑 트랜잭션 revert — smallest unit vs human amount | v32.5 | FIXED | 2026-03-16 |
| 372 | BUG | HIGH | Solana DeFi SDK 미설치로 Kamino/Drift 전체 기능 사용 불가 | v32.5 | FIXED | 2026-03-16 |
| 373 | BUG | HIGH | Pendle Yield buy_pt API 응답 스키마 불일치 (array vs object) | v32.5 | FIXED | 2026-03-16 |
| 374 | MISSING | HIGH | KaminoSdkWrapper 실제 SDK 연결 구현 — 스텁에서 동적 import 기반 실제 연결로 전환 | v32.5 | FIXED | 2026-03-16 |
| 375 | MISSING | HIGH | DriftSdkWrapper 실제 SDK 연결 구현 — 스텁에서 동적 import 기반 실제 연결로 전환 | v32.5 | FIXED | 2026-03-16 |
| 376 | BUG | MEDIUM | E2E wallet-purge-cascades-data 정책 생성 스키마 불일치 — params/maxAmount 구버전 필드 사용 | v32.5 | FIXED | 2026-03-16 |
| 377 | ENHANCEMENT | LOW | advanced-02 WalletConnect Owner 승인 UAT 시나리오 제거 — DCent 지갑 연동 중심으로 전환 | v32.5 | FIXED | 2026-03-16 |
| 378 | ENHANCEMENT | LOW | Agent UAT admin-ops 카테고리 신설 + 시나리오 재배치 — Admin 권한 필요 시나리오 분리, advanced-04 중복 제거 | v32.5 | FIXED | 2026-03-16 |

## Type Legend

| 유형 | 설명 |
|------|------|
| BUG | 의도와 다르게 동작하는 결함 |
| ENHANCEMENT | 기능은 정상이나 개선이 필요한 사항 |
| MISSING | 설계에 포함되었으나 구현이 누락된 기능 |

## Summary

- **OPEN:** 0
- **FIXED:** 378
- **WONTFIX:** 1
- **Total:** 379
- **Archived:** 366 (001–366)
