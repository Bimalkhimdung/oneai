from typing import Optional, Any, Dict, AsyncIterable
from pydantic import BaseModel

class ProviderConnectInfo(BaseModel):
    host: str
    port: int
    apiKey: Optional[str] = None

class ProviderModelInfo(BaseModel):
    name: str
    family: Optional[str] = None
    sizeBytes: int
    digest: str
    parameters: Optional[Dict[str, Any]] = None

class ProviderPingResult(BaseModel):
    ok: bool
    version: Optional[str] = None
    error: Optional[str] = None
    latencyMs: int

class ChatStreamChunk(BaseModel):
    delta: str
    done: bool
    tokensIn: Optional[int] = None
    tokensOut: Optional[int] = None
    durationMs: Optional[int] = None

class InstallProgress(BaseModel):
    status: str
    totalBytes: Optional[int] = None
    pulledBytes: Optional[int] = None
    progress: float

class BaseProviderAdapter:
    provider: str
    
    async def ping(self, info: ProviderConnectInfo) -> ProviderPingResult:
        raise NotImplementedError()

    async def list_models(self, info: ProviderConnectInfo) -> list[ProviderModelInfo]:
        raise NotImplementedError()

    async def chat_stream(self, info: ProviderConnectInfo, model: str, messages: list[dict]) -> AsyncIterable[ChatStreamChunk]:
        raise NotImplementedError()

    async def install(self, info: ProviderConnectInfo, model_name: str) -> AsyncIterable[InstallProgress]:
        raise NotImplementedError()

    async def remove(self, info: ProviderConnectInfo, model_name: str) -> None:
        raise NotImplementedError()
