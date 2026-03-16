# #362 — 프로토콜 페이지 책임 분리: Providers(운영 설정) vs 프로토콜 페이지(특화 기능)

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-03-16

## 설명

현재 프로토콜별 설정이 Providers 페이지와 개별 프로토콜 페이지에 중복 존재한다. 활성화 토글, 액션별 티어(정책) 설정, API 키 입력은 Providers 페이지에서 통일하고, 프로토콜 상태 조회 및 프로토콜 특화 기능은 해당 프로토콜 전용 페이지에서만 제공하도록 책임을 분리한다.

## 설계 원칙

### Providers 페이지 (운영 설정 — 전 프로바이더 동일 패턴)

- 활성화/비활성화 토글
- 액션별 티어(INSTANT/NOTIFY/DELAY/APPROVAL) 설정
- API 키 입력
- 슬리피지 등 고급 설정

### 개별 프로토콜 페이지 (프로토콜 특화 기능)

- 프로토콜 상태/대시보드 조회
- 프로토콜 고유 기능만 제공
- 운영 설정(활성화/티어/API키)은 제공하지 않음 → Providers 페이지로 유도

## 현재 상태 및 수정 사항

### 영향받는 프로토콜 페이지 (3개)

| 프로토콜 | 현재 중복 설정 | 프로토콜 특화 기능 (유지) |
|----------|---------------|------------------------|
| **Hyperliquid** (`/hyperliquid`) | Enabled 토글 | 포지션 대시보드, 주문 관리, 스팟 잔액, 서브계정 관리 |
| **Polymarket** (`/polymarket`) | Enabled 토글 | 마켓 브라우징, 주문/포지션 대시보드 |
| **Agent Identity** (`/agent-identity`) | Enabled 토글, 액션별 티어 설정 | 에이전트 등록/지갑 연결(WC), Registration File, 평판 조회 |

### 수정 내용

1. **Hyperliquid 페이지**: Enabled 토글 제거 → Providers 페이지에서만 관리
2. **Polymarket 페이지**: Enabled 토글 제거 → Providers 페이지에서만 관리
3. **Agent Identity 페이지**: Enabled 토글 + Registered Actions 티어 설정 제거 → Providers 페이지의 Other 탭에서 관리
4. **비활성 상태 안내**: 프로토콜 페이지에서 비활성 시 "Providers 페이지에서 활성화하세요" 안내 배너 표시

### 전용 페이지가 불필요한 프로토콜

Aave V3, Kamino, Drift, Pendle, Jupiter, 0x, LI.FI, DCent, Lido, Jito, Across 등은 프로토콜 특화 대시보드가 없으므로 Providers 페이지만으로 충분.

## 테스트 항목

- [ ] Hyperliquid 페이지에서 Enabled 토글 미표시 확인
- [ ] Polymarket 페이지에서 Enabled 토글 미표시 확인
- [ ] Agent Identity 페이지에서 Enabled 토글 + 티어 설정 미표시 확인
- [ ] Providers 페이지에서 3개 프로토콜 활성화/비활성화 정상 동작
- [ ] 프로토콜 비활성 시 해당 프로토콜 페이지에서 안내 배너 표시
- [ ] Agent Identity의 Providers > Other 탭에서 티어 설정 정상 동작
