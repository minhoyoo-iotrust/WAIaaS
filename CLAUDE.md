# WAIaaS Project Rules

## Language

- 모든 기획/설계 문서, 커밋 메시지 본문, 이슈 리포트는 한글로 작성한다.
- 코드 주석, 변수명, API 응답은 영어를 사용한다.

## Communication

- 사용자를 "대장님"으로 칭하고, 항상 존댓말(합쇼체/해요체)로 응답한다.
- 질문을 최소화하고 직접 판단하여 최선의 방법을 제시한다.
- 선택지가 필요한 경우에만 질문한다.

## Schema & Type System

- **Zod SSoT**: Zod 스키마가 단일 진실 원천. Zod → TypeScript 타입 → OpenAPI → Drizzle 스키마 → DB CHECK 제약 순서로 파생한다.
- **discriminatedUnion 5-type**: `type` 필드로 TRANSFER / TOKEN_TRANSFER / CONTRACT_CALL / APPROVE / BATCH 판별.
- ChainError extends Error (not WAIaaSError). Stage 5에서 WAIaaSError로 변환한다.
- Gas safety margin: `(estimatedGas * 120n) / 100n` bigint 산술.

## Database

- **v1.4부터 DB 마이그레이션 필수**: 스키마 변경 시 ALTER TABLE 증분 마이그레이션을 제공한다. DB 삭제 후 재생성 금지. `schema_version` 테이블로 버전 관리. 설계 문서 65에서 전략 정의 (MIG-01~06).
- **새 마이그레이션 추가 시 테스트 필수**: (1) 스키마 스냅샷 픽스처 갱신 (2) 데이터 변환 테스트 작성. 체인 테스트가 과거 버전→최신 전체 경로를 자동 검증한다.
- SQLite timestamp는 초 단위, UUID v7은 ms로 순서 보장.

## Configuration

- config.toml 중첩 금지. 환경변수는 `WAIAAS_{SECTION}_{KEY}` 형식.
- **런타임 변경이 유용한 설정은 Admin Settings에 노출한다.** config.toml은 초기 기본값, Admin Settings는 런타임 오버라이드(hot-reload). 데몬 재시작 없이 변경할 수 있어야 하는 설정은 SettingsService를 통해 Admin UI에서 조정 가능하게 한다. 보안 자격증명(master_password_hash)이나 인프라 설정(port, host, rpc_url)처럼 재시작이 필요한 항목은 config.toml 전용으로 유지한다.

## Policy

- 기본 거부 정책 원칙: ALLOWED_TOKENS / CONTRACT_WHITELIST / APPROVED_SPENDERS 미설정 시 deny.
- 컨트랙트 기본 거부 (CONTRACT_WHITELIST opt-in).

## Interface Sync

- **REST API, SDK, MCP 인터페이스가 변경되면 `skills/` 파일도 반드시 함께 업데이트한다.**
  - 대상: quickstart.skill.md, wallet.skill.md, transactions.skill.md, policies.skill.md, admin.skill.md
  - 엔드포인트 추가/삭제/변경, 요청/응답 스키마 변경, 인증 방식 변경, 에러 코드 추가 시 해당 skill 파일을 동기화한다.
  - 새로운 도메인이 추가되면 해당 skill 파일을 신규 생성한다.

## Milestone Completion

- release-please가 버전 범프 + 태그 + CHANGELOG를 자동 관리한다 (2-게이트 모델).
- `tag-release.sh`는 v1.8.1에서 폐기됨. 직접 실행하지 않는다.
- **릴리스 흐름**: PR 머지(Conventional Commits) → release-please Release PR 자동 생성 → Release PR 머지(게이트 1: 릴리스 의사 결정) → release.yml 품질 게이트 → deploy job 수동 승인(게이트 2: 배포 실행).
- **커밋 규약**: `feat:` (minor), `fix:` (patch), `BREAKING CHANGE:` (major). `docs:`, `test:`, `chore:`, `ci:` 등은 CHANGELOG에 포함되지 않는다.

## Issue Tracking

- 이슈는 `objectives/issues/` 디렉토리에 `v{milestone}-{NNN}-{slug}.md` 형식으로 작성한다.
- `objectives/issues/TRACKER.md`에 등록하고 상태를 갱신한다.
- 유형: BUG (결함) / ENHANCEMENT (개선) / MISSING (누락 기능).
