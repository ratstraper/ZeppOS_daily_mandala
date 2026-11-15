# Project Specification: ZeppOS Daily Mandala

This document is the source of truth for the `ZeppOS_daily_mandala` app. It describes
**what the code currently does** — modules, contracts, behavior, where the rules live,
and where the exceptions/inconsistencies are.

> **Working agreement:** from this point on, changes are made by editing this spec first,
> then implementing to match it. Code should not drift from what's written here without
> the spec being updated in the same change.

---

## 1. High-Level Overview

- **Core Functionality**: shows a unique mandala image for each calendar day, generated
  server-side from the date. Encourages a short (≈3 min) daily "practice" of opening and
  looking at the mandala.
- **Streak mechanic**: local, on-device counter of consecutive daily practice days, with a
  personal best.
- **NFT ecosystem tie-in**: the watch can be linked to a wallet on the
  `mandala.garageno9.site` website. Once linked, the watch shows a personal **Collection**
  of previously-minted mandalas (one mandala per calendar date, owned 1:1 — the site's
  "Birth Mandala" NFT concept).
- **News/notification loop**: periodically polls a news endpoint and schedules a delayed
  local notification.

---

## 2. Architecture

Three **roles** that run in different places:

| Role | Path | Runs on | Purpose |
|---|---|---|---|
| Device app | `page/*.js` + `app.js` | watch | UI, navigation, local storage, state machines |
| Companion service | `app-side/index.js` | phone (BLE companion) | network calls, file download/convert/transfer |
| App service | `app-service/delayedNewsService.js` | watch, alarm-triggered | fires a local notification some time after being scheduled |

These three roles are not `app.json` *targets* — see below, `targets` is a separate,
shape-driven split that each contains all three roles identically.

Communication device ⇄ companion is via `this.request({ method, request })` from a page
(ZML `BasePage`), routed on the phone side by `onRequest(req, res)` matching on
`req.method`.

