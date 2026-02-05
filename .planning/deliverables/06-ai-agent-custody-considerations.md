# AI 에이전트 특화 커스터디 고려사항 (CUST-02)

**작성일:** 2026-02-04
**문서 ID:** CUST-02
**상태:** 완료
**참조:** 02-CONTEXT.md, 02-RESEARCH.md

---

## 1. 개요

### 1.1 기존 WaaS의 가정

전통적인 WaaS(Wallet-as-a-Service)는 다음과 같은 사용자 모델을 전제로 설계되었다:

| 가정 | 설명 |
|------|------|
| **사람 사용자** | 최종 사용자가 사람이며, 직관적인 UX가 중요 |
| **UI 상호작용** | 웹/모바일 인터페이스를 통한 시각적 확인 |
| **수동 승인** | 각 트랜잭션에 대해 사용자가 직접 "승인" 버튼 클릭 |
| **세션 기반 접근** | 로그인 후 일정 시간 동안만 키 접근 허용 |
| **1인 1지갑** | 한 사람이 소수의 지갑을 관리 |
| **간헐적 사용** | 필요할 때만 지갑 접근, 상시 접근 불필요 |

### 1.2 AI 에이전트의 특성

AI 에이전트 지갑은 근본적으로 다른 사용 패턴을 보인다:

| 특성 | 설명 |
|------|------|
| **API 기반** | 프로그래매틱 접근, UI 없음 |
| **자율적 의사결정** | 사람 개입 없이 트랜잭션 결정 및 실행 |
| **24/7 상시 운영** | 중단 없는 연속 운영 |
| **고빈도 트랜잭션** | 초당 수십~수백 건의 트랜잭션 가능 |
| **정책 기반 제어** | 사전 정의된 규칙 내에서 자율 행동 |
| **다중 에이전트** | 한 소유자가 다수의 에이전트 지갑 운영 가능 |

### 1.3 핵심 과제: 자율성 vs 통제권

AI 에이전트 지갑의 근본적 딜레마:

```
┌─────────────────────────────────────────────────────────────┐
│                    핵심 균형 과제                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   자율적 운영 ◄────────────────────────► 소유자 통제권     │
│                                                             │
│   - 빠른 의사결정           vs    - 승인 없는 자금 이동 방지 │
│   - 24/7 무중단 운영        vs    - 이상 행동 즉시 중단     │
│   - 자동화된 수익 창출      vs    - 손실 한도 제한          │
│   - DeFi 상호작용 자율성    vs    - 허용된 프로토콜만 접근  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**해결 방향:**
- 정책 기반 자율성 부여 (Policy-Governed Autonomy)
- Dual Key 아키텍처로 권한 분리
- 온체인 정책 강제로 우회 방지
- 에스컬레이션 매커니즘으로 고위험 거래 승인

---

## 2. 일반 사용자 vs AI 에이전트 비교 분석

### 2.1 시나리오별 상세 비교

| 시나리오 | 일반 사용자 | AI 에이전트 |
|----------|-------------|-------------|
| **트랜잭션 승인 방식** | UI에서 "확인" 버튼 클릭, 2FA/생체인증 | 정책 엔진 자동 검증, 정책 범위 내 자동 승인 |
| **키 접근 패턴** | 필요 시 잠금 해제, 세션 만료 후 재인증 | 상시 접근 필요 (TEE 내 상주) |
| **복구 절차** | 시드 문구 수동 입력, 고객 지원 요청 | 자동화된 키 교체, Owner 단독 복구 가능 |
| **한도 관리** | 자기 결정, 필요시 해제 가능 | 정책 엔진 강제, Owner만 변경 가능 |
| **장애 대응** | 본인이 문제 인지 및 조치 | Owner가 원격으로 즉시 중지 |
| **인증 방식** | 비밀번호 + 2FA + 생체인증 | API Key + TEE Attestation |

### 2.2 트랜잭션 승인 방식 심층 비교

**일반 사용자:**
```
사용자 → UI 화면 확인 → 금액/수신자 검토 → 비밀번호 입력 → 2FA 코드 → 승인
                          (수 초 ~ 수 분)
```

**AI 에이전트:**
```
에이전트 의사결정 → 정책 검증 → 자동 서명 → 트랜잭션 제출
                      (수 밀리초)
```

### 2.3 키 접근 패턴 심층 비교

**일반 사용자:**
- 로그인 시에만 키 복호화
- 세션 타임아웃 (15분 ~ 1시간)
- 백그라운드에서 키 접근 불가
- 수동 "서명" 동작 필요

**AI 에이전트:**
- TEE 메모리에 키 상시 보관
- 타임아웃 없음 (정책 기반 제어)
- 24/7 백그라운드 서명 가능
- 프로그래매틱 서명 자동화

### 2.4 장애 대응 심층 비교

| 장애 유형 | 일반 사용자 대응 | AI 에이전트 대응 |
|----------|-----------------|-----------------|
| 지갑 앱 크래시 | 앱 재시작, 재로그인 | 자동 재시작, 상태 복구 |
| 키 침해 의심 | 고객센터 연락, 자산 이동 | Owner가 원격으로 즉시 동결 |
| 잘못된 트랜잭션 | 취소 요청 (보통 불가) | 정책 위반 시 사전 차단 |
| 서비스 장애 | 복구 대기 | 다중 가용 영역 자동 전환 |

---

## 3. 자율적 트랜잭션 시나리오

### 3.1 기본 가정

AI 에이전트 지갑은 **사람 승인 없이 AI가 직접 서명/제출**하는 것을 기본으로 가정한다.

```
┌───────────────────────────────────────────────────────────────┐
│                  자율적 트랜잭션 흐름                          │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  AI 의사결정 → 트랜잭션 구성 → 정책 검증 → TEE 서명 → 제출   │
│      ↓              ↓             ↓           ↓         ↓    │
│  (자율 판단)   (파라미터)    (한도/화이트)  (Agent Key)  (RPC) │
│                                                               │
│  ※ 전 과정에서 사람 개입 없음                                 │
└───────────────────────────────────────────────────────────────┘
```

### 3.2 트랜잭션 유형별 자율성 수준

| 트랜잭션 유형 | 자율성 수준 | 설명 |
|--------------|------------|------|
| **소액 송금** | 완전 자율 | perTransaction 한도 이하, 화이트리스트 주소 |
| **고액 송금** | Owner 승인 필요 | thresholdAmount 초과 시 에스컬레이션 |
| **DeFi 상호작용** | 화이트리스트 기반 자율 | 허용된 프로그램 ID만 호출 가능 |
| **새로운 주소 전송** | 승인 필요 | 화이트리스트에 없는 수신자 |
| **토큰 스왑** | 조건부 자율 | 허용된 토큰 쌍, 슬리피지 한도 내 |
| **스테이킹** | 자율 | 사전 승인된 검증자 풀 |
| **언스테이킹** | Owner 승인 필요 | 자금 유동화는 고위험으로 분류 |

### 3.3 시나리오 예시

#### 시나리오 1: DeFi 수익 재투자

```
상황: 에이전트가 Kamino에서 수익 0.5 SOL 발생 확인
목표: 수익을 자동으로 재투자

