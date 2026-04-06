---
phase: 06-core-architecture-design
plan: 02
subsystem: security, keystore
tags: [aes-256-gcm, argon2id, sodium-native, keystore, ed25519, secp256k1, guarded-memory]

requires:
  - phase: 06-01
    provides: 데이터 디렉토리 구조 (keystore/ 경로), agents 테이블 스키마, TOML 설정 [keystore] 섹션
  - phase: v0.1 (03-system-architecture)
    provides: ARCH-01 Dual Key 아키텍처 (Owner/Agent 키 역할 분리)
provides:
  - WAIaaS Keystore v1 JSON 파일 포맷 (바이트 수준 필드 정의)
  - AES-256-GCM 암호화/복호화 step-by-step 프로토콜
  - Argon2id 키 파생 프로토콜 (m=64MiB, t=3, p=4)
  - sodium-native guarded memory 수명주기 프로토콜
  - ILocalKeyStore 인터페이스 (9개 메서드 시그니처)
  - 체인별 키 생성 프로토콜 (Solana Ed25519, EVM secp256k1)
  - 키스토어 백업/복원/내보내기/가져오기 절차
  - 보안 위협 모델 + 방어 매핑
affects: [06-03 (ChainAdapter에서 sign 메서드 연동), 06-04 (데몬 라이프사이클의 unlock/lock 호출 시점), Phase 7 (세션 인증과 키스토어 잠금 해제 연동), Phase 8 (Kill Switch 시 lock() 호출)]

tech-stack:
  added: [argon2, sodium-native, bs58]
  patterns: [WAIaaS Keystore v1, Argon2id KDF, AES-256-GCM AEAD, sodium guarded memory lifecycle, password 3-path resolution]

key-files:
  created:
    - .planning/deliverables/26-keystore-spec.md
  modified: []

key-decisions:
  - "Argon2id용 argon2 npm 선택 (sodium-native crypto_pwhash 대신 -- 비동기 이벤트 루프 비차단)"
  - "Solana 개인키 64바이트 전체 저장 (seed 32B + pubkey 32B -- @solana/kit, sodium-native 호환)"
  - "EVM 개인키는 viem generatePrivateKey()로 생성 후 sodium_malloc에 복사"
  - "내보내기 파일은 원본과 동일한 WAIaaS Keystore v1 포맷 (별도 패스워드로 재암호화)"
  - "키 손실 시 복구 불가 -- Owner 온체인 자산 회수가 복구 경로"

patterns-established:
  - "키 자료는 sodium_malloc 전용 -- 일반 Buffer/변수 저장 금지"
  - "복호화 -> 보호 버퍼 복사 -> 원본 제로화를 단일 동기 흐름으로 수행 (await 없음)"
  - "매 암호화마다 crypto.randomBytes(12) 새 nonce + crypto.randomBytes(16) 새 salt"
  - "패스워드 해석: 환경변수 > 파일 > 대화형 stdin"
  - "에이전트 키 생성 시 DB INSERT(CREATING) -> 키 생성 -> 암호화 -> DB UPDATE(ACTIVE) 순서 + 롤백"

duration: 8min
completed: 2026-02-05
---

# Phase 6 Plan 2: 암호화 키스토어 스펙 설계 Summary

**AES-256-GCM + Argon2id 키스토어 파일 포맷, sodium-native guarded memory 수명주기, ILocalKeyStore 인터페이스, 백업/복원/내보내기 프로토콜 전체 설계**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-05T08:46:34Z
- **Completed:** 2026-02-05T08:54:27Z
- **Tasks:** 2
- **Files created:** 1

## Accomplishments

- Ethereum Keystore V3를 AES-256-GCM + Argon2id로 확장한 WAIaaS Keystore v1 파일 포맷을 바이트 수준으로 설계 (모든 필드의 타입/크기/인코딩/생성방법 테이블)
- AES-256-GCM 암호화/복호화를 6단계 step-by-step으로 정의. nonce 재사용 방지(C-01)를 구조적으로 보장
- Argon2id 키 파생 프로토콜을 입력/출력/파라미터 모두 명시. `argon2` npm 비동기 라이브러리 선택 (이벤트 루프 비차단)
- Solana Ed25519 + EVM secp256k1 키 생성 프로토콜을 바이트 규격 + 코드 패턴까지 정의
- sodium-native guarded memory 수명주기를 6상태 상태 다이어그램으로 정의 (Allocated -> Locked -> Writable -> Loaded -> Zeroed)
- ILocalKeyStore 인터페이스 9개 메서드의 시그니처/에러/sodium 호출 순서를 문서화
- 백업(tar.gz)/복원(+DB 동기화)/내보내기(별도 패스워드)/가져오기(재암호화) 4가지 절차를 CLI 커맨드까지 연결하여 정의
- 7가지 위협 시나리오에 대한 방어 매핑 테이블 + C-01, C-02, C-03 피트폴 대응 전략 종합

## Task Commits

Each task was committed atomically:

1. **Task 1: 키스토어 파일 포맷 + 키 파생 프로토콜 설계** - `9455308` (docs)
2. **Task 2: sodium-native 메모리 안전성 프로토콜 + 백업/복원 설계** - `c62e9d1` (docs)

## Files Created/Modified

- `.planning/deliverables/26-keystore-spec.md` - CORE-03: 키스토어 파일 포맷(섹션 1), 키 파생(섹션 2), AES-256-GCM 프로토콜(섹션 3), 에이전트 키 생성(섹션 4), sodium-native 메모리(섹션 5), 백업/복원(섹션 6), 보안 고려사항(섹션 7)

## Decisions Made

1. **argon2 npm vs sodium-native crypto_pwhash:** `argon2` npm 선택. sodium-native의 crypto_pwhash는 동기 API만 제공하여 64MiB + 3회 반복 시 ~1-3초 이벤트 루프 차단. argon2 npm은 자체 스레드풀로 비동기 수행
2. **Solana 개인키 64바이트 저장:** Solana Ed25519 "비밀키"는 seed(32B) + publicKey(32B) = 64B. @solana/kit과 sodium-native 모두 이 형식을 사용하므로 64B 전체 저장
3. **EVM 키 생성은 viem:** `viem/accounts`의 `generatePrivateKey()` + `privateKeyToAccount()` 사용. 생성 후 즉시 sodium_malloc에 복사
4. **내보내기 포맷 = 원본 포맷:** WAIaaS Keystore v1 동일 포맷. 별도 패스워드/salt/nonce로 재암호화. 다른 WAIaaS 인스턴스에서 바로 importKeyFile() 가능
5. **키 손실 시 복구 불가:** 의도적 설계. 복구 메커니즘은 공격 표면. Owner가 온체인에서 자산 직접 회수가 복구 경로

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 06-03 (ChainAdapter): ILocalKeyStore.sign() 인터페이스와 ChainAdapter가 어떻게 연동하는지 명확. Solana/EVM 키 규격 확정
- 06-04 (데몬 라이프사이클): unlock()/lock() 호출 시점이 데몬 시작/종료 흐름에 매핑. graceful shutdown 시 lock() 호출 필수
- Phase 7 (세션 프로토콜): 세션 토큰 검증 -> sign() 호출 경로 명확
- Phase 8 (보안 계층): Kill Switch 발동 시 lock() 호출로 즉시 키 제로화
- 차단 요소 없음

---
*Phase: 06-core-architecture-design*
*Completed: 2026-02-05*
