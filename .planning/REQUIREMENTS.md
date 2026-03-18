# Requirements: WAIaaS v32.10 에이전트 스킬 정리 + OpenClaw 플러그인

**Defined:** 2026-03-18
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v1 Requirements

### Document Structure (DOC)

- [x] **DOC-01**: docs/guides/ 디렉토리가 docs/agent-guides/로 이름 변경되고 5개 기존 가이드가 유지된다
- [x] **DOC-02**: README.md 내 docs/guides/ 경로 참조가 docs/agent-guides/로 업데이트된다
- [x] **DOC-03**: site/index.html 내 docs/guides GitHub 링크가 docs/agent-guides/로 업데이트된다
- [x] **DOC-04**: 코드베이스 내 모든 docs/guides/ 참조가 docs/agent-guides/로 업데이트된다 (아카이브 제외)
- [ ] **DOC-05**: docs/admin-manual/README.md 인덱스 파일이 8개 매뉴얼 페이지를 안내한다
- [ ] **DOC-06**: docs/admin-manual/setup-guide.md가 설치·초기화·첫 시작 절차를 안내한다
- [ ] **DOC-07**: docs/admin-manual/daemon-operations.md가 데몬 운영·Kill Switch·설정·백업을 안내한다
- [ ] **DOC-08**: docs/admin-manual/wallet-management.md가 지갑 CRUD·세션·Owner 설정을 안내한다
- [ ] **DOC-09**: docs/admin-manual/policy-management.md가 정책 CRUD·16 정책 타입을 안내한다
- [ ] **DOC-10**: docs/admin-manual/defi-providers.md가 DeFi Provider 설정·API 키를 안내한다
- [ ] **DOC-11**: docs/admin-manual/credentials.md가 Credential 관리를 안내한다
- [ ] **DOC-12**: docs/admin-manual/erc8004-setup.md가 ERC-8004 Provider·레지스트리 설정을 안내한다
- [ ] **DOC-13**: docs/admin-manual/erc8128-setup.md가 ERC-8128 기능 활성화·도메인 정책을 안내한다
- [ ] **DOC-14**: site/build.mjs EXCLUDE_DIRS에서 admin-manual이 제거되어 빌드 대상에 포함된다
- [ ] **DOC-15**: docs/admin-manual/ 8개 파일에 frontmatter(title, description, keywords)가 작성된다

### Skill Cleanup (SKL)

- [ ] **SKL-01**: skills/admin.skill.md가 skills/에서 제거되고 내용이 docs/admin-manual/daemon-operations.md에 포함된다
- [ ] **SKL-02**: skills/setup.skill.md가 skills/에서 제거되고 내용이 docs/admin-manual/setup-guide.md에 포함된다
- [ ] **SKL-03**: wallet.skill.md에서 masterAuth 내용(지갑 CRUD, 세션 관리, Owner 관리 등)이 제거되고 sessionAuth 내용만 잔존한다
- [ ] **SKL-04**: transactions.skill.md에서 masterAuth 내용(정책 사전 설정 안내)이 제거된다
- [ ] **SKL-05**: policies.skill.md에서 masterAuth 내용(정책 CRUD POST/PUT/DELETE)이 제거되고 GET 조회만 잔존한다
- [ ] **SKL-06**: actions.skill.md에서 masterAuth 내용(Provider 설정, API 키 등록)이 제거되고 DeFi 실행/조회만 잔존한다
- [ ] **SKL-07**: external-actions.skill.md에서 masterAuth 내용(Credential CRUD)이 제거되고 액션 실행/조회만 잔존한다
- [ ] **SKL-08**: erc8004.skill.md에서 masterAuth 내용(Provider 활성화, 레지스트리 설정)이 제거되고 에이전트 등록/실행만 잔존한다
- [ ] **SKL-09**: erc8128.skill.md에서 masterAuth 내용(기능 활성화, 도메인 정책)이 제거되고 HTTP 서명/검증만 잔존한다
- [ ] **SKL-10**: skills/ 디렉토리에 masterAuth 엔드포인트 참조가 0건이다
- [ ] **SKL-11**: sync-skills.mjs가 admin/setup 스킬 파일을 복사하지 않는다
- [ ] **SKL-12**: openclaw.ts 인스톨러에서 WAIAAS_MASTER_PASSWORD 출력이 제거된다

### OpenClaw Plugin (OCP)

- [x] **OCP-01**: packages/openclaw-plugin/openclaw.plugin.json 매니페스트가 유효하다 (id, name, description, configSchema)
- [x] **OCP-02**: packages/openclaw-plugin/package.json이 @waiaas/sdk 의존성과 openclaw peerDependency를 선언한다
- [x] **OCP-03**: register() 함수가 동기적으로 ~22개 sessionAuth 도구를 api.registerTool()로 등록한다
- [x] **OCP-04**: Wallet 도구 그룹(get_wallet_info, get_balance, connect_info 등)이 등록된다
- [x] **OCP-05**: Transfer 도구 그룹(transfer, token_transfer, get_transaction, list_transactions)이 등록된다
- [x] **OCP-06**: DeFi 도구 그룹(swap, bridge, stake, unstake, lend, borrow 등)이 등록된다
- [x] **OCP-07**: NFT 도구 그룹(list_nfts, transfer_nft)이 등록된다
- [x] **OCP-08**: Utility 도구 그룹(sign_message, get_price, contract_call, approve, batch)이 등록된다
- [x] **OCP-09**: 플러그인이 sessionToken으로만 동작하고 masterAuth 도구를 등록하지 않는다
- [x] **OCP-10**: 각 도구의 inputSchema가 JSON Schema 형식으로 올바르게 정의된다
- [x] **OCP-11**: 도구 핸들러가 @waiaas/sdk를 통해 WAIaaS daemon API를 정상 호출한다
- [x] **OCP-12**: register() 테스트에서 ~22개 도구 등록 + masterAuth 도구 미등록이 검증된다
- [x] **OCP-13**: 패키지 빌드가 성공하고 dist/ 출력물이 올바르다

