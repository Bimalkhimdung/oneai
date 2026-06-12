import urllib.request
import re
import json

req = urllib.request.Request("https://ollama.com/search?q=deepseek", headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')

# parse blocks
blocks = re.findall(r'<a href="/library/([^"]+)".*?<span x-test-search-response-title>([^<]+)</span>.*?<p[^>]*>([^<]+)</p>', html, re.DOTALL)
res = []
for block in blocks:
    res.append({"id": block[0], "name": block[1], "description": block[2].strip()})
print(json.dumps(res, indent=2))
