---
title: "WAIaaS Admin Manual"
description: "WAIaaS 데몬 관리자를 위한 운영 매뉴얼 인덱스"
keywords: ["admin", "operator", "manual", "waiaas", "daemon"]
date: "2026-03-18"
section: "docs"
category: "Admin Manual"
---

# WAIaaS Admin Manual

> 이 문서는 Operator(관리자)를 위한 것입니다. AI 에이전트는 `skills/` 파일을 참조하세요.

WAIaaS 데몬을 설치, 설정, 운영하기 위한 관리자 매뉴얼입니다. 모든 관리 작업은 masterAuth(`X-Master-Password` 헤더) 또는 Admin UI를 통해 수행됩니다.

## 매뉴얼 목차

| 문서 | 설명 |
|------|------|
| [Setup Guide](./setup-guide.md) | CLI 설치, 데몬 초기화, 첫 시작, 지갑+세션 생성 |
| [Daemon Operations](./daemon-operations.md) | 데몬 운영: Health, Kill Switch, Shutdown, Settings, Backup, Webhook |
| [Wallet Management](./wallet-management.md) | 지갑 CRUD, 세션 관리, Owner 설정, 토큰 레지스트리 |
| [Policy Management](./policy-management.md) | 정책 CRUD, 16개 정책 타입, 정책 평가 흐름 |
| [DeFi Provider Configuration](./defi-providers.md) | DeFi Provider 활성화, API 키 등록, CONTRACT_WHITELIST 설정 |
| [Credential Management](./credentials.md) | Credential Vault CRUD, 지원 타입, 글로벌 자격 증명 |
| [ERC-8004 Trustless Agents Setup](./erc8004-setup.md) | ERC-8004 Provider 활성화, 레지스트리 주소, REPUTATION_THRESHOLD 정책 |
| [ERC-8128 Signed HTTP Requests Setup](./erc8128-setup.md) | ERC-8128 기능 활성화, ERC8128_ALLOWED_DOMAINS 정책 |
| [Telegram Setup](./telegram-setup.md) | Telegram 봇 기반 서명 승인 채널 설정 |

## 인증 방식

모든 관리 엔드포인트는 **masterAuth**가 필요합니다:

```bash
curl -s http://localhost:3100/v1/admin/settings \
  -H 'X-Master-Password: <your-master-password>'
```

마스터 패스워드는 `config.toml`의 `[security]` 섹션 또는 환경변수 `WAIAAS_SECURITY_MASTER_PASSWORD`로 설정합니다.

## AI 에이전트 접근

AI 에이전트는 sessionAuth(`Authorization: Bearer <token>`)만 사용할 수 있으며, masterAuth 엔드포인트에 접근할 수 없습니다. 에이전트가 사용할 수 있는 API는 `skills/` 디렉토리의 스킬 파일을 참조하세요.
