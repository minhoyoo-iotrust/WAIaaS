# #146 examples/simple-agent/README.md 깨진 링크 + placeholder URL + 구버전

- **유형:** BUG
- **심각도:** LOW
- **마일스톤:** v2.0 (이연)
- **상태:** FIXED

## 현재 상태

- `examples/simple-agent/README.md`에 깨진 링크, placeholder URL, 구버전 정보가 포함됨
- 새 사용자가 예제 에이전트를 따라할 때 혼란 유발 가능
- v2.0 Milestone Audit에서 INT-02로 식별, v2.0.5로 이연됨

## 수정 방향

- 깨진 링크를 현재 유효한 URL로 교체
- placeholder URL(`example.com` 등)을 실제 URL 또는 명확한 설명으로 대체
- 구버전 의존성/API 사용법을 최신 버전에 맞게 갱신

### 수정 대상 파일

- `examples/simple-agent/README.md`
- `examples/simple-agent/` 내 기타 설정/코드 파일

## 출처

- v2.0 Milestone Audit — INT-02
- `.planning/MILESTONES.md` lines 53

## 테스트 항목

- [ ] README.md 내 모든 링크가 유효한지 확인
- [ ] placeholder URL이 제거되었는지 확인
- [ ] 예제 에이전트가 현재 daemon 버전과 호환되는지 확인