흐름:
1. 에이전트가 수익 확인 (Kamino → Agent Wallet)
2. 정책 검증:
   - 금액: 0.5 SOL < perTransaction 1 SOL ✓
   - 프로그램: Kamino ∈ whitelist.programs ✓
   - 시간: UTC 14:00 ∈ allowedHours [9,18] ✓
3. 재투자 트랜잭션 자동 서명 (Agent Key)
4. 제출 및 확인

결과: Owner 개입 없이 수익 재투자 완료
```

#### 시나리오 2: 정기 지불 (Subscription)

```
상황: 매월 1일 서비스 비용 50 USDC 지불
목표: 자동 정기 결제 실행

흐름:
1. 스케줄러가 매월 1일 트리거
2. 정책 검증:
   - 금액: 50 USDC < dailyTotal ✓
   - 수신자: ServiceProvider ∈ whitelist.addresses ✓
   - 토큰: USDC ∈ whitelist.tokens ✓
3. 자동 서명 및 제출

결과: 정기 결제 자동화
```

#### 시나리오 3: 자동 리밸런싱

```
상황: 포트폴리오가 목표 비율에서 벗어남
목표: SOL 60% / USDC 40% 비율로 리밸런싱

흐름:
1. 에이전트가 현재 비율 분석 (SOL 75%, USDC 25%)
2. 리밸런싱 필요량 계산 (SOL 15% → USDC)
3. 정책 검증:
   - 스왑 금액: 한도 내 ✓
   - DEX: Jupiter ∈ whitelist.programs ✓
   - 슬리피지: 0.5% < maxSlippage 1% ✓
4. 스왑 트랜잭션 자동 실행

결과: 포트폴리오 자동 리밸런싱
```

#### 시나리오 4: 긴급 자금 회수 (Owner 개입)

```
상황: 에이전트 이상 행동 감지 (비정상적 트랜잭션 패턴)
목표: 즉시 에이전트 중지 및 자금 회수

흐름:
1. 모니터링 시스템이 이상 탐지
2. Owner에게 알림 발송
3. Owner가 긴급 중지 명령 실행 (Owner Key 필요)
4. Agent Key 권한 즉시 해제
5. 자금을 안전 주소로 이동

결과: 추가 피해 없이 자금 보호
```

---

## 4. 자율성 제한 복합 정책 설계

02-CONTEXT.md 결정: "금액 한도 + 화이트리스트 + 시간 제어 등 복합 정책으로 제한"

### 4.1 정책 구조 개요

```typescript
interface AgentPolicy {
  // 정책 식별 정보
  policyId: string;
  agentId: string;
  createdBy: PublicKey;  // Owner
  createdAt: Date;
  updatedAt: Date;
  version: number;

  // 정책 구성 요소
  limits: AmountLimits;
  whitelist: WhitelistPolicy;
  timeControls: TimeControlPolicy;
  escalation: EscalationPolicy;

  // 메타데이터
  enabled: boolean;
  description: string;
}
```

### 4.2 금액 한도 정책 (Amount Limits)

```typescript
interface AmountLimits {
  // 단일 트랜잭션 최대 금액
  perTransaction: {
    amount: bigint;          // 예: 1_000_000_000n (1 SOL)
    currency: 'SOL' | 'USDC' | 'USD_VALUE';
  };

  // 일일 총 한도
  dailyTotal: {
    amount: bigint;          // 예: 10_000_000_000n (10 SOL)
    currency: 'SOL' | 'USDC' | 'USD_VALUE';
    resetHourUtc: number;    // 일일 리셋 시각 (0-23)
  };

  // 주간 총 한도
  weeklyTotal: {
    amount: bigint;          // 예: 50_000_000_000n (50 SOL)
    currency: 'SOL' | 'USDC' | 'USD_VALUE';
    resetDayOfWeek: number;  // 주간 리셋 요일 (0=일요일)
  };

  // 월간 총 한도 (선택)
  monthlyTotal?: {
    amount: bigint;
    currency: 'SOL' | 'USDC' | 'USD_VALUE';
  };
}
```

**설계 근거:**
- `perTransaction`: 단일 오류/침해로 인한 최대 손실 제한
- `dailyTotal`: 지속적인 소액 탈취 방지
- `weeklyTotal`: 장기적 리스크 관리
- `USD_VALUE`: 변동성 자산의 실질 가치 기준 한도

### 4.3 화이트리스트 정책 (Whitelist Policy)

```typescript
interface WhitelistPolicy {
  // 허용된 수신 주소
  addresses: {
    list: PublicKey[];
    description: Map<PublicKey, string>;  // 주소별 설명
    addedAt: Map<PublicKey, Date>;
  };

  // 허용된 프로그램 ID (DeFi 프로토콜)
  programs: {
    list: PublicKey[];
    metadata: Map<PublicKey, {
      name: string;         // 예: "Jupiter Aggregator"
      category: string;     // 예: "DEX"
      riskLevel: 'low' | 'medium' | 'high';
      auditStatus: 'audited' | 'unaudited';
    }>;
  };

  // 허용된 토큰 민트
  tokens: {
    list: PublicKey[];
    metadata: Map<PublicKey, {
      symbol: string;       // 예: "USDC"
      decimals: number;
      category: 'stablecoin' | 'native' | 'defi' | 'meme';
    }>;
  };

  // 화이트리스트 모드
  mode: 'strict' | 'permissive';
  // strict: 목록에 없으면 거부
  // permissive: 목록에 없으면 에스컬레이션
}
```

**설계 근거:**
- `addresses`: 알려진 안전한 주소만 허용
- `programs`: 감사된 DeFi 프로토콜만 상호작용
- `tokens`: 유동성 있고 검증된 토큰만 거래
- `mode`: 보안 수준에 따른 유연성

### 4.4 시간 제어 정책 (Time Control Policy)

```typescript
interface TimeControlPolicy {
  // UTC 기준 허용 시간대
  allowedHours: {
    start: number;   // 0-23
    end: number;     // 0-23
    // 예: { start: 9, end: 18 } → UTC 09:00 ~ 18:00
  };

  // 요일 제한 (선택)
  allowedDays?: number[];  // 0=일요일, 1=월요일, ...
  // 예: [1,2,3,4,5] → 월~금만 허용

