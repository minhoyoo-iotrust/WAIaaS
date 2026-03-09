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

# {시나리오 제목}

## Metadata
- **ID**: {category}-{nn}
- **Category**: {category}
- **Network**: {network-id}
- **Requires Funds**: Yes/No
- **Estimated Cost**: ~${estimated_cost_usd}
- **Risk Level**: {risk_level} -- {위험 설명}

## Prerequisites
- [ ] WAIaaS 데몬 실행 중 (`http://localhost:3100`)
- [ ] 세션 토큰 보유 (sessionAuth)
- [ ] {네트워크별 추가 조건}

## Scenario Steps

### Step 1: {단계 제목}
**Action**: {수행할 API 호출 또는 동작}
```bash
curl -s http://localhost:3100/v1/{endpoint} \
  -H 'Authorization: Bearer <session-token>' \
  {추가 옵션}
```
**Expected**: {기대 결과 설명}
**Check**: {확인할 응답 필드 또는 상태}

### Step 2: {단계 제목}
**Action**: {수행할 API 호출 또는 동작}
```bash
curl -s http://localhost:3100/v1/{endpoint} \
  -H 'Authorization: Bearer <session-token>' \
  {추가 옵션}
```
**Expected**: {기대 결과 설명}
**Check**: {확인할 응답 필드 또는 상태}

## Verification
- [ ] {검증 항목 1 -- 구체적인 확인 사항}
- [ ] {검증 항목 2}
- [ ] {검증 항목 3}

## Estimated Cost
| Item | Network | Estimated Gas | USD |
|------|---------|---------------|-----|
| {작업} | {network} | {gas} | ~${cost} |
| **Total** | | | **~${total}** |

## Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|------------|
| {증상 1} | {원인} | {해결 방법} |
| {증상 2} | {원인} | {해결 방법} |

## Cleanup
{필요한 경우 정리 작업 -- 특히 CRUD 시나리오에서 생성한 리소스 삭제}
