import urllib.request
import json
import concurrent.futures

def get_size(model):
    url = f"https://registry.ollama.ai/v2/library/{model}/manifests/latest"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/vnd.docker.distribution.manifest.v2+json"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            total = sum(layer.get("size", 0) for layer in data.get("layers", []))
            return model, round(total / (1024**3), 1)
    except Exception as e:
        return model, None

models = ["deepseek-r1", "deepseek-coder", "not-a-model"]
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
    results = dict(executor.map(get_size, models))
print(results)
