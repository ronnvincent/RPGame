import urllib.request
import re

def fetch_oga(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        return ""

urls = [
    "https://opengameart.org/content/spell-animation-spritesheets",
    "https://opengameart.org/content/pixel-art-spells",
    "https://opengameart.org/content/holy-magic-effect",
    "https://opengameart.org/content/light-magic-effect"
]

for url in urls:
    html = fetch_oga(url)
    matches = re.findall(r'href="(https://opengameart\.org/sites/default/files/[^"]+\.zip)"', html)
    print(f"URL: {url}\nFound: {matches}\n")
