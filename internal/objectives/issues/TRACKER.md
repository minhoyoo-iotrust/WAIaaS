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
| 379 | BUG | HIGH | EVM 토큰 주소 EIP-55 체크섬 검증 누락으로 multicall 전체 실패 — PIM 잘못된 체크섬이 전체 토큰 잔액 조회 연쇄 실패 유발 | v32.8 | FIXED | 2026-03-18 |
| 380 | BUG | HIGH | PositionTracker RPC URL 미해결로 DeFi 대시보드 포지션 미표시 — resolveRpcUrl에 빈 rpcConfig 전달, Admin Settings 미연동 | v32.8 | FIXED | 2026-03-18 |
| 381 | MISSING | HIGH | SEO 메타 태그 / OG / Canonical 누락으로 검색엔진·SNS 노출 저하 — meta description, OG, Twitter Card, canonical, lang, favicon 전무 | v32.7 | FIXED | 2026-03-18 |
| 382 | MISSING | MEDIUM | DeFi 포지션 해제 UAT 시나리오 누락 — Lido 언스테이킹 없음, Hyperliquid/Polymarket 포지션 클로즈 없음 | v32.8 | FIXED | 2026-03-18 |
| 383 | BUG | MEDIUM | DCent Swap 견적 요청 시 fromWalletAddress 누락으로 LiFi 프로바이더 견적 실패 | v32.8 | FIXED | 2026-03-18 |
| 384 | MISSING | MEDIUM | DCent Swap Solana 출발 2-hop 라우팅 불가 — INTERMEDIATE_TOKENS에 Solana 체인 누락 | v32.8 | FIXED | 2026-03-18 |
| 385 | MISSING | MEDIUM | DCent Swap UAT 시나리오 누락 — 2-hop 라우팅 / 크로스체인 / Solana 미검증 | v32.8 | FIXED | 2026-03-18 |
| 386 | BUG | HIGH | Lido 테스트넷 포지션 미표시 — Holesky 컨트랙트 주소가 Sepolia 네트워크에 매핑됨 | v32.9 | FIXED | 2026-03-18 |
| 387 | BUG | HIGH | DCent Swap formatAmount() 회귀 — get_quotes/getDexSwapTransactionData에 human amount 전달로 전 프로바이더 실패 | v32.9 | FIXED | 2026-03-18 |
| 388 | BUG | MEDIUM | defi-12 DCent Swap UAT 시나리오 API 엔드포인트 오류 — /v1/transactions/* 대신 /v1/actions/dcent_swap/* 사용 필요 | v32.9 | FIXED | 2026-03-18 |
| 389 | ENHANCEMENT | LOW | Agent UAT 시나리오 환경(Environment) 분류 누락 — Env 컬럼 및 --env 필터 추가 필요 | v32.9 | FIXED | 2026-03-18 |
| 390 | BUG | CRITICAL | Migration v60 CHECK 제약조건 미갱신으로 sdk_push UPDATE 실패 — 기존 DB 업그레이드 시 데몬 시작 불가 | v32.10 | FIXED | 2026-03-18 |
| 391 | BUG | MEDIUM | Polygon Amoy 빌트인 토큰 3개(AAVE/DAI/USDT) 컨트랙트 미존재로 매 요청마다 에러 로그 발생 | — | FIXED | 2026-03-19 |
| 392 | BUG | CRITICAL | PositionTracker가 지갑 UUID를 온체인 주소로 사용하여 모든 DeFi 포지션 조회 실패 | — | FIXED | 2026-03-19 |
| 393 | BUG | HIGH | DCent Swap 네이티브 ETH 스왑 시 txdata.value 불일치로 온체인 revert — API가 프로토콜 수수료만 반환, 스왑 금액 누락 | — | FIXED | 2026-03-19 |
| 394 | BUG | HIGH | DCent Swap Solana 트랜잭션 스키마 불일치로 Solana 체인 스왑 전면 실패 — EVM 전용 txdata 스키마, 체인 분기 없음 | — | FIXED | 2026-03-19 |
| 395 | BUG | HIGH | DeFi UAT 시나리오 6개 API 엔드포인트/파라미터 불일치로 전수 실행 불가 — 구 API 형식 사용 | — | OPEN | — |
| 396 | BUG | HIGH | Jupiter Swap 프로그램 오류 6025로 시뮬레이션 실패 — V6 프로그램 라우트 오류 | — | OPEN | — |
| 397 | BUG | HIGH | Jito Staking "Invalid manager fee account"로 DepositSol 실패 — 계정 주소 불일치 | — | OPEN | — |
| 398 | BUG | HIGH | Pendle API 응답 스키마 불일치 회귀 — buy_pt 응답 array vs object (#373 재발) | — | OPEN | — |
| 399 | BUG | HIGH | Kamino/Drift SDK 런타임 미설치로 Solana DeFi 기능 사용 불가 — #374/#375 후속 | — | OPEN | — |

## Type Legend

| 유형 | 설명 |
|------|------|
| BUG | 의도와 다르게 동작하는 결함 |
| ENHANCEMENT | 기능은 정상이나 개선이 필요한 사항 |
| MISSING | 설계에 포함되었으나 구현이 누락된 기능 |

## Summary

- **OPEN:** 5
- **FIXED:** 394
- **WONTFIX:** 1
- **Total:** 400
- **Archived:** 366 (001–366)
