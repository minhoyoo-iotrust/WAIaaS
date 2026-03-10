---
id: "admin-01"
title: "Admin UI 전체 페이지 접근 검증"
category: "admin"
auth: "master"
network: ["all"]
requires_funds: false
estimated_cost_usd: "0"
risk_level: "none"
tags: ["admin", "ui", "page-access", "http"]
---

# Admin UI 전체 페이지 접근 검증

## Metadata
- **ID**: admin-01
- **Category**: admin
- **Network**: all
- **Requires Funds**: No
- **Estimated Cost**: ~$0
- **Risk Level**: none -- 페이지 접근 확인만 수행

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] Admin UI 접근 가능 (`http://localhost:3100/admin`)
- [ ] 마스터 패스워드 보유

## Scenario Steps

### Step 1: Admin UI 루트 접근
**Action**: Admin UI 루트 URL에 접근하여 응답을 확인한다.
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/admin
```
**Expected**: HTTP 200 OK 또는 로그인 페이지 리다이렉트
**Check**: 응답 코드가 200 또는 302인지 확인

### Step 2: 마스터 패스워드 인증
**Action**: 마스터 패스워드로 Admin API에 인증한다.
```bash
curl -s -X POST http://localhost:3100/v1/admin/auth \
  -H 'Content-Type: application/json' \
  -d '{"masterPassword": "<master-password>"}'
```
**Expected**: 200 OK, 인증 토큰이 반환된다
**Check**: 인증 토큰을 기록하여 이후 단계에서 사용

### Step 3: 전체 메뉴 페이지 순회 접근
**Action**: Admin UI의 모든 메뉴 페이지에 접근하여 HTTP 200을 확인한다.
```bash
for page in dashboard wallets policies settings notifications audit-logs backup tokens stats nft defi; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/admin/$page)
  echo "/admin/$page -> $STATUS"
done
```
**Expected**: 모든 페이지가 HTTP 200을 반환한다
**Check**: 각 페이지 URL과 응답 코드를 기록. 200이 아닌 응답이 있으면 해당 페이지를 별도 표시

### Step 4: 기본 렌더링 확인
**Action**: 사용자에게 브라우저에서 각 페이지를 열어 정상 렌더링을 확인하도록 요청한다.
- Admin UI는 Preact SPA이므로 JavaScript 렌더링이 필요하다
- 에이전트는 API 응답(200)만 확인하고, 시각적 렌더링은 사용자가 확인한다

**Expected**: 모든 페이지가 에러 없이 렌더링된다
**Check**: 사용자에게 "각 페이지가 정상적으로 표시되나요? 빈 페이지나 에러 메시지가 있나요?" 확인

## Verification
- [ ] Admin UI 루트 접근 성공 (200 또는 302)
- [ ] 마스터 패스워드 인증 성공
- [ ] /admin/dashboard -- HTTP 200
- [ ] /admin/wallets -- HTTP 200
- [ ] /admin/policies -- HTTP 200
- [ ] /admin/settings -- HTTP 200
- [ ] /admin/notifications -- HTTP 200
- [ ] /admin/audit-logs -- HTTP 200
- [ ] /admin/backup -- HTTP 200
- [ ] /admin/tokens -- HTTP 200
- [ ] /admin/stats -- HTTP 200
- [ ] /admin/nft -- HTTP 200
- [ ] /admin/defi -- HTTP 200

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| HTTP requests only | all | 0 | $0 |
| **Total** | | | **$0** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| 데몬 미실행 (connection refused) | 데몬 프로세스 미시작 | `waiaas start` 또는 `pnpm dev` 실행 |
| CSP 오류 (브라우저 콘솔) | Content-Security-Policy 위반 | 브라우저 콘솔에서 CSP 위반 세부 내용 확인 |
| 인증 실패 (401) | 마스터 패스워드 불일치 | config.toml의 master_password_hash 확인 |
| 페이지 404 | 라우트 미등록 | Admin UI 라우트 설정 확인, 빌드 상태 확인 |
| 빈 페이지 렌더링 | JavaScript 오류 | 브라우저 개발자 도구 콘솔에서 에러 확인 |
