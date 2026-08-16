import urllib.request
import re

url = "https://opengameart.org/content/free-pixel-effects-pack"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        
    matches = re.findall(r'href="(https://opengameart\.org/sites/default/files/[^"]+\.zip)"', html)
    if matches:
        zip_url = matches[0]
        print(f"Found zip: {zip_url}")
        
        # Download the zip
        print("Downloading...")
        zip_req = urllib.request.Request(zip_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(zip_req) as zip_res, open("codemanu_vfx.zip", "wb") as out_file:
            out_file.write(zip_res.read())
        print("Download complete.")
    else:
        print("No zip found.")
except Exception as e:
    print(f"Error: {e}")
