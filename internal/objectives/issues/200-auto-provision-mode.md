# 200 — Auto-Provision 모드: 마스터 패스워드 없는 초기 셋업

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **마일스톤:** 미정
## 현황

현재 WAIaaS 초기 설정 시 `waiaas start`와 `waiaas quickset` 모두에서 마스터 패스워드 입력이 필요하다. 이는 인간 오퍼레이터가 직접 관리하는 시나리오에는 적합하지만, 자율 에이전트(Conway Automaton 등)나 플랫폼이 WAIaaS를 자동으로 프로비저닝하는 시나리오에서는 병목이 된다.

에이전트 프레임워크/플랫폼에 관계없이 패스워드 입력 없이 WAIaaS를 설치·초기화·실행할 수 있는 경로가 필요하다.

또한, 현재 마스터 패스워드는 최초 설정 이후 변경 수단이 없다. 본 이슈에서 패스워드 변경 API와 CLI를 함께 구현한다.

## 요구사항

### 1. `waiaas init --auto-provision` 플래그 추가

`init` 명령어에 `--auto-provision` 옵션을 추가하여, 마스터 패스워드를 자동 생성하고 recovery.key 파일에 저장한다.

**동작:**
```
waiaas init --auto-provision
  ├─ 디렉토리 구조 생성 (기존 init 로직)
  ├─ config.toml 생성 (기존 init 로직)
  ├─ 마스터 패스워드 자동 생성 (crypto.randomBytes(32).toString('hex'))
  └─ DATA_DIR/recovery.key 저장 (파일 권한 0600)
```

**recovery.key 파일:**
- 위치: `DATA_DIR/recovery.key` (기본: `~/.waiaas/recovery.key`)
- 내용: 평문 마스터 패스워드
- 권한: 0600 (owner read/write only)
- 수명: 오퍼레이터가 `set-master`로 인계할 때까지 존재

### 2. `resolvePassword()` 체인에 recovery.key 탐색 추가

기존 패스워드 해석 순서에 recovery.key 경로를 추가한다.

**변경 후 탐색 순서:**
```
1. WAIAAS_MASTER_PASSWORD 환경변수
2. WAIAAS_MASTER_PASSWORD_FILE 파일
3. DATA_DIR/recovery.key 파일          ← 신규
4. 대화형 프롬프트 (TTY일 때)
```

이를 통해 `start`, `quickset`, `mcp-setup` 등 기존 명령어는 코드 변경 없이 recovery.key를 자동으로 읽는다.

### 3. `waiaas set-master` 명령어 추가

오퍼레이터가 자기 패스워드를 설정하고 recovery.key를 삭제하여 관리 권한을 인계받는다. recovery.key가 없는 경우에는 일반 패스워드 변경 용도로도 사용 가능하다.

**동작:**
```
waiaas set-master
  ├─ 현재 패스워드 확인 (recovery.key 또는 프롬프트)
  ├─ 데몬 헬스체크
  ├─ 새 패스워드 입력 (대화형 프롬프트, 2회 확인)
  ├─ PUT /v1/admin/master-password (현재 패스워드 + 새 패스워드)
  │   ├─ Argon2id 해시 갱신
  │   ├─ 키스토어 재암호화 (현재 PW 복호화 → 새 PW 암호화)
  │   └─ 메모리 내 masterPasswordHash 갱신
  ├─ recovery.key 삭제 (존재 시)
  └─ "마스터 패스워드가 설정되었습니다" 출력
```

**고려사항:**
- recovery.key가 없으면 현재 패스워드를 프롬프트로 입력 받음 (일반 패스워드 변경)
- 새 패스워드는 2회 입력 확인 (불일치 시 재시도)
- `--password` 플래그로 비대화형 사용 가능

### 4. 마스터 패스워드 변경 API 추가

`set-master` CLI 및 Admin UI가 호출할 REST API 엔드포인트.

```
PUT /v1/admin/master-password
Headers: X-Master-Password: <현재 패스워드>
Body: { "newPassword": "<새 패스워드>" }
→ 200 { "message": "Master password updated", "walletsReEncrypted": 3 }
```

