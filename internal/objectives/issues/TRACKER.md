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
| 395 | BUG | HIGH | DeFi UAT 시나리오 6개 API 엔드포인트/파라미터 불일치로 전수 실행 불가 — 구 API 형식 사용 | — | FIXED | 2026-03-19 |
| 396 | BUG | HIGH | Jupiter Swap 프로그램 오류 6025로 시뮬레이션 실패 — V6 프로그램 라우트 오류 | — | FIXED | 2026-03-19 |
| 397 | BUG | HIGH | Jito Staking "Invalid manager fee account"로 DepositSol 실패 — 계정 주소 불일치 | — | FIXED | 2026-03-19 |
| 398 | BUG | HIGH | Pendle API 응답 스키마 불일치 회귀 — buy_pt 응답 array vs object (#373 재발) | — | FIXED | 2026-03-19 |
| 399 | BUG | HIGH | Kamino/Drift SDK 런타임 미설치로 Solana DeFi 기능 사용 불가 — #374/#375 후속 | — | FIXED | 2026-03-19 |
| 400 | BUG | CRITICAL | Aave V3 포지션 formatWei 18 decimals 하드코딩으로 USDC 등 비-18 토큰 표시 오류 — amount/USD 0 표시 | — | FIXED | 2026-03-19 |
| 401 | BUG | HIGH | PositionTracker 시작 시 STAKING 즉시 동기화 누락 — 최대 15분간 Lido 포지션 미표시 | — | FIXED | 2026-03-19 |
| 402 | BUG | HIGH | Kamino/Drift SDK RPC URL 미설정으로 Action 실행 전면 실패 — Endpoint URL must start with http | — | FIXED | 2026-03-19 |
| 403 | BUG | HIGH | Pendle API 응답 스키마 불일치 재발 — buy_pt array vs object (#373/#398 3회차) | — | FIXED | 2026-03-19 |
| 404 | BUG | MEDIUM | DCent Swap dex_swap fromDecimals/toDecimals 필수인데 시나리오/문서 누락 — 파라미터 없이 호출 시 검증 실패 | — | FIXED | 2026-03-19 |
| 405 | BUG | MEDIUM | simulate API에서 gasCondition 파라미터 무시됨 — 낮은 maxGasPrice에도 success: true 반환 | — | FIXED | 2026-03-19 |
| 406 | BUG | HIGH | Kamino Supply programId.toBuffer is not a function — @solana/kit 6.x PublicKey 호환성 | — | FIXED | 2026-03-19 |
| 407 | BUG | HIGH | Pendle API 응답 스키마 불일치 4회차 재발 — array vs object (#373/#398/#403 후속) | — | FIXED | 2026-03-19 |
| 408 | BUG | HIGH | Drift SDK Wallet.local is not a function — SDK 초기화 호환성 에러 | — | FIXED | 2026-03-19 |
| 409 | BUG | MEDIUM | DCent get_quotes informational 액션이 ACTION_RESOLVE_FAILED로 반환 — 결과 데이터는 포함 | — | FIXED | 2026-03-19 |
| 410 | BUG | HIGH | DCent Swap Solana txdata 스키마 회귀 — EVM from/to Required (#394 재발) | — | FIXED | 2026-03-19 |
| 411 | BUG | MEDIUM | UserOp Build/Sign 경로 불일치 + UAT 시나리오 오류 — /v1/wallets/{id}/userop/* 가 실제 경로 | — | FIXED | 2026-03-19 |
| 412 | ENHANCEMENT | HIGH | Action Provider 외부 API/SDK 요청/응답 디버그 로깅 누락 — ActionApiClient 공통 + SDK Wrapper별 로깅 | — | FIXED | 2026-03-19 |
| 413 | BUG | HIGH | Kamino Supply "Missing accounts for Solana contract call" — #406 수정 후 새 에러, SDK instruction accounts 비어있음 | — | FIXED | 2026-03-20 |
| 414 | BUG | HIGH | Pendle buy_pt 스키마 불일치 5회차 재발 — #407 passthrough 수정 불완전, 실제 API 응답 구조 미반영 | — | FIXED | 2026-03-20 |
| 415 | BUG | HIGH | Drift SDK 초기화 시 Solana RPC 429 + 재시도 로직 부재 — subscribe() 3-4회 RPC, RPC Pool 미연동 | — | FIXED | 2026-03-20 |
| 416 | BUG | MEDIUM | Action Provider 디버그 로그가 log_level 설정 무시하고 항상 출력 — #412 후속, ConsoleLogger 레벨 필터링 없음 | — | FIXED | 2026-03-20 |
| 417 | MISSING | MEDIUM | DCent Swap Solana 체인 미지원 — EVM 전용 가드로 Solana 스왑 차단, defi-16 시나리오 실행 불가 | — | FIXED | 2026-03-20 |
| 418 | ENHANCEMENT | MEDIUM | 데몬 기본 로그 레벨이 debug로 동작 — console.debug() 직접 호출이 ConsoleLogger 레벨 필터링 우회 | — | FIXED | 2026-03-23 |
| 419 | BUG | HIGH | DeFi UAT 6시나리오 반복 검증 및 수정 루프 — 3/6 PASS(defi-09/14 코드수정, defi-08/10 RPC환경, defi-15/16 DCent API 제한) | — | FIXED | 2026-03-23 |
| 420 | BUG | HIGH | Kamino/Drift SDK wrapper RPC Pool reportFailure 연동 — 로테이션 코드 수정 완료, public RPC 3개 전부 제한(429/403/freetier), 유료 RPC 필요 | — | FIXED | 2026-03-23 |
| 421 | ENHANCEMENT | MEDIUM | RPC rate limit/access 에러 시 유료 RPC 설정 안내 hint 누락 — ACTION_RESOLVE_FAILED 응답에 설정 방법 안내 필요 | — | FIXED | 2026-03-23 |
| 422 | BUG | HIGH | Nightly local-validator Turborepo ENXIO 에러 5일 연속 실패 — #352 수정이 nightly.yml에 미적용 | — | FIXED | 2026-03-23 |
| 423 | BUG | MEDIUM | Admin UI RPC Save 후 빌트인 fallback URL 사라짐 — buildUrlEntries 호출 시 builtinDefaults 미전달, 전 네트워크 영향 | — | FIXED | 2026-03-23 |
| 424 | BUG | HIGH | Admin UI 등록 RPC URL이 RpcPool에 미시딩 — rpc_pool.* DB 키를 daemon-startup에서 pool에 등록하지 않음 | — | FIXED | 2026-03-23 |
| 425 | BUG | HIGH | Drift SDK getDepositIx 호환성 에러 — 현재 @drift-labs/sdk 버전에서 메서드 제거/변경, defi-10 UAT 실패 | — | FIXED | 2026-03-23 |
| 426 | BUG | HIGH | DCent 크로스체인 스왑 toWalletAddress에 출발 체인 주소 사용 — 입력 스키마 미지원 + 하드코딩, defi-15 fail_internal_error 원인 | — | FIXED | 2026-03-23 |
| 427 | BUG | CRITICAL | DCent Solana 스왑 3중 오류 — base58/base64 인코딩 불일치 + blockhash 미갱신 + CONTRACT_CALL 파이프라인 부적합 | — | FIXED | 2026-03-23 |
| 428 | BUG | HIGH | DeFi UAT defi-08/09/10 반복 검증 및 수정 — Kamino stale slot + Pendle market 만료 + Drift subscribe 실패, #424 반영 데몬 재시작 필요 | — | OPEN | 2026-03-23 |

## Type Legend

| 유형 | 설명 |
|------|------|
| BUG | 의도와 다르게 동작하는 결함 |
| ENHANCEMENT | 기능은 정상이나 개선이 필요한 사항 |
| MISSING | 설계에 포함되었으나 구현이 누락된 기능 |

## Summary

- **OPEN:** 1
- **FIXED:** 427
- **WONTFIX:** 1
- **Total:** 428
- **Archived:** 366 (001–366)
