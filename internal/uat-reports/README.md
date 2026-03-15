# UAT Reports

Agent UAT 실행 결과를 버전별로 보관하는 디렉토리이다.

## 파일명 규칙

```
{YYYY-MM-DD}-{category|scenario-id}-v{version}.md
```

예시:
- `2026-03-15-mainnet-v31.17.md`
- `2026-03-15-defi-v31.17.md`
- `2026-03-15-admin-v31.17.md`

동일 날짜에 같은 카테고리를 여러 번 실행하면 `-{n}` 접미사를 붙인다:
- `2026-03-15-mainnet-v31.17-2.md`

단일 시나리오 실행 시 시나리오 ID를 카테고리 대신 사용한다:
- `2026-03-15-defi-01-v31.17.md`

## 프라이버시 규칙

리포트는 Git에 커밋되므로 민감 정보를 마스킹해야 한다.

| 항목 | 마스킹 규칙 | 예시 |
|------|------------|------|
| EVM 주소 | 앞 6자 + `...` + 뒤 4자 | `0x1a2B...9c0D` |
| Solana 주소 | 앞 4자 + `...` + 뒤 4자 | `7xKX...m9Fp` |
| TX 해시 | 앞 10자 + `...` + 뒤 6자 | `0x3f8a1b2c4d...a1b2c3` |
| 세션 토큰 | **절대 포함 금지** | — |
| 마스터 토큰 | **절대 포함 금지** | — |
| Wallet ID | 그대로 노출 (내부 UUID) | `wallet-abc123` |
| API 키 | **절대 포함 금지** | — |

## 리포트 포맷

```markdown
# UAT Report: {category} — v{version}

- **Date**: {YYYY-MM-DD HH:mm}
- **Version**: v{version} (commit: {short-hash})
- **Category**: {category}
- **Network**: {networks}
- **Executor**: {실행자 이름 또는 "agent"}

## Summary

| Metric | Value |
|--------|-------|
| Total | {n} |
| Passed | {n} |
| Failed | {n} |
| Skipped | {n} |
| Total Gas Cost | ~${cost} |

## Results

| # | ID | Title | Status | Gas | Duration | Notes |
|---|-----|-------|--------|-----|----------|-------|
| 1 | {id} | {title} | PASS/FAIL/SKIP | ${cost} | {sec}s | {notes} |

## Failed Scenarios

### {scenario-id}: {title}
- **Failed Step**: Step {n} ({step title})
- **Error**: {error message}
- **Response**: {masked response snippet}
- **Troubleshooting**: {attempted resolution}

## Environment

- Daemon: localhost:{port}
- RPC: {rpc endpoints — host only, no API keys}
- OS: {platform}
- Node: {version}
```

## 디렉토리 구조

```
internal/uat-reports/
  README.md              # 이 파일
  2026-03-15-mainnet-v31.17.md
  2026-03-15-defi-v31.17.md
  ...
```
