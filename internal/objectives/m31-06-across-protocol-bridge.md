# 마일스톤 m31-06: Across Protocol 크로스체인 브릿지

- **Status:** SHIPPED
- **Milestone:** v31.6
- **Completed:** 2026-03-09

## 목표

Across Protocol을 WAIaaS에 통합하여 Intent 기반 고속 크로스체인 브릿지를 지원한다. 기존 EVM 파이프라인(6-stage)과 LI.FI Bridge(v28.3) 패턴을 활용하되, Across 고유의 Intent/Relayer 구조에 맞춘 최적화를 적용한다.

> **리서치 필수**: Across Protocol은 Intent 기반 브릿지로, 일반 lock-and-mint 브릿지와 메커니즘이 다르다. 구현 착수 전에 반드시 Across API 사양, SpokePool 컨트랙트 인터페이스(depositV3 파라미터, fillDeadline, exclusivityDeadline), Relayer 구조, 수수료 모델, 지원 토큰/체인 매트릭스, 상태 추적 API 등을 충분히 리서치하여 설계 문서(doc 79)에 반영해야 한다.

---

## 배경

### Across Protocol 개요

Across는 UMA의 Optimistic Oracle 위에 구축된 Intent 기반 크로스체인 브릿지이다. 특징:
- **Intent 기반**: 사용자가 브릿지 의도를 제출하면 Relayer가 목적지 체인에서 즉시 자금 제공
- **빠른 완결성**: Relayer 선지급 구조로 수초 내 목적지 체인 수령
- **SpokePool 컨트랙트**: 각 체인에 배포된 SpokePool에 `depositV3()` 호출로 브릿지 시작
- **EVM 온체인 TX**: 일반 EVM 트랜잭션으로 처리 (기존 파이프라인 호환)

### 기존 인프라 활용

- **6-stage 파이프라인**: SpokePool 컨트랙트 호출은 `CONTRACT_CALL` type으로 기존 파이프라인 그대로 사용
- **LI.FI Bridge(v28.3)**: 크로스체인 브릿지 Action Provider 패턴 선례
- **ERC-20 approve**: `APPROVE` + `CONTRACT_CALL` 조합 (기존 BATCH 파이프라인 활용 가능)
- **멀티체인**: Ethereum, Arbitrum, Optimism, Base, Polygon, zkSync, Linea — WAIaaS 지원 체인과 대부분 겹침

### LI.FI와의 차별점 및 공존 전략

| 항목 | LI.FI (v28.3) | Across |
|------|---------------|--------|
| 유형 | 브릿지 애그리게이터 | 단일 프로토콜 직접 통합 |
| 속도 | 브릿지별 상이 | Intent 기반 수초 완결 |
| 수수료 | 애그리게이터 + 브릿지 수수료 | LP 수수료 + 가스 (단순 구조) |
| 통합 방식 | LI.FI API → TX data | Across API quote → SpokePool depositV3 |

**공존 방향**: Across는 별도 Action Provider(`AcrossBridgeActionProvider`)로 구현하여 LI.FI와 독립적으로 동작한다. MCP 도구와 SDK 메서드도 별도로 제공하되(`across-bridge-quote`, `across-bridge-execute` 등), 사용자가 프로토콜을 명시적으로 선택한다. 자동 라우팅(견적 비교)은 이번 범위에 포함하지 않으며, 추후 브릿지 애그리게이션 레이어에서 다룬다.

---

## 범위

### Phase 1: Across Protocol 리서치 및 설계 (doc 79)

Across Protocol API와 컨트랙트를 심층 리서치하고 WAIaaS 아키텍처에 통합하는 설계 문서 79를 작성한다.

**리서치 항목:**
- Across API 전체 사양 (suggested-fees, limits, available-routes 등)
- SpokePool 컨트랙트 인터페이스 (depositV3 파라미터, 체인별 주소)
- 수수료 모델 (LP fee, relayer fee, gas fee 구조)
- 지원 토큰/체인 매트릭스 및 최소/최대 금액 제한
- 브릿지 상태 추적 API (deposit status, fill event)
- fillDeadline / exclusivityDeadline 기본값 전략
- 에러 케이스 (insufficient liquidity, unsupported route, timeout)

