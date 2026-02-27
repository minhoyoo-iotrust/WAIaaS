# Changelog

## [2.8.0](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.8.0...v2.8.0) (2026-02-27)


### Bug Fixes

* deterministic Docker build for native addons ([4e9e545](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4e9e54515dd8a8814b53aa2fbd82190c3e9fa43c))
* use prod-deps stage for deterministic Docker native addon builds ([911ee16](https://github.com/minhoyoo-iotrust/WAIaaS/commit/911ee1663a2be036ae15c9c5943ac1be878929c1))

## [2.8.0](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.8.0...v2.8.0) (2026-02-27)


### Bug Fixes

* deterministic Docker build for native addons ([4e9e545](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4e9e54515dd8a8814b53aa2fbd82190c3e9fa43c))
* use prod-deps stage for deterministic Docker native addon builds ([911ee16](https://github.com/minhoyoo-iotrust/WAIaaS/commit/911ee1663a2be036ae15c9c5943ac1be878929c1))

## [2.8.0](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.8.0-rc.4...v2.8.0) (2026-02-27)


### Bug Fixes

* promote v2.8.0-rc.4 to stable 2.8.0 ([f864587](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f8645870232bff167cc7a062281226383fa70a38))

## [2.8.0-rc.4](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.8.0-rc.3...v2.8.0-rc.4) (2026-02-27)


### Bug Fixes

* add BackgroundWorkers isRunning tests for coverage margin ([97a6ce5](https://github.com/minhoyoo-iotrust/WAIaaS/commit/97a6ce5cd7a6fe338d4fe036580d3f10cbda1bf5))

## [2.8.0-rc.3](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.8.0-rc.2...v2.8.0-rc.3) (2026-02-27)


### Bug Fixes

* register missing position_tracker.enabled setting key and restore test coverage ([4b9cdee](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4b9cdeea7bdc332e8abe3a74692cf3173fb8772a))

## [2.8.0-rc.2](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.8.0-rc.1...v2.8.0-rc.2) (2026-02-27)


### Features

* **274-01:** add DeFi SSoT enums, notification events, and i18n templates ([431c31c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/431c31cd035988e1f36f401e1f77a65a754c69d3))
* **274-02:** add defi_positions table migration v25 and Drizzle schema ([7950883](https://github.com/minhoyoo-iotrust/WAIaaS/commit/795088385ec968a16c49ec5a01cfc60adc4f22a4))
* **274-03:** add ILendingProvider and IPositionProvider interfaces ([a34371f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a34371f75ef422d2947271c2b4039e046dcea2a8))
* **275-01:** add IDeFiMonitor interface, PositionWriteQueue, PositionTracker, DeFiMonitorService ([96d3864](https://github.com/minhoyoo-iotrust/WAIaaS/commit/96d38644fbff989c3ed07c5e64c1d0fe13668fc8))
* **275-01:** daemon lifecycle integration + PositionTracker/WriteQueue unit tests ([a455dc0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a455dc040141513ba03690caf9805251d5a26e0e))
* **275-02:** add HealthFactorMonitor with adaptive polling and severity alerts ([493d372](https://github.com/minhoyoo-iotrust/WAIaaS/commit/493d37224db189b258fb874eccd7778f1f865ce7))
* **275-03:** add lending policy evaluation to DatabasePolicyEngine with 18 unit tests ([2bd8f15](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2bd8f15d33c995d294a1ac78c160ebf5f04a0bc6))
* **275-03:** extend ContractCallRequestSchema with actionName, add lending policy types, v26 migration ([e7166b3](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e7166b30deb2283c84c8016513aa2f3295f90a7e))
* **276-01:** add Aave V3 manual hex ABI encoding, 5-chain address registry, and Zod input schemas ([ba39474](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ba394747c6cf5518b8a016a009b4bd61ba164f97))
* **276-02:** add Aave V3 RPC response decoders, health factor simulation, and APY conversion ([1ad946e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1ad946e24a1157edf8e2d99b3c2438c8e5eeae92))
* **276-03:** implement AaveV3LendingProvider with 4 actions + dual interface compliance ([3a8a9df](https://github.com/minhoyoo-iotrust/WAIaaS/commit/3a8a9dfe7197bb550cf3b38a4617b5067a45720e))
* **276-03:** register AaveV3LendingProvider in registerBuiltInProviders + re-exports ([af1589d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/af1589d138d94f7f06a31187928ddf8650ec39b9))
* **277-01:** REST API endpoints for DeFi positions + health factor + IRpcCaller injection ([5bab769](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5bab769bd583f238bb134c8e4d967344810c070e))
* **277-02:** MCP tools + TS SDK + Python SDK for DeFi positions and health factor ([fbc8f76](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fbc8f76f29f7a268395b956728e945cbf3d191c2))
* **277-03:** update skill files with DeFi Lending documentation ([d6ca034](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d6ca0346a64593bd125265e9edcd3400663137eb))
* **278-01:** add Aave V3 runtime settings + Actions card + service integration ([abc7e99](https://github.com/minhoyoo-iotrust/WAIaaS/commit/abc7e99a4e735480562891312b733aa4c74de1ee))
* **278-02:** add Admin DeFi positions endpoint + Dashboard section ([0473be9](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0473be9d37adf45090214a9d92cd3beefb5e8faf))
* implement auto-provision mode ([#200](https://github.com/minhoyoo-iotrust/WAIaaS/issues/200)) ([74f2288](https://github.com/minhoyoo-iotrust/WAIaaS/commit/74f22885888dabe8cdad837b95004d8dbcea6f20))


### Bug Fixes

* **275:** revise plans based on checker feedback ([5fa7fc6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5fa7fc6a7ab03f59100c460b9f0623bb657379a3))
* resolve 4 open issues ([#203](https://github.com/minhoyoo-iotrust/WAIaaS/issues/203), [#204](https://github.com/minhoyoo-iotrust/WAIaaS/issues/204), [#205](https://github.com/minhoyoo-iotrust/WAIaaS/issues/205), [#206](https://github.com/minhoyoo-iotrust/WAIaaS/issues/206)) ([4d8d2e9](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4d8d2e9d1350c34a5cdf72f0141f1a0448a8f0a1))
* resolve lint errors and typecheck issues in Aave V3 test files ([1cafc75](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1cafc7516e1f33ab544a53af2223f97703667fd6))
* resolve lint errors in re-encrypt test file ([76898ee](https://github.com/minhoyoo-iotrust/WAIaaS/commit/76898ee4988ece4925403dc9bc76bce5a83f735e))
* update enum SSoT expected counts for PolicyType (14) and NotificationEventType (49) ([fde9041](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fde9041a426141c5f06ad87c5ba6da407da74b0d))
* update pre-existing test assertions for notification event count and idle timeout behavior ([ac9c117](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ac9c117bf84af945469179cd1c0be52d86fa1b13))
* update test assertions for MCP tool count and EVM incoming subscriber mocks ([bed3881](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bed38813f04e4e52eb72c21501f62637d40e69c5))

## [2.8.0-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.8.0-rc...v2.8.0-rc.1) (2026-02-26)


### Features

* add `waiaas notification setup` CLI command ([#195](https://github.com/minhoyoo-iotrust/WAIaaS/issues/195)) ([45c5fc6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/45c5fc68235345cca63e73a7558d7587d8bace24))


### Bug Fixes

* **admin:** update RPC endpoint test mocks with builtinUrls field ([8a88136](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8a881360d6acc2dd2fdd5b521c7c8471397c4498))
* EVM incoming subscriber RPC pool integration + Admin UI API-based builtin URLs ([a2f274d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a2f274d05762413246bbe607ad960871752cac34))
* resolve issues [#196](https://github.com/minhoyoo-iotrust/WAIaaS/issues/196) [#197](https://github.com/minhoyoo-iotrust/WAIaaS/issues/197) [#198](https://github.com/minhoyoo-iotrust/WAIaaS/issues/198) [#199](https://github.com/minhoyoo-iotrust/WAIaaS/issues/199) — RPC pool bypass, Admin UI sync, docs ([e43ab71](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e43ab714939f33e2c061436084fda20473bcfa15))

## [2.8.0-rc](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.7.0...v2.8.0-rc) (2026-02-26)


### Features

* builtin wallet preset auto-setup (v28.8) ([caab8f1](https://github.com/minhoyoo-iotrust/WAIaaS/commit/caab8f1a4226ec1008c9f709df2528094ee7e913))

## [2.7.0](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.7.0-rc.1...v2.7.0) (2026-02-25)


### Bug Fixes

* promote v2.7.0-rc.1 to stable 2.7.0 ([5af9198](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5af9198015f95a3abfeed46e76577c1698f72c0d))

## [2.7.0-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.7.0-rc...v2.7.0-rc.1) (2026-02-25)


### Features

* **260-01:** implement RpcPool with priority-based URL rotation and cooldown ([bdfcde2](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bdfcde26ec644212a6694bbae761ee498388d561))
* **260-02:** add built-in RPC defaults and createWithDefaults factory ([97926b6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/97926b657c961a72c0e65bbdc54e6af8a615c16f))
* **261-01:** wire RpcPool into AdapterPool with config.toml seeding ([c0942cc](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c0942cc6ed259d014202168123dbde193366fc9b))
* **261-02:** add RpcPool cooldown reset to hot-reload RPC handler ([5dbe336](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5dbe3364810604ff74de2d90ee41e7737dd98fca))
* **261-03:** wire IncomingTxMonitor subscriberFactory to RpcPool ([e06f933](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e06f93395ced71074474c7ecd8c3e4a3dcd43cee))
* **262-01:** add RpcPool.replaceNetwork(), rpc_pool.* settings, and hot-reload handler ([2f167bb](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2f167bbc683c71be8477c6c2e772791e05cd54f6))
* **263-01:** add GET /admin/rpc-status endpoint and multi-URL RPC Endpoints tab ([4bb7b09](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4bb7b0919564cff3188a2837af209dd6583ec5fc))
* **263-02:** add live RPC pool status display and per-URL test buttons ([942d300](https://github.com/minhoyoo-iotrust/WAIaaS/commit/942d300d1e64c633e8a52b41a4a86a6d743346ca))
* **264-01:** add onEvent callback to RpcPool for cooldown/all-failed/recovered emission ([206253a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/206253a9d24a4e15d4c8e25a05e32353a375a999))
* **264-01:** add RPC_ALL_FAILED and RPC_RECOVERED notification events ([8f3d7e6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8f3d7e63fb75ea1aa77c864c7131b8014f217307))
* **264-02:** wire RpcPool onEvent to NotificationService and export RpcPoolEvent ([76eec32](https://github.com/minhoyoo-iotrust/WAIaaS/commit/76eec3245a68831883d55ebbb0c672df63d488d2))


### Bug Fixes

* **260:** export BUILT_IN_RPC_DEFAULTS from @waiaas/core barrel ([5b70017](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5b7001714658d55bf740727a0c6f009937c26a8c))
* **263-01:** remove unused vi import in admin-rpc-status test ([68a9a49](https://github.com/minhoyoo-iotrust/WAIaaS/commit/68a9a49f63cf68f46dd7ee880d906fc7f091b542))
* guard against undefined rpcPoolStatus and update stale RPC tab tests ([c3e6ea8](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c3e6ea8c0018ac0942915f50d54b04e9bd9daf37))
* resolve lint error and type errors in RPC pool tests ([b4f516d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b4f516d0d8aeddcfee173e74b4bfc65cbe56d1d1))
* update NotificationEventType expected count in enum SSoT verifier ([c572fb8](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c572fb8925558fa13888b937ced1b935962d4669))
* update snapshot counts for new RPC pool events and settings ([9d6e433](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9d6e433c9338469090984d675f0aacb938dcc87b))

## [2.7.0-rc](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.6.0...v2.7.0-rc) (2026-02-25)


### Features

* **258-01:** add Pipeline Stage 3.5 gas condition check with GAS_WAITING transition ([5d15401](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5d15401360fda526df5698df9ad42c7863e945fb))
* **258-02:** add gas_condition settings (5 keys) to SETTING_DEFINITIONS ([6ccd56d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6ccd56d353feb270628492030e61b59a4d31c7d4))
* **258-02:** add GasConditionTracker with EVM/Solana RPC gas price queries ([801ec94](https://github.com/minhoyoo-iotrust/WAIaaS/commit/801ec9459bfbeb1d71b170f9f9c5b32b9a11445b))
* **258-02:** add resumePipeline callback and gas-condition COMPLETED handling ([aa4e328](https://github.com/minhoyoo-iotrust/WAIaaS/commit/aa4e3282e95d6338b34746f70d2bae49c086696c))
* **258-02:** register GasConditionTracker and add executeFromStage4 ([4594501](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4594501a3664bd691143593d11c90c0c92bc752b))
* **259-01:** add Gas Condition section to Admin UI System page ([724caf2](https://github.com/minhoyoo-iotrust/WAIaaS/commit/724caf221ee61ec68f24d8abec948f5b66c90ec1))
* **259-01:** add GasCondition OpenAPI schema and gas_condition settings category ([84ea5a5](https://github.com/minhoyoo-iotrust/WAIaaS/commit/84ea5a5ffccc7c5e44072796e5cbdef4f41ec30c))
* **259-02:** add gas_condition parameter to MCP transaction tools ([6f6f12e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6f6f12eb2dd1782a0813cfa1ef264b3c5e85dd83))
* **259-02:** add gasCondition to MCP action_provider and Actions route ([2e1cce6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2e1cce678165616662927fdf273fa321f744436f))
* **259-02:** add gasCondition to TS SDK, Python SDK, and skill docs ([41f1cf1](https://github.com/minhoyoo-iotrust/WAIaaS/commit/41f1cf1275cf0bbe4484f346610f1dc032d4ec4c))
* add GasCondition schema, notification events, and i18n (258-01 partial) ([23d2471](https://github.com/minhoyoo-iotrust/WAIaaS/commit/23d2471f8c951707a02cfd14fc712d3414bc6041))


### Bug Fixes

* **#185:** add retry and timeout handling to EVM incoming subscriber ([a91ab1a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a91ab1a60793f0ddd6f0f1fee67dfb866e15a7d2))
* **#186:** correct LI.FI getQuote query parameter names ([bf10130](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bf101306478fc7b09a549fb1632a17ca558d0f91))
* **#187:** add retry logic for Solana mainnet RPC 429 rate limits ([08be559](https://github.com/minhoyoo-iotrust/WAIaaS/commit/08be55975404575f3f5bfa15547fa4be3c1079da))
* **#188:** resolve actions providers wildcard auth and admin UI improvements ([a12ab8e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a12ab8ea00037d8fbd31840538bba0b60aca5ffa))
* **258:** emit TX_CANCELLED notification on gas-condition timeout ([2784804](https://github.com/minhoyoo-iotrust/WAIaaS/commit/278480458874d389687831189abf4f7bb32b4443))
* **259:** revise plans based on checker feedback ([c66d776](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c66d77693f07dea95f1413305cdefa86733d1e88))
* **259:** update notification event type count from 38 to 42 ([0ae6381](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0ae63818c2b0ab2c82650fe4f7ba4594ef694671))
* remove unused CurrencyCode import in display-currency-helper test ([d222511](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d222511e3dbb7f8c632b1e1a1385cbf8790c70c1))
* update test expectations for dual-auth actions/providers endpoint ([62926ea](https://github.com/minhoyoo-iotrust/WAIaaS/commit/62926ea1648e18b5f6bbc371e180b8a077d100b4))
* use regex matchers for action provider description tests ([aefff7f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/aefff7f9e2f5130e0222b6a69d0c6c7383122b1d))

## [2.6.0](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.6.0-rc.13...v2.6.0) (2026-02-24)


### Bug Fixes

* promote v2.6.0-rc.13 to stable 2.6.0 ([d5308d4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d5308d49c3375074e249c9568fc55fdf065eeda8))

## [2.6.0-rc.13](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.6.0-rc.12...v2.6.0-rc.13) (2026-02-24)


### Features

* **254-01:** add Lido staking ABI encoding helpers and config ([1701463](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1701463dc1f76efe0e398211075d5db088635e37))
* **254-01:** implement LidoStakingActionProvider with unit tests ([a4c000a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a4c000acfe11a272d1c77c31168646a53789634f))
* **254-02:** register Lido staking in actions exports and SettingsService keys ([e58fcb7](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e58fcb72bc47086d8b663083af8649c72c943b7a))
* **255-01:** add Jito staking config and SPL Stake Pool instruction encoding ([416dd4c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/416dd4c077135b4e0a1da343a2f09a51606f4e4b))
* **255-01:** add JitoStakingActionProvider with stake/unstake and 12 unit tests ([a3d533d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a3d533d2a2c4b23829695fff39b3c75a26d4e25f))
* **255-02:** register JitoStakingActionProvider in daemon + 3 SettingsService keys ([0c123bb](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0c123bb16f411d1e8bdff1c98959fefcaaeb3164))
* **256-01:** add LidoWithdrawalTracker and JitoEpochTracker implementations ([57d2bb4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/57d2bb45a2ab95d06a293391a2ad5e9e1e691e01))
* **256-01:** add staking notification events, daemon tracker registration, and dynamic event dispatch ([503133d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/503133d950ede97caa7d49ab53a15f2fd7fc9552))
* **256-02:** add staking position Zod schema and REST API route ([bd7772a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bd7772ae85e56f46050bc8e532e45604bd757940))
* **256-03:** add Admin staking tab, admin staking API, and skill docs ([022ba7e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/022ba7e3bc3fb873d90e5e983cdec904e9b19813))


### Bug Fixes

* **176,177,178:** action provider default-enabled + hot-reload, wallet detail amount format, admin actions page ([bd401c6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bd401c68d8f30ebf969358f4155ce2f857da5afc))
* **179,180:** add CoinGecko API key to Oracle section, remove duplicate API Keys from System page ([099ab63](https://github.com/minhoyoo-iotrust/WAIaaS/commit/099ab63ce32e0884c1cb0e6d3710fbe1ed0a442c))
* **254:** use rpc.evm_default_network + deriveEnvironment() for Lido env switching ([99e1a95](https://github.com/minhoyoo-iotrust/WAIaaS/commit/99e1a95f1370f0195bee40bc2dcf40dfd3b46b1d))
* **255:** revise plans based on checker feedback ([359bed0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/359bed0c1b38570b6cc28b1aa90178829386f954))
* **256:** add policy category to SETTING_CATEGORIES + update test counts ([de0dc93](https://github.com/minhoyoo-iotrust/WAIaaS/commit/de0dc93d6d24f872bb1c6339bbfb6bf20cbb4c43))
* **256:** revise plan based on checker feedback — notification enum, dynamic event tests, settings cross-ref ([6e0313e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6e0313e8efb935ba69e63cab82be638886aecc2e))
* **256:** revise plans based on checker feedback ([0544c6d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0544c6d318508e5a09caffb4e7c6fcd1708aeebd))
* **257-01:** add post-pipeline bridge_status enrollment and metadata persistence ([8cfaa0b](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8cfaa0bb11f3b5acfc32475fb1ae264739bc5b31))
* **admin:** resolve dirty-guard isDirty crash on navigation ([#181](https://github.com/minhoyoo-iotrust/WAIaaS/issues/181)) ([2a3152c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2a3152ce031e4aa50b88e1ede0c71981ce26901f))
* **admin:** update system and actions page tests for v28.4 changes ([42bd6fb](https://github.com/minhoyoo-iotrust/WAIaaS/commit/42bd6fb6b6d5d2df510690c912907841f4ed3214))
* **core:** update NotificationEventType count to 38 in enum test ([7949426](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7949426adbe0e34c0ba22c8f1f5bd7762af59d45))
* **daemon:** update NotificationEventType count to 38 in notification-channels test ([8ef56bc](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8ef56bc3940668564dc57e5738657b34fa9d3a54))
* resolve issues [#173](https://github.com/minhoyoo-iotrust/WAIaaS/issues/173) [#174](https://github.com/minhoyoo-iotrust/WAIaaS/issues/174) [#175](https://github.com/minhoyoo-iotrust/WAIaaS/issues/175) — policy defaults, connect-info, EVM backoff ([4d5f45b](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4d5f45bb0e88849536d485b72b7b3f44eeca15cb))
* update NotificationEventType expected count to 38 in enum SSoT verifier ([974683e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/974683e500714ee6989a8a864785f9877c2f29fc))

## [2.6.0-rc.12](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.6.0-rc.11...v2.6.0-rc.12) (2026-02-24)


### Bug Fixes

* skip native ETH polling on L2 chains to avoid getBlock timeout ([12e35f5](https://github.com/minhoyoo-iotrust/WAIaaS/commit/12e35f5203d562a169f0334ad99a464f61541ac3))
* skip native ETH polling on L2 chains to avoid getBlock timeout ([2383c1a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2383c1aec78e477a95eacdaae5982deadb24e0e1)), closes [#172](https://github.com/minhoyoo-iotrust/WAIaaS/issues/172)

## [2.6.0-rc.11](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.6.0-rc.10...v2.6.0-rc.11) (2026-02-24)


### Bug Fixes

* only trigger logout on 401 from admin endpoints in apiCall ([3b7f438](https://github.com/minhoyoo-iotrust/WAIaaS/commit/3b7f43871abe677e995e5e497a602ff76055130b))
* only trigger logout on 401 from admin endpoints in apiCall ([7df8a1e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7df8a1ec4c32c92ccb095bb487282f8533fbd6b4)), closes [#171](https://github.com/minhoyoo-iotrust/WAIaaS/issues/171)

## [2.6.0-rc.10](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.6.0-rc.9...v2.6.0-rc.10) (2026-02-24)


### Bug Fixes

* resolve issues [#168](https://github.com/minhoyoo-iotrust/WAIaaS/issues/168) formattedAmount, [#169](https://github.com/minhoyoo-iotrust/WAIaaS/issues/169) EVM backoff, [#170](https://github.com/minhoyoo-iotrust/WAIaaS/issues/170) dual-auth ([0f01bbf](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0f01bbf5a6ab86497192c7d346a03099b7ed12f1))
* resolve issues [#168](https://github.com/minhoyoo-iotrust/WAIaaS/issues/168) formattedAmount, [#169](https://github.com/minhoyoo-iotrust/WAIaaS/issues/169) EVM backoff, [#170](https://github.com/minhoyoo-iotrust/WAIaaS/issues/170) dual-auth ([d9b723d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d9b723dd632d727c6b37ae721f833100a3d9a900))
* use fake timers in EVM polling worker test to handle stagger delay ([b6be07f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b6be07ff63e7800fac38c17975f324e58edf5257))

## [2.6.0-rc.9](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.6.0-rc.8...v2.6.0-rc.9) (2026-02-23)


### Features

* **251-01:** add IAsyncStatusTracker interface, GAS_WAITING enum, DB v23 migration ([7e59708](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7e59708b324e7ddb06781cc62a5d77309a69c8d0))
* **251-02:** add AsyncPollingService with BackgroundWorkers integration ([5a51b25](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5a51b25afea73f7bb26c5e15ef0748c06c9b0190))
* **252-01:** add LiFiApiClient, Zod schemas, config, daemon settings ([4071bec](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4071becd9e84cb296ba03dda776c17f4d8319b99))
* **252-02:** add LiFiActionProvider with cross_swap and bridge actions ([b40d079](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b40d079a3e9692c3e48f91502d74a627f2a02ada))
* **252-03:** add BridgeStatusTracker, notifications, and reservation release ([5803855](https://github.com/minhoyoo-iotrust/WAIaaS/commit/58038552831a5df6cf7e65cfdc924c6100419ba5))
* **253-01:** add LI.FI cross-chain bridge documentation to actions.skill.md ([48a1771](https://github.com/minhoyoo-iotrust/WAIaaS/commit/48a1771898e75775fbe1922c58e2775aa99342d7))
* LI.FI cross-chain bridge integration (Phases 251-253) ([bb3e676](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bb3e6764aa383db0a0df5a38adf23c53196feba0))


### Bug Fixes

* **253-01:** remove unused consoleSpy variable in LiFi MCP test ([0f7162d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0f7162dee1664955025dc3443d9e1b731160127c))
* correct UNSUPPORTED_CHAIN error code to INVALID_INSTRUCTION in skill file ([d0526c3](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d0526c3f716fee245f32555a45109777f4b75d19))
* extract rpcConfigKey helper to prevent RPC key duplication ([#167](https://github.com/minhoyoo-iotrust/WAIaaS/issues/167)) ([81879a0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/81879a01d57c6fc84daf5384d4b01e352ef6783b))
* remove redundant chain prefix from EVM RPC setting key in subscriberFactory ([#167](https://github.com/minhoyoo-iotrust/WAIaaS/issues/167)) ([406ee03](https://github.com/minhoyoo-iotrust/WAIaaS/commit/406ee03634c01f2a22cdcc2bdb9da43f572262f6))
* update enum SSoT expected counts for LI.FI bridge additions ([4327048](https://github.com/minhoyoo-iotrust/WAIaaS/commit/432704861cd57c3a1a172dfe6c42c220c73162ac))
* update stale test fixtures for DB v23, LiFi settings, and bridge events ([f7b59b0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f7b59b0ef1a89e52db975c5716fdba7eeab79e99))
* update test fixtures for DB v23 migration and LiFi config keys ([af7cd7c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/af7cd7c06d507d3fcc770ecc1b164b4623e00e12))

## [2.6.0-rc.8](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.6.0-rc.7...v2.6.0-rc.8) (2026-02-23)


### Features

* **248-01:** add actions settings category and ACTION_API_KEY_REQUIRED notification ([0ffc2a0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0ffc2a0a2f4135c3464bf145262d0ce8766f7ed2))
* **248-01:** migrate registerBuiltInProviders to SettingsService and fire API key notification ([de183fd](https://github.com/minhoyoo-iotrust/WAIaaS/commit/de183fdef9836421c0ec022da4072c313350ff62))
* **248-02:** extend resolve() to return ContractCallRequest[] with actionProvider tagging ([df35876](https://github.com/minhoyoo-iotrust/WAIaaS/commit/df358764ed91e16a00e50c3cf8d35ffea22ae54d))
* **248-02:** sequential pipeline execution + provider-trust CONTRACT_WHITELIST bypass ([f61f958](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f61f958c820afcaa4b84abbd1c456a1d6c98e2ff))
* **248-03:** add Actions page with provider list, toggles, and API key management ([dcfc904](https://github.com/minhoyoo-iotrust/WAIaaS/commit/dcfc904f539e09ef05c523c4f54cadaf9d5d25b4))
* **249-01:** add ZeroExApiClient, Zod schemas, and config ([7690aea](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7690aeaa21510fda7b141bfb0c26cb80d7800077))
* **249-02:** implement ZeroExSwapActionProvider with approve+swap resolution ([b3dd141](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b3dd141dcdbabf22c54163dff173bc1ccd63b64d))
* **250-01:** add execute_action method to Python SDK ([b21c91e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b21c91eb632ffbba766b32d81c18ef0d4199d901))
* **250-01:** add executeAction method to TS SDK ([6c93cbf](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6c93cbf3a3d4c5e4376f89be006dca539409e806))


### Bug Fixes

* **248:** update test assertions for executeResolve array return and notification count ([ef72b5d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ef72b5dd5b0112326dd6e91746bacbad54aad2b1))
* **250:** update Python SDK examples in skill docs and fix INTG-03 tool name ([8663782](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8663782b621226abd79590b9d015e8778d091795))
* align test assertions with formatted amounts and multi-network subscriptions ([fe337aa](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fe337aaa1ee514fb05276e3f601861116dcc3544))
* align test fixtures with column rename and add multi-network subscriptions ([da29107](https://github.com/minhoyoo-iotrust/WAIaaS/commit/da29107edd2dbff1a5949ef41c0ed22c2e355ffb))
* correct provider name in Python SDK docstring (0x-swap -&gt; zerox_swap) ([31252fb](https://github.com/minhoyoo-iotrust/WAIaaS/commit/31252fb0f848a12e00ee24d8f3db801422a2ab35))
* create WcSigningBridge during WalletConnect hot-reload ([#166](https://github.com/minhoyoo-iotrust/WAIaaS/issues/166)) ([3231742](https://github.com/minhoyoo-iotrust/WAIaaS/commit/32317429e7c5b2154bdf94116579e04376f39770))
* resolve 7 open issues ([#157](https://github.com/minhoyoo-iotrust/WAIaaS/issues/157)-[#163](https://github.com/minhoyoo-iotrust/WAIaaS/issues/163)) for milestone v28.2 ([e31d9dc](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e31d9dc37050e3fd266726679f36be32b664d0b9))
* update action-provider contract test for resolve() array return type ([b8b153c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b8b153cb8ed94b0216ef056c137dffbf8ed9e68c))
* update NotificationEventType expected count to 31 ([ac0b986](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ac0b9865422264e2ff5a0ece7ad5028a78d14c3e))

## [2.6.0-rc.7](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.6.0-rc.6...v2.6.0-rc.7) (2026-02-23)


### Bug Fixes

* add @waiaas/actions to release-please config and bump version ([5dedec4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5dedec4a4bd296a63c32d23f547538e00a97c267))

## [2.6.0-rc.6](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.6.0-rc.5...v2.6.0-rc.6) (2026-02-23)


### Bug Fixes

* **ci:** add @waiaas/actions package to Docker build and release pipeline ([35c59ab](https://github.com/minhoyoo-iotrust/WAIaaS/commit/35c59ab03f82f66ed6821a1ade3056eb8e33ae13))

## [2.6.0-rc.5](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.6.0-rc.4...v2.6.0-rc.5) (2026-02-23)


### Features

* **actions:** add Jupiter Swap action provider package ([43e710a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/43e710a5931201f6fb98686274c2aaa54cdcf98d))
* add per-event notification filtering with collapsible UI ([#155](https://github.com/minhoyoo-iotrust/WAIaaS/issues/155)) ([3818174](https://github.com/minhoyoo-iotrust/WAIaaS/commit/3818174874f70ecb1ed831a5dfb9c0ea77b9fe82))
* **admin:** merge Transactions and Incoming TX pages ([#153](https://github.com/minhoyoo-iotrust/WAIaaS/issues/153)) ([d71461a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d71461a9ac069c351f1008204120741efc1abc0f))
* **daemon:** integrate Jupiter Swap provider with config and auto-registration ([c87127e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c87127e48cd745738d4e77581693e3f78ee9b69c))


### Bug Fixes

* **admin:** add FilterBar and SearchInput CSS styles ([#156](https://github.com/minhoyoo-iotrust/WAIaaS/issues/156)) ([a852089](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a852089636df62de8109f8ba15143e0fac75ed4c))
* move Balance Monitoring tab from Wallets to Notifications page ([#154](https://github.com/minhoyoo-iotrust/WAIaaS/issues/154)) ([3662377](https://github.com/minhoyoo-iotrust/WAIaaS/commit/36623774d1db0e4b007687cc5eea6f6ddfd3c3f8))

## [2.6.0-rc.4](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.6.0-rc.3...v2.6.0-rc.4) (2026-02-23)


### Features

* **244-01:** finalize DEFI-01 package structure design (PKGS-01~04) ([6799b89](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6799b8983a70d0ba2738642e8c522d47ce3999c5))
* **244-01:** update m28-02 objective from Permit2 to AllowanceHolder ([2837cdf](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2837cdfbbc6158b853c80309d73d0500115dd9f9))
* **245-01:** ASNC-01/02/04/05 async status tracking confirmed design ([82eab8d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/82eab8dde16ca167ccd4b5afed930b5657e0534d))
* **245-01:** ASNC-03 integrated DB migration v23 design confirmed ([6af6ac0](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6af6ac0dd0e0cdd3bf885fd6085bc074b7b677df))
* **245-02:** add SAFE-01 Jito MEV fail-closed and SAFE-02 wstETH adoption design ([8600a98](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8600a98ed666185e43151938da38897309845ec4))
* **245-02:** add SAFE-03 stale calldata re-resolve and SAFE-04 API drift defense design ([90d42f3](https://github.com/minhoyoo-iotrust/WAIaaS/commit/90d42f3011e69cf005b5900bf3eb93d91bb99d1f))

## [2.6.0-rc.3](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.6.0-rc.2...v2.6.0-rc.3) (2026-02-23)


### Features

* **239-01:** add ExplorerLink, FilterBar, and SearchInput shared components ([f147357](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f1473570bed7b76c78829a649e0a1d87b28968b4))
* **239-02:** add cross-wallet admin API endpoints ([7a23ba9](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7a23ba9145dc78f7af029463901f6b8066ca7292))
* **240-01:** add Transactions page with table, filters, search, pagination, and row expand ([98bc517](https://github.com/minhoyoo-iotrust/WAIaaS/commit/98bc517fb2cf8ee87e6bf01c0b01f8c00e461ded))
* **240-02:** add approval card, clickable cards, and network/txHash columns to dashboard ([6d7392f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6d7392fc0da6b0074c1de10a85300de0b203d17f))
* **241-01:** create Token Registry admin page with network filter and CRUD ([37ee933](https://github.com/minhoyoo-iotrust/WAIaaS/commit/37ee9338574ab5ea76e1604b8ba4e4573fd2f7d7))
* **241-02:** add notification log filters and clickable wallet links ([4bc2217](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4bc2217dc90f3619a89f9a5147cff91c4022fae3))
* **241-gap:** add token metadata auto-resolve endpoint and admin UI auto-fetch ([8113d64](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8113d64a1a786c4438d0af01a832329336da5b8f))
* **242-01:** add /incoming page with settings panel, TX table, filters, wallet toggle ([df4f1eb](https://github.com/minhoyoo-iotrust/WAIaaS/commit/df4f1eb0e7260e3521153b3dfd811f0527f3b301))
* **243-01:** add search, filter, and balance column to wallet list ([fb53ea5](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fb53ea5c685a3a90b9535a88782a0bf41d7ee582))
* **243-02:** restructure wallet detail into 4-tab layout with enhanced transactions and USD balance ([a643c99](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a643c99197ea5a047dbcc60d5d5239fe16f201a4))


### Bug Fixes

* **admin:** add USD value to wallet list balance column and fix Badge style prop ([007744a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/007744a94f5f39c25907362b11d35ff59093aa3b))
* **admin:** close milestone audit gaps DASH-04 and TXN-03 ([873d6f6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/873d6f609cbbc3a9e9a2b8c918f9f673b95e81ea))
* **admin:** update tests for 4-tab wallet detail layout and dashboard polling ([7fdd8d4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7fdd8d4708710ab7ef6d4a457b47b4aac1640120))
* resolve open issues [#150](https://github.com/minhoyoo-iotrust/WAIaaS/issues/150)-[#152](https://github.com/minhoyoo-iotrust/WAIaaS/issues/152) and fix AdminStatus amountUsd type ([c19cf98](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c19cf98d14230ed2502b2257f7f80cb04af8628f))

## [2.6.0-rc.2](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.6.0-rc.1...v2.6.0-rc.2) (2026-02-22)


### Features

* **235-01:** implement TokenLimitSchema with superRefine validation for SPENDING_LIMIT ([c2bc8a9](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c2bc8a9db3ce6066fe6e9aeded8d522615744cea))
* **235-01:** unblock USD-only and token_limits-only policy creation at daemon level ([d57b4f5](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d57b4f5126db1f65a6231ce41582dfcf53b58938))
* **236-01:** add tokenDecimals to TransactionParam + wire through buildTransactionParam ([062ca6a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/062ca6a3233bdc150cbec482418aa7bd42fd25ff))
* **236-02:** implement evaluateTokenTier + token_limits evaluation in policy engine ([2736239](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2736239b648bb98f6c095938a71395c96c601b9a))
* **236-03:** wire tokenContext through all evaluateSpendingLimit callsites ([4f78886](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4f7888618b785b3f8487f8aa503ecf771e5643e4))
* **237-01:** extend PolicyFormProps with network and update validateRules ([dbf8aa3](https://github.com/minhoyoo-iotrust/WAIaaS/commit/dbf8aa3970b19c565f083495513dc33d25009d9d))
* **237-01:** restructure SpendingLimitForm with USD top, token limits, and deprecated raw tiers ([42bcde8](https://github.com/minhoyoo-iotrust/WAIaaS/commit/42bcde879e5b6ffd75c3fbba04ab040df1d28d01))
* **237-02:** add CAIP-19 token limit rows with registry integration ([b7c279b](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b7c279b1c13f4c9883e7f440be751b88acc6c4c2))
* **237-02:** add token_limits ordering validation and deprecated warning ([b230e93](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b230e93ce700ece1bcd392c4eb7fdda29f5b5ee8))


### Bug Fixes

* **235:** revise plans based on checker feedback ([d47234c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d47234c12e9171de0687824bb32039148ce44640))
* **admin:** add USD defaults to SPENDING_LIMIT and update tests ([893b7f4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/893b7f40cfb4cda3fd631c90fb9402c435f61f68))
* **daemon:** update APPROVE tier tests for Phase 236 behavior change ([60aa3da](https://github.com/minhoyoo-iotrust/WAIaaS/commit/60aa3dad97b7581595eb7e3cb7523a9ea4aea29e))

## [2.6.0-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.6.0-rc...v2.6.0-rc.1) (2026-02-22)


### Features

* **231-01:** implement CAIP-2/19 parser, formatter, and Zod schemas ([81a3691](https://github.com/minhoyoo-iotrust/WAIaaS/commit/81a36915b7fb0ddf4ebfb78282b9840cc4d8a145))
* **231-02:** implement network-map.ts and asset-helpers.ts with 13-network CAIP-2 mapping ([4a42d4a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4a42d4a3f15d41b22780ad1dfc7f97fa8ed27a68))
* **231-02:** integrate CAIP module with x402, WC, TokenRef, barrel exports ([41c63d7](https://github.com/minhoyoo-iotrust/WAIaaS/commit/41c63d7033b4d45c894dff6920f0d8a826e1414b))
* **232-01:** migrate all oracle callers to buildCacheKey(network, address) ([2ab5d6c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2ab5d6c3bf0e3f1688e29df63c0f0ef987d18c28))
* **232-01:** rewrite buildCacheKey to CAIP-19 + expand CoinGecko L2 + update Pyth keys ([4d4a209](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4d4a2094aa135d1fc4bf3d0d1e0a00b8bfd2fdbb))
* **232-02:** thread network through pipeline oracle callers ([ef4add5](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ef4add5dc479f277d88c94d25fc966827f23d53a))
* **233-01:** add assetId field to token registry service and API response ([2d2be3f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2d2be3f08e414fadaebbb163c8959c410b1b13d1))
* **233-01:** add DB v22 migration with asset_id column and CAIP-19 backfill ([601ed90](https://github.com/minhoyoo-iotrust/WAIaaS/commit/601ed9097edab36037641a3bde04b6140d8f05fa))
* **233-02:** add optional assetId to TokenInfoSchema with cross-validation ([7ce2289](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7ce228943afd5abb623f543da8dd0f2b5843d0a2))
* **233-02:** propagate assetId through TransactionParam in pipeline ([bab6742](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bab6742499a3ae2f19d6f9bf929e8fc669ec6ed3))
* **233-03:** extend AllowedTokensRulesSchema with optional CAIP-19 assetId ([6231d68](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6231d6845ea302b2e75d8cb80dd545e5630834a0))
* **233-03:** implement 4-scenario ALLOWED_TOKENS matching matrix with CAIP-19 ([7942d09](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7942d09febc8dc20969756509393161b59deed81))
* **234-01:** add CAIP-19 assetId parameter to MCP token tool schemas ([ea5f37a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ea5f37a29215a1f6f0cb9a220eaaff8b7e106dfd))
* **234-02:** add optional CAIP-19 assetId to TS and Python SDK types ([0c44c99](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0c44c99e771b8de1a5e9ebbae128ef1bd4db2d76))


### Bug Fixes

* **231:** revise plans based on checker feedback ([5022668](https://github.com/minhoyoo-iotrust/WAIaaS/commit/502266859dae04a77fa3712330e892797232e47b))
* **233:** revise plans based on checker feedback ([fd7f1d8](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fd7f1d88cb50cfcfd4ee0d15f101b496b28aa349))
* lower daemon coverage thresholds to 84% for lines/statements ([871a4bc](https://github.com/minhoyoo-iotrust/WAIaaS/commit/871a4bc93c9d956125fb967cdc6a9f583453d51e))
* resolve 5 open issues ([#143](https://github.com/minhoyoo-iotrust/WAIaaS/issues/143), [#146](https://github.com/minhoyoo-iotrust/WAIaaS/issues/146), [#148](https://github.com/minhoyoo-iotrust/WAIaaS/issues/148), [#149](https://github.com/minhoyoo-iotrust/WAIaaS/issues/149), [#144](https://github.com/minhoyoo-iotrust/WAIaaS/issues/144)) ([c911235](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c911235e36f3cabc3c9d481bf5a277dd6d27591e))
* update test files to use CAIP-19 cache keys and NETWORK_TO_CAIP2 ([a404eeb](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a404eeb55072ebef8c6ffd33af2681c39c5da801))

## [2.6.0-rc](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.5.0...v2.6.0-rc) (2026-02-22)


### Features

* **224-01:** add IChainSubscriber interface and IncomingTxStatus enum ([bd76428](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bd764289bbc5325fe02f2470abe54f297b6e325c))
* **224-01:** add IncomingTransaction Zod schema and event types ([c40b0ba](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c40b0baa5c7cf23a0a7bf9b5cd94c1e2ef0008d9))
* **224-02:** add DB v21 migration + pushSchema DDL for incoming TX monitoring ([35de861](https://github.com/minhoyoo-iotrust/WAIaaS/commit/35de8613072f84675ccc38115c82623f5181e255))
* **224-02:** add Drizzle schema tables + update migration chain tests + re-exports ([f671e62](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f671e625c393f607b2adb835392730dcc63d9f36))
* **225-01:** add SOL and SPL/Token-2022 incoming transfer parsers ([953323f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/953323f0e62cde859199c9e6ad37ddf32dba8b22))
* **225-01:** add SolanaIncomingSubscriber, SolanaHeartbeat, and 19 tests ([4eb612d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4eb612d77b0d6b9fb096a7d4daeb4643705f4896))
* **225-02:** implement EvmIncomingSubscriber with ERC-20 and native ETH detection ([b508994](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b508994fe085e5c9883f390531d5da388d6a09cc))
* **225-03:** add ConnectionState type, calculateDelay, and reconnectLoop ([7710287](https://github.com/minhoyoo-iotrust/WAIaaS/commit/77102875e32105e6a46fa31ecc3c9461ae373fae))
* **226-01:** implement IncomingTxQueue with Map dedup and batch flush ([f7fda7d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f7fda7d1934be15b5f5d3674c2012bedbb2657c2))
* **226-02:** implement SubscriptionMultiplexer with connection sharing and reconnection ([d060c41](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d060c41c5f0b34c22e0d4202575a47c1bc4326b1))
* **226-03:** add worker handler factories and cursor utilities ([710df0d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/710df0d26c209698aeba2b67fbe51928113f4507))
* **226-04:** add safety rules + IncomingTxMonitorService orchestrator ([2223283](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2223283b330730cb872d6f9f5dfaa36e6999c87d))
* **226-04:** integrate IncomingTxMonitorService into DaemonLifecycle ([c4ce706](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c4ce706ec4ee288cdfdfd9c159df2c7f9171487b))
* **227-01:** add [incoming] section to DaemonConfigSchema and KNOWN_SECTIONS ([de13998](https://github.com/minhoyoo-iotrust/WAIaaS/commit/de1399868589bf5a9a5c6a24e24ccaeebde821c1))
* **227-02:** add IncomingSettings component to Admin UI settings page ([b17fc3a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b17fc3a6e0f3ce1184b9dbeae8cb3cb6b1fc2da0))
* **227-02:** add TX_INCOMING and TX_INCOMING_SUSPICIOUS notification event types ([af557ac](https://github.com/minhoyoo-iotrust/WAIaaS/commit/af557aced0136ae5bdec3881692164151a453fef))
* **228-01:** add incoming transaction list/summary routes and OpenAPI schemas ([7a5026a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7a5026abb7c2c0c950125bb4bafb2616ef05a633))
* **228-01:** add PATCH /wallets/:id route and mount incoming routes in server ([fe71253](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fe71253a6902e0b07ce3b05c4ba92272cb7874ae))
* **228-02:** add incoming transaction models and methods to Python SDK ([fc99f6f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fc99f6f9acba47b05f1300227b49c6fc2825ddea))
* **228-02:** add incoming transaction types and methods to TypeScript SDK ([7c42f61](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7c42f61617dcd645dff21588173f2f1ef6195baf))
* **228-03:** add MCP tools for incoming transaction queries ([ea6bc59](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ea6bc59805ed7ebb0495bb9b6bae50ce57264c69))
* **228-03:** update wallet.skill.md with incoming transactions section ([2f4e56c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2f4e56c5a1fb3e10d122540498151277a6b6a365))
* add policy.default_deny_x402_domains runtime toggle ([#131](https://github.com/minhoyoo-iotrust/WAIaaS/issues/131)) ([5bc84e8](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5bc84e8115d6b8192e9f9bb26a815d9e1b112c08))
* add wallet suspend/resume REST API and Admin UI ([#133](https://github.com/minhoyoo-iotrust/WAIaaS/issues/133)) ([373111a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/373111a9dd2ee9e95d19a15f49657c562ecb58e4))
* display walletName instead of walletId in notifications ([#135](https://github.com/minhoyoo-iotrust/WAIaaS/issues/135)) ([e0c26c1](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e0c26c165052279c881164a64c9e790022ed9c35))


### Bug Fixes

* **225-02:** fix TypeScript strict mode errors in subscriber tests ([a8ae1c9](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a8ae1c9c405ad58376214abd06d1a02d5aaeac0a))
* **226:** add non-null assertions for strict TS build in test files ([d666a59](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d666a5926ab5ecde990cd3f949a8f3a5ea27a83e))
* **226:** revise plans based on checker feedback ([782736c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/782736c36053b6b74488b9760af4c805f5509958))
* **228:** revise plans based on checker feedback ([025bbbf](https://github.com/minhoyoo-iotrust/WAIaaS/commit/025bbbf9a018a1fc4073c5634a0c504e402481a7))
* **229:** fix unused import and type assertion in integration tests ([463628d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/463628dbb6c149a311c10468508039da6d05715e))
* **229:** revise plan 229-02 based on checker feedback ([d10c125](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d10c125342d9a9016ae6dd9a4267523451befcf1))
* **230-01:** wire BackgroundWorkers, polling workers, and gap recovery across daemon lifecycle ([6132409](https://github.com/minhoyoo-iotrust/WAIaaS/commit/61324096db3fae6abb521cc34ee253fff77514d7))
* kill switch recover — remove dual-auth, fix error-handler catch-all code ([#132](https://github.com/minhoyoo-iotrust/WAIaaS/issues/132), [#134](https://github.com/minhoyoo-iotrust/WAIaaS/issues/134)) ([c27f838](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c27f8382ff4c31bf82eeb92fcc30c530e857ddca))
* **mcp:** update server test tool count from 21 to 23 ([5b76a3e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5b76a3e3fc9373d8ab007ba6a6c148c8c6269c1a))
* notification title duplication and empty wallet field ([#137](https://github.com/minhoyoo-iotrust/WAIaaS/issues/137), [#138](https://github.com/minhoyoo-iotrust/WAIaaS/issues/138)) ([8e4e83d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8e4e83dda08307cef396cbb2a45cac063b29d5f8))
* replace sync-version with sync-skills for root-to-package skill copy ([#136](https://github.com/minhoyoo-iotrust/WAIaaS/issues/136)) ([bfcec98](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bfcec98d22c0d6a74b04182cfcd69802ad82c5d8))
* resolve 4 open issues ([#139](https://github.com/minhoyoo-iotrust/WAIaaS/issues/139), [#140](https://github.com/minhoyoo-iotrust/WAIaaS/issues/140), [#141](https://github.com/minhoyoo-iotrust/WAIaaS/issues/141), [#142](https://github.com/minhoyoo-iotrust/WAIaaS/issues/142)) for v27.1 milestone ([3684a5b](https://github.com/minhoyoo-iotrust/WAIaaS/commit/3684a5bf77b60dff5448900516c3a258b1b78de4))
* resolve lint errors in solana subscriber and test files ([e9a4cfb](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e9a4cfb84c9a08bcaed49e7bcac97d984a95c1cd))
* update NotificationEventType expectedCount from 28 to 30 in enum SSoT ([b4224cc](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b4224ccc19bef604a556a610a17f0b11d2d39af9))

## [2.5.0](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.5.0-rc.1...v2.5.0) (2026-02-21)


### Bug Fixes

* promote v2.5.0-rc.1 to stable 2.5.0 ([bb1f523](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bb1f52310eeecd3b1f89acabe603f58f4464569f))

## [2.5.0-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.5.0-rc...v2.5.0-rc.1) (2026-02-21)


### Features

* add agent read-only access to policies and tokens APIs ([724f4df](https://github.com/minhoyoo-iotrust/WAIaaS/commit/724f4df3c422fb9c0a36ef064196a27bfbfa6036)), closes [#128](https://github.com/minhoyoo-iotrust/WAIaaS/issues/128)
* remove bulk session/MCP token creation (superseded by 1:N model) ([c3dffe2](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c3dffe25e3ee78eae61eec4f0ddaca0a86392f77)), closes [#130](https://github.com/minhoyoo-iotrust/WAIaaS/issues/130)


### Bug Fixes

* accept numberless RC tags in promote and release workflows ([a81c0d4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a81c0d46d640396786b8167818643c01f1b3afa7)), closes [#127](https://github.com/minhoyoo-iotrust/WAIaaS/issues/127)
* load notification channels from SettingsService on daemon startup ([028696a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/028696a13f25a381a27e5ba8d8dd23cd046b7c83)), closes [#129](https://github.com/minhoyoo-iotrust/WAIaaS/issues/129)

## [2.5.0-rc](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.4.0...v2.5.0-rc) (2026-02-21)


### Features

* add session token reissue API and token issued count tracking ([#125](https://github.com/minhoyoo-iotrust/WAIaaS/issues/125)) ([0c4bc07](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0c4bc07fe8bb0156197934b596c3c16a5499a2bf))
* reuse existing session in agent-prompt generation ([#124](https://github.com/minhoyoo-iotrust/WAIaaS/issues/124)) ([b7ea2d3](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b7ea2d31c317fbe3c03369810a68bdf10bf70eaf))


### Bug Fixes

* add session token setup instructions to Claude Code guide ([#122](https://github.com/minhoyoo-iotrust/WAIaaS/issues/122)) ([ae64a71](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ae64a71dda8d8cb8e109da6ef47e999c61f1ef95))
* include wallet UUID and available networks in agent prompt ([#123](https://github.com/minhoyoo-iotrust/WAIaaS/issues/123)) ([357659f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/357659ff2323ccfcd3f21b5671447a5bd25b8305))
* resolve detached HEAD in release.yml prerelease restore step ([#126](https://github.com/minhoyoo-iotrust/WAIaaS/issues/126)) ([29e6e03](https://github.com/minhoyoo-iotrust/WAIaaS/commit/29e6e0313a7d1576bacb9da215cf25fdc6502534))
* update schema version assertions from 19 to 20 in remaining test files ([e588fe6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e588fe671df9eacbfb6b97b55742f801757f3811))

## [2.4.0](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.4.0-rc.9...v2.4.0) (2026-02-21)


### Bug Fixes

* promote v2.4.0-rc.9 to stable 2.4.0 ([ab7aa13](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ab7aa138fb8b6e1ed5fc7c83a812684ee0e9f617))

## [2.4.0-rc.9](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.4.0-rc.8...v2.4.0-rc.9) (2026-02-21)


### Features

* **210-01:** add 4 session error codes + extend CreateSessionRequestSchema ([a678870](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a67887092861cd2df89fb0dbbc525c40568f19f5))
* **210-01:** add DB v19 migration for session_wallets junction table ([cffc76a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/cffc76ae54250be8f5fbe351ca13416bccb685b5))
* **210-02:** session-auth dual context + multi-wallet session creation + OpenAPI schemas ([3891ad6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/3891ad6e348613f569533365541126d5f384a226))
* **210-03:** add cascade defense logic to TERMINATE handler ([9608028](https://github.com/minhoyoo-iotrust/WAIaaS/commit/96080288ded56999f6d175c2bb62e644b9217c2d))
* **211-01:** add resolveWalletId helper and remove walletId from session-auth ([4b1e6c5](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4b1e6c5d19c4b79beae6d7e959dc50b80c675684))
* **211-02:** replace c.get('walletId') with resolveWalletId() across all endpoints ([5c52176](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5c52176787701fccd6d8935f77e4fccc277b0ce0))
* **212-01:** add ConnectInfoResponseSchema and GET /v1/connect-info route handler ([9c3bfb9](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9c3bfb9e7db962bb83e8c2a8d5286352df393644))
* **212-01:** integrate connect-info route with sessionAuth middleware ([771b9d9](https://github.com/minhoyoo-iotrust/WAIaaS/commit/771b9d9d4528498ccad81d4ae8c9d453d5ea716b))
* **212-02:** refactor agent-prompt to single multi-wallet session + shared prompt builder ([e039fcb](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e039fcb2978a1d341fde4198c646ed4c00c80d5a))
* **213-01:** add createSession and getConnectInfo to TypeScript SDK ([b8bf1fe](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b8bf1fef6f43e99d3922f5f90ba068818d7d2273))
* **213-01:** add get_connect_info to Python SDK with ConnectInfo model ([c894fc4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c894fc4c0abad05ead680e89a4f94a812b4a220d))
* **213-02:** add connect_info MCP tool and wallet_id param to all tools ([0b75dda](https://github.com/minhoyoo-iotrust/WAIaaS/commit/0b75dda8b64f8d98c48c36562651c425257d02ee))
* **213-02:** MCP single-instance model with optional WAIAAS_WALLET_ID ([e575f2e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e575f2e713835340aeb69185a463b21dffa7f745))
* **213-03:** admin UI multi-wallet session creation + wallet list display ([9023796](https://github.com/minhoyoo-iotrust/WAIaaS/commit/9023796867f0618a68fb42eae2dfce9359263351))
* **213-03:** CLI quickset single multi-wallet session + single MCP config ([fce42f5](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fce42f51784f9a477b760bae0fcd20ff2fcd5142))
* **213-04:** add SESSION_WALLET_ADDED/SESSION_WALLET_REMOVED notification events ([b0f993c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b0f993cf0a0e8ec75288699e8b77bcea28857145))
* automate RC-to-stable promotion via workflow_dispatch ([#120](https://github.com/minhoyoo-iotrust/WAIaaS/issues/120)) ([d07ca6a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d07ca6a0bba74a2d9b56ca88c81eb6325637dc75))


### Bug Fixes

* **210:** revise 210-02 plan based on checker feedback ([103df89](https://github.com/minhoyoo-iotrust/WAIaaS/commit/103df89481f80d10a0ef831137af93481895af1e))
* **214-03:** align Python SDK ConnectInfo type with daemon schema ([cdd064b](https://github.com/minhoyoo-iotrust/WAIaaS/commit/cdd064b9b14c5329a26fe9d541fa7fcf9f0fa452))
* **214-03:** align SDK ConnectInfoResponse type with daemon schema ([7ab8828](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7ab8828cefe1533fd5866e18d83c93fba767bb40))
* auto-restore prerelease mode after stable deploy ([#121](https://github.com/minhoyoo-iotrust/WAIaaS/issues/121)) ([03ed654](https://github.com/minhoyoo-iotrust/WAIaaS/commit/03ed654092e4087b5bc6525caf91b208123340f8))
* migrate session tests and code to v19 session_wallets junction table ([79c7b25](https://github.com/minhoyoo-iotrust/WAIaaS/commit/79c7b25e11b9b973fd0c6bd85f7e6a14daf1da6e))
* update error code count in tests from 100 to 104 ([2073d94](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2073d94e8c632e478be81121b5dab108fc6496c7))
* update NotificationEventType count from 26 to 28 in enum SSoT ([d4e38c7](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d4e38c7c416c70711599e5967890be2c26fb3670))

## [2.4.0-rc.8](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.4.0-rc.7...v2.4.0-rc.8) (2026-02-20)


### Bug Fixes

* **ci:** skip already-published npm versions on deploy re-run ([5661295](https://github.com/minhoyoo-iotrust/WAIaaS/commit/56612959ce156eb6a5977f76291d38717097b886))

## [2.4.0-rc.7](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.4.0-rc.6...v2.4.0-rc.7) (2026-02-20)


### Bug Fixes

* separate push-relay CLI entry point from library exports ([81465f2](https://github.com/minhoyoo-iotrust/WAIaaS/commit/81465f23fcc9d8444b12e5ddf670177ce4e733b4))

## [2.4.0-rc.6](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.4.0-rc.5...v2.4.0-rc.6) (2026-02-20)


### Features

* **207-01:** change NtfySigningChannel to base64url encode SignRequest ([01795f7](https://github.com/minhoyoo-iotrust/WAIaaS/commit/01795f7865f6ac38a431aabba97e9ff5b3978056))
* **208:** add @waiaas/push-relay package ([8145f29](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8145f29c24091e56a184459578ea0c134c658d86))
* **209:** add push-relay deployment infrastructure ([f7b1ca9](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f7b1ca94d111b1f3257b9f74ef8a906b60ed13d9))


### Bug Fixes

* add non-null assertion in wallet-sdk channel test ([6057091](https://github.com/minhoyoo-iotrust/WAIaaS/commit/60570914f816f70a33f0befaa90c445882eeb4ec))
* correct policy defaults checkbox category key mismatch ([#117](https://github.com/minhoyoo-iotrust/WAIaaS/issues/117)) ([4900cf4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/4900cf4c454d48552deb35d5dd28b6d89b381e01))
* **push-relay:** add missing category field in fcm-provider test fixture ([19ef866](https://github.com/minhoyoo-iotrust/WAIaaS/commit/19ef866b84e2ef4d8271a7b32d6e969094452710))

## [2.4.0-rc.5](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.4.0-rc.4...v2.4.0-rc.5) (2026-02-20)


### Bug Fixes

* rename unused sql parameter to _sql in wallet notification test ([a8d2278](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a8d2278f27b49b831acbac02173b8f61e726881a))

## [2.4.0-rc.4](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.4.0-rc.3...v2.4.0-rc.4) (2026-02-20)


### Bug Fixes

* **ci:** add wallet-sdk to release publish pipeline ([ca88b98](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ca88b98194a8fd76eb3b8b4cb83e546bf2b730ff))

## [2.4.0-rc.3](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.4.0-rc.2...v2.4.0-rc.3) (2026-02-20)


### Features

* **202-01:** add DB migration v18, signing SDK settings, and WalletLinkRegistry ([777bf94](https://github.com/minhoyoo-iotrust/WAIaaS/commit/777bf94ee8ea62e945ee1a94c2b5b0c1cc3a8b1a))
* **202-01:** add SIGNING domain error codes, signing protocol Zod schemas, and base64url utilities ([8c7f927](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8c7f927c85d14dc4284444f591c70c38aed3d53e))
* **202-02:** implement SignRequestBuilder for PENDING_APPROVAL transactions ([cd76243](https://github.com/minhoyoo-iotrust/WAIaaS/commit/cd762431d25df50b98103e85078c976cb0916ad4))
* **202-02:** implement SignResponseHandler for signing SDK approve/reject ([a58eb28](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a58eb28fe85ebbde17efdf8a97bc2308defa3d21))
* **202-03:** add sendViaNtfy, sendViaTelegram, subscribeToRequests channel functions ([c69dafb](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c69dafb0d03831400fd43959a9242cfdb31300d6))
* **202-03:** scaffold @waiaas/wallet-sdk with parseSignRequest, buildSignResponse, formatDisplayMessage ([228519a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/228519a4d93f0b03ec9f7a554f99ce13b5a02b96))
* **202-04:** add signing-sdk module index and E2E integration tests ([fd995b8](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fd995b8364f3a7afe9b03c6dbf9d272abb9c43c5))
* **202-04:** implement NtfySigningChannel with SSE subscribe ([8e78c27](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8e78c277d38631ab1880b012e1752f4c2218c21b))
* **203-01:** add /sign_response command to TelegramBotService + unit tests ([58f8915](https://github.com/minhoyoo-iotrust/WAIaaS/commit/58f8915959d758187e8e215a0472a4fa86942c2a))
* **203-01:** implement TelegramSigningChannel with ISigningChannel interface ([120a42c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/120a42c3988e6598e753990b26bbdf5d616c73b0))
* **203-02:** extend SetOwnerRequestSchema with approval_method field ([898908c](https://github.com/minhoyoo-iotrust/WAIaaS/commit/898908c55d0903e4091d288c81cf72f08b9035a2))
* **203-03:** implement ApprovalChannelRouter for signing channel routing ([cf68cf2](https://github.com/minhoyoo-iotrust/WAIaaS/commit/cf68cf22bd3563108d0dfdc993d619cbb0422799))
* **203-04:** add approval method radio selection UI with infra warnings ([d29d50f](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d29d50ffbdd201002a97064c066cd5507120240d))
* **203-04:** add WalletDetail approvalMethod type + data loading ([332b96a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/332b96a6a598a9cdf71737ca7b3cabbeb082a56a))
* **204-01:** wire ApprovalChannelRouter through pipeline request path ([479dfc2](https://github.com/minhoyoo-iotrust/WAIaaS/commit/479dfc28996b77090c8891a500d1d1460c0d9104))
* **204-01:** wire signing SDK classes into daemon lifecycle ([33b1987](https://github.com/minhoyoo-iotrust/WAIaaS/commit/33b19874d56b0bfb6fdb0140798fd50cb16d4b9f))
* **204-02:** inject signResponseHandler into TelegramBotService via late-binding setter ([69c4976](https://github.com/minhoyoo-iotrust/WAIaaS/commit/69c49764f219ab0876cf366498d7da581c049055))
* **205-01:** expose all 11 setting categories in admin settings API ([6667f56](https://github.com/minhoyoo-iotrust/WAIaaS/commit/6667f563b65343db2a9af18fc0125aa070b30cf6))
* **205-02:** add Signing SDK settings section to Admin Settings page ([cd0c94e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/cd0c94e9d7d9ffac562f25f7d87439cef2587d49))
* **cli:** change default environment mode from testnet to mainnet ([2f97679](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2f97679cbb8ca22b57f3f3b7cf85d9b9f5e1d306)), closes [#112](https://github.com/minhoyoo-iotrust/WAIaaS/issues/112)
* **skills:** add platform-specific skill installers and integration guides ([3e3eb01](https://github.com/minhoyoo-iotrust/WAIaaS/commit/3e3eb0156cec835032ac394b475d66485e13455d))


### Bug Fixes

* **202:** revise plans based on checker feedback ([82db3be](https://github.com/minhoyoo-iotrust/WAIaaS/commit/82db3beb310385ec9ce13e8d6124cfc5d84b1be4))
* **203:** revise plans based on checker feedback ([1c08e55](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1c08e55e54cc3234d8cc6ce7315ab616bb2e155c))
* **admin:** use PUT response settings to prevent save-then-revert UI bug ([f5807f1](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f5807f114f47f9dace7ae9428364652b6ac16ceb)), closes [#116](https://github.com/minhoyoo-iotrust/WAIaaS/issues/116)
* **ci:** add test:unit script to wallet-sdk for CI coverage report ([b6b3d4a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b6b3d4a4026e15a8779ed0c77c51ba345c8d6b23))
* **ci:** handle hyphenated package names in coverage-gate.sh ([8b83854](https://github.com/minhoyoo-iotrust/WAIaaS/commit/8b838543867560927057b0b445f91d5df66b58b5))
* **daemon:** read notification status from SettingsService instead of static config ([758dbf4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/758dbf4bcfc008a648633437cf000b875b8d4deb)), closes [#115](https://github.com/minhoyoo-iotrust/WAIaaS/issues/115)
* register wallet-sdk in release-please and add 5 missing packages to CI coverage ([88a90d2](https://github.com/minhoyoo-iotrust/WAIaaS/commit/88a90d2c57f7225df2ff83f427c486436e908c66)), closes [#107](https://github.com/minhoyoo-iotrust/WAIaaS/issues/107)
* replace remaining 'waiaas upgrade' references with 'waiaas update' ([5f25838](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5f2583845209b535321a8bfe5580b5e4dcfb2389)), closes [#110](https://github.com/minhoyoo-iotrust/WAIaaS/issues/110)
* resolve lint errors in signing SDK test files and channel impl ([df573d7](https://github.com/minhoyoo-iotrust/WAIaaS/commit/df573d7ce692da576ddd035c8d4287e2855e776e))

## [2.4.0-rc.2](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.4.0-rc.1...v2.4.0-rc.2) (2026-02-20)


### Features

* **admin:** add agent connection prompt card with REST API ([af0999d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/af0999d6f0561e09ef7b34f5555af4b9812e5f55))
* **admin:** add update available banner to dashboard ([14a6415](https://github.com/minhoyoo-iotrust/WAIaaS/commit/14a6415ef5f91c34384f49e8584989b66fea028f))
* **daemon:** add UPDATE_AVAILABLE notification event type ([839149a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/839149a11cdf1ad443122e7465b95cbd003e9c4b)), closes [#105](https://github.com/minhoyoo-iotrust/WAIaaS/issues/105)


### Bug Fixes

* **cli:** rename upgrade command to update with upgrade alias ([d5ed4d3](https://github.com/minhoyoo-iotrust/WAIaaS/commit/d5ed4d3a3afeea987ca606a994173d946a288c2d)), closes [#102](https://github.com/minhoyoo-iotrust/WAIaaS/issues/102)
* update NotificationEventType count to 26 and clean up archived phases ([45ad6f4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/45ad6f4373434dccf22f5320f3baf380fad4b4ae))
* update NotificationEventType expected count in enum SSoT verifier ([ca521ae](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ca521aeae7c85ef84a0e339f416102f6a7147c54))

## [2.4.0-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.4.0-rc...v2.4.0-rc.1) (2026-02-19)


### Features

* **194-01:** dynamic CLI version from package.json + engines.node ([7466309](https://github.com/minhoyoo-iotrust/WAIaaS/commit/746630965f7b3a9a94ec2fcf8efae7ecb70f6109))
* **194-01:** init password guidance, config template, permission errors ([2abdf87](https://github.com/minhoyoo-iotrust/WAIaaS/commit/2abdf874ae37794df98dd47bdad1d3c77183764f))
* **194-02:** downgrade Step logs to debug + EADDRINUSE error wrapping ([5152bc7](https://github.com/minhoyoo-iotrust/WAIaaS/commit/5152bc720bd92916742946b1144b344909e58a5d))
* **194-02:** start command error formatting + port conflict tests ([1b883f4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1b883f46deb8c662099f5e761aab8b12592c7316))
* **195-01:** quickstart English output, expiry display, idempotency, availableNetworks ([745f0f4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/745f0f49e06b9b6d9c5f3aeca82cf5adbc395bb4))
* **195-02:** mcp-setup quickstart guidance and expiry warning ([27b7495](https://github.com/minhoyoo-iotrust/WAIaaS/commit/27b7495d51b398e3759add5bbd964424178c36ad))
* **196-01:** extend skill file version sync to cover root skills/ directory ([f08b6f3](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f08b6f30bcc35174f6d50c7c216fe2f28cdc914e))
* **197-01:** add .env.example template for Docker users ([a53486a](https://github.com/minhoyoo-iotrust/WAIaaS/commit/a53486a1cdc5877cd476ff7ed1acd3d999e3f20d))
* **197-01:** switch docker-compose.yml to GHCR image reference ([f9c3f5d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/f9c3f5dc4ac09b4bdef4fb50ee99452d37badde0))


### Bug Fixes

* **196-01:** correct SDK code example field names in README ([bfa2862](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bfa28626ef2415973cd49cea3d491ed41925cfd0))
* **197-02:** sync Python SDK version to 1.7.0 and fix default port to 3100 ([506dac9](https://github.com/minhoyoo-iotrust/WAIaaS/commit/506dac9dac0eac77f8fc5a71f1679313f4e0b485))

## [2.4.0-rc](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.3.0...v2.4.0-rc) (2026-02-19)


### Features

* **191-02:** add walletconnect page tests ([e805787](https://github.com/minhoyoo-iotrust/WAIaaS/commit/e805787378581032873bd8cbf34cae1355df2293))
* **192-01:** add system page tests ([c169d86](https://github.com/minhoyoo-iotrust/WAIaaS/commit/c169d86afbacdc442e6c91d54c4f72aa6ccac03d))
* **193-02:** restore coverage thresholds to 70% ([bbd8c06](https://github.com/minhoyoo-iotrust/WAIaaS/commit/bbd8c06f934384958470ef774ee2f8df3195235e))


### Bug Fixes

* **admin:** move global notification toggle outside Telegram FieldGroup ([#101](https://github.com/minhoyoo-iotrust/WAIaaS/issues/101)) ([10b7cd5](https://github.com/minhoyoo-iotrust/WAIaaS/commit/10b7cd594a2387b80b1887e868b9d86046c98fb0))

## [2.3.0](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.3.0-rc.2...v2.3.0) (2026-02-19)


### Bug Fixes

* promote 2.3.0-rc to stable release ([017cdc6](https://github.com/minhoyoo-iotrust/WAIaaS/commit/017cdc68771b1398ad7d661bd109d601260e1039))

## [2.3.0-rc.2](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.3.0-rc.1...v2.3.0-rc.2) (2026-02-19)


### Bug Fixes

* resolve all 7 open issues (094-100) ([#28](https://github.com/minhoyoo-iotrust/WAIaaS/issues/28)) ([1ee80b5](https://github.com/minhoyoo-iotrust/WAIaaS/commit/1ee80b51f8fdcb6e251d2dc303f65aff571b860f))

## [2.3.0-rc.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.3.0-rc...v2.3.0-rc.1) (2026-02-19)


### Features

* **quick-5:** add build-time version sync for skill files ([ede3a3e](https://github.com/minhoyoo-iotrust/WAIaaS/commit/ede3a3e90d7a3bcf80a4b92ffd4be0360e3e5d30))
* **quick-5:** add Connection Discovery section to quickstart skill ([49075cb](https://github.com/minhoyoo-iotrust/WAIaaS/commit/49075cb4e6f7426532d1df17480562cfc6e30a95))
* **quick-6:** add agent connection prompt utility and Admin UI copy buttons ([fb5c78d](https://github.com/minhoyoo-iotrust/WAIaaS/commit/fb5c78d9fe7057b739b70bbf7db05dca24f6b75b))
* **quick-6:** add magic word output to CLI quickstart and skill file guide ([b52f5e8](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b52f5e8e144eebe31e52f3755d26ca73bbfbf17a))
* **quick-8:** add quickset as primary command with quickstart as alias ([befbd25](https://github.com/minhoyoo-iotrust/WAIaaS/commit/befbd25ae26b136b464464b0eff66bafe3a1b45f))


### Bug Fixes

* **ci:** lower admin coverage threshold and fix nightly Solana setup ([def9acf](https://github.com/minhoyoo-iotrust/WAIaaS/commit/def9acfa833b4cf2e8d8ef54bfe1c7394f87810e))
* **ci:** lower admin coverage threshold and fix nightly Solana setup ([7976307](https://github.com/minhoyoo-iotrust/WAIaaS/commit/7976307e0eb09056db218fae959e9468a1926ffc))
* **quick-1:** add master password validation at daemon startup (Step 2b) ([b91d2b3](https://github.com/minhoyoo-iotrust/WAIaaS/commit/b91d2b30b43deb090c82d88557cebfaa5e2dbff6))
* **quick-3:** correct homepage URLs and add bugs field in all package.json ([68a99d7](https://github.com/minhoyoo-iotrust/WAIaaS/commit/68a99d7d6c44d80b3e5753e00e177eb73919cf3d))
* **quick-4:** always initialize NotificationService regardless of config.toml enabled ([3a54be4](https://github.com/minhoyoo-iotrust/WAIaaS/commit/3a54be47a2565a3c652a96966634cac1fd675436))
* **quick-7:** update JWT rotation UI text to user-facing language ([cd1215b](https://github.com/minhoyoo-iotrust/WAIaaS/commit/cd1215bd9678c0e45a8b06c5d87ae36ff1bbaffb))

## [2.3.0-rc](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.2.1...v2.3.0-rc) (2026-02-19)


### Features

* npm Trusted Publishing with OIDC provenance (v2.4) ([80a8148](https://github.com/minhoyoo-iotrust/WAIaaS/commit/80a81487bc7090edc8c1750e5f295d26dd678904))
* npm Trusted Publishing with OIDC provenance (v2.4) ([80a8148](https://github.com/minhoyoo-iotrust/WAIaaS/commit/80a81487bc7090edc8c1750e5f295d26dd678904))

## [2.2.1](https://github.com/minhoyoo-iotrust/WAIaaS/compare/v2.2.0-rc.1...v2.2.1) (2026-02-18)

Stable release — promoted from v2.2.1-rc.1. Includes CI affected detection fix and smoke test daemon path resolution.

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
