import urllib.request
import os

files = {
    "cosmic.zip": "https://opengameart.org/sites/default/files/Cosmic%20Time%20-%20Magic%20Effect.zip",
    "fire.zip": "https://opengameart.org/sites/default/files/Fire%20Wrath%20-%20Magic%20Effect.zip",
    "earth.zip": "https://opengameart.org/sites/default/files/Earth%20Impact%20-%20Magic%20Effect.zip",
    "light.zip": "https://opengameart.org/sites/default/files/LightEffects.zip",
    "special2d.zip": "https://opengameart.org/sites/default/files/2d-special-effects.zip"
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
