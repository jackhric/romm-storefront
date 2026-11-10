// The only file that knows the backend's method and event names.
import { addEventListener, callable, removeEventListener } from "@decky/api";

/** The install ledger's state for a game (py_modules/chickentender/ledger.py); "available" has no record. */
export type GameStatus = "available" | "queued" | "downloading" | "paused" | "incomplete" | "failed" | "installed";
/** Stopped short of installed: Resume continues it, Remove clears it. */
export const isStopped = (status: GameStatus) => status === "paused" || status === "incomplete" || status === "failed";
export const STOPPED_TEXT: Record<"paused" | "incomplete" | "failed", string> = { paused: "Paused", incomplete: "Partly downloaded", failed: "Download failed" };

export interface Game {
  rom_id: number;
  name: string;
  platform_id: number;
  platform: string;
  slug: string;
  size_bytes: number;
  cover: string;
  cover_large: string;
  regions: string[];
  /** ISO time the game was added to RomM. */
  added_at: string;
  release_year: number | null;
  genres: string[];
  /** 0-100, from RomM's metadata, or null. */
  rating: number | null;
  multi: boolean;
  status: GameStatus;
  sgdb_id: number | null;
  /** SteamGridDB CDN URLs, "" while unknown or when SteamGridDB has none; filled in by later state events. */
  art: GameArtUrls;
}

export type ArtKind = "grid" | "wide" | "hero" | "logo" | "icon";
export type GameArtUrls = Record<ArtKind, string>;
export interface GameArt extends GameArtUrls { rom_id: number; sgdb_id: number | null; ready: boolean }
/** One artwork file read by the backend (the webview cannot fetch the CDN cross-origin); base64 "" when there is none. */
export interface ArtBytes { base64: string; format: "png" | "jpg" | "webp" | "" }

/** The long fields of one game, fetched on demand. */
export interface GameDetails {
  rom_id: number;
  summary: string;
  screenshots: string[];
  youtube_video_id: string;
  developers: string[];
  publishers: string[];
  game_modes: string[];
  player_count: string;
  franchises: string[];
  fs_name: string;
  /** A video file RomM hosts for the game, or "". */
  video: string;
  /** ISO date (YYYY-MM-DD) or "". */
  released: string;
  genres: string[];
  themes: string[];
  perspectives: string[];
  /** IGDB's 0-100 scores, null when RomM has none. */
  user_score: number | null;
  user_score_count: number;
  critic_score: number | null;
  age_ratings: { rating: string; category: string; cover: string }[];
  hltb: { main_story?: number; main_plus_extra?: number; completionist?: number };
  /** Number of RetroAchievements. */
  achievements: number;
  last_played: string;
}

export interface Platform { id: number; name: string; slug: string; rom_count: number; /** IGDB platform logo URL, or "" */ logo: string }

/** One entry of RomM's personalised feed (or of "similar games"), for a game that is in the library. */
export interface Recommendation {
  rom_id: number;
  score: number;
  /** Human-readable reasons such as "genre: Platform" or "franchise: Zelda". */
  reasons: string[];
  seed_rom_id?: number | null;
  /** The played game this recommendation stems from, when RomM says so. */
  seed_rom_name?: string;
}

export interface Progress {
  rom_id: number;
  appid: number;
  done_bytes: number;
  total_bytes: number;
  bps: number;
  status: "queued" | "downloading" | "done" | "failed" | "cancelled";
  error: string;
}

/** One download as Steam's Downloads page sees it (src/steam/inject.ts OurDownload plus the game). */
export interface DownloadItem {
  appid: number;
  rom_id: number;
  name: string;
  bytes_total: number;
  bytes_done: number;
  rate: number;
  eta: number;
  state: "downloading" | "paused" | "queued" | "done";
  queue_index: number;
  completed_at: number;
  started_at: number;
}

export type SgdbSigninStage = "" | "opening" | "login" | "consent" | "reading" | "verifying" | "done" | "failed";
/** "Sign in with Steam": the backend follows Steam's browser to SteamGridDB; `error` is set on "failed". */
export interface SgdbSignin { active: boolean; stage: SgdbSigninStage; error: string }

/** A finished game that has a Steam shortcut, as Steam's storage pages need it. */
export interface InstalledGame { rom_id: number; appid: number; name: string; path: string; folder: string; bytes: number; device: number }

/** One record of the install ledger, held against the disk. */
export interface Install {
  rom_id: number;
  name: string;
  state: Exclude<GameStatus, "available">;
  /** The Steam shortcut the backend has on record, 0 for none. */
  appid: number;
  bytes_done: number;
  bytes_total: number;
  /** Listed files that are absent or short. */
  missing: string[];
  error: string;
  queued_at: number;
  updated_at: number;
  completed_at: number;
}

