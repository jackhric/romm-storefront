// Console logos from Wikimedia Commons (assets/consoles, one SVG per RomM platform slug), inlined into the bundle.
// They keep their own colours; scripts/recolor-console-logo.py turned the blacks white so they read on dark surfaces.
const files = import.meta.glob<string>("../../assets/consoles/*.svg", { eager: true, query: "?inline", import: "default" });

const bySlug = new Map(Object.entries(files).map(([path, src]) => [path.slice(path.lastIndexOf("/") + 1, -4), src]));

// RomM platform slugs that share a logo file.
const ALIASES: Record<string, string> = {
  gc: "ngc", gamecube: "ngc", ps: "psx", ps1: "psx", playstation: "psx", megadrive: "genesis", "genesis-slash-megadrive": "genesis",
  sfc: "sfam", fds: "famicom", "nintendo-switch": "switch", n3ds: "3ds", dreamcast: "dc", mastersystem: "sms", "sega-cd": "segacd", sega32x: "sega32",
  vita: "psvita", "xbox-one": "xboxone", "series-x": "series-x-s", neogeo: "neogeoaes", neogeomvs: "neogeoaes", "turbografx16--1": "tg16", pc: "dos",
};

/** The logo of a console by RomM slug, as a data URL, or "" when there is none. */
export function consoleLogo(slug: string): string {
  const key = slug.toLowerCase();
  return bySlug.get(key) ?? bySlug.get(ALIASES[key] ?? "") ?? "";
}
