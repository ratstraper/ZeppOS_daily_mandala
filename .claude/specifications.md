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

Standard three-target ZeppOS app (`app.json` → `targets.common.module`):

| Target | Path | Runs on | Role |
|---|---|---|---|
| Device app | `page/*.js` + `app.js` | watch | UI, navigation, local storage, state machines |
| Companion service | `app-side/index.js` | phone (BLE companion) | network calls, file download/convert/transfer |
| App service | `app-service/delayedNewsService.js` | watch, alarm-triggered | fires a local notification some time after being scheduled |

Communication device ⇄ companion is via `this.request({ method, request })` from a page
(ZML `BasePage`), routed on the phone side by `onRequest(req, res)` matching on
`req.method`.

### 2.1 Runtime / platform facts
- `configVersion: v3`, `apiVersion` target `4.2`, min `3.0`.
- Two device shapes: round (`st:"r"`, design width 480) and square (`st:"s"`, design width 390).
  Per-shape layout is implemented via ZeppOS's `zosLoader:./index.[pf].layout.js` mechanism:
  `page/index.r.layout.js` (round) and `page/index.s.layout.js` (square) both export the
  same symbol names (`TITLE`, `FETCH_RESULT_TEXT`, …) consumed by pages via
  `import { TITLE } from "zosLoader:./index.[pf].layout.js"`. **Only the round layout
  currently defines `NORMAL_COLOR`/`PRESSED_COLOR`/`SELECTED_COLOR`/`MENU_BUTTON`** — the
  square layout only defines `FETCH_RESULT_TEXT`. Pages that import the color constants
  from the loader (`practice.js`) will fail to resolve them on square devices unless the
  square layout is completed. **This is a real gap, not a documented feature split.**
- **`page/index.r.layout.js` currently fails to parse — the whole round build is broken.**
  It has `import { NORMAL_COLOR, PRESSED_COLOR, ERROR_COLOR } from "../utils/config/constants"`
  at the top, and two lines later declares `export const NORMAL_COLOR = 0x0E8CE6` /
  `export const PRESSED_COLOR = 0x0B72BD` — an imported binding and a local `const`
  sharing the same name in the same module scope, which is a hard `SyntaxError: Identifier
  'NORMAL_COLOR' has already been declared` (confirmed with `node --check`). None of the
  three imported names (`NORMAL_COLOR`, `PRESSED_COLOR`, `ERROR_COLOR`) are actually
  referenced anywhere in this file's body — the file already defines and exports its own
  `NORMAL_COLOR`/`PRESSED_COLOR`/`SELECTED_COLOR` for consumers, so the import block adds
  nothing even where it doesn't collide. See §6.
- Permissions declared in `app.json`: `data:os.device.info`, `device:os.alarm`,
  `device:os.local_storage`, `device:os.network`, `device:os.notification`,
  `data:user.info`.
- `app.json` declares 11 locales for the app *name* (`en-US`, `pt-BR`, `vi-VN`, `id-ID`,
  `ru-RU`, `tr-TR`, `es-ES`, `uk-UA`, `de-DE`, `it-IT`, `zh-CN`), default `en-US`. In
  practice, **only `en-US` and `ru-RU` have full `.po` translation files** for
  `page/i18n/`; `app-side/i18n/` only has a placeholder `en-US.po`. All other declared
  locales fall back to `en-US` strings for anything beyond the app name.

---

## 3. Module Map