export interface State {
  server: { url: string; version: string; error: string };
  pairing: { status: "idle" | "waiting" | "approved" | "expired" | "denied" | "error"; user_code?: string; verification_url?: string; expires_at?: number; error?: string };
  account: { paired: boolean; username: string; device_id: string; device_name: string };
  library: { platforms: Platform[]; games: Game[]; recommended: Recommendation[]; loaded_at: number; loading: boolean; error: string };
  downloads: { active: Progress | null; queue: number[]; items: DownloadItem[]; roms_dir: string };
  installs: Install[];
  installed: InstalledGame[];
  roms_dir_exists: boolean;
  retrodeck: { installed: boolean; initialised: boolean; version: string; roms_path: string };
  sgdb: { configured: boolean; error: string; art_ready: number; art_total: number; signin: SgdbSignin };
  version: string;
}

export const getState = callable<[], State>("get_state");
export const setServer = callable<[url: string], State>("set_server");
export const startPairing = callable<[], State>("start_pairing");
export const cancelPairing = callable<[], State>("cancel_pairing");
export const disconnect = callable<[], State>("disconnect");
export const refreshLibrary = callable<[], State>("refresh_library");
export const gameDetails = callable<[rom_id: number], GameDetails>("game_details");
export const similarGames = callable<[rom_id: number], Recommendation[]>("similar_games");
export const cancelDownload = callable<[rom_id: number], State>("cancel_download");
export const downloadControl = callable<[action: string, appid: number, value: number], State>("download_control");
export const launchTarget = callable<[rom_id: number], LaunchTarget>("launch_target");
export const coverBase64 = callable<[rom_id: number], { base64: string; format: string }>("cover_base64");
/** Writes a shortcut icon (base64 PNG) to the plugin's runtime dir and returns its path. */
export const saveIcon = callable<[rom_id: number, base64: string], string>("save_icon");
/** An invalid key leaves `sgdb.configured` false with `sgdb.error` set; it does not throw. */
export const setSgdbKey = callable<[key: string], State>("set_sgdb_key");
export const clearSgdbKey = callable<[], State>("clear_sgdb_key");
/** Follows the SteamGridDB page opened in Steam's browser (SGDB_HOME) until the key is saved or it fails. */
export const startSgdbSignin = callable<[], State>("start_sgdb_signin");
export const cancelSgdbSignin = callable<[], State>("cancel_sgdb_signin");
/** The home page, not the API preferences, so the key is never drawn on screen. */
export const SGDB_HOME = "https://www.steamgriddb.com/";
/** Fetches the game's SteamGridDB art now when it is not cached yet. */
export const gameArt = callable<[rom_id: number], GameArt>("game_art");
export const artBase64 = callable<[rom_id: number, kind: ArtKind], ArtBytes>("art_base64");
export const setShortcut = callable<[rom_id: number, appid: number], State>("set_shortcut");
/** Fetches RomM's file list for the game again and checks the disk against it. */
export const verifyGame = callable<[rom_id: number], State>("verify");
export const removeGame = callable<[rom_id: number], State & { removed: number }>("remove");
const backendDownload = callable<[rom_id: number, appid: number], State>("download");

export interface LaunchTarget { rom_id: number; name: string; appid: number; exe: string; start_dir: string; launch_options: string; cover: string; installed: boolean }

/** Steam-side preparation of a download (the shortcut), installed by index.tsx; without it downloads still work. */
let prepare: (rom_id: number) => Promise<number> = async () => 0;
export function setDownloadPreparation(fn: (rom_id: number) => Promise<number>) {
  prepare = fn;
}

/** Queues a download; creates the Steam shortcut first when Steam allows it. */
export async function download(rom_id: number): Promise<State> {
  let appid = 0;
  try {
    appid = await prepare(rom_id);
  } catch {
    appid = 0;
  }
  return backendDownload(rom_id, appid);
}
/** Direct stream addresses for the game's trailer at about 360p and 720p (both silent) and its sound; "" when not resolved. */
export const gameVideo = callable<[rom_id: number], { rom_id: number; small: string; large: string; audio: string }>("game_video");
export const setRomsDir = callable<[path: string], State>("set_roms_dir");

const STATE_EVENT = "chickentender_state";
const PROGRESS_EVENT = "chickentender_progress";

export function onState(listener: (state: State) => void): () => void {
  addEventListener<[State]>(STATE_EVENT, listener);
  return () => removeEventListener(STATE_EVENT, listener);
}

export function onProgress(listener: (p: Progress) => void): () => void {
  addEventListener<[Progress]>(PROGRESS_EVENT, listener);
  return () => removeEventListener(PROGRESS_EVENT, listener);
}

export const STORE_ROUTE = "/chickentender";
export const GAME_ROUTE = "/chickentender/game/:rom_id";
/** The route of one game's detail page. */
export const gameRoute = (rom_id: number) => `/chickentender/game/${rom_id}`;
export const CONSOLE_ROUTE = "/chickentender/console/:platform_id";
/** The route of one console's library page. */
export const consoleRoute = (platform_id: number) => `/chickentender/console/${platform_id}`;
