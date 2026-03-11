# Admin UI Credentials 탭 + MCP 도구 + SDK 메서드 설계

> Phase 381, Plan 02 — Admin UI Credentials 탭 UX + MCP 도구 + SDK 메서드 설계

---

## 1. 개요

Admin UI에 Credentials 관리 기능을 추가한다. 두 가지 진입점을 제공한다:

| 진입점 | 경로 | 대상 | 인증 |
|--------|------|------|------|
| 지갑별 Credentials 탭 | `/wallets/:id` → Credentials 탭 | per-wallet credential | masterAuth (쓰기) / sessionAuth (읽기) |
| Admin Credentials 페이지 | `/admin/credentials` | 글로벌 credential | masterAuth 전용 |

**핵심 원칙**: credential 원문(복호화된 값)은 UI에 절대 표시하지 않는다.

---

## 2. 지갑별 Credentials 탭 (per-wallet)

기존 지갑 상세 페이지 (`/wallets/:id`)의 탭 목록에 "Credentials" 탭을 추가한다.

### 2.1 목록 뷰

테이블 레이아웃:

| 컬럼 | 내용 | 비고 |
|------|------|------|
| Type | badge (타입별 색상) | 고정 너비 |
| Name | credential 이름 | 주요 식별자 |
| Metadata | 요약 텍스트 | JSON 첫 번째 키-값 또는 "(empty)" |
| Expires At | 만료 시각 또는 "Never" | 만료 시 경고 아이콘 |
| Created At | 생성 시각 | relative time (예: "2h ago") |
| Actions | 삭제 + 로테이션 버튼 | 아이콘 버튼 |

**Type badge 색상:**

| 타입 | 배경색 | 텍스트 |
|------|--------|--------|
| `api-key` | `bg-blue-100 text-blue-800` | API Key |
| `hmac-secret` | `bg-purple-100 text-purple-800` | HMAC |
| `rsa-private-key` | `bg-orange-100 text-orange-800` | RSA |
| `session-token` | `bg-green-100 text-green-800` | Session |
| `custom` | `bg-gray-100 text-gray-800` | Custom |

**만료 표시:**

- 만료 전: 날짜 표시 (예: "2026-03-15 14:00")
- 만료 24시간 이내: 경고 아이콘 (`!`) + 주황 텍스트
- 만료됨: strikethrough + 빨간 경고 아이콘 + "(expired)" 텍스트
- 만료 없음: "Never" (회색 텍스트)

**빈 상태:**

```
No credentials registered.
Add credentials to enable off-chain actions (CEX trading, signed HTTP, etc.)

[+ Add Credential]
```

**원문 비노출 원칙:** 테이블에 encrypted_value 컬럼이 없으며, 어떤 행에서도 복호화된 값을 표시하지 않는다. `GET /v1/wallets/:walletId/credentials` 응답에 `value` 필드가 포함되지 않기 때문에 UI에서 표시할 수 없다 (API 레벨 보장).

### 2.2 등록 모달 (Add Credential)

"+ Add Credential" 버튼 클릭 시 모달 오픈.

**모달 필드:**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| Type | Select dropdown | Y | 5종 credential 타입 선택 |
| Name | Text input | Y | human-readable 이름 (영문+숫자+하이픈) |
| Value | Password input | Y | 평문 credential 값 (마스킹 기본) |
| Metadata | JSON textarea | N | 부가 정보 (예: `{"exchange": "binance"}`) |
| Expires At | Datetime picker | N | 만료 시각 (미설정 시 무기한) |

**Value 필드 상세:**
- `type="password"`, `autocomplete="off"`
- 마스킹 상태가 기본. 눈 아이콘으로 토글 가능 (입력 중에만)
- 붙여넣기 허용 (`Ctrl+V` / `Cmd+V`)
- 저장 후에는 조회 불가 (서버에서 반환하지 않음)

**Metadata 필드 상세:**
- JSON textarea (monospace 폰트)
- 빈 값이면 `{}` 기본
- JSON 파싱 에러 시 인라인 에러 메시지
- Type 선택에 따라 placeholder 변경:
  - `api-key`: `{"exchange": "binance", "permissions": ["read", "trade"]}`
  - `hmac-secret`: `{"exchange": "binance", "algorithm": "sha256"}`
  - `rsa-private-key`: `{"keySize": 2048, "algorithm": "RSA-SHA256"}`
  - `session-token`: `{"service": "polymarket"}`
  - `custom`: `{"description": "..."}`

