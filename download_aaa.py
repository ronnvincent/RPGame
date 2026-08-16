import urllib.request
import os

files = {
    "pixelart_spells.zip": "https://opengameart.org/sites/default/files/pixelart_spells_1.zip",
    "spell_animations.zip": "https://opengameart.org/sites/default/files/spell_animations.zip",
    "light_effects.zip": "https://opengameart.org/sites/default/files/LightEffects.zip"
}

for filename, url in files.items():
    print(f"Downloading {filename}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response, open(filename, 'wb') as out_file:
            out_file.write(response.read())
        print(f"Success: {filename}")
    except Exception as e:
        print(f"Failed to download {filename}: {e}")