**처리 순서:**
```
1. masterAuth 미들웨어로 현재 패스워드 검증
2. 새 패스워드 강도 검증 (최소 8자)
3. 키스토어 재암호화 (원자적 처리)
   3a. 모든 키스토어 파일 목록 조회
   3b. 각 파일: 현재 패스워드로 복호화 → 새 패스워드로 재암호화
   3c. 재암호화된 파일을 임시 경로에 저장
   3d. 모든 재암호화 성공 확인
   3e. 임시 파일 → 원본 파일 교체 (atomic rename)
4. 새 패스워드 Argon2id 해시 생성
5. DB master_password_hash 업데이트
6. 메모리 내 masterPassword + masterPasswordHash 갱신
7. 응답 반환
```

**기존 세션 유지:** JWT secret은 로테이션하지 않는다. 패스워드 변경은 admin 인증 수단의 교체일 뿐, 에이전트 세션과 무관하다. 유출 대응이 필요한 경우 킬 스위치 또는 세션 개별 취소로 처리한다.

**롤백 전략:**

| 실패 시점 | 대응 |
|----------|------|
| 3b 복호화 실패 | INVALID_MASTER_PASSWORD 에러 반환. 변경 없음 |
| 3c 재암호화 실패 | 임시 파일 삭제. 원본 유지. 에러 반환 |
| 3e 파일 교체 실패 | 임시 파일 유지 + 원본 유지. 에러 반환 + 수동 복구 안내 |
| 4~6 해시/메모리 갱신 실패 | 파일은 이미 교체됨. 데몬 재시작으로 복구 가능 (새 패스워드 사용) |

### 5. Admin UI 패스워드 관리

두 가지 UI 요소를 추가한다.

**5a. 인계 배너 (auto-provision 상태):**

auto-provision으로 시작된 인스턴스(recovery.key 존재)에서 Admin UI 접속 시 상단에 안내 배너를 표시한다.

```
⚠️ Auto-provisioned mode — 보안을 위해 마스터 패스워드를 설정하세요.
   CLI: waiaas set-master
```

**조건:** recovery.key 존재 여부를 확인하는 API 엔드포인트 또는 상태 플래그 필요.

**5b. 패스워드 변경 폼 (Settings > Security):**

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

성공 시 안내:
- "마스터 패스워드가 변경되었습니다"
- "다음 데몬 재시작 시 새 패스워드를 사용하세요"
- 기존 세션은 유지됨 (별도 안내 불필요)

## 사용 흐름

### 자동 프로비저닝 (에이전트/플랫폼)
```bash
npm install -g @waiaas/daemon
waiaas init --auto-provision
waiaas start                      # recovery.key에서 패스워드 자동 읽음
waiaas quickset --mode mainnet    # recovery.key에서 패스워드 자동 읽음
# → 에이전트는 mcp-token 파일의 세션 토큰만 사용
```

### 오퍼레이터 인계
```bash
waiaas set-master                 # 자기 패스워드 설정 → 키스토어 재암호화 → recovery.key 삭제
# → 이후 기존 WAIaaS와 동일한 보안 모델
# → 에이전트 세션은 그대로 유지됨
```

### 일반 패스워드 변경
```bash
waiaas set-master                 # 현재 패스워드 프롬프트 → 새 패스워드 설정
# 또는 Admin UI Settings > Security > Change Master Password
```

### 기존 방식 (변경 없음)
```bash
waiaas init
waiaas start                      # 패스워드 입력
waiaas quickset --password xxx    # 패스워드 입력
```

## 보안 고려사항

| 항목 | 대응 |
|------|------|
| recovery.key 파일 접근 | 파일 권한 0600으로 소유자만 읽기 가능 |
| 에이전트의 admin 권한 접근 | 같은 유저 실행 시 의도된 동작 (자율 에이전트). 분리 필요 시 프로세스 유저 분리 (systemd User=, Docker 컨테이너) |
| recovery.key 유출 | 수명 최소화 — 오퍼레이터 인계 시 즉시 삭제 |
| 암호화 불필요 근거 | 복호화 키를 같은 머신에 저장해야 하므로 실질적 보안 효과 없음. SSH 키와 동일 모델 (평문 + 파일 권한) |
| 패스워드 변경 시 세션 유지 | JWT secret 로테이션 하지 않음. 패스워드 변경은 admin 인증 수단 교체일 뿐 에이전트 세션과 무관. 유출 대응은 킬 스위치/세션 취소로 처리 |
| 키스토어 재암호화 실패 | 임시 파일 → atomic rename 전략으로 원본 보존. 중간 실패 시 키 손실 없음 |

