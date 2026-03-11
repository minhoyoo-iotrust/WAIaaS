# 324 — DELAY 티어 + DEX quote 만료로 스왑 트랜잭션 revert

- **유형:** BUG
- **심각도:** CRITICAL
- **마일스톤:** v31.9
- **상태:** OPEN

## 현상

DEX 스왑(0x, Jupiter 등)의 defaultTier가 DELAY(300초)로 설정되어 있어, quote 유효 시간(30~120초)이 DELAY 대기 시간보다 짧다. 대기 완료 후 트랜잭션 실행 시 calldata가 stale 상태여서 온체인 revert가 발생한다.

- defi-02 (0x Swap): quote 만료로 revert, 가스비 ~0.005 ETH 낭비
- defi-01 (Jupiter): API 키 미설정으로 미확인이나 동일 구조

## 원인

모든 DeFi 액션의 기본 티어가 DELAY(300초)이며, DEX 스왑 특성(짧은 quote 유효 시간)을 고려하지 않음. DELAY 재진입 시 quote를 재발급하는 로직도 없음.

## 해결 방안

1. DEX 스왑 액션(0x, Jupiter, DCent Swap 등)의 기본 티어를 INSTANT로 변경
2. 또는 DELAY 재진입(Stage3 → Stage1) 시 quote 재발급 로직 추가
3. 두 방안 병행 가능 — INSTANT 기본 + 사용자가 DELAY 설정 시 재발급 보장

## 영향 범위

- `packages/actions/src/providers/zerox/` — 0x Swap
- `packages/actions/src/providers/jupiter/` — Jupiter Swap
- `packages/actions/src/providers/dcent-swap/` — DCent Swap
- `packages/daemon/src/pipeline/stages.ts` — DELAY 재진입 경로

## 테스트 항목

1. DEX 스왑 액션의 기본 티어가 INSTANT인지 확인하는 단위 테스트
2. DELAY 티어 설정 시 재진입 경로에서 quote 재발급이 호출되는지 통합 테스트
3. quote 만료 시나리오 시뮬레이션 (mock expired calldata → revert 방지 확인)
