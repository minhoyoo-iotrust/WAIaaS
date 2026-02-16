# v1.7-051: 외부 지갑 예시에 D'CENT 추가 및 우선 표기

- **유형**: ENHANCEMENT
- **심각도**: LOW
- **마일스톤**: v1.7
- **상태**: OPEN
- **발견일**: 2026-02-17

## 설명

WalletConnect 관련 코드/문서에서 외부 지갑 예시가 `MetaMask, Phantom` 으로만 되어 있다. D'CENT를 추가하고 가장 먼저 나오도록 수정한다.

## 수정 대상

### 런타임 코드 (2곳)

1. `packages/mcp/src/tools/wc-connect.ts:20` — MCP 도구 description
   - 현재: `(MetaMask, Phantom, etc)`
   - 변경: `(D'CENT, MetaMask, Phantom, etc)`

2. `packages/cli/src/commands/owner.ts:146` — CLI QR 안내 메시지
   - 현재: `Scan with MetaMask, Phantom, or any WalletConnect-compatible wallet.`
   - 변경: `Scan with D'CENT, MetaMask, Phantom, or any WalletConnect-compatible wallet.`

### 스킬 파일 (1곳)

3. `skills/wallet.skill.md:801` — WalletConnect 섹션 설명
   - 현재: `(MetaMask, Phantom, etc.)`
   - 변경: `(D'CENT, MetaMask, Phantom, etc.)`

### 기획/설계 문서 (참고, 선택적 수정)

- `.planning/research/SUMMARY.md:9`
- `.planning/research/ARCHITECTURE.md:11`
- `.planning/research/STACK.md:11, 100`
- `.planning/milestones/v1.6.1-phases/147-qr-pairing/147-02-PLAN.md:237, 267`
- `.planning/milestones/v1.6.1-phases/147-qr-pairing/147-RESEARCH.md:413`

## 영향 범위

- MCP 도구 description → Claude Desktop 등 AI 에이전트가 읽는 WalletConnect 설명에 D'CENT 반영
- CLI 안내 메시지 → 사용자가 QR 스캔 시 보는 지갑 예시
- 스킬 파일 → API 레퍼런스 문서