**제출 흐름:**
1. 프론트엔드 입력 검증 (name 중복 체크는 서버)
2. masterAuth 확인 다이얼로그 (master password 입력)
3. `POST /v1/wallets/:walletId/credentials` 호출
4. 성공 시: 목록 갱신 + 성공 토스트 ("Credential '{name}' created")
5. 실패 시: 에러 토스트 + 폼 상태 유지 (409 DUPLICATE_NAME 등)
6. 모달 내 Value signal 즉시 초기화 (`secureValue.value = ''`)

### 2.3 삭제 (Delete)

Actions 컬럼의 휴지통 아이콘 클릭.

**확인 다이얼로그:**
```
Delete credential '{name}'?

This action cannot be undone. Any actions referencing this
credential will fail at runtime.

Type the credential name to confirm: [__________]

[Cancel]  [Delete]
```

- 확인 입력: credential 이름 타이핑 (destructive action 안전장치)
- masterAuth 필요 (Delete 클릭 시 master password 확인)
- `DELETE /v1/wallets/:walletId/credentials/:ref` 호출
- 성공 시: 목록에서 제거 + 토스트 ("Credential '{name}' deleted")

### 2.4 로테이션 (Rotate)

Actions 컬럼의 회전 아이콘 클릭.

**모달:**
```
Rotate credential '{name}'

Enter the new value for this credential.
The previous value will be permanently replaced.

New Value: [*****************] [eye icon]

[Cancel]  [Rotate]
```

- New Value: password input (등록 모달과 동일한 SecureValueInput)
- masterAuth 필요
- `PUT /v1/wallets/:walletId/credentials/:ref/rotate` 호출 (body: `{ value: newValue }`)
- 성공 시: updated_at 갱신 확인 + 토스트 ("Credential '{name}' rotated")
- 모달 내 Value signal 즉시 초기화

---

## 3. 글로벌 Credentials 페이지 (Admin > Credentials)

Admin 메뉴에 "Credentials" 항목 추가. 경로: `/admin/credentials`.

### 3.1 목록 뷰

per-wallet 탭과 동일한 테이블 구조에 차이점 추가:

| 컬럼 | per-wallet 탭 | 글로벌 페이지 | 비고 |
|------|-------------|-------------|------|
| Type | O | O | 동일 |
| Name | O | O | 동일 |
| Metadata | O | O | 동일 |
| Expires At | O | O | 동일 |
| Created At | O | O | 동일 |
| Used By | X | O | 참조 중인 지갑 수 표시 |
| Actions | O | O | 동일 |

**"Used By" 컬럼:**
- 글로벌 credential이 몇 개의 지갑에서 참조되고 있는지 표시
- 예: "3 wallets" (클릭 시 지갑 목록 tooltip)
- 구현: 별도 쿼리 또는 프론트엔드에서 계산 (v1에서는 정적 표시, 실시간 참조 추적은 향후)

### 3.2 등록/삭제/로테이션

per-wallet 탭과 동일한 UX. 차이점:
- API 엔드포인트: `/v1/admin/credentials` (글로벌)
- masterAuth 전용 페이지이므로 별도 masterAuth 확인 불필요 (페이지 진입 시 이미 인증됨)
  - 단, destructive action (삭제)에서는 재확인 (이름 타이핑)

### 3.3 빈 상태

```
No global credentials registered.
Global credentials are accessible by all wallets as fallback.

[+ Add Global Credential]
```

---

## 4. 보안 원칙

### 4.1 원문 비노출

| 계층 | 보장 방법 |
|------|----------|
| API | `GET` 응답에 `value` 필드 미포함 (CredentialMetadata만 반환) |
| Transport | HTTPS/localhost only (기존 CSP 정책) |
| UI rendering | value 관련 signal/state 없음 (목록 뷰에서 표시 불가) |
| 입력 후 | 등록/로테이션 모달 닫힐 때 Value signal 즉시 초기화 |

### 4.2 CSP 정책 유지

```
Content-Security-Policy:
  default-src 'none';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self';
  connect-src 'self';
  font-src 'self';
```

- 외부 리소스 로드 없음 (credential 값이 외부로 전송되는 경로 차단)
- `connect-src 'self'`: API 호출은 동일 origin만 허용

### 4.3 masterAuth 확인 패턴