## 설계 결정

| ID | 결정 | 근거 |
|----|------|------|
| D1 | `init --auto-provision`에서 패스워드 생성 (start가 아님) | init은 "어떻게 운영할지 결정", start는 "결정된 대로 실행" — 책임 분리 |
| D2 | `resolvePassword()`에 recovery.key 탐색 추가 | 기존 명령어(start, quickset, mcp-setup 등) 코드 변경 불필요 |
| D3 | recovery.key는 평문 + 파일 권한(0600) | 암호화 시 복호화 키 저장 위치 문제가 동일하게 반복 — 실질적 보안 이점 없음 |
| D4 | `set-master`가 recovery.key 존재 여부와 무관하게 동작 | auto-provision 인계 + 일반 패스워드 변경을 단일 명령으로 통합 |
| D5 | quickset의 역할 유지 | auto-provision이 되어도 start와 quickset의 책임 분리는 그대로 — resolvePassword()가 recovery.key를 읽으므로 quickset 코드 변경 불필요 |
| D6 | 패스워드 변경 시 JWT secret 로테이션 안 함 | 에이전트 세션은 패스워드 변경과 무관. 운영 중인 에이전트를 불필요하게 중단시키지 않음. 세션 무효화가 필요한 상황(유출)은 킬 스위치/세션 취소로 대응 |
| D7 | 키스토어 재암호화는 atomic rename 전략 | 직접 덮어쓰기는 중간 실패 시 키 손실 위험. 임시 파일에 먼저 쓰고 전부 성공 시 교체하면 원본 보존 |
| D8 | 패스워드 최소 길이 8자만 검증 | 과도한 규칙(대소문자/특수문자 필수)은 UX 저하. Self-hosted 환경에서 사용자가 보안 수준 결정 |

## 테스트 항목

### Auto-Provision
- [ ] `waiaas init --auto-provision` 실행 시 recovery.key 생성 확인 (존재, 내용, 파일 권한 0600)
- [ ] `waiaas init` (플래그 없음) 실행 시 recovery.key 미생성 확인
- [ ] `resolvePassword()`가 recovery.key 존재 시 해당 값 반환 확인
- [ ] `resolvePassword()`가 환경변수 > 패스워드파일 > recovery.key 우선순위 준수 확인
- [ ] `waiaas start`가 recovery.key로 정상 시작 확인
- [ ] `waiaas quickset`이 recovery.key로 월렛+세션 생성 확인
- [ ] Auto-provision 상태에서 Admin UI 인계 배너 표시 확인

### set-master + 패스워드 변경
- [ ] `waiaas set-master` 실행 후 recovery.key 삭제 확인
- [ ] `waiaas set-master` 실행 후 새 패스워드로 데몬 접근 확인
- [ ] `waiaas set-master`에서 새 패스워드 2회 입력 불일치 시 재시도 확인
- [ ] `set-master` 후 Admin UI 인계 배너 미표시 확인
- [ ] recovery.key 없는 상태에서 `set-master` 시 현재 패스워드 프롬프트 확인
- [ ] `PUT /v1/admin/master-password` 현재 패스워드 검증 실패 시 401 확인
- [ ] `PUT /v1/admin/master-password` 성공 후 새 패스워드로 masterAuth 동작 확인
- [ ] `PUT /v1/admin/master-password` 성공 후 이전 패스워드로 masterAuth 실패 확인
- [ ] 패스워드 변경 후 키스토어 재암호화 검증 — 새 패스워드로 복호화 성공 확인
- [ ] 재암호화 중 실패 시 원본 키스토어 파일 무결성 확인 (롤백)
- [ ] 패스워드 변경 후 기존 에이전트 세션 토큰이 정상 동작 확인 (JWT 유지)
- [ ] 새 패스워드 최소 길이(8자) 미달 시 400 에러 확인
- [ ] 현재 패스워드와 동일한 새 패스워드 시 400 에러 확인
- [ ] Admin UI Settings > Security 패스워드 변경 폼 동작 확인
