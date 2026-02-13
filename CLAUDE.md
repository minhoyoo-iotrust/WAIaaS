# WAIaaS Project Rules

## Language

- 모든 기획/설계 문서, 커밋 메시지 본문, 이슈 리포트는 한글로 작성한다.
- 코드 주석, 변수명, API 응답은 영어를 사용한다.

## Communication

- 질문을 최소화하고 직접 판단하여 최선의 방법을 제시한다.
- 선택지가 필요한 경우에만 질문한다.

## Schema & Type System

- **Zod SSoT**: Zod 스키마가 단일 진실 원천. Zod → TypeScript 타입 → OpenAPI → Drizzle 스키마 → DB CHECK 제약 순서로 파생한다.
- **discriminatedUnion 5-type**: `type` 필드로 TRANSFER / TOKEN_TRANSFER / CONTRACT_CALL / APPROVE / BATCH 판별.
- ChainError extends Error (not WAIaaSError). Stage 5에서 WAIaaSError로 변환한다.
- Gas safety margin: `(estimatedGas * 120n) / 100n` bigint 산술.

## Database

- **v1.4부터 DB 마이그레이션 필수**: 스키마 변경 시 ALTER TABLE 증분 마이그레이션을 제공한다. DB 삭제 후 재생성 금지. `schema_version` 테이블로 버전 관리. 설계 문서 65에서 전략 정의 (MIG-01~06).
- SQLite timestamp는 초 단위, UUID v7은 ms로 순서 보장.

## Configuration

- config.toml 중첩 금지. 환경변수는 `WAIAAS_{SECTION}_{KEY}` 형식.

## Policy

- 기본 거부 정책 원칙: ALLOWED_TOKENS / CONTRACT_WHITELIST / APPROVED_SPENDERS 미설정 시 deny.
- 컨트랙트 기본 거부 (CONTRACT_WHITELIST opt-in).

## Interface Sync

- **REST API, SDK, MCP 인터페이스가 변경되면 `skills/` 파일도 반드시 함께 업데이트한다.**
  - 대상: quickstart.skill.md, wallet.skill.md, transactions.skill.md, policies.skill.md, admin.skill.md
  - 엔드포인트 추가/삭제/변경, 요청/응답 스키마 변경, 인증 방식 변경, 에러 코드 추가 시 해당 skill 파일을 동기화한다.
  - 새로운 도메인이 추가되면 해당 skill 파일을 신규 생성한다.

## Issue Tracking

- 이슈는 `objectives/issues/` 디렉토리에 `v{milestone}-{NNN}-{slug}.md` 형식으로 작성한다.
- `objectives/issues/TRACKER.md`에 등록하고 상태를 갱신한다.
- 유형: BUG (결함) / ENHANCEMENT (개선) / MISSING (누락 기능).
