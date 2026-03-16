# #367 — mainnet-06 NFT 전송 시나리오 L2 체인 전환

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** —
- **상태:** FIXED

## 설명

mainnet-06 NFT 전송 시나리오가 현재 `ethereum-mainnet`을 대상으로 하고 있어 가스비가 ~$2.00으로 높다. 가스비가 저렴한 L2 체인(Base, Arbitrum 등)으로 변경하여 UAT 실행 비용을 절감한다.

## 현재 상태

- **시나리오 파일:** `agent-uat/mainnet/nft-transfer.md`
- **현재 네트워크:** `ethereum-mainnet`
- **예상 가스비:** ERC-721 ~$2.00, ERC-1155 ~$2.50
- **UAT 결과:** 2026-03-16 메인넷 UAT에서 SKIP (테스트 지갑에 NFT 미보유)

## 변경 사항

1. `nft-transfer.md`의 `network` 필드를 `base-mainnet` 또는 `arbitrum-mainnet`으로 변경
2. 예상 가스비를 L2 기준으로 업데이트 (~$0.01-0.05)
3. Prerequisites의 최소 ETH 잔액을 L2 기준으로 하향 조정
4. Troubleshooting 가스 가격 참조 URL을 L2 익스플로러로 변경
5. `_index.md`의 mainnet-06 Network 컬럼 업데이트

## 권장 네트워크

- **Base**: 가스비 최저 (~$0.001-0.01), EVM 지갑 동일 주소 사용 가능
- **Arbitrum**: 가스비 저렴 (~$0.01), 생태계 성숙

## 테스트 항목

- [ ] L2 네트워크에서 NFT 목록 조회 API 정상 동작 확인
- [ ] L2 NFT 자기 전송 simulate 성공 및 가스비 확인
- [ ] L2 NFT 자기 전송 실행 및 CONFIRMED 상태 전환 확인
- [ ] 자기 전송 후 NFT 소유권 유지 확인
- [ ] `_index.md` 네트워크 인덱스 정합성 확인
