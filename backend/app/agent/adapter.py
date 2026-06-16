import json
import logging
import re
from typing import Any

import httpx

from app.providers.base import ProviderConnectInfo

logger = logging.getLogger("app.agent.adapter")

NATIVE_TOOL_MODEL_HINTS = (
    "llama3.1",
    "llama3.2",
    "llama3.3",
    "qwen2.5",
    "qwen3",
    "mistral",
    "deepseek",
    "functiongemma",
)


class LLMAdapter:
    def __init__(self, conn_info: ProviderConnectInfo, model: str):
        self.conn_info = conn_info
        self.model = model
        self.base_url = f"http://{conn_info.host}:{conn_info.port}"

    def supports_native_tools(self) -> bool:
        name = self.model.lower()
        return any(hint in name for hint in NATIVE_TOOL_MODEL_HINTS)

    def _headers(self) -> dict:
        h = {"content-type": "application/json"}
        if self.conn_info.apiKey:
            h["authorization"] = f"Bearer {self.conn_info.apiKey}"
        return h

    async def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> dict:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
        }
        if tools and self.supports_native_tools():
            payload["tools"] = tools

        async with httpx.AsyncClient(timeout=120.0) as client:
            res = await client.post(
                f"{self.base_url}/api/chat",
                headers=self._headers(),
                json=payload,
            )
            if res.status_code >= 400:
                raise RuntimeError(f"Ollama chat HTTP {res.status_code}: {res.text}")
            return res.json()

    @staticmethod
    def extract_message(response: dict) -> dict:
        return response.get("message") or {}

    @staticmethod
    def extract_tool_calls(message: dict) -> list[dict]:
        calls = message.get("tool_calls") or []
        normalized = []
        for call in calls:
            fn = call.get("function") or {}
            args_raw = fn.get("arguments", "{}")
            if isinstance(args_raw, str):
                try:
                    args = json.loads(args_raw)
                except json.JSONDecodeError:
                    args = {}
            else:
                args = args_raw or {}
            normalized.append({
                "id": call.get("id") or fn.get("name"),
                "name": fn.get("name"),
                "arguments": args,
            })
        return normalized

    @staticmethod
    def parse_fallback_tool_calls(content: str) -> list[dict]:
        """Parse JSON tool calls from model text for non-native models."""
        calls = []
        
        # Find all JSON-like objects by balancing braces
        idx = content.find('{')
        while idx != -1:
            count = 0
            for i in range(idx, len(content)):
                if content[i] == '{':
                    count += 1
                elif content[i] == '}':
                    count -= 1
                
                if count == 0:
                    try:
                        # Sometimes LLMs use triple quotes, replacing them with single quotes might break valid JSON,
                        # but we can try to clean it up. We will just attempt standard json.loads first.
                        obj_str = content[idx:i+1]
                        # Clean up common mistakes: triple quotes inside JSON
                        obj_str = obj_str.replace('"""', '"')
                        data = json.loads(obj_str)
                        if isinstance(data, dict) and "tool" in data:
                            calls.append({
                                "id": data["tool"],
                                "name": data["tool"],
                                "arguments": data.get("arguments") or {},
                            })
                    except json.JSONDecodeError:
                        pass
                    break
            idx = content.find('{', idx + 1)

        return calls

    @staticmethod
    def build_fallback_system_prompt(tools: list[dict]) -> str:
        tool_lines = []
        for t in tools:
            fn = t.get("function") or t
            tool_lines.append(
                f"- {fn.get('name')}: {fn.get('description')}\n"
                f"  parameters: {json.dumps(fn.get('parameters', {}))}"
            )
        return (
            "You are an autonomous agent. When you need a tool, respond ONLY with valid JSON.\n"
            "DO NOT use markdown formatting. DO NOT use triple quotes. Escape all newlines inside strings as \\n.\n"
            'Example:\n{"tool": "run_python", "arguments": {"code": "print(\\"hello\\\\nworld\\")"}}\n'
            "When the task is complete, respond with plain text (no JSON).\n\n"
            "Available tools:\n" + "\n".join(tool_lines)
        )
