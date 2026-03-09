# #283 README 테스트 배지 자동 업데이트 — 하드코딩 제거

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** v31.7
- **상태:** RESOLVED

## 증상

README의 테스트 배지가 하드코딩(3,599)으로 v1.8 시점에서 멈춰 있다. 실제 테스트 수는 8,018개(2026-03-09 기준)이나 배지에 반영되지 않음.

```markdown
[![Tests](https://img.shields.io/badge/Tests-3%2C599_passing-brightgreen.svg)](#)
```

## 구현 방안

### 방법: `schneegans/dynamic-badges-action` + GitHub Gist

**사전 준비:**
1. GitHub Gist 생성 (비공개, `waiaas-test-badge.json` 파일 포함)
2. Gist 쓰기 권한 PAT 생성 → Repository Secret `GIST_SECRET` 등록
3. Gist ID 확인

**CI 수정 (`ci.yml` stage1 job 끝):**

```yaml
      # main push 시에만 배지 업데이트 (PR은 제외)
      - name: Collect test counts
        if: github.event_name == 'push'
        id: test-count
        run: |
          # turbo 출력에서 각 패키지 테스트 수 합산
          TOTAL=$(pnpm turbo run test:unit 2>&1 | grep -oP 'Tests\s+\K[0-9]+(?= passed)' | awk '{s+=$1} END {print s}')
          echo "total=$TOTAL" >> "$GITHUB_OUTPUT"

      - name: Update test badge
        if: github.event_name == 'push'
        uses: schneegans/dynamic-badges-action@v1.7.0
        with:
          auth: ${{ secrets.GIST_SECRET }}
          gistID: <GIST_ID>
          filename: waiaas-test-badge.json
          label: Tests
          message: "${{ steps.test-count.outputs.total }} passing"
          color: brightgreen
```

**README 배지 교체:**

```markdown
[![Tests](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/<USER>/<GIST_ID>/raw/waiaas-test-badge.json)](#)
```

### 대안: `test:unit` 이미 stage1에서 실행 중

stage1에서 `--affected`로 실행하므로 전체 수가 아닐 수 있음. 정확한 수치를 위해:
- **옵션 A:** main push 시에만 전체 테스트를 별도 실행하여 수집 (시간 추가)
- **옵션 B:** stage1의 affected 결과 그대로 사용 (부정확할 수 있으나 실용적)
- **옵션 C:** nightly.yml에 배지 업데이트 추가 (일 1회, 정확)

### 권장: 옵션 C (nightly.yml에 추가)

nightly job에서 전체 테스트를 실행하므로 정확한 수치를 얻을 수 있고, main CI에 부하를 추가하지 않음.

## 테스트 항목

- [x] Gist에 배지 JSON이 정상 업데이트되는지 확인
- [x] shields.io endpoint URL이 올바른 숫자를 표시하는지 확인
- [x] PR에서는 배지 업데이트가 실행되지 않는지 확인
- [x] 테스트 실패 시 배지가 업데이트되지 않는지 확인 (이전 값 유지)
