# ChickenTender storefront brief: game page and cards

Target: Steam Big Picture at 1920x1080, gamepad first, dark theme. Steam's chrome takes the top 56 px
(status bar) and the bottom 58 px (button hints), so content gets y 56-1022 (966 px). Side gutter 56-60 px,
matching the current store. Sizes are CSS px at 1080p.

## What is wrong now (from the two screenshots)

- Game page: the cover, title block and facts table sit in a band that is 580 px tall, but the facts table
  is a desktop-style key/value grid with half its width empty, the backdrop is a blurred title screen that
  reads as noise, and the Download button floats next to a long helper sentence. About and Screenshots start
  below the fold with no visual hierarchy between them.
- Cards: the caption reserves two title lines, and the size sits on a fixed third line. A one-line title
  ("Forza Horizon", "Jak II") leaves a 22 px hole between title and size; the size line is grey noise
  on every card even though it rarely affects a choice.

## A. Findings per platform

### Steam Deck / Big Picture library game page
Top to bottom: full-width hero art (Steam asset 3840x1240, ~3.1:1) with the logo (max 1280x720 asset) placed
bottom-left over it; a dark play bar directly under the hero: large Play/Install button (green Play, blue
Install), then small icon buttons (controller layout, settings cog), then a facts strip of short
label-over-value pairs (Last played, Play time, Achievements, Cloud status); then tabs Activity / Your Stuff /
Community / Game Info, where Game Info holds the description, tags, screenshots and developer/publisher.
Focus starts on the Play button; pressing down moves to the tabs. Critique: synopsis buried in the last tab.
- https://store.steampowered.com/libraryupdate
- https://blog.parrot9.com/steam-case-study/
- https://github.com/Leon-Swains/game-glance (Decky plugin rebuilding the page: hero full screen, pill Play, round icon buttons)

### Steam Deck store / library grid
Library capsules are 2:3 portrait (asset 600x900). The grid shows covers only: no title, no size under the
tile; the title appears in a tooltip-like label when focused, and install state is shown by dimming/icon.
The focused tile scales up slightly (~1.05-1.1) with a light outline and drop shadow. Collections pages have
a header with the collection name, a game count, and Sort/Filter controls on the right.

### PlayStation 5 store and game hub
Game page: full-bleed key art backdrop darkened toward the left; left column with the title (or logo),
publisher line, rating, price, a single wide primary button (Add to Cart / Download / Play) and a round
"..." button beside it; to the right or below, a horizontal media row (trailers then screenshots); then
"Add-ons / Editions" rows, then a description block, then a "Game info" list (release date, publisher,
genres, voice/subtitles). Store browse tiles are 1:1 squares; on the home screen titles appear only
on the focused tile (name above/beside the row); in store grids the title and price sit under the tile in
one or two lines. Focus: tile grows, white outline. 2026 beta: Netflix-style wide tiles, trailer on hover,
genre chips.
- https://www.playstation.com/en-us/ps5/ps5-features/
- https://www.pushsquare.com/news/2026/04/ps5s-ps-store-is-getting-a-netflix-style-makeover-soon

### Xbox console store
Product page: wide hero key art across the top; over its lower-left the title in large type, publisher,
rating and short facts; a horizontal row of buttons (Buy/Install primary, Game Pass, Wishlist, "..."); then a
vertical scroll of sections: screenshots and trailers row, Description, a "Capabilities/Details" grid of
icon+label chips (4K, HDR, players, online), Add-ons, "People also like/Similar games" row. Tiles are 2:3 box
art posters (2020 "Mercury" redesign), with title and price under the tile in browse lists.
- https://www.thurrott.com/games/xbox/236057/redesigned-xbox-store-revealed-in-leaked-screenshots
- https://www.purexbox.com/news/2020/06/new_screenshots_reveal_vastly_redesigned_xbox_store
- https://medium.com/@DarthTurner/concept-xbox-mobile-app-redesign-2c500f1eec35

### TV conventions (Netflix, Apple TV)
Rows of art with no caption at rest, or a single line truncated with ellipsis; metadata (year, genre, rating)
in one muted line with dot separators; details appear for the focused item only, in a fixed area so nothing
shifts; one primary action per screen; secondary data (file size) only on the detail page.

## B. Game page variants

