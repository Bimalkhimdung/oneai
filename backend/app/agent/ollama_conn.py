"""Shared Ollama server resolution for agent modules."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Server
from app.providers.base import ProviderConnectInfo
from app.services.server import decrypt_api_key


async def resolve_ollama_server(db: AsyncSession, user_id: str) -> tuple[ProviderConnectInfo, Server]:
    """Return the user's first Ollama server (stable order). Supports multiple servers."""
    stmt = (
        select(Server)
        .where(Server.user_id == user_id, Server.provider == "OLLAMA")
        .order_by(Server.created_at.asc())
        .limit(1)
    )
    server = (await db.execute(stmt)).scalar_one_or_none()
    if not server:
        raise RuntimeError("No Ollama server found. Connect localhost:11434 in AI Servers.")
    conn = ProviderConnectInfo(
        host=server.host,
        port=server.port,
        apiKey=decrypt_api_key(server),
    )
    return conn, server


def ollama_base_url(conn: ProviderConnectInfo) -> str:
    return f"http://{conn.host}:{conn.port}"
