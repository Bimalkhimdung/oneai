"""Run agentic ReAct loop inside a chat thread and persist messages."""

import datetime
import json
import logging
from typing import AsyncIterator

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, models
from app.agent.adapter import LLMAdapter
from app.agent.memory import recall_memory, store_memory
from app.agent.ollama_conn import resolve_ollama_server
from app.agent.tools import build_default_registry
from app.models import schemas
from app.services.chat import load_model_and_server
from app.services.search import search_web

logger = logging.getLogger("app.chat_agent")

MAX_ITERATIONS = 10

DEFAULT_SYSTEM = (
    "You are an autonomous AI agent with access to tools. "
    "Reason step by step, use tools when needed, and provide a clear final answer."
)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _run_single_agent(
    db: AsyncSession,
    user_id: str,
    model_name: str,
    prompt: str,
    memory_session_id: str,
) -> AsyncIterator[tuple[str, str | None]]:
    """Yields (sse_chunk, final_content). final_content set on response."""
    conn, _ = await resolve_ollama_server(db, user_id)
    adapter = LLMAdapter(conn, model_name)

    async def _store(content: str, source: str | None = None) -> str:
        return await store_memory(db, memory_session_id, user_id, content, source)

    async def _recall(query: str, top_k: int = 5) -> str:
        return await recall_memory(db, memory_session_id, user_id, query, top_k)

    tools = build_default_registry(
        db=db,
        user_id=user_id,
        session_id=memory_session_id,
        memory_store_fn=_store,
        memory_recall_fn=_recall,
        web_search_fn=search_web,
    )
    tool_defs = tools.list_openai_tools()
    messages: list[dict] = [{"role": "system", "content": DEFAULT_SYSTEM}]

    if not adapter.supports_native_tools() and tool_defs:
        messages[0]["content"] = (
            adapter.build_fallback_system_prompt(tool_defs) + "\n\n" + DEFAULT_SYSTEM
        )

    try:
        prior = await recall_memory(db, memory_session_id, user_id, prompt, 3)
        if prior and "No memories" not in prior:
            messages.append({"role": "system", "content": f"Relevant memories:\n{prior}"})
    except Exception as e:
        logger.debug(f"Memory recall skipped: {e}")

    messages.append({"role": "user", "content": prompt})

    for iteration in range(MAX_ITERATIONS):
        yield _sse("thought", {"content": f"Step {iteration + 1}..."}), None

        try:
            response = await adapter.chat(
                messages,
                tools=tool_defs if adapter.supports_native_tools() else None,
            )
        except Exception as e:
            yield _sse("error", {"content": str(e)}), None
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
                yield _sse("tool_call", {"name": name, "arguments": args}), None
                result = await tools.call(name, args)
                yield _sse("tool_result", {"name": name, "result": result}), None
                if adapter.supports_native_tools():
                    messages.append({"role": "tool", "tool_name": name, "content": result})
                else:
                    messages.append({"role": "user", "content": f"Tool '{name}' result:\n{result}"})
            continue

        if content:
            yield _sse("response", {"content": content}), content
            return

        yield _sse("error", {"content": "Model returned empty response."}), None
        return

    yield _sse("error", {"content": f"Max iterations ({MAX_ITERATIONS}) reached."}), None


async def run_chat_agent(
    db: AsyncSession,
    chat_id: str,
    user_id: str,
    body: schemas.ChatAgentRunRequest,
) -> AsyncIterator[str]:
    chat = await crud.get_chat_by_id_and_user_id(db, chat_id, user_id)
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found.")
    if not chat.model_id:
        raise HTTPException(status_code=400, detail="Chat has no model attached.")

    model = await load_model_and_server(db, chat.model_id, user_id)
    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required.")

    user_message = await crud.create_message(
        db,
        chat_id=chat.id,
        role=models.MessageRole.USER,
        content=prompt,
    )
    assistant_message = await crud.create_message(
        db,
        chat_id=chat.id,
        role=models.MessageRole.ASSISTANT,
        content="",
        model_name=model.name,
    )

    if chat.title == "New chat":
        await crud.update_chat(db, chat.id, title=prompt[:60])

    yield _sse("user_message", {
        "messageId": user_message.id,
        "content": prompt,
    })

    yield _sse("assistant_message", {
        "messageId": assistant_message.id,
    })

    memory_session_id = f"chat-{chat.id}"
    final_content = ""

    async for chunk, content in _run_single_agent(
        db, user_id, model.name, prompt, memory_session_id
    ):
        if content:
            final_content = content
        yield chunk

    await crud.update_message(
        db,
        assistant_message.id,
        content=final_content or "[Agent did not produce a response]",
    )
    await crud.update_chat(db, chat.id, updated_at=datetime.datetime.utcnow())

    yield _sse("done", {
        "chatId": chat.id,
        "userMessageId": user_message.id,
        "assistantMessageId": assistant_message.id,
    })
