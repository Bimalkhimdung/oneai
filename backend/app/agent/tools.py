import io
import json
import logging
import sys
from contextlib import redirect_stdout, redirect_stderr
from typing import Any, Awaitable, Callable

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Chat, Model, Server

logger = logging.getLogger("app.agent.tools")

ToolHandler = Callable[..., Awaitable[str] | str]


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, dict[str, Any]] = {}

    def register(
        self,
        name: str,
        description: str,
        parameters: dict,
        handler: ToolHandler,
    ):
        self._tools[name] = {
            "name": name,
            "description": description,
            "parameters": parameters,
            "handler": handler,
        }

    def list_definitions(self) -> list[dict]:
        return [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["parameters"],
                },
            }
            for t in self._tools.values()
        ]

    def list_openai_tools(self) -> list[dict]:
        return self.list_definitions()

    def get(self, name: str) -> dict | None:
        return self._tools.get(name)

    async def call(self, name: str, arguments: dict | None) -> str:
        tool = self._tools.get(name)
        if not tool:
            return f"Unknown tool: {name}"
        args = arguments or {}
        try:
            result = tool["handler"](**args)
            if hasattr(result, "__await__"):
                result = await result
            return str(result)
        except Exception as e:
            logger.warning(f"Tool {name} failed: {e}")
            return f"Tool error: {e}"


def _restricted_exec(code: str) -> str:
    """Run Python with restricted builtins (local dev sandbox)."""
    allowed_builtins = {
        "abs": abs,
        "all": all,
        "any": any,
        "bool": bool,
        "dict": dict,
        "enumerate": enumerate,
        "float": float,
        "int": int,
        "len": len,
        "list": list,
        "max": max,
        "min": min,
        "print": print,
        "range": range,
        "round": round,
        "set": set,
        "sorted": sorted,
        "str": str,
        "sum": sum,
        "tuple": tuple,
        "zip": zip,
    }
    stdout = io.StringIO()
    stderr = io.StringIO()
    local_vars: dict[str, Any] = {}
    try:
        with redirect_stdout(stdout), redirect_stderr(stderr):
            exec(code, {"__builtins__": allowed_builtins}, local_vars)
        out = stdout.getvalue()
        err = stderr.getvalue()
        if "result" in local_vars:
            out += f"\nresult: {local_vars['result']}"
        if err:
            out += f"\nstderr: {err}"
        return out.strip() or "(no output)"
    except Exception as e:
        return f"Execution error: {e}"


TOOL_DEFINITIONS: list[dict] = [
    {
        "name": "web_search",
        "description": "Search the web via DuckDuckGo and return summarized results.",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Search query"}},
            "required": ["query"],
        },
    },
    {
        "name": "run_python",
        "description": "Execute restricted Python code. Set `result` variable for return value.",
        "parameters": {
            "type": "object",
            "properties": {"code": {"type": "string", "description": "Python code to run"}},
            "required": ["code"],
        },
    },
    {
        "name": "query_database",
        "description": "Read-only query of user stats (summary, chats, models, servers).",
        "parameters": {
            "type": "object",
            "properties": {
                "table": {
                    "type": "string",
                    "enum": ["summary", "chats", "models", "servers"],
                },
            },
        },
    },
    {
        "name": "memory_store",
        "description": "Store a fact in long-term vector memory for this agent session.",
        "parameters": {
            "type": "object",
            "properties": {
                "content": {"type": "string"},
                "source": {"type": "string"},
            },
            "required": ["content"],
        },
    },
    {
        "name": "memory_recall",
        "description": "Recall relevant facts from vector memory using semantic search.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "top_k": {"type": "integer", "default": 5},
            },
            "required": ["query"],
        },
    },
]


def get_static_tool_definitions() -> list[dict]:
    return TOOL_DEFINITIONS


def build_default_registry(
    db: AsyncSession,
    user_id: str,
    session_id: str,
    memory_store_fn: Callable[[str, str | None], Awaitable[str]],
    memory_recall_fn: Callable[[str, int], Awaitable[str]],
    web_search_fn: Callable[[str], Awaitable[str]],
) -> ToolRegistry:
    registry = ToolRegistry()

    async def web_search(query: str) -> str:
        return await web_search_fn(query)

    async def run_python(code: str) -> str:
        return _restricted_exec(code)

    async def query_database(table: str = "summary") -> str:
        """Read-only summary of user data."""
        allowed = {"summary", "chats", "models", "servers"}
        if table not in allowed:
            return f"Allowed tables: {', '.join(sorted(allowed))}"

        if table == "summary" or table == "chats":
            chat_count = await db.scalar(
                select(func.count()).select_from(Chat).where(Chat.user_id == user_id)
            )
        if table == "summary" or table == "models":
            model_count = await db.scalar(
                select(func.count())
                .select_from(Model)
                .join(Server, Model.server_id == Server.id)
                .where(Server.user_id == user_id)
            )
        if table == "summary" or table == "servers":
            server_count = await db.scalar(
                select(func.count()).select_from(Server).where(Server.user_id == user_id)
            )

        if table == "chats":
            return json.dumps({"chats": chat_count})
        if table == "models":
            return json.dumps({"models": model_count})
        if table == "servers":
            return json.dumps({"servers": server_count})
        return json.dumps({
            "chats": chat_count,
            "models": model_count,
            "servers": server_count,
        })

    async def memory_store(content: str, source: str | None = None) -> str:
        return await memory_store_fn(content, source)

    async def memory_recall(query: str, top_k: int = 5) -> str:
        return await memory_recall_fn(query, top_k)

    registry.register(
        "web_search",
        "Search the web via DuckDuckGo and return summarized results.",
        {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
            },
            "required": ["query"],
        },
        web_search,
    )
    registry.register(
        "run_python",
        "Execute restricted Python code. Set `result` variable for return value.",
        {
            "type": "object",
            "properties": {
                "code": {"type": "string", "description": "Python code to run"},
            },
            "required": ["code"],
        },
        run_python,
    )
    registry.register(
        "query_database",
        "Read-only query of user stats (summary, chats, models, servers).",
        {
            "type": "object",
            "properties": {
                "table": {
                    "type": "string",
                    "enum": ["summary", "chats", "models", "servers"],
                    "description": "Which data to fetch",
                },
            },
        },
        query_database,
    )
    registry.register(
        "memory_store",
        "Store a fact in long-term vector memory for this agent session.",
        {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "Fact to remember"},
                "source": {"type": "string", "description": "Optional source label"},
            },
            "required": ["content"],
        },
        memory_store,
    )
    registry.register(
        "memory_recall",
        "Recall relevant facts from vector memory using semantic search.",
        {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to recall"},
                "top_k": {"type": "integer", "description": "Max results", "default": 5},
            },
            "required": ["query"],
        },
        memory_recall,
    )

    return registry
