import uuid
import datetime
import enum
from sqlalchemy import (
    Column,
    String,
    Integer,
    BigInteger,
    Boolean,
    Float,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    JSON,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from .database import Base

def generate_cuid():
    return "c" + uuid.uuid4().hex[:24]

class Role(str, enum.Enum):
    USER = "USER"
    ADMIN = "ADMIN"

class Provider(str, enum.Enum):
    OLLAMA = "OLLAMA"
    LM_STUDIO = "LM_STUDIO"
    VLLM = "VLLM"
    OPENAI_COMPAT = "OPENAI_COMPAT"
    LOCALAI = "LOCALAI"

class ServerStatus(str, enum.Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    UNKNOWN = "UNKNOWN"
    ERROR = "ERROR"

class InstallStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    PULLING = "PULLING"
    VERIFYING = "VERIFYING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"

class MessageRole(str, enum.Enum):
    USER = "USER"
    ASSISTANT = "ASSISTANT"
    SYSTEM = "SYSTEM"

class WorkspaceRole(str, enum.Enum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    MEMBER = "MEMBER"


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_cuid)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(SQLEnum(Role), default=Role.USER, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    servers = relationship("Server", back_populates="user", cascade="all, delete-orphan")
    chats = relationship("Chat", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="user")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    workspaces = relationship("WorkspaceMember", back_populates="user", cascade="all, delete-orphan")
    settings = relationship("UserSettings", uselist=False, back_populates="user", cascade="all, delete-orphan")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(String, primary_key=True, default=generate_cuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String, unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="refresh_tokens")


class Server(Base):
    __tablename__ = "servers"

    id = Column(String, primary_key=True, default=generate_cuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    host = Column(String, nullable=False)
    port = Column(Integer, nullable=False)
    provider = Column(SQLEnum(Provider), nullable=False)
    api_key_cipher = Column(String, nullable=True)
    api_key_iv = Column(String, nullable=True)
    api_key_tag = Column(String, nullable=True)
    status = Column(SQLEnum(ServerStatus), default=ServerStatus.UNKNOWN, nullable=False)
    version = Column(String, nullable=True)
    last_seen_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="servers")
    models = relationship("Model", back_populates="server", cascade="all, delete-orphan")
    installations = relationship("Installation", back_populates="server", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="servers_user_id_name_key"),
        Index("servers_user_id_status_idx", "user_id", "status"),
    )


class Model(Base):
    __tablename__ = "models"

    id = Column(String, primary_key=True, default=generate_cuid)
    server_id = Column(String, ForeignKey("servers.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    family = Column(String, nullable=True)
    size_bytes = Column(BigInteger, nullable=False)
    digest = Column(String, nullable=False)
    parameters = Column(JSON, nullable=True)
    installed_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    last_used_at = Column(DateTime, nullable=True)

    server = relationship("Server", back_populates="models")
    chats = relationship("Chat", back_populates="model")

    __table_args__ = (
        UniqueConstraint("server_id", "name", name="models_server_id_name_key"),
    )


class Installation(Base):
    __tablename__ = "installations"

    id = Column(String, primary_key=True, default=generate_cuid)
    server_id = Column(String, ForeignKey("servers.id", ondelete="CASCADE"), nullable=False)
    model_name = Column(String, nullable=False)
    status = Column(SQLEnum(InstallStatus), nullable=False)
    progress = Column(Float, default=0.0, nullable=False)
    total_bytes = Column(BigInteger, nullable=True)
    pulled_bytes = Column(BigInteger, nullable=True)
    error = Column(String, nullable=True)
    started_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    server = relationship("Server", back_populates="installations")

    __table_args__ = (
        Index("installations_server_id_status_idx", "server_id", "status"),
    )


class Chat(Base):
    __tablename__ = "chats"

    id = Column(String, primary_key=True, default=generate_cuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    model_id = Column(String, ForeignKey("models.id", ondelete="SET NULL"), nullable=True)
    title = Column(String, default="New chat", nullable=False)
    pinned = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="chats")
    model = relationship("Model", back_populates="chats")
    messages = relationship("Message", back_populates="chat", cascade="all, delete-orphan")

    __table_args__ = (
        Index("chats_user_id_updated_at_idx", "user_id", "updated_at"),
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=generate_cuid)
    chat_id = Column(String, ForeignKey("chats.id", ondelete="CASCADE"), nullable=False)
    role = Column(SQLEnum(MessageRole), nullable=False)
    content = Column(String, nullable=False)
    model_name = Column(String, nullable=True)
    tokens_in = Column(Integer, nullable=True)
    tokens_out = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    chat = relationship("Chat", back_populates="messages")

    __table_args__ = (
        Index("messages_chat_id_created_at_idx", "chat_id", "created_at"),
    )


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(String, primary_key=True, default=generate_cuid)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    members = relationship("WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan")


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"

    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role = Column(SQLEnum(WorkspaceRole), default=WorkspaceRole.MEMBER, nullable=False)
    joined_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    workspace = relationship("Workspace", back_populates="members")
    user = relationship("User", back_populates="workspaces")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=generate_cuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    body = Column(String, nullable=True)
    meta_data = Column("metadata", JSON, nullable=True)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="notifications")

    __table_args__ = (
        Index("notifications_user_id_read_at_created_at_idx", "user_id", "read_at", "created_at"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=generate_cuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String, nullable=False)
    entity = Column(String, nullable=False)
    entity_id = Column(String, nullable=True)
    meta_data = Column("metadata", JSON, nullable=True)
    ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="audit_logs")

    __table_args__ = (
        Index("audit_logs_user_id_created_at_idx", "user_id", "created_at"),
        Index("audit_logs_entity_entity_id_idx", "entity", "entity_id"),
    )


class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    theme = Column(String, default="system", nullable=False)
    default_model = Column(String, nullable=True)
    locale = Column(String, default="en", nullable=False)
    preferences = Column(JSON, nullable=True)

    user = relationship("User", back_populates="settings")

# Expose database and schemas inside models folder package
from . import database
from . import schemas
