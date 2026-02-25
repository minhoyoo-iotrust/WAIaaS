# #183 Admin UI 정책 생성 시 타입별 한 줄 설명 추가

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** —
- **상태:** OPEN

---

## 증상

Admin UI Policies 페이지에서 정책을 생성할 때 Type 드롭다운에 12가지 정책 유형이 나열되지만, 각 정책이 어떤 역할을 하는지 설명이 없어 사용자가 직관적으로 이해하기 어려움.

- "Approve Tier Override"와 "Approve Amount Limit"의 차이가 불분명
- "Whitelist"와 "Contract Whitelist"가 각각 어떤 대상을 제한하는지 알 수 없음
- 처음 사용하는 사용자가 올바른 정책 유형을 선택하려면 별도 문서를 참조해야 함

---

## 대상

12가지 정책 유형 전체:

| 정책 유형 | 예상 설명 |
|-----------|-----------|
| Spending Limit | 거래당/누적 지출 한도를 티어별(즉시, 알림, 지연, 승인)로 설정 |
| Whitelist | 사전 승인된 주소로만 전송 허용 |
| Time Restriction | 특정 시간대/요일에만 거래 허용 |
| Rate Limit | 시간 윈도우 내 최대 거래 횟수 제한 |
| Allowed Tokens | 허용된 토큰만 전송 가능, 나머지는 거부 |
| Contract Whitelist | 사전 승인된 컨트랙트 주소로만 호출 허용 |
| Method Whitelist | 특정 컨트랙트 메서드(함수 셀렉터)만 호출 허용 |
| Approved Spenders | 사전 승인된 spender 주소에 대해서만 토큰 approve 허용 |
| Approve Amount Limit | 토큰 approve 최대 금액 제한 + 무제한 승인 차단 옵션 |
| Approve Tier Override | 모든 토큰 approve 거래에 보안 티어 강제 적용 |
| Allowed Networks | 특정 블록체인 네트워크에서만 거래 허용 |
| x402 Allowed Domains | 사전 승인된 도메인으로만 x402 결제 허용 |

---

## 수정 방안

### 1. `POLICY_DESCRIPTIONS` 맵 추가

`policies.tsx`의 `POLICY_TYPES` 배열 아래에 `POLICY_DESCRIPTIONS: Record<string, string>` 추가.
12개 정책 유형 각각에 영문 한 줄 설명 매핑.

### 2. Type 드롭다운 아래에 설명 텍스트 렌더링

- Type `<FormField>` 바로 아래에 선택된 `formType.value`에 대한 설명 표시
- 기존 `form-description` CSS 클래스 활용 (FormField 컴포넌트에 이미 존재)
- 정책 미선택 시 미표시 (조건부 렌더링)

### 3. 편집 모드에서도 동일 설명 표시

- 정책 수정 시에도 현재 정책 유형의 설명이 표시되도록 적용

---

## 관련 파일

- `packages/admin/src/pages/policies.tsx:41-54` — POLICY_TYPES 배열
- `packages/admin/src/pages/policies.tsx:766-775` — 생성 폼 Type 드롭다운
- `packages/admin/src/components/form.tsx` — FormField description 프롭 (기존 인프라)

---

## 테스트 항목

- [ ] 12개 정책 유형 모두에 대해 POLICY_DESCRIPTIONS 키 매핑 존재 확인 (누락 방지)
- [ ] Type 드롭다운 변경 시 해당 설명 텍스트 렌더링 확인
- [ ] 설명 텍스트가 `form-description` 스타일로 표시되는지 확인
- [ ] 정책 편집 모드에서도 설명 표시 확인
- [ ] 기존 정책 생성/수정 기능 회귀 없음 확인
