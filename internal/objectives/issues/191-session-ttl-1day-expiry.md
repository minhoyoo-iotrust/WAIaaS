# 191 — 세션 TTL이 1일로 적용되어 에이전트 세션 조기 만료

- **유형:** BUG
- **심각도:** CRITICAL
- **마일스톤:** v28.7

## 현상

quickset으로 생성한 세션이 1~2일 후 `TOKEN_EXPIRED` 에러 발생. 에이전트가 세션 갱신(`PUT /sessions/{id}/renew`)도 불가. JWT 디코딩 결과 `exp - iat = 86400` (정확히 1일).

## 근본 원인 분석

### 1. quickset 필드명 불일치

quickset이 `POST /v1/sessions`에 `expiresIn: 86400`을 보내지만, `CreateSessionRequestSchema`는 `ttl` 필드를 기대:

```typescript
// packages/cli/src/commands/quickstart.ts:56
const expiresIn = opts.expiresIn ?? 86400;  // ← 하드코딩 1일

// packages/cli/src/commands/quickstart.ts:185-188
body: JSON.stringify({
  walletIds,
  expiresIn,  // ← "expiresIn" 전송 — API는 "ttl" 기대
}),
```

```typescript
// packages/core/src/schemas/session.schema.ts:21
ttl: z.number().int().min(300).max(604800).optional()  // ← "ttl" 기대
```

Zod가 `expiresIn`을 strip하므로 `parsed.ttl`은 undefined → `deps.config.security.session_ttl` 폴백. 그러나 실제 JWT에 86400이 적용되고 있으므로, config 값이 86400이거나 다른 경로로 expiresIn이 적용되는 것으로 추정.

### 2. CreateSessionRequestSchema max 제한 (7일)

```typescript
ttl: z.number().int().min(300).max(604800).optional()  // 최대 7일
```

config 기본값 2,592,000 (30일)을 API에서 ttl로 전달하면 스키마 검증 실패 (`max(604800)`). 스키마 max와 config 기본값이 불일치.

### 3. config 기본값과 스키마 주석 불일치

```typescript
// config/loader.ts — 데몬 config 기본값
session_ttl: z.number().default(2592000)  // 30일

// session.schema.ts — 주석
ttl: ... // defaults to config security.session_ttl (86400) ← 오래된 주석
```

## 수정 방안

### A. quickset 필드명 수정 + 기본값 연장

```typescript
// quickstart.ts
const ttl = opts.expiresIn ?? 2592000;  // 30일 (config 기본값과 동일)
body: JSON.stringify({ walletIds, ttl })  // ← "ttl"로 변경
```

### B. CreateSessionRequestSchema max 상향

```typescript
ttl: z.number().int().min(300).max(31536000).optional()  // 최대 1년 (config max와 동일)
```

### C. 주석 수정

```typescript
ttl: ... // defaults to config security.session_ttl (2592000 = 30 days)
```

## 영향 범위

- `packages/cli/src/commands/quickstart.ts` — `expiresIn` → `ttl`, 기본값 변경
- `packages/core/src/schemas/session.schema.ts` — max 상향 + 주석 수정
- `packages/daemon/src/api/routes/openapi-schemas.ts` — OpenAPI 설명 갱신

## 테스트 항목

- [ ] quickset 생성 세션의 JWT `exp - iat`가 2,592,000 (30일)인지 확인
- [ ] `POST /v1/sessions`에 `ttl: 2592000` 전달 시 스키마 검증 통과 확인
- [ ] `POST /v1/sessions` ttl 미지정 시 config 기본값(2,592,000) 적용 확인
- [ ] Admin UI 세션 생성 시 기본 TTL 30일 확인
- [ ] 세션 갱신(`PUT /sessions/{id}/renew`) 후 TTL 30일 재적용 확인
