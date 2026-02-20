# 마일스톤 m30-02: 마스터 패스워드 변경

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

Admin UI에서 마스터 패스워드를 변경할 수 있는 상태. 현재 패스워드 검증 → 키스토어 재암호화 → 세션 무효화 → 사후 안내까지 하나의 플로우로 완료된다.

---

## 배경

### 현재 한계

마스터 패스워드는 `waiaas init` 또는 `waiaas quickstart` 시 최초 설정된 이후 **변경 수단이 없다**. 패스워드를 변경하려면 키스토어 파일을 수동으로 복호화/재암호화해야 하는데, 이 과정은 문서화되어 있지 않고 잘못 수행 시 키 손실 위험이 있다.

### 변경이 필요한 시나리오

| 시나리오 | 설명 |
|----------|------|
| 정기 교체 | 보안 정책에 따른 주기적 패스워드 교체 |
| 유출 의심 | 패스워드가 노출되었을 가능성이 있을 때 |
| 강도 향상 | 초기에 약한 패스워드로 설정한 경우 |

---

## 구현 대상

### 컴포넌트

| 컴포넌트 | 내용 |
|----------|------|
| REST API | `POST /v1/admin/change-master-password` (masterAuth). 현재 패스워드 검증 → 키스토어 재암호화 → Argon2id 해시 갱신 → JWT secret 로테이션 |
| KeyStore 재암호화 | 모든 키스토어 파일을 현재 패스워드로 복호화 → 새 패스워드로 재암호화. 원자적 처리 (하나라도 실패 시 전체 롤백) |
| Admin UI | Settings > Security 섹션에 "Change Master Password" 폼. 현재 패스워드 + 새 패스워드 + 확인 입력 → 성공 시 사후 안내 표시 |

### REST API

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| POST | /v1/admin/change-master-password | masterAuth | 마스터 패스워드 변경 |

#### 요청

```json
{
  "currentPassword": "string",
  "newPassword": "string"
}
```

#### 응답 (200)

```json
{
  "success": true,
  "walletsReEncrypted": 3,
  "sessionsInvalidated": 5,
  "warnings": [
    "All existing sessions have been invalidated",
    "MCP sessions require re-setup: waiaas mcp setup --all",
    "Next daemon restart will require the new password"
  ]
}
```

### 백엔드 처리 순서

```
1. masterAuth 미들웨어로 현재 패스워드 검증
2. 새 패스워드 강도 검증 (최소 8자)
3. 모든 키스토어 파일 목록 조회
4. 트랜잭션 시작 (원자적 처리)
   4a. 각 키스토어 파일: 현재 패스워드로 복호화
   4b. 각 키스토어 파일: 새 패스워드로 재암호화
   4c. 재암호화된 파일을 임시 경로에 저장
5. 모든 재암호화 성공 확인
6. 임시 파일 → 원본 파일 교체 (atomic rename)
7. 메모리 내 masterPasswordHash 갱신 (Argon2id 재해싱)
8. 메모리 내 masterPassword 갱신 (키스토어 복호화용)
9. JWT secret 로테이션 → 기존 세션 전부 무효화
10. 응답 반환
```

### 롤백 전략

| 실패 시점 | 대응 |
|----------|------|
| 4a 복호화 실패 | INVALID_MASTER_PASSWORD 에러 반환. 변경 없음 |
| 4b 재암호화 실패 | 임시 파일 삭제. 원본 유지. 에러 반환 |
| 6 파일 교체 실패 | 임시 파일 유지 + 원본 유지. 에러 반환 + 수동 복구 안내 |
| 7~9 해시/세션 갱신 실패 | 파일은 이미 교체됨. 데몬 재시작으로 복구 가능 (새 패스워드 사용) |

### Admin UI

#### Settings > Security 섹션

```
┌─────────────────────────────────────────────┐
│  Change Master Password                      │
│                                              │
│  Current Password    [________________________]│
│  New Password        [________________________]│
│  Confirm Password    [________________________]│
│                                              │
│  [Change Password]                           │
└─────────────────────────────────────────────┘
```

#### 성공 시 안내 화면

```
┌─────────────────────────────────────────────┐
│  ✓ Master password changed successfully      │
│                                              │
│  Important:                                  │
│  • Next daemon restart will require the      │
│    new password                              │
│  • All existing sessions have been           │
│    invalidated                               │
│  • MCP sessions need re-setup:               │
│    waiaas mcp setup --all                    │
│  • You will be redirected to the login       │
│    page shortly                              │
│                                              │
│  [Go to Login]                               │
└─────────────────────────────────────────────┘
```

