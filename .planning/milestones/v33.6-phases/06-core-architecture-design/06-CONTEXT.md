# Phase 6: Core Architecture Design - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Self-Hosted 데몬의 기반 아키텍처를 설계한다 — 모노레포 패키지 구조, 암호화 키스토어 파일 포맷/프로토콜, SQLite 스키마, 데몬 라이프사이클, ChainAdapter 인터페이스를 구현 가능한 수준으로 정의한다. 설계 문서 산출물 (코드 아닌 스펙).

</domain>

<decisions>
## Implementation Decisions

### 키스토어 보안 정책
- 에이전트별 독립 키쌍 생성 (HD 파생 아님). 한 에이전트 유출 시 다른 에이전트 무관
- 에이전트 키 손실 시 Owner가 온체인에서 직접 자산 회수 가능 (키 복구 = 자산 복구가 아님)
- 암호화된 키파일 내보내기(export) 지원 — 개별 에이전트 키를 암호화된 파일로 백업/이전
- 마스터 패스워드: 대화형(패스워드 입력) + 비대화형(환경변수/파일) 둘 다 지원. CI/자동화 환경 고려
- Argon2id 파라미터: 높은 보안 수준 (64MiB 메모리 / 3회 반복 / 4 병렬, 1Password급 GPU 공격 내성)

### 데이터 디렉토리 구조
- 설정 파일 포맷: Claude 재량 (TypeScript 스택과의 통합성, 주석 지원 등 고려)
- 멀티 프로필 지원 여부: Claude 재량 (사용 시나리오 분석 기반)
- SQLite 마이그레이션: Claude 재량 (Drizzle ORM 특성 고려)
- 로그 저장 전략: Claude 재량 (감사 로그 vs 데몬 로그 용도별 최적화)

### 데몬 운영 모드
- 키스토어 잠금 정책: 데몬 실행 중 = 키스토어 상시 열림, 데몬 종료 시 = sodium_memzero로 키 제거. 자동 잠금 없음
  - 근거: 에이전트는 자율적으로 거래를 수행하므로 키스토어 잠금은 핵심 유스케이스와 충돌
  - 보안은 세션 토큰 만료(Phase 7), 거래 정책/한도(Phase 8), Kill Switch(Phase 8) 계층에서 담당
- 데몬 실행 모드: Claude 재량 (Tauri 사이드카 통합과 독립 실행 양쪽 고려)
- Graceful Shutdown 전략: Claude 재량 (진행 중 거래 안전성 확보)

### ChainAdapter 확장 전략
- 빌트인 + 추후 플러그인 모델: v0.2는 빌트인 어댑터만, 플러그인 인터페이스를 설계해두되 구현은 미루기
- Solana + EVM 둘 다 상세 설계 (스텁이 아닌 구현 가능 수준)
- 에이전트 = 단일 체인으로 시작하되, 멀티 체인으로 확장 가능한 구조 설계
  - v0.2: 에이전트 생성 시 하나의 체인 지정 (1 agent = 1 chain wallet)
  - 데이터 모델/인터페이스는 향후 멀티 체인 확장을 수용하도록 설계
- RPC 엔드포인트: 체인별 공용 RPC 기본값 제공 + 사용자 오버라이드 가능
- 테스트넷/메인넷: 에이전트 생성 시 네트워크 설정 (단일 체인 모델이므로 체인+네트워크 조합이 고정)

### Claude's Discretion
- 설정 파일 포맷 선택 (TOML/YAML/JSON 중)
- 멀티 프로필 지원 방식
- SQLite 마이그레이션 전략 (Drizzle 내장 vs 수동)
- 로그 저장 전략 (SQLite/파일/하이브리드)
- 데몬 기본 실행 모드 (foreground/background/둘 다)
- Graceful Shutdown 구현 전략

</decisions>

<specifics>
## Specific Ideas

- 에이전트 키는 hot wallet 성격 — 소액만 보유, Owner가 언제든 온체인에서 회수 가능
- "단일 체인으로 시작해서, 멀티 체인으로 확장 가능한 구조" — 데이터 모델에서 체인 필드를 필수로 두되, v0.2에서는 에이전트당 하나로 제한
- 1Password급 Argon2id 강도 — 데몬 시작 시 1-2초 잠금 해제 시간은 허용
- CI/자동화 환경 지원이 중요 — 환경변수로 마스터 패스워드 전달 가능해야 함

</specifics>

<deferred>
## Deferred Ideas

None — 논의가 Phase 6 범위 내에서 진행됨

</deferred>

---

*Phase: 06-core-architecture-design*
*Context gathered: 2026-02-05*
