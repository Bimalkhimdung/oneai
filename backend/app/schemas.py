import re
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Any, Dict

# Input Validation Schemas
class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    fullName: str = Field(..., min_length=1, max_length=120)

class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)

class ForgotPasswordInput(BaseModel):
    email: EmailStr

class ResetPasswordInput(BaseModel):
    token: str = Field(..., min_length=10)
    password: str = Field(..., min_length=8, max_length=128)

class CreateServerInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    host: str = Field(..., min_length=1, max_length=253)
    port: int = Field(..., ge=1, le=65535)
    provider: str
    apiKey: Optional[str] = Field(None, min_length=1, max_length=512)

    @field_validator("host")
    @classmethod
    def validate_host(cls, v):
        if not re.match(r"^[a-zA-Z0-9.\-_]+$", v):
            raise ValueError("Host can contain letters, numbers, dot, dash, underscore.")
        return v

class TestServerInput(BaseModel):
    host: str = Field(..., min_length=1, max_length=253)
    port: int = Field(..., ge=1, le=65535)
    provider: str
    apiKey: Optional[str] = Field(None, min_length=1, max_length=512)

    @field_validator("host")
    @classmethod
    def validate_host(cls, v):
        if not re.match(r"^[a-zA-Z0-9.\-_]+$", v):
            raise ValueError("Host can contain letters, numbers, dot, dash, underscore.")
        return v

class CreateChatInput(BaseModel):
    modelId: str = Field(..., min_length=1)
    title: Optional[str] = Field(None, max_length=120)

class SendMessageInput(BaseModel):
    content: str = Field(..., min_length=1, max_length=64000)

class UpdateChatInput(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    pinned: Optional[bool] = None

class CompareInput(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=16000)
    modelIds: List[str] = Field(..., min_length=2, max_length=5)


# Outgoing Response DTO Schemas
class UserDto(BaseModel):
    id: str
    email: str
    fullName: str
    role: str
    createdAt: str

class AuthResultDto(BaseModel):
    user: UserDto
    accessToken: str
    expiresIn: int

class ServerDto(BaseModel):
    id: str
    name: str
    host: str
    port: int
    provider: str
    status: str
    version: Optional[str] = None
    lastSeenAt: Optional[str] = None
    createdAt: str

class ModelDto(BaseModel):
    id: str
    serverId: str
    name: str
    family: Optional[str] = None
    sizeBytes: str
    digest: str
    installedAt: str
    lastUsedAt: Optional[str] = None

class MessageDto(BaseModel):
    id: str
    chatId: str
    role: str
    content: str
    modelName: Optional[str] = None
    tokensIn: Optional[int] = None
    tokensOut: Optional[int] = None
    durationMs: Optional[int] = None
    createdAt: str

class ChatDto(BaseModel):
    id: str
    title: str
    pinned: bool
    modelId: Optional[str] = None
    createdAt: str
    updatedAt: str

class ChatDetailDto(ChatDto):
    messages: List[MessageDto]
