# #127 — Promote RC 워크플로우가 번호 없는 RC 태그를 거부

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v27.0
- **상태:** OPEN

## 현상

`Promote RC to Stable` 워크플로우를 실행하면 자동 감지된 최신 RC 태그 `v2.5.0-rc`가 검증 정규식에 의해 거부된다.

```
Auto-detected: v2.5.0-rc
Error: 'v2.5.0-rc' is not a valid RC version (expected vX.Y.Z-rc.N or X.Y.Z-rc.N)
```

## 원인

release-please는 첫 번째 프리릴리스에 번호를 붙이지 않는다 (`v2.5.0-rc`). 이후부터 `.1`, `.2`, ... 형식을 사용한다. 이는 release-please 설계 동작이며 설정으로 변경할 수 없다.

다운스트림 소비자 3곳이 이 형식을 처리하지 못한다:

1. **`promote-release.yml`**: 정규식 `^[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$`가 `rc.N` 형식만 허용
2. **`scripts/promote-release.js`**: `extractStableVersion()`이 동일한 정규식 사용
3. **`release.yml`**: restore 조건 `!contains(tag, '-rc.')` → 번호 없는 RC에서도 restore 실행 시도 (조건 통과)

## 수정 방향

### 1. `promote-release.yml` (정규식 수정)
- 검증: `^[0-9]+\.[0-9]+\.[0-9]+-rc(\.[0-9]+)?$` (`.N` 선택적)
- stable 버전 추출: `sed 's/-rc\(\.[0-9]*\)\?//'`

### 2. `scripts/promote-release.js` (정규식 수정)
- `extractStableVersion()`: `/^(\d+\.\d+\.\d+)-rc(\.\d+)?$/`

### 3. `release.yml` (restore 조건 수정)
- 현재: `!contains(github.event.release.tag_name, '-rc.')`
- 수정: `!contains(github.event.release.tag_name, '-rc')`

## 영향 범위

- `.github/workflows/promote-release.yml`
- `scripts/promote-release.js`
- `.github/workflows/release.yml`

## 테스트 항목

- promote-release.js `extractStableVersion()`이 `2.5.0-rc`와 `2.5.0-rc.1` 모두 `2.5.0`을 반환하는지 확인
- promote-release.yml 정규식이 `v2.5.0-rc`를 유효로 판정하는지 확인
- release.yml restore 조건이 RC 릴리스(`v2.5.0-rc`, `v2.5.0-rc.1`)에서 모두 false (skip) 되는지 확인
