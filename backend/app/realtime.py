import logging
import socketio
from app.lib.jwt import verify_access_token

logger = logging.getLogger("app.realtime")

# Initialize Socket.IO server in async mode
# Allowed origins will be checked against the origin sent by client
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*"  # For simplicity, or specify client domain
)

# Wraps standard socketio server as an ASGI application
sio_app = socketio.ASGIApp(sio)

@sio.event
async def connect(sid, environ, auth=None):
    logger.debug(f"Socket connection request from sid: {sid}")
    if not auth or "token" not in auth:
        logger.warning(f"Socket connection rejected: missing auth token")
        raise socketio.exceptions.ConnectionRefusedError("unauthorized")
        
    token = auth["token"]
    try:
        payload = verify_access_token(token)
        user_id = payload["sub"]
        role = payload["role"]
        
        # Save session info to sid context
        await sio.save_session(sid, {"userId": user_id, "role": role})
        
        # Join user room: user:<id>
        await sio.enter_room(sid, f"user:{user_id}")
        logger.debug(f"Socket connected: {sid} for user {user_id}")
    except Exception as e:
        logger.warning(f"Socket connection rejected: {e}")
        raise socketio.exceptions.ConnectionRefusedError("unauthorized")

@sio.event
async def disconnect(sid):
    session = await sio.get_session(sid)
    user_id = session.get("userId") if session else "unknown"
    logger.debug(f"Socket disconnected: {sid} (user: {user_id})")

@sio.on("hardware.subscribe")
async def on_hardware_subscribe(sid):
    session = await sio.get_session(sid)
    if not session:
        return
    user_id = session.get("userId")
    if user_id:
        await sio.enter_room(sid, f"hw:{user_id}")
        logger.debug(f"Socket {sid} (user: {user_id}) joined hardware room")

@sio.on("hardware.unsubscribe")
async def on_hardware_unsubscribe(sid):
    session = await sio.get_session(sid)
    if not session:
        return
    user_id = session.get("userId")
    if user_id:
        await sio.leave_room(sid, f"hw:{user_id}")
        logger.debug(f"Socket {sid} (user: {user_id}) left hardware room")
