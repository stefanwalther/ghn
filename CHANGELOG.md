# Changelog

## [0.4.0](https://github.com/stefanwalther/ghn/compare/ghn-v0.3.0...ghn-v0.4.0) (2026-10-24)


### Features

* **contributions:** add heatmap overlay to today chip ([#78](https://github.com/stefanwalther/ghn/issues/78)) ([fdfbbb4](https://github.com/stefanwalther/ghn/commit/fdfbbb4ca41f7507e2aafe2333f095e190b4b5f6))
* **inbox:** add hover snooze actions for repositories ([#75](https://github.com/stefanwalther/ghn/issues/75)) ([8c235f5](https://github.com/stefanwalther/ghn/commit/8c235f5f0fe1bb852eeef56e9a88e7082e7dd607))
* **inbox:** show loading skeleton immediately on item select ([#80](https://github.com/stefanwalther/ghn/issues/80)) ([ee57e79](https://github.com/stefanwalther/ghn/commit/ee57e79357a1fca79d743a4ed07c6e1877934435))
* **shortcuts:** group help modal and add search filter ([#73](https://github.com/stefanwalther/ghn/issues/73)) ([b7b0337](https://github.com/stefanwalther/ghn/commit/b7b0337e95101899379d4243d8339ac5dbde42ef))
* **sidebar:** pin GitHub links to bottom ([#72](https://github.com/stefanwalther/ghn/issues/72)) ([7a2eeb6](https://github.com/stefanwalther/ghn/commit/7a2eeb6df7d228c57ae4f7b25f85680c7fe2946d))
* **sidebar:** resizable filters with saved width ([#77](https://github.com/stefanwalther/ghn/issues/77)) ([27369f1](https://github.com/stefanwalther/ghn/commit/27369f14fa11407cd252dbc90a3e030157f6e66f))
* **themes:** add 16 selectable color themes ([#82](https://github.com/stefanwalther/ghn/issues/82)) ([8505492](https://github.com/stefanwalther/ghn/commit/8505492f05c3f93b0e8763e77f3465d971e9e64c))


### Bug Fixes

* **inbox:** keep sync countdown from shifting layout ([#81](https://github.com/stefanwalther/ghn/issues/81)) ([b8c576d](https://github.com/stefanwalther/ghn/commit/b8c576d08d4189b7c05e372618ae1ac97cf71d8a))
* **layout:** pin app shell and sidebars to the left edge ([#79](https://github.com/stefanwalther/ghn/issues/79)) ([69969c1](https://github.com/stefanwalther/ghn/commit/69969c18e97c6391444ea55ec8bac40f1ac316fe))

## [0.3.0](https://github.com/stefanwalther/ghn/compare/ghn-v0.2.0...ghn-v0.3.0) (2026-10-23)


### Features

* **bulk:** update sidebar counts optimistically ([#69](https://github.com/stefanwalther/ghn/issues/69)) ([254e3a9](https://github.com/stefanwalther/ghn/commit/254e3a9eeb1caac6d0b7b96eae45dcbe89c8c620))


### Bug Fixes

* **ui:** rename rate-limits heading and add repos loading skeleton ([#70](https://github.com/stefanwalther/ghn/issues/70)) ([a127c9f](https://github.com/stefanwalther/ghn/commit/a127c9f48263bf9501d4d7e5aee2802ea906b82a))

## [0.2.0](https://github.com/stefanwalther/ghn/compare/ghn-v0.1.0...ghn-v0.2.0) (2026-10-23)


### Features

* **brand:** add ghn wordmark and sync indicator ([#55](https://github.com/stefanwalther/ghn/issues/55)) ([cb51581](https://github.com/stefanwalther/ghn/commit/cb51581705ecc07565a50bd6f7025c874776e95c))
* **inbox:** pin bulk bar and item count as one sticky toolbar ([#66](https://github.com/stefanwalther/ghn/issues/66)) ([9407e88](https://github.com/stefanwalther/ghn/commit/9407e880a2b86447f94b3173b08543027b5f415e))
* **search:** show keyboard shortcuts in universal search ([#63](https://github.com/stefanwalther/ghn/issues/63)) ([3518833](https://github.com/stefanwalther/ghn/commit/35188333b59c73203a2cfcef979c9d8a282f85f6))
* **settings:** add dev Settings page for database and auth status ([#62](https://github.com/stefanwalther/ghn/issues/62)) ([4c67ed4](https://github.com/stefanwalther/ghn/commit/4c67ed4c15a411815f6c32273793f03683455670))
* **update:** show sidebar badge and dialog on new releases ([#67](https://github.com/stefanwalther/ghn/issues/67)) ([0812e58](https://github.com/stefanwalther/ghn/commit/0812e5865a621c54baa5b799422fd8add480472c))


### Bug Fixes

* **inbox:** remap Done to d and details to Shift+D ([#60](https://github.com/stefanwalther/ghn/issues/60)) ([cbec958](https://github.com/stefanwalther/ghn/commit/cbec9582a894d5d8546770d0f316d01f921cdd1e))
* **web:** rebuild and relaunch stale local server ([#64](https://github.com/stefanwalther/ghn/issues/64)) ([a509b85](https://github.com/stefanwalther/ghn/commit/a509b85b7b24fc8f313c726758e7eeea3d018714))

## 0.1.0 (2026-10-21)


### Features

* **app:** update browser title to ghn branding ([#18](https://github.com/stefanwalther/ghn/issues/18)) ([6123dc6](https://github.com/stefanwalther/ghn/commit/6123dc65dda8ecff9f68e0686228851f17145c6d))
* **config:** make database location configurable ([#27](https://github.com/stefanwalther/ghn/issues/27)) ([203e704](https://github.com/stefanwalther/ghn/commit/203e704b733899c85a64f9beaf39e67f11c95fb7))
* **dev:** per-workspace server ports ([#30](https://github.com/stefanwalther/ghn/issues/30)) ([f10babf](https://github.com/stefanwalther/ghn/commit/f10babfde9a8b8cb5ab230660d961defc45eb4d9))
* **docker:** GH_TOKEN container run plus sync duplicate fix ([#33](https://github.com/stefanwalther/ghn/issues/33)) ([cc3c724](https://github.com/stefanwalther/ghn/commit/cc3c724f5ab696d788d11db87e54d977255c2975))
* **drawer:** add prev/next keybindings and buttons to item drawer ([#23](https://github.com/stefanwalther/ghn/issues/23)) ([69c4e86](https://github.com/stefanwalther/ghn/commit/69c4e86e5cea1e50f954c8f380426015bcc93188))
* **inbox:** add per-item action menu and freshen contributions count ([#5](https://github.com/stefanwalther/ghn/issues/5)) ([aded45f](https://github.com/stefanwalther/ghn/commit/aded45f1df09d72f1294756ec923fdb207f634fa))
* **inbox:** flag closed PRs, demo banner, and item sync ([#20](https://github.com/stefanwalther/ghn/issues/20)) ([8e6afb8](https://github.com/stefanwalther/ghn/commit/8e6afb8e13a82d863b940ccfd42789198aeb26e7))
* **inbox:** open items in a side drawer and hide empty repos ([#8](https://github.com/stefanwalther/ghn/issues/8)) ([a89dec3](https://github.com/stefanwalther/ghn/commit/a89dec3ae4df59668ffd9c6b82d15494e702e322))
* **inbox:** preview Dependabot alerts in drawer ([#22](https://github.com/stefanwalther/ghn/issues/22)) ([05e65af](https://github.com/stefanwalther/ghn/commit/05e65af4072e9d6576d9af64acfe2617388ce88c))
* **inbox:** preview drawer with thread content, checks and runs ([#11](https://github.com/stefanwalther/ghn/issues/11)) ([e6da5a6](https://github.com/stefanwalther/ghn/commit/e6da5a6dcecbb5e5d343ea066862630652436718))
* **inbox:** select merged PRs via quick-select with purple badge ([#7](https://github.com/stefanwalther/ghn/issues/7)) ([11a77dd](https://github.com/stefanwalther/ghn/commit/11a77ddf1f26f67c73572b6e8d86f0888d2a93ed))
* **nav:** add GitHub section with notifications links ([#24](https://github.com/stefanwalther/ghn/issues/24)) ([16440ac](https://github.com/stefanwalther/ghn/commit/16440ac8b5abc6a8eb12f96ecce7c8d46a356be0))
* **notifications:** add quiet notifications prototype ([#2](https://github.com/stefanwalther/ghn/issues/2)) ([a703b35](https://github.com/stefanwalther/ghn/commit/a703b3502e259e2b0b7fce03e2d1832ed5d5b885))
* **notifications:** iterate inbox filtering, triage, and header stats ([#3](https://github.com/stefanwalther/ghn/issues/3)) ([1ffb792](https://github.com/stefanwalther/ghn/commit/1ffb7928c43eb4d22694b1228a005124cbb7a917))
* **notifications:** sync live GitHub inbox with write-back and digests ([#4](https://github.com/stefanwalther/ghn/issues/4)) ([2380306](https://github.com/stefanwalther/ghn/commit/23803061b3a251c0e5d90b0038221f0a1353ef92))
* **palette:** preserve filters on repo jumps, bound payload with limit ([#38](https://github.com/stefanwalther/ghn/issues/38)) ([ea73df5](https://github.com/stefanwalther/ghn/commit/ea73df52fb7efb67f17caa734083af05d1035b9c))
* **pr:** autolink issue refs and commits in PR bodies ([#16](https://github.com/stefanwalther/ghn/issues/16)) ([610184a](https://github.com/stefanwalther/ghn/commit/610184a80cdab0afe6a2cd479b391dd7b4ceee4e))
* **rate-limits:** add Rate limits view with live GitHub quota ([#13](https://github.com/stefanwalther/ghn/issues/13)) ([6cfa58a](https://github.com/stefanwalther/ghn/commit/6cfa58a8c36ac3adcde85d5a2ad93daf128233db))
* **raycast:** add GHN web launcher script ([#42](https://github.com/stefanwalther/ghn/issues/42)) ([f161776](https://github.com/stefanwalther/ghn/commit/f161776f77cb8c51429b4ec7457df653a76c797e))
* **release:** configure release-please with CI dispatch ([#12](https://github.com/stefanwalther/ghn/issues/12)) ([62e5afe](https://github.com/stefanwalther/ghn/commit/62e5afe989ad656e9bb3316a591266b7a6179591))
* **search:** add global command palette ([#34](https://github.com/stefanwalther/ghn/issues/34)) ([0c86a0c](https://github.com/stefanwalther/ghn/commit/0c86a0cdef3a723cec01213465ea73e6cfa6db08))
* **ui:** theme switcher dropdown and version footer ([#36](https://github.com/stefanwalther/ghn/issues/36)) ([d7eecd7](https://github.com/stefanwalther/ghn/commit/d7eecd700e2954571212aac5c4fd5a1d0e2f4cbc))
* **web:** add launcher to ensure local UI runs ([#10](https://github.com/stefanwalther/ghn/issues/10)) ([5005fc6](https://github.com/stefanwalther/ghn/commit/5005fc62d2d236ce787d3dee98aafaca909550c4))


### Bug Fixes

* **drawer:** always show title link icon ([#41](https://github.com/stefanwalther/ghn/issues/41)) ([72d4519](https://github.com/stefanwalther/ghn/commit/72d451923199c4b4b23359b64b151c50a2a0905e))
* **inbox:** keep Done enabled during bulk triage ([#45](https://github.com/stefanwalther/ghn/issues/45)) ([966bdf4](https://github.com/stefanwalther/ghn/commit/966bdf472da80805f5566c1f07317fd771f3c64f))
* **inbox:** keep quiet-only repos visible in filter list ([#43](https://github.com/stefanwalther/ghn/issues/43)) ([2fd6d47](https://github.com/stefanwalther/ghn/commit/2fd6d47d11cff529b09f4d723107bc4cc3558494))
* **inbox:** match quick-select releases to live data, drop dead merged shortcut ([#6](https://github.com/stefanwalther/ghn/issues/6)) ([4545cc0](https://github.com/stefanwalther/ghn/commit/4545cc012ac0998299824761e7d80541ed67f1e4))
* **inbox:** pin failed workflow run in check-suite drawer ([#26](https://github.com/stefanwalther/ghn/issues/26)) ([11daf65](https://github.com/stefanwalther/ghn/commit/11daf65fc5dc93c0dd743782a03b235b9b9b0e2a))
* **inbox:** show All as first type filter ([#39](https://github.com/stefanwalther/ghn/issues/39)) ([1ecb353](https://github.com/stefanwalther/ghn/commit/1ecb353445cff38f541246f0c7e845bb7e4b8ce2))
* **notifications:** ignore every selected thread on bulk unsubscribe ([#44](https://github.com/stefanwalther/ghn/issues/44)) ([2c4bfda](https://github.com/stefanwalther/ghn/commit/2c4bfda767dbcd6af7bd00d8f455715325c4de10)), closes [#35](https://github.com/stefanwalther/ghn/issues/35)
* **rate-limits:** keep tiny usage bars visible ([#17](https://github.com/stefanwalther/ghn/issues/17)) ([5a5a728](https://github.com/stefanwalther/ghn/commit/5a5a728f5d4f5021d57809760179e9d164e25e6a))
* **rate-limits:** use dedicated loading and error states ([#40](https://github.com/stefanwalther/ghn/issues/40)) ([b178138](https://github.com/stefanwalther/ghn/commit/b17813854f8459fbb0d9a8e8129216ba2e027cf2))
* **shortcuts:** restore Cmd+B sidebar toggle and Alt hint badge ([#9](https://github.com/stefanwalther/ghn/issues/9)) ([274253a](https://github.com/stefanwalther/ghn/commit/274253ad85b63f4fca0cbf51ed8f378eb3b84b73))
* **sync:** advance lastSyncAt on 304 to clear stale banner ([#19](https://github.com/stefanwalther/ghn/issues/19)) ([6b4f9d9](https://github.com/stefanwalther/ghn/commit/6b4f9d9cb14c69dd4d43257bc56324634a4ac2da))
