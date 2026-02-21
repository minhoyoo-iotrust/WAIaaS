# 120. 정식 릴리스 승격을 GitHub Actions workflow_dispatch로 자동화

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v26.4
- **상태:** FIXED

## 현황

RC → stable 승격 시 로컬에서 `release-please-config.json`을 수동 편집해야 한다. 기존 `scripts/promote-release.sh`도 다음 문제가 있다:

| 문제 | 설명 |
|------|------|
| 단일 패키지 전제 | `cfg.packages['.']`만 처리. 모노레포 멀티 패키지 미지원 |
| 설정 1개만 토글 | `prerelease`만 제거. `versioning`, `prerelease-type` 미처리 |
| `release-as` 미지원 | stable 버전 번호 자동 산출 + 설정 없음 |
| 로컬 실행 필수 | 해당 코드로 체크아웃 후 실행해야 함 |

## 개선 방안

### 1. `promote-release.yml` workflow_dispatch 워크플로우

GitHub Actions UI에서 **버튼 클릭만으로** 최신 RC를 정식 출시. 특정 RC를 지정하고 싶을 때만 버전 입력.

```yaml
name: Promote RC to Stable
on:
  workflow_dispatch:
    inputs:
      rc_version:
        description: 'RC version to promote (비워두면 최신 RC 자동 선택)'
        required: false
```

워크플로우 동작:
1. RC 버전 결정
   - 입력된 경우: 해당 RC 태그 존재 여부 검증
   - 미입력 시: `gh release list`에서 최신 RC 자동 감지
2. stable 버전 자동 산출 (`2.4.0-rc.8` → `2.4.0`)
3. `release-please-config.json`의 **모든 패키지**에서 prerelease 3설정 제거 (`versioning`, `prerelease`, `prerelease-type`)
4. 모든 패키지에 `release-as: "2.4.0"` 추가
5. 변경 커밋 + push
6. release-please가 stable Release PR 자동 생성

```bash
# RC 버전 자동 감지 로직
RC_VERSION="${{ inputs.rc_version }}"
if [ -z "$RC_VERSION" ]; then
  RC_VERSION=$(gh release list --exclude-drafts --json tagName,isPrerelease \
    -q '[.[] | select(.isPrerelease)] | .[0].tagName')
fi
# stable 버전 산출: 2.4.0-rc.8 → 2.4.0
STABLE_VERSION=$(echo "$RC_VERSION" | sed 's/-rc\.[0-9]*//')
```

### 2. `restore-prerelease.yml` workflow_dispatch 워크플로우

stable 출시 완료 후 prerelease 모드 복원도 동일하게 버튼 한 번으로 처리.

```yaml
name: Restore Prerelease Mode
on:
  workflow_dispatch: {}
```

워크플로우 동작:
1. 모든 패키지에서 `release-as` 제거
2. prerelease 3설정 복원 (`versioning: "prerelease"`, `prerelease: true`, `prerelease-type: "rc"`)
3. 변경 커밋 + push

### 3. 공유 스크립트

`scripts/promote-release.sh` → `scripts/promote-release.js`로 전환하여 워크플로우와 로컬 모두에서 사용 가능하게 한다.

- 모노레포 전 패키지 순회
- 3설정 제거/복원 + `release-as` 추가/제거
- RC 버전에서 stable 버전 자동 산출 (`X.Y.Z-rc.N` → `X.Y.Z`)
- `--restore` 플래그로 prerelease 모드 복원
- `--dry-run` 플래그로 변경 미적용 확인

```bash
# 로컬에서도 사용 가능
node scripts/promote-release.js 2.4.0-rc.8          # promote
node scripts/promote-release.js --restore            # restore
node scripts/promote-release.js 2.4.0-rc.8 --dry-run # 미리보기
```

### 4. 마일스톤 완료 시 수동 태그 제거

release-please가 Release PR 머지 시 자동으로 태그를 생성하므로, 마일스톤 완료 시 수동 `git tag` 단계를 제거한다. CLAUDE.md "Milestone Completion" 섹션에서 태그 관련 내용 삭제.

## 전체 릴리스 플로우 (개선 후)

```
1. [GitHub Actions UI] Promote RC to Stable → Run workflow (버튼 클릭)
   → 최신 RC 자동 감지 또는 특정 RC 입력
2. [자동] release-please-config.json 수정 + 커밋 + push
3. [자동] release-please가 stable Release PR 생성
4. [사람] Release PR 리뷰 + 머지 (Gate 1)
5. [자동] release.yml quality gate 실행
6. [사람] deploy job 승인 (Gate 2)
7. [자동] npm publish + Docker push
8. [GitHub Actions UI] Restore Prerelease Mode → Run workflow (버튼 클릭)
   → prerelease 모드 복원
```

## 수정 대상

| 파일 | 변경 |
|------|------|
| `.github/workflows/promote-release.yml` | 신규 — workflow_dispatch 승격 워크플로우 |
| `.github/workflows/restore-prerelease.yml` | 신규 — workflow_dispatch 복원 워크플로우 |
| `scripts/promote-release.js` | 신규 — 모노레포 대응 promote/restore 스크립트 |
| `scripts/promote-release.sh` | 삭제 — JS 스크립트로 대체 |
| `CLAUDE.md` | 마일스톤 완료 시 수동 태그 생성 규칙 제거 |

## 테스트 항목

- [ ] RC 버전 미입력 시 최신 RC 자동 감지 확인
- [ ] `2.4.0-rc.8` 입력 시 stable 버전 `2.4.0` 자동 산출 확인
- [ ] 존재하지 않는 RC 태그 입력 시 워크플로우 실패 확인
- [ ] `release-please-config.json`의 모든 패키지에서 prerelease 3설정 제거 확인
- [ ] 모든 패키지에 `release-as: "2.4.0"` 추가 확인
- [ ] 커밋 + push 후 release-please가 stable Release PR 생성 확인
- [ ] restore 워크플로우 실행 시 `release-as` 제거 + prerelease 3설정 복원 확인
- [ ] 로컬에서 `node scripts/promote-release.js 2.4.0-rc.8` 실행 시 동일 동작 확인
- [ ] `--restore`, `--dry-run` 플래그 동작 확인