### CI/CD & Documentation (CID)

- [x] **CID-01**: release-please-config.json에 packages/openclaw-plugin이 추가된다
- [x] **CID-02**: .release-please-manifest.json에 packages/openclaw-plugin 초기 버전이 추가된다
- [x] **CID-03**: turbo.json에 openclaw-plugin 빌드/테스트/린트 태스크가 추가된다
- [x] **CID-04**: npm trusted publishing 파이프라인에서 @waiaas/openclaw-plugin이 퍼블리시된다
- [x] **CID-05**: docs/agent-guides/openclaw-integration.md가 플러그인 방식(권장) + 스킬 방식(레거시) 구조로 업데이트된다
- [x] **CID-06**: openclaw-integration.md에서 admin/setup 스킬 참조가 제거된다
- [x] **CID-07**: docs/seo/openclaw-plugin.md SEO 랜딩 페이지가 작성된다
- [x] **CID-08**: sitemap.xml에 admin-manual 8페이지 + openclaw-plugin 페이지가 추가된다
- [x] **CID-09**: llms-full.txt에 admin-manual 내용이 포함된다

## v2 Requirements

### Plugin Extensions

- **OCP-EXT-01**: OpenClaw 채널/백그라운드 서비스 플러그인
- **OCP-EXT-02**: 도구 이름/스키마 커스터마이징 옵션
- **OCP-EXT-03**: Provider별 동적 도구 등록 (DeFi provider당 개별 도구)

## Out of Scope

| Feature | Reason |
|---------|--------|
| MCP 서버 변경 | 기존 MCP 42도구는 변경 불필요, OpenClaw은 별도 패키지 |
| 기존 REST API 변경 | 플러그인은 SDK를 래핑, API 레이어 변경 없음 |
| Python SDK OpenClaw 연동 | TypeScript 플러그인만 대상, Python은 별도 마일스톤 |
| OpenClaw 채널 플러그인 | 비목표로 명시, v2로 보류 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOC-01 | Phase 452 | Complete |
| DOC-02 | Phase 452 | Complete |
| DOC-03 | Phase 452 | Complete |
| DOC-04 | Phase 452 | Complete |
| DOC-05 | Phase 453 | Pending |
| DOC-06 | Phase 453 | Pending |
| DOC-07 | Phase 453 | Pending |
| DOC-08 | Phase 453 | Pending |
| DOC-09 | Phase 453 | Pending |
| DOC-10 | Phase 453 | Pending |
| DOC-11 | Phase 453 | Pending |
| DOC-12 | Phase 453 | Pending |
| DOC-13 | Phase 453 | Pending |
| DOC-14 | Phase 453 | Pending |
| DOC-15 | Phase 453 | Pending |
| SKL-01 | Phase 453 | Pending |
| SKL-02 | Phase 453 | Pending |
| SKL-03 | Phase 453 | Pending |
| SKL-04 | Phase 453 | Pending |
| SKL-05 | Phase 453 | Pending |
| SKL-06 | Phase 453 | Pending |
| SKL-07 | Phase 453 | Pending |
| SKL-08 | Phase 453 | Pending |
| SKL-09 | Phase 453 | Pending |
| SKL-10 | Phase 453 | Pending |
| SKL-11 | Phase 453 | Pending |
| SKL-12 | Phase 453 | Pending |
| OCP-01 | Phase 454 | Complete |
| OCP-02 | Phase 454 | Complete |
| OCP-03 | Phase 454 | Complete |
| OCP-04 | Phase 454 | Complete |
| OCP-05 | Phase 454 | Complete |
| OCP-06 | Phase 454 | Complete |
| OCP-07 | Phase 454 | Complete |
| OCP-08 | Phase 454 | Complete |
| OCP-09 | Phase 454 | Complete |
| OCP-10 | Phase 454 | Complete |
| OCP-11 | Phase 454 | Complete |
| OCP-12 | Phase 454 | Complete |
| OCP-13 | Phase 454 | Complete |
| CID-01 | Phase 455 | Complete |
| CID-02 | Phase 455 | Complete |
| CID-03 | Phase 455 | Complete |
| CID-04 | Phase 455 | Complete |
| CID-05 | Phase 455 | Complete |
| CID-06 | Phase 455 | Complete |
| CID-07 | Phase 455 | Complete |
| CID-08 | Phase 455 | Complete |
| CID-09 | Phase 455 | Complete |

**Coverage:**
- v1 requirements: 48 total
- Mapped to phases: 48
- Unmapped: 0

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after roadmap creation*
