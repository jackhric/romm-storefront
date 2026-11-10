"""Makes a console logo readable on a dark surface while keeping its colours: blacks and dark greys become white,
dark saturated colours are lightened, everything else is left alone."""
import colorsys, re, sys

def fix(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    if s < 0.25:                      # black, greys
        if l < 0.45: return (255, 255, 255)
        if l < 0.7: return (214, 217, 220)
        return (r, g, b)
    if l < 0.45:                      # dark but coloured: keep the hue, lift it
        r2, g2, b2 = colorsys.hls_to_rgb(h, 0.58, min(1.0, s))
        return (round(r2 * 255), round(g2 * 255), round(b2 * 255))
    return (r, g, b)

def hexrep(m):
    if m.group(1): return m.group(0)                     # url(#id) / href="#id"
    v = m.group(2)
    if len(v) == 3: v = "".join(c * 2 for c in v)
    r, g, b = (int(v[i:i + 2], 16) for i in (0, 2, 4))
    return "#%02x%02x%02x" % fix(r, g, b)

def recolor(svg):
    svg = re.sub(r'(url\(|href=")?#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b', hexrep, svg)
    svg = re.sub(r'(fill|stroke|stop-color)(\s*[:=]\s*"?)black\b', r'\1\2#ffffff', svg)
    svg = re.sub(r'rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)', lambda m: "#%02x%02x%02x" % fix(*map(int, m.groups())), svg)
    # Shapes with no fill of their own are black by default: make the default white.
    def root(m):
        tag = m.group(0)
        return tag if re.search(r'\sfill\s*=', tag) else tag[:-1] + ' fill="#ffffff">'
    return re.sub(r'<svg\b[^>]*>', root, svg, count=1)

if __name__ == "__main__":
    open(sys.argv[2], "w").write(recolor(open(sys.argv[1], encoding="utf-8", errors="replace").read()))