**설계 항목:**
- AcrossBridgeProvider 인터페이스 설계 (IBridgeProvider 확장 또는 신규)
- Quote → Approve → Deposit 플로우 → 6-stage 파이프라인 매핑
- 브릿지 상태 추적 방식 결정: DB 테이블 vs Across API 폴링 전용 (DB 필요 여부를 이 단계에서 확정)
- fillDeadline / exclusivityDeadline 기본값 및 Admin Settings 노출 범위
- IncomingTxMonitor(v27.1) 연동: 목적지 체인 수신 감지 시나리오 평가
- MCP 도구 / SDK 메서드 설계
- 정책 엔진 통합 (크로스체인 전송 한도)

### Phase 2: Across Bridge 코어 구현

AcrossBridgeActionProvider 핵심 기능을 구현한다.

**기능:**
- Across API 클라이언트 (quote, limits, routes, status)
- AcrossBridgeActionProvider (Action Provider 패턴)
- 브릿지 견적 조회 (수수료, 예상 도착 시간, Relayer 가용성)
- 지원 라우트 조회 (출발/도착 체인 + 토큰 조합)
- 브릿지 실행 (ERC-20 approve + SpokePool depositV3)
- 네이티브 토큰 브릿지 (ETH → ETH 크로스체인, msg.value)
- 브릿지 한도 조회 (최소/최대 금액)
- 브릿지 상태 추적 (deposit → fill 완료 확인)
- DB 마이그레이션 (Phase 1 설계에서 필요 확정 시)
- Admin Settings (fillDeadline, exclusivityDeadline 등 런타임 설정)

### Phase 3: MCP / SDK / Admin UI 통합

인터페이스 레이어와 Admin UI를 구현한다.

**기능:**
- MCP 도구 (across-bridge-quote, across-bridge-execute, across-bridge-status 등)
- SDK 메서드 (@waiaas/sdk)
- skill 파일 업데이트
- Admin UI 브릿지 현황 표시 (상태 추적, 최근 브릿지 목록)
- 정책 엔진 연동 (크로스체인 전송 한도, 목적지 체인 화이트리스트)

### Phase 4: 테스트 및 검증

단위 테스트와 통합 테스트로 전체 플로우를 검증한다.

**기능:**
- Mock API 기반 Across API 클라이언트 단위 테스트
- SpokePool 컨트랙트 calldata 인코딩 검증
- ERC-20 approve + deposit BATCH 플로우 테스트
- 네이티브 토큰 브릿지 (msg.value) 테스트
- 브릿지 상태 추적 폴링 테스트
- 정책 엔진 크로스체인 한도 검증
- 에러 핸들링 (liquidity 부족, route 미지원, deadline expired)
- MCP 도구 + SDK 메서드 통합 테스트

---

## 기술적 고려사항

1. **파이프라인 호환**: SpokePool `depositV3()`는 일반 EVM 컨트랙트 호출이므로 기존 `CONTRACT_CALL` 파이프라인 그대로 사용. approve가 필요한 경우 `BATCH` type으로 묶기.
2. **상태 추적**: 브릿지 완료는 목적지 체인에서 Relayer fill이 발생해야 확인 가능. Across API 폴링 또는 deposit 이벤트 추적 필요. DB 저장 여부는 Phase 1에서 확정.
3. **수수료 투명성**: Quote 시점의 수수료와 실제 실행 시 수수료 차이 가능성 — fillDeadline 전략으로 관리.
4. **멀티체인 SpokePool 주소**: 체인별 SpokePool 컨트랙트 주소 관리 (Across API에서 동적 조회 또는 하드코딩).
5. **IncomingTxMonitor 연동**: 목적지 체인에서 Relayer fill 수신을 IncomingTxMonitor(v27.1)로 감지 가능한지 Phase 1에서 평가. fill 이벤트가 일반 ERC-20 transfer로 도착하면 기존 모니터에서 자동 감지될 수 있다.
6. **LI.FI 공존**: 별도 Action Provider로 독립 구현. 자동 라우팅은 범위 외.

---

## 테스트 항목

- Across API quote/limits/routes 호출 테스트 (mock)
- SpokePool depositV3 calldata 인코딩 검증
- ERC-20 approve + deposit BATCH 플로우 테스트
- 네이티브 토큰 브릿지 (msg.value) 테스트
- 브릿지 상태 추적 폴링 테스트
- 정책 엔진 크로스체인 한도 검증
- 에러 케이스 (insufficient liquidity, unsupported route, deadline expired)
- MCP 도구 + SDK 메서드 통합 테스트
