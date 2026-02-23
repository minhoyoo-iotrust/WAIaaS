# 161 — connect-info 프롬프트가 에이전트 읽기 가능 엔드포인트를 차단/누락

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v28.2
- **상태:** OPEN
- **발견일:** 2026-02-23

## 증상

에이전트가 `GET /v1/policies`로 정책을 조회할 수 있음에도 불구하고,
connect-info 프롬프트의 "policy CRUD" 문구 때문에 접근 불가로 판단하여 조회를 시도하지 않음.

## 원인

`connect-info.ts:106`의 보안 경계 안내 문구:

```
Do not attempt to call admin-only endpoints (/v1/admin/*, POST /v1/wallets, POST /v1/sessions, policy CRUD).
```

"policy CRUD"로 뭉뚱그려 적어서 읽기 전용 GET까지 차단으로 오해.

## 실제 dual-auth 엔드포인트 (sessionAuth 읽기 허용)

| 엔드포인트 | sessionAuth | 프롬프트 안내 상태 |
|-----------|:-----------:|:------------------:|
| `GET /v1/policies` | 허용 (읽기 전용) | "policy CRUD" 차단으로 오해 |
| `GET /v1/tokens` | 허용 (읽기 전용) | 언급 없음 |
| `GET /v1/tokens/resolve` | 허용 (읽기 전용) | 언급 없음 |

## 영향 범위

- **파일:** `packages/daemon/src/api/routes/connect-info.ts` (`buildConnectInfoPrompt()`)
- `buildConnectInfoPrompt()`는 공유 함수로 아래 두 곳에서 사용:
  - `GET /v1/connect-info` — 에이전트 자기 발견 (connect-info.ts:258)
  - Admin 대시보드 매직워드 생성 — 에이전트 프롬프트 (admin.ts:42에서 import)
- **한 곳 수정으로 양쪽 모두 반영됨**

## 수정 방안

`buildConnectInfoPrompt()` 내 프롬프트 텍스트 수정:

1. 보안 경계 문구 변경:
   - Before: `"policy CRUD"`
   - After: `"policy management (POST/PUT/DELETE /v1/policies)"`

2. 사용 가능 엔드포인트 목록에 읽기 전용 엔드포인트 추가:
   - `GET /v1/policies` — 현재 지갑에 적용된 정책 조회 (글로벌 정책 포함)
   - `GET /v1/tokens?network=<network>` — 토큰 레지스트리 조회
   - `GET /v1/tokens/resolve?network=<network>&address=<address>` — ERC-20 토큰 메타데이터 온체인 조회

3. 스킬 파일(`skills/transactions.skill.md`, `skills/policies.skill.md`)도 동일하게 권한 구분 반영

## 테스트 항목

- [ ] 프롬프트에 `GET /v1/policies` 사용 가능 안내 포함 확인
- [ ] 프롬프트에 `GET /v1/tokens` 사용 가능 안내 포함 확인
- [ ] 보안 경계에서 POST/PUT/DELETE /v1/policies만 차단으로 명시 확인
- [ ] Admin 매직워드 생성 프롬프트에도 동일 내용 반영 확인
- [ ] 에이전트가 sessionAuth로 `GET /v1/policies` 호출 시 정상 응답 확인
