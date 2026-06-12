import datetime
import jwt
from app.config import settings

def sign_access_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(seconds=settings.jwt_access_ttl_seconds)
    }
    return jwt.encode(payload, settings.JWT_ACCESS_SECRET, algorithm="HS256")

def verify_access_token(token: str) -> dict:
    try:
        # jwt.decode handles expiration checks automatically
        return jwt.decode(token, settings.JWT_ACCESS_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as e:
        raise ValueError("Invalid or expired token") from e