  // 트랜잭션 간 최소 간격
  cooldownSeconds: number;  // 예: 60 → 1분 간격

  // 버스트 제한 (선택)
  burstLimit?: {
    maxTransactions: number;  // 예: 10
    windowSeconds: number;    // 예: 60 → 1분에 최대 10건
  };

  // 비활성 시간 중 긴급 모드
  emergencyBypass: {
    enabled: boolean;
    requiresOwnerApproval: boolean;
  };
}
```

**설계 근거:**
- `allowedHours`: 운영 시간 외 비정상 활동 방지
- `cooldownSeconds`: 자동화된 대량 트랜잭션 방지
- `burstLimit`: DDoS 스타일 공격 완화
- `emergencyBypass`: 긴급 상황 대응 유연성

### 4.5 에스컬레이션 정책 (Escalation Policy)

```typescript
interface EscalationPolicy {
  // Owner 승인 필요 금액 기준
  thresholdAmount: {
    amount: bigint;          // 예: 5_000_000_000n (5 SOL)
    currency: 'SOL' | 'USDC' | 'USD_VALUE';
  };

  // Owner 승인 필요 프로그램 목록
  requireOwnerApproval: {
    programs: PublicKey[];   // 예: [UNSTAKE_PROGRAM]
    operations: string[];    // 예: ['close_account', 'withdraw_all']
  };

  // 에스컬레이션 처리 방식
  handling: {
    method: 'queue' | 'reject' | 'timeout';
    // queue: Owner 승인 대기열에 추가
    // reject: 즉시 거부
    // timeout: 일정 시간 후 자동 처리

    timeoutSeconds?: number;  // timeout 방식일 때
    autoApprove?: boolean;    // timeout 시 자동 승인 여부

    notificationChannels: ('email' | 'push' | 'webhook')[];
  };

  // 승인 요청 만료 시간
  approvalExpirySeconds: number;  // 예: 3600 → 1시간
}
```

**설계 근거:**
- `thresholdAmount`: 고액 거래는 사람 검토 필수
- `requireOwnerApproval`: 고위험 작업 명시적 승인
- `handling`: 다양한 비즈니스 요구사항 수용
- `notificationChannels`: Owner 실시간 알림

### 4.6 복합 정책 검증 흐름

```
트랜잭션 요청
     │
     ▼
┌─────────────────┐
│ 1. 금액 한도    │ ─── 초과 시 → 거부 또는 에스컬레이션
└────────┬────────┘
         │ 통과
         ▼
┌─────────────────┐
│ 2. 화이트리스트 │ ─── 미등록 시 → 거부 또는 에스컬레이션
└────────┬────────┘
         │ 통과
         ▼
┌─────────────────┐
│ 3. 시간 제어    │ ─── 범위 외 시 → 거부 또는 대기
└────────┬────────┘
         │ 통과
         ▼
┌─────────────────┐
│ 4. 에스컬레이션 │ ─── 조건 충족 시 → Owner 승인 요청
└────────┬────────┘
         │ 통과
         ▼
     서명 진행
```

### 4.7 정책 예시: 보수적 DeFi 에이전트

```typescript
const conservativeDeFiPolicy: AgentPolicy = {
  policyId: 'pol_defi_conservative_v1',
  agentId: 'agent_001',
  createdBy: ownerPublicKey,
  createdAt: new Date(),
  updatedAt: new Date(),
  version: 1,
  enabled: true,
  description: 'Conservative DeFi agent policy',

  limits: {
    perTransaction: {
      amount: 1_000_000_000n,  // 1 SOL
      currency: 'SOL'
    },
    dailyTotal: {
      amount: 10_000_000_000n,  // 10 SOL
      currency: 'SOL',
      resetHourUtc: 0
    },
    weeklyTotal: {
      amount: 50_000_000_000n,  // 50 SOL
      currency: 'SOL',
      resetDayOfWeek: 0
    }
  },

  whitelist: {
    addresses: {
      list: [TREASURY_ADDRESS, STAKING_POOL_ADDRESS],
      description: new Map([
        [TREASURY_ADDRESS, 'Main treasury'],
        [STAKING_POOL_ADDRESS, 'Staking rewards pool']
      ]),
      addedAt: new Map()
    },
    programs: {
      list: [JUPITER_PROGRAM, KAMINO_PROGRAM, MARINADE_PROGRAM],
      metadata: new Map([
        [JUPITER_PROGRAM, {
          name: 'Jupiter Aggregator',
          category: 'DEX',
          riskLevel: 'low',
          auditStatus: 'audited'
        }],
        [KAMINO_PROGRAM, {
          name: 'Kamino Finance',
          category: 'Yield',
          riskLevel: 'medium',
          auditStatus: 'audited'
        }],
        [MARINADE_PROGRAM, {
          name: 'Marinade Finance',
          category: 'Staking',
          riskLevel: 'low',
          auditStatus: 'audited'
        }]
      ])
    },
    tokens: {
      list: [SOL_MINT, USDC_MINT, MSOL_MINT],
      metadata: new Map([
        [SOL_MINT, { symbol: 'SOL', decimals: 9, category: 'native' }],
        [USDC_MINT, { symbol: 'USDC', decimals: 6, category: 'stablecoin' }],
        [MSOL_MINT, { symbol: 'mSOL', decimals: 9, category: 'defi' }]
      ])
    },
    mode: 'strict'
  },

  timeControls: {
    allowedHours: { start: 9, end: 18 },
    allowedDays: [1, 2, 3, 4, 5],  // 월~금
    cooldownSeconds: 60,
    burstLimit: {
      maxTransactions: 10,
      windowSeconds: 60
    },
    emergencyBypass: {
      enabled: true,
      requiresOwnerApproval: true
    }
  },

  escalation: {
    thresholdAmount: {
      amount: 5_000_000_000n,  // 5 SOL
      currency: 'SOL'
    },
    requireOwnerApproval: {
      programs: [UNSTAKE_PROGRAM],
      operations: ['close_account', 'withdraw_all']
    },
    handling: {
      method: 'queue',
      notificationChannels: ['email', 'push', 'webhook']
    },
    approvalExpirySeconds: 3600
  }
};
```

---

## 5. 에이전트-서버 간 비밀값 분리 설계

02-CONTEXT.md: "에이전트만 알고 있는 값(agent secret)과 서버에서 관리하는 값의 분리 구조"

### 5.1 설계 원칙

```
┌─────────────────────────────────────────────────────────────┐
│              비밀값 분리 핵심 원칙                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  원칙 1: 어느 한쪽만으로는 유효한 서명 불가                 │
│         Agent Secret 단독 ✗  |  Server Share 단독 ✗        │
│                                                             │
│  원칙 2: 에이전트 침해 시에도 서버 협력 없이 자산 이동 불가 │
│         해커가 Agent 탈취 → Server가 거부 → 서명 불가       │
│                                                             │
│  원칙 3: 서버 침해 시에도 에이전트 협력 없이 자산 이동 불가 │
│         해커가 Server 탈취 → Agent 없음 → 서명 불가         │
│                                                             │
│  원칙 4: Owner는 양쪽 모두 무력화 가능                      │
│         긴급 상황 시 Owner Key로 전체 시스템 중지           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 구현 옵션 비교

