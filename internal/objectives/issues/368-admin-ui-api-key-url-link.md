# #368 Admin UI 프로바이더 API Key 발급 링크 누락

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **발견일:** 2026-03-16
- **마일스톤:** —
- **상태:** FIXED

## 현상

Admin UI > Protocols 페이지에서 API Key가 필요한 프로바이더(Jupiter Swap, 0x Swap)의 API Key 입력 섹션에 키를 어디서 발급받을 수 있는지 안내 링크가 없음.

사용자가 API Key를 설정하려 할 때 별도로 검색해야 하는 불편함이 있음.

## 기대 동작

API Key 입력 필드 근처에 해당 프로바이더의 API Key 발급 페이지 링크가 표시되어야 함.

- **Jupiter**: https://portal.jup.ag (Jupiter Developer Portal)
- **0x**: https://dashboard.0x.org (0x Dashboard)

## 구현 방안

1. `ActionProviderMetadataSchema` (core)에 `apiKeyUrl: z.string().url().optional()` 필드 추가
2. Jupiter/0x 프로바이더 metadata에 `apiKeyUrl` 설정
3. `BUILTIN_PROVIDER_METADATA` (daemon)에 `apiKeyUrl` 필드 추가
4. `ProviderResponseSchema` (actions route)에 `apiKeyUrl` 필드 추가 및 응답에 포함
5. Admin UI API Key 섹션에 링크 렌더링 (예: "Get API key →" 텍스트 링크)

## 영향 범위

- `packages/core/src/interfaces/action-provider.types.ts` — 스키마
- `packages/actions/src/providers/jupiter-swap/index.ts` — metadata
- `packages/actions/src/providers/zerox-swap/index.ts` — metadata
- `packages/daemon/src/infrastructure/action/builtin-metadata.ts` — 정적 메타데이터
- `packages/daemon/src/api/routes/actions.ts` — API 응답 스키마 + 핸들러
- `packages/admin/src/pages/actions.tsx` — UI 렌더링

## 테스트 항목

- [ ] `apiKeyUrl`이 있는 프로바이더의 API 응답에 URL이 포함되는지 확인
- [ ] `apiKeyUrl`이 없는 프로바이더의 API 응답에서 해당 필드가 생략되는지 확인
- [ ] Admin UI에서 링크가 올바르게 렌더링되고 새 탭으로 열리는지 확인
