# Roadmap: WAIaaS

## Milestones

- ✅ **v0.1-v2.0** — Phases 1-173 (shipped 2026-02-05 ~ 2026-02-18) — See milestones/ archive
- ✅ **v2.2 테스트 커버리지 강화** — Phases 178-181 (shipped 2026-02-18)
- ✅ **v2.3 Admin UI 기능별 메뉴 재구성** — Phases 182-187 (shipped 2026-02-18)
- ✅ **v2.4 npm Trusted Publishing 전환** — Phases 188-190 (shipped 2026-02-19)
- ✅ **v2.4.1 Admin UI 테스트 커버리지 복원** — Phases 191-193 (shipped 2026-02-19)
- [ ] **v2.5 DX 품질 개선** — Phases 194-197 (in progress)

## Phases

<details>
<summary>✅ v0.1-v2.0 (Phases 1-173) — SHIPPED 2026-02-18</summary>

See `.planning/milestones/` for archived phase details (v0.1-ROADMAP.md through v2.0-ROADMAP.md).

</details>

<details>
<summary>✅ v2.2 테스트 커버리지 강화 (Phases 178-181) — SHIPPED 2026-02-18</summary>

- [x] Phase 178: adapter-solana 브랜치 커버리지 (2/2 plans) — completed 2026-02-18
- [x] Phase 179: admin 함수 커버리지 (2/2 plans) — completed 2026-02-18
- [x] Phase 180: CLI 라인/구문 커버리지 (1/1 plan) — completed 2026-02-18
- [x] Phase 181: 임계값 검증 및 복원 (1/1 plan) — completed 2026-02-18

See `.planning/milestones/v2.2-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.3 Admin UI 기능별 메뉴 재구성 (Phases 182-187) — SHIPPED 2026-02-18</summary>

- [x] Phase 182: UI 공용 컴포넌트 (2/2 plans) — completed 2026-02-18
- [x] Phase 183: 메뉴 재구성 + 신규 페이지 (3/3 plans) — completed 2026-02-18
- [x] Phase 184: Settings 분산 배치 (2/2 plans) — completed 2026-02-18
- [x] Phase 185: UX 강화 (2/2 plans) — completed 2026-02-18
- [x] Phase 186: 마무리 (1/1 plan) — completed 2026-02-18
- [x] Phase 187: 감사 갭 수정 (1/1 plan) — completed 2026-02-18

See `.planning/milestones/v2.3-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.4 npm Trusted Publishing 전환 (Phases 188-190) — SHIPPED 2026-02-19</summary>

- [x] Phase 188: 사전 준비 (1/1 plan) — completed 2026-02-19
- [x] Phase 189: OIDC 전환 (2/2 plans) — completed 2026-02-19
- [x] Phase 190: 검증 및 정리 (1/1 plan) — completed 2026-02-19

