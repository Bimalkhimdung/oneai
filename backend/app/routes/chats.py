from fastapi import APIRouter, Depends, status, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import schemas, database
from app import dependencies
from app.services import chat as chat_service
from app.services import chat_agent as chat_agent_service

router = APIRouter(prefix="/chats")

@router.post("/", response_model=schemas.ChatDto, status_code=status.HTTP_201_CREATED)
async def create_chat(
    input_data: schemas.CreateChatInput,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db)
):
    return await chat_service.create(db, current_user["id"], input_data)

@router.get("/", response_model=list[schemas.ChatDto])
async def list_chats(
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db)
):
    return await chat_service.list_chats(db, current_user["id"])

@router.get("/{id}", response_model=schemas.ChatDetailDto)
async def get_chat_detail(
    id: str,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db)
):
    return await chat_service.detail(db, id, current_user["id"])

@router.patch("/{id}", response_model=schemas.ChatDto)
async def update_chat(
    id: str,
    input_data: schemas.UpdateChatInput,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db)
):
    return await chat_service.update(db, id, current_user["id"], input_data)

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat(
    id: str,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db)
):
    await chat_service.remove(db, id, current_user["id"])

@router.post("/{id}/messages", status_code=status.HTTP_202_ACCEPTED)
async def send_message(
    id: str,
    input_data: schemas.SendMessageInput,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db)
):
    return await chat_service.send_message(db, id, current_user["id"], input_data)

@router.post("/{id}/agent")
async def run_chat_agent(
    id: str,
    input_data: schemas.ChatAgentRunRequest,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db),
):
    async def event_stream():
        async for chunk in chat_agent_service.run_chat_agent(
            db, id, current_user["id"], input_data
        ):
            yield chunk

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@router.post("/{id}/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(
    id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db)
):
    from app.services.rag import check_embedding_model_installed, process_and_store_document
    
    # 1. Check if model exists
    is_installed = await check_embedding_model_installed(db, id, current_user["id"])
    if not is_installed:
        raise HTTPException(
            status_code=422,
            detail="Embedding model 'nomic-embed-text' not installed."
        )
    
    # 2. Process, chunk, embed, and store
    await process_and_store_document(db, id, file)
    return {"message": "Document processed and stored successfully."}
