"""The RomM library as the panel shows it: platforms and games, each game with its status on this device."""
import time
from dataclasses import dataclass, field

from .romm import RommClient
from .sgdb import KINDS as ART_KINDS


def _score(value) -> int | None:
    """RomM passes IGDB's 0-100 ratings through as strings."""
    try:
        n = round(float(value))
    except (TypeError, ValueError):
        return None
    return n if 0 < n <= 100 else None


@dataclass
class Game:
    rom_id: int
    name: str
    platform_id: int
    platform: str
    slug: str          # RomM filesystem slug, e.g. "ngc"
    fs_name: str       # file name, or folder name for multi-file games
    single_file: bool
    size_bytes: int
    cover: str
    cover_large: str = ""
    regions: list[str] = field(default_factory=list)
    added_at: str = ""
    release_year: int | None = None
    genres: list[str] = field(default_factory=list)
    rating: float | None = None
    sgdb_id: int | None = None
    raw: dict = field(default_factory=dict, repr=False)

    @classmethod
    def from_rom(cls, rom: dict, client: RommClient) -> "Game":
        cover = rom.get("path_cover_small") or rom.get("url_cover") or ""
        large = rom.get("path_cover_large") or rom.get("url_cover") or ""
        meta = rom.get("metadatum") or {}
        released = meta.get("first_release_date")
        return cls(
            rom_id=rom["id"],
            name=rom.get("name") or rom.get("fs_name_no_tags") or rom["fs_name"],
            platform_id=rom["platform_id"],
            platform=rom.get("platform_display_name") or rom["platform_slug"],
            slug=rom.get("platform_fs_slug") or rom["platform_slug"],
            fs_name=rom["fs_name"],
            single_file=bool(rom.get("has_simple_single_file")),
            size_bytes=rom.get("fs_size_bytes", 0),
            cover=client.url(cover) if cover else "",
            cover_large=client.url(large) if large else "",
            regions=list(rom.get("regions") or []),
            added_at=rom.get("created_at", ""),
            release_year=time.gmtime(released / 1000).tm_year if isinstance(released, (int, float)) and released > 0 else None,
            genres=list(meta.get("genres") or [])[:3],
            rating=round(meta["average_rating"]) if isinstance(meta.get("average_rating"), (int, float)) else None,
            sgdb_id=rom["sgdb_id"] if isinstance(rom.get("sgdb_id"), int) and rom["sgdb_id"] > 0 else None,
            raw=rom,
        )

    def details(self, client: RommClient) -> dict:
        """The long fields the storefront shows for one game at a time (kept out of the snapshot)."""
        r, meta = self.raw, self.raw.get("metadatum") or {}
        igdb = r.get("igdb_metadata") or {}
        hltb = r.get("hltb_metadata") or {}
        released = meta.get("first_release_date")
        video = r.get("path_video") or ""
        return {
            "rom_id": self.rom_id,
            "summary": r.get("summary") or "",
            "screenshots": [client.url(u) for u in (r.get("merged_screenshots") or [])[:24]],
            "youtube_video_id": r.get("youtube_video_id") or "",
            "video": client.url(video) if video else "",
            "developers": list(meta.get("developers") or meta.get("companies") or [])[:3],
            "publishers": list(meta.get("publishers") or [])[:2],
            "game_modes": list(meta.get("game_modes") or []),
            "player_count": meta.get("player_count") or "",
            "franchises": list(meta.get("franchises") or []),
            "fs_name": self.fs_name,
            "released": time.strftime("%Y-%m-%d", time.gmtime(released / 1000)) if isinstance(released, (int, float)) and released > 0 else "",
            "genres": list(meta.get("genres") or []),
            "themes": [t for t in (igdb.get("themes") or []) if isinstance(t, str)],
            "perspectives": [t for t in (igdb.get("player_perspectives") or []) if isinstance(t, str)],
            "user_score": _score(igdb.get("total_rating")),
            "user_score_count": igdb.get("total_rating_count") if isinstance(igdb.get("total_rating_count"), int) else 0,
            "critic_score": _score(igdb.get("aggregated_rating")),
            "age_ratings": [{"rating": str(a.get("rating") or ""), "category": str(a.get("category") or ""), "cover": a.get("rating_cover_url") or ""}
                            for a in (igdb.get("age_ratings") or []) if isinstance(a, dict)][:4],
            "hltb": {k: hltb[k] for k in ("main_story", "main_plus_extra", "completionist") if isinstance(hltb.get(k), int) and hltb[k] > 0},
            "achievements": len(((r.get("merged_ra_metadata") or {}).get("achievements")) or []),
            "last_played": ((r.get("rom_user") or {}).get("last_played")) or "",
        }

class Library:
    def __init__(self):
        self.platforms: list[dict] = []
        self.games: dict[int, Game] = {}
        self.recommended: list[dict] = []
        self.loaded_at = 0.0
        self.loading = False
        self.error = ""

    async def refresh(self, client: RommClient) -> None:
        self.loading = True
        try:
            platforms, roms = await client.platforms(), await client.roms()
            self.platforms = sorted(
                ({"id": p["id"], "name": p.get("display_name") or p["name"], "slug": p["fs_slug"], "rom_count": p["rom_count"],
                  "logo": p.get("url_logo") or ""}
                 for p in platforms if p.get("rom_count")),
                key=lambda p: p["name"].lower(),
            )
            self.games = {r["id"]: Game.from_rom(r, client) for r in roms}
            self.error = ""
            self.loaded_at = time.time()
            try:
                self.recommended = self.pick_recommendations(await client.recommendations())
            except Exception:
                self.recommended = []  # an optional feed: the storefront just hides the row
        except Exception as e:
            self.error = str(e)
        finally:
            self.loading = False

    def pick_recommendations(self, feed: list[dict]) -> list[dict]:
        """RomM's feed reduced to what the storefront shows: the game (if we list it), why, and the seed game."""
        out = []
        for r in feed:
            rom_id = (r.get("rom") or {}).get("id")
            if rom_id not in self.games:
                continue
            out.append({
                "rom_id": rom_id,
                "score": r.get("score", 0),
                "reasons": [f"{x.get('facet', '')}: {x.get('value', '')}".strip(": ") for x in (r.get("reasons") or [])[:3]],
                "seed_rom_id": r.get("seed_rom_id"),
                "seed_rom_name": r.get("seed_rom_name") or "",
            })
        return out

    def snapshot(self, status_of, art_of=None) -> dict:
        games = []
        for g in sorted(self.games.values(), key=lambda g: (g.platform.lower(), g.name.lower())):
            status = status_of(g.rom_id)
            games.append({
                "rom_id": g.rom_id, "name": g.name, "platform_id": g.platform_id, "platform": g.platform,
                "slug": g.slug, "size_bytes": g.size_bytes, "cover": g.cover, "cover_large": g.cover_large,
                "regions": g.regions, "added_at": g.added_at, "release_year": g.release_year, "genres": g.genres,
                "rating": g.rating, "multi": not g.single_file, "status": status, "sgdb_id": g.sgdb_id,
                "art": art_of(g) if art_of else dict.fromkeys(ART_KINDS, ""),
            })
        return {"platforms": self.platforms, "games": games, "recommended": self.recommended,
                "loaded_at": self.loaded_at, "loading": self.loading, "error": self.error}