See `.planning/milestones/v2.4-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.4.1 Admin UI 테스트 커버리지 복원 (Phases 191-193) — SHIPPED 2026-02-19</summary>

- [x] Phase 191: Security + WalletConnect 페이지 테스트 (2/2 plans) — completed 2026-02-19
- [x] Phase 192: System 페이지 테스트 (1/1 plan) — completed 2026-02-19
- [x] Phase 193: 공용 컴포넌트 + 기존 페이지 개선 + 임계값 복원 (2/2 plans) — completed 2026-02-19

See `.planning/milestones/v2.4.1-ROADMAP.md` for full details.

</details>

### v2.5 DX 품질 개선 (In Progress)

**Milestone Goal:** README/예시 코드를 복붙하면 바로 동작하는 상태 달성. 첫 5분 경험 마찰 제거.

- [x] **Phase 194: CLI + 데몬 시작 DX** - CLI 첫 실행(버전/엔진/init)과 데몬 시작(포트/로그/URL) 경험 개선 (completed 2026-02-19)
- [x] **Phase 195: Quickstart + MCP DX** - quickstart 영문화/멱등성/필드 수정과 MCP 세션 안내 강화 (completed 2026-02-19)
- [ ] **Phase 196: README + SDK 문서 정합성** - README 코드 예시 수정, skill 파일 버전 자동 치환, 패키지 README 작성
- [ ] **Phase 197: Docker + Python SDK DX** - docker-compose 이미지 참조, .env.example, Python SDK 정합성

## Phase Details

### Phase 194: CLI + 데몬 시작 DX
**Goal**: 사용자가 CLI 설치 후 init/start까지 막힘 없이 진행할 수 있다
**Depends on**: Nothing (first phase)
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, DAEMON-01, DAEMON-02, DAEMON-03
**Success Criteria** (what must be TRUE):
  1. `waiaas --version`이 package.json의 실제 semver 버전을 표시한다 (0.0.0 아님)
  2. `waiaas init` 완료 후 마스터 패스워드 설정 방법이 안내되고, 생성된 config.toml에 주석 처리된 섹션 예시가 포함된다
  3. init 시 권한 오류가 발생하면 원인과 해결 방법을 알려주는 메시지가 출력된다
  4. 데몬 시작 시 포트 충돌이면 "Port N is already in use" 메시지가 출력되고, 정상 시작이면 내부 Step 로그 없이 Admin UI URL이 포함된 한 줄 요약만 출력된다
**Plans**: 2 plans

Plans:
- [x] 194-01-PLAN.md — CLI 첫 실행 개선 (--version, engines, init 패스워드/템플릿/에러)
- [x] 194-02-PLAN.md — 데몬 시작 경험 개선 (포트 충돌, Step 로그 억제, Admin UI URL)

### Phase 195: Quickstart + MCP DX
**Goal**: quickstart 재실행이 에러 없이 동작하고 MCP 설정 안내가 명확하다
**Depends on**: Phase 194
**Requirements**: QS-01, QS-02, QS-03, QS-04, DAEMON-04, MCP-01
**Success Criteria** (what must be TRUE):
  1. quickstart 출력이 전체 영문이며 세션 토큰 만료 시점이 표시된다
  2. quickstart를 두 번 연속 실행해도 에러 없이 기존 지갑을 재사용하고 세션만 재발급한다
  3. quickstart가 API 응답의 `availableNetworks` 필드를 정확히 읽는다
  4. mcp setup 에러 시 "Run waiaas quickstart first"로 안내하고, 성공 시 기본 만료(24h) 경고와 `--expires-in` 옵션이 안내된다
**Plans**: 2 plans

Plans:
- [ ] 195-01-PLAN.md — quickstart 영문화 + 멱등성 + availableNetworks 필드 수정
- [ ] 195-02-PLAN.md — MCP setup 에러 메시지 + 만료 안내

### Phase 196: README + SDK 문서 정합성
**Goal**: README 코드 예시를 복붙하면 에러 없이 동작하고 npm 패키지 페이지에 사용법이 표시된다
**Depends on**: Nothing (independent)
**Requirements**: README-01, README-02, SDK-01, SDK-02
**Success Criteria** (what must be TRUE):
  1. README의 SDK 코드 예시가 실제 API 응답 필드와 일치한다 (`balance.balance`, `tx.id` 등)
  2. skill 파일(7개)의 version 헤더가 빌드 타임에 패키지 버전으로 자동 치환된다
  3. CLI와 SDK npm 패키지 페이지에 설치 + quickstart 코드를 포함한 README가 표시된다
**Plans**: 2 plans

Plans:
- [ ] 196-01-PLAN.md — README SDK 코드 수정 + skill 파일 버전 자동 치환
- [ ] 196-02-PLAN.md — CLI/SDK 패키지 npm README 작성

### Phase 197: Docker + Python SDK DX
**Goal**: Docker 사용자와 Python SDK 사용자가 문서만 보고 첫 실행을 완료할 수 있다
**Depends on**: Nothing (independent)
**Requirements**: DOCK-01, DOCK-02, PY-01, PY-02, PY-03
**Success Criteria** (what must be TRUE):
  1. `docker compose up -d`로 GHCR 이미지를 바로 실행할 수 있고, `.env.example`에 필수 환경변수가 문서화되어 있다
  2. Python SDK `__version__`이 pyproject.toml version과 동일하고, README의 기본 포트가 3100이다
  3. `.venv/` 디렉토리가 git에서 추적되지 않는다
**Plans**: 2 plans

Plans:
- [ ] 197-01-PLAN.md — Docker DX (docker-compose GHCR 이미지 참조 + .env.example)
- [ ] 197-02-PLAN.md — Python SDK 정합성 (버전/포트/gitignore)

## Progress

**Execution Order:**
Phases 194-195 are sequential (CLI/daemon before quickstart). Phases 196-197 are independent and can run in parallel with 194-195.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-173 | v0.1-v2.0 | — | Complete | 2026-02-18 |
| 178-181 | v2.2 | 6/6 | Complete | 2026-02-18 |
| 182-187 | v2.3 | 11/11 | Complete | 2026-02-18 |
| 188-190 | v2.4 | 4/4 | Complete | 2026-02-19 |
| 191-193 | v2.4.1 | 5/5 | Complete | 2026-02-19 |
| 194. CLI + 데몬 시작 DX | 2/2 | Complete   | 2026-02-19 | - |
| 195. Quickstart + MCP DX | 2/2 | Complete   | 2026-02-19 | - |
| 196. README + SDK 문서 정합성 | v2.5 | 0/2 | Not started | - |
| 197. Docker + Python SDK DX | v2.5 | 0/2 | Not started | - |
