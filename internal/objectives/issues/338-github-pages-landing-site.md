# #338 GitHub Pages 랜딩 사이트 + AEO 구축

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** v31.14
- **상태:** FIXED
- **수정일:** 2026-03-13
- **발견일:** 2026-03-13

## 배경

WAIaaS 프로젝트의 SEO 및 AI 에이전트 검색 최적화(AEO)를 위해 공식 웹사이트가 필요함. 현재 npm/Docker 패키지 페이지와 GitHub README 외에 프로젝트를 소개하는 독립 웹 페이지가 없음.

## 목표

1. GitHub Pages 기반 정적 랜딩 페이지 구축
2. AI 에이전트 디스커버리 파일(AEO) 제공
3. 커스텀 도메인 연결 (예: `waiaas.dev`)

## 구현 범위

### 1. 랜딩 페이지

단일 페이지 구성 (SPA):

- **히어로**: 한 줄 소개 ("Self-hosted Wallet-as-a-Service for AI Agents") + 설치 명령어 (`npm install -g @waiaas/cli`)
- **핵심 기능**: 멀티체인(EVM 8개 + Solana), 13개 DeFi 프로토콜, 3계층 보안 모델, MCP 내장, Admin Web UI, Smart Account(ERC-4337)
- **아키텍처 다이어그램**: Agent ↔ MCP/REST API ↔ Daemon ↔ Blockchain 흐름도 + Owner 승인 채널
- **Quick Start**: Install → Start → Connect Agent (3단계)
- **리소스 링크**:
  - GitHub 리포지토리
  - npm 패키지 (`@waiaas/cli`, `@waiaas/daemon`, `@waiaas/sdk`, `@waiaas/wallet-sdk`)
  - Docker Hub (`waiaas/daemon`, `waiaas/push-relay`)
  - 배포 가이드 (`docs/deployment.md`)
  - Agent 연동 가이드 (`docs/guides/`)

### 2. SEO

- Open Graph 메타태그 (title, description, image)
- JSON-LD structured data (SoftwareApplication 스키마)
- `robots.txt`, `sitemap.xml`
- 시맨틱 HTML

### 3. AI 에이전트 검색 최적화 (AEO)

- `llms.txt` — 프로젝트 구조, 기능, API 개요를 LLM이 이해할 수 있는 형태로 제공
- `/.well-known/ai-plugin.json` — AI 에이전트 서비스 디스커버리 표준

### 4. 인프라

- 커스텀 도메인 CNAME 설정 + GitHub Pages HTTPS 자동 적용
- GitHub Actions 자동 배포 (main push 트리거)
- 단순 HTML/CSS/JS로 구축 (프레임워크 불필요 — 단일 랜딩 페이지)

## 테스트 항목

1. **수동 검증**: GitHub Pages 배포 후 사이트 접근 가능 확인
2. **수동 검증**: 커스텀 도메인 HTTPS 정상 동작 확인
3. **수동 검증**: Open Graph 미리보기 확인 (Twitter Card Validator / Facebook Debugger)
4. **수동 검증**: JSON-LD 메타데이터 검증 (Google Rich Results Test)
5. **수동 검증**: `llms.txt`, `/.well-known/ai-plugin.json` HTTP 200 응답 확인
