from fastapi import Header, HTTPException, status, Depends
from app.lib.jwt import verify_access_token

async def require_auth(authorization: str = Header(...)) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing access token"
        )
    token = authorization[7:]
    try:
        payload = verify_access_token(token)
        return {"id": payload["sub"], "role": payload["role"]}
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

def require_role(*roles: str):
    async def dependency(current_user: dict = Depends(require_auth)):
        if current_user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden"
            )
        return current_user
    return dependency
