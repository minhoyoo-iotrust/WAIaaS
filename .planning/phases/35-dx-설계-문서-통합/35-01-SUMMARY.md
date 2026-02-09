---
phase: 35-dx-설계-문서-통합
plan: 01
subsystem: cli-dx
tags: [cli, owner-optional, set-owner, remove-owner, withdraw, quickstart, agent-info, kill-switch]

# Dependency graph
requires:
  - phase: 34-자금-회수-보안-분기-설계
    provides: withdraw API 스펙, Kill Switch withdraw Open Question, sweepAll 상세
  - phase: 32-owner-생명주기-설계
    provides: OwnerLifecycleService, 3-State 상태 머신, 인증 맵
  - phase: 33-정책-다운그레이드-알림-설계
    provides: APPROVAL 다운그레이드, 감사 로그 패턴
provides:
  - 54-cli-flow-redesign.md v0.8 전면 갱신 (28개 위치 변경)
  - set-owner/remove-owner/withdraw 3개 신규 CLI 명령어 상세 스펙
  - agent info Owner 미등록 안내 메시지 (DX-05)
  - --quickstart --chain만 필수 (--owner 선택)
  - Kill Switch withdraw 방안 A 결정 (killSwitchGuard 허용 목록 추가)
affects: [35-02-매트릭스, 35-03-통합-검증, 36-killswitch, 37-rest-api, 구현 Phase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLI Owner 분기 패턴: OwnerState(NONE/GRACE/LOCKED)별 CLI 출력/에러 분기"
    - "안내 메시지 패턴: Owner 미등록 시 set-owner 가이드 표시 (agent create, agent info, quickstart)"
    - "Kill Switch 허용 목록 패턴: 방안 A -- killSwitchGuard에 withdraw 경로 추가"

key-files:
  created: []
  modified:
    - ".planning/deliverables/54-cli-flow-redesign.md"

key-decisions:
  - "Kill Switch withdraw 방안 A 채택: killSwitchGuard 허용 경로 4->5개 (POST /v1/owner/agents/:agentId/withdraw 추가)"
  - "set-owner LOCKED 분기: CLI에서 SIWS/SIWE 수동 서명 플로우 시작 (nonce -> 메시지 -> 서명 -> API)"
  - "remove-owner GRACE 제약: LOCKED에서 해제 불가, 확인 프롬프트 포함"
  - "withdraw masterAuth만: 수신 주소 owner_address 고정으로 ownerAuth 불필요 (34-01 결정 준수)"
  - "quickstart --chain만 필수: --owner 선택으로 온보딩 마찰 최소화"
  - "agent info 안내 메시지: NONE 상태에서만 표시, JSON 모드에서는 ownerState 필드로 대체"

patterns-established:
  - "Owner 미등록 안내 메시지 3곳: agent create, agent info, quickstart 완료 후"
  - "OwnerState별 CLI 출력 분기: NONE(미등록), GRACE(pending), LOCKED(verified)"
  - "CLI -> REST API 매핑: 34-owner-wallet-connection 섹션 10.3 인증 맵 1:1 대응"

# Metrics
duration: 11min
completed: 2026-02-09
---

# Phase 35 Plan 01: CLI 플로우 v0.8 전면 갱신 Summary

**54-cli-flow-redesign.md를 v0.8 Owner 선택적 모델로 전면 갱신 -- --owner Required->Optional, set-owner/remove-owner/withdraw 3개 CLI 신규, agent info 안내 메시지, --quickstart --chain만 필수, Kill Switch withdraw 방안 A 채택**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-09T02:49:10Z
- **Completed:** 2026-02-09T03:00:57Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- 54-cli-flow-redesign.md v0.8 전면 갱신: 28개 위치 변경 (계획 22개 + 추가 6개)
- [v0.8] 태그 118개 부착 (기존 0개에서)
- `--owner` 옵션 전체 문서에서 Required -> Optional 전환 (agent create, quickstart)
- `NOT NULL` + `owner_address` 잔존 참조 완전 제거 (0건)
- set-owner CLI 명령어: 인증(masterAuth/ownerAuth 분기)/동작/출력(NONE-GRACE-LOCKED)/에러 상세 스펙
- remove-owner CLI 명령어: GRACE 제약, 확인 프롬프트, LOCKED 거부 에러 상세 스펙
- owner withdraw CLI 명령어: scope all/native, HTTP 200/207 출력, 감사 로그 3종
- agent info Owner 미등록 안내 메시지: NONE/GRACE/LOCKED 3가지 출력 예시
- --quickstart: --chain만 필수, --owner 선택, Owner 없음/있음 두 가지 출력
- createAgent() 데몬 핸들러 수도코드: ownerAddress?: string 선택 처리
- Kill Switch withdraw Open Question 해결: 방안 A 채택 (killSwitchGuard 허용 목록 추가)
- 마이그레이션 가이드 v0.8 갱신: nullable 전환, 테이블 재생성 패턴 참조
- 부록 A 검증 체크리스트: NOT NULL -> nullable, 34-owner-wallet-connection 연계 추가
- 부록 B 변경 이력: Kill Switch 결정 근거, 28개 변경 위치 총괄표

## Task Commits

Each task was committed atomically:

1. **Task 1: agent create --owner 선택 전환 + 기존 섹션 v0.8 갱신** - `596b6fc` (feat)
2. **Task 2: 대규모 신규 섹션 3개 추가 (set-owner, remove-owner, withdraw, quickstart)** - `a75895c` (feat)

## Files Created/Modified

- `.planning/deliverables/54-cli-flow-redesign.md` - v0.8 전면 갱신 (섹션 1~9 + 부록 A/B, 총 2034행)

## Decisions Made

1. **Kill Switch withdraw 방안 A 채택:** killSwitchGuard 허용 경로 4->5개. `POST /v1/owner/agents/:agentId/withdraw` 추가. 자금 회수는 Kill Switch 발동 시 가장 시급한 조치이며, 기존 API 인프라(masterAuth, 감사 로그, WithdrawService)를 재사용한다. 방안 B(CLI 직접 실행)는 API 우회로 일관성 저하.

2. **set-owner LOCKED 분기:** LOCKED 상태에서 Owner 변경 시 CLI가 SIWS/SIWE 수동 서명 플로우를 시작한다 (nonce 획득 -> 메시지 구성 -> 서명 입력 -> API 호출). 34-owner-wallet-connection.md 섹션 10.3 인증 맵과 1:1 대응.

3. **remove-owner GRACE 제약 명시:** LOCKED에서 Owner 해제 불가 (OWNER_REMOVAL_BLOCKED). GRACE에서만 동작하며, 보안 다운그레이드 경고 + 확인 프롬프트 포함. OWNER-06 요구사항 충족.

4. **withdraw masterAuth만:** 수신 주소 owner_address 고정이므로 ownerAuth 불필요 (34-01 결정 준수). LOCKED 상태에서만 동작 (WITHDRAW_LOCKED_ONLY). scope all/native 분기는 WithdrawService 수준.

5. **quickstart --chain만 필수:** --owner가 선택으로 전환되어, --chain이 quickstart의 유일한 필수 옵션. 온보딩 마찰 최소화.

6. **agent info 안내 메시지 (DX-05):** NONE 상태에서 `set-owner` 가이드 표시. GRACE에서는 Owner 주소 + pending 상태. LOCKED에서는 Owner 주소 + verified 상태. JSON 출력에서는 `ownerState` 필드로 대체.

## Deviations from Plan

### Auto-added items

**1. [Rule 2 - Missing Critical] createAgent() 데몬 핸들러 수도코드 (섹션 3.8)**
- **Found during:** Task 2
- **Issue:** CLI pseudocode만 있고 데몬 측 핸들러가 없어 ownerAddress 선택 처리의 전체 그림이 불완전
- **Fix:** 섹션 3.8에 handleCreateAgent() 수도코드 추가 (INSERT, OWNER_REGISTERED 감사 로그, resolveOwnerState 응답)
- **Commit:** a75895c

**2. [Rule 2 - Missing Critical] 변경 위치 22개 -> 28개 확장**
- **Found during:** Task 1-2
- **Issue:** 계획된 22개 위치 외에 6개 추가 변경이 필요 (섹션 2.1 근거, 섹션 1.3 참조, 7.5 dev+quickstart, 5.4 서브커맨드, 부록 B)
- **Fix:** 자동 확장하여 모든 v0.5 잔존 참조 제거
- **Commit:** 596b6fc, a75895c

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Requirements Mapping

| 요구사항 | 충족 | 근거 |
|---------|------|------|
| DX-01 | Yes | agent create --owner가 선택 옵션으로 명세됨 (섹션 3.2 [v0.8]) |
| DX-02 | Yes | set-owner (섹션 5.6), remove-owner (섹션 5.7) CLI 명령어 상세 명세 |
| DX-03 | Yes | remove-owner GRACE 제약 명시, LOCKED 해제 불가 (OWNER-06) |
| DX-04 | Yes | --quickstart --owner 없이 --chain만으로 동작 (섹션 6.2-6.8 [v0.8]) |
| DX-05 | Yes | agent info Owner 미등록 안내 메시지 (섹션 5.5 [v0.8]) |
| Kill Switch withdraw | Yes | 방안 A 채택, killSwitchGuard 5번째 허용 경로 추가 결정 기록 (섹션 5.8, 부록 B) |

## Next Phase Readiness

- 35-02 (Owner 상태 분기 매트릭스 SSoT) 실행 준비 완료
- CLI 명령어 3개 확정되었으므로 매트릭스에 CLI 동작 포함 가능
- Kill Switch withdraw 방안 A 채택이 결정되었으므로 36-killswitch에 반영 가능 (35-03에서)
- 34-owner-wallet-connection.md 섹션 10.7 CLI 스펙과 이 문서의 섹션 5.6-5.8이 1:1 대응 확인 필요 (35-03)

## Self-Check: PASSED
