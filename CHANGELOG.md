# Changelog

## [0.3.0](https://github.com/stefanwalther/ghn/compare/quiet-notifications-v0.2.0...quiet-notifications-v0.3.0) (2026-10-21)


### Features

* **config:** make database location configurable ([#27](https://github.com/stefanwalther/ghn/issues/27)) ([203e704](https://github.com/stefanwalther/ghn/commit/203e704b733899c85a64f9beaf39e67f11c95fb7))
* **dev:** per-workspace server ports ([#30](https://github.com/stefanwalther/ghn/issues/30)) ([f10babf](https://github.com/stefanwalther/ghn/commit/f10babfde9a8b8cb5ab230660d961defc45eb4d9))
* **docker:** GH_TOKEN container run plus sync duplicate fix ([#33](https://github.com/stefanwalther/ghn/issues/33)) ([cc3c724](https://github.com/stefanwalther/ghn/commit/cc3c724f5ab696d788d11db87e54d977255c2975))
* **nav:** add GitHub section with notifications links ([#24](https://github.com/stefanwalther/ghn/issues/24)) ([16440ac](https://github.com/stefanwalther/ghn/commit/16440ac8b5abc6a8eb12f96ecce7c8d46a356be0))
* **palette:** preserve filters on repo jumps, bound payload with limit ([#38](https://github.com/stefanwalther/ghn/issues/38)) ([ea73df5](https://github.com/stefanwalther/ghn/commit/ea73df52fb7efb67f17caa734083af05d1035b9c))
* **raycast:** add GHN web launcher script ([#42](https://github.com/stefanwalther/ghn/issues/42)) ([f161776](https://github.com/stefanwalther/ghn/commit/f161776f77cb8c51429b4ec7457df653a76c797e))
* **search:** add global command palette ([#34](https://github.com/stefanwalther/ghn/issues/34)) ([0c86a0c](https://github.com/stefanwalther/ghn/commit/0c86a0cdef3a723cec01213465ea73e6cfa6db08))
* **ui:** theme switcher dropdown and version footer ([#36](https://github.com/stefanwalther/ghn/issues/36)) ([d7eecd7](https://github.com/stefanwalther/ghn/commit/d7eecd700e2954571212aac5c4fd5a1d0e2f4cbc))


### Bug Fixes

* **drawer:** always show title link icon ([#41](https://github.com/stefanwalther/ghn/issues/41)) ([72d4519](https://github.com/stefanwalther/ghn/commit/72d451923199c4b4b23359b64b151c50a2a0905e))
* **inbox:** keep Done enabled during bulk triage ([#45](https://github.com/stefanwalther/ghn/issues/45)) ([966bdf4](https://github.com/stefanwalther/ghn/commit/966bdf472da80805f5566c1f07317fd771f3c64f))
* **inbox:** keep quiet-only repos visible in filter list ([#43](https://github.com/stefanwalther/ghn/issues/43)) ([2fd6d47](https://github.com/stefanwalther/ghn/commit/2fd6d47d11cff529b09f4d723107bc4cc3558494))
* **inbox:** pin failed workflow run in check-suite drawer ([#26](https://github.com/stefanwalther/ghn/issues/26)) ([11daf65](https://github.com/stefanwalther/ghn/commit/11daf65fc5dc93c0dd743782a03b235b9b9b0e2a))
* **inbox:** show All as first type filter ([#39](https://github.com/stefanwalther/ghn/issues/39)) ([1ecb353](https://github.com/stefanwalther/ghn/commit/1ecb353445cff38f541246f0c7e845bb7e4b8ce2))
* **notifications:** ignore every selected thread on bulk unsubscribe ([#44](https://github.com/stefanwalther/ghn/issues/44)) ([2c4bfda](https://github.com/stefanwalther/ghn/commit/2c4bfda767dbcd6af7bd00d8f455715325c4de10)), closes [#35](https://github.com/stefanwalther/ghn/issues/35)
* **rate-limits:** use dedicated loading and error states ([#40](https://github.com/stefanwalther/ghn/issues/40)) ([b178138](https://github.com/stefanwalther/ghn/commit/b17813854f8459fbb0d9a8e8129216ba2e027cf2))

## [0.2.0](https://github.com/stefanwalther/ghn/compare/quiet-notifications-v0.1.0...quiet-notifications-v0.2.0) (2026-10-20)


### Features

* **app:** update browser title to ghn branding ([#18](https://github.com/stefanwalther/ghn/issues/18)) ([6123dc6](https://github.com/stefanwalther/ghn/commit/6123dc65dda8ecff9f68e0686228851f17145c6d))
* **inbox:** add per-item action menu and freshen contributions count ([#5](https://github.com/stefanwalther/ghn/issues/5)) ([aded45f](https://github.com/stefanwalther/ghn/commit/aded45f1df09d72f1294756ec923fdb207f634fa))
* **inbox:** flag closed PRs, demo banner, and item sync ([#20](https://github.com/stefanwalther/ghn/issues/20)) ([8e6afb8](https://github.com/stefanwalther/ghn/commit/8e6afb8e13a82d863b940ccfd42789198aeb26e7))
* **inbox:** open items in a side drawer and hide empty repos ([#8](https://github.com/stefanwalther/ghn/issues/8)) ([a89dec3](https://github.com/stefanwalther/ghn/commit/a89dec3ae4df59668ffd9c6b82d15494e702e322))
* **inbox:** preview Dependabot alerts in drawer ([#22](https://github.com/stefanwalther/ghn/issues/22)) ([05e65af](https://github.com/stefanwalther/ghn/commit/05e65af4072e9d6576d9af64acfe2617388ce88c))
* **inbox:** preview drawer with thread content, checks and runs ([#11](https://github.com/stefanwalther/ghn/issues/11)) ([e6da5a6](https://github.com/stefanwalther/ghn/commit/e6da5a6dcecbb5e5d343ea066862630652436718))
* **inbox:** select merged PRs via quick-select with purple badge ([#7](https://github.com/stefanwalther/ghn/issues/7)) ([11a77dd](https://github.com/stefanwalther/ghn/commit/11a77ddf1f26f67c73572b6e8d86f0888d2a93ed))
* **notifications:** add quiet notifications prototype ([#2](https://github.com/stefanwalther/ghn/issues/2)) ([a703b35](https://github.com/stefanwalther/ghn/commit/a703b3502e259e2b0b7fce03e2d1832ed5d5b885))
* **notifications:** iterate inbox filtering, triage, and header stats ([#3](https://github.com/stefanwalther/ghn/issues/3)) ([1ffb792](https://github.com/stefanwalther/ghn/commit/1ffb7928c43eb4d22694b1228a005124cbb7a917))
* **notifications:** sync live GitHub inbox with write-back and digests ([#4](https://github.com/stefanwalther/ghn/issues/4)) ([2380306](https://github.com/stefanwalther/ghn/commit/23803061b3a251c0e5d90b0038221f0a1353ef92))
* **pr:** autolink issue refs and commits in PR bodies ([#16](https://github.com/stefanwalther/ghn/issues/16)) ([610184a](https://github.com/stefanwalther/ghn/commit/610184a80cdab0afe6a2cd479b391dd7b4ceee4e))
* **rate-limits:** add Rate limits view with live GitHub quota ([#13](https://github.com/stefanwalther/ghn/issues/13)) ([6cfa58a](https://github.com/stefanwalther/ghn/commit/6cfa58a8c36ac3adcde85d5a2ad93daf128233db))
* **release:** configure release-please with CI dispatch ([#12](https://github.com/stefanwalther/ghn/issues/12)) ([62e5afe](https://github.com/stefanwalther/ghn/commit/62e5afe989ad656e9bb3316a591266b7a6179591))
* **web:** add launcher to ensure local UI runs ([#10](https://github.com/stefanwalther/ghn/issues/10)) ([5005fc6](https://github.com/stefanwalther/ghn/commit/5005fc62d2d236ce787d3dee98aafaca909550c4))


### Bug Fixes

* **inbox:** match quick-select releases to live data, drop dead merged shortcut ([#6](https://github.com/stefanwalther/ghn/issues/6)) ([4545cc0](https://github.com/stefanwalther/ghn/commit/4545cc012ac0998299824761e7d80541ed67f1e4))
* **rate-limits:** keep tiny usage bars visible ([#17](https://github.com/stefanwalther/ghn/issues/17)) ([5a5a728](https://github.com/stefanwalther/ghn/commit/5a5a728f5d4f5021d57809760179e9d164e25e6a))
* **shortcuts:** restore Cmd+B sidebar toggle and Alt hint badge ([#9](https://github.com/stefanwalther/ghn/issues/9)) ([274253a](https://github.com/stefanwalther/ghn/commit/274253ad85b63f4fca0cbf51ed8f378eb3b84b73))
* **sync:** advance lastSyncAt on 304 to clear stale banner ([#19](https://github.com/stefanwalther/ghn/issues/19)) ([6b4f9d9](https://github.com/stefanwalther/ghn/commit/6b4f9d9cb14c69dd4d43257bc56324634a4ac2da))

## [Unreleased]
