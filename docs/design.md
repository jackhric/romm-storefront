# Design

ChickenTender is a rewrite of [romm-tender](https://github.com/danielcopper/romm-tender) that keeps one job:
show the RomM library on the Deck, download what you pick, play it. Tender grew to ~190k lines of Python by
also doing save sync, BIOS management, playtime, a patched Steam game page and whole-platform syncs; none of
that is in scope here.

## Principles

- **RomM is the library.** The plugin never keeps its own catalogue or database: the game list is fetched
  from RomM (184 games take one call) and a game's status comes from the filesystem (is its file or folder in
  the ROM folder?). Nothing to migrate, nothing to get out of sync.
- **One state, one event.** The backend owns a single snapshot (`App.state()`), every command returns it and
  every change pushes it as `chickentender_state`. Download progress is the one exception (`chickentender_progress`,
  twice a second) because it must not resend the whole library.
- **No Steam internals from the frontend.** Only `@decky/ui` and `@decky/api`; the library is a Decky route
  page built on `SidebarNavigation`, so it looks like Steam's own settings and gets gamepad focus for free.
- **Nothing secret typed on the Deck.** Pairing uses RomM's device code flow; the token lives in a 0600 file.

## Backend (`py_modules/chickentender/`)

| Module | Owns |
| --- | --- |
| `settings.py` | the JSON settings file (server URL, token, device id, ROM folder, SteamGridDB key), written atomically |
| `romm.py` | `RommClient`: one method per endpoint used, `RommError(status, detail)`, streaming `content()` |
| `pairing.py` | `DevicePairing`: the device code flow and its polling task |
| `library.py` | `Library`: platforms and `Game`s from RomM; `snapshot()` adds each game's status on disk |
| `install.py` | `InstallLocation`: the ROM folder, the ES-DE folder for a RomM platform (`ngc` → `gc`), a game's `Target` |
| `downloads.py` | `Downloader`: FIFO, one at a time, per-file streaming to `.part` with `Range` resume |
| `sgdb.py` | `SgdbClient`: SteamGridDB search, grids/heroes/logos/icons, `pick_assets`, `fetch_image` from the CDN, `SgdbError(status, message)` |
| `cdp.py` | the few Chrome DevTools calls the sign-in needs: page targets from `127.0.0.1:8080/json`, one `Runtime.evaluate` per websocket |
| `signin.py` | `SgdbSignin`: "Sign in with Steam", the task that fetches the SteamGridDB key through Steam's browser |
| `artwork.py` | `ArtCache` (`sgdb/index.json` plus image files) and `ArtPrefetch` (fills the cache in the background) |
| `retrodeck.py` | read-only view of the installed RetroDECK Flatpak: its `retrodeck.json` (ROM folder, version), lock file, launch command |
| `app.py` | `App`: wires the above, exposes the commands, emits the events |

`main.py` is a thin `Plugin` that builds `App` with Decky's settings dir, home, logger and `emit`. Nothing under
`py_modules/` imports `decky`, so the package runs in tests and from a dev box.

## Frontend (`src/`)

