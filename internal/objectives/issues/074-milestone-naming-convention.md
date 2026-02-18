# Issue #074: 마일스톤 목표 문서 명명 규칙 변경 — 버전 제거, 순번 기반

- **유형**: ENHANCEMENT
- **심각도**: MEDIUM
- **마일스톤**: m20

## 현황

현재 마일스톤 목표 문서가 릴리스 버전으로 명명됨:

```
v2.0.1-opensource-governance.md
v2.0.2-test-coverage-improvement.md
```

문제:

1. **release-please 버전과 불일치** — release-please는 커밋 타입(`feat:` → minor, `fix:` → patch)으로 버전을 결정하므로, 목표 문서 이름의 버전과 실제 릴리스 버전이 다를 수 있음
2. **프리릴리스 흐름과 충돌** — `prerelease: true` 기본 운영에서 버전을 미리 고정하면 자동 버전 결정을 방해
3. **중간 삽입 불가** — v2.0.1과 v2.0.2 사이에 긴급 마일스톤을 끼워넣을 수 없음

## 변경 사항

### 명명 규칙

```
기존: v{version}-{slug}.md
변경: m{순번}-{slug}.md           (메이저 마일스톤)
      m{순번}-{서브순번}-{slug}.md  (끼워넣기 / 같은 주제의 하위 마일스톤)
```

같은 주제의 설계 → 구현, 또는 마이너 패치는 서브순번으로 묶는다:

```
m10-multichain-wallet-design.md       ← 설계
m10-01-multichain-wallet-impl.md      ← 같은 주제 구현
m15-defi-basic-protocol-design.md     ← 설계
m15-01-jupiter-swap.md                ← 하위 프로토콜
m15-02-0x-evm-swap.md                 ← 하위 프로토콜
```

### 전체 매핑 (아카이브 + 활성)

#### 아카이브 (m01~m37)

| 현재 | 변경 | 비고 |
|------|------|------|
| `v0.1-basic-concepts.md` | `m01-basic-concepts.md` | |
| `v0.2-self-hosted-secure-wallet.md` | `m02-self-hosted-secure-wallet.md` | |
| `v0.3-design-consistency.md` | `m03-design-consistency.md` | |
| `v0.4-test-strategy.md` | `m04-test-strategy.md` | |
| `v0.5-auth-restructure-dx.md` | `m05-auth-restructure-dx.md` | |
| `v0.6-blockchain-feature-expansion.md` | `m06-blockchain-feature-expansion.md` | |
| `v0.7-implementation-blockers-resolution.md` | `m07-implementation-blockers-resolution.md` | |
| `v0.8-optional-owner-progressive-security.md` | `m08-optional-owner-progressive-security.md` | |
| `v0.9-session-management-automation.md` | `m09-session-management-automation.md` | |
| `v0.10-pre-implementation-design-completion.md` | `m10-pre-implementation-design-completion.md` | |
| `v1.0-implementation-planning.md` | `m11-implementation-planning.md` | |
| `v1.1-core-infrastructure.md` | `m12-core-infrastructure.md` | |
| `v1.2-auth-policy-engine.md` | `m13-auth-policy-engine.md` | |
| `v1.3-sdk-mcp-notifications.md` | `m14-sdk-mcp-notifications.md` | |
| `v1.3.1-admin-ui-design.md` | `m14-01-admin-ui-design.md` | 서브 |
| `v1.3.2-admin-ui-impl.md` | `m14-02-admin-ui-impl.md` | 서브 |
| `v1.3.3-mcp-multi-agent.md` | `m14-03-mcp-multi-agent.md` | 서브 |
| `v1.3.4-notification-trigger-integration.md` | `m14-04-notification-trigger-integration.md` | 서브 |
| `v1.4-token-contract-extension.md` | `m15-token-contract-extension.md` | |
| `v1.4.1-evm-wallet-infrastructure.md` | `m15-01-evm-wallet-infrastructure.md` | 서브 |
| `v1.4.2-agent-to-wallet-terminology.md` | `m15-02-agent-to-wallet-terminology.md` | 서브 |
| `v1.4.3-evm-token-registry-mcp-dx.md` | `m15-03-evm-token-registry-mcp-dx.md` | 서브 |
| `v1.4.4-admin-settings-management.md` | `m15-04-admin-settings-management.md` | 서브 |
| `v1.4.5-multichain-wallet-design.md` | `m15-05-multichain-wallet-design.md` | 서브 |
| `v1.4.6-multichain-wallet-impl.md` | `m15-06-multichain-wallet-impl.md` | 서브 |
| `v1.4.7-arbitrary-transaction-signing.md` | `m15-07-arbitrary-transaction-signing.md` | 서브 |
| `v1.4.8-admin-dx-notification-improvements.md` | `m15-08-admin-dx-notification-improvements.md` | 서브 |
| `v1.5-defi-price-oracle.md` | `m16-defi-price-oracle.md` | |
| `v1.5.1-x402-client.md` | `m16-01-x402-client.md` | 서브 |
| `v1.5.2-admin-policy-form-ux.md` | `m16-02-admin-policy-form-ux.md` | 서브 |
| `v1.5.3-usd-policy-enhancement.md` | `m16-03-usd-policy-enhancement.md` | 서브 |
| `v1.6-desktop-telegram-docker.md` | `m17-desktop-telegram-docker.md` | |
| `v1.6.1-walletconnect-owner-approval.md` | `m17-01-walletconnect-owner-approval.md` | 서브 |
| `v1.7-quality-cicd.md` | `m18-quality-cicd.md` | |
| `v1.8-upgrade-distribution.md` | `m19-upgrade-distribution.md` | |
| `v2.0-release.md` | `m20-release.md` | |

