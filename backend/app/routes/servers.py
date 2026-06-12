from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import schemas, database
from app import dependencies
from app.services import server as server_service

router = APIRouter(prefix="/servers")

@router.post("/test")
async def test_server_connection(
    input_data: schemas.TestServerInput,
    current_user: dict = Depends(dependencies.require_auth)
):
    return await server_service.test_connection(input_data)

@router.post("/", response_model=schemas.ServerDto, status_code=status.HTTP_201_CREATED)
async def create_server(
    input_data: schemas.CreateServerInput,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db)
):
    return await server_service.create(db, current_user["id"], input_data)

@router.get("/", response_model=list[schemas.ServerDto])
async def list_servers(
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db)
):
    return await server_service.list_servers(db, current_user["id"])

@router.get("/{id}", response_model=schemas.ServerDto)
async def get_server(
    id: str,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db)
):
    return await server_service.get_owned_dto(db, id, current_user["id"])

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_server(
    id: str,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db)
):
    await server_service.remove(db, id, current_user["id"])

@router.post("/{id}/health")
async def check_server_health(
    id: str,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db)
):
    return await server_service.health_check(db, id, current_user["id"])
