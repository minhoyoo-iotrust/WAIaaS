# 104 — MCP 서버에서 AI 에이전트에게 업데이트 가능 알림 제공

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v2.6
- **상태:** FIXED
- **등록일:** 2026-02-19

## 현상

MCP 서버의 `waiaas://system/status` 리소스(`system-status.ts`)는 `GET /v1/admin/status`만 조회하여 `latestVersion`과 `updateAvailable` 정보를 AI 에이전트에게 전달하지 않는다. AI 에이전트는 데몬에 새 버전이 출시되었다는 사실을 인지할 방법이 없다.

WAIaaS는 AI 에이전트용 Wallet-as-a-Service이므로, 에이전트가 사용하는 MCP 인터페이스에서도 업데이트 정보를 접근할 수 있어야 한다.

## 수정 범위

### 1. `waiaas://system/status` 리소스에 버전 체크 정보 추가

system-status 리소스가 `/health` 엔드포인트도 함께 조회하거나, `/v1/admin/status` 응답에 버전 정보가 포함되도록 하여 리소스 응답에 다음 필드를 추가한다:

- `latestVersion: string | null`
- `updateAvailable: boolean`

### 2. MCP Notification (선택)

MCP 프로토콜의 `notifications/resources/updated` 메커니즘을 활용하여, 데몬이 새 버전을 감지했을 때 `waiaas://system/status` 리소스 변경 알림을 MCP 클라이언트에 푸시할 수 있다. 이를 통해 에이전트가 폴링 없이도 업데이트 사실을 인지할 수 있다.

### 영향 범위

- `packages/mcp/src/resources/system-status.ts` — 버전 체크 데이터 추가
- `packages/mcp/src/api-client.ts` — `/health` 호출 메서드 추가 (필요 시)
- Issue #103 방안 B 채택 시 별도 API 호출 불필요 (admin/status에 포함)

## 테스트 항목

### 단위 테스트
1. system-status 리소스 응답에 `latestVersion`, `updateAvailable` 필드가 포함되는지 확인
2. `updateAvailable === true`일 때 올바른 최신 버전이 표시되는지 확인
3. 버전 체크 미실행 시 `latestVersion === null`, `updateAvailable === false`인지 확인
