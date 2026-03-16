# 365 — sign-message 실제 서명 검증 UAT 시나리오 추가

- **유형:** MISSING
- **심각도:** LOW
- **상태:** FIXED
- **발견일:** 2026-03-16

## 현상

sign-message 기능에 실제 키로 서명 → 온체인/DApp 검증하는 UAT 시나리오가 없음. 단위/E2E로 커버할 수 없는 실제 서명값 유효성 검증 부재.

## 수정 방안

agent-uat/advanced/ 에 sign-message UAT 시나리오 추가:

### 시나리오 스텝
1. personal_sign: 메시지 서명 → ecrecover로 서명자 주소 검증
2. EIP-712 typedData: Uniswap Permit 구조 서명 → 서명 유효성 확인
3. hex 메시지: 0x 프리픽스 hex 데이터 서명 → 서명 검증
4. Solana 메시지 서명 (해당 시): ed25519 서명 검증

### 검증 방법
- EVM: viem의 verifyMessage/verifyTypedData로 서명자 주소 매칭 확인
- Solana: @solana/web3.js의 nacl.sign.detached.verify

## 대상 파일

- `agent-uat/advanced/sign-message.md` — 신규 시나리오 파일

## 테스트 항목

- personal_sign 서명값이 지갑 주소와 매칭되는지 확인
- EIP-712 typedData 서명값이 유효한지 확인
- 서명된 메시지를 제3자 도구로 검증 가능한지 확인
