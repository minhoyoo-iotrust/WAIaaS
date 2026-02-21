# 109 — 기존 마일스톤 목표 문서에 상태 헤더 추가

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** v2.6.1
- **상태:** FIXED
- **등록일:** 2026-02-20

## 현상

CLAUDE.md에 마일스톤 목표 문서의 상태 헤더 규칙이 추가되었으나, 기존에 작성된 29개 목표 문서에는 상태 헤더가 없다. 문서만 보고 해당 마일스톤이 완료인지 미진행인지 판별할 수 없다.

## 수정 범위

29개 목표 문서 제목 아래에 상태 헤더를 추가한다.

### SHIPPED (2개)

| 파일 | 마일스톤 | 패키지 버전 | 완료일 |
|------|---------|------------|--------|
| `m24-01-admin-coverage-restoration.md` | v2.4.1 | 2.4.0-rc.1 | 2026-02-19 |
| `m25-00-dx-polish.md` | v2.5 | 2.4.0-rc.2 | 2026-02-19 |

### IN_PROGRESS (4개)

| 파일 | 마일스톤 |
|------|---------|
| `m26-00-wallet-sdk-design.md` | v2.6 |
| `m26-01-wallet-signing-sdk.md` | v2.6 |
| `m26-02-wallet-notification-channel.md` | v2.6 |
| `m26-03-push-relay-server.md` | v2.6 |

### PLANNED (23개)

| 파일 | 마일스톤 |
|------|---------|
| `m27-00-incoming-transaction-monitoring.md` | TBD |
| `m27-01-incoming-transaction-monitoring-impl.md` | TBD |
| `m27-02-caip19-asset-identification.md` | TBD |
| `m28-00-defi-basic-protocol-design.md` | TBD |
| `m28-01-jupiter-swap.md` | TBD |
| `m28-02-0x-evm-swap.md` | TBD |
| `m28-03-lifi-crosschain-bridge.md` | TBD |
| `m28-04-liquid-staking.md` | TBD |
| `m28-05-gas-conditional-execution.md` | TBD |
| `m29-00-defi-advanced-protocol-design.md` | TBD |
| `m29-01-aave-evm-lending.md` | TBD |
| `m29-02-kamino-solana-lending.md` | TBD |
| `m29-03-pendle-yield-trading.md` | TBD |
| `m29-04-drift-solana-perp.md` | TBD |
| `m29-05-morpho-evm-lending.md` | TBD |
| `m29-06-marinade-sol-staking.md` | TBD |
| `m29-07-cow-protocol-mev-free-swap.md` | TBD |
| `m30-00-operational-features-design.md` | TBD |
| `m30-01-operational-features-impl.md` | TBD |
| `m30-02-master-password-change.md` | TBD |
| `m30-03-erc4337-account-abstraction.md` | TBD |
| `m31-00-desktop-architecture-redesign.md` | TBD |
| `m31-01-desktop-app.md` | TBD |

### 헤더 형식

CLAUDE.md 규칙에 따라 제목 바로 아래에 추가:

```markdown
# 마일스톤 m25-00: DX 품질 개선

- **Status:** SHIPPED
- **Milestone:** v2.5
- **Package:** 2.4.0-rc.2
- **Completed:** 2026-02-19
```

```markdown
# 마일스톤 m26-01: WAIaaS Wallet Signing SDK

- **Status:** IN_PROGRESS
- **Milestone:** v2.6
```

```markdown
# 마일스톤 m27-00: 인바운드 트랜잭션 모니터링

- **Status:** PLANNED
- **Milestone:** TBD
```

### 영향 범위

- `internal/objectives/m*.md` 29개 파일 — 각 파일 제목 아래 2~4줄 추가

## 테스트 항목

1. 29개 목표 문서 모두에 상태 헤더가 존재하는지 확인
2. SHIPPED 문서에 Package, Completed 필드가 포함되어 있는지 확인
3. IN_PROGRESS, PLANNED 문서에 Package, Completed 필드가 없는지 확인
