# 450 — Admin UI: 지갑 앱 테스트 서명 요청 기능

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **등록일:** 2026-03-24
- **수정일:** 2026-03-24

## 현상

Admin UI의 Human Wallet Apps 페이지에 테스트 알림(Test Notification) 버튼은 있지만, 테스트 서명 요청(Test Sign Request) 기능이 없다. Push Relay를 통해 서명 요청이 디바이스에 도달하는지, 서명 응답이 정상적으로 반환되는지 검증할 방법이 없다.

## 수정 방안

### 1. API 엔드포인트 추가

`POST /v1/admin/wallet-apps/:id/test-sign-request`

기존 `test-notification` 엔드포인트와 동일한 패턴:
- Gate 1~5 검증 (SDK 활성, 알림 활성, signing_enabled, subscription_token, push_relay_url)
- 더미 SignRequest 생성 (실제 TX 없이, 테스트용 메시지)
- Push Relay `/v1/push`로 `category: 'sign_request'` 전송
- Long-polling으로 `/v1/sign-response/:requestId` 응답 대기 (타임아웃 30초)
- 응답 결과 반환

응답 스키마:
```typescript
{
  success: boolean;
  error?: string;              // 실패 시 에러 메시지
  result?: {
    action: 'approve' | 'reject';
    signature?: string;        // approve 시 SIWE 서명 값
    signerAddress: string;     // 서명한 주소
    signedAt: string;          // ISO 8601 타임스탬프
  };
  timeout?: boolean;           // 30초 타임아웃 시 true
}
```

### 2. Admin UI 변경

지갑 앱 카드에 "Test Sign Request" 버튼 추가:

#### 버튼 배치
```
[ Test Notification ]  [ Test Sign Request ]
```

#### 상태별 UI

**대기 중** (D'CENT 앱에서 서명 대기):
- 버튼 비활성 + 스피너
- "D'CENT 지갑 앱에서 서명 요청을 확인하세요" 안내 메시지
- 남은 시간 카운트다운 표시

**승인 (approve)**:
- 성공 토스트 + 결과 표시
- Action: approve
- Signer: 주소 (앞 6자...뒤 4자)
- Signature: 접기(collapse) 처리, 클릭 시 전체 복사
- Signed At: 타임스탬프

**거부 (reject)**:
- 경고 토스트 + 결과 표시
- Action: reject
- Signer: 주소

**타임아웃**:
- 경고 토스트
- "30초 내에 응답이 없었습니다. 디바이스 연결 상태를 확인하세요."

### 3. 버튼 활성화 조건

`signing_enabled = 1`인 앱에만 표시. 추가로:
- SDK 비활성 → 버튼 비활성 + "Signing SDK not enabled" 안내
- subscription_token 미설정 → 버튼 비활성 + "No device registered" 안내
- push_relay_url 미설정 → 버튼 비활성 + "No Push Relay URL" 안내

## 테스트 항목

### 단위 테스트
- 테스트 서명 요청 API가 더미 SignRequest를 생성하고 Push Relay로 전송하는지
- approve 응답 시 signature, signerAddress가 포함되는지
- reject 응답 시 signature 없이 action, signerAddress만 반환되는지
- 30초 타임아웃 시 timeout: true로 반환되는지
- Gate 검증 실패 시 적절한 에러 메시지 반환

### Admin UI 테스트
- 버튼 활성화/비활성화 조건 (signing_enabled, SDK, subscription_token, push_relay_url)
- 대기 중 UI 상태 (스피너, 카운트다운, 안내 메시지)
- approve/reject/timeout 각 케이스의 결과 표시
- Signature 접기/펼치기/복사 기능

### 통합 테스트 (UAT)
- Test Sign Request 버튼 → D'CENT 앱에 서명 요청 도달 → 승인 → Admin UI에 서명 값 표시
