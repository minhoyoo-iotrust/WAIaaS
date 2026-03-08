# Feature Landscape: Across Protocol Bridge

**Domain:** DeFi Cross-Chain Bridge (Intent-based)
**Researched:** 2026-03-08

## Table Stakes

브릿지 통합에 필수적인 기능. 누락 시 사용 불가.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Bridge Quote (견적 조회) | 수수료/수령액 사전 확인 필수 | Low | GET /suggested-fees API 호출 |
| Bridge Execute (실행) | 핵심 기능 -- SpokePool depositV3 호출 | Med | approve + depositV3 BATCH, native token msg.value |
| Bridge Status (상태 추적) | 크로스체인 TX는 완료까지 시간 소요 | Med | AsyncPollingService + /deposit/status API |
| Available Routes (지원 경로) | 에이전트가 가능한 경로 파악 | Low | GET /available-routes API 호출 |
| Bridge Limits (한도 조회) | min/max deposit 사전 확인 | Low | GET /limits API 호출 |
| ERC-20 Token Bridge | 대부분의 브릿지 사용 사례 | Med | approve + depositV3 ContractCallRequest[] |
| Native Token Bridge | ETH/MATIC 등 네이티브 토큰 전송 | Low | depositV3 with msg.value, inputToken = WETH address |
| MCP Tool Exposure | AI 에이전트 접근성 | Low | mcpExpose=true (자동) |
| SDK Methods | 프로그래밍 접근 | Low | 5 메서드 (quote/execute/status/routes/limits) |
| Admin Settings | 런타임 설정 변경 | Low | 6 settings keys |
| Error Handling | 실패 시 명확한 에러 메시지 | Med | insufficient liquidity, unsupported route, expired quote |

## Differentiators

Across 고유 장점을 활용하는 기능. 없어도 동작하지만 가치 제공.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| 초고속 Fill 알림 | Across는 2-10초 내 fill 완료 -- 사용자에게 즉시 알림 | Low | bridge_status COMPLETED 시 BRIDGE_COMPLETED 노티 |
| IncomingTxMonitor 연동 | 목적지 체인에서 Relayer fill을 INCOMING_TX_DETECTED로 자동 감지 | Low | 기존 IncomingTxMonitor가 ERC-20 transfer 자동 감지 (변경 불필요) |
| fillDeadline 커스텀 | 사용자가 fill deadline 조절 가능 (기본 6시간) | Low | Admin Settings로 노출 |
| Integrator ID 설정 | Rate limit 완화 + Across 대시보드 통계 | Low | Admin Settings에 optional 설정 |

## Anti-Features

명시적으로 구현하지 않을 기능.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| LI.FI vs Across 자동 라우팅 | 복잡도 높고, 비교 기준 모호. 범위 외 명시 | 사용자/에이전트가 명시적으로 프로토콜 선택 |
| Cross-chain message passing | depositV3의 message 파라미터로 목적지 컨트랙트 호출 가능하나, 보안 위험 높음 | message = 0x (빈 값)으로 고정. 단순 토큰 브릿지만 지원 |
| Exclusive relayer 지정 | 일반 사용자에게 불필요. Across API가 기본값 제공 | /suggested-fees에서 반환하는 exclusiveRelayer 그대로 사용 |
| Across Swap API (/swap/approval) | Swap은 bridge와 다른 API이며, API key 필요. 이번 범위 외 | Bridge API (/suggested-fees + depositV3)만 사용 |

## Feature Dependencies

```
AcrossApiClient --> AcrossBridgeActionProvider (quote/execute/routes/limits)
AcrossApiClient --> AcrossBridgeStatusTracker (status polling)
AcrossBridgeActionProvider --> MCP Tools (mcpExpose=true)
AcrossBridgeActionProvider --> SDK Methods
AcrossBridgeStatusTracker --> AsyncPollingService (daemon registration)
Bridge Enrollment --> AsyncPollingService pickup
Admin Settings --> Config initialization
```

## MVP Recommendation

우선 구현:
1. **quote + execute** -- 핵심 브릿지 기능 (ERC-20 + native token)
2. **status tracking** -- 브릿지 완료 확인 필수
3. **routes + limits** -- 에이전트가 가능한 경로 파악

Defer:
- Cross-chain message passing: 보안 검증 필요, 이번 범위 외
- Swap API 통합: API key 필요, 별도 마일스톤으로 분리
- LI.FI-Across 자동 비교: 브릿지 애그리게이션 레이어에서 추후 다룸

## Sources

- [Across API Reference](https://docs.across.to/reference/api-reference)
- [Across Bridge Guide](https://docs.across.to/developer-quickstart/bridge)
- WAIaaS objective: `internal/objectives/m31-06-across-protocol-bridge.md`
