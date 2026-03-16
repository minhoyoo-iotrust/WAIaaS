# #372 — Solana DeFi SDK 미설치로 Kamino/Drift 전체 기능 사용 불가

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** —
- **상태:** FIXED

## 설명

Kamino Lending과 Drift Perp 액션 실행 시 optional dependency SDK가 설치되지 않아 `ACTION_RESOLVE_FAILED` 에러가 발생한다. 두 프로토콜 모두 동일 패턴.

## 에러 메시지

**Kamino:**
```
ACTION_RESOLVE_FAILED: Kamino K-Lend SDK not available. Install @kamino-finance/klend-sdk and @solana/web3.js as dependencies.
```

**Drift:**
```
ACTION_RESOLVE_FAILED: Drift SDK not available. Install @drift-labs/sdk and @solana/web3.js as optional dependencies.
```

## 수정 방안

npm 배포 패키지에 optional dependency가 포함되지 않는 경우, 사용자에게 별도 설치 안내가 필요하거나, optional dependency를 정규 dependency로 승격해야 한다.

## 영향 범위

- defi-08 (Kamino Lending UAT) 실행 불가
- defi-10 (Drift Perp UAT) 실행 불가
- MCP `action_kamino_*`, `action_drift_*` 도구 전체 차단

## 테스트 항목

- [ ] Kamino supply dryRun 성공 확인
- [ ] Drift add_margin dryRun 성공 확인
- [ ] 두 SDK 설치 후 기존 단위 테스트 통과 확인
