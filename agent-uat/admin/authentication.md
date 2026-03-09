---
id: "admin-02"
title: "Admin 마스터 패스워드 인증"
category: "admin"
network: ["all"]
requires_funds: false
estimated_cost_usd: "0"
risk_level: "none"
tags: ["admin", "auth", "master-password", "session"]
---

# Admin 마스터 패스워드 인증

## Metadata
- **ID**: admin-02
- **Category**: admin
- **Network**: all
- **Requires Funds**: No
- **Estimated Cost**: ~$0
- **Risk Level**: none -- 인증 테스트만 수행

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 마스터 패스워드 보유

## Scenario Steps

### Step 1: 미인증 Admin API 접근
**Action**: 마스터 패스워드 없이 Admin API에 접근하여 401 거부를 확인한다.
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/v1/admin/stats
```
**Expected**: HTTP 401 Unauthorized
**Check**: 응답 코드가 401인지 확인

### Step 2: 잘못된 패스워드 인증
**Action**: 잘못된 마스터 패스워드로 인증을 시도한다.
```bash
curl -s -w "\n%{http_code}" -X POST http://localhost:3100/v1/admin/auth \
  -H 'Content-Type: application/json' \
  -d '{"masterPassword": "wrong-password-12345"}'
```
**Expected**: HTTP 401 Unauthorized, 인증 실패 메시지
**Check**: 응답 코드가 401이고 에러 메시지가 반환되는지 확인

### Step 3: 올바른 패스워드 인증
**Action**: 올바른 마스터 패스워드로 인증한다. 사용자에게 패스워드 입력을 요청한다.
```bash
curl -s -X POST http://localhost:3100/v1/admin/auth \
  -H 'Content-Type: application/json' \
  -d '{"masterPassword": "<master-password>"}'
```
**Expected**: 200 OK, 인증 토큰이 반환된다
**Check**: 응답에 토큰(token) 필드가 포함되어 있는지 확인

### Step 4: 토큰 기반 Admin API 접근
**Action**: 인증 토큰을 사용하여 Admin API에 접근한다.
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/v1/admin/stats \
  -H 'Authorization: Bearer <admin-token>'
```
**Expected**: HTTP 200 OK
**Check**: 응답 코드가 200인지 확인

### Step 5: X-Master-Password 헤더 직접 접근
**Action**: X-Master-Password 헤더로 직접 Admin API에 접근한다.
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/v1/admin/settings \
  -H 'X-Master-Password: <master-password>'
```
**Expected**: HTTP 200 OK
**Check**: 응답 코드가 200인지 확인. 토큰 없이도 직접 패스워드로 접근 가능

## Verification
- [ ] 미인증 접근 시 401 거부
- [ ] 잘못된 패스워드 시 401 거부
- [ ] 올바른 패스워드 시 200 + 토큰 반환
- [ ] 토큰 기반 접근 시 200 성공
- [ ] X-Master-Password 헤더 접근 시 200 성공

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| API requests only | all | 0 | $0 |
| **Total** | | | **$0** |

> **Note**: 에이전트는 마스터 패스워드를 직접 요청하지 않는다. 사용자에게 입력을 안내한다.

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| Argon2id 해싱 오류 | sodium-native 미설치 | `pnpm install` 재실행, sodium-native 빌드 확인 |
| 토큰 만료 | Admin 토큰 유효 기간 초과 | 재인증 수행 |
| 패스워드 미설정 | config.toml에 master_password_hash 없음 | `waiaas setup` 또는 직접 설정 |
| 401 응답에 에러 상세 없음 | 보안상 상세 미노출 | 데몬 로그에서 인증 실패 상세 확인 |
