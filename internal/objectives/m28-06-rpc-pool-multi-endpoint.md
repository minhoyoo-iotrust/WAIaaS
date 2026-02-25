# 마일스톤 m28-06: RPC Pool — 멀티 엔드포인트 로테이션

- **Status:** PLANNED
- **Milestone:** v28.7

## 목표

네트워크당 복수의 RPC 엔드포인트를 등록·로테이션하여, 무료 티어 rate limit(429/408)에 의한 잔액 조회·수신 트랜잭션 모니터링 실패를 구조적으로 해소하고, Admin UI의 기존 RPC Endpoints 탭에서 네트워크별 RPC 목록을 관리할 수 있는 상태.

---

## 배경

### 현재 한계

WAIaaS는 네트워크당 단일 RPC URL에 의존한다. 모든 요청(잔액 조회, 트랜잭션 제출, 수신 모니터링)이 하나의 엔드포인트에 집중되어, 무료 공용 RPC의 rate limit에 즉시 도달한다.

- **#185**: EVM IncomingSubscriber — dRPC 무료 Arbitrum에서 `eth_getLogs` 408 타임아웃 → 수신 트랜잭션 무음 누락
- **#187**: Solana 메인넷 — `api.mainnet-beta.solana.com` 429 → Admin UI 잔액 조회 불가
- 공통: 어댑터 레벨에 재시도 로직 없음, fallback RPC 없음, 관리자에게 RPC 장애 통보 없음

### 현재 Admin UI 구조

Wallets 페이지에 3개 탭 존재:
- **Wallets** — 지갑 목록 및 생성
- **RPC Endpoints** — 네트워크별 단일 RPC URL 설정 + 연결 테스트
- **WalletConnect** — WalletConnect 연동

현재 RPC Endpoints 탭은 네트워크당 **단일 텍스트 입력** + **Test 버튼**(레이턴시, 블록 번호 표시)으로 구성. 이를 **복수 URL 목록 관리**로 확장한다.

### 사용 시나리오

```
관리자: Admin UI > Wallets > RPC Endpoints 탭

  Ethereum Mainnet:
    1. eth.drpc.org          ✅ 정상 (42ms, #21504832)
    2. ethereum.publicnode.com ✅ 정상 (65ms, #21504832)
    3. rpc.ankr.com/eth       ⏸️ cooldown (28초 남음, 연속 실패 2회)
    [+ URL 추가]

→ 잔액 조회 시 #1 → 429 → 자동으로 #2로 재시도 → 성공
→ #1에 60초 cooldown, 해제 후 복귀
→ 전체 실패 시에만 에러 + 관리자 알림
```

---

## 핵심 요구사항

### R-01: RPC Pool 코어

- 네트워크당 N개 RPC URL 등록 (순서 = 우선순위)
- 라운드 로빈 + 실패 시 다음 엔드포인트 fallback
- 429/408/5xx 응답 시 해당 RPC에 cooldown (기본 60초, 지수 증가, 최대 5분)
- cooldown 중인 RPC는 자동 스킵, cooldown 해제 시 복귀
- 전체 RPC 실패 시에만 에러 전파 + `RPC_ALL_FAILED` 알림 이벤트

### R-02: 빌트인 기본 RPC 목록

설정 없이도 안정적으로 동작하도록 네트워크당 복수의 무료 공용 RPC를 빌트인 기본값으로 제공.

**메인넷:**

| 네트워크 | 빌트인 RPC (순서 = 우선순위) |
|----------|---------------------------|
| Solana mainnet | `api.mainnet-beta.solana.com`, `rpc.ankr.com/solana`, `solana.drpc.org` |
| Ethereum mainnet | `eth.drpc.org`, `rpc.ankr.com/eth`, `ethereum.publicnode.com` |
| Arbitrum mainnet | `arbitrum.drpc.org`, `arbitrum.publicnode.com` |
| Optimism mainnet | `optimism.drpc.org`, `mainnet.optimism.io`, `optimism.publicnode.com` |
| Base mainnet | `base.drpc.org`, `base.publicnode.com` |
| Polygon mainnet | `polygon.drpc.org`, `polygon-rpc.com`, `polygon.publicnode.com` |

