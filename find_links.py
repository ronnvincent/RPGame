import urllib.request
import re

urls = [
    "https://opengameart.org/content/cosmic-time-magic-effect",
    "https://opengameart.org/content/fire-wrath-magic-effect",
    "https://opengameart.org/content/earth-impact-magic-effect",
    "https://opengameart.org/content/light-magic-effect",
    "https://opengameart.org/content/5x-special-effects-2d"
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
