import time
import json
from typing import AsyncIterable
import httpx
from app.providers.base import (
    BaseProviderAdapter,
    ProviderConnectInfo,
    ProviderPingResult,
    ProviderModelInfo,
    ChatStreamChunk,
    InstallProgress,
)

class OllamaAdapter(BaseProviderAdapter):
    provider = "OLLAMA"

    def _base_url(self, info: ProviderConnectInfo) -> str:
        return f"http://{info.host}:{info.port}"

    def _headers(self, info: ProviderConnectInfo) -> dict:
        h = {"content-type": "application/json"}
        if info.apiKey:
            h["authorization"] = f"Bearer {info.apiKey}"
        return h

    async def ping(self, info: ProviderConnectInfo) -> ProviderPingResult:
        started = time.time()
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(f"{self._base_url(info)}/api/version", headers=self._headers(info))
                if res.status_code >= 400:
                    return ProviderPingResult(
                        ok=False,
                        version=None,
                        latencyMs=int((time.time() - started) * 1000),
                        error=f"HTTP {res.status_code}"
                    )
                body = res.json()
                return ProviderPingResult(
                    ok=True,
                    version=body.get("version"),
                    latencyMs=int((time.time() - started) * 1000)
                )
        except Exception as e:
            return ProviderPingResult(
                ok=False,
                version=None,
                latencyMs=int((time.time() - started) * 1000),
                error=str(e)
            )

    async def list_models(self, info: ProviderConnectInfo) -> list[ProviderModelInfo]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.get(f"{self._base_url(info)}/api/tags", headers=self._headers(info))
            if res.status_code >= 400:
                raise Exception(f"Ollama tags HTTP {res.status_code}")
            body = res.json()
            models_list = body.get("models") or []
            res_list = []
            for m in models_list:
                details = m.get("details") or {}
                res_list.append(ProviderModelInfo(
                    name=m["name"],
                    family=details.get("family"),
                    sizeBytes=int(m["size"]),
                    digest=m["digest"],
                    parameters=details if details else None
                ))
            return res_list

    async def chat_stream(self, info: ProviderConnectInfo, model: str, messages: list[dict]) -> AsyncIterable[ChatStreamChunk]:
        started = time.time()
        url = f"{self._base_url(info)}/api/chat"
        payload = {
            "model": model,
            "messages": messages,
            "stream": True
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", url, headers=self._headers(info), json=payload) as response:
                if response.status_code >= 400:
                    err_body = await response.aread()
                    raise Exception(f"Ollama chat HTTP {response.status_code}: {err_body.decode('utf-8')}")
                
                tokens_in = 0
                tokens_out = 0
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                        msg = data.get("message") or {}
                        delta = msg.get("content") or ""
                        done = bool(data.get("done"))
                        tokens_in = data.get("prompt_eval_count") or tokens_in
                        tokens_out = data.get("eval_count") or tokens_out
                        
                        if delta:
                            yield ChatStreamChunk(delta=delta, done=False)
                        if done:
                            yield ChatStreamChunk(
                                delta="",
                                done=True,
                                tokensIn=tokens_in,
                                tokensOut=tokens_out,
                                durationMs=int((time.time() - started) * 1000)
                            )
                            return
                    except Exception:
                        pass

    async def install(self, info: ProviderConnectInfo, model_name: str) -> AsyncIterable[InstallProgress]:
        url = f"{self._base_url(info)}/api/pull"
        payload = {"name": model_name, "stream": True}
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            async with client.stream("POST", url, headers=self._headers(info), json=payload) as response:
                if response.status_code >= 400:
                    raise Exception(f"Ollama pull HTTP {response.status_code}")
                
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                        status = data.get("status") or "pulling"
                        total = data.get("total")
                        completed = data.get("completed")
                        progress = 0.0
                        if total and completed and total > 0:
                            progress = min(100.0, (completed / total) * 100.0)
                        
                        yield InstallProgress(
                            status=status,
                            totalBytes=total,
                            pulledBytes=completed,
                            progress=progress
                        )
                        if status == "success":
                            return
                    except Exception:
                        pass

    async def remove(self, info: ProviderConnectInfo, model_name: str) -> None:
        url = f"{self._base_url(info)}/api/delete"
        payload = {"name": model_name}
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.request("DELETE", url, headers=self._headers(info), json=payload)
            if res.status_code >= 400 and res.status_code != 404:
                raise Exception(f"Ollama delete HTTP {res.status_code}")
