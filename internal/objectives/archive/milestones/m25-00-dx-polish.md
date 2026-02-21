# 마일스톤 m25: DX(Developer Experience) 품질 개선

- **Status:** SHIPPED
- **Milestone:** v2.5
- **Package:** 2.4.0-rc.2
- **Completed:** 2026-02-19

## 목표

`npm install -g @waiaas/cli` → `waiaas init` → `waiaas start` → `waiaas quickstart` 의 첫 5분 경험에서 발견된 마찰을 제거하고, README·SDK·Docker·MCP 각 진입 경로에서 첫 사용자가 막힘 없이 동작하는 상태. 퍼블릭 리포에서 README 코드를 복붙했을 때 즉시 동작해야 한다.

> **핵심 원칙**: "README/예시 코드를 복붙하면 바로 동작한다."

---

## 배경

v2.0.0-rc.1 기준 DX 분석 결과, 핵심 플로우는 동작하지만 첫 사용 경험에서 28건의 마찰이 발견됨:

- **Critical 3건**: README SDK 코드 오류, Python SDK PyPI 미게시, docker-compose 로컬 빌드 전용
- **High 9건**: 버전 0.0.0, 패스워드 안내 부재, 포트 충돌 에러 불명, 포그라운드 전용 등
- **Medium 11건**: 한글 출력, 비멱등 quickstart, MCP 만료 미안내 등
- **Low 5건**: CLI README 없음, --force 플래그 없음 등

---

## 산출물

### 1. README + 예시 코드 정합성

| 항목 | 내용 | 위치 |
|------|------|------|
| **README SDK 코드 수정** | `balance.amount` → `balance.balance`, `tx.signature` → `tx.id` 등 실제 응답 필드로 교정 | `README.md` |
| **skill 파일 버전 헤더** | 전체 skill 파일(7개)의 `version` 헤더가 `1.5.0~1.8.0`으로 현재 패키지 버전(`2.3.0`)과 불일치. 빌드 타임 자동 치환으로 동기화 | `skills/*.skill.md` |

### 2. CLI 첫 실행 경험 개선

| 항목 | 내용 | 위치 |
|------|------|------|
| **`--version` 실제 버전 표시** | `0.0.0` 하드코딩 → `package.json`의 `version` 필드 동적 참조 | `packages/cli/src/index.ts` |
| **`engines` 필드 추가** | `"node": ">=22.0.0"` — CLI 패키지에 Node.js 최소 버전 선언 | `packages/cli/package.json` |
| **init 시 패스워드 안내** | `waiaas init` 완료 메시지에 마스터 패스워드 설정 방법 안내 추가 (env var / 대화형 프롬프트) | `packages/cli/src/commands/init.ts` |
| **init config 템플릿 보강** | 주요 섹션을 주석 처리된 예시로 포함: `[security]`, `[rpc]`, `[notifications]`. "Full reference: docs/configuration.md" 링크 | `packages/cli/src/commands/init.ts` |
| **init 에러 핸들링** | `mkdirSync`/`writeFileSync`에 try/catch 추가. 권한 오류 시 친절한 메시지 | `packages/cli/src/commands/init.ts` |

### 3. 데몬 시작 경험 개선

| 항목 | 내용 | 위치 |
|------|------|------|
| **포트 충돌 에러 명확화** | `EADDRINUSE` 감지 → "Port 3100 is already in use" 메시지 출력 | `packages/daemon/src/lifecycle/daemon.ts` |
| **내부 Step 로그 억제** | 기본 모드에서 Step 1~6 내부 로그를 `debug` 레벨로 하향. 시작 완료 시 한 줄 요약만 출력 | `packages/daemon/src/lifecycle/daemon.ts` |
| **Admin UI URL 출력** | 시작 완료 메시지에 `Admin UI: http://127.0.0.1:3100/admin` 포함 | `packages/cli/src/commands/start.ts` |
| **mcp setup 에러 메시지 수정** | "Run waiaas init first" → "Run waiaas quickstart first" | `packages/cli/src/commands/mcp-setup.ts` |

### 4. quickstart 개선

| 항목 | 내용 | 위치 |
|------|------|------|
| **한글 출력 영문 전환** | `(claude_desktop_config.json에 추가하세요)` → 영문으로 변경 | `packages/cli/src/commands/quickstart.ts` |
| **세션 만료 시점 표시** | 토큰 발급 후 `Expires at: YYYY-MM-DD HH:mm` 출력 | `packages/cli/src/commands/quickstart.ts` |
| **멱등성 확보** | 동일 이름 지갑 존재 시 409 → 기존 지갑 재사용 + 세션만 재발급 | `packages/cli/src/commands/quickstart.ts` |
| **네트워크 응답 필드 수정** | `networksData.networks` → `networksData.availableNetworks` — API 응답 필드와 불일치 수정 (line 191) | `packages/cli/src/commands/quickstart.ts` |

