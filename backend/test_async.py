import asyncio
import httpx

async def get_size(client, model):
    url = f"https://registry.ollama.ai/v2/library/{model}/manifests/latest"
    try:
        resp = await client.get(url, headers={"Accept": "application/vnd.docker.distribution.manifest.v2+json"}, timeout=3.0)
        if resp.status_code == 200:
            data = resp.json()
            total = sum(layer.get("size", 0) for layer in data.get("layers", []))
            return round(total / (1024**3), 1)
    except Exception:
        pass
    return None

async def main():
    async with httpx.AsyncClient() as client:
        sizes = await asyncio.gather(
            get_size(client, "deepseek-r1"),
            get_size(client, "deepseek-coder"),
            get_size(client, "gemma4:e4b")
        )
        print(sizes)

asyncio.run(main())
