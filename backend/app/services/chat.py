import asyncio
import datetime
import logging
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from app import crud, models
from app.models import schemas
from app.providers.registry import get_adapter
from app.providers.base import ProviderConnectInfo
from app.services.server import decrypt_api_key

logger = logging.getLogger("app.chat")

def to_message_dto(m: models.Message) -> schemas.MessageDto:
    return schemas.MessageDto(
        id=m.id,
        chatId=m.chat_id,
        role=m.role.value,
        content=m.content,
        modelName=m.model_name,
        tokensIn=m.tokens_in,
        tokensOut=m.tokens_out,
        durationMs=m.duration_ms,
        createdAt=m.created_at.isoformat() + "Z"
    )

def to_document_dto(d: models.Document) -> schemas.DocumentDto:
    return schemas.DocumentDto(
        id=d.id,
        chatId=d.chat_id,
        filename=d.filename,
        createdAt=d.created_at.isoformat() + "Z"
    )

def to_chat_dto(c: models.Chat) -> schemas.ChatDto:
    return schemas.ChatDto(
        id=c.id,
        title=c.title,
        pinned=c.pinned,
        modelId=c.model_id,
        createdAt=c.created_at.isoformat() + "Z",
        updatedAt=c.updated_at.isoformat() + "Z"
    )

async def load_model_and_server(db: AsyncSession, model_id: str, user_id: str) -> models.Model:
    stmt = select(models.Model).where(models.Model.id == model_id).options(joinedload(models.Model.server))
    res = await db.execute(stmt)
    model = res.scalar_one_or_none()
    if not model or model.server.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found."
        )
    return model

async def create(db: AsyncSession, user_id: str, input_data: schemas.CreateChatInput) -> schemas.ChatDto:
    await load_model_and_server(db, input_data.modelId, user_id)
    chat = await crud.create_chat(
        db,
        user_id=user_id,
        model_id=input_data.modelId,
        title=input_data.title or "New chat"
    )
    return to_chat_dto(chat)

async def list_chats(db: AsyncSession, user_id: str) -> list[schemas.ChatDto]:
    chats = await crud.list_chats_for_user(db, user_id)
    return [to_chat_dto(c) for c in chats]

async def detail(db: AsyncSession, chat_id: str, user_id: str) -> schemas.ChatDetailDto:
    chat = await crud.get_chat_by_id_and_user_id(db, chat_id, user_id)
    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found."
        )
    messages = [to_message_dto(m) for m in chat.messages]
    documents = [to_document_dto(d) for d in (chat.documents or [])]
    chat_dto = to_chat_dto(chat)
    return schemas.ChatDetailDto(
        **chat_dto.model_dump(),
        messages=messages,
        documents=documents
    )

async def update(db: AsyncSession, chat_id: str, user_id: str, input_data: schemas.UpdateChatInput) -> schemas.ChatDto:
    chat = await crud.get_chat_by_id_and_user_id(db, chat_id, user_id)
    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found."
        )
    
    update_data = {}
    if input_data.title is not None:
        update_data["title"] = input_data.title
    if input_data.pinned is not None:
        update_data["pinned"] = input_data.pinned
        
    updated = await crud.update_chat(db, chat_id, **update_data)
    return to_chat_dto(updated)

async def remove(db: AsyncSession, chat_id: str, user_id: str):
    await crud.get_chat_by_id_and_user_id(db, chat_id, user_id)
    await crud.delete_chat(db, chat_id)


