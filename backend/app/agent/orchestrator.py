import datetime
import json
import logging
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.adapter import LLMAdapter
from app.agent.memory import recall_memory, store_memory
from app.agent.tools import build_default_registry
from app.agent.ollama_conn import resolve_ollama_server
from app.models import AgentMessage, AgentSession
from app.services.search import search_web

logger = logging.getLogger("app.agent.orchestrator")

MAX_ITERATIONS = 10

DEFAULT_SYSTEM = (
    "You are an autonomous AI agent with access to tools. "
    "Reason step by step, use tools when needed, and provide a clear final answer."
)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _resolve_ollama(user_id: str, db: AsyncSession):
    conn, server = await resolve_ollama_server(db, user_id)
    return conn, server.name


class AgentOrchestrator:
    def __init__(
        self,
        db: AsyncSession,
        user_id: str,
        session: AgentSession,
        model: str,
        system_prompt: str | None,
        max_iterations: int = MAX_ITERATIONS,
    ):
        self.db = db
        self.user_id = user_id
        self.session = session
        self.model = model
        self.system_prompt = system_prompt or session.system_prompt or DEFAULT_SYSTEM
        self.max_iterations = max_iterations

    async def _persist_message(
        self,
        role: str,
        content: str,
        event_type: str | None = None,
        metadata: dict | None = None,
    ):
        msg = AgentMessage(
            session_id=self.session.id,
            role=role,
            content=content,
            event_type=event_type,
            meta_data=metadata,
        )
        self.db.add(msg)
        await self.db.flush()

    async def run(self, prompt: str) -> AsyncIterator[str]:
        conn_info, _ = await _resolve_ollama(self.user_id, self.db)
        adapter = LLMAdapter(conn_info, self.model)

        async def _store(content: str, source: str | None = None) -> str:
            return await store_memory(self.db, self.session.id, self.user_id, content, source)

        async def _recall(query: str, top_k: int = 5) -> str:
            return await recall_memory(self.db, self.session.id, self.user_id, query, top_k)

        tools = build_default_registry(
            db=self.db,
            user_id=self.user_id,
            session_id=self.session.id,
            memory_store_fn=_store,
            memory_recall_fn=_recall,
            web_search_fn=search_web,
        )

        tool_defs = tools.list_openai_tools()
        messages: list[dict] = [{"role": "system", "content": self.system_prompt}]

        if not adapter.supports_native_tools() and tool_defs:
            messages[0]["content"] = (
                adapter.build_fallback_system_prompt(tool_defs)
                + "\n\n" + self.system_prompt
            )

        # Inject recalled context
        try:
            prior = await recall_memory(self.db, self.session.id, self.user_id, prompt, 3)
            if prior and "No memories" not in prior:
                messages.append({
                    "role": "system",
                    "content": f"Relevant memories:\n{prior}",
                })
        except Exception as e:
            logger.debug(f"Memory recall skipped: {e}")

        messages.append({"role": "user", "content": prompt})
        await self._persist_message("user", prompt, "user")
        await self.db.commit()

        if not self.session.title:
            self.session.title = prompt[:80]
            self.session.updated_at = datetime.datetime.utcnow()
            await self.db.commit()

        for iteration in range(self.max_iterations):
            yield _sse("thought", {"content": f"Iteration {iteration + 1}..."})

            try:
                response = await adapter.chat(
                    messages,
                    tools=tool_defs if adapter.supports_native_tools() else None,
                )
            except Exception as e:
                yield _sse("error", {"content": str(e)})
                yield _sse("done", {})
                return

            message = adapter.extract_message(response)
            content = message.get("content") or ""
            tool_calls = adapter.extract_tool_calls(message)

            if not tool_calls and content and not adapter.supports_native_tools():
                tool_calls = adapter.parse_fallback_tool_calls(content)

            if tool_calls:
                messages.append(message)
                for call in tool_calls:
                    name = call.get("name")
                    args = call.get("arguments") or {}
                    yield _sse("tool_call", {"name": name, "arguments": args})
                    await self._persist_message(
                        "tool", json.dumps(args), "tool_call", {"name": name}
                    )
                    result = await tools.call(name, args)
                    yield _sse("tool_result", {"name": name, "result": result})
                    await self._persist_message(
                        "tool", result, "tool_result", {"name": name}
                    )
                    if adapter.supports_native_tools():
                        messages.append({
                            "role": "tool",
                            "tool_name": name,
                            "content": result,
                        })
                    else:
                        messages.append({
                            "role": "user",
                            "content": f"Tool '{name}' result:\n{result}",
                        })
                # Explicitly ask the model to now use the tool results to answer
                messages.append({
                    "role": "user",
                    "content": (
                        "Using ONLY the tool results provided above, answer the original question accurately. "
                        "Do NOT use your training data or prior knowledge for factual details — rely exclusively "
                        "on the tool output. If the results are insufficient, say so."
                    ),
                })
                await self.db.commit()
                continue

            # Final response
            if content:
                yield _sse("response", {"content": content})
                await self._persist_message("assistant", content, "response")
                self.session.updated_at = datetime.datetime.utcnow()
                await self.db.commit()
                yield _sse("done", {"sessionId": self.session.id})
                return

            yield _sse("error", {"content": "Model returned empty response."})
            yield _sse("done", {})
            return

        yield _sse("error", {"content": f"Max iterations ({MAX_ITERATIONS}) reached."})
        yield _sse("done", {})
