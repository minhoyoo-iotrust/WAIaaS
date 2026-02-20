# 112 — 기본 환경 모드를 testnet → mainnet으로 변경

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** TBD
- **상태:** RESOLVED
- **등록일:** 2026-02-20

## 배경

현재 `waiaas quickset`의 기본 모드가 `testnet`이다. 실제 운영 환경(OpenClaw 봇 등)에서는 메인넷을 사용하므로, 기본값을 `mainnet`으로 변경하여 프로덕션 사용자의 DX를 개선한다. 테스트넷 사용은 `--mode testnet` 명시로 전환한다.

## 수정 범위

### 1. CLI 기본값 변경

| 파일 | 위치 | 현재 | 변경 |
|------|------|------|------|
| `packages/cli/src/index.ts` | L94 | `opts.mode ?? 'testnet'` | `opts.mode ?? 'mainnet'` |
| `packages/cli/src/index.ts` | L113 | `'testnet'` (--mode 기본값) | `'mainnet'` |
| `packages/cli/src/index.ts` | L123 | `'testnet'` (quickstart alias 기본값) | `'mainnet'` |
| `packages/cli/src/commands/quickstart.ts` | L120 | `opts.mode ?? 'testnet'` | `opts.mode ?? 'mainnet'` |

### 2. 스킬 파일 예시 변경

| 파일 | 변경 내용 |
|------|----------|
| `skills/quickstart.skill.md` | 지갑 생성 예시의 `"environment": "testnet"` → `"mainnet"`, 응답 예시 업데이트, `waiaas quickset --mode testnet` → `waiaas quickset` |
| `skills/wallet.skill.md` | 지갑 생성/조회 예시의 environment를 mainnet으로 변경, 네트워크 테이블에 mainnet 예시 추가 |

### 3. 문서 변경

| 파일 | 변경 내용 |
|------|----------|
| `docs/deployment.md` | L332, L344 — 예시 environment를 mainnet으로 변경 |
| `docs/api-reference.md` | L29 — 예시 environment를 mainnet으로 변경 |

### 4. 테스트 변경

| 파일 | 변경 내용 |
|------|----------|
| `packages/cli/src/__tests__/quickstart.test.ts` | 기본 모드 테스트 `'defaults to testnet'` → `'defaults to mainnet'`으로 변경, 관련 assert 업데이트 |

### 변경하지 않는 범위

- `admin.skill.md`의 testnet RPC URL 설정 키 — 이는 설정 가능한 옵션 목록이므로 유지
- `wallet.skill.md`의 네트워크 매핑 테이블 — 테스트넷/메인넷 양쪽 정보 모두 필요
- 테스트 파일의 테스트넷 시나리오 — testnet 모드 동작 검증은 여전히 필요

## 테스트 항목

### 단위 테스트
1. `waiaas quickset` (--mode 생략) 실행 시 mainnet 모드로 동작하는지 확인
2. `waiaas quickset --mode testnet` 명시 시 testnet 모드로 동작하는지 확인
3. `waiaas quickset --mode mainnet` 명시 시 mainnet 모드로 동작하는지 확인
4. 기존 testnet 시나리오 테스트가 `--mode testnet` 명시로 동일하게 통과하는지 확인