#### Option A: 2-of-2 MPC (Agent + Server 키 조각)

```
┌───────────────────┐     ┌───────────────────┐
│   AI Agent        │     │   WAIaaS Server   │
│   (TEE Enclave)   │     │   (API + KMS)     │
├───────────────────┤     ├───────────────────┤
│                   │     │                   │
│  agent_share_1    │  +  │  server_share_2   │  =  서명
│  (Ed25519 조각)   │     │  (Ed25519 조각)   │
│                   │     │                   │
└───────────────────┘     └───────────────────┘
```

**동작 방식:**
1. 키 생성 시 2-of-2 DKG(Distributed Key Generation) 실행
2. Agent와 Server 각각 키 조각 보유
3. 서명 시 MPC 프로토콜(CGGMP21)로 협력 서명

**장점:**
- 수학적으로 검증된 보안
- 단일 장애점 없음
- 키 조각 단독으로는 무의미

**단점:**
- 구현 복잡도 높음
- 서명 지연 (4라운드 통신)
- 네트워크 의존성

**적합 케이스:**
- 최고 수준 보안 요구
- 서명 빈도 낮음
- 개발 리소스 충분

#### Option B: KMS + Enclave (Server 암호화, Agent 복호화)

```
┌───────────────────────────────────────────────────────────────┐
│                      키 흐름                                  │
│                                                               │
│  Agent Key 생성 (Enclave)                                     │
│        │                                                      │
│        ▼                                                      │
│  시드 → KMS 암호화 (attestation 조건) → 암호화된 시드 저장    │
│        │                                                      │
│        ▼                                                      │
│  Enclave 재시작 시: 암호화된 시드 → KMS 복호화 → 키 복구      │
│        │                                                      │
│        ▼                                                      │
│  서명: Enclave 내에서 복호화된 키로 직접 서명                 │
└───────────────────────────────────────────────────────────────┘
```

**동작 방식:**
1. Agent Key는 Enclave 내에서 생성
2. 시드를 KMS로 암호화하여 외부 저장
3. KMS 키 정책에 Enclave attestation 조건 추가
4. 서명은 Enclave 내에서 단독 실행

**장점:**
- 서명 지연 없음 (로컬 서명)
- 구현 복잡도 중간
- AWS 인프라 활용

**단점:**
- 서버가 직접 서명하지 않음 (정책 우회 가능성)
- KMS 가용성 의존
- Enclave 재시작 시 KMS 호출 필요

**적합 케이스:**
- 고빈도 서명 필요
- AWS 환경 운영 중
- 보안과 성능 균형

#### Option C: Squads 2-of-2 멀티시그 (Owner Key + Agent Key)

```
┌───────────────────────────────────────────────────────────────┐
│                   Squads 2-of-2 구조                          │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐      │
│  │           Squads Smart Wallet (온체인)              │      │
│  │                                                     │      │
│  │   멤버 1: Owner Key (AWS KMS)                       │      │
│  │   멤버 2: Agent Key (Nitro Enclave)                 │      │
│  │                                                     │      │
│  │   Threshold: 동적 (정책 기반)                       │      │
│  │   - 소액: 1-of-2 (Agent 단독)                       │      │
│  │   - 고액: 2-of-2 (Owner + Agent)                    │      │
│  │                                                     │      │
│  └─────────────────────────────────────────────────────┘      │
│                                                               │
│  온체인 정책 강제:                                            │
│  - spending_limit: 트랜잭션당 한도                            │
│  - time_lock: 특정 작업 지연                                  │
│  - member_permissions: 멤버별 권한 차등                       │
└───────────────────────────────────────────────────────────────┘
```

**동작 방식:**
1. Squads v4로 2-of-2 멀티시그 생성
2. Owner Key: KMS 관리, 마스터 권한
3. Agent Key: Enclave 내 생성, 실행 권한만
4. Threshold를 트랜잭션 유형에 따라 동적 적용

**장점:**
- **온체인 정책 강제** (서버 우회 불가)
- 구현 복잡도 낮음 (SDK 사용)
- $10B+ 실사용 검증
- Owner 단독으로 긴급 조치 가능

**단점:**
- 트랜잭션 비용 (멀티시그 오버헤드)
- Solana 전용 (멀티체인 확장 시 재설계)

**적합 케이스:**
- Solana 메인 타겟
- 온체인 정책 강제 필수
- 빠른 구현 필요

### 5.3 권장: Option C (Squads 2-of-2)

**선택 이유:**

| 기준 | Option A | Option B | Option C |
|------|----------|----------|----------|
| 보안성 | 최상 | 상 | 상 |
| 구현 복잡도 | 높음 | 중간 | **낮음** |
| 서명 지연 | 높음 | 낮음 | 중간 |
| 온체인 정책 강제 | 불가 | 불가 | **가능** |
| 검증 수준 | 라이브러리 감사 | AWS 검증 | **$10B+ 실사용** |
| Owner 복구 | 복잡 | 복잡 | **단순** |

**핵심 이점:**
1. **온체인 정책 강제**: 서버가 침해되어도 Squads 프로그램이 정책 검증
2. **복잡도 최소화**: 검증된 SDK 활용, 자체 MPC 구현 불필요
3. **Owner 주권 보장**: Owner Key로 언제든 Agent 권한 해제

---

## 6. 장애 복구 메커니즘

02-CONTEXT.md: "에이전트 장애 시 소유자 즉각 복구와 키 교체 모두 필수"

### 6.1 장애 유형별 복구 방법

| 장애 유형 | 심각도 | 복구 방법 | 소요 시간 | 자산 위험 |
|----------|--------|----------|----------|----------|
| **Agent 크래시** | 낮음 | 새 Enclave에서 암호화된 키 복구 | 수 분 | 없음 |
| **Agent 키 침해** | 높음 | Owner Key로 Agent 권한 즉시 해제, 새 Agent Key 등록 | 수 분 | 정책 한도 내 |
| **Owner Key 분실** | 치명적 | Time-locked guardian recovery | 수 일 ~ 수 주 | 복구 지연 중 동결 |
| **Server 장애** | 중간 | 다중 가용 영역 자동 전환 | 수 초 ~ 수 분 | 없음 |
| **네트워크 분리** | 중간 | Agent 자율 동작 정지, 재연결 대기 | 네트워크 복구 시 | 없음 (정지 상태) |

