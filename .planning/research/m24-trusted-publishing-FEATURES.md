# Feature Landscape: npm Trusted Publishing (OIDC) 전환

**Domain:** CI/CD 보안 - npm OIDC Trusted Publishing
**Researched:** 2026-02-18

---

## Table Stakes

전환 시 반드시 구현해야 하는 기능.

| Feature | 왜 필수인가 | 복잡도 | 비고 |
|---------|------------|--------|------|
| 8개 패키지 Trusted Publisher 등록 | OIDC 인증의 전제 조건 | Low | npmjs.com 웹 UI, 수동 작업 (8회 2FA) |
| `id-token: write` 퍼미션 설정 | OIDC 토큰 생성 권한 | Low | deploy 잡에만 추가 (job-level) |
| npm CLI 11.5.1+ 업그레이드 스텝 | OIDC 프로토콜 구현 필수 | Low | `npm install -g npm@latest` 한 줄 |
| `npm publish --provenance` 전환 | 빌드 출처 증명 (SLSA L2) | Low | pnpm publish → npm publish 변경 |
| `.npmrc` auth token 스텝 제거 | OIDC 인증 충돌 방지 | Low | 기존 Setup npmrc 스텝 삭제 |
| NODE_AUTH_TOKEN env 제거 | 토큰 기반 인증 잔존 방지 | Low | deploy 잡에서 env 블록 삭제 |
| repository.url 수정 (9개 package.json) | provenance 매칭 실패 방지 | Low | 현재 `minho-yoo/waiaas` → `minhoyoo-iotrust/WAIaaS` |

---

## Differentiators

전환 효과를 극대화하는 부가 기능.

| Feature | 가치 | 복잡도 | 비고 |
|---------|------|--------|------|
| npm 버전 검증 스텝 | CI 실패 원인 즉시 진단 | Low | publish 전 npm 버전 출력 |
| Provenance 배지 검증 | 전환 성공 확인 | Low | deploy summary에 provenance 상태 포함 |
| 롤백 가능한 단계적 전환 | NPM_TOKEN 즉시 삭제하지 않음 | Low | 검증 완료 시 삭제 |
| Deploy summary 업데이트 | OIDC 발행 상태 가시성 | Low | "published with provenance (OIDC)" 표시 |

---

## Anti-Features

명시적으로 구현하지 않을 것.

| Anti-Feature | 왜 피하는가 | 대신 할 것 |
|-------------|------------|-----------|
| Node.js 24 업그레이드 | 불필요한 런타임 변경. 프로젝트 전체에 영향 | Node 22 유지 + npm만 업그레이드 |
| pnpm 10 업그레이드 | OIDC에 불필요. pnpm 9.x에서 빌드/테스트 충분 | pnpm 9.15.4 유지 |
| `npm trust` CLI로 설정 자동화 | 8개 패키지 일회성 작업. 스크립트화 과잉 | npmjs.com 웹 UI에서 수동 설정 |
| 별도의 publish 워크플로 분리 | 기존 release.yml 파이프라인이 잘 작동 | release.yml 내 deploy 잡 수정만 |
| GitHub Artifact Attestations 추가 | npm provenance와 별개 시스템. 중복 | npm 내장 Sigstore provenance만 사용 |
| publish-check에 --provenance 추가 | OIDC 토큰 없는 환경에서 에러 가능 | publish-check는 현재대로 유지 |
| publishConfig.provenance 추가 | 8개 package.json 수정 필요. 워크플로 플래그가 더 간단 | --provenance 플래그 사용 |

---

## Feature Dependencies

```
[선행] repository.url 수정 (9개 package.json)
  │
  ├── [병렬 가능] npmjs.com Trusted Publisher 등록 (8패키지, 수동)
  │
  └── [순차] release.yml deploy 잡 수정
      ├── permissions: { contents: read, id-token: write }
      ├── npm CLI 업그레이드 스텝 추가
      ├── Setup npmrc 스텝 제거
      ├── pnpm publish → npm publish --provenance 변경
      └── NODE_AUTH_TOKEN env 제거
          │
          └── [순차] 실제 릴리스로 OIDC 발행 성공 확인
              │
              └── [순차] NPM_TOKEN 시크릿 삭제
```

---

## MVP 권장

**모든 Table Stakes가 MVP이다.** 이 마일스톤은 "단일 전환"이므로 부분 전환이 의미 없다.

우선순위:
1. repository.url 수정 (사전 조건, 코드 변경)
2. npmjs.com Trusted Publisher 등록 (수동, 코드 변경 없음, Phase 1과 병렬 가능)
3. release.yml 수정 (permissions + npm 업그레이드 + provenance + auth 제거)
4. 실제 릴리스로 검증
5. NPM_TOKEN 시크릿 삭제 (최종 정리)

**Defer:** 없음. 모든 항목이 하나의 전환 단위.

---

## Sources

- [npm Trusted Publishing Docs](https://docs.npmjs.com/trusted-publishers/)
- [npm Generating Provenance Statements](https://docs.npmjs.com/generating-provenance-statements/)
- [Phil Nash - Things you need to do](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/)
