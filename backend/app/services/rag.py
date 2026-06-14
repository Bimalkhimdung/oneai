import io
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
import fitz  # PyMuPDF
from langchain_text_splitters import RecursiveCharacterTextSplitter
from fastapi import UploadFile

from app.models import Document, DocumentChunk, Chat, Server
from app.providers.registry import get_adapter
from app.providers.base import ProviderConnectInfo
from app.services.server import decrypt_api_key

EMBEDDING_MODEL = "nomic-embed-text"

async def extract_text_from_upload(upload: UploadFile) -> str:
    content = await upload.read()
    filename = upload.filename.lower() if upload.filename else ""
    
    if filename.endswith(".pdf"):
        # Use PyMuPDF to extract text from PDF bytes
        doc = fitz.open(stream=content, filetype="pdf")
        full_text = ""
        for page in doc:
            full_text += page.get_text() + "\n\n"
        return full_text
    else:
        # Assume utf-8 text file for now (txt, md, csv, py, etc.)
        return content.decode("utf-8", errors="replace")

def chunk_text(text: str) -> List[str]:
    # Using LangChain's RecursiveCharacterTextSplitter for optimal NLP chunking
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n\n", "\n", " ", ""]
    )
    return splitter.split_text(text)

async def check_embedding_model_installed(db: AsyncSession, chat_id: str, user_id: str) -> bool:
    """Verifies that the default embedding model is installed on the chat's server."""
    from app.models import Chat, Model, Server
    stmt = select(Chat).where(Chat.id == chat_id)
    chat = (await db.execute(stmt)).scalar_one_or_none()
    if not chat or not chat.model_id:
        return False
        
    stmt = select(Model).where(Model.id == chat.model_id)
    model = (await db.execute(stmt)).scalar_one_or_none()
    if not model:
        return False

    stmt = select(Server).where(Server.id == model.server_id)
    server = (await db.execute(stmt)).scalar_one_or_none()
    if not server:
        return False

    adapter = get_adapter(server.provider.value)
    conn_info = ProviderConnectInfo(
        host=server.host,
        port=server.port,
        apiKey=decrypt_api_key(server)
    )
    
    try:
        models = await adapter.list_models(conn_info)
        return any(m.name == EMBEDDING_MODEL or m.name.startswith(EMBEDDING_MODEL + ":") for m in models)
    except Exception:
        return False

async def generate_embedding(db: AsyncSession, chat_id: str, text_content: str) -> List[float]:
    """Generates an embedding vector using the chat's selected server."""
    from app.models import Chat, Model, Server
    stmt = select(Chat).where(Chat.id == chat_id)
    chat = (await db.execute(stmt)).scalar_one_or_none()
    if not chat or not chat.model_id:
        raise Exception("Chat has no model selected")
        
    stmt = select(Model).where(Model.id == chat.model_id)
    model = (await db.execute(stmt)).scalar_one_or_none()
    if not model:
        raise Exception("Model not found")

    stmt = select(Server).where(Server.id == model.server_id)
    server = (await db.execute(stmt)).scalar_one_or_none()
    if not server:
        raise Exception("Server not found")

    adapter = get_adapter(server.provider.value)
    conn_info = ProviderConnectInfo(
        host=server.host,
        port=server.port,
        apiKey=decrypt_api_key(server)
    )
    
    return await adapter.embed(conn_info, EMBEDDING_MODEL, text_content)

async def process_and_store_document(db: AsyncSession, chat_id: str, upload: UploadFile) -> Document:
    # Extract text
    raw_text = await extract_text_from_upload(upload)
    
    # Chunk text
    chunks = chunk_text(raw_text)
    
    # Create Document record
    doc = Document(chat_id=chat_id, filename=upload.filename or "unknown")
    db.add(doc)
    await db.flush()
    
    # Generate embeddings and store chunks
    for content in chunks:
        # Ignore empty chunks
        if not content.strip():
            continue
        embedding = await generate_embedding(db, chat_id, content)
        chunk_record = DocumentChunk(
            document_id=doc.id,
            content=content,
            embedding=embedding
        )
        db.add(chunk_record)
        
    await db.commit()
    return doc

async def query_relevant_chunks(db: AsyncSession, chat_id: str, query: str, top_k: int = 4) -> List[str]:
    """Finds the most relevant document chunks for a given query in the chat."""
    # First check if the chat even has documents to avoid unnecessary embedding calls
    from app.models.rag import Document
    doc_count = await db.scalar(select(Document).where(Document.chat_id == chat_id))
    if not doc_count:
        return []

    # Generate embedding for the search query
    query_embedding = await generate_embedding(db, chat_id, query)
    
    # Vector search using pgvector's <=> (cosine distance) operator
    # We use text() to execute the specialized pgvector syntax
    stmt = text("""
        SELECT dc.content
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE d.chat_id = :chat_id
        ORDER BY dc.embedding <=> CAST(:embedding AS vector)
        LIMIT :top_k
    """)
    
    # format embedding as string for postgres
    embedding_str = f"[{','.join(map(str, query_embedding))}]"
    
    result = await db.execute(stmt, {
        "chat_id": chat_id, 
        "embedding": embedding_str,
        "top_k": top_k
    })
    
    return [row[0] for row in result.fetchall()]