### 6.2 Agent 크래시 복구

```
┌───────────────────────────────────────────────────────────────┐
│                   Agent 크래시 복구 흐름                       │
│                                                               │
│  1. 크래시 탐지 (Health Check 실패)                           │
│        │                                                      │
│        ▼                                                      │
│  2. 새 Enclave 인스턴스 시작                                  │
│        │                                                      │
│        ▼                                                      │
│  3. 암호화된 시드 로드 (외부 저장소)                          │
│        │                                                      │
│        ▼                                                      │
│  4. KMS 복호화 (attestation 검증)                             │
│        │                                                      │
│        ▼                                                      │
│  5. Agent Key 복구 (동일 공개키)                              │
│        │                                                      │
│        ▼                                                      │
│  6. 중단된 작업 재개                                          │
│                                                               │
│  ※ 공개키 변경 없음 → Squads 멤버 재등록 불필요              │
└───────────────────────────────────────────────────────────────┘
```

**구현 요구사항:**
- 암호화된 시드의 안전한 외부 저장 (S3 + KMS)
- Enclave attestation 기반 KMS 접근 제어
- Health check 및 자동 재시작 (ECS/Kubernetes)

### 6.3 Agent 키 침해 복구

```
┌───────────────────────────────────────────────────────────────┐
│                   Agent 키 침해 대응 흐름                      │
│                                                               │
│  1. 침해 탐지 (이상 트랜잭션, 보안 알림)                      │
│        │                                                      │
│        ▼                                                      │
│  2. Owner에게 즉시 알림 (Push + Email + Webhook)              │
│        │                                                      │
│        ▼                                                      │
│  3. Owner가 긴급 중지 실행 (Owner Key 서명)                   │
│        │                                                      │
│        ├───► Squads에서 Agent 멤버 권한 해제                  │
│        │                                                      │
│        ├───► 기존 Agent Key 무효화                            │
│        │                                                      │
│        └───► 진행 중인 트랜잭션 취소 (가능한 경우)            │
│                                                               │
│  4. 새 Agent Key 생성 (새 Enclave)                            │
│        │                                                      │
│        ▼                                                      │
│  5. Squads에 새 Agent 멤버 등록 (Owner Key 서명)              │
│        │                                                      │
│        ▼                                                      │
│  6. 서비스 재개                                               │
│                                                               │
│  ※ 자산 손실: 침해 탐지 전까지 정책 한도 내로 제한           │
└───────────────────────────────────────────────────────────────┘
```

**구현 요구사항:**
- 이상 트랜잭션 탐지 시스템
- Owner 알림 다중 채널
- Squads 멤버 권한 변경 자동화

### 6.4 Owner Key 분실 복구

```
┌───────────────────────────────────────────────────────────────┐
│                   Owner Key 분실 복구 흐름                     │
│                                                               │
│  사전 설정 (필수):                                            │
│  - Guardian 주소 등록 (신뢰할 수 있는 복구 주소)              │
│  - Time Lock 기간 설정 (예: 7일)                              │
│                                                               │
│  복구 흐름:                                                   │
│                                                               │
│  1. Owner가 Guardian에게 복구 요청                            │
│        │                                                      │
│        ▼                                                      │
│  2. Guardian이 복구 프로세스 시작                             │
│        │                                                      │
│        ▼                                                      │
│  3. Time Lock 대기 (7일)                                      │
│        │    └── 이 기간 동안 자산 동결                        │
│        │    └── 원래 Owner가 취소 가능                        │
│        ▼                                                      │
│  4. Time Lock 만료                                            │
│        │                                                      │
│        ▼                                                      │
│  5. 새 Owner Key 등록                                         │
│        │                                                      │
│        ▼                                                      │
│  6. 기존 Owner Key 무효화                                     │
│                                                               │
│  ※ Time Lock: 해커가 Owner Key 탈취 시 실제 Owner가 취소 가능 │
└───────────────────────────────────────────────────────────────┘
```

**구현 요구사항:**
- Squads Time Lock 기능 활용
- Guardian 다중 등록 (예: 3-of-5 guardian)
- 복구 요청 알림 시스템

### 6.5 Server 장애 복구

```
┌───────────────────────────────────────────────────────────────┐
│                   Server 장애 복구 아키텍처                    │
│                                                               │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                   │
│  │ AZ-1a   │    │ AZ-1b   │    │ AZ-1c   │    AWS 리전        │
│  │         │    │         │    │         │                    │
│  │ Server  │    │ Server  │    │ Server  │    Active-Active   │
│  │ Primary │◄──►│ Standby │◄──►│ Standby │                    │
│  │         │    │         │    │         │                    │
│  └────┬────┘    └────┬────┘    └────┬────┘                   │
│       │              │              │                         │
│       └──────────────┼──────────────┘                         │
│                      │                                        │
│                      ▼                                        │
│              ┌───────────────┐                                │
│              │ Load Balancer │    자동 헬스체크               │
│              │   (ALB/NLB)   │    장애 노드 제외              │
│              └───────────────┘                                │
│                                                               │
│  장애 시나리오:                                               │
│  - AZ-1a 장애 → ALB가 1b/1c로 트래픽 라우팅                   │
│  - 전환 시간: 수 초 (헬스체크 간격)                           │
│  - 데이터 손실: 없음 (RDS Multi-AZ)                           │
└───────────────────────────────────────────────────────────────┘
```

**구현 요구사항:**
- Multi-AZ 배포
- RDS Multi-AZ (PostgreSQL)
- ElastiCache Multi-AZ (Redis)
- ALB/NLB 헬스체크

### 6.6 네트워크 분리 대응

```
┌───────────────────────────────────────────────────────────────┐
│                   네트워크 분리 대응 정책                      │
│                                                               │
│  시나리오: Agent ←✕→ Server 연결 끊김                         │
│                                                               │
│  Agent 동작:                                                  │
│  1. 연결 끊김 탐지 (heartbeat 실패)                           │
│  2. 재연결 시도 (exponential backoff)                         │
│  3. 재연결 실패 시: 모든 트랜잭션 일시 정지                   │
│  4. 대기 상태 유지 (서명 요청 거부)                           │
│  5. 연결 복구 시: 상태 동기화 후 재개                         │
│                                                               │
│  이유:                                                        │
│  - 오프라인 서명은 정책 검증 불가                             │
│  - 이중 지불 방지 (서버가 상태 추적)                          │
│  - 침해 시 격리 효과                                          │
│                                                               │
│  예외 (선택적):                                               │
│  - 사전 서명된 긴급 트랜잭션만 실행 가능                      │
│  - Owner 오프라인 승인 (시간 제한)                            │
└───────────────────────────────────────────────────────────────┘
```

