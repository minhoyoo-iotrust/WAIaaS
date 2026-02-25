# Requirements: WAIaaS v28.8

**Defined:** 2026-02-25
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1 Requirements

Requirements for milestone v28.8. Each maps to roadmap phases.

### Preset (빌트인 지갑 프리셋)

- [ ] **PRST-01**: 빌트인 지갑 프리셋 맵 등록 (초기: D'CENT 1종), WalletPreset 타입 정의 + WalletLinkConfig 자동 매핑
- [ ] **PRST-02**: wallet_type 제공 시 signing SDK enabled + 레지스트리 등록 + approval_method + preferred_wallet 4단계 자동 설정
- [ ] **PRST-03**: wallet_type 미제공 시 기존 동작 100% 유지 (하위 호환)
- [ ] **PRST-04**: 빌트인에 없는 wallet_type 제공 시 400 에러 반환
- [ ] **PRST-05**: 자동 설정 실패 시 전체 롤백 (Settings 스냅샷 복원 + DB 트랜잭션 롤백)

### API (Owner 등록 API)

- [ ] **API-01**: PUT /v1/wallets/{walletId}/owner에 wallet_type 필드 추가 (SetOwnerRequestSchema 확장)
- [ ] **API-02**: wallet_type + approval_method 동시 제공 시 프리셋 우선 적용 + warning 응답 필드 포함
- [ ] **API-03**: REST API 스키마(WalletOwnerResponseSchema walletType/warning), wallet.skill.md 반영. MCP/SDK 해당 없음

### DB (스키마 변경)

- [ ] **DB-01**: wallets 테이블 wallet_type 컬럼 추가 (nullable TEXT, 마이그레이션 v24)

### Admin UI (Owner 등록 폼)

- [ ] **ADUI-01**: Owner 등록 폼에 지갑 종류 드롭다운 추가 (빌트인 프리셋 목록 + Custom 옵션)

### Relay (Push Relay Payload 변환)

- [ ] **RLAY-01**: Push Relay config.toml [relay.push.payload] 스키마 확장 (static_fields + category_map, Zod 검증)
- [ ] **RLAY-02**: ConfigurablePayloadTransformer 구현 — static_fields 주입 + category_map 카테고리별 매핑
- [ ] **RLAY-03**: 변환 파이프라인 통합 — buildPushPayload() → transformer → IPushProvider.send()
- [ ] **RLAY-04**: [relay.push.payload] 미설정 시 기존 동작 유지 (bypass)

## Future Requirements

없음 — 이번 마일스톤에서 R1-R13 전량 구현.

## Out of Scope

| Feature | Reason |
|---------|--------|
| 복수 빌트인 지갑 (D'CENT 외) | D'CENT SDK 연동 완료 후 추가 지갑 확장 — 프레임워크만 준비 |
| MCP/SDK Owner 등록 메서드 | 현재 코드베이스에 해당 도구/메서드 없음 — 필요 시 별도 마일스톤 |
| Push Relay 커스텀 변환 플러그인 | 선언적 config 변환으로 대부분 커버 — 플러그인 아키텍처는 과도 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PRST-01 | — | Pending |
| PRST-02 | — | Pending |
| PRST-03 | — | Pending |
| PRST-04 | — | Pending |
| PRST-05 | — | Pending |
| API-01 | — | Pending |
| API-02 | — | Pending |
| API-03 | — | Pending |
| DB-01 | — | Pending |
| ADUI-01 | — | Pending |
| RLAY-01 | — | Pending |
| RLAY-02 | — | Pending |
| RLAY-03 | — | Pending |
| RLAY-04 | — | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 0
- Unmapped: 14 ⚠️

---
*Requirements defined: 2026-02-25*
*Last updated: 2026-02-25 after initial definition*