### 2.1 Runtime / platform facts
- `configVersion: v3`, `apiVersion` target `4.2`, min `3.0`.
- **`app.json` declares two real targets, `round` and `square`** (not one `common` target
  as earlier versions of this app had) — each with its own `platforms: [{st: "r"}]` /
  `[{st: "s"}]` filter and its own `designWidth` (480 / 390), and otherwise an **identical**
  `module` block (same `page.pages` list, same `app-side.path`, same
  `app-service.services`, same `window` config) copy-pasted into both. This is the
  ZeppOS-documented way to give two device-shape families their own correct `px()` scaling
  base in one app: `designWidth` is a **target-level** field only — there is no
  per-`platforms`-entry override. (A prior single-`common`-target version of this file tried
  to express that override with a non-standard `dw` key on each `platforms[]` entry; that
  key does not exist in the ZeppOS v3 schema, so it was silently ignored and **every**
  device — round and square alike — was scaled against the one top-level `designWidth: 480`.
  This happened to be harmless for round devices [480 is also round's own default] but
  under-scaled every square device relative to its intended 390 baseline. Fixed by splitting
  into the two real targets described above.)
- **Asset directories are named after the target, not a fixed `common` prefix**:
  `assets/round.r/` and `assets/square.s/` (icons, `icon.png`, loading-animation frames —
  renamed from `assets/common.r/`/`assets/common.s/` when the targets above were split out of
  the old single `common` target). The build fails with *"The icon in app.json is empty or
  the image does not exist"* if a target's name and its asset directory's `<name>.<shape>`
  prefix ever drift apart — keep them in lock-step if either is renamed again.
- Per-shape **layout constants** (distinct from the `targets` split above, and older — this
  mechanism predates the round/square target split and is unaffected by it) are implemented
  via ZeppOS's `zosLoader:./index.[pf].layout.js` loader: `page/index.r.layout.js` (round)
  and `page/index.s.layout.js` (square) both export the same symbol set — `TITLE`,
  `FETCH_RESULT_TEXT`, `MENU_BUTTON`, `SECONDARY_BUTTON_HEIGHT` (now `px(72)` on both — see
  §5.1), and `PRACTICE_NORMAL_COLOR`/`PRACTICE_PRESSED_COLOR`/`PRACTICE_SELECTED_COLOR` —
  consumed by pages via `import { ... } from "zosLoader:./index.[pf].layout.js"`. Both files
  parse cleanly (`node --check` on each) and are kept in sync; `page/practice.js` is the one
  consumer of the `PRACTICE_*` colors and imports them under those names on both platforms.
- Permissions declared in `app.json`: `data:os.device.info`, `device:os.alarm`,
  `device:os.local_storage`, `device:os.network`, `device:os.notification`,
  `data:user.info`.
- `app.json` declares 11 locales for the app *name* (`en-US`, `pt-BR`, `vi-VN`, `id-ID`,
  `ru-RU`, `tr-TR`, `es-ES`, `uk-UA`, `de-DE`, `it-IT`, `zh-CN`), default `en-US`. In
  practice, **only `en-US` and `ru-RU` have full `.po` translation files** for
  `page/i18n/`, and both now carry the same key set (a handful of keys that existed only
  in `en-US.po` — `help_practice_slide3_title`/`_text` — and several unused-anywhere keys —
  `help_qr_intro`, `help_qr_text`, `deep_button`, `deep_practice_slide1_action`,
  `label_next`, `no_wallet_link` — have been deleted from both files). `app-side/i18n/`'s
  `en-US.po` is now **empty** (its only entry, a placeholder `"example"` key, was unused —
  `app-side/index.js` doesn't use i18n at all, see §7). All locales other than `en-US`/
  `ru-RU` fall back to `en-US` strings for anything beyond the app name.

---

## 3. Module Map

```
app.js                        BaseApp shell (no real global state; onCreate/onDestroy logging only)
app.json                      App manifest: pages, permissions, platforms, i18n
app-side/index.js             Companion (phone) request router + backend integration
app-service/delayedNewsService.js   Alarm-fired one-shot notification
page/index.js                 Main menu (Practice / Collection / Help)
page/practiceintro.js         One-time-until-dismissed "soft" onboarding before page/practice
page/practice.js              Daily-practice idle screen (streak, Open button)
page/show.js                  Generic "show a mandala image" screen (loading/result/error)
page/collection.js            NFT collection: not-linked / populated / empty states, no gate screens
page/link.js                  QR-based wallet linking + polling state machine
page/help.js                  Generic horizontal-swiper help/onboarding slideshow
page/qr.js                    Generic "scan this QR to open a URL" screen
page/settings.js              Collection settings hub: refresh / mint / unlink actions
page/index.r.layout.js        Round-screen layout constants/helpers
page/index.s.layout.js        Square-screen layout constants/helpers (same export set as the round layout)
utils/config/constants.js     Colors, WEBSITE_URL, STORAGE_KEYS, screen-type enum, CTA labels (see §5.6)
utils/config/device.js        Device info, i18n language-code → locale map, date formatting
utils/config/profile.js       Builds the common request payload sent to the companion
utils/config/storage.js       AppStorage: LocalStorage wrapper + practice-streak rules
utils/watch-api.js            WatchApi: thin request wrapper — link/*, unlink, sendCtaEvent (see §5.6)
utils/components/LoadingAnimationComponent.js   IMG_ANIM-based spinner widget
utils/ScheduleNotification.js Schedules a delayed local notification via @zos/alarm
utils/TextUtils.js            t(msgid, ...args): i18n string with {0},{1},… interpolation
utils/TgaThumbnail.js          Unused. General TGA thumbnail resizer (indexed8 + rgb565, nearest/box filter)
utils/IndexedTgaThumbnail.js   Unused. Stricter indexed-TGA-only thumbnail resizer
utils/ImageResizer.js          Unused. Simple row-skipping TGA resizer
utils/HardcoreResizer.js        Unused. Byte-patching TGA resizer with debug logging left in
```

---

## 4. Page Contracts & Behavior

Every page below is a ZML `BasePage`. Two recurring UI patterns are used throughout and
should be treated as the project's *de facto* interaction contract:

- **List/menu selection pattern**: a `selectedIndex` / `prevSelectedIndex` pair in
  `state`, an array of background-rect widgets in `state.bgRects`, `KEY_UP`/`KEY_DOWN`
  cycles the index, `KEY_SELECT` activates it, and touch (`CLICK_DOWN`/`MOVE`/`CLICK_UP`)
  mirrors the same activation logic. `updateSelection()`/`attachSelectable()` are the
  canonical helper shapes (first defined in `page/index.js`, later duplicated with small
  variations in `page/collection.js` — see §6 on duplication).
- **Screen-state pattern**: `SCREEN_LOADING` / `SCREEN_RESULT` / `SCREEN_ERROR` (string
  constants local to each file; `page/collection.js` adds a fourth, `SCREEN_NOT_LINKED`,
  §4.4) toggle group visibility; a `LoadingAnimationComponent` is
  shown/deleted on entering/leaving `SCREEN_LOADING`.

### 4.1 `page/index.js` — Main menu
- **Role**: navigation hub, first screen.
- **Menu items**: Practice → `page/practice` (first visit only: see the onboarding rule
  below), Collection → `page/collection` (no gating — see §4.4, `page/nolink.js` is deleted
  and `page/collection.js` alone decides what to show), plus a persistent help icon →
  `page/help` with `SLIDES_MAIN` (3 slides; the last one has a "visit website" `action`:
  `{ labelKey: "help_main_slide3_action", title: i18n("help_main_slide3_action"), url:
  WEBSITE_URL, ref: "index_home", cta: CTA.OPEN_INDEX_HOME_QR }` — see §5.6/§4.6 for the
  current `action` object shape, which no longer has a `full` field).
- **Rule — Practice first-run onboarding**: `executeAction()` checks
  `AppStorage.getRecord(STORAGE_KEYS.PRACTICE_INTRO_SEEN)` when `item.id === 'practice'`.
  If falsy, pushes `page/practiceintro` instead of going to `page/practice` directly — and
  **keeps doing so on every tap** until the user dismisses it for good (see §4.1a), not
  just the first time. Once the flag is set, every later tap on Practice goes straight to
  `page/practice`.
- **CTA tracking**: `executeAction()` fires `CTA.OPEN_INDEX_HOME` (§5.6) whenever
  `item.id === 'help'` — this one spot covers both touch and physical-`KEY_SELECT`
  activation, since both paths call `executeAction()`. (A separate, distinct CTA,
  `OPEN_INDEX_HOME_QR`, is carried on the help-slide action above and fires from
  `page/qr.js` itself when that QR screen actually opens — see §5.6's "per-entry-point QR
  CTA" note.)
- **Side effect — `loadNews()`**: on `build()`, if
  `now - STORAGE_KEYS.LAST_NEWS > 10 days`, sends `GET_NEWS` to the companion. On a
  successful response (`result === "Ok"`), **`LAST_NEWS` is stamped to `now`
  unconditionally** — regardless of whether `news` came back non-empty. (This used to be
  nested *inside* the `news.length > 0` check, so on the very common case of "server says OK
  but has nothing new to report," the timestamp never advanced and the next `build()` —
  i.e. the next time the main menu was opened — would see the same stale `LAST_NEWS` and
  poll again immediately, defeating the 10-day gate entirely. Fixed: the gate now only resets
  when the server actually answered, not when there happened to be news in that answer.)
  Only inside the `news.length > 0` branch does it also concatenate all `news[].body`
  (each item shaped `{ date, title, body }`) into one string and schedule a notification
  (title = first news item's title, content = concatenated bodies) via
  `scheduleNotification()`.

### 4.1a `page/practiceintro.js` — "Soft" onboarding before Practice
- **Role**: the one screen standing between `page/index.js`'s Practice menu item and
  `page/practice.js`, for as long as `STORAGE_KEYS.PRACTICE_INTRO_SEEN` is falsy (§4.1).
  Reached via `push()` (so hardware-back from here returns to the main menu, same as any
  other `push()`'d screen in this app).
- **Layout**: a single vertically free-scrolling page (no `setScrollMode` call — relies on
  ZeppOS's default free-scroll because content height exceeds the screen), built with a
  running Y cursor sized from `getTextLayout()` (the same measure-then-place pattern
  `page/settings.js` uses, and the now-deleted `page/linkinfo.js` used to). No physical-key
  navigation is registered, same choice. A page-level `hmUI.widget.PAGE_SCROLLBAR` widget is
  created at the top of `build()` to signal that the content is taller than the screen.
- **Content**: a local `SLIDES` array of 3 `{ titleKey, textKey }` pairs — reusing the same
  i18n keys (`help_practice_slide1..3_title/text`) the old swiper-based `DAILY_PRACTICE`
  deck used — rendered one after another top-to-bottom (title, body text, a thin divider
  between slides), not as a horizontal swiper. `build()` fires `CTA.OPEN_DAILY_HELP` (§5.6)
  every time this page is built — i.e. on every repeat showing, not just the first, since
  this screen can now legitimately be seen more than once (see below).
- **"Don't show this screen again" checkbox** (`practice_intro_dont_show_again`): not a
  native checkbox widget — a `GROUP` containing an outer square `FILL_RECT` (fixed gray
  border), an inner square `FILL_RECT` (`widgets.checkboxInner`, toggles between
  `0x000000`/background-matching when unchecked and `0x1f8ed6`/accent when checked — the
  same "swap a fill color on a smaller rect layered over a border rect" technique
  `page/practice.js`'s focus contour uses) and a label `TEXT`, with one `CLICK_UP` listener
  on the `GROUP` toggling `state.dontShowAgain` and the inner rect's color. Purely local
  UI state — nothing is written to storage until the button below is pressed.
- **`finishIntro()`** (bound to the trailing "Начать практику →" button,
  i18n `help_practice_slide3_action`): if `state.dontShowAgain` is true, sets
  `STORAGE_KEYS.PRACTICE_INTRO_SEEN = true` — **only then** does `page/index.js` stop
  routing here. If the checkbox was left unchecked, the flag is never written, so the very
  next tap on Practice shows this same screen again. Either way, `replace()`s to
  `page/practice`, removing this screen from the stack.

### 4.2 `page/practice.js` — Daily practice idle screen
- **Role**: entry point to the day's mandala; the "Open" button.
- **On init**: `refreshState()` reads `AppStorage.getPracticeDays()` into
  `state.progress = { streak, best, doneToday, isNextDay }`.
- **UI**: progress text `"{streak} · {best}"` (via i18n `streak`/`best` keys), status text
  `done_today` / `not_yet_today`, and a fixed subtitle (`practice_subtitle`) — this used to
  be one of four random `start_subtitle_0..3` strings; those keys are gone, replaced by this
  single one.
- **Navigation — two focusable elements**: the Open button (index 0) and a Help-styled icon
  (index 1, bw ↔ colored `question_64*.png` swap on focus — same visual as before).
  `KEY_DOWN`/`KEY_UP` toggle between them, `KEY_SELECT` activates whichever is current.
  Touch (`CLICK_DOWN`/`MOVE`/`CLICK_UP`) on each widget sets `state.selectedIndex` to that
  widget's own index and calls `syncFocus()`, so touch and physical-key focus always agree.
- **The Help-styled icon always opens `DEEP_PRACTICE`, unconditionally** — tapping/selecting
  it calls `openDeep()` (fires `CTA.OPEN_DEEPER`, §5.6; pushes `page/help` with
  `DEEP_PRACTICE`'s **4** slides — "Go Deeper" / "One Date" / "One Mandala" / "One Owner",
  the strongest scarcity/urgency copy in the app; only the 4th/last slide has an `action`:
  `{ labelKey: "deep_practice_slide4_action", title: i18n("deep_link_to_mint"), url:
  WEBSITE_URL + "/mint", ref: "deep_practice", cta: CTA.OPEN_DEEPER_QR }` — no `full` field;
  see §4.6/§4.7, `page/qr.js` no longer has a fullscreen mode at all). There used to be a separate
  view-count-gated "Go deeper" button (a third focusable element, shown only after
  `AppStorage.getCounter() > IDLE_VIEWS_COUNTER` opens) distinct from a Help icon that
  opened a 3-slide `DAILY_PRACTICE` orientation deck on this same page. All three of those —
  the gating counter, the on-page `DAILY_PRACTICE` deck, and the swiper-based help screen
  that rendered it — are gone from here: the counter mechanism
  (`AppStorage.addCounter()`/`getCounter()`, `STORAGE_KEYS.VIEW_COUNTER`) has been deleted
  entirely (nothing reads it, so nothing writes it either — the `page/show.js` write-site
  was removed too), and the orientation content now lives on the dedicated
  `page/practiceintro.js` (§4.1a), shown *before* a user ever reaches this page rather than
  from a button on it. The net effect: the icon that always looked like Help now always
  *behaves* like the old Go-deeper button, with no counter and no on-page fallback to the
  old orientation content — see the evaluation notes on this trade-off (not recorded in
  this spec; raised in conversation, not a code fact).
- **Focus styling — dark/light contour**: the Open button draws an oversized `FILL_RECT`
  "border" behind its body (`widgets.btnBorder`), colored `STROKE_COLOR_UNFOCUSED` (dark)
  normally and `STROKE_COLOR_FOCUSED` (light) when focused — `setButtonSelected()` only
  toggles this border color. The Help-styled icon has no border; it only swaps the bw/colored
  icon image (`setHelpSelected()`).
- **`scrollToSelected()`**: on every `KEY_UP`/`KEY_DOWN` press (not on touch — the finger is
  already on the target), scrolls the page (`@zos/page scrollTo`) so the newly-focused
  element is vertically centered on screen, using each element's known `y`/height from
  `this.layout` — same center-on-focus idea as `page/index.js`'s `scrollToItem` /
  `page/collection.js`'s `scrollToItem`.
- **`handleOpenClick()`**: pushes to `page/show` with
  `{ day: AppStorage.getMandalaDayString(), title, fromLocalStorage, type: PRACTICE_SHOW }`,
  where `fromLocalStorage` is true iff the stored `MANDALA_DAY` already equals today.

### 4.3 `page/show.js` — Generic mandala display
- **Role**: shared screen for both the daily practice image and any collection item image.
  Distinguished by `state.type ∈ { PRACTICE_SHOW (1), COLLECTION_SHOW (2) }` (see
  `utils/config/constants.js`).
- **Params contract** (`onInit(params)`, JSON): `{ day, title, fromLocalStorage, type }`.
  If params are missing/unparsable, falls back to `day = AppStorage.getMandalaDayString()`.
- **Rule — cache-or-fetch**:
  - `PRACTICE_SHOW`: if `STORAGE_KEYS.MANDALA_DAY === today`, use the cached
    `STORAGE_KEYS.MANDALA_PATH` and go straight to `SCREEN_RESULT`; otherwise
    `downloadMandala()`.
  - `COLLECTION_SHOW`: if `AppStorage.getRecord(state.day)` (a per-day-keyed record — see
    §5.2) exists, use it directly; otherwise `downloadMandala()`.
  - In both cache-hit branches, `openMandala(type)` is *also* called before rendering —
    this fires an `OPEN_MANDALA` request to the companion purely as a fire-and-forget
    signal (see §7, currently a no-op on the backend beyond being routed).
- **`downloadMandala()`**: sends `GET_MANDALA` with `{ day, type, ...Profile.createRequestData() }`.
  On `result === "Ok"`:
  - `PRACTICE_SHOW` → `AppStorage.setMandalaData(day, filePath)` (this is what advances
    the streak, see §5.3).
  - `COLLECTION_SHOW` → `AppStorage.setRecord(day, filePath)` (plain cache write, **does
    not** touch the streak).
- **Screen stays awake** (`setPageBrightTime`/`pauseDropWristScreenOff`) while in
  `SCREEN_LOADING` or `SCREEN_RESULT`, released on error or destroy.
- Any physical key press on this page triggers `hmUI.gotoBack()` (whole page is
  "press anything to go back").

### 4.4 `page/collection.js` — NFT collection: single entry point, no gate screens
- **Role**: the one screen for the whole Collection area. `page/nolink.js` and
  `page/linkinfo.js` — the former "not linked" gate (two buttons: "Details"/"Link") and its
  "why link" explainer — have both been **deleted**; their combined role is now decided
  inside this file's own `build()`, with one button per state instead of a
  Details-then-Link two-step. `page/index.js` no longer branches on `STORAGE_KEYS.LINKED`
  before routing here (§4.1) — Collection is now a plain menu item like any other; this
  file alone decides what to draw.
- **Three mutually-exclusive screen states**, added to the existing
  `SCREEN_LOADING`/`SCREEN_RESULT`/`SCREEN_ERROR` set as a new `SCREEN_NOT_LINKED`:
  1. **Not linked** (`SCREEN_NOT_LINKED`) — `widgets.notLinkedGroup` (built once up front,
     toggled via `setVisible()` exactly like `loadingGroup`/`errorGroup`): `no_link_help_title`
     + `no_link_help_text` (the former `page/linkinfo.js` copy, now embedded here) + a pair of
     side-by-side half-width CTAs built by `buildSplitButton()` (see below), not a single
     full-width button. Left (green, `0x00a86b`/`0x007a4d`, i18n `go_website`) pushes
     `page/qr` with `{ title: i18n("collection_go_site"), url: WEBSITE_URL, ref:
     "collection_home", cta: CTA.OPEN_COLLECTION_QR }` — the plain website root, *not* a
     `/mint`-suffixed URL; right (blue, `0x1f8ed6`/`0x156fa8`, i18n `no_link_link`) fires
     `CTA.OPEN_LINK_QR` and pushes `page/link` with `{ url: AppStorage.getLinkUrl() }` — the
     real pairing QR, not a second "learn more" step.
     No settings icon in this state (nothing to configure yet). The group also contains an
     `hmUI.widget.PAGE_SCROLLBAR` child (so it shows/hides with the group), since
     `no_link_help_text` plus the button row is long enough to push content below the screen
     on most layouts; a trailing spacer sized `(height - BTN_H) / 2` reserves exactly enough
     scroll room for the button pair to land vertically centered on screen once the user
     scrolls all the way down.
     - **Nesting constraint (important platform fact)**: the two split buttons are **not**
       children of `notLinkedGroup` — they're built as top-level page widgets
       (`widgets.notLinkedMintBtn`/`widgets.notLinkedLinkBtn`), siblings of it, with their
       own `setVisible()` calls alongside `notLinkedGroup`'s in both `buildNotLinkedGroup()`
       (initial hide) and `setScreenState()` (toggle on `isNotLinked`). A `GROUP` nested
       inside another dynamically-created `GROUP` (`someGroup.createWidget(hmUI.widget.GROUP,
       …)`) does not work reliably on-device: `buildSplitButton()` originally took the parent
       group and called `parent.createWidget(hmUI.widget.GROUP, …)`, which broke `build()`
       partway through `buildNotLinkedGroup()` — before it reached its own trailing
       `setVisible(notLinkedGroup, false)` — leaving `loadingGroup`'s "Loading…" text (default
       `VISIBLE`, never explicitly hidden since `setScreenState()` was never reached) and
       `notLinkedGroup`'s title/text (already created at the point of the break) both on
       screen at once, with the two buttons never created at all. Every other `GROUP` in this
       file (loading/error/not-linked groups, collection row groups) is nested exactly one
       level below the page itself — this is the only place a second level was attempted, and
       it's now known not to work.
     - **`buildSplitButton({x, y, w, h, side, normalColor, pressColor, text, onActivate})`**:
       renders one half of a capsule that reads as a single pill split into two — not a
       native `widget.BUTTON` (which only supports one uniform `radius` for all four
       corners), but a top-level `GROUP` containing a fully-rounded `FILL_RECT`
       (`radius: h/2`) plus a second, unrounded `FILL_RECT` of the same color overlaid on the
       inner edge (width `h/2`, on the right for `side: "left"`, on the left for
       `side: "right"`) that squares off just that one corner — leaving only the outer corner
       rounded. Press feedback and tap-vs-drag cancellation are hand-rolled on the `GROUP`'s
       own `CLICK_DOWN`/`MOVE`/`CLICK_UP` (repaint both rects together; a local `pressed` flag
       cleared on `MOVE` suppresses `onActivate()` on release, mirroring `attachSelectable`'s
       cancel-on-move rule but via a local flag instead of the shared `selectedIndex`, since
       this pair sits outside the physical-key cycle like the buttons it replaces). Returns
       the `GROUP` so the caller can store it for later `setVisible()` calls.
  2. **Linked, collection has items** (`SCREEN_RESULT`, non-empty) — unchanged from before:
     the row list + the settings icon as the trailing focusable element.
  3. **Linked, collection empty** (`SCREEN_RESULT`, empty array) — `empty_collection` text +
    the settings icon below it. This is the one state that used to
     show `empty_collection` with **no** call to action beyond the settings icon; now there's
     a direct path to minting right where a user who just checked and found nothing would be
     looking.
  All of these CTAs (`notLinkedGroup`'s split-button pair, the empty-state Mint button —
  the latter still a plain `widget.BUTTON` with `click_func`) are touch-only, not part of
  the `bgRects`/`selectedIndex` physical-key cycle, matching this app's existing convention
  for standalone CTA buttons (`page/settings.js`, `page/qr.js`'s back button): "no physical
  up/down/select cycling between standalone buttons" already applied to those pages and now
  to these too.
- **On `build()`**: after `consumeRefreshRequest()` (still checked first — still the only
  way `page/settings.js`'s Refresh reaches a real network call, now a link-status check
  followed conditionally by `GET_COLLECTION`, see below), reads
  `STORAGE_KEYS.LINKED`. If falsy: shows `SCREEN_NOT_LINKED` **immediately** (no loading
  spinner) and separately fires `checkLinkInBackground()` — a silent `GET_COLLECTION` that
  upgrades straight to `SCREEN_RESULT` if the backend says `"OK"` (the link happened on the
  website before this flag caught up), moved here from the old `page/nolink.js` almost
  verbatim, including its `state.checking` double-fire guard. Fires `CTA.LINKED` on that
  silent upgrade. If the flag is truthy: cache-first as before (`loadStoredCollection()` →
  `SCREEN_RESULT`, else `SCREEN_LOADING` + `getCollection()`).
- **`getCollection()`**: sends `GET_COLLECTION`. `{status: "OK", collection}` → writes
  `STORAGE_KEYS.LINKED = true`, caches the collection, `SCREEN_RESULT` (empty or not, per
  above). `{status: "NO_LINK"}` → writes `STORAGE_KEYS.LINKED = false`, `SCREEN_NOT_LINKED`
  — this file is now the **sole** writer and reader of `STORAGE_KEYS.LINKED` in the app
  (previously shared with `page/nolink.js`). Anything else → `SCREEN_ERROR`.
- **List item shape**: `{ id, day, name }`. Row icon is `ic_collection.png` if
  `AppStorage.getRecord(item.day)` (a cached local file path) exists, else
  `ic_not_loaded.png`. Tapping a row pushes `page/show` with
  `{ id, day, title: name, fromLocalStorage: true, type: COLLECTION_SHOW }`.
- **Settings icon**, where shown, is always the last focusable element and opens
  `page/settings` via **`replace()`, not `push()`** — this page is destroyed, not paused,
  while Settings is open. `page/settings.js` is where collection maintenance actions
  (refresh / mint / unlink) live — see §4.8 — not on this page. The `replace()` choice
  (rather than the `push()` every other "open a sub-screen" transition in this app uses)
  exists purely to guarantee there is never more than one `page/collection.js` instance in
  the navigation stack at a time — see §4.8 and §6 for why: with `push()`,
  `page/settings.js`'s Refresh action would leave a second, stale collection instance
  sitting underneath, requiring two back-presses to actually leave the collection area. For
  the same reason, `page/settings.js`'s `unlinkWallet()` now also `replace()`s back to
  `page/collection` (it used to target the now-deleted `page/nolink`) — this file's own
  `build()` logic picks the right state up from there.
- **`consumeRefreshRequest()` — cross-page refresh signal, checked at the top of
  `build()`**: reads `AppStorage.getRecord(STORAGE_KEYS.COLLECTION_REFRESH)`. If truthy, it
  immediately clears the flag, runs `setScreenState(SCREEN_LOADING)` + `refreshWithLinkCheck()`
  (see below), and `build()` returns early — skipping the normal cache-first branch below
  entirely. This is how `page/settings.js`'s "Refresh" button actually triggers a refresh
  (see §4.8 and §6): it does not call the network itself, it sets this flag and navigates
  with `replace()` back to `page/collection`, forcing a brand-new instance whose `build()`
  picks the flag up. **This must be checked in `build()`, not in an `onResume()`/`onPause()`
  pair** — see §6: the device `Page` API has no such hooks, so nothing short of destroying
  and recreating the page will ever run code again on "back". The flag is otherwise never
  true (only `refreshCollection()` in `page/settings.js` writes it), so this check is a
  no-op on every normal cold `build()`.
- **`refreshWithLinkCheck()`** — only reachable via `consumeRefreshRequest()`, i.e. only on
  an explicit "Обновить" from Settings, never on a normal cold `build()`. Calls
  `WatchApi.linkStatus(page)` (`LINK_STATUS`, the same companion method `page/link.js`
  uses, §4.5) *before* touching the collection at all. Why: unlinking a device from the
  *website's* side (as opposed to this watch's own Unlink, §4.8) doesn't necessarily change
  what `GET_COLLECTION` reports on its own, so a plain refresh could silently keep showing a
  stale "linked" collection forever. On `d.link === 'linked'`, proceeds to the normal
  `getCollection()`. On any other `d.link` value, treats it as genuinely unlinked: writes
  `STORAGE_KEYS.LINKED = false`, clears `STORAGE_KEYS.COLLECTION_JSON`, and goes straight to
  `SCREEN_NOT_LINKED` — without ever calling `GET_COLLECTION`. A backend-reported
  `d.status === 'ERROR'`, or the request promise rejecting outright (BLE/transport
  failure), is deliberately **not** treated as "unlinked" — both fall back to the normal
  `getCollection()` call, which has its own error surface (`SCREEN_ERROR`); only a clean,
  non-error response that isn't `'linked'` triggers the local unlink.

### 4.5 `page/link.js` — Wallet linking flow
- **Role**: QR-based device↔wallet pairing, driven entirely through `utils/watch-api.js`
  (`WatchApi.linkStart/linkStatus/linkConfirm/linkReject`) — this is the **only** page that
  goes through the `WatchApi` abstraction rather than calling `this.request` directly (see
  §6).
- **State machine** (rendered directly via imperative widget create/destroy, not the
  loading/result/error constants used elsewhere):
  - `restore()` (called on `build()`): calls `LINK_STATUS`.
    - `link === 'pending_watch_confirm'` + `wallet` → `showConfirm(wallet)`.
    - `link === 'linked'` → `showDone(true, …)`.
    - otherwise → `startLink()`.
  - `startLink()`: calls `LINK_START`; on success shows a QR of `d.qr` and starts polling
    `LINK_STATUS` every `POLL_MS` (4000ms) via `setInterval`, for at most
    `ceil(d.ttlSec*1000/POLL_MS)` ticks (default `ttlSec=600` → ~150 ticks) before expiring
    (`qr_expired`).
  - `showConfirm(wallet)` → user picks **Confirm** (fires `CTA.CONFIRM_LINK` — see §5.6 —
    then `LINK_CONFIRM`) or **Cancel** (`LINK_REJECT`, then restarts `startLink()`; no CTA
    is fired on Cancel).
  - `showDone(ok, msg)`: fires `CTA.LINKED` when `ok` is true — this one spot covers all
    three paths that reach it (`restore()` finding an already-linked wallet, `poll()`
    detecting a fresh link, a successful `confirm()`) — then always writes
    `STORAGE_KEYS.LINKED = ok` (a boolean — note this is the only successful
    non-boolean-safe write path if `ok` is undefined/error).
- **Screen kept awake** for the QR step only (`setPageBrightTime`/`pauseDropWristScreenOff`
  600000ms), reset on destroy.
- Network/BLE errors at every step degrade to `showDone(false, err_internet_connection)`
  rather than crashing the polling loop.

### 4.6 `page/help.js` — Generic help slideshow
- **Contract**: takes `params = JSON.stringify({ slides })` where each slide is
  `{ titleKey, textKey, label?, action?: { labelKey, title, url, ref, cta } }`. Used by
  `page/index` (`SLIDES_MAIN`) and `page/practice` (`DEEP_PRACTICE`). There is no `full`
  field on `action` anymore — `page/qr.js` dropped its fullscreen mode entirely (§4.7).
  (`page/practiceintro.js`'s onboarding content — §4.1a — used to be a `DAILY_PRACTICE` deck
  rendered through this file too, with a one-off in-app-navigation action kind added just
  for its last slide; that whole deck and the action kind it needed have both been removed
  from here — the onboarding is its own dedicated page now, not a `page/help` slide deck.)
- **Horizontal swiper, implemented via `setScrollMode`'s own callback, not a separate
  event-subscription API**: `setScrollMode({ mode: SCROLL_MODE_SWIPER_HORIZONTAL, options:
  { width, count, modeParams: { on_page: (current) => { ... } } } })` — `on_page` is the
  *only* hook ZeppOS actually exposes for "a slide finished scrolling into view"; there is
  **no** `onPageScrollDone`/`offPageScrollDone`/`getSwiperIndex` in `@zos/page` (an earlier
  version of this file imported and called all three — none exist, so `onPageScrollDone(...)`
  threw `TypeError: not a function` the instant `build()` ran, and nothing on this page ever
  rendered). `on_page` does two things: fires the existing haptic feedback (strong buzz on
  reaching the last slide, nothing on the others — the mid-deck "soft buzz" mentioned in an
  earlier pass of this doc does not actually exist in the code) and writes the current index
  into `state.currentIndex`, which the physical-key handler below depends on.
- **Physical `KEY_SELECT` support**: a slide's `action` button used to be reachable by touch
  only. `build()` now also registers `onKey({ callback: (key, keyEvent) => {...} })`: on a
  classified `KEY_SELECT` click, it looks up `state.slides[state.currentIndex]` and, if that
  slide has an `action`, calls `this.openAction(action)` — the same method the button's own
  `click_func` calls — and returns `true`; any other key, or a slide with no `action` (a
  `label`-only slide, or a slide with neither), returns `false` without side effects.
  `offKey()` is called in `onDestroy()` to match. `openAction(action)` itself does the haptic
  + `push({url: "page/qr", params: JSON.stringify({url: action.url, title: action.title,
  ref: action.ref, cta: action.cta})})` that used to be inlined directly in the button's
  `click_func` — pulled into its own method specifically so touch and the physical key share
  one implementation instead of two.
- **If `slides` is empty/missing, `build()` logs an error and renders nothing** — no
  fallback UI.
- **Known leftover**: the slide-title `TEXT` widget's height is still hardcoded to `px(80)`
  (`h: px(80), //h: titleLayout.height,` — the dynamically-measured `titleLayout.height` is
  computed right above it but not actually used). Harmless for the short titles every current
  caller passes, but a sufficiently long/wrapped title could still clip against the divider
  below it; not fixed, since the one reported real-world clipping on this page turned out to
  be the *body* text (§6's `getTextLayout` note), not the title.

### 4.7 `page/qr.js` — Generic "scan to open URL" screen
- **Role and visual contract rewritten to match `page/link.js`'s QR screen** (title above,
  one QR code, one caption below, Back button) — the previous version (title + intro +
  domain + body text, with a `full` param that hid three of those four widgets for a
  QR-only fullscreen variant) is gone entirely. There is no fullscreen mode anymore; every
  caller gets the same single layout.
- **Contract**: `params = JSON.stringify({ title?, url?, ref?, cta? })`.
  - `title` overrides the default `i18n("help_qr_title")` ("Scan"/"Отсканируй") — every
    current caller passes its own (`help.js`'s slide actions, `settings.js`'s Mint,
    `collection.js`'s not-linked-state website button all supply `title`). Since this can be
    arbitrary caller-supplied text (ultimately server-driven for `page/help.js`'s slides),
    the title `TEXT` widget's height is the one place in this file that *is* measured
    dynamically (`measureText`, §6) rather than fixed, and the QR's own Y position is pushed
    down (`Math.max(height*0.17, titleY + titleLayout.height + px(8))`) if a long/wrapped
    title needs more than one line — otherwise the QR sits at its normal fixed `height*0.17`.
  - `url` defaults to the website root (`https://mandala.garageno9.site`) if absent/unparsable.
  - `ref` is an optional funnel-attribution tag (§5.6), appended to the *encoded* URL only
    (see `withRef()` below) — not shown anywhere in the UI.
  - `cta` overrides which `CTA` label fires on open — defaults to `CTA.OPEN_QR` in
    `state.cta` if the caller doesn't supply one. This is new: previously `build()` always
    fired the one hardcoded `CTA.OPEN_QR` regardless of caller; now each entry point can tag
    its own QR-open event (`OPEN_DEEPER_QR`, `OPEN_INDEX_HOME_QR`, `OPEN_COLLECTION_QR`,
    `OPEN_MINT_QR` — see §5.6) while `page/qr.js` itself stays generic.
- **Attribution**: `withRef(url, ref)` appends `?ref=<ref>` (or `&ref=` if `url` already has
  a query string) to the URL actually encoded in the `QRCODE` widget's `content` — the
  domain caption text (`i18n("help_qr_domain")`, a fixed string, not derived from `url`) is
  untouched, only the scannable payload carries `ref`.
- **Layout** (`showQr(title, url, domain)`): QR size `Math.floor(Math.min(width, height) *
  0.45)`; title `TEXT` at `height*0.05` from the top; the domain caption below the QR has its
  height computed as the *remaining* gap down to the Back button (`UI.backY - bgY`), so it
  can never collide with the button regardless of content; Back button height/radius now
  come from the shared `SECONDARY_BUTTON_HEIGHT` constant (§5.1), not a local `px(72)`
  literal.
- **Known dead code**: the `UI` object at the top of the file still declares
  `titleX/titleY/titleW/titleSize`, `introX/introY/introW/introSize`, `qrSize/qrY`,
  `domainX/domainSize`, `textX/textW/textSize` — all leftovers from the pre-rewrite 4-widget
  layout. None of them are read anywhere in the current `showQr()`; only `UI.backX/backY/
  backW/backH` are live. Not removed yet.

### 4.8 `page/settings.js` — Collection maintenance actions
- **Role**: the wallet/collection "settings" hub, reached from `page/collection.js`'s
  help/settings icon (see §4.4) regardless of whether the collection is currently empty,
  linked, or not linked. Always shows the same three actions — this page does not branch
  on `STORAGE_KEYS.LINKED`; that flag can be stale (see §6), and every action below is
  either harmless or self-correcting if the wallet turns out not to be linked after all.
- **Layout contract**: each action is one *section* — an explanatory description line
  **above**, then a short (one-to-two word) `widget.BUTTON` below it carrying the actual
  tap target. The description is the "why", the button is the "what to press" — the two
  are intentionally not merged into a single label the way the (now-removed)
  `page/collection.js` action-card prototype briefly did. Sections stack top-down under
  the title using a running Y cursor sized from `getTextLayout()` (the same
  measure-then-place pattern `page/practiceintro.js` §4.1a uses). There is no physical
  up/down/select *cycling* between the three buttons — they remain touch/`click_func`-only,
  like `page/link.js`'s confirm/cancel or `page/collection.js`'s not-linked/Mint buttons
  (§4.4).
- **Hardware-key handling exists on this page for exactly one purpose: leaving it.**
  `page/collection.js` reaches this page via `replace()`, not `push()` (see §4.4), so
  there is nothing paused underneath to fall back to — the default hardware-back action
  would skip straight past Collection to whatever was open before it. `initKeyNavigation()`
  intercepts every classified click (filtering `keyEvent === KEY_EVENT_CLICK`, matching the
  majority convention in this codebase — `page/show.js` is the one page that does *not*
  filter this way, and risks its handler firing more than once per physical press) and
  calls `replace({url: "page/collection"})` itself — no refresh flag, so the resulting
  `build()` just falls through to its normal cache-first render, showing exactly what the
  user last saw. This makes every exit from Settings, whichever of the three actions was
  or wasn't tapped, funnel through the same "exactly one fresh `page/collection.js`
  instance" outcome.
- **The three actions** (i18n keys `settings_action_{refresh,mint,unlink}_{title,desc}`):
  1. **Refresh** (`refreshCollection()`) — does **not** call the network from this page.
     It sets `STORAGE_KEYS.COLLECTION_REFRESH = true` and navigates with
     `replace({url: "page/collection"})`, which destroys this settings instance and forces
     a **brand-new** `page/collection.js` instance through a fresh `onInit`/`build()`.
     That new instance's `build()` calls `consumeRefreshRequest()` first (see §4.4), which
     finds the flag, clears it, and runs `SCREEN_LOADING` → `refreshWithLinkCheck()` — a
     `LINK_STATUS` check first, `GET_COLLECTION` only if that confirms the link is still
     live (§4.4) — rather than the plain `GET_COLLECTION` a cold fetch uses; this is the one
     path through this page that can detect a link removed from the *website* side (§4.4).
     Same loading animation either way, never the local cache. `replace()` (not `back()`) is
     required here: see §6 — the device `Page` API has no `onResume`, so returning to an
     already-alive collection instance via `back()` runs no code at all (tried first;
     silently did nothing — the reason both this rule and §6's platform note exist).
     Combined with `page/collection.js`'s own `openSettings()` also using `replace()`
     (rather than `push()`), there is never a second, stale collection instance left behind
     in the stack — a single `replace()` chain in, a single `replace()` chain out, exactly
     one collection instance at any time.
  2. **Mint** (`openMint()`) — pushes `page/qr` with
     `{ url: WEBSITE_URL + '/mint', ref: "settings_mint" }`, same destination as the "mint & link"
     help-slide action elsewhere in the app, tagged with its own `ref` (§5.6) so this entry
     point is distinguishable in the site's logs.
  3. **Unlink** — tapping the normal button no longer unlinks directly. It calls
     `armUnlinkConfirm()`, which hides `widgets.unlinkButton` and reveals two
     pre-built-but-hidden buttons occupying the same reserved space right below it:
     `widgets.unlinkConfirmButton` (i18n `settings_action_unlink_confirm`, red) and
     `widgets.unlinkCancelButton` (i18n `cancel`, shared gray). Both are built unconditionally
     in `buildActionSection()` (just invisible by default) specifically so arming/cancelling
     is a pure visibility toggle — no widget creation/deletion, no layout recompute, and
     since Unlink is the last section nothing below it ever needs to shift. **Cancel**
     (`cancelUnlinkConfirm()`) hides both and restores the normal button. **Confirm**
     (`confirmUnlink()`) hides both and calls `unlinkWallet()`, which is otherwise unchanged:
     calls `WatchApi.unlink(page)` → companion method `UNLINK` → backend
     `POST /device/unlink`. On `{status: "OK"}`: sets `STORAGE_KEYS.LINKED = false`, clears
     `STORAGE_KEYS.COLLECTION_JSON`, and `replace()`s to `page/collection` — a fresh instance
     of which reads the just-cleared flag in its own `build()` and renders its
     `SCREEN_NOT_LINKED` state (§4.4); unlike Refresh this still *replaces* rather than
     signal-and-back, for the same "force a fresh `build()`" reason (§6), even though the
     destination is the same page by name this time. On any other response or a network
     error: logged, and the normal Unlink
     button is made visible again so the user has something to retap — without this, the
     confirm/cancel pair stays hidden after a failed attempt and the section would show
     nothing actionable at all. `state.busy` guards Unlink against overlapping double-taps
     (Refresh is a synchronous flag-write + navigation, no network call happens on this
     page, so it needs no such guard; Mint needs none either).
- **Button styling**: the three *normal* buttons (Refresh/Mint/Unlink) render with the same
  `NORMAL_COLOR`/`PRESSED_COLOR` (shared gray, imported from `constants.js`),
  `UI.btnH = SECONDARY_BUTTON_HEIGHT`, `UI.btnRadius = btnH / 2` (a full pill). **The
  `actions` array in `renderActions()` still carries a distinct `normalColor`/`pressColor`
  per action** (gray/blue/red, the original color-coded design) **but `buildActionSection()`
  still doesn't read them for the normal-button rendering** — hardcoded to
  `NORMAL_COLOR`/`PRESSED_COLOR` there, per-action values still commented out at that call
  site. They're no longer *entirely* dead, though: Unlink's `normalColor`/`pressColor`
  (`0x8f2d2d`/`0x6e2222`, red) are read live by its hidden Confirm button (above) — the only
  one of the three action entries whose color fields do anything. Refresh's and Mint's
  `normalColor`/`pressColor` remain fully unused; see §6.

---

## 5. Core Logic, Rules & Data Contracts

### 5.1 Constants (`utils/config/constants.js`)
- Colors: `NORMAL_COLOR 0x2C2C2C`, `PRESSED_COLOR 0x4A4A4A`, `ERROR_COLOR 0xCC3344` — the
  shared gray/error palette used by `page/index.js`, `page/collection.js`, and
  `page/settings.js`. `page/practice.js` uses a *separate*, distinctly-named blue
  palette instead (`PRACTICE_NORMAL_COLOR`/`PRACTICE_PRESSED_COLOR`/`PRACTICE_SELECTED_COLOR`,
  plus `SECONDARY_BUTTON_HEIGHT`) exported from the per-shape
  `zosLoader:./index.[pf].layout.js` files — not an override of this module's constants, a
  different symbol set entirely (see §2.1). `SECONDARY_BUTTON_HEIGHT` is `px(72)` (changed
  from a prior `px(100)` that had drifted away from every other screen's own hand-rolled
  `px(72)`) and is now imported and used for the standard small action-button height on
  **four** pages — `page/settings.js` (`UI.btnH`), `page/collection.js` (`BTN_H`, the
  not-linked-state split buttons, §4.4), `page/help.js` (`UI.actionH`, §4.6), and
  `page/qr.js` (`UI.backH`, §4.7) — all previously independent `px(72)` literals that
  happened to already agree in value, now reading the one shared constant.
  `page/link.js`'s own confirm/cancel/retry/OK buttons (`UI.btnH`, §4.5) still use a local,
  un-migrated `px(72)` literal — same value, not yet wired to the shared constant. `ERROR_COLOR` is used for error-state text in
  `page/link.js` (`showDone(false, …)`) and `page/show.js` (its error text widget) in place
  of the `0xcc3344`/`0xbdbdbd` literals those two files used to hardcode locally.
  `DEFAULT_COLOR`/`DEFAULT_COLOR_TRANSPARENT` (previously `0xfc6950`/`0xfeb4a8`) have been
  **removed** — grep confirms nothing references them anymore.
- `WEBSITE_URL = "https://mandala.garageno9.site"`.
- `CTA`: the funnel-attribution label enum — see §5.6 for the full list and firing sites.
- `STORAGE_KEYS`: `INSTALL_ID, MANDALA_DAY, MANDALA_PATH, STREAK_DAYS, BEST_STREAK,
  COLLECTION_JSON, LINKED, LAST_NEWS, COLLECTION_REFRESH, PRACTICE_INTRO_SEEN`. `LINKED` is
  now read and written exclusively by `page/collection.js` (§4.4) — it used to be shared
  with the now-deleted `page/nolink.js`. `PRACTICE_INTRO_SEEN` gates `page/practiceintro.js`
  (§4.1a) — checked in `page/index.js`
  (§4.1), but only *written* on `page/practiceintro.js`'s own "Начать практику" button, and
  only if its "don't show again" checkbox was ticked; never cleared once set. (A
  `VIEW_COUNTER` key used
  to back a view-count gate for a since-removed "Go deeper" button on `page/practice.js`;
  the whole mechanism — `AppStorage.addCounter()`/`getCounter()`, the write-site in
  `page/show.js`, the key itself — has been deleted, see §4.2.) `COLLECTION_REFRESH` is the
  odd one out: it's not really "data" like the others, it's a one-shot cross-page signal (see
  §4.4/§4.8) — written `true` by `page/settings.js`, read-and-cleared at the top of
  `page/collection.js`'s `build()` (`consumeRefreshRequest()`). It happens to use the same
  persistent-storage mechanism as everything else here only because that's the one
  shared-state channel this app has between page instances (see §5.2's "generic key/value
  escape hatch" note) — **not** because the signal needs to survive an app restart; it's
  consumed within the same `replace()` navigation that set it, milliseconds later.
- `PRACTICE_SHOW = 1`, `COLLECTION_SHOW = 2` — the two `type` values for `page/show.js`.

### 5.2 Storage (`utils/config/storage.js`) — `AppStorage`
Backed by a single `@zos/storage` `LocalStorage` instance.
- **Installation ID**: lazily generated on first access
  (`ZeppOS_usr_<base36 timestamp>_<random>`), persisted under `INSTALL_ID`. Used as `usr`
  in every companion request (via `Profile.createRequestData()`).
- **Link URL**: `getLinkUrl() = "{WEBSITE_URL}/link/add/{installId}"`.
- **Day string format**: `DDMMYYYY` (zero-padded day, zero-padded *Zepp* month [1-12],
  4-digit year) — produced by both `getMandalaDayString()` (device sensor `Time`) and
  `getPracticeDays()`. This is the canonical date-key format used everywhere a "day" is
  passed between pages/companion (`mandalaDay`, `request.day`, collection item `day`, etc).
- **Generic key/value escape hatch**: `getRecord(key)`/`setRecord(key, value)` accept
  *arbitrary* keys, not just `STORAGE_KEYS` members. This is exploited deliberately:
  `page/show.js` calls `AppStorage.setRecord(day, filePath)` / `getRecord(day)` for
  collection items, i.e. **each mandala's local file path is cached under its own day
  string as the storage key**, separate from the `STORAGE_KEYS.MANDALA_PATH` slot used for
  the practice/daily mandala. This is the actual per-item image cache contract for the
  Collection feature — it is *not* documented anywhere near `STORAGE_KEYS` and is easy to
  miss.
- **`removeRecord` does not exist on `AppStorage`.** `page/collection.js` calls it
  defensively behind a `typeof === 'function'` guard and falls back to
  `setRecord(key, '')`, so nothing crashes today, but the "clean removal" path is
  currently dead — corrupted collection JSON is overwritten with an empty string, not
  deleted.

#### 5.2.1 Practice-streak rule (the app's one piece of real business logic)
- `getPracticeDays(time = new Time())` reads `MANDALA_DAY`/`STREAK_DAYS`/`BEST_STREAK` and
  derives:
  - `isSameDay`: stored day === today.
  - `isNextDay`: stored day + 1 calendar day === today (computed via a JS `Date`, taking
    care to convert Zepp's 1–12 month to JS's 0–11 before adding a day and formatting back
    to `DDMMYYYY`).
  - `streak`: the *stored* `STREAK_DAYS` value if `isSameDay || isNextDay`, else **0**
    (i.e., reading the streak on a "gap" day already reports it as reset, before any write
    happens).
  - `best`: always the stored `BEST_STREAK`, unconditionally.
- `addPracticeDays()` (called from `setMandalaData`): re-derives the same four values, and
  **only if `!isSameDay`** does `streak + 1` get written (as the new streak, and as the new
  best if it exceeds the old best). Practicing again on the same day is a no-op for the
  streak.
- **Net rule**: streak increments by exactly 1 on the first practice of a new day that is
  either the day right after the last practice, or a "cold start" (`MANDALA_DAY` never
  set → `getPracticeDays` returns streak 0, then `addPracticeDays` writes 1). Any gap of 2+
  days resets to 1 on the next practice (not 0 — the reset-to-0 only shows up transiently
  in *read* calls before the next write). Multiple practices in one day never move the
  counter.
- `setMandalaData(day, path)` is the **only** call site that advances the streak; it also
  writes `MANDALA_DAY`/`MANDALA_PATH`. It is invoked exactly once, from
  `page/show.js downloadMandala()` on a successful `PRACTICE_SHOW` fetch.

### 5.3 Device/i18n (`utils/config/device.js`)
- Exposes device geometry (`width/height/screenShape`, also duplicated as
  `DEVICE_WIDTH/DEVICE_HEIGHT`) and a composite `platform` string
  (`"{deviceName}/{osVersion}/{minAPI}, FV:{fw}, SDK:{sdk}, {productId}.{productVer}.{productSource}, SCREEN:{w},{h},{shape}"`)
  sent as the `User-Agent` header on every companion→backend call.
- `getLocale()`: exhaustive switch mapping ZeppOS's integer language code (0–32) to a BCP
  locale string; unknown codes default to `en-US`. **Not actually imported/used by any
  page** — the app instead relies on ZeppOS's own i18n runtime (`getText`) plus
  `getDateFormatString()`, which *does* use `getDateFormat()` (0/1/other → Y-M-D / D-M-Y /
  M-D-Y) and month names via `t()`-style i18n keys (`month_january`…`month_invalid`).
  `getLocale()` appears to be unused dead code kept for a future direct-locale need.

### 5.4 Profile / request payload (`utils/config/profile.js`)
`Profile.createRequestData()` is the base payload merged into *every* device→companion
request (`GET_MANDALA`, `GET_COLLECTION`, `GET_NEWS`, `OPEN_MANDALA`, and all `LINK_*`
via `WatchApi`):
```
{ info: platform, size: min(width,height), age, gender: "M"|"F"|"U", region,
  version: appInfo.versionCode, usr: installId }
```
`gender` is read once at module load from `@zos/user getProfile()` and mapped from the
ZeppOS gender enum to a single-letter code, defaulting to `"U"` for anything else
(including "not granted"/absent profile access).

### 5.5 `utils/watch-api.js` — WatchApi
```js
WatchApi.linkStart(page)
WatchApi.linkStatus(page)
WatchApi.linkConfirm(page, wallet)
WatchApi.linkReject(page)
WatchApi.unlink(page)
```
Each wraps `page.request({ method, request: { ...Profile.createRequestData(), ...extra } })`.
A code comment (`// сюда же со временем: getMandala, getNews, getCollection`) states the
intent to migrate the other request call sites onto this wrapper — **as of now that
migration has not happened**; `page/index.js`, `page/practice.js` (indirectly via
`page/show.js`), and `page/collection.js` all still call
`this.request(...)` directly with a hand-assembled payload. `unlink` is the one new
exception: `page/settings.js`'s `unlinkWallet()` goes through `WatchApi.unlink(page)`
rather than adding another direct-call site, per this section's own guidance.
`page/settings.js`'s `refreshCollection()` calls **neither** — it makes no network request
of its own at all (see §4.8/§4.4: it signals `page/collection.js` via a storage flag and
lets that page do the fetch). Any further new call site should follow `unlink`'s example,
not the older ones.

### 5.6 CTA / funnel-attribution tracking
Two independent, additive mechanisms track how users move toward the website/mint funnel;
neither depends on the other.

- **`ref` query param (`page/qr.js`)**: every QR-opening `action`/params object in
  `page/index.js SLIDES_MAIN`, `page/practice.js DEEP_PRACTICE` (§4.6),
  `page/settings.js`'s `openMint()`, and `page/collection.js`'s not-linked-state website
  button (§4.4) carries a `ref` string alongside `url`. `page/help.js` forwards its copy
  unchanged into `page/qr.js`'s params; `qr.js` appends it to the URL encoded in the QR
  (`withRef()` — §4.7). Current values: `index_home` (main-menu help), `deep_practice`
  (Practice's deep-dive slides), `settings_mint` (Settings → Mint), `collection_home`
  (Collection's not-linked-state website button) — each tags a distinct in-app entry point
  so the *website* can attribute a scan to it, purely via its own access logs; nothing is
  sent back to the watch/companion for this.
- **Per-entry-point QR-open CTA, carried the same way as `ref`**: since `page/qr.js` reads
  an optional `cta` field out of its own params (§4.7, defaulting to `CTA.OPEN_QR` if the
  caller didn't supply one) and fires it unconditionally in `build()`, every one of the same
  call sites above also sets its *own* distinct CTA label on the `action`/params object
  instead of all funnelling into one generic "a QR screen opened" event. This is new
  relative to an earlier version of this app, where `page/qr.js` always fired the single
  hardcoded `CTA.OPEN_QR` regardless of who opened it.
- **`CTA_EVENT` companion method** (`utils/watch-api.js WatchApi.sendCtaEvent(page, cta)` →
  `app-side/index.js sendCtaEvent()` → `GET {WEBSITE_URL}/api/watch//event/{cta}`, same
  three headers as every other companion→backend call — `User-Agent`, `X-App-Version`,
  `X-User`): a fire-and-forget ping that records a labeled funnel step server-side.
  `page/qr.js`'s own open-event (previous bullet) goes through this same method, just with a
  per-caller `cta` value instead of a literal. Every call site does
  `WatchApi.sendCtaEvent(this, CTA.X).catch(() => {})` — errors are swallowed and the
  triggering navigation proceeds regardless.

  `CTA` labels (`utils/config/constants.js`) and where each fires:

  | Label | Fires in | Trigger |
  |---|---|---|
  | `OPEN_INDEX_HOME` | `page/index.js` `executeAction()` | Help icon activated on the main menu |
  | `OPEN_INDEX_HOME_QR` | `page/qr.js` `build()`, via `SLIDES_MAIN` slide 3's `action.cta` | the main-menu help deck's "visit website" QR actually opened |
  | `OPEN_DAILY_HELP` | `page/practiceintro.js` `build()` | the onboarding screen shown (§4.1a) — fires on every repeat showing, not just the first |
  | `OPEN_DEEPER` | `page/practice.js` `openDeep()` | the Help-styled icon on Practice activated — unconditional now, no view-count gate (§4.2) |
  | `OPEN_DEEPER_QR` | `page/qr.js` `build()`, via `DEEP_PRACTICE` slide 4's `action.cta` | the deep-practice deck's mint QR actually opened |
  | `OPEN_COLLECTION_QR` | `page/qr.js` `build()`, via `page/collection.js`'s not-linked-state left button's `cta` (§4.4) | the not-linked-state website QR actually opened |
  | `OPEN_LINK_QR` | `page/collection.js`'s not-linked state, right split-button (§4.4) | the pairing-QR half of the button pair tapped — moved here from the deleted `page/nolink.js`, same meaning |
  | `OPEN_MINT_QR` | `page/qr.js` `build()`, via `page/settings.js`'s `openMint()` `cta` (§4.8) | the Settings → Mint QR actually opened |
  | `OPEN_QR` | `page/qr.js` `build()` | fallback default for `state.cta` when no caller-supplied `cta` is present |
  | `CONFIRM_LINK` | `page/link.js` `confirm()` | "Confirm" tapped on the wallet-confirmation screen |
  | `LINKED` | `page/link.js` `showDone(true, …)`; `page/collection.js` `checkLinkInBackground()` on `status === "OK"` (§4.4) | device confirms the wallet link succeeded — two independent detection paths |

  **Removed**: `OPEN_COLLECTION_HELP` — only ever fired on the now-deleted
  `page/nolink.js`'s "Details" step; with that screen gone (§4.4), the label had nowhere
  left to fire from, and grep confirmed zero remaining references before it was deleted.
  (`OPEN_COLLECTION_QR` is **not** removed — a prior pass of this document incorrectly
  grouped it with `OPEN_COLLECTION_HELP` as both-removed; it's very much alive, see the
  table above.)

  Together these give a step-by-step funnel: entry CTA tapped → the specific QR screen that
  opened (both `ref`, for the website's own logs, and a distinct `OPEN_*_QR` label, for the
  backend's) → (link flow only) confirmed → linked. **Not instrumented:** Cancel/Reject on
  the wallet-confirmation screen — only the success path is labeled, so a user who backs out
  there is only visible as an implicit gap between `CONFIRM_LINK` and `LINKED`, not a
  labeled event of its own.

---

## 6. Cross-Cutting Rules, Inconsistencies & Exceptions

These are places where behavior deviates from what a reader would expect from one part of
the codebase alone, or where two call sites disagree. Recorded here so future changes fix
them deliberately (in the spec first) rather than by accident.

> **Resolved since the last pass** (kept here only as a pointer to where the current
> behavior is now documented, not as open items): round-build `SyntaxError` → §2.1;
> square-layout missing color exports → §2.1; `ScheduleNotification` inverted guard → §4.1.
> The `GET_COLLECTION` field-name mismatch this used to point at was between
> `page/collection.js` and `page/nolink.js` specifically — moot now that `page/nolink.js`
> is deleted and its role absorbed into `page/collection.js` (§4.4), which obviously agrees
> with itself.

0. **Two request-calling conventions coexist.** `WatchApi` (link methods, `unlink`, and
   `sendCtaEvent` — see §5.5/§5.6) vs. ad-hoc
   `this.request({ method, request: {...Profile.createRequestData(), ...} })` (everything
   else: `GET_MANDALA`/`OPEN_MANDALA` via `page/show.js`, `GET_COLLECTION` via
   `page/collection.js`, `GET_NEWS` via `page/index.js`). Not a bug, but an acknowledged
   half-finished refactor — see §5.5.
1. **Selection/focus list pattern is duplicated** with small variations (`page/index.js`
   and `page/collection.js` each define their own `updateSelection`/`attachSelectable`/
   key-nav wiring instead of sharing one component — a third copy on the now-deleted
   `page/nolink.js` is gone with it). Functionally consistent today; a shared helper would
   reduce future drift. (`page/practice.js`'s two-way focus toggle — §4.2 — is a related
   but distinct interaction model: a single toggled index with contour-color focus, not a
   list of rows; not folded into this item.)
2. **Four separate, unused TGA-thumbnail resizer implementations** exist in `utils/`
   (`TgaThumbnail.js`, `IndexedTgaThumbnail.js`, `ImageResizer.js`, `HardcoreResizer.js`),
   none imported anywhere. They read as successive iterations on the same idea (byte-level
   TGA downscaling for the collection list's thumbnail icons) but no page currently uses
   any of them — collection rows just swap between two fixed icon assets
   (`ic_collection.png` / `ic_not_loaded.png`) rather than rendering a real per-item
   thumbnail. Treat these as prototypes to finish/pick-one-and-delete-the-rest, not as
   dead weight to casually remove without checking intent first.
3. **`device.js getLocale()` is unused** (§5.3) — kept for a possible future need to
   branch on locale directly rather than through `getText`.
4. **`page/settings.js` does not verify `STORAGE_KEYS.LINKED` before offering
   Refresh/Unlink** (§4.8) — a deliberate choice (the flag can go stale any time the link
   state changes outside this device's knowledge, and every action there is
   self-correcting), not an oversight.
5. **Ambient/global companion APIs — and one that turned out not to be one.**
   `app-side/index.js` uses `fetch`, `network`, `image`, and `transferFile` with no imports —
   these genuinely are ZeppOS side-service globals injected at runtime, not missing
   dependencies. **`Logger` was not** one of these — `@zos/utils`'s `log`/`Logger` is a
   *device-app-only* API (ZeppOS's own guidance: Side Service/App Service code should use
   plain `console.log`); it does not exist as a global in the Side Service context at all.
   An earlier version of this file had `const logger = Logger.getLogger('mandala-day')` as
   a **module-top-level statement with no import of `Logger`** — `ReferenceError: Logger is
   not defined` thrown at module load, before `AppSideService(...)` ever registers its
   `onRequest` handler. Net effect: the companion never started, so **every**
   `page.request(...)` call from the watch (`GET_MANDALA`, `GET_NEWS`, all `LINK_*`, etc. —
   the whole table in §7) would simply hang waiting for a response that could never come, on
   every device, every time. Fixed: the `Logger`/`logger` indirection is gone entirely — every
   former `logger.log(...)` call site now calls `console.log(...)` directly, matching
   ZeppOS's own guidance for this execution context.
6. **The device `Page` API has no `onResume`/`onPause` lifecycle hooks — confirmed from
    `node_modules/@zeppos/device-types/dist/index.d.ts`'s `Page.Option` interface, which
    lists only `state`, `onInit`, `build`, `onDestroy`.** (`onResume`/`onPause` do exist,
    but only on the unrelated `SecondaryWidget` and side-service interfaces in the same
    file.) `@zeppos/zml/base-page.js`'s `BasePage` wrapper will happily accept and wire up
    an `onResume`/`onPause` option if you pass one — its own type declarations even list
    them as part of `ILifeCycle` — but the underlying native `Page()` constructor never
    calls them back, so they are silently never invoked. Concrete history:
    - The now-deleted `page/nolink.js` used to define `onResume()`/`onPause()` to keep a
      `state.visible` flag accurate and to re-run its link-status background check every
      time the page was revisited. Neither ever fired — a pre-existing latent bug, harmless
      only because the one `build()`-time check it did was correct on its own; "re-check
      every time you come back" never actually happened. Moot now that the file is gone,
      but the lesson it taught is exactly why `page/collection.js`'s own equivalent check
      (`checkLinkInBackground()`, §4.4) is written the way it is below.
    - `page/collection.js`'s refresh signal (§4.4/§4.8) was originally built the same way
      (flag + `back()` + `onResume()`) and, for the same reason, silently did nothing: the
      user reports "back happens, no animation, no request" was the direct symptom of this
      platform fact. The fix moved the check into `build()` and switched the triggering
      navigation from `back()` to `replace()`, since `replace()` is the one primitive in
      this app guaranteed to force a fresh `onInit`/`build()` cycle. **Going forward: never
      rely on `onResume`/`onPause` on a device `Page` for anything. If a page needs to react
      to "the user came back to me," the only working approaches are (a) check state at the
      top of `build()` and force a fresh instance via `replace()`, as `page/collection.js`
      does for its refresh signal, or (b) a background poll while the *current* page is
      different — `page/collection.js`'s own `checkLinkInBackground()` does exactly this
      from `build()` when it's in the not-linked state (§4.4), the same shape the deleted
      `page/nolink.js` used to use for the same purpose.**
7. **`page/settings.js`'s per-action button colors are mostly dead data.**
    `renderActions()` still builds an `actions` array with a distinct
    `normalColor`/`pressColor` per entry (gray for Refresh, blue for Mint, red for Unlink —
    the original color-coded design), but `buildActionSection()` still doesn't read
    `action.normalColor`/`action.pressColor` for the three *normal* buttons — hardcoded to
    the shared `NORMAL_COLOR`/`PRESSED_COLOR` from `constants.js` there, with the per-action
    reads commented out at that call site (`normal_color: NORMAL_COLOR,
    //action.normalColor`). Refresh and Mint render identically to each other and always
    have. Unlink is the one exception now: its `normalColor`/`pressColor` are read live by
    its hidden Confirm button (§4.8) — not dead for that entry, just never used for the
    *normal*-state Unlink button itself. See §4.8.
8. **A `GROUP` nested inside another dynamically-created `GROUP` does not work reliably on
   device.** Every `GROUP` elsewhere in this app (`loadingGroup`, `errorGroup`,
   `notLinkedGroup`, collection row groups) is nested exactly one level below the page
   itself — none is ever created via `someOtherGroup.createWidget(hmUI.widget.GROUP, …)`.
   `page/collection.js`'s `buildSplitButton()` (§4.4) originally did exactly that (parented
   under `notLinkedGroup`), and it broke `build()` partway through, before `notLinkedGroup`
   itself was ever hidden — leaving `loadingGroup`'s default-visible "Loading…" text and
   `notLinkedGroup`'s already-created title/text on screen simultaneously, with the two
   buttons never appearing at all. Fixed by making the split buttons top-level, page-level
   `GROUP`s (siblings of `notLinkedGroup`, not children of it) with their own explicit
   `setVisible()` calls alongside it. **Going forward: never nest a `GROUP` inside another
   `GROUP` you created yourself — one level only, always directly on the page.**
9. **`getTextLayout()`'s `height`/`rows` fields stop growing past ~2 lines of wrapped text —
   a confirmed ZeppOS SDK bug, not an app bug** (community report:
   `zepp-health/discussions#347` — "When the text takes more than 2 lines the height stops
   growing and the width stops growing very early," reproduced independently against this
   app's own multi-paragraph strings). Every page that sizes a `TEXT` widget from measured
   content — `page/help.js`, `page/collection.js`, `page/practiceintro.js`,
   `page/settings.js`, `page/qr.js` — has its own local `measureText(text, size, textWidth)`
   helper (all five currently identical) that calls `getTextLayout(..., {wrapped: 1})` and
   then returns `{ ...layout, height: Math.max(layout.height, layout.rows * size * 1.3) }`
   — a floor computed from the reported line count (`rows`) times an assumed `1.3`
   line-height multiplier, taken only when it's *larger* than whatever `getTextLayout`
   itself reported, so short (≤2-line) text that `getTextLayout` already measures correctly
   is untouched. This was reached after an unsuccessful first attempt at a fix that didn't
   use `getTextLayout` at all (manual word-wrap simulated by estimating an average
   glyph width in JS) — that version was tried and then deliberately reverted back to the
   `rows`-based one above across all five files; treat the current `rows`-based version as
   the settled implementation, not an intermediate step. Whether `rows` itself is fully
   reliable at every line count beyond what's been tested here is not independently
   confirmed — the `Math.max` floor is a safety margin, not a proof of correctness.
10. **Two ZeppOS API names used in earlier versions of this app do not exist; both caused a
    hard crash where they were called, not just a silent no-op:**
    - `resumeDropWristScreenOff` — not a real export of `@zos/display`. The real name is
      `resetDropWristScreenOff()` (no arguments, API level 2.1+ per ZeppOS docs — `page/show.js`
      already used the correct name). `page/link.js` and `page/qr.js` both imported and called
      the nonexistent name in their respective `onDestroy()`; since the import resolves to
      `undefined`, calling it threw `TypeError: not a function` every time either page was
      left, logged as `"...at onDestroy in link.js/qr.js (context extraction failed)"`.
      Fixed on both files: `resumeDropWristScreenOff({duration: 0})` → `resetDropWristScreenOff()`.
    - `onPageScrollDone`/`offPageScrollDone`/`getSwiperIndex` as *separate, standalone*
      `@zos/page` exports — also not real (confirmed against ZeppOS's own `setScrollMode`
      reference: the only documented hook for "a slide finished scrolling into view" is the
      `on_page` callback passed inside `setScrollMode`'s own `options.modeParams`, §4.6).
      `page/help.js` used to import and call `onPageScrollDone(callback)` directly in
      `build()`, right after `setScrollMode(...)` — threw immediately, so nothing on that
      page past that line ever got built (no slides, no page indicator) on any open of
      `page/help.js` from any entry point. Fixed: the callback now lives inside
      `setScrollMode`'s own `modeParams.on_page`, and the two nonexistent `offPageScrollDone`/
      unused `getSwiperIndex` imports/calls are gone.

---

## 7. Companion Service Contract (`app-side/index.js`)

Single `onRequest(req, res)` router keyed on `req.method`:

| Method | Handler | Backend call | Success shape sent back |
|---|---|---|---|
| `GET_MANDALA` | `getMandala` | `network.downloader` → `GET {WEBSITE_URL}/api/watch/{day}/{size}` → `image.convert()` → BLE file transfer | `{ result: "Ok", filePath }` (only after the `transferred` file-transfer event fires) |
| `OPEN_MANDALA` | `openMandala` | `GET {WEBSITE_URL}/api/watch/repeat/{day}/{size}` | raw `response.body` (fire-and-forget signal from `page/show.js`) |
| `GET_COLLECTION` | `getCollection` | `POST {WEBSITE_URL}/api/watch/collection` (via `linkApi`) | backend's raw body, or `{status:'ERROR', error:'network'}` on exception |
| `GET_NEWS` | `getNews` | `GET {WEBSITE_URL}/api/watch/zepp/news/{time}/{region}` | parsed JSON body |
| `LINK_START` | `linkStart` | `POST {WEBSITE_URL}/device/link-start` | backend body + derived `qr = "{WEBSITE_URL}/link/add/{token}"` |
| `LINK_STATUS` | `linkStatus` | `POST {WEBSITE_URL}/device/link-status` | backend body |
| `LINK_CONFIRM` | `linkConfirm` | `POST {WEBSITE_URL}/device/link-confirm` with `{wallet}` | backend body |
| `LINK_REJECT` | `linkReject` | `POST {WEBSITE_URL}/device/link-reject` | backend body |
| `UNLINK` | `unlink` | `POST {WEBSITE_URL}/device/unlink` | backend body, or `{status:'ERROR', error:'network'}` on exception |
| `CTA_EVENT` | `sendCtaEvent` | `GET {WEBSITE_URL}/api/watch//event/{cta}` (double slash is intentional, matches the live endpoint) | raw `response.body`, or `{status:'ERROR', error:'network'}` on exception — see §5.6 |

- All `POST` calls go through `linkApi(path, request, extraBody)`, which always sends
  `deviceId: request.usr` **in the JSON body**, never in the URL — an explicit privacy
  rule (see code comment in `app-side/index.js`).
- `X-User` header format (used on every authenticated call): `"{age}/{gender}/{region}/{usr}"`.
- **`GET_MANDALA` file-transfer rule**: the phone does not reply to the watch until the
  ZeppOS file-transfer object reports `readyState === 'transferred'` — this guarantees the
  watch never receives a `filePath` for a file that isn't physically on its local disk yet.
  A `readyState === 'error'` reply instead returns
  `{result: "Error: Bluetooth transfer failed"}`.
- `fetchEmulatorData()` is present but **unused/commented-out** — an alternate
  emulator-only path that streams image bytes directly instead of using
  download+convert+BLE-transfer; kept for local testing, not part of the live routing
  table.

---

## 8. App Service Contract (`app-service/delayedNewsService.js`)

- Registered in `app.json` under `app-service.services`.
- Started via `@zos/alarm` `setAlarm({ url: "app-service/delayedNewsService", delay, param, store: true })`
  (see `utils/ScheduleNotification.js`; `store: true` means the alarm survives a watch
  reboot).
- `onInit(param)`: JSON-parses `param` into `{title, content}` (swallows parse errors,
  falling back to `{}` → a notification with undefined title/content rather than failing),
  then calls `@zos/notification notify({ title, content, actions: [{text:"Открыть",
  file:"page/index"}], vibrate: 2 })`. **The action label is hardcoded in Russian**
  ("Открыть") regardless of device locale — not run through i18n.

---

## 9. Remaining Unknowns (external to this repo)

- The actual JSON shapes returned by the live backend
  (`mandala.garageno9.site/api/watch/...`) are not fully verifiable from this codebase.
  `page/collection.js` (the only watch-side reader of `GET_COLLECTION` now, §4.4) reads
  `data.status`; whether the *backend* actually sends that field is still unconfirmed
  independently of this repo.
- `GET_NEWS`'s `news[]` items are specified (by the person operating the backend) to carry
  `{ date, title, body }` once populated; not independently observed from a live non-empty
  response from this repo.
- The exact response shape of the `CTA_EVENT` endpoint (`GET /api/watch//event/{cta}`, §5.6)
  beyond "200 OK" is not specified/verified here — the watch side only cares that the
  request fires, not what comes back.
- No test suite exists (`package.json test` script is the CRA/npm-init placeholder that
  just exits with an error).
- `page/collection.js`'s `refreshWithLinkCheck()` (§4.4) assumes `LINK_STATUS` reliably
  reports `d.link !== 'linked'` once a device-side link is removed from the *website*
  (as opposed to this watch's own Unlink). Whether `/device/link-status` actually reflects
  a website-initiated unlink, and how promptly, is unconfirmed independently of this repo —
  the whole feature is built on that assumption holding.
