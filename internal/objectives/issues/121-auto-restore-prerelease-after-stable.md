# 121. stable 릴리스 배포 후 prerelease 모드 자동 복원

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** v26.4
- **상태:** FIXED

## 현황

#120에서 promote/restore 워크플로우를 구현했으나, stable 릴리스 배포 완료 후 `Restore Prerelease Mode` 워크플로우를 **수동으로 실행**해야 한다. 복원을 잊으면 이후 커밋이 RC 대신 stable 버전으로 릴리스될 수 있다.

## 개선 방안

`release.yml`의 deploy job 완료 후, stable 릴리스인 경우 자동으로 prerelease 모드를 복원한다.

```yaml
# release.yml deploy job 마지막 step
- name: Restore prerelease mode (stable release only)
  if: "!contains(github.ref, '-rc.')"
  run: |
    node scripts/promote-release.js --restore
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git add release-please-config.json
    if ! git diff --cached --quiet; then
      git commit -m "chore: restore prerelease mode"
      git push
    fi
```

- `github.ref`에 `-rc.`가 없으면 stable 릴리스로 판별
- RC 릴리스 시에는 스킵
- `restore-prerelease.yml`은 수동 폴백용으로 유지

## 수정 대상

| 파일 | 변경 |
|------|------|
| `.github/workflows/release.yml` | deploy job에 stable 판별 + 자동 복원 step 추가 |
| `.github/workflows/promote-release.yml` | Summary에서 수동 복원 안내 문구 제거 |

## 테스트 항목

- [ ] stable 릴리스 배포 완료 후 `release-please-config.json`에 prerelease 3설정 자동 복원 확인
- [ ] RC 릴리스 배포 시 복원 step이 스킵되는지 확인
- [ ] 이미 prerelease 모드인 상태에서 실행 시 빈 커밋 없이 정상 종료 확인