기존 Admin UI의 masterAuth 확인 다이얼로그를 재사용:

```typescript
// 기존 패턴
const masterAuth = await confirmMasterPassword();
if (!masterAuth) return; // 취소됨

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${masterAuth}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data),
});
```

### 4.4 Clipboard 사용

- Value 필드에 붙여넣기 지원 (navigator.clipboard API)
- HTTPS 또는 localhost에서만 동작 (기존 제한)
- 클립보드에서 읽기 후 별도 저장 없음 (signal에만 임시 보관)

---

## 5. 컴포넌트 구조 (Preact)

```
CredentialsTab (per-wallet)
|-- CredentialList (테이블)
|   |-- CredentialRow (행)
|   |   |-- TypeBadge (타입별 색상 배지)
|   |   |-- MetadataSummary (JSON 첫 번째 키-값 요약)
|   |   |-- ExpiryDisplay (만료 상태 표시)
|   |   +-- ActionButtons (삭제, 로테이션 아이콘)
|   +-- EmptyState (빈 상태 메시지 + CTA 버튼)
|-- AddCredentialModal (등록)
|   |-- CredentialTypeSelect (5종 타입 드롭다운)
|   |-- SecureValueInput (password + 눈 토글)
|   +-- MetadataEditor (JSON textarea + 검증)
|-- RotateCredentialModal (로테이션)
|   +-- SecureValueInput
+-- DeleteConfirmDialog (삭제 확인 + 이름 타이핑)

AdminCredentials (글로벌)
|-- PageHeader ("Global Credentials" 제목 + 설명)
|-- CredentialList (동일 컴포넌트 재사용, walletId=null 모드)
|   +-- UsedByColumn (추가 컬럼: 참조 지갑 수)
|-- AddCredentialModal
|-- RotateCredentialModal
+-- DeleteConfirmDialog
```

### 컴포넌트 재사용 전략

- `CredentialList`, `AddCredentialModal`, `RotateCredentialModal`, `DeleteConfirmDialog`는 per-wallet과 글로벌에서 공유
- Props로 `walletId: string | null` 전달하여 API 엔드포인트 분기
- `UsedByColumn`은 글로벌 모드에서만 렌더링

---

## 6. 상태 관리 (signals)

```typescript
// credential-store.ts
import { signal, computed } from '@preact/signals';

// ── 목록 상태 ──
const credentials = signal<CredentialMetadata[]>([]);
const isLoading = signal(false);
const error = signal<string | null>(null);

// ── 선택/모달 상태 ──
const selectedCredential = signal<CredentialMetadata | null>(null);
const showAddModal = signal(false);
const showRotateModal = signal(false);
const showDeleteConfirm = signal(false);

// ── 폼 입력 (임시) ──
const addForm = signal<{
  type: CredentialType;
  name: string;
  value: string;        // 민감 — 모달 닫힐 때 즉시 초기화
  metadata: string;     // JSON 문자열
  expiresAt: string;    // ISO 문자열 또는 빈 문자열
}>({
  type: 'api-key',
  name: '',
  value: '',
  metadata: '{}',
  expiresAt: '',
});

const rotateValue = signal('');  // 민감 — 모달 닫힐 때 즉시 초기화

// ── computed ──
const expiredCredentials = computed(() =>
  credentials.value.filter(c =>
    c.expiresAt != null && c.expiresAt < Math.floor(Date.now() / 1000)
  )
);

const activeCredentials = computed(() =>
  credentials.value.filter(c =>
    c.expiresAt == null || c.expiresAt >= Math.floor(Date.now() / 1000)
  )
);

// ── 액션 ──

async function loadCredentials(walletId: string | null): Promise<void> {
  isLoading.value = true;
  error.value = null;
  try {
    const url = walletId
      ? `/v1/wallets/${walletId}/credentials`
      : '/v1/admin/credentials';
    const res = await apiFetch(url);
    credentials.value = res.credentials;
  } catch (e) {
    error.value = e.message;
  } finally {
    isLoading.value = false;
  }
}

async function createCredential(walletId: string | null): Promise<boolean> {
  // masterAuth 확인 → API 호출 → 목록 갱신
  // 성공 시 addForm 초기화 (특히 value 필드)
}

async function deleteCredential(ref: string, walletId: string | null): Promise<boolean> {
  // 확인 다이얼로그 → masterAuth → API 호출 → 목록 갱신
}

async function rotateCredential(ref: string, walletId: string | null): Promise<boolean> {
  // masterAuth → API 호출 → 목록 갱신
  // 성공 시 rotateValue 초기화
}

// ── 민감 데이터 클리어 ──

function clearSensitiveData(): void {
  addForm.value = { ...addForm.value, value: '' };
  rotateValue.value = '';
}
```

