# Phase 10: v0.1 잔재 정리 - Research

**Researched:** 2026-02-06
**Domain:** 설계 문서 버전 관리, 변경 매핑, SUPERSEDED 표기
**Confidence:** HIGH

## Summary

Phase 10은 v0.1(리서치/기획)과 v0.2(Self-Hosted 설계) 문서 간의 대체/계승 관계를 명확히 하고, v0.2에서 대체된 v0.1 설계에 SUPERSEDED 표기를 추가하는 것이 목표다. 이 작업은 코드 작성이 아닌 **문서 정리/마킹** 작업이며, ADR(Architecture Decision Record) 표준의 superseded 패턴을 따른다.

핵심 작업은 세 가지다:
1. **v0.1 -> v0.2 변경 매핑 문서 작성**: 40개 문서 간 대체/계승 관계를 매핑 테이블로 정리
2. **SUPERSEDED 표기 추가**: v0.2에서 대체된 v0.1 문서(C4~C7 관련)의 상단에 경고 박스 추가
3. **인터페이스/에러 코드/모델 대응표 작성**: IBlockchainAdapter -> IChainAdapter, RFC 9457 -> v0.2 에러 코드, 4단계 에스컬레이션 -> 4-tier 정책 매핑

**Primary recommendation:** ADR 표준의 `Status: Superseded by [문서명]` 포맷과 시각적 경고 박스(`> **SUPERSEDED**`)를 조합하여 v0.1 문서에 명시적 표기를 추가하라.

---

## Standard Stack

이 Phase는 라이브러리/프레임워크 작업이 아닌 문서 편집 작업이므로 "Standard Stack"은 **문서화 표준**과 **패턴**을 의미한다.

### Core

