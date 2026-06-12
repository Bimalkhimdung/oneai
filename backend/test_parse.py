import urllib.request
import re
import json

req = urllib.request.Request("https://ollama.com/search?q=deepseek", headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')

# parse blocks. Each li has class="flex items-baseline ...".
# Inside we have <span x-test-search-response-title>, <p>, and maybe <span> tags with parameters/capabilities.
blocks = re.findall(r'<li x-test-model.*?<a href="/library/([^"]+)".*?<span x-test-search-response-title>([^<]+)</span>.*?<p[^>]*>([^<]+)</p>(.*?)</li>', html, re.DOTALL)
res = []
for block in blocks:
    id_str = block[0].strip()
    name = block[1].strip()
    desc = block[2].strip()
    rest = block[3]
    
    # Extract tags
    tags = re.findall(r'<span[^>]*class="[^"]*text-[^"]*"[^>]*>([^<]+)</span>', rest)
    tags = [t.strip() for t in tags if t.strip() and not t.strip().startswith('span')]
    
    res.append({"id": id_str, "name": name, "description": desc, "tags": tags})
print(json.dumps(res, indent=2))
