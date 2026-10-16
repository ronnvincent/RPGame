"""Tournament Arena Map Pack Fetcher.

Downloads high-quality, open-source (CC0 / CC-BY) layered parallax battleground
and arena maps with proper flat grounding surfaces for Action RPG PvP combat.
"""

import os
import urllib.request
import zipfile

ARENA_PACKS = {
    "desert_arena_parallax.zip": (
        "https://opengameart.org/sites/default/files/multilayer_scroll_backgrounds_-_desert_mountains.zip",
        "CC-BY 4.0 (Vircon32 / Carra)",
        "Desert Colosseum / Canyon Arena with 4 seamless parallax layers & solid ground"
    ),
    "tropical_arena_parallax.zip": (
        "https://opengameart.org/sites/default/files/multilayer_scroll_backgrounds_-_tropical_mountains.zip",
        "CC-BY 4.0 (Vircon32 / Carra)",
        "Verdant Mountain Arena with 4 layered PNGs & flat fighting ground"
    ),
}

OUT_DIR = os.path.join("assets", "_incoming")
EXTRACT_BASE = os.path.join("public", "assets", "maps", "tournament_packs")
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(EXTRACT_BASE, exist_ok=True)

results = []
print("=== DOWNLOADING TOURNAMENT ARENA PARALLAX PACKS ===")
for filename, (url, license_line, desc) in ARENA_PACKS.items():
    dest = os.path.join(OUT_DIR, filename)
    print(f"\nDownloading {filename}...")
    print(f"  Description: {desc}")
    print(f"  License:     {license_line}")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        with urllib.request.urlopen(req, timeout=60) as response, open(dest, "wb") as out_file:
            out_file.write(response.read())
        size_kb = os.path.getsize(dest) // 1024
        print(f"  Saved: {dest} ({size_kb} KB)")

        # Auto extract
        pack_name = filename.replace(".zip", "")
        extract_to = os.path.join(EXTRACT_BASE, pack_name)
        os.makedirs(extract_to, exist_ok=True)
        with zipfile.ZipFile(dest, "r") as z:
            z.extractall(extract_to)
        print(f"  Extracted to: {extract_to}")
        results.append((filename, "OK", f"{size_kb} KB", license_line))
    except Exception as exc:
        print(f"  FAILED: {exc}")
        results.append((filename, "FAILED", str(exc)[:60], license_line))

print("\n=== SUMMARY ===")
for row in results:
    print(f"{row[1]:8} {row[0]:30} {row[2]} [{row[3]}]")
