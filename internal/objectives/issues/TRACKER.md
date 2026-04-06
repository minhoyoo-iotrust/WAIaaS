# Issue Tracker

> 이슈 추적 현황. 새 이슈는 `{NNN}-{slug}.md`로 추가하고 이 표를 갱신한다.

## Status Legend

| 상태 | 설명 |
|------|------|
| OPEN | 미처리 — 수정 필요 |
| FIXED | 수정 완료 — 코드 반영됨 |
| WONTFIX | 수정하지 않음 (의도된 동작 또는 해당 없음) |

## Active Issues

| ID | 유형 | 심각도 | 제목 | 마일스톤 | 상태 | 수정일 |
|----|------|--------|------|----------|------|--------|
| 469 | BUG | CRITICAL | MCP tools/list Zod 4 z.record() toJSONSchema 크래시 | — | FIXED | 2026-04-01 |
| 470 | ENHANCEMENT | MEDIUM | 릴리스 파이프라인 승인 2회 요구 | — | FIXED | 2026-04-01 |
| 471 | BUG | HIGH | Desktop 빌드 CI에서 workspace 패키지 dist 누락 | — | FIXED | 2026-04-01 |
| 472 | BUG | HIGH | Desktop SEA 빌드 esbuild 외부 모듈 resolve 실패 | — | FIXED | 2026-04-02 |
| 473 | BUG | HIGH | Desktop 앱 동적 포트로 외부 에이전트 접속 불가 | — | FIXED | 2026-04-02 |
| 474 | ENHANCEMENT | LOW | Desktop 앱 아이콘을 사이트 파비콘 기반으로 교체 | — | FIXED | 2026-04-02 |
| 476 | BUG | HIGH | Desktop RC 릴리스가 prerelease로 마킹되지 않음 | — | FIXED | 2026-04-02 |
| 477 | BUG | CRITICAL | MCP tools/list Zod z.record() 키 스키마 누락으로 빈 배열 반환 | — | FIXED | 2026-04-02 |
| 478 | ENHANCEMENT | LOW | MCP 서버 버전 0.0.0 하드코딩 | — | FIXED | 2026-04-02 |
| 479 | BUG | HIGH | MCP listTools() 레이스 컨디션: Action Provider 도구 누락 | — | FIXED | 2026-04-06 |
| 480 | BUG | CRITICAL | v62 마이그레이션 SELECT * 컬럼 순서 불일치로 실패 | — | FIXED | 2026-04-06 |
| 481 | BUG | CRITICAL | xrpl ECDSA named export ESM import 실패 — XRPL 전 기능 불가 | v33.6 | FIXED | 2026-04-07 |
| 482 | MISSING | MEDIUM | XRPL 토큰 레지스트리 지원 (드롭다운/빌트인/API) | — | FIXED | 2026-04-07 |
| 483 | BUG | CRITICAL | XRPL Price Oracle가 ETH 가격 반환 — USD 표시/정책 ~1600배 과대 | — | FIXED | 2026-04-07 |
| 484 | BUG | CRITICAL | XRPL 서명 주소 불일치 — fromEntropy vs sodium-native 키 파생 불일치 | — | FIXED | 2026-04-07 |

## Type Legend

| 유형 | 설명 |
|------|------|
| BUG | 의도와 다르게 동작하는 결함 |
| ENHANCEMENT | 기능은 정상이나 개선이 필요한 사항 |
| MISSING | 설계에 포함되었으나 구현이 누락된 기능 |

## Summary

- **OPEN:** 0
- **PLANNED:** 0
- **FIXED:** 476
- **WONTFIX:** 1
- **Total:** 479
- **Archived:** 468 (001–468)