async def send_message(db: AsyncSession, chat_id: str, user_id: str, input_data: schemas.SendMessageInput) -> dict:
    chat = await crud.get_chat_by_id_and_user_id(db, chat_id, user_id)
    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found."
        )
    if not chat.model_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chat has no model attached."
        )
        
    model = await load_model_and_server(db, chat.model_id, user_id)
    
    logger.info(f"Received query for chat {chat.id}: {input_data.content}")
    
    user_message = await crud.create_message(
        db,
        chat_id=chat.id,
        role=models.MessageRole.USER,
        content=input_data.content
    )
    
    assistant_message = await crud.create_message(
        db,
        chat_id=chat.id,
        role=models.MessageRole.ASSISTANT,
        content="",
        model_name=model.name
    )
    
    # Auto-title on the first message
    if chat.title == "New chat":
        new_title = input_data.content[:60]
        await crud.update_chat(db, chat.id, title=new_title)
        
    # Build history
    history = await crud.get_messages_for_chat(db, chat.id)
    # Filter out the empty assistant message we just created
    messages_payload = []
    for m in history:
        if m.id == assistant_message.id:
            continue
        messages_payload.append({
            "role": m.role.value.lower(),
            "content": m.content
        })
        
    # Check for Web Search
    web_context = ""
    if input_data.web_search:
        from app.services.search import search_web
        try:
            web_context = await search_web(input_data.content)
        except Exception as e:
            logger.warning(f"Failed to perform web search: {e}")

    # Check for relevant document chunks (RAG)
    from app.services.rag import query_relevant_chunks
    relevant_chunks = []
    try:
        relevant_chunks = await query_relevant_chunks(db, chat.id, input_data.content)
    except Exception as e:
        logger.warning(f"Failed to query RAG chunks: {e}")

    # Build prompt context
    if web_context or relevant_chunks:
        context_parts = []
        if relevant_chunks:
            context_parts.append("--- DOCUMENT CONTEXT ---\n" + "\n\n".join(relevant_chunks))
        if web_context:
            context_parts.append(f"--- WEB SEARCH RESULTS ---\n{web_context}")
            
        context_text = "\n\n".join(context_parts)
        today = datetime.date.today().isoformat()
        rag_prompt = (
            f"Use the following context (documents/web search results) to answer the user's query.\n"
            f"The current date is {today}. For questions about current office holders, status, prices, news, "
            f"or other time-sensitive facts, prioritize the most recent reliable sources and ignore older "
            f"sources when they conflict.\n"
            f"Provide a detailed response based on the context. Cite the source URL if using web results.\n\n"
            f"<context>\n{context_text}\n</context>\n\n"
            f"Query: {input_data.content}"
        )
        # Overwrite the last user's message in the payload
        if messages_payload and messages_payload[-1]["role"] == "user":
            messages_payload[-1]["content"] = rag_prompt
        
    # Start the stream in the background
    asyncio.create_task(run_stream(
        user_id=user_id,
        chat_id=chat.id,
        message_id=assistant_message.id,
        server=model.server,
        model_name=model.name,
        messages=messages_payload
    ))
    
    return {
        "userMessage": to_message_dto(user_message),
        "assistantMessage": to_message_dto(assistant_message)
    }

async def run_stream(
    user_id: str,
    chat_id: str,
    message_id: str,
    server: models.Server,
    model_name: str,
    messages: list[dict]
):
    # import sio and session maker locally to avoid circular dependency
    from app.realtime import sio
    from app.models.database import AsyncSessionLocal
    
    room = f"user:{user_id}"
    adapter = get_adapter(server.provider.value)
    api_key = decrypt_api_key(server)
    conn_info = ProviderConnectInfo(
        host=server.host,
        port=server.port,
        apiKey=api_key
    )
    
    assembled = ""
    totals = {}
    
    try:
        async for chunk in adapter.chat_stream(conn_info, model=model_name, messages=messages):
            if chunk.delta:
                assembled += chunk.delta
                # Emit delta to the socket room
                await sio.emit("chat.stream.delta", {
                    "chatId": chat_id,
                    "messageId": message_id,
                    "delta": chunk.delta,
                    "done": False
                }, room=room)
                # Small sleep to yield to event loop
                await asyncio.sleep(0.005)
            if chunk.done:
                totals = {
                    "tokensIn": chunk.tokensIn,
                    "tokensOut": chunk.tokensOut,
                    "durationMs": chunk.durationMs
                }
                
        # Emit final done event
        await sio.emit("chat.stream.delta", {
            "chatId": chat_id,
            "messageId": message_id,
            "delta": "",
            "done": True,
            **totals
        }, room=room)
        
        # Save to database
        async with AsyncSessionLocal() as db:
            await crud.update_message(
                db,
                message_id=message_id,
                content=assembled,
                tokens_in=totals.get("tokensIn"),
                tokens_out=totals.get("tokensOut"),
                duration_ms=totals.get("durationMs")
            )
            await crud.update_chat(db, chat_id, updated_at=datetime.datetime.utcnow())
            
            logger.info(f"Completed response for chat {chat_id}: {assembled}")
            
    except Exception as e:
        logger.error(f"Chat stream failed: {e}", exc_info=True)
        # Emit done signal anyway so client knows it finished/failed
        await sio.emit("chat.stream.delta", {
            "chatId": chat_id,
            "messageId": message_id,
            "delta": "",
            "done": True
        }, room=room)
        
        async with AsyncSessionLocal() as db:
            # fetch current content to see if we had anything
            stmt = select(models.Message).where(models.Message.id == message_id)
            res = await db.execute(stmt)
            curr = res.scalar_one_or_none()
            content = curr.content if (curr and curr.content) else "[Streaming failed]"
            await crud.update_message(db, message_id=message_id, content=content)
