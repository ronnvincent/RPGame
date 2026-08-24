"""Bulk sprite pack fetcher - follows the download_aaa.py pattern.

Sources are OpenGameArt CC0/CC-BY packs only. Each entry records its license
line so the output doubles as input for CREDITS.md and the asset-license
manifest. A failed URL never aborts the batch; the summary at the end lists
what landed so broken links can be swapped out.
"""

import urllib.request
import os

PACKS = {
    # filename: (url, license)
    "pixelart_spells.zip": (
        "https://opengameart.org/sites/default/files/pixelart_spells_1.zip",
        "CC0",
    ),
    "spell_animations.zip": (
        "https://opengameart.org/sites/default/files/spell_animations.zip",
        "CC-BY 3.0",
    ),
    "light_effects.zip": (
        "https://opengameart.org/sites/default/files/LightEffects.zip",
        "CC-BY 3.0",
    ),
    "monsters_sideview.zip": (
        "https://opengameart.org/sites/default/files/Monsters_Sideview.zip",
        "CC0",
    ),
    "creature_pack.zip": (
        "https://opengameart.org/sites/default/files/creature_pack_0.zip",
        "CC0",
    ),
    "parallax_mountains.zip": (
        "https://opengameart.org/sites/default/files/parallax_mountains_by_ez.png_.zip",
        "CC-BY 3.0",
    ),
}

OUT_DIR = os.path.join("assets", "_incoming")
os.makedirs(OUT_DIR, exist_ok=True)

results = []
for filename, (url, license_line) in PACKS.items():
    dest = os.path.join(OUT_DIR, filename)
    print(f"Downloading {filename} ({license_line})...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as response, open(dest, "wb") as out_file:
            out_file.write(response.read())
        size_kb = os.path.getsize(dest) // 1024
        results.append((filename, "OK", f"{size_kb} KB", license_line))
    except Exception as exc:  # noqa: BLE001 - report and continue
        results.append((filename, "FAILED", str(exc)[:80], license_line))

print("\n=== SUMMARY ===")
for row in results:
    print(f"{row[1]:8} {row[0]:28} {row[2]} [{row[3]}]")