All variants: focus lands on the primary button; B/Esc goes back; LB/RB is free for tabs.
Facts are short `LABEL` (13 px, letter-spaced 0.08em, muted) over `value` (18 px) pairs, never a two-column
table. Backdrop = first screenshot or fanart, never the title screen if anything else exists, blurred 0 px
(sharp) with a gradient to the page colour (#171d25-ish from theme tokens).

### 1. Steam library style (hero + play bar + tabs)
- Hero: x 0-1920, y 56-536 (480 px). Art covers, bottom 40 % fades to page colour. Logo or title
  bottom-left at x 60, baseline y 500: logo image max 560x200, else title 56 px bold, 1 line, ellipsis;
  platform name 15 px caps muted above it.
- Play bar: y 536-640 (104 px), background rgba(0,0,0,.45). Download button 240x56 (20 px semibold),
  then 48x48 round icon buttons (favourite, "..." for more), then 32 px gap and a facts strip of 4-5 pairs
  spaced 48 px: Size, Year, Players, Rating, Region.
- Tabs at y 664, 22 px, underline on focus: Overview / Media / Details. Overview: description 20 px, line
  height 1.5, max width 1100 px, clamp 4 lines with "More" (A expands). Media: 16:9 thumbs 400x225, gap 16,
  horizontal. Details: two columns of label/value pairs. "More like this" always last on Overview: a cover
  row (variant C sizes).
- Focus on Download first; down moves to tabs, then into the tab body.

### 2. PlayStation hub style (left column over key art, media right)
- Backdrop: art full screen, darkened left to right (90 % at x 0 to 20 % at x 1200).
- Left column x 60-760: platform 15 px caps muted; title 52 px bold, max 2 lines; meta line 18 px muted
  "1985 · Adventure, Platform · ★ 84"; 24 px gap; buttons: Download 320x60 primary plus 60x60 round "..."
  (favourite, open in RomM, delete); below, 3 facts in one row (Size, Players, Region). Description 18 px,
  clamp 3 lines at y ~520.
- Right column x 820-1860, y 120-560: media carousel, one large 16:9 slide 900x506 with 6 small dots/thumbs
  under it; focusing it and pressing A opens full screen.
- Below the fold (scroll at y 640): "Details" grid (label/value, 3 columns of 300 px), then "More like this"
  cover row.

### 3. Xbox style (hero title + horizontal buttons + stacked sections)
- Hero y 56-596 (540 px): art full width, gradient bottom. Title 64 px bold at x 60, bottom y 470, then
  publisher · year · genre 18 px muted, then a button row at y 510: Download 260x56, Favourite 56x56,
  "..." 56x56, gap 12, all left-aligned.
- Then a vertical stack, each with a 28 px section heading and 48 px between sections:
  Screenshots (16:9 380x214 row, gap 16), About (20 px, max width 1100, 5 lines then "More"),
  Details (icon + label chips 220x72 in a wrapping grid: size, players, region, modes, series, developer),
  Similar games (cover row).
- D-pad down scrolls section by section; the hero shrinks to keep the title visible (sticky 96 px band
  with title 28 px and the Download button) once past it.

Recommendation: variant 1 or 3; both put one large action under recognisable art and push the facts into a
compact strip, which fixes the empty half-table.

## C. Card caption variants (portrait cover 2:3)

Common: cover 144x216 (or 128x192 / 160x240), radius 4 px, gap 16 px between cards, focus = scale 1.06 with
2 px light outline and shadow, transition 120 ms. Title 16 px/20 px line height, meta 13 px/16 px muted.

### C1. One-line title, size as a badge
- Caption box fixed 28 px: 8 px top padding + one 20 px line, ellipsis.
- Size moves onto the cover: bottom-right pill, 12 px semibold, padding 2x6, rgba(0,0,0,.7), 6 px inset.
  Show it only when relevant (very large, or a store-wide "size" sort), or always if size matters to users.
- Row height = cover + 28 (216 + 28 = 244). Full title appears on focus in a tooltip or the row's heading
  line ("Kingdom Hearts - 358/2 Days · 256 MB").

### C2. No caption at rest, focus caption (TV style)
- Fixed 48 px area under every card: 8 px gap + title line 20 px + meta line 16 px + 4 px.
- At rest empty; on focus the focused card fills it (title 1 line ellipsis, meta "SNES · 1990 · 512 KB").
  Space is reserved so nothing shifts. Row height = 216 + 48 = 264.
- Alternative: one shared caption line above or below the whole row instead of per card.

### C3. Fixed two-line title, status pill on the cover
- Caption box fixed 48 px: 8 px padding + two 20 px lines, `-webkit-line-clamp: 2`, top-aligned.
  One-line titles leave space below only (bottom of the row), which reads as normal.
- Size and status (Installed / Downloading 42 %) as a pill on the cover's bottom-left; installed games get a
  small check icon instead of the size.
- Row height = 216 + 48 = 264.

Recommendation: C1 for dense rows (Recently added, by console), C2 for the home hero rows.

## D. Platform tiles and console library

### Platform/category strip
- Steam store's category tiles and PS/Xbox "browse by genre" tiles are image tiles with the label inside the
  tile, not under it. For 1:1 tiles: 180x180, radius 6, gap 16; background a theme surface (Steam blue-grey
  #23262e to #2a475e gradient), the console logo or hardware photo centred at 60 % width, name 16 px semibold
  bottom-left inside the tile with 12 px inset, game count 13 px muted under it. Focus: same scale/outline
  as covers. Avoid per-brand colours unless they are muted tints of the Steam palette.

### Console library page
- Header y 56-236 (180 px): console hero or blurred montage of covers, platform logo or name 44 px at x 60,
  then "128 games · 14.2 GB" 18 px muted; right side Sort (A-Z, recently added, size) and Filter buttons
  48 px high.
- Grid: covers 160x240 (2:3), gap 24 horizontal / 32 vertical, 9 columns at 1800 px usable width
  (9x160 + 8x24 = 1632; or 10 columns at 144x216, gap 20). Captions per C1 or C2. Grid scrolls with focus
  kept 1 row from the top/bottom edge; jump to letter with LT/RT optional.
- Steam's own collection pages: name, game count, sort dropdown in the header; capsule-only grid with
  labels on focus.
