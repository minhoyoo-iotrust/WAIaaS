# 73. WAIaaS Signing Protocol v1

## 목차

1. [개요](#1-개요)
2. [설계 원칙](#2-설계-원칙)
3. [SignRequest 스키마](#3-signrequest-스키마)
4. [SignResponse 스키마](#4-signresponse-스키마)
5. [서명 메시지 포맷](#5-서명-메시지-포맷)
6. [유니버셜 링크 URL 구조](#6-유니버셜-링크-url-구조)
7. [ntfy 채널 프로토콜](#7-ntfy-채널-프로토콜)
8. [Telegram 채널 프로토콜](#8-telegram-채널-프로토콜)
9. [요청 만료 + 재시도 정책](#9-요청-만료--재시도-정책)
10. [보안 모델](#10-보안-모델)
11. [에러 코드](#11-에러-코드)
12. [기술 결정 요약](#12-기술-결정-요약)

---

## 1. 개요

### 1.1 문서 목적

이 문서는 WAIaaS Signing Protocol v1의 모든 스키마, 전송 채널, 보안 모델을 확정한다. m26-01(@waiaas/wallet-sdk + 데몬 컴포넌트), m26-02(알림 채널), m26-03(Push Relay Server) 구현의 입력 사양으로 사용된다.

### 1.2 프로토콜 개요

WAIaaS Signing Protocol v1은 **세션 관리 없는 1회성 서명 프로토콜**이다.

AI 에이전트의 트랜잭션이 정책 엔진에 의해 `PENDING_APPROVAL` 상태가 되면, Owner의 지갑 앱으로 서명 요청(SignRequest)을 전달하고, Owner가 서명한 응답(SignResponse)을 받아 트랜잭션을 실행하는 단방향 요청-응답 플로우를 정의한다.

WalletConnect v2(v1.6.1)와 달리 세션 연결, 세션 만료 관리, 재연결이 불필요하며, 요청마다 독립적으로 동작한다.

```
AI 에이전트
  → 고액 트랜잭션 요청
    → 정책 평가 → PENDING_APPROVAL
      → WAIaaS 데몬: SignRequest 생성 + 유니버셜 링크 URL
        → 응답 채널(ntfy / Telegram)을 통해 Owner 지갑 앱에 전달
          → Owner: 지갑 앱에서 트랜잭션 확인 + 서명
            → SignResponse를 응답 채널로 반환
              → WAIaaS 데몬: 서명 검증(ownerAuth) + 트랜잭션 실행
```

### 1.3 적용 범위

이 프로토콜을 기반으로 다음 마일스톤이 설계/구현된다:

| 마일스톤 | 내용 | 관계 |
|----------|------|------|
| m26-01 | @waiaas/wallet-sdk + 데몬 서명 컴포넌트 | 프로토콜의 SDK/데몬 구현 |
| m26-02 | 지갑 앱 알림 채널 | 서명 채널과 일관된 토픽 구조 공유 |
| m26-03 | Push Relay Server | ntfy 토픽 → 기존 푸시 인프라 변환 |

### 1.4 응답 채널

Signing Protocol v1은 2가지 응답 채널을 지원한다:

#### 채널 A: ntfy 직접 푸시 (메신저 불필요)

```
WAIaaS ──(publish)──→ ntfy 토픽 ──(네이티브 푸시)──→ 지갑 앱
                                                        ↓
                                                    사용자 서명
                                                        ↓
WAIaaS ←──(subscribe)── ntfy 응답 토픽 ←──(publish)── 지갑 앱
```

Owner가 메신저를 설치할 필요 없이, 지갑 앱만으로 전체 플로우가 완성된다.

#### 채널 B: Telegram 메신저 중계

```
WAIaaS ──(Bot API)──→ Telegram ──→ Owner 폰 ──(유니버셜 링크)──→ 지갑 앱
                                                                    ↓
                                                                사용자 서명
                                                                    ↓
WAIaaS ←──(Long Polling)── Telegram ←──(공유 인텐트)── 지갑 앱
```

Owner가 이미 Telegram을 사용 중이면, 기존 메신저 인프라를 활용한다.

### 1.5 승인 채널 전체 구조

m26-01 완료 시 Owner는 5가지 승인 채널을 선택할 수 있다:

| 우선순위 | 채널 | 마일스톤 | 특징 |
|---------|------|---------|------|
| 1 | WAIaaS SDK + ntfy | m26-01 | 메신저 불필요, 지갑 앱만으로 동작 |
| 2 | WAIaaS SDK + Telegram | m26-01 | 메신저 중계, 파트너 지갑 전용 |
| 3 | WalletConnect | v1.6.1 | 세션 기반, 범용 지갑 |
| 4 | Telegram Bot `/approve` | v1.6 | chatId 기반, 텍스트 명령 |
| 5 | REST API 직접 호출 | v1.2 | 서명 수동 생성 |

ApprovalChannelRouter는 지갑별 `owner_approval_method` 설정에 따라 채널을 결정하며, 미설정 시 위 우선순위 순서로 fallback한다.

---

## 2. 설계 원칙

### 2.1 세션리스 (Stateless per Request)

WalletConnect v2는 세션 연결(QR 스캔), 세션 유지(7일 TTL + extend), 세션 만료 시 재연결이 필요하다. Signing Protocol v1은 요청마다 독립적으로 동작하며 세션 상태를 관리하지 않는다. requestId 기반 1회용 토픽으로 요청과 응답을 매칭한다.

| 비교 | WalletConnect v2 | Signing Protocol v1 |
|------|-------------------|---------------------|
| 세션 관리 | 필요 (7일 TTL + extend) | **불필요 (1회성)** |
| 초기 설정 | QR 스캔 → 세션 연결 | **설정 없음** |
| 오프라인 복구 | 세션 만료 시 QR 재스캔 | **항상 동작 (세션 없음)** |
| 외부 의존 | WC relay 서버 + Project ID | **ntfy 또는 Telegram** |

### 2.2 Self-Hosted 호환

WAIaaS는 self-hosted 로컬 데몬이다. Signing Protocol v1은 WAIaaS 도메인을 요구하지 않으며, 유니버셜 링크는 지갑 개발사의 도메인(예: `link.dcentwallet.com`)을 활용한다. ntfy 서버도 self-hosted로 운영 가능하다.

### 2.3 Zod SSoT

WAIaaS의 타입 시스템 원칙을 따른다. 모든 스키마는 Zod로 정의하고, TypeScript 타입은 `z.infer<>`로 derive한다. 파생 순서: Zod -> TypeScript types -> OpenAPI.

```typescript
// 정의
const SignRequestSchema = z.object({ ... });
// 파생
type SignRequest = z.infer<typeof SignRequestSchema>;
```

### 2.4 기존 인프라 재사용

새로운 인증/검증 로직을 만들지 않는다:

| 재사용 대상 | 원본 마일스톤 | 용도 |
|-------------|-------------|------|
| ownerAuth (Ed25519/SIWE) | v1.2 | SignResponse 서명 검증 |
| ntfy HTTP publish/subscribe | v1.3 | 서명 요청/응답 전달 채널 |
| Telegram Bot API + Long Polling | v1.6 | Telegram 서명 채널 |
| UUID v7 | v1.1 | requestId 생성 + 1회용 토픽 |

### 2.5 보안 기본

- **requestId 기반 1회용 토픽**: 응답 토픽 이름에 UUID v7 requestId를 포함하여 추측 불가. `waiaas-response-{requestId}` 형태
- **서명 검증**: ownerAuth(Ed25519/SIWE)로 SignResponse의 서명을 검증하여 위조 응답 방지
- **만료 정책**: 모든 요청에 `expiresAt`을 설정하여 오래된 요청이 처리되지 않도록 함 (기본 30분)
- **self-hosted ntfy**: ntfy 서버를 self-hosted로 운영하면 외부 노출 없이 로컬 네트워크에서만 통신 가능

---

## 3. SignRequest 스키마

<!-- Section 3 content will be added in Task 2 -->

---

## 4. SignResponse 스키마

<!-- Section 4 content will be added in Task 2 -->

---

## 5. 서명 메시지 포맷

<!-- Section 5 content will be added in Task 2 -->

---

## 6. 유니버셜 링크 URL 구조

<!-- Section 6 content will be added in Task 2 -->

---

## 7. ntfy 채널 프로토콜

<!-- Plan 02에서 작성 -->

---

## 8. Telegram 채널 프로토콜

<!-- Plan 02에서 작성 -->

---

## 9. 요청 만료 + 재시도 정책

<!-- Plan 02에서 작성 -->

---

## 10. 보안 모델

<!-- Plan 02에서 작성 -->

---

## 11. 에러 코드

<!-- Plan 02에서 작성 -->

---

## 12. 기술 결정 요약

<!-- Plan 02에서 작성 -->

---

*생성일: 2026-02-19*
*최종 수정: 2026-02-19*
*관련 objective: m26-00 (Wallet SDK 설계), m26-01 (Wallet Signing SDK)*
*관련 설계: doc 35 (알림), doc 37 (REST API), doc 25 (SQLite), doc 67 (Admin UI)*
