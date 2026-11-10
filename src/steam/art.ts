// Fills a ROM shortcut's missing artwork through Steam's own custom-artwork call: its cover on a blurred copy of
// itself, or a gradient coloured from its name when it has no cover (Steam draws the title over both). Only empty
// slots are filled, and the undo clears exactly those.
import { client, overview as overviewOf } from "./core/steam";
import { LogoPosition, logoPositionStore } from "./downloads/internals";
import { tweak, warnOnce } from "./core/tweak";

// SetCustomArtworkForApp asset types and the grid file suffix Steam stores each under. The Downloads page shows
// the wide one; the hero is for the game's own page. The icon is not artwork but a file path in shortcuts.vdf, set by
// shortcuts.ts when the shortcut is created (iconPng below draws it).
const HERO = 1;
const WIDE = 3;
const SLOTS = [
  { type: HERO, suffix: "_hero", w: 1920, h: 620 },
  { type: WIDE, suffix: "", w: 920, h: 430 },
] as const;

type Apps = {
  SetCustomArtworkForApp(appid: number, base64: string, format: string, type: number): unknown;
  ClearCustomArtworkForApp(appid: number, type: number): unknown;
};

function apps(): Apps | undefined {
  const a = client("Apps");
  return typeof a?.SetCustomArtworkForApp === "function" && typeof a?.ClearCustomArtworkForApp === "function" ? a : undefined;
}

async function firstFound(base: string): Promise<string | undefined> {
  for (const ext of ["png", "jpg"]) {
    try {
      const url = `/customimages/${base}.${ext}?t=${Date.now()}`;
      if ((await fetch(url)).ok) return url;
    } catch {
      // not there
    }
  }
  return undefined;
}

function loadImage(src: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = src;
  });
}

const hue = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
}

