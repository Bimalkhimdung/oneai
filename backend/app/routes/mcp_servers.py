from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import dependencies
from app.models import database, schemas
from app.services import mcp as mcp_service

router = APIRouter(prefix="/mcp-servers")


@router.post("/", response_model=schemas.McpServerDto, status_code=status.HTTP_201_CREATED)
async def create_mcp_server(
    input_data: schemas.CreateMcpServerInput,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db),
):
    try:
        return await mcp_service.create(db, current_user["id"], input_data)
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/", response_model=list[schemas.McpServerDto])
async def list_mcp_servers(
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db),
):
    return await mcp_service.list_servers(db, current_user["id"])


@router.patch("/{id}", response_model=schemas.McpServerDto)
async def update_mcp_server(
    id: str,
    input_data: schemas.UpdateMcpServerInput,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db),
):
    return await mcp_service.update(db, id, current_user["id"], input_data)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mcp_server(
    id: str,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db),
):
    await mcp_service.remove(db, id, current_user["id"])


@router.post("/{id}/test", response_model=schemas.McpTestResultDto)
async def test_mcp_server(
    id: str,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db),
):
    return await mcp_service.test_server(db, id, current_user["id"])
