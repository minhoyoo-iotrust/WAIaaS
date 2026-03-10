# #308 — Agent UAT 인증 카테고리 분류 + 필터링 지원

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** FIXED
- **마일스톤:** —

## 현상

현재 45개 Agent UAT 시나리오에 인증 요구사항 구분이 없어서:
- 마스터 패스워드가 필요한 테스트(admin 카테고리)와 세션 토큰만으로 가능한 테스트를 한눈에 구분할 수 없음
- 에이전트가 마스터 패스워드 없이 실행 가능한 시나리오만 선별적으로 돌릴 수 없음

## 원인

- 시나리오 frontmatter에 `auth` 필드 미정의
- `_index.md` Quick Filters에 인증 기준 필터 미존재
- `_template.md`에 auth 필드 가이드 없음

## 분석

### 인증 분류 현황

| 인증 유형 | 시나리오 수 | 대상 |
|-----------|------------|------|
| `master` | 14개 | admin-01 ~ admin-13 + **testnet-01 (지갑 CRUD)** |
| `session` | 31개 | testnet 7 (02~08) + mainnet 6 + defi 12 + advanced 6 |

- Admin UI는 masterAuth only — 세션 토큰으로 대체 불가
- **testnet-01 (지갑 CRUD)은 masterAuth 필요** — `GET /v1/wallets`, `POST /v1/wallets`, `PATCH /v1/wallets/:id`, `DELETE /v1/wallets/:id` 전부 masterAuth
- 트랜잭션/잔액/DeFi 등 에이전트 운영 API는 전부 sessionAuth

### 카테고리 오분류

- **testnet-01 (지갑 CRUD 검증)**: 현재 testnet 카테고리이나 실제로는 admin 카테고리가 적합
  - `network: all` (특정 테스트넷이 아님)
  - 전 Step이 masterAuth 필요 (세션 토큰으로 실행 불가)
  - 온체인 트랜잭션 없음 (오프체인 CRUD)
  - admin-05 (정책 관리 CRUD 검증)과 동일한 성격
- **수정**: testnet-01 → admin-14 재분류, testnet 시나리오 번호 재정렬 (testnet-02~08 → testnet-01~07)

### 변경 범위

1. **`_template.md`** — frontmatter에 `auth: "master" | "session"` 필드 추가
2. **45개 시나리오 파일** — frontmatter에 `auth` 필드 추가
3. **`_index.md`** — Quick Filters에 인증 기준 필터 2줄 추가
4. **`README.md`** — auth 필드 설명 추가

## 수정 방안

### 1. 템플릿 frontmatter 확장

```yaml
---
id: "{category}-{nn}"
title: "{시나리오 제목}"
category: "testnet|mainnet|defi|admin|advanced"
auth: "master|session"          # 추가
network: ["{network-id}"]
requires_funds: true|false
estimated_cost_usd: "{0.00}"
risk_level: "none|low|medium|high"
tags: ["{tag1}", "{tag2}"]
---
```

### 2. testnet-01 → admin-14 재분류

- `agent-uat/testnet/wallet-crud.md` → `agent-uat/admin/wallet-crud.md` 이동
- frontmatter `id: "testnet-01"` → `id: "admin-14"`, `category: "testnet"` → `category: "admin"`
- testnet-02~08 → testnet-01~07로 ID 재번호 (7개 파일 frontmatter + `_index.md`)
- `_index.md` 카테고리 테이블 갱신 (testnet 8→7, admin 13→14)

### 3. Quick Filters 추가

```markdown
- **마스터 패스워드 필요 (masterAuth)**: admin-01 ~ admin-14
- **세션 토큰만 (sessionAuth)**: testnet-01 ~ testnet-07, mainnet-01 ~ mainnet-06, defi-01 ~ defi-12, advanced-01 ~ advanced-06
```

## 테스트 항목

- [ ] testnet-01 (지갑 CRUD)이 admin-14로 이동되었는지 확인
- [ ] testnet 시나리오 ID가 01~07로 재번호되었는지 확인
- [ ] 전체 45개 시나리오 파일에 `auth` 필드 존재 확인
- [ ] `auth: "master"` 시나리오가 admin 카테고리 14개와 일치
- [ ] `auth: "session"` 시나리오가 나머지 31개와 일치
- [ ] `_index.md` Quick Filters에 인증 필터 2줄 포함
- [ ] `_template.md`에 auth 필드 가이드 포함
- [ ] CI `validate-uat-scenarios.sh`에서 auth 필드 존재 검증 추가
