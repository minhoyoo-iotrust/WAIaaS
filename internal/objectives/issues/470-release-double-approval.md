# 470: 릴리스 파이프라인 승인 2회 요구

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** —
- **상태:** FIXED

## 증상

릴리스 파이프라인(release.yml)에서 Gate 2 승인을 2번 해야 한다. `approval-gate` job과 `deploy` job 모두 `environment: production`을 사용하기 때문에 GitHub가 각 job마다 별도 승인을 요구한다.

## 원인

- `approval-gate`: `environment: production` (수동 승인 게이트)
- `deploy`: `environment: production` (npm OIDC Trusted Publishing에 필요)
- GitHub Actions는 같은 environment라도 job마다 별도 승인 요구

## 해결 방안

`approval-gate` job을 제거하고 `deploy`의 `environment: production`이 유일한 승인 게이트 역할을 하게 한다. `trigger-desktop`은 `needs: [deploy]`로 변경하여 deploy 완료 후 실행.

- 장점: 구조 단순화, 환경 1개만 관리, 승인 1회
- 단점: desktop 빌드가 deploy 완료 후 시작 (순차 실행, ~10분 지연)

## 수정 범위

- `.github/workflows/release.yml`: `approval-gate` job 제거, `deploy`의 needs를 quality gate jobs로 변경, `trigger-desktop`의 needs를 `[deploy]`로 변경, version output을 deploy에서 생성

## 테스트 항목

- [ ] 릴리스 파이프라인 실행 시 승인이 1회만 요구되는지 확인
- [ ] deploy 완료 후 trigger-desktop이 정상 실행되는지 확인
- [ ] npm OIDC Trusted Publishing이 정상 작동하는지 확인
