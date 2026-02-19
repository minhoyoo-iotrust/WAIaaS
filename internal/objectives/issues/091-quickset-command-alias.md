# 091 — quickset 명령어 추가 — quickstart와 start 이름 혼동 해소

| 필드 | 값 |
|------|-----|
| **유형** | ENHANCEMENT |
| **심각도** | LOW |
| **마일스톤** | v2.3 |
| **상태** | OPEN |
| **발견일** | 2026-02-19 |

## 배경

`waiaas start` 후에 `waiaas quickstart`를 실행하는 구조인데, 둘 다 "start"가 포함되어 명령어 역할이 혼동됨:
- `start`: 데몬 프로세스 시작
- `quickstart`: 월렛 + 세션 + MCP 토큰 자동 설정

`quickset`은 "빠른 설정"이라는 의미를 명확히 전달하면서 `start`와 이름이 겹치지 않음.

## 수정 방안

### 1. quickset 명령어를 동일 동작으로 추가

`quickstart`를 제거하지 않고, `quickset`을 동일 핸들러를 호출하는 별칭으로 추가:

```typescript
// packages/cli/src/index.ts
program
  .command('quickset')
  .description('Quick setup: create wallets, sessions, and MCP tokens')
  .option('--mode <mode>', 'testnet or mainnet', 'testnet')
  .action(async (opts) => {
    await quickstartCommand({ dataDir, ...opts });
  });

// quickstart는 기존 유지 (하위 호환)
program
  .command('quickstart')
  .description('(alias for quickset) Quick setup: create wallets, sessions, and MCP tokens')
  .action(async (opts) => {
    await quickstartCommand({ dataDir, ...opts });
  });
```

### 2. 문서/가이드는 quickset으로 통일

- README.md: `waiaas quickset`으로 설명
- 스킬 파일: `quickset` 사용
- --help 출력: `quickset`이 주 명령어, `quickstart`는 alias 표기

```
waiaas init      → 디렉토리 초기화
waiaas start     → 데몬 시작
waiaas quickset  → 월렛 + 세션 + MCP 토큰 자동 설정
```

### 3. quickstart는 deprecated 표기 없이 유지

내부적으로 동일 함수를 호출하므로 유지 비용이 없음. deprecated 경고 없이 조용히 동작.

## 테스트 항목

| # | 테스트 | 검증 내용 |
|---|--------|-----------|
| 1 | quickset 명령어 실행 | quickstart와 동일한 결과 (월렛 생성 + 세션 + MCP 토큰) |
| 2 | quickstart 하위 호환 | 기존 quickstart 명령어가 동일하게 동작 |
| 3 | --help 출력 확인 | quickset이 주 명령어로 표시, quickstart가 alias로 표시 |
| 4 | --mode 옵션 전달 | quickset --mode mainnet이 정상 동작 |

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `packages/cli/src/index.ts` | quickset 명령어 등록 + quickstart를 alias로 변경 |
| `README.md` | quickstart → quickset으로 설명 변경 |
| `packages/skills/skills/quickstart.skill.md` | quickset 명령어 반영 |
| `docs/deployment.md` | quickset으로 설명 변경 |