성공 후 5초 뒤 자동으로 Admin 로그인 페이지로 리다이렉트 (세션이 무효화되었으므로).

### 파일/모듈 구조

```
packages/daemon/src/api/routes/
  admin.ts                    # POST /admin/change-master-password 추가

packages/daemon/src/infrastructure/keystore/
  keystore.ts                 # reEncryptAll(currentPw, newPw) 메서드 추가

packages/admin/src/components/
  settings.tsx                # Security 섹션에 Change Master Password 폼 추가
```

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | 재암호화 전략 | 임시 파일 → atomic rename | 직접 덮어쓰기는 중간 실패 시 키 손실 위험. 임시 파일에 먼저 쓰고 전부 성공 시 교체하면 원본 보존 |
| 2 | 세션 무효화 | JWT secret 로테이션 | 개별 세션 취소보다 간단하고 확실. 기존 `POST /admin/rotate-secret` 로직 재사용 |
| 3 | 패스워드 강도 검증 | 최소 8자 길이만 | 과도한 규칙(대소문자/특수문자 필수)은 UX 저하. 사용자가 Self-hosted 환경에서 자신의 보안 수준을 결정 |
| 4 | CLI 지원 | m30-02에서는 Admin UI만 | CLI에서의 패스워드 변경은 데몬 실행 중에만 가능하므로 Admin UI와 동일한 REST API 호출. 필요 시 추후 CLI 명령어 추가 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 올바른 현재 패스워드 + 새 패스워드 → 변경 성공 | POST /admin/change-master-password → 200 + walletsReEncrypted > 0 assert | [L0] |
| 2 | 변경 후 새 패스워드로 masterAuth 성공 | 변경 후 GET /admin/status (새 패스워드) → 200 assert | [L0] |
| 3 | 변경 후 이전 패스워드로 masterAuth 실패 | 변경 후 GET /admin/status (이전 패스워드) → 401 assert | [L0] |
| 4 | 변경 후 키스토어 복호화 정상 | 변경 후 새 패스워드로 키스토어 load → private key 복호화 성공 assert | [L0] |
| 5 | 잘못된 현재 패스워드 → 에러 + 변경 없음 | POST (잘못된 currentPassword) → 401 + 이후 기존 패스워드로 정상 동작 assert | [L0] |
| 6 | 재암호화 중 실패 → 원본 보존 | mock 재암호화 2번째 파일에서 실패 → 모든 원본 키스토어 파일 무결성 assert | [L0] |
| 7 | 변경 후 기존 세션 토큰 무효화 | 변경 전 발급 토큰으로 API 호출 → 401 assert | [L0] |
| 8 | 새 패스워드 확인 불일치 (Admin UI) | newPassword ≠ confirmPassword → 프론트엔드 검증 에러 표시 assert | [L0] |
| 9 | 최소 길이 미달 → 에러 | newPassword 7자 → 400 에러 assert | [L0] |
| 10 | 현재 패스워드와 동일한 새 패스워드 → 에러 | currentPassword === newPassword → 400 에러 assert | [L0] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| m20 (오픈소스 릴리스) | Admin UI + masterAuth + 키스토어 인프라가 안정화된 상태에서 진행 |
| m21 (거버넌스) | 보안 관련 변경이므로 거버넌스 체계 수립 후 진행 |
| m26-02 (지갑 앱 알림 채널) | 패스워드 변경 후 지갑 앱 알림 인프라 활용 가능 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | 재암호화 중 프로세스 크래시 | 임시 파일만 남고 원본 유지 → 데이터 손실 없음 | atomic rename 전략으로 원본 보존. 데몬 재시작 시 기존 패스워드로 정상 동작 |
| 2 | 새 패스워드 분실 | 키스토어 복호화 불가 → 지갑 접근 불가 | 변경 전 안내 메시지에 "새 패스워드를 반드시 안전하게 보관하세요" 경고 표시 |
| 3 | MCP 세션 일괄 만료 | Claude Desktop 등 MCP 클라이언트 일시 중단 | 성공 안내에 `waiaas mcp setup --all` 재실행 안내 포함. Recovery 루프가 60초 내 감지 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 1개 |
| 신규 파일 | 0개 (기존 파일 수정) |
| 수정 파일 | 3개 (admin.ts, keystore.ts, settings.tsx) |
| 테스트 | 10개 |
| DB 마이그레이션 | 없음 |

---

*생성일: 2026-02-15*
*선행: m26-02 (지갑 앱 알림 채널)*