---

## 7. 위협 모델 및 대응

02-CONTEXT.md: "내부 위협과 외부 위협 모두 동등하게 분석"

### 7.1 위협 개요

```
┌─────────────────────────────────────────────────────────────┐
│                      위협 분류 체계                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  내부 위협 (Insider Threat)                                 │
│  ├── 에이전트 키 탈취                                       │
│  ├── 내부자 공격 (운영자 악의)                              │
│  └── 에이전트 로직 오류                                     │
│                                                             │
│  외부 위협 (External Threat)                                │
│  ├── 해커 공격 (API 엔드포인트)                             │
│  ├── 피싱 (소유자 대상)                                     │
│  └── 공급망 공격 (의존성 침해)                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 내부 위협

#### 위협 1: 에이전트 키 탈취

**공격 시나리오:**
- 공격자가 Enclave 취약점을 악용하여 Agent Key 추출
- 메모리 덤프를 통한 키 유출
- 사이드채널 공격으로 키 추론

**영향:**
- 정책 한도 내에서 자산 탈취 가능
- 화이트리스트 주소로만 전송 가능 (제한적)
- Owner 개입 전까지 반복 공격 가능

**완화 전략:**
| 대응 | 구현 방법 | 효과 |
|------|----------|------|
| TEE 격리 | AWS Nitro Enclaves | 호스트에서 메모리 접근 차단 |
| 정책 한도 | Squads spending limit | 단일 공격 최대 손실 제한 |
| 이상 탐지 | 트랜잭션 패턴 분석 | 조기 탐지 및 중지 |
| 키 교체 | 정기 키 로테이션 | 유출 키 유효 기간 제한 |
| Owner 알림 | 실시간 알림 | 빠른 대응 |

#### 위협 2: 내부자 공격 (운영자 악의)

**공격 시나리오:**
- 시스템 관리자가 KMS 키에 무단 접근
- 운영자가 Enclave 코드를 변조하여 배포
- DB 관리자가 정책을 무단 변경

**영향:**
- Owner Key 탈취 시 전체 자산 위험
- Agent 정책 무력화 가능
- 감사 로그 조작 가능

**완화 전략:**
| 대응 | 구현 방법 | 효과 |
|------|----------|------|
| IAM 역할 분리 | AWS IAM 최소 권한 원칙 | 단일 역할로 전체 접근 불가 |
| KMS 키 정책 | 조건부 접근, MFA 필수 | 무단 접근 차단 |
| Enclave 검증 | PCR attestation | 변조 코드 실행 차단 |
| 불변 감사 로그 | CloudTrail + S3 WORM | 로그 조작 불가 |
| 다중 승인 | 고위험 작업 2인 이상 승인 | 단독 악용 방지 |

#### 위협 3: 에이전트 로직 오류

**공격 시나리오:**
- AI 에이전트가 잘못된 의사결정으로 손실 발생
- 버그로 인해 의도치 않은 트랜잭션 실행
- 무한 루프로 트랜잭션 비용 소진

**영향:**
- 정책 한도 내에서 자산 손실
- 서비스 가용성 저하
- 평판 손상

**완화 전략:**
| 대응 | 구현 방법 | 효과 |
|------|----------|------|
| 정책 한도 | 금액/빈도 제한 | 오류 시 최대 손실 제한 |
| 시뮬레이션 | 트랜잭션 사전 시뮬레이션 | 실행 전 검증 |
| Circuit Breaker | 연속 실패 시 자동 중단 | 무한 루프 방지 |
| Staging 환경 | Devnet/Testnet 테스트 | 프로덕션 전 검증 |
| 롤백 전략 | 상태 스냅샷 | 오류 발생 시 복구 |

### 7.3 외부 위협

#### 위협 4: 해커 공격 (API 엔드포인트)

**공격 시나리오:**
- API 인증 우회로 무단 트랜잭션 요청
- Rate limiting 우회로 DDoS
- 인젝션 공격으로 정책 우회

**영향:**
- 무단 트랜잭션 실행
- 서비스 중단
- 데이터 유출

**완화 전략:**
| 대응 | 구현 방법 | 효과 |
|------|----------|------|
| API 인증 | API Key + HMAC 서명 | 무단 접근 차단 |
| Rate Limiting | Redis 기반 제한 | DDoS 완화 |
| WAF | AWS WAF | 일반 웹 공격 차단 |
| 입력 검증 | Zod 스키마 검증 | 인젝션 방지 |
| TLS | 전송 암호화 | MITM 방지 |

#### 위협 5: 피싱 (소유자 대상)

**공격 시나리오:**
- 가짜 대시보드로 Owner 자격 증명 탈취
- 소셜 엔지니어링으로 Owner 유도
- 악성 dApp 서명 요청

**영향:**
- Owner Key 탈취 시 전체 자산 위험
- 정책 무단 변경
- 에이전트 권한 악용

**완화 전략:**
| 대응 | 구현 방법 | 효과 |
|------|----------|------|
| 하드웨어 지갑 | Ledger/Trezor | 피싱으로 키 탈취 불가 |
| 도메인 검증 | 대시보드 도메인 확인 교육 | 가짜 사이트 인지 |
| 트랜잭션 미리보기 | 서명 전 상세 표시 | 악성 트랜잭션 인지 |
| 2FA | TOTP/하드웨어 키 | 자격 증명 도난만으로 접근 불가 |
| 알림 | 모든 작업 알림 | 이상 활동 인지 |

#### 위협 6: 공급망 공격 (의존성 침해)

**공격 시나리오:**
- npm 패키지에 악성 코드 삽입
- 오픈소스 라이브러리 취약점
- CI/CD 파이프라인 침해

**영향:**
- 키 유출
- 백도어 설치
- 악성 트랜잭션 실행

**완화 전략:**
| 대응 | 구현 방법 | 효과 |
|------|----------|------|
| 의존성 잠금 | pnpm lock, hash 검증 | 무단 변경 감지 |
| 취약점 스캔 | Snyk, npm audit | 알려진 취약점 탐지 |
| 최소 의존성 | 핵심 라이브러리만 | 공격 표면 축소 |
| SBoM | 소프트웨어 BOM 관리 | 의존성 추적 |
| 컨테이너 스캔 | Trivy | 이미지 취약점 탐지 |

### 7.4 위협 대응 우선순위

| 위협 | 발생 가능성 | 영향도 | 우선순위 |
|------|------------|--------|----------|
| 에이전트 로직 오류 | 높음 | 중간 | **1** |
| 해커 공격 (API) | 높음 | 중간 | **2** |
| 피싱 (소유자) | 중간 | 높음 | **3** |
| 공급망 공격 | 중간 | 중간 | **4** |
| 에이전트 키 탈취 | 낮음 | 높음 | **5** |
| 내부자 공격 | 낮음 | 높음 | **6** |

---

## 8. 컴플라이언스 고려사항

02-CONTEXT.md: "GDPR, SOC2, 암호화폐 규제 등 컴플라이언스 요소"

### 8.1 GDPR (General Data Protection Regulation)

**적용 범위:**
- EU 거주자의 개인정보 처리 시 적용
- 지갑 주소 자체는 개인정보로 해석될 수 있음 (연결 데이터 존재 시)

**핵심 요구사항 및 대응:**

| 요구사항 | 내용 | 대응 방안 |
|----------|------|----------|
| **데이터 최소화** | 필요한 데이터만 수집 | 지갑 주소, 트랜잭션 해시만 저장 |
| **삭제권 (잊혀질 권리)** | 요청 시 개인정보 삭제 | 오프체인 데이터만 삭제 (온체인 불변) |
| **접근권** | 본인 데이터 열람 | 대시보드에서 데이터 다운로드 기능 |
| **이동권** | 데이터 이동 | JSON 형식 데이터 내보내기 |
| **동의** | 명시적 동의 | 회원가입 시 동의 수집, 기록 보관 |

**구현 가이드:**
```typescript
// 개인정보 저장 구조
interface UserData {
  // 오프체인 (PostgreSQL) - 삭제 가능
  offchain: {
    email: string;           // 삭제 가능
    name?: string;           // 삭제 가능
    preferences: object;     // 삭제 가능
    createdAt: Date;
    deletedAt?: Date;        // soft delete
  };

