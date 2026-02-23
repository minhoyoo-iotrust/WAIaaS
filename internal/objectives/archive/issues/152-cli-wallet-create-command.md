# #152 — CLI에서 지갑 생성 명령어 추가 — `waiaas wallet create`

- **Type:** ENHANCEMENT
- **Severity:** MEDIUM
- **Found in:** v27.3
- **Status:** FIXED

## 현상

지갑을 생성하려면 `quickset`(지갑+세션+MCP 일괄)을 사용하거나 `curl`로 `POST /v1/wallets`를 직접 호출해야 한다. 지갑만 단독 생성하는 CLI 명령어가 없어 세밀한 제어가 불가능하다.

## 기대 동작

```
waiaas wallet create                          # 대화형: 체인/모드 선택
waiaas wallet create --chain solana           # Solana 1개 (기본 mainnet)
waiaas wallet create --chain ethereum --mode testnet  # EVM testnet 1개
waiaas wallet create --all                    # 전체 체인 mainnet
waiaas wallet create --all --mode testnet     # 전체 체인 testnet
```

- `--chain <chain>`: solana 또는 ethereum (단일 지갑 생성)
- `--all`: 지원하는 전체 체인 일괄 생성 (현재 Solana + EVM)
- `--mode <mode>`: mainnet(기본) 또는 testnet
- `--name <name>`: 지갑 이름 (생략 시 `{chain}-{mode}` 패턴, `--all`일 때 무시)
- `--password <pw>`: 마스터 패스워드 (생략 시 프롬프트 입력)
- `--chain`과 `--all`이 동시에 지정되면 에러
- 409(이미 존재) 시 기존 지갑 재사용 + 안내 메시지 (quickset 멱등성 패턴과 동일)

### 출력

생성된 각 지갑의 ID, 이름, 주소, 환경, 기본 네트워크, 사용 가능 네트워크 목록 표시.

### 엣지 케이스

- `--chain`도 `--all`도 없으면: 대화형으로 체인 선택 또는 에러 메시지
- 데몬 미실행: "Daemon is not running. Start it with `waiaas start`." 에러
- 잘못된 `--chain` 값: "Unsupported chain. Use 'solana' or 'ethereum'." 에러

## 수정 범위

- `packages/cli/src/commands/wallet.ts` — `walletCreateCommand` 함수 추가
- `packages/cli/src/index.ts` — `wallet create` 서브커맨드 등록, 상단 주석 업데이트

## 테스트 항목

1. `--chain solana` 단일 Solana 지갑 생성 확인
2. `--chain ethereum --mode testnet` EVM testnet 지갑 생성 확인
3. `--all` 전체 체인 일괄 생성 확인
4. `--name` 커스텀 이름 반영 확인
5. 이미 존재하는 지갑(409) 재사용 + 안내 메시지 확인
6. `--chain`과 `--all` 동시 지정 시 에러 확인
7. 데몬 미실행 시 에러 메시지 확인