| 표준 | 참조 | 용도 | 왜 표준인가 |
|------|------|------|-------------|
| ADR Status Format | [ADR GitHub](https://adr.github.io/) | 문서 상태 표기 | IETF와 업계에서 검증된 아키텍처 결정 기록 표준 |
| MADR Template | [MADR](https://adr.github.io/madr/) | 상태 필드 포맷 | `superseded by ADR-XXXX` 포맷 제공 |
| Markdown Callout | CommonMark + GFM | 경고 박스 | GitHub/VSCode에서 시각적으로 강조 |

### Supporting

| 도구 | 용도 | 사용 시점 |
|------|------|----------|
| Git | 변경 이력 추적 | 문서 수정 커밋 |
| Grep/Glob | 참조 검색 | IBlockchainAdapter 등 v0.1 참조 찾기 |

### Alternatives Considered

| 대신 | 대안 | 트레이드오프 |
|------|------|-------------|
| 상단 경고 박스 | 파일명 prefix (DEPRECATED_) | 파일명 변경은 기존 참조 링크 깨짐. 내용 수정이 더 안전 |
| SUPERSEDED 섹션 | 문서 삭제 | 삭제하면 이력 손실. 아카이브 유지가 ADR 권장 패턴 |

---

## Architecture Patterns

### Pattern 1: ADR Superseded Status

**What:** 아키텍처 결정 문서가 새로운 결정으로 대체되었음을 표시하는 표준 패턴

**When to use:** v0.1 문서가 v0.2 문서로 대체된 경우

**Format (ADR 표준):**
```markdown
**상태:** Superseded by [27-chain-adapter-interface.md](../deliverables/27-chain-adapter-interface.md)
```

**Source:** [ADR GitHub - Superseded Format](https://adr.github.io/)

### Pattern 2: Visual Warning Callout

**What:** 마크다운 인용 블록을 활용한 시각적 경고

**When to use:** 문서 상단에 즉시 눈에 띄는 경고가 필요할 때

**Format:**
```markdown
> **SUPERSEDED**
>
> 이 문서는 v0.2 설계에서 대체되었습니다.
> 구현 시 [27-chain-adapter-interface.md](../deliverables/27-chain-adapter-interface.md)를 참조하세요.
>
> **변경 내용:** IBlockchainAdapter -> IChainAdapter, Squads 메서드 제거
```

### Pattern 3: Deprecation Mapping Table

**What:** v0.1 -> v0.2 대체 관계를 한 눈에 볼 수 있는 매핑 테이블

**When to use:** 변경 매핑 문서(MAPPING.md) 작성 시

**Format:**
```markdown
| v0.1 문서 | 상태 | v0.2 대체 문서 | 변경 요약 |
|-----------|------|---------------|-----------|
| 03-database-caching-strategy.md | SUPERSEDED | 25-sqlite-schema.md | PostgreSQL+Redis -> SQLite+LRU |
| 10-transaction-flow.md | PARTIALLY VALID | 32-transaction-pipeline-api.md | 8단계 -> 6단계, Enclave/Squads 제거 |
```

### Anti-Patterns to Avoid

- **파일 삭제:** 삭제하면 이력과 리서치 가치가 손실됨. "hope is not a strategy" - deprecated 표기만으로는 새 사용을 막지 못하지만, 삭제는 참조 가능성까지 없앰
- **무분별한 경고:** 모든 문서에 경고를 넣으면 경고 피로(warning fatigue) 유발. 실제로 대체된 문서만 마킹
- **링크 없는 SUPERSEDED:** "Superseded"만 표기하고 대체 문서를 명시하지 않으면 actionability 부족

---

## Don't Hand-Roll

| 문제 | 직접 만들지 말 것 | 대신 사용 | 이유 |
|------|-------------------|-----------|------|
| 상태 표기 포맷 | 자체 포맷 발명 | ADR 표준 Status 필드 | 업계 표준, 도구 호환성 |
| 참조 링크 | 절대 경로 하드코딩 | 상대 경로 (`../deliverables/`) | 저장소 이동 시에도 유효 |
| 매핑 테이블 | 산문형 설명 | Markdown 테이블 | 기계 파싱 가능, 한눈에 파악 |

**Key insight:** 이 Phase는 "새 문서 작성"보다 "기존 문서 마킹 + 매핑 문서 작성"이 핵심이다. 마킹 포맷은 ADR 표준을 따르면 일관성과 가독성이 보장된다.

---

## Common Pitfalls

### Pitfall 1: 과도한 마킹 (Over-Marking)

**What goes wrong:** v0.1 문서 전체를 SUPERSEDED로 마킹하면 여전히 유효한 리서치/분석 내용까지 무효화됨
**Why it happens:** "v0.1은 모두 구식"이라는 오해
**How to avoid:** 대체 여부를 문서별로 판단. 리서치 문서(CUST-01~04 등)는 여전히 참조 가치 있음
**Warning signs:** 마킹할 문서 수가 v0.1 전체(23개)에 가까우면 재검토 필요

### Pitfall 2: 불완전한 참조 업데이트 (Incomplete Reference Update)

**What goes wrong:** SUPERSEDED 표기만 하고, 해당 문서를 참조하는 다른 문서는 업데이트 안 함
**Why it happens:** 참조 검색 누락
**How to avoid:** `grep -r "IBlockchainAdapter"` 등으로 전체 참조 검색 후 모두 업데이트
**Warning signs:** v0.2 문서에서 v0.1 인터페이스명 발견

### Pitfall 3: 링크 깨짐 (Broken Links)

**What goes wrong:** 상대 경로 오류로 대체 문서 링크가 깨짐
**Why it happens:** 디렉토리 구조 착각, `/` vs `../` 혼동
**How to avoid:** 마킹 후 링크 클릭 테스트, 또는 markdown-link-check 도구 사용
**Warning signs:** 404 또는 "파일을 찾을 수 없음" 오류

### Pitfall 4: 대응표 누락 (Missing Mapping Table)

**What goes wrong:** SUPERSEDED 표기는 했으나, 구체적으로 무엇이 무엇으로 변경되었는지 대응표가 없음
**Why it happens:** "표기만 하면 된다"는 오해
**How to avoid:** 요구사항 H1, H10, H11, H13이 명시한 대응표를 반드시 작성
**Warning signs:** 구현자가 "어떤 v0.2 문서를 봐야 하는지 모르겠다"는 질문

---

## Code Examples (Document Edit Patterns)

### SUPERSEDED 표기 추가 패턴

v0.1 문서 상단(프론트매터 바로 아래)에 추가:

```markdown
# 데이터베이스 및 캐싱 전략 (TECH-03)

**작성일:** 2026-02-04
**버전:** 1.0
**상태:** SUPERSEDED by [25-sqlite-schema.md](./25-sqlite-schema.md)

---

> **SUPERSEDED**
>
> 이 문서의 데이터베이스 설계(PostgreSQL + Redis)는 v0.2에서 **SQLite + LRU 캐시**로 대체되었습니다.
>
> **구현 시 참조:** [25-sqlite-schema.md](./25-sqlite-schema.md) (CORE-02)
>
> **변경 이유:** Self-Hosted 단일 프로세스 환경에서 외부 DB 의존성 제거

---

## 1. 개요
(기존 내용 유지)
```

### 인터페이스명 대응표 패턴

```markdown
## IBlockchainAdapter -> IChainAdapter 변경 대응표

| v0.1 (12-multichain-extension.md) | v0.2 (27-chain-adapter-interface.md) | 변경 유형 |
|-----------------------------------|--------------------------------------|-----------|
| `IBlockchainAdapter` | `IChainAdapter` | 이름 변경 |
| `getChainId(): string` | `readonly chain: ChainType` | 타입 강화 |
| `getNetwork(): string` | `readonly network: NetworkType` | 타입 강화 |
| `createSmartWallet()` | **제거** | Squads 의존 제거 |
| `addMember()` | **제거** | 로컬 키스토어로 대체 |
| `removeMember()` | **제거** | 로컬 키스토어로 대체 |
| `updateWalletConfig()` | **제거** | 로컬 정책 엔진으로 대체 |
| - | `signTransaction()` | **신규** 로컬 서명 |
| - | `connect()`, `disconnect()` | **신규** 연결 관리 |
| - | `waitForConfirmation()` | **신규** 확인 대기 |
| - | `estimateFee()` | **신규** 수수료 추정 |
| `healthCheck(): boolean` | `getHealth(): {healthy, latency}` | 응답 확장 |
```

### 에러 코드 대응표 패턴

```markdown
## RFC 9457 에러 코드 -> v0.2 7-domain 에러 코드 매핑

### 삭제된 코드 (v0.1 only)

| v0.1 코드 | v0.1 HTTP | 이유 |
|-----------|-----------|------|
| `SQUADS_THRESHOLD_NOT_MET` | 403 | Squads 미사용 |
| `MULTISIG_TIMEOUT` | 408 | 온체인 멀티시그 미사용 |
| (RFC 9457 46개 중 10개 제거) | - | Self-Hosted 모델에서 불필요 |

### 변환된 코드

| v0.1 코드 (RFC 9457) | v0.2 코드 (7-domain) | 매핑 근거 |
|---------------------|---------------------|-----------|
| `POLICY_DAILY_LIMIT_EXCEEDED` | `POLICY_001` | 도메인 코드 체계로 전환 |
| `AUTH_TOKEN_EXPIRED` | `AUTH_002` | 영구 API Key -> JWT 세션 만료 |
```

### 에스컬레이션 모델 대응표 패턴

```markdown
## 4단계 에스컬레이션 -> 4-tier 정책 대응표

| v0.1 에스컬레이션 (19-permission-policy-model.md) | v0.2 4-tier (33-time-lock-approval-mechanism.md) | 동작 |
|--------------------------------------------------|--------------------------------------------------|------|
| Level 1: 경고 (Warning) | NOTIFY (<1 SOL) | 즉시 실행 + 알림 발송 |
| Level 2: 제한 (Throttle) | - | **v0.2에서 미사용** (세션 제약으로 대체) |
| Level 3: 승인 필요 (Require Approval) | APPROVAL (>=10 SOL) | 1시간 타임아웃, Owner 서명 필요 |
| Level 4: 동결 (Freeze) | Kill Switch | 캐스케이드 정지, 복구에 dual-auth 필요 |
| - | INSTANT (<0.1 SOL) | **v0.2 신규**: 즉시 실행, 알림 없음 |
| - | DELAY (<10 SOL) | **v0.2 신규**: 15분 쿨다운 큐잉 |
```

---

## State of the Art

| v0.1 접근 방식 | v0.2 접근 방식 | 변경 시점 | 영향 |
|---------------|---------------|----------|------|
| PostgreSQL + Redis (클라우드 스케일) | SQLite + LRU (Self-Hosted) | Phase 6 | 외부 의존성 제거, 단일 파일 DB |
| Fastify + JWT Bearer | Hono + Session Token | Phase 6 | 경량 프레임워크, 세션 기반 인증 |
| 영구 API Key + RBAC/ABAC | 단기 JWT + SIWS/SIWE | Phase 7 | 토큰 탈취 위험 감소 |
| AWS KMS + Nitro Enclaves | 로컬 Keystore + sodium-native | Phase 6 | 클라우드 의존성 제거 |
| IBlockchainAdapter + Squads | IChainAdapter + 로컬 정책 | Phase 6 | 온체인 멀티시그 -> 오프체인 정책 |
| RFC 9457 46개 에러 코드 | 7-domain 36개 에러 코드 | Phase 9 | 단순화, 도메인 기반 분류 |
| 4단계 에스컬레이션 | 4-tier 정책 (금액 기반) | Phase 8 | 금액 임계값 기반 자동 분류 |

**Deprecated/outdated:**
- **IBlockchainAdapter**: `IChainAdapter`로 완전 대체
- **Squads Protocol 메서드**: Self-Hosted 모델에서 불필요, 로컬 정책 엔진으로 대체
- **RFC 9457 Problem Details 46개 코드**: v0.2 7-domain 36개 코드로 단순화

---

## v0.1 -> v0.2 문서 대체 관계 분석

### SUPERSEDED 대상 (C4~C7, H1, H10, H11, H13)

| v0.1 문서 | 문서 ID | v0.2 대체 문서 | 관련 이슈 |
|-----------|---------|---------------|-----------|
| 03-database-caching-strategy.md | TECH-03 | 25-sqlite-schema.md (CORE-02) | C4 |
| 01-tech-stack-decision.md (일부) | TECH-01 | 24-monorepo-data-directory.md (CORE-01) | C5 |
| 09-system-components.md (일부) | ARCH-02 | 29-api-framework-design.md (CORE-06) | C5 |
| 10-transaction-flow.md (일부) | ARCH-03 | 32-transaction-pipeline-api.md (TX-PIPE) | C5, H13 |
| 18-authentication-model.md | API-02 | 30-session-token-protocol.md (SESS-PROTO) | C6 |
| 19-permission-policy-model.md | API-03 | 33-time-lock-approval-mechanism.md (LOCK-MECH) | C6, H13 |
| 15-agent-lifecycle-management.md (일부) | REL-03 | 26-keystore-spec.md (CORE-03) | C7 |
| 12-multichain-extension.md (일부) | ARCH-05 | 27-chain-adapter-interface.md (CORE-04) | H1, H10 |
| 20-error-codes.md | API-04 | 29-api-framework-design.md (CORE-06) + 37-rest-api-complete-spec.md | H11 |

### PARTIALLY VALID (일부 유효)

| v0.1 문서 | 유효 부분 | 대체된 부분 |
|-----------|----------|------------|
| 08-dual-key-architecture.md | Dual Key 개념, Owner/Agent 역할 | Squads 2-of-2 멀티시그 -> 로컬 정책 |
| 11-security-threat-model.md | 위협 분류, 방어 원칙 | Enclave/KMS 기반 대응 -> 로컬 보안 |
| 13-fund-deposit-process.md | 자금 충전 개념 | Squads Vault -> 에이전트 지갑 직접 전송 |
| 14-fund-withdrawal-process.md | 회수 개념 | Owner Key 서명 -> SIWS/SIWE 서명 |

### VALID (여전히 유효)

| v0.1 문서 | 이유 |
|-----------|------|
| 02-solana-environment.md | Solana 개발 환경은 v0.2에서도 동일 |
| 04-custody-model-comparison.md | 리서치 가치 유지, 선택 근거 기록 |
| 05-provider-comparison.md | 외부 프로바이더 비교 참고 자료 |
| 06-ai-agent-custody-considerations.md | AI 에이전트 특화 고려사항 기록 |
| 07-recommended-custody-model.md | Self-Custody 선택 근거 |

---

## Open Questions

1. **PARTIALLY VALID 문서의 표기 방법**
   - What we know: SUPERSEDED는 "완전 대체"를 의미
   - What's unclear: 일부만 대체된 문서(08, 11, 13, 14)의 표기 방법
   - Recommendation: `Status: Partially superseded` + 변경 섹션 명시 (예: "2.3절 Squads 관련 내용은 대체됨")

2. **매핑 문서 위치**
   - What we know: 변경 매핑 문서 필요
   - What's unclear: deliverables vs planning 디렉토리 중 어디에 둘 것인지
   - Recommendation: `.planning/deliverables/41-v01-v02-mapping.md`로 배치 (순번 유지)

3. **v0.1 문서 링크 업데이트 범위**
   - What we know: v0.2 문서에서 v0.1 인터페이스명 참조 있음 (CORE-04에서 IBlockchainAdapter 언급)
   - What's unclear: 기존 참조를 모두 업데이트해야 하는지, 매핑 문서로 충분한지
   - Recommendation: v0.2 문서 내 v0.1 참조는 이미 "v0.1 vs v0.2" 비교 맥락이므로 유지. 신규 구현 문서에서만 v0.2 용어 사용 강제

---

## Sources

### Primary (HIGH confidence)

- [ADR GitHub - Architecture Decision Records](https://adr.github.io/) - Superseded status format, ADR lifecycle
- [MADR Template](https://adr.github.io/madr/) - Status field format: `superseded by ADR-XXXX`
- [Google Engineering - Deprecation](https://abseil.io/resources/swe-book/html/ch15.html) - Deprecation best practices, actionability/relevance principles
- [AWS ADR Process](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html) - Superseded state handling
- WAIaaS v0.1 deliverables (01-23) - 문서 내용 직접 분석
- WAIaaS v0.2 deliverables (24-40) - 문서 내용 직접 분석
- objectives/v0.3-design-consistency.md - CRITICAL/HIGH 이슈 목록

### Secondary (MEDIUM confidence)

- [Microsoft Azure - Architecture Decision Record](https://learn.microsoft.com/en-us/azure/well-architected/architect-role/architecture-decision-record) - Superseded state management
- [Cognitect - Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) - Original ADR concept by Michael Nygard

### Tertiary (LOW confidence)

- [Treblle - API Deprecation Best Practices](https://treblle.com/blog/best-practices-deprecating-api) - API deprecation patterns (not directly applicable to design docs)

---

## Metadata

**Confidence breakdown:**
- 문서 대체 관계 분석: HIGH - v0.1/v0.2 문서 직접 비교 분석 완료
- SUPERSEDED 표기 포맷: HIGH - ADR 표준 확인 완료
- 대응표 구조: HIGH - 요구사항에서 명시된 항목(H1, H10, H11, H13) 모두 매핑 가능

**Research date:** 2026-02-06
**Valid until:** 60 days (문서 표준은 안정적, 내용은 v0.3 이후 변경 없음)

---

## 요구사항 -> 작업 매핑

| 요구사항 | 내용 | 리서치 결과 반영 |
|---------|------|-----------------|
| LEGACY-01 | v0.1 -> v0.2 변경 매핑 문서 | State of the Art + 문서 대체 관계 분석 섹션 |
| LEGACY-02 | C4 데이터베이스 SUPERSEDED | TECH-03 -> CORE-02 매핑 |
| LEGACY-03 | C5 API 프레임워크 SUPERSEDED | TECH-01/ARCH-02 -> CORE-06 매핑 |
| LEGACY-04 | C6 인증 모델 SUPERSEDED | API-02/API-03 -> SESS-PROTO/LOCK-MECH 매핑 |
| LEGACY-05 | C7 키 관리 SUPERSEDED | REL-03 -> CORE-03 매핑 |
| LEGACY-06 | H1 인터페이스명 업데이트 | Code Examples: 인터페이스명 대응표 |
| LEGACY-07 | H10 Squads 메서드 정리 | Code Examples: IBlockchainAdapter -> IChainAdapter 대응표 |
| LEGACY-08 | H11 에러 코드 매핑 | Code Examples: 에러 코드 대응표 |
| LEGACY-09 | H13 에스컬레이션 모델 매핑 | Code Examples: 에스컬레이션 대응표 |
