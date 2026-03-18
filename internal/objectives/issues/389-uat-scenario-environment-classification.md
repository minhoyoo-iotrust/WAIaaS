# #389 — Agent UAT 시나리오 환경(Environment) 분류 누락

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **발견일:** 2026-03-18
- **마일스톤:** (미정)
- **상태:** OPEN

## 현상

`agent-uat/_index.md`의 시나리오 목록에 실행 환경(offchain/testnet/mainnet) 정보가 명시되지 않아, UAT 실행 전에 어떤 네트워크 환경이 필요한지 한눈에 파악할 수 없다.

## 문제 상세

1. **Env 컬럼 없음** — 각 카테고리 테이블에 `Network` 컬럼은 있지만, 해당 네트워크가 offchain/testnet/mainnet 중 어디에 해당하는지 직접 판단해야 함
2. **admin 카테고리 환경 혼재** — `admin-01~05`는 offchain(`all`), `admin-06~08`은 mainnet 조회, `admin-09`는 testnet 포함. 카테고리만으로 환경을 유추할 수 없음
3. **Quick Filters에 환경별 필터 없음** — `offchain` / `testnet` / `mainnet` 필터가 존재하지 않아 환경 기준 필터링 불가
4. **SKILL.md 서브커맨드도 카테고리 기반** — `run testnet`/`run mainnet`은 카테고리명 기준이지 실제 네트워크 환경 기준이 아님 (admin-06은 mainnet이지만 `run mainnet`에 포함 안됨)

## 영향

- UAT 실행 전 환경 사전 확인 불가 — 테스트넷 잔액만 준비했는데 메인넷 시나리오가 포함될 수 있음
- 환경별 선택 실행이 부정확 — 카테고리 기반 필터가 실제 환경과 불일치

## 수정 방향

### 1. `_index.md` 테이블에 `Env` 컬럼 추가

각 카테고리 테이블에 환경 컬럼을 추가하여 시나리오별 실행 환경을 명시한다:

```markdown
| ID | Title | Network | Env | Funds | Cost | Risk |
|----|-------|---------|-----|-------|------|------|
| admin-01 | Admin UI 전체 페이지 접근 검증 | all | offchain | No | $0 | none |
| admin-06 | Admin 지갑 관리 및 잔액 검증 | ethereum-mainnet, solana-mainnet | mainnet | No | $0 | none |
| testnet-01 | Sepolia ETH 전송 | ethereum-sepolia | testnet | Yes | $0.01 | low |
```

환경 분류 기준:
- `offchain`: `network: all`이고 실제 블록체인 상호작용 없음
- `testnet`: 네트워크가 `-sepolia`, `-devnet`, `-testnet` 접미사
- `mainnet`: 네트워크가 `-mainnet` 접미사
- 혼합(testnet+mainnet): 여러 환경의 네트워크를 동시 사용하는 경우 가장 높은 위험 환경으로 표기

### 2. Quick Filters에 환경별 필터 추가

```markdown
- **Offchain (no blockchain)**: admin-01, admin-02, admin-03, admin-05, admin-10, admin-11, admin-13
- **Testnet only**: testnet-01 ~ testnet-06, admin-ops-01, admin-ops-02, advanced-01
- **Mainnet**: mainnet-01 ~ mainnet-06, defi-01 ~ defi-13, admin-06 ~ admin-08, admin-12, advanced-02 ~ advanced-05
```

### 3. SKILL.md 서브커맨드에 `--env` 옵션 문서화

```markdown
| `/agent-uat run --env offchain` | offchain 시나리오만 실행 |
| `/agent-uat run --env testnet` | testnet 시나리오만 실행 |
| `/agent-uat run --env mainnet` | mainnet 시나리오만 실행 |
```

## 수정 대상

| 파일 | 변경 내용 |
|------|----------|
| `agent-uat/_index.md` | 각 카테고리 테이블에 `Env` 컬럼 추가, Quick Filters에 환경별 필터 추가 |
| `.claude/skills/agent-uat/SKILL.md` | `--env` 옵션 서브커맨드 추가 |

## 테스트 항목

- [ ] `_index.md`의 모든 시나리오(45개)에 Env 컬럼 값이 정확히 매핑되었는지 확인
- [ ] Quick Filters의 환경별 필터 목록이 실제 시나리오 네트워크와 일치하는지 검증
- [ ] `/agent-uat run --env testnet` 실행 시 testnet 시나리오만 필터링되는지 확인
- [ ] 혼합 환경 시나리오(admin-09 등)의 Env 분류가 적절한지 검토
