# #264 Admin UI에서 deprecated Smart Account(Solady factory) 지갑 경고 미표시

- **유형:** MISSING
- **심각도:** HIGH
- **상태:** OPEN
- **발견일:** 2026-03-07

## 증상

v31.3(#256)에서 Smart Account factory를 Solady → permissionless.js SimpleAccount factory로 전환했다. 기존 Solady factory(`0x5d82...933Df`)로 생성된 AA 지갑은 트랜잭션/UserOp 실행 시 `DEPRECATED_SMART_ACCOUNT`(HTTP 410) 에러로 차단된다.

그러나 Admin UI 지갑 상세 페이지에서:
1. factory 주소 정보가 표시되지 않음
2. deprecated 상태 경고 배너가 없음
3. 새 지갑 생성 마이그레이션 안내가 없음

관리자가 해당 지갑이 더 이상 사용 불가능하다는 사실을 트랜잭션 실패 시점에야 알 수 있다.

## 원인

1. **API 응답에 factoryAddress 누락:** GET `/v1/wallets/:id` 응답에 `factoryAddress` 필드가 포함되지 않음 (`packages/daemon/src/api/routes/wallets.ts:401-426`)
2. **Admin UI에 factoryAddress 미사용:** `WalletDetail` 인터페이스에 `factoryAddress` 필드 없음 (`packages/admin/src/pages/wallets.tsx:53-65`)
3. **Deprecated 판별 로직 없음:** Solady factory 주소(`0x5d82735936c6Cd5DE57cC3c1A799f6B2E6F933Df`)와 비교하는 로직이 Admin UI에 없음

## 수정 방안

### 1단계: API 응답에 factoryAddress 추가
- `packages/daemon/src/api/routes/wallets.ts` GET `/v1/wallets/:id` 응답에 `factoryAddress` 필드 추가
- OpenAPI 스키마 갱신

### 2단계: Admin UI 경고 배너
- `WalletDetail` 인터페이스에 `factoryAddress` 필드 추가
- Smart Account 상세 섹션에 factory 주소 표시
- Solady factory 지갑에 경고 배너:
  - "This Smart Account uses a deprecated factory (Solady). Transactions and UserOp operations will be rejected. Please create a new Smart Account wallet to continue."
  - danger 스타일 배너 + 새 지갑 생성 링크

### 3단계: 지갑 목록에서도 표시
- Account Type 컬럼에서 deprecated 지갑은 `Badge variant="danger"` + "Deprecated" 라벨

## 영향 범위

- `packages/daemon/src/api/routes/wallets.ts` — API 응답 필드 추가
- `packages/admin/src/pages/wallets.tsx` — WalletDetail 타입 + 상세 UI + 목록 Badge
- OpenAPI 스키마 갱신
- 스킬 파일 동기화 (wallet.skill.md)

## 테스트 항목

1. GET `/v1/wallets/:id` 응답에 `factoryAddress` 필드가 포함되는지 확인
2. Solady factory 지갑 상세 페이지에 deprecated 경고 배너가 표시되는지 확인
3. permissionless.js factory 지갑에는 경고가 표시되지 않는지 확인
4. EOA 지갑에는 factoryAddress 관련 UI가 표시되지 않는지 확인
5. 지갑 목록에서 deprecated Smart Account에 danger Badge가 표시되는지 확인
