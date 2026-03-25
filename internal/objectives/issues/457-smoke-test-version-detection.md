# 457. E2E 스모크 테스트 버전 감지 오류 — GitHub Releases API 정렬 비결정성

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **발견일:** 2026-03-25
- **관련 파일:** `.github/workflows/e2e-smoke.yml`
- **실패 런:** https://github.com/minhoyoo-iotrust/WAIaaS/actions/runs/23533923976

## 증상

E2E 스모크 테스트가 `@waiaas/cli@2.12.0-rc.9` 설치에 실패 (ETARGET — npm에 해당 버전 없음).
실제 최신 릴리스는 `v2.12.0-rc.11`이며 npm에도 정상 publish 되어 있음.

## 근본 원인

`e2e-smoke.yml`의 "Determine version" 스텝에서 GitHub Releases API를 호출할 때:

```bash
TAG=$(gh api repos/.../releases --jq '.[0].tag_name')
```

`.[0]`이 **최신 release가 아닌 API 기본 정렬의 첫 번째**를 반환함. GitHub Releases API의 기본 정렬은 `created_at` 역순이 보장되지 않으며, prerelease가 섞이면 순서가 비결정적.

실제 반환 순서 확인:
```
v2.12.0-rc.9   ← .[0] (최신 아님)
v2.12.0-rc.11
v2.12.0-rc.10
v2.12.0-rc.8
v2.12.0-rc.7
```

추가로 `v2.12.0-rc.9`는 GitHub Release는 생성되었으나 npm publish에 실패/스킵되어 npm에 존재하지 않음 (rc.8 → rc.10 건너뜀).

## 수정 방안

GitHub Releases API 대신 checkout된 소스의 `package.json`에서 버전을 직접 읽는다:

```bash
VERSION=$(node -p "require('./package.json').version")
```

**이유:**
- 스모크 테스트는 `workflow_run` 이벤트로 트리거되며, checkout 커밋이 release-please가 bump한 main HEAD와 동일
- `package.json` 버전 = 방금 npm에 publish된 버전 = 테스트 대상 버전
- 외부 API 의존 없음, 정렬/타이밍 문제 원천 차단

npm 전파 지연 대비 존재 확인 wait loop도 추가:

```bash
# npm 전파 대기 (최대 5분)
MAX_WAIT=300; ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
  npm view "@waiaas/cli@$VERSION" version >/dev/null 2>&1 && break
  sleep 30; ELAPSED=$((ELAPSED + 30))
done
```

## 테스트 항목

- `e2e-smoke.yml` 수정 후 `workflow_dispatch`로 수동 트리거하여 올바른 버전 감지 확인
- npm에 존재하는 버전(현재 `2.12.0-rc.11`)으로 설치 + offchain 테스트 통과 검증
