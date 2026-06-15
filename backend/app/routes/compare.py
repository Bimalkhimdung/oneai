from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app import dependencies
from app.models import database, schemas
from app.services import compare as compare_service


router = APIRouter(prefix="/compare")


@router.post("/", response_model=schemas.CompareResponseDto)
async def compare_models(
    input_data: schemas.CompareInput,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db),
):
    return await compare_service.compare_models(db, current_user["id"], input_data)
