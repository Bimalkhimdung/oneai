import asyncio
from app.models import database
from app import crud
from app.services import server as server_service
from app.providers.registry import get_adapter
from app.providers.base import ProviderConnectInfo
from app.services.server import decrypt_api_key

async def main():
    async for db in database.get_db():
        # Get all servers
        from sqlalchemy import select
        from app.models import Server
        stmt = select(Server)
        res = await db.execute(stmt)
        servers = res.scalars().all()
        
        for s in servers:
            try:
                print(f"Syncing server {s.name}...")
                adapter = get_adapter(s.provider.value)
                conn_info = ProviderConnectInfo(
                    host=s.host,
                    port=s.port,
                    apiKey=decrypt_api_key(s)
                )
                models_info = await adapter.list_models(conn_info)
                models_data = [m.__dict__ for m in models_info]
                await crud.sync_models_for_server(db, s.id, models_data)
                print(f"  -> Synced {len(models_data)} models.")
            except Exception as e:
                print(f"  -> Failed to sync: {e}")
                
        break

if __name__ == "__main__":
    asyncio.run(main())
