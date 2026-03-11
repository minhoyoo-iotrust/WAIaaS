# 325 — Actions 엔드포인트 ?dryRun=true 쿼리 파라미터 미지원

- **유형:** MISSING
- **심각도:** MEDIUM
- **마일스톤:** v31.9
- **상태:** FIXED

## 현상

`/v1/actions/{provider}/{action}?dryRun=true` 쿼리 파라미터가 무시되어 실제 트랜잭션이 생성된다. UAT 중 simulate 의도로 호출했으나 실비가 발생함.

## 원인

액션 라우트 핸들러에서 `dryRun` 쿼리 파라미터를 파싱하지 않으며, simulate 모드 분기가 구현되지 않음.

## 해결 방안

1. 액션 라우트에서 `dryRun` 쿼리 파라미터 파싱
2. `dryRun=true` 시 파이프라인 Stage1~Stage2(validate+build)만 실행하고 Stage3 이후 생략
3. 응답에 예상 가스비, 예상 결과 등 simulate 정보 포함

## 영향 범위

- `packages/daemon/src/routes/actions.ts` — 쿼리 파라미터 파싱
- `packages/daemon/src/pipeline/stages.ts` — dryRun 분기

## 테스트 항목

1. `?dryRun=true` 쿼리 시 트랜잭션 미생성 확인 (DB에 tx 레코드 없음)
2. dryRun 응답에 예상 가스비가 포함되는지 확인
3. `?dryRun=false` 또는 파라미터 없을 때 기존 동작 유지 확인