  // 온체인 참조 - 불변
  onchain: {
    walletAddress: string;   // 삭제 불가 (블록체인 특성)
    // 개인정보와 분리하여 익명화
  };
}
```

### 8.2 SOC 2 (Service Organization Control 2)

**적용 범위:**
- B2B 서비스 제공 시 고객 요구
- 보안, 가용성, 처리 무결성, 기밀성, 개인정보 보호

**핵심 요구사항 및 대응:**

| Trust Services Criteria | 요구사항 | 대응 방안 |
|------------------------|----------|----------|
| **Security** | 무단 접근 차단 | IAM, KMS, TEE |
| **Availability** | 서비스 가용성 | Multi-AZ, 99.9% SLA |
| **Processing Integrity** | 정확한 처리 | 트랜잭션 검증, 정책 엔진 |
| **Confidentiality** | 데이터 기밀성 | 암호화 저장/전송 |
| **Privacy** | 개인정보 보호 | GDPR 준수 |

**필수 통제 항목:**

```
┌─────────────────────────────────────────────────────────────┐
│                    SOC 2 필수 통제                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  접근 통제:                                                 │
│  - IAM 역할 기반 접근 제어                                  │
│  - MFA 필수                                                 │
│  - 최소 권한 원칙                                           │
│                                                             │
│  변경 관리:                                                 │
│  - Git 기반 변경 추적                                       │
│  - PR 리뷰 필수                                             │
│  - Enclave 이미지 버전 관리                                 │
│                                                             │
│  위험 평가:                                                 │
│  - 정기 침투 테스트                                         │
│  - 위협 모델링 문서화                                       │
│  - 취약점 스캔                                              │
│                                                             │
│  모니터링:                                                  │
│  - CloudWatch 로그                                          │
│  - CloudTrail 감사                                          │
│  - 이상 탐지 알림                                           │
│                                                             │
│  암호화:                                                    │
│  - 전송 중: TLS 1.3                                         │
│  - 저장 시: KMS 암호화                                      │
│  - 키 관리: AWS KMS FIPS 140-2 Level 3                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.3 암호화폐 규제

**한국 (가상자산이용자보호법):**
- 현재 거래소/커스터디 서비스 대상
- B2B API 서비스는 현재 직접 적용 대상 아님
- 향후 규제 확대 가능성 모니터링

**미국 (2026 전망):**
- GENIUS Act: 스테이블코인 규제 강화 예상
- SEC vs CFTC 관할권 논쟁 진행 중
- 비수탁 서비스는 현재 규제 범위 외

**EU (MiCA - Markets in Crypto-Assets):**
- 2024년 시행
- 커스터디 서비스 라이선스 필요
- 비수탁(Non-Custodial) 모델은 라이선스 불필요

**권장 전략:**

```
┌─────────────────────────────────────────────────────────────┐
│                 규제 준수 전략                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 비수탁(Non-Custodial) 모델 유지                        │
│     - 사용자가 Owner Key 보유                               │
│     - 플랫폼은 키 접근 권한 없음                            │
│     - 규제 적용 범위 최소화                                 │
│                                                             │
│  2. 지역별 서비스 분리                                      │
│     - EU: MiCA 준수 버전                                    │
│     - 미국: 향후 규제 대응 준비                             │
│     - 한국: B2B만 서비스                                    │
│                                                             │
│  3. 규제 동향 모니터링                                      │
│     - 분기별 규제 리뷰                                      │
│     - 법률 자문 계약                                        │
│     - 업계 협회 참여                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Dual Key 아키텍처 개념 정의

Phase 3 아키텍처로 연결될 핵심 개념 정의.

### 9.1 개요

Dual Key 아키텍처는 AI 에이전트 지갑의 "자율성 vs 통제권" 딜레마를 해결하는 핵심 설계 패턴이다.

```
┌─────────────────────────────────────────────────────────────┐
│                  Dual Key 아키텍처                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────┐        │
│  │     Owner Key       │    │     Agent Key       │        │
│  │  (소유자 통제 키)   │    │  (에이전트 운영 키) │        │
│  ├─────────────────────┤    ├─────────────────────┤        │
│  │                     │    │                     │        │
│  │  역할:              │    │  역할:              │        │
│  │  - 마스터 권한      │    │  - 일상 운영        │        │
│  │  - 자금 회수        │    │  - 정책 범위 내     │        │
│  │  - 에이전트 중지    │    │  - 자율적 서명      │        │
│  │  - 키 교체          │    │                     │        │
│  │  - 정책 변경        │    │                     │        │
│  │                     │    │                     │        │
│  │  보관:              │    │  보관:              │        │
│  │  - AWS KMS          │    │  - Nitro Enclave    │        │
│  │  - 하드웨어 지갑    │    │  - TEE 메모리       │        │
│  │                     │    │                     │        │
│  │  사용 빈도:         │    │  사용 빈도:         │        │
│  │  - 드물게 (관리)    │    │  - 빈번 (운영)      │        │
│  │                     │    │                     │        │
│  └─────────────────────┘    └─────────────────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Owner Key 상세

**정의:**
소유자(사람)가 보유하는 마스터 권한 키로, 에이전트와 자금에 대한 최종 통제권을 가진다.

