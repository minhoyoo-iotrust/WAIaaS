# 399 — Kamino/Drift SDK 런타임 미설치로 Solana DeFi 기능 사용 불가

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **마일스톤:** (미정)
- **발견일:** 2026-03-19

## 현상

DeFi 액션 실행 시 SDK 미설치 오류 발생:

| 프로바이더 | 오류 메시지 |
|-----------|------------|
| Kamino | `Kamino K-Lend SDK not available. Install @kamino-finance/klend-sdk and @solana/web3.js as dependencies.` |
| Drift | `Drift SDK not available. Install @drift-labs/sdk and @solana/web3.js as optional dependencies.` |

## 관련 이슈

- #374 (FIXED, v32.5): "KaminoSdkWrapper 실제 SDK 연결 구현"
- #375 (FIXED, v32.5): "DriftSdkWrapper 실제 SDK 연결 구현"

#374/#375 수정 시 동적 import 기반 래퍼로 전환했으나, 실제 npm 패키지가 설치되지 않아 런타임에서 여전히 실패.

## 원인

`KaminoSdkWrapper`/`DriftSdkWrapper`가 동적 import (`import()`)를 사용하지만, `@kamino-finance/klend-sdk`와 `@drift-labs/sdk` 패키지가 `node_modules`에 설치되어 있지 않음.

가능한 원인:
1. `package.json`의 `optionalDependencies`에 등록되었으나 설치 시 스킵됨
2. CI/CD에서 optional deps가 제외됨
3. 해당 패키지의 peer dependency 충돌로 설치 실패

## 영향

- Kamino Lending: supply/borrow/repay/withdraw 전 기능 사용 불가
- Drift Perp: open/close/modify position, add/withdraw margin 전 기능 사용 불가
- defi-08, defi-10 UAT 시나리오 실행 불가

## 수정 방안

1. `pnpm ls @kamino-finance/klend-sdk @drift-labs/sdk`로 설치 상태 확인
2. 미설치 시 `pnpm add -D @kamino-finance/klend-sdk @drift-labs/sdk`로 설치
3. peer dependency 충돌이 있으면 `pnpm.overrides`로 해결
4. Docker 빌드에서도 optional deps가 포함되는지 확인

## 수정 대상 파일

- `packages/actions/package.json` — optional/devDependencies 확인
- Docker/CI 설정 — optional deps 포함 확인

## 테스트 항목

1. **환경 테스트**: `pnpm ls` 확인 후 SDK 존재 여부 검증
2. **통합 테스트**: Kamino supply dryRun / Drift add_margin dryRun 성공 확인