#### 활성 (m21~)

| 현재 | 변경 | 비고 |
|------|------|------|
| `v2.0.1-opensource-governance.md` | `m21-opensource-governance.md` | |
| `v2.0.2-test-coverage-improvement.md` | `m22-test-coverage-improvement.md` | |
| `v2.0.3-admin-ui-feature-grouping.md` | `m23-admin-ui-feature-grouping.md` | |
| `v2.0.4-npm-trusted-publishing.md` | `m24-npm-trusted-publishing.md` | |
| `v2.0.5-dx-polish.md` | `m25-dx-polish.md` | |
| `v2.1-wallet-sdk-design.md` | `m26-wallet-sdk-design.md` | |
| `v2.1.1-wallet-signing-sdk.md` | `m26-01-wallet-signing-sdk.md` | 서브 |
| `v2.1.2-wallet-notification-channel.md` | `m26-02-wallet-notification-channel.md` | 서브 |
| `v2.1.3-push-relay-server.md` | `m26-03-push-relay-server.md` | 서브 |
| `v2.2-incoming-transaction-monitoring.md` | `m27-incoming-transaction-monitoring.md` | |
| `v2.2.1-incoming-transaction-monitoring-impl.md` | `m27-01-incoming-transaction-monitoring-impl.md` | 서브 |
| `v2.3-defi-basic-protocol-design.md` | `m28-defi-basic-protocol-design.md` | |
| `v2.3.1-jupiter-swap.md` | `m28-01-jupiter-swap.md` | 서브 |
| `v2.3.2-0x-evm-swap.md` | `m28-02-0x-evm-swap.md` | 서브 |
| `v2.3.3-lifi-crosschain-bridge.md` | `m28-03-lifi-crosschain-bridge.md` | 서브 |
| `v2.3.4-liquid-staking.md` | `m28-04-liquid-staking.md` | 서브 |
| `v2.4-defi-advanced-protocol-design.md` | `m29-defi-advanced-protocol-design.md` | |
| `v2.4.1-aave-evm-lending.md` | `m29-01-aave-evm-lending.md` | 서브 |
| `v2.4.2-kamino-solana-lending.md` | `m29-02-kamino-solana-lending.md` | 서브 |
| `v2.4.3-pendle-yield-trading.md` | `m29-03-pendle-yield-trading.md` | 서브 |
| `v2.4.4-drift-solana-perp.md` | `m29-04-drift-solana-perp.md` | 서브 |
| `v2.4.5-morpho-evm-lending.md` | `m29-05-morpho-evm-lending.md` | 서브 |
| `v2.4.6-marinade-sol-staking.md` | `m29-06-marinade-sol-staking.md` | 서브 |
| `v2.4.7-cow-protocol-mev-free-swap.md` | `m29-07-cow-protocol-mev-free-swap.md` | 서브 |
| `v2.5-operational-features-design.md` | `m30-operational-features-design.md` | |
| `v2.5.1-operational-features-impl.md` | `m30-01-operational-features-impl.md` | 서브 |
| `v2.5.2-master-password-change.md` | `m30-02-master-password-change.md` | 서브 |
| `v2.6-desktop-architecture-redesign.md` | `m31-desktop-architecture-redesign.md` | |
| `v2.6.1-desktop-app.md` | `m31-01-desktop-app.md` | 서브 |

### 이슈 파일 명명

마일스톤 접두사 제거, 전역 ID만 사용:

```
현재: v2.0-072-language-convention-tags-releases.md
변경: 072-language-convention-tags-releases.md
```

### 문서 내부 변경

각 목표 문서의 제목에서 버전 → 순번:

```
현재: # 마일스톤 v2.0.1: 오픈소스 기본 체계 + 내부 문서 정리
변경: # 마일스톤 m21: 오픈소스 기본 체계 + 내부 문서 정리
```

릴리스 버전 필드 추가 (릴리스 후 기록):

```markdown
- **릴리스 버전**: — (릴리스 후 기록)
```

### CLAUDE.md 규칙 갱신

```
마일스톤 목표 문서는 internal/objectives/ 디렉토리에 m{순번}-{slug}.md 형식으로 작성한다.
같은 주제의 하위 마일스톤 또는 중간 삽입 시 m{순번}-{서브순번}-{slug}.md 형식을 사용한다.
이슈는 internal/objectives/issues/ 디렉토리에 {NNN}-{slug}.md 형식으로 작성한다.
```

## 완료 기준

- [ ] 아카이브 목표 문서 36개 파일명 변경
- [ ] 활성 목표 문서 29개 파일명 변경
- [ ] 각 문서 내부 제목 변경 + 릴리스 버전 필드 추가
- [ ] 이슈 파일 4개 마일스톤 접두사 제거
- [ ] TRACKER.md 마일스톤 컬럼 갱신
- [ ] CLAUDE.md 명명 규칙 갱신
- [ ] 문서 간 상호 참조 링크 수정
