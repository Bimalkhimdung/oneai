import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload
from app import models

# User CRUD
async def get_user_by_email(db: AsyncSession, email: str) -> models.User | None:
    stmt = select(models.User).where(models.User.email == email.lower())
    result = await db.execute(stmt)
    return result.scalar_one_or_none()

async def get_user_by_id(db: AsyncSession, user_id: str) -> models.User | None:
    stmt = select(models.User).where(models.User.id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()

async def create_user(db: AsyncSession, email: str, password_hash: str, full_name: str) -> models.User:
    user = models.User(
        email=email.lower(),
        password_hash=password_hash,
        full_name=full_name,
        role=models.Role.USER
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# Refresh Token CRUD
async def create_refresh_token(db: AsyncSession, user_id: str, token_hash: str, expires_at: datetime.datetime) -> models.RefreshToken:
    token = models.RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at
    )
    db.add(token)
    await db.commit()
    await db.refresh(token)
    return token

async def find_active_refresh_token_by_hash(db: AsyncSession, token_hash: str) -> models.RefreshToken | None:
    stmt = select(models.RefreshToken).where(
        models.RefreshToken.token_hash == token_hash,
        models.RefreshToken.revoked_at == None,
        models.RefreshToken.expires_at > datetime.datetime.utcnow()
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()

async def revoke_refresh_token(db: AsyncSession, token_id: str):
    stmt = update(models.RefreshToken).where(models.RefreshToken.id == token_id).values(revoked_at=datetime.datetime.utcnow())
    await db.execute(stmt)
    await db.commit()

async def revoke_all_tokens_for_user(db: AsyncSession, user_id: str):
    stmt = update(models.RefreshToken).where(
        models.RefreshToken.user_id == user_id,
        models.RefreshToken.revoked_at == None
    ).values(revoked_at=datetime.datetime.utcnow())
    await db.execute(stmt)
    await db.commit()


# Server CRUD
async def create_server(db: AsyncSession, user_id: str, **kwargs) -> models.Server:
    server = models.Server(user_id=user_id, **kwargs)
    db.add(server)
    await db.commit()
    await db.refresh(server)
    return server

async def list_servers_for_user(db: AsyncSession, user_id: str) -> list[models.Server]:
    stmt = select(models.Server).where(models.Server.user_id == user_id).options(selectinload(models.Server.models)).order_by(models.Server.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())

async def get_server_by_id_and_user_id(db: AsyncSession, server_id: str, user_id: str) -> models.Server | None:
    stmt = select(models.Server).where(models.Server.id == server_id, models.Server.user_id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()

async def delete_server(db: AsyncSession, server_id: str):
    stmt = delete(models.Server).where(models.Server.id == server_id)
    await db.execute(stmt)
    await db.commit()

async def update_server_status(db: AsyncSession, server_id: str, status: models.ServerStatus, version: str | None, last_seen_at: datetime.datetime | None):
    stmt = update(models.Server).where(models.Server.id == server_id).values(
        status=status,
        version=version,
        last_seen_at=last_seen_at
    )
    await db.execute(stmt)
    await db.commit()


# Model CRUD
async def sync_models_for_server(db: AsyncSession, server_id: str, models_info: list[dict]):
    # Delete existing models for this server to keep it in sync
    stmt = delete(models.Model).where(models.Model.server_id == server_id)
    await db.execute(stmt)
    
    # Insert new ones
    for m in models_info:
        model = models.Model(
            server_id=server_id,
            name=m.get("name"),
            family=m.get("family"),
            size_bytes=m.get("sizeBytes") or 0,
            digest=m.get("digest") or "unknown",
            parameters=m.get("parameters")
        )
        db.add(model)
        
    await db.commit()

# Chat CRUD
async def create_chat(db: AsyncSession, user_id: str, model_id: str, title: str = "New chat") -> models.Chat:
    chat = models.Chat(
        user_id=user_id,
        model_id=model_id,
        title=title
    )
    db.add(chat)
    await db.commit()
    await db.refresh(chat)
    return chat

async def get_chat_by_id_and_user_id(db: AsyncSession, chat_id: str, user_id: str) -> models.Chat | None:
    stmt = select(models.Chat).where(
        models.Chat.id == chat_id,
        models.Chat.user_id == user_id
    ).options(selectinload(models.Chat.messages), selectinload(models.Chat.documents))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()

async def list_chats_for_user(db: AsyncSession, user_id: str) -> list[models.Chat]:
    stmt = select(models.Chat).where(models.Chat.user_id == user_id).order_by(models.Chat.updated_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())

async def update_chat(db: AsyncSession, chat_id: str, **kwargs) -> models.Chat | None:
    stmt = update(models.Chat).where(models.Chat.id == chat_id).values(**kwargs)
    await db.execute(stmt)
    await db.commit()
    # fetch updated
    stmt_fetch = select(models.Chat).where(models.Chat.id == chat_id)
    res = await db.execute(stmt_fetch)
    return res.scalar_one_or_none()

async def delete_chat(db: AsyncSession, chat_id: str):
    stmt = delete(models.Chat).where(models.Chat.id == chat_id)
    await db.execute(stmt)
    await db.commit()


# Message CRUD
async def create_message(db: AsyncSession, chat_id: str, role: models.MessageRole, content: str, model_name: str | None = None) -> models.Message:
    msg = models.Message(
        chat_id=chat_id,
        role=role,
        content=content,
        model_name=model_name
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg

async def update_message(db: AsyncSession, message_id: str, **kwargs) -> models.Message | None:
    stmt = update(models.Message).where(models.Message.id == message_id).values(**kwargs)
    await db.execute(stmt)
    await db.commit()
    stmt_fetch = select(models.Message).where(models.Message.id == message_id)
    res = await db.execute(stmt_fetch)
    return res.scalar_one_or_none()

async def get_messages_for_chat(db: AsyncSession, chat_id: str) -> list[models.Message]:
    stmt = select(models.Message).where(models.Message.chat_id == chat_id).order_by(models.Message.created_at.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


# MCP Server CRUD
async def create_mcp_server(db: AsyncSession, user_id: str, **kwargs) -> models.McpServer:
    server = models.McpServer(user_id=user_id, **kwargs)
    db.add(server)
    await db.commit()
    await db.refresh(server)
    return server

async def list_mcp_servers_for_user(
    db: AsyncSession,
    user_id: str,
    enabled_only: bool = False,
) -> list[models.McpServer]:
    stmt = select(models.McpServer).where(models.McpServer.user_id == user_id)
    if enabled_only:
        stmt = stmt.where(models.McpServer.enabled == True)
    stmt = stmt.order_by(models.McpServer.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())

async def get_mcp_server_by_id_and_user_id(
    db: AsyncSession,
    server_id: str,
    user_id: str,
) -> models.McpServer | None:
    stmt = select(models.McpServer).where(
        models.McpServer.id == server_id,
        models.McpServer.user_id == user_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()

async def update_mcp_server(db: AsyncSession, server_id: str, **kwargs) -> models.McpServer | None:
    stmt = update(models.McpServer).where(models.McpServer.id == server_id).values(**kwargs)
    await db.execute(stmt)
    await db.commit()
    stmt_fetch = select(models.McpServer).where(models.McpServer.id == server_id)
    res = await db.execute(stmt_fetch)
    return res.scalar_one_or_none()

async def delete_mcp_server(db: AsyncSession, server_id: str):
    stmt = delete(models.McpServer).where(models.McpServer.id == server_id)
    await db.execute(stmt)
    await db.commit()
