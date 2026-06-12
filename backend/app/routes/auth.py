from fastapi import APIRouter, Depends, Response, Cookie, status
from sqlalchemy.ext.asyncio import AsyncSession
from app import schemas, database
from app.services import auth as auth_service
from app.config import settings

router = APIRouter(prefix="/auth")

def set_refresh_cookie(response: Response, token: str):
    response.set_cookie(
        key="rid",
        value=token,
        httponly=True,
        secure=settings.NODE_ENV == "production",
        samesite="lax",
        path="/api/v1/auth",
        max_age=settings.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60
    )

def clear_refresh_cookie(response: Response):
    response.delete_cookie(
        key="rid",
        path="/api/v1/auth"
    )

@router.post("/register", response_model=schemas.AuthResultDto, status_code=status.HTTP_201_CREATED)
async def register(
    input_data: schemas.RegisterInput,
    response: Response,
    db: AsyncSession = Depends(database.get_db)
):
    result, refresh_token = await auth_service.register(db, input_data)
    set_refresh_cookie(response, refresh_token)
    return result

@router.post("/login", response_model=schemas.AuthResultDto)
async def login(
    input_data: schemas.LoginInput,
    response: Response,
    db: AsyncSession = Depends(database.get_db)
):
    result, refresh_token = await auth_service.login(db, input_data)
    set_refresh_cookie(response, refresh_token)
    return result

@router.post("/refresh", response_model=schemas.AuthResultDto)
async def refresh(
    response: Response,
    rid: str | None = Cookie(None),
    db: AsyncSession = Depends(database.get_db)
):
    if not rid:
        # Match Express response structure for unauthorized
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh cookie."
        )
    result, refresh_token = await auth_service.refresh(db, rid)
    set_refresh_cookie(response, refresh_token)
    return result

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    rid: str | None = Cookie(None),
    db: AsyncSession = Depends(database.get_db)
):
    await auth_service.logout(db, rid)
    clear_refresh_cookie(response)
