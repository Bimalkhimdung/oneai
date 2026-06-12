from app.providers.ollama import OllamaAdapter
from app.providers.base import BaseProviderAdapter

_registry = {
    "OLLAMA": OllamaAdapter()
}

def get_adapter(provider: str) -> BaseProviderAdapter:
    adapter = _registry.get(provider.upper())
    if not adapter:
        raise ValueError(f"No adapter registered for provider {provider}")
    return adapter
