import urllib.request
import re

urls = [
    "https://opengameart.org/content/blood-magic-effect",
    "https://opengameart.org/content/nature-magic-effect",
    "https://opengameart.org/content/pure-projectile-magic-effect",
    "https://opengameart.org/content/thunder-magic-effect",
    "https://opengameart.org/content/ice-magic-effect",
    "https://opengameart.org/content/water-magic-effect"
]

for url in urls:
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            html = response.read().decode('utf-8')
            matches = re.findall(r'href="(https://opengameart\.org/sites/default/files/[^"]+\.(?:zip|rar))"', html)
            print(f"URL: {url}\nFound: {matches}\n")
    except Exception as e:
        print(f"Error on {url}: {e}")
