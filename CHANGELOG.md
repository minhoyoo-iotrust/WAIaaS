# Changelog

## [2.2.2-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.2.1-rc.1...v2.2.2-rc.1) (2026-02-18)


### Bug Fixes

* trigger stable release after prerelease removal ([7d4656a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7d4656ab28ed2b0616682692c166338c22d907d8))
* use fix: prefix in promote-release for release-please trigger ([289b7b6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/289b7b68608c44703222bfb5605e1c6fa8cd5238))

## [2.2.1-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.2.0-rc.1...v2.2.1-rc.1) (2026-02-18)


### Bug Fixes

* **ci:** resolve daemon path without exports subpath in smoke test ([9c1d708](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9c1d7086e6ccf7ba7fc489148a9e10d2e0f93ccf))
* **ci:** resolve daemon path without exports subpath in smoke test ([5686665](https://github.com/minhoyoo-iotrust/WAIaaS/commit/568666537466dcad770ec69d6a521513062b57cb))

## [2.2.0-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.1.4-rc.1...v2.2.0-rc.1) (2026-02-18)


### Features

* **182-01:** add TabNav, FieldGroup components and FormField description prop ([ad1e6c3](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ad1e6c3f43c5d406ae463e58740913560d91c551))
* **182-02:** add PageHeader subtitle and Breadcrumb component ([1ca647a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1ca647a2e3db1d77eb7650cd3d1efb9e8ebed162))
* **183-01:** update sidebar to 7 menus with Security/System, add route redirects ([47cc832](https://github.com/minhoyoo-iotrust/WAIaaS/commit/47cc8321dd8d493b678b2bba93f5d04ae4fb2d93))
* **183-02:** create Security page with Kill Switch, AutoStop Rules, JWT Rotation tabs ([dfb22ee](https://github.com/minhoyoo-iotrust/WAIaaS/commit/dfb22ee4e1259454a326e9c6aab6ee416ec54157))
* **183-02:** wire SecurityPage into layout.tsx router ([c7c9fd8](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c7c9fd85010bc8aa687b375170ea77dbe06fe892))
* **183-03:** add TabNav + Breadcrumb to Wallets, Sessions, Policies, Notifications pages ([2f325dc](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2f325dc27205b59a4597d4c63750bfe15935b851))
* **183-03:** create System page with 6 sections (API Keys, Oracle, Display, Rate Limit, Log Level, Danger Zone) ([31b644f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/31b644f487f8746c7b1e5f92897f3fb97c73f539))
* **184-01:** add relay_url and session label mappings to settings-helpers ([d8608d1](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d8608d1e12bb61d75b493def115a90a6d6534a04))
* **184-01:** implement RPC, Balance Monitoring, WalletConnect tabs in wallets page ([69dd846](https://github.com/minhoyoo-iotrust/WAIaaS/commit/69dd84675b4594793fa8cbf6b31ba888120b8374))
* **184-02:** implement Notifications Settings tab and Security AutoStop FieldGroups ([c02e577](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c02e5772d8be16aaffde21cfa045b4473858d87a))
* **184-02:** implement Sessions Settings tab and Policies Defaults tab ([a0cd3d2](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a0cd3d29961725c8c243cddefe5b735bfcaeff61))
* **185-01:** create settings search index and search popover component ([7012bb1](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7012bb1bc717d23d2b55b8c9f59b2d750df25c28))
* **185-01:** wire search into header with Ctrl+K shortcut and field highlight ([5e7a151](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5e7a15163d4b8b0cff841db01b683e97c8b3cbb8))
* **185-02:** add dirty guard registry and unsaved changes dialog ([a52c351](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a52c351e7e54a218799d07a8687238603cd7bc15))
* **185-02:** wire dirty guard into TabNav, sidebar, and all settings pages ([3b651b8](https://github.com/minhoyoo-iotrust/WAIaaS/commit/3b651b80add235e923e5c4672d34e91b069fd484))
* **186-01:** add description help text to all settings FormField components ([9e5d112](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9e5d112b20c1b550ea8b595fa6deadeb8620c60f))
* **186-01:** update README.md Admin UI section to 7-menu structure ([ba0a721](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ba0a72128f2efe6bbc92db2d64fbff391fbe6e4f))


### Bug Fixes

* **187-01:** CurrencySelect highlight and duplicate search index ID ([0a21d5d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0a21d5df0438d66e135faa0d7f93e598d871ccfe))
* **admin:** lower coverage thresholds to match v2.3 actual coverage ([b144c1b](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b144c1bbe0abe5ce02e9374b632f18db5296e1b4))
* **ci:** update stale test text and fix affected detection on push ([d15c95b](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d15c95b6aa57ab1285f463651695ad686fe27f14))
* **ci:** update stale test text and fix affected detection on push ([cb42573](https://github.com/minhoyoo-iotrust/WAIaaS/commit/cb4257387e58dfe291e6f0b8bfbaafa875bb004a))
* include Admin UI static files in daemon npm package ([6c05879](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6c058794b4fe0f40fdbe32919e8a8643dc0a37fc)), closes [#084](https://github.com/minhoyoo-iotrust/WAIaaS/issues/084)


### Code Refactoring

* **183-01:** extract shared settings helpers to utils/settings-helpers.ts ([f80bf31](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f80bf31da0ee1cb4f6e7fcb802f29dd879b9a443))

## [2.1.4-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.1.3-rc.1...v2.1.4-rc.1) (2026-02-18)


### Bug Fixes

* use pnpm publish with prerelease tag detection in release workflow ([b06f03b](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b06f03b84aac7816d8e447332a9fecff740cd469))
* use pnpm publish with prerelease tag detection in release workflow ([3fd683e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/3fd683e19b2f54454af75d19d27ebdd020640d28))

## [2.1.3-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.1.2-rc.1...v2.1.3-rc.1) (2026-02-18)


### Bug Fixes

* **178:** revise plans based on checker feedback ([f493fcc](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f493fcc240101a9ac6c3c97967cbaf7eb562c0a0))
* **181-01:** restore coverage thresholds to original levels ([ed2db15](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ed2db1525c311c838be95e861bdac7cf233eb921))
* resolve 3 open issues ([#078](https://github.com/minhoyoo-iotrust/WAIaaS/issues/078) [#079](https://github.com/minhoyoo-iotrust/WAIaaS/issues/079) [#080](https://github.com/minhoyoo-iotrust/WAIaaS/issues/080)) ([1b493ed](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1b493edeb15fb56d3856d63978b98d70a73f6197))
* resolve lint errors in adapter-solana test files ([18dd767](https://github.com/minhoyoo-iotrust/WAIaaS/commit/18dd767f977f309055ff9c02f383c25d37de8b9b))
* resolve lint errors in adapter-solana test files ([f141cf6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f141cf6306b56a4988264c7b55353634d96280f5))
* resolve typecheck errors in adapter-solana tests ([4ff6218](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4ff6218afcf18c4a9ad23a2cb2d1edcb55ff4d2a))

## [2.1.2-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.1.1-rc.1...v2.1.2-rc.1) (2026-02-18)


### Bug Fixes

* remove duplicate path prefix in smoke test pnpm pack output ([#077](https://github.com/minhoyoo-iotrust/WAIaaS/issues/077)) ([d400ed0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d400ed06e36bd1721763ab72f563a462c3b76eaa))

## [2.1.1-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.1.0-rc.1...v2.1.1-rc.1) (2026-02-18)


### Bug Fixes

* use pnpm pack instead of npm pack in smoke test ([#076](https://github.com/minhoyoo-iotrust/WAIaaS/issues/076)) ([09ba1c1](https://github.com/minhoyoo-iotrust/WAIaaS/commit/09ba1c106c9cd825d7826291e41f84e4463a0b29))

## [2.1.0-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.0.0-rc.1...v2.1.0-rc.1) (2026-02-18)


### Features

* **172-01:** add OpenAPI validation step to release.yml test job ([2511294](https://github.com/minhoyoo-iotrust/WAIaaS/commit/251129443a9303c11a0dd7daa5e624aa1b1ba6b2))
* add npm package smoke test — pack + install + import verification ([899ee8f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/899ee8f66313ec8328d8d5a975d926457ca36d81))
* wallet auto-session, session TTL extension, README rewrite, CLAUDE.md translation ([b1c8f02](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b1c8f02ede516bafdfd67d455af501012023c59c))


### Bug Fixes

* **171:** revise plans based on checker feedback ([5a4260c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5a4260c68f0be338b6e1f01cd2483dca327c34c3))
* **docs:** correct skill names, broken links, and hardcoded version ([0c831ae](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0c831ae56bffe7ff4bb15db8e5dd44cdf1b41470))
* remove hardcoded release-as from release-please config ([0b08ddc](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0b08ddc3882d4b83c6764df062ce81c18e72c54b))
* update validate-openapi.ts [@see](https://github.com/see) path after doc reorganization ([2780c7f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2780c7f60e542561f2a50140020086eaa2244d9a))

## [2.0.0-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.0.0-rc.1...v2.0.0-rc.1) (2026-02-17)


### Features

* [#048](https://github.com/minhoyoo-iotrust/WAIaaS/issues/048) Owner 자산 회수(Withdraw) REST API 구현 ([3f1bb8f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/3f1bb8f55358934b1e425dd80e47fcb741946dd0))
* **125-02:** implement InMemoryPriceCache ([318b043](https://github.com/minhoyoo-iotrust/WAIaaS/commit/318b043989f1c8831987fbaceb99442c3287a183))
* **125-02:** implement IPriceOracle types + classifyPriceAge ([8ab3e64](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8ab3e64226e60f9cf03550b5aa7f91b0b5fa4cf2))
* **126-01:** PythOracle implements IPriceOracle -- Hermes REST API (GREEN) ([c16b022](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c16b02279d46a37b48fb814b8c2e25af0569736e))
* **126-02:** CoinGeckoOracle implements IPriceOracle -- Demo API (GREEN) ([93097d1](https://github.com/minhoyoo-iotrust/WAIaaS/commit/93097d1aed56e67617648ffcf92bf3be5166f0bc))
* **126-03:** OracleChain 3단계 fallback + 교차 검증 + GET /admin/oracle-status (GREEN) ([4c59e44](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4c59e4499fc98337628e64bc650da8eb1a3becd8))
* **127-01:** PriceResult 3-state + resolveEffectiveAmountUsd 5-type 구현 (GREEN) ([6d16736](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6d16736477c5bd5e1a11564e0c6c84304222ca86))
* **127-02:** SpendingLimitRulesSchema Zod SSoT + evaluateSpendingLimit USD 분기 ([ff3c8c0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ff3c8c099a1560bd5fe1551639a3e9b304fedbb6))
* **127-03:** OracleChain DI 연결 + PipelineContext priceOracle 주입 ([e75fb18](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e75fb1823b545fc323bce8a75bf389c82984c0e7))
* **127-03:** Stage 3 파이프라인 USD 통합 + notListed 격상 + oracleDown fallback + 힌트 ([9793d80](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9793d80611e01fe7085bf7ecdb2c9c617952413f))
* **128-01:** ActionProviderRegistry 구현 + 단위 테스트 20개 ([992bb8c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/992bb8c41b8d5a514432b9edacd2e90ca886edd0))
* **128-01:** IActionProvider Zod SSoT 인터페이스 정의 + API_KEY_REQUIRED 에러 코드 ([8625f48](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8625f4829f2723c35e44ac562e953cc838decadc))
* **128-02:** api_keys 테이블 Drizzle 스키마 + DB v11 마이그레이션 ([4f1c113](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4f1c1134e6c42fe0e6d600c22510f3fe2ca63fb8))
* **128-02:** ApiKeyStore 암호화 저장소 + 단위 테스트 14개 ([deb6b6d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/deb6b6d0ebff62925bb068c4d2da879ca61054b9))
* **128-03:** POST /v1/actions/:provider/:action REST API + DaemonLifecycle Step 4f ([a0c9aa3](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a0c9aa3d35a00c685d4299e28908c78883b59e06))
* **128-04:** Admin UI API Keys 섹션 + 엔드포인트 상수 ([c6ad400](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c6ad40033b6917f428a294fb41fa1304f83e3ee9))
* **128-04:** GET/PUT/DELETE /v1/admin/api-keys REST API + 통합 테스트 ([d5702ac](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d5702aca603f2f9b8a3f15bb4664cd4d9d0a2534))
* **129-01:** Action Provider -&gt; MCP Tool 자동 변환 함수 구현 ([7938b28](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7938b285c8b9f09089fc9e640d25293c59df0999))
* **129-01:** index.ts 통합 + Action Provider MCP 도구 단위 테스트 ([c3d60e2](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c3d60e2cfe27b9f934cd96fe5d1fe017072eb4e9))
* **129-02:** actions.skill.md v1.5.0 신규 생성 -- Action Provider REST API 문서화 ([495aaf4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/495aaf4ac264ebea59aa7ce540581506497ba6f2))
* **129-02:** admin.skill.md v1.5.0 -- oracle-status + api-keys 섹션 추가 ([146944c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/146944c7357281dda94eec309c7823d68f368e46))
* **130-01:** @x402/core 의존성 + Enum 확장 + x402.types.ts + 에러 코드 + i18n ([12225c6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/12225c603ce99a7c131fa80282d237234ae9a04b))
* **130-02:** v12 DB 마이그레이션 추가 (transactions + policies CHECK 제약 갱신) ([9d54973](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9d54973268c1fc5a369ab800b9f2cdbab277d192))
* **131-01:** SSRF 가드 구현 (GREEN) -- 54개 테스트 전체 통과 ([e6fd24b](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e6fd24bd964d53066068803c42a22345a9c7859f))
* **131-02:** x402 핸들러 구현 (GREEN) ([0681e3f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0681e3f98ce3404ca9ee95634ababa3f57b08e3b))
* **131-03:** 결제 서명 모듈 구현 (GREEN) -- EVM EIP-3009 + Solana TransferChecked ([d9d4311](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d9d431104912f1e3872b351cc3170b78f9d1ad88))
* **132-01:** config.toml [x402] 섹션 추가 (enabled, request_timeout) ([9763da9](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9763da96f04fa6f426d366a36c9bfe2124944271))
* **132-01:** matchDomain + evaluateX402Domain 도메인 정책 평가 구현 ([9252c8d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9252c8dd09110944c95a2a3f19f2fecfcc433ce6))
* **132-02:** x402 결제 금액 USD 환산 모듈 구현 (GREEN) ([cd24aca](https://github.com/minhoyoo-iotrust/WAIaaS/commit/cd24aca57b4a3ff1029cc06ea9e31f49e7c34c35))
* **132-03:** POST /v1/x402/fetch 라우트 + 오케스트레이션 구현 ([7a48e23](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7a48e23ef161e9e9c5010ab9f2b36ada5e87ce78))
* **132-03:** server.ts에 x402 라우트 등록 + sessionAuth 경로 매핑 ([b5f300a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b5f300a9b7211d4633128460e005407901f96448))
* **133-01:** Python SDK x402_fetch 모델 + 메서드 + 5개 테스트 ([17f757d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/17f757d44ec0b8d611b7517cf22e821dec99a5ce))
* **133-01:** TS SDK x402Fetch 타입 + 메서드 + 4개 테스트 ([52f1b3b](https://github.com/minhoyoo-iotrust/WAIaaS/commit/52f1b3b089733c72b87d97f26a83d80caa424aa2))
* **133-02:** MCP x402_fetch 도구 + 6개 테스트 + server.ts 등록 ([53ed76d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/53ed76d4975d436d1ac470622175e227e0749e89))
* **133-02:** x402.skill.md + transactions.skill.md 갱신 + VALID_SKILLS/SKILL_NAMES 등록 (7개) ([8888fd8](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8888fd8604bb25a0885a43595e8fa4ac4d926ebb))
* **134-01:** 4개 미등록 PolicyType Zod rules 스키마 추가 ([0fe0852](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0fe085238a7b2bffbff94fe469e989620e55d4e5))
* **134-01:** DynamicRowList + PolicyFormRouter + JSON 토글 + policies.tsx 리팩터링 ([b3b65be](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b3b65beb1a07482c0a0fa52a13d888b81d8ea544))
* **134-02:** 5개 타입 전용 폼 컴포넌트 + PolicyFormRouter 통합 + 유효성 검증 ([6f6dc5f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6f6dc5f061bc1b1658031cf61285421d9195eb51))
* **135-01:** 7개 타입 전용 폼 컴포넌트 + PolicyFormRouter 12-type 통합 ([f846423](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f846423239dfafd187d246c651322d407a01cd8f))
* **135-01:** validateRules 7개 타입 유효성 검증 추가 ([1195b51](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1195b51ab69496b37f3d660d060daa118e4aa635))
* **135-02:** PolicyRulesSummary 12-type 시각화 + 수정 모달 전용 폼 프리필/저장 통합 ([71ac3ff](https://github.com/minhoyoo-iotrust/WAIaaS/commit/71ac3ff622be9821677ff3197905d8deb75ee890))
* **136-01:** DB v13 마이그레이션 + Drizzle 스키마 + SpendingLimitRulesSchema 확장 ([90e5adb](https://github.com/minhoyoo-iotrust/WAIaaS/commit/90e5adb5a9414fa75cf2e1df27b183b30d3750ad))
* **136-01:** evaluateAndReserve USD 기록 + releaseReservation 확장 + v13 마이그레이션 테스트 ([edd1db7](https://github.com/minhoyoo-iotrust/WAIaaS/commit/edd1db79819aa5d96eed3fba6a2b48232e5694db))
* **136-02:** evaluateAndReserve 누적 USD 집계 + APPROVAL 격상 + Stage 3 알림 + 테스트 ([acd5d7d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/acd5d7d1208babbb034c2804520dbe456fb2488e))
* **136-02:** PolicyEvaluation 확장 + CUMULATIVE_LIMIT_WARNING 이벤트 + approval-workflow USD 클리어 ([a9cce6c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a9cce6c96be1aa9aed6c56f940ada90d6e13057e))
* **137-01:** PolicyRulesSummary 누적 한도 시각화 + CSS 스타일 추가 ([04ce084](https://github.com/minhoyoo-iotrust/WAIaaS/commit/04ce084ed2a0b1ff6fae303b0afd173b414fa2e3))
* **137-01:** SpendingLimitForm 누적 한도 입력 필드 + 검증 로직 추가 ([f5aabcc](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f5aabccdb639a7a1cf38065e37d2daada6f15548))
* **137-02:** TS/Python SDK에 SpendingLimitRules 타입 추가 ([f9bcd70](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f9bcd702786cc354e47f9302c6ba69cdf465a781))
* **138-01:** formatDisplayCurrency 유틸리티 + GET /admin/forex/rates + 테스트 39개 ([932c8d0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/932c8d07c59820f18c83bc0a53e9abddab502c37))
* **138-01:** IForexRateService 인터페이스 + CoinGeckoForexProvider + ForexRateService + 43개 통화 메타데이터 ([fd19184](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fd1918404fd3bdc9d1530a031cc5555342d30155))
* **138-02:** Admin Settings 통화 드롭다운 (CurrencySelect) + Display 섹션 + CSS ([a84a0d7](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a84a0d71a41d885ad708278994c7c93ad201e117))
* **138-02:** config.toml display 섹션 + SettingsService display 카테고리 + ForexRateService daemon 통합 ([1a8a777](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1a8a7773eaab549447597d6c459ade72c737ac87))
* **139-01:** Admin UI 환산 표시 유틸리티 + 대시보드 amountUsd 통합 ([fd6433c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fd6433c105a5864b90cedc54fc9a1c51fe7e26d9))
* **139-01:** 알림 메시지에 display_amount 환산 금액 통합 ([358f8f6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/358f8f6d1aef74275cb0f213f07fe07c96a95651))
* **139-02:** MCP 도구 display_currency 파라미터 + 스킬 파일 동기화 ([272a84f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/272a84f52577667da1b46504e5aa55dcdc5ecbd0))
* **139-02:** REST API 4개 엔드포인트에 display_currency 쿼리 파라미터 + 환산 필드 추가 ([621c26f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/621c26f281b478e23750f5ee2aaa0d5b09af82fa))
* **140-01:** EventBus 인프라 + 이벤트 타입 정의 ([d666c46](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d666c46c708d7df746be9b8d57d2c581fd746825))
* **140-01:** 파이프라인 + 라우트에서 EventBus 이벤트 동시 발행 ([fe11fba](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fe11fbaa4fdb2b3971e4598ab7378f621a1b93b4))
* **140-02:** DB v14 마이그레이션 + kill_switch_state 값 변환 ([11467f6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/11467f64ca464fbb95304354dfefcaffd0bb0297))
* **140-02:** KillSwitchService 3-state 상태 머신 + CAS ACID 패턴 ([ba86248](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ba86248ae99ebedddf282b7ef4fce7de1748aaff))
* **140-03:** Kill Switch 6-step cascade + killSwitch 미들웨어 3-state 리팩토링 ([d014554](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d0145541051fd5d2d141e11883aab2916cd0edd4))
* **140-03:** Kill Switch REST API + dual-auth 복구 + DaemonLifecycle 통합 ([6c1348c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6c1348ce22648dcdfbd223572ac28aea4b2881da))
* **141-01:** AutoStopService 4 규칙 엔진 + EventBus 구독 구현 ([19d3e96](https://github.com/minhoyoo-iotrust/WAIaaS/commit/19d3e965760a4c4f1a55d6fd9b708eca8480b78b))
* **141-02:** AutoStop config.toml 6개 키 + Admin Settings autostop 카테고리 + i18n 범용 템플릿 ([7f3fc81](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7f3fc81d85049eea426778dc853d395ff01fa2b7))
* **141-02:** DaemonLifecycle AutoStop 통합 + hot-reload + 16개 통합 테스트 ([414d601](https://github.com/minhoyoo-iotrust/WAIaaS/commit/414d6016d1c81e74d7db4ba826a0012b133c3a49))
* **142-01:** BalanceMonitorService 코어 구현 + 15개 단위 테스트 ([62d1537](https://github.com/minhoyoo-iotrust/WAIaaS/commit/62d15377756f1001623f8ae154855ee571080ab1))
* **142-01:** LOW_BALANCE NotificationEventType + i18n 템플릿 추가 ([1bc0bc8](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1bc0bc8834fe19e66d4f7c1f2fbb748138ca67ac))
* **142-02:** config.toml monitoring flat key + Admin Settings + HotReload 통합 ([fddad2d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fddad2d996af3669482a4469b565d4c7f4a678df))
* **142-02:** DaemonLifecycle 통합 + 통합 테스트 14개 ([c390646](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c39064672f7fb5669788f36a20e2bc409ed658bd))
* **143-01:** DB 마이그레이션 v15 + Drizzle 스키마 + config/settings 확장 ([215bdd8](https://github.com/minhoyoo-iotrust/WAIaaS/commit/215bdd824604f332e61434ba3e3e85b794175b00))
* **143-01:** TelegramBotService Long Polling + /start, /help, /status + DaemonLifecycle + i18n ([430205a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/430205a8d02057f57d286ebc219469622d033e1b))
* **143-02:** 2-Tier 인증 + /wallets, /pending, /approve, /reject 명령어 ([f601b04](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f601b040f219abfd82605273dd5f56995ea00ad2))
* **143-02:** Admin REST API -- telegram_users 관리 엔드포인트 3개 ([173432e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/173432e38a9e1fd7991e01fb263437a552e5d948))
* **143-03:** 인라인 키보드 빌더 + /killswitch 확인 대화 + /newsession 월렛 선택 ([9cf709d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9cf709d93b44635b3b7ddc527a71e8dec67094b5))
* **144-01:** Kill Switch 3-state UI 리팩토링 + API 엔드포인트 추가 ([e974d2a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e974d2a5408d49778c453e10a348fd9ad2673c72))
* **144-01:** Telegram Users 관리 페이지 + 사이드바 라우트 추가 ([f10dd49](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f10dd495e9ff37b2a41d630c55cffd171b8887f4))
* **144-02:** AutoStop + Balance Monitoring Settings 섹션 추가 ([5600f9c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5600f9cb78436d944d14f2a8b64692f0a2fedc35))
* **145-01:** entrypoint.sh + docker-compose.yml 생성 ([91a050a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/91a050aa11c347257c94c872a6f292380847cca7))
* **145-01:** Multi-stage Dockerfile + .dockerignore 생성 ([d40cce0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d40cce0e5ee07ae9ab36c76879773e29d6fcf935))
* **145-02:** Docker Secrets 오버라이드 compose 파일 + 보안 설정 ([23b2b31](https://github.com/minhoyoo-iotrust/WAIaaS/commit/23b2b31abf55b4fe02dd146a9d54436f7640d278))
* **146-01:** DaemonLifecycle WC 통합 (Step 4c-6 초기화 + shutdown 해제) ([112c4da](https://github.com/minhoyoo-iotrust/WAIaaS/commit/112c4da7bfe88562e839df905d2fed53dc9ed6f4))
* **146-01:** WC 인프라 - SqliteKeyValueStorage + WcSessionService + DB v16 마이그레이션 ([676454b](https://github.com/minhoyoo-iotrust/WAIaaS/commit/676454b9ee7c9063c8251c3daec3a92df9a6cdb1))
* **146-02:** hot-reload에 walletconnect 키 변경 감지 추가 ([6513dda](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6513dda728411d2dc063996e1e0afbcf3c85e31c))
* **147-01:** WC REST API 4개 엔드포인트 + OpenAPI 스키마 + 18개 단위 테스트 ([1cb8d60](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1cb8d60721f3e15c36a62340bdc4a4261d73b19f))
* **147-01:** WcSessionService 페어링/세션 관리 메서드 + CAIP-2 상수 + 에러 코드 ([54563b4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/54563b4e5e0fa7927c3ef29af61d7855712cb204))
* **147-02:** Admin UI WalletConnect QR 모달 + 세션 관리 섹션 ([7667967](https://github.com/minhoyoo-iotrust/WAIaaS/commit/76679678c65b6c2286003ed42fdae3b1b0932132))
* **147-02:** CLI owner connect/disconnect/status 명령어 + qrcode 터미널 출력 ([bc5f9e0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bc5f9e0f4b848821d27dbc2d6122700e98132595))
* **148-01:** stage4Wait WC 연동 + 전체 DI 배선 ([a1eb63f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a1eb63f22bf7d5f25155f85748bc2d5f1d55af6e))
* **148-01:** WcSigningBridge 서비스 생성 ([9edaa57](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9edaa576436af80220cb85ab1c687b9044dbe6ec))
* **149-01:** EventBus 이벤트 + 알림 타입 + i18n 템플릿 추가 ([e0e51c2](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e0e51c2cfcc2b357242d34d746368792ada8fe5a))
* **149-01:** WcSigningBridge Telegram fallback + approval_channel 추적 + DI 배선 ([aaadc33](https://github.com/minhoyoo-iotrust/WAIaaS/commit/aaadc33eab07ce237837510a850a5ae0fae3a731))
* **150-01:** Admin UI WalletConnect 전용 관리 페이지 ([9381b42](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9381b42654f0b37435073b724df8d1178838a178))
* **150-01:** session-scoped WC REST endpoints (/v1/wallet/wc/*) ([3cb2ae1](https://github.com/minhoyoo-iotrust/WAIaaS/commit/3cb2ae1a29cb862e46819aba605b02c144917163))
* **150-02:** MCP ApiClient.delete() + 3 WC 도구 (wc_connect, wc_status, wc_disconnect) ([8887fbd](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8887fbdffeefc3f1fac70b7f9fd47578840d9f18))
* **150-02:** TS/Python SDK WC 메서드 + Skill 파일 WalletConnect 섹션 ([b0c698a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b0c698aa5ab8aa7e9f3f4bef4a1c73a8ce4efdff))
* **151-01:** Turborepo 5개 테스트 태스크 분리 + 패키지 스크립트 ([c01cc18](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c01cc18956e00e2829772022473dc7c4a40b8fcd))
* **151-02:** MockOnchainOracle + MockPriceOracle + MockActionProvider (M8-M10) + barrel export + 검증 테스트 ([bc27c0d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bc27c0d7b50971efd439f1708c3bcbf387f5de31))
* **151-02:** msw 2.x 설치 + Jupiter/가격 API msw 핸들러 (M6, M7) ([46a01da](https://github.com/minhoyoo-iotrust/WAIaaS/commit/46a01da251671926eb7d00e56df3135c3198a981))
* **152-01:** Enum SSoT 빌드타임 검증 스크립트 + DB 일관성 테스트 ([452d406](https://github.com/minhoyoo-iotrust/WAIaaS/commit/452d406897d5de5e325cdf9992e77a74bee9ba91))
* **160-01:** BackgroundWorkers runImmediately + VersionCheckService 구현 ([8ad9759](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8ad9759584731510a779ff8be6c588ffb2880654))
* **160-02:** GET /health에 latestVersion, updateAvailable, schemaVersion 필드 추가 ([57352eb](https://github.com/minhoyoo-iotrust/WAIaaS/commit/57352ebaf9387cc92f585c04aa248c6fb3bc97f1))
* **161-01:** CLI 업그레이드 알림 모듈 구현 ([b03eba2](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b03eba24299e4d0259559c6370a34c52764f8df2))
* **161-02:** BackupService 구현 + barrel export ([b0b011c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b0b011ce33513f212ed2da98a10cb697391adcd2))
* **161-03:** upgrade 명령 구현 + CLI 등록 ([68bccd7](https://github.com/minhoyoo-iotrust/WAIaaS/commit/68bccd7b2c4ce184561adcbae469c53631747f96))
* **162-01:** checkSchemaCompatibility 함수 + 호환성 매트릭스 테스트 ([f8a55d6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f8a55d626f0d13e2efa8442822c6b30994192454))
* **162-01:** daemon Step 2 호환성 검사 통합 + SCHEMA_INCOMPATIBLE 에러 코드 ([f638eb4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f638eb4e8d44bbedc668105a462db4ddf49a5d4d))
* **162-02:** Dockerfile에 Watchtower + OCI 표준 라벨 추가 ([64d3c1d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/64d3c1dfc5f88b30b147be1423d328bd743a845a))
* **162-02:** release.yml에 docker-publish job 추가 (GHCR 3-tier 태깅) ([a60db52](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a60db524ca35939a2fc093b56fabaaf840fbada3))
* **163-01:** release-please 설정 파일 3종 생성 ([115e4f9](https://github.com/minhoyoo-iotrust/WAIaaS/commit/115e4f916f947bdc1df6ec2d6a58a1de59e9040e))
* **163-02:** release.yml에 deploy job 추가 (게이트 2) ([f639e61](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f639e614dd89f6c2292202f63ee212ebb1b27475))
* **164-01:** SDK HealthResponse 타입 추가 + 스킬 파일 /health 응답 동기화 ([c6ab810](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c6ab810e2d2e3abaf800467f1a00157ff3dd450d))
* **166-02:** OpenAPI 스펙 유효성 검증 스크립트 + swagger-parser 도입 ([34d44a4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/34d44a4924d39ab1dcd935cccc2229e60b8ef626))
* **169-01:** @waiaas/skills 패키지 scaffolding + 스킬 파일 번들링 ([3a59221](https://github.com/minhoyoo-iotrust/WAIaaS/commit/3a592215f9b2f78f43fd9e9b377c1324d5d1c710))
* **169-01:** CLI 구현 (list/add/help 명령) + npm publish dry-run 검증 ([e0410ab](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e0410aba3d03f44c3e90be588fe457f5c30c309b))
* **169-02:** examples/simple-agent SDK 예제 에이전트 구현 ([2573266](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2573266a8073b0082060f9ccce11480072c9e173))
* **170-02:** release.yml 전면 업데이트 -- 8패키지 publish + Docker Hub + dry-run 제거 ([5e8ef95](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5e8ef95a3650cdabd24c416f121f6d8e7f0f2638))
* v1.7 품질 강화 + CI/CD ([1ad8328](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1ad8328176f4bf65b5eb398114b3b290f98635e6))
* **v2.0:** activate RC pre-release pipeline for npm + Docker Hub ([44135cc](https://github.com/minhoyoo-iotrust/WAIaaS/commit/44135cc6b9f113c3027e29a6c9806a5258895ad5))
* 마일스톤 감사/완료 전 빌드+테스트 자동 실행 훅 추가 ([#039](https://github.com/minhoyoo-iotrust/WAIaaS/issues/039)) ([45bb693](https://github.com/minhoyoo-iotrust/WAIaaS/commit/45bb693357bc7fe37ab164a64442d4d32a05d880))


### Bug Fixes

* [#042](https://github.com/minhoyoo-iotrust/WAIaaS/issues/042) tsconfig.build.json 도입으로 빌드/테스트 분리 + [#049](https://github.com/minhoyoo-iotrust/WAIaaS/issues/049) SignClient ESM/CJS interop ([0a45e67](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0a45e6722f42b4dc0982e933a348c29a24064872))
* [#043](https://github.com/minhoyoo-iotrust/WAIaaS/issues/043) WalletConnect 미설정 시 404 대신 503 반환 + 에러 메시지 매핑 ([9c62171](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9c62171f05b0930a03c45445755fb75f8b15c6af))
* [#047](https://github.com/minhoyoo-iotrust/WAIaaS/issues/047) Terminate 시 리소스 정리 + TERMINATED 가드 적용 ([d6e353d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d6e353d444427c84dfcebf29700800fcefaf3b3b))
* **125:** revise plans based on checker feedback ([12b1854](https://github.com/minhoyoo-iotrust/WAIaaS/commit/12b1854c52b322ef476b28b1e7303f9d0df864e5))
* **167-02:** bash 3.x 호환성 수정 + Hard 커버리지 게이트 통과 ([20551d3](https://github.com/minhoyoo-iotrust/WAIaaS/commit/20551d37e44a83aaa60c2d4479e4718d140c011e))
* **167-03:** EVM Sepolia 체인 테스트 타입 오류 수정 ([8f5c60f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8f5c60f330ce54b198cb51227c534dfcfd7c67b9))
* **168:** README.ko.md 문서 링크 경로 수정 ([61442f0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/61442f0e115438fb1d870fd65970e56340a375e9))
* **admin:** Table 컴포넌트 undefined data 크래시 수정 + 테스트 카운트 갱신 ([#037](https://github.com/minhoyoo-iotrust/WAIaaS/issues/037), [#038](https://github.com/minhoyoo-iotrust/WAIaaS/issues/038)) ([f0ddcbc](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f0ddcbc5c80d2a28999216b089421b43aa7c8d7d))
* core 스냅샷 테스트 기대값 갱신 + ROADMAP Progress 테이블 수정 ([623d9dc](https://github.com/minhoyoo-iotrust/WAIaaS/commit/623d9dc4cc0841bac97c62ebe0d13dec025e7203))
* Docker builder 스테이지에서 모든 패키지 빌드 ([573257f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/573257fd6ff5b066710b0aa7c163bbfbe4319155))
* listActions() noUncheckedIndexedAccess 수정 + 목표 문서 정비 ([d5b7417](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d5b7417bbfcd7d0c3e8654ac9d9f995b04d56e58))
* lower adapter-solana branches coverage threshold to 65% ([#060](https://github.com/minhoyoo-iotrust/WAIaaS/issues/060)) ([1d29492](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1d294924aaa5456b9b8a491747e4cde8c4ca3bc9))
* lower admin functions coverage threshold to 55% ([#061](https://github.com/minhoyoo-iotrust/WAIaaS/issues/061)) ([ebf7190](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ebf71900d1363d4f9a7c99075ad651eb3951a8e5))
* lower cli lines/statements coverage threshold to 65% ([#062](https://github.com/minhoyoo-iotrust/WAIaaS/issues/062)) ([d4f86ae](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d4f86ae1cb93afc0cfbf7894bfa0dafa96cd830d))
* release-please PAT 설정 + RC 버전 수정 ([54f400e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/54f400e5c7869c0a26f1dd422480a68d39c80b82))
* release-please 액션을 googleapis/release-please-action@v4로 업그레이드 ([13ac234](https://github.com/minhoyoo-iotrust/WAIaaS/commit/13ac2345a2358b5953e486ae6ba554a3bdd90c3c))
* remove unused catch binding in EVM adapter ([65118ff](https://github.com/minhoyoo-iotrust/WAIaaS/commit/65118ff7c470360c99eda3683b64d9c2a542cdc8))
* resolve all lint errors across packages ([dcb9c3a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/dcb9c3aa6da1a93c0d6987523c39326b48babf77))
* resolve open issues [#063](https://github.com/minhoyoo-iotrust/WAIaaS/issues/063) [#064](https://github.com/minhoyoo-iotrust/WAIaaS/issues/064) — restore lint-renamed test variables ([b0436a1](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b0436a11084dcb49b642336431cbf68179d4161b))
* resolve typecheck errors in contract tests and security helpers ([e4a1241](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e4a1241d077e0b50fa65a27d55795c045d4c33ca))
* Solana setup 액션을 Anza 공식 인스톨러로 교체 ([aad10f0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/aad10f0ac6a94eb2039361adaead21364ae0ff50))
* use relative paths for CI coverage report action ([#065](https://github.com/minhoyoo-iotrust/WAIaaS/issues/065)) ([eea8085](https://github.com/minhoyoo-iotrust/WAIaaS/commit/eea8085436a7b8fd04c2f138b07c6c9332e8c52e))
* 오픈 이슈 [#058](https://github.com/minhoyoo-iotrust/WAIaaS/issues/058) [#059](https://github.com/minhoyoo-iotrust/WAIaaS/issues/059) 해결 — WC 셧다운 DB 가드 + Contract Test 커버리지 제외 ([14aa4b7](https://github.com/minhoyoo-iotrust/WAIaaS/commit/14aa4b70c408b31b98b18160e5ff9369cf63d98d))
* 오픈 이슈 5건 일괄 수정 ([#053](https://github.com/minhoyoo-iotrust/WAIaaS/issues/053)-[#057](https://github.com/minhoyoo-iotrust/WAIaaS/issues/057)) ([0c93e87](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0c93e87e2304a7172c6ae601e488dc0d2342820d))
* 이슈 [#040](https://github.com/minhoyoo-iotrust/WAIaaS/issues/040)-[#052](https://github.com/minhoyoo-iotrust/WAIaaS/issues/052) 일괄 처리 + v1.8 objective 문서 수정 ([9ba7c2c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9ba7c2c8e9a8d7e50cd1b9cc1c01d33c132fbdae))
* 이슈 033~036 수정 + 로드맵 재편 (Desktop v2.6 이연) ([04ee9ab](https://github.com/minhoyoo-iotrust/WAIaaS/commit/04ee9ab6ba35042fb6bbfa57f371f4991075db48))

## [2.0.0-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.0.0-rc.1...v2.0.0-rc.1) (2026-02-17)


### Bug Fixes

* Solana setup 액션을 Anza 공식 인스톨러로 교체 ([aad10f0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/aad10f0ac6a94eb2039361adaead21364ae0ff50))

## [2.0.0-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v1.8.0...v2.0.0-rc.1) (2026-02-17)


### Features

* **166-02:** OpenAPI 스펙 유효성 검증 스크립트 + swagger-parser 도입 ([34d44a4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/34d44a4924d39ab1dcd935cccc2229e60b8ef626))
* **169-01:** @waiaas/skills 패키지 scaffolding + 스킬 파일 번들링 ([3a59221](https://github.com/minhoyoo-iotrust/WAIaaS/commit/3a592215f9b2f78f43fd9e9b377c1324d5d1c710))
* **169-01:** CLI 구현 (list/add/help 명령) + npm publish dry-run 검증 ([e0410ab](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e0410aba3d03f44c3e90be588fe457f5c30c309b))
* **169-02:** examples/simple-agent SDK 예제 에이전트 구현 ([2573266](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2573266a8073b0082060f9ccce11480072c9e173))
* **170-02:** release.yml 전면 업데이트 -- 8패키지 publish + Docker Hub + dry-run 제거 ([5e8ef95](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5e8ef95a3650cdabd24c416f121f6d8e7f0f2638))
* **v2.0:** activate RC pre-release pipeline for npm + Docker Hub ([44135cc](https://github.com/minhoyoo-iotrust/WAIaaS/commit/44135cc6b9f113c3027e29a6c9806a5258895ad5))


### Bug Fixes

* **167-02:** bash 3.x 호환성 수정 + Hard 커버리지 게이트 통과 ([20551d3](https://github.com/minhoyoo-iotrust/WAIaaS/commit/20551d37e44a83aaa60c2d4479e4718d140c011e))
* **167-03:** EVM Sepolia 체인 테스트 타입 오류 수정 ([8f5c60f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8f5c60f330ce54b198cb51227c534dfcfd7c67b9))
* **168:** README.ko.md 문서 링크 경로 수정 ([61442f0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/61442f0e115438fb1d870fd65970e56340a375e9))
* lower adapter-solana branches coverage threshold to 65% ([#060](https://github.com/minhoyoo-iotrust/WAIaaS/issues/060)) ([1d29492](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1d294924aaa5456b9b8a491747e4cde8c4ca3bc9))
* lower admin functions coverage threshold to 55% ([#061](https://github.com/minhoyoo-iotrust/WAIaaS/issues/061)) ([ebf7190](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ebf71900d1363d4f9a7c99075ad651eb3951a8e5))
* lower cli lines/statements coverage threshold to 65% ([#062](https://github.com/minhoyoo-iotrust/WAIaaS/issues/062)) ([d4f86ae](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d4f86ae1cb93afc0cfbf7894bfa0dafa96cd830d))
* release-please PAT 설정 + RC 버전 수정 ([54f400e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/54f400e5c7869c0a26f1dd422480a68d39c80b82))
* release-please 액션을 googleapis/release-please-action@v4로 업그레이드 ([13ac234](https://github.com/minhoyoo-iotrust/WAIaaS/commit/13ac2345a2358b5953e486ae6ba554a3bdd90c3c))
* remove unused catch binding in EVM adapter ([65118ff](https://github.com/minhoyoo-iotrust/WAIaaS/commit/65118ff7c470360c99eda3683b64d9c2a542cdc8))
* resolve all lint errors across packages ([dcb9c3a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/dcb9c3aa6da1a93c0d6987523c39326b48babf77))
* resolve open issues [#063](https://github.com/minhoyoo-iotrust/WAIaaS/issues/063) [#064](https://github.com/minhoyoo-iotrust/WAIaaS/issues/064) — restore lint-renamed test variables ([b0436a1](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b0436a11084dcb49b642336431cbf68179d4161b))
* resolve typecheck errors in contract tests and security helpers ([e4a1241](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e4a1241d077e0b50fa65a27d55795c045d4c33ca))
* use relative paths for CI coverage report action ([#065](https://github.com/minhoyoo-iotrust/WAIaaS/issues/065)) ([eea8085](https://github.com/minhoyoo-iotrust/WAIaaS/commit/eea8085436a7b8fd04c2f138b07c6c9332e8c52e))
* 오픈 이슈 [#058](https://github.com/minhoyoo-iotrust/WAIaaS/issues/058) [#059](https://github.com/minhoyoo-iotrust/WAIaaS/issues/059) 해결 — WC 셧다운 DB 가드 + Contract Test 커버리지 제외 ([14aa4b7](https://github.com/minhoyoo-iotrust/WAIaaS/commit/14aa4b70c408b31b98b18160e5ff9369cf63d98d))

## [Unreleased]

### Added
- User-facing documentation: README, CONTRIBUTING, deployment guide, API reference
- OpenAPI spec validation in CI (swagger-parser)
- Security test suite verification (460 tests)
- Coverage gate for CI pipeline
- Platform compatibility tests (macOS + Linux)

## [1.8.0](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v1.7.0...v1.8.0) (2026-02-17)


### Features

* [#048](https://github.com/minhoyoo-iotrust/WAIaaS/issues/048) Owner 자산 회수(Withdraw) REST API 구현 ([3f1bb8f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/3f1bb8f55358934b1e425dd80e47fcb741946dd0))
* **117-01:** sign-only 파이프라인 모듈 + evaluateAndReserve SIGNED 쿼리 확장 ([b7fdf02](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b7fdf02c6a027e0381f3dc6603466fb473c8cbf0))
* **117-02:** POST /v1/transactions/sign 라우트 + OpenAPI 스키마 추가 ([3ed2138](https://github.com/minhoyoo-iotrust/WAIaaS/commit/3ed2138e00867cb1bcfe172f8187d0afbbeaedb1))
* **118-01:** ABI_ENCODING_FAILED 에러 코드 + OpenAPI 스키마 + encode-calldata 라우트 ([f5ee58c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f5ee58c5e88bdb1c79e8c8b642d02ea59bb0e91e))
* **118-01:** utils 라우트 등록 + sessionAuth + barrel export ([1dab80e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1dab80e620e29e4dad7b73d807c8b6420477298c))
* **118-02:** Python SDK encode_calldata + skill 파일 업데이트 ([2fb06ea](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2fb06ea8aee8102d7a8e6cfacccb3d675d4a80e0))
* **118-02:** TS SDK encodeCalldata + MCP encode_calldata 도구 추가 ([28b9f21](https://github.com/minhoyoo-iotrust/WAIaaS/commit/28b9f21febdcc662bfd76a4e9358d6c89e5aedb6))
* **119-01:** Python SDK sign_transaction() + Pydantic 모델 ([4205921](https://github.com/minhoyoo-iotrust/WAIaaS/commit/42059211e0040411931b7d4a8ac1fe2eb4dac594))
* **119-01:** TS SDK signTransaction() + MCP sign_transaction 도구 ([59a0498](https://github.com/minhoyoo-iotrust/WAIaaS/commit/59a0498bff044a0cb986fa9b52ae1032c3f3ad95))
* **119-02:** MCP 스킬 리소스 ResourceTemplate + 테스트 업데이트 ([d2ee73b](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d2ee73be58b07040cb09dfd0379d73112d4d54b0))
* **119-02:** SKILL_NOT_FOUND 에러 코드 + GET /v1/skills/:name 라우트 ([cd25b43](https://github.com/minhoyoo-iotrust/WAIaaS/commit/cd25b43f7fca41188b760654776754ea2862444d))
* **119-03:** POLICY_VIOLATION 알림 보강 (extractPolicyType + enriched vars) ([5544963](https://github.com/minhoyoo-iotrust/WAIaaS/commit/55449638454fc5238f66a3c88032d68e404df62a))
* **121-01:** MCP graceful shutdown + stdin 종료 감지 구현 (BUG-020) ([9574884](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9574884b2e19e5fc670c836bcf65be08eb263a63))
* **122-01:** MCP set_default_network 도구 + CLI wallet 서브커맨드 + daemon 세션 스코프 엔드포인트 ([bdd6b93](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bdd6b938ff75bac6500b643d222a14f11e2dca3a))
* **122-01:** TS SDK + Python SDK setDefaultNetwork/getWalletInfo 메서드 추가 ([baf8f38](https://github.com/minhoyoo-iotrust/WAIaaS/commit/baf8f38930cafedf35f6ba23a0f3ac5a4328f204))
* **122-02:** daemon network=all 분기 (balance + assets) + 부분 실패 처리 ([972a208](https://github.com/minhoyoo-iotrust/WAIaaS/commit/972a208159c5ac1734e1e478d8e1d60bb4bdb7bc))
* **122-02:** MCP/SDK network=all + wallet.skill.md 업데이트 ([c833075](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c8330750466a43ccee561407a9d8677938daae5b))
* **123-01:** /admin/status API 응답 확장 -- 정책/트랜잭션 통계 및 최근 활동 ([2413907](https://github.com/minhoyoo-iotrust/WAIaaS/commit/241390784058dd75c150998e7e82d0d13ab6ce03))
* **123-01:** 대시보드 StatCard 링크 + 추가 카드 + 최근 활동 UI ([c1422fb](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c1422fb218f7fa20508a1e9a6e3da033a2c134c2))
* **123-02:** 세션 전체 조회 API + walletName + Admin 월렛 잔액/트랜잭션 API ([a41b8a7](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a41b8a76674d060a0930f0d1ea87962de451e476))
* **123-02:** 세션 전체 조회 UI + 월렛 상세 잔액/트랜잭션 UI ([72c7572](https://github.com/minhoyoo-iotrust/WAIaaS/commit/72c7572c942d20fc30b56361307c5f88d09fdfc0))
* **124-02:** DB 마이그레이션 v10 + 메시지 저장 + Slack 채널 + 스킬 파일 ([f28de2f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f28de2fc9b94a1befcf707c51a7a86346efc9e20))
* **125-02:** implement InMemoryPriceCache ([318b043](https://github.com/minhoyoo-iotrust/WAIaaS/commit/318b043989f1c8831987fbaceb99442c3287a183))
* **125-02:** implement IPriceOracle types + classifyPriceAge ([8ab3e64](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8ab3e64226e60f9cf03550b5aa7f91b0b5fa4cf2))
* **126-01:** PythOracle implements IPriceOracle -- Hermes REST API (GREEN) ([c16b022](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c16b02279d46a37b48fb814b8c2e25af0569736e))
* **126-02:** CoinGeckoOracle implements IPriceOracle -- Demo API (GREEN) ([93097d1](https://github.com/minhoyoo-iotrust/WAIaaS/commit/93097d1aed56e67617648ffcf92bf3be5166f0bc))
* **126-03:** OracleChain 3단계 fallback + 교차 검증 + GET /admin/oracle-status (GREEN) ([4c59e44](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4c59e4499fc98337628e64bc650da8eb1a3becd8))
* **127-01:** PriceResult 3-state + resolveEffectiveAmountUsd 5-type 구현 (GREEN) ([6d16736](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6d16736477c5bd5e1a11564e0c6c84304222ca86))
* **127-02:** SpendingLimitRulesSchema Zod SSoT + evaluateSpendingLimit USD 분기 ([ff3c8c0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ff3c8c099a1560bd5fe1551639a3e9b304fedbb6))
* **127-03:** OracleChain DI 연결 + PipelineContext priceOracle 주입 ([e75fb18](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e75fb1823b545fc323bce8a75bf389c82984c0e7))
* **127-03:** Stage 3 파이프라인 USD 통합 + notListed 격상 + oracleDown fallback + 힌트 ([9793d80](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9793d80611e01fe7085bf7ecdb2c9c617952413f))
* **128-01:** ActionProviderRegistry 구현 + 단위 테스트 20개 ([992bb8c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/992bb8c41b8d5a514432b9edacd2e90ca886edd0))
* **128-01:** IActionProvider Zod SSoT 인터페이스 정의 + API_KEY_REQUIRED 에러 코드 ([8625f48](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8625f4829f2723c35e44ac562e953cc838decadc))
* **128-02:** api_keys 테이블 Drizzle 스키마 + DB v11 마이그레이션 ([4f1c113](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4f1c1134e6c42fe0e6d600c22510f3fe2ca63fb8))
* **128-02:** ApiKeyStore 암호화 저장소 + 단위 테스트 14개 ([deb6b6d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/deb6b6d0ebff62925bb068c4d2da879ca61054b9))
* **128-03:** POST /v1/actions/:provider/:action REST API + DaemonLifecycle Step 4f ([a0c9aa3](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a0c9aa3d35a00c685d4299e28908c78883b59e06))
* **128-04:** Admin UI API Keys 섹션 + 엔드포인트 상수 ([c6ad400](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c6ad40033b6917f428a294fb41fa1304f83e3ee9))
* **128-04:** GET/PUT/DELETE /v1/admin/api-keys REST API + 통합 테스트 ([d5702ac](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d5702aca603f2f9b8a3f15bb4664cd4d9d0a2534))
* **129-01:** Action Provider -&gt; MCP Tool 자동 변환 함수 구현 ([7938b28](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7938b285c8b9f09089fc9e640d25293c59df0999))
* **129-01:** index.ts 통합 + Action Provider MCP 도구 단위 테스트 ([c3d60e2](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c3d60e2cfe27b9f934cd96fe5d1fe017072eb4e9))
* **129-02:** actions.skill.md v1.5.0 신규 생성 -- Action Provider REST API 문서화 ([495aaf4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/495aaf4ac264ebea59aa7ce540581506497ba6f2))
* **129-02:** admin.skill.md v1.5.0 -- oracle-status + api-keys 섹션 추가 ([146944c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/146944c7357281dda94eec309c7823d68f368e46))
* **130-01:** @x402/core 의존성 + Enum 확장 + x402.types.ts + 에러 코드 + i18n ([12225c6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/12225c603ce99a7c131fa80282d237234ae9a04b))
* **130-02:** v12 DB 마이그레이션 추가 (transactions + policies CHECK 제약 갱신) ([9d54973](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9d54973268c1fc5a369ab800b9f2cdbab277d192))
* **131-01:** SSRF 가드 구현 (GREEN) -- 54개 테스트 전체 통과 ([e6fd24b](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e6fd24bd964d53066068803c42a22345a9c7859f))
* **131-02:** x402 핸들러 구현 (GREEN) ([0681e3f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0681e3f98ce3404ca9ee95634ababa3f57b08e3b))
* **131-03:** 결제 서명 모듈 구현 (GREEN) -- EVM EIP-3009 + Solana TransferChecked ([d9d4311](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d9d431104912f1e3872b351cc3170b78f9d1ad88))
* **132-01:** config.toml [x402] 섹션 추가 (enabled, request_timeout) ([9763da9](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9763da96f04fa6f426d366a36c9bfe2124944271))
* **132-01:** matchDomain + evaluateX402Domain 도메인 정책 평가 구현 ([9252c8d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9252c8dd09110944c95a2a3f19f2fecfcc433ce6))
* **132-02:** x402 결제 금액 USD 환산 모듈 구현 (GREEN) ([cd24aca](https://github.com/minhoyoo-iotrust/WAIaaS/commit/cd24aca57b4a3ff1029cc06ea9e31f49e7c34c35))
* **132-03:** POST /v1/x402/fetch 라우트 + 오케스트레이션 구현 ([7a48e23](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7a48e23ef161e9e9c5010ab9f2b36ada5e87ce78))
* **132-03:** server.ts에 x402 라우트 등록 + sessionAuth 경로 매핑 ([b5f300a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b5f300a9b7211d4633128460e005407901f96448))
* **133-01:** Python SDK x402_fetch 모델 + 메서드 + 5개 테스트 ([17f757d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/17f757d44ec0b8d611b7517cf22e821dec99a5ce))
* **133-01:** TS SDK x402Fetch 타입 + 메서드 + 4개 테스트 ([52f1b3b](https://github.com/minhoyoo-iotrust/WAIaaS/commit/52f1b3b089733c72b87d97f26a83d80caa424aa2))
* **133-02:** MCP x402_fetch 도구 + 6개 테스트 + server.ts 등록 ([53ed76d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/53ed76d4975d436d1ac470622175e227e0749e89))
* **133-02:** x402.skill.md + transactions.skill.md 갱신 + VALID_SKILLS/SKILL_NAMES 등록 (7개) ([8888fd8](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8888fd8604bb25a0885a43595e8fa4ac4d926ebb))
* **134-01:** 4개 미등록 PolicyType Zod rules 스키마 추가 ([0fe0852](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0fe085238a7b2bffbff94fe469e989620e55d4e5))
* **134-01:** DynamicRowList + PolicyFormRouter + JSON 토글 + policies.tsx 리팩터링 ([b3b65be](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b3b65beb1a07482c0a0fa52a13d888b81d8ea544))
* **134-02:** 5개 타입 전용 폼 컴포넌트 + PolicyFormRouter 통합 + 유효성 검증 ([6f6dc5f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6f6dc5f061bc1b1658031cf61285421d9195eb51))
* **135-01:** 7개 타입 전용 폼 컴포넌트 + PolicyFormRouter 12-type 통합 ([f846423](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f846423239dfafd187d246c651322d407a01cd8f))
* **135-01:** validateRules 7개 타입 유효성 검증 추가 ([1195b51](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1195b51ab69496b37f3d660d060daa118e4aa635))
* **135-02:** PolicyRulesSummary 12-type 시각화 + 수정 모달 전용 폼 프리필/저장 통합 ([71ac3ff](https://github.com/minhoyoo-iotrust/WAIaaS/commit/71ac3ff622be9821677ff3197905d8deb75ee890))
* **136-01:** DB v13 마이그레이션 + Drizzle 스키마 + SpendingLimitRulesSchema 확장 ([90e5adb](https://github.com/minhoyoo-iotrust/WAIaaS/commit/90e5adb5a9414fa75cf2e1df27b183b30d3750ad))
* **136-01:** evaluateAndReserve USD 기록 + releaseReservation 확장 + v13 마이그레이션 테스트 ([edd1db7](https://github.com/minhoyoo-iotrust/WAIaaS/commit/edd1db79819aa5d96eed3fba6a2b48232e5694db))
* **136-02:** evaluateAndReserve 누적 USD 집계 + APPROVAL 격상 + Stage 3 알림 + 테스트 ([acd5d7d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/acd5d7d1208babbb034c2804520dbe456fb2488e))
* **136-02:** PolicyEvaluation 확장 + CUMULATIVE_LIMIT_WARNING 이벤트 + approval-workflow USD 클리어 ([a9cce6c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a9cce6c96be1aa9aed6c56f940ada90d6e13057e))
* **137-01:** PolicyRulesSummary 누적 한도 시각화 + CSS 스타일 추가 ([04ce084](https://github.com/minhoyoo-iotrust/WAIaaS/commit/04ce084ed2a0b1ff6fae303b0afd173b414fa2e3))
* **137-01:** SpendingLimitForm 누적 한도 입력 필드 + 검증 로직 추가 ([f5aabcc](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f5aabccdb639a7a1cf38065e37d2daada6f15548))
* **137-02:** TS/Python SDK에 SpendingLimitRules 타입 추가 ([f9bcd70](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f9bcd702786cc354e47f9302c6ba69cdf465a781))
* **138-01:** formatDisplayCurrency 유틸리티 + GET /admin/forex/rates + 테스트 39개 ([932c8d0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/932c8d07c59820f18c83bc0a53e9abddab502c37))
* **138-01:** IForexRateService 인터페이스 + CoinGeckoForexProvider + ForexRateService + 43개 통화 메타데이터 ([fd19184](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fd1918404fd3bdc9d1530a031cc5555342d30155))
* **138-02:** Admin Settings 통화 드롭다운 (CurrencySelect) + Display 섹션 + CSS ([a84a0d7](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a84a0d71a41d885ad708278994c7c93ad201e117))
* **138-02:** config.toml display 섹션 + SettingsService display 카테고리 + ForexRateService daemon 통합 ([1a8a777](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1a8a7773eaab549447597d6c459ade72c737ac87))
* **139-01:** Admin UI 환산 표시 유틸리티 + 대시보드 amountUsd 통합 ([fd6433c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fd6433c105a5864b90cedc54fc9a1c51fe7e26d9))
* **139-01:** 알림 메시지에 display_amount 환산 금액 통합 ([358f8f6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/358f8f6d1aef74275cb0f213f07fe07c96a95651))
* **139-02:** MCP 도구 display_currency 파라미터 + 스킬 파일 동기화 ([272a84f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/272a84f52577667da1b46504e5aa55dcdc5ecbd0))
* **139-02:** REST API 4개 엔드포인트에 display_currency 쿼리 파라미터 + 환산 필드 추가 ([621c26f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/621c26f281b478e23750f5ee2aaa0d5b09af82fa))
* **140-01:** EventBus 인프라 + 이벤트 타입 정의 ([d666c46](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d666c46c708d7df746be9b8d57d2c581fd746825))
* **140-01:** 파이프라인 + 라우트에서 EventBus 이벤트 동시 발행 ([fe11fba](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fe11fbaa4fdb2b3971e4598ab7378f621a1b93b4))
* **140-02:** DB v14 마이그레이션 + kill_switch_state 값 변환 ([11467f6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/11467f64ca464fbb95304354dfefcaffd0bb0297))
* **140-02:** KillSwitchService 3-state 상태 머신 + CAS ACID 패턴 ([ba86248](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ba86248ae99ebedddf282b7ef4fce7de1748aaff))
* **140-03:** Kill Switch 6-step cascade + killSwitch 미들웨어 3-state 리팩토링 ([d014554](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d0145541051fd5d2d141e11883aab2916cd0edd4))
* **140-03:** Kill Switch REST API + dual-auth 복구 + DaemonLifecycle 통합 ([6c1348c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6c1348ce22648dcdfbd223572ac28aea4b2881da))
* **141-01:** AutoStopService 4 규칙 엔진 + EventBus 구독 구현 ([19d3e96](https://github.com/minhoyoo-iotrust/WAIaaS/commit/19d3e965760a4c4f1a55d6fd9b708eca8480b78b))
* **141-02:** AutoStop config.toml 6개 키 + Admin Settings autostop 카테고리 + i18n 범용 템플릿 ([7f3fc81](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7f3fc81d85049eea426778dc853d395ff01fa2b7))
* **141-02:** DaemonLifecycle AutoStop 통합 + hot-reload + 16개 통합 테스트 ([414d601](https://github.com/minhoyoo-iotrust/WAIaaS/commit/414d6016d1c81e74d7db4ba826a0012b133c3a49))
* **142-01:** BalanceMonitorService 코어 구현 + 15개 단위 테스트 ([62d1537](https://github.com/minhoyoo-iotrust/WAIaaS/commit/62d15377756f1001623f8ae154855ee571080ab1))
* **142-01:** LOW_BALANCE NotificationEventType + i18n 템플릿 추가 ([1bc0bc8](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1bc0bc8834fe19e66d4f7c1f2fbb748138ca67ac))
* **142-02:** config.toml monitoring flat key + Admin Settings + HotReload 통합 ([fddad2d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fddad2d996af3669482a4469b565d4c7f4a678df))
* **142-02:** DaemonLifecycle 통합 + 통합 테스트 14개 ([c390646](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c39064672f7fb5669788f36a20e2bc409ed658bd))
* **143-01:** DB 마이그레이션 v15 + Drizzle 스키마 + config/settings 확장 ([215bdd8](https://github.com/minhoyoo-iotrust/WAIaaS/commit/215bdd824604f332e61434ba3e3e85b794175b00))
* **143-01:** TelegramBotService Long Polling + /start, /help, /status + DaemonLifecycle + i18n ([430205a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/430205a8d02057f57d286ebc219469622d033e1b))
* **143-02:** 2-Tier 인증 + /wallets, /pending, /approve, /reject 명령어 ([f601b04](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f601b040f219abfd82605273dd5f56995ea00ad2))
* **143-02:** Admin REST API -- telegram_users 관리 엔드포인트 3개 ([173432e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/173432e38a9e1fd7991e01fb263437a552e5d948))
* **143-03:** 인라인 키보드 빌더 + /killswitch 확인 대화 + /newsession 월렛 선택 ([9cf709d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9cf709d93b44635b3b7ddc527a71e8dec67094b5))
* **144-01:** Kill Switch 3-state UI 리팩토링 + API 엔드포인트 추가 ([e974d2a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e974d2a5408d49778c453e10a348fd9ad2673c72))
* **144-01:** Telegram Users 관리 페이지 + 사이드바 라우트 추가 ([f10dd49](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f10dd495e9ff37b2a41d630c55cffd171b8887f4))
* **144-02:** AutoStop + Balance Monitoring Settings 섹션 추가 ([5600f9c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5600f9cb78436d944d14f2a8b64692f0a2fedc35))
* **145-01:** entrypoint.sh + docker-compose.yml 생성 ([91a050a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/91a050aa11c347257c94c872a6f292380847cca7))
* **145-01:** Multi-stage Dockerfile + .dockerignore 생성 ([d40cce0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d40cce0e5ee07ae9ab36c76879773e29d6fcf935))
* **145-02:** Docker Secrets 오버라이드 compose 파일 + 보안 설정 ([23b2b31](https://github.com/minhoyoo-iotrust/WAIaaS/commit/23b2b31abf55b4fe02dd146a9d54436f7640d278))
* **146-01:** DaemonLifecycle WC 통합 (Step 4c-6 초기화 + shutdown 해제) ([112c4da](https://github.com/minhoyoo-iotrust/WAIaaS/commit/112c4da7bfe88562e839df905d2fed53dc9ed6f4))
* **146-01:** WC 인프라 - SqliteKeyValueStorage + WcSessionService + DB v16 마이그레이션 ([676454b](https://github.com/minhoyoo-iotrust/WAIaaS/commit/676454b9ee7c9063c8251c3daec3a92df9a6cdb1))
* **146-02:** hot-reload에 walletconnect 키 변경 감지 추가 ([6513dda](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6513dda728411d2dc063996e1e0afbcf3c85e31c))
* **147-01:** WC REST API 4개 엔드포인트 + OpenAPI 스키마 + 18개 단위 테스트 ([1cb8d60](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1cb8d60721f3e15c36a62340bdc4a4261d73b19f))
* **147-01:** WcSessionService 페어링/세션 관리 메서드 + CAIP-2 상수 + 에러 코드 ([54563b4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/54563b4e5e0fa7927c3ef29af61d7855712cb204))
* **147-02:** Admin UI WalletConnect QR 모달 + 세션 관리 섹션 ([7667967](https://github.com/minhoyoo-iotrust/WAIaaS/commit/76679678c65b6c2286003ed42fdae3b1b0932132))
* **147-02:** CLI owner connect/disconnect/status 명령어 + qrcode 터미널 출력 ([bc5f9e0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bc5f9e0f4b848821d27dbc2d6122700e98132595))
* **148-01:** stage4Wait WC 연동 + 전체 DI 배선 ([a1eb63f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a1eb63f22bf7d5f25155f85748bc2d5f1d55af6e))
* **148-01:** WcSigningBridge 서비스 생성 ([9edaa57](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9edaa576436af80220cb85ab1c687b9044dbe6ec))
* **149-01:** EventBus 이벤트 + 알림 타입 + i18n 템플릿 추가 ([e0e51c2](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e0e51c2cfcc2b357242d34d746368792ada8fe5a))
* **149-01:** WcSigningBridge Telegram fallback + approval_channel 추적 + DI 배선 ([aaadc33](https://github.com/minhoyoo-iotrust/WAIaaS/commit/aaadc33eab07ce237837510a850a5ae0fae3a731))
* **150-01:** Admin UI WalletConnect 전용 관리 페이지 ([9381b42](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9381b42654f0b37435073b724df8d1178838a178))
* **150-01:** session-scoped WC REST endpoints (/v1/wallet/wc/*) ([3cb2ae1](https://github.com/minhoyoo-iotrust/WAIaaS/commit/3cb2ae1a29cb862e46819aba605b02c144917163))
* **150-02:** MCP ApiClient.delete() + 3 WC 도구 (wc_connect, wc_status, wc_disconnect) ([8887fbd](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8887fbdffeefc3f1fac70b7f9fd47578840d9f18))
* **150-02:** TS/Python SDK WC 메서드 + Skill 파일 WalletConnect 섹션 ([b0c698a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b0c698aa5ab8aa7e9f3f4bef4a1c73a8ce4efdff))
* **151-01:** Turborepo 5개 테스트 태스크 분리 + 패키지 스크립트 ([c01cc18](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c01cc18956e00e2829772022473dc7c4a40b8fcd))
* **151-02:** MockOnchainOracle + MockPriceOracle + MockActionProvider (M8-M10) + barrel export + 검증 테스트 ([bc27c0d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bc27c0d7b50971efd439f1708c3bcbf387f5de31))
* **151-02:** msw 2.x 설치 + Jupiter/가격 API msw 핸들러 (M6, M7) ([46a01da](https://github.com/minhoyoo-iotrust/WAIaaS/commit/46a01da251671926eb7d00e56df3135c3198a981))
* **152-01:** Enum SSoT 빌드타임 검증 스크립트 + DB 일관성 테스트 ([452d406](https://github.com/minhoyoo-iotrust/WAIaaS/commit/452d406897d5de5e325cdf9992e77a74bee9ba91))
* **160-01:** BackgroundWorkers runImmediately + VersionCheckService 구현 ([8ad9759](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8ad9759584731510a779ff8be6c588ffb2880654))
* **160-02:** GET /health에 latestVersion, updateAvailable, schemaVersion 필드 추가 ([57352eb](https://github.com/minhoyoo-iotrust/WAIaaS/commit/57352ebaf9387cc92f585c04aa248c6fb3bc97f1))
* **161-01:** CLI 업그레이드 알림 모듈 구현 ([b03eba2](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b03eba24299e4d0259559c6370a34c52764f8df2))
* **161-02:** BackupService 구현 + barrel export ([b0b011c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b0b011ce33513f212ed2da98a10cb697391adcd2))
* **161-03:** upgrade 명령 구현 + CLI 등록 ([68bccd7](https://github.com/minhoyoo-iotrust/WAIaaS/commit/68bccd7b2c4ce184561adcbae469c53631747f96))
* **162-01:** checkSchemaCompatibility 함수 + 호환성 매트릭스 테스트 ([f8a55d6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f8a55d626f0d13e2efa8442822c6b30994192454))
* **162-01:** daemon Step 2 호환성 검사 통합 + SCHEMA_INCOMPATIBLE 에러 코드 ([f638eb4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f638eb4e8d44bbedc668105a462db4ddf49a5d4d))
* **162-02:** Dockerfile에 Watchtower + OCI 표준 라벨 추가 ([64d3c1d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/64d3c1dfc5f88b30b147be1423d328bd743a845a))
* **162-02:** release.yml에 docker-publish job 추가 (GHCR 3-tier 태깅) ([a60db52](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a60db524ca35939a2fc093b56fabaaf840fbada3))
* **163-01:** release-please 설정 파일 3종 생성 ([115e4f9](https://github.com/minhoyoo-iotrust/WAIaaS/commit/115e4f916f947bdc1df6ec2d6a58a1de59e9040e))
* **163-02:** release.yml에 deploy job 추가 (게이트 2) ([f639e61](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f639e614dd89f6c2292202f63ee212ebb1b27475))
* **164-01:** SDK HealthResponse 타입 추가 + 스킬 파일 /health 응답 동기화 ([c6ab810](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c6ab810e2d2e3abaf800467f1a00157ff3dd450d))
* v1.7 품질 강화 + CI/CD ([1ad8328](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1ad8328176f4bf65b5eb398114b3b290f98635e6))
* 마일스톤 감사/완료 전 빌드+테스트 자동 실행 훅 추가 ([#039](https://github.com/minhoyoo-iotrust/WAIaaS/issues/039)) ([45bb693](https://github.com/minhoyoo-iotrust/WAIaaS/commit/45bb693357bc7fe37ab164a64442d4d32a05d880))


### Bug Fixes

* [#042](https://github.com/minhoyoo-iotrust/WAIaaS/issues/042) tsconfig.build.json 도입으로 빌드/테스트 분리 + [#049](https://github.com/minhoyoo-iotrust/WAIaaS/issues/049) SignClient ESM/CJS interop ([0a45e67](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0a45e6722f42b4dc0982e933a348c29a24064872))
* [#043](https://github.com/minhoyoo-iotrust/WAIaaS/issues/043) WalletConnect 미설정 시 404 대신 503 반환 + 에러 메시지 매핑 ([9c62171](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9c62171f05b0930a03c45445755fb75f8b15c6af))
* [#047](https://github.com/minhoyoo-iotrust/WAIaaS/issues/047) Terminate 시 리소스 정리 + TERMINATED 가드 적용 ([d6e353d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d6e353d444427c84dfcebf29700800fcefaf3b3b))
* **120-01:** reorder pushSchema to run indexes after migrations ([356e732](https://github.com/minhoyoo-iotrust/WAIaaS/commit/356e732adb482ac8a8cd384a68f7534e528174d6))
* **124-01:** apiPost 빈 body 버그 수정 + 채널별 테스트 UI ([a45022c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a45022c121be328f2b5573eaa3aab5ca91450b44))
* **125:** revise plans based on checker feedback ([12b1854](https://github.com/minhoyoo-iotrust/WAIaaS/commit/12b1854c52b322ef476b28b1e7303f9d0df864e5))
* **admin:** Table 컴포넌트 undefined data 크래시 수정 + 테스트 카운트 갱신 ([#037](https://github.com/minhoyoo-iotrust/WAIaaS/issues/037), [#038](https://github.com/minhoyoo-iotrust/WAIaaS/issues/038)) ([f0ddcbc](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f0ddcbc5c80d2a28999216b089421b43aa7c8d7d))
* core 스냅샷 테스트 기대값 갱신 + ROADMAP Progress 테이블 수정 ([623d9dc](https://github.com/minhoyoo-iotrust/WAIaaS/commit/623d9dc4cc0841bac97c62ebe0d13dec025e7203))
* listActions() noUncheckedIndexedAccess 수정 + 목표 문서 정비 ([d5b7417](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d5b7417bbfcd7d0c3e8654ac9d9f995b04d56e58))
* 오픈 이슈 5건 일괄 수정 ([#053](https://github.com/minhoyoo-iotrust/WAIaaS/issues/053)-[#057](https://github.com/minhoyoo-iotrust/WAIaaS/issues/057)) ([0c93e87](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0c93e87e2304a7172c6ae601e488dc0d2342820d))
* 이슈 [#040](https://github.com/minhoyoo-iotrust/WAIaaS/issues/040)-[#052](https://github.com/minhoyoo-iotrust/WAIaaS/issues/052) 일괄 처리 + v1.8 objective 문서 수정 ([9ba7c2c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9ba7c2c8e9a8d7e50cd1b9cc1c01d33c132fbdae))
* 이슈 033~036 수정 + 로드맵 재편 (Desktop v2.6 이연) ([04ee9ab](https://github.com/minhoyoo-iotrust/WAIaaS/commit/04ee9ab6ba35042fb6bbfa57f371f4991075db48))


### Code Refactoring

* **120-01:** fix comment count for expected indexes in migration chain tests ([71423c8](https://github.com/minhoyoo-iotrust/WAIaaS/commit/71423c843c147a8b76d162a5c99e09232206c1f1))
