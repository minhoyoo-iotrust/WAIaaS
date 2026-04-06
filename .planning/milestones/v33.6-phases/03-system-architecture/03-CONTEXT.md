# Phase 3: 시스템 아키텍처 설계 - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

전체 시스템 구조와 보안 모델을 설계하여 구현의 청사진을 완성한다.

Phase 2에서 확정된 아키텍처:
- AWS KMS + Nitro Enclaves + Squads Protocol 하이브리드 아키텍처
- Owner Key는 AWS KMS ED25519, Agent Key는 Nitro Enclaves
- 외부 WaaS 프로바이더 배제, 직접 구축

이 설계 문서는 Dual Key 아키텍처, 시스템 컴포넌트, 트랜잭션 흐름, 보안 위협 모델, 멀티체인 확장 경로를 정의한다.

</domain>

<decisions>
## Implementation Decisions

### Dual Key 저장/접근 방식
- Owner Key: AWS KMS 접근 방식은 Claude 재량 (IAM Role 또는 Assume Role 기반, 보안 모범 사례 적용)
- Agent Key: 클라우드는 Nitro Enclaves, 셀프호스트는 외부 의존성 최소화 방향으로 설계
- 키 로테이션 정책: Claude 재량 (보안 권고사항에 따라 적절한 정책 설계)
- Agent Key 생성 위치: Claude 재량 (각 환경별 적절한 방식 선택)

### 서비스 경계 및 책임
- 서비스 구조: **모놀리식** - 단순한 배포, 향후 분리 가능하도록 설계
- 키 관리 로직 격리: **인터페이스 추상화** - 추후 별도 서비스 분리 가능하도록 인터페이스로 격리
- 장애 시 동작 모드: **Fail-safe (거부)** - 장애 시 모든 트랜잭션 거부, 안전 우선
- 기능 패리티: **동일 기능** - 클라우드/셀프호스트 모두 동일한 기능 제공, 인프라만 다름

### 트랜잭션 승인 흐름
- 정책 평가 시점: **두 단계 모두** - API 진입 시와 서명 전 두 번 확인
- 에스컬레이션: **단계별 에스컬레이션** - 위반 수준에 따라 다른 에스컬레이션 경로
- 재시도 정책: **재시도 없음** - 실패 시 즉시 에러 반환, 호출자가 재시도 결정
- 상태 전달: **동기 응답 + Webhook** - 둘 다 지원, 호출자가 선택

### 보안 위협 대응 설계
- 키 탈취 대응: Claude 재량 (위협 수준별 적절한 대응 설계)
- 내부자 위협 방어: Claude 재량 (작업 민감도별 적절한 보호 수준 설계)
- 이상 탐지: Claude 재량 (복잡도와 운영 비용 고려)
- **우선순위: 보안 최우선** - 사용성보다 보안을 우선시, 불편하더라도 안전하게

### 클라우드/셀프호스트 아키텍처
- 코드베이스 관계: **별도 빌드** - 공통 코어 + 환경별 별도 빌드/배포
- 셀프호스트 배포: **Docker Compose** - docker-compose.yml로 간편하게 배포
- 셀프호스트 키 저장: Claude 재량 (보안과 운영 편의성 고려)

### Claude's Discretion
- Owner Key AWS 접근 방식 (IAM Role vs Assume Role)
- 셀프호스트 Agent Key 대체 저장소 설계 (외부 의존성 최소화)
- 키 로테이션 정책 (주기, 트리거 조건)
- Agent Key 생성 위치 (환경별)
- 키 탈취 대응 메커니즘
- 내부자 위협 방어 수준
- 이상 트랜잭션 탐지 방식
- 셀프호스트 키 저장 방식

</decisions>

<specifics>
## Specific Ideas

- 셀프호스트는 외부 의존성을 최소화하는 방향으로 설계
- 모놀리식이지만 키 관리 로직은 인터페이스로 추상화하여 향후 분리 가능하도록
- 보안 최우선 원칙: 사용성보다 보안을 우선시

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-system-architecture*
*Context gathered: 2026-02-04*
