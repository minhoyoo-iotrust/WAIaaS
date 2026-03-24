# 440 — connect-info에 ownerState 필드 누락

- **유형:** MISSING
- **심각도:** MEDIUM
- **등록일:** 2026-03-24

## 현상

에이전트(세션 토큰)가 지갑의 Owner 등록 상태(`NONE/GRACE/LOCKED`)를 조회할 수 없다.

- `GET /v1/wallets/:id`는 masterAuth 전용이라 세션 토큰으로 접근 불가
- `GET /v1/connect-info`의 wallets 목록에 `ownerState` 필드가 없음
- 에이전트가 APPROVAL 티어 트랜잭션 전송 전에 오너 승인 가능 여부를 사전 판단할 수 없음

## 영향

1. **에이전트 DX 저하:** APPROVAL 필요 금액을 전송한 뒤에야 결과(QUEUED vs INSTANT fallback)로 상황을 파악해야 함
2. **UAT 시나리오 불일치:** 오너 승인 워크플로우 UAT(advanced-05)에서 세션 토큰으로 Owner 상태를 확인하도록 정의되어 있으나 실제로 불가능
3. **NONE 상태 무지:** 오너 미등록(NONE) 시 APPROVAL 티어가 INSTANT로 fallback되는데, 에이전트는 이를 사전에 알 수 없음

## 설계 원칙 검토

ownerState를 세션에 노출하는 것은 설계 원칙에 위배되지 않음:

- **read-only 메타데이터:** NONE/GRACE/LOCKED 값을 아는 것만으로 어떤 권한도 획득하지 못함
- **동급 정보 이미 노출:** connect-info에서 정책 전체(SPENDING_LIMIT 임계값), tier, capabilities가 이미 세션에 노출됨
- **에이전트 판단 근거:** 오너 상태를 알아야 APPROVAL이 필요한 금액의 전송 시도 여부를 합리적으로 판단 가능

## 수정 방안

`GET /v1/connect-info` 응답의 `wallets[]` 각 항목에 `ownerState` 필드를 추가한다:

```jsonc
{
  "wallets": [
    {
      "id": "...",
      "name": "...",
      "ownerState": "GRACE",  // ← 추가
      // ...
    }
  ]
}
```

## 수정 파일

- `packages/daemon/src/api/routes/connect-info.ts` — wallets 매핑에 ownerState 포함
- `packages/daemon/src/api/routes/openapi-schemas.ts` — connectInfoWalletSchema에 ownerState 추가

## 테스트 항목

### 단위 테스트 (connect-info route)

1. **NONE 상태:** Owner 미등록 지갑의 connect-info 응답에 `ownerState: "NONE"`이 포함되는지 확인
2. **GRACE 상태:** Owner 등록 후 미검증 지갑에 `ownerState: "GRACE"`가 반환되는지 확인
3. **LOCKED 상태:** Owner 검증 완료 지갑에 `ownerState: "LOCKED"`가 반환되는지 확인
4. **다중 지갑:** 세션에 연결된 지갑이 여러 개일 때 각 지갑별로 올바른 ownerState가 반환되는지 확인
5. **스키마 호환:** OpenAPI 스키마(connectInfoWalletSchema)에 ownerState 필드가 포함되고 enum 검증이 동작하는지 확인
6. **기존 테스트 회귀:** ownerState 추가 후 기존 connect-info 테스트가 통과하는지 확인