function draw(slot: (typeof SLOTS)[number], name: string, art: HTMLImageElement | undefined): string {
  const { w, h, type } = slot;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  if (art) {
    ctx.filter = "blur(32px) brightness(0.5) saturate(1.2)";
    cover(ctx, art, -64, -64, w + 128, h + 128);
    ctx.filter = "none";
    // The Downloads banner crops the wide art's top ~22%, so the cover sits low enough to stay whole there.
    const ch = h * (type === WIDE ? 0.72 : 0.84);
    const cw = (art.width / art.height) * ch;
    const cy = type === WIDE ? h * 0.25 : (h - ch) / 2;
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 24;
    ctx.drawImage(art, w / 2 - cw / 2, cy, cw, ch);
  } else {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, `hsl(${hue(name)} 45% 32%)`);
    g.addColorStop(1, `hsl(${(hue(name) + 40) % 360} 50% 14%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  return c.toDataURL("image/png").split(",")[1];
}

const ICON = 256;

/** A square shortcut icon, like a Steam game's: the cover on a blurred copy of itself, or a lettered gradient. */
export async function iconPng(name: string, art: { base64: string; format: string }): Promise<string> {
  const img = art.base64 ? await loadImage(`data:image/${art.format === "jpg" ? "jpeg" : art.format};base64,${art.base64}`) : undefined;
  const c = document.createElement("canvas");
  c.width = c.height = ICON;
  const ctx = c.getContext("2d")!;
  if (img) {
    ctx.filter = "blur(12px) brightness(0.55)";
    cover(ctx, img, -16, -16, ICON + 32, ICON + 32);
    ctx.filter = "none";
    const s = Math.min(ICON / img.width, ICON / img.height);
    ctx.drawImage(img, (ICON - img.width * s) / 2, (ICON - img.height * s) / 2, img.width * s, img.height * s);
  } else {
    const g = ctx.createLinearGradient(0, 0, ICON, ICON);
    g.addColorStop(0, `hsl(${hue(name)} 45% 32%)`);
    g.addColorStop(1, `hsl(${(hue(name) + 40) % 360} 50% 14%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ICON, ICON);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `bold ${ICON / 2}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((name.trim()[0] ?? "?").toUpperCase(), ICON / 2, ICON / 2);
  }
  return c.toDataURL("image/png").split(",")[1];
}

const filled = new Map<number, () => void>();

/** Gives the shortcut hero and wide art where it has none. Safe to call on every update. */
export function ensureArt(appid: number, name: string) {
  if (filled.has(appid)) return;
  const undo = tweak(`art ${appid}`, (track) => {
    const a = apps();
    if (!a) return;
    const set: number[] = [];
    let cancelled = false;
    track(() => {
      cancelled = true;
      filled.delete(appid);
      for (const t of set) a.ClearCustomArtworkForApp(appid, t);
    });
    (async () => {
      const capsule = await firstFound(`${appid}p`);
      const img = capsule ? await loadImage(capsule) : undefined;
      for (const slot of SLOTS) {
        if (cancelled || (await firstFound(`${appid}${slot.suffix}`))) continue;
        await a.SetCustomArtworkForApp(appid, draw(slot, name, img), "png", slot.type);
        if (cancelled) a.ClearCustomArtworkForApp(appid, slot.type);
        else set.push(slot.type);
      }
    })().catch((err) => warnOnce(`art ${appid}`, err));
  });
  filled.set(appid, undo);
}

// SetCustomArtworkForApp asset types of the SteamGridDB kinds: 600x900 capsule, hero, logo, 920x430 wide.
const SGDB_TYPES = { grid: 0, hero: 1, logo: 2, wide: 3 } as const;
export type SgdbKind = keyof typeof SGDB_TYPES;
export const SGDB_KINDS = Object.keys(SGDB_TYPES) as SgdbKind[];
const LOGO_POSITION: LogoPosition = { pinnedPosition: "BottomLeft", nWidthPct: 50, nHeightPct: 50 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Steam stores png and jpg; anything else (webp) is redrawn as png. */
async function steamFormat(img: { base64: string; format: string }): Promise<{ base64: string; format: string } | undefined> {
  if (img.format === "png" || img.format === "jpg") return img;
  const el = await loadImage(`data:image/${img.format || "png"};base64,${img.base64}`);
  if (!el) return undefined;
  const c = document.createElement("canvas");
  c.width = el.naturalWidth;
  c.height = el.naturalHeight;
  c.getContext("2d")!.drawImage(el, 0, 0);
  return { base64: c.toDataURL("image/png").split(",")[1], format: "png" };
}

/**
 * Sets SteamGridDB images as the shortcut's artwork (and a logo position, without which Steam draws no custom logo)
 * and resolves with the kinds Steam took. Like the RomM capsule, finished art stays after unload: it is the game's
 * art, not a patch. The undo clears whatever a set still in flight had already written.
 */
export function setSgdbArt(appid: number, images: Partial<Record<SgdbKind, { base64: string; format: string }>>): Promise<Set<SgdbKind>> {
  return new Promise((resolve) => {
    const done = new Set<SgdbKind>();
    let started = false;
    const undo = tweak(`sgdb art ${appid}`, (track) => {
      const a = apps();
      const kinds = SGDB_KINDS.filter((k) => images[k]?.base64);
      if (!a || !kinds.length) return;
      started = true;
      const logos = logoPositionStore();
      let cancelled = false;
      let complete = false;
      let positioned: { appid: number } | undefined;
      track(() => {
        cancelled = true;
        if (complete) return;
        for (const k of done) a.ClearCustomArtworkForApp(appid, SGDB_TYPES[k]);
        done.clear();
        if (positioned) void logos?.ClearCustomLogoPosition(positioned);
      });
      (async () => {
        for (const k of kinds) {
          const img = await steamFormat(images[k]!);
          if (cancelled) break;
          if (!img) continue;
          const type = SGDB_TYPES[k];
          // Clear resolves before Steam has dropped the old file, and a set right after it can be lost; the
          // SteamGridDB plugin waits the same. Clearing first also drops a file of the other format (Steam prefers .png).
          await a.ClearCustomArtworkForApp(appid, type);
          await sleep(500);
          if (cancelled) break;
          await a.SetCustomArtworkForApp(appid, img.base64, img.format, type);
          if (cancelled) {
            a.ClearCustomArtworkForApp(appid, type);
            break;
          }
          done.add(k);
        }
        const overview = overviewOf(appid);
        if (!cancelled && done.has("logo") && logos && overview) {
          await logos.SaveCustomLogoPosition(overview, LOGO_POSITION);
          if (cancelled) void logos.ClearCustomLogoPosition(overview);
          else positioned = overview;
        }
      })()
        .catch((err) => warnOnce(`sgdb art ${appid}`, err))
        .finally(() => {
          complete = true;
          resolve(done);
          undo();
        });
    });
    if (!started) resolve(done);
  });
}