### 5. Docker DX

| 항목 | 내용 | 위치 |
|------|------|------|
| **docker-compose.yml 이미지 참조** | `build:` → `image: ghcr.io/...` 기본값으로 변경. 로컬 빌드는 `docker-compose.build.yml` 오버라이드로 분리 | `docker-compose.yml`, `docker-compose.build.yml` |
| **`.env.example` 생성** | Docker 사용자용 필수/선택 환경변수 템플릿 (MASTER_PASSWORD, RPC URLs 등) | `.env.example` |

### 6. Python SDK 정합성

| 항목 | 내용 | 위치 |
|------|------|------|
| **버전 통일** | `__version__` = `pyproject.toml` version 동기화 | `python-sdk/waiaas/__init__.py`, `pyproject.toml` |
| **README 기본 포트 수정** | `3000` → `3100` | `python-sdk/README.md` |
| **`.venv/` gitignore** | `.venv/` 디렉토리를 `.gitignore`에 추가하고 git 추적에서 제거 | `python-sdk/.gitignore` |
| **응답 필드명 정합** | Python SDK는 이미 `availableNetworks` 정확히 사용 중. 실제 버그는 `quickstart.ts:191`에서 API 응답의 `availableNetworks`를 `.networks`로 잘못 읽는 문제 — 수정 대상은 quickstart | `packages/cli/src/commands/quickstart.ts` |

### 7. TypeScript SDK 개선

| 항목 | 내용 | 위치 |
|------|------|------|
| **CLI 패키지 README** | npm 레지스트리 페이지에 표시될 최소 README (설치 + quickstart 3줄) | `packages/cli/README.md` |
| **SDK 패키지 README** | npm 레지스트리 페이지에 표시될 최소 README (설치 + 코드 예시) | `packages/sdk/README.md` |

### 8. MCP 세션 안내 강화

| 항목 | 내용 | 위치 |
|------|------|------|
| **mcp setup 만료 안내** | 현재 `Expires at:` 타임스탬프는 출력됨. 추가로 기본 만료 기간(24h) 경고 + `--expires-in` 옵션 존재 안내 보강 | `packages/cli/src/commands/mcp-setup.ts` |

---

## 제외 항목 (다른 마일스톤에서 처리)

| 항목 | 이유 | 대상 마일스톤 |
|------|------|-------------|
| Admin UI 온보딩 (지갑 0개 상태 CTA) | v2.3에서 Admin UI 메뉴 재구성 완료. 온보딩 CTA는 미구현 상태로 잔류 | TBD |
| `waiaas start --background` 데몬 모드 | 프로세스 관리 아키텍처 변경 필요 (별도 설계) | TBD |
| SDK `createSession()` 메서드 추가 | SDK 인터페이스 확장 (별도 설계) | TBD |
| Python SDK PyPI 게시 | v2.4에서 npm Trusted Publishing 완료. PyPI는 미처리 상태로 잔류 | TBD |
| `--password` CLI 인자 보안 경고 | 기능 변경이 아닌 문서화로 충분 | TBD |

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | docker-compose.yml 기본 동작 | GHCR 이미지 pull | 대다수 사용자는 빌드 없이 실행 원함. 개발자용 빌드는 오버라이드 파일로 분리 |
| 2 | quickstart 멱등성 전략 | 동일 이름 존재 시 재사용 | 409 에러보다 "이미 있으면 사용" 패턴이 자연스러움. 첫 사용자 재실행 시 혼란 방지 |
| 3 | 데몬 Step 로그 처리 | debug 레벨 하향 | 운영자는 `--log-level debug`로 볼 수 있음. 기본 모드에서는 시작 요약 1줄만 출력 |
| 4 | skill 파일 버전 동기화 방식 | 빌드 타임 자동 치환 | `@waiaas/skills` 패키지의 빌드 스크립트에서 루트 `package.json`의 version을 읽어 `skills/*.skill.md`의 `version` 헤더를 치환. turbo `build` 파이프라인에 포함 |
| 5 | Python SDK PyPI 게시 시점 | m24에서 npm과 함께 | Trusted Publishing 인프라를 npm + PyPI 동시에 구축하면 효율적 |

---

## E2E 검증 시나리오

**자동화 비율: 88% — `[HUMAN]` 3건**

