# Issue #067: README 재작성 — 퍼블릭 리포 전환 대비

- **유형**: ENHANCEMENT
- **심각도**: HIGH
- **마일스톤**: v2.0.1
- **상태**: FIXED
- **수정일**: 2026-02-18

## 현황

현재 README.md가 274줄로 아키텍처 다이어그램, 보안 모델 전체 설명, config 레퍼런스, 모노레포 구조까지 모두 포함하여 핵심 메시지가 희석됨. 퍼블릭 리포 전환 전에 핵심 컨셉 + 빠른 시작 중심으로 재작성 필요.

## 작업 범위

### 1. README.md 재작성

새 구조:

```
1. Hero             — 프로젝트명 + 한 줄 설명 + 배지
2. The Problem      — 2~3문장 (기존 양극단 문제)
3. How It Works     — 핵심 차별점 (3-tier auth + 4-tier policy, 간결하게)
4. Quick Start      — waiaas quickstart 중심 (testnet + mainnet 두 모드 모두 설명)
5. Admin UI         — 관리자 페이지 접속 방법
6. Supported Networks — 체인별 지원 네트워크 전체 목록
7. Features         — 짧은 bullet list
8. Documentation    — docs/ 링크 테이블
9. License
```

#### Quick Start 세부 요구사항

`waiaas quickstart` 명령어를 사용하여 지갑 생성 + 세션 발급을 한 번에 처리하는 흐름으로 안내:

```bash
# 설치 + 초기화 + 데몬 시작
npm install -g @waiaas/cli
waiaas init
waiaas start

# 테스트넷 모드 (개발/테스트용)
waiaas quickstart --mode testnet

# 메인넷 모드 (실제 운영용)
waiaas quickstart --mode mainnet
```

- **testnet**: Solana Devnet + EVM Sepolia 지갑 생성, MCP 세션 자동 발급
- **mainnet**: Solana Mainnet + EVM Ethereum Mainnet 지갑 생성, MCP 세션 자동 발급
- 두 모드를 모두 명시적으로 설명하여 사용자가 목적에 맞게 선택하도록 함
- quickstart 실행 후 MCP config 스니펫 출력까지 안내

#### Admin UI 섹션

데몬 시작 후 관리자 페이지 접속 방법 안내:

- 기본 접속 URL: `http://127.0.0.1:3100/admin`
- masterAuth 인증 (마스터 패스워드) 필요
- 제공 기능 요약: 대시보드, 지갑 관리, 세션 관리, 정책 설정, 알림 설정, 시스템 설정
- config.toml에서 `admin_ui = true` (기본값) 확인 안내

#### Supported Networks 섹션

체인별 지원 네트워크 전체 목록을 테이블로 제시:

| Chain | Environment | Networks |
|-------|-------------|----------|
| Solana | mainnet | mainnet |
| Solana | testnet | devnet, testnet |
| EVM | mainnet | ethereum-mainnet, polygon-mainnet, arbitrum-mainnet, optimism-mainnet, base-mainnet |
| EVM | testnet | ethereum-sepolia, polygon-amoy, arbitrum-sepolia, optimism-sepolia, base-sepolia |

총 13개 네트워크 (Solana 3 + EVM 10).

### 2. README.ko.md 제거

영문 README만 유지. 한국어 버전 삭제.

### 3. docs/security-model.md 신규 생성

현재 README에서 빠지는 보안 모델 상세 내용을 독립 문서로 이동:

- 3-Tier 인증 모델 (masterAuth / ownerAuth / sessionAuth)
- 4-Tier 정책 (INSTANT / NOTIFY / DELAY / APPROVAL)
- 12가지 정책 타입 개요
- Kill Switch 3-state, AutoStop Engine 4-규칙
- 알림 4채널 (Telegram, Discord, ntfy, Slack)
- 감사 로그

### 4. 기존 README에서 이동되는 콘텐츠 정리

| 콘텐츠 | 이동 대상 |
|--------|----------|
| ASCII 아키텍처 다이어그램 | docs/ (architecture.md 또는 기존 문서에 통합) |
| 모노레포 구조 설명 | CONTRIBUTING.md에 이미 존재 |
| 인터페이스 상세 테이블 | docs/api-reference.md에 이미 존재 |
| config.toml 상세 예시 | docs/deployment.md에 이미 존재 |
| 보안 모델 상세 | docs/security-model.md 신규 생성 |

## 완료 기준

- [ ] README.md가 핵심 컨셉 + quickstart 중심으로 재작성됨
- [ ] Quick Start에 testnet/mainnet 두 모드가 모두 설명됨
- [ ] Admin UI 접속 방법이 포함됨
- [ ] Supported Networks 섹션에 13개 네트워크 전체 목록 포함됨
- [ ] README.ko.md 삭제됨
- [ ] docs/security-model.md에 보안 모델 상세 내용이 포함됨
- [ ] 기존 README에 있던 정보가 적절한 docs/로 이동됨
- [ ] 모든 내부 링크가 정상 동작함
