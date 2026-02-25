# 162 — 스킬 파일 마스터 패스워드 요청 금지 안내 누락 + 유지 보장

- **유형:** MISSING
- **심각도:** HIGH
- **마일스톤:** v28.2
- **상태:** OPEN
- **발견일:** 2026-02-23

## 증상

7개 스킬 파일 중 4개에 "에이전트는 마스터 패스워드를 요청하면 안 된다"는 보안 안내가 누락되어 있음.
일부 파일(`transactions.skill.md`, `x402.skill.md`)은 masterAuth curl 예시를 포함하면서
보안 안내가 없어 에이전트가 마스터 패스워드를 요청하도록 유도할 수 있음.

## 현재 상태

| 스킬 파일 | 보안 안내 | masterAuth 예시 |
|----------|:--------:|:--------------:|
| `quickstart.skill.md` | O | O |
| `wallet.skill.md` | O | O |
| `admin.skill.md` | O | O |
| `transactions.skill.md` | **X** | O |
| `policies.skill.md` | **X** | X |
| `actions.skill.md` | **X** | X |
| `x402.skill.md` | **X** | O |

## 구조적 문제

스킬 파일은 인터페이스 변경 시 수동 업데이트하는 방식(CLAUDE.md Interface Sync 규칙)이라,
업데이트하는 사람이 보안 안내를 누락할 수 있음. 현재 누락 방지 메커니즘 없음.

## 수정 방안

### A. 누락 파일에 보안 안내 추가

`transactions.skill.md`, `policies.skill.md`, `actions.skill.md`, `x402.skill.md` 상단에 추가:

```markdown
> AI agents must NEVER request the master password. Use only your session token.
```

### B. CLAUDE.md Interface Sync 규칙에 보안 안내 유지 규칙 추가

```markdown
- All skill files must include the security notice: "AI agents must NEVER request the master password."
```

### C. CI lint로 보안 안내 존재 검증

모든 `skills/*.skill.md` 파일에 마스터 패스워드 요청 금지 문구가 포함되어 있는지 검사하는 lint 추가.
기존 `pnpm turbo run lint` 파이프라인에 포함하여 누락 시 CI 실패.

## 테스트 항목

- [ ] 7개 스킬 파일 모두에 보안 안내 문구 포함 확인
- [ ] CLAUDE.md에 보안 안내 유지 규칙 추가 확인
- [ ] CI lint가 보안 안내 누락 시 실패하는지 확인
- [ ] 신규 스킬 파일 생성 시에도 lint가 검출하는지 확인
