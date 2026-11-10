# ChickenTender

A small Decky Loader plugin that brings games from a [RomM](https://romm.app) server to a Steam Deck.

Browse your RomM library inside Steam's Big Picture UI, press a game to download it into RetroDECK's ROM
folder, and (soon) play it from your Steam library. RomM stays the library; the plugin only knows how to
pair, list, download and launch.

## Setup

1. Open the Quick Access panel, enter the RomM address and press **Connect** (RomM 5.4.1 or newer).
2. Press **Pair this Deck**: a short code appears. Open `<your RomM>/pair/device` in any browser where you are
   signed in, enter the code and approve. No password is ever typed on the Deck.
3. Press **Browse games**. Pick a platform, pick a game, confirm the download. Progress shows on the card and in
   the panel; downloads resume if interrupted.

## Development

```sh
pnpm install
pnpm run build          # dist/index.js (Vite)
pnpm run typecheck
npx decky-toolkit dev   # deploy to a paired Deck and live-sync changes
```

See [docs/design.md](docs/design.md) for the architecture and roadmap, [docs/romm-api.md](docs/romm-api.md) for the
RomM endpoints used.