**테스트넷:**

| 네트워크 | 빌트인 RPC |
|----------|-----------|
| Solana devnet | `api.devnet.solana.com`, `rpc.ankr.com/solana_devnet` |
| Solana testnet | `api.testnet.solana.com` |
| Ethereum Sepolia | `sepolia.drpc.org`, `ethereum-sepolia-rpc.publicnode.com` |
| Arbitrum Sepolia | `arbitrum-sepolia.drpc.org`, `arbitrum-sepolia-rpc.publicnode.com` |
| Optimism Sepolia | `optimism-sepolia.drpc.org`, `optimism-sepolia-rpc.publicnode.com` |
| Base Sepolia | `base-sepolia.drpc.org`, `base-sepolia-rpc.publicnode.com` |
| Polygon Amoy | `polygon-amoy.drpc.org` |

### R-03: 어댑터 통합

- `AdapterPool`이 RPC Pool에서 엔드포인트를 받아 어댑터에 주입
- SolanaAdapter: `getBalance()`, `getAssets()` 호출 시 RPC Pool 경유
- EvmAdapter: viem `createPublicClient` 생성 시 RPC Pool에서 URL 획득
- IncomingTxMonitor: 각 Subscriber가 RPC Pool을 통해 폴링

### R-04: Config + Admin Settings

- `config.toml`의 기존 단일 URL 설정은 하위 호환 유지 (1개짜리 Pool로 동작)
- Admin Settings에서 네트워크별 RPC URL 목록 추가/삭제/순서 변경
- hot-reload 지원 — RPC 목록 변경 시 데몬 재시작 불필요

### R-05: Admin UI — RPC Endpoints 탭 확장

기존 Wallets > RPC Endpoints 탭의 단일 URL 입력을 복수 URL 목록 관리로 확장:

- 네트워크별 URL 목록 표시 (화살표 또는 드래그로 순서 변경)
- URL별 상태 표시: 정상(레이턴시, 블록 번호) / cooldown(남은 시간, 연속 실패 횟수)
- URL 추가/삭제 폼
- 기존 "연결 테스트" 버튼 유지 — 개별 URL 테스트 가능
- 빌트인 기본 URL은 `(built-in)` 라벨로 구분, 삭제 불가 (비활성화는 가능)

### R-06: 모니터링 + 알림

- 네트워크별 RPC 상태 API: `GET /admin/rpc-status`
- 알림 이벤트:
  - `RPC_HEALTH_DEGRADED`: 특정 RPC가 cooldown 진입 시
  - `RPC_ALL_FAILED`: 네트워크의 전체 RPC가 실패 시
  - `RPC_RECOVERED`: cooldown 해제 후 정상 복귀 시

---

## 기존 호환성

| 항목 | 동작 |
|------|------|
| `config.toml`에 단일 URL 설정 | 1개짜리 Pool로 동작 (기존과 동일) |
| 환경 변수 `WAIAAS_RPC_*` | 해당 URL이 Pool의 첫 번째 항목으로 추가 |
| Admin Settings 미설정 | 빌트인 기본값 사용 |
| Admin Settings에서 URL 추가 | 빌트인 + 사용자 URL 병합, 사용자 URL 우선 |

---

## 해소되는 이슈

| 이슈 | 제목 | 해소 방식 |
|------|------|----------|
| #185 | EVM IncomingSubscriber 408 타임아웃 | fallback RPC로 자동 전환 + cooldown |
| #187 | Solana 메인넷 429 잔액 조회 실패 | 복수 RPC 로테이션으로 rate limit 분산 |

---

## 비목표 (Non-Goals)

- 유료 RPC 프로바이더 자동 프로비저닝 (사용자가 직접 URL 입력)
- RPC 응답 시간 기반 자동 최적화 (라운드 로빈 + cooldown으로 충분)
- WebSocket RPC Pool (HTTP RPC만 대상, WS는 단일 유지)