- `api.ts`: the backend method and event names, the `State`/`Game`/`Progress` types, the route path.
- `state.ts`: `useBackendState()` (snapshot on mount, then follow the event) and `useProgress()`.
- `ui/Connect.tsx`: address, connect, pairing code. `ui/SgdbKey.tsx`: the second setup step, a SteamGridDB API key
  ("Sign in with Steam" with its stage line and Cancel, or a pasted key: masked field, Save, the backend's `sgdb.error`); the storefront relies on SteamGridDB art, so ChickenTender
  cannot be entered without one. `ui/Home.tsx`: the panel once paired and keyed (browse button, active download, ROM
  folder, the SteamGridDB row whose "Change key" clears the key and so returns to the key step, disconnect). The route
  pages gate the same way: unpaired or without a key they show `ui/store/Setup.tsx` ("Open ChickenTender in the Quick
  Access menu to finish setup") instead of the store.
- `ui/Store.tsx` (route `/chickentender`): the storefront. Hero with the animated backdrop, "Recently added",
  the "By Console" strip (square tiles in Steam's colours with the IGDB logo; a tile opens that console's page), "For you" from
  RomM's recommendations, "Top rated", "On this Deck". Pieces live in `ui/store/` (`Hero`, `HeroBackground`,
  `Consoles`, `Row`, `Card`, `Page` with the `Guard` boundary, `model` for rows, labels and the modal flows).
- `ui/GamePage.tsx` (route `/chickentender/game/:rom_id`): the layout chosen in the bake-off
  (`docs/storefront-brief.md`, variant B3): a tall sharp-screenshot hero with the title, a publisher · year ·
  genre line and the action row (Download / Resume / Stop / Remove plus a "..." menu), then stacked sections:
  Screenshots (lightbox), About, Details as icon chips, Similar games from `similar_games`; a sticky title and
  Download band appears once the hero scrolls away. `ui/game/PageXbox.tsx` is the layout, `ui/game/parts.tsx` the
  shared pieces. Cards open it; the hero button keeps the quick action.
- Card captions are the bake-off's C2: nothing at rest, the focused card shows its title and one meta line
  (system · year · size, or the row's note); the box keeps its height so rows never shift (`ui/store/Caption.tsx`).
- `ui/ConsolePage.tsx` (route `/chickentender/console/:platform_id`): one console like a Steam collection: logo, name,
  counts and a sort control (name, recently added, rating, size) above a grid of covers whose columns fit the width.
- Art sources (`ui/store/model.tsx` `coverOf`/`backdropOf`, `ui/store/Title.tsx`): cards and the hero's capsule use
  SteamGridDB's grid, then RomM's large cover, then its cover; hero backdrops (store and game page) SteamGridDB's hero,
  then the first screenshot, then the cover. With a SteamGridDB logo the heroes draw it (contained, bottom-left, at most
  ~40 % of the hero's width and ~35 % of its height) in place of the title text, which stays the fallback, also when
  the logo fails to load. A SteamGridDB hero is not drawn with the screenshots' hard pixels. The backend fills `art`
  in over time and pushes the state, so the UI just shows the fallbacks meanwhile (no spinner).
- `index.tsx`: registers the three routes, installs the Steam hooks and picks `Connect`, `SgdbKey` or `Home` for the
  panel.

Gamepad focus lessons (verified on the Deck): strips are `Focusable flow-children="row"` inside a column
`Focusable` with `navEntryPreferPosition={MAINTAIN_X}` so up/down keeps the column; Steam smooth-scrolls the
focused element into view ~80 ms after focus, so the page ends 42 px above Steam's footer and uses
`scrollPaddingTop`; a freshly mounted route page gets no gamepad focus and `preferredFocus` is ignored, but a DOM
`.focus()` on a Focusable hands Steam's focus over; a focused element that unmounts leaves focus nowhere, so move
focus first.

## Storefront data

The backend keeps the store cheap: the snapshot carries the lean game list (cover URLs, year, genres, rating,
added date), the platforms with their IGDB logo, and RomM's personalised feed (`GET /api/recommendations`, reduced to
games we list, with the reasons and the played game it stems from). Long fields (summary, screenshots, developers)
come per game from `game_details`, and "More like this" from `similar_games` (`GET /api/roms/{id}/similar`), both on
demand. The hero's backdrop is `src/ui/store/HeroBackground.tsx`, which reproduces what the Big Picture library home
does (measured on Steam client 1792618285): the image dimmed to 50 % under a radial mask, a 25 s ease zoom from 1.0 to
1.1 whose transform origin drifts from the bottom-left to the centre (two iterations, alternate), and on change a 0.3 s
crossfade where the old layer slides 32 px and scales to 1.08. Steam's home has no auto-rotation; ours rotates the
featured game every 8 s while nothing is focused.

## Artwork

Grids, wide capsules, heroes, logos and icons come from SteamGridDB with the user's own API key (`set_sgdb_key`, checked
against the API before it is saved; `disconnect` keeps it). The game id is the one RomM already matched and stores as
the ROM's `sgdb_id`; only a game without one is searched by name, and only an exact title match (ignoring case and
punctuation) counts. Each game costs one request per kind (static, no NSFW/humor/epilepsy, the Steam sizes), and the
highest-scored image of a Steam size wins; icons are the largest PNG up to 256 px. Requests go two at a time with
`Retry-After` (else 5 s doubling) on 429. The picks live in `<runtime dir>/sgdb/index.json` per rom_id, with what they
were matched on (so a rematch in RomM refetches) and a negative entry for games SteamGridDB lacks, so nothing is asked
again on the next start; images are fetched on demand from the CDN (no key needed) into `sgdb/<sgdb_id>/<kind>.<ext>`
and handed to the frontend as base64 (`art_base64`). After each library refresh and when a key is set, `ArtPrefetch`
walks the uncached games and pushes the state every 10; `game_art` fetches one game right away. The key is only ever
sent in the `Authorization` header: no log line, error message or state carries it.

