# #360 — Admin UI 사이드바 "Trading" → "Protocols" 섹션 이름 변경

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **상태:** FIXED
- **발견일:** 2026-03-16

## 설명

Admin UI 사이드바의 "Trading" 섹션 이름이 실제 포함된 메뉴 항목의 성격과 맞지 않는다. 현재 이 섹션에는 Providers(RPC/Oracle 등 인프라), Hyperliquid, Polymarket 등 다양한 **프로토콜** 설정이 포함되어 있으며, 향후 Agent Identity(ERC-8004 등)도 같은 섹션에 묶을 수 있다.

### 현재 상태

```
TRADING
├── Providers
├── Hyperliquid
└── Polymarket
```

### 변경 후

```
PROTOCOLS
├── Providers
├── Hyperliquid
├── Polymarket
└── Agent Identity (기존 위치에서 이동)
```

## 근거

- "Trading"은 Swap/Perp에 한정된 의미이나, 실제로는 Staking(Lido/Jito), Lending(Aave/Kamino), Yield(Pendle) 등 비트레이딩 프로토콜 설정도 포함
- "Protocols"는 DeFi 프로토콜 + 에이전트 프로토콜(ERC-8004)을 포괄하는 상위 개념
- Agent Identity가 현재 별도 위치에 있으나 프로토콜 수준 개념이므로 같은 섹션이 자연스러움

## 수정 범위

- `packages/admin/src/` 사이드바 컴포넌트에서 섹션 라벨 `TRADING` → `PROTOCOLS` 변경
- Agent Identity 메뉴 항목을 Protocols 섹션으로 이동
- 관련 테스트 업데이트

## 테스트 항목

- [ ] 사이드바 렌더링 테스트 — "PROTOCOLS" 라벨 표시 확인
- [ ] Agent Identity가 Protocols 섹션 하위에 정상 표시
- [ ] 기존 Providers/Hyperliquid/Polymarket 메뉴 정상 동작 확인
