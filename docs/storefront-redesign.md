# Storefront redesign: plan

Goal: ChickenTender's store, console and game pages look and behave like Steam's own Big Picture UI.
Steam's look always wins; Overdrive (ps5overdrive) contributes layout structure only. Three layouts are
built behind a live switch for a bake-off. No new metadata connections: RomM and SteamGridDB only.

Evidence is in `docs/reference/` (not committed: the screenshots show a signed-in Steam account):

| File | Contents |
| --- | --- |
| `reference/steam/store-notes.md`, `steam/store/` | Big Picture Steam Store: ~80 captures, measurements |
| `reference/steam/native-notes.md`, `steam/native/` | Native library, game page, settings; probes; `css-variables.json`, `class-maps.json` |
| `reference/chickentender-baseline/` | The current plugin pages and a 30-game data coverage sample |
| `reference/overdrive-teardown.md` | Overdrive's layout |
| `reference/metadata-sources.md` | What RomM sends, what we use, external options |
| `reference/native-components.md` | `@decky/ui` inventory and the audit of `src/ui` |

All sizes below are CSS px in the Big Picture window: 1353x761 at devicePixelRatio 1.42 (x1.42 = screen px).

## What "native" means here (verified on the device)

- **Controls come from `@decky/ui`.** Every one we need resolves on this client: `Focusable`,
  `DialogButton(Primary)`, `Tabs`, `Carousel`, `ScrollPanel`, `Dropdown`, `Menu`/`showContextMenu`,
  `showModal`/`ConfirmModal`, `ProgressBar`, `SteamSpinner`, `DialogHeader`/`DialogSubHeader`/`DialogBodyText`,
  `Field`. `Tabs` and `Carousel` are found by source matching, so each use is guarded with a plain fallback.
- **Steam's class maps are not building blocks.** Applied to our own markup they mostly collapse (capsule
  needs a width-bounded parent, hero has `z-index: -1000`, logo is 0x0, play bar is 761 tall, the Play
  button gets no green). Only `TopGradient` and the `GameStat` label/value pair work alone.
- **So the kit is our markup styled with Steam's tokens and measured values.** `:root` carries 525 custom
  properties (`--color-*` 12-step scales, `--text-size-1..9`, `--spacing-0..9`, `--radius-sm/md/lg`,
  `--control-height-1..3`, `--font-family`). `tokens.ts` references these by name, with the measured value
  as the fallback. The current `theme.ts` palette (the Steam website's blue-grey) goes.
- **Focus is Steam's own.** `Focusable` draws the native ring (2 px `rgba(255,255,255,.6)`, offset 2 px,
  grow and pulse animation). Capsules add what library tiles add: shadow `0 16px 24px rgba(0,0,0,.5)` and
  a small lift over `.3s cubic-bezier(.16,.86,.43,.99)`. Buttons, tabs and menu items show focus by fill
  (white), the primary action by green. No custom rings, no scale 1.1.

## Component kit (`src/ui/kit/`)

| Component | Steam source | Spec |
| --- | --- | --- |
| `Capsule` (portrait) | library tile | 172x258, 2:3, radius 0, gap 12; SteamGridDB grid, then RomM cover |
| `WideCapsule` | store row tile | 317x182 (4 per row) and 251x172 (5 per row) incl. caption bar; SteamGridDB wide 920x430 |
| `HeroCapsule` | store hero carousel | 392x411, image 392x224, then title, tags, status |
| `ListRow` | store tabbed list, search | 727x74, wide art left, title, genres, date; status at right |
| `PreviewPanel` | store list preview | title, rating, tag chips, screenshots of the focused row |
| `Shelf` | home shelf, store row | header (22/600 white) + horizontal `Focusable` row; `Carousel` where it holds |
| `SectionHeader` | game page section | 18/500 white, line height 22 |
| `ActionButton` | Play button | 210x48, radius 2, 16/500; grey at rest, green `#59BF40` focused; states Download, progress, Play, Resume |
| `IconButton` | play bar buttons | 48x48, radius 2, `rgba(172,178,201,.14)`, white when focused |
| `Stat` | play bar stats | label 12/700 uppercase .5px `rgba(255,255,255,.7)`; value 16/500 white; gap 20 |
| `PillTabs` | game page tabs | 34 tall, radius 64, 12/700 uppercase; selected `rgba(255,255,255,.15)`, focused white |
| `InfoBox` | store summary grid | uppercase heading with rule, body rows (Reviews, Tags, Game info) |
| `TagChip` | store user tags | radius 3, blue-on-dark, focusable when it filters |
| `StatusPill` | store discount pill | 14/700 on `#a1cd44`; we use it for Installed / size / progress |
| `MediaSlides` | store media carousel | 813x457 slides, video first, Y fullscreen, X unmute; no thumbnail strip |
| `HeroArt` | library game header | 350 tall, SteamGridDB hero, logo box 430x121 bottom-left, gradient to page |
| `HeroVideo` | store hero video | muted autoplay, starts at 25 %, removed when hidden |
| `SortMenu`, `FilterSheet` | library Y menu, store filter drawer | `showContextMenu`, `showModal` |

Page gutter 38 (native) or 50 (store); page background from tokens; footer hints through `Focusable`'s
action descriptions (A Select, Y Fullscreen/Filter, X Unmute).

## Game detail page: content

The same blocks in every variant; a block with no data is not rendered.