```
app.js                        BaseApp shell (no real global state; onCreate/onDestroy logging only)
app.json                      App manifest: pages, permissions, platforms, i18n
app-side/index.js             Companion (phone) request router + backend integration
app-service/delayedNewsService.js   Alarm-fired one-shot notification
page/index.js                 Main menu (Practice / Collection / Help)
page/practice.js              Daily-practice idle screen (streak, Open button)
page/show.js                  Generic "show a mandala image" screen (loading/result/error)
page/collection.js            NFT collection list (loading/result/error, empty state)
page/nolink.js                "Not linked to a wallet" gate screen for Collection
page/link.js                  QR-based wallet linking + polling state machine
page/linkinfo.js              Static explainer for why/how to link a wallet
page/help.js                  Generic horizontal-swiper help/onboarding slideshow
page/qr.js                    Generic "scan this QR to open a URL" screen
page/settings.js              Collection settings hub: refresh / mint / unlink actions
page/index.r.layout.js        Round-screen layout constants/helpers — BROKEN, does not parse, see §6 item 0
page/index.s.layout.js        Square-screen layout constants/helpers (incomplete, see §2.1)
utils/config/constants.js     Colors, WEBSITE_URL, STORAGE_KEYS, screen-type enum
utils/config/device.js        Device info, i18n language-code → locale map, date formatting
utils/config/profile.js       Builds the common request payload sent to the companion
utils/config/storage.js       AppStorage: LocalStorage wrapper + practice-streak rules
utils/watch-api.js            WatchApi: thin request wrapper — link/* and unlink methods
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
  variations in `page/collection.js` and `page/nolink.js` — see §6 on duplication).
- **Screen-state pattern**: `SCREEN_LOADING` / `SCREEN_RESULT` / `SCREEN_ERROR` (string
  constants local to each file) toggle group visibility; a `LoadingAnimationComponent` is
  shown/deleted on entering/leaving `SCREEN_LOADING`.

### 4.1 `page/index.js` — Main menu
- **Role**: navigation hub, first screen.
- **Menu items**: Practice → `page/practice`, Collection → `page/collection` (gated, see
  below), plus a persistent help icon → `page/help` with `SLIDES_MAIN` (3 slides, last one
  has a "visit website" action → `page/qr`).
- **Rule — Collection gating**: `executeAction()` checks
  `AppStorage.getRecord(STORAGE_KEYS.LINKED)`. If falsy, tapping Collection routes to
  `page/nolink` instead of `page/collection`.
- **Side effect — `loadNews()`**: on `build()`, if
  `now - STORAGE_KEYS.LAST_NEWS > 10 days`, sends `GET_NEWS` to the companion. On a
  successful response with `result === "Ok"` and non-empty `news`, concatenates all
  `news[].body` into one string, and schedules a notification (title = first news item's
  title, content = concatenated bodies) via `scheduleNotification()`, then stamps
  `LAST_NEWS = now`. See §6 for a defect in `scheduleNotification`'s guard condition.

### 4.2 `page/practice.js` — Daily practice idle screen
- **Role**: entry point to the day's mandala; the "Open" button.
- **On init**: `refreshState()` reads `AppStorage.getPracticeDays()` into
  `state.progress = { streak, best, doneToday, isNextDay }`.
- **UI**: progress text `"{streak} · {best}"` (via i18n `streak`/`best` keys), status text
  `done_today` / `not_yet_today`, and a random subtitle from `start_subtitle_0..3`.
- **Navigation**: two focusable elements — the Open button (index 0) and the help icon
  (index 1); `KEY_UP`/`KEY_DOWN` toggle between them, `KEY_SELECT` activates.
- **`handleOpenClick()`**: pushes to `page/show` with
  `{ day: AppStorage.getMandalaDayString(), title, fromLocalStorage, type: PRACTICE_SHOW }`,
  where `fromLocalStorage` is true iff the stored `MANDALA_DAY` already equals today.
- **Help**: pushes `page/help` with `SLIDES_PRACTICE` (3 slides, action → `page/qr`).

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

### 4.4 `page/collection.js` — NFT collection list
- **Role**: lists the user's linked mandalas.
- **On build**: tries `loadStoredCollection()` (parses `STORAGE_KEYS.COLLECTION_JSON`;
  corrupted JSON is caught and dropped, see §5.2 note on `removeRecord`). If present,
  renders immediately from cache. **If absent, `getCollection()` runs regardless of the
  `LINKED` flag** — the `linked` local variable is read but its two branches are
  identical, i.e. the flag is currently *not* used to change behavior here (see §6).
- **`getCollection()`**: sends `GET_COLLECTION`. Response contract *as read by this file*:
  `{ status: "OK", collection: [...] }` → cache + render; `{ status: "NO_LINK" }` → render
  empty state with a "wallet not linked" message (help/settings icon still shown); anything
  else → `SCREEN_ERROR`. **See §6 for a field-name mismatch against `page/nolink.js`.**
- **List item shape**: `{ id, day, name }`. Row icon is `ic_collection.png` if
  `AppStorage.getRecord(item.day)` (a cached local file path) exists, else
  `ic_not_loaded.png`. Tapping a row pushes `page/show` with
  `{ id, day, title: name, fromLocalStorage: true, type: COLLECTION_SHOW }`.
- **Help/settings icon** is always the last focusable element (even on the empty-collection
  screen) and opens `page/settings` via **`replace()`, not `push()`** — this page is
  destroyed, not paused, while Settings is open. `page/settings.js` is where collection
  maintenance actions (refresh / mint / unlink) live — see §4.10 — not on this page,
  regardless of whether the collection is empty or not. The `replace()` choice (rather than
  the `push()` every other "open a sub-screen" transition in this app uses) exists purely
  to guarantee there is never more than one `page/collection.js` instance in the navigation
  stack at a time — see §4.10 and §6 for why: with `push()`, `page/settings.js`'s Refresh
  action would leave a second, stale collection instance sitting underneath, requiring two
  back-presses to actually leave the collection area.
- **`consumeRefreshRequest()` — cross-page refresh signal, checked at the top of
  `build()`**: reads `AppStorage.getRecord(STORAGE_KEYS.COLLECTION_REFRESH)`. If truthy, it
  immediately clears the flag, runs `setScreenState(SCREEN_LOADING)` + `getCollection()`
  (a real `GET_COLLECTION` network round-trip, never `loadStoredCollection()`/the local
  cache), and `build()` returns early — skipping the normal cache-first branch below
  entirely. This is how `page/settings.js`'s "Refresh" button actually triggers a refresh
  (see §4.10 and §6): it does not call the network itself, it sets this flag and navigates
  with `replace()` back to `page/collection`, forcing a brand-new instance whose `build()`
  picks the flag up. **This must be checked in `build()`, not in an `onResume()`/`onPause()`
  pair** — see §6: the device `Page` API has no such hooks, so nothing short of destroying
  and recreating the page will ever run code again on "back". The flag is otherwise never
  true (only `refreshCollection()` in `page/settings.js` writes it), so this check is a
  no-op on every normal cold `build()`.

### 4.5 `page/nolink.js` — Collection access gate
- **Role**: shown instead of `page/collection` when `STORAGE_KEYS.LINKED` is falsy (routed
  from `page/index.executeAction()`).
- **Menu**: "Details" → `page/linkinfo` (via `replace`), "Link" → `page/link` (via
  `replace`, with `params.url = AppStorage.getLinkUrl()`).
- **Rule — background re-check**: on `build()`, if `STORAGE_KEYS.LINKED` is already true it
  `replace()`s straight to `page/collection`; otherwise it fires `GET_COLLECTION` in the
  background (`checkLinkInBackground()`, guarded by `state.checking` against overlap) so
  that a link made on the website while the nolink screen is open gets picked up without
  user action. On success (`result === "Ok"`) it sets `LINKED=true`, caches the collection,
  and — **only if the page is still the visible one** (`state.visible`) — replaces to
  `page/collection`. **This file also defines `onResume()`/`onPause()` to keep
  `state.visible` in sync, intending the same background re-check to re-run every time the
  page is revisited — but per §6, the device `Page` API has no `onResume`/`onPause` hooks
  at all, so neither ever fires.** `state.visible` is set once in `build()` and then never
  changes; the guard it feeds (`if (this.state.visible) replace(...)` inside
  `checkLinkInBackground()`'s success handler) is therefore always checking a value that
  was fixed at construction time. In practice this doesn't break the page — the one
  `build()`-time check still runs and still works — it just means "re-check every time you
  come back to this screen" was never actually happening. Pre-existing, not introduced by
  the `page/settings.js` refresh work; left as-is here since fixing it wasn't asked for.
- **Contract note**: this file reads the `GET_COLLECTION` response as
  `{ result: "Ok" | "NO_LINK", collection }` — the **opposite field name** from
  `page/collection.js`'s `{ status: "OK" | "NO_LINK" }`. See §6.

### 4.6 `page/link.js` — Wallet linking flow
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
  - `showConfirm(wallet)` → user picks **Confirm** (`LINK_CONFIRM`) or **Cancel**
    (`LINK_REJECT`, then restarts `startLink()`).
  - `showDone(ok, msg)`: always writes `STORAGE_KEYS.LINKED = ok` (a boolean — note this is
    the only successful non-boolean-safe write path if `ok` is undefined/error).
- **Screen kept awake** for the QR step only (`setPageBrightTime`/`pauseDropWristScreenOff`
  600000ms), reset on destroy.
- Network/BLE errors at every step degrade to `showDone(false, err_internet_connection)`
  rather than crashing the polling loop.

### 4.7 `page/linkinfo.js` — Static "why link" explainer
- Single vertically-scrollable page (title, divider, body text, one CTA button). No key
  navigation, no state machine — relies on ZeppOS's default free-scroll behavior.
- CTA pushes `page/link` with `{ url: AppStorage.getLinkUrl() }`.

### 4.8 `page/help.js` — Generic help slideshow
- **Contract**: takes `params = JSON.stringify({ slides })` where each slide is
  `{ titleKey, textKey, action?: { labelKey, url } }`. Used by both `page/index`
  (`SLIDES_MAIN`) and `page/practice` (`SLIDES_PRACTICE`).
- Horizontal swiper (`SCROLL_MODE_SWIPER_HORIZONTAL`); haptic feedback on page-scroll-done
  (soft buzz mid-deck, strong buzz on the last slide).
- A slide with `action` renders a button that pushes `page/qr` with `{ url: action.url }`.
- **If `slides` is empty/missing, `build()` logs an error and renders nothing** — no
  fallback UI.

### 4.9 `page/qr.js` — Generic "scan to open URL" screen
- **Contract**: `params = JSON.stringify({ url })`; defaults to the website root URL if
  absent/unparsable.
- Static content pulled from fixed i18n keys (`help_qr_title/intro/domain/text`) —
  **the displayed text is not parameterized by the passed-in URL's origin**, only the QR
  code's `content` is. A caller passing an unrelated URL would show mismatched copy.
- Renders a `QRCODE` widget + a Back button (`back()`).

### 4.10 `page/settings.js` — Collection maintenance actions
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
  measure-then-place pattern `page/linkinfo.js` uses). There is no physical up/down/select
  *cycling* between the three buttons — they remain touch/`click_func`-only, like
  `page/link.js`'s confirm/cancel or `page/linkinfo.js`'s CTA.
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
     finds the flag, clears it, and runs the same `SCREEN_LOADING` → `GET_COLLECTION` →
     render cycle the collection page already uses on a cold fetch — same loading
     animation, real network call, never the local cache. `replace()` (not `back()`) is
     required here: see §6 — the device `Page` API has no `onResume`, so returning to an
     already-alive collection instance via `back()` runs no code at all (tried first;
     silently did nothing — the reason both this rule and §6's platform note exist).
     Combined with `page/collection.js`'s own `openSettings()` also using `replace()`
     (rather than `push()`), there is never a second, stale collection instance left behind
     in the stack — a single `replace()` chain in, a single `replace()` chain out, exactly
     one collection instance at any time.
  2. **Mint** (`openMint()`) — pushes `page/qr` with `{ url: WEBSITE_URL }`, same
     destination as the "mint & link" help-slide action elsewhere in the app.
  3. **Unlink** (`unlinkWallet()`) — calls `WatchApi.unlink(page)` → companion method
     `UNLINK` → backend `POST /device/unlink`. On `{status: "OK"}`: sets
     `STORAGE_KEYS.LINKED = false`, clears `STORAGE_KEYS.COLLECTION_JSON`, and `replace()`s
     to `page/nolink` (mirrors the link-established transition `page/nolink.js` already
     does in reverse; unlike Refresh, this one *does* replace rather than signal-and-back,
     since there is no "previous collection screen" state to resume into — the destination
     is a different page entirely). On any other response or a network error: logged and
     swallowed — the user stays on `page/settings` with no error UI, matching the app's
     existing convention for background-ish requests (e.g. `page/nolink.js`'s
     `checkLinkInBackground()`, `page/index.js`'s `loadNews()`). `state.busy` guards Unlink
     against overlapping double-taps (Refresh is a synchronous flag-write + navigation, no
     network call happens on this page, so it needs no such guard; Mint needs none either).
  **No separate confirmation step** is shown before Unlink fires — the tap on the button
  *is* the confirmation. Deliberate simplicity choice (no existing confirm/cancel pattern
  is reused here); revisit if accidental unlinks turn out to be a problem in practice.
- **Button styling**: all three buttons render with the same `NORMAL_COLOR`/`PRESSED_COLOR`
  (shared gray, imported from `constants.js`), `UI.btnH = px(72)`, `UI.btnRadius = px(36)`
  (a full pill at that height). **The `actions` array in `renderActions()` still carries a
  distinct `normalColor`/`pressColor` per action** (gray/blue/red, the original
  color-coded design) **but `buildActionSection()` no longer reads them** — it's hardcoded
  to `NORMAL_COLOR`/`PRESSED_COLOR` with the per-action values commented out at the call
  site. The three properties are dead data now; see §6.

---

## 5. Core Logic, Rules & Data Contracts

### 5.1 Constants (`utils/config/constants.js`)
- Colors: `NORMAL_COLOR 0x2C2C2C`, `PRESSED_COLOR 0x4A4A4A` (overridden per-layout on round
  screens — see §2.1), `ERROR_COLOR 0xCC3344`. `ERROR_COLOR` is the newest addition, now
  used for error-state text in `page/link.js` (`showDone(false, …)`) and `page/show.js`
  (its error text widget) in place of the `0xcc3344`/`0xbdbdbd` literals those two files
  used to hardcode locally. `DEFAULT_COLOR`/`DEFAULT_COLOR_TRANSPARENT` (previously
  `0xfc6950`/`0xfeb4a8`) have been **removed** — grep confirms nothing references them
  anymore.
- `WEBSITE_URL = "https://mandala.garageno9.site"`.
- `STORAGE_KEYS`: `INSTALL_ID, MANDALA_DAY, MANDALA_PATH, STREAK_DAYS, BEST_STREAK,
  COLLECTION_JSON, LINKED, LAST_NEWS, COLLECTION_REFRESH`. `COLLECTION_REFRESH` is the odd
  one out: it's not really "data" like the others, it's a one-shot cross-page signal (see
  §4.4/§4.10) — written `true` by `page/settings.js`, read-and-cleared at the top of
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
`page/show.js`), `page/collection.js`, and `page/nolink.js` all still call
`this.request(...)` directly with a hand-assembled payload. `unlink` is the one new
exception: `page/settings.js`'s `unlinkWallet()` goes through `WatchApi.unlink(page)`
rather than adding another direct-call site, per this section's own guidance.
`page/settings.js`'s `refreshCollection()` calls **neither** — it makes no network request
of its own at all (see §4.10/§4.4: it signals `page/collection.js` via a storage flag and
lets that page do the fetch). Any further new call site should follow `unlink`'s example,
not the older ones.

---

## 6. Cross-Cutting Rules, Inconsistencies & Exceptions

These are places where behavior deviates from what a reader would expect from one part of
the codebase alone, or where two call sites disagree. Recorded here so future changes fix
them deliberately (in the spec first) rather than by accident.

> **Build-blocking right now: item 0.** `page/index.r.layout.js` does not parse — every
> round-screen build is currently broken. See below.

0. **`page/index.r.layout.js` has a duplicate-declaration `SyntaxError` — round builds
   cannot compile.** It imports `NORMAL_COLOR`, `PRESSED_COLOR`, `ERROR_COLOR` from
   `utils/config/constants.js`, then two lines later declares
   `export const NORMAL_COLOR = 0x0E8CE6` and `export const PRESSED_COLOR = 0x0B72BD` —
   an imported binding and a local `const` with the same name in the same module scope.
   Confirmed with `node --check`: `SyntaxError: Identifier 'NORMAL_COLOR' has already been
   declared`. None of the three imported names are used anywhere in the file's body (the
   file already defines and exports its own color constants for consumers like
   `page/practice.js`, `page/collection.js`, `page/nolink.js`), so the fix is almost
   certainly to delete the import block entirely rather than rename anything. Likely
   introduced while adding `ERROR_COLOR` support during the same styling pass that touched
   `page/help.js`, `page/link.js`, `page/linkinfo.js`, `page/qr.js`, `page/show.js`, and
   `page/index.s.layout.js` (which imports the same three names but, having no local
   `NORMAL_COLOR`/`PRESSED_COLOR` declarations of its own, only ends up with three more
   unused-but-harmless imports rather than a syntax error). Not fixed as part of this spec
   update — only asked to document the code as it stands.
1. **`GET_COLLECTION` response field name mismatch.** `page/collection.js` branches on
   `data.status` (`"OK"` / `"NO_LINK"` / other-as-error). `page/nolink.js` branches on
   `data.result` (`"Ok"` / `"NO_LINK"`). The companion (`app-side/index.js getCollection`)
   just forwards whatever the backend returns from `POST /api/watch/collection`, except on
   a local network exception where it returns `{ status: 'ERROR', error: 'network' }`
   (using `status`, matching `collection.js`'s convention, not `nolink.js`'s). One of the
   two watch-side pages is reading the wrong field today; which one is "correct" depends on
   what the live backend actually sends (external to this repo) and should be settled and
   written down here before either page is touched again.
2. **`ScheduleNotification.scheduleNotification(item)` guard is inverted.** The function
   body is gated by `if (!item || !item.title || !item.content)` — i.e. it only proceeds
   to schedule an alarm when the required fields are **missing**, and then immediately
   does `String(item.title)` on a possibly-null `item`. As written, a well-formed
   `{title, content}` call (as `page/index.js loadNews()` makes) falls through to the
   final `return 0`, and a malformed call throws inside the guarded branch instead of
   short-circuiting. This function currently cannot successfully schedule a notification
   for a valid `item`. Needs a spec decision (invert the condition) before relying on the
   news-notification feature.
3. **Two request-calling conventions coexist.** `WatchApi` (link-only) vs. ad-hoc
   `this.request({ method, request: {...Profile.createRequestData(), ...} })` (everything
   else). Not a bug, but an acknowledged half-finished refactor — see §5.5.
4. **Selection/focus list pattern is duplicated three times** with small variations
   (`page/index.js`, `page/collection.js`, `page/nolink.js` each define their own
   `updateSelection`/`attachSelectable`/key-nav wiring instead of sharing one component).
   Functionally consistent today; a shared helper would reduce future drift.
5. **Square-screen layout is incomplete** (§2.1): `page/index.s.layout.js` is missing the
   `NORMAL_COLOR`/`PRESSED_COLOR`/`SELECTED_COLOR`/`MENU_BUTTON` exports that
   `page/index.r.layout.js` provides and that `page/practice.js` imports unconditionally.
6. **Four separate, unused TGA-thumbnail resizer implementations** exist in `utils/`
   (`TgaThumbnail.js`, `IndexedTgaThumbnail.js`, `ImageResizer.js`, `HardcoreResizer.js`),
   none imported anywhere. They read as successive iterations on the same idea (byte-level
   TGA downscaling for the collection list's thumbnail icons) but no page currently uses
   any of them — collection rows just swap between two fixed icon assets
   (`ic_collection.png` / `ic_not_loaded.png`) rather than rendering a real per-item
   thumbnail. Treat these as prototypes to finish/pick-one-and-delete-the-rest, not as
   dead weight to casually remove without checking intent first.
7. **`device.js getLocale()` is unused** (§5.3) — kept for a possible future need to
   branch on locale directly rather than through `getText`.
8. **`page/settings.js` does not verify `STORAGE_KEYS.LINKED` before offering
   Refresh/Unlink** (§4.10) — a deliberate choice (the flag can already be stale per item 1
   above, and every action there is self-correcting), not an oversight.
9. **Ambient/global companion APIs.** `app-side/index.js` uses `Logger`, `fetch`,
   `network`, `image`, and `transferFile` with no imports — these are ZeppOS side-service
   globals injected at runtime, not missing dependencies. `logger` (lowercase, module
   `Logger.getLogger('mandala-day')`) is the one explicit local.
10. **The device `Page` API has no `onResume`/`onPause` lifecycle hooks — confirmed from
    `node_modules/@zeppos/device-types/dist/index.d.ts`'s `Page.Option` interface, which
    lists only `state`, `onInit`, `build`, `onDestroy`.** (`onResume`/`onPause` do exist,
    but only on the unrelated `SecondaryWidget` and side-service interfaces in the same
    file.) `@zeppos/zml/base-page.js`'s `BasePage` wrapper will happily accept and wire up
    an `onResume`/`onPause` option if you pass one — its own type declarations even list
    them as part of `ILifeCycle` — but the underlying native `Page()` constructor never
    calls them back, so they are silently never invoked. Two consequences:
    - `page/nolink.js` defines `onResume()`/`onPause()` to keep `state.visible` accurate
      and to re-run its link-status background check every time the page is revisited (see
      §4.5). Neither has ever fired. This is a pre-existing latent bug, not something
      introduced by later work — the page still functions because the one `build()`-time
      check it does is correct, it just never repeats.
    - `page/collection.js`'s refresh signal (§4.4/§4.10) was originally built the same way
      (flag + `back()` + `onResume()`) and, for the same reason, silently did nothing: the
      user reports "back happens, no animation, no request" was the direct symptom of this
      platform fact. The fix moved the check into `build()` and switched the triggering
      navigation from `back()` to `replace()`, since `replace()` is the one primitive in
      this app guaranteed to force a fresh `onInit`/`build()` cycle (already relied on
      elsewhere: `page/nolink.js`'s own forward transitions, `page/settings.js`'s
      `unlinkWallet()`). **Going forward: never rely on `onResume`/`onPause` on a device
      `Page` for anything. If a page needs to react to "the user came back to me," the only
      working approaches are (a) check state at the top of `build()` and force a fresh
      instance via `replace()`, as `page/collection.js` now does, or (b) a background poll
      while the *current* page is different (as `page/nolink.js`'s `checkLinkInBackground`
      does, correctly, from `build()`).**
11. **`page/settings.js`'s per-action button colors are dead data.** `renderActions()`
    still builds an `actions` array with a distinct `normalColor`/`pressColor` per entry
    (gray for Refresh, blue for Mint, red for Unlink — the original color-coded design),
    but `buildActionSection()` no longer reads `action.normalColor`/`action.pressColor` —
    it's hardcoded to the shared `NORMAL_COLOR`/`PRESSED_COLOR` from `constants.js`, with
    the per-action reads commented out at the call site (`normal_color: NORMAL_COLOR,
    //action.normalColor`). All three buttons render identically today. See §4.10.

