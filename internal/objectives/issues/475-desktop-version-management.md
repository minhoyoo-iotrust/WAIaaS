# 475: Desktop 앱 버전 관리 체계 구축

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** —
- **상태:** OPEN

## 설명

Desktop 앱 버전이 `tauri.conf.json`에 고정(`0.1.0`)되어 있다. release-please는 daemon/npm 패키지 버전을 관리하지만, Desktop은 `desktop-v*` 태그로 별도 릴리스 체계를 사용한다. Windows MSI가 semver pre-release 식별자를 지원하지 않으므로(`2.13.0-rc.4` 불가), Desktop 전용 버전 관리가 필요하다.

## 해결 방안

`desktop-release.yml`에서 `version` input을 받아 빌드 전에 `tauri.conf.json`의 version 필드를 동적으로 덮어쓰는 방식:

```yaml
- name: Set desktop version
  run: |
    VERSION="${{ inputs.version || '0.1.0' }}"
    jq --arg v "$VERSION" '.version = $v' apps/desktop/src-tauri/tauri.conf.json > tmp.json
    mv tmp.json apps/desktop/src-tauri/tauri.conf.json
```

## 테스트 항목

- [ ] `desktop-v0.2.0` 태그로 빌드 시 tauri.conf.json version이 `0.2.0`으로 설정되는지 확인
- [ ] Windows MSI 패키징이 설정된 버전으로 정상 생성되는지 확인
