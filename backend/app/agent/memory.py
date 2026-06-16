import logging
from typing import List

from sqlalchemy import select, text, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.ollama_conn import resolve_ollama_server
from app.models import AgentMemory, Server
from app.providers.registry import get_adapter
from app.providers.base import ProviderConnectInfo
from app.services.server import decrypt_api_key

logger = logging.getLogger("app.agent.memory")

EMBEDDING_MODEL = "nomic-embed-text"


async def _get_ollama_server(db: AsyncSession, user_id: str) -> Server | None:
    try:
        _, server = await resolve_ollama_server(db, user_id)
        return server
    except RuntimeError:
        return None


async def generate_embedding(db: AsyncSession, user_id: str, content: str) -> List[float]:
    server = await _get_ollama_server(db, user_id)
    if not server:
        raise RuntimeError("No Ollama server configured. Add a local Ollama server first.")

    adapter = get_adapter(server.provider.value)
    conn_info = ProviderConnectInfo(
        host=server.host,
        port=server.port,
        apiKey=decrypt_api_key(server),
    )
    return await adapter.embed(conn_info, EMBEDDING_MODEL, content)


async def store_memory(
    db: AsyncSession,
    session_id: str,
    user_id: str,
    content: str,
    source: str | None = None,
) -> str:
    embedding = await generate_embedding(db, user_id, content)
    record = AgentMemory(
        session_id=session_id,
        content=content,
        embedding=embedding,
        source=source,
    )
    db.add(record)
    await db.commit()
    return f"Stored memory: {content[:120]}"


async def recall_memory(
    db: AsyncSession,
    session_id: str,
    user_id: str,
    query: str,
    top_k: int = 5,
) -> str:
    count = await db.scalar(
        select(func.count()).select_from(AgentMemory).where(AgentMemory.session_id == session_id)
    )
    if not count:
        return "No memories stored yet for this session."

    query_embedding = await generate_embedding(db, user_id, query)
    embedding_str = f"[{','.join(map(str, query_embedding))}]"

    stmt = text("""
        SELECT content, source, timestamp
        FROM agent_memories
        WHERE session_id = :session_id
        ORDER BY embedding <=> CAST(:embedding AS vector)
        LIMIT :top_k
    """)
    result = await db.execute(stmt, {
        "session_id": session_id,
        "embedding": embedding_str,
        "top_k": top_k,
    })
    rows = result.fetchall()
    if not rows:
        return "No relevant memories found."

    parts = []
    for i, row in enumerate(rows, 1):
        src = f" (source: {row[1]})" if row[1] else ""
        parts.append(f"[{i}] {row[0]}{src}")
    return "\n".join(parts)
