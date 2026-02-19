# Phase 188: 사전 준비 - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Trusted Publishing 전환의 선행 조건인 패키지 메타데이터 정합성과 npm CLI 버전 요구사항을 확보한다. 9개 package.json의 repository 필드를 실제 GitHub 원격과 일치시키고, release.yml deploy 잡에서 npm CLI >= 11.5.1을 보장한다.

</domain>

<decisions>
## Implementation Decisions

### repository 필드 구조
- Object 형식 사용: `{ "type": "git", "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git", "directory": "packages/..." }`
- URL 프로토콜: `git+https://` 형식 (npm 공식 권장)
- 루트 package.json 포함: 9개(루트 + 8패키지) 모두 동일 형식으로 통일
- 루트 package.json에는 `directory` 필드 생략 (모노레포 자체이므로 불필요)
- 8개 패키지는 각각 실제 패키지 경로를 `directory`에 명시

### npm CLI 버전 전략
- 최소 버전 보장 방식: npm --version 확인 후, 11.5.1 미만이면 `npm install -g npm@latest`로 업그레이드
- 적용 범위: deploy 잡에만 추가 (publish-check는 dry-run이므로 불필요)
- 실패 처리: 업그레이드 실패 시 deploy 잡 전체 실패 — 최소 버전 미충족 상태로 발행 방지

### 메타데이터 정비 범위
- repository 필드만 수정 — bugs, homepage 등 다른 필드는 이 phase에서 다루지 않음
- 기존 형식(string/object 혼재)을 전체 object 형식으로 통일
- 기존 프로젝트 포맷팅(들여쓰기, 정렬) 유지 — npm pkg fix 사용하지 않음

### Claude's Discretion
- npm 버전 확인 스크립트의 구체적 구현 (shell script vs inline command)
- repository.directory 경로의 정확한 값 (실제 패키지 경로 조사 필요)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 188-pre-setup*
*Context gathered: 2026-02-19*