---

## 7. 기존 Admin UI 패턴과의 일관성

| 패턴 | 기존 사용처 | Credentials 적용 |
|------|-----------|-----------------|
| 테이블 스타일 | Policy, Notifications, Token Registry | CredentialList 동일 스타일 |
| 모달 스타일 | Add Policy, Add Token | AddCredentialModal 동일 스타일 |
| 토스트 | sonner | 성공/에러 토스트 |
| masterAuth 확인 | Policy 변경, Settings 변경 | create/delete/rotate 시 |
| 반응형 | 모바일에서 테이블 -> 카드 전환 | CredentialList 동일 |
| 에러 처리 | API 실패 시 토스트 + 폼 유지 | 동일 패턴 |
| 빈 상태 | Notifications, Token Registry | EmptyState 컴포넌트 |
| badge | Policy 타입 badge | TypeBadge (색상별) |

### 메뉴 위치

Admin 사이드바 메뉴 기존 구조에서의 위치:

```
Admin
|-- Dashboard
|-- Wallets
|   +-- [wallet detail]
|       |-- Overview
|       |-- Transactions
|       |-- Policies
|       |-- Credentials  ← 신규 탭 추가
|       +-- ...
|-- Settings
|-- Notifications
|-- Token Registry
|-- Credentials  ← 신규 글로벌 페이지 추가 (Settings 아래)
+-- ...
```

---

## 8. MCP 도구 설계

4개의 MCP 도구를 추가한다.

### 8.1 credential-list

```
도구명: credential-list
설명: 지갑의 credential 목록을 조회한다 (메타데이터만).
인증: sessionAuth
파라미터:
  - walletId: string (required) — 대상 지갑 ID
반환: CredentialMetadata[]

예시:
  credential-list --walletId wallet-abc
  → [
      { id: "...", type: "api-key", name: "binance-api-key", ... },
      { id: "...", type: "hmac-secret", name: "binance-hmac", ... }
    ]
```

### 8.2 credential-create

```
도구명: credential-create
설명: 새 credential을 등록한다.
인증: masterAuth
파라미터:
  - walletId: string (required) — 대상 지갑 ID ("global"이면 글로벌)
  - type: CredentialType (required) — credential 타입
  - name: string (required) — human-readable 이름
  - value: string (required) — 평문 credential 값
  - metadata: JSON string (optional) — 부가 정보
  - expiresAt: ISO datetime (optional) — 만료 시각
반환: CredentialMetadata (원문 비포함)

예시:
  credential-create \
    --walletId wallet-abc \
    --type api-key \
    --name binance-api-key \
    --value "abc123..." \
    --metadata '{"exchange": "binance"}'
  → { id: "...", type: "api-key", name: "binance-api-key", ... }
```

> AI agents must NEVER request the master password. Use only your session token.

### 8.3 credential-delete

```
도구명: credential-delete
설명: credential을 삭제한다.
인증: masterAuth
파라미터:
  - walletId: string (required) — 대상 지갑 ID
  - ref: string (required) — credential UUID
반환: 성공/실패

예시:
  credential-delete --walletId wallet-abc --ref 550e8400-...
  → Credential 'binance-api-key' deleted
```

### 8.4 credential-rotate

```
도구명: credential-rotate
설명: credential 값을 새 값으로 교체한다 (로테이션).
인증: masterAuth
파라미터:
  - walletId: string (required) — 대상 지갑 ID
  - ref: string (required) — credential UUID
  - newValue: string (required) — 새 credential 값
반환: CredentialMetadata (원문 비포함)

예시:
  credential-rotate --walletId wallet-abc --ref 550e8400-... --newValue "newSecret..."
  → { id: "...", type: "api-key", name: "binance-api-key", updatedAt: ... }
```

---

## 9. SDK 메서드 설계

WAIaaS SDK에 4개 메서드를 추가한다.

