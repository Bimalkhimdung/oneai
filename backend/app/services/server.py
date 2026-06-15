import datetime
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from app import crud, models
from app.models import schemas
from app.providers.registry import get_adapter
from app.providers.base import ProviderConnectInfo
from app.lib.crypto import seal, open_secret

def to_dto(server: models.Server) -> schemas.ServerDto:
    # Safely load models if they were joined
    models_data = []
    try:
        if server.models:
            for m in server.models:
                models_data.append({
                    "id": m.id,
                    "name": m.name,
                    "sizeBytes": m.size_bytes,
                    "family": m.family,
                    "parameters": m.parameters
                })
    except Exception:
        pass

    return schemas.ServerDto(
        id=server.id,
        name=server.name,
        host=server.host,
        port=server.port,
        provider=server.provider.value,
        status=server.status.value,
        version=server.version,
        lastSeenAt=server.last_seen_at.isoformat() + "Z" if server.last_seen_at else None,
        createdAt=server.created_at.isoformat() + "Z",
        models=models_data
    )

def decrypt_api_key(server: models.Server) -> str | None:
    if not server.api_key_cipher or not server.api_key_iv or not server.api_key_tag:
        return None
    return open_secret(server.api_key_cipher, server.api_key_iv, server.api_key_tag)

async def test_connection(input_data: schemas.TestServerInput) -> dict:
    adapter = get_adapter(input_data.provider)
    conn_info = ProviderConnectInfo(
        host=input_data.host,
        port=input_data.port,
        apiKey=input_data.apiKey
    )
    result = await adapter.ping(conn_info)
    models = []
    if result.ok:
        try:
            models_info = await adapter.list_models(conn_info)
            models = [m.__dict__ for m in models_info]
        except Exception:
            pass
            
    return {
        "ok": result.ok,
        "version": result.version,
        "error": result.error,
        "latencyMs": result.latencyMs,
        "models": models
    }

async def create(db: AsyncSession, user_id: str, input_data: schemas.CreateServerInput) -> schemas.ServerDto:
    api_key_sealed = seal(input_data.apiKey) if input_data.apiKey else None
    adapter = get_adapter(input_data.provider)
    
    conn_info = ProviderConnectInfo(
        host=input_data.host,
        port=input_data.port,
        apiKey=input_data.apiKey
    )
    ping = await adapter.ping(conn_info)

    try:
        server = await crud.create_server(
            db,
            user_id=user_id,
            name=input_data.name,
            host=input_data.host,
            port=input_data.port,
            provider=models.Provider(input_data.provider.upper()),
            api_key_cipher=api_key_sealed["cipher"] if api_key_sealed else None,
            api_key_iv=api_key_sealed["iv"] if api_key_sealed else None,
            api_key_tag=api_key_sealed["tag"] if api_key_sealed else None,
            status=models.ServerStatus.ONLINE if ping.ok else models.ServerStatus.OFFLINE,
            version=ping.version,
            last_seen_at=datetime.datetime.utcnow() if ping.ok else None
        )
        
        if ping.ok:
            try:
                await sync_models_for_server(db, server)
            except Exception as e:
                pass

        return to_dto(server)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A server with that name already exists."
        )

async def list_servers(db: AsyncSession, user_id: str) -> list[schemas.ServerDto]:
    servers = await crud.list_servers_for_user(db, user_id)
    return [to_dto(s) for s in servers]

async def get_owned(db: AsyncSession, server_id: str, user_id: str) -> models.Server:
    server = await crud.get_server_by_id_and_user_id(db, server_id, user_id)
    if not server:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Server not found."
        )
    return server

async def get_owned_dto(db: AsyncSession, server_id: str, user_id: str) -> schemas.ServerDto:
    server = await get_owned(db, server_id, user_id)
    return to_dto(server)

async def remove(db: AsyncSession, server_id: str, user_id: str):
    await get_owned(db, server_id, user_id)
    await crud.delete_server(db, server_id)

async def health_check(db: AsyncSession, server_id: str, user_id: str) -> dict:
    server = await get_owned(db, server_id, user_id)
    adapter = get_adapter(server.provider.value)
    
    api_key = decrypt_api_key(server)
    conn_info = ProviderConnectInfo(
        host=server.host,
        port=server.port,
        apiKey=api_key
    )
    ping = await adapter.ping(conn_info)
    
    await crud.update_server_status(
        db,
        server_id=server.id,
        status=models.ServerStatus.ONLINE if ping.ok else models.ServerStatus.OFFLINE,
        version=ping.version,
        last_seen_at=datetime.datetime.utcnow() if ping.ok else server.last_seen_at
    )

    if ping.ok:
        await sync_models_for_server(db, server)
    
    return {
        "ok": ping.ok,
        "version": ping.version,
        "error": ping.error,
        "latencyMs": ping.latencyMs
    }


async def sync_models_for_server(db: AsyncSession, server: models.Server) -> None:
    adapter = get_adapter(server.provider.value)
    api_key = decrypt_api_key(server)
    conn_info = ProviderConnectInfo(
        host=server.host,
        port=server.port,
        apiKey=api_key
    )
    models_info = await adapter.list_models(conn_info)
    await crud.sync_models_for_server(db, server.id, [m.__dict__ for m in models_info])


async def sync_user_servers_for_provider(db: AsyncSession, user_id: str, provider: models.Provider) -> int:
    stmt = select(models.Server).where(
        models.Server.user_id == user_id,
        models.Server.provider == provider,
    )
    result = await db.execute(stmt)
    servers = list(result.scalars().all())
    synced = 0

    for server in servers:
        try:
            await sync_models_for_server(db, server)
            synced += 1
        except Exception:
            continue

    return synced
