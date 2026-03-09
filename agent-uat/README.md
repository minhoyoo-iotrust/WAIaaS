# Agent UAT (User Acceptance Testing)

AI 에이전트가 마크다운 시나리오를 읽고 인터랙티브하게 실행하여 WAIaaS 기능을 메인넷/테스트넷에서 검증하는 시스템이다.

## 목적

- AI 에이전트가 시나리오 마크다운 파일을 파싱하여 API 호출을 순서대로 실행
- 사용자와 인터랙티브하게 진행 (각 단계마다 확인/승인)
- 실제 온체인 트랜잭션으로 기능을 검증 (dry-run 선행)
- 실행 결과를 요약 리포트로 출력

## 디렉토리 구조

```
agent-uat/
  README.md           # 이 파일 (시스템 개요 및 포맷 규격)
  _template.md        # 시나리오 작성 표준 템플릿
  _index.md           # 전체 시나리오 인덱스 (카테고리별/네트워크별)
  testnet/            # Testnet 기능 검증 시나리오
    wallet-crud.md    # 지갑 CRUD 검증
    ...
  mainnet/            # Mainnet 전송 검증 시나리오
  defi/               # DeFi 프로토콜 검증 시나리오
  admin/              # Admin UI 검증 시나리오
  advanced/           # 고급 기능 검증 시나리오 (Smart Account, WalletConnect 등)
```

## Format Specification

모든 시나리오 마크다운 파일은 아래 6개 필수 섹션을 `## ` 레벨 헤딩으로 포함해야 한다. 에이전트는 `^## ` 정규식으로 섹션을 파싱한다.

### 필수 섹션 (6개)

| # | 섹션 | 헤딩 | 역할 |
|---|------|------|------|
| 1 | **Metadata** | `## Metadata` | 시나리오 식별 정보 (ID, 카테고리, 네트워크, 비용, 위험도) |
| 2 | **Prerequisites** | `## Prerequisites` | 실행 전 충족 조건 (데몬 실행, 토큰 보유, 잔액 등) |
| 3 | **Scenario Steps** | `## Scenario Steps` | 순서대로 실행할 단계 (API 호출, 기대 결과, 확인 항목) |
| 4 | **Verification** | `## Verification` | 시나리오 완료 후 확인할 체크리스트 |
| 5 | **Estimated Cost** | `## Estimated Cost` | 예상 가스비 테이블 (네트워크, gas, USD) |
| 6 | **Troubleshooting** | `## Troubleshooting` | 오류 증상별 원인과 해결 방법 테이블 |

### 선택 섹션

| 섹션 | 헤딩 | 역할 |
|------|------|------|
| **Cleanup** | `## Cleanup` | CRUD 시나리오에서 생성한 리소스 삭제 절차 |

### Frontmatter (YAML)

파일 최상단에 `---` 구분자로 감싼 YAML frontmatter를 포함한다. 에이전트가 카테고리/네트워크 필터링에 사용한다.

```yaml
---
id: "{category}-{nn}"
title: "{시나리오 제목}"
category: "testnet|mainnet|defi|admin|advanced"
network: ["{network-id}"]
requires_funds: true|false
estimated_cost_usd: "{0.00}"
risk_level: "none|low|medium|high"
tags: ["{tag1}", "{tag2}"]
---
```

### 섹션 파싱 규칙

1. **frontmatter**: `---` 구분자 사이의 YAML을 파싱하여 메타데이터 추출
2. **섹션 분할**: `^## ` 정규식으로 각 섹션 시작점 식별
3. **Step 파싱**: `### Step N:` 패턴으로 개별 단계 식별
4. **코드 블록**: `` ```bash `` ~ `` ``` `` 사이가 실행 가능한 API 호출
5. **체크리스트**: `- [ ]` 패턴이 검증 항목

## 네트워크 태그

시나리오에서 사용하는 네트워크 식별자:

| Network ID | 환경 | 유형 |
|------------|------|------|
| `ethereum-mainnet` | EVM | Mainnet |
| `ethereum-sepolia` | EVM | Testnet |
| `polygon-mainnet` | EVM | Mainnet |
| `arbitrum-mainnet` | EVM | Mainnet |
| `base-mainnet` | EVM | Mainnet |
| `solana-mainnet` | Solana | Mainnet |
| `solana-devnet` | Solana | Testnet |
| `hyperliquid-mainnet` | Hyperliquid | Mainnet |
| `hyperliquid-testnet` | Hyperliquid | Testnet |
| `all` | 전체 | 네트워크 무관 (CRUD 등) |

## 에이전트 실행 원칙

1. **기존 지갑 재사용 우선**: 새 지갑을 생성하지 않고 세션에 연결된 기존 지갑을 사용한다
2. **Dry-Run 먼저**: `requires_funds: true` 시나리오는 반드시 dry-run으로 예상 가스비를 확인한 후 실행한다
3. **자기 전송 패턴**: 전송 시나리오는 자신의 지갑 주소로 보내 자금 손실을 최소화한다
4. **CRUD 원자성**: 지갑/리소스 CRUD 시나리오는 생성 -> 테스트 -> 삭제를 하나의 흐름으로 묶어 기존 데이터를 오염시키지 않는다
5. **인터랙티브 진행**: 각 단계마다 사용자에게 결과를 보고하고 다음 단계 진행 확인을 받는다
6. **masterAuth 요청 금지**: AI 에이전트는 마스터 패스워드를 직접 요청하지 않는다. masterAuth가 필요한 시나리오는 사용자에게 입력을 안내한다

## 시나리오 작성 가이드

새 시나리오를 작성할 때:

1. `_template.md`를 복사하여 해당 카테고리 디렉토리에 배치
2. frontmatter의 모든 필드를 채움
3. 6개 필수 섹션을 모두 작성
4. `_index.md`에 시나리오를 등록
5. Cleanup 섹션이 필요한 경우 (CRUD, 리소스 생성) 반드시 추가