---

## 7. Companion Service Contract (`app-side/index.js`)

Single `onRequest(req, res)` router keyed on `req.method`:

| Method | Handler | Backend call | Success shape sent back |
|---|---|---|---|
| `GET_MANDALA` | `getMandala` | `network.downloader` → `GET {WEBSITE_URL}/api/watch/{day}/{size}` → `image.convert()` → BLE file transfer | `{ result: "Ok", filePath }` (only after the `transferred` file-transfer event fires) |
| `OPEN_MANDALA` | `openMandala` | `GET {WEBSITE_URL}/api/watch/repeat/{day}/{size}` | raw `response.body` (fire-and-forget signal from `page/show.js`) |
| `GET_COLLECTION` | `getCollection` | `POST {WEBSITE_URL}/api/watch/collection` (via `linkApi`) | backend's raw body, or `{status:'ERROR', error:'network'}` on exception — see §6 item 1 |
| `GET_NEWS` | `getNews` | `GET {WEBSITE_URL}/api/watch/zepp/news/{time}/{region}` | parsed JSON body |
| `LINK_START` | `linkStart` | `POST {WEBSITE_URL}/device/link-start` | backend body + derived `qr = "{WEBSITE_URL}/link/add/{token}"` |
| `LINK_STATUS` | `linkStatus` | `POST {WEBSITE_URL}/device/link-status` | backend body |
| `LINK_CONFIRM` | `linkConfirm` | `POST {WEBSITE_URL}/device/link-confirm` with `{wallet}` | backend body |
| `LINK_REJECT` | `linkReject` | `POST {WEBSITE_URL}/device/link-reject` | backend body |
| `UNLINK` | `unlink` | `POST {WEBSITE_URL}/device/unlink` | backend body, or `{status:'ERROR', error:'network'}` on exception |

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
  (`mandala.garageno9.site/api/watch/...`) are not verifiable from this codebase — the
  `GET_COLLECTION` field-name question in §6 item 1 can only be closed by checking the backend
  or a capture of a real response.
- No test suite exists (`package.json test` script is the CRA/npm-init placeholder that
  just exits with an error).
