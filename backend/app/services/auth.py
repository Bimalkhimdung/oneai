import datetime
import secrets
import bcrypt
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app import crud, models
from app.models import schemas
from app.config import settings
from app.lib.jwt import sign_access_token
from app.lib.crypto import sha256

def hash_password(password: str) -> str:
    # bcrypt rounds is default to 12 in python's gensalt
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def to_user_dto(user: models.User) -> schemas.UserDto:
    return schemas.UserDto(
        id=user.id,
        email=user.email,
        fullName=user.full_name,
        role=user.role.value,
        createdAt=user.created_at.isoformat() + "Z"
    )

def new_refresh_token() -> tuple[str, str, datetime.datetime]:
    # base64url equivalent in python is secrets.token_urlsafe
    # 64 bytes
    token = secrets.token_urlsafe(64)
    token_hash = sha256(token)
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=settings.JWT_REFRESH_TTL_DAYS)
    return token, token_hash, expires_at

async def issue_session(db: AsyncSession, user: models.User) -> tuple[schemas.AuthResultDto, str]:
    access_token = sign_access_token(user.id, user.role.value)
    raw_refresh, token_hash, expires_at = new_refresh_token()
    await crud.create_refresh_token(db, user.id, token_hash, expires_at)
    
    user_dto = to_user_dto(user)
    result = schemas.AuthResultDto(
        user=user_dto,
        accessToken=access_token,
        expiresIn=settings.jwt_access_ttl_seconds
    )
    return result, raw_refresh


async def register(db: AsyncSession, input_data: schemas.RegisterInput) -> tuple[schemas.AuthResultDto, str]:
    existing = await crud.get_user_by_email(db, input_data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists."
        )
    password_hash = hash_password(input_data.password)
    user = await crud.create_user(
        db,
        email=input_data.email,
        password_hash=password_hash,
        full_name=input_data.fullName
    )
    return await issue_session(db, user)

async def login(db: AsyncSession, input_data: schemas.LoginInput) -> tuple[schemas.AuthResultDto, str]:
    user = await crud.get_user_by_email(db, input_data.email)
    if not user or not verify_password(input_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )
    return await issue_session(db, user)

async def refresh(db: AsyncSession, raw_token: str) -> tuple[schemas.AuthResultDto, str]:
    token_hash = sha256(raw_token)
    existing = await crud.find_active_refresh_token_by_hash(db, token_hash)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalid or expired."
        )
    await crud.revoke_refresh_token(db, existing.id)
    user = await crud.get_user_by_id(db, existing.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found."
        )
    return await issue_session(db, user)

async def logout(db: AsyncSession, raw_token: str | None):
    if not raw_token:
        return
    token_hash = sha256(raw_token)
    existing = await crud.find_active_refresh_token_by_hash(db, token_hash)
    if existing:
        await crud.revoke_refresh_token(db, existing.id)

async def me(db: AsyncSession, user_id: str) -> schemas.UserDto:
    user = await crud.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found."
        )
    return to_user_dto(user)

async def update_profile(db: AsyncSession, user_id: str, input_data: schemas.UpdateProfileInput) -> schemas.UserDto:
    user = await crud.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )
    
    if input_data.fullName:
        user.full_name = input_data.fullName
        
    if input_data.newPassword:
        if not input_data.oldPassword:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is required to set a new password."
            )
        if not verify_password(input_data.oldPassword, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect current password."
            )
        user.password_hash = hash_password(input_data.newPassword)
        
    await db.commit()
    await db.refresh(user)
    return to_user_dto(user)
