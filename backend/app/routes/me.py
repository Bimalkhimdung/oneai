from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import schemas, database
from app import dependencies
from app.services import auth as auth_service

router = APIRouter(prefix="/me")

@router.get("/", response_model=schemas.UserDto)
async def get_me(
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db)
):
    return await auth_service.me(db, current_user["id"])

@router.put("/", response_model=schemas.UserDto)
async def update_my_profile(
    input_data: schemas.UpdateProfileInput,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db)
):
    return await auth_service.update_profile(db, current_user["id"], input_data)
