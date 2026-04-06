---
phase: 46-ext-release-objectives
plan: "02"
subsystem: objectives
tags: [v1.7, v2.0, quality, cicd, release, test-strategy, objective]

dependency_graph:
  requires: [45-01, 45-02, 46-01]
  provides: [v1.7-objective, v2.0-objective]
  affects: [47-design-debt-tracking]

tech_stack:
  added: []
  patterns: [objective-document-template, release-checklist-integration]

file_tracking:
  key_files:
    created:
      - objectives/v1.7-quality-cicd.md
      - objectives/v2.0-release.md
    modified: []

decisions:
  - id: "46-02-01"
    decision: "v1.7 보안 테스트 237건 = 71건(46-47) + 166건(64) 전수 자동화, [HUMAN] 0건"
    rationale: "보안 시나리오는 전수 자동화 가능 (Mock 경계 10개로 외부 의존 격리)"
  - id: "46-02-02"
    decision: "v2.0 [HUMAN] 3건: README 영문 검토, CHANGELOG 최종 검토, 설계 부채 이연 판단"
    rationale: "문서 품질과 이연 결정은 자동화 불가. 최소한의 수동 검증으로 제한"
  - id: "46-02-03"
    decision: "v2.0 npm 전체 7 패키지 공개, MIT 라이선스, release-please 자동화"
    rationale: "Self-hosted 아키텍처이므로 모든 패키지 공개. AI 에이전트 생태계 통합에 제약 최소화"
  - id: "46-02-04"
    decision: "v2.0 Docker 태깅: latest + semver + SHA, pre-release(rc) 3일 관찰 후 정식 발행"
    rationale: "릴리스 롤백 리스크(npm unpublish 24시간 제한) 대응"

metrics:
  duration: "7m"
  completed: "2026-02-09"
---

# Phase 46 Plan 02: v1.7/v2.0 Objective 문서 생성 Summary

v1.7 품질강화+CI/CD objective와 v2.0 전기능 릴리스 objective 문서 2개 생성 -- 설계 문서 7개(46-51,64) 참조 + 30개 전수 매핑, 보안 237건 전수 자동화, 커버리지 Hard 80%, 릴리스 체크리스트 14건 통합

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | v1.7 품질 강화 + CI/CD objective 문서 생성 | 81216ee | objectives/v1.7-quality-cicd.md |
| 2 | v2.0 전 기능 완성 릴리스 objective 문서 생성 | dd43a56 | objectives/v2.0-release.md |

## What Was Built

### v1.7 Objective (objectives/v1.7-quality-cicd.md)
- 설계 문서 7개(46-51, 64) 구현 범위 상세 기술
- 산출물 8개 영역: 단위 테스트(커버리지 Hard 80%), Contract Test(7개), 블록체인(3단계), 보안(237건), 플랫폼(118건), 확장기능(148건), Enum(9개 SSoT), CI/CD(4-stage 4 YAML)
- 기술 결정 8건: Vitest workspace, v8 커버리지, 보안 디렉토리 구조, ubuntu-latest 러너, Docker layer cache, GitHub Actions matrix, setup-solana action, CI script gate
- E2E 검증 시나리오 17건, 전수 자동화 ([HUMAN] 0건), [L0] 9건 + [L1] 8건
- 리스크 6건 식별

### v2.0 Objective (objectives/v2.0-release.md)
- 설계 문서 30개 구현 완료 확인 매핑 테이블
- 산출물 5개 영역: 코드(7패키지+Tauri+Telegram), 테스트(Hard 80%+237건+118건), 문서(API/배포/기여/README/CHANGELOG), 배포(npm 7개/Docker/Desktop 5플랫폼), 릴리스(GitHub Release+CHANGELOG)
- 기술 결정 7건: npm 전체 공개, Docker latest+semver+SHA, release-please, 영문 README+한글 별도, MIT 라이선스, GitHub Pages, Keep a Changelog
- E2E 검증 시나리오 14건 (자동 11 + [HUMAN] 3: README, CHANGELOG, 설계 부채 이연)
- 리스크 6건 식별

## Decisions Made

1. **v1.7 보안 시나리오 전수 자동화:** 237건(71+166) 보안 시나리오를 Vitest test:security로 전수 자동화. Mock 경계 10개(M1~M10)로 외부 의존 격리하여 [HUMAN] 0건 달성
2. **v2.0 [HUMAN] 3건 제한:** README 영문, CHANGELOG, 설계 부채 이연 판단만 수동. 나머지 11건은 CI/스크립트 자동 판정
3. **npm 전체 공개 + MIT:** Self-hosted 아키텍처이므로 7 패키지 모두 공개. MIT 라이선스로 AI 에이전트 생태계 통합 제약 최소화
4. **릴리스 롤백 대응:** release-please pre-release(rc) -> 3일 관찰 -> 정식 발행 패턴으로 npm unpublish 24시간 제한 리스크 대응

## Deviations from Plan

None -- 플랜 그대로 실행됨.

## Next Phase Readiness

- Phase 47 (설계 부채 추적 + 최종 매핑 검증) 진행 가능
- v1.1~v2.0 총 8개 objective 문서 완성 (v1.5, v1.6은 46-01에서 생성)
- 설계 부채 추적 파일(`objectives/design-debt.md`) 초기화가 Phase 47에서 필요

## Self-Check: PASSED
