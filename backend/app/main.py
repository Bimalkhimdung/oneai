import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import socketio

from app.config import settings
from app import database, schemas
from app.lib.redis import redis_client, pub_client, sub_client
from app.realtime import sio, sio_app
from app.routes import auth, me, servers, chats

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting up FastAPI application")
    yield
    # Shutdown
    logger.info("Shutting down FastAPI application, closing Redis connections")
    await redis_client.aclose()
    await pub_client.aclose()
    await sub_client.aclose()

app = FastAPI(
    title="Local AI Hub API",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.WEB_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health routes
@app.get("/healthz")
async def healthz():
    return {"ok": True}

@app.get("/readyz")
async def readyz(db: AsyncSession = Depends(database.get_db)):
    try:
        await db.execute(text("SELECT 1"))
        await redis_client.ping()
        return {"ok": True}
    except Exception as e:
        logger.warning(f"Readiness probe failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Readiness probe failed"
        )

# API v1 routes
app.include_router(auth.router, prefix="/api/v1")
app.include_router(me.router, prefix="/api/v1")
app.include_router(servers.router, prefix="/api/v1")
app.include_router(chats.router, prefix="/api/v1")

# Combine FastAPI and Socket.IO into a single ASGI app
# Socket.IO intercepts /socket.io requests, other requests go to FastAPI
asgi_app = socketio.ASGIApp(sio, other_asgi_app=app)
