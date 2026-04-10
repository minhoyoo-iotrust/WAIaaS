# 496 — Desktop Setup Wizard 지갑 생성 단계 제거 + 환경 기본값 mainnet 전환

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-04-10
- **발견 경위:** v2.14.1-rc.5 설치 후 대시보드에 testnet 지갑 6개 — wizard와 quickset이 각각 지갑 생성하여 중복, 환경이 모두 testnet

## 문제 2가지

### A. Setup Wizard에서 불필요한 지갑 생성

데몬이 이미 띄워진 상태에서 사용자가 `waiaas quickset`으로 지갑을 만들 수 있는데, Setup Wizard가 추가로 지갑을 만들어서 중복 발생. Desktop 사용자에게는 온보딩을 최대한 빠르게 해야 하므로 지갑 생성 단계가 불필요.

### B. 환경 기본값이 testnet

`packages/core/src/schemas/wallet.schema.ts:35`:
```ts
environment: EnvironmentTypeEnum.default('testnet'),
```

`POST /v1/wallets` 에서 `environment`를 생략하면 testnet이 기본값. Desktop 사용자는 개발자가 아닌 일반 사용자일 확률이 높으므로 **mainnet이 기본**이어야 함. CLI `quickset` 은 이미 `mode ?? 'mainnet'`을 사용하지만, API 스키마 자체가 testnet이라 SDK/MCP 등 다른 호출자도 testnet을 받음.

## 수정 방향

### A. Setup Wizard 완전 제거 → 바로 대시보드

recovery.key auto-login으로 인증이 이미 완료된 상태에서 wizard가 추가로 할 일이 없음:
- password step: 제거됨 (이슈 491)
- chain selection + wallet creation: 불필요 (quickset/대시보드에서 관리)
- owner step: 제거됨 (이슈 495)
- complete step: 대시보드로 바로 가면 됨

`app.tsx`에서 `isFirstRun()` 체크를 제거하고 auto-login 성공 시 바로 `Layout`(대시보드)로 이동.

`wizard-store.ts`의 `isFirstRun()` 과 `SETUP_COMPLETE_KEY` localStorage flag는 유지 (향후 재사용 가능성), 하지만 wizard UI 자체는 로드하지 않음.

### B. 환경 기본값 mainnet (타겟 접근)

**API 스키마 default는 testnet 유지** (기존 daemon 테스트 다수가 testnet default에 의존, blast radius 과대).

대신 **Desktop 경로에서만 mainnet이 기본**:
- CLI `waiaas quickset`은 이미 `mode ?? 'mainnet'` 사용 → 영향 없음
- wizard 제거로 testnet 지갑이 자동 생성될 경로 자체가 사라짐
- Admin UI 대시보드의 Create Wallet 폼은 후속 개선으로 Desktop에서 mainnet 선택을 기본화 (이번 스코프 외)

## 테스트 항목

- [ ] Desktop 앱 첫 실행 → Setup Wizard 미표시, 바로 대시보드
- [ ] `POST /v1/wallets` environment 미지정 시 mainnet 지갑 생성
- [ ] `POST /v1/wallets` environment: 'testnet' 명시 시 testnet 지갑 생성 (회귀 없음)
- [ ] CLI `waiaas quickset` 기본 동작 변화 없음 (이미 mainnet)
- [ ] 로컬 Tauri .app 빌드 → 실행 → 바로 대시보드 도달
- [ ] `pnpm vitest run src/__tests__/desktop` 통과

## 관련 이슈

- **491** (password step 제거), **492** (chain/wallet 수정), **495** (owner step 제거) — wizard 축소 흐름의 연장
