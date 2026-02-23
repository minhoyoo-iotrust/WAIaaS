# 마일스톤 m28-06: ERC-8004 Trustless Agents 지원

- **Status:** PLANNED
- **Milestone:** v28.6

## 목표

ERC-8004 (Trustless Agents) 표준의 3개 온체인 레지스트리(Identity, Reputation, Validation)를 WAIaaS에 통합하여, WAIaaS 관리 지갑이 ERC-8004 에이전트 생태계에서 신뢰 가능한 참여자로 동작할 수 있는 상태.

---

## 배경

### ERC-8004 개요

ERC-8004은 2026년 1월 이더리움 메인넷에 배포된 표준으로, AI 에이전트 간 사전 신뢰 없이 발견·상호작용·평가할 수 있는 최소 신뢰 레이어를 정의한다.

3개 레지스트리로 구성:

| 레지스트리 | 역할 | 컨트랙트 기반 |
|---|---|---|
| **Identity Registry** | ERC-721 기반 에이전트 ID, agentWallet 연결, 등록 파일(서비스 endpoint) | ERC-721 + URIStorage |
| **Reputation Registry** | 에이전트에 대한 피드백/평판 점수 게시·조회 | 커스텀 |
| **Validation Registry** | 독립적 검증 요청/응답 (zkML, TEE, 재실행 등) | 커스텀 |

### WAIaaS와의 정합성

ERC-8004의 핵심 설계 — 에이전트 ID(NFT 소유)와 에이전트 지갑(연결된 주소)의 분리 — 는 WAIaaS의 "사용은 하되 소유는 못한다" 원칙과 정확히 일치한다.

- `setAgentWallet`에 지갑 소유자 서명 필요 → WAIaaS Owner 승인 모델과 매핑
- 등록 파일에 서비스 endpoint 선언 → WAIaaS MCP/REST endpoint 노출 가능
- 신뢰 모델이 위험 비례 계층 구조 → WAIaaS 보안 티어(INSTANT/NOTIFY/DELAY/APPROVAL)와 유사

### 기술적 기반

- WAIaaS는 viem 2.x로 EVM 컨트랙트 호출 지원 (CONTRACT_CALL 트랜잭션 타입)
- Identity Registry는 ERC-721 + URIStorage로 기존 인프라로 상호작용 가능
- Reputation/Validation Registry는 표준 Solidity 인터페이스

---

## 범위

### 포함

1. **Identity Registry 연동**
   - WAIaaS 관리 지갑을 에이전트 ID에 `agentWallet`으로 등록
   - 등록 파일 생성·호스팅 (WAIaaS MCP/REST/SDK endpoint를 서비스 endpoint로 포함)
   - `setAgentWallet` / `unsetAgentWallet` Owner 승인 플로우 연동
   - 에이전트 메타데이터 관리 (`setMetadata` / `getMetadata`)

2. **Reputation Registry 연동**
   - 에이전트 평판 점수 조회 (`getSummary`, `readFeedback`)
   - 정책 엔진에 평판 기반 정책 타입 추가 (예: 평판 임계값 미달 시 APPROVAL 강제)
   - 트랜잭션 완료 후 피드백 게시 (`giveFeedback`) 지원

3. **Validation Registry 연동**
   - 고액 트랜잭션에 대한 온체인 검증 요청 (`validationRequest`)
   - 검증 응답 확인 후 트랜잭션 진행/거부 (`getValidationStatus`)

4. **API/MCP/SDK 확장**
   - REST API: ERC-8004 관련 엔드포인트 추가
   - MCP 서버: ERC-8004 툴 추가
   - TypeScript SDK: ERC-8004 함수 추가
   - Admin UI: 에이전트 ID 등록/관리 화면

### 제외

- ERC-8004 레지스트리 컨트랙트 자체 배포 (기존 메인넷 배포본 사용)
- Validator 노드 운영 (검증 요청자로만 참여)
- Solana 체인 대응 (EVM 전용 표준)

---

## 선행 조건

- m28-00 DeFi 프로토콜 설계 완료 (SHIPPED)
- EVM CONTRACT_CALL 파이프라인 안정화 (v1.4.7에서 구현 완료)
- Owner 승인 플로우 (SIWE) 안정화 (v1.4.1에서 구현 완료)

---

## 성공 기준

1. WAIaaS 관리 지갑이 Identity Registry에 에이전트로 등록되고, 등록 파일에서 서비스 endpoint가 확인됨
2. 외부 에이전트가 등록 파일을 통해 WAIaaS MCP/REST endpoint를 발견하고 상호작용 가능
3. Reputation 점수가 정책 엔진에 입력으로 반영되어, 저평판 에이전트의 트랜잭션이 상위 보안 티어로 분류됨
4. Validation Registry를 통한 고액 트랜잭션 검증 플로우가 동작함
5. Admin UI에서 에이전트 ID 등록·조회·관리가 가능함

---

## 참고 자료

- [ERC-8004: Trustless Agents (EIP)](https://eips.ethereum.org/EIPS/eip-8004)
- [Ethereum Magicians Discussion](https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098)
- [awesome-erc8004](https://github.com/sudeepb02/awesome-erc8004)
