# #282 네트워크 설정 키 완전성 자동 검증 테스트 추가

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **마일스톤:** v31.7
- **상태:** RESOLVED

## 배경

네트워크 추가 시 필수 설정 키가 빠져서 런타임 에러가 발생하는 패턴이 반복됨:
- #167: EVM RPC 키 중복 구성
- #193: EVM WSS URL 키 누락
- #216: Solana WSS URL 키 프리픽스 누락
- #280: HyperEVM RPC 설정 키 누락
- #281: HyperEVM incoming.wss_url 설정 키 누락

기존 CFG-02 테스트(`config-loader.test.ts`)가 **하드코딩 리스트**로 검증하고 있어, 네트워크를 추가해도 테스트를 같이 수정하지 않으면 통과됨. `NETWORK_TYPES` SSoT 기반 동적 검증 필요.

## 구현 방안

`network-setting-keys-completeness.test.ts` 신규 파일 생성.

`NETWORK_TYPES`(chain.ts)를 SSoT로, 모든 네트워크에 대해 3가지 설정 키 카테고리 존재 여부를 동적 검증:

1. **`rpc.*`**: 모든 네트워크의 `rpc.{rpcConfigKey(chain, network)}` 키 존재 확인
2. **`rpc_pool.*`**: 모든 네트워크의 `rpc_pool.{network}` 키 존재 확인
3. **`incoming.wss_url.*`**: 모든 네트워크의 `incoming.wss_url.{network}` 키 존재 확인
4. **`BUILT_IN_RPC_DEFAULTS`**: 모든 네트워크의 빌트인 RPC 기본값 등록 확인
5. **총 수 cross-check**: 각 카테고리 키 수 = `NETWORK_TYPES.length` 일치 확인

### 핵심 설계

- `NETWORK_TYPES`에서 네트워크를 `it.each`로 순회하여 동적 검증
- 네트워크 추가 시 `NETWORK_TYPES`만 갱신하면 테스트가 자동으로 누락 키를 감지
- 기존 CFG-02 하드코딩 테스트는 이 테스트로 대체 가능 (또는 병행 유지)

### 소스 의존성

- `NETWORK_TYPES`, `SOLANA_NETWORK_TYPES`, `EVM_NETWORK_TYPES` from `@waiaas/core`
- `BUILT_IN_RPC_DEFAULTS` from `@waiaas/core`
- `SETTING_DEFINITIONS` from `setting-keys.ts`
- `rpcConfigKey` from `adapter-pool.ts`

## 테스트 항목

- [x] `NETWORK_TYPES`의 모든 15개 네트워크에 대해 `rpc.*` 키 존재 확인
- [x] `NETWORK_TYPES`의 모든 15개 네트워크에 대해 `rpc_pool.*` 키 존재 확인
- [x] `NETWORK_TYPES`의 모든 15개 네트워크에 대해 `incoming.wss_url.*` 키 존재 확인
- [x] `BUILT_IN_RPC_DEFAULTS`에 모든 네트워크 등록 확인
- [x] 카테고리별 키 총 수 = `NETWORK_TYPES.length` cross-check
- [x] 기존 CFG-02 테스트와 중복/대체 관계 정리
