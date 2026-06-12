import urllib.request
import re
req = urllib.request.Request("https://ollama.com/search?q=", headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')
blocks = re.findall(r'<li x-test-model', html)
print(len(blocks))
