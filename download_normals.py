import urllib.request
import os

files = {
    "blood.zip": "https://opengameart.org/sites/default/files/Blood%20-%20Magic%20Effect.zip",
    "nature.zip": "https://opengameart.org/sites/default/files/Nature%20Magic%20Effect.zip",
    "projectile.zip": "https://opengameart.org/sites/default/files/Pure%20Projectile%20Effect.zip",
    "water.zip": "https://opengameart.org/sites/default/files/Water_Effect.zip"
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