**권한 범위:**
| 권한 | 설명 | 사용 시나리오 |
|------|------|--------------|
| **자금 회수** | 지갑의 모든 자금을 안전 주소로 이동 | 에이전트 중지 시 |
| **에이전트 중지** | Agent Key 권한 즉시 해제 | 침해/오류 탐지 시 |
| **키 교체** | Agent Key 교체, Owner Key 로테이션 | 정기 또는 침해 후 |
| **정책 변경** | 한도/화이트리스트 등 정책 수정 | 운영 요구 변경 시 |
| **멤버 관리** | Squads 멀티시그 멤버 추가/제거 | 에이전트 추가 시 |

**보안 요구사항:**
- **FIPS 140-2 Level 3 이상:** AWS KMS 또는 하드웨어 지갑
- **MFA 필수:** 모든 Owner Key 사용 시
- **감사 로그:** 모든 사용 기록 불변 저장
- **백업:** 복구 경로 사전 설정 필수

**구현 권장사항:**
```typescript
interface OwnerKeyConfig {
  // 키 저장소
  storage: 'aws_kms' | 'hardware_wallet' | 'hybrid';

  // AWS KMS 설정
  kms?: {
    keyId: string;
    region: string;
    mfaRequired: boolean;
    accessPolicy: KMSKeyPolicy;
  };

  // 하드웨어 지갑 설정
  hardware?: {
    type: 'ledger' | 'trezor';
    derivationPath: string;
  };

  // 복구 설정
  recovery: {
    guardians: PublicKey[];    // 복구 권한 주소
    timeLockDays: number;      // 복구 대기 기간
    threshold: number;         // 필요 guardian 수
  };
}
```

### 9.3 Agent Key 상세

**정의:**
AI 에이전트가 일상 운영에 사용하는 키로, 정책 범위 내에서 자율적 서명이 가능하다.

**권한 범위:**
| 권한 | 조건 | 설명 |
|------|------|------|
| **소액 송금** | perTransaction 한도 이하 | 자율 실행 |
| **화이트리스트 거래** | 등록된 주소/프로그램만 | 자율 실행 |
| **DeFi 상호작용** | 허용된 프로토콜만 | 자율 실행 |
| **고액 거래** | thresholdAmount 초과 | Owner 승인 필요 |
| **신규 주소 전송** | 화이트리스트 외 | Owner 승인 필요 |

**보안 요구사항:**
- **TEE 격리:** AWS Nitro Enclave 내에서만 존재
- **메모리 암호화:** 평문 키 메모리 노출 방지
- **Attestation:** Enclave 무결성 검증 필수
- **키 교체:** 정기 로테이션 (30-90일)

**구현 권장사항:**
```typescript
interface AgentKeyConfig {
  // 키 저장소
  storage: 'nitro_enclave';

  // Enclave 설정
  enclave: {
    imageUri: string;          // ECR 이미지
    cpuCount: number;
    memoryMb: number;
    allowedPcr0: string[];     // 허용된 PCR 해시
  };

  // 키 백업 (암호화)
  backup: {
    kmsKeyId: string;          // 시드 암호화 KMS 키
    s3Bucket: string;          // 암호화된 시드 저장
    rotationDays: number;      // 키 교체 주기
  };

  // 정책 바인딩
  policy: {
    policyId: string;          // 적용 정책 ID
    enforcementLevel: 'enclave' | 'onchain' | 'both';
  };
}
```

### 9.4 Dual Key 상호작용 패턴

#### 패턴 1: Agent 자율 트랜잭션

```
Agent 의사결정 → 정책 검증 (Enclave) → Agent Key 서명 → 제출
                     │
                     └── 정책 범위 내: 자율 실행
```

#### 패턴 2: 에스컬레이션 (Owner 승인 필요)

```
Agent 의사결정 → 정책 검증 (Enclave) → 에스컬레이션 탐지
                     │
                     ▼
             Owner 알림 → Owner 검토 → Owner Key 서명
                     │
                     ▼
             Agent Key 서명 → Squads 실행 (2-of-2)
```

#### 패턴 3: 긴급 중지

```
이상 탐지 → Owner 알림 → Owner 긴급 중지 결정
                              │
                              ▼
                     Owner Key로 Agent 권한 해제
                              │
                              ▼
                     Agent Key 무효화 (Squads 멤버 제거)
```

### 9.5 Phase 3 연결 포인트

이 Dual Key 개념은 Phase 3 "아키텍처 설계"에서 다음과 같이 구체화된다:

| 이 문서 (Phase 2) | Phase 3 아키텍처 |
|------------------|-----------------|
| Owner Key 개념 | 구체적 AWS KMS 키 생성 및 정책 |
| Agent Key 개념 | Nitro Enclave 구현 상세 |
| 정책 구조 | PostgreSQL 스키마, API 스펙 |
| Squads 연동 | 스마트 월렛 생성 플로우 |
| 장애 복구 | 인프라 아키텍처 (Multi-AZ) |

---

## 10. 요약 및 권장사항

### 10.1 핵심 설계 원칙

1. **Dual Key 분리:** Owner Key와 Agent Key의 명확한 역할 분리
2. **정책 기반 자율성:** 사전 정의된 정책 범위 내에서만 자율 운영
3. **온체인 강제:** Squads Protocol로 정책 우회 불가능
4. **즉각 복구:** Owner가 언제든 에이전트 중지 및 자금 회수 가능
5. **심층 방어:** TEE + KMS + 멀티시그 + 정책 엔진 다층 보안

### 10.2 권장 아키텍처 요약

```
┌─────────────────────────────────────────────────────────────┐
│              권장 AI 에이전트 지갑 아키텍처                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Owner Layer:                                               │
│  └─ AWS KMS (ED25519) ← FIPS 140-2 Level 3                 │
│                                                             │
│  Agent Layer:                                               │
│  └─ AWS Nitro Enclaves ← TEE 격리, Attestation 검증        │
│                                                             │
│  Smart Wallet:                                              │
│  └─ Squads Protocol v4 ← $10B+ 실사용, 온체인 정책         │
│                                                             │
│  정책 엔진:                                                 │
│  └─ 금액 한도 + 화이트리스트 + 시간 제어 + 에스컬레이션    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 10.3 다음 단계 (Phase 3)

1. **아키텍처 상세 설계:** 컴포넌트 간 인터페이스 정의
2. **데이터 모델:** PostgreSQL 스키마 설계
3. **API 스펙:** OpenAPI 정의
4. **인프라 설계:** AWS 리소스 구성
5. **보안 설계:** IAM 정책, KMS 키 정책, 네트워크 설계

---

*문서 ID: CUST-02*
*작성일: 2026-02-04*
*Phase: 02-custody-model*