### 자동 검증 (21건)

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | `waiaas --version`이 0.0.0이 아닌 실제 버전 출력 | CLI 실행 → 출력이 semver 형식 assert | [L0] |
| 2 | CLI package.json에 `engines.node` 존재 | JSON 파싱 → `engines.node` 필드 존재 assert | [L0] |
| 3 | `waiaas init` 완료 메시지에 패스워드 안내 포함 | 출력에 "master password" 또는 "WAIAAS_MASTER_PASSWORD" 포함 assert | [L0] |
| 4 | init 생성 config에 주석 예시 포함 | `config.toml`에 `[security]` 또는 `[rpc]` 주석 존재 assert | [L0] |
| 5 | init 권한 오류 시 친절한 메시지 | 읽기전용 디렉토리에서 init → "Permission denied" 관련 메시지 assert | [L1] |
| 6 | 포트 충돌 에러에 "already in use" 포함 | 포트 3100 점유 후 start → 에러 메시지에 "in use" 또는 "EADDRINUSE" 포함 assert | [L1] |
| 7 | 데몬 시작 시 Admin UI URL 출력 | start → 출력에 "/admin" URL 포함 assert | [L0] |
| 8 | 내부 Step 로그 기본 모드에서 미출력 | start → 출력에 "Step 1:", "Step 4" 미포함 assert | [L1] |
| 9 | quickstart 출력에 한글 미포함 | quickstart → 출력의 모든 줄이 ASCII + 영문 assert | [L0] |
| 10 | quickstart 만료 시점 표시 | quickstart → 출력에 "Expires" 포함 assert | [L0] |
| 11 | quickstart 재실행 시 에러 없음 (멱등성) | quickstart 2회 연속 실행 → exit code 0 assert | [L1] |
| 12 | docker-compose.yml에 `image:` 키 존재 | YAML 파싱 → services.waiaas.image 필드 존재 assert | [L0] |
| 13 | `.env.example` 존재 + 필수 키 포함 | 파일 존재 + WAIAAS_MASTER_PASSWORD 키 포함 assert | [L0] |
| 14 | README SDK 코드의 필드가 실제 API 응답과 일치 | README 코드 블록 파싱 → 사용된 필드가 SDK 타입에 존재 assert | [L1] |
| 15 | Python SDK `__version__` = pyproject.toml version | 두 파일 파싱 → 값 동일 assert | [L0] |
| 16 | Python SDK README 포트 3100 | README 내 URL에 3100 포함 assert | [L0] |
| 17 | python-sdk `.venv/` 미추적 | `git ls-files python-sdk/.venv/` → 0건 assert | [L0] |
| 18 | mcp setup 에러 메시지에 "quickstart" 포함 | 지갑 0개 상태에서 mcp setup → 출력에 "quickstart" 포함 assert | [L0] |
| 19 | CLI README 존재 | `packages/cli/README.md` 파일 존재 assert | [L0] |
| 20 | SDK README 존재 | `packages/sdk/README.md` 파일 존재 assert | [L0] |
| 21 | quickstart 네트워크 필드가 API 응답과 일치 | `quickstart.ts`에서 `availableNetworks` 필드 사용 assert | [L0] |

### 수동 검증 [HUMAN]

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 22 | 신규 환경에서 5분 내 첫 트랜잭션 | 클린 머신에서 `npm i -g @waiaas/cli` → quickstart → MCP 연결 → 잔액 조회까지 5분 내 완료 | [HUMAN] |
| 23 | README 코드 복붙 동작 | README의 SDK 코드를 그대로 복사하여 실행 → 에러 없이 동작 | [HUMAN] |
| 24 | Docker 첫 실행 | `docker compose up -d` → 30초 내 healthy → Admin UI 접속 가능 | [HUMAN] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m21 (오픈소스 거버넌스) | README 재작성(issue #067)이 m21에서 완료. 본 마일스톤에서는 코드 예시만 수정 |
| m20 (릴리스) | npm 패키지 게시, Docker 이미지 배포가 완료된 상태에서 DX 검증 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | quickstart 멱등성 구현 복잡도 | 기존 지갑 재사용 시 세션·네트워크 상태 복원 로직 필요 | 단순히 이름 기준 GET → 존재하면 세션만 재발급. 상태 복원 미시도 |
| 2 | Step 로그 하향 후 디버깅 어려움 | 사용자 보고 시 정보 부족 가능 | `--log-level debug` 사용 안내를 에러 메시지에 포함 |
| 3 | docker-compose.yml 변경으로 기존 사용자 혼란 | `build:` → `image:` 전환 시 기존 사용자가 로컬 빌드 방법 모를 수 있음 | docker-compose.build.yml 존재를 README Docker 섹션에 명시 |
| 4 | quickstart 네트워크 필드 수정 | `quickstart.ts`가 `.networks`로 읽지만 API는 `.availableNetworks` 반환 | quickstart 내부 코드 수정으로 해결. Python SDK는 이미 정확하므로 변경 불필요 |

---

*최종 업데이트: 2026-02-19 — 코드베이스 전수 대조 반영: skill 파일 version 필드 현황 정정, daemon.ts 경로 수정(lifecycle/daemon.ts), 빌드 타임 치환 메커니즘 구체화, mcp setup 기존 출력 반영, 제외 항목 마일스톤 참조 현행화*