```typescript
// @waiaas/sdk

class WAIaaSSDK {
  // ... 기존 메서드 ...

  /**
   * 지갑의 credential 목록을 조회한다 (메타데이터만).
   *
   * @param walletId - 대상 지갑 ID
   * @returns credential 메타데이터 배열
   * @auth sessionAuth
   */
  async listCredentials(walletId: string): Promise<CredentialMetadata[]>;

  /**
   * 새 credential을 등록한다.
   *
   * @param walletId - 대상 지갑 ID (null이면 글로벌)
   * @param params - 생성 파라미터 (type, name, value, metadata?, expiresAt?)
   * @returns 생성된 credential 메타데이터 (원문 비포함)
   * @auth masterAuth
   */
  async createCredential(
    walletId: string | null,
    params: CreateCredentialParams,
  ): Promise<CredentialMetadata>;

  /**
   * credential을 삭제한다.
   *
   * @param walletId - 대상 지갑 ID
   * @param ref - credential UUID
   * @auth masterAuth
   */
  async deleteCredential(walletId: string, ref: string): Promise<void>;

  /**
   * credential 값을 새 값으로 교체한다 (로테이션).
   *
   * @param walletId - 대상 지갑 ID
   * @param ref - credential UUID
   * @param newValue - 새 credential 값
   * @returns 갱신된 credential 메타데이터 (원문 비포함)
   * @auth masterAuth
   */
  async rotateCredential(
    walletId: string,
    ref: string,
    newValue: string,
  ): Promise<CredentialMetadata>;
}
```

### SDK 내부 구현 패턴

```typescript
// 엔드포인트 매핑
listCredentials(walletId):
  GET /v1/wallets/${walletId}/credentials

createCredential(walletId, params):
  walletId != null
    ? POST /v1/wallets/${walletId}/credentials
    : POST /v1/admin/credentials

deleteCredential(walletId, ref):
  DELETE /v1/wallets/${walletId}/credentials/${ref}

rotateCredential(walletId, ref, newValue):
  PUT /v1/wallets/${walletId}/credentials/${ref}/rotate
  body: { value: newValue }
```

---

## 10. 설계 결정 요약 + Pitfall 체크리스트

### 설계 결정

| # | 결정 | 근거 |
|---|------|------|
| D1 | per-wallet과 글로벌의 두 진입점 분리 | per-wallet은 지갑 상세의 탭 (컨텍스트 명확), 글로벌은 Admin 전용 페이지 (전체 관리) |
| D2 | CredentialList 컴포넌트를 공유하고 walletId props로 분기 | 코드 중복 방지 + UX 일관성 |
| D3 | Value 필드를 password input으로 | 화면 캡처/화면 공유 시 credential 노출 방지 |
| D4 | 삭제 시 이름 타이핑 확인 | 기존 destructive action 패턴 (지갑 삭제와 동일). 실수 방지 |
| D5 | MCP 도구에서 value 반환 안함 | REST API와 동일한 원문 비노출 원칙 |
| D6 | SDK createCredential에 walletId null 허용 | 글로벌 credential 등록을 단일 메서드로 지원 |
| D7 | "Used By" 컬럼을 v1에서 정적 표시 | 실시간 참조 추적은 복잡도 높음. 향후 개선 |

### Pitfall 체크리스트

- [ ] Value signal은 모달 닫힐 때 반드시 초기화 — `clearSensitiveData()` 호출
- [ ] REST API 응답에 `value` 필드가 포함되지 않음을 UI 코드가 가정하지 않아야 함 (방어적 코딩: 혹시 포함되어도 렌더링하지 않음)
- [ ] Metadata JSON 검증을 프론트엔드에서 수행 — 잘못된 JSON은 서버 전송 전 차단
- [ ] 만료 표시의 시간대 — `expiresAt`은 Unix seconds이므로 로컬 시간대로 변환하여 표시
- [ ] masterAuth 토큰 만료 시 재인증 — 모달 열린 상태에서 토큰이 만료되면 에러 토스트 후 재인증 유도
- [ ] 글로벌 페이지에서 walletId를 null로 전달 — API 엔드포인트가 `/v1/admin/credentials`로 분기됨
- [ ] MCP credential-create의 `value` 파라미터는 MCP 컨텍스트에서만 사용 — 응답에는 미포함
- [ ] Admin 메뉴에 Credentials 항목 추가 시 기존 메뉴 순서 유지 — Settings 아래에 배치

---

*Phase: 381-credential-vault-infra, Plan: 02*
*작성일: 2026-03-11*
