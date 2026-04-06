# Phase 1: 기술 스택 결정 - Context

**Gathered:** 2025-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

프로젝트 전체에서 사용할 기술 스택을 확정하여 이후 모든 설계의 기반을 마련한다. 백엔드 프레임워크, 데이터베이스, Solana 개발 환경, 인프라를 결정하고 근거와 함께 문서화한다.

</domain>

<decisions>
## Implementation Decisions

### 코드 구조
- 모노레포 구조 사용
- 모든 서비스 코드가 단일 저장소에서 관리됨

### Claude's Discretion

다음 영역들은 리서치 결과를 바탕으로 최적의 선택을 진행:

**백엔드 프레임워크:**
- 언어 선택 (TypeScript/Go/Rust)
- API 설계 스타일 (REST/GraphQL/gRPC)
- 프레임워크 선택

**데이터베이스 전략:**
- 주 데이터베이스 유형 (관계형 vs NoSQL)
- 캐싱 레이어 필요 여부
- ORM vs 직접 쿼리

**Solana 개발 환경:**
- SDK 선택
- 테스트넷 전략
- RPC 프로바이더

**인프라/배포:**
- 클라우드 프로바이더
- 컨테이너 전략
- 모니터링 도구

</decisions>

<specifics>
## Specific Ideas

- AI 에이전트용 WaaS이므로 Solana SDK 지원이 핵심 고려사항
- API 우선 설계 방향이 이미 확정됨 (PROJECT.md 참조)
- 에이전트 프레임워크(MCP) 통합이 필요하므로 SDK 공유가 용이한 구조 고려

</specifics>

<deferred>
## Deferred Ideas

None — 논의가 페이즈 범위 내에서 진행됨

</deferred>

---

*Phase: 01-tech-stack*
*Context gathered: 2025-02-04*