### Sign in with Steam

The usual way to get the key needs no typing. "Sign in with Steam" opens SteamGridDB's home page in Steam's built-in
browser (`Navigation.NavigateToExternalWeb`, the `/externalweb` route) and starts `start_sgdb_signin`. The backend
finds that page among CEF's targets on `127.0.0.1:8080` (Decky keeps remote debugging on) and calls SteamGridDB's own
JSON API from inside it with `Runtime.evaluate`, so the request carries the page's session cookie: `GET
/api/public/prefs` gives `data.user.api_key` when logged in; an account without a key gets one from `POST
/api/v2/users/apikey` (once, with the `XSRF-TOKEN` cookie as `X-XSRF-TOKEN` like the site's own client). The revoke
call is never made, and no page element is read or clicked. Logged out, the page is sent to Steam's OpenID login for
SteamGridDB; Steam's consent page shows the account and a "Sign In" button that only the user presses (the plugin
never does), and the browser must be in front for that, since a hidden browser view is not rendered (fetches still
work). A browser already signed in to SteamGridDB goes straight from `opening` to `reading`. The key goes straight
into `set_sgdb_key`; `sgdb.signin` (`active`, `stage`: opening, login, consent, reading, verifying, done, failed,
`error`) is all the state carries, and the logs only name stages. Closing the browser, five minutes without a result
or debugging being off end it as `failed`. Once the key is saved the frontend leaves the browser for the store page.
The home page is opened rather than the API preferences so the key is never drawn on screen.

## Steam integration (`src/steam/`)

Everything that reaches into Steam lives here and follows one rule: check the internal first, change it through
`tweak()` with an undo, and leave Steam untouched when anything is missing or throws. `restoreAll()` runs first in
`onDismount`. A failed hook logs once as `[ChickenTender] "<name>" skipped` and the plugin's own UI (store page,
panel) keeps working without it.

| File | Steam surface | Fallback when unavailable |
| --- | --- | --- |
| `shortcuts.ts` | `SteamClient.Apps.AddShortcut`/`SetShortcut*`/`RemoveShortcut`, `SetCustomArtworkForApp` (capsule from the RomM cover, fetched by the backend because the webview cannot read it cross-origin), `collectionStore` ("RomM" collection) | downloads run without a shortcut (appid 0); the game is launched from the store page only |
| `art.ts` | SteamGridDB grid, hero, logo and wide art (`setSgdbArt`, bytes from the backend's `art_base64`) plus a logo position; for any kind SteamGridDB lacks, wide and hero art derived from the capsule (gradient when there is no cover) | Steam shows its default placeholders |
| `coexist.ts`, `inject.ts`, `client.ts`, `guard.tsx` | the Downloads page: our downloads as items in `downloadsStore` next to Steam's, the page's pause/resume/reorder/clear buttons routed to the backend through `SteamClient.Downloads`, a page-scoped error boundary | progress shows only on the cards and in the panel |
| `bridge.ts` | glue: backend `download_control` as the bridge's `Backend`, state and progress events into `setDownloads`, toasts | — |
| `tweak.ts` | the registry: undo once, never throw, reload guard on `window.__chickenTenderSteam` | — |

Flow of a download: `download(rom_id)` in `api.ts` first asks Steam for a shortcut (`prepareShortcut` in `index.tsx`:
`launch_target` and `game_art` from the backend (the latter waited on for at most 5 s), the icon, `AddShortcut`, wait
for the app overview, collection, SteamGridDB art, then the RomM capsule and derived art for whatever SteamGridDB did
not provide), then
queues the backend download with that appid; the backend remembers rom_id → appid in `shortcuts.json`. When a
download finishes, the shortcut's launch options are refreshed, since a multi-file game's launch file (`.m3u`,
`.cue`, `.gdi`, ...) is only known once it is on disk. The shortcut runs `bin/chickentender-launch` (copied to the
plugin's runtime dir, as the plugin dir is root-owned), which refuses while `.part` files remain and otherwise execs
`flatpak run net.retrodeck.retrodeck -s <system> <file>`. Removal deletes the files, drops the download entry (the
Downloads page dereferences every item's app overview, so the entry must go before the shortcut), the collection
membership and the shortcut.

What makes our items look like Steam's own: `autoupdate.ts` gives a listed shortcut the auto-update value of a Steam
game (a shortcut's is "Update on Launch", which labelled our rows and showed a paused item as "updates disabled";
`SetAppAutoUpdateBehavior` is ignored for shortcuts, so the value is set in `appDetailsStore` and undone on unload);
a new shortcut gets a square icon drawn from the cover (`art.ts` `iconPng`, written by the backend's `save_icon` to
`<runtime dir>/icons/<rom_id>.png`), which Steam reads only when the shortcut is created (set on an existing one, it
shows after a Steam restart); the header's "Peak" is our own; the Options menu's "Launch when Complete" works.

SteamGridDB art on the shortcut: each kind goes through `SetCustomArtworkForApp` (types 0 grid, 1 hero, 2 logo,
3 wide) after `ClearCustomArtworkForApp` and a 500 ms wait, since the clear resolves before Steam drops the old file
(the SteamGridDB plugin waits the same); webp is redrawn as png. A custom logo shows only with a saved position, so a
set logo gets Steam's own default, `appDetailsStore.SaveCustomLogoPosition(overview, { pinnedPosition: "BottomLeft",
nWidthPct: 50, nHeightPct: 50 })` (which writes `{ nVersion, logoPosition }` through `SetCustomLogoPositionForApp`;
verified on Steam client 1792618285, accessor in `internals.ts`). Like the capsule, finished SteamGridDB art stays on
the shortcut after unload; the tweak's undo clears only what a set still in flight had written. A SteamGridDB PNG
icon replaces the drawn one. Art that reaches the backend only after the shortcut was made is not applied to it.

Known limits: the Options menu is the shortcut's normal one ("Play" mid-download is refused by the launcher), our
items appear only for "This device". Completed entries are kept in memory, so a plugin restart clears the "Completed" rows.

## RetroDECK: reuse, don't own

A private RetroDECK for the plugin is not possible: Flatpak keys an app's `~/.var/app/<id>` config and data
on the app id, so a second `net.retrodeck.retrodeck` (user install or GitHub bundle) shares the same
`retrodeck.json`, lock file and every emulator config, and a user-level copy also shadows the system one for
plain `flatpak run`. RetroDECK's first run is a zenity wizard with no headless flag (the pieces behind it,
`prepare_component reset all` and `create_lock`, can be driven through `flatpak run --command=bash`, but that
is unsupported). So the plugin reads RetroDECK's own config for the ROM folder, launches games with
`flatpak run net.retrodeck.retrodeck -s <system> <rom>` (RetroDECK picks the emulator ES-DE configured for
that system), and, when nothing is installed, will offer to install it from Flathub and ask the user to run it
once. Only `ngc` → `gc` and `dc` → `dreamcast` differ between RomM slugs and ES-DE folders.

## Roadmap

1. **Done**: pair, list, download with progress and resume, status from disk; Steam shortcut with art in a "RomM"
   collection for every downloaded game, launch through RetroDECK, downloads on Steam's Downloads page, remove.
   All verified on the Deck.
2. **Done**: the storefront (hero, Recently added, By Console tiles and console pages, For you, Top rated,
   On this Deck), the game detail page and card captions picked in a bake-off; Downloads-page parity.
3. Later, only if wanted: offer a Flathub install of RetroDECK when missing, BIOS check against RomM's firmware
   list, play sessions reported to RomM, persisted "Completed" rows.
