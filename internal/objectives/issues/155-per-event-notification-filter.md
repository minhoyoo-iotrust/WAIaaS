# 155 — 알림 필터링을 이벤트 단위로 세분화

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** OPEN
- **마일스톤:** (미정)

## 설명

현재 알림 필터링은 6개 카테고리 단위로만 가능하다. 같은 카테고리 내에서 특정 이벤트만 끄고 싶어도 불가능하므로 (예: LOW_BALANCE만 끄려면 system 카테고리 전체를 꺼야 함), 이벤트 단위 필터링으로 개선한다. 각 이벤트에 대한 간략한 설명을 UI에 표시하여 사용자가 어떤 알림인지 쉽게 이해할 수 있게 한다.

## 현재 동작

- `notifications.notify_categories` 설정에 카테고리 배열(`["transaction", "policy", ...]`)로 필터링
- Admin UI > Notifications > Settings에서 6개 체크박스 제공
- 빈 배열 `[]` = 전체 수신 (기본값)
- Broadcast 이벤트 4개는 필터 우회 (보안상 항상 발송)

## 기대 동작

### 설정 저장

- 새 설정 키: `notifications.notify_events` (JSON 배열)
- 형식: `'["TX_CONFIRMED", "LOW_BALANCE", ...]'` — 허용할 이벤트 목록
- 빈 배열 `[]` = 전체 수신 (기존 컨벤션 유지)
- 기존 `notify_categories` 키는 마이그레이션 후 제거

### 필터링 로직

- `isCategoryFiltered()` → `isEventFiltered()`로 변경
- 카테고리 매핑 조회 없이 이벤트명 직접 비교 (로직 단순화)
- Broadcast 이벤트 4개는 기존과 동일하게 필터 우회

### Admin UI

카테고리별 접이식 그룹 + 그룹 전체선택 + **이벤트별 설명 표시**:

```
▼ Transaction Events [✓ All]
  ☑ TX_REQUESTED       — 트랜잭션 요청 접수
  ☑ TX_QUEUED          — 시간지연 큐 대기
  ☑ TX_SUBMITTED       — 블록체인 제출 완료
  ☑ TX_CONFIRMED       — 온체인 확정
  ☑ TX_FAILED          — 트랜잭션 실패
  ☑ TX_CANCELLED       — 사용자/정책에 의한 취소
  ☑ TX_DOWNGRADED_DELAY — 자동 승인에서 시간지연으로 강등
  ☑ TX_APPROVAL_REQUIRED — Owner 승인 필요
  ☑ TX_APPROVAL_EXPIRED  — 승인 대기 시간 초과
  ☑ TX_INCOMING        — 수신 트랜잭션 감지

▼ Policy [✓ All]
  ☑ POLICY_VIOLATION        — 정책 위반 차단
  ☑ CUMULATIVE_LIMIT_WARNING — 누적 지출 한도 경고

▼ Security Alerts [✓ All]
  ☑ WALLET_SUSPENDED         — 지갑 일시 중지
  ☐ KILL_SWITCH_ACTIVATED    — 🔒 긴급 잠금 (필터 불가)
  ☐ KILL_SWITCH_RECOVERED    — 🔒 긴급 잠금 해제 (필터 불가)
  ☑ KILL_SWITCH_ESCALATED    — 킬 스위치 에스컬레이션
  ☐ AUTO_STOP_TRIGGERED      — 🔒 자동 정지 (필터 불가)
  ☐ TX_INCOMING_SUSPICIOUS   — 🔒 의심스러운 수신 TX (필터 불가)

▼ Session Events [✓ All]
  ☑ SESSION_EXPIRING_SOON — 세션 만료 임박
  ☑ SESSION_EXPIRED       — 세션 만료
  ☑ SESSION_CREATED       — 세션 생성
  ☑ SESSION_WALLET_ADDED  — 세션에 지갑 연결
  ☑ SESSION_WALLET_REMOVED — 세션에서 지갑 해제

▼ Owner Events [✓ All]
  ☑ OWNER_SET      — Owner 주소 등록
  ☑ OWNER_REMOVED  — Owner 주소 제거
  ☑ OWNER_VERIFIED — Owner 주소 검증 완료

▼ System Notifications [✓ All]
  ☑ DAILY_SUMMARY             — 일일 요약 리포트
  ☑ LOW_BALANCE               — 잔액 부족 경고
  ☑ APPROVAL_CHANNEL_SWITCHED — 승인 채널 변경
  ☑ UPDATE_AVAILABLE          — 데몬 업데이트 가능
```

- Broadcast 이벤트(🔒 표시)는 체크박스 비활성화 + "항상 발송" 표시
- 각 이벤트 옆에 한 줄 설명 표시
- 그룹 헤더에 "All" 체크박스로 카테고리 전체 토글

### 마이그레이션

- 기존 `notify_categories` 값이 있으면 → 해당 카테고리의 모든 이벤트로 확장
- 예: `["transaction"]` → `["TX_REQUESTED", "TX_QUEUED", ..., "TX_INCOMING"]`
- 마이그레이션 후 `notify_categories` 키는 더 이상 사용하지 않음

## 변경 대상 파일

| 파일 | 작업 |
|------|------|
| `packages/core/src/schemas/signing-protocol.ts` | 이벤트 설명 맵 추가 (EVENT_DESCRIPTIONS) |
| `packages/daemon/src/infrastructure/settings/setting-keys.ts` | `notify_events` 키 추가 |
| `packages/daemon/src/notifications/notification-service.ts` | `isEventFiltered()` 구현 |
| `packages/daemon/src/infrastructure/settings/hot-reload.ts` | NOTIFICATION_KEYS에 새 키 추가 |
| `packages/admin/src/pages/notifications.tsx` | 이벤트별 체크박스 UI 구현 |
| `packages/admin/src/utils/settings-search-index.ts` | notify_events 검색 인덱스 추가 |
| DB 마이그레이션 | notify_categories → notify_events 자동 변환 |

## 테스트 항목

1. **이벤트 필터링**: 특정 이벤트만 허용 시 해당 이벤트만 발송 확인
2. **Broadcast 우회**: 4개 Broadcast 이벤트는 필터와 무관하게 항상 발송
3. **빈 배열 = 전체 수신**: 기본값 동작 유지
4. **마이그레이션**: 기존 카테고리 설정 → 이벤트 목록 변환 정확성
5. **Admin UI 렌더링**: 6개 그룹, 31개 이벤트 체크박스, 설명 표시
6. **그룹 전체선택**: 카테고리 헤더 "All" 토글 시 하위 이벤트 일괄 변경
7. **Broadcast 비활성화**: 🔒 이벤트 체크박스 disabled + "항상 발송" 표시
8. **hot-reload**: 저장 후 즉시 반영
