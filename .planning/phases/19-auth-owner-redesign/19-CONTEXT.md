# Phase 19: 인증 모델 + Owner 주소 재설계 - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>
## Phase Boundary

masterAuth/ownerAuth/sessionAuth 3-tier 인증 수단의 책임을 분리하고, 31개 REST API 엔드포인트의 인증 맵을 재배치하며, Owner 주소를 시스템 전역(config.toml)에서 에이전트별 속성(agents.owner_address)으로 이동하고, WalletConnect를 선택적 편의 기능으로 전환한다. 세션 갱신 프로토콜(Phase 20)과 CLI DX 개선(Phase 21)은 별도 페이즈.

</domain>

<decisions>
## Implementation Decisions

### masterAuth 정의와 범위
- 마스터 패스워드(Argon2id) 기반 인증 유지
- 패스워드 입력은 데이몬 시작 시 1회만 -- 이후 데이몬 실행 중에는 메모리에 유지되어 masterAuth는 "데이몬이 이미 인증된 상태"로 동작
- masterAuth 적용 범위: 세션 생성, 에이전트 CRUD, 정책(policies) CRUD, 설정 변경 등 시스템 관리 영역 전반
- Kill Switch 복구: dual-auth 유지 (masterAuth + ownerAuth 둘 다 필요)
- 전달 방식: Claude 재량 (보안과 호환성 분석하여 결정)

### ownerAuth 서명 방식과 CLI 수동 승인
- 서명 메시지 포맷: SIWS(Solana) / SIWE(EVM) 표준 유지
- CLI 수동 승인 플로우: Claude 재량 (보안과 DX 균형 분석하여 결정)
- APPROVAL 타임아웃: 설정 가능으로 변경 (기존 1시간 고정에서 Owner가 범위 내에서 설정)
- CLI fallback: WalletConnect 연결 여부와 무관하게 항상 CLI 수동 승인이 대안으로 존재 -- WC는 순수 편의 기능
- ownerAuth 적용 범위: 거래 승인(APPROVAL 티어) + Kill Switch 복구 2곳으로 한정

### Owner 주소 등록과 변경 정책
- owner_address는 에이전트 생성 시 필수 -- `agent create --owner <address>` 없이는 에이전트 생성 불가
- 에이전트당 단일 Owner만 허용 (1:1 바인딩)
- 동일 Owner 주소로 여러 에이전트 소유 가능 (1:N 관계)
- Owner 주소 변경: masterAuth 단일 트랙으로 단순화 -- 서명 이력 유무와 무관하게 masterAuth만으로 변경 가능 (AUTH-04를 단일 트랙으로 결정)
- config.toml [owner] 섹션 제거, owner_wallets → wallet_connections 전환

### 인증 맵 재배치 기준
- 배치 원칙: **자금 영향 기준** -- 자금 이동/동결에 직접 영향 = ownerAuth, 그 외 = masterAuth 또는 sessionAuth
- ownerAuth 최소화: 거래 승인(APPROVAL 티어) + Kill Switch 복구 2곳만
- 조회 권한: GET /health만 인증 없이 공개, 나머지 모든 조회 엔드포인트는 sessionAuth 필요
- 정책 관리(policies CRUD): masterAuth -- 티어 임계값이 자금 영향을 결정하지만, 정책 자체는 시스템 관리자 영역
- 보안 비다운그레이드 검증: Claude 재량 (v0.2 vs v0.5 매핑표 형식 등)

### Claude's Discretion
- masterAuth의 HTTP 전달 방식 (X-Master-Password 헤더 vs Authorization: Basic 등)
- masterAuth 적용 엔드포인트의 세부 범위 결정 (요구사항과 보안 수준 기반 분석)
- CLI 수동 서명 플로우의 구체적 UX (메시지 복사-붙여넣기 vs CLI 커맨드 등)
- APPROVAL 타임아웃 설정 가능 범위 (최소/최대값)
- v0.2 vs v0.5 보안 비다운그레이드 검증 문서화 방식

</decisions>

<specifics>
## Specific Ideas

- 데이몬 시작 시 1회 패스워드 입력 → keystore 열기와 masterAuth 인증 상태를 하나의 행위로 통합 (현재 v0.2 설계의 keystore open과 정합)
- ownerAuth는 "자금이 움직이는 곳"에만 -- 이 원칙을 인증 맵 재배치의 근거로 명시
- AUTH-04 요구사항을 "단일 트랙(masterAuth만)으로 결정됨"으로 재정의 -- 2-track 구분 없이 단순화

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 19-auth-owner-redesign*
*Context gathered: 2026-02-07*
