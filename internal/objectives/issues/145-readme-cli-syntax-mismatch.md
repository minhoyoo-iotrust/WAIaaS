# #145 README/deployment.md CLI 문법 불일치 — `add --all` vs `add all`

- **유형:** BUG
- **심각도:** LOW
- **마일스톤:** v2.0 (이연)
- **상태:** OPEN

## 현재 상태

- README.md와 deployment.md에서 Skills CLI 명령어가 `add --all`과 `add all`로 혼용됨
- 실제 CLI가 지원하는 정확한 문법과 일치하지 않는 문서가 존재할 수 있음
- v2.0 Milestone Audit에서 INT-01로 식별, v2.0.5로 이연됨

## 수정 방향

- Skills CLI의 실제 문법 확인 (`npx @waiaas/skills add all` vs `npx @waiaas/skills add --all`)
- README.md, deployment.md, 기타 문서에서 일관된 문법으로 통일

### 수정 대상 파일

- `README.md`
- `docs/deployment.md`
- 기타 Skills CLI 명령어를 참조하는 문서

## 출처

- v2.0 Milestone Audit — INT-01
- `.planning/MILESTONES.md` lines 52

## 테스트 항목

- [ ] 모든 문서에서 Skills CLI 명령어가 동일 문법으로 통일되었는지 확인
- [ ] 통일된 명령어가 실제 CLI에서 정상 동작하는지 확인
