import datetime
import uuid
from sqlalchemy import Column, String, ForeignKey, Integer, DateTime
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from .database import Base

def generate_uuid():
    return uuid.uuid4().hex

class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=generate_uuid)
    chat_id = Column(String, ForeignKey("chats.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    chat = relationship("Chat", backref="documents")
    chunks = relationship("DocumentChunk", backref="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(String, primary_key=True, default=generate_uuid)
    document_id = Column(String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(String, nullable=False)
    # Using 768 dimensions for nomic-embed-text
    embedding = Column(Vector(768))
