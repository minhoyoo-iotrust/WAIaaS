# 126. release.yml prerelease 복원 스텝이 detached HEAD에서 push 실패

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v26.5
- **상태:** FIXED

## 현황

`release.yml` deploy job의 "Restore prerelease mode" 스텝(line 435-447)이 stable 릴리스 배포 후 실행될 때 `git push`가 실패한다.

### 원인

deploy job의 checkout (line 337)이 `ref:`를 지정하지 않아, release 이벤트 트리거 시 태그를 체크아웃한다. 태그 체크아웃은 **detached HEAD** 상태이므로 `git push`가 실패한다.

```
fatal: You are not currently on a branch.
```

### 영향

- npm 배포(10개 패키지)와 Docker 배포는 이 스텝 이전에 완료되어 정상 성공
- prerelease 모드 복원만 실패 → 수동으로 `restore-prerelease.yml` workflow_dispatch를 실행하거나 직접 config를 수정해야 함
- v2.4.0 stable 릴리스에서 실제 발생 확인

### 현재 코드 (release.yml:435-447)

```yaml
- name: Restore prerelease mode (stable release only)
  if: ${{ !contains(github.event.release.tag_name, '-rc.') }}
  run: |
    node scripts/promote-release.js --restore
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git add release-please-config.json
    if ! git diff --cached --quiet; then
      git commit -m "chore: restore prerelease mode"
      git push        # ← FAIL: detached HEAD
    fi
```

### deploy job checkout (release.yml:336-339)

```yaml
- name: Checkout
  uses: actions/checkout@v4
  with:
    token: ${{ secrets.RELEASE_PAT }}
    # ref: 미지정 → 릴리스 태그 체크아웃 → detached HEAD
```

## 수정 방안

restore 스텝에서 push 전에 main 브랜치로 체크아웃:

```yaml
- name: Restore prerelease mode (stable release only)
  if: ${{ !contains(github.event.release.tag_name, '-rc.') }}
  run: |
    git fetch origin main
    git checkout main
    node scripts/promote-release.js --restore
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git add release-please-config.json
    if ! git diff --cached --quiet; then
      git commit -m "chore: restore prerelease mode"
      git push
    else
      echo "Prerelease mode already active, no changes needed"
    fi
```

### 대안: restore-prerelease.yml 워크플로우 위임

restore 로직을 인라인 대신 `restore-prerelease.yml`을 트리거하는 방식도 가능하나, workflow_dispatch 크로스 트리거 시 PAT 권한 복잡성이 증가하므로 인라인 수정이 적합.

## 수정 대상

| 파일 | 변경 |
|------|------|
| `.github/workflows/release.yml` | restore 스텝에 `git fetch origin main && git checkout main` 추가 |

## 테스트 항목

### CI 워크플로우 검증 (수동)

- stable 릴리스 배포 후 deploy job의 restore 스텝이 성공하는지 검증
- restore 후 `release-please-config.json`에 prerelease 설정(versioning, prerelease, prerelease-type)이 복원되는지 검증
- restore 커밋이 main 브랜치에 올바르게 push되는지 검증
- 이미 prerelease 모드가 활성인 경우 "no changes needed" 메시지 출력 후 정상 종료 검증