| Block | Data | Source |
| --- | --- | --- |
| Hero art, logo, capsule, icon | SteamGridDB hero, logo, wide, grid, icon | cached today (183/184 games each) |
| Media: gameplay video or trailer, then screenshots | RomM mp4 (`path_video`, ScreenScraper/LaunchBox video), else `youtube_video_id`; all `merged_screenshots` | RomM; trailer id present on 27/30 sampled, screenshots on 30/30 |
| Action | Download / progress / Play / Resume, plus menu (Remove, open in RomM, favourite) | existing actions |
| Stats | Size, Released (full date), Players, Time to beat, Last played | RomM (HLTB and play data when the server has them) |
| Reviews box | IGDB user and critic scores, fallbacks MobyGames / ScreenScraper / LaunchBox, your RomM rating | RomM |
| Tags | genres, themes, perspectives, franchise; a tag opens a filtered list | RomM |
| Game info | developer, publisher, platform, region, age-rating badge | RomM |
| About | summary | RomM |
| Features | game modes, co-op and split-screen counts | RomM (IGDB multiplayer modes) |
| Achievements | RetroAchievements list and progress | RomM, when enabled on the server |
| Editions | sibling ROMs, DLC / remakes / ports in the library | RomM |
| More like this | `similar_games` | existing |

Not shown: system requirements, languages, price, purchase options, community reviews.

## Bake-off variants (`src/ui/variants/<name>/`)

All three use the kit, tokens and focus rules above; only arrangement differs.

1. **Store** (the Big Picture Steam Store). Home: hero carousel of `HeroCapsule`s, `WideCapsule` rows
   (Recently added, For you, Top rated, On this Device), Browse by Console tiles, a five-tab `ListRow` list
   with `PreviewPanel`. Game: 370x457 info panel (wide capsule, title, short description, status chip)
   beside `MediaSlides`; 2x2 `InfoBox` grid (Reviews, Tags, Game info, Features); action block; two-column
   body (About 805, features 355); More like this.
2. **Library** (native Big Picture library). Home: full-bleed hero that follows the focused tile, portrait
   `Capsule` shelves, console collection tiles. Game: `HeroArt` with logo, play bar (`ActionButton`,
   `Stat`s, `IconButton`s), `PillTabs` Overview / Media / Details / Achievements with a sticky header.
3. **Spotlight** (Overdrive's structure in Steam's skin). L1/R1 `PillTabs` across the top (Discover,
   Browse, Top rated, New, Consoles); spotlight hero with a five-pick list at the right that pauses on
   focus; three side-by-side charts; catalog grid with `SortMenu` and `FilterSheet`. Game: backdrop band
   with capsule, logo, meta line and buttons; two-column body with one large media slide and a Details
   table; More like this.

Switch: a "Layout" dropdown in the Quick Access panel, persisted in settings and read by the route shells,
so a change re-renders the open page.

## Video

Verified on the device: H.264 mp4 plays, seeks to 25 % and autoplays muted; YouTube embeds
(`youtube-nocookie.com` and `youtube.com`) render and autoplay muted inside the Big Picture document, and
gamepad focus is intact afterwards.

- Source: the YouTube id (`youtube_video_id`, IGDB's first video through RomM). RomM does not keep video
  files by default, so a RomM-hosted mp4 is used only when a game has one.
- Start point: mp4 seeks to `duration * 0.25` after `loadedmetadata`; YouTube uses the IFrame API
  (`getDuration`, then `seekTo`), falling back to a fixed `start=` offset.
- One video at a time, started after focus rests, element removed when the page hides (another plugin
  reports a Steam freeze otherwise). Artwork shows until the first frame and whenever video fails.
- Motion is limited to video and SteamGridDB animated art (focused card and hero only). The current hero
  zoom-and-drift goes.

## Backend changes

- `Game.details()` passes through what RomM already sends: all screenshots, video sources, full release
  date, the score set, age ratings, themes and perspectives, multiplayer modes, HowLongToBeat, achievements,
  sibling ROMs, the user's own rating.
- `sgdb.py`: also pick animated grid and hero (WebP). One more request per game per kind.
- Optional shelves from existing RomM endpoints: collections, "released on this day", filter facets.
- A `layout` setting.

## Rewrite seam

Keep: `api.ts`, `state.ts`, `actions.ts`, `model.tsx` row building and art fallbacks, `Guard`, the
lightbox, the verified focus workarounds, all of `src/steam/`. Add hooks with no markup:
`useStoreModel`, `useConsoleModel`, `useGameData`, `useGameActions`. The three `*Page.tsx` files become
shells (guard, data hook, setup and loading states) that render `variants[layout].Store|Game|Console`.

Fixed on the way: two `openGame` functions with different behaviour; stop-download confirming in one path
only; rows re-rendering on every progress event; 3:4 cards cropping 2:3 art; console grid width measured
once; the details cache never invalidated; mixed px and `bpx()` sizing; dead code; the clipped "Change
key" button; a wrong platform label on at least one game ("Gradiente" on Banjo-Kazooie); `design.md`
statements that no longer hold.

## Build order

1. Seam: hooks, route shells, variant registry, the Layout switch, with the current UI moved in unchanged
   as the first variant. Check RomM video files and Range support.
2. Tokens and kit, each component compared on the device against its reference capture.
3. Backend pass-through fields and animated SteamGridDB art.
4. Variant 2 (Library): closest to the current structure, proves the kit.
5. Variant 1 (Store), then variant 3 (Spotlight).
6. Video in the hero and media slides.
7. Bake-off on the device; remove the losing variants and the old UI.
