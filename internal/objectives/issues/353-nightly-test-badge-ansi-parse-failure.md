# 353 — Nightly 워크플로우 테스트 배지 ANSI 파싱 실패

- **유형:** BUG
- **심각도:** MEDIUM
- **상태:** OPEN
- **발견일:** 2026-03-16

## 현상

README의 Tests 배지가 `invalid properties: label, message`로 표시됨. shields.io endpoint badge가 참조하는 Gist JSON이 `{}`로 비어있음.

## 원인

nightly.yml `Collect test counts` 스텝에서 vitest 출력의 ANSI 색상 코드를 제거하지 않아 grep 패턴 매칭 실패.

**실제 turbo 출력:**
```
[2m      Tests [22m [1m[32m19 passed[39m[22m...
```

**현재 grep 패턴:**
```bash
grep -oP 'Tests\s+\K[0-9]+(?=\s+passed)'
```

ANSI escape sequence(`\x1b[...m`)가 `Tests`와 숫자 사이에 삽입되어 `\s+` 매칭 실패. `total`이 항상 `unknown`으로 설정되어 badge 업데이트 스텝이 조건부 스킵됨.

**영향 범위:** 배지가 생성된 이후 한 번도 정상 업데이트된 적 없음 (이전 성공 run에서도 동일 실패 확인).

## 수정 방안

nightly.yml의 test count 수집 스크립트에 `sed 's/\x1b\[[0-9;]*m//g'`로 ANSI 코드 제거 후 grep 실행:

```bash
TOTAL=$(pnpm turbo run test:unit 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -oP 'Tests\s+\K[0-9]+(?=\s+passed)' | awk '{s+=$1} END {print s}')
```

## 테스트 항목

1. nightly 워크플로우 수동 실행 후 `Test count:` 로그에 실제 숫자 출력 확인
2. Gist JSON에 `schemaVersion`, `label`, `message`, `color` 필드 정상 기록 확인
3. README badges에서 `Tests N passing` 정상 렌더링 확인
